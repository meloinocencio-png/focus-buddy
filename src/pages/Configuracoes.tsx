import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Moon, Sun, Phone, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Configuracoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  // Configurações de lembretes
  const [config, setConfig] = useState({
    notificacoes_ativas: true,
    hora_lembrete_diario: "07:00:00",
  });

  // WhatsApp separado (usa tabela whatsapp_usuarios)
  const [whatsappData, setWhatsappData] = useState<{
    whatsapp: string;
    nome: string | null;
  } | null>(null);
  const [novoWhatsapp, setNovoWhatsapp] = useState("");
  const [vinculandoWhatsapp, setVinculandoWhatsapp] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
    }

    fetchConfig();
    fetchWhatsapp();
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
        });
      }
    } catch (error) {
      console.error("Erro ao buscar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const fetchWhatsapp = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("whatsapp_usuarios")
        .select("whatsapp, nome")
        .eq("usuario_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      
      setWhatsappData(data);
    } catch (error) {
      console.error("Erro ao buscar WhatsApp:", error);
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

  const vincularWhatsapp = async () => {
    if (!novoWhatsapp.trim()) {
      toast.error("Digite um número de WhatsApp");
      return;
    }

    try {
      setVinculandoWhatsapp(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Limpar número (só dígitos)
      const whatsappLimpo = novoWhatsapp.replace(/\D/g, "");
      
      if (whatsappLimpo.length < 10) {
        toast.error("Número inválido. Use formato: 5511999999999");
        return;
      }

      const { error } = await supabase
        .from("whatsapp_usuarios")
        .upsert({
          usuario_id: user.id,
          whatsapp: whatsappLimpo,
          nome: user.email?.split("@")[0] || "Usuário",
          ativo: true,
        });

      if (error) throw error;

      toast.success("WhatsApp vinculado! Envie 'oi' para o número da Malu para ativar.");
      setWhatsappData({ whatsapp: whatsappLimpo, nome: user.email?.split("@")[0] || null });
      setNovoWhatsapp("");
    } catch (error) {
      console.error("Erro ao vincular WhatsApp:", error);
      toast.error("Erro ao vincular WhatsApp");
    } finally {
      setVinculandoWhatsapp(false);
    }
  };

  const desvincularWhatsapp = async () => {
    if (!confirm("Tem certeza que deseja desvincular o WhatsApp? Você não receberá mais lembretes via mensagem.")) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("whatsapp_usuarios")
        .delete()
        .eq("usuario_id", user.id);

      if (error) throw error;

      toast.success("WhatsApp desvinculado");
      setWhatsappData(null);
    } catch (error) {
      console.error("Erro ao desvincular WhatsApp:", error);
      toast.error("Erro ao desvincular WhatsApp");
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

  const formatarWhatsapp = (numero: string) => {
    // Formata 5511999999999 para +55 11 99999-9999
    if (numero.length === 13) {
      return `+${numero.slice(0, 2)} ${numero.slice(2, 4)} ${numero.slice(4, 9)}-${numero.slice(9)}`;
    }
    return numero;
  };

  const horaEmHoras = parseInt(config.hora_lembrete_diario.split(":")[0]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          {/* WhatsApp */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Phone className="h-5 w-5" />
              WhatsApp
            </h2>
            
            {whatsappData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/30">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {formatarWhatsapp(whatsappData.whatsapp)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="bg-success/20 text-success border-success/30 text-xs">
                          Conectado
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={desvincularWhatsapp}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Desvincular
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  📱 Você receberá lembretes e poderá conversar com a Malu neste número.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="5511999999999"
                    value={novoWhatsapp}
                    onChange={(e) => setNovoWhatsapp(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={vincularWhatsapp}
                    disabled={vinculandoWhatsapp}
                  >
                    {vinculandoWhatsapp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Vincular"
                    )}
                  </Button>
                </div>
                <div className="p-3 bg-info-soft rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground">
                    💡 <strong>Como ativar:</strong> Após vincular, envie "oi" para o número da Malu para começar a receber lembretes via WhatsApp.
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Notificações */}
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
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={salvarConfig}
              disabled={saving}
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar Configurações"
              )}
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
