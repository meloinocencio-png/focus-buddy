import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Trophy } from "lucide-react";

interface UserStats {
  dias_seguidos: number;
  melhor_sequencia: number;
  total_concluidos: number;
}

export function StreakBadge() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("usuario_stats")
          .select("dias_seguidos, melhor_sequencia, total_concluidos")
          .eq("usuario_id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Erro ao carregar stats:", error);
        }

        setStats(data);
      } catch (error) {
        console.error("Erro ao carregar stats:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted animate-pulse">
        <div className="h-5 w-5 bg-muted-foreground/20 rounded" />
        <div className="h-4 w-16 bg-muted-foreground/20 rounded" />
      </div>
    );
  }

  // Se não tem stats ainda, não mostra nada ou mostra estado inicial
  if (!stats || stats.total_concluidos === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
        <Flame className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">
            Complete uma tarefa!
          </span>
        </div>
      </div>
    );
  }

  const isOnFire = stats.dias_seguidos >= 3;
  const isNewRecord = stats.dias_seguidos === stats.melhor_sequencia && stats.dias_seguidos > 1;

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
        isOnFire 
          ? "bg-warning/20 border-warning text-warning-foreground" 
          : "bg-muted/50 border-border"
      }`}
    >
      <Flame 
        className={`h-5 w-5 ${
          isOnFire ? "text-warning animate-pulse" : "text-muted-foreground"
        }`} 
      />
      <div className="flex flex-col">
        <span className="text-sm font-bold">
          {stats.dias_seguidos} {stats.dias_seguidos === 1 ? "dia" : "dias"} seguidos
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Trophy className="h-3 w-3" />
          <span>Recorde: {stats.melhor_sequencia}</span>
          {isNewRecord && <span className="text-success ml-1">🏆 Novo!</span>}
        </div>
      </div>
    </div>
  );
}
