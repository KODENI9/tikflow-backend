import { z } from 'zod';

export const buyCoinsSchema = z.object({
    body: z.object({
         packageId: z.string().optional(),
         amount_coins: z.number().int().min(30).max(100000).optional(),
         tiktok_username: z.string().min(1, { message: "Username TikTok requis" }),
         tiktok_password: z.string().optional(),
         useLinkedAccount: z.boolean().optional(),
    }).strict()
    .refine(data => data.packageId || data.amount_coins, {
        message: "Soit packageId soit amount_coins doit être fourni",
        path: ["packageId"]
    })
    .refine(data => {
        // Si on n'utilise pas le compte lié, le mot de passe est obligatoire
        if (!data.useLinkedAccount && (!data.tiktok_password || data.tiktok_password.trim() === "")) {
            return false;
        }
        return true;
    }, {
        message: "Mot de passe TikTok requis",
        path: ["tiktok_password"]
    }),
});

export const chargeWalletSchema = z.object({
    body: z.object({
        payment_method: z.string().min(1, "Méthode de paiement requise"),
        ref_id: z.string().min(1, "ID de référence requis"),
        amount_cfa: z.number().positive("Le montant doit être positif"),
    }),
});
