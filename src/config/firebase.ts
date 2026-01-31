// src/config/firebase.ts
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Pour la sécurité, on récupère les infos du JSON via des variables d'environnement
// ou on importe directement le fichier JSON en local (méthode simple pour le dev)
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
            // databaseURL: "https://ton-projet.firebaseio.com" // Optionnel pour Firestore
        });
        console.log("🔥 Firebase Admin initialisé avec succès");
    } catch (error) {
        console.error("❌ Erreur d'initialisation Firebase:", error);
    }
}

export const db = admin.firestore();
export const auth = admin.auth(); // Utile si tu veux lier avec l'auth Firebase plus tard