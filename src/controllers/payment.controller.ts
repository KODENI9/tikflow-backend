// src/controllers/payment.controller.ts
import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service';
import { AppError } from '../utils/AppError';

/**
 * Contrôleur HTTP pour les paiements MoneyFusion.
 * Ne contient aucune logique métier — délègue tout à PaymentService.
 */

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/create
// ────────────────────────────────────────────────────────────────────────────

/**
 * Initie un paiement MoneyFusion.
 *
 * Body attendu (validé par Zod avant) :
 * - amount         : number (FCFA)
 * - phone          : string (numéro Mobile Money)
 * - nomclient      : string (nom du client)
 * - packageId      : string? (ID du pack TikTok coins)
 * - amount_coins   : number? (quantité custom de coins)
 * - tiktok_username: string
 * - tiktok_password: string?
 * - useLinkedAccount: boolean?
 *
 * Réponse :
 * - paymentId  : ID Firestore du paiement
 * - paymentUrl : URL MoneyFusion → frontend redirige dessus
 * - token      : token MoneyFusion
 */
export async function createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // @ts-ignore — req.auth vient du middleware Clerk
        const userId: string = req.auth?.userId;
        if (!userId) {
            next(new AppError('Non authentifié', 401));
            return;
        }

        const {
            amount,
            phone,
            nomclient,
            type,
            packageId,
            amount_coins,
            tiktok_username,
            tiktok_password,
            useLinkedAccount,
        } = req.body;

        const result = await PaymentService.initiatePayment({
            userId,
            amount,
            phone,
            nomclient,
            type,
            packageId,
            amount_coins,
            tiktok_username,
            tiktok_password,
        });

        res.status(201).json({
            success: true,
            data: {
                paymentId: result.paymentId,
                paymentUrl: result.paymentUrl,
                token: result.token,
            },
        });
    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reçoit la notification POST de MoneyFusion après un paiement.
 *
 * MoneyFusion envoie un POST avec au minimum { token: "..." }.
 * On répond toujours 200 OK rapidement pour éviter un timeout MoneyFusion,
 * puis on traite de manière asynchrone.
 */
export async function handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Répondre immédiatement 200 à MoneyFusion
    res.status(200).json({ received: true });

    // Traitement asynchrone (non bloquant)
    try {
        await PaymentService.handleWebhook(req.body);
    } catch (error) {
        // On log l'erreur mais on ne peut plus répondre (headers déjà envoyés)
        console.error('[WEBHOOK_PROCESS_ERROR]', error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/:paymentId/status
// ────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie le statut d'un paiement.
 * Utilisé par le frontend sur la return_url pour afficher le résultat.
 *
 * Param: paymentId (ID Firestore du document `payments`)
 */
export async function getPaymentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // @ts-ignore
        const userId: string = req.auth?.userId;
        if (!userId) {
            next(new AppError('Non authentifié', 401));
            return;
        }

        const paymentId = req.params.paymentId as string;
        if (!paymentId) {
            next(new AppError('paymentId requis', 400));
            return;
        }

        const result = await PaymentService.checkPaymentById(paymentId);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
