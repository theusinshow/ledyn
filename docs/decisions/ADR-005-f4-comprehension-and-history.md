# ADR-005: Catálogo de Treino Original, Questionário Determinístico, Reflexão sem Nota e Histórico Filtrável (F4)

- **Status:** Aceito
- **Data:** 2026-10-22
- **Fase:** F4 (Gate G4)

## Contexto

A Fase F4 implementa os requisitos `RF-06`, `RF-07`, `RNF-10` e critérios `AC-19` a `AC-23`:
1. Três textos originais de treino em português do Brasil (300 a 600 palavras cada), com 4 questões de múltipla escolha por texto, 4 alternativas por questão, 1 alternativa correta, justificativa e trecho-fonte literal (`sourceQuote`) com offsets UTF-16 exatos (`sourceStartOffset`, `sourceEndOffset`).
2. Preservação estrita da distinção entre verificação técnica automatizada (`reviewStatus: 'technical_verified_pending_human'`) e revisão humana explícita (`'human_reviewed'`), sem aprovar a conferência humana automaticamente.
3. Persistência incremental de rascunho de respostas (`status: 'draft'`) resistente a recarregamento de página sem revelar gabarito antecipadamente, submissão idempotente (`status: 'submitted'`), descarte explícito (`status: 'abandoned'`) sem converter em nota `0%`, e marcação `repeated: true` quando o usuário pratica novamente um treino já respondido anteriormente.
4. Para documentos pessoais importados sem questionário vinculado, oferta de registro local de reflexão (`reflections`) sem nota, sem IA e sem criação de `quizAttempts`, aparecendo no histórico como `"Sem questionário"`.

## Decisões

1. **Verificação Técnica Canônica (`verifyQuestionSetIntegrity`):**
   - Antes de semear ou abrir qualquer questionário, `verifyQuestionSetIntegrity` valida que o `QuestionSetRecord` possui exatamente 4 questões, IDs únicos, 4 alternativas válidas por questão, `correctOptionId` existente e `content.normalizedText.slice(sourceStartOffset, sourceEndOffset) === sourceQuote`.
2. **Semeadura Idempotente (`ensureTrainingCatalogSeeded`):**
   - Os 3 treinos originais (`training-doc-01-atencao-ritmo`, `training-doc-02-memoria-contexto`, `training-doc-03-leitura-tecnica`) são semeados no Dexie de forma transacional e idempotente, preservando sessões, progresso e tentativas anteriores do usuário.
3. **Ciclo de Vida de `QuizAttemptRecord` (`draft` | `submitted` | `abandoned`):**
   - Escolhas são gravadas imediatamente em `quizAttempts.answers` com `status: 'draft'` e `correctCount: null`.
   - `submitQuizAttempt` exige que todas as 4 questões estejam respondidas (`QUIZ_INCOMPLETE` com lista de questões faltantes caso contrário) e é idempotente caso invocado mais de uma vez sobre uma tentativa já enviada.
4. **Histórico Enriquecido e Exclusão Transacional (`listSessionsHistory` / `deleteDocumentTransactional`):**
   - `HistoryPage` exibe métricas separadas (tempo ativo, apresentações, cobertura única, PPM observada e compreensão) e oferece filtros por documento e por status de questionário (`all`, `with_quiz`, `without_quiz`).
   - Excluir um documento remove transacionalmente suas sessões, tentativas de quiz e reflexões associadas.
