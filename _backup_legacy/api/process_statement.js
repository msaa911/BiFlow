/**
 * Vercel Serverless Function: Process Statement
 * Recibe el ID de un archivo cargado en Supabase Storage y lo procesa con IA
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { fileId, userId, fileName } = req.body;
        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

        const { data: fileData, error: downloadError } = await supabase.storage.from('extractos').download(`${userId}/${fileName}`);
        if (downloadError) return res.status(500).json({ success: false, error: downloadError.message });

        const text = await fileData.text();
        const prompt = `Actúa como un experto contable. Parsea: ${text.substring(0, 4000)}. Devuelve JSON: { "movimientos": [{ "fecha", "descripcion", "monto" (NEGATIVO para egresos), "categoria" }] }. Categorias: PAGO_PROVEEDOR, COBRO_CLIENTE, IMPUESTO, COMISION, TRANSFERENCIA_PROPIA, PAGO_HABERES, PAGO_SERVICIOS, GASTO_GENERAL.`;

        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: prompt }], response_format: { type: 'json_object' } })
        });

        const parsedData = await aiResponse.json().then(d => JSON.parse(d.choices[0].message.content));

        if (!parsedData.movimientos || !Array.isArray(parsedData.movimientos)) throw new Error('AI Response invalid');

        const expenseCategories = ['PAGO_PROVEEDOR', 'IMPUESTO', 'COMISION', 'PAGO_HABERES', 'PAGO_SERVICIOS', 'RETENCION_IIBB', 'SIRCREB', 'PAGO_VEP_AFIP', 'GASTO_GENERAL', 'TRANSFERENCIA_SALIENTE'];
        
        const movementsWithMeta = parsedData.movimientos.map(m => {
            let infoCategory = (m.categoria || 'SIN_CATEGORIA').toString().trim().toUpperCase();
            let finalAmount = parseFloat(m.monto);
            if (isNaN(finalAmount)) finalAmount = 0;
            if (expenseCategories.includes(infoCategory) && finalAmount > 0) finalAmount = -finalAmount;
            if (finalAmount > 0 && (m.descripcion?.toUpperCase().includes('DEBITO') || m.descripcion?.toUpperCase().includes('PAGO'))) finalAmount = -finalAmount;

            return {
                fecha: m.fecha || new Date().toISOString().split('T')[0],
                descripcion: m.descripcion || 'Sin descripción',
                monto: finalAmount,
                categoria_ia: infoCategory,
                usuario_id: userId,
                archivo_id: fileId
            };
        });

        const { error: insertError } = await supabase.from('movimientos_bancarios').insert(movementsWithMeta);
        if (insertError) throw insertError;

        await supabase.from('archivos_cargados').update({ estado: 'completado', metadatos_ia: parsedData }).eq('id', fileId);
        return res.status(200).json({ success: true, parsedCount: movementsWithMeta.length });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
