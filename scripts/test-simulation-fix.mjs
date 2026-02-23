import { LiquidityEngine } from './lib/liquidity-engine.js'

const mockBalance = 1000000; // 1M
const mockPayments = [
    { description: 'Sueldos', amount: 800000, date: '2026-03-01' },
    { description: 'Alquiler', amount: 300000, date: '2026-03-05' }
];
const overdraft = 200000;

console.log("--- SIMULACIÓN STRESS TEST ---");
const result = LiquidityEngine.simulateStressTest(mockBalance, mockPayments, overdraft);

console.log("Saldo Inicial:", mockBalance);
console.log("Saldo Final Proyectado:", result.projection[result.projection.length - 1].balance);
console.log("Punto más bajo:", result.lowestBalance);
console.log("Nivel de Alerta:", result.alertLevel);
console.log("Días de supervivencia:", result.survivalDays);

if (result.lowestBalance < 0 && result.alertLevel !== 'low') {
    console.log("✅ TEST PASSED: El saldo bajó y se detectó alerta.");
} else if (result.projection[result.projection.length - 1].balance < mockBalance) {
    console.log("✅ TEST PASSED: El saldo final es menor al inicial (egresos restados correctamente).");
} else {
    console.log("❌ TEST FAILED: El saldo no bajó como se esperaba.");
}
