
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Mocking AdminService dependencies
class AnalyticsService {
    static async getStats() {
        const doc = await db.collection('platform_stats').doc('main').get();
        return doc.data();
    }
}

async function testGetAdminStats() {
    try {
        console.log('--- Starting testGetAdminStats ---');
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        console.log('1. Fetching analyticsStats...');
        const analyticsStats = await AnalyticsService.getStats();
        console.log('✅ analyticsStats fetched');

        console.log("2. Fetching today's transactions...");
        const todaySalesSnapshot = await db.collection('transactions')
            .where('created_at', '>=', todayStart)
            .get();
        console.log(`✅ todaySalesSnapshot fetched (${todaySalesSnapshot.size} docs)`);

        console.log('3. Counting pending transactions...');
        const pendingSnapshot = await db.collection('transactions').where('status', '==', 'pending').count().get();
        console.log(`✅ pendingSnapshot fetched: ${pendingSnapshot.data().count}`);

        console.log('4. Counting total users...');
        const usersSnapshot = await db.collection('users').count().get();
        console.log(`✅ usersSnapshot fetched: ${usersSnapshot.data().count}`);

        console.log('--- Test Finished Successfully ---');
    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        process.exit();
    }
}

testGetAdminStats();
