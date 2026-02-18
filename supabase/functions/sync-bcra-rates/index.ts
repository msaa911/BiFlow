import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BCRA_TOKEN = Deno.env.get('BCRA_API_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
    try {
        console.log('--- BCRA Sync Function Start ---');

        // 1. Consultar API BCRA (Tasa Plazo Fijo como referencia)
        const response = await fetch('https://api.estadisticasbcra.com/tasa_depositos_30_dias', {
            headers: { 'Authorization': `BEARER ${BCRA_TOKEN}` }
        });

        if (!response.ok) {
            throw new Error(`BCRA API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Invalid data format from BCRA');
        }

        // Tomamos el último valor disponible
        const ultimoDato = data[data.length - 1];
        const tasaDiaria = ultimoDato.v / 100; // Convertimos de 75 a 0.75

        // 2. Guardar en nuestra base de datos
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { error } = await supabase
            .from('indices_mercado')
            .upsert({
                fecha: new Date().toISOString().split('T')[0],
                tasa_plazo_fijo: tasaDiaria
            }, { onConflict: 'fecha' });

        if (error) throw error;

        console.log(`Successfully synced BCRA rate: ${tasaDiaria}`);
        return new Response(JSON.stringify({ success: true, rate: tasaDiaria }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('BCRA Sync Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
})
