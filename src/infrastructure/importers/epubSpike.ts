import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import ePub from 'epubjs';
import { AppError } from '@/shared/errors';

export const DEFAULT_MAX_EPUB_ENTRIES = 2_000;
export const DEFAULT_MAX_EPUB_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MiB

export interface EpubSpikeOptions {
  maxEntries?: number;
  maxUncompressedBytes?: number;
}

export interface EpubSpikeChapter {
  id: string;
  href: string;
  paragraphs: string[];
}

export interface EpubSpikeResult {
  title: string;
  chapters: EpubSpikeChapter[];
  blockedThreats: string[];
  epubJsVersionVerified: boolean;
}

function isUnsafeZipPath(entryPath: string): boolean {
  if (!entryPath || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    return true;
  }
  if (entryPath.includes('\\') || entryPath.includes('\0')) {
    return true;
  }
  const segments = entryPath.split('/');
  return segments.some((seg) => seg === '..' || seg === '.');
}

function resolveRelativePosixPath(baseFilePath: string, relativeHref: string): string {
  const cleanHref = (relativeHref.split('#')[0] ?? '').split('?')[0] ?? '';
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleanHref) ||
    cleanHref.startsWith('//') ||
    cleanHref.startsWith('/')
  ) {
    throw new AppError(
      'EXTERNAL_RESOURCE_BLOCKED',
      `Referência externa ou absoluta bloqueada no EPUB: ${relativeHref}`,
    );
  }
  const baseSegments = baseFilePath.split('/').slice(0, -1);
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
 * Descompacta o arquivo EPUB incrementalmente com `fflate`, aplicando limites reais
 * sobre o número de entradas e o total de bytes efetivamente descomprimidos (não confiando no cabeçalho ZIP).
 */
export function unpackEpubZipSafely(
  zipBytes: Uint8Array,
  options?: EpubSpikeOptions,
): Map<string, Uint8Array> {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_EPUB_ENTRIES;
  const maxUncompressedBytes =
    options?.maxUncompressedBytes ?? DEFAULT_MAX_EPUB_UNCOMPRESSED_BYTES;

  const files = new Map<string, Uint8Array>();
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  let capturedAppError: AppError | null = null;

  const unzipper = new Unzip((file) => {
    entryCount++;
    if (entryCount > maxEntries) {
      capturedAppError = new AppError(
        'LIMIT_EXCEEDED',
        `O arquivo EPUB excede o limite de ${maxEntries} entradas internas.`,
      );
      throw capturedAppError;
    }

    if (isUnsafeZipPath(file.name)) {
      capturedAppError = new AppError(
        'CORRUPT_FILE',
        `Caminho interno inválido ou perigoso detectado no EPUB: ${file.name}`,
      );
      throw capturedAppError;
    }

    if (files.has(file.name)) {
      capturedAppError = new AppError(
        'CORRUPT_FILE',
        `Entrada duplicada conflitante detectada no EPUB: ${file.name}`,
      );
      throw capturedAppError;
    }

    const chunks: Uint8Array[] = [];
    let fileSize = 0;

    file.ondata = (err, data, final) => {
      if (err) {
        if (capturedAppError) {
          throw capturedAppError;
        }
        capturedAppError = new AppError('CORRUPT_FILE', 'Falha na descompressão do EPUB.', {
          cause: err,
        });
        throw capturedAppError;
      }
      if (data && data.byteLength > 0) {
        totalUncompressedBytes += data.byteLength;
        fileSize += data.byteLength;
        if (totalUncompressedBytes > maxUncompressedBytes) {
          capturedAppError = new AppError(
            'LIMIT_EXCEEDED',
            `O conteúdo descompactado do EPUB excede o limite de ${maxUncompressedBytes} bytes.`,
          );
          throw capturedAppError;
        }
        chunks.push(data);
      }
      if (final) {
        const merged = new Uint8Array(fileSize);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        files.set(file.name, merged);
      }
    };

    file.start();
  });

  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);

  try {
    unzipper.push(zipBytes, true);
  } catch (error) {
    if (capturedAppError) {
      throw capturedAppError;
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('CORRUPT_FILE', 'Não foi possível ler a estrutura ZIP do EPUB.', {
      cause: error,
    });
  }

  if (capturedAppError) {
    throw capturedAppError;
  }

  if (files.size === 0) {
    throw new AppError('CORRUPT_FILE', 'Arquivo EPUB vazio ou inválido.');
  }

  return files;
}

/**
 * Sanitiza XHTML de um capítulo em um documento DOMParser inerte (fora do DOM vivo),
 * removendo scripts, handlers, iframes, objetos e referências externas antes de extrair apenas texto.
 */
export function extractSanitizedChapterParagraphs(xhtml: string): {
  paragraphs: string[];
  blockedThreats: string[];
} {
  const blockedThreats: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xhtml, 'text/html');

  const forbiddenTags = [
    'script',
    'style',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'applet',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'button',
    'svg',
    'math',
  ];

  for (const tag of forbiddenTags) {
    const elements = Array.from(doc.querySelectorAll(tag));
    for (const el of elements) {
      blockedThreats.push(`tag:${tag}`);
      el.remove();
    }
  }

  const allElements = Array.from(doc.querySelectorAll('*'));
  for (const el of allElements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim();
      if (name.startsWith('on')) {
        blockedThreats.push(`attr:${name}`);
        el.removeAttribute(attr.name);
      } else if (
        name === 'src' ||
        name === 'href' ||
        name === 'xlink:href' ||
        name === 'action' ||
        name === 'srcset'
      ) {
        if (
          /^javascript:/i.test(val) ||
          /^data:text\/html/i.test(val) ||
          /^https?:/i.test(val) ||
          val.startsWith('//')
        ) {
          blockedThreats.push(`external_or_script_uri:${name}=${val}`);
        }
        el.removeAttribute(attr.name);
      }
    }
  }

  const blockNodes = Array.from(
    doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote'),
  );

  const paragraphs: string[] = [];
  if (blockNodes.length > 0) {
    for (const node of blockNodes) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    }
  } else {
    const fallbackText = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (fallbackText.length > 0) {
      paragraphs.push(fallbackText);
    }
  }

  return { paragraphs, blockedThreats };
}

/**
 * Spike F0 para epub.js + pré-validação ZIP local:
 * Verifica limites de descompressão, ausência de DRM/layout fixo, ordem do spine
 * e contenção total contra scripts, handlers e recursos externos.
 */
export function extractEpubSpike(
  epubBytes: Uint8Array,
  options?: EpubSpikeOptions,
): EpubSpikeResult {
  const epubInstance = ePub();
  const epubJsVersionVerified = typeof epubInstance.destroy === 'function';
  epubInstance.destroy();

  const files = unpackEpubZipSafely(epubBytes, options);
  const decoder = new TextDecoder('utf-8', { fatal: false });

  // 1. Verificar DRM em META-INF/encryption.xml
  const encryptionBytes = files.get('META-INF/encryption.xml');
  if (encryptionBytes) {
    const encryptionXml = decoder.decode(encryptionBytes);
    if (
      encryptionXml.includes('EncryptedData') ||
      encryptionXml.includes('enc:EncryptedData')
    ) {
      throw new AppError('DRM_UNSUPPORTED');
    }
  }

  // 2. Localizar OPF via META-INF/container.xml
  const containerBytes = files.get('META-INF/container.xml');
  if (!containerBytes) {
    throw new AppError(
      'CORRUPT_FILE',
      'Arquivo META-INF/container.xml ausente no EPUB.',
    );
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(
    decoder.decode(containerBytes),
    'text/xml',
  );
  const rootfileEl = containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfileEl?.getAttribute('full-path')?.trim() ?? '';
  if (!opfPath || isUnsafeZipPath(opfPath)) {
    throw new AppError('CORRUPT_FILE', 'Caminho do pacote OPF inválido no EPUB.');
  }

  const opfBytes = files.get(opfPath);
  if (!opfBytes) {
    throw new AppError('CORRUPT_FILE', 'Arquivo OPF não encontrado no EPUB.');
  }

  const opfXml = decoder.decode(opfBytes);
  const opfDoc = parser.parseFromString(opfXml, 'text/xml');

  // 3. Detectar fixed-layout
  const metaEls = Array.from(opfDoc.getElementsByTagName('meta'));
  for (const meta of metaEls) {
    const prop = (meta.getAttribute('property') ?? meta.getAttribute('name') ?? '').toLowerCase();
    const content = (meta.textContent || meta.getAttribute('content') || '').trim().toLowerCase();
    if (
      (prop === 'rendition:layout' || prop === 'fixed-layout') &&
      (content === 'pre-paginated' || content === 'true')
    ) {
      throw new AppError('FIXED_LAYOUT_UNSUPPORTED');
    }
  }

  const dcTitleEl =
    opfDoc.getElementsByTagName('dc:title')[0] ??
    opfDoc.getElementsByTagName('title')[0];
  const title = dcTitleEl?.textContent?.trim() || 'EPUB sem título';

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
    throw new AppError('CORRUPT_FILE', 'Spine vazio no arquivo EPUB.');
  }

  const chapters: EpubSpikeChapter[] = [];
  const allBlockedThreats: string[] = [];

  for (const itemref of spineItemrefs) {
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const rawHref = manifestMap.get(idref);
    if (!rawHref) continue;

    const resolvedPath = resolveRelativePosixPath(opfPath, rawHref);
    const chapterBytes = files.get(resolvedPath);
    if (!chapterBytes) {
      throw new AppError(
        'CORRUPT_FILE',
        `Capítulo referenciado no spine não encontrado no arquivo local: ${resolvedPath}`,
      );
    }

    const xhtml = decoder.decode(chapterBytes);
    const { paragraphs, blockedThreats } = extractSanitizedChapterParagraphs(xhtml);
    allBlockedThreats.push(...blockedThreats);

    if (paragraphs.length > 0) {
      chapters.push({
        id: idref,
        href: resolvedPath,
        paragraphs,
      });
    }
  }

  return {
    title,
    chapters,
    blockedThreats: allBlockedThreats,
    epubJsVersionVerified,
  };
}
