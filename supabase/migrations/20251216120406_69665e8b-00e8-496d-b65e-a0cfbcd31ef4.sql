-- Adicionar coluna endereco na tabela eventos
ALTER TABLE eventos ADD COLUMN endereco text;

-- Comentário descritivo
COMMENT ON COLUMN eventos.endereco IS 'Endereço do compromisso para navegação (Waze/Google Maps)';