import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function TrainingPage() {
  return (
    <div className="space-y-6" data-testid="training-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Treinos de Compreensão
        </h1>
        <p className="text-sm text-muted-foreground">
          Catálogo local de exercícios com questionários objetivos.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <div className="rounded-full bg-muted p-3">
            <GraduationCap className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">
            Os três textos de treino e questionários objetivos serão entregues na Fase F4.
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            Na Fase F1 atual, utilize a Biblioteca para colar textos reais e praticar leitura em RSVP com persistência e retomada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
