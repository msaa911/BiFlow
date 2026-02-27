const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'test_data');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

// Helpers
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const formatDate = (date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Entities with True CBUs
const clientes = [
    { cuit: '30-11111111-1', razon: 'Tech Solutions SAS', cbu: '0140000000000000000001' },
    { cuit: '30-22222222-2', razon: 'Innovaciones Digitales SRL', cbu: '0720000000000000000002' },
    { cuit: '33-33333333-3', razon: 'Constructora del Sur SA', cbu: '0170000000000000000003' }
];

const proveedores = [
    { cuit: '30-44444444-4', razon: 'Servicios de Limpieza Estrella', cbu: '0140000000000000000004' },
    { cuit: '33-55555555-5', razon: 'Cloud Hosting Providers INC', cbu: '0720000000000000000005' },
    { cuit: '30-66666666-6', razon: 'Alquileres de Oficinas SA', cbu: '0170000000000000000006' }
];

const startJan = new Date('2026-01-01T12:00:00');
const endFeb = new Date('2026-02-27T12:00:00');

let idVentas = 1000;
let idCompras = 5000;
let idRecibos = 100;
let idOP = 200;

let ventas = [];
let compras = [];
let recibos = [];
let ops = [];
let banco = [];

let saldoBancario = 5000000; // Starting with 5M

// Generate Ventas & Recibos
for (let i = 0; i < 15; i++) {
    const fechaEmision = randomDate(startJan, endFeb);
    const cliente = clientes[randomInt(0, clientes.length - 1)];
    const monto = randomInt(50000, 500000);
    const numeroFac = `FAC-A-0001-${idVentas++}`;

    ventas.push({
        fecha: formatDate(fechaEmision),
        numero: numeroFac,
        concepto: `Servicios de Consultoría`,
        cuit: cliente.cuit,
        razon_social: cliente.razon,
        monto: monto,
        vencimiento: formatDate(new Date(fechaEmision.getTime() + 15 * 864e5)),
        moneda: 'ARS'
    });

    if (Math.random() > 0.3) {
        const fechaPago = new Date(fechaEmision.getTime() + randomInt(2, 10) * 864e5);
        if (fechaPago <= endFeb) {
            const numeroRecibo = `REC-${idRecibos++}`;
            const refTx = `TRF-${randomInt(100000, 999999)}`;

            recibos.push({
                fecha: formatDate(fechaPago),
                recibo: numeroRecibo,
                cliente: cliente.razon,
                cuit: cliente.cuit,
                importe: monto,
                medio: 'Transferencia',
                banco: 'Banco Galicia',
                referencia: refTx,
                disponibilidad: formatDate(fechaPago),
                cbu: cliente.cbu
            });

            // Bank gets the money
            banco.push({
                fechaRaw: fechaPago,
                fecha: formatDate(fechaPago),
                concepto: `Acreditacion Transf. ${cliente.razon} Ref ${refTx} CBU ${cliente.cbu}`,
                debito: '',
                credito: monto.toFixed(2),
                cuit: cliente.cuit,
                referencia: refTx,
                banco: 'Banco Galicia'
            });
        }
    }
}

// Generate Compras & OP
for (let i = 0; i < 20; i++) {
    const fechaEmision = randomDate(startJan, endFeb);
    const prov = proveedores[randomInt(0, proveedores.length - 1)];

    let monto = randomInt(20000, 300000);
    let concepto = `Gastos operativos comunes`;

    // ANOMALÍA 1: Alerta de Precio (Gasto inusualmente alto)
    if (i === 5) {
        monto = 8500000; // 8.5 Millones!
        concepto = `Implementación de licencias anuales`;
    }

    const numeroFac = `FAC-C-0002-${idCompras++}`;

    compras.push({
        fecha: formatDate(fechaEmision),
        numero: numeroFac,
        concepto: concepto,
        cuit: prov.cuit,
        razon_social: prov.razon,
        monto: monto,
        vencimiento: formatDate(new Date(fechaEmision.getTime() + 30 * 864e5)),
        moneda: 'ARS'
    });

    if (Math.random() > 0.2 || i === 5) { // Ensure the anomaly gets paid
        const fechaPago = new Date(fechaEmision.getTime() + randomInt(5, 20) * 864e5);
        if (fechaPago <= endFeb) {
            const numeroOP = `OP-${idOP++}`;
            const refTx = `TRF-${randomInt(100000, 999999)}`;

            let pagoCBU = prov.cbu;
            let notaAdicional = '';

            // ANOMALÍA 2: Fraude BEC (CBU Interceptado)
            if (i === 10) {
                pagoCBU = '1430000000000000000888'; // CBU completamente distinto!
                notaAdicional = ' - ALERTA: CBU MODIFICADO';
            }

            ops.push({
                fecha: formatDate(fechaPago),
                op: numeroOP,
                proveedor: prov.razon,
                cuit: prov.cuit,
                importe: monto,
                medio: 'Transferencia',
                banco: 'Banco Galicia',
                referencia: refTx,
                disponibilidad: formatDate(fechaPago),
                cbu: pagoCBU
            });

            // Bank loses money
            banco.push({
                fechaRaw: fechaPago,
                fecha: formatDate(fechaPago),
                concepto: `Debito Transf. ${prov.razon} Ref ${refTx} CBU ${pagoCBU}${notaAdicional}`,
                debito: monto.toFixed(2),
                credito: '',
                cuit: prov.cuit,
                referencia: refTx,
                banco: 'Banco Galicia'
            });
        }
    }
}

// Insertar pagos huérfanos
banco.push({
    fechaRaw: new Date('2026-02-15T10:00:00'),
    fecha: '15/02/2026',
    concepto: `Debito Transf. Desconocido Ref TRF-999999 CBU 0140000000000000000999`,
    debito: '150000.00',
    credito: '',
    cuit: '',
    referencia: 'TRF-999999',
    banco: 'Banco Galicia'
});

// Sort Bank by Date and Recalculate Saldos sequentially
banco.sort((a, b) => a.fechaRaw - b.fechaRaw);
let currentBalance = 5000000;
banco = banco.map(tx => {
    if (tx.credito) currentBalance += parseFloat(tx.credito);
    if (tx.debito) currentBalance -= parseFloat(tx.debito);
    return {
        ...tx,
        saldo: currentBalance.toFixed(2)
    };
});

// Extraer headers y serializar CSV (Corregido \n)
const toCSV = (data, headers) => {
    const headerRow = headers.join(',') + '\n';
    const rows = data.map(obj => headers.map(h => {
        let val = obj[h] || obj[h.toLowerCase()];
        if (val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
    }).join(',')).join('\n');
    return headerRow + rows;
};

// 1. Ingresos
fs.writeFileSync(path.join(outDir, 'ventas_ingresos.csv'), toCSV(ventas, ['fecha', 'numero', 'concepto', 'cuit', 'razon_social', 'monto', 'vencimiento', 'moneda']));
// 2. Egresos
fs.writeFileSync(path.join(outDir, 'compras_egresos.csv'), toCSV(compras, ['fecha', 'numero', 'concepto', 'cuit', 'razon_social', 'monto', 'vencimiento', 'moneda']));
// 3. Recibos
fs.writeFileSync(path.join(outDir, 'recibos.csv'), 'Fecha,Recibo,Cliente,CUIT,Importe,Medio,Banco,Referencia,Disponibilidad,CBU\n' + recibos.map(r => `${r.fecha},${r.recibo},${r.cliente},${r.cuit},${r.importe},${r.medio},${r.banco},${r.referencia},${r.disponibilidad},${r.cbu}`).join('\n'));
// 4. Egresos / OP
fs.writeFileSync(path.join(outDir, 'ordenes_pago.csv'), 'Fecha,Orden,Proveedor,CUIT,Importe,Medio,Banco,Referencia,Disponibilidad,CBU\n' + ops.map(r => `${r.fecha},${r.op},${r.proveedor},${r.cuit},${r.importe},${r.medio},${r.banco},${r.referencia},${r.disponibilidad},${r.cbu}`).join('\n'));
// 5. Banco
fs.writeFileSync(path.join(outDir, 'extracto_bancario_columnas.csv'), 'Fecha,Concepto,Debito,Credito,Saldo,CUIT,Referencia,Banco\n' + banco.map(r => `${r.fecha},${r.concepto},${r.debito},${r.credito},${r.saldo},${r.cuit},${r.referencia},${r.banco}`).join('\n'));

console.log('Archivos generados con saltos de línea correctos (\n)');
