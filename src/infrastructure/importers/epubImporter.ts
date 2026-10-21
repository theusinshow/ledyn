import ePub from 'epubjs';
import type { ContentBlock, ImportIssue } from '@/domain/contracts';
import {
  generateTitleFromText,
  MAX_NORMALIZED_UTF16_LENGTH,
  NORMALIZATION_VERSION,
  normalizeText,
} from '@/domain/documents/normalizer';
import {
  extractSanitizedChapterParagraphs,
  unpackEpubZipSafely,
} from '@/infrastructure/importers/epubSpike';
import {
  MAX_EPUB_ENTRIES,
  MAX_EPUB_UNCOMPRESSED_BYTES,
  MAX_IMPORT_FILE_BYTES,
  type ImporterLimitsConfig,
  type ImportProgressUpdate,
  type PreviewSection,
  type RawExtractionOutput,
} from '@/infrastructure/importers/types';
import { AppError } from '@/shared/errors';

function stripEpubExtension(fileName: string): string {
  return fileName.replace(/\.epub$/i, '').replace(/\s+/g, ' ').trim();
}

function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function isUnsafeInternalPath(entryPath: string): boolean {
  if (!entryPath || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    return true;
  }
  if (entryPath.includes('\\') || entryPath.includes('\0')) {
    return true;
  }
  const segments = entryPath.split('/');
  return segments.some((seg) => seg === '..' || seg === '.');
}

function resolveSpineHrefLocally(baseOpfPath: string, rawHref: string): string {
  const cleanHref = (rawHref.split('#')[0] ?? '').split('?')[0] ?? '';
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleanHref) ||
    cleanHref.startsWith('//') ||
    cleanHref.startsWith('/')
  ) {
    throw new AppError(
      'EXTERNAL_RESOURCE_BLOCKED',
      `Referência externa ou absoluta bloqueada no EPUB: ${rawHref}`,
    );
  }
  const baseSegments = baseOpfPath.split('/').slice(0, -1);
  for (const part of cleanHref.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (baseSegments.length === 0) {
        throw new AppError(
          'CORRUPT_FILE',
          'Caminho relativo inválido fora da raiz do EPUB.',
        );
      }
      baseSegments.pop();
    } else {
      baseSegments.push(part);
    }
  }
  return baseSegments.join('/');
}

/**
 * Importador seguro de EPUB reflowable sem DRM:
 * - Pré-valida estrutura ZIP e limites reais de descompressão com `fflate`.
 * - Rejeita DRM, layout fixo, path traversal e referências externas.
 * - Processa spine na ordem declarada em `DOMParser` inerte sem ativar `allowScriptedContent`
 *   e sem inserir HTML no DOM vivo.
 */
export function extractEpubFile(
  fileBytes: Uint8Array,
  fileName: string,
  options?: {
    explicitTitle?: string;
    signal?: AbortSignal;
    limits?: ImporterLimitsConfig;
    onProgress?: (update: ImportProgressUpdate) => void;
  },
): RawExtractionOutput {
  if (options?.signal?.aborted) {
    throw new AppError('IMPORT_CANCELLED');
  }

  const maxBytes = options?.limits?.maxFileBytes ?? MAX_IMPORT_FILE_BYTES;
  const maxEntries = options?.limits?.maxEpubEntries ?? MAX_EPUB_ENTRIES;
  const maxUncompressed =
    options?.limits?.maxEpubUncompressedBytes ?? MAX_EPUB_UNCOMPRESSED_BYTES;
  const maxUtf16 =
    options?.limits?.maxUtf16Length ?? MAX_NORMALIZED_UTF16_LENGTH;

  if (fileBytes.byteLength > maxBytes) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${(maxBytes / (1024 * 1024)).toFixed(0)} MiB desta versão. Reduza o arquivo ou cole um trecho menor.`,
    );
  }

  if (!isZipSignature(fileBytes)) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  options?.onProgress?.({
    stage: 'extracting',
    message: 'Verificando pacote EPUB...',
  });

  // Inicializa epub.js em modo inerte (sem allowScriptedContent e sem abrir URL externa)
  const book = ePub();
  book.destroy();

  const files = unpackEpubZipSafely(fileBytes, {
    maxEntries,
    maxUncompressedBytes: maxUncompressed,
  });

  if (options?.signal?.aborted) {
    throw new AppError('IMPORT_CANCELLED');
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });

  // 1. Verificar DRM em META-INF/encryption.xml ou META-INF/rights.xml
  const encryptionBytes = files.get('META-INF/encryption.xml');
  const rightsBytes = files.get('META-INF/rights.xml');
  if (encryptionBytes) {
    const encXml = decoder.decode(encryptionBytes);
    if (
      encXml.includes('EncryptedData') ||
      encXml.includes('enc:EncryptedData')
    ) {
      throw new AppError(
        'DRM_UNSUPPORTED',
        'Este EPUB tem proteção não suportada. O aplicativo não remove DRM.',
      );
    }
  }
  if (rightsBytes) {
    throw new AppError(
      'DRM_UNSUPPORTED',
      'Este EPUB tem proteção não suportada. O aplicativo não remove DRM.',
    );
  }

  // 2. Localizar OPF via META-INF/container.xml
  const containerBytes = files.get('META-INF/container.xml');
  if (!containerBytes) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  const containerXml = decoder.decode(containerBytes);
  // Bloquear DOCTYPE com entidades externas (XXE)
  if (/<!ENTITY/i.test(containerXml)) {
    throw new AppError('EXTERNAL_RESOURCE_BLOCKED');
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'text/xml');
  const rootfileEl = containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfileEl?.getAttribute('full-path')?.trim() ?? '';

  if (!opfPath || isUnsafeInternalPath(opfPath)) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  const opfBytes = files.get(opfPath);
  if (!opfBytes) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  const opfXml = decoder.decode(opfBytes);
  if (/<!ENTITY/i.test(opfXml)) {
    throw new AppError('EXTERNAL_RESOURCE_BLOCKED');
  }

  const opfDoc = parser.parseFromString(opfXml, 'text/xml');

  // 3. Rejeitar layout fixo (rendition:layout = pre-paginated)
  const metaEls = Array.from(opfDoc.getElementsByTagName('meta'));
  for (const meta of metaEls) {
    const prop = (
      meta.getAttribute('property') ??
      meta.getAttribute('name') ??
      ''
    ).toLowerCase();
    const content = (
      meta.textContent ||
      meta.getAttribute('content') ||
      ''
    )
      .trim()
      .toLowerCase();
    if (
      (prop === 'rendition:layout' || prop === 'fixed-layout') &&
      (content === 'pre-paginated' || content === 'true')
    ) {
      throw new AppError(
        'FIXED_LAYOUT_UNSUPPORTED',
        'Esta versão aceita EPUB de texto refluível. O layout fixo não é suportado.',
      );
    }
  }

  const dcTitleEl =
    opfDoc.getElementsByTagName('dc:title')[0] ??
    opfDoc.getElementsByTagName('title')[0];
  const metadataTitle = dcTitleEl?.textContent?.trim() ?? '';

  // 4. Mapear manifest e spine
  const manifestMap = new Map<string, string>();
  for (const item of Array.from(opfDoc.getElementsByTagName('item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifestMap.set(id, href);
    }
  }

  const spineItemrefs = Array.from(opfDoc.getElementsByTagName('itemref'));
  if (spineItemrefs.length === 0) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  const contentBlocks: ContentBlock[] = [];
  const normalizedParagraphs: string[] = [];
  const previewSections: PreviewSection[] = [];
  const warnings: ImportIssue[] = [];
  let totalBlockedThreats = 0;
  let currentNormalizedOffset = 0;

  for (let spineIdx = 0; spineIdx < spineItemrefs.length; spineIdx++) {
    if (options?.signal?.aborted) {
      throw new AppError('IMPORT_CANCELLED');
    }

    options?.onProgress?.({
      stage: 'extracting',
      message: `Preparando capítulo ${spineIdx + 1} de ${spineItemrefs.length}`,
      currentStep: spineIdx + 1,
      totalSteps: spineItemrefs.length,
    });

    const itemref = spineItemrefs[spineIdx]!;
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const rawHref = manifestMap.get(idref);
    if (!rawHref) continue;

    const resolvedPath = resolveSpineHrefLocally(opfPath, rawHref);
    const chapterBytes = files.get(resolvedPath);
    if (!chapterBytes) {
      throw new AppError(
        'CORRUPT_FILE',
        'Não foi possível ler a estrutura deste arquivo.',
      );
    }

    const xhtml = decoder.decode(chapterBytes);
    if (/<!ENTITY/i.test(xhtml)) {
      throw new AppError('EXTERNAL_RESOURCE_BLOCKED');
    }

    const { paragraphs: rawParagraphs, blockedThreats } =
      extractSanitizedChapterParagraphs(xhtml);
    totalBlockedThreats += blockedThreats.length;

    const chapterNormalizedParagraphs: string[] = [];

    for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
      const rawP = rawParagraphs[pIdx]!;
      const normBlock = normalizeText(rawP, { maxUtf16Length: maxUtf16 });

      for (const sub of normBlock.blocks) {
        const paragraphText = normBlock.normalizedText.slice(
          sub.startOffset,
          sub.endOffset,
        );
        if (paragraphText.length === 0) continue;

        const separatorLen = normalizedParagraphs.length > 0 ? 2 : 0;
        const nextTotalUtf16 =
          currentNormalizedOffset + separatorLen + paragraphText.length;

        if (nextTotalUtf16 > maxUtf16) {
          throw new AppError(
            'LIMIT_EXCEEDED',
            'O texto excede o limite desta versão. Importe um trecho menor.',
          );
        }

        const startOffset = currentNormalizedOffset + separatorLen;
        const endOffset = startOffset + paragraphText.length;
        const blockIndex = contentBlocks.length;

        contentBlocks.push({
          id: `block-${blockIndex}`,
          index: blockIndex,
          startOffset,
          endOffset,
          anchor: {
            kind: 'epub',
            spineIndex: spineIdx,
            href: resolvedPath,
            blockPath: `p[${pIdx}]`,
          },
        });

        normalizedParagraphs.push(paragraphText);
        chapterNormalizedParagraphs.push(paragraphText);
        currentNormalizedOffset = endOffset;
      }
    }

    if (chapterNormalizedParagraphs.length > 0) {
      const firstLine = chapterNormalizedParagraphs[0]!;
      const shortHeading =
        firstLine.length <= 40 ? ` — ${firstLine}` : '';
      previewSections.push({
        id: `epub-ch-${spineIdx + 1}`,
        label: `Capítulo ${previewSections.length + 1}${shortHeading}`,
        paragraphs: chapterNormalizedParagraphs,
        hasText: true,
      });
    }
  }

  if (contentBlocks.length === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'O arquivo EPUB não contém capítulos com texto legível.',
    );
  }

  if (totalBlockedThreats > 0) {
    warnings.push({
      code: 'EPUB_SANITIZED_ELEMENTS',
      severity: 'warning',
      message:
        'Elementos ativos, estilos ou referências externas do EPUB foram removidos por segurança, mantendo apenas o texto.',
    });
  }

  const normalizedText = normalizedParagraphs.join('\n\n');
  const fallbackTitle = metadataTitle || stripEpubExtension(fileName);
  const suggestedTitle = generateTitleFromText(
    normalizedText,
    options?.explicitTitle?.trim() ? options.explicitTitle : fallbackTitle,
  );

  return {
    format: 'epub',
    suggestedTitle,
    normalizedText,
    normalizationVersion: NORMALIZATION_VERSION,
    blocks: contentBlocks,
    previewSections,
    warnings,
  };
}
