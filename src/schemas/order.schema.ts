import { z } from 'zod';

export const buyCoinsSchema = z.object({
    body: z.object({
         packageId: z.string().min(1, { message: "ID du pack requis" }),
         tiktok_username: z.string().min(1, { message: "Username TikTok requis" }),
         tiktok_password: z.string().min(1, { message: "Mot de passe TikTok requis" }),
         useLinkedAccount: z.boolean().optional(),
    }),
});

export const chargeWalletSchema = z.object({
    body: z.object({
        payment_method: z.string().min(1, "Méthode de paiement requise"),
        ref_id: z.string().min(1, "ID de référence requis"),
        amount_cfa: z.number().positive("Le montant doit être positif"),
    }),
});
