import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Trash2, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface Notificacao {
  id: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  criada_em: string;
}

interface CentroNotificacoesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCountChange?: (count: number) => void;
}

const tipoConfig: Record<string, { cor: string; emoji: string }> = {
  aniversario: { cor: "bg-pink-100 dark:bg-pink-950 border-pink-300 dark:border-pink-700", emoji: "🎂" },
  compromisso: { cor: "bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700", emoji: "📅" },
  tarefa: { cor: "bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-700", emoji: "✅" },
  atrasado: { cor: "bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-700", emoji: "⚠️" },
  lembrete: { cor: "bg-purple-100 dark:bg-purple-950 border-purple-300 dark:border-purple-700", emoji: "🔔" },
  resumo: { cor: "bg-yellow-100 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700", emoji: "📊" },
};

export const CentroNotificacoes = ({ open, onOpenChange, onCountChange }: CentroNotificacoesProps) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotificacoes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .order("criada_em", { ascending: false });

      if (error) throw error;
      
      const notifs = (data as Notificacao[]) || [];
      setNotificacoes(notifs);
      
      // Contar não lidas
      const naoLidas = notifs.filter(n => !n.lida).length;
      onCountChange?.(naoLidas);
    } catch (error) {
      console.error("Erro ao buscar notificações:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchNotificacoes();
    }
  }, [open]);

  const marcarComoLida = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", id);

      if (error) throw error;
      
      fetchNotificacoes();
      toast.success("Notificação marcada como lida");
    } catch (error) {
      console.error("Erro ao marcar como lida:", error);
      toast.error("Erro ao atualizar notificação");
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("lida", false);

      if (error) throw error;
      
      fetchNotificacoes();
      toast.success("Todas as notificações marcadas como lidas");
    } catch (error) {
      console.error("Erro ao marcar todas como lidas:", error);
      toast.error("Erro ao atualizar notificações");
    }
  };

  const limparLidas = async () => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .delete()
        .eq("lida", true);

      if (error) throw error;
      
      fetchNotificacoes();
      toast.success("Notificações lidas removidas");
    } catch (error) {
      console.error("Erro ao limpar notificações:", error);
      toast.error("Erro ao remover notificações");
    }
  };

  const agruparPorData = (notifs: Notificacao[]) => {
    const grupos: Record<string, Notificacao[]> = {};
    
    notifs.forEach(notif => {
      const data = format(new Date(notif.criada_em), "dd/MM/yyyy", { locale: ptBR });
      if (!grupos[data]) {
        grupos[data] = [];
      }
      grupos[data].push(notif);
    });
    
    return grupos;
  };

  const gruposNotificacoes = agruparPorData(notificacoes);
  const naoLidas = notificacoes.filter(n => !n.lida).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>🔔 Notificações</span>
            {naoLidas > 0 && (
              <Badge variant="destructive" className="ml-2">
                {naoLidas}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-2 mt-4 mb-4">
          {naoLidas > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={marcarTodasComoLidas}
              className="flex-1"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Marcar todas
            </Button>
          )}
          {notificacoes.some(n => n.lida) && (
            <Button
              variant="outline"
              size="sm"
              onClick={limparLidas}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar lidas
            </Button>
          )}
        </div>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : notificacoes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">🎉 Nenhuma notificação</p>
              <p className="text-sm mt-2">Você está em dia!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(gruposNotificacoes).map(([data, notifs]) => (
                <div key={data}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                    {data}
                  </h3>
                  <div className="space-y-2">
                    {notifs.map((notif) => {
                      const config = tipoConfig[notif.tipo] || tipoConfig.lembrete;
                      return (
                        <div
                          key={notif.id}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            notif.lida 
                              ? "bg-muted/50 border-muted opacity-60" 
                              : `${config.cor} shadow-sm`
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium flex items-center gap-2">
                                <span>{config.emoji}</span>
                                <span>{notif.mensagem}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(notif.criada_em), "HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                            {!notif.lida && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => marcarComoLida(notif.id)}
                                className="h-8 w-8 shrink-0"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};