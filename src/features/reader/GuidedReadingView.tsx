import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Info,
  Minus,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContentBlock, Token } from '@/domain/contracts';
import {
  MAX_GUIDED_FONT_SIZE_PX,
  MIN_GUIDED_FONT_SIZE_PX,
} from '@/infrastructure/db/repositories';
import { cn } from '@/shared/utils';

/**
 * Limite máximo de tokens montados simultaneamente no DOM no modo guiado (ARCHITECTURE.md 7 / AC-14).
 * Garante fluidez mesmo em documentos de até 200.000 tokens (FX-12).
 */
export const MAX_GUIDED_DOM_TOKENS = 1_200;

export interface GuidedReadingViewProps {
  normalizedText: string;
  blocks: ContentBlock[];
  tokens: Token[];
  activeTokenIndex: number;
  isPlaying: boolean;
  fontSizePx: number;
  reducedMotion: boolean;
  onSelectToken: (tokenIndex: number) => void;
  onManualScrollPause: () => void;
  onChangeFontSize: (newSizePx: number) => void;
}

interface IndexedBlock {
  block: ContentBlock;
  blockArrayIndex: number;
  tokens: Token[];
  firstTokenIndex: number;
  lastTokenIndex: number;
}

export function GuidedReadingView({
  normalizedText,
  blocks,
  tokens,
  activeTokenIndex,
  isPlaying,
  fontSizePx,
  reducedMotion,
  onSelectToken,
  onManualScrollPause,
  onChangeFontSize,
}: GuidedReadingViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTokenRef = useRef<HTMLSpanElement | null>(null);

  const programmaticScrollUntilRef = useRef<number>(0);
  const lastProgrammaticScrollTopRef = useRef<number>(0);
  const userGestureActiveRef = useRef<boolean>(false);

  const [manualWindowStartBlock, setManualWindowStartBlock] = useState<
    number | null
  >(null);
  const [isDetachedFromCursor, setIsDetachedFromCursor] = useState(false);

  // Agrupa tokens por bloco uma única vez por documento
  const indexedBlocks = useMemo<IndexedBlock[]>(() => {
    if (blocks.length === 0) {
      return [];
    }
    const byBlockId = new Map<string, Token[]>();
    for (const token of tokens) {
      let list = byBlockId.get(token.blockId);
      if (!list) {
        list = [];
        byBlockId.set(token.blockId, list);
      }
      list.push(token);
    }

    return blocks.map((block, idx) => {
      const blockTokens = byBlockId.get(block.id) ?? [];
      const firstTokenIndex =
        blockTokens.length > 0 ? blockTokens[0]!.index : -1;
      const lastTokenIndex =
        blockTokens.length > 0
          ? blockTokens[blockTokens.length - 1]!.index
          : -1;
      return {
        block,
        blockArrayIndex: idx,
        tokens: blockTokens,
        firstTokenIndex,
        lastTokenIndex,
      };
    });
  }, [blocks, tokens]);

  // Identifica o bloco que contém o token ativo atual
  const activeBlockArrayIndex = useMemo<number>(() => {
    if (indexedBlocks.length === 0) return 0;
    const clampedTokenIdx = Math.max(
      0,
      Math.min(Math.max(0, tokens.length - 1), activeTokenIndex),
    );
    const activeToken = tokens[clampedTokenIdx];
    if (activeToken) {
      const foundIdx = indexedBlocks.findIndex(
        (b) => b.block.id === activeToken.blockId,
      );
      if (foundIdx >= 0) {
        return foundIdx;
      }
    }
    return 0;
  }, [indexedBlocks, tokens, activeTokenIndex]);

  // Quando reproduzindo ou quando o cursor muda, sincroniza a janela de blocos com o bloco ativo
  const effectiveAnchorBlockIndex =
    isPlaying || manualWindowStartBlock === null
      ? activeBlockArrayIndex
      : manualWindowStartBlock;

  // Calcula janela limitada de blocos para nunca exceder MAX_GUIDED_DOM_TOKENS no DOM
  const windowSlice = useMemo(() => {
    if (indexedBlocks.length === 0) {
      return {
        items: [] as IndexedBlock[],
        startBlockIdx: 0,
        endBlockIdx: 0,
        isWindowed: false,
      };
    }

    if (tokens.length <= MAX_GUIDED_DOM_TOKENS) {
      return {
        items: indexedBlocks,
        startBlockIdx: 0,
        endBlockIdx: indexedBlocks.length - 1,
        isWindowed: false,
      };
    }

    const centerIdx = Math.max(
      0,
      Math.min(indexedBlocks.length - 1, effectiveAnchorBlockIndex),
    );
    let startIdx = centerIdx;
    let endIdx = centerIdx;
    let accumulatedTokens = indexedBlocks[centerIdx]?.tokens.length ?? 0;

    // Expande alguns blocos antes para contexto imediato e mais blocos adiante
    while (
      (startIdx > 0 || endIdx < indexedBlocks.length - 1) &&
      accumulatedTokens < MAX_GUIDED_DOM_TOKENS
    ) {
      let progressed = false;
      if (startIdx > Math.max(0, centerIdx - 4)) {
        const prevCount = indexedBlocks[startIdx - 1]?.tokens.length ?? 0;
        if (accumulatedTokens + prevCount <= MAX_GUIDED_DOM_TOKENS) {
          startIdx--;
          accumulatedTokens += prevCount;
          progressed = true;
        }
      }
      if (endIdx < indexedBlocks.length - 1) {
        const nextCount = indexedBlocks[endIdx + 1]?.tokens.length ?? 0;
        if (accumulatedTokens + nextCount <= MAX_GUIDED_DOM_TOKENS) {
          endIdx++;
          accumulatedTokens += nextCount;
          progressed = true;
        }
      }
      if (!progressed && startIdx > 0) {
        const prevCount = indexedBlocks[startIdx - 1]?.tokens.length ?? 0;
        if (accumulatedTokens + prevCount <= MAX_GUIDED_DOM_TOKENS) {
          startIdx--;
          accumulatedTokens += prevCount;
          progressed = true;
        }
      }
      if (!progressed) {
        break;
      }
    }

    return {
      items: indexedBlocks.slice(startIdx, endIdx + 1),
      startBlockIdx: startIdx,
      endBlockIdx: endIdx,
      isWindowed: startIdx > 0 || endIdx < indexedBlocks.length - 1,
    };
  }, [indexedBlocks, tokens.length, effectiveAnchorBlockIndex]);

  const scrollActiveTokenIntoView = useCallback(
    (forceCenter: boolean = false) => {
      const container = scrollContainerRef.current;
      const tokenEl = activeTokenRef.current;
      if (!container || !tokenEl) {
        return;
      }

      const containerHeight = container.clientHeight;
      if (containerHeight <= 0) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const tokenRect = tokenEl.getBoundingClientRect();
      const relativeTop =
        tokenRect.top - containerRect.top + container.scrollTop;
      const tokenBottom = relativeTop + tokenRect.height;

      const visibleTop = container.scrollTop;
      const visibleBottom = visibleTop + containerHeight;
      const topPadding = Math.min(56, containerHeight * 0.2);
      const bottomPadding = Math.min(80, containerHeight * 0.28);

      const isOutOfComfortZone =
        relativeTop < visibleTop + topPadding ||
        tokenBottom > visibleBottom - bottomPadding;

      if (forceCenter || isOutOfComfortZone) {
        const targetScrollTop = Math.max(
          0,
          Math.round(relativeTop - containerHeight * 0.32),
        );

        programmaticScrollUntilRef.current = performance.now() + 260;
        lastProgrammaticScrollTopRef.current = targetScrollTop;

        if (reducedMotion || isPlaying) {
          container.scrollTop = targetScrollTop;
        } else if (typeof container.scrollTo === 'function') {
          container.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
          });
        } else {
          container.scrollTop = targetScrollTop;
        }
      }
    },
    [reducedMotion, isPlaying],
  );

  // Mantém o token ativo visível quando o cursor avança (sem disputar com rolagem manual)
  useEffect(() => {
    if (isPlaying) {
      scrollActiveTokenIntoView(false);
    }
  }, [activeTokenIndex, isPlaying, scrollActiveTokenIntoView]);

  // Centraliza o token ao montar ou redimensionar/mudar fonte preservando o cursor (AC-14)
  useEffect(() => {
    scrollActiveTokenIntoView(false);
  }, [fontSizePx, scrollActiveTokenIntoView]);

  const triggerManualScrollPause = useCallback(() => {
    setIsDetachedFromCursor(true);
    if (isPlaying) {
      onManualScrollPause();
    }
  }, [isPlaying, onManualScrollPause]);

  const handleContainerScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const now = performance.now();
    if (now <= programmaticScrollUntilRef.current && !userGestureActiveRef.current) {
      return;
    }

    const deltaFromProgrammatic = Math.abs(
      container.scrollTop - lastProgrammaticScrollTopRef.current,
    );
    if (userGestureActiveRef.current || deltaFromProgrammatic > 10) {
      userGestureActiveRef.current = false;
      triggerManualScrollPause();
    }
  };

  const handleReturnToReadingPoint = () => {
    setManualWindowStartBlock(null);
    setIsDetachedFromCursor(false);
    window.requestAnimationFrame(() => {
      scrollActiveTokenIntoView(true);
    });
  };

  const handleTokenClick = (tokenIndex: number) => {
    setManualWindowStartBlock(null);
    setIsDetachedFromCursor(false);
    onSelectToken(tokenIndex);
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key === 'PageDown' ||
      e.key === 'PageUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp'
    ) {
      userGestureActiveRef.current = true;
      triggerManualScrollPause();
    }
  };

  return (
    <div className="space-y-3" data-testid="guided-reading-view">
      {/* Barra de ferramentas contextual do modo guiado */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
        <div
          className="flex items-center gap-1.5 text-muted-foreground"
          data-testid="guided-extraction-notice"
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Texto extraído; formatação do original não preservada. Clique em qualquer palavra para posicionar o cursor pausado.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Ajuste rápido de tamanho de fonte no modo guiado (16-32 px) */}
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
            <span className="text-muted-foreground px-1">Fonte:</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Diminuir fonte do texto guiado"
              disabled={fontSizePx <= MIN_GUIDED_FONT_SIZE_PX}
              onClick={() =>
                onChangeFontSize(
                  Math.max(MIN_GUIDED_FONT_SIZE_PX, fontSizePx - 2),
                )
              }
              data-testid="guided-font-decrease-btn"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span
              className="font-mono font-semibold min-w-[38px] text-center"
              data-testid="guided-font-size-value"
            >
              {fontSizePx}px
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Aumentar fonte do texto guiado"
              disabled={fontSizePx >= MAX_GUIDED_FONT_SIZE_PX}
              onClick={() =>
                onChangeFontSize(
                  Math.min(MAX_GUIDED_FONT_SIZE_PX, fontSizePx + 2),
                )
              }
              data-testid="guided-font-increase-btn"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {(isDetachedFromCursor ||
            (manualWindowStartBlock !== null &&
              manualWindowStartBlock !== activeBlockArrayIndex)) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleReturnToReadingPoint}
              data-testid="guided-return-to-cursor-btn"
              className="h-8 text-xs"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar ao ponto de leitura
            </Button>
          )}
        </div>
      </div>

      {/* Navegação acessível de janela de blocos para textos longos (AC-14) */}
      {windowSlice.isWindowed && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
          data-testid="guided-window-navigation"
        >
          <span
            className="text-muted-foreground"
            data-testid="guided-window-range-label"
          >
            Exibindo parágrafos {windowSlice.startBlockIdx + 1} a{' '}
            {windowSlice.endBlockIdx + 1} de {indexedBlocks.length} (janela otimizada para leitura fluida)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={windowSlice.startBlockIdx <= 0}
              onClick={() => {
                if (isPlaying) {
                  onManualScrollPause();
                }
                setManualWindowStartBlock(
                  Math.max(0, windowSlice.startBlockIdx - 6),
                );
              }}
              data-testid="guided-prev-window-btn"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Parágrafos anteriores
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={windowSlice.endBlockIdx >= indexedBlocks.length - 1}
              onClick={() => {
                if (isPlaying) {
                  onManualScrollPause();
                }
                setManualWindowStartBlock(
                  Math.min(
                    indexedBlocks.length - 1,
                    windowSlice.endBlockIdx + 1,
                  ),
                );
              }}
              data-testid="guided-next-window-btn"
            >
              Próximos parágrafos
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Área de leitura em contexto com rolagem monitorada */}
      <div
        ref={scrollContainerRef}
        data-testid="guided-scroll-container"
        tabIndex={0}
        role="region"
        aria-label="Texto em leitura guiada"
        onWheel={() => {
          userGestureActiveRef.current = true;
          triggerManualScrollPause();
        }}
        onTouchMove={() => {
          userGestureActiveRef.current = true;
          triggerManualScrollPause();
        }}
        onKeyDown={handleContainerKeyDown}
        onScroll={handleContainerScroll}
        style={{ fontSize: `${fontSizePx}px` }}
        className="max-h-[380px] sm:max-h-[440px] overflow-y-auto rounded-xl border border-border bg-muted/15 px-4 py-6 sm:px-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="mx-auto max-w-[65ch] space-y-4 leading-relaxed break-words">
          {windowSlice.items.map(({ block, tokens: blockTokens }) => {
            if (blockTokens.length === 0) {
              return (
                <p key={block.id} className="text-foreground/90">
                  {normalizedText.slice(block.startOffset, block.endOffset)}
                </p>
              );
            }

            let cursorOffset = block.startOffset;
            const elements: React.ReactNode[] = [];

            for (const token of blockTokens) {
              if (token.start > cursorOffset) {
                elements.push(
                  <React.Fragment key={`sep-${token.index}`}>
                    {normalizedText.slice(cursorOffset, token.start)}
                  </React.Fragment>,
                );
              }

              const isActive = token.index === activeTokenIndex;
              elements.push(
                <span
                  key={token.index}
                  ref={isActive ? activeTokenRef : undefined}
                  role="button"
                  tabIndex={isActive ? 0 : -1}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Palavra ${token.index + 1}: ${token.text}`}
                  data-testid={
                    isActive
                      ? 'guided-active-token'
                      : `guided-token-${token.index}`
                  }
                  data-token-index={token.index}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => handleTokenClick(token.index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTokenClick(token.index);
                    }
                  }}
                  className={cn(
                    'inline rounded-xs px-0.5 transition-none cursor-pointer select-text',
                    isActive
                      ? 'bg-primary text-primary-foreground font-bold underline decoration-2 underline-offset-4 ring-2 ring-primary/80'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {token.text}
                </span>,
              );

              cursorOffset = token.end;
            }

            if (cursorOffset < block.endOffset) {
              elements.push(
                <React.Fragment key={`tail-${block.id}`}>
                  {normalizedText.slice(cursorOffset, block.endOffset)}
                </React.Fragment>,
              );
            }

            return (
              <p
                key={block.id}
                data-testid={`guided-block-${block.index}`}
                className="text-foreground/90"
              >
                {elements}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
