import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Smartphone, CheckCircle2, MessageCircle, Trophy, Loader2 } from "lucide-react";

interface ActivateWhatsAppProps {
  onActivated: () => void;
  userName?: string;
}

export function ActivateWhatsApp({ onActivated, userName }: ActivateWhatsAppProps) {
  const [phone, setPhone] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  function formatPhone(value: string): string {
    const cleaned = value.replace(/\D/g, '');
    
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)} ${cleaned.slice(2)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4)}`;
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
  }

  function validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 13 && cleaned.startsWith('55');
  }

  async function handleActivate() {
    const cleaned = phone.replace(/\D/g, '');
    
    if (!validatePhone(phone)) {
      toast.error("WhatsApp inválido. Use: 55 + DDD + número (13 dígitos)");
      return;
    }
    
    setIsActivating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      
      const nome = userName || user.email?.split('@')[0] || 'Usuário';
      
      // 1. Salvar WhatsApp
      const { error: insertError } = await supabase
        .from('whatsapp_usuarios')
        .upsert({
          usuario_id: user.id,
          whatsapp: cleaned,
          nome: nome,
          ativo: true
        }, {
          onConflict: 'usuario_id'
        });
      
      if (insertError) throw insertError;
      
      // 2. Enviar mensagem proativa da Malu
      const { error: welcomeError } = await supabase.functions.invoke(
        'enviar-boas-vindas',
        {
          body: { 
            phone: cleaned,
            userId: user.id,
            nome: nome
          }
        }
      );
      
      if (welcomeError) {
        console.error('Erro enviar boas-vindas:', welcomeError);
        // Não bloqueia ativação - mensagem pode chegar depois
      }
      
      toast.success("🎉 WhatsApp ativado! Verifique suas mensagens.");
      
      // Salvar flag de ativação completa
      localStorage.setItem('whatsapp_activated', 'true');
      
      // Aguardar um pouco para o toast e redirecionar
      setTimeout(() => {
        onActivated();
      }, 2000);
      
    } catch (error) {
      console.error('Erro ativar WhatsApp:', error);
      toast.error("Erro ao ativar. Tente novamente.");
    } finally {
      setIsActivating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        
        {/* Header com mascote */}
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-lg animate-bounce-gentle">
            <Smartphone className="w-12 h-12 text-primary-foreground" />
          </div>
          
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Ative seu WhatsApp
            </h1>
            <p className="text-muted-foreground mt-2">
              Para a Malu funcionar, preciso falar com você no WhatsApp 📱
            </p>
          </div>
        </div>

        {/* Card Principal */}
        <Card className="border-2 border-primary/20 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">
              Seu número de WhatsApp
            </CardTitle>
            <CardDescription className="text-center">
              Inclua código do país (55) + DDD + número
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Input
                type="tel"
                placeholder="55 16 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                maxLength={18}
                className="h-14 text-xl text-center font-mono tracking-wider border-2 focus:border-primary"
                disabled={isActivating}
              />
              <p className="text-xs text-muted-foreground text-center">
                Exemplo: 55 16 99999-9999
              </p>
            </div>

            <Button 
              onClick={handleActivate} 
              disabled={isActivating || phone.replace(/\D/g, '').length < 13}
              className="w-full h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              {isActivating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Ativando...
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Ativar e receber mensagem
                </>
              )}
            </Button>

            {/* O que vai acontecer */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm text-foreground">
                O que vai acontecer:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span>Seu número será vinculado à conta</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span>Malu vai te mandar uma mensagem de boas-vindas</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Trophy className="w-4 h-4 text-primary shrink-0" />
                  <span>Você já pode começar a usar!</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dica */}
        <p className="text-center text-sm text-muted-foreground">
          💡 A Malu entende texto, áudio e foto!
        </p>
      </div>
    </div>
  );
}
