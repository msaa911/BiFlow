import { CashFlowAdvisor } from './lib/ai/cashflow-advisor';

async function testAdvisor() {
    const advisor = new CashFlowAdvisor();
    const orgId = "550e8400-e29b-41d4-a716-446655440000"; // Sample Org ID

    console.log("--- Testing AI Advisor ---");

    try {
        console.log("1. Testing General Metrics Query...");
        const response1 = await advisor.generateResponse(orgId, "¿Cuál es mi saldo actual y mi burn rate?");
        console.log("Response 1:", response1);

        console.log("\n2. Testing Netting Query...");
        const response2 = await advisor.generateResponse(orgId, "¿Hay alguna oportunidad de netting (compensación) hoy?");
        console.log("Response 2:", response2);

        console.log("\n3. Testing Risk Scoring...");
        const response3 = await advisor.generateResponse(orgId, "¿Qué calificación tiene el cliente con CUIT 30-12345678-9?");
        console.log("Response 3:", response3);

    } catch (error) {
        console.error("Test failed:", error);
    }
}

// testAdvisor(); // Commented out for now as it requires full environment
