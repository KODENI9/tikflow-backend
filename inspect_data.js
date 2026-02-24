
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

async function inspectData() {
    try {
        console.log('--- Inspecting Transactions ---');
        const snapshot = await db.collection('transactions').get();
        console.log(`Total transactions: ${snapshot.size}`);

        const statusCounts = {};
        const typeCounts = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
            typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
        });

        console.log('Status counts:', statusCounts);
        console.log('Type counts:', typeCounts);

        if (snapshot.size > 0) {
            console.log('Sample transaction:', snapshot.docs[0].data());
        }

    } catch (error) {
        console.error('❌ Error inspecting data:', error);
    } finally {
        process.exit();
    }
}

inspectData();
