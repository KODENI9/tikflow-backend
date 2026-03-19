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

    /**
     * Parse un SMS collé manuellement par l'utilisateur pour extraire le montant et le Ref ID.
     */
    static parseManualSMS(rawContent: string) {
        if (!rawContent) return { ref_id: null, amount: 0 };

        const contentNormalized = rawContent.replace(/\s+/g, ' ').trim();
        let ref_id: string | null = null;
        let amount: number = 0;

        // Regex plus flexible pour le montant
        // Supporte "Montant: 5000", "5000 FCFA", "recu 5000", "de 5000", "transfert de 5.000 F"
        const amountRegex = /(?:montant|reçu|recu|de|paiement|transfert de)\s*[:]?\s*([\d\s,.]+)\s*(?:f|fcfa|cfa)/i;
        const amountMatch = contentNormalized.match(amountRegex);

        if (amountMatch && amountMatch[1]) {
            // Nettoyage : enlever les espaces et les virgules (séparateurs de milliers) pour parseFloat
            const rawAmount = amountMatch[1].replace(/[\s,]/g, '');
            amount = parseFloat(rawAmount);
        }

        // Regex pour le Ref ID
        // Supporte "Ref: 2305...", "TXN ID: ...", "ID: ...", "Transaction ID: ..."
        const refRegex = /(?:ref|txn\s*id|transaction\s*id|id)\s*[:\s.-]*([a-z0-9]{6,})/i;
        const refMatch = contentNormalized.match(refRegex);

        if (refMatch && refMatch[1]) {
            ref_id = refMatch[1];
        }

        return { ref_id, amount };
    }

    /**
     * Vérifie si un paiement avec ce Ref ID a été reçu via webhook (donc réel)
     */
    static async verifyAgainstReceivedPayments(ref_id: string, expectedAmount: number) {
        if (!ref_id) return null;

        const payments = await this.paymentsCollection
            .where('ref_id', '==', ref_id)
            .where('status', '==', 'unused')
            .limit(1)
            .get();

        if (payments.empty) return null;

        const paymentDoc = payments.docs[0];
        const paymentData = paymentDoc.data();

        // On vérifie que le montant correspond (marge d'erreur minime possible si besoin)
        if (Math.abs(paymentData.amount - expectedAmount) > 10) {
            console.log(`[SMS_VERIFY] Montant mismatch: attendu ${expectedAmount}, reçu ${paymentData.amount}`);
            return null;
        }

        return { id: paymentDoc.id, ...paymentData };
    }
}
