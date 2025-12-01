import { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

// Adicionar tipagem para Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const VoiceRecorder = ({ onTranscript }: VoiceRecorderProps) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  useEffect(() => {
    // Verificar se o navegador suporta Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Seu navegador não suporta reconhecimento de voz");
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognitionInstance = new SpeechRecognitionAPI();
    
    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'pt-BR';

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result) => result.transcript)
        .join('');
      
      onTranscript(transcript);
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      
      if (event.error === 'no-speech') {
        toast.error("Nenhuma fala detectada. Tente novamente.");
      } else if (event.error === 'not-allowed') {
        toast.error("Permissão de microfone negada. Habilite nas configurações.");
      } else {
        toast.error("Erro no reconhecimento de voz");
      }
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
    };

    setRecognition(recognitionInstance);

    return () => {
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
    };
  }, [onTranscript]);

  const toggleListening = () => {
    if (!recognition) {
      toast.error("Reconhecimento de voz não disponível");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      toast.success("Gravação pausada");
    } else {
      recognition.start();
      setIsListening(true);
      toast.success("Escutando... Pode falar!");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        onClick={toggleListening}
        size="lg"
        className={`
          h-32 w-32 rounded-full text-5xl transition-all duration-300 ease-out
          ${isListening 
            ? 'bg-destructive hover:bg-destructive/90 animate-pulse scale-110' 
            : 'bg-voice-button hover:bg-voice-hover scale-100'
          }
        `}
      >
        {isListening ? <MicOff /> : <Mic />}
      </Button>
      
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">
          {isListening ? "🎤 Escutando..." : "Toque para falar"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isListening 
            ? "Diga seu compromisso naturalmente" 
            : "Exemplo: 'Aniversário da Maria dia 25'"}
        </p>
      </div>
    </div>
  );
};