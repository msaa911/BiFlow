import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// BI-FLOW STANDARD TEMPLATE GENERATOR
// This script creates a recommended Excel format for clients to use as a reference.

const outputDir = path.join(process.cwd(), 'public', 'templates');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'biflow_formato_recomendado.xlsx');

// 1. DATA FOR BANK EXTRACT (Extracto Bancario)
const bankHeaders = [
    ["Fecha", "Concepto/Descripción", "Monto", "Saldo", "CUIT Contraparte", "CBU/Alias Contraparte"]
];
const bankSamples = [
    ["2024-02-20", "TRANSFERENCIA RECIBIDA - LOPEZ JUAN", 150200.50, 150200.50, "20-12345678-9", "0070001234567890123456"],
    ["2024-02-21", "PAGO PROVEEDORES - MARTINEZ SA", -45000.00, 105200.50, "30-98765432-1", "0110001234567890123456"],
    ["2024-02-22", "IMPUESTO DEEBITO/CREDITO BANCARIO", -1200.40, 104000.10, "33-69345023-9", ""],
    ["2024-02-23", "COBRO CHEQUE 5017", 25000.00, 129000.10, "20-55555555-5", ""]
];

// 2. DATA FOR INVOICES (Comprobantes / Tesorería)
const invoiceHeaders = [
    ["Fecha Emisión", "Número Factura", "Razón Social", "CUIT", "Monto Total", "Monto Pendiente", "Vencimiento", "Banco", "Nro Cheque"]
];
const invoiceSamples = [
    ["2024-02-01", "0001-00001234", "CLIENTE EJEMPLO SA", "30-11111111-1", 500000.00, 0, "2024-02-15", "Galicia", "CH-9921"],
    ["2024-02-15", "0005-00045678", "PROVEEDOR LOGISTICA", "33-22222222-2", 125000.00, 125000.00, "2024-03-01", "Santander", "CH-8832"],
    ["2024-02-18", "0001-00005555", "LOPEZ JUAN", "20-12345678-9", 30000.00, 30000.00, "2024-02-28", "", ""]
];

// Combine into Sheets
const wsBank = XLSX.utils.aoa_to_sheet([...bankHeaders, ...bankSamples]);
const wsInvoices = XLSX.utils.aoa_to_sheet([...invoiceHeaders, ...invoiceSamples]);

// Add styling hints (widths)
const wscolsBank = [
    { wch: 12 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 25 }
];
const wscolsInvoices = [
    { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
];
wsBank['!cols'] = wscolsBank;
wsInvoices['!cols'] = wscolsInvoices;

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsBank, "Extracto Bancario");
XLSX.utils.book_append_sheet(wb, wsInvoices, "Comprobantes y Cheques");

// Write to file
XLSX.writeFile(wb, outputPath);

console.log(`Template generated at: ${outputPath}`);
