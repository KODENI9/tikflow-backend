// src/config/firebase.ts
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
        console.error("❌ Erreur de parsing de FIREBASE_SERVICE_ACCOUNT:", error);
    }
} else {
    try {
        serviceAccount = require('../../serviceAccountKey.json');
    } catch (error) {
        console.warn("⚠️ serviceAccountKey.json non trouvé (normal en production)");
    }
}

if (!admin.apps.length) {
    try {
        if (!serviceAccount) {
            throw new Error("Aucune configuration Firebase trouvée (variable d'env ou JSON)");
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        });
        console.log("🔥 Firebase Admin initialisé avec succès");
    } catch (error) {
        console.error("❌ Erreur d'initialisation Firebase:", error);
    }
}

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

export const db = firestore;
export const auth = admin.auth(); // Utile si tu veux lier avec l'auth Firebase plus tard
export { admin };