// src/services/admin.service.ts
import { db } from '../config/firebase';
import { Transaction } from '../models/Transaction';
import { ReceivedPayment } from '../models/ReceivedPayment';
import { Recipient } from '../models/Recipient';
import { AppError } from '../utils/AppError';
import { notificationService } from './notification.service';
import { AnalyticsService } from './analytics.service';

export class AdminService {
    private static transactionsCollection = db.collection('transactions');
    private static paymentsCollection = db.collection('received_payments');
    private static packagesCollection = db.collection('packages');
    private static recipientsCollection = db.collection('recipients');
    private static settingsCollection = db.collection('settings');
    private static walletsCollection = db.collection('wallets');
    private static usersCollection = db.collection('users');
    private static notificationsCollection = db.collection('notifications');

    static async getPendingTransactions() {
        const snapshot = await this.transactionsCollection
            .where('status', '==', 'pending')
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    static async getAllTransactions() {
        const snapshot = await this.transactionsCollection
            .limit(100)
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    static async getTransactionById(id: string) {
        const transDoc = await this.transactionsCollection.doc(id).get();

        if (!transDoc.exists) {
            throw new AppError("Transaction non trouvée.", 404);
        }

        const transactionData = { id: transDoc.id, ...transDoc.data() } as any;

        const paymentSnapshot = await this.paymentsCollection
            .where('ref_id', '==', transactionData.ref_id)
            .limit(1)
            .get();

        let evidence = null;
        if (!paymentSnapshot.empty) {
            const paymentDoc = paymentSnapshot.docs[0];
            evidence = { id: paymentDoc.id, ...paymentDoc.data() };
        }

        return {
            transaction: transactionData,
            evidence: evidence
        };
    }

    static async verifyAndCredit(transactionId: string) {
        return await db.runTransaction(async (t) => {
            const userTransRef = this.transactionsCollection.doc(transactionId);
            const userTransDoc = await t.get(userTransRef);
            const userTrans = userTransDoc.data() as Transaction;

            if (!userTransDoc.exists || userTrans.status !== 'pending') {
                throw new AppError("Demande invalide ou déjà traitée.", 400);
            }

            const smsQuery = await this.paymentsCollection
                .where('ref_id', '==', userTrans.ref_id)
                .where('status', '==', 'unused')
                .limit(1)
                .get();

            if (smsQuery.empty) {
                throw new AppError("Aucun paiement SMS trouvé avec ce Ref ID.", 404);
            }

            const smsDoc = smsQuery.docs[0];
            const smsData = smsDoc.data();

            if (smsData.amount < userTrans.amount_cfa) {
                throw new AppError(`Montant SMS (${smsData.amount}) insuffisant.`, 400);
            }

            const walletRef = this.walletsCollection.doc(userTrans.user_id);
            const walletDoc = await t.get(walletRef);
            const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

            t.set(walletRef, {
                balance: currentBalance + userTrans.amount_cfa,
                updated_at: new Date(),
            }, { merge: true });

            t.update(smsDoc.ref, { status: 'used' });
            t.update(userTransRef, { status: 'completed', updated_at: new Date() });
            
            // Notification pour l'utilisateur
            const notifRef = this.notificationsCollection.doc();
            t.set(notifRef, {
                user_id: userTrans.user_id,
                title: "Compte Crédité ! 🎉",
                message: `Votre recharge de ${userTrans.amount_cfa} CFA a été validée. Votre solde est à jour.`,
                type: 'recharge_success',
                read: false,
                created_at: new Date(),
            });

            return "Paiement vérifié et Wallet crédité !";
        });
    }

    static async updateTransactionStatus(transactionId: string, status: string, admin_note: string) {
        const transRef = this.transactionsCollection.doc(transactionId);

        if (status === 'rejected') {
            await transRef.update({
                status: 'rejected',
                admin_note: admin_note || "Refusé par l'administration",
                updated_at: new Date()
            });
            return "Transaction rejetée.";
        }

        if (status === 'completed') {
            return await db.runTransaction(async (t) => {
                const transDoc = await t.get(transRef);
                if (!transDoc.exists) throw new AppError("Transaction inexistante", 404);

                const transData = transDoc.data() as Transaction;
                if (transData.status !== 'pending' && transData.status !== 'rejected') {
                    throw new AppError("Cette transaction a déjà été traitée.", 400);
                }

                // Pour les recharges, on doit vérifier le paiement par SMS
                if (transData.type === 'recharge') {
                    const paymentQuery = await this.paymentsCollection
                        .where('ref_id', '==', transData.ref_id)
                        .where('status', '==', 'unused')
                        .limit(1)
                        .get();

                    if (paymentQuery.empty) {
                        throw new AppError("Preuve de paiement SMS introuvable ou déjà utilisée.", 404);
                    }

                    const paymentDoc = paymentQuery.docs[0];
                    const paymentData = paymentDoc.data() as ReceivedPayment;

                    if (paymentData.amount < transData.amount_cfa) {
                        throw new AppError(`Montant SMS insuffisant (${paymentData.amount} < ${transData.amount_cfa})`, 400);
                    }

                    // Créditer le wallet
                    const walletRef = this.walletsCollection.doc(transData.user_id);
                    const walletDoc = await t.get(walletRef);
                    const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

                    t.set(walletRef, {
                        balance: currentBalance + transData.amount_cfa,
                        updated_at: new Date(),
                    }, { merge: true });

                    // Marquer le paiement SMS comme utilisé
                    t.update(paymentDoc.ref, { status: 'used' });
                }

                // Pour 'achat_coins', on ne fait rien de spécial ici car le wallet a déjà été débité 
                // lors de l'achat côté client. On passe juste à 'completed'.

                t.update(transRef, {
                    status: 'completed',
                    admin_note: admin_note || "Validé par l'administrateur",
                    updated_at: new Date()
                });

                const notifRef = this.notificationsCollection.doc();
                t.set(notifRef, {
                    user_id: transData.user_id,
                    title: "Transaction Validée ! 🎉",
                    message: transData.type === 'recharge'
                        ? `Votre compte a été crédité de ${transData.amount_cfa} CFA.`
                        : `Votre compte est bien rechargé avec les ${transData.amount_coins} coins TikTok. 🎉`,
                    type: transData.type === 'recharge' ? 'recharge_success' : 'order_delivered',
                    read: false,
                    created_at: new Date(),
                });

                return "Transaction validée avec succès !";
            });
        }

        throw new AppError("Action non reconnue.", 400);
    }

    static async requestCode(transactionId: string) {
        const transDoc = await this.transactionsCollection.doc(transactionId).get();
        if (!transDoc.exists) {
            throw new AppError("Transaction non trouvée.", 404);
        }

        const transData = transDoc.data() as Transaction;
        
        // Update transaction to indicate code is required
        await transDoc.ref.update({
            requires_code: true,
            updated_at: new Date()
        });
        
        // Notification pour l'utilisateur
        const notifRef = this.notificationsCollection.doc();
        await notifRef.set({
            user_id: transData.user_id,
            title: "Code Gmail Requis 📧",
            message: `TikTok a envoyé un code de confirmation à votre compte Google (${transData.tiktok_username}). Veuillez le transmettre à l'administrateur rapidement.`,
            type: 'warning',
            link: `/dashboard/orders/${transactionId}/submit-code`,
            read: false,
            created_at: new Date(),
        });

        return "Demande de code envoyée au client.";
    }

    static async createPackage(name: string, coins: number, price_cfa: number) {
        const newPackage = {
            name,
            coins: Number(coins),
            price_cfa: Number(price_cfa),
            active: true,
            created_at: new Date(),
        };
        const docRef = await this.packagesCollection.add(newPackage);
        return docRef.id;
    }

    static async getPackages(activeOnly: boolean = true) {
        let query: any = this.packagesCollection;
        
        if (activeOnly) {
            query = query.where('active', '==', true);
        }

        const snapshot = await query.get();
        return snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    static async updatePackage(id: string, updates: Partial<{ name: string; coins: number; price_cfa: number; active: boolean }>) {
        const docRef = this.packagesCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            throw new AppError("Pack non trouvé.", 404);
        }

        const dataToUpdate: any = { ...updates, updated_at: new Date() };
        if (updates.coins) dataToUpdate.coins = Number(updates.coins);
        if (updates.price_cfa) dataToUpdate.price_cfa = Number(updates.price_cfa);

        await docRef.update(dataToUpdate);
        return { success: true };
    }

    static async getPackageById(id: string) {
        const doc = await this.packagesCollection.doc(id).get();
        if (!doc.exists) {
            throw new AppError("Pack non trouvé.", 404);
        }
        return {
            id: doc.id,
            ...doc.data(),
        };
    }

    static async getAdminStats() {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        // 1. Get Aggregated Global & Monthly Stats
        const analyticsStats = await AnalyticsService.getStats();

        // 2. Get Today's specific 'visual' stats
        // We calculate "Today" manually to ensure real-time accuracy for the dashboard "Today" cards
        let todayVolume = 0;
        let todayCount = 0;

        try {
            // OPTIMIZATION: To avoid complex composite index requirements (status + created_at),
            // we fetch ALL transactions from today and filter in memory.
            // This is efficient because "today's transactions" is a small dataset.
            const todaySalesSnapshot = await this.transactionsCollection
                .where('created_at', '>=', todayStart)
                .get();

            todaySalesSnapshot.forEach(doc => {
                const data = doc.data() as Transaction;
                if (data.status === 'completed') {
                    // Use amount_cfa for volume (consistent with how we track revenue)
                    todayVolume += Number(data.amount_cfa || 0);
                    todayCount++;
                }
            });
        } catch (error) {
            console.error("⚠️ Error fetching today's stats:", error);
            // Fallback to 0 handled by initialization
        }
        
        const pendingSnapshot = await this.transactionsCollection.where('status', '==', 'pending').count().get();
        // Users count can also come from Analytics, but live count is cheap enough
        const usersSnapshot = await this.usersCollection.count().get();

        return {
            // Dashboard / Stats globales
            todayCount: todayCount,
            todayVolume: todayVolume,
            totalRevenue: analyticsStats.totalSalesVolume, // From Aggregated
            creditedCount: analyticsStats.totalTransactions, // From Aggregated
            pendingCount: pendingSnapshot.data().count,
            totalUsers: usersSnapshot.data().count,
            
            // Calculate success rate broadly (Completed / (Completed + Pending))
            successRate: analyticsStats.totalTransactions > 0 
                ? Math.round((analyticsStats.totalTransactions / (analyticsStats.totalTransactions + pendingSnapshot.data().count)) * 100) 
                : 0,
            
            trendCount: 0, // Not calculated yet
            trendSuccess: 0, // Not calculated yet

            // New Data for Analytics Page
            financials: {
                totalDeposits: analyticsStats.totalDeposits,
                totalSalesVolume: analyticsStats.totalSalesVolume,
                totalCost: analyticsStats.totalCost,
                totalProfit: analyticsStats.totalProfit,
                totalUsersBalance: analyticsStats.totalUsersBalance,
                totalCoinsSold: analyticsStats.totalCoinsSold
            },
            monthlyStats: analyticsStats.monthlyStats,

            // Legacy keys compatibility for existing frontend
            totalVolume: analyticsStats.totalSalesVolume,
            totalTransactions: analyticsStats.totalTransactions,
            pendingTransactions: pendingSnapshot.data().count
        };
    }

    static async getAllUsers() {
        const usersSnapshot = await this.usersCollection.get();

        const usersList = await Promise.all(usersSnapshot.docs.map(async (doc) => {
            const userData = doc.data();
            const walletDoc = await this.walletsCollection.doc(doc.id).get();

            return {
                id: doc.id,
                ...userData,
                balance: walletDoc.exists ? (walletDoc.data()?.balance || 0) : 0,
            };
        }));

        return usersList;
    }

    static async adjustUserBalance(uid: string, amount: number) {
        const walletRef = this.walletsCollection.doc(uid);

        await db.runTransaction(async (t) => {
            const walletDoc = await t.get(walletRef);
            const currentBalance = walletDoc.exists ? (walletDoc.data()?.balance || 0) : 0;

            t.set(walletRef, {
                balance: currentBalance + Number(amount),
                updated_at: new Date()
            }, { merge: true });
        });
    }

    static async getReceivedPayments() {
        const snapshot = await this.paymentsCollection
            .orderBy('received_at', 'desc')
            .limit(50)
            .get();

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    // --- RECIPIENTS MANAGEMENT ---
    static async createRecipient(data: Omit<Recipient, 'id' | 'created_at'>) {
        const newRecipient = {
            ...data,
            active: data.active ?? true,
            created_at: new Date()
        };
        const docRef = await this.recipientsCollection.add(newRecipient);
        return docRef.id;
    }

    static async getRecipients(activeOnly: boolean = false) {
        let query: any = this.recipientsCollection;
        if (activeOnly) {
            query = query.where('active', '==', true);
        }
        
        const snapshot = await query.get();
        const results = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort in memory to avoid needing a composite index in Firestore
        return results.sort((a: any, b: any) => {
            const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
            const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
            return dateB.getTime() - dateA.getTime();
        });
    }

    static async updateRecipient(id: string, updates: Partial<Recipient>) {
        const docRef = this.recipientsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) throw new AppError("Destinataire non trouvé", 404);

        await docRef.update({
            ...updates,
            updated_at: new Date()
        });
    }

    static async deleteRecipient(id: string) {
        const docRef = this.recipientsCollection.doc(id);
        await docRef.delete();
    }

    // --- GLOBAL SETTINGS (App Config) ---
    static async getGlobalSettings() {
        const doc = await this.settingsCollection.doc('app_config').get();
        if (!doc.exists) {
            // Default settings if none exist
            return {
                support_phone: "",
                updated_at: new Date()
            };
        }
        return doc.data();
    }

    static async updateGlobalSettings(updates: any) {
        const docRef = this.settingsCollection.doc('app_config');
        await docRef.set({
            ...updates,
            updated_at: new Date()
        }, { merge: true });
        return { success: true };
    }

    static async sendUserNotification(userId: string, title: string, message: string) {
        return await notificationService.create({
            user_id: userId,
            title,
            message,
            type: 'system_alert'
        });
    }
}
