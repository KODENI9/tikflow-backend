import { PaymentService } from './src/services/payment.service';
import { MoneyFusionService } from './src/services/moneyfusion.service';
import { db } from './src/config/firebase';

async function recover() {
    console.log('--- RECOVERING PENDING PAYMENTS ---');
    const payments = await db.collection('payments').where('status', '==', 'PENDING').get();
    
    for (const doc of payments.docs) {
        const data = doc.data();
        const token = data.moneyFusionToken;
        if (!token) {
            console.log(`Payment ${doc.id} has no token. Skipping.`);
            continue;
        }

        console.log(`Checking payment ${doc.id} with token ${token}...`);
        try {
            const status = await MoneyFusionService.checkPaymentStatus(token);
            if (MoneyFusionService.isPaymentConfirmed(status)) {
                console.log(`   -> Confirmed! Delivering coins...`);
                await PaymentService.handleWebhook({ token });
                console.log(`   -> Handled successfully.`);
            } else {
                console.log(`   -> Not confirmed on MoneyFusion yet.`);
            }
        } catch (err: any) {
            console.error(`   -> Error checking payment: ${err.message}`);
        }
    }
    console.log('--- DONE ---');
}

recover().then(() => process.exit(0)).catch(console.error);
