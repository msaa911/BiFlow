-- Migration: Check Audit Trail
-- Description: Creates a history table to track every status change in check instruments.

CREATE TABLE IF NOT EXISTS public.instrumentos_pago_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    instrumento_id UUID REFERENCES public.instrumentos_pago(id) ON DELETE CASCADE NOT NULL,
    estado_anterior text,
    estado_nuevo text NOT NULL,
    usuario_id UUID REFERENCES auth.users(id),
    motivo text,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.instrumentos_pago_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View check history" ON public.instrumentos_pago_historial 
FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = instrumentos_pago_historial.organization_id));

-- Trigger Function to log changes
CREATE OR REPLACE FUNCTION public.log_instrumento_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.estado IS DISTINCT FROM NEW.estado) THEN
        INSERT INTO public.instrumentos_pago_historial (
            organization_id,
            instrumento_id,
            estado_anterior,
            estado_nuevo,
            usuario_id,
            metadata
        ) VALUES (
            NEW.organization_id,
            NEW.id,
            OLD.estado,
            NEW.estado,
            auth.uid(),
            NEW.metadata
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS trg_log_instrumento_change ON public.instrumentos_pago;
CREATE TRIGGER trg_log_instrumento_change
AFTER UPDATE ON public.instrumentos_pago
FOR EACH ROW EXECUTE FUNCTION public.log_instrumento_change();

-- Initial history for existing instruments
INSERT INTO public.instrumentos_pago_historial (organization_id, instrumento_id, estado_nuevo, created_at)
SELECT organization_id, id, estado, created_at FROM public.instrumentos_pago
ON CONFLICT DO NOTHING;
