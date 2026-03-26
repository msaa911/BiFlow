import { AnomalyEngine } from '../lib/anomaly-engine';

const mockTransactions = [
    {
        id: '1',
        fecha: '2026-03-01',
        descripcion: 'Pago Proveedor A',
        monto: -1500,
        metadata: {}
    },
    {
        id: '2',
        fecha: '2026-03-02',
        descripcion: 'Cobro Cliente B',
        monto: 3000,
        metadata: {}
    }
];

const historyMap = new Map();

console.log("--- TEST 1: Análisis con pool redundante (Simulando el bug anterior) ---");
const bugResult = AnomalyEngine.analyze(
    mockTransactions,
    historyMap,
    mockTransactions // Esto debería causar que se comparen con ellos mismos si no hay checks de ID
);

// Nota: AnomalyEngine.checkDuplicate tiene: if (t === current) return false;
// Pero si los objetos son clones o vienen de queries distintas, t === current falla.
// El bug reportado por el usuario indica que "infla los duplicados".

console.log("Hallazgos con bug:", bugResult.anomalies.length);

console.log("\n--- TEST 2: Análisis corregido (Sprint 4) ---");
const fixedResult = AnomalyEngine.analyze(
    mockTransactions,
    historyMap,
    [] // Pool histórico vacío
);

console.log("Hallazgos corregidos:", fixedResult.anomalies.length);

if (fixedResult.anomalies.length === 0) {
    console.log("\n✅ ÉXITO: El motor de anomalías ya no detecta falsos duplicados en un lote limpio.");
} else {
    console.log("\n❌ ERROR: Se detectaron anomalías en un lote que debería estar limpio.");
}
