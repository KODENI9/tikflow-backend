import { db } from './src/config/firebase';
import { AnalyticsService } from './src/services/analytics.service';

async function run() {
    console.log('--- DELETING OLD PENDING TRANSACTIONS ---');
    const txs = await db.collection('transactions').where('status', '==', 'pending').get();
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let count = 0;
    
    for (const doc of txs.docs) {
        const data = doc.data();
        const date = data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at);
        
        // Only delete if it's older than 1 hour (to protect any brand new transactions)
        if (date < oneHourAgo) {
            await doc.ref.delete();
            console.log(`Deleted TX: ${doc.id}`);
            count++;
        }
    }
    console.log(`--- DELETED ${count} TRANSACTIONS ---`);
    
    console.log('--- REBUILDING STATS ---');
    await AnalyticsService.rebuildStatsFromScratch();
    console.log('--- DONE ---');
}

run().then(() => process.exit(0)).catch(console.error);
