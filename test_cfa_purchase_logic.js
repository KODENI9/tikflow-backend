
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Mock TransactionService logic
const COIN_RATE = 12.5;

function calculateCoins(amount_cfa) {
    if (amount_cfa < 2000) {
        throw new Error("Le montant minimum est de 2000 CFA.");
    }
    const coins = amount_cfa / COIN_RATE;
    if (!Number.isInteger(coins)) {
        throw new Error(`Le montant de ${amount_cfa} CFA ne permet pas d'obtenir un nombre entier de coins (Taux: ${COIN_RATE} CFA/coin).`);
    }
    return coins;
}

async function testLogic() {
    const testCases = [
        { cfa: 2000, expectedCoins: 160, shouldPass: true },
        { cfa: 5000, expectedCoins: 400, shouldPass: true },
        { cfa: 1000, shouldPass: false },
        { cfa: 2010, shouldPass: false },
        { cfa: 12500, expectedCoins: 1000, shouldPass: true }
    ];

    console.log('--- Testing CFA Purchase Logic ---');
    for (const test of testCases) {
        try {
            const coins = calculateCoins(test.cfa);
            if (test.shouldPass) {
                if (coins === test.expectedCoins) {
                    console.log(`✅ Success: ${test.cfa} CFA -> ${coins} coins`);
                } else {
                    console.log(`❌ Failure: ${test.cfa} CFA -> Expected ${test.expectedCoins}, got ${coins}`);
                }
            } else {
                console.log(`❌ Failure: ${test.cfa} CFA passed but should have failed`);
            }
        } catch (error) {
            if (!test.shouldPass) {
                console.log(`✅ Success: ${test.cfa} CFA failed as expected: ${error.message}`);
            } else {
                console.log(`❌ Failure: ${test.cfa} CFA failed but should have passed: ${error.message}`);
            }
        }
    }
}

testLogic();
