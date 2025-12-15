-- Criar tabela de conversas para histórico do chat com Malu
CREATE TABLE public.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  whatsapp_de text NOT NULL,
  mensagem_usuario text NOT NULL,
  mensagem_malu text NOT NULL,
  contexto jsonb DEFAULT '[]'::jsonb,
  criada_em timestamptz DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX idx_conversas_whatsapp_de ON public.conversas(whatsapp_de);
CREATE INDEX idx_conversas_criada_em ON public.conversas(criada_em DESC);

-- Enable RLS
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ver suas próprias conversas
CREATE POLICY "Usuários podem ver suas próprias conversas"
ON public.conversas
FOR SELECT
TO authenticated
USING (auth.uid() = usuario_id);

-- Policy: Sistema (edge functions) pode inserir conversas - via service role
CREATE POLICY "Sistema pode inserir conversas"
ON public.conversas
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Policy: Sistema pode ler todas as conversas para contexto
CREATE POLICY "Sistema pode ler conversas por whatsapp"
ON public.conversas
FOR SELECT
TO anon
USING (true);