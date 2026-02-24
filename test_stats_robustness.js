
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// 1. Mock the services/models to test our logic
// We'll test the logic by manually running similar queries or importing if possible

async function testRobustness() {
    try {
        console.log('--- Starting Robustness Test ---');

        // Mocking the behavior of the updated AnalyticsService.getStats()
        const defaultStats = {
            totalDeposits: 0,
            totalSalesVolume: 0,
            totalCost: 0,
            totalProfit: 0,
            averageTransactionValue: 0,
            totalUsersBalance: 0,
            totalTransactions: 0,
            totalCoinsSold: 0,
            totalUsers: 0,
            monthlyStats: {},
            updated_at: new Date()
        };

        const statsDocRef = db.collection('platform_stats').doc('main');
        const doc = await statsDocRef.get();
        const data = doc.exists ? doc.data() : {};

        const analyticsStats = {
            ...defaultStats,
            ...data,
            monthlyStats: data?.monthlyStats || {}
        };

        console.log('✅ Analytics Stats (merged with defaults):');
        console.log(JSON.stringify(analyticsStats, null, 2));

        // Verify that all expected fields are present and are numbers
        const fieldsToVerify = [
            'totalDeposits', 'totalSalesVolume', 'totalCost',
            'totalProfit', 'totalUsersBalance', 'totalTransactions', 'totalCoinsSold'
        ];

        let allAreNumbers = true;
        fieldsToVerify.forEach(field => {
            if (typeof analyticsStats[field] !== 'number') {
                console.error(`❌ Field ${field} is NOT a number:`, typeof analyticsStats[field]);
                allAreNumbers = false;
            }
        });

        if (allAreNumbers) {
            console.log('✅ All financial fields are valid numbers.');
        }

        // Verify monthlyStats is an object
        if (typeof analyticsStats.monthlyStats === 'object' && analyticsStats.monthlyStats !== null) {
            console.log('✅ monthlyStats is a valid object.');
        } else {
            console.error('❌ monthlyStats is NOT an object:', typeof analyticsStats.monthlyStats);
        }

        console.log('--- Robustness Test Finished ---');
    } catch (error) {
        console.error('❌ Robustness Test Failed:', error);
    } finally {
        process.exit();
    }
}

testRobustness();
