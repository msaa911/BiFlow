import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { extractTransactionsFromPdfBuffer } from '../../lib/ai/pdf-service'
import { jsPDF } from 'jspdf'
import * as fs from 'fs'

async function runTest() {
  console.log('--- STARTING AI PDF TEST ---')
  
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.error('ERROR: GOOGLE_GENAI_API_KEY is not set in .env.local')
    return
  }

  // 1. Crear un PDF de prueba con jspdf
  console.log('1. Generating sample PDF...')
  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text('REUMEN DE CUENTA BANCARIA', 20, 20)
  doc.setFontSize(12)
  doc.text('Fecha: 2026-03-20', 20, 30)
  doc.text('Cliente: Juan Perez', 20, 40)
  
  doc.text('Movimientos:', 20, 60)
  doc.text('20/03/2026   ABONO SUELDO   +500000.00', 20, 70)
  doc.text('21/03/2026   PAGO EDENOR     -15000.00', 20, 80)
  doc.text('22/03/2026   COMPRA COCO     -2500.50', 20, 90)
  
  const pdfOutput = doc.output('arraybuffer')
  const buffer = Buffer.from(pdfOutput)
  
  // Guardar para inspección opcional
  // fs.writeFileSync('./test-output.pdf', buffer)

  // 2. Ejecutar extracción
  console.log('2. Sending to Gemini AI...')
  try {
    const transactions = await extractTransactionsFromPdfBuffer(buffer)
    console.log('3. Results received:')
    console.table(transactions)
    
    if (transactions.length === 3) {
      console.log('SUCCESS: All 3 transactions extracted correctly.')
    } else {
      console.warn(`WARNING: Expected 3 transactions, but got ${transactions.length}`)
    }
  } catch (error) {
    console.error('CRITICAL ERROR DURING TEST:', error)
  }
}

runTest()
