const SUPABASE_URL = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

async function listColumns() {
    console.log('Listing all columns for table: comprobantes...');

    // We can use a trick: query a non-existent row and check the keys in the response if it returns an empty object 
    // or use the 'Prefer: return=representation' and insert nothing? No.
    // Best way: query information_schema if possible, but REST API usually doesn't allow it.
    // Let's try to query just one row and see what's in it.

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/comprobantes?select=*&limit=1`, {
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
            console.log('Columns found in first row:', Object.keys(data[0]));
        } else {
            console.log('Table is empty. Checking via a dummy insert attempt (omitting all columns)...');
            const response2 = await fetch(`${SUPABASE_URL}/rest/v1/comprobantes`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({})
            });
            const data2 = await response2.json();
            console.log('Response from dummy insert:', data2);
        }
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
}

listColumns();
