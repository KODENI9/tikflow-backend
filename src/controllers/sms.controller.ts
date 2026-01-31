// src/controllers/sms.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/firebase';

const OFFICIAL_SENDERS = ['TMoney', 'Flooz', 'MoovMoney', '0000']; // À adapter selon ton pays

export const handleSMSWebhook = async (req: Request, res: Response) => {
    try {
        const { message, from } = req.body; // 'message' est le texte du SMS

        if (!message) {
            res.status(400).send("No message found");
            return;
        }

        if (!OFFICIAL_SENDERS.includes(from)) {
        console.log(`🚨 Tentative de fraude : SMS reçu de ${from} au lieu d'un service officiel.`);
        res.status(403).json({ message: "Expéditeur non autorisé" });
        return;
        }

        let ref_id = "";
        let amount = 0;


        // Regex Robuste pour extraire Montant et Ref
        const amountMatch = message.match(/(?:recu|de)\s+(\d+)\s*(?:F|FCFA)/i);
        const refMatch = message.match(/(?:Ref:|ID:)\s*(\d+)/i);

        if (amountMatch) amount = Number(amountMatch[1]);
        if (refMatch) ref_id = refMatch[1];

        if (ref_id && amount > 0) {
            // Vérifier les doublons
            const dup = await db.collection('received_payments').where('ref_id', '==', ref_id).get();
            if (!dup.empty) return res.status(200).send("Duplicate");

            await db.collection('received_payments').add({
                ref_id, amount, sender_phone: from, raw_sms: message,
                status: 'unused', received_at: new Date()
            });
            res.status(200).json({ success: true, ref_id });
        } else {
            console.log("⚠️ SMS reçu mais non reconnu comme un paiement.");
            res.status(200).send("SMS ignored (Not a payment)");
        }

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

