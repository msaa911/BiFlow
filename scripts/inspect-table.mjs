const SUPABASE_URL = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const tableName = process.argv[2] || 'comprobantes';

async function listColumns() {
    console.log(`Listing all columns for table: ${tableName}...`);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('FAILED TO FETCH:', data);
        } else if (data.length > 0) {
            console.log('Columns found:', Object.keys(data[0]));
        } else {
            console.log('Table is empty.');
        }
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
}

listColumns();
