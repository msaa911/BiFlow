-- RPC para eliminar todas las notas bancarias de una organización
-- Puede filtrarse por cuenta bancaria específica
CREATE OR REPLACE FUNCTION delete_all_bank_notes(p_org_id uuid, p_account_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count integer;
BEGIN
    -- 1. Resetear transacciones vinculadas
    -- Usamos un join implícito para encontrar las transacciones que apuntan a las notas que vamos a borrar
    UPDATE public.transacciones t
    SET 
        comprobante_id = NULL,
        estado = 'pendiente',
        metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
            'reverted_at', now(),
            'reversal_source', 'bulk_bank_note_delete'
        )
    FROM public.comprobantes c
    WHERE t.comprobante_id = c.id
    AND c.organization_id = p_org_id
    AND c.tipo IN ('ndb_bancaria', 'ncb_bancaria')
    AND (p_account_id IS NULL OR (c.metadata->>'cuenta_id')::uuid = p_account_id);

    -- 2. Eliminar las notas
    WITH deleted AS (
        DELETE FROM public.comprobantes
        WHERE organization_id = p_org_id
        AND tipo IN ('ndb_bancaria', 'ncb_bancaria')
        AND (p_account_id IS NULL OR (metadata->>'cuenta_id')::uuid = p_account_id)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN jsonb_build_object(
        'status', 'success', 
        'deleted_count', v_count,
        'method', 'delete_all_bank_notes_v1.0'
    );
END;
$$;
