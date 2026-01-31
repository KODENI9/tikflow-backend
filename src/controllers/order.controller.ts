// src/controllers/order.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { Transaction } from '../models/Transaction';


// 1. Acheter des coins en utilisant le solde du Wallet interne
export const buyWithWallet = async (req: Request, res: Response) => {
    try {
        const { packageId,
             tiktok_username,
             tiktok_password,
         } = req.body;
        const userId = req.auth.userId; // ID de l'utilisateur connecté

        if (!packageId || !tiktok_username || !tiktok_password) {
            res.status(400).json({ message: "Package ID et compte TikTok requis" });
            return;
        }

        // 1. Démarrer une transaction Firestore pour garantir la sécurité
        const result = await db.runTransaction(async (t) => {
            // A. Vérifier si le package existe
            const pkgRef = db.collection('packages').doc(packageId);
            const pkgDoc = await t.get(pkgRef);
            if (!pkgDoc.exists) throw new Error("Le pack sélectionné n'existe pas.");
            
            const pkgData = pkgDoc.data();
            const price = pkgData?.price_cfa;
            const coins = pkgData?.coins;

            // B. Vérifier le solde du Wallet
            const walletRef = db.collection('wallets').doc(userId);
            const walletDoc = await t.get(walletRef);
            const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

            if (currentBalance < price) {
                throw new Error(`Solde insuffisant. Il vous manque ${price - currentBalance} CFA.`);
            }

            // C. Débiter le Wallet
            t.update(walletRef, { 
                balance: currentBalance - price,
                updated_at: new Date() 
            });

            // D. Créer la transaction d'achat de coins
            const newTransaction: Transaction = {
                user_id: userId,
                type: 'achat_coins',
                payment_method: 'skthib', // Indique que c'est payé via le solde interne
                ref_id: `WALLET_${Date.now()}`,
                amount_cfa: price,
                amount_coins: coins,
                tiktok_username,
                tiktok_password,
                status: 'pending', // L'admin doit encore livrer les coins sur TikTok
                created_at: new Date()
            };

            const newTransRef = db.collection('transactions').doc();
            t.set(newTransRef, newTransaction);

            return { transactionId: newTransRef.id, newBalance: currentBalance - price };
        });

        res.status(200).json({
            success: true,
            message: "Achat réussi ! Vos coins seront livrés sous peu.",
            data: result
        });

    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};