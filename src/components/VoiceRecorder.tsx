import { useState, useEffect } from "react";
import { Mic, MicOff, Loader2, Send } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
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
  const [textInput, setTextInput] = useState("");

  const examples = [
    "Aniversário do João dia 15/03",
    "Comprar remédio amanhã",
    "Consulta dentista próxima sexta 10h"
  ];

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
      setTextInput("");
      onEventCreated();
      
    } catch (error) {
      console.error('Erro:', error);
      toast.error("Erro ao processar. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      processarComando(textInput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const handleExampleClick = (example: string) => {
    setTextInput(example);
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

  const charCount = textInput.length;
  const maxChars = 200;

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto">
      {/* Voice and Text Input Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-6 items-start w-full">
        {/* Voice Button */}
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={toggleListening}
            size="lg"
            disabled={isProcessing}
            className={`
              h-24 w-24 rounded-full text-2xl transition-all duration-300 ease-out shadow-lg hover:shadow-xl
              ${isProcessing
                ? 'bg-muted cursor-not-allowed'
                : isListening 
                  ? 'bg-destructive hover:bg-destructive/90 animate-pulse scale-110' 
                  : 'bg-[hsl(var(--voice-button))] hover:bg-[hsl(var(--voice-button-hover))] scale-100'
              }
            `}
          >
            {isProcessing ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : isListening ? (
              <MicOff className="h-12 w-12" />
            ) : (
              <Mic className="h-12 w-12" />
            )}
          </Button>
          <span className="text-sm text-muted-foreground font-medium">
            {isListening ? "🎤 Escutando..." : "Falar"}
          </span>
        </div>

        {/* Separator - Desktop */}
        <div className="hidden md:flex items-center justify-center self-center px-4">
          <span className="text-muted-foreground font-medium">ou</span>
        </div>

        {/* Separator - Mobile */}
        <div className="flex md:hidden items-center justify-center gap-3 my-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground font-medium">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Text Input */}
        <div className="flex flex-col gap-3 flex-1 w-full">
          <div className="relative">
            <div className="absolute left-4 top-4 text-2xl pointer-events-none">✏️</div>
            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value.slice(0, maxChars))}
              onKeyDown={handleKeyDown}
              placeholder="Ou digite aqui: 'Aniversário da Maria dia 25' ou 'Consulta amanhã 14h'"
              disabled={isProcessing}
              className="min-h-[80px] text-lg pl-12 pr-4 py-4 resize-none border-2 focus:border-primary transition-colors"
            />
            <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">
              {charCount}/{maxChars}
            </div>
          </div>
          
          <Button
            onClick={handleTextSubmit}
            disabled={isProcessing || !textInput.trim()}
            size="lg"
            className="w-full md:w-auto md:self-end gap-2"
          >
            <Send className="h-5 w-5" />
            Adicionar
          </Button>

          <div className="text-xs text-muted-foreground text-center md:text-right">
            Dica: Ctrl + Enter para enviar rápido
          </div>
        </div>
      </div>

      {/* Voice Transcript Display */}
      {transcript && !isProcessing && (
        <div className="w-full p-4 bg-card border-2 border-primary/20 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Você disse:</p>
          <p className="text-lg text-foreground">{transcript}</p>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="flex items-center gap-3 text-primary">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg font-medium">🤖 Entendendo...</span>
        </div>
      )}

      {/* Examples */}
      <div className="w-full">
        <p className="text-sm text-muted-foreground mb-3 text-center">
          👋 Experimente dizer ou escrever:
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {examples.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              disabled={isProcessing}
              className="px-4 py-2 text-sm bg-muted hover:bg-accent text-foreground rounded-lg transition-colors border border-border hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};