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

// Load Config if exists
const configPath = path.join(outDir, 'config.json');
let config = {
    saldos_iniciales: { "Banco Galicia": 15000000 },
    acuerdos_bancarios: { mantenimiento_pactado: 15500, comision_cheque_porcentaje: 0.015 }
};
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

let saldoBancario = config.saldos_iniciales["Banco Galicia"] || 15000000;
const comisionChequePct = config.acuerdos_bancarios.comision_cheque_porcentaje || 0;
const mantenimientoMensual = config.acuerdos_bancarios.mantenimiento_pactado || 0;

const bancosAR = ['Banco Galicia', 'Santander', 'BBVA', 'ICBC', 'Banco Nación', 'Macro'];

// Generate Ventas & Recibos
for (let i = 0; i < 25; i++) {
    const fechaEmision = randomDate(startJan, endFeb);
    const cliente = clientes[randomInt(0, clientes.length - 1)];
    const monto = randomInt(80000, 600000);
    const numeroFac = `FAC-A-0001-${String(idVentas++).padStart(8, '0')}`;

    ventas.push({
        fecha: formatDate(fechaEmision),
        numero: numeroFac,
        concepto: `Servicios Profesionales de Consultoría`,
        cuit: cliente.cuit,
        razon_social: cliente.razon,
        monto: monto,
        vencimiento: formatDate(new Date(fechaEmision.getTime() + 15 * 864e5)),
        moneda: 'ARS'
    });

    if (Math.random() > 0.2) {
        const fechaPago = new Date(fechaEmision.getTime() + randomInt(2, 10) * 864e5);
        if (fechaPago <= endFeb) {
            const numeroRecibo = `0001-${String(idRecibos++).padStart(8, '0')}`;
            const esCheque = Math.random() > 0.6; // 40% Cheques
            const medio = esCheque ? 'Cheque' : 'Transferencia';
            const bancoNombre = bancosAR[randomInt(0, bancosAR.length - 1)];
            const refTx = esCheque ? randomInt(10000000, 99999999).toString() : `TRF-${randomInt(100000, 999999)}`;

            // Si es cheque, la disponibilidad puede ser diferida. Forzamos 0 en algunos casos para ver comisiones.
            let diasDiferimiento = esCheque ? randomInt(0, 45) : 0;
            if (esCheque && i % 3 === 0) diasDiferimiento = 0; // Forzamos 1 de cada 3 cheques al día

            const fechaDisponibilidad = new Date(fechaPago.getTime() + diasDiferimiento * 864e5);

            recibos.push({
                fecha: formatDate(fechaPago),
                recibo: numeroRecibo,
                cliente: cliente.razon,
                cuit: cliente.cuit,
                importe: monto,
                medio: medio,
                banco: bancoNombre,
                referencia: refTx,
                observaciones: `Aplica a ${numeroFac}`
            });

            // Solo impacta en banco si es Transferencia o Cheque al día
            if (medio === 'Transferencia' || (esCheque && diasDiferimiento === 0)) {

                // Texto minimalista para el banco simulando la falta de información
                const conceptoBanco = medio === 'Transferencia' ? `Transferencia ${refTx}` : `Cheque ${refTx}`;

                banco.push({
                    fechaRaw: fechaPago,
                    fecha: formatDate(fechaPago),
                    concepto: conceptoBanco,
                    debito: '',
                    credito: monto.toFixed(2),
                    cuit: '',
                    referencia: '',
                    banco: ''
                });

                // AUDITORÍA: Inyectar comisión de cheque si aplica
                if (esCheque && comisionChequePct > 0) {
                    const comision = monto * comisionChequePct;
                    banco.push({
                        fechaRaw: fechaPago,
                        fecha: formatDate(fechaPago),
                        concepto: `Comisión s/Depósito de Valores - Cheque ${refTx}`,
                        debito: comision.toFixed(2),
                        credito: '',
                        cuit: '',
                        referencia: `COM-${refTx}`,
                        banco: 'Banco Galicia'
                    });
                }
            }
        }
    }
}

// Generate Compras & OP
for (let i = 0; i < 20; i++) {
    const fechaEmision = randomDate(startJan, endFeb);
    const prov = proveedores[randomInt(0, proveedores.length - 1)];

    let monto = randomInt(30000, 250000);
    let concepto = `Suministros y gastos operativos`;

    // ANOMALÍA 1: Gasto inusualmente alto pero controlado para el saldo
    if (i === 5) {
        monto = 1200000;
        concepto = `Mantenimiento infraestructura servidores`;
    }

    const numeroFac = `FAC-C-0002-${String(idCompras++).padStart(8, '0')}`;

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

    if (Math.random() > 0.1 || i === 5) {
        const fechaPago = new Date(fechaEmision.getTime() + randomInt(5, 20) * 864e5);
        if (fechaPago <= endFeb) {
            const numeroOP = `0001-${String(idOP++).padStart(8, '0')}`;
            const refTx = `TRF-${randomInt(100000, 999999)}`;

            let pagoCBU = prov.cbu;
            let notaAdicional = '';

            // ANOMALÍA 2: Fraude BEC (CBU Interceptado)
            if (i === 10) {
                pagoCBU = '1430000000000000000888'; // CBU ajeno al proveedor
                notaAdicional = ' - [ALERTA] Destino no habitual';
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
                observaciones: `Aplica a ${numeroFac}`
            });

            // Bank loses money
            const conceptoBanco = `Transferencia ${refTx}`;

            banco.push({
                fechaRaw: fechaPago,
                fecha: formatDate(fechaPago),
                concepto: conceptoBanco,
                debito: monto.toFixed(2),
                credito: '',
                cuit: '',
                referencia: '',
                banco: ''
            });
        }
    }
}

// ANOMALÍA 3: Alerta de Descubierto (Pago masivo que consume liquidez)
const fechaGranPago = new Date('2026-02-20T10:00:00');
banco.push({
    fechaRaw: fechaGranPago,
    fecha: '20/02/2026',
    concepto: 'Debito Transf. AFIP - Pago Moratoria Extraordinaria',
    debito: '12500000.00', // 12.5 Millones de golpe
    credito: '',
    cuit: '33-69345023-9',
    referencia: 'Vep-992323',
    banco: 'Banco Galicia'
});

// ANOMALÍA 4: Cheque Rechazado (Para testear flujo de rechezo y multa)
const fechaRechazo = new Date('2026-02-25T09:00:00');
banco.push({
    fechaRaw: fechaRechazo,
    fecha: '25/02/2026',
    concepto: 'Rechazo de Valor Depositado - Ch 48052799 (Sin Fondos)',
    debito: '533594.00', // El mismo importe que entró en la línea 2
    credito: '',
    cuit: '',
    referencia: 'RECH-48052799',
    banco: 'Banco Galicia'
});
banco.push({
    fechaRaw: new Date(fechaRechazo.getTime() + 1000), // Segundo después
    fecha: '25/02/2026',
    concepto: 'Gasto Bancario s/Valor Rechazado',
    debito: '12500.00',
    credito: '',
    cuit: '',
    referencia: 'MULTA-48052799',
    banco: 'Banco Galicia'
});

// Inyectar Mantenimiento Mensual (Fin de Mes)
if (mantenimientoMensual > 0) {
    banco.push({
        fechaRaw: new Date('2026-01-31T23:59:59'),
        fecha: '31/01/2026',
        concepto: 'Mantenimiento Cuenta Pactado',
        debito: mantenimientoMensual.toFixed(2),
        credito: '',
        cuit: '',
        referencia: 'MANT-01',
        banco: 'Banco Galicia'
    });
    banco.push({
        fechaRaw: new Date('2026-02-28T23:59:59'),
        fecha: '28/02/2026',
        concepto: 'Mantenimiento Cuenta Pactado',
        debito: mantenimientoMensual.toFixed(2),
        credito: '',
        cuit: '',
        referencia: 'MANT-02',
        banco: 'Banco Galicia'
    });
}

// Inyectar Auditoría de Descuento de Cheques (Factoring)
banco.push({
    fechaRaw: new Date('2026-02-10T11:00:00'),
    fecha: '10/02/2026',
    concepto: 'Acreditación neta Descuento de Valores (Lote #492)',
    debito: '',
    credito: '850000.00',
    cuit: '',
    referencia: 'DESC-492',
    banco: 'Banco Galicia'
});
banco.push({
    fechaRaw: new Date('2026-02-10T11:01:00'),
    fecha: '10/02/2026',
    concepto: 'Intereses / Gastos s/Descuento de Valores',
    debito: '42500.00',
    credito: '',
    cuit: '',
    referencia: 'INT-492',
    banco: 'Banco Galicia'
});

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

// --- CASO COMPLEJO: PAGO MIXTO Y MULTI-FACTURA (Estandar AFIP) ---
(function () {
    const specialClient = clientes[0];
    const fac1Num = `FAC-A-0001-${String(idVentas++).padStart(8, '0')}`;
    const fac2Num = `FAC-A-0001-${String(idVentas++).padStart(8, '0')}`;

    ventas.push({
        fecha: formatDate(new Date(2026, 0, 15)),
        numero: fac1Num,
        concepto: `Factura de Consultoría A`,
        cuit: specialClient.cuit,
        razon_social: specialClient.razon,
        monto: 100000,
        vencimiento: formatDate(new Date(2026, 0, 30)),
        moneda: 'ARS'
    });

    ventas.push({
        fecha: formatDate(new Date(2026, 0, 16)),
        numero: fac2Num,
        concepto: `Factura de Consultoría B`,
        cuit: specialClient.cuit,
        razon_social: specialClient.razon,
        monto: 150000,
        vencimiento: formatDate(new Date(2026, 0, 31)),
        moneda: 'ARS'
    });

    const mixedReciboNum = `0001-${String(idRecibos++).padStart(8, '0')}`;
    const commonDate = new Date(2026, 1, 5);

    // Instrumento 1: Transferencia al Banco (Aparecerá en el extracto)
    recibos.push({
        fecha: formatDate(commonDate),
        recibo: mixedReciboNum,
        cliente: specialClient.razon,
        cuit: specialClient.cuit,
        importe: 125000,
        medio: 'Transferencia',
        banco: 'Banco Galicia',
        referencia: 'TRF-MIXED-123',
        observaciones: `Aplica a ${fac1Num} y ${fac2Num}`
    });

    // Instrumento 2: Efectivo (No aparecerá en el banco, queda en caja)
    recibos.push({
        fecha: formatDate(commonDate),
        recibo: mixedReciboNum,
        cliente: specialClient.razon,
        cuit: specialClient.cuit,
        importe: 125000,
        medio: 'Efectivo',
        banco: '',
        referencia: '',
        observaciones: `Aplica a ${fac1Num} y ${fac2Num}`
    });

    // Entrada en banco por la transferencia del pago mixto
    banco.push({
        fechaRaw: commonDate,
        fecha: formatDate(commonDate),
        concepto: `Transferencia TRF-MIXED-123`,
        debito: '',
        credito: '125000.00',
        cuit: '',
        referencia: '',
        banco: ''
    });
})();

// Sort Bank by Date and Recalculate Saldos sequentially
banco.sort((a, b) => a.fechaRaw - b.fechaRaw);
let currentBalance = saldoBancario;
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
fs.writeFileSync(path.join(outDir, 'recibos.csv'), 'Fecha,Recibo,Cliente,CUIT,Concepto,Detalle,Importe,Medio,Banco\n' + recibos.map(r => `${r.fecha},${r.recibo},${r.cliente},${r.cuit},${r.observaciones},${r.referencia},${r.importe},${r.medio},${r.banco}`).join('\n'));
// 4. Egresos / OP
fs.writeFileSync(path.join(outDir, 'ordenes_pago.csv'), 'Fecha,Orden,Proveedor,CUIT,Concepto,Detalle,Importe,Medio,Banco\n' + ops.map(r => `${r.fecha},${r.op},${r.proveedor},${r.cuit},${r.observaciones},${r.referencia},${r.importe},${r.medio},${r.banco}`).join('\n'));
// 5. Banco
const bankHeader = `Banco Galicia
Cuenta Corriente en Pesos Nro: 1234-5678/9
CBU: 0140000000000000000000
Titular: EMPRESA DEMO SA
CUIT: 30-71111111-2
Desde: 01/01/2026 Hasta: 28/02/2026

Fecha,Concepto,Debito,Credito,Saldo
`;
fs.writeFileSync(path.join(outDir, 'extracto_bancario_columnas.csv'), bankHeader + banco.map(r => `${r.fecha},${r.concepto},${r.debito},${r.credito},${r.saldo}`).join('\n'));

console.log('Archivos generados con saltos de línea correctos (\n)');
