
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkStats() {
    try {
        const statsRef = db.collection('platform_stats').doc('main');
        const doc = await statsRef.get();
        if (!doc.exists) {
            console.log('❌ Platform stats document does not exist.');
        } else {
            console.log('✅ Platform stats found:');
            console.log(JSON.stringify(doc.data(), null, 2));
        }
    } catch (error) {
        console.error('❌ Error checking stats:', error);
    } finally {
        process.exit();
    }
}

checkStats();
