// src/middlewares/auth.ts
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../config/firebase';

// On force le type en RequestHandler pour qu'Express ne se plaigne pas
export const requireAuth = ClerkExpressRequireAuth() as unknown as RequestHandler;

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - car req.auth vient de Clerk
    const userId = req.auth?.userId;

    if (!userId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
    }

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.role === 'admin') {
            next(); // C'est un admin, on laisse passer
        } else {
            res.status(403).json({ message: "Accès refusé : Réservé aux administrateurs" });
        }
    } catch (error) {
        res.status(500).json({ message: "Erreur de vérification admin" });
    }
};