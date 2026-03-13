-- ============================================================
-- Migration: Fix comprobantes constraints for bank notes (NDB/NCB)
-- Date: 2026-03-12
-- Reason: 
--   1. comprobantes_tipo_check was overwritten by 20260228_add_custom_invoice_types.sql
--      which removed 'ndb_bancaria' and 'ncb_bancaria' from the allowed values.
--   2. comprobantes_estado_check may not include 'conciliado' if 20260305 was not applied.
--
-- This migration is idempotent and sets both constraints to their correct final state.
-- ============================================================

BEGIN;

-- ── 1. Fix TIPO constraint ────────────────────────────────────────────────────
-- Drops whatever version exists and recreates with ALL valid types.
-- ndb_bancaria = Nota de Débito Bancaria (egreso del extracto)
-- ncb_bancaria = Nota de Crédito Bancaria (ingreso del extracto)

ALTER TABLE public.comprobantes 
    DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;

ALTER TABLE public.comprobantes 
    ADD CONSTRAINT comprobantes_tipo_check 
    CHECK (tipo IN (
        'factura_venta',
        'factura_compra',
        'nota_credito',
        'nota_debito',
        'ndb_bancaria',
        'ncb_bancaria',
        'ingreso_vario',
        'egreso_vario'
    ));

COMMENT ON COLUMN public.comprobantes.tipo IS 
    'Tipos de comprobante: '
    'factura_venta/factura_compra = facturas comerciales; '
    'nota_credito/nota_debito = NC/ND comerciales; '
    'ndb_bancaria = Nota de Débito Bancaria (egreso en extracto, sin OP); '
    'ncb_bancaria = Nota de Crédito Bancaria (ingreso en extracto, sin recibo); '
    'ingreso_vario/egreso_vario = ingresos/egresos varios manuales.';

-- ── 2. Fix ESTADO constraint ──────────────────────────────────────────────────
-- Ensures 'conciliado' is a valid state (required for bank notes).

ALTER TABLE public.comprobantes 
    DROP CONSTRAINT IF EXISTS comprobantes_estado_check;

ALTER TABLE public.comprobantes 
    ADD CONSTRAINT comprobantes_estado_check 
    CHECK (estado IN (
        'pendiente',
        'parcial',
        'pagado',
        'conciliado',
        'anulado'
    ));

COMMIT;
