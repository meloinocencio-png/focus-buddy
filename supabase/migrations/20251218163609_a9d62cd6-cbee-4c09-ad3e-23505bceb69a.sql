-- Adicionar constraint UNIQUE em usuario_id para upsert funcionar
-- Primeiro verificar se já existe uma constraint ou PK
DO $$
BEGIN
    -- Tentar adicionar a constraint UNIQUE
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'usuario_stats_usuario_id_key' 
        AND conrelid = 'public.usuario_stats'::regclass
    ) THEN
        ALTER TABLE public.usuario_stats 
        ADD CONSTRAINT usuario_stats_usuario_id_key UNIQUE (usuario_id);
    END IF;
END $$;