import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TreasuryEngine, ProjectedMovement } from "@/lib/treasury-engine";

export class CashFlowAdvisor {
    private modelName: string = "gpt-4o";

    private async getTools(orgId: string) {
        const supabase = await createClient();

        const getMetrics = tool(
            async () => {
                const { data: trans } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId);
                const totalBalance = trans?.reduce((acc: any, t: any) => acc + t.monto, 0) || 0;
                const monthlyBurn = trans?.filter((t: any) => t.monto < 0).reduce((acc: any, t: any) => acc + Math.abs(t.monto), 0) || 0;

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
                const currentBalance = trans?.reduce((acc: any, t: any) => acc + t.monto, 0) || 0;

                const projection = TreasuryEngine.projectDailyBalance(currentBalance, invoices as any, [], config?.colchon_liquidez || 0);
                return projection.slice(0, 15);
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
                const currentBalance = trans?.reduce((acc: any, t: any) => acc + t.monto, 0) || 0;

                const filteredInvoices = excludedInvoiceId ? invoices?.filter((i: any) => i.id !== excludedInvoiceId) : invoices;
                const projects: ProjectedMovement[] = newMovements?.map((m: any) => ({
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
                description: "Busca oportunidades de compensación de deuda (netting) cruzando cuentas por cobrar y pagar.",
                schema: z.object({})
            }
        );

        const applyNettingAction = tool(
            async ({ invoiceIdAr, invoiceIdAp, amount }) => {
                try {
                    await supabase.from('comprobantes').update({ estado: 'compensado' }).in('id', [invoiceIdAr, invoiceIdAp]);
                    return { status: "success", message: `Compensación de $${amount} aplicada exitosamente entre las facturas ${invoiceIdAr} y ${invoiceIdAp}.` };
                } catch (e: any) {
                    return { status: "error", message: e.message };
                }
            },
            {
                name: "apply_netting_action",
                description: "Aplica de verdad una compensación en la base de datos entre una factura de venta (AR) y una de compra (AP).",
                schema: z.object({
                    invoiceIdAr: z.string(),
                    invoiceIdAp: z.string(),
                    amount: z.number()
                })
            }
        );

        const updateLiquidityCushion = tool(
            async ({ newAmount }) => {
                const { error } = await supabase.from('configuracion_empresa').update({ colchon_liquidez: newAmount }).eq('organization_id', orgId);
                if (error) return { status: "error", message: error.message };
                return { status: "success", message: `Colchón de liquidez actualizado a $${newAmount} exitosamente.` };
            },
            {
                name: "update_liquidity_cushion",
                description: "Actualiza de verdad el valor del colchón de liquidez en la configuración de la empresa.",
                schema: z.object({
                    newAmount: z.number()
                })
            }
        );

        const analyzeAnomalies = tool(
            async () => {
                const { data: anomalies } = await supabase.from('transacciones').select('id, descripcion, monto, tags, fecha').eq('organization_id', orgId).or('tags.cs.{"alerta_precio"},tags.cs.{"posible_duplicado"},tags.cs.{"riesgo_bec"}').order('fecha', { ascending: false }).limit(5);
                return anomalies || [];
            },
            {
                name: "analyze_anomalies",
                description: "Busca las últimas anomalías financieras (comisiones duplicadas, riesgos BEC, alertas de precio) para analizarlas con el usuario.",
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

        return [getMetrics, getProjections, simulateWhatIf, getScoring, getNetting, simulateExclusion, applyNettingAction, updateLiquidityCushion, analyzeAnomalies];
    }

    async generateResponse(orgId: string, message: string, history: any[] = [], contextSummary: string = "") {
        const tools = await this.getTools(orgId);

        const systemPrompt = `Eres el CFO Algorítmico de BiFlow (Modo Dios), un agente experto en optimización de liquidez, normativa argentina y análisis forense. Tu tono es autoritario, ejecutivo, directo pero muy empático con el fundador. Eres capaz de ejecutar acciones en la base de datos si el usuario te lo pide (usando tus herramientas).
            
            Contexto Inyectado de la Empresa ahora mismo:
            ${contextSummary}
            
            Conoces la normativa del BCRA a la perfección (ej. multas por rechazo de cheques del 4%, reducibles al 2% si se cancelan en 30 días). Usa este conocimiento para asesorar sobre ahorros.
            
            Usa el siguiente formato para generar Tarjetas Ricas en la interfaz de usuario cuando sea apropiado (CÓPIALO EXACTAMENTE ASÍ):
            Para alertas críticas de riesgo: [[ALERT:{"title":"Riesgo BEC","message":"Se detectó un IBAN sospechoso en un pago."}]]
            Para mostrar una métrica clave (como una actualización exitosa de colchón): [[METRIC:{"label":"Colchón de Liquidez","value":"$1.500.000","trend":"+Aumentado"}]]
            Para sugerir una simulación (ej. excluir una factura): [[SUGGESTION:{"invoiceId":"uuid-aquí", "razonSocial":"Nombre Proveedor", "descripcion":"Simular exclusión", "monto": -50000}]]
            Para sugerir una acción real (ej. ejecutar compensación de deudas): [[ACTION:{"actionType":"NETTING", "label":"Aplicar Neteo", "payload":{"invoiceIdAr":"...", "invoiceIdAp":"...", "amount":10000}}]]
            
            Siéntete libre de incluir estos tags ricos al final de tu mensaje en texto plano para que el frontend los parsee. No hables de código ni tecnología.`;

        try {
            const llm = new ChatOpenAI({
                modelName: this.modelName,
                temperature: 0,
                openAIApiKey: process.env.OPENAI_API_KEY
            });

            const agent = createAgent({
                llm,
                tools,
                systemPrompt
            });

            const formattedHistory = history.map(h => ({
                role: h.role === 'user' ? 'human' : 'ai',
                content: h.content
            }));

            const result = await agent.invoke({
                messages: [
                    ...formattedHistory,
                    { role: "human", content: message }
                ]
            });

            // En esta versión, result suele contener los mensajes finales. 
            // Buscamos el último mensaje de la IA.
            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content;
        } catch (error: any) {
            console.error("AI Advisor Error:", error);
            if (error.message && error.message.includes('OPENAI_API_KEY')) {
                return "Error Crítico 500: API Key de OpenAI no configurada en las variables de entorno del servidor. Por favor, configura OPENAI_API_KEY.";
            }
            return "El servidor de inteligencia financiera está experimentando intermitencias. Reintente en unos instantes.";
        }
    }
}

