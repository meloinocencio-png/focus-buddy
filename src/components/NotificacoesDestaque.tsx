import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notificacao {
  id: string;
  mensagem: string;
  tipo: string;
  criada_em: string;
}

interface NotificacoesDestaqueProps {
  onVerTodas: () => void;
}

const tipoConfig: Record<string, { cor: string; emoji: string }> = {
  aniversario: { cor: "bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 border-pink-200 dark:border-pink-800", emoji: "🎂" },
  compromisso: { cor: "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-blue-200 dark:border-blue-800", emoji: "📅" },
  tarefa: { cor: "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800", emoji: "✅" },
  atrasado: { cor: "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-red-200 dark:border-red-800", emoji: "⚠️" },
  lembrete: { cor: "bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-purple-200 dark:border-purple-800", emoji: "🔔" },
};

export const NotificacoesDestaque = ({ onVerTodas }: NotificacoesDestaqueProps) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotificacoes = async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from("notificacoes")
          .select("*")
          .eq("lida", false)
          .order("criada_em", { ascending: false })
          .limit(3);

        setNotificacoes((data as Notificacao[]) || []);
      } finally {
        setLoading(false);
      }
    };

    fetchNotificacoes();

    // Subscription para atualizações em tempo real
    const channel = supabase
      .channel("notificacoes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
        },
        () => {
          fetchNotificacoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading || notificacoes.length === 0) {
    return null;
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary animate-pulse" />
          <h3 className="text-lg font-semibold">
            ⚠️ Você tem {notificacoes.length} lembrete{notificacoes.length > 1 ? "s" : ""} importante{notificacoes.length > 1 ? "s" : ""}
          </h3>
        </div>
        <Button variant="outline" size="sm" onClick={onVerTodas}>
          Ver todos
        </Button>
      </div>

      <div className="space-y-3">
        {notificacoes.map((notif) => {
          const config = tipoConfig[notif.tipo] || tipoConfig.lembrete;
          return (
            <div
              key={notif.id}
              className={`p-4 rounded-lg border-2 ${config.cor} transition-all hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{config.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{notif.mensagem}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(notif.criada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};