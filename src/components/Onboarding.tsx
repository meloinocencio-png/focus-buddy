import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OnboardingProps {
  onComplete: () => void;
}

// Função de analytics (placeholder para integração futura)
function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  console.log('[Analytics]', eventName, properties);
  // TODO: Integrar com PostHog/Mixpanel/GA4
}

const Onboarding = ({ onComplete }: OnboardingProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [onboardingStartTime] = useState(Date.now());

  // Analytics: onboarding iniciado
  useEffect(() => {
    trackEvent('onboarding_started');
  }, []);

  const steps = [
    // TELA 1: Alívio
    {
      emoji: "🧠",
      headline: "Você não precisa lembrar de tudo.",
      subheadline: "A Malu lembra por você.",
      cta: "Quero parar de esquecer",
      bullets: null,
      examples: null,
      isActionStep: false,
    },
    // TELA 2: Diferencial
    {
      emoji: "🔁",
      headline: "A Malu não avisa uma vez.",
      subheadline: "Ela insiste até você fazer.",
      bullets: [
        { emoji: "🔁", text: "Pergunta de novo se você não fez" },
        { emoji: "🧠", text: "Digite ou fale — do jeito mais fácil" },
        { emoji: "🎉", text: "Comemora suas conquistas" },
      ],
      cta: "É disso que eu preciso",
      examples: null,
      isActionStep: false,
    },
    // TELA 3: Ação com input real
    {
      emoji: "🚀",
      headline: "Vamos testar agora",
      subheadline: "(30 segundos)",
      examples: [
        { text: "Tomar remédio todo dia 20h", emoji: "💊" },
        { text: "Dentista terça 14h", emoji: "📅" },
        { text: "Aniversário da Maria dia 25", emoji: "🎂" },
      ],
      cta: "Criar lembrete agora",
      bullets: null,
      isActionStep: true,
    },
  ];

  // Navegar entre steps (telas 1 e 2)
  const handleNext = () => {
    trackEvent(`onboarding_view_step_${currentStep + 2}`);
    setCurrentStep(currentStep + 1);
  };

  // Pular onboarding
  const handleSkip = async () => {
    trackEvent('onboarding_skip', { step: currentStep });
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('usuario_stats')
          .upsert({
            usuario_id: user.id,
            onboarding_completed_at: new Date().toISOString(),
            onboarding_skipped: true
          }, { onConflict: 'usuario_id' });
      }
    } catch (error) {
      console.error('Erro ao salvar skip:', error);
    }
    
    localStorage.setItem('malu_onboarding_completed', 'true');
    onComplete();
  };

  // CRIAR EVENTO REAL (Tela 3)
  const handleCreateFirstEvent = async () => {
    if (!inputValue.trim() || inputValue.trim().length < 3) {
      toast.error('Digite pelo menos 3 caracteres');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      
      // Criar evento simples (direto no DB, sem Claude)
      const { error: eventoError } = await supabase
        .from('eventos')
        .insert([{
          usuario_id: user.id,
          tipo: 'tarefa',
          titulo: inputValue.trim(),
          data: new Date().toISOString(),
          status: 'pendente'
        }]);
      
      if (eventoError) throw eventoError;
      
      // Calcular tempo até ativação
      const tempoAtivacao = Math.round((Date.now() - onboardingStartTime) / 1000);
      
      // Analytics
      trackEvent('first_event_created', {
        source: 'onboarding',
        time_to_create_seconds: tempoAtivacao
      });
      
      trackEvent('onboarding_complete', {
        time_spent_seconds: tempoAtivacao,
        skipped: false
      });
      
      // Salvar onboarding completo no DB
      await supabase
        .from('usuario_stats')
        .upsert({
          usuario_id: user.id,
          onboarding_completed_at: new Date().toISOString(),
          onboarding_skipped: false,
          first_event_source: 'onboarding'
        }, { onConflict: 'usuario_id' });
      
      // LocalStorage como cache
      localStorage.setItem('malu_onboarding_completed', 'true');
      
      // Celebração
      toast.success('🎉 Primeiro lembrete criado!');
      
      // Completar
      onComplete();
      
    } catch (error) {
      console.error('Erro ao criar evento:', error);
      toast.error('Erro ao criar lembrete. Tente novamente.');
    } finally {
      setIsCreating(false);
    }
  };

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isInputValid = inputValue.trim().length >= 3;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft flex flex-col items-center justify-center p-6 relative">
      {/* Botão Pular - sempre visível */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm transition-colors z-10"
      >
        {isLastStep ? "Fazer depois" : "Pular"}
      </button>

      <div 
        key={currentStep}
        className="max-w-md w-full text-center space-y-8 animate-fadeInUp"
      >
        {/* Emoji */}
        <div className="text-7xl animate-bounce-once">{step.emoji}</div>

        {/* Headline */}
        <h1 className="text-3xl font-bold text-foreground leading-tight">
          {step.headline}
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-muted-foreground">{step.subheadline}</p>

        {/* Bullets (Tela 2) */}
        {step.bullets && (
          <div className="space-y-4 text-left bg-card p-6 rounded-2xl shadow-sm">
            {step.bullets.map((bullet, i) => (
              <div 
                key={i} 
                className="flex items-center gap-3"
              >
                <span className="text-2xl">{bullet.emoji}</span>
                <span className="text-lg text-foreground">{bullet.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tela 3: Input + Chips */}
        {step.isActionStep && (
          <div className="space-y-6">
            {/* Input para criar evento */}
            <div className="relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Digite seu primeiro lembrete..."
                className="h-14 text-lg px-4"
                disabled={isCreating}
                onKeyDown={(e) => e.key === 'Enter' && isInputValid && handleCreateFirstEvent()}
              />
            </div>
            
            {/* Chips clicáveis */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Ou escolha um exemplo:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {step.examples?.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInputValue(example.text)}
                    className="bg-card hover:bg-accent px-4 py-2 rounded-full text-sm transition-colors border border-border"
                    disabled={isCreating}
                  >
                    {example.emoji} {example.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <Button
          onClick={isLastStep ? handleCreateFirstEvent : handleNext}
          disabled={isLastStep && (!isInputValid || isCreating)}
          size="lg"
          className="w-full h-16 text-xl font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all"
        >
          {isCreating ? "Criando..." : step.cta}
        </Button>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep ? "bg-primary w-6" : "bg-muted w-2"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
