import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { useAppStore } from '@/application/stores';
import { MAX_GUIDED_DOM_TOKENS } from '@/features/reader/GuidedReadingView';
import { db } from '@/infrastructure/db/database';
import {
  commitPreparedDocument,
  DEFAULT_USER_PREFERENCES,
  listLibraryItems,
  loadUserPreferencesWithDiagnostics,
  preparePastedTextDraft,
  saveUserPreferences,
} from '@/infrastructure/db/repositories';
import {
  createFx12LongText,
  createFx12SyntheticLibraryBatch,
  FX_01_TEXT,
  FX_02_TEXT,
} from '../fixtures/corpus';

describe('Fase F3 — Leitura Guiada, Sessões Robustas, Janela de Texto Longo e Preferências', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useAppStore.getState().clearDraft();
    await db.delete();
    await db.open();
    await useAppStore.getState().hydratePreferences();
  });

  it('AC-12: no token 37, alternar RSVP -> Guiada -> RSVP mantém exatamente contentVersionId + tokenIndex, pausa e não duplica sessão', async () => {
    const user = userEvent.setup();
    // Texto com mais de 50 tokens contendo pontuação e acentos no token 37 (índice 37 = 38ª palavra)
    const words = FX_01_TEXT.split(' ');
    words[37] = 'atenção-crítica!';
    const customText = words.join(' ');

    const draft = await preparePastedTextDraft(customText, 'Doc AC-12 Cursor');
    const savedDoc = await commitPreparedDocument(draft);

    window.history.pushState({}, '', `/reader/${savedDoc.id}`);
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reader-page')).toBeInTheDocument();
    });

    // Posicionar no token de índice 37 (Palavra 38 de 100)
    const slider = screen.getByTestId('rsvp-position-slider');
    fireEvent.change(slider, { target: { value: '37' } });

    await waitFor(() => {
      expect(screen.getByTestId('rsvp-cursor-position')).toHaveTextContent(
        'Palavra 38 de 100',
      );
    });
    expect(screen.getByTestId('rsvp-word-display')).toHaveTextContent(
      'atenção-crítica!',
    );

    // Alternar para Leitura Guiada
    await user.click(screen.getByTestId('mode-switch-guided'));

    await waitFor(() => {
      expect(screen.getByTestId('guided-reading-view')).toBeInTheDocument();
    });
    const activeGuidedToken = screen.getByTestId('guided-active-token');
    expect(activeGuidedToken).toHaveTextContent('atenção-crítica!');
    expect(activeGuidedToken).toHaveAttribute('data-token-index', '37');
    expect(screen.getByTestId('rsvp-cursor-position')).toHaveTextContent(
      'Palavra 38 de 100',
    );
    expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
      'Iniciar',
    );

    // Alternar de volta para RSVP
    await user.click(screen.getByTestId('mode-switch-rsvp'));

    await waitFor(() => {
      expect(screen.getByTestId('rsvp-word-display')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rsvp-word-display')).toHaveTextContent(
      'atenção-crítica!',
    );
    expect(screen.getByTestId('rsvp-cursor-position')).toHaveTextContent(
      'Palavra 38 de 100',
    );

    // Verificar no Dexie que existe exatamente 1 sessão e que o cursor persistido é contentVersionId + tokenIndex = 37
    const sessions = await db.sessions
      .where('documentId')
      .equals(savedDoc.id)
      .toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.cursor).toEqual({
      contentVersionId: savedDoc.contentVersionId,
      tokenIndex: 37,
    });
    expect(sessions[0]!.status).toBe('paused');
  });

  it('AC-13: no modo guiado, clicar em palavra reposiciona pausado sem inflar cobertura e rolagem manual durante reprodução pausa imediatamente', async () => {
    const user = userEvent.setup();
    const draft = await preparePastedTextDraft(FX_02_TEXT, 'Doc AC-13 Guiado');
    const savedDoc = await commitPreparedDocument(draft);

    window.history.pushState({}, '', `/reader/${savedDoc.id}`);
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reader-page')).toBeInTheDocument();
    });

    // Mudar para modo Guiada
    await user.click(screen.getByTestId('mode-switch-guided'));
    await waitFor(() => {
      expect(screen.getByTestId('guided-reading-view')).toBeInTheDocument();
    });

    // Clicar diretamente na palavra de índice 15 enquanto pausado
    const token15 = screen.getByTestId('guided-token-15');
    const token15Text = token15.textContent;
    await user.click(token15);

    await waitFor(() => {
      expect(screen.getByTestId('guided-active-token')).toHaveAttribute(
        'data-token-index',
        '15',
      );
    });
    expect(screen.getByTestId('guided-active-token')).toHaveTextContent(
      token15Text ?? '',
    );

    // Verificar que saltar clicando na palavra NÃO contou tokens 0..14 como apresentados
    const sessionsAfterClick = await db.sessions
      .where('documentId')
      .equals(savedDoc.id)
      .toArray();
    expect(sessionsAfterClick[0]!.presentedCount).toBe(0);
    expect(sessionsAfterClick[0]!.coverageRanges).toEqual([]);

    // Iniciar reprodução no modo guiado e simular rolagem manual (wheel)
    await user.click(screen.getByTestId('rsvp-play-pause-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
        'Pausar',
      );
    });

    const scrollContainer = screen.getByTestId('guided-scroll-container');
    fireEvent.wheel(scrollContainer, { deltaY: 120 });

    // Deve pausar imediatamente e exibir o aviso + botão "Voltar ao ponto de leitura"
    await waitFor(() => {
      expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
        'Iniciar',
      );
    });
    expect(
      screen.getByTestId('manual-scroll-paused-banner'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('guided-return-to-cursor-btn'),
    ).toBeInTheDocument();
  });

  it('AC-14 e AC-29: FX-12 texto longo (5.000 tokens) monta apenas janela limitada no DOM e alterar fonte preserva cursor', async () => {
    const user = userEvent.setup();
    const longText = createFx12LongText(100, 50); // 100 parágrafos x 50 palavras = 5.000 tokens
    const draft = await preparePastedTextDraft(
      longText,
      'FX-12 Texto Longo 5000',
    );
    expect(draft.tokens.length).toBe(5000);
    const savedDoc = await commitPreparedDocument(draft);

    window.history.pushState({}, '', `/reader/${savedDoc.id}`);
    const { container } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reader-page')).toBeInTheDocument();
    });

    // Posicionar no token 42 e mudar para modo Guiada
    fireEvent.change(screen.getByTestId('rsvp-position-slider'), {
      target: { value: '42' },
    });
    await user.click(screen.getByTestId('mode-switch-guided'));

    await waitFor(() => {
      expect(screen.getByTestId('guided-reading-view')).toBeInTheDocument();
    });

    // Verificar que a navegação de janela está visível e que o número de spans de tokens no DOM é <= MAX_GUIDED_DOM_TOKENS
    expect(screen.getByTestId('guided-window-navigation')).toBeInTheDocument();
    const renderedTokenNodes = container.querySelectorAll('[data-token-index]');
    expect(renderedTokenNodes.length).toBeGreaterThan(0);
    expect(renderedTokenNodes.length).toBeLessThanOrEqual(
      MAX_GUIDED_DOM_TOKENS,
    );

    // Aumentar a fonte no modo guiado e verificar que o cursor permanece exatamente no token 42
    expect(screen.getByTestId('guided-font-size-value')).toHaveTextContent(
      '20px',
    );
    await user.click(screen.getByTestId('guided-font-increase-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('guided-font-size-value')).toHaveTextContent(
        '22px',
      );
    });
    expect(screen.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '42',
    );
    expect(screen.getByTestId('rsvp-cursor-position')).toHaveTextContent(
      'Palavra 43 de 5000',
    );
  });

  it('AC-14 e AC-29 (RNF-08): FX-12 biblioteca com 200 metadados consulta em < 2 s e renderiza janela paginada no DOM', async () => {
    const batch = createFx12SyntheticLibraryBatch(200);
    await db.transaction('rw', [db.documents, db.progress], async () => {
      await db.documents.bulkAdd(batch.documents);
      await db.progress.bulkAdd(batch.progress);
    });

    const t0 = performance.now();
    const listed = await listLibraryItems();
    const elapsedMs = performance.now() - t0;

    expect(listed).toHaveLength(200);
    expect(elapsedMs).toBeLessThan(2000);

    window.history.pushState({}, '', '/library');
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('library-total-count')).toHaveTextContent(
        'Exibindo 50 de 200 documentos',
      );
    });

    const renderedCards = screen.getAllByTestId(/^library-item-fx12-doc-/);
    expect(renderedCards).toHaveLength(50);
    expect(screen.getByTestId('library-load-more-btn')).toBeInTheDocument();
  });

  it('AC-30: preferências persistem no Dexie sem usar localStorage e valores salvos inválidos recebem fallback validado com aviso', async () => {
    // 1. Salvar preferências válidas
    const saved = await saveUserPreferences({
      theme: 'dark',
      defaultWpm: 325,
      punctuationPauseEnabled: false,
      guidedFontSizePx: 26,
      reducedMotion: true,
    });

    expect(saved).toEqual({
      theme: 'dark',
      defaultWpm: 325,
      punctuationPauseEnabled: false,
      guidedFontSizePx: 26,
      reducedMotion: true,
      rsvpChunkSize: 1,
      pauseClauseMs: 150,
      pauseSentenceMs: 500,
      pauseParagraphMs: 750,
      resumeRewindEnabled: true,
      showContextTrail: true,
    });
    expect(window.localStorage.length).toBe(0);

    const loadedValid = await loadUserPreferencesWithDiagnostics();
    expect(loadedValid.preferences).toEqual(saved);
    expect(loadedValid.invalidKeys).toEqual([]);
    expect(loadedValid.warningMessage).toBeNull();

    // 2. Corromper diretamente duas chaves no Dexie (defaultWpm fora da faixa 100-800 e guidedFontSizePx inválido)
    await db.settings.put({
      key: 'defaultWpm',
      value: 9999,
      schemaVersion: 1,
    });
    await db.settings.put({
      key: 'guidedFontSizePx',
      value: 4,
      schemaVersion: 1,
    });

    const loadedCorrupted = await loadUserPreferencesWithDiagnostics();
    expect(loadedCorrupted.preferences.defaultWpm).toBe(
      DEFAULT_USER_PREFERENCES.defaultWpm,
    );
    expect(loadedCorrupted.preferences.guidedFontSizePx).toBe(
      DEFAULT_USER_PREFERENCES.guidedFontSizePx,
    );
    expect(loadedCorrupted.preferences.theme).toBe('dark');
    expect(loadedCorrupted.invalidKeys).toEqual([
      'defaultWpm',
      'guidedFontSizePx',
    ]);
    expect(loadedCorrupted.warningMessage).toContain('defaultWpm');

    // 3. Renderizar SettingsPage e verificar exibição do aviso de fallback (AC-30)
    window.history.pushState({}, '', '/settings');
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('settings-invalid-fallback-warning'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('settings-invalid-fallback-warning'),
    ).toHaveTextContent('defaultWpm');
  });
});
