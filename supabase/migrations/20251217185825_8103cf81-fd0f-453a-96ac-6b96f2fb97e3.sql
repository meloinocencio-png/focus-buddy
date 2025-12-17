-- Add travel time columns to eventos table
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS tempo_viagem_minutos integer;
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS ultimo_calculo_viagem timestamp with time zone;
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS origem_viagem text;

-- Create index for efficient travel calculation queries
CREATE INDEX IF NOT EXISTS idx_eventos_calcular_viagem 
  ON public.eventos(data) 
  WHERE endereco IS NOT NULL AND status = 'pendente';