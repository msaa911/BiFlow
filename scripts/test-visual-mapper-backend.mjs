import { UniversalTranslator } from '../lib/universal-translator.ts'

async function testSampleExtraction() {
    console.log('--- TESTING SAMPLE EXTRACTION ---')

    const randomCSV = `Random,Data,Columns
20/02/2026,Something,123.45,30-12345678-9,CBU123
21/02/2026,Else,678.90,30-98765432-1,CBU456
    `

    console.log('Testing getSampleRows...')
    const samples = UniversalTranslator.getSampleRows(randomCSV)
    console.log('Samples extracted:', JSON.stringify(samples, null, 2))

    if (samples.length === 3 && samples[1][0] === '20/02/2026') {
        console.log('Sample extraction successful! ✅')
    } else {
        throw new Error('Sample extraction failed')
    }

    console.log('Testing translate with custom template...')
    const template = {
        tipo: 'delimited',
        reglas: {
            delimiter: ',',
            fecha: 0,
            concepto: 1,
            monto: 2,
            cuit: 3,
            cbu: 4
        }
    }

    const result = UniversalTranslator.translate(randomCSV, { template })
    console.log('Parsed transactions:', result.transactions.length)

    if (result.transactions.length === 2 && result.transactions[0].monto === 123.45) {
        console.log('Custom template parsing successful! ✅')
    } else {
        throw new Error('Custom template parsing failed')
    }

    console.log('--- ALL BACKEND TESTS PASSED ✅ ---')
}

testSampleExtraction().catch(console.error)
