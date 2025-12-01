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
  const [buttonState, setButtonState] = useState<"hidden" | "normal" | "loading" | "success" | "error">("hidden");

  const examples = [
    "Aniversário do João dia 15/03",
    "Comprar remédio amanhã",
    "Consulta dentista próxima sexta 10h"
  ];

  // Texto combinado (digitado ou transcrito)
  const combinedText = textInput || transcript;

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
      setTextInput(finalTranscript); // Preencher campo de texto com transcrição
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
    setButtonState("loading");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Você precisa estar logado");
        setButtonState("error");
        setTimeout(() => setButtonState("normal"), 2000);
        return;
      }

      const { data, error } = await supabase.functions.invoke('processar-comando', {
        body: { texto, userId: user.id }
      });

      if (error) {
        console.error('Erro ao processar comando:', error);
        toast.error("Desculpa, não entendi. Pode repetir?");
        setButtonState("error");
        setTimeout(() => setButtonState("normal"), 2000);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setButtonState("error");
        setTimeout(() => setButtonState("normal"), 2000);
        return;
      }

      // Sucesso!
      const evento = data.evento;
      const dataEvento = new Date(evento.data);
      const dataFormatada = dataEvento.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      // Extrair hora se existir
      let mensagem = `✅ Anotado!\n📌 ${evento.titulo}\n📅 ${dataFormatada}`;
      
      // Verificar se há hora no timestamp
      const horaMatch = evento.data.match(/T(\d{2}:\d{2})/);
      if (horaMatch && horaMatch[1] !== '12:00') {
        mensagem += ` às ${horaMatch[1]}`;
      }
      
      mensagem += '\n🔔 Vou te lembrar!';

      setButtonState("success");
      toast.success(mensagem, { duration: 5000 });

      // Limpar campos após 2 segundos
      setTimeout(() => {
        setTranscript("");
        setTextInput("");
        setButtonState("hidden");
        onEventCreated();
      }, 2000);
      
    } catch (error) {
      console.error('Erro:', error);
      toast.error("Erro ao processar. Tente novamente.");
      setButtonState("error");
      setTimeout(() => setButtonState("normal"), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddCommitment = () => {
    if (combinedText.trim() && combinedText.length >= 5) {
      processarComando(combinedText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddCommitment();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleAddCommitment();
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
      toast.info("Gravação finalizada. Revise e clique para adicionar.");
    } else {
      setTranscript("");
      setTextInput("");
      recognition.start();
      setIsListening(true);
      toast.success("Escutando... Pode falar!");
    }
  };

  // Mostrar botão quando há texto suficiente
  const shouldShowButton = combinedText.trim().length >= 5 && buttonState !== "hidden";
  
  // Atualizar estado do botão quando texto muda
  useEffect(() => {
    if (combinedText.trim().length >= 5 && !isProcessing) {
      setButtonState("normal");
    } else if (combinedText.trim().length < 5) {
      setButtonState("hidden");
    }
  }, [combinedText, isProcessing]);

  const charCount = textInput.length;
  const maxChars = 200;

  const getButtonContent = () => {
    switch (buttonState) {
      case "loading":
        return (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>🤖 Processando...</span>
          </>
        );
      case "success":
        return <span>✅ Adicionado!</span>;
      case "error":
        return <span>❌ Erro - Tente novamente</span>;
      default:
        return <span>✨ Adicionar Compromisso</span>;
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto">
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
          {isListening ? "🎤 Gravando..." : "Falar"}
        </span>
      </div>

      {/* Separator */}
      <div className="flex items-center justify-center gap-3 w-full">
        <div className="flex-1 h-px bg-border max-w-[100px]" />
        <span className="text-muted-foreground font-medium">ou</span>
        <div className="flex-1 h-px bg-border max-w-[100px]" />
      </div>

      {/* Text Input */}
      <div className="flex flex-col gap-3 w-full">
        <div className="relative">
          <div className="absolute left-4 top-4 text-2xl pointer-events-none">✏️</div>
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value.slice(0, maxChars))}
            onKeyDown={handleKeyDown}
            placeholder="Digite aqui: 'Aniversário da Maria dia 25' ou 'Consulta amanhã 14h'"
            disabled={isProcessing || isListening}
            className="min-h-[80px] text-lg pl-12 pr-4 py-4 resize-none border-2 focus:border-primary transition-colors"
          />
          <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">
            {charCount}/{maxChars}
          </div>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Dica: Enter para adicionar • Mínimo 5 caracteres
        </div>
      </div>

      {/* Action Button - Aparece quando há texto */}
      {shouldShowButton && (
        <Button
          onClick={handleAddCommitment}
          disabled={isProcessing || buttonState === "success" || combinedText.length < 5}
          size="lg"
          className={`
            w-full h-14 text-lg font-semibold gap-3 shadow-lg hover:shadow-xl
            transition-all duration-300 ease-out animate-fade-in
            ${buttonState === "success" ? "bg-green-600 hover:bg-green-600" : ""}
            ${buttonState === "error" ? "bg-destructive hover:bg-destructive" : ""}
            active:scale-95
          `}
        >
          {getButtonContent()}
        </Button>
      )}

      {/* Processing State - Apenas visual adicional */}
      {isProcessing && buttonState === "loading" && (
        <div className="flex items-center gap-3 text-primary animate-fade-in">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Analisando seu compromisso...</span>
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
              disabled={isProcessing || isListening}
              className="px-4 py-2 text-sm bg-muted hover:bg-accent text-foreground rounded-lg transition-colors border border-border hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed hover-scale"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};