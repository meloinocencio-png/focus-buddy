import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

const Configuracoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  const [config, setConfig] = useState({
    notificacoes_ativas: true,
    hora_lembrete_diario: "07:00:00",
    whatsapp: "",
  });

  useEffect(() => {
    // Verificar tema
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
    }

    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("configuracao_lembretes")
        .select("*")
        .eq("usuario_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setConfig({
          notificacoes_ativas: data.notificacoes_ativas,
          hora_lembrete_diario: data.hora_lembrete_diario,
          whatsapp: data.whatsapp || "",
        });
      }
    } catch (error) {
      console.error("Erro ao buscar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const salvarConfig = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("configuracao_lembretes")
        .upsert({
          usuario_id: user.id,
          notificacoes_ativas: config.notificacoes_ativas,
          hora_lembrete_diario: config.hora_lembrete_diario,
          whatsapp: config.whatsapp || null,
        });

      if (error) throw error;

      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", !isDark ? "dark" : "light");
  };

  const testarNotificacao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("notificacoes")
        .insert({
          usuario_id: user.id,
          mensagem: "🧪 Esta é uma notificação de teste!",
          tipo: "lembrete",
        });

      if (error) throw error;

      toast.success("Notificação de teste criada!");
    } catch (error) {
      console.error("Erro ao criar notificação:", error);
      toast.error("Erro ao criar notificação de teste");
    }
  };

  const horaEmHoras = parseInt(config.hora_lembrete_diario.split(":")[0]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">
              ⚙️ Configurações
            </h1>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">🔔 Notificações</h2>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notificacoes-ativas" className="text-base">
                    Ativar lembretes
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receber notificações sobre seus compromissos
                  </p>
                </div>
                <Switch
                  id="notificacoes-ativas"
                  checked={config.notificacoes_ativas}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, notificacoes_ativas: checked })
                  }
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="hora-lembrete" className="text-base">
                  Horário do lembrete diário
                </Label>
                <p className="text-sm text-muted-foreground">
                  Escolha quando deseja receber o resumo diário: {horaEmHoras}:00
                </p>
                <Slider
                  id="hora-lembrete"
                  min={6}
                  max={22}
                  step={1}
                  value={[horaEmHoras]}
                  onValueChange={(value) =>
                    setConfig({ ...config, hora_lembrete_diario: `${value[0].toString().padStart(2, '0')}:00:00` })
                  }
                  disabled={!config.notificacoes_ativas}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-base">
                  WhatsApp (em breve)
                </Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="+55 11 99999-9999"
                  value={config.whatsapp}
                  onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  🚧 Integração com WhatsApp chegando em breve!
                </p>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={salvarConfig}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
            
            <Button
              variant="outline"
              onClick={testarNotificacao}
            >
              Testar Notificação
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Configuracoes;