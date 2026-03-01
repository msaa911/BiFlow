-- Migration: Add Bank Agreements and Commission Parameters
-- Date: 2026-03-01
-- Description: Extends company configuration to support maintenance fees and check commissions.

ALTER TABLE public.configuracion_empresa 
ADD COLUMN IF NOT EXISTS mantenimiento_pactado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS comision_cheque_porcentaje NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.configuracion_empresa.mantenimiento_pactado IS 'Costo mensual de mantenimiento de cuenta acordado con el banco';
COMMENT ON COLUMN public.configuracion_empresa.comision_cheque_porcentaje IS 'Porcentaje de comisión que cobra el banco por depósito de cheques (ej: 0.015 para 1.5%)';
