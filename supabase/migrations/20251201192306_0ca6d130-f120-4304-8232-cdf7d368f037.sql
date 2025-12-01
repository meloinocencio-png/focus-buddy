-- Criar tabela de eventos
CREATE TABLE IF NOT EXISTS public.eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('aniversario', 'compromisso', 'tarefa', 'saude')),
  titulo text NOT NULL,
  descricao text,
  data timestamp with time zone NOT NULL,
  pessoa text,
  lembretes jsonb DEFAULT '[]'::jsonb,
  criado_em timestamp with time zone DEFAULT now(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuários só podem ver/editar seus próprios eventos
CREATE POLICY "Usuários podem ver seus próprios eventos"
  ON public.eventos FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem criar seus próprios eventos"
  ON public.eventos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar seus próprios eventos"
  ON public.eventos FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem deletar seus próprios eventos"
  ON public.eventos FOR DELETE
  USING (auth.uid() = usuario_id);

-- Criar índice para busca por data e usuário
CREATE INDEX idx_eventos_usuario_data ON public.eventos(usuario_id, data);

-- Criar tabela de lembretes enviados
CREATE TABLE IF NOT EXISTS public.lembretes_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  enviado_em timestamp with time zone DEFAULT now(),
  tipo_lembrete text NOT NULL CHECK (tipo_lembrete IN ('7d', '3d', '1d', 'hoje'))
);

-- Habilitar RLS
ALTER TABLE public.lembretes_enviados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuários podem ver lembretes dos seus eventos
CREATE POLICY "Usuários podem ver lembretes dos seus eventos"
  ON public.lembretes_enviados FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.eventos
      WHERE eventos.id = lembretes_enviados.evento_id
      AND eventos.usuario_id = auth.uid()
    )
  );

CREATE POLICY "Sistema pode criar lembretes"
  ON public.lembretes_enviados FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.eventos
      WHERE eventos.id = lembretes_enviados.evento_id
      AND eventos.usuario_id = auth.uid()
    )
  );

-- Criar índice para otimizar buscas
CREATE INDEX idx_lembretes_evento ON public.lembretes_enviados(evento_id);