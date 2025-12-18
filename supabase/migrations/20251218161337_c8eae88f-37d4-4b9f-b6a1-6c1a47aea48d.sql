-- Adicionar colunas para métricas de ativação do onboarding
ALTER TABLE whatsapp_usuarios 
ADD COLUMN IF NOT EXISTS primeiro_evento_criado_em timestamptz,
ADD COLUMN IF NOT EXISTS tempo_ate_ativacao_segundos integer;

-- Comentários para documentação
COMMENT ON COLUMN whatsapp_usuarios.primeiro_evento_criado_em IS 'Timestamp do primeiro evento criado pelo usuário';
COMMENT ON COLUMN whatsapp_usuarios.tempo_ate_ativacao_segundos IS 'Tempo em segundos desde cadastro até criar primeiro evento';