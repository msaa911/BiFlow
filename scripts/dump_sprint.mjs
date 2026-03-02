import fs from 'fs'
import path from 'path'

const sprintFiles = [
    'app/api/reconcile/auto/route.ts',
    'app/api/reconcile/suggestions/route.ts',
    'app/api/imports/route.ts',
    'app/api/imports/log/route.ts',
    'components/dashboard/unreconciled-panel.tsx',
    'components/dashboard/suppliers-tab.tsx',
    'components/dashboard/import-preview-modal.tsx',
    'components/dashboard/import-history.tsx',
    'lib/reconciliation-engine.ts'
]

let combinedText = 'Sprint 3 Final Updates (March 2, 2026) - Audit Bundle\n\n'

for (const f of sprintFiles) {
    const fullPath = path.join('d:/proyecto-biflow', f)
    if (fs.existsSync(fullPath)) {
        const text = fs.readFileSync(fullPath, 'utf8')
        combinedText += `\n\n=========================================\n${f}\n=========================================\n`
        combinedText += text
    } else {
        combinedText += `\n\n=========================================\n${f}\n=========================================\n(File not found)`
    }
}

fs.writeFileSync('d:/proyecto-biflow/sprint_3_dump.txt', combinedText)
console.log(`Generated dump. Total length: ${combinedText.length}`)
