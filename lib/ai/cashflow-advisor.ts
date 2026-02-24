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

        return [getMetrics, getProjections, simulateWhatIf, getScoring, getNetting];
    }

    async generateResponse(orgId: string, message: string, history: any[] = []) {
        const tools = await this.getTools(orgId);

        const agent = createAgent({
            llm: this.modelName,
            tools,
            prompt: `Eres el CFO Algorítmico de BiFlow. Tienes acceso a la caja, proyecciones a 30 días y facturas de la empresa. 
            Tu objetivo es proteger la liquidez. Eres experto en la normativa del BCRA de Argentina: sabes que el recargo por falta de fondos es del 4% bajando al 2% si se cancela en 30 días, y que los cheques comunes solo admiten 1 endoso. 
            Responde con concisión ejecutiva y lanza alerta roja si un pago rompe el 'Colchón de Liquidez'. 
            Cita siempre números reales usando tus herramientas. No hables de código ni tecnología.`
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
