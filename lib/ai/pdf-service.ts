import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY is not defined in environment variables')
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

// Esquema de salida estructurada para transacciones bancarias
const responseSchema: any = {
  type: SchemaType.OBJECT,
  properties: {
    transacciones: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          fecha: {
            type: SchemaType.STRING,
            description: "Fecha de la transacción en formato YYYY-MM-DD",
          },
          descripcion: {
            type: SchemaType.STRING,
            description: "Descripción o concepto del movimiento bancario",
          },
          monto: {
            type: SchemaType.NUMBER,
            description: "Monto de la transacción. Positivo para ingresos, negativo para egresos.",
          },
          cuit_emisor: {
            type: SchemaType.STRING,
            description: "CUIT del emisor/receptor si está disponible (opcional)",
          },
          referencia: {
            type: SchemaType.STRING,
            description: "Número de comprobante o referencia bancaria",
          },
        },
        required: ["fecha", "descripcion", "monto"],
      },
    },
  },
}

export async function extractTransactionsFromPdfBuffer(pdfBuffer: Buffer): Promise<any[]> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
  })

  const systemPrompt = `
    Eres un experto contable y financiero. Tu tarea es extraer TODAS las transacciones de un extracto bancario en PDF.
    - Asegúrate de capturar cada movimiento con su fecha, descripción y monto exacto.
    - Si el monto representa un egreso (débito), devuélvelo como un número negativo.
    - Si el monto representa un ingreso (crédito), devuélvelo como un número positivo.
    - No inventes datos. Si un campo no está claro, omítelo.
    - Responde EXCLUSIVAMENTE con el JSON solicitado.
  `

  const result = await model.generateContent([
    systemPrompt,
    {
      inlineData: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    },
  ])

  const responseText = result.response.text()
  try {
    const parsed = JSON.parse(responseText)
    return parsed.transacciones || []
  } catch (error) {
    console.error('Error parsing Gemini response:', responseText)
    throw new Error('Fallo al parsear la respuesta de la AI')
  }
}
