# ADR-016 — Modo "Ouvir": leitura acompanhada por voz local (protótipo)

- **Data:** 2026-10-23
- **Status:** Protótipo implementado e verificado no Chrome/Windows com voz real (volume zerado no teste); avaliação de qualidade da voz pelo usuário pendente.

## Contexto

O usuário pediu para estudar a leitura em voz alta e aprovou o protótipo após o estudo (`docs/research/tts-leitura-em-voz-alta.md`). A recomendação foi usar as vozes **locais** do sistema pela Web Speech API: grátis, offline e sem enviar o texto para fora. Vozes na nuvem custariam US$ 5–55 por livro de 600 páginas e quebrariam as regras de rede e privacidade do MVP.

## Decisão

- **Somente vozes com `localService === true`.** Vozes online (por exemplo "Google português do Brasil") nunca aparecem nem são usadas. As vozes de português vêm primeiro na lista (pt-BR antes de pt-PT).
- **Fala por frase** (`domain/reading/speechChunks.ts`): cada trecho vai até o fim da frase ou do parágrafo, ou é cortado na última vírgula (ou palavra) antes de 280 caracteres. Isso evita o corte de falas longas em alguns navegadores e deixa parar e recomeçar responsivo. Cada trecho guarda o offset de cada palavra, e os eventos `boundary` (`charIndex`) são convertidos para o token falado por busca binária.
- **Narrador** (`infrastructure/speech/narrator.ts`): fala um trecho e encadeia o próximo no `onend`. Um número de geração descarta eventos atrasados depois de parar ou recomeçar. Erros `interrupted`/`canceled` (gerados pelo próprio cancelamento) são ignorados.
- **Integração com o leitor:**
  - Abrir "Ouvir" mostra a barra com a voz, a velocidade da fala (0,6×–2,5×) e os botões Ouvir daqui / Parar.
  - Enquanto fala, o visor mostra a Leitura Guiada com o destaque conduzido pela voz. Clicar numa palavra recomeça a fala dali; rolar a página manualmente para a fala.
  - **O motor do RSVP fica parado durante a fala**; se estiver tocando, é pausado com checkpoint antes. Ao parar, o cursor de leitura recebe a última palavra falada num **único seek**: nenhuma gravação por palavra.
  - Iniciar/Pausar e a tecla Espaço param a voz.
- **Métricas:** ouvir **não** conta como sessão de leitura nem entra na PPM observada. Ouvir e ler são atividades diferentes, e misturar quebraria a separação de métricas exigida pelo AGENTS.md.

## Limites do protótipo

- A voz e a velocidade escolhidas valem só na sessão (não são preferências salvas).
- O contador "Palavra n de N" e o mapa do PDF só se atualizam ao parar a voz; durante a fala, o destaque da Leitura Guiada é a referência.
- Com a aba em segundo plano, a fala continua (comportamento de audiolivro), diferente do RSVP, que pausa (AC-11).
- As vozes disponíveis dependem do sistema; Android e iOS não foram testados. O evento `boundary` não é suportado em todos os navegadores; sem ele, o destaque avança só a cada frase.

## Verificação

- Unitários: `tests/unit/speechChunks.test.ts`.
- E2E determinístico com voz falsa (`tests/e2e/listen-mode.spec.ts`): só a voz local listada, o destaque avança sozinho entre frases, a fala é dividida por frase, clicar numa palavra recomeça dali, parar pelo botão ou pela tecla Espaço sincroniza o cursor.
- Teste manual automatizado com a voz real "Microsoft Daniel" no Chrome/Windows (volume 0): o destaque seguiu a fala palavra a palavra, entrou na segunda frase sozinho, e ao parar o cursor foi para a palavra 15 de 32.
