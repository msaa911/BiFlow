import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
    try {
        console.log("📊 Iniciando sincronización: ArgentinaDatos (Tasas + Dólar)...");

        // 1. Consultar Tasas de Plazo Fijo
        const resTasas = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
        const dataTasas = await resTasas.json();
        const bancosConTasa = dataTasas.filter((b: any) => b.tnaClientes !== null && b.tnaClientes > 0);
        const tasaPromedio = bancosConTasa.length > 0 ? (bancosConTasa.reduce((acc: number, b: any) => acc + b.tnaClientes, 0) / bancosConTasa.length) : 0;

        // Mapear bancos específicos importantes
        const mainBanksToTrack = [
            "BANCO DE LA NACION ARGENTINA",
            "BANCO SANTANDER ARGENTINA S.A.",
            "BANCO DE GALICIA Y BUENOS AIRES S.A.",
            "BANCO DE LA PROVINCIA DE BUENOS AIRES",
            "BANCO BBVA ARGENTINA S.A.",
            "BANCO MACRO S.A.",
            "BANCO CREDICOOP COOPERATIVO LIMITADO",
            "BANCO DE LA CIUDAD DE BUENOS AIRES"
        ];
        const bankRatesMap: Record<string, number> = {};
        bancosConTasa.forEach((b: any) => {
            if (mainBanksToTrack.includes(b.entidad)) {
                bankRatesMap[b.entidad] = b.tnaClientes;
            }
        });

        // 2. Consultar Tasa BADLAR
        const resBadlar = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/badlar');
        const dataBadlar = await resBadlar.json();
        const tasaBadlar = dataBadlar.length > 0 ? dataBadlar[dataBadlar.length - 1].valor : 0;

        // 3. Consultar Cotización Dólar (Oficial)
        const resDolar = await fetch('https://api.argentinadatos.com/v1/finanzas/cotizaciones/dolar');
        const dataDolar = await resDolar.json();
        const oficial = dataDolar.find((d: any) => d.casa === 'oficial') || dataDolar[dataDolar.length - 1];
        const valorDolar = oficial ? oficial.venta : 0;

        console.log(`✅ Plazo Fijo: ${(tasaPromedio * 100).toFixed(2)}% | BADLAR: ${(tasaBadlar * 100).toFixed(2)}% | Dólar: $${valorDolar}`);

        // 4. Guardar en Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const hoy = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: hoy,
                tasa_plazo_fijo_30d: tasaPromedio,
                tasa_plazo_fijo: tasaPromedio,
                tasa_badlar: tasaBadlar,
                tasas_bancos: bankRatesMap,
                dolar_oficial: valorDolar,
                origen: `ArgentinaDatos (Bancos: ${bancosConTasa.length})`,
                updated_at: new Date()
            }, { onConflict: 'fecha' });

        if (error) throw error;

        return new Response(JSON.stringify({
            success: true,
            tasa: tasaPromedio,
            tasa_badlar: tasaBadlar,
            tasas_bancos: bankRatesMap,
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
