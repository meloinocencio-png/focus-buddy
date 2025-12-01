import { useState, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VoiceRecorderProps {
  onEventCreated: () => void;
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

export const VoiceRecorder = ({ onEventCreated }: VoiceRecorderProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [transcript, setTranscript] = useState("");

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
      const finalTranscript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result) => result.transcript)
        .join('');
      
      setTranscript(finalTranscript);
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
  }, []);

  const processarComando = async (texto: string) => {
    setIsProcessing(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Você precisa estar logado");
        return;
      }

      const { data, error } = await supabase.functions.invoke('processar-comando', {
        body: { texto, userId: user.id }
      });

      if (error) {
        console.error('Erro ao processar comando:', error);
        toast.error("Desculpa, não entendi. Pode repetir?");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Sucesso!
      const evento = data.evento;
      const dataFormatada = new Date(evento.data).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });

      toast.success(
        `✅ Anotado!\n📌 ${evento.titulo}\n📅 ${dataFormatada}\n🔔 Vou te lembrar!`,
        { duration: 5000 }
      );

      setTranscript("");
      onEventCreated();
      
    } catch (error) {
      console.error('Erro:', error);
      toast.error("Erro ao processar. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (!recognition) {
      toast.error("Reconhecimento de voz não disponível");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      
      // Processar o comando se houver transcrição
      if (transcript.trim()) {
        processarComando(transcript);
      }
    } else {
      setTranscript("");
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
        disabled={isProcessing}
        className={`
          h-32 w-32 rounded-full text-5xl transition-all duration-300 ease-out
          ${isProcessing
            ? 'bg-muted cursor-not-allowed'
            : isListening 
              ? 'bg-destructive hover:bg-destructive/90 animate-pulse scale-110' 
              : 'bg-voice-button hover:bg-voice-hover scale-100'
          }
        `}
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" />
        ) : isListening ? (
          <MicOff />
        ) : (
          <Mic />
        )}
      </Button>
      
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">
          {isProcessing 
            ? "🤖 Entendendo..." 
            : isListening 
              ? "🎤 Escutando..." 
              : "Toque para falar"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isProcessing 
            ? "Processando seu comando..."
            : isListening 
              ? "Diga seu compromisso naturalmente" 
              : "Exemplo: 'Aniversário da Maria dia 25'"}
        </p>
      </div>

      {transcript && !isProcessing && (
        <div className="mt-4 p-4 bg-card rounded-lg border-2 border-primary/20 max-w-2xl">
          <p className="text-sm text-muted-foreground mb-1">Você disse:</p>
          <p className="text-lg text-foreground">{transcript}</p>
        </div>
      )}
    </div>
  );
};