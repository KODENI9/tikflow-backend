// src/services/transaction.service.ts
import { db } from '../config/firebase';
import { Transaction } from '../models/Transaction';
import { AppError } from '../utils/AppError';
import { notificationService } from './notification.service';

export class TransactionService {
    private static transactionsCollection = db.collection('transactions');
    private static walletsCollection = db.collection('wallets');
    private static packagesCollection = db.collection('packages');

    static async  buyWithWallet(userId: string, packageId: string, tiktok_username: string, tiktok_password?: string) {
        if (!packageId || !tiktok_username) { // Password might be optional depending on logic, keeping it strict for now if controller did
             // Controller checked password, so I will too if it was required.
             // Original: if (!packageId || !tiktok_username || !tiktok_password)
             if (!tiktok_password) throw new AppError("Package ID, compte TikTok et mot de passe requis", 400); 
        }

        const result = await db.runTransaction(async (t) => {
            const pkgRef = this.packagesCollection.doc(packageId);
            const pkgDoc = await t.get(pkgRef);
            if (!pkgDoc.exists) throw new AppError("Le pack sélectionné n'existe pas.", 404);

            const pkgData = pkgDoc.data();
            const price = pkgData?.price_cfa;
            const coins = pkgData?.coins;

            const walletRef = this.walletsCollection.doc(userId);
            const walletDoc = await t.get(walletRef);
            const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

            if (currentBalance < price) {
                throw new AppError(`Solde insuffisant. Il vous manque ${price - currentBalance} CFA.`, 402);
            }

            t.update(walletRef, {
                balance: currentBalance - price,
                updated_at: new Date()
            });

            const newTransaction: Transaction = {
                user_id: userId,
                type: 'achat_coins',
                payment_method: 'skthib',
                ref_id: `WALLET_${Date.now()}`,
                amount_cfa: price,
                amount_coins: coins,
                tiktok_username,
                tiktok_password,
                status: 'pending',
                created_at: new Date()
            };

            const newTransRef = this.transactionsCollection.doc();
            t.set(newTransRef, newTransaction);
            
            return { 
                transactionId: newTransRef.id, 
                newBalance: currentBalance - price,
                coins,
                tiktok_username
            };
        });

        // Notification pour l'admin
        await notificationService.createAdminNotification(
            "Nouvelle commande TikTok 🚀",
            `L'utilisateur ${userId} a commandé ${result.coins} coins pour le compte ${result.tiktok_username}.`,
            'order_delivered',
            `/admin/orders/${result.transactionId}`
        );

        return result;
    }

    static async chargeWallet(userId: string, amount_cfa: number, ref_id: string, payment_method: any) {
         if (!userId || !amount_cfa || !ref_id) {
            throw new AppError("Données de paiement incomplètes.", 400);
        }

        const existingRef = await this.transactionsCollection
            .where('ref_id', '==', ref_id)
            .limit(1)
            .get();

        if (!existingRef.empty) {
            throw new AppError("Ce numéro de référence a déjà été soumis. Veuillez contacter le support si besoin.", 409);
        }

        const pendingUserTrans = await this.transactionsCollection
            .where('user_id', '==', userId)
            .where('status', '==', 'pending')
            .get();

        if (pendingUserTrans.size >= 3) {
            throw new AppError("Vous avez trop de demandes en attente. Veuillez patienter que l'admin les valide.", 429);
        }

        const transactionData: Transaction = {
            user_id: userId,
            type: 'recharge',
            amount_cfa: Number(amount_cfa),
            amount_coins: 0,
            payment_method: payment_method || 'skthib',
            ref_id: ref_id,
            status: 'pending',
            created_at: new Date()
        };

        const docRef = await this.transactionsCollection.add(transactionData);

        // Notification pour l'admin
        await notificationService.createAdminNotification(
            "Nouvelle demande de recharge 💰",
            `L'utilisateur ${userId} a soumis une preuve de recharge de ${amount_cfa} CFA.`,
            'payment_received',
            `/admin/transactions/${docRef.id}`
        );

        return docRef.id;
    }
}
