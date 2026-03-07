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

        // La API puede devolver el array directamente o envuelto en { value: [...] }
        const rawTasas = Array.isArray(dataTasas) ? dataTasas : (dataTasas.value || []);
        const bancosConTasa = rawTasas.filter((b: any) => b.tnaClientes !== null && b.tnaClientes > 0);
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

        // 2. Consultar Tasa BADLAR (Usando depositos30Dias como fallback si indices/badlar no existe)
        let tasaBadlar = 0;
        try {
            const resBadlar = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias');
            const dataBadlar = await resBadlar.json();
            const rawBadlar = Array.isArray(dataBadlar) ? dataBadlar : (dataBadlar.value || []);
            tasaBadlar = rawBadlar.length > 0 ? rawBadlar[rawBadlar.length - 1].valor : 0;
        } catch (e) {
            console.warn("⚠️ No se pudo obtener tasa depositos30Dias:", e.message);
        }

        // 3. Consultar Cotización Dólar
        let valorDolar = 0;
        try {
            const resDolar = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares');
            const dataDolar = await resDolar.json();
            const rawDolar = Array.isArray(dataDolar) ? dataDolar : (dataDolar.value || []);
            const oficial = rawDolar.find((d: any) => d.casa === 'oficial') || rawDolar[rawDolar.length - 1];
            valorDolar = oficial ? oficial.venta : 0;
        } catch (e) {
            console.warn("⚠️ No se pudo obtener cotización dólar:", e.message);
        }

        console.log(`✅ Plazo Fijo: ${(tasaPromedio * 100).toFixed(2)}% | BADLAR(Proxy): ${(tasaBadlar * 100).toFixed(2)}% | Dólar: $${valorDolar}`);

        // 4. Guardar en Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const hoy = new Date().toISOString().split('T')[0];

        const { error: dbError } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: hoy,
                tasa_plazo_fijo: tasaPromedio,
                tasa_badlar: tasaBadlar,
                tasas_bancos: bankRatesMap,
                updated_at: new Date().toISOString()
            }, { onConflict: 'fecha' });

        if (dbError) {
            console.error("❌ DB Insert Error:", dbError.message);
            throw dbError;
        }

        return new Response(JSON.stringify({
            success: true,
            tasa: tasaPromedio,
            tasa_badlar: tasaBadlar,
            tasas_bancos: bankRatesMap,
            dolar: valorDolar,
            sync_date: hoy
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            }
        });

    } catch (error: any) {
        console.error("❌ Error Sync:", error.message);
        return new Response(JSON.stringify({
            error: error.message,
            details: error.stack
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            status: 500
        });
    }
})
