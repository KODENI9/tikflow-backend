import { db } from './src/config/firebase';

async function run() {
    console.log('--- LATEST PAYMENTS ---');
    const payments = await db.collection('payments').orderBy('createdAt', 'desc').limit(5).get();
    payments.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Status: ${data.status}, Type: ${data.type}, Coins: ${data._meta?.amount_coins}, Phone: ${data.phone}, OrderId: ${data.orderId}`);
        if (data.callbackData) {
            console.log(`   Callback: ${JSON.stringify(data.callbackData)}`);
        }
    });

    console.log('--- LATEST TRANSACTIONS ---');
    const txs = await db.collection('transactions').orderBy('created_at', 'desc').limit(5).get();
    txs.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Status: ${data.status}, Type: ${data.type}, Coins: ${data.amount_coins}, Phone: ${data.user_phone}`);
    });
}

run().then(() => process.exit(0)).catch(console.error);
