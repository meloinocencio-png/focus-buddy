import { Card } from "./ui/card";
import { Calendar, User, Clock, Pencil, Trash2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "./ui/button";
import { gerarLinksNavegacao } from "@/utils/maps";

interface EventCardProps {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude";
  titulo: string;
  descricao?: string;
  data: Date;
  pessoa?: string;
  endereco?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
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
};

export const EventCard = ({ id, tipo, titulo, descricao, data, pessoa, endereco, onEdit, onDelete }: EventCardProps) => {
  const config = tipoConfig[tipo];
  const links = endereco ? gerarLinksNavegacao(endereco) : null;
  
  return (
    <Card className={`p-4 border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${config.className}`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{config.emoji}</div>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-lg text-foreground flex-1">{titulo}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-background/50">
                {config.label}
              </span>
              
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
  );
};