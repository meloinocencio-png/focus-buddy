-- Adicionar coluna para armazenar checklist de itens necessários
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN eventos.checklist IS 'Lista de itens para levar/preparar antes do evento';