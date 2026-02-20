import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
    try {
        console.log("📊 Iniciando sincronización: ArgentinaDatos (Tasas + Dólar)...");

        // 1. Consultar Tasas de Plazo Fijo
        const resTasas = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
        const dataTasas = await resTasas.json();
        const bancosConTasa = dataTasas.filter((b: any) => b.tnaClientes !== null && b.tnaClientes > 0);
        const tasaPromedio = bancosConTasa.length > 0 ? (bancosConTasa.reduce((acc: number, b: any) => acc + b.tnaClientes, 0) / bancosConTasa.length) : 0;

        // 2. Consultar Cotización Dólar (Oficial)
        const resDolar = await fetch('https://api.argentinadatos.com/v1/finanzas/cotizaciones/dolar');
        const dataDolar = await resDolar.json();
        // dataDolar suele ser un array de objetos con casa, compra, venta, fecha. Buscamos 'oficial' o el último.
        const oficial = dataDolar.find((d: any) => d.casa === 'oficial') || dataDolar[0];
        const valorDolar = oficial ? oficial.venta : 0;

        console.log(`✅ Tasa promedio: ${(tasaPromedio * 100).toFixed(2)}% | Dólar Oficial: $${valorDolar}`);

        // 3. Guardar en Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const hoy = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: hoy,
                tasa_plazo_fijo_30d: tasaPromedio,
                tasa_plazo_fijo: tasaPromedio,
                dolar_oficial: valorDolar,
                origen: `ArgentinaDatos (Bancos: ${bancosConTasa.length})`,
                updated_at: new Date()
            }, { onConflict: 'fecha' });

        if (error) throw error;

        return new Response(JSON.stringify({
            success: true,
            tasa: tasaPromedio,
            dolar: valorDolar,
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
