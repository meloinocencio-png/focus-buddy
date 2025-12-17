-- Tabela para estatísticas do usuário (streaks, total concluídos)
CREATE TABLE IF NOT EXISTS usuario_stats (
  usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dias_seguidos int DEFAULT 0,
  melhor_sequencia int DEFAULT 0,
  total_concluidos int DEFAULT 0,
  ultima_atividade date,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- RLS para usuario_stats
ALTER TABLE usuario_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas próprias stats"
  ON usuario_stats FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas próprias stats"
  ON usuario_stats FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias stats"
  ON usuario_stats FOR UPDATE
  USING (auth.uid() = usuario_id);

-- Função para atualizar streak quando evento é concluído
CREATE OR REPLACE FUNCTION atualizar_streak_usuario()
RETURNS TRIGGER AS $$
BEGIN
  -- Só atualiza se status mudou para 'concluido'
  IF NEW.status = 'concluido' AND (OLD.status IS NULL OR OLD.status != 'concluido') THEN
    INSERT INTO usuario_stats (usuario_id, total_concluidos, dias_seguidos, melhor_sequencia, ultima_atividade)
    VALUES (NEW.usuario_id, 1, 1, 1, CURRENT_DATE)
    ON CONFLICT (usuario_id) DO UPDATE SET
      total_concluidos = usuario_stats.total_concluidos + 1,
      dias_seguidos = CASE 
        WHEN usuario_stats.ultima_atividade = CURRENT_DATE - 1 THEN usuario_stats.dias_seguidos + 1
        WHEN usuario_stats.ultima_atividade = CURRENT_DATE THEN usuario_stats.dias_seguidos
        ELSE 1
      END,
      melhor_sequencia = GREATEST(
        usuario_stats.melhor_sequencia,
        CASE 
          WHEN usuario_stats.ultima_atividade = CURRENT_DATE - 1 THEN usuario_stats.dias_seguidos + 1
          WHEN usuario_stats.ultima_atividade = CURRENT_DATE THEN usuario_stats.dias_seguidos
          ELSE 1
        END
      ),
      ultima_atividade = CURRENT_DATE,
      atualizado_em = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para atualizar stats quando evento é atualizado
CREATE TRIGGER trigger_atualizar_streak
  AFTER UPDATE OF status ON eventos
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_streak_usuario();