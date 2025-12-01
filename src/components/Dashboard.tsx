import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "./EventCard";
import { format, isToday, isWithinInterval, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Skeleton } from "./ui/skeleton";

interface Evento {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude";
  titulo: string;
  descricao: string | null;
  data: string;
  pessoa: string | null;
}

export const Dashboard = () => {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);

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

  const eventosHoje = eventos.filter((e) => isToday(new Date(e.data)));
  
  const eventosProximos = eventos.filter((e) => {
    const dataEvento = new Date(e.data);
    return !isToday(dataEvento) && isWithinInterval(dataEvento, {
      start: addDays(startOfDay(new Date()), 1),
      end: addDays(startOfDay(new Date()), 7),
    });
  });

  const aniversarios = eventos.filter((e) => e.tipo === "aniversario");

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
    <div className="w-full max-w-4xl mx-auto">
      <Tabs defaultValue="hoje" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="hoje" className="text-base">
            Hoje {eventosHoje.length > 0 && `(${eventosHoje.length})`}
          </TabsTrigger>
          <TabsTrigger value="proximos" className="text-base">
            Próximos 7 dias {eventosProximos.length > 0 && `(${eventosProximos.length})`}
          </TabsTrigger>
          <TabsTrigger value="aniversarios" className="text-base">
            🎂 Aniversários {aniversarios.length > 0 && `(${aniversarios.length})`}
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
                tipo={evento.tipo}
                titulo={evento.titulo}
                descricao={evento.descricao || undefined}
                data={new Date(evento.data)}
                pessoa={evento.pessoa || undefined}
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
                tipo={evento.tipo}
                titulo={evento.titulo}
                descricao={evento.descricao || undefined}
                data={new Date(evento.data)}
                pessoa={evento.pessoa || undefined}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="aniversarios" className="space-y-4 mt-0">
          {aniversarios.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">Nenhum aniversário cadastrado</p>
            </div>
          ) : (
            aniversarios.map((evento) => (
              <EventCard
                key={evento.id}
                tipo={evento.tipo}
                titulo={evento.titulo}
                descricao={evento.descricao || undefined}
                data={new Date(evento.data)}
                pessoa={evento.pessoa || undefined}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};