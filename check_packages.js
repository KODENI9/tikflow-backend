
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

async function checkPackages() {
    try {
        const snapshot = await db.collection('packages').get();
        console.log(`Total packages: ${snapshot.size}`);
        snapshot.forEach(doc => {
            console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
        });
    } catch (error) {
        console.error('❌ Error checking packages:', error);
    } finally {
        process.exit();
    }
}

checkPackages();
