// src/services/user.service.ts
import { db } from '../config/firebase';
import { AppError } from '../utils/AppError';

export class UserService {
    private static usersCollection = db.collection('users');
    private static walletsCollection = db.collection('wallets');
    private static transactionsCollection = db.collection('transactions');
    private static notificationsCollection = db.collection('notifications');

    static async getUserProfile(userId: string, userEmail: string | undefined) {
        const userRef = this.usersCollection.doc(userId);
        const userDoc = await userRef.get();

        let userData;

        if (!userDoc.exists) {
            // New user registration
            userData = {
                clerk_id: userId,
                email: userEmail || "",
                role: 'client',
                status: 'active',
                created_at: new Date(),
                last_login: new Date()
            };
            await userRef.set(userData);
        } else {
            userData = userDoc.data();
            await userRef.update({ last_login: new Date() });
        }

        // Wallet management
        const walletRef = this.walletsCollection.doc(userId);
        const walletDoc = await walletRef.get();
        let balance = 0;

        if (!walletDoc.exists) {
            await walletRef.set({
                user_id: userId,
                balance: 0,
                currency: 'CFA',
                updated_at: new Date()
            });
        } else {
            balance = walletDoc.data()?.balance || 0;
        }

        return {
            ...userData,
            balance: balance,
        };
    }

    static async syncUser(userId: string, email: string | undefined, fullname: string | undefined, phoneNumber: string | undefined) {
        const userRef = this.usersCollection.doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            const newUser = {
                clerk_id: userId,
                fullname: fullname || "Utilisateur TikFlow",
                email: email || "",
                phone_number: phoneNumber || "",
                role: 'client',
                status: 'active',
                last_login: new Date(),
                created_at: new Date(),
                updated_at: new Date()
            };

            await userRef.set(newUser);
            await this.walletsCollection.doc(userId).set({
                user_id: userId,
                balance: 0,
                currency: 'CFA',
                updated_at: new Date()
            });

            return { isNew: true, user: newUser };
        } else {
            await userRef.update({
                last_login: new Date(),
                updated_at: new Date()
            });
            return { isNew: false };
        }
    }

    static async getUserHistory(userId: string) {
        if (!userId) {
            throw new AppError("Utilisateur non authentifié", 401);
        }

        const snapshot = await this.transactionsCollection
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc')
            .get();

        const history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return history;
    }

    static async getTransactionById(userId: string, transactionId: string) {
        if (!userId) {
            throw new AppError("Utilisateur non authentifié", 401);
        }

        const transRef = this.transactionsCollection.doc(transactionId);
        const transDoc = await transRef.get();

        if (!transDoc.exists) {
            throw new AppError("Transaction introuvable", 404);
        }

        const transData = transDoc.data() as any;
        if (transData.user_id !== userId) {
            throw new AppError("Non autorisé", 403);
        }

        return { id: transDoc.id, ...transData };
    }

    static async getWalletBalance(userId: string) {
        const walletDoc = await this.walletsCollection.doc(userId).get();

        if (!walletDoc.exists) {
            return 0;
        }

        return walletDoc.data()?.balance || 0;
    }

    static async getMyNotifications(userId: string) {
        const snapshot = await this.notificationsCollection
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc')
            .limit(10)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    static async updatePhoneNumber(userId: string, phoneNumber: string) {
         if (!phoneNumber) {
            throw new AppError("Numéro de téléphone requis", 400);
        }

        const userRef = this.usersCollection.doc(userId);
        await userRef.update({
            phone_number: phoneNumber,
            updated_at: new Date()
        });
    }

    static async linkTiktokAccount(userId: string, username: string, password: string) {
        if (!username || !password) {
            throw new AppError("Username et Password requis", 400);
        }

        const userRef = this.usersCollection.doc(userId);
        await userRef.update({
            tiktok_username: username,
            tiktok_password: password,
            updated_at: new Date()
        });
    }

    static async submitConfirmationCode(userId: string, transactionId: string, code: string) {
        if (!code) {
            throw new AppError("Code de confirmation requis", 400);
        }

        const transRef = this.transactionsCollection.doc(transactionId);
        const transDoc = await transRef.get();

        if (!transDoc.exists) {
            throw new AppError("Transaction introuvable", 404);
        }

        const transData = transDoc.data() as any;
        if (transData.user_id !== userId) {
            throw new AppError("Non autorisé", 403);
        }

        await transRef.update({
            confirmation_code: code,
            requires_code: false, // Reset the flag once code is provided
            updated_at: new Date()
        });

        // Notify admin that a code has been submitted
        const notifRef = this.notificationsCollection.doc();
        await notifRef.set({
            user_id: 'admin',
            title: "Nouveau Code Reçu 🔑",
            message: `Le client ${transData.tiktok_username} a transmis son code de confirmation pour la transaction ${transactionId}.`,
            type: 'info',
            link: `/admin/orders/${transactionId}`,
            read: false,
            created_at: new Date(),
        });

        return "Code transmis avec succès !";
    }
}
