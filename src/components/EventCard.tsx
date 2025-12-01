import { Card } from "./ui/card";
import { Calendar, User, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EventCardProps {
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude";
  titulo: string;
  descricao?: string;
  data: Date;
  pessoa?: string;
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

export const EventCard = ({ tipo, titulo, descricao, data, pessoa }: EventCardProps) => {
  const config = tipoConfig[tipo];
  
  return (
    <Card className={`p-4 border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${config.className}`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{config.emoji}</div>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg text-foreground">{titulo}</h3>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-background/50">
              {config.label}
            </span>
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
        </div>
      </div>
    </Card>
  );
};