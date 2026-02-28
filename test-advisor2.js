require('dotenv').config({ path: '.env.local' });
const { CashFlowAdvisor } = require('./lib/ai/cashflow-advisor');

(async () => {
    try {
        const advisor = new CashFlowAdvisor();
        console.log("Advisor instance created");
        // const reply = await advisor.generateResponse('some-org-id', 'Hola', [], '');
        // console.log("Reply:", reply);
    } catch (e) {
        console.error("Error Instantiating:", e);
    }
})();
