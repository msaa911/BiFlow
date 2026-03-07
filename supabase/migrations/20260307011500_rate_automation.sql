-- 1. Función para propagar tasas automáticamente
CREATE OR REPLACE FUNCTION public.fn_propagar_tasas_mercado()
RETURNS TRIGGER AS $$
DECLARE
    empresa RECORD;
    nueva_tna NUMERIC;
BEGIN
    -- Recorremos todas las empresas que están en modo AUTOMATICO
    FOR empresa IN 
        SELECT id, tasa_referencia_auto 
        FROM public.configuracion_empresa 
        WHERE modo_tasa = 'AUTOMATICO'
    LOOP
        -- Determinamos la nueva TNA según la referencia de la empresa
        IF empresa.tasa_referencia_auto = 'PLAZO_FIJO' THEN
            nueva_tna := NEW.tasa_plazo_fijo;
        ELSIF empresa.tasa_referencia_auto = 'BADLAR' THEN
            nueva_tna := NEW.tasa_badlar;
        ELSE
            -- Intentamos buscar en el mapa de bancos individuales
            IF NEW.tasas_bancos ? empresa.tasa_referencia_auto THEN
                nueva_tna := (NEW.tasas_bancos->>empresa.tasa_referencia_auto)::NUMERIC;
            ELSE
                nueva_tna := NULL;
            END IF;
        END IF;

        -- Actualizamos la empresa si hay tasa nueva
        IF nueva_tna IS NOT NULL THEN
            UPDATE public.configuracion_empresa 
            SET tna = nueva_tna,
                updated_at = now()
            WHERE id = empresa.id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger para disparar la propagación
DROP TRIGGER IF EXISTS tr_on_market_rates_update ON public.indices_mercado;
CREATE TRIGGER tr_on_market_rates_update
AFTER INSERT OR UPDATE ON public.indices_mercado
FOR EACH ROW
EXECUTE FUNCTION public.fn_propagar_tasas_mercado();

-- 3. Instrucción para Cron
-- Ejecutar en SQL Editor:
-- SELECT cron.schedule('sync-rates-daily', '0 5 * * *', $$ select net.http_post(url:='https://bnlmoupgzbtfgominzd.supabase.co/functions/v1/sync-bcra-rates', headers:='{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb) $$);
