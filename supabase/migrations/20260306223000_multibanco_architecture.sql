-- Migration: Multibanco Architecture Support
-- Description: Adds account segregation and per-account agreement parameters.
-- Date: 2026-03-06

-- 1. Update cuentas_bancarias with agreement parameters
ALTER TABLE public.cuentas_bancarias 
ADD COLUMN IF NOT EXISTS colchon_liquidez NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS limite_descubierto NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS mantenimiento_pactado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS comision_cheque NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.cuentas_bancarias.colchon_liquidez IS 'Monto mínimo a mantener en cuenta (no se considera ocioso)';
COMMENT ON COLUMN public.cuentas_bancarias.limite_descubierto IS 'Límite de giro en descubierto acordado con el banco';
COMMENT ON COLUMN public.cuentas_bancarias.mantenimiento_pactado IS 'Costo mensual de mantenimiento de cuenta ($/mes)';
COMMENT ON COLUMN public.cuentas_bancarias.comision_cheque IS 'Porcentaje de comisión por depósito de cheques (%)';

ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE public.archivos_importados
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE public.comprobantes
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transacciones_cuenta ON public.transacciones(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_archivos_importados_cuenta ON public.archivos_importados(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_cuenta ON public.comprobantes(cuenta_id);

-- 3. Data Migration: Pull existing global agreements into the first bank account found for each org
DO $$ 
DECLARE 
    r RECORD;
    target_account_id UUID;
BEGIN
    FOR r IN SELECT * FROM public.configuracion_empresa LOOP
        -- Find the first account for this organization
        SELECT id INTO target_account_id 
        FROM public.cuentas_bancarias 
        WHERE organization_id = r.organization_id 
        LIMIT 1;

        IF target_account_id IS NOT NULL THEN
            -- Update the account with data from configuracion_empresa and convenios_bancarios
            UPDATE public.cuentas_bancarias 
            SET 
                colchon_liquidez = r.colchon_liquidez,
                limite_descubierto = r.limite_descubierto
            WHERE id = target_account_id;

            -- Try to pull from convenios_bancarios if exists
            UPDATE public.cuentas_bancarias cb
            SET 
                mantenimiento_pactado = conv.mantenimiento_mensual_pactado,
                comision_cheque = conv.comision_cheque_porcentaje
            FROM public.convenios_bancarios conv
            WHERE cb.id = target_account_id 
            AND conv.organization_id = cb.organization_id;
        END IF;
    END LOOP;
END $$;

-- 4. Clean up: (Optional) We keep the old columns for now to avoid breaking existing code 
-- until the UI is fully updated, but we could eventually drop them.
-- For now, we only mark them as legacy.
COMMENT ON COLUMN public.configuracion_empresa.limite_descubierto IS 'LEGACY: User per-account instead';
COMMENT ON COLUMN public.configuracion_empresa.colchon_liquidez IS 'LEGACY: User per-account instead';
