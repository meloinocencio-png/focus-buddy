-- Adicionar colunas para onboarding no usuario_stats
ALTER TABLE public.usuario_stats 
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
ADD COLUMN IF NOT EXISTS onboarding_skipped boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS first_event_source text;

-- Comentários para documentação
COMMENT ON COLUMN public.usuario_stats.onboarding_completed_at IS 'Timestamp quando completou onboarding no app';
COMMENT ON COLUMN public.usuario_stats.onboarding_skipped IS 'Se pulou o onboarding';
COMMENT ON COLUMN public.usuario_stats.first_event_source IS 'Origem do primeiro evento: onboarding, dashboard, whatsapp';