import { expect, test } from '@playwright/test';

test.describe('F4 E2E — Treinos de Compreensão, Quiz, Reflexão e Histórico (AC-19 a AC-23)', () => {
  test('AC-19, AC-20, AC-21: navega aos treinos, conclui leitura, preserva rascunho de quiz após reload, valida envio incompleto e registra 3/4 (75%) com evidências', async ({
    page,
  }) => {
    await page.goto('/training');
    await expect(page.getByTestId('training-page')).toBeVisible();
    await expect(
      page.getByTestId('training-review-status-banner'),
    ).toContainText('Material de treino aguardando conferência do usuário');

    // Abre painel de conferência transparente de gabaritos (AC-19)
    await page.getByTestId('toggle-inspect-gabaritos-btn').click();
    await expect(
      page.getByTestId('training-gabarito-inspection-panel'),
    ).toBeVisible();

    const docId = 'training-doc-01-atencao-ritmo';
    await expect(page.getByTestId(`training-card-${docId}`)).toBeVisible();

    // Inicia treino 1
    await page.getByTestId(`start-training-btn-${docId}`).click();
    await expect(page.getByTestId('rsvp-play-pause-btn')).toBeVisible();

    // Posiciona na última palavra e conclui a leitura
    const slider = page.getByTestId('rsvp-position-slider');
    const maxVal = await slider.getAttribute('max');
    expect(Number(maxVal)).toBeGreaterThan(300);
    await slider.fill(String(maxVal));
    await page.getByTestId('rsvp-play-pause-btn').click();

    await expect(page.getByTestId('reader-completed-summary')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('summary-quiz-available-box')).toBeVisible();

    // Abre questionário
    await page.getByTestId('summary-start-quiz-btn').click();
    await expect(page.getByTestId('quiz-page')).toBeVisible();
    await expect(page.getByTestId('quiz-review-status-badge')).toBeVisible();

    // Seleciona apenas 2 alternativas corretas (t1-q1: b, t1-q2: a)
    await page.getByTestId('quiz-option-t1-q1-b').click();
    await page.getByTestId('quiz-option-t1-q2-a').click();
    await expect(page.getByTestId('quiz-answered-progress')).toContainText(
      '2 de 4 respondidas',
    );

    // Recarrega a página durante o rascunho (AC-21)
    await page.reload();
    await expect(page.getByTestId('quiz-page')).toBeVisible();
    await expect(page.getByTestId('quiz-option-t1-q1-b')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('quiz-option-t1-q2-a')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Gabarito não pode estar revelado durante rascunho
    await expect(page.getByTestId('quiz-result-view')).toHaveCount(0);

    // Tenta enviar incompleto -> exibe alerta indicando questões 3 e 4 (AC-20)
    await page.getByTestId('submit-quiz-btn').click();
    await expect(page.getByTestId('quiz-incomplete-alert')).toContainText(
      'Questão 3, Questão 4',
    );

    // Responde Q3 correta (b) e Q4 incorreta (a em vez de c) -> 3/4 (75%)
    await page.getByTestId('quiz-option-t1-q3-b').click();
    await page.getByTestId('quiz-option-t1-q4-a').click();
    await page.getByTestId('submit-quiz-btn').click();

    await expect(page.getByTestId('quiz-result-view')).toBeVisible();
    await expect(page.getByTestId('quiz-result-score')).toContainText(
      '3/4 · 75%',
    );
    await expect(page.getByTestId('quiz-explanation-t1-q1')).toBeVisible();
    await expect(page.getByTestId('quiz-source-quote-t1-q1')).toBeVisible();

    // Volta aos treinos e verifica badge de já praticado e último resultado
    await page.getByTestId('quiz-to-training-btn').click();
    await expect(
      page.getByTestId(`training-practiced-badge-${docId}`),
    ).toContainText('Texto já praticado');
    await expect(
      page.getByTestId(`training-latest-attempt-${docId}`),
    ).toContainText('3/4 · 75%');
  });

  test('AC-22 & AC-23: texto pessoal importado sem quiz registra reflexão sem nota e histórico filtra sessões com e sem questionário', async ({
    page,
  }) => {
    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();

    // Importa texto colado pessoal
    await page
      .getByTestId('paste-title-input')
      .fill('Notas Pessoais de Estudo');
    await page
      .getByTestId('paste-content-textarea')
      .fill(
        'A prática consistente de leitura exige atenção ao significado das frases e pausas breves em sinais de pontuação.',
      );
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-open-btn').click();

    await expect(page.getByTestId('rsvp-play-pause-btn')).toBeVisible();

    // Avança até o fim e conclui
    const slider = page.getByTestId('rsvp-position-slider');
    const maxVal = await slider.getAttribute('max');
    await slider.fill(String(maxVal));
    await page.getByTestId('rsvp-play-pause-btn').click();

    await expect(page.getByTestId('reader-completed-summary')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('summary-no-quiz-box')).toBeVisible();
    await expect(page.getByTestId('summary-no-quiz-badge')).toContainText(
      'Este texto não possui questionário',
    );

    // Registra reflexão sem nota (AC-22)
    await page.getByTestId('toggle-reflection-btn').click();
    await page
      .getByTestId('reflection-textarea')
      .fill('Síntese sobre ritmo e atenção às pausas de pontuação.');
    await page.getByTestId('save-reflection-btn').click();
    await expect(page.getByTestId('reflection-saved-banner')).toBeVisible();

    // Abre o Histórico e verifica a sessão sem questionário e os filtros (AC-23)
    await page.getByTestId('summary-to-library-btn').click();
    await page.getByRole('link', { name: 'Histórico' }).first().click();
    await expect(page.getByTestId('history-page')).toBeVisible();
    await expect(page.getByTestId('history-sessions-list')).toContainText(
      'Notas Pessoais de Estudo',
    );
    await expect(page.getByTestId('history-sessions-list')).toContainText(
      'Sem questionário',
    );
    await expect(page.getByTestId('history-sessions-list')).toContainText(
      'Síntese sobre ritmo e atenção às pausas de pontuação.',
    );

    // Filtra por "Com questionário enviado" -> deve exibir lista filtrada vazia
    await page.getByTestId('history-filter-quiz').selectOption('with_quiz');
    await expect(page.getByTestId('history-filtered-empty')).toBeVisible();

    // Filtra por "Sem questionário enviado" -> volta a exibir a sessão pessoal
    await page.getByTestId('history-filter-quiz').selectOption('without_quiz');
    await expect(page.getByTestId('history-sessions-list')).toContainText(
      'Notas Pessoais de Estudo',
    );
  });
});
