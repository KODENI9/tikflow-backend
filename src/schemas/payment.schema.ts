// src/schemas/payment.schema.ts
import { z } from 'zod';

/**
 * Schéma de validation pour la création d'un paiement MoneyFusion.
 * Correspond aux champs requis par MoneyFusion + les métadonnées TikFlowAF.
 */
export const createPaymentSchema = z.object({
    body: z.object({
        /** Montant en FCFA - doit être positif */
        amount: z.number().positive({ message: 'Le montant doit être positif' }),

        /** Numéro de téléphone Mobile Money de l'acheteur */
        phone: z.string()
            .min(8, { message: 'Numéro de téléphone invalide' })
            .max(15, { message: 'Numéro de téléphone invalide' }),

        /** Nom du client */
        nomclient: z.string()
            .min(2, { message: 'Nom du client requis' })
            .max(100),

        /** Type de paiement */
        type: z.enum(['PURCHASE', 'DEPOSIT']).default('PURCHASE'),

        /** ID du pack à acheter (optionnel si amount_coins fourni ou si DEPOSIT) */
        packageId: z.string().optional(),

        /** Montant custom de coins (optionnel si packageId fourni ou si DEPOSIT) */
        amount_coins: z.number().int().min(90).optional(),

        /** Username TikTok pour la livraison (requis pour PURCHASE) */
        tiktok_username: z.string().optional(),

        /** Mot de passe TikTok (requis si useLinkedAccount est false) */
        tiktok_password: z.string().optional(),

        /** Si true, utilise le compte TikTok déjà enregistré */
        useLinkedAccount: z.boolean().optional(),
    })
    .refine(data => {
        if (data.type === 'DEPOSIT') return true;
        return data.packageId || data.amount_coins;
    }, {
        message: 'packageId ou amount_coins requis pour un achat',
        path: ['packageId'],
    })
    .refine(data => {
        if (data.type === 'DEPOSIT') return true;
        return !!(data.tiktok_username && data.tiktok_username.trim() !== '');
    }, {
        message: 'Username TikTok requis pour un achat',
        path: ['tiktok_username'],
    }),
});

/**
 * Schéma pour le webhook MoneyFusion (données POST reçues).
 * Basé sur la documentation officielle MoneyFusion.
 */
export const moneyFusionWebhookSchema = z.object({
    body: z.object({
        /** Token unique du paiement */
        token: z.string().min(1),
    }).passthrough(), // MoneyFusion peut envoyer des champs supplémentaires
});

/**
 * Schéma pour le paiement avec le solde du portefeuille.
 */
export const payWithWalletSchema = z.object({
    body: z.object({
        packageId: z.string().optional(),
        amount_coins: z.number().int().min(90).optional(),
        tiktok_username: z.string().min(1, { message: 'Username TikTok requis' }),
        tiktok_password: z.string().optional(),
    }).refine(data => data.packageId || data.amount_coins, {
        message: 'packageId ou amount_coins requis',
        path: ['packageId'],
    })
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>['body'];
export type MoneyFusionWebhookInput = z.infer<typeof moneyFusionWebhookSchema>['body'];
export type PayWithWalletInput = z.infer<typeof payWithWalletSchema>['body'];
