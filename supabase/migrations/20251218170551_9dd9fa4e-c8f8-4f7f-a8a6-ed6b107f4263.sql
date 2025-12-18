-- Adicionar colunas para anti-spam inteligente
ALTER TABLE lembretes_enviados 
ADD COLUMN IF NOT EXISTS lido_em timestamptz,
ADD COLUMN IF NOT EXISTS zapi_message_id text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'enviado',
ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lembretes_enviados_zapi_message_id
ON lembretes_enviados(zapi_message_id);

CREATE INDEX IF NOT EXISTS idx_lembretes_enviados_usuario_enviado
ON lembretes_enviados(usuario_id, enviado_em DESC);