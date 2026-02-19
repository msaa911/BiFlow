
-- Añadir columna de categoría para mejorar UI
ALTER TABLE public.tax_intelligence_rules ADD COLUMN categoria TEXT DEFAULT 'impuesto';
