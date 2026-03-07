import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
    // Manejo de CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    const logs: string[] = [];
    const addLog = (msg: string) => {
        const entry = `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`;
        console.log(entry);
        logs.push(entry);
    };

    try {
        addLog("📊 Iniciando Sincronización v3 (Fail-Safe)...");

        // 1. Tasas de Plazo Fijo
        let tasaPromedio = 0;
        const bankRatesMap: Record<string, number> = {};

        try {
            addLog("Consultando Plazo Fijo...");
            const resTasas = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
            if (resTasas.ok) {
                const dataTasas = await resTasas.json();
                const rawTasas = Array.isArray(dataTasas) ? dataTasas : (dataTasas?.value || []);

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

                const validBanks = rawTasas.filter((b: any) =>
                    b && b.entidad && typeof (b.tnaClientes || b.tna) === 'number'
                );

                addLog(`Encontrados ${validBanks.length} bancos con datos.`);

                if (validBanks.length > 0) {
                    const sum = validBanks.reduce((acc: number, b: any) => acc + (b.tnaClientes || b.tna || 0), 0);
                    tasaPromedio = sum / validBanks.length;

                    validBanks.forEach((b: any) => {
                        const bankName = b.entidad;
                        const rate = b.tnaClientes || b.tna || 0;
                        if (mainBanksToTrack.includes(bankName)) {
                            bankRatesMap[bankName] = rate;
                        }
                    });
                }
            } else {
                addLog(`⚠️ Error API PlazoFijo: ${resTasas.status}`);
            }
        } catch (e) {
            addLog(`❌ Fallo PlazoFijo: ${e.message}`);
        }

        // 2. Tasa BADLAR Proxy
        let tasaBadlar = 0;
        try {
            addLog("Consultando BADLAR Proxy...");
            const resBadlar = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias');
            if (resBadlar.ok) {
                const dataBadlar = await resBadlar.json();
                const rawBadlar = Array.isArray(dataBadlar) ? dataBadlar : (dataBadlar?.value || []);
                const lastRecord = rawBadlar.length > 0 ? rawBadlar[rawBadlar.length - 1] : null;
                tasaBadlar = lastRecord?.valor || 0;
                addLog(`BADLAR Proxy: ${tasaBadlar}`);
            }
        } catch (e) {
            addLog(`❌ Fallo BADLAR: ${e.message}`);
        }

        // 3. Cotización Dólar
        let valorDolar = 0;
        try {
            addLog("Consultando Dólar...");
            const resDolar = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares');
            if (resDolar.ok) {
                const dataDolar = await resDolar.json();
                const rawDolar = Array.isArray(dataDolar) ? dataDolar : (dataDolar?.value || []);
                const oficial = rawDolar.find((d: any) => d.casa === 'oficial') || rawDolar[rawDolar.length - 1];
                valorDolar = oficial?.venta || 0;
                addLog(`Dólar: ${valorDolar}`);
            }
        } catch (e) {
            addLog(`❌ Fallo Dólar: ${e.message}`);
        }

        // 4. Guardar en Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const hoy = new Date().toISOString().split('T')[0];

        addLog(`Guardando en DB... (Bancos trackeados: ${Object.keys(bankRatesMap).length})`);

        const { error: dbError } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: hoy,
                tasa_plazo_fijo: (isNaN(tasaPromedio) || tasaPromedio === null) ? 0 : tasaPromedio,
                tasa_badlar: (isNaN(tasaBadlar) || tasaBadlar === null) ? 0 : tasaBadlar,
                tasas_bancos: bankRatesMap,
                updated_at: new Date().toISOString()
            }, { onConflict: 'fecha' });

        if (dbError) {
            addLog(`❌ DB Error: ${dbError.message}`);
            throw dbError;
        }

        addLog("✅ Sincronización exitosa.");

        return new Response(JSON.stringify({
            success: true,
            tasa: tasaPromedio,
            tasa_badlar: tasaBadlar,
            tasas_bancos: bankRatesMap,
            dolar: valorDolar,
            logs
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error: any) {
        addLog(`❌ ERROR CRÍTICO FINAL: ${error.message}`);
        return new Response(JSON.stringify({
            error: error.message,
            logs
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            status: 500
        });
    }
})
