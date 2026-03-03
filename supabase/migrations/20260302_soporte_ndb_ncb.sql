-- Migration: Soporte para NDB/NCB y Desgloses Contables
-- Date: 2026-03-02
-- Description: Agrega clase_documento para diferenciar OP/Recibo de Notas Bancarias y soporta desgloses en metadata.

ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS clase_documento text CHECK (clase_documento IN ('OP', 'Recibo', 'NDB', 'NCB'));

-- Comentario para el futuro: El desglose se almacenará en el campo 'metadata' 
-- con una estructura: { "desglose": [ { "concepto": "IVA", "monto": 2100, "tipo": "activo" }, ... ] }
