const fs = require('fs');
const results = JSON.parse(fs.readFileSync('lint_results.json', 'utf8'));
const errors = results.filter(r => r.errorCount > 0);
errors.forEach(e => {
    console.log(e.filePath);
    e.messages.filter(m => m.severity === 2).forEach(m => {
        console.log(`  ${m.line}:${m.column} ${m.ruleId} ${m.message}`);
    });
});
