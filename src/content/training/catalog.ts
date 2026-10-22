import { verifyQuestionSetIntegrity } from '@/domain/comprehension/quiz';
import type {
  ContentRecord,
  DocumentRecord,
  QuestionItem,
  QuestionOption,
  QuestionSetRecord,
  Token,
} from '@/domain/contracts';
import { normalizeText } from '@/domain/documents/normalizer';
import { tokenizeNormalizedText } from '@/domain/documents/tokenizer';

export interface TrainingQuestionBlueprint {
  id: string;
  prompt: string;
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
}

export interface BuiltInTrainingBlueprint {
  documentId: string;
  contentVersionId: string;
  questionSetId: string;
  version: number;
  title: string;
  subtitle: string;
  rawText: string;
  questions: [
    TrainingQuestionBlueprint,
    TrainingQuestionBlueprint,
    TrainingQuestionBlueprint,
    TrainingQuestionBlueprint,
  ];
}

export interface BuiltInTrainingBundle {
  blueprint: BuiltInTrainingBlueprint;
  document: DocumentRecord;
  content: ContentRecord;
  tokens: Token[];
  questionSet: QuestionSetRecord;
}

export const BUILT_IN_TRAINING_BLUEPRINTS: BuiltInTrainingBlueprint[] = [
  {
    documentId: 'training-doc-01-atencao-ritmo',
    contentVersionId: 'training-cv-01-v1',
    questionSetId: 'training-qs-01-v1',
    version: 1,
    title: 'Treino 1 — Atenção Sustentada e Ritmo de Leitura',
    subtitle: 'Foco visual, regressões oculares e cadência consciente.',
    rawText: [
      'Quando lemos um texto em papel ou na tela, nossos olhos não deslizam em linha contínua sobre as frases. Em vez disso, o olhar alterna pequenos saltos rápidos, chamados sacadas, com breves paradas de fixação que duram cerca de duzentos a duzentos e cinquenta milissegundos. É durante essas pausas de fixação que o cérebro reconhece as letras e constrói o significado das palavras.',
      'Um hábito frequente na leitura cotidiana é a regressão involuntária: o leitor volta duas ou três palavras para trás por distração momentânea, e não porque o trecho fosse realmente complexo. Quando a regressão nasce apenas da dispersão, ela fragmenta o fluxo do pensamento e aumenta o cansaço mental ao longo de vários parágrafos.',
      'A apresentação visual rápida em série, conhecida pela sigla RSVP, exibe cada palavra em um ponto fixo da tela para reduzir os movimentos horizontais dos olhos. Contudo, eliminar o deslocamento ocular não significa que a velocidade possa crescer indefinidamente. Pesquisas em psicologia cognitiva mostram que o gargalo principal da compreensão não está na retina, mas no processamento linguístico e na integração das ideias na memória.',
      'Por essa razão, pausas breves em vírgulas, pontos finais e quebras de parágrafo desempenham papel essencial durante a leitura cadenciada. Esses microssegundos extras funcionam como janelas de consolidação, permitindo que o leitor conecte o sujeito ao verbo e perceba a transição entre um argumento e o seguinte.',
      'Além disso, alternar entre a apresentação palavra por palavra e a leitura guiada em contexto ajuda a manter a orientação espacial dentro do documento. Quando visualizamos o parágrafo completo com destaque sincronizado, preservamos a percepção do tamanho das frases e podemos recuar rapidamente caso uma ideia exija releitura atenta.',
      'Outro aspecto relevante é a preparação do ambiente antes de iniciar uma sessão de prática. Silenciar notificações temporárias e definir um objetivo claro para a leitura — como identificar os conceitos principais de um capítulo ou revisar apontamentos de estudo — reduz a tendência à dispersão e melhora o aproveitamento de cada minuto investido.',
      'Na prática pessoal, ajustar o ritmo de forma flexível produz resultados mais consistentes do que buscar recordes de palavras por minuto. Textos introdutórios ou familiares permitem cadências mais ágeis, enquanto passagens densas, repletas de termos técnicos ou números, pedem redução deliberada da velocidade e, sempre que necessário, o retorno ao texto em contexto para revisão.',
    ].join('\n\n'),
    questions: [
      {
        id: 't1-q1',
        prompt:
          'De acordo com o texto, em qual momento do movimento ocular o cérebro reconhece as letras e constrói o significado?',
        options: [
          {
            id: 'a',
            text: 'Durante o deslizamento contínuo e uniforme sobre a linha inteira.',
          },
          {
            id: 'b',
            text: 'Durante as breves paradas de fixação entre os saltos oculares.',
          },
          {
            id: 'c',
            text: 'Exclusivamente quando o leitor realiza regressões ao início da frase.',
          },
          {
            id: 'd',
            text: 'No instante exato em que a página é rolada verticalmente.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O primeiro parágrafo explica que o olhar alterna saltos (sacadas) com paradas de fixação, sendo nessas pausas que ocorre o reconhecimento das palavras.',
        sourceQuote:
          'É durante essas pausas de fixação que o cérebro reconhece as letras e constrói o significado das palavras.',
      },
      {
        id: 't1-q2',
        prompt:
          'Qual é a principal limitação para aumentar indefinidamente a velocidade na leitura em série (RSVP)?',
        options: [
          {
            id: 'a',
            text: 'O processamento linguístico e a integração das ideias na memória.',
          },
          {
            id: 'b',
            text: 'A incapacidade da tela de atualizar palavras acima de 200 PPM.',
          },
          {
            id: 'c',
            text: 'A ausência completa de consoantes nas palavras apresentadas.',
          },
          {
            id: 'd',
            text: 'O desgaste físico dos músculos do pescoço durante a leitura.',
          },
        ],
        correctOptionId: 'a',
        explanation:
          'O terceiro parágrafo destaca que o gargalo principal da compreensão não está na retina, mas no processamento linguístico e na integração na memória.',
        sourceQuote:
          'Pesquisas em psicologia cognitiva mostram que o gargalo principal da compreensão não está na retina, mas no processamento linguístico e na integração das ideias na memória.',
      },
      {
        id: 't1-q3',
        prompt:
          'Por que as pausas adicionais em sinais de pontuação e fins de parágrafo são importantes na leitura cadenciada?',
        options: [
          {
            id: 'a',
            text: 'Porque substituem a necessidade de compreender o vocabulário do texto.',
          },
          {
            id: 'b',
            text: 'Porque funcionam como janelas de consolidação para conectar ideias e perceber transições.',
          },
          {
            id: 'c',
            text: 'Porque impedem que o leitor pause a sessão manualmente.',
          },
          {
            id: 'd',
            text: 'Porque eliminam todos os adjetivos e advérbios do parágrafo.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O quarto parágrafo aponta que esses microssegundos extras servem como janelas de consolidação sintática e semântica.',
        sourceQuote:
          'Esses microssegundos extras funcionam como janelas de consolidação, permitindo que o leitor conecte o sujeito ao verbo e perceba a transição entre um argumento e o seguinte.',
      },
      {
        id: 't1-q4',
        prompt:
          'Segundo a conclusão do texto, qual atitude é recomendada diante de passagens densas com termos técnicos ou números?',
        options: [
          {
            id: 'a',
            text: 'Dobrar a velocidade configurada para concluir o capítulo rapidamente.',
          },
          {
            id: 'b',
            text: 'Ignorar os parágrafos técnicos e ler apenas o título do documento.',
          },
          {
            id: 'c',
            text: 'Reduzir deliberadamente a velocidade e revisar o texto em contexto quando necessário.',
          },
          {
            id: 'd',
            text: 'Desativar todos os sinais de pontuação para manter ritmo constante.',
          },
        ],
        correctOptionId: 'c',
        explanation:
          'O quinto parágrafo recomenda flexibilidade: passagens densas pedem redução deliberada da velocidade e retorno ao contexto para revisão.',
        sourceQuote:
          'Textos introdutórios ou familiares permitem cadências mais ágeis, enquanto passagens densas, repletas de termos técnicos ou números, pedem redução deliberada da velocidade e, sempre que necessário, o retorno ao texto em contexto para revisão.',
      },
    ],
  },
  {
    documentId: 'training-doc-02-memoria-trabalho',
    contentVersionId: 'training-cv-02-v1',
    questionSetId: 'training-qs-02-v1',
    version: 1,
    title: 'Treino 2 — Memória de Trabalho e Consolidação de Informações',
    subtitle: 'Capacidade operacional, agrupamento semântico e retenção.',
    rawText: [
      'A memória de trabalho funciona como uma bancada mental temporária onde mantemos e manipulamos as informações recém-lidas enquanto acompanhamos um raciocínio. Ao contrário do armazenamento de longo prazo, essa bancada possui capacidade estritamente limitada: conseguimos reter apenas alguns blocos de informação simultaneamente por poucos segundos se não houver elaboração ativa.',
      'Durante a leitura de um artigo ou livro, cada frase nova precisa ser articulada com o contexto construído nos parágrafos anteriores. Quando o fluxo de palavras ultrapassa o tempo necessário para organizar esses blocos, ocorre uma sobrecarga cognitiva. Nessa situação, o leitor pode até pronunciar mentalmente todas as palavras apresentadas, mas chega ao final da página sem recordar a tese central do autor.',
      'Uma estratégia eficaz para proteger a memória de trabalho consiste no agrupamento semântico, processo pelo qual reunimos dados isolados em conceitos maiores dotados de sentido. Identificar a ideia principal de cada seção antes de avançar para os detalhes secundários reduz o número de elementos soltos que disputam espaço na atenção.',
      'Outro recurso valioso é a evocação livre imediatamente após encerrar uma leitura curta. Dedicar um minuto para resumir com as próprias palavras ou responder a perguntas objetivas sobre o texto força o cérebro a recuperar as trilhas recém-formadas, fortalecendo a transferência do conteúdo para a memória durável.',
      'Vale lembrar também que a familiaridade prévia com o tema influencia diretamente o esforço exigido da memória operacional. Quando um leitor já domina o vocabulário básico de uma área, seu cérebro reconhece padrões complexos como unidades únicas, liberando atenção para analisar criticamente as premissas e as evidências apresentadas no documento.',
      'Por outro lado, ao explorar um assunto completamente inédito, é natural que o ritmo confortável seja mais moderado nas primeiras páginas. Respeitar esse período inicial de construção de vocabulário evita a frustração e cria uma base sólida para que a leitura flua com maior naturalidade nos capítulos subsequentes.',
      'Assim, medir apenas a quantidade de palavras exibidas por minuto oferece uma visão incompleta do estudo. O acompanhamento honesto combina a observação do ritmo de apresentação com verificações periódicas de compreensão, reconhecendo que a retenção real nasce do equilíbrio entre cadência visual e reflexão.',
    ].join('\n\n'),
    questions: [
      {
        id: 't2-q1',
        prompt:
          'Como o texto caracteriza a capacidade da memória de trabalho em comparação ao armazenamento de longo prazo?',
        options: [
          {
            id: 'a',
            text: 'É uma bancada temporária de capacidade estritamente limitada a poucos blocos simultâneos.',
          },
          {
            id: 'b',
            text: 'Possui armazenamento ilimitado e permanente sem necessidade de elaboração.',
          },
          {
            id: 'c',
            text: 'Atua apenas durante o sono profundo e permanece inativa na leitura.',
          },
          {
            id: 'd',
            text: 'Retém exclusivamente imagens coloridas, descartando qualquer palavra escrita.',
          },
        ],
        correctOptionId: 'a',
        explanation:
          'O primeiro parágrafo descreve a memória de trabalho como uma bancada temporária com capacidade estritamente limitada.',
        sourceQuote:
          'Ao contrário do armazenamento de longo prazo, essa bancada possui capacidade estritamente limitada: conseguimos reter apenas alguns blocos de informação simultaneamente por poucos segundos se não houver elaboração ativa.',
      },
      {
        id: 't2-q2',
        prompt:
          'O que acontece quando o fluxo de apresentação das palavras excede o tempo necessário para organizar os blocos na memória de trabalho?',
        options: [
          {
            id: 'a',
            text: 'A compreensão atinge automaticamente cem por cento sem esforço.',
          },
          {
            id: 'b',
            text: 'Ocorre sobrecarga cognitiva e o leitor pode terminar a página sem recordar a tese central.',
          },
          {
            id: 'c',
            text: 'O vocabulário técnico do texto é traduzido para outro idioma.',
          },
          {
            id: 'd',
            text: 'As letras aumentam de tamanho na página para compensar o ritmo.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O segundo parágrafo explica que o excesso de velocidade frente à capacidade de organização gera sobrecarga cognitiva e perda da tese central.',
        sourceQuote:
          'Nessa situação, o leitor pode até pronunciar mentalmente todas as palavras apresentadas, mas chega ao final da página sem recordar a tese central do autor.',
      },
      {
        id: 't2-q3',
        prompt:
          'De que maneira a evocação livre ou a resposta a perguntas logo após a leitura auxilia o aprendizado?',
        options: [
          {
            id: 'a',
            text: 'Apaga as memórias antigas para liberar espaço no dispositivo.',
          },
          {
            id: 'b',
            text: 'Dispensa a leitura dos parágrafos intermediários do documento.',
          },
          {
            id: 'c',
            text: 'Força a recuperação das trilhas recém-formadas e fortalece a transferência para a memória durável.',
          },
          {
            id: 'd',
            text: 'Transforma qualquer texto opinativo em uma fórmula matemática.',
          },
        ],
        correctOptionId: 'c',
        explanation:
          'O quarto parágrafo afirma que resumir ou responder questões força a recuperação ativa e consolida o conteúdo na memória durável.',
        sourceQuote:
          'Dedicar um minuto para resumir com as próprias palavras ou responder a perguntas objetivas sobre o texto força o cérebro a recuperar as trilhas recém-formadas, fortalecendo a transferência do conteúdo para a memória durável.',
      },
      {
        id: 't2-q4',
        prompt:
          'Por que observar isoladamente as palavras por minuto (PPM) é considerado insuficiente pelo texto?',
        options: [
          {
            id: 'a',
            text: 'Porque o cálculo de minutos varia conforme o fuso horário do leitor.',
          },
          {
            id: 'b',
            text: 'Porque a retenção real exige equilibrar a cadência visual com verificações de compreensão e reflexão.',
          },
          {
            id: 'c',
            text: 'Porque textos em língua portuguesa não possuem divisão entre palavras.',
          },
          {
            id: 'd',
            text: 'Porque apenas leituras acima de mil palavras por minuto permitem recordar detalhes.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O último parágrafo conclui que medir só a velocidade é incompleto; o acompanhamento honesto une ritmo e verificação de compreensão.',
        sourceQuote:
          'O acompanhamento honesto combina a observação do ritmo de apresentação com verificações periódicas de compreensão, reconhecendo que a retenção real nasce do equilíbrio entre cadência visual e reflexão.',
      },
    ],
  },
  {
    documentId: 'training-doc-03-ciclos-luz-sono',
    contentVersionId: 'training-cv-03-v1',
    questionSetId: 'training-qs-03-v1',
    version: 1,
    title: 'Treino 3 — Ciclos de Luz Natural, Sono e Clareza Cognitiva',
    subtitle: 'Ritmo circadiano, iluminação de telas e descanso restaurador.',
    rawText: [
      'O desempenho da atenção e da leitura ao longo do dia está intimamente ligado ao ritmo circadiano, o relógio biológico interno de aproximadamente vinte e quatro horas que regula a vigília, a temperatura corporal e a liberação de hormônios. Esse sistema utiliza a luz percebida por células especializadas da retina como principal sinal para sincronizar o organismo com o ambiente externo.',
      'A exposição à luz natural nas primeiras horas da manhã estimula o estado de alerta saudável e ajuda a definir o momento em que a melatonina começará a ser liberada à noite. Por outro lado, o uso prolongado de telas muito brilhantes pouco antes de dormir pode atrasar esse sinal noturno, reduzindo a qualidade do descanso mesmo quando a pessoa permanece deitada por várias horas.',
      'No contexto da leitura em dispositivos eletrônicos, o conforto visual depende do equilíbrio entre o brilho da tela e a iluminação do ambiente ao redor. Ler com a tela clara em um quarto totalmente escuro exige adaptação constante da pupila, enquanto o tema escuro com contraste adequado costuma oferecer maior conforto em ambientes de baixa luminosidade.',
      'Durante o sono profundo e o sono REM, o cérebro executa processos indispensáveis de manutenção e reorganização sináptica. As conexões neurais associadas aos conhecimentos estudados durante o dia são estabilizadas, ao passo que subprodutos metabólicos acumulados na vigília são removidos com maior eficiência.',
      'A hidratação regular e as pequenas pausas posturais entre blocos de leitura também contribuem para preservar a clareza mental ao longo da jornada. Levantar-se por dois minutos, focar objetos distantes para relaxar a musculatura ocular e respirar com calma são medidas simples que previnem a fadiga visual em sessões prolongadas.',
      'Da mesma forma, organizar o hábito de leitura em blocos compatíveis com a rotina diária favorece a constância sem gerar sobrecarga. Vinte minutos de leitura focada e bem compreendida todos os dias constroem um repertório muito mais consistente do que leituras apressadas feitas apenas esporadicamente sob cansaço extremo.',
      'Portanto, sessões curtas e regulares de leitura realizadas em horários de boa disposição mental tendem a render muito mais do que maratonas exaustivas sob privação de sono. Respeitar as pausas de descanso e adequar o ambiente visual são condições práticas que sustentam tanto a nitidez da leitura quanto a consolidação duradoura do aprendizado.',
    ].join('\n\n'),
    questions: [
      {
        id: 't3-q1',
        prompt:
          'Qual é o principal sinal ambiental utilizado pelo relógio biológico interno para sincronizar o organismo?',
        options: [
          {
            id: 'a',
            text: 'A pressão atmosférica medida exclusivamente ao meio-dia.',
          },
          {
            id: 'b',
            text: 'A luz percebida por células especializadas da retina.',
          },
          {
            id: 'c',
            text: 'O volume sonoro das conversas realizadas durante a tarde.',
          },
          {
            id: 'd',
            text: 'A velocidade de digitação no teclado do computador.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O primeiro parágrafo afirma que o sistema circadiano usa a luz captada por células especializadas da retina como sinal primário de sincronização.',
        sourceQuote:
          'Esse sistema utiliza a luz percebida por células especializadas da retina como principal sinal para sincronizar o organismo com o ambiente externo.',
      },
      {
        id: 't3-q2',
        prompt:
          'Segundo o texto, qual efeito o uso prolongado de telas muito brilhantes pouco antes de dormir pode provocar?',
        options: [
          {
            id: 'a',
            text: 'Antecipar o sono profundo em três horas todas as noites.',
          },
          {
            id: 'b',
            text: 'Aumentar permanentemente a acuidade visual no escuro.',
          },
          {
            id: 'c',
            text: 'Atrasar o sinal noturno de melatonina e reduzir a qualidade do descanso.',
          },
          {
            id: 'd',
            text: 'Substituir a necessidade de luz natural nas horas da manhã.',
          },
        ],
        correctOptionId: 'c',
        explanation:
          'O segundo parágrafo explica que telas muito brilhantes antes de dormir podem atrasar o sinal noturno e prejudicar a qualidade do descanso.',
        sourceQuote:
          'Por outro lado, o uso prolongado de telas muito brilhantes pouco antes de dormir pode atrasar esse sinal noturno, reduzindo a qualidade do descanso mesmo quando a pessoa permanece deitada por várias horas.',
      },
      {
        id: 't3-q3',
        prompt:
          'O que ocorre no cérebro durante o sono profundo e o sono REM em relação ao que foi estudado no dia?',
        options: [
          {
            id: 'a',
            text: 'As conexões neurais associadas aos conhecimentos estudados são estabilizadas.',
          },
          {
            id: 'b',
            text: 'Todas as informações lidas em formato digital são descartadas.',
          },
          {
            id: 'c',
            text: 'O cérebro interrompe qualquer atividade sináptica até o despertar.',
          },
          {
            id: 'd',
            text: 'Apenas números e datas são mantidos, apagando os conceitos gerais.',
          },
        ],
        correctOptionId: 'a',
        explanation:
          'O quarto parágrafo aponta que durante o sono profundo e o sono REM as conexões neurais dos conhecimentos estudados são estabilizadas.',
        sourceQuote:
          'As conexões neurais associadas aos conhecimentos estudados durante o dia são estabilizadas, ao passo que subprodutos metabólicos acumulados na vigília são removidos com maior eficiência.',
      },
      {
        id: 't3-q4',
        prompt:
          'No que diz respeito ao conforto visual em dispositivos eletrônicos, o que o texto destaca sobre ambientes de baixa luminosidade?',
        options: [
          {
            id: 'a',
            text: 'Deve-se usar sempre o brilho máximo com fundo branco puro no escuro.',
          },
          {
            id: 'b',
            text: 'O tema escuro com contraste adequado costuma oferecer maior conforto em baixa luminosidade.',
          },
          {
            id: 'c',
            text: 'A iluminação do ambiente não exerce nenhuma influência sobre a pupila.',
          },
          {
            id: 'd',
            text: 'A leitura só é possível se o tamanho da fonte for inferior a 10 pixels.',
          },
        ],
        correctOptionId: 'b',
        explanation:
          'O terceiro parágrafo explica que o conforto depende da harmonia entre tela e ambiente, sendo o tema escuro com bom contraste mais confortável em baixa luz.',
        sourceQuote:
          'Ler com a tela clara em um quarto totalmente escuro exige adaptação constante da pupila, enquanto o tema escuro com contraste adequado costuma oferecer maior conforto em ambientes de baixa luminosidade.',
      },
    ],
  },
];

let cachedBundles: BuiltInTrainingBundle[] | null = null;

/**
 * Constrói e verifica tecnicamente os 3 pacotes de treino originais (FX-09 / AC-19),
 * calculando offsets UTF-16 exatos para cada trecho-fonte sobre o texto normalizado.
 */
export function buildVerifiedTrainingCatalog(): BuiltInTrainingBundle[] {
  if (cachedBundles) {
    return cachedBundles;
  }

  const seedTimestamp = '2026-10-21T12:00:00.000Z';

  const bundles: BuiltInTrainingBundle[] = BUILT_IN_TRAINING_BLUEPRINTS.map(
    (bp) => {
      const norm = normalizeText(bp.rawText);
      const tok = tokenizeNormalizedText(norm.normalizedText, norm.blocks);

      const questions: QuestionItem[] = bp.questions.map((q) => {
        const normalizedQuote = q.sourceQuote.normalize('NFC');
        const startOffset = norm.normalizedText.indexOf(normalizedQuote);
        if (startOffset < 0) {
          throw new Error(
            `Trecho-fonte da questão ${q.id} não encontrado no texto normalizado do treino ${bp.documentId}.`,
          );
        }
        const endOffset = startOffset + normalizedQuote.length;
        return {
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
          sourceQuote: normalizedQuote,
          sourceStartOffset: startOffset,
          sourceEndOffset: endOffset,
        };
      });

      const documentRecord: DocumentRecord = {
        id: bp.documentId,
        title: bp.title,
        format: 'txt',
        sourceHash: `training-sha256-${bp.documentId}-v${bp.version}`,
        contentVersionId: bp.contentVersionId,
        tokenCount: tok.tokens.length,
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp,
        lastOpenedAt: seedTimestamp,
        warnings: [],
        isTraining: true,
      };

      const contentRecord: ContentRecord = {
        id: bp.contentVersionId,
        documentId: bp.documentId,
        normalizationVersion: norm.normalizationVersion,
        tokenizerVersion: tok.tokenizerVersion,
        normalizedText: norm.normalizedText,
        blocks: norm.blocks,
        tokenCount: tok.tokens.length,
        contentHash: `training-content-hash-${bp.contentVersionId}`,
      };

      const questionSetRecord: QuestionSetRecord = {
        id: bp.questionSetId,
        contentVersionId: bp.contentVersionId,
        version: bp.version,
        questions,
        source: 'built-in-training',
        // Jamais marcar human_reviewed por conta própria sem confirmação explícita do usuário (AGENTS.md §6 / AC-19)
        reviewStatus: 'technical_verified_pending_human',
      };

      verifyQuestionSetIntegrity(questionSetRecord, contentRecord);

      return {
        blueprint: bp,
        document: documentRecord,
        content: contentRecord,
        tokens: tok.tokens,
        questionSet: questionSetRecord,
      };
    },
  );

  cachedBundles = bundles;
  return bundles;
}
