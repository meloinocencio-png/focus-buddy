-- Criar tabela de mapeamento WhatsApp → Usuário
CREATE TABLE public.whatsapp_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  whatsapp text NOT NULL UNIQUE,
  nome text,
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_usuarios ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver próprios números"
  ON public.whatsapp_usuarios FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema pode ler para validação"
  ON public.whatsapp_usuarios FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem atualizar próprios números"
  ON public.whatsapp_usuarios FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir próprios números"
  ON public.whatsapp_usuarios FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- Índice para busca rápida por WhatsApp
CREATE INDEX idx_whatsapp_usuarios_whatsapp ON public.whatsapp_usuarios(whatsapp);