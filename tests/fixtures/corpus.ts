import { zipSync, strToU8 } from 'fflate';

/**
 * FX-01: Texto determinístico de exatamente 100 tokens sem pontuação.
 * Usado para o cenário AC-06 (300 PPM = 200 ms/token -> 20.000 ms exatos para 100 tokens).
 */
export const FX_01_TOKENS_LIST: string[] = Array.from(
  { length: 100 },
  (_, idx) => `palavra${String(idx + 1).padStart(3, '0')}`,
);

export const FX_01_TEXT: string = FX_01_TOKENS_LIST.join(' ');

/**
 * FX-02: Texto em português com NFD/NFC combinados, aspas, hífens, decimais,
 * abreviações, parágrafos múltiplos, emoji isolado e palavra longa.
 */
export const FX_02_TEXT = [
  'O Dr. Carlos e a Sra. Helena analisaram a auto-observac\u0327a\u0303o em 3,14 segundos, custando R$ 1.250,50; pore\u0301m, nos E.U.A. o me\u0301todo exige atenc\u0327a\u0303o constante.',
  '“Como avaliar anticonstitucionalissimamente cada etapa?” — perguntou o Prof. Marcos 🚀 durante o encontro.',
  'Conclui-se, portanto: velocidade configurada e compreensa\u0303o real sa\u0303o me\u0301tricas distintas, etc. Confira sempre o contexto!',
].join('\n\n');

/**
 * FX-03: Fixtures de arquivos TXT UTF-8 sem BOM, com BOM, bytes inválidos e vazio.
 */
export function createFx03TxtUtf8Bytes(
  text: string = 'Leitura dinâmica em português: coração, cérebro, atenção e método.\n\nSegundo parágrafo preservado com nitidez.',
): Uint8Array {
  return new TextEncoder().encode(text);
}

export function createFx03TxtWithBomBytes(
  text: string = 'Leitura dinâmica em português: coração, cérebro, atenção e método.\n\nSegundo parágrafo preservado com nitidez.',
): Uint8Array {
  const body = new TextEncoder().encode(text);
  const withBom = new Uint8Array(body.byteLength + 3);
  withBom[0] = 0xef;
  withBom[1] = 0xbb;
  withBom[2] = 0xbf;
  withBom.set(body, 3);
  return withBom;
}

export function createFx03InvalidEncodingBytes(): Uint8Array {
  // Sequência Latin-1 / Windows-1252 inválida em UTF-8 estrito (0xE7 0xE3 0xFF)
  return new Uint8Array([0x54, 0x65, 0x78, 0x74, 0x6f, 0x20, 0xe7, 0xe3, 0xff, 0xfe]);
}

/**
 * Constrói um PDF sintético multipágina customizável para FX-04 e FX-05.
 * Cada página recebe comandos PostScript/PDF `BT ... ET` ou permanece sem texto.
 */
export function createMultiPagePdfBytes(
  pageStreams: string[],
): Uint8Array {
  const pageCount = pageStreams.length;
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font
  // Para cada página i (0..pageCount-1):
  //   Page obj = 4 + i * 2
  //   Content obj = 5 + i * 2
  const kidsRefs = pageStreams
    .map((_, idx) => `${4 + idx * 2} 0 R`)
    .join(' ');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;
    const stream = pageStreams[i] ?? '';

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`,
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/**
 * Cria um PDF textual mínimo de 1 página em memória.
 */
export function createMinimalPdfBytes(
  pageText: string = 'Leitura Dinamica Local Spike PDF',
): Uint8Array {
  const safeText = pageText.replace(/[()\\]/g, '');
  return createMultiPagePdfBytes([
    `BT /F1 12 Tf 72 720 Td (${safeText}) Tj ET`,
  ]);
}

/**
 * FX-04: PDF textual simples de 3 páginas com ordem conhecida.
 */
export function createFx04ThreePagePdfBytes(): Uint8Array {
  return createMultiPagePdfBytes([
    'BT /F1 12 Tf 72 720 Td (Pagina um introducao clara do documento) Tj 0 -30 Td (Segundo paragrafo da primeira pagina) Tj ET',
    'BT /F1 12 Tf 72 720 Td (Pagina dois desenvolvimento das ideias) Tj ET',
    'BT /F1 12 Tf 72 720 Td (Pagina tres conclusao final verificavel) Tj ET',
  ]);
}

/**
 * FX-04i: PDF textual de 2 páginas com uma imagem raster (bloco vermelho) na página 1.
 * A imagem é inline e codificada em ASCIIHex para manter o arquivo 100% ASCII.
 */
export function createFx04iPdfWithImageBytes(): Uint8Array {
  const redPixels = Array.from({ length: 4 }, () => 'FF0000').join(' ');
  return createMultiPagePdfBytes([
    `BT /F1 12 Tf 72 720 Td (Figura um mostra o bloco vermelho abaixo) Tj ET q 240 0 0 160 72 480 cm BI /W 2 /H 2 /CS /RGB /BPC 8 /F /AHx ID ${redPixels}> EI Q`,
    'BT /F1 12 Tf 72 720 Td (Pagina final sem figura alguma) Tj ET',
  ]);
}

/**
 * FX-04o: PDF textual de 3 páginas com sumário (outline) embutido:
 * "Introducao" → p.1, "Desenvolvimento" → p.2, "Conclusao" → p.3.
 */
export function createFx04oOutlinePdfBytes(): Uint8Array {
  const streams = [
    'BT /F1 12 Tf 72 720 Td (Introducao ao metodo de leitura com foco) Tj ET',
    'BT /F1 12 Tf 72 720 Td (Desenvolvimento das tecnicas de ritmo e pausa) Tj ET',
    'BT /F1 12 Tf 72 720 Td (Conclusao com revisao final do conteudo) Tj ET',
  ];
  const titles = ['Introducao', 'Desenvolvimento', 'Conclusao'];
  const pageObj = (i: number) => 4 + i * 2;
  const outlineRoot = 4 + streams.length * 2;
  const itemObj = (i: number) => outlineRoot + 1 + i;

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${streams.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${streams.length} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  streams.forEach((stream, i) => {
    objects.push(
      `${pageObj(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageObj(i) + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`,
      `${pageObj(i) + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  });
  objects.push(
    `${outlineRoot} 0 obj\n<< /Type /Outlines /First ${itemObj(0)} 0 R /Last ${itemObj(titles.length - 1)} 0 R /Count ${titles.length} >>\nendobj\n`,
  );
  titles.forEach((title, i) => {
    const prev = i > 0 ? ` /Prev ${itemObj(i - 1)} 0 R` : '';
    const next = i < titles.length - 1 ? ` /Next ${itemObj(i + 1)} 0 R` : '';
    objects.push(
      `${itemObj(i)} 0 obj\n<< /Title (${title}) /Parent ${outlineRoot} 0 R${prev}${next} /Dest [${pageObj(i)} 0 R /XYZ 0 792 0] >>\nendobj\n`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/**
 * FX-04L: livro textual longo (padrão 600 páginas, ~300 palavras por página em 30 linhas).
 * Gerado de forma determinística para medir importação e leitura de PDFs grandes.
 */
export function createFx04LongBookPdfBytes(pageCount = 600): Uint8Array {
  const vocabulary = [
    'leitura', 'ritmo', 'atencao', 'texto', 'pagina', 'capitulo', 'ideia', 'memoria',
    'foco', 'palavra', 'linha', 'sentido', 'pratica', 'olhar', 'tempo', 'estudo',
  ];
  const streams: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const lines: string[] = [];
    for (let l = 0; l < 30; l++) {
      const words: string[] = [];
      for (let w = 0; w < 10; w++) {
        words.push(vocabulary[(p * 7 + l * 3 + w) % vocabulary.length]!);
      }
      const text = l === 0 ? `Pagina ${p + 1} ${words.join(' ')}` : words.join(' ');
      lines.push(`BT /F1 10 Tf 72 ${740 - l * 22} Td (${text}.) Tj ET`);
    }
    streams.push(lines.join(' '));
  }
  return createMultiPagePdfBytes(streams);
}

/**
 * FX-05a: PDF escaneado / sem camada de texto (2 páginas em branco sem operadores de texto).
 */
export function createFx05ScannedEmptyPdfBytes(): Uint8Array {
  return createMultiPagePdfBytes(['q Q', 'q Q']);
}

/**
 * FX-05b: PDF misto (página 1 com texto, página 2 sem texto, página 3 com texto).
 */
export function createFx05MixedPdfBytes(): Uint8Array {
  return createMultiPagePdfBytes([
    'BT /F1 12 Tf 72 720 Td (Texto presente na pagina um) Tj ET',
    'q Q',
    'BT /F1 12 Tf 72 720 Td (Texto presente na pagina tres) Tj ET',
  ]);
}

/**
 * FX-05c: PDF em duas colunas (coluna esquerda desce em Y e coluna direita volta ao topo Y=720).
 */
export function createFx05TwoColumnPdfBytes(): Uint8Array {
  const twoColStream = [
    'BT /F1 12 Tf',
    '72 720 Td (Coluna esquerda linha um) Tj',
    '0 -20 Td (Coluna esquerda linha dois) Tj',
    '0 -80 Td (Coluna esquerda base) Tj',
    '260 100 Td (Coluna direita topo apos salto vertical) Tj',
    '0 -20 Td (Coluna direita linha dois) Tj',
    'ET',
  ].join('\n');
  return createMultiPagePdfBytes([twoColStream]);
}

/**
 * FX-06: EPUB reflowable de 3 capítulos na ordem do spine e sumário local.
 */
export function createFx06ThreeChapterEpubBytes(): Uint8Array {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:fx06-3ch-epub</dc:identifier>
    <dc:title>Manual de Leitura em Três Capítulos</dc:title>
    <dc:language>pt-BR</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="cap3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <nav>
      <ol>
        <li><a href="cap1.xhtml">Capítulo 1</a></li>
        <li><a href="cap2.xhtml">Capítulo 2</a></li>
        <li><a href="cap3.xhtml">Capítulo 3</a></li>
      </ol>
    </nav>
  </body>
</html>`;

  const cap1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Capítulo 1: Fundamentos</h1>
    <p>O primeiro capítulo apresenta o ritmo base de leitura.</p>
    <p>Cada parágrafo mantém sua fronteira clara.</p>
  </body>
</html>`;

  const cap2 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Capítulo 2: Prática</h1>
    <p>O segundo capítulo explora pausas e atenção sustentada.</p>
  </body>
</html>`;

  const cap3 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Capítulo 3: Revisão</h1>
    <p>O terceiro capítulo encerra a obra na ordem exata do spine.</p>
  </body>
</html>`;

  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(containerXml),
    'OEBPS/content.opf': strToU8(contentOpf),
    'OEBPS/nav.xhtml': strToU8(navXhtml),
    'OEBPS/cap1.xhtml': strToU8(cap1),
    'OEBPS/cap2.xhtml': strToU8(cap2),
    'OEBPS/cap3.xhtml': strToU8(cap3),
  });
}

export interface HostileEpubFixtureOptions {
  includeScriptAndRemote?: boolean;
  includePathTraversal?: boolean;
  includeDrm?: boolean;
  includeFixedLayout?: boolean;
  includeExternalSpineHref?: boolean;
}

/**
 * FX-07: Cria um arquivo EPUB sintético em memória (válido ou hostil) para validação de isolamento.
 */
export function createSyntheticEpubBytes(
  options?: HostileEpubFixtureOptions,
): Uint8Array {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const fixedLayoutMeta = options?.includeFixedLayout
    ? '<meta property="rendition:layout">pre-paginated</meta>'
    : '';

  const chapterHref = options?.includeExternalSpineHref
    ? 'https://evil.example.com/remote-chapter.xhtml'
    : 'chapter1.xhtml';

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-1234567890ab</dc:identifier>
    <dc:title>Livro Sintético de Teste</dc:title>
    <dc:language>pt-BR</dc:language>
    ${fixedLayoutMeta}
  </metadata>
  <manifest>
    <item id="ch1" href="${chapterHref}" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

  const chapter1Body = options?.includeScriptAndRemote
    ? `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Capítulo Hostil</title>
    <script>window.__EPUB_SCRIPT_EXECUTED__ = true;</script>
    <link rel="stylesheet" href="https://evil.example.com/style.css"/>
  </head>
  <body onload="window.__EPUB_HANDLER_EXECUTED__ = true">
    <h1>Capítulo 1 Seguro</h1>
    <p onclick="alert(1)">Texto legítimo do primeiro parágrafo.</p>
    <img src="https://evil.example.com/beacon.png" onerror="window.__EPUB_IMG_ERROR__ = true"/>
    <iframe src="https://evil.example.com/frame.html"></iframe>
    <a href="javascript:window.__EPUB_JS_LINK__=true">Link malicioso</a>
    <p>Segundo parágrafo preservado sem execução.</p>
  </body>
</html>`
    : `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Capítulo 1</title></head>
  <body>
    <h1>Capítulo 1</h1>
    <p>Primeiro parágrafo do EPUB local.</p>
    <p>Segundo parágrafo do EPUB local.</p>
  </body>
</html>`;

  const entries: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(containerXml),
    'OEBPS/content.opf': strToU8(contentOpf),
    'OEBPS/chapter1.xhtml': strToU8(chapter1Body),
  };

  if (options?.includePathTraversal) {
    entries['../escaped.xhtml'] = strToU8('<p>Path traversal</p>');
  }

  if (options?.includeDrm) {
    entries['META-INF/encryption.xml'] = strToU8(
      '<?xml version="1.0"?><encryption><EncryptedData/></encryption>',
    );
  }

  return zipSync(entries);
}

/**
 * FX-12a: Texto longo dentro dos limites, com múltiplos parágrafos (ex.: 5.000+ tokens em 100 parágrafos)
 * para testar janela de blocos no modo guiado sem criar todos os spans no DOM ao mesmo tempo (AC-14).
 */
export function createFx12LongText(
  paragraphCount: number = 100,
  wordsPerParagraph: number = 50,
): string {
  const paragraphs: string[] = [];
  for (let p = 0; p < paragraphCount; p++) {
    const words: string[] = [];
    for (let w = 0; w < wordsPerParagraph; w++) {
      const globalIdx = p * wordsPerParagraph + w + 1;
      const suffix =
        w === wordsPerParagraph - 1
          ? '.'
          : w === Math.floor(wordsPerParagraph / 2)
            ? ','
            : '';
      words.push(
        `termo${String(globalIdx).padStart(5, '0')}${suffix}`,
      );
    }
    paragraphs.push(words.join(' '));
  }
  return paragraphs.join('\n\n');
}

/**
 * FX-12b: Lote sintético de 200 metadados de documentos e progressos para validar
 * listagem leve (< 2 s) e janela de biblioteca sem carregar textos completos (AC-14 / AC-29 / RNF-08).
 */
export function createFx12SyntheticLibraryBatch(count: number = 200) {
  const baseTimeMs = Date.UTC(2026, 9, 22, 12, 0, 0);
  const documents = Array.from({ length: count }, (_, idx) => {
    const num = idx + 1;
    const docId = `fx12-doc-${String(num).padStart(3, '0')}`;
    const cvId = `fx12-cv-${String(num).padStart(3, '0')}`;
    const iso = new Date(baseTimeMs + idx * 1000).toISOString();
    return {
      id: docId,
      title: `Documento Sintético FX-12 #${String(num).padStart(3, '0')}`,
      format: (idx % 4 === 0
        ? 'pdf'
        : idx % 4 === 1
          ? 'epub'
          : idx % 4 === 2
            ? 'txt'
            : 'pasted') as 'pasted' | 'txt' | 'pdf' | 'epub',
      sourceHash: `fx12-sha256-${String(num).padStart(4, '0')}`,
      contentVersionId: cvId,
      tokenCount: 1500 + (idx % 10) * 100,
      createdAt: iso,
      updatedAt: iso,
      lastOpenedAt: iso,
      warnings: [],
      isTraining: false,
    };
  });

  const progress = documents.map((doc, idx) => ({
    documentId: doc.id,
    contentVersionId: doc.contentVersionId,
    cursor: {
      contentVersionId: doc.contentVersionId,
      tokenIndex: (idx * 15) % doc.tokenCount,
    },
    completed: false,
    updatedAt: doc.lastOpenedAt,
    revision: 1,
  }));

  return { documents, progress };
}

export type Fx11BackupDefect =
  | 'path_traversal'
  | 'future_version'
  | 'missing_entry'
  | 'corrupt_hash'
  | 'uncompressed_overflow';

/**
 * FX-11: Gerador de pacotes de backup inválidos ou hostis para testar rejeição e rollback (AC-25).
 */
export function createFx11InvalidBackupZipBytes(
  defect: Fx11BackupDefect,
): Uint8Array {
  if (defect === 'path_traversal') {
    return zipSync({
      'manifest.json': strToU8('{}'),
      '../escaped-payload.json': strToU8('{"malicious":true}'),
    });
  }

  if (defect === 'future_version') {
    return zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          formatVersion: 99,
          appVersion: '9.9.0',
          dbSchemaVersion: 99,
          normalizationVersion: 1,
          tokenizerVersion: 1,
          exportedAt: '2026-10-22T12:00:00.000Z',
          encrypted: false,
          counts: {
            documents: 0,
            sourceFiles: 0,
            contents: 0,
            tokenChunks: 0,
            progress: 0,
            sessions: 0,
            questionSets: 0,
            quizAttempts: 0,
            reflections: 0,
            settings: 0,
          },
          files: [],
        }),
      ),
    });
  }

  if (defect === 'missing_entry') {
    return zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          formatVersion: 1,
          appVersion: '0.1.0',
          dbSchemaVersion: 1,
          normalizationVersion: 1,
          tokenizerVersion: 1,
          exportedAt: '2026-10-22T12:00:00.000Z',
          encrypted: false,
          counts: {
            documents: 0,
            sourceFiles: 0,
            contents: 0,
            tokenChunks: 0,
            progress: 0,
            sessions: 0,
            questionSets: 0,
            quizAttempts: 0,
            reflections: 0,
            settings: 0,
          },
          files: [
            {
              path: 'data/documents.json',
              byteSize: 2,
              sha256:
                '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
            },
          ],
        }),
      ),
    });
  }

  if (defect === 'corrupt_hash') {
    return zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          formatVersion: 1,
          appVersion: '0.1.0',
          dbSchemaVersion: 1,
          normalizationVersion: 1,
          tokenizerVersion: 1,
          exportedAt: '2026-10-22T12:00:00.000Z',
          encrypted: false,
          counts: {
            documents: 0,
            sourceFiles: 0,
            contents: 0,
            tokenChunks: 0,
            progress: 0,
            sessions: 0,
            questionSets: 0,
            quizAttempts: 0,
            reflections: 0,
            settings: 0,
          },
          files: [
            {
              path: 'data/documents.json',
              byteSize: 2,
              sha256: '00'.repeat(32),
            },
          ],
        }),
      ),
      'data/documents.json': strToU8('[]'),
    });
  }

  // uncompressed_overflow (excede limite configurável em teste sem exaurir RAM)
  const payload = new Uint8Array(64 * 1024);
  payload.fill(0x41);
  return zipSync({
    'manifest.json': strToU8('{}'),
    'data/oversized.bin': payload,
  });
}

