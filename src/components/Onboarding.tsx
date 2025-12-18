import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingProps {
  onComplete: () => void;
}

const Onboarding = ({ onComplete }: OnboardingProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    // TELA 1: Alívio
    {
      emoji: "🧠",
      headline: "Você não precisa lembrar de tudo.",
      subheadline: "A Malu lembra por você.",
      cta: "Quero parar de esquecer",
      bullets: null,
      examples: null,
    },
    // TELA 2: Diferencial
    {
      emoji: "🔁",
      headline: "A Malu não avisa uma vez.",
      subheadline: "Ela insiste até você fazer.",
      bullets: [
        { emoji: "🔁", text: "Pergunta de novo se você não fez" },
        { emoji: "🧠", text: "Entende áudio, texto e fotos" },
        { emoji: "🎉", text: "Comemora suas conquistas" },
      ],
      cta: "É disso que eu preciso",
      examples: null,
    },
    // TELA 3: Ação
    {
      emoji: "🚀",
      headline: "Vamos testar agora",
      subheadline: "(30 segundos)",
      examples: [
        "💊 \"Tomar remédio todo dia 20h\"",
        "📅 \"Dentista terça 14h\"",
        "🎂 \"Aniversário da Maria dia 25\"",
      ],
      cta: "Criar meu primeiro lembrete",
      bullets: null,
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      localStorage.setItem("malu_onboarding_completed", "true");
      onComplete();
    }
  };

  const step = steps[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-success-soft to-info-soft flex flex-col items-center justify-center p-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full text-center space-y-8"
        >
          {/* Emoji grande */}
          <motion.div 
            className="text-7xl"
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          >
            {step.emoji}
          </motion.div>

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
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-2xl">{bullet.emoji}</span>
                  <span className="text-lg text-foreground">{bullet.text}</span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Examples (Tela 3) */}
          {step.examples && (
            <div className="space-y-3 text-left">
              {step.examples.map((example, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="bg-card p-4 rounded-xl text-lg text-foreground shadow-sm"
                >
                  {example}
                </motion.div>
              ))}
            </div>
          )}

          {/* CTA Button */}
          <Button
            onClick={handleNext}
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
          >
            {step.cta}
          </Button>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 pt-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep 
                    ? "bg-primary w-6" 
                    : "bg-muted w-2"
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
