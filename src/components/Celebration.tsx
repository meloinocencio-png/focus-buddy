import { useEffect, useState } from "react";
import Confetti from "react-confetti";

interface CelebrationProps {
  show: boolean;
  onComplete: () => void;
  message?: string;
}

export function Celebration({ show, onComplete, message = "Tarefa concluída!" }: CelebrationProps) {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      
      // Vibração no mobile (padrão: curto-pausa-curto)
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }

      // Auto-dismiss após 3 segundos
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!isVisible) return null;

  return (
    <>
      {/* Confetti */}
      <Confetti
        width={windowSize.width}
        height={windowSize.height}
        recycle={false}
        numberOfPieces={200}
        gravity={0.3}
        colors={["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899"]}
      />
      
      {/* Overlay com mensagem */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
        <div className="flex flex-col items-center gap-4 animate-bounce-in">
          <div className="text-8xl animate-pulse">🎉</div>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">Muito bem!</h2>
            <p className="text-xl text-muted-foreground mt-2">{message}</p>
          </div>
        </div>
      </div>
    </>
  );
}
