import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  GraduationCap,
  History,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useAppStore } from '@/application/stores';
import { Button } from '@/components/ui/button';
import { ensureDatabaseCompatible } from '@/infrastructure/db/database';
import {
  applyPendingServiceWorkerUpdate,
  subscribeSwStatus,
} from '@/infrastructure/pwa/serviceWorkerManager';
import { toAppError } from '@/shared/errors';
import { cn } from '@/shared/utils';

// Telas carregadas por rota: o primeiro carregamento traz só o shell e a tela aberta.
// Todos os chunks continuam no precache do service worker (funciona offline).
const LibraryPage = lazy(() =>
  import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const ReaderPage = lazy(() =>
  import('@/features/reader/ReaderPage').then((m) => ({ default: m.ReaderPage })),
);
const TrainingPage = lazy(() =>
  import('@/features/training/TrainingPage').then((m) => ({ default: m.TrainingPage })),
);
const QuizPage = lazy(() =>
  import('@/features/training/QuizPage').then((m) => ({ default: m.QuizPage })),
);
const HistoryPage = lazy(() =>
  import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const appErr = toAppError(error);
    return { hasError: true, message: appErr.userMessage };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
          <div
            role="alert"
            className="max-w-md w-full rounded-xl border border-destructive bg-card p-6 space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <h1 className="font-bold text-lg">
                Ocorreu um erro inesperado na interface
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Seus dados locais no IndexedDB foram preservados. Detalhe:{' '}
              {this.state.message}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.assign('/library');
              }}
            >
              Voltar à Biblioteca
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function NavigationShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isReaderRoute = location.pathname.startsWith('/reader/');
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);

  useEffect(() => {
    return subscribeSwStatus((state) => {
      setSwUpdateAvailable(state.updateAvailable);
    });
  }, []);

  const navItems = [
    { to: '/library', label: 'Biblioteca', icon: BookOpen },
    { to: '/training', label: 'Treinos', icon: GraduationCap },
    { to: '/history', label: 'Histórico', icon: History },
    { to: '/settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen text-foreground">
      {swUpdateAvailable && (
        <div
          role="status"
          data-testid="pwa-update-banner"
          className="sticky top-0 z-30 border-b border-primary/25 bg-primary/10 px-4 py-2 text-xs backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-foreground/90">
              <strong className="font-semibold">Nova versão offline pronta:</strong> nenhuma recarga automática será feita durante a leitura. Quando desejar atualizar, sua posição atual será salva primeiro.
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => void applyPendingServiceWorkerUpdate()}
              data-testid="pwa-apply-update-btn"
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Pausar, salvar e atualizar
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        {!isReaderRoute && (
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-4 backdrop-blur-sm sm:flex">
            <Link
              to="/library"
              className="mb-6 flex items-center gap-2.5 rounded-md px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark />
              <span className="flex flex-col leading-none">
                <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                  Ledyn
                </span>
                <span className="mt-1 text-[0.6875rem] text-subtle-foreground">
                  Leitura Dinâmica Pessoal
                </span>
              </span>
            </Link>

            <p className="eyebrow mb-2 px-2">Espaço de leitura</p>
            <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex min-h-9 items-center gap-2.5 rounded-md px-2 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        active ? 'text-primary' : 'text-subtle-foreground group-hover:text-muted-foreground',
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-border bg-surface-sunken/60 p-3">
              <p className="eyebrow mb-1">Local-first</p>
              <p className="text-[0.71875rem] leading-relaxed text-muted-foreground">
                Tudo fica neste navegador. Sem conta, sem rede.
              </p>
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {!isReaderRoute && (
            <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:hidden">
              <BrandMark />
              <Link to="/library" className="text-[0.8125rem] font-semibold">
                Ledyn
              </Link>
            </header>
          )}

          <main
            className={cn(
              'mx-auto w-full flex-1 px-4 py-6 pb-24 animate-fade-up sm:px-8 sm:py-10 sm:pb-12',
              isReaderRoute
                ? 'max-w-6xl 2xl:max-w-[90rem]'
                : 'max-w-4xl xl:max-w-5xl 2xl:max-w-6xl',
            )}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Barra inferior responsiva para celular */}
      {!isReaderRoute && (
        <nav
          aria-label="Navegação móvel"
          className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/90 backdrop-blur-md sm:hidden"
        >
          <div className="grid grid-cols-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Marca: três barras em fade — palavra em foco saindo da linha de leitura. */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-b from-primary to-primary/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-primary-foreground">
        <rect x="2" y="7" width="3" height="2" rx="1" fill="currentColor" opacity="0.45" />
        <rect x="6.5" y="4.5" width="3" height="7" rx="1.5" fill="currentColor" />
        <rect x="11" y="7" width="3" height="2" rx="1" fill="currentColor" opacity="0.45" />
      </svg>
    </span>
  );
}

export function AppContent() {
  const { preferences, hydratePreferences } = useAppStore();
  const [dbCompatError, setDbCompatError] = useState<string | null>(null);

  useEffect(() => {
    ensureDatabaseCompatible()
      .then(() => hydratePreferences())
      .catch((err) => {
        const appErr = toAppError(err);
        setDbCompatError(appErr.userMessage);
      });
  }, [hydratePreferences]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const prefersDark =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark =
        preferences.theme === 'dark' ||
        (preferences.theme === 'system' && prefersDark);
      root.classList.toggle('dark', isDark);
    };

    applyTheme();
    if (
      preferences.theme === 'system' &&
      typeof window.matchMedia === 'function'
    ) {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', applyTheme);
      return () => mql.removeEventListener('change', applyTheme);
    }
    return undefined;
  }, [preferences.theme]);

  useEffect(() => {
    const root = document.documentElement;
    const applyReducedMotion = () => {
      const prefersReduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isReduced = preferences.reducedMotion || prefersReduced;
      root.dataset.reducedMotion = isReduced ? 'true' : 'false';
    };

    applyReducedMotion();
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', applyReducedMotion);
      return () => mql.removeEventListener('change', applyReducedMotion);
    }
    return undefined;
  }, [preferences.reducedMotion]);

  if (dbCompatError) {
    return (
      <div
        role="alert"
        data-testid="db-incompatible-screen"
        className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
      >
        <div className="max-w-md w-full rounded-xl border border-destructive bg-card p-6 space-y-3">
          <h1 className="font-bold text-lg text-destructive">
            Armazenamento Local Incompatível
          </h1>
          <p className="text-sm text-muted-foreground">{dbCompatError}</p>
          <p className="text-xs text-muted-foreground">
            Nenhum dado existente foi apagado ou sobrescrito.
          </p>
        </div>
      </div>
    );
  }

  return (
    <NavigationShell>
      <Suspense fallback={<div className="py-16 text-center text-xs text-subtle-foreground" role="status">Carregando…</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/reader/:documentId" element={<ReaderPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/quiz/:attemptId" element={<QuizPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
      </Suspense>
    </NavigationShell>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
