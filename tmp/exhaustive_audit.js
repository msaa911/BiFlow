
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function audit() {
    console.log('--- STARTING FINANCIAL AUDIT ---');

    // 1. Initial Balances
    const { data: accounts } = await supabase.from('cuentas_bancarias').select('*').eq('organization_id', ORG_ID);
    const initialSum = accounts?.reduce((acc, c) => acc + (Number(c.saldo_inicial) || 0), 0) || 0;
    console.log(`Initial Balances Sum: $${initialSum}`);

    // 2. Transactions
    const { data: allTxs } = await supabase.from('transacciones').select('*').eq('organization_id', ORG_ID);
    const txsSum = allTxs?.reduce((acc, t) => acc + (Number(t.monto) || 0), 0) || 0;
    console.log(`Transactions Sum: $${txsSum}`);

    const totalBalance = initialSum + txsSum;
    console.log(`TOTAL BALANCE (Consolidated): $${totalBalance}`);

    // 3. Opportunity Cost
    const { data: config } = await supabase.from('configuracion_empresa').select('*').eq('organization_id', ORG_ID).single();
    const tna = config?.tna || 0.70;
    const cushion = config?.colchon_liquidez || 0;
    const dailyRate = tna / 365;
    const investable = totalBalance - cushion;
    const oppCost = investable > 0 ? investable * dailyRate * 30 : 0;
    console.log(`TNA: ${tna * 100}%, Cushion: $${cushion}`);
    console.log(`Opportunity Cost (30d): $${oppCost}`);

    // 4. Duplicate Check
    const duplicates = allTxs.filter(t => t.tags?.includes('posible_duplicado'));
    console.log(`Detected Duplicates in DB: ${duplicates.length}`);
    duplicates.forEach(d => console.log(` - ${d.fecha}: ${d.descripcion} ($${d.monto})`));

    // 5. Burn Rate & Runway
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const expenses = allTxs.filter(t => t.monto < 0 && new Date(t.fecha) >= thirtyDaysAgo);
    const monthlyExpenses = expenses.reduce((acc, t) => acc + Math.abs(t.monto), 0);
    const dailyBurn = monthlyExpenses / 30;
    const limit = config?.limite_descubierto || 0;
    const runway = dailyBurn > 100 ? (totalBalance + limit) / dailyBurn : 'Stable';
    console.log(`Monthly Expenses: $${monthlyExpenses}, Daily Burn: $${dailyBurn}`);
    console.log(`Runway: ${runway} days`);

    // 6. Anomalies check
    const anomalies = allTxs.filter(t => t.tags?.some(tag => ['alerta_precio', 'posible_duplicado', 'riesgo_bec'].includes(tag)));
    console.log(`Total Anomalies (Tags): ${anomalies.length}`);
}

audit();
