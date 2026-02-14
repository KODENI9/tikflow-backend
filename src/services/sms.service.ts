// src/services/sms.service.ts
import { db } from '../config/firebase';
import { AppError } from '../utils/AppError';

const OFFICIAL_SENDERS = ['TMoney', 'Flooz', 'MoovMoney', '0000'];

export class SmsService {
    private static paymentsCollection = db.collection('received_payments');

    static async handleSMSWebhook(sender: string, rawContent: string) {
        console.log("Received SMS from:", sender);
        if (!rawContent || !sender) {
            throw new AppError("Données manquantes (sender ou message)", 400);
        }

        if (!OFFICIAL_SENDERS.includes(sender)) {
            throw new AppError("Expéditeur non autorisé", 403);
        }

        const contentNormalized = rawContent.replace(/\s+/g, ' ').trim();
        let ref_id: string | null = null;
        let amount: number = 0;

        const amountRegex = /(?:montant|reçu|recu|de)\s*[:]?\s*([\d\s.,]+)\s*(?:f|fcfa)/i;
        const amountMatch = contentNormalized.match(amountRegex);

        if (amountMatch && amountMatch[1]) {
            const rawAmount = amountMatch[1].replace(/,/g, '.').replace(/[^\d.]/g, '');
            amount = parseFloat(rawAmount);
        }

        const refRegex = /(?:ref|txn\s*id|transaction\s*id|id)\s*[:\s.]*([a-z0-9]+)/i;
        const refMatch = contentNormalized.match(refRegex);

        if (refMatch && refMatch[1]) {
            ref_id = refMatch[1];
        }

        if (ref_id && amount > 0) {
            const duplicateCheck = await this.paymentsCollection
                .where('ref_id', '==', ref_id)
                .limit(1)
                .get();

            if (!duplicateCheck.empty) {
                return { status: "duplicate", message: "Duplicate handled" };
            }

            await this.paymentsCollection.add({
                ref_id: ref_id,
                amount: amount,
                sender_phone: sender,
                raw_sms: rawContent,
                parsed_content: contentNormalized,
                status: 'unused',
                provider: 'flooz',
                received_at: new Date()
            });

            return { status: "success", ref_id, amount };
        } else {
             // We return a specific status to indicate parsing failure but "success" in terms of HTTP response to provider
             return { status: "parsing_failed", message: "SMS processed but parsing failed" };
        }
    }
}
