-- Tabela para lembretes adiados (snooze)
CREATE TABLE IF NOT EXISTS public.lembretes_snooze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  whatsapp text NOT NULL,
  mensagem text NOT NULL,
  enviar_em timestamptz NOT NULL,
  enviado boolean DEFAULT false,
  evento_id uuid REFERENCES public.eventos(id) ON DELETE CASCADE,
  criado_em timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_lembretes_snooze_enviar_em 
  ON public.lembretes_snooze(enviar_em) WHERE NOT enviado;
CREATE INDEX idx_lembretes_snooze_usuario 
  ON public.lembretes_snooze(usuario_id);

-- Comentário
COMMENT ON TABLE public.lembretes_snooze IS 'Lembretes pontuais/adiados (snooze)';

-- RLS (Row Level Security)
ALTER TABLE public.lembretes_snooze ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver seus lembretes snooze"
  ON public.lembretes_snooze FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema pode inserir lembretes snooze"
  ON public.lembretes_snooze FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sistema pode atualizar lembretes snooze"
  ON public.lembretes_snooze FOR UPDATE
  USING (true);