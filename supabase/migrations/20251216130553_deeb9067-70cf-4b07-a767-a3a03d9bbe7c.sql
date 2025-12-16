-- Adicionar coluna para armazenar ID único do Z-API
ALTER TABLE conversas ADD COLUMN zapi_message_id text UNIQUE;

-- Índice para busca rápida
CREATE INDEX idx_conversas_zapi_message_id ON conversas(zapi_message_id);

-- Documentação
COMMENT ON COLUMN conversas.zapi_message_id IS 'ID único da mensagem do Z-API para evitar duplicatas';