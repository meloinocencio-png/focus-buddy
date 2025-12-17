import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { parseUTCDate } from "@/utils/dateUtils";

interface Evento {
  id: string;
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude" | "lembrete";
  titulo: string;
  descricao: string | null;
  data: string;
  pessoa: string | null;
  status?: "pendente" | "concluido" | "cancelado" | null;
  eh_recorrente?: boolean | null;
  tempo_viagem_minutos?: number | null;
  endereco?: string | null;
}

interface EditEventDialogProps {
  evento: Evento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const EditEventDialog = ({
  evento,
  open,
  onOpenChange,
  onSuccess,
}: EditEventDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    tipo: "compromisso" as Evento["tipo"],
    titulo: "",
    descricao: "",
    data: "",
    hora: "",
    pessoa: "",
  });

  useEffect(() => {
    if (evento) {
      const dataEvento = parseUTCDate(evento.data);
      const dataFormatada = dataEvento.toISOString().split("T")[0];
      const horaFormatada = dataEvento.toTimeString().slice(0, 5);

      setFormData({
        tipo: evento.tipo,
        titulo: evento.titulo,
        descricao: evento.descricao || "",
        data: dataFormatada,
        hora: horaFormatada,
        pessoa: evento.pessoa || "",
      });
    }
  }, [evento]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!evento) return;
    
    if (!formData.titulo || !formData.data) {
      toast.error("Título e data são obrigatórios");
      return;
    }

    setLoading(true);

    try {
      const dataTimestamp = `${formData.data}T${formData.hora || "12:00"}:00`;

      const { error } = await supabase
        .from("eventos")
        .update({
          tipo: formData.tipo,
          titulo: formData.titulo,
          descricao: formData.descricao || null,
          data: dataTimestamp,
          pessoa: formData.pessoa || null,
        })
        .eq("id", evento.id);

      if (error) throw error;

      toast.success("Evento atualizado com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar evento:", error);
      toast.error("Erro ao atualizar evento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Compromisso</DialogTitle>
          <DialogDescription>
            Faça as alterações necessárias no seu evento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select
              value={formData.tipo}
              onValueChange={(value) =>
                setFormData({ ...formData, tipo: value as Evento["tipo"] })
              }
            >
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aniversario">🎂 Aniversário</SelectItem>
                <SelectItem value="compromisso">📅 Compromisso</SelectItem>
                <SelectItem value="tarefa">🛒 Tarefa</SelectItem>
                <SelectItem value="saude">💊 Saúde</SelectItem>
                <SelectItem value="lembrete">🔔 Lembrete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={formData.titulo}
              onChange={(e) =>
                setFormData({ ...formData, titulo: e.target.value })
              }
              placeholder="Ex: Consulta médica"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) =>
                setFormData({ ...formData, descricao: e.target.value })
              }
              placeholder="Adicione detalhes..."
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data *</Label>
              <Input
                id="data"
                type="date"
                value={formData.data}
                onChange={(e) =>
                  setFormData({ ...formData, data: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hora">Horário</Label>
              <Input
                id="hora"
                type="time"
                value={formData.hora}
                onChange={(e) =>
                  setFormData({ ...formData, hora: e.target.value })
                }
              />
            </div>
          </div>

          {formData.tipo === "aniversario" && (
            <div className="space-y-2">
              <Label htmlFor="pessoa">Pessoa</Label>
              <Input
                id="pessoa"
                value={formData.pessoa}
                onChange={(e) =>
                  setFormData({ ...formData, pessoa: e.target.value })
                }
                placeholder="Nome da pessoa"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
