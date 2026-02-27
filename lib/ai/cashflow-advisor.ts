import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TreasuryEngine, ProjectedMovement } from "@/lib/treasury-engine";
import { ChatOpenAI } from "@langchain/openai";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

export class CashFlowAdvisor {
    private modelName: string = "gpt-4o";

    private async getTools(orgId: string) {
        const supabase = await createClient();

        const getMetrics = tool(
            async () => {
                const { data: trans } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId);
                const totalBalance = trans?.reduce((acc: any, t: any) => acc + t.monto, 0) || 0;
                const monthlyBurn = trans?.filter((t: any) => t.monto < 0).reduce((acc: any, t: any) => acc + Math.abs(t.monto), 0) || 0;

                return JSON.stringify({
                    totalBalance,
                    monthlyBurn,
                    dailyBurn: monthlyBurn / 30,
                    opportunityCost: totalBalance * 0.05
                });
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
                return JSON.stringify(projection.slice(0, 15)); // Send first 15 days to save context
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
                return JSON.stringify({
                    impact: "Simulación completada",
                    newProjection: projection.slice(0, 5)
                });
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
                const score = TreasuryEngine.getClientRating(cuit, razonSocial);
                return JSON.stringify(score);
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
                const netting = TreasuryEngine.detectNettingOpportunities(invoices as any);
                return JSON.stringify(netting);
            },
            {
                name: "get_netting_opportunities",
                description: "Busca oportunidades de compensación de deuda (netting) cruzando cuentas por cobrar y pagar.",
                schema: z.object({})
            }
        );

        const applyNettingAction = tool(
            async ({ invoiceIdAr, invoiceIdAp, amount }) => {
                // In a real scenario, this would create linked origin/application movements in the DB.
                // For safety in this demo, we'll mark the specific amounts as 'pagado' or reduce 'monto_pendiente'.
                // Just doing a simplified mock update for demonstration purposes of God Mode:
                try {
                    await supabase.from('comprobantes').update({ estado: 'compensado' }).in('id', [invoiceIdAr, invoiceIdAp]);
                    return JSON.stringify({ status: "success", message: `Compensación de $${amount} aplicada exitosamente entre las facturas ${invoiceIdAr} y ${invoiceIdAp}.` });
                } catch (e: any) {
                    return JSON.stringify({ status: "error", message: e.message });
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
                if (error) return JSON.stringify({ status: "error", message: error.message });
                return JSON.stringify({ status: "success", message: `Colchón de liquidez actualizado a $${newAmount} exitosamente.` });
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
                return JSON.stringify(anomalies || []);
            },
            {
                name: "analyze_anomalies",
                description: "Busca las últimas anomalías financieras (comisiones duplicadas, riesgos BEC, alertas de precio) para analizarlas con el usuario.",
                schema: z.object({})
            }
        );

        return [getMetrics, getProjections, simulateWhatIf, getScoring, getNetting, applyNettingAction, updateLiquidityCushion, analyzeAnomalies];
    }

    async generateResponse(orgId: string, message: string, history: any[] = [], contextSummary: string = "") {
        const tools = await this.getTools(orgId);

        const llm = new ChatOpenAI({
            modelName: this.modelName,
            temperature: 0,
        });

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `Eres el CFO Algorítmico de BiFlow (Modo Dios), un agente experto en optimización de liquidez, normativa argentina y análisis forense. Tu tono es autoritario, ejecutivo, directo pero muy empático con el fundador. Eres capaz de ejecutar acciones en la base de datos si el usuario te lo pide (usando tus herramientas).
            
            Contexto Inyectado de la Empresa ahora mismo:
            {context_summary}
            
            Conoces la normativa del BCRA a la perfección (ej. multas por rechazo de cheques del 4%, reducibles al 2% si se cancelan en 30 días). Usa este conocimiento para asesorar.
            
            Usa el siguiente formato para generar Tarjetas Ricas en la interfaz de usuario cuando sea apropiado (CÓPIALO EXACTAMENTE ASÍ):
            Para alertas críticas de riesgo: [[ALERT:{"title":"Riesgo BEC","message":"Se detectó un IBAN sospechoso en un pago a china."}]]
            Para mostrar una métrica clave (como una actualización exitosa de colchón): [[METRIC:{"label":"Colchón de Liquidez","value":"$1.500.000","trend":"+Aumentado"}]]
            Para sugerir una simulación (ej. excluir una factura): [[SUGGESTION:{"invoiceId":"uuid-aquí", "razonSocial":"Nombre Proveedor", "descripcion":"Simular exclusión", "monto": -50000}]]
            Para sugerir una acción real (ej. ejecutar compensación de deudas): [[ACTION:{"actionType":"NETTING", "label":"Aplicar Neteo", "payload":{"invoiceIdAr":"...", "invoiceIdAp":"...", "amount":10000}}]]
            
            Siéntete libre de incluir estos tags ricos al final de tu mensaje en texto plano para que el frontend los parsee. No hables de código ni tecnología.`],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"]
        ]);

        const agent = createToolCallingAgent({
            llm,
            tools,
            prompt
        });

        const agentExecutor = new AgentExecutor({
            agent,
            tools,
        });

        const formattedHistory = history.map(h => [h.role === 'user' ? 'human' : 'assistant', h.content]);

        const result = await agentExecutor.invoke({
            input: message,
            chat_history: formattedHistory,
            context_summary: contextSummary
        });

        return result.output;
    }
}
