// Simplified logic from LiquidityEngine to verify the fix
function simulateStressTest(currentBalance, plannedPayments, overdraftLimit = 0) {
    let runningBalance = currentBalance;
    let lowestBalance = currentBalance;
    let alertLevel = 'low';

    plannedPayments.forEach(payment => {
        // FIX applied here: subtraction instead of addition
        runningBalance -= payment.amount;
        if (runningBalance < lowestBalance) lowestBalance = runningBalance;
    });

    if (lowestBalance < -overdraftLimit) alertLevel = 'high';
    else if (lowestBalance < 0) alertLevel = 'medium';

    return { runningBalance, lowestBalance, alertLevel };
}

const mockBalance = 1000000;
const mockPayments = [
    { amount: 800000 },
    { amount: 300000 }
];
const overdraft = 200000;

const result = simulateStressTest(mockBalance, mockPayments, overdraft);

console.log("Balance Final:", result.runningBalance); // Should be -100,000
console.log("Lowest Balance:", result.lowestBalance); // Should be -100,000
console.log("Alert Level:", result.alertLevel); // Should be 'medium' (below 0 but above -200,000)

if (result.runningBalance === -100000 && result.alertLevel === 'medium') {
    console.log("✅ LOGIC VERIFIED: Outflows are correctly subtracted.");
} else {
    console.log("❌ LOGIC ERROR: Expected -100,000, got", result.runningBalance);
}
