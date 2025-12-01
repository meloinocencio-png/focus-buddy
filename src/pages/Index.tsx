import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Dashboard } from "@/components/Dashboard";
import { NotificacoesDestaque } from "@/components/NotificacoesDestaque";
import { CentroNotificacoes } from "@/components/CentroNotificacoes";
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
  const navigate = useNavigate();

  useEffect(() => {
    // Verificar tema salvo
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }

    // Configurar listener de autenticação PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // DEPOIS verificar sessão existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
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
    // Recarregar eventos no dashboard
    window.location.reload();
  };

  if (!user) {
    return null; // Ou um loading spinner
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

      <main className="container mx-auto px-4 py-8 space-y-12">
        <NotificacoesDestaque onVerTodas={() => setNotificacoesOpen(true)} />

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
          <Dashboard />
        </section>
      </main>

      <CentroNotificacoes
        open={notificacoesOpen}
        onOpenChange={setNotificacoesOpen}
        onCountChange={setNotificacoesCount}
      />
    </div>
  );
};

export default Index;