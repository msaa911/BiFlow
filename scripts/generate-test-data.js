const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'test-data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Bank Statement
const bankData = [
    ["Fecha", "Descripción", "Monto", "Referencia"],
    ["01/01/2026", "Saldo Inicial", 1500000.00, "BCO-INI"],
    ["05/01/2026", "PAGO NOMINA ENE 2026", -500000.00, "OP-101"],
    ["10/01/2026", "ALQUILER OFICINAS CENTRAL", -100000.00, "OP-102"],
    ["15/01/2026", "COBRO FACT-A-201", 350000.00, "REC-501"],
    ["20/01/2026", "PAGO AFIP IIBB", -45000.00, "OP-103"],
    ["22/01/2026", "SERVICIOS TECH SOLUTIONS", -15000.00, "OP-104"],
    ["25/01/2026", "COBRO FACT-A-202", 450000.00, "REC-502"],
    ["28/01/2026", "SERVICIOS LIMPIEZA", -8000.00, "OP-105"],
    ["05/02/2026", "PAGO NOMINA FEB 2026", -650000.00, "OP-201"],
    ["10/02/2026", "ALQUILER OFICINAS CENTRAL", -120000.00, "OP-202"],
    ["12/02/2026", "TRF PROVEEDOR DUPLICADO", -15000.00, "OP-204"],
    ["12/02/2026", "TRF PROVEEDOR DUPLICADO", -15000.00, "OP-204"],
    ["15/02/2026", "COBRO FACT-A-301", 350000.00, "REC-601"],
    ["20/02/2026", "PAGO AFIP IIBB", -45000.00, "OP-203"],
    ["22/02/2026", "SERVICIOS TECH SOLUTIONS", -15000.00, "OP-205"],
    ["25/02/2026", "COBRO FACT-A-302", 450000.00, "REC-602"]
];

// 2. Invoices (AR/AP)
// Ensure names match EXACTLY with generated entities
const invoiceData = [
    ["Fecha", "Entidad", "Número", "Tipo", "Monto", "Vencimiento", "Estado"],
    ["01/01/2026", "Cliente Alpha S.A.", "A-0001", "Venta", 350000.00, "15/01/2026", "Cobrada"],
    ["10/01/2026", "Cliente Beta Corp", "A-0002", "Venta", 450000.00, "25/01/2026", "Cobrada"],
    ["10/01/2026", "Inmobiliaria Local", "B-5521", "Compra", 100000.00, "10/01/2026", "Pagada"],
    ["20/01/2026", "Tech Solutions", "A-1200", "Venta", 120000.00, "20/02/2026", "Pendiente"],
    ["22/01/2026", "Tech Solutions", "C-0091", "Compra", 15000.00, "22/01/2026", "Pagada"],
    ["01/02/2026", "Cliente Alpha S.A.", "A-0003", "Venta", 350000.00, "15/02/2026", "Cobrada"],
    ["10/02/2026", "Cliente Beta Corp", "A-0004", "Venta", 450000.00, "25/02/2026", "Cobrada"],
    ["10/02/2026", "Inmobiliaria Local", "B-5522", "Compra", 120000.00, "10/02/2026", "Pagada"],
    ["01/03/2026", "Cliente Gamma (CRÍTICO)", "A-9901", "Venta", 900000.00, "05/03/2026", "Pendiente"],
    ["10/03/2026", "Proveedor Importación", "IMP-550", "Compra", 1500000.00, "15/03/2026", "Pendiente"]
];

// 2.1 Entities (Clients and Suppliers) SEPARATED
const clientData = [
    ["Razón Social", "CUIT", "CBU", "Email", "Categoría"],
    ["Cliente Alpha S.A.", "30-11223344-5", "0000003100012345678901", "alpha@test.com", "cliente"],
    ["Cliente Beta Corp", "30-22334455-6", "0000003100012345678902", "beta@test.com", "cliente"],
    ["Tech Solutions", "30-33445566-7", "0000003100012345678903", "tech@test.com", "ambos"],
    ["Cliente Gamma (CRÍTICO)", "30-44556677-8", "0000003100012345678904", "gamma@test.com", "cliente"]
];

const supplierData = [
    ["Razón Social", "CUIT", "Categoría"],
    ["Inmobiliaria Local", "30-55667788-9", "proveedor"],
    ["Proveedor Importación", "30-66778899-0", "proveedor"],
    ["Tech Solutions", "30-33445566-7", "ambos"]
];

// 3. Payments/Receipts (Treasury Movements + Instruments)
const paymentData = [
    ["Fecha", "Entidad", "Monto", "Tipo", "Método", "Banco"],
    ["10/01/2026", "Cliente Alpha S.A.", 350000.00, "Cobro", "Transferencia", "Galicia"],
    ["12/01/2026", "Inmobiliaria Local", 100000.00, "Pago", "Efectivo", ""],
    ["15/01/2026", "Cliente Beta Corp", 450000.00, "Cobro", "Transferencia", "Santander"],
    ["10/02/2026", "Cliente Alpha S.A.", 350000.00, "Cobro", "Transferencia", "Galicia"]
];

// Helper to save sheet
function saveExcel(data, filename) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, path.join(outputDir, filename));
    console.log(`Generated: ${filename}`);
}

saveExcel(bankData, 'bank_statement.xlsx');
saveExcel(invoiceData, 'invoices.xlsx');
saveExcel(clientData, 'clients.xlsx');
saveExcel(supplierData, 'suppliers.xlsx');
saveExcel(paymentData, 'payments.xlsx');

console.log("\nData generation complete in: " + outputDir);
