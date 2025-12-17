-- ═══════════════════════════════════════════════════════════
-- TABELA: locais_favoritos - Endereços salvos com apelidos
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS locais_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  apelido text NOT NULL,
  endereco text NOT NULL,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(usuario_id, apelido)
);

-- Índice para performance
CREATE INDEX idx_locais_favoritos_usuario ON locais_favoritos(usuario_id);

-- Comentário
COMMENT ON TABLE locais_favoritos IS 'Endereços salvos com apelidos para reutilização em eventos';

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE locais_favoritos ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver seus locais
CREATE POLICY "Usuários podem ver seus locais"
  ON locais_favoritos FOR SELECT
  USING (auth.uid() = usuario_id);

-- Política: Usuários podem criar seus locais
CREATE POLICY "Usuários podem criar seus locais"
  ON locais_favoritos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- Política: Usuários podem atualizar seus locais
CREATE POLICY "Usuários podem atualizar seus locais"
  ON locais_favoritos FOR UPDATE
  USING (auth.uid() = usuario_id);

-- Política: Usuários podem deletar seus locais
CREATE POLICY "Usuários podem deletar seus locais"
  ON locais_favoritos FOR DELETE
  USING (auth.uid() = usuario_id);

-- Política: Sistema pode ler locais (para webhook)
CREATE POLICY "Sistema pode ler locais para webhook"
  ON locais_favoritos FOR SELECT
  USING (true);

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: Atualizar timestamp automaticamente
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION atualizar_timestamp_locais()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_locais
  BEFORE UPDATE ON locais_favoritos
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_locais();