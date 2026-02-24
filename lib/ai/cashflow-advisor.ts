import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TreasuryEngine, ProjectedMovement } from "@/lib/treasury-engine";

export class CashFlowAdvisor {
    private modelName: string = "openai:gpt-4o";

    private async getTools(orgId: string) {
        const supabase = await createClient();

        const getMetrics = tool(
            async () => {
                const { data: trans } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId);
                const totalBalance = trans?.reduce((acc, t) => acc + t.monto, 0) || 0;
                const monthlyBurn = trans?.filter(t => t.monto < 0).reduce((acc, t) => acc + Math.abs(t.monto), 0) || 0;

                return {
                    totalBalance,
                    monthlyBurn,
                    dailyBurn: monthlyBurn / 30,
                    opportunityCost: totalBalance * 0.05
                };
            },
            {
                name: "get_current_metrics",
                description: "Obtiene las métricas actuales de la empresa: saldo operativo, burn-rate mensual y costo de oportunidad.",
                schema: z.object({})
            }
        );

        const getProjections = tool(
            async () => {
                const { data: invoices } = await supabase.from('comprobantes').select('*').eq('organization_id', orgId).neq('estado', 'pagado');
                const { data: config } = await supabase.from('configuracion_empresa').select('colchon_liquidez').eq('organization_id', orgId).single();
                const { data: trans } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId);
                const currentBalance = trans?.reduce((acc, t) => acc + t.monto, 0) || 0;

                const projection = TreasuryEngine.projectDailyBalance(currentBalance, invoices as any, [], config?.colchon_liquidez || 0);
                return projection;
            },
            {
                name: "get_future_projections",
                description: "Analiza el flujo de caja proyectado a 30 días basándose en facturas pendientes.",
                schema: z.object({})
            }
        );

        const simulateWhatIf = tool(
            async ({ excludedInvoiceId, newMovements }) => {
                const { data: invoices } = await supabase.from('comprobantes').select('*').eq('organization_id', orgId).neq('estado', 'pagado');
                const { data: config } = await supabase.from('configuracion_empresa').select('colchon_liquidez').eq('organization_id', orgId).single();
                const { data: trans } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId);
                const currentBalance = trans?.reduce((acc, t) => acc + t.monto, 0) || 0;

                const filteredInvoices = excludedInvoiceId ? invoices?.filter(i => i.id !== excludedInvoiceId) : invoices;
                const projects: ProjectedMovement[] = newMovements?.map(m => ({
                    id: 'temp-' + Math.random(),
                    descripcion: m.descripcion,
                    monto: m.monto,
                    fecha: m.fecha,
                    isProjected: true
                })) || [];

                const projection = TreasuryEngine.projectDailyBalance(currentBalance, filteredInvoices as any, projects, config?.colchon_liquidez || 0);
                return {
                    impact: "Simulación completada",
                    newProjection: projection.slice(0, 5)
                };
            },
            {
                name: "simulate_what_if",
                description: "Simula el impacto en el flujo de caja si una factura se atrasa o se cancela.",
                schema: z.object({
                    excludedInvoiceId: z.string().optional(),
                    newMovements: z.array(z.object({
                        descripcion: z.string(),
                        monto: z.number(),
                        fecha: z.string()
                    })).optional()
                })
            }
        );

        const getScoring = tool(
            async ({ cuit, razonSocial }) => {
                return TreasuryEngine.getClientRating(cuit, razonSocial);
            },
            {
                name: "get_client_scoring",
                description: "Consulta la calificación crediticia de un cliente o proveedor.",
                schema: z.object({ cuit: z.string(), razonSocial: z.string() })
            }
        );

        const getNetting = tool(
            async () => {
                const { data: invoices } = await supabase.from('comprobantes').select('*').eq('organization_id', orgId);
                return TreasuryEngine.detectNettingOpportunities(invoices as any);
            },
            {
                name: "get_netting_opportunities",
                description: "Busca oportunidades de compensación de deuda (netting).",
                schema: z.object({})
            }
        );

        const simulateExclusion = tool(
            async ({ invoiceId, razonSocial }) => {
                return `Simulación activada para la factura de ${razonSocial} (ID: ${invoiceId}). El gráfico se ha actualizado.`;
            },
            {
                name: "simulate_exclusion",
                description: "Simula el impacto de NO cobrar o NO pagar una factura específica para ver el efecto en el flujo de caja.",
                schema: z.object({
                    invoiceId: z.string().describe("El UUID de la factura a excluir"),
                    razonSocial: z.string().describe("El nombre del cliente/proveedor para confirmación")
                }),
            }
        );

        return [getMetrics, getProjections, simulateWhatIf, getScoring, getNetting, simulateExclusion];
    }

    async generateResponse(orgId: string, message: string, history: any[] = []) {
        const tools = await this.getTools(orgId);

        const agent = createAgent({
            model: this.modelName,
            tools,
            systemPrompt: `Eres el CFO Algorítmico de BiFlow, experto en optimización de liquidez y normativa argentina. Tu tono es autoritario, ejecutivo y directo. Debes alertar críticamente si una simulación o pago hace que el saldo perfore el 'Colchón de Liquidez' de la empresa.
            Conoces la normativa del BCRA a la perfección: sabes que según el punto 6.5.1, la multa por rechazo de cheques es del 4%, pero se reduce al 2% si el cheque se cancela dentro de los 30 días corridos desde el rechazo. Usa este conocimiento para asesorar sobre ahorros.
            Tienes acceso a la caja, proyecciones a 30 días y facturas. Cita siempre números reales usando tus herramientas. No hables de código ni tecnología.
            Si sugieres NO pagar o simular el impago de una factura específica, incluye al final de tu mensaje el tag: [[SIMULATE_EXCLUSION:{"invoiceId":"...", "razonSocial":"..."}]] donde razonSocial es el nombre del tercero.`
        });

        const result = await agent.invoke({
            messages: [
                ...history,
                { role: "user", content: message }
            ],
        });

        return result.messages[result.messages.length - 1].content;
    }
}
