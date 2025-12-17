-- Corrigir search_path da função para evitar warning
CREATE OR REPLACE FUNCTION atualizar_timestamp_locais()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;