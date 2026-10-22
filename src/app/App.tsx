import React, { useEffect, useState } from 'react';
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
import { HistoryPage } from '@/features/history/HistoryPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { ReaderPage } from '@/features/reader/ReaderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { QuizPage } from '@/features/training/QuizPage';
import { TrainingPage } from '@/features/training/TrainingPage';
import { ensureDatabaseCompatible } from '@/infrastructure/db/database';
import {
  applyPendingServiceWorkerUpdate,
  subscribeSwStatus,
} from '@/infrastructure/pwa/serviceWorkerManager';
import { toAppError } from '@/shared/errors';
import { cn } from '@/shared/utils';

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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {swUpdateAvailable && (
        <div
          role="status"
          data-testid="pwa-update-banner"
          className="border-b border-primary/40 bg-primary/10 px-4 py-2.5 text-xs"
        >
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Nova versão offline pronta:</strong> nenhuma recarga automática será feita durante a leitura. Quando desejar atualizar, sua posição atual será salva primeiro.
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
      {!isReaderRoute && (
        <header className="border-b border-border bg-card/60 backdrop-blur-xs sticky top-0 z-10">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link
              to="/library"
              className="font-bold text-base tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Leitura Dinâmica Pessoal
            </Link>
            <nav
              aria-label="Navegação principal"
              className="hidden sm:flex items-center gap-1"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-24 sm:pb-10">
        {children}
      </main>

      {/* Barra inferior responsiva para celular */}
      {!isReaderRoute && (
        <nav
          aria-label="Navegação móvel"
          className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card sm:hidden"
        >
          <div className="grid grid-cols-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground',
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
