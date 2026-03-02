import fs from 'fs'
import path from 'path'

const corePaths = [
    'lib',
    'app/api',
    'app/dashboard',
    'components/dashboard'
]

const allowedExtensions = ['.ts', '.tsx', '.sql']

const allFiles = []

function traverseDir(dir) {
    if (!fs.existsSync(dir)) return
    const files = fs.readdirSync(dir)
    for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
            traverseDir(fullPath)
        } else {
            if (allowedExtensions.includes(path.extname(file))) {
                allFiles.push(fullPath)
            }
        }
    }
}

corePaths.forEach(p => {
    traverseDir(path.join('d:/proyecto-biflow', p))
})

let combinedText = 'BiFlow Codebase Full Dump - 2026-03-02\n\n'

for (const f of allFiles) {
    const text = fs.readFileSync(f, 'utf8')
    combinedText += `\n\n=========================================\n${f.replace('d:\\proyecto-biflow\\', '')}\n=========================================\n`
    combinedText += text
}

fs.writeFileSync('d:/proyecto-biflow/full_codebase_dump.txt', combinedText)
console.log(`Generated dump with ${allFiles.length} files. Total length: ${combinedText.length}`)
