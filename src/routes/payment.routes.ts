// src/routes/payment.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validation.middleware';
import { createPaymentSchema, moneyFusionWebhookSchema, payWithWalletSchema } from '../schemas/payment.schema';
import {
    createPayment,
    handleWebhook,
    getPaymentStatus,
    verifyPayment,
    payWithWallet,
} from '../controllers/payment.controller';

const router = Router();

/**
 * POST /api/payments/create
 *
 * Crée une session de paiement MoneyFusion et retourne l'URL de paiement.
 * Authentification Clerk requise.
 * Validation Zod de la requête.
 */
router.post(
    '/create',
    requireAuth,
    validate(createPaymentSchema),
    createPayment
);

/**
 * POST /api/payments/webhook
 *
 * Endpoint webhook appelé par MoneyFusion après un paiement.
 * PAS de requireAuth (MoneyFusion ne fournit pas de JWT Clerk).
 * Validation minimale Zod (présence du token).
 */
router.post(
    '/webhook',
    validate(moneyFusionWebhookSchema),
    handleWebhook
);

/**
 * GET /api/payments/:paymentId/status
 *
 * Vérifie le statut d'un paiement (utilisé sur la return_url).
 * Authentification Clerk requise.
 */
router.get(
    '/:paymentId/status',
    requireAuth,
    getPaymentStatus
);

/**
 * POST /api/payments/:paymentId/verify
 *
 * Vérifie manuellement un paiement auprès de MoneyFusion et le crédite si confirmé.
 * Fallback si le webhook MoneyFusion n'a pas été reçu.
 * Authentification Clerk requise.
 */
router.post(
    '/:paymentId/verify',
    requireAuth,
    verifyPayment
);

/**
 * POST /api/payments/pay-with-wallet
 *
 * Payer avec le solde du portefeuille.
 * Authentification Clerk requise.
 */
router.post(
    '/pay-with-wallet',
    requireAuth,
    validate(payWithWalletSchema),
    payWithWallet
);

export default router;
