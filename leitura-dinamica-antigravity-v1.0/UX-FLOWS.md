# Fluxos de UX — leitura, prática e recuperação

Versão 1.0 · 21/10/2026. Comportamentos propostos; não é uma interface já implementada.

## 1. Estrutura de navegação

Destinos principais: **Biblioteca**, **Treinos**, **Histórico** e **Configurações**. Desktop pode usar navegação lateral compacta; celular, barra inferior. Leitor e quiz são contextos de foco com saída clara para a biblioteca. Nenhuma função essencial depende de hover ou gesto oculto.

Biblioteca é a tela inicial. Se houver leitura anterior, mostrar "Continuar" no item correspondente, sem reprodução automática. A ação principal no estado vazio é "Adicionar texto"; a alternativa é "Experimentar um exercício". Não exibir gráficos, sequências ou metas antes de existirem dados reais.

Hierarquia do leitor: texto → reproduzir/pausar → voltar trecho e velocidade → progresso → opções secundárias. Informações técnicas de parsing ficam na prévia ou em detalhes, sem interromper o fluxo de leitura bem-sucedido.

## 2. Inventário de telas

| Tela | Conteúdo necessário | Ação principal | Estados especiais |
| --- | --- | --- | --- |
| Biblioteca | Busca, documentos, progresso, último acesso. | Adicionar/continuar. | Vazia, busca sem resultado, storage indisponível. |
| Adicionar conteúdo | Abas colar texto/arquivo, título opcional. | Preparar texto. | Vazio, tipo inválido, limite excedido. |
| Preparação/prévia | Estágio, cancelamento, amostras, avisos, contagem. | Salvar e abrir. | Duplicata, sem texto, aviso de ordem, falha de espaço. |
| Leitor | RSVP/guiado, cursor, PPM, controles. | Iniciar/pausar. | Pausado, reproduzindo, interrompido, erro, fim. |
| Resumo | Tempo, apresentações, modo, cobertura e ações. | Fazer quiz ou voltar. | Sem questionário, sessão interrompida. |
| Treinos | Três exercícios, extensão, tentativas anteriores. | Escolher treino. | Primeiro uso, conteúdo já praticado. |
| Quiz | Questões, alternativas, progresso, envio. | Enviar respostas. | Rascunho, incompleto, enviado, abandonado. |
| Resultado | Acertos/total, explicações e fontes. | Consultar histórico. | Tentativa repetida, revisão do gabarito pendente. |
| Histórico | Sessões e tentativas, filtros simples. | Abrir detalhes. | Vazio, sem quiz, sem tempo válido. |
| Configurações | Preferências, offline, espaço, backup. | Salvar conforme ação. | Persistência recusada, atualização, restauração bloqueada. |

## 3. Fluxo A — primeiro uso com texto colado

1. Abrir biblioteca vazia. Exibir "Seus textos ficam neste dispositivo. Você pode exportar um backup nas configurações" sem pedir conta ou permissões imediatamente.
2. Selecionar "Adicionar texto" → "Colar texto". Campo de título opcional; ausência gera título a partir do primeiro trecho, com limite de 80 caracteres e possibilidade de renomear.
3. Colar conteúdo. Campo aceita texto literal; espaços ou quebras sem palavras não habilitam preparação.
4. Preparar e mostrar prévia: título, quantidade de palavras/tokens de leitura, parágrafos e avisos. Explicar que a contagem segue a tokenização do aplicativo, podendo diferir de editores externos.
5. Confirmar "Salvar e abrir". Mostrar salvamento até commit. Só navegar após sucesso; em falha manter rascunho e oferecer tentar de novo.
6. Abrir RSVP pausado, padrão 250 PPM. Mostrar o token inicial em prévia e botão "Iniciar". A prévia não inicia sessão ativa nem aumenta métricas.
7. Iniciar, pausar e sair. Ao voltar, mostrar "Continuar de onde parou" e o último ponto salvo, sempre pausado.

**Saídas:** cancelar antes do commit descarta o rascunho após aviso se houver texto digitado; não cria item na biblioteca. Falha de storage não perde o texto do formulário enquanto a página estiver aberta.

## 4. Fluxo B — importar TXT, PDF ou EPUB

1. Selecionar arquivo pelo picker padrão. Arrastar/soltar pode existir no desktop como conveniência, nunca como caminho único.
2. Validar tipo/tamanho. Mensagem de limite informa o máximo e uma alternativa: reduzir/dividir ou colar trecho.
3. Mostrar estágio real: "Verificando arquivo", "Extraindo página 8 de 42" ou "Preparando capítulo 3 de 9". Quando total não for conhecido, usar estado indeterminado; não inventar percentual.
4. Cancelar permanece disponível. Após cancelamento, voltar ao formulário sem documento parcial.
5. Se duplicado, mostrar "Este arquivo já está na biblioteca" com "Abrir existente" e "Escolher outro". Texto colado diferente não é automaticamente fundido por semelhança.
6. Na prévia, oferecer navegação por página/capítulo extraído. Mostrar pelo menos começo/fim e avisos; em PDF complexo incentivar conferência de ordem, sem declarar qualidade perfeita.
7. Confirmar para salvar. Persistir o original e a versão normalizada; abrir pausado.

**Mensagens essenciais:**

| Caso | Mensagem proposta | Próxima ação |
| --- | --- | --- |
| PDF sem texto | "Este PDF não possui texto selecionável. OCR não está incluído nesta versão." | Escolher outro/colar texto. |
| PDF misto | "Algumas páginas não têm texto. Elas não entrarão na leitura." | Conferir páginas e confirmar ou cancelar. |
| PDF em colunas | "A ordem extraída pode diferir da página. Confira a prévia antes de salvar." | Navegar na prévia. |
| Arquivo com senha | "PDF protegido por senha não é suportado nesta versão." | Usar cópia autorizada sem proteção. |
| EPUB com DRM | "Este EPUB tem proteção não suportada. O aplicativo não remove DRM." | Escolher arquivo compatível. |
| EPUB layout fixo | "Esta versão aceita EPUB de texto refluível. O layout fixo não é suportado." | Escolher outro/colar trecho. |
| Arquivo quebrado | "Não foi possível ler a estrutura deste arquivo." | Tentar outro; detalhes do erro. |
| Texto acima do limite | "O texto excede o limite desta versão. Importe um trecho menor." | Voltar sem salvar parcial. |
| Falta de espaço | "Não foi possível salvar por falta de espaço. O texto ainda não foi adicionado." | Exportar/remover itens ou tentar depois. |
| Timeout | "A preparação demorou além do limite e foi interrompida." | Tentar arquivo menor. |

Não oferecer acesso a serviço externo de conversão como parte implícita da solução.

## 5. Fluxo C — RSVP

### Estado pausado

- Mostrar palavra atual com contexto curto opcional acima/abaixo; o centro mantém posição estável.
- Controles: iniciar, voltar 10 palavras, avançar 10 palavras, velocidade e modo.
- Mudanças de posição ficam limitadas a `0..tokenCount`; o botão nunca gera índice inválido.
- Campo/slider de velocidade mostra PPM e explica "ritmo configurado". Valor editado fora de 100–800 recebe validação, não wrap inesperado.
- Progresso identifica posição. Slider de progresso, se implementado, é acessível e só muda posição pausada.

### Estado reproduzindo

- Reproduzir vira pausar; botão principal permanece no mesmo lugar e não perde foco.
- Ações que exigem atenção — modo, seek, configurações, sair — pausam antes.
- Velocidade pode mudar em reprodução, valendo na próxima palavra. Mostrar confirmação discreta sem cobrir o texto.
- Ao ocultar a página, pausar e exibir na volta "Leitura pausada enquanto você estava fora". Não compensar tokens ou tempo de segundo plano.
- Não bloquear navegação do navegador. Ao sair, tentar checkpoint, com limite de perda documentado para encerramento abrupto.

### Atalhos

| Entrada | Ação | Condição |
| --- | --- | --- |
| Espaço | Iniciar/pausar. | Foco no leitor; nunca capturar em campo, slider, botão nativo em ativação ou edição de quiz. Evitar duplo disparo. |
| Setas esquerda/direita | Pausar e voltar/avançar 10 palavras. | Leitor, fora de controles editáveis. |
| `-` / `+` | Reduzir/aumentar 25 PPM. | Leitor e sem captura de digitação. |
| Escape | Pausar; se diálogo aberto, fechá-lo primeiro. | Sem descartar rascunho silenciosamente. |

Atalhos complementam botões visíveis. Não usar a barra de espaço global do site nem anunciar cada palavra com `aria-live`.

### Final

O último token recebe a duração completa. Depois, leitura encerra uma vez e abre resumo. "Recomeçar" inicia nova sessão; "Voltar ao texto" abre pausado. Se o usuário saltou ao fim, resumo identifica sessão parcial por cobertura, sem afirmar leitura integral.

## 6. Fluxo D — leitura guiada

1. Pausar RSVP e selecionar "Guiada". Manter o token exato.
2. Renderizar texto normalizado em parágrafos. Mostrar indicação discreta: "Texto extraído; formatação do original não preservada" em detalhes acessíveis, sem repetir a cada sessão.
3. Destacar token com contraste e outra pista além de cor. Texto ao redor permanece legível.
4. Iniciar usa o mesmo ritmo do RSVP; rolagem acompanha somente quando necessário.
5. Se o usuário rolar manualmente, tocar outra palavra ou navegar capítulo, pausar. Tocar palavra reposiciona sem contar tokens saltados.
6. Alterar tamanho de fonte, orientação ou largura mantém cursor; retornar ao RSVP mantém posição e estado pausado.

Sem destaque sobre canvas PDF no MVP. Links extraídos viram texto, não navegação que executa conteúdo do documento. Fonte pode usar pilha do sistema para funcionar offline e manter boa legibilidade.

## 7. Fluxo E — treino com compreensão

1. Abrir "Treinos" e escolher um dos três textos. Mostrar extensão aproximada, número de questões e se já foi praticado.
2. Selecionar modo/PPM; não exigir teste inicial longo. O usuário pode começar pelo ritmo padrão e ajustar.
3. Ler, pausar, revisar e finalizar. Revisão do texto antes do quiz é permitida; o resultado descreve as condições, sem alegação de prova controlada.
4. No resumo, oferecer "Responder 4 questões". Não abrir quiz nem mostrar gabarito automaticamente.
5. Selecionar alternativas por toque/teclado. Mostrar "3 de 4 respondidas". Salvar rascunho local a cada resposta.
6. Se faltar resposta, envio informa quais faltam e leva foco à primeira; não envia nota parcial silenciosamente.
7. Enviar uma vez. Botão fica ocupado durante a gravação; retries usam a mesma tentativa para evitar duplicata.
8. Resultado mostra `3/4 · 75%`, respostas corretas e erradas, justificativa e trecho de origem. Sem confetes ou rótulos de capacidade cognitiva.
9. Histórico vincula sessão e tentativa. Repetir cria nova tentativa e aviso "Você já leu este texto; a familiaridade pode influenciar o resultado".

Se o usuário sair do quiz, oferecer manter rascunho ou descartar com confirmação. Questões e resultados não alteram o ponto de leitura. Se revisão do conteúdo estiver pendente, indicar "Material de treino aguardando conferência do usuário" e manter a distinção entre consistência automática e revisão humana.

## 8. Fluxo F — conteúdo pessoal sem questionário

Ao terminar um arquivo importado, resumo mostra "Este texto não possui questionário" e oferece "Registrar reflexão" ou voltar à biblioteca. Campo sugerido: "O que você lembra do texto?". Salvar como anotação local vinculada à sessão.

Não converter esse texto em nota de compreensão. No histórico, coluna correspondente mostra "Sem questionário". Editor manual de perguntas e avaliação por IA ficam fora do MVP.

## 9. Fluxo G — histórico e comparação pessoal

Lista cronológica com documento, data, modo(s), tempo ativo, PPM observada e quiz quando existir. Abrir detalhe mostra velocidade configurada/alterações, apresentações, cobertura única e status da sessão.

Filtros mínimos: documento e presença de quiz. Comparações destacam que textos, velocidades e repetições diferentes não formam experimento equivalente. Evitar ranking único, pontuação de inteligência ou "melhorou 30%" sem base.

Estado vazio: "Suas sessões aparecerão aqui depois que você iniciar uma leitura". Sessão com zero tempo não gera divisão por zero. Sessão só pré-visualizada pode ser omitida do histórico se nenhum token foi iniciado; definir regra consistente nos testes.

## 10. Fluxo H — offline e atualização

1. Após carregar os recursos essenciais e ativar o service worker, configurações mostram "Pronto para usar offline". Mostrar "Preparando" antes disso.
2. Offline, biblioteca e textos locais continuam acessíveis; aviso de rede não deve bloquear leitura ou importação de arquivo local.
3. Se um recurso indispensável não estiver disponível, explicar o que falta e pedir reconexão; não deixar spinner infinito nem prometer offline concluído.
4. Uma nova versão gera aviso discreto. Durante reprodução, a atualização aguarda; ao pausar, usuário pode escolher "Atualizar agora" ou "Depois".
5. Antes de recarregar, confirmar checkpoint. Se falhar, mostrar erro de gravação e manter versão em uso. Após atualização, reabrir pausado e preservar dados.

Botão instalar aparece quando suportado. Nos demais casos, acesso pelo navegador continua sendo o caminho válido. Instruções por plataforma só devem ser declaradas verificadas após teste na versão registrada.

## 11. Fluxo I — backup e restauração

### Exportar

Configurações → Dados locais → Exportar backup. Resumo informa quantidade de documentos e tamanho estimado, inclui originais e histórico, avisa "Este arquivo não é criptografado". Ao confirmar, preparar ZIP cancelável e oferecer download. "Arquivo preparado" não deve ser confundido com garantia de que o sistema operacional concluiu a gravação.

Se acervo exceder os limites de backup MVP, mostrar restrição antes de produzir arquivo parcial. Não excluir itens para caber sem ação explícita do usuário.

### Restaurar

Selecionar backup → validar → mostrar data, versão, quantidades e avisos → confirmar restauração. Somente biblioteca sem dados pessoais; se já houver acervo, interromper e explicar que a versão atual não mescla dados. O usuário pode exportar o acervo atual e decidir limpá-lo manualmente antes de tentar de novo.

Backup inválido ou versão futura não muda a base. Restauração bem-sucedida termina na biblioteca com progresso e histórico reconstituídos, sem reprodução automática. Nenhuma etapa manda dados à nuvem.

### Remover dados

Excluir documento informa remoção de original, texto e histórico associado. "Limpar dados pessoais" exige confirmação com resumo e recomendação de backup. A ação é explícita e destrutiva; não é usada automaticamente para corrigir erro de banco ou liberar espaço.

## 12. Fluxo J — interrupção, conflito e falhas

| Situação | Comportamento |
| --- | --- |
| Reabrir após navegador fechar | Recuperar último checkpoint, informar interrupção e abrir pausado. |
| Outra aba reproduzindo | "Já existe uma leitura ativa em outra aba." Oferecer ir à biblioteca; não roubar controle silenciosamente. |
| Perda do lease | Pausar, descartar callbacks antigos e explicar conflito. |
| Gravação falhou | Pausar e mostrar "Seu último avanço ainda não foi salvo"; permitir tentar de novo. |
| Base de versão futura | Tela de incompatibilidade com orientação; sem apagar ou sobrescrever. |
| Documento não encontrado | Voltar à biblioteca; não criar documento vazio para esconder erro. |
| Queda de rede | Manter leitura local; não registrar pausa como falha se recursos já estiverem disponíveis. |
| Erro de UI | Boundary com mensagem de recuperação; preservar banco e evitar loops. |

## 13. Diretrizes visuais e acessibilidade

- Interface tranquila, texto central e contraste suficiente; evitar dashboard cheio de cartões ou efeitos que disputem a atenção.
- Largura confortável de leitura guiada, aproximadamente 55–75 caracteres por linha em desktop, ajustável pelo layout; celular usa largura disponível com margens.
- Layout sem overflow horizontal em 360 CSS px, inclusive com texto ampliado e títulos longos. Controles podem quebrar em linhas sem sumir.
- Suportar zoom de 200%, foco visível, ordem de tabulação lógica e labels em todos os campos. Diálogos prendem foco corretamente e devolvem ao gatilho ao fechar.
- Contraste de referência WCAG AA: 4,5:1 para texto comum e 3:1 para texto grande/elementos relevantes, aferido nas combinações usadas. Isso não substitui auditoria completa de acessibilidade.
- Alvos principais de 44 × 44 CSS px; slider tem alternativa por botões ou campo numérico.
- Usar feedback textual para erro/sucesso; `aria-live` apenas para estados ocasionais como importação concluída, sem fluxo por palavra.
- Modo estático/guiado pausado permanece alternativa para leitores de tela. RSVP não é anunciado como igualmente acessível para todos.
- Respeitar `prefers-reduced-motion`; evitar animações decorativas, autoplay, flashes e sons.
- Datas/números em pt-BR; timestamps persistidos continuam UTC. Texto "PPM" acompanhado de "palavras por minuto" em ajuda contextual.

## 14. Roteiro de validação visual

Capturar biblioteca vazia/preenchida, prévia com aviso, RSVP pausado/em reprodução, guiado, quiz, resultado, histórico vazio/preenchido e configurações com backup. Registrar versões de navegador e viewport. Conferir claro/escuro, texto longo, erro e zoom.

Captura de tela prova aparência daquele estado. Fluxos, persistência, segurança, temporização e compreensão exigem suas evidências próprias em [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md).
