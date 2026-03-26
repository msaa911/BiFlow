import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { GoogleGenerativeAI } from '@google/generative-ai'

async function listAll() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || '')
  try {
    // There is no listModels in the SDK directly easily, but we can try to guess or use the v1 API.
    // Instead, I'll try common names.
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash']
    for (const m of models) {
      console.log(`Checking ${m}...`)
      try {
        const model = genAI.getGenerativeModel({ model: m })
        const res = await model.generateContent('hi')
        console.log(`- ${m} works! Response: ${res.response.text().trim()}`)
      } catch (err: any) {
        console.log(`- ${m} failed: ${err.message.substring(0, 100)}`)
      }
    }
  } catch (e: any) {
    console.error('List Error:', e.message)
  }
}
listAll()
