import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "./EventCard";
import { EditEventDialog } from "./EditEventDialog";
import { format, isToday, isWithinInterval, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseUTCDate } from "@/utils/dateUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Filter, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "sonner";

interface Evento {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude" | "lembrete";
  titulo: string;
  descricao: string | null;
  data: string;
  pessoa: string | null;
  endereco: string | null;
  status: "pendente" | "concluido" | "cancelado" | null;
  eh_recorrente: boolean | null;
  tempo_viagem_minutos: number | null;
}

export interface DashboardRef {
  refresh: () => void;
}

type StatusFilter = "todos" | "pendente" | "concluido";
type TipoFilter = "todos" | "aniversario" | "compromisso" | "tarefa" | "saude" | "lembrete";

const tipoLabels: Record<TipoFilter, { label: string; emoji: string }> = {
  todos: { label: "Todos", emoji: "📋" },
  aniversario: { label: "Aniversários", emoji: "🎂" },
  compromisso: { label: "Compromissos", emoji: "📅" },
  tarefa: { label: "Tarefas", emoji: "🛒" },
  saude: { label: "Saúde", emoji: "💊" },
  lembrete: { label: "Lembretes", emoji: "🔔" },
};

export const Dashboard = forwardRef<DashboardRef>((_, ref) => {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendente");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");
  const [showCanceled, setShowCanceled] = useState(false);

  const fetchEventos = useCallback(async () => {
    try {
      let query = supabase
        .from("eventos")
        .select("*")
        .order("data", { ascending: true });

      // Aplicar filtro de cancelados
      if (!showCanceled) {
        query = query.neq("status", "cancelado");
      }

      const { data, error } = await query;

      if (error) throw error;
      setEventos((data as Evento[]) || []);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
    } finally {
      setLoading(false);
    }
  }, [showCanceled]);

  useEffect(() => {
    fetchEventos();
  }, [fetchEventos]);

  // Expor método refresh para o componente pai
  useImperativeHandle(ref, () => ({
    refresh: fetchEventos
  }), [fetchEventos]);

  const handleEdit = (id: string) => {
    const evento = eventos.find((e) => e.id === id);
    if (evento) {
      setEditingEvento(evento);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from("eventos")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;

      toast.success("Evento excluído com sucesso!");
      fetchEventos();
    } catch (error) {
      console.error("Erro ao excluir evento:", error);
      toast.error("Erro ao excluir evento");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditSuccess = () => {
    fetchEventos();
    setEditingEvento(null);
  };

  // Aplicar filtros
  const filtrarEventos = (eventosList: Evento[]) => {
    return eventosList.filter((e) => {
      // Filtro de status
      if (statusFilter !== "todos") {
        const eventoStatus = e.status || "pendente";
        if (eventoStatus !== statusFilter) return false;
      }
      
      // Filtro de tipo
      if (tipoFilter !== "todos" && e.tipo !== tipoFilter) {
        return false;
      }
      
      return true;
    });
  };

  const eventosHoje = filtrarEventos(
    eventos.filter((e) => isToday(parseUTCDate(e.data)))
  );
  
  const eventosProximos = filtrarEventos(
    eventos.filter((e) => {
      const dataEvento = parseUTCDate(e.data);
      return !isToday(dataEvento) && isWithinInterval(dataEvento, {
        start: addDays(startOfDay(new Date()), 1),
        end: addDays(startOfDay(new Date()), 7),
      });
    })
  );

  const eventosProximos30 = filtrarEventos(
    eventos.filter((e) => {
      const dataEvento = parseUTCDate(e.data);
      return isWithinInterval(dataEvento, {
        start: addDays(startOfDay(new Date()), 8),
        end: addDays(startOfDay(new Date()), 30),
      });
    })
  );

  const hasActiveFilters = statusFilter !== "pendente" || tipoFilter !== "todos" || showCanceled;

  const clearFilters = () => {
    setStatusFilter("pendente");
    setTipoFilter("todos");
    setShowCanceled(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-4xl mx-auto">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    !
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={statusFilter === "todos"}
                onCheckedChange={() => setStatusFilter("todos")}
              >
                📋 Todos
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter === "pendente"}
                onCheckedChange={() => setStatusFilter("pendente")}
              >
                ⏳ Pendentes
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter === "concluido"}
                onCheckedChange={() => setStatusFilter("concluido")}
              >
                ✅ Concluídos
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tipo</DropdownMenuLabel>
              {Object.entries(tipoLabels).map(([key, { label, emoji }]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={tipoFilter === key}
                  onCheckedChange={() => setTipoFilter(key as TipoFilter)}
                >
                  {emoji} {label}
                </DropdownMenuCheckboxItem>
              ))}
              
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showCanceled}
                onCheckedChange={setShowCanceled}
              >
                ❌ Mostrar cancelados
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Badges dos filtros ativos */}
          {statusFilter !== "pendente" && (
            <Badge variant="secondary" className="gap-1">
              {statusFilter === "todos" ? "Todos status" : statusFilter === "concluido" ? "✅ Concluídos" : "⏳ Pendentes"}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setStatusFilter("pendente")}
              />
            </Badge>
          )}
          {tipoFilter !== "todos" && (
            <Badge variant="secondary" className="gap-1">
              {tipoLabels[tipoFilter].emoji} {tipoLabels[tipoFilter].label}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setTipoFilter("todos")}
              />
            </Badge>
          )}
          {showCanceled && (
            <Badge variant="secondary" className="gap-1">
              Incluindo cancelados
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setShowCanceled(false)}
              />
            </Badge>
          )}
          
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              Limpar filtros
            </Button>
          )}
        </div>

        <Tabs defaultValue="hoje" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="hoje" className="text-base">
              Hoje {eventosHoje.length > 0 && `(${eventosHoje.length})`}
            </TabsTrigger>
            <TabsTrigger value="proximos" className="text-base">
              Próximos 7 dias {eventosProximos.length > 0 && `(${eventosProximos.length})`}
            </TabsTrigger>
            <TabsTrigger value="proximos30" className="text-base">
              📅 Próximos 30 dias {eventosProximos30.length > 0 && `(${eventosProximos30.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hoje" className="space-y-4 mt-0">
            {eventosHoje.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">
                  {statusFilter === "concluido" 
                    ? "Nenhum evento concluído hoje" 
                    : "Nenhum compromisso para hoje! 🎉"
                  }
                </p>
                <p className="text-sm mt-2">
                  {statusFilter === "concluido"
                    ? "Complete suas tarefas para vê-las aqui"
                    : "Use o botão de voz para adicionar um novo evento"
                  }
                </p>
              </div>
            ) : (
              eventosHoje.map((evento) => (
                <EventCard
                  key={evento.id}
                  id={evento.id}
                  tipo={evento.tipo}
                  titulo={evento.titulo}
                  descricao={evento.descricao || undefined}
                  data={parseUTCDate(evento.data)}
                  pessoa={evento.pessoa || undefined}
                  endereco={evento.endereco || undefined}
                  status={evento.status || "pendente"}
                  eh_recorrente={evento.eh_recorrente || false}
                  tempo_viagem_minutos={evento.tempo_viagem_minutos || undefined}
                  onEdit={handleEdit}
                  onDelete={setDeletingId}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="proximos" className="space-y-4 mt-0">
            {eventosProximos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">Nenhum evento nos próximos 7 dias</p>
              </div>
            ) : (
              eventosProximos.map((evento) => (
                <EventCard
                  key={evento.id}
                  id={evento.id}
                  tipo={evento.tipo}
                  titulo={evento.titulo}
                  descricao={evento.descricao || undefined}
                  data={parseUTCDate(evento.data)}
                  pessoa={evento.pessoa || undefined}
                  endereco={evento.endereco || undefined}
                  status={evento.status || "pendente"}
                  eh_recorrente={evento.eh_recorrente || false}
                  tempo_viagem_minutos={evento.tempo_viagem_minutos || undefined}
                  onEdit={handleEdit}
                  onDelete={setDeletingId}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="proximos30" className="space-y-4 mt-0">
            {eventosProximos30.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">Nenhum evento nos próximos 30 dias</p>
              </div>
            ) : (
              eventosProximos30.map((evento) => (
                <EventCard
                  key={evento.id}
                  id={evento.id}
                  tipo={evento.tipo}
                  titulo={evento.titulo}
                  descricao={evento.descricao || undefined}
                  data={parseUTCDate(evento.data)}
                  pessoa={evento.pessoa || undefined}
                  endereco={evento.endereco || undefined}
                  status={evento.status || "pendente"}
                  eh_recorrente={evento.eh_recorrente || false}
                  tempo_viagem_minutos={evento.tempo_viagem_minutos || undefined}
                  onEdit={handleEdit}
                  onDelete={setDeletingId}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de edição */}
      <EditEventDialog
        evento={editingEvento}
        open={!!editingEvento}
        onOpenChange={(open) => !open && setEditingEvento(null)}
        onSuccess={handleEditSuccess}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este compromisso? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

Dashboard.displayName = "Dashboard";
