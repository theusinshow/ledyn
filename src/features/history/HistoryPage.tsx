import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SessionRecord } from '@/domain/contracts';
import {
  countUniqueCoveredTokens,
  formatObservedWpm,
} from '@/domain/reading/metrics';
import { listSessionsHistory } from '@/infrastructure/db/repositories';
import { formatDateTimePtBr, formatDurationPtBr } from '@/shared/utils';

export function HistoryPage() {
  const [entries, setEntries] = useState<
    Array<{ session: SessionRecord; documentTitle: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listSessionsHistory()
      .then((rows) => {
        setEntries(rows);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6" data-testid="history-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico Pessoal</h1>
        <p className="text-sm text-muted-foreground">
          Sessões registradas localmente neste dispositivo. Pausas e tempo em segundo plano não entram no tempo ativo.
        </p>
      </div>

      {isLoading ? (
        <div
          role="status"
          className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
        >
          Carregando histórico...
        </div>
      ) : entries.length === 0 ? (
        <Card data-testid="history-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="rounded-full bg-muted p-3">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">
              Suas sessões aparecerão aqui depois que você iniciar uma leitura.
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Nenhum dado simulado é exibido. Inicie uma leitura na Biblioteca para registrar tempo ativo e apresentações.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="history-sessions-list">
          {entries.map(({ session, documentTitle }) => {
            const uniqueTokens = countUniqueCoveredTokens(
              session.coverageRanges,
            );
            return (
              <Card
                key={session.id}
                data-testid={`history-session-${session.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{documentTitle}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          session.status === 'completed'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {session.status === 'completed'
                          ? 'Concluída'
                          : session.status === 'interrupted'
                            ? 'Interrompida'
                            : 'Pausada'}
                      </Badge>
                      <Badge variant="outline">Sem questionário</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    Iniciada em {formatDateTimePtBr(session.startedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-muted-foreground block">
                        Tempo ativo
                      </span>
                      <span className="font-semibold text-sm">
                        {formatDurationPtBr(session.activeMs)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">
                        Apresentações
                      </span>
                      <span className="font-semibold text-sm">
                        {session.presentedCount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">
                        Cobertura única
                      </span>
                      <span className="font-semibold text-sm">
                        {uniqueTokens.toLocaleString('pt-BR')} palavras
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">
                        PPM observada
                      </span>
                      <span className="font-semibold text-sm">
                        {formatObservedWpm(
                          session.presentedCount,
                          session.activeMs,
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
