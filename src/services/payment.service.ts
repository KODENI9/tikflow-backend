// src/services/payment.service.ts
import { db } from '../config/firebase';
import { Payment, PaymentStatus } from '../models/Payment';
import { AppError } from '../utils/AppError';
import { MoneyFusionService } from './moneyfusion.service';
import { TransactionService } from './transaction.service';
import { notificationService } from './notification.service';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Paramètres pour initier un paiement MoneyFusion */
export interface InitiatePaymentParams {
    userId: string;
    amount: number;
    phone: string;
    nomclient: string;
    /** Type de paiement: Achat de Coins ou Recharge Wallet */
    type?: 'PURCHASE' | 'DEPOSIT';
    /** ID du pack de coins TikTok (optionnel si amount_coins fourni ou si DEPOSIT) */
    packageId?: string;
    /** Quantité custom de coins (optionnel si packageId fourni ou si DEPOSIT) */
    amount_coins?: number;
    /** Username TikTok (optionnel pour DEPOSIT) */
    tiktok_username?: string;
    tiktok_password?: string;
}

/** Résultat d'une initiation de paiement */
export interface InitiatePaymentResult {
    /** ID du document Firestore dans la collection `payments` */
    paymentId: string;
    /** URL de paiement MoneyFusion vers laquelle rediriger le frontend */
    paymentUrl: string;
    /** Token MoneyFusion pour suivi */
    token: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

/**
 * Service métier orchestrant les paiements MoneyFusion dans TikFlowAF.
 *
 * Responsabilités :
 * - Vérifier la validité de la commande (montant, pack, anti-doublon)
 * - Créer un enregistrement PENDING dans Firestore (`payments`)
 * - Appeler MoneyFusionService pour obtenir l'URL de paiement
 * - Traiter les confirmations de paiement via webhook
 * - Déclencher la livraison des coins TikTok après confirmation
 */
export class PaymentService {
    private static paymentsCollection = db.collection('payments');
    private static packagesCollection = db.collection('packages');
    private static walletsCollection = db.collection('wallets');

    // ──────────────────────────────────────────────────────────────────────
    // INITIATION DU PAIEMENT
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Initie un paiement MoneyFusion pour un achat de TikTok Coins.
     *
     * Flux :
     * 1. Résolution du prix/coins selon le packageId ou amount_coins
     * 2. Vérification anti-doublon (paiement PENDING existant)
     * 3. Création du document Firestore (status: PENDING)
     * 4. Appel MoneyFusion → obtention de l'URL de paiement
     * 5. Mise à jour du document avec le token MoneyFusion
     * 6. Retour de l'URL au contrôleur
     *
     * @param params - Paramètres du paiement
     * @returns L'URL MoneyFusion et l'ID du paiement
     */
    static async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
        const { userId, amount, phone, nomclient, type = 'PURCHASE', packageId, amount_coins, tiktok_username, tiktok_password } = params;

        let resolvedAmount: number = amount;
        let resolvedCoins: number = 0;

        // 1. Résolution du montant et des coins (pour PURCHASE)
        if (type === 'PURCHASE') {
            if (packageId) {
                const pkgDoc = await this.packagesCollection.doc(packageId).get();
                if (!pkgDoc.exists) {
                    throw new AppError("Le pack sélectionné n'existe pas.", 404);
                }
                const pkgData = pkgDoc.data()!;
                if (!pkgData.active) {
                    throw new AppError("Ce pack n'est plus disponible.", 410);
                }
                resolvedAmount = pkgData.price_cfa as number;
                resolvedCoins = pkgData.coins as number;
            } else if (amount_coins && amount_coins >= 160) {
                // Achat custom : on valide que le montant déclaré est cohérent
                const COIN_RATE = 11.2; // Taux FCFA par coin
                resolvedCoins = Math.floor(amount_coins);
                resolvedAmount = resolvedCoins * COIN_RATE;

                // Vérification de cohérence (tolérance de 1 FCFA)
                if (Math.abs(amount - resolvedAmount) > 1) {
                    throw new AppError(
                        `Montant incohérent. Attendu: ${resolvedAmount} FCFA pour ${resolvedCoins} coins.`,
                        400
                    );
                }
            } else {
                throw new AppError('packageId ou amount_coins (min: 160) requis pour un achat.', 400);
            }
        } else {
            // DEPOSIT
            if (amount < 100) {
                throw new AppError("Le montant minimum de recharge est de 100 FCFA.", 400);
            }
        }

        // 2. Protection anti-doublon :
        // On vérifie s'il existe un paiement PENDING récent (< 10 min) pour ce userId + montant
        // afin d'éviter les doubles clics, mais PAS les rechargements intentionnels ultérieurs.
        const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
        const duplicateCheck = await this.paymentsCollection
            .where('userId', '==', userId)
            .where('amount', '==', resolvedAmount)
            .where('status', '==', 'PENDING')
            .limit(1)
            .get();

        if (!duplicateCheck.empty) {
            const existing = duplicateCheck.docs[0];
            const existingData = existing.data() as Payment;
            const createdAt: Date = existingData.createdAt instanceof Date
                ? existingData.createdAt
                : (existingData.createdAt as any).toDate?.() ?? new Date(0);

            // Si le paiement a moins de 10 minutes, on le réutilise (anti double-clic)
            if (createdAt >= TEN_MINUTES_AGO && existingData.moneyFusionUrl) {
                return {
                    paymentId: existing.id,
                    paymentUrl: existingData.moneyFusionUrl,
                    token: existingData.moneyFusionToken || '',
                };
            }
            // Sinon (paiement vieux ou sans URL), on continue pour en créer un nouveau
        }

        // 3. Création du document Firestore en PENDING
        const now = new Date();
        const paymentDoc: Omit<Payment, 'id'> = {
            orderId: `ORD_${userId}_${Date.now()}`,
            userId,
            amount: resolvedAmount,
            currency: 'XOF',
            phone,
            nomclient,
            type,
            provider: 'moneyfusion',
            status: 'PENDING',
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await this.paymentsCollection.add(paymentDoc);
        const paymentId = docRef.id;

        // 4. Appel MoneyFusion
        const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        const moneyFusionResponse = await MoneyFusionService.createPaymentSession({
            amount: resolvedAmount,
            phone,
            nomclient,
            userId,
            orderId: paymentId,
            coins: resolvedCoins,
            returnUrl: `${frontendUrl}/dashboard/history?payment_status=return&paymentId=${paymentId}`,
            webhookUrl: `${backendBaseUrl}/api/payments/webhook`,
        });

        // 5. Mise à jour du document avec le token et l'URL MoneyFusion
        await docRef.update({
            moneyFusionToken: moneyFusionResponse.token,
            moneyFusionUrl: moneyFusionResponse.url,
            // On stocke aussi les métadonnées de la commande pour la livraison
            _meta: {
                tiktok_username: tiktok_username || null,
                tiktok_password: tiktok_password || null,
                packageId: packageId || null,
                amount_coins: resolvedCoins,
            },
            updatedAt: new Date(),
        });

        return {
            paymentId,
            paymentUrl: moneyFusionResponse.url,
            token: moneyFusionResponse.token,
        };
    }

    // ──────────────────────────────────────────────────────────────────────
    // TRAITEMENT DU WEBHOOK
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Traite la notification webhook envoyée par MoneyFusion après un paiement.
     *
     * Flux :
     * 1. Extraire le token depuis les données webhook
     * 2. Retrouver le document paiement via le token
     * 3. Vérifier le statut auprès de MoneyFusion (source de vérité)
     * 4. Si confirmé et non déjà traité : marquer PAID + déclencher livraison coins
     *
     * @param webhookBody - Corps de la requête POST de MoneyFusion
     */
    static async handleWebhook(webhookBody: Record<string, unknown>): Promise<void> {
        const token = webhookBody.token as string | undefined;

        if (!token) {
            // MoneyFusion a envoyé un webhook sans token → on ignore
            console.warn('[PAYMENT_WEBHOOK] Token manquant dans le webhook MoneyFusion');
            return;
        }

        // 1. Retrouver le paiement correspondant au token
        const paymentQuery = await this.paymentsCollection
            .where('moneyFusionToken', '==', token)
            .limit(1)
            .get();

        if (paymentQuery.empty) {
            console.warn(`[PAYMENT_WEBHOOK] Aucun paiement trouvé pour le token: ${token}`);
            return;
        }

        const paymentDoc = paymentQuery.docs[0];
        const paymentData = paymentDoc.data() as Payment;

        // 2. Protection contre le double traitement (idempotence)
        if (paymentData.status === 'PAID') {
            console.log(`[PAYMENT_WEBHOOK] Paiement ${paymentDoc.id} déjà traité (PAID). Ignoré.`);
            return;
        }

        if (paymentData.status === 'FAILED' || paymentData.status === 'CANCELLED') {
            console.log(`[PAYMENT_WEBHOOK] Paiement ${paymentDoc.id} en statut terminal (${paymentData.status}). Ignoré.`);
            return;
        }

        // 3. Vérification auprès de MoneyFusion (source de vérité)
        let statusResponse;
        try {
            statusResponse = await MoneyFusionService.checkPaymentStatus(token);
        } catch (err) {
            console.error(`[PAYMENT_WEBHOOK] Erreur vérification MoneyFusion pour token ${token}:`, err);
            // On sauvegarde les données webhook pour inspection manuelle
            await paymentDoc.ref.update({
                callbackData: webhookBody,
                updatedAt: new Date(),
            });
            return;
        }

        // 4. Mise à jour du statut selon la réponse MoneyFusion
        if (MoneyFusionService.isPaymentConfirmed(statusResponse)) {
            await this.confirmPaymentAndDeliver(paymentDoc.id, paymentData, webhookBody);
        } else {
            // Paiement non confirmé → on marque FAILED
            await paymentDoc.ref.update({
                status: 'FAILED' as PaymentStatus,
                callbackData: webhookBody,
                updatedAt: new Date(),
            });
            console.log(`[PAYMENT_WEBHOOK] Paiement ${paymentDoc.id} marqué FAILED.`);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // VÉRIFICATION MANUELLE (fallback si webhook non reçu)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Vérifie un paiement auprès de MoneyFusion et le crédite si confirmé.
     * Appelé depuis le frontend quand l'utilisateur revient sur le site après paiement.
     * Sert de fallback si le webhook MoneyFusion n'a pas été reçu.
     *
     * @param paymentId - ID Firestore du paiement
     * @param userId - ID Clerk de l'utilisateur (sécurité)
     */
    static async verifyAndProcessPayment(
        paymentId: string,
        userId: string
    ): Promise<{ status: string; credited: boolean }> {
        const paymentDoc = await this.paymentsCollection.doc(paymentId).get();
        if (!paymentDoc.exists) throw new AppError('Paiement introuvable', 404);

        const paymentData = paymentDoc.data() as Payment;

        // Sécurité : l'utilisateur doit être propriétaire du paiement
        if (paymentData.userId !== userId) throw new AppError('Non autorisé', 403);

        // Déjà traité
        if (paymentData.status === 'PAID') {
            return { status: 'PAID', credited: false };
        }
        if (paymentData.status === 'FAILED' || paymentData.status === 'CANCELLED') {
            return { status: paymentData.status, credited: false };
        }

        const token = paymentData.moneyFusionToken;
        if (!token) throw new AppError('Token de paiement manquant', 400);

        console.log(`[VERIFY] Vérification manuelle du paiement ${paymentId} (token: ${token})`);

        const statusResponse = await MoneyFusionService.checkPaymentStatus(token);
        console.log(`[VERIFY] Réponse MoneyFusion brute:`, JSON.stringify(statusResponse));
        console.log(`[VERIFY] statut champ:`, statusResponse.statut, typeof statusResponse.statut);
        console.log(`[VERIFY] isConfirmed:`, MoneyFusionService.isPaymentConfirmed(statusResponse));

        if (MoneyFusionService.isPaymentConfirmed(statusResponse)) {
            console.log(`[VERIFY] Lancement de confirmPaymentAndDeliver pour ${paymentId}`);
            await this.confirmPaymentAndDeliver(paymentId, paymentData, { source: 'manual_verify' });
            console.log(`[VERIFY] Paiement ${paymentId} confirmé et crédité manuellement.`);
            return { status: 'PAID', credited: true };
        }

        return { status: 'PENDING', credited: false };
    }

    // ──────────────────────────────────────────────────────────────────────
    // CONFIRMATION ET LIVRAISON
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Confirme un paiement et déclenche la livraison des TikTok Coins.
     * Utilise une transaction Firestore pour garantir l'atomicité.
     *
     * @param paymentId - ID du document dans la collection `payments`
     * @param paymentData - Données du paiement
     * @param callbackData - Données brutes du webhook
     */
    private static async confirmPaymentAndDeliver(
        paymentId: string,
        paymentData: Payment,
        callbackData: Record<string, unknown>
    ): Promise<void> {
        const paymentRef = this.paymentsCollection.doc(paymentId);

        // Récupération des métadonnées de commande
        const meta = (paymentData as any)._meta as {
            tiktok_username?: string | null;
            tiktok_password?: string | null;
            packageId?: string | null;
            amount_coins: number;
        } | undefined;

        try {
            // Marquer le paiement comme PAID (atomique)
            await paymentRef.update({
                status: 'PAID' as PaymentStatus,
                callbackData,
                updatedAt: new Date(),
            });

            if (paymentData.type === 'PURCHASE') {
                if (!meta?.tiktok_username) throw new Error("Username TikTok manquant pour l'achat.");

                // Déclencher la livraison via TransactionService
                await TransactionService.buyWithWallet(
                    paymentData.userId,
                    meta.packageId || undefined,
                    meta.tiktok_username,
                    meta.tiktok_password || undefined,
                    meta.packageId ? undefined : meta.amount_coins,
                );

                console.log(`[PAYMENT_CONFIRM] Paiement ${paymentId} confirmé. Commande de coins déclenchée.`);

                // Notification user : achat
                await notificationService.create({
                    user_id: paymentData.userId,
                    title: '🎉 Paiement d\'achat confirmé merci pour la confiance !',
                    message: `Votre achat de ${paymentData.amount} FCFA a été validé. Votre commande de TikTok Coins est en cours de traitement.`,
                    type: 'payment_received',
                });
            } else {
                // Type DEPOSIT
                console.log(`[DEPOSIT] Début créditation wallet pour user: ${paymentData.userId}, montant: ${paymentData.amount}`);
                await db.runTransaction(async (t) => {
                    const walletRef = this.walletsCollection.doc(paymentData.userId);
                    const walletDoc = await t.get(walletRef);
                    const currentBalance = walletDoc.exists ? (walletDoc.data()?.balance ?? 0) : 0;
                    const newBalance = currentBalance + paymentData.amount;

                    console.log(`[DEPOSIT] Wallet exist: ${walletDoc.exists}, balance actuel: ${currentBalance}, nouveau: ${newBalance}`);

                    t.set(walletRef, {
                        balance: newBalance,
                        updated_at: new Date()
                    }, { merge: true });

                    const newTransRef = db.collection('transactions').doc();
                    t.set(newTransRef, {
                        user_id: paymentData.userId,
                        type: 'recharge',
                        amount_cfa: paymentData.amount,
                        amount_coins: 0,
                        payment_method: 'moneyfusion',
                        ref_id: paymentData.moneyFusionToken || paymentId,
                        status: 'completed',
                        created_at: new Date()
                    });
                });

                console.log(`[PAYMENT_CONFIRM] Paiement ${paymentId} confirmé. Wallet rechargé.`);

                // Notification user : recharge
                await notificationService.create({
                    user_id: paymentData.userId,
                    title: '💰 Recharge validée !',
                    message: `Votre recharge de ${paymentData.amount} FCFA via MoneyFusion a été créditée sur votre portefeuille.`,
                    type: 'payment_received',
                });
            }

        } catch (deliveryError) {
            console.error(`[PAYMENT_CONFIRM] Erreur lors de la livraison pour le paiement ${paymentId}:`, deliveryError);
            // Le paiement est PAID mais la livraison a échoué → l'admin peut intervenir
            await paymentRef.update({
                status: 'PAID' as PaymentStatus,
                delivery_error: (deliveryError as Error).message,
                updatedAt: new Date(),
            });

            // Notification admin pour intervention manuelle
            await notificationService.createAdminNotification(
                '⚠️ Livraison à vérifier',
                `Le paiement MoneyFusion ${paymentId} (${paymentData.amount} FCFA) est PAID mais la livraison des coins a échoué pour l'utilisateur ${paymentData.userId}. Vérification manuelle requise.`,
                'warning',
                `/admin/payments`
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // VÉRIFICATION MANUELLE (route frontend /return)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Vérifie manuellement l'état d'un paiement via son token MoneyFusion.
     * Utilisé quand l'utilisateur revient sur le return_url.
     *
     * @param paymentId - ID du document payment dans Firestore
     * @returns Le statut actuel du paiement
     */
    static async checkPaymentById(paymentId: string): Promise<{ status: PaymentStatus; paymentUrl?: string }> {
        const paymentDoc = await this.paymentsCollection.doc(paymentId).get();

        if (!paymentDoc.exists) {
            throw new AppError('Paiement introuvable', 404);
        }

        const paymentData = paymentDoc.data() as Payment;

        // Si déjà dans un état terminal, on retourne directement
        if (paymentData.status === 'PAID' || paymentData.status === 'FAILED') {
            return { status: paymentData.status };
        }

        // Sinon, on interroge MoneyFusion pour le statut en temps réel
        if (paymentData.moneyFusionToken) {
            const statusResponse = await MoneyFusionService.checkPaymentStatus(paymentData.moneyFusionToken);

            if (MoneyFusionService.isPaymentConfirmed(statusResponse)) {
                // Déclencher le même flow que le webhook
                await this.confirmPaymentAndDeliver(paymentDoc.id, paymentData, statusResponse as Record<string, unknown>);
                return { status: 'PAID' };
            }
        }

        return {
            status: paymentData.status,
            paymentUrl: paymentData.moneyFusionUrl,
        };
    }
}
