import { createClient } from './supabase/server';

export interface AuditFinding {
    organization_id: string;
    transaccion_id: string;
    tipo_error: 'COMISION_EXCEDIDA' | 'CARGO_NO_PACTADO' | 'TASA_FUERA_DE_RANGO';
    monto_esperado: number;
    monto_real: number;
    diferencia: number;
    notas_ia: string;
}

export class AuditEngine {
    /**
     * Compara una transacción contra los convenios vigentes.
     * Se enfoca en comisiones de cheques y mantenimientos de cuenta.
     */
    static async auditTransaction(transaction: any, agreement: any): Promise<AuditFinding | null> {
        const tags = transaction.tags || [];
        const montoAbs = Math.abs(transaction.monto);

        // 1. Auditoría de Mantenimiento de Cuenta
        if (tags.includes('mantenimiento')) {
            const pactado = agreement.mantenimiento_mensual_pactado || 0;
            if (montoAbs > pactado) {
                return {
                    organization_id: transaction.organization_id,
                    transaccion_id: transaction.id,
                    tipo_error: 'COMISION_EXCEDIDA',
                    monto_esperado: pactado,
                    monto_real: montoAbs,
                    diferencia: montoAbs - pactado,
                    notas_ia: `El mantenimiento cobrado ($${montoAbs}) excede el pactado ($${pactado}).`
                };
            }
        }

        // 2. Auditoría de Comisión de Cheque
        if (tags.includes('comision_cheque')) {
            const porcentajePactado = agreement.comision_cheque_porcentaje || 0;
            if (porcentajePactado === 0 && agreement.costo_por_cheque_fijo === 0) {
                return {
                    organization_id: transaction.organization_id,
                    transaccion_id: transaction.id,
                    tipo_error: 'CARGO_NO_PACTADO',
                    monto_esperado: 0,
                    monto_real: montoAbs,
                    diferencia: montoAbs,
                    notas_ia: 'Se detectó una comisión por cheque pero no hay un esquema de cobro pactado en el convenio.'
                };
            }
        }

        // 3. Auditoría de Comisiones Bancarias Genéricas
        if (tags.includes('comision_bancaria')) {
            // Si el mantenimiento o cheque no fueron capturados específicamente, pero hay comisiones genéricas,
            // validamos según políticas de la empresa (o simplemente reportamos como alerta si son montos altos).
            if (montoAbs > 5000 && !tags.includes('mantenimiento')) {
                return {
                    organization_id: transaction.organization_id,
                    transaccion_id: transaction.id,
                    tipo_error: 'CARGO_NO_PACTADO',
                    monto_esperado: 0,
                    monto_real: montoAbs,
                    diferencia: montoAbs,
                    notas_ia: `Se detectó la comisión '${transaction.descripcion}' con un importe inusual ($${montoAbs}).`
                };
            }
        }

        // 4. Tasa de Descubierto (Alerta de exceso sobre lo pactado)
        if (tags.includes('comision_descubierto') || tags.includes('interes')) {
            const tasaPactada = agreement.tasa_descubierto_anual_pactada || 0;
            // Para auditar la tasa real necesitamos el saldo diario, pero si la tasa pactada es 0
            // y cobran interés, ya es un hallazgo.
            if (tasaPactada === 0 && montoAbs > 100) {
                return {
                    organization_id: transaction.organization_id,
                    transaccion_id: transaction.id,
                    tipo_error: 'CARGO_NO_PACTADO',
                    monto_esperado: 0,
                    monto_real: montoAbs,
                    diferencia: montoAbs,
                    notas_ia: `Se cobraron intereses/descubierto pero no figura una tasa pactada en tu convenio.`
                };
            }
        }

        return null;
    }

    /**
     * Procesa un lote de transacciones recién importadas
     */
    static async runAuditOnBatch(organizationId: string, transactionIds: string[]) {
        const supabase = await createClient();

        // Obtener el convenio activo
        const { data: agreement } = await supabase
            .from('convenios_bancarios')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .maybeSingle();

        if (!agreement) return;

        // Obtener las transacciones
        const { data: transactions } = await supabase
            .from('transacciones')
            .select('*')
            .in('id', transactionIds);

        if (!transactions) return;

        const findings: AuditFinding[] = [];

        for (const t of transactions) {
            const finding = await this.auditTransaction(t, agreement);
            if (finding) findings.push(finding);
        }

        if (findings.length > 0) {
            await supabase
                .from('hallazgos_auditoria')
                .insert(findings);
        }
    }
}
