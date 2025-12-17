import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { CheckCircle2, Circle, Trophy } from "lucide-react";
import { isToday } from "date-fns";
import { parseUTCDate } from "@/utils/dateUtils";

interface DayStats {
  total: number;
  concluidos: number;
  pendentes: number;
}

export const DayProgressWidget = () => {
  const [stats, setStats] = useState<DayStats>({ total: 0, concluidos: 0, pendentes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTodayStats = async () => {
      try {
        const { data: eventos, error } = await supabase
          .from("eventos")
          .select("data, status")
          .neq("status", "cancelado");

        if (error) throw error;

        // Filtrar eventos de hoje
        const eventosHoje = (eventos || []).filter((e) => 
          isToday(parseUTCDate(e.data))
        );

        const concluidos = eventosHoje.filter((e) => e.status === "concluido").length;
        const total = eventosHoje.length;
        const pendentes = total - concluidos;

        setStats({ total, concluidos, pendentes });
      } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayStats();

    // Realtime para atualizar quando eventos mudam
    const channel = supabase
      .channel("day-progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "eventos" },
        () => fetchTodayStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return null;
  }

  // Não mostrar se não há eventos hoje
  if (stats.total === 0) {
    return null;
  }

  const progressPercent = stats.total > 0 ? (stats.concluidos / stats.total) * 100 : 0;
  const allDone = stats.concluidos === stats.total && stats.total > 0;

  return (
    <Card className={`p-6 ${allDone ? 'bg-gradient-to-r from-success/20 to-success/10 border-success/30' : 'bg-gradient-to-r from-primary/10 to-secondary/10'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {allDone ? (
            <div className="h-12 w-12 rounded-full bg-success/20 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-success" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-lg text-foreground">
              {allDone ? "Parabéns! 🎉" : "Progresso de Hoje"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {allDone 
                ? "Você completou todas as tarefas!" 
                : `${stats.pendentes} pendente${stats.pendentes !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <span className="text-3xl font-bold text-foreground">
            {stats.concluidos}/{stats.total}
          </span>
          <p className="text-sm text-muted-foreground">concluídos</p>
        </div>
      </div>

      <Progress 
        value={progressPercent} 
        className={`h-3 ${allDone ? '[&>div]:bg-success' : ''}`}
      />

      {/* Mini lista de status */}
      <div className="flex items-center gap-4 mt-4 text-sm">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-muted-foreground">{stats.concluidos} feito{stats.concluidos !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Circle className="h-4 w-4 text-warning" />
          <span className="text-muted-foreground">{stats.pendentes} pendente{stats.pendentes !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </Card>
  );
};
