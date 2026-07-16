// src/models/Payment.ts

/**
 * Statuts possibles d'un paiement MoneyFusion
 */
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

/**
 * Modèle Firestore pour la collection `payments`
 */
export interface Payment {
    id?: string;

    /** ID interne de notre commande (référence croisée avec transactions) */
    orderId: string;

    /** ID Clerk de l'utilisateur */
    userId: string;

    /** Montant total en FCFA */
    amount: number;

    /** Devise (toujours XOF / FCFA) */
    currency: string;

    /** Numéro de téléphone Mobile Money de l'acheteur */
    phone: string;

    /** Type de paiement: Achat de Coins ou Recharge Wallet */
    type: 'PURCHASE' | 'DEPOSIT';

    /** Nom complet du client (envoyé à MoneyFusion) */
    nomclient: string;

    /** Fournisseur (MoneyFusion) */
    provider: 'moneyfusion';

    /** Statut du paiement */
    status: PaymentStatus;

    /** Token renvoyé par MoneyFusion (pour vérification) */
    moneyFusionToken?: string;

    /** URL de paiement générée par MoneyFusion */
    moneyFusionUrl?: string;

    /** Données brutes du webhook reçu de MoneyFusion */
    callbackData?: Record<string, unknown>;

    createdAt: Date;
    updatedAt: Date;
}
