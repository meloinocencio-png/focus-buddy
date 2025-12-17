-- Index for active reminders (tipo = lembrete)
CREATE INDEX IF NOT EXISTS idx_eventos_lembrete_ativo 
  ON eventos(tipo, status, criado_em) 
  WHERE tipo = 'lembrete' AND status = 'pendente';

-- Table for follow-up tracking
CREATE TABLE IF NOT EXISTS lembretes_followup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL,
  whatsapp text NOT NULL,
  
  -- Counters
  tentativas int DEFAULT 0,
  ultima_pergunta timestamptz,
  proxima_pergunta timestamptz NOT NULL,
  
  -- Time scale (minutes)
  intervalo_atual int DEFAULT 180,
  
  -- Limits
  max_tentativas int DEFAULT 10,
  max_dias int DEFAULT 7,
  data_limite timestamptz,
  
  -- Status
  ativo boolean DEFAULT true,
  concluido boolean DEFAULT false,
  
  -- Metadata
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Indexes for follow-up
CREATE INDEX idx_followup_proxima ON lembretes_followup(proxima_pergunta) 
  WHERE ativo = true AND concluido = false;
CREATE INDEX idx_followup_evento ON lembretes_followup(evento_id);
CREATE INDEX idx_followup_usuario ON lembretes_followup(usuario_id);

COMMENT ON TABLE lembretes_followup IS 'Acompanhamento de lembretes persistentes com follow-up';

-- Enable RLS
ALTER TABLE lembretes_followup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus follow-ups"
  ON lembretes_followup FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema pode gerenciar follow-ups"
  ON lembretes_followup FOR ALL
  USING (true);

-- Trigger for timestamp update
CREATE OR REPLACE FUNCTION atualizar_timestamp_followup()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_atualizar_followup
  BEFORE UPDATE ON lembretes_followup
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_followup();

-- Table for response history
CREATE TABLE IF NOT EXISTS lembretes_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id uuid NOT NULL REFERENCES lembretes_followup(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  
  -- User response
  resposta_usuario text NOT NULL,
  resposta_classificada text,
  
  -- Metadata
  respondido_em timestamptz DEFAULT now()
);

CREATE INDEX idx_respostas_followup ON lembretes_respostas(followup_id);

COMMENT ON TABLE lembretes_respostas IS 'Histórico de respostas aos lembretes';

-- Enable RLS for respostas
ALTER TABLE lembretes_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sistema pode gerenciar respostas"
  ON lembretes_respostas FOR ALL
  USING (true);