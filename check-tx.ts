import { db } from './src/config/firebase';

async function run() {
    const txs = await db.collection('transactions').where('status', '==', 'pending').get();
    console.log(`Found ${txs.size} pending transactions.`);
    txs.forEach(doc => {
        const data = doc.data();
        const date = data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at);
        console.log(`TX ID: ${doc.id}, Type: ${data.type}, Coins: ${data.amount_coins}, Date: ${date.toISOString()}`);
    });
}
run().then(() => process.exit(0)).catch(console.error);
