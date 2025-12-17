import { useState } from "react";
import { Card } from "./ui/card";
import { Calendar, User, Clock, Pencil, Trash2, MapPin, Car, Repeat, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "./ui/button";
import { gerarLinksNavegacao } from "@/utils/maps";
import { Badge } from "./ui/badge";
import { Celebration } from "./Celebration";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventCardProps {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude" | "lembrete";
  titulo: string;
  descricao?: string;
  data: Date;
  pessoa?: string;
  endereco?: string;
  status?: "pendente" | "concluido" | "cancelado";
  eh_recorrente?: boolean;
  tempo_viagem_minutos?: number;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: () => void;
}

const tipoConfig = {
  aniversario: {
    emoji: "🎂",
    label: "Aniversário",
    className: "bg-category-birthday border-category-birthday",
  },
  compromisso: {
    emoji: "📅",
    label: "Compromisso",
    className: "bg-category-appointment border-category-appointment",
  },
  tarefa: {
    emoji: "🛒",
    label: "Tarefa",
    className: "bg-category-task border-category-task",
  },
  saude: {
    emoji: "💊",
    label: "Saúde",
    className: "bg-category-health border-category-health",
  },
  lembrete: {
    emoji: "🔔",
    label: "Lembrete",
    className: "bg-category-reminder border-category-reminder",
  },
};

const statusConfig = {
  pendente: { emoji: "⏳", label: "Pendente", className: "bg-warning/20 text-warning-foreground" },
  concluido: { emoji: "✅", label: "Concluído", className: "bg-success/20 text-success-foreground" },
  cancelado: { emoji: "❌", label: "Cancelado", className: "bg-destructive/20 text-destructive" },
};

export const EventCard = ({ 
  id, 
  tipo, 
  titulo, 
  descricao, 
  data, 
  pessoa, 
  endereco, 
  status = "pendente",
  eh_recorrente,
  tempo_viagem_minutos,
  onEdit, 
  onDelete,
  onStatusChange,
}: EventCardProps) => {
  const [showCelebration, setShowCelebration] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const config = tipoConfig[tipo] || tipoConfig.compromisso;
  const statusInfo = statusConfig[status] || statusConfig.pendente;
  const links = endereco ? gerarLinksNavegacao(endereco) : null;
  
  // Calcular hora de saída se tiver tempo de viagem
  const horaSaida = tempo_viagem_minutos 
    ? new Date(data.getTime() - (tempo_viagem_minutos + 5) * 60000) 
    : null;

  const marcarConcluido = async () => {
    if (status === "concluido" || isUpdating) return;

    try {
      setIsUpdating(true);
      
      const { error } = await supabase
        .from("eventos")
        .update({ status: "concluido" })
        .eq("id", id);

      if (error) throw error;

      // 🎉 Mostrar celebração!
      setShowCelebration(true);
      
      // Notificar parent para refresh
      onStatusChange?.();
    } catch (error) {
      console.error("Erro ao marcar como concluído:", error);
      toast.error("Erro ao atualizar status");
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <>
      <Celebration 
        show={showCelebration} 
        onComplete={() => setShowCelebration(false)}
        message={`"${titulo}" concluído!`}
      />
      
      <Card className={`p-4 border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${config.className} ${status === 'cancelado' ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="text-3xl">{config.emoji}</div>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <h3 className={`font-semibold text-lg text-foreground ${status === 'concluido' ? 'line-through opacity-70' : ''}`}>
                  {titulo}
                </h3>
                {eh_recorrente && (
                  <span className="text-primary" title="Evento recorrente">
                    <Repeat className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Badge de status */}
                <Badge variant="outline" className={`text-xs ${statusInfo.className}`}>
                  {statusInfo.emoji} {statusInfo.label}
                </Badge>
                
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-background/50">
                  {config.label}
                </span>
                
                {/* Botão de concluir (só para pendentes) */}
                {status === "pendente" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={marcarConcluido}
                    disabled={isUpdating}
                    className="h-8 w-8 p-0 hover:bg-success/20 hover:text-success"
                    title="Marcar como concluído"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Botões de ação */}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit?.(id)}
                  className="h-8 w-8 p-0 hover:bg-primary/20"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete?.(id)}
                  className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {descricao && (
              <p className="text-sm text-muted-foreground">{descricao}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(data, "dd 'de' MMMM", { locale: ptBR })}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{format(data, "HH:mm")}</span>
              </div>
              
              {pessoa && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>{pessoa}</span>
                </div>
              )}
            </div>

            {/* Tempo de viagem */}
            {tempo_viagem_minutos && horaSaida && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Car className="h-4 w-4" />
                <span>🚗 Saia às {format(horaSaida, "HH:mm")} ({tempo_viagem_minutos} min de viagem)</span>
              </div>
            )}

            {/* Endereço com links de navegação */}
            {endereco && links && (
              <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex flex-col gap-1">
                  <span>{endereco}</span>
                  <div className="flex gap-2 text-xs">
                    <a 
                      href={links.waze}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Waze
                    </a>
                    <span className="text-muted-foreground/50">|</span>
                    <a 
                      href={links.googleMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Maps
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </>
  );
};
