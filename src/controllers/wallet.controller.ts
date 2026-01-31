//  src/controllers/wallet.controller.ts

import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { Transaction } from '../models/Transaction'; // Utilise ton interface !

export const chargeWallet = async (req: Request, res: Response): Promise<void> => {
    try {

        // Idéalement, j'utilise req.auth.userId pour la sécurité
        const { amount_cfa, ref_id, payment_method } = req.body;
        // plus sûr que d'envoyer user_id depuis le client (évite l'usurpation)
        const user_id = req.auth.userId;

        if (!user_id || !amount_cfa || !ref_id) {
            res.status(400).json({ success: false, message: "Données de paiement incomplètes." });
            return;
        }
        // --- SÉCURITÉ PRO : Vérification d'unicité du ref_id ---
        const existingRef = await db.collection('transactions')
            .where('ref_id', '==', ref_id)
            .limit(1)
            .get();

        if (!existingRef.empty) {
            res.status(409).json({ 
                success: false, 
                message: "Ce numéro de référence a déjà été soumis. Veuillez contacter le support si besoin." 
            });
            return;
        }

        // --- SÉCURITÉ SUPPLÉMENTAIRE : Empêcher trop de transactions 'pending' ---
        const pendingUserTrans = await db.collection('transactions')
            .where('user_id', '==', user_id)
            .where('status', '==', 'pending')
            .get();

        if (pendingUserTrans.size >= 3) { // Limite à 3 demandes en attente
            res.status(429).json({ 
                success: false, 
                message: "Vous avez trop de demandes en attente. Veuillez patienter que l'admin les valide." 
            });
            return;
        }

        // 1. On prépare l'objet selon ton modèle de transaction
        const transactionData: Transaction = {
            user_id,
            type: 'recharge', // Ici 'recharge' au sens "achat de crédit wallet"
            amount_cfa: Number(amount_cfa),
            amount_coins: 0, // Pas encore de coins, c'est juste du cash
            payment_method: payment_method || 'skthib',
            ref_id: ref_id,
            status: 'pending', // IMPORTANT: Toujours bloqué par défaut
            created_at: new Date()
        };
        // 2. Enregistrement centralisé
        const docRef = await db.collection('transactions').add(transactionData);
        // 3. Réponse au client
        res.status(201).json({
            success: true,
            message: "Recharge enregistrée avec succès !",
            transaction_id: docRef.id
        });


    } catch (error: any) {
        
        res.status(500).json({ success: false, error: error.message });
    }
};