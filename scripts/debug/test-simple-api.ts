import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { GoogleGenerativeAI } from '@google/generative-ai'

async function test() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || ''
  console.log(`Using API Key starting with: ${apiKey.substring(0, 4)}...`)
  const genAI = new GoogleGenerativeAI(apiKey)
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' })
    const result = await model.generateContent('Say "API working"')
    console.log('Result:', result.response.text())
  } catch (e: any) {
    console.error('API Error:', e.message)
    if (e.message.includes('429')) console.log('Advice: Wait 60s or check quota in AI Studio')
  }
}
test()
