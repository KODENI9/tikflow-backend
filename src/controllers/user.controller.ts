// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/firebase';

export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const userId = req.auth.userId; // ID fourni par Clerk

        // 1. Récupérer ou créer le Wallet
        const walletRef = db.collection('wallets').doc(userId);
        const walletDoc = await walletRef.get();

        let balance = 0;

        if (!walletDoc.exists) {
            // Premier passage : on initialise le wallet à 0
            await walletRef.set({
                user_id: userId,
                balance: 0,
                currency: 'COINS',
                updated_at: new Date()
            });
        } else {
            balance = walletDoc.data()?.balance || 0;
        }

        // 2. Récupérer les informations utilisateur (optionnel si tu stockes plus d'infos)
        // Note: Clerk gère le profil, mais tu peux doubler les infos ici
        
        res.status(200).json({
            success: true,
            data: {
                clerk_id: userId,
                balance: balance,
                currency: 'COINS'
            }
        });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// src/controllers/user.controller.ts (Ajout)

export const syncUser = async (req: Request, res: Response) => {
    try {
        console.log("Sync User Payload:", req.body);
        const userId = req.auth.userId; // ID unique de Clerk
        // On récupère les infos envoyées par le frontend lors du premier login
        const { email, fullname , phoneNumber} = req.body;

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // Création du profil utilisateur pro
            const newUser = {
                clerk_id: userId,
                fullname: fullname || "Utilisateur TikFlow",
                email: email || "",
                phone_number : phoneNumber || "",
                role: 'client', // Par défaut
                status: 'active',
                last_login: new Date(),
                created_at: new Date(),
                updated_at: new Date()
            };

            await userRef.set(newUser);
            console.log("New user created:", newUser);

            // On en profite pour lui créer son Wallet vide
            await db.collection('wallets').doc(userId).set({
                user_id: userId,
                balance: 0,
                currency: 'COINS',
                updated_at: new Date()
            });

            res.status(201).json({ success: true, message: "Utilisateur et Wallet créés", user: newUser });
        } else {
            // Mise à jour de la date de dernière connexion
            await userRef.update({ 
                last_login: new Date(),
                updated_at: new Date() 
            });
            res.status(200).json({ success: true, message: "Utilisateur synchronisé" });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};


export const getUserHistory = async (req: Request, res: Response) => {
    try {
        console.log("Fetching user history");   
        // On récupère l'ID de l'utilisateur depuis le middleware d'authentification
        const userId = req.auth.userId;

        if (!userId) {
            res.status(401).json({ success: false, message: "Utilisateur non authentifié" });
            return;
        }

        // On récupère toutes les transactions de cet utilisateur
        const snapshot = await db.collection('transactions')
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc') // Plus récent en premier
            .get();

        const history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`Found ${history.length} transactions for user ${userId}`);
        res.status(200).json({
            success: true,
            count: history.length,
            data: history
        });
        console.log("User history sent successfully : ", history);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// On en profite pour ajouter une route pour récupérer le solde actuel du Wallet
export const getWalletBalance = async (req: Request, res: Response) => {
    try {
        const userId = req.auth.userId;
        const walletDoc = await db.collection('wallets').doc(userId).get();

        if (!walletDoc.exists) {
            res.status(200).json({ success: true, balance: 0 });
            return;
        }

        res.status(200).json({ success: true, balance: walletDoc.data()?.balance || 0 });
        
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};


export const getMyNotifications = async (req: Request, res: Response) => {
    try {
        const userId = req.auth.userId;
        const snapshot = await db.collection('notifications')
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc')
            .limit(10)
            .get();

        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, data: notifications });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updatePhoneNumber = async (req: any, res: any) => {
    try {
        const userId = req.auth.userId;
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: "Numéro de téléphone requis" });
        }

        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            phone_number: phoneNumber,
            updated_at: new Date()
        });

        res.status(200).json({ success: true, message: "Numéro de téléphone mis à jour" });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};