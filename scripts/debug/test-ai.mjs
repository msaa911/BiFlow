import { CashFlowAdvisor } from './lib/ai/cashflow-advisor.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    try {
        console.log("Initializing advisor...");
        const advisor = new CashFlowAdvisor();
        // Use the organization ID from previous logs
        const orgId = "8bca8172-b23f-4da7-b50c-ba2fd78187ac";

        console.log("Generating response...");
        const response = await advisor.generateResponse(orgId, "Hola, ¿cómo vienen mis números?");
        console.log("Response:", response);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
