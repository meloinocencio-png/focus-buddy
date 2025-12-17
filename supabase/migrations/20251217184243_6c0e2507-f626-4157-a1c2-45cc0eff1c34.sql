-- ═══════════════════════════════════════════════════════════
-- TABELA: eventos_recorrencia - Regras de eventos recorrentes
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.eventos_recorrencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_original_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL,
  frequencia text NOT NULL CHECK (frequencia IN ('diario', 'semanal', 'mensal')),
  intervalo int DEFAULT 1 CHECK (intervalo > 0),
  dias_semana int[] DEFAULT NULL,
  dia_mes int DEFAULT NULL CHECK (dia_mes IS NULL OR (dia_mes >= 1 AND dia_mes <= 31)),
  data_inicio date NOT NULL,
  data_fim date DEFAULT NULL,
  numero_ocorrencias int DEFAULT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Comentário
COMMENT ON TABLE public.eventos_recorrencia IS 'Regras de eventos que se repetem periodicamente';

-- Índices
CREATE INDEX IF NOT EXISTS idx_recorrencia_usuario ON public.eventos_recorrencia(usuario_id);
CREATE INDEX IF NOT EXISTS idx_recorrencia_ativo ON public.eventos_recorrencia(ativo) WHERE ativo = true;

-- RLS
ALTER TABLE public.eventos_recorrencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas recorrências"
  ON public.eventos_recorrencia FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema pode criar recorrências"
  ON public.eventos_recorrencia FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sistema pode atualizar recorrências"
  ON public.eventos_recorrencia FOR UPDATE
  USING (true);

CREATE POLICY "Usuários podem deletar suas recorrências"
  ON public.eventos_recorrencia FOR DELETE
  USING (auth.uid() = usuario_id);

-- ═══════════════════════════════════════════════════════════
-- TABELA: eventos_ocorrencia - Vínculo de ocorrências à série
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.eventos_ocorrencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorrencia_id uuid NOT NULL REFERENCES public.eventos_recorrencia(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  data_ocorrencia date NOT NULL,
  excluido boolean DEFAULT false,
  criado_em timestamptz DEFAULT now()
);

-- Comentário
COMMENT ON TABLE public.eventos_ocorrencia IS 'Vínculos entre eventos individuais e suas séries recorrentes';

-- Índices
CREATE INDEX IF NOT EXISTS idx_ocorrencia_recorrencia ON public.eventos_ocorrencia(recorrencia_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencia_evento ON public.eventos_ocorrencia(evento_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencia_data ON public.eventos_ocorrencia(data_ocorrencia);

-- RLS
ALTER TABLE public.eventos_ocorrencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas ocorrências"
  ON public.eventos_ocorrencia FOR SELECT
  USING (
    recorrencia_id IN (
      SELECT id FROM public.eventos_recorrencia WHERE usuario_id = auth.uid()
    )
  );

CREATE POLICY "Sistema pode gerenciar ocorrências"
  ON public.eventos_ocorrencia FOR ALL
  USING (true);

-- ═══════════════════════════════════════════════════════════
-- COLUNAS EXTRAS NA TABELA eventos
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS recorrencia_id uuid REFERENCES public.eventos_recorrencia(id) ON DELETE SET NULL;
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS eh_recorrente boolean DEFAULT false;

-- Índice para busca de eventos recorrentes
CREATE INDEX IF NOT EXISTS idx_eventos_recorrencia ON public.eventos(recorrencia_id) WHERE recorrencia_id IS NOT NULL;