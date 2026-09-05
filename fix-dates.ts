import { db } from './src/config/firebase';
import { AnalyticsService } from './src/services/analytics.service';

async function fixDates() {
    console.log('--- FIXING TRANSACTION DATES ---');
    const txs = await db.collection('transactions').where('status', '==', 'pending').get();
    
    let count = 0;
    for (const doc of txs.docs) {
        const txData = doc.data();
        const paymentId = txData.ref_id;
        
        if (!paymentId) continue;
        
        const paymentDoc = await db.collection('payments').doc(paymentId).get();
        if (!paymentDoc.exists) continue;
        
        const paymentData = paymentDoc.data();
        if (paymentData && paymentData.createdAt) {
            // Update transaction date to match payment date
            await doc.ref.update({
                created_at: paymentData.createdAt,
                updated_at: paymentData.createdAt
            });
            console.log(`Fixed TX ${doc.id} (moved back to ${paymentData.createdAt.toDate()})`);
            count++;
        }
    }
    console.log(`--- FIXED ${count} TRANSACTIONS ---`);
    
    console.log('--- REBUILDING STATS ---');
    await AnalyticsService.rebuildStatsFromScratch();
    console.log('--- DONE ---');
}

fixDates().then(() => process.exit(0)).catch(console.error);
