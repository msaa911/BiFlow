import { TreasuryEngine, Invoice, ProjectedMovement } from '../lib/treasury-engine'
import { MonthlyCashFlowData, MonthlyCashFlowRow } from '../lib/treasury-engine'

const mockInvoices: Invoice[] = [
    {
        id: '1',
        tipo: 'factura_venta',
        razon_social_entidad: 'Cliente A',
        cuit_entidad: '20-11111111-9',
        fecha_emision: '2024-03-01',
        fecha_vencimiento: '2024-03-15',
        monto_total: 121000,
        monto_pendiente: 121000,
        estado: 'pendiente'
    },
    {
        id: '2',
        tipo: 'factura_compra',
        razon_social_entidad: 'Proveedor B',
        cuit_entidad: '20-22222222-9',
        fecha_emision: '2024-03-05',
        fecha_vencimiento: '2024-03-20',
        monto_total: 60500,
        monto_pendiente: 60500,
        estado: 'pendiente'
    }
]

const mockProjects: ProjectedMovement[] = [
    {
        id: 'p1',
        descripcion: 'Pago Alquiler',
        monto: -50000,
        fecha: '2024-04-05',
        isProjected: true,
        categoria: 'Pagos de Arrendamientos'
    }
]

console.log('--- Testing Monthly Cash Flow ---')
const currentBalance = 1000000
const monthlyData = TreasuryEngine.getMonthlyCashFlow(currentBalance, mockInvoices, [], mockProjects)

console.log('Months:', monthlyData.months.slice(0, 3))

const initialBalanceRow = monthlyData.rows.find(r => r.label === 'Saldo Inicial')
const salesRow = monthlyData.rows.find(r => r.label === 'Ventas al Contado/Plazo')
const purchaseRow = monthlyData.rows.find(r => r.label === 'Pagos a Proveedores')
const rentRow = monthlyData.rows.find(r => r.label === 'Pagos de Arrendamientos')
const ivaRow = monthlyData.rows.find(r => r.label === 'Liquidación de IVA (Est.)')
const finalBalanceRow = monthlyData.rows.find(r => r.label === 'Saldo Final (=)')

console.log('Marzo - Saldo Inicial:', initialBalanceRow?.values[0])
console.log('Marzo - Ventas:', salesRow?.values[0])
console.log('Marzo - Proveedores:', purchaseRow?.values[0])
console.log('Marzo - Saldo Final:', finalBalanceRow?.values[0])

console.log('\nAbril - Saldo Inicial:', initialBalanceRow?.values[1])
console.log('Abril - Alquiler:', rentRow?.values[1])
console.log('Abril - IVA (Est.):', ivaRow?.values[1]) // Should reflect March IVA

const calculatedFinalMarch = currentBalance + (salesRow?.values[0] || 0) - (purchaseRow?.values[0] || 0)
if (finalBalanceRow?.values[0] === calculatedFinalMarch) {
    console.log('\n✅ March Final Balance Correct')
} else {
    console.log('\n❌ March Final Balance Mismatch')
}

// Expected IVA for March: Sales 121k (21k IVA) - Purchases 60.5k (10.5k IVA if 21%)
// We used /1.21 * 0.21 in engine
const marchCreditIVA = (121000 / 1.21) * 0.21 // 21000
const marchDebitIVA = (60500 / 1.21) * 0.21  // 10500
const expectedIVAApril = marchCreditIVA - marchDebitIVA // 10500 (Payment)

if (Math.abs((ivaRow?.values[1] || 0) + expectedIVAApril) < 1) {
    console.log('✅ IVA Projection Correct (Settlement in April)')
} else {
    console.log('❌ IVA Projection Incorrect. Got:', ivaRow?.values[1], 'Expected:', -expectedIVAApril)
}

console.log('\n--- Testing Horizon Projection ---')
const horizon30 = TreasuryEngine.projectDailyBalance(currentBalance, mockInvoices, mockProjects, 0, 30)
console.log('Horizon 30 entries count:', horizon30.length)
if (horizon30.length === 30) {
    console.log('✅ Horizon 30 Correct')
}

const horizon90 = TreasuryEngine.projectDailyBalance(currentBalance, mockInvoices, mockProjects, 0, 90)
console.log('Horizon 90 entries count:', horizon90.length)
if (horizon90.length === 90) {
    console.log('✅ Horizon 90 Correct')
}
