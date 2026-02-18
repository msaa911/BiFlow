import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
    try {
        console.log("📊 Iniciando sincronización: ArgentinaDatos (Promedio Bancos)...");

        // 1. Consultar API ArgentinaDatos (Listado de bancos y sus tasas de Plazo Fijo)
        const response = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');

        if (!response.ok) {
            throw new Error(`Error API externa: ${response.statusText}`);
        }

        const data = await response.json();

        // 2. Calcular el promedio de las tasas informadas
        const bancosConTasa = data.filter((b: any) => b.tnaClientes !== null && b.tnaClientes > 0);

        if (bancosConTasa.length === 0) {
            throw new Error("No se encontraron tasas válidas en la API.");
        }

        const sumaTasas = bancosConTasa.reduce((acc: number, b: any) => acc + b.tnaClientes, 0);
        const tasaPromedio = sumaTasas / bancosConTasa.length;

        console.log(`✅ Tasa promedio detectada: ${(tasaPromedio * 100).toFixed(2)}% (Bancos analizados: ${bancosConTasa.length})`);

        // 3. Guardar en Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const hoy = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: hoy,
                tasa_plazo_fijo_30d: tasaPromedio,
                tasa_plazo_fijo: tasaPromedio, // Compatibilidad
                origen: `ArgentinaDatos (Promedio ${bancosConTasa.length} bancos)`,
                updated_at: new Date()
            }, { onConflict: 'fecha' });

        if (error) throw error;

        return new Response(JSON.stringify({
            success: true,
            source: "ArgentinaDatos",
            label: "Promedio Mercado",
            rate: tasaPromedio,
            banks_count: bancosConTasa.length,
            sync_date: hoy
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("❌ Error Sync:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
})
