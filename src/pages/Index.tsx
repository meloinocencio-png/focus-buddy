import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Dashboard, DashboardRef } from "@/components/Dashboard";
import { DayProgressWidget } from "@/components/DayProgressWidget";
import { NotificacoesDestaque } from "@/components/NotificacoesDestaque";
import { CentroNotificacoes } from "@/components/CentroNotificacoes";
import { StreakBadge } from "@/components/StreakBadge";
import Onboarding from "@/components/Onboarding";
import { ActivateWhatsApp } from "@/components/ActivateWhatsApp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Moon, Sun, Bell, Settings } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [isDark, setIsDark] = useState(false);
  const [notificacoesOpen, setNotificacoesOpen] = useState(false);
  const [notificacoesCount, setNotificacoesCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [whatsappActivated, setWhatsappActivated] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const dashboardRef = useRef<DashboardRef>(null);

  useEffect(() => {
    // Verificar tema salvo
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }

    // Verificar onboarding - DB primeiro, localStorage como fallback
    async function checkOnboarding(userId: string) {
      try {
        // Verificar no DB (usuario_stats)
        const { data: stats } = await supabase
          .from('usuario_stats')
          .select('onboarding_completed_at')
          .eq('usuario_id', userId)
          .maybeSingle();
        
        if (stats?.onboarding_completed_at) {
          // Já completou - sincronizar localStorage
          localStorage.setItem('malu_onboarding_completed', 'true');
          setShowOnboarding(false);
        } else {
          // Verificar localStorage como fallback
          const cached = localStorage.getItem('malu_onboarding_completed');
          setShowOnboarding(!cached);
        }
      } catch (error) {
        // Fallback para localStorage em caso de erro
        const cached = localStorage.getItem('malu_onboarding_completed');
        setShowOnboarding(!cached);
      }
    }

    // Verificar se WhatsApp já foi ativado
    async function checkWhatsappStatus(userId: string) {
      // Verificar localStorage primeiro (cache)
      const cachedActivated = localStorage.getItem('whatsapp_activated');
      if (cachedActivated === 'true') {
        setWhatsappActivated(true);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('whatsapp_usuarios')
          .select('whatsapp')
          .eq('usuario_id', userId)
          .maybeSingle();
        
        if (data?.whatsapp) {
          localStorage.setItem('whatsapp_activated', 'true');
          setWhatsappActivated(true);
        } else {
          setWhatsappActivated(false);
        }
      } catch (error) {
        console.error('Erro ao verificar WhatsApp:', error);
        setWhatsappActivated(false);
      }
    }

    // Configurar listener de autenticação PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkOnboarding(session.user.id);
        checkWhatsappStatus(session.user.id);
      }
    });

    // DEPOIS verificar sessão existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      } else {
        checkOnboarding(session.user.id);
        checkWhatsappStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", !isDark ? "dark" : "light");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso!");
    navigate("/auth");
  };

  const handleEventCreated = () => {
    // Recarregar eventos no dashboard usando ref
    dashboardRef.current?.refresh();
  };

  if (!user || whatsappActivated === null) {
    return null; // Loading state
  }

  // Mostrar onboarding se não foi completado
  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  // Mostrar tela de ativação do WhatsApp se não ativado
  if (!whatsappActivated) {
    return (
      <ActivateWhatsApp 
        onActivated={() => setWhatsappActivated(true)}
        userName={user.email?.split('@')[0]}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            Assistente TDAH
          </h1>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/configuracoes")}
              className="rounded-full"
            >
              <Settings className="h-5 w-5" />
            </Button>

            {/* Botão de notificações */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotificacoesOpen(true)}
              className="rounded-full relative"
            >
              <Bell className="h-5 w-5" />
              {notificacoesCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {notificacoesCount}
                </Badge>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="rounded-full"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Notificações em destaque */}
        <NotificacoesDestaque onVerTodas={() => setNotificacoesOpen(true)} />

        {/* Widget de progresso + Streak Badge */}
        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          <div className="flex-1">
            <DayProgressWidget />
          </div>
          <div className="sm:w-auto">
            <StreakBadge />
          </div>
        </div>

        <section className="text-center space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Adicionar Compromisso
            </h2>
            <p className="text-muted-foreground text-lg">
              Toque no botão e diga naturalmente o que precisa lembrar
            </p>
          </div>
          
          <VoiceRecorder onEventCreated={handleEventCreated} />
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Seus Compromissos
          </h2>
          <Dashboard ref={dashboardRef} />
        </section>
      </main>

      {/* Centro de notificações */}
      <CentroNotificacoes
        open={notificacoesOpen}
        onOpenChange={setNotificacoesOpen}
        onCountChange={setNotificacoesCount}
      />
    </div>
  );
};

export default Index;
