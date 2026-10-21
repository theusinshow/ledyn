# Referências técnicas e limites da pesquisa

Consultadas em **21/10/2026**, para orientar esta especificação. Usar documentação oficial da versão efetivamente instalada ao implementar. Links e requisitos podem mudar; este pacote não fixa uma combinação de versões como já testada.

## 1. Google Antigravity

- [Regras de workspace e diretório](https://www.antigravity.google/docs/rules/): documenta a descoberta de `AGENTS.md`, `GEMINI.md` e diretórios de regras. Fundamenta manter `AGENTS.md` na raiz e exigir sua leitura no prompt.
- [Documentação de workflows do IDE](https://www.antigravity.google/docs/ide/workflows/): a página consultada traz aviso de mudança no sistema de workflows, com descontinuação dos antigos a partir de 19/10/2026. Por isso, o pacote usa arquivos Markdown e prompt direto, sem depender de workflow legado.

Não é necessário importar regras globais, usar comandos experimentais ou presumir uma edição específica da interface. Se a instalação do usuário tiver comportamento diferente, o prompt explícito continua sendo a instrução de leitura dos documentos.

## 2. Base frontend

- [React — Quick Start](https://react.dev/learn): referência de componentes/estado. A separação domínio/interface deste pacote é decisão de projeto, não exigência do React.
- [Vite — Getting Started](https://vite.dev/guide/): requisitos do runtime e bootstrap. Confirmar Node suportado pela versão instalada na F0 e registrar o requisito no projeto.
- [Tailwind CSS — integração com Vite](https://tailwindcss.com/docs/installation/using-vite): instalação correspondente à geração atual de Tailwind; não misturar instruções de gerações diferentes.
- [shadcn/ui — Vite](https://ui.shadcn.com/docs/installation/vite): componentes e configuração para o ambiente Vite.
- [Zustand — repositório oficial](https://github.com/pmndrs/zustand): referência do gerenciador. A limitação a estado transitório é decisão arquitetural deste projeto.

## 3. Persistência e limites web

- [Dexie — API Reference](https://dexie.org/docs/API-Reference): wrapper e operações IndexedDB; consultar schema, transações e migrações na implementação.
- [Dexie — StorageManager](https://dexie.org/docs/StorageManager): explica persistência solicitável e armazenamento best-effort; `persist()` pode não ser concedido.
- [MDN — quotas e critérios de evicção](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): políticas variam e o armazenamento pode ser removido; backup é uma proteção distinta.
- [MDN — Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API): detecção de página oculta e limitações de execução em segundo plano. A política de pausar/recomeçar manualmente é decisão de UX do projeto.

Não há promessa de armazenamento permanente, sincronização entre origens ou precisão de temporizadores durante suspensão.

## 4. PDF e EPUB

- [PDF.js — exemplos oficiais](https://mozilla.github.io/pdf.js/examples/): carregamento e acesso ao documento/páginas.
- [PDF.js — API de referência](https://mozilla.github.io/pdf.js/api/draft/api.js.html): consultar `getDocument`, `getTextContent`, workers e encerramento na versão instalada; o caminho `draft` pode evoluir.
- [epub.js — repositório e README oficiais](https://github.com/futurepress/epub.js/): estrutura da biblioteca e documentação de segurança. O README informa scripts desabilitados por padrão e risco de ativar conteúdo scriptado; o pacote proíbe esse modo e usa extração de texto.

Uso das bibliotecas não resolve automaticamente ordem de leitura, OCR, DRM, segurança de recursos externos ou fidelidade editorial. Os limites, pré-validação ZIP, carregador local e testes hostis são requisitos adicionais deste projeto.

## 5. PWA e plataformas futuras

- [Vite PWA — guia](https://vite-pwa-org.netlify.app/guide/): integração do service worker, manifest, cache e opções de atualização.
- [MDN — instalar/desinstalar aplicações web](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing): instalação depende de navegador e plataforma.
- [Tauri — introdução oficial](https://v2.tauri.app/start/): referência para a futura fase Windows, com permissões e pré-requisitos a conferir.
- [Capacitor — documentação oficial](https://capacitorjs.com/docs): runtime nativo para aplicações web; integrações e requisitos devem ser validados na fase móvel.

O pacote não declara que a PWA foi instalada, que o storage de navegador e WebView seja compartilhado ou que os aplicativos nativos já existam.

## 6. Verificação

- [Vitest — guia](https://vitest.dev/guide/): testes de domínio/integração propostos.
- [Playwright — introdução](https://playwright.dev/docs/intro): automação de navegador proposta. A matriz física permanece uma atividade separada.

## 7. Natureza das afirmações do pacote

Os fluxos, números de limite, schema, fases, critérios AC, perguntas de treino a produzir e estratégia de agentes são **propostas de design**, não fatos extraídos de uma ferramenta nem evidência de software já executado. Nenhuma alegação científica de ganho cognitivo é feita. PPM descreve ritmo de apresentação; acertos descrevem apenas a tentativa correspondente.

O único histórico usado é a conversa referenciada e o pedido atual, com a limitação de conteúdo descrita em [DECISIONS.md](DECISIONS.md). Não foram incorporadas decisões de outros projetos do usuário.
