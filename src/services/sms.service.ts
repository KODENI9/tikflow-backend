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
            amount = SmsService.robustParseAmount(amountMatch[1]);
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
            amount = SmsService.robustParseAmount(amountMatch[1]);
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
     * Parse un montant de manière robuste en gérant les espaces, les virgules (décimales) 
     * et les points (milliers/décimales).
     */
    private static robustParseAmount(rawAmount: string): number {
        // 1. Nettoyage des espaces (y compris espaces insécables)
        let s = rawAmount.trim().replace(/[\s\u00A0]/g, '');
        
        // 2. S'il n'y a aucun séparateur, on retourne directement
        if (!(/[.,]/.test(s))) {
            return parseFloat(s) || 0;
        }

        // 3. On regarde le DERNIER séparateur
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        const lastSepIndex = Math.max(lastDot, lastComma);
        
        if (lastSepIndex === -1) return parseFloat(s) || 0;

        const afterSep = s.substring(lastSepIndex + 1);
        
        // Si le séparateur est suivi par exactement 3 chiffres, c'est probablement un séparateur de milliers (ex: 1.250 ou 1,250)
        // SAUF si c'est le seul séparateur et que le nombre commence par 0 (ex: 0.123)
        if (afterSep.length === 3 && !s.startsWith('0')) {
            // On enlève TOUS les séparateurs
            return parseFloat(s.replace(/[.,]/g, '')) || 0;
        }

        // Si le séparateur est suivi par 1 ou 2 chiffres (ou plus de 3), on considère que c'est une décimale
        // On enlève tous les autres séparateurs avant, et on s'assure que celui-ci est un point
        const before = s.substring(0, lastSepIndex).replace(/[.,]/g, '');
        const currentSep = s[lastSepIndex];
        
        return parseFloat(before + '.' + afterSep) || 0;
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
