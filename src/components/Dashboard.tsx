import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "./EventCard";
import { EditEventDialog } from "./EditEventDialog";
import { format, isToday, isWithinInterval, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseUTCDate } from "@/utils/dateUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Skeleton } from "./ui/skeleton";
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
import { toast } from "sonner";

interface Evento {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude";
  titulo: string;
  descricao: string | null;
  data: string;
  pessoa: string | null;
  endereco: string | null;
}

export const Dashboard = () => {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEventos();
  }, []);

  const fetchEventos = async () => {
    try {
      const { data, error } = await supabase
        .from("eventos")
        .select("*")
        .order("data", { ascending: true });

      if (error) throw error;
      setEventos((data as Evento[]) || []);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const eventosHoje = eventos.filter((e) => isToday(parseUTCDate(e.data)));
  
  const eventosProximos = eventos.filter((e) => {
    const dataEvento = parseUTCDate(e.data);
    return !isToday(dataEvento) && isWithinInterval(dataEvento, {
      start: addDays(startOfDay(new Date()), 1),
      end: addDays(startOfDay(new Date()), 7),
    });
  });

  const eventosProximos30 = eventos.filter((e) => {
    const dataEvento = parseUTCDate(e.data);
    return isWithinInterval(dataEvento, {
      start: addDays(startOfDay(new Date()), 8),
      end: addDays(startOfDay(new Date()), 30),
    });
  });

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
                <p className="text-lg">Nenhum compromisso para hoje! 🎉</p>
                <p className="text-sm mt-2">Use o botão de voz para adicionar um novo evento</p>
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
};