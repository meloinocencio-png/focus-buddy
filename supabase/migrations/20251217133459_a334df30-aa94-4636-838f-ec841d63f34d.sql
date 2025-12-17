-- Remover constraint antigo
ALTER TABLE lembretes_enviados 
DROP CONSTRAINT IF EXISTS lembretes_enviados_tipo_lembrete_check;

-- Criar novo constraint com todos os tipos necessários
ALTER TABLE lembretes_enviados 
ADD CONSTRAINT lembretes_enviados_tipo_lembrete_check 
CHECK (tipo_lembrete = ANY (ARRAY[
  '7d', '3d', '1d', 'hoje',
  '0d',
  '3h', '1h', '0min',
  '30min_checklist'
]));