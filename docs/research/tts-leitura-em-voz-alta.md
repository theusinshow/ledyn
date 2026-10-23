# Estudo — Leitura em voz alta (texto → voz) sincronizada com o leitor

- **Data:** 2026-10-23
- **Status:** estudo; nada implementado.

## Pergunta do usuário

"Transcrição em áudio: fica muito caro? É possível?" Interpretado como **o app ler o texto em voz alta**, com o cursor e o destaque acompanhando a fala.

## Opções

| Opção | Custo | Qualidade | Offline / privacidade | Sincronia com o cursor |
|---|---|---|---|---|
| **A. Vozes do sistema (Web Speech API, `speechSynthesis`), só `localService`** | Grátis | Boa a razoável (vozes Microsoft Daniel e Maria no Windows) | Sim: o texto não sai do aparelho | Sim: evento `boundary` com `charIndex` por palavra (verificado nesta máquina) |
| B. Voz neural local no navegador (Piper via ONNX/WASM, voz pt_BR) | Grátis | Melhor que A | Sim, após baixar o modelo (dezenas de MB, servido pelo próprio app) | Mais difícil: precisa estimar o tempo de cada palavra |
| C. Nuvem: Google Cloud TTS | WaveNet US$ 4 / 1M caracteres (4M grátis/mês); Neural2 US$ 16 / 1M (1M grátis); Chirp 3 HD US$ 30 / 1M (1M grátis) | Muito boa | Não: o texto do livro é enviado ao Google | Possível com marcações (SSML) |
| D. Nuvem: OpenAI TTS | tts-1 ≈ US$ 15 / 1M caracteres (segundo agregadores); gpt-4o-mini-tts cobra por token | Muito boa | Não | Limitada |

**Ordem de grandeza:** um livro de 600 páginas tem ~1,2–1,8 milhão de caracteres. Pelos preços de tabela acima, sem contar a cota grátis, isso dá ~US$ 5–7 (Google WaveNet), ~US$ 20–30 (Google Neural2 ou OpenAI tts-1) e ~US$ 35–55 (Google Chirp 3 HD) por livro.

## Verificação feita

No Chrome deste Windows, `speechSynthesis.getVoices()` listou `Microsoft Daniel - Portuguese (Brazil)` e `Microsoft Maria - Portuguese (Brazil)`, ambas com `localService: true`. Uma frase de teste disparou `boundary` com `charIndex` 0, 8, 17, 21, 25 e 31: um evento por palavra.

No Chrome comum também aparecem vozes "Google ..." que **não** são locais: o texto vai para servidores do Google. A opção A precisa filtrar `localService === true`.

## Limites

- O suporte varia por navegador: o evento `boundary` não é Baseline (MDN). As vozes disponíveis dependem do sistema; no Android e no iOS são outras e precisam de teste em aparelho.
- A velocidade da voz (`rate`) vai até ~2–3× na prática, muito abaixo das velocidades altas de RSVP. É um modo próprio (ouvir + acompanhar), não uma narração do RSVP a 500 PPM.
- C e D violam regras atuais do MVP (sem rede, sem serviços externos, sem custo) e exigiriam chave de API. Isso precisa de decisão explícita do usuário.

## Recomendação

Implementar **A** como modo "Ouvir": a fala conduz o cursor pelos eventos `boundary`, com destaque na Leitura Guiada e no mapa do PDF, pausa e retomada, e escolha de voz e velocidade. Grátis, offline e privado. **B** fica como evolução, se a qualidade de A não agradar. **C/D** só com decisão sobre custo e privacidade.

## Fontes

- Preços do Google Cloud TTS: https://cloud.google.com/text-to-speech/pricing
- Modelo OpenAI gpt-4o-mini-tts: https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- Estimativa de custo do OpenAI TTS: https://www.s-anand.net/blog/openai-tts-cost/
- Evento `boundary` (MDN): https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event
- piper-tts-web: https://github.com/Mintplex-Labs/piper-tts-web
- Lista de vozes do Piper e pedido de execução no navegador: https://github.com/rhasspy/piper/issues/352
