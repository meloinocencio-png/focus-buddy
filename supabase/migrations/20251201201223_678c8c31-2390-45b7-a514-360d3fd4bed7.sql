-- Criar tabela de configurações de lembretes
CREATE TABLE public.configuracao_lembretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hora_lembrete_diario TIME NOT NULL DEFAULT '07:00:00',
  whatsapp TEXT,
  notificacoes_ativas BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(usuario_id)
);

-- Habilitar RLS
ALTER TABLE public.configuracao_lembretes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para configuracao_lembretes
CREATE POLICY "Usuários podem ver suas próprias configurações"
  ON public.configuracao_lembretes
  FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas próprias configurações"
  ON public.configuracao_lembretes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias configurações"
  ON public.configuracao_lembretes
  FOR UPDATE
  USING (auth.uid() = usuario_id);

-- Criar tabela de notificações
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('lembrete', 'resumo', 'aniversario', 'compromisso', 'tarefa', 'atrasado')),
  lida BOOLEAN NOT NULL DEFAULT false,
  criada_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar índices para melhor performance
CREATE INDEX idx_notificacoes_usuario_id ON public.notificacoes(usuario_id);
CREATE INDEX idx_notificacoes_lida ON public.notificacoes(lida);
CREATE INDEX idx_notificacoes_criada_em ON public.notificacoes(criada_em DESC);

-- Habilitar RLS
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para notificacoes
CREATE POLICY "Usuários podem ver suas próprias notificações"
  ON public.notificacoes
  FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas próprias notificações"
  ON public.notificacoes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias notificações"
  ON public.notificacoes
  FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem deletar suas próprias notificações"
  ON public.notificacoes
  FOR DELETE
  USING (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at em configuracao_lembretes
CREATE OR REPLACE FUNCTION public.update_configuracao_lembretes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_configuracao_lembretes_updated_at_trigger
  BEFORE UPDATE ON public.configuracao_lembretes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_configuracao_lembretes_updated_at();