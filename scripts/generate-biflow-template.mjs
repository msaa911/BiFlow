import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// BI-FLOW SEPARATED TEMPLATE GENERATOR
const outputDir = path.join(process.cwd(), 'public', 'templates');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const generateTemplate = (filename, headers, samples, sheetName) => {
    const outputPath = path.join(outputDir, filename);
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...samples]);

    // Auto-calculate column widths
    const maxLen = headers[0].map((h, i) => {
        let max = h.length;
        samples.forEach(row => {
            const val = String(row[i] || '');
            if (val.length > max) max = val.length;
        });
        return { wch: max + 5 };
    });
    ws['!cols'] = maxLen;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, outputPath);
    console.log(`Generated: ${filename}`);
};

// 1. BANK EXTRACT
const bankHeaders = [["Fecha", "Concepto/Descripción", "Monto", "Saldo", "Referencia/Dato Adicional"]];
const bankSamples = [
    ["2024-02-20", "TRANSFERENCIA RECIBIDA - LOPEZ JUAN", 150200.50, 150200.50, "REF-001"],
    ["2024-02-21", "PAGO PROVEEDORES - MARTINEZ SA", -45000.00, 105200.50, "OP-992"],
];
generateTemplate('biflow_extracto_bancario.xlsx', bankHeaders, bankSamples, "Extracto");

// 2. RECEIPTS (Cobros)
const receiptHeaders = [["Fecha", "Número de Recibo", "Cliente (Nombre o CUIT)", "Monto Total", "Medio de Pago", "Banco", "Referencia", "Disponibilidad", "Observaciones"]];
const receiptSamples = [
    ["2024-02-15", "REC-0001", "CLIENTE EJEMPLO SA", 500000.00, "cheque_terceros", "Galicia", "CH-9921", "2024-02-28", "Pago Factura Enero"],
    ["2024-02-18", "REC-0002", "LOPEZ JUAN", 30000.00, "transferencia", "Santander", "TRF-881", "2024-02-18", ""],
];
generateTemplate('biflow_recibos.xlsx', receiptHeaders, receiptSamples, "Recibos");

// 3. PAYMENT ORDERS (Pagos)
const paymentHeaders = [["Fecha", "Número de OP", "Proveedor (Nombre o CUIT)", "Monto Total", "Medio de Pago", "Banco", "Referencia", "Disponibilidad", "Observaciones"]];
const paymentSamples = [
    ["2024-02-15", "OP-5001", "PROVEEDOR LOGISTICA", 125000.00, "transferencia", "Santander", "TRF-221", "2024-02-15", "Pago Flete"],
    ["2024-02-16", "OP-5002", "TECH SOLUTIONS", 45000.00, "cheque_propio", "Galicia", "CH-8832", "2024-03-05", "Compra Insumos"],
];
generateTemplate('biflow_ordenes_pago.xlsx', paymentHeaders, paymentSamples, "Ordenes de Pago");
