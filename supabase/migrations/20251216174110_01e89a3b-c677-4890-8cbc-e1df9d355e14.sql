-- Adicionar coluna status na tabela eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente';

-- Comentário descritivo
COMMENT ON COLUMN eventos.status IS 'Status do evento: pendente, concluido, cancelado';

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_eventos_status ON eventos(status);