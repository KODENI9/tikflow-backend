import { db } from './src/config/firebase';

async function run() {
    const start = new Date('2026-09-01T19:40:00Z');
    const end = new Date('2026-09-01T19:50:00Z');
    
    const payments = await db.collection('payments')
        .where('updatedAt', '>=', start)
        .where('updatedAt', '<=', end)
        .where('status', '==', 'PAID')
        .get();
        
    console.log(`Found ${payments.size} recovered payments.`);
    
    for (const doc of payments.docs) {
        const p = doc.data();
        console.log(`Payment ${doc.id} - Type: ${p.type} - Amount: ${p.amount}`);
        
        // Find corresponding transaction
        let txs;
        if (p.type === 'DEPOSIT') {
            txs = await db.collection('transactions').where('paymentId', '==', doc.id).get();
        } else {
            txs = await db.collection('transactions').where('ref_id', '==', doc.id).get();
        }
        
        txs.forEach(t => {
            console.log(`  -> Found TX: ${t.id} (${t.data().status})`);
        });
    }
}
run().then(() => process.exit(0));
