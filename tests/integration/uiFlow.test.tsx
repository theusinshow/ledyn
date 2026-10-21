import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { useAppStore } from '@/application/stores';
import { db } from '@/infrastructure/db/database';

describe('Fluxo Integrado da Interface React em StrictMode (F1)', () => {
  beforeEach(async () => {
    window.history.pushState({}, '', '/library');
    useAppStore.getState().clearDraft();
    await db.delete();
    await db.open();
  });

  it('executa colar texto -> prévia -> salvar -> abrir RSVP -> iniciar -> pausar -> concluir sem duplicar temporizadores no StrictMode', async () => {
    const user = userEvent.setup();

    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    // 1. Estado vazio da biblioteca
    await waitFor(() => {
      expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
    });

    // 2. Abrir formulário de adicionar texto
    await user.click(screen.getByTestId('empty-state-add-text-btn'));

    // Espaços em branco não habilitam o botão de preparar
    const textarea = screen.getByTestId('paste-content-textarea');
    const prepareBtn = screen.getByTestId('prepare-text-btn');
    expect(prepareBtn).toBeDisabled();

    await user.type(textarea, '   ');
    expect(prepareBtn).toBeDisabled();

    await user.clear(textarea);
    await user.type(
      screen.getByTestId('paste-title-input'),
      'Treino Curto F1',
    );
    await user.type(textarea, 'Primeira segunda terceira quarta quinta.');
    expect(prepareBtn).toBeEnabled();

    // 3. Preparar prévia
    await user.click(prepareBtn);

    await waitFor(() => {
      expect(screen.getByTestId('import-preview-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-token-count')).toHaveTextContent('5');
    expect(screen.getByTestId('preview-block-count')).toHaveTextContent('1');

    // 4. Confirmar salvamento e abrir leitor RSVP pausado
    await user.click(screen.getByTestId('confirm-save-open-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reader-page')).toBeInTheDocument();
    });

    expect(screen.getByTestId('reader-document-title')).toHaveTextContent(
      'Treino Curto F1',
    );
    expect(screen.getByTestId('rsvp-word-display')).toHaveTextContent(
      'Primeira',
    );
    expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
      'Iniciar',
    );

    // 5. Ajustar velocidade para 600 PPM (100 ms por palavra)
    const wpmInput = screen.getByTestId('rsvp-wpm-input');
    await user.clear(wpmInput);
    await user.type(wpmInput, '600');

    // 6. Iniciar (aguarda aquisição assíncrona do lease no Dexie) e pausar
    await user.click(screen.getByTestId('rsvp-play-pause-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
        'Pausar',
      );
    });

    await user.click(screen.getByTestId('rsvp-play-pause-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rsvp-play-pause-btn')).toHaveTextContent(
        'Iniciar',
      );
    });

    // 7. Retomar até concluir as 5 palavras
    await user.click(screen.getByTestId('rsvp-play-pause-btn'));

    await waitFor(
      () => {
        expect(
          screen.getByTestId('reader-completed-summary'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(screen.getByTestId('summary-presented-count')).toHaveTextContent(
      '5',
    );
  });
});
