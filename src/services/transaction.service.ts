// src/services/transaction.service.ts
import { db } from '../config/firebase';
import { Transaction } from '../models/Transaction';
import { AppError } from '../utils/AppError';
import { notificationService } from './notification.service';

export class TransactionService {
    private static transactionsCollection = db.collection('transactions');
    private static walletsCollection = db.collection('wallets');
    private static packagesCollection = db.collection('packages');
    private static COIN_RATE = 11.2;

    static async  buyWithWallet(userId: string, packageId: string | undefined, tiktok_username: string, tiktok_password?: string, amount_coins?: number) {
        if ((!packageId && !amount_coins) || !tiktok_username) { 
             throw new AppError("Package ID ou montant de coins, et compte TikTok requis", 400); 
        }

        const result = await db.runTransaction(async (t) => {
            let price: number;
            let coins: number;
            let rateUsed: number | undefined = undefined;

            if (packageId) {
                const pkgRef = this.packagesCollection.doc(packageId);
                const pkgDoc = await t.get(pkgRef);
                if (!pkgDoc.exists) throw new AppError("Le pack sélectionné n'existe pas.", 404);

                const pkgData = pkgDoc.data();
                price = pkgData?.price_cfa;
                coins = pkgData?.coins;
            } else {
                // Achat personnalisé
                if (!amount_coins || amount_coins < 90) {
                    throw new AppError("Le montant minimum est de 90 coins.", 400);
                }

                coins = Math.floor(amount_coins);
                price = coins * this.COIN_RATE;
                rateUsed = this.COIN_RATE;
            }

            const walletRef = this.walletsCollection.doc(userId);
            const walletDoc = await t.get(walletRef);
            const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

            if (currentBalance < price) {
                throw new AppError(`Solde insuffisant. Il vous manque ${Math.ceil(price - currentBalance)} CFA.`, 402);
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
                ...(rateUsed !== undefined && { rate_used: rateUsed }),
                created_at: new Date()
            };

            const newTransRef = this.transactionsCollection.doc();
            t.set(newTransRef, newTransaction);
            
            return { 
                transactionId: newTransRef.id, 
                newBalance: currentBalance - price,
                coins,
                amount_cfa: price,
                tiktok_username
            };
        });

        // Récupérer les infos de l'utilisateur pour une notification plus claire
        const { UserService } = require('./user.service');
        const userIdentifier = await UserService.getUserDisplayName(userId);

        // Notification pour l'admin
        await notificationService.createAdminNotification(
            "Nouvelle commande TikTok 🚀",
            `L'utilisateur ${userIdentifier} a commandé ${result.coins} coins (${result.amount_cfa} CFA) pour le compte ${result.tiktok_username}.`,
            'order_delivered',
            `/admin/orders/${result.transactionId}`
        );

        return result;
    }

    static async createDirectPurchase(userId: string, packageId: string | undefined, tiktok_username: string, tiktok_password?: string, amount_coins?: number, payment_method: string = 'moneyfusion', ref_id: string = '') {
        if ((!packageId && !amount_coins) || !tiktok_username) { 
             throw new AppError("Package ID ou montant de coins, et compte TikTok requis", 400); 
        }

        const result = await db.runTransaction(async (t) => {
            let price: number;
            let coins: number;
            let rateUsed: number | undefined = undefined;

            if (packageId) {
                const pkgRef = this.packagesCollection.doc(packageId);
                const pkgDoc = await t.get(pkgRef);
                if (!pkgDoc.exists) throw new AppError("Le pack sélectionné n'existe pas.", 404);

                const pkgData = pkgDoc.data();
                price = pkgData?.price_cfa;
                coins = pkgData?.coins;
            } else {
                if (!amount_coins || amount_coins < 90) {
                    throw new AppError("Le montant minimum est de 90 coins.", 400);
                }
                coins = Math.floor(amount_coins);
                price = coins * this.COIN_RATE;
                rateUsed = this.COIN_RATE;
            }

            const newTransaction: any = {
                user_id: userId,
                type: 'achat_coins',
                payment_method,
                ref_id,
                amount_cfa: price,
                amount_coins: coins,
                tiktok_username,
                tiktok_password,
                status: 'pending',
                ...(rateUsed !== undefined && { rate_used: rateUsed }),
                created_at: new Date()
            };

            const newTransRef = this.transactionsCollection.doc();
            t.set(newTransRef, newTransaction);
            
            return { 
                transactionId: newTransRef.id, 
                coins,
                amount_cfa: price,
                tiktok_username
            };
        });

        const { UserService } = require('./user.service');
        const userIdentifier = await UserService.getUserDisplayName(userId);

        await notificationService.createAdminNotification(
            "Nouvelle commande TikTok 🚀",
            `L'utilisateur ${userIdentifier} a commandé ${result.coins} coins (${result.amount_cfa} CFA) via ${payment_method.toUpperCase()} pour le compte ${result.tiktok_username}.`,
            'order_delivered',
            `/admin/orders/${result.transactionId}`
        );

        return result;
    }

    static async chargeWallet(userId: string, amount_cfa: number, ref_id: string | undefined, payment_method: any, raw_sms?: string) {
         if (!userId || !amount_cfa) {
            throw new AppError("Données de paiement incomplètes.", 400);
        }

        let refIdToUse = ref_id;
        let isAutoVerified = false;

        if (!refIdToUse) {
            throw new AppError("ID de référence requis.", 400);
        }

        const existingRef = await this.transactionsCollection
            .where('ref_id', '==', refIdToUse)
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
            ref_id: refIdToUse,
            raw_sms: raw_sms || undefined,
            status: isAutoVerified ? 'completed' : 'pending',
            created_at: new Date()
        };

        // Si auto-vérifié, créditer le wallet immédiatement
        if (isAutoVerified) {
            await db.runTransaction(async (t) => {
                const walletRef = this.walletsCollection.doc(userId);
                const walletDoc = await t.get(walletRef);
                const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;
                
                t.set(walletRef, {
                    balance: currentBalance + Number(amount_cfa),
                    updated_at: new Date()
                }, { merge: true });
            });
        }

        const docRef = await this.transactionsCollection.add(transactionData);
        
        // Récupérer les infos de l'utilisateur pour une notification plus claire
        const { UserService: UserServiceRef } = require('./user.service');
        const userIdentifier = await UserServiceRef.getUserDisplayName(userId);

        // Notification pour l'admin
        const notifTitle = isAutoVerified ? "Recharge AUTO-VALIDÉE ⚡" : "Nouvelle demande de recharge 💰";
        const notifMsg = isAutoVerified 
            ? `L'utilisateur ${userIdentifier} a été crédité de ${amount_cfa} CFA (vérification SMS auto).`
            : `L'utilisateur ${userIdentifier} a soumis une preuve de recharge de ${amount_cfa} CFA (Ref: ${refIdToUse}).`;

        await notificationService.createAdminNotification(
            notifTitle,
            notifMsg,
            'payment_received',
            `/admin/transactions/${docRef.id}`
        );

        return docRef.id;
    }
}
