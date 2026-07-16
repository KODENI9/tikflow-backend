// src/services/moneyfusion.service.ts
import { AppError } from '../utils/AppError';

/** URL de l'API MoneyFusion (variable d'env) */
const MONEYFUSION_API_URL = process.env.MONEYFUSION_API_URL || '';

/** URL de base MoneyFusion pour la vérification de statut */
const MONEYFUSION_CHECK_URL = 'https://www.pay.moneyfusion.net/paiementNotif';

// ────────────────────────────────────────────────────────────────────────────
// Types internes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Données envoyées à MoneyFusion pour créer une session de paiement.
 * Correspondent exactement aux champs documentés sur docs.moneyfusion.net/fr/webapi
 */
interface MoneyFusionPaymentRequest {
    /** Montant total à payer */
    totalPrice: number;
    /** Liste des articles (format libre, représente l'achat TikTok Coins) */
    article: Array<Record<string, number>>;
    /** Numéro de téléphone Mobile Money du client */
    numeroSend: string;
    /** Nom complet du client */
    nomclient: string;
    /** Informations personnelles (userId, orderId) — optionnel mais utile pour le suivi */
    personal_Info?: Array<Record<string, string | number>>;
    /** URL de retour après paiement (optionnel selon la doc) */
    return_url?: string;
    /** URL webhook POST (optionnel selon la doc) */
    webhook_url?: string;
}

/**
 * Réponse de l'API MoneyFusion lors de la création d'une session de paiement.
 */
export interface MoneyFusionCreateResponse {
    statut: boolean;
    token: string;
    message: string;
    url: string;
}

/**
 * Réponse de l'API MoneyFusion lors de la vérification du statut d'un paiement.
 */
export interface MoneyFusionStatusResponse {
    statut: boolean;
    message?: string;
    // MoneyFusion peut inclure d'autres champs ; on les accepte
    [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

/**
 * Service responsable de toute la logique d'intégration MoneyFusion.
 *
 * Ce service :
 * - construit et envoie la demande de paiement à MoneyFusion
 * - vérifie l'état d'un paiement via le token
 *
 * Toute la logique MoneyFusion est centralisée ici.
 * Les contrôleurs et autres services ne doivent jamais appeler MoneyFusion directement.
 */
export class MoneyFusionService {

    /**
     * Crée une session de paiement MoneyFusion et retourne l'URL de paiement.
     *
     * @param params - Paramètres du paiement
     * @param params.amount - Montant en FCFA
     * @param params.phone - Numéro de téléphone Mobile Money
     * @param params.nomclient - Nom du client
     * @param params.userId - ID interne de l'utilisateur (pour personal_Info)
     * @param params.orderId - ID de la commande interne (pour personal_Info)
     * @param params.coins - Nombre de coins TikTok commandés
     * @param params.returnUrl - URL de retour après paiement
     * @param params.webhookUrl - URL du webhook backend à appeler par MoneyFusion
     * @returns La réponse complète de MoneyFusion (token + url)
     * @throws AppError si la configuration est manquante ou la requête échoue
     */
    static async createPaymentSession(params: {
        amount: number;
        phone: string;
        nomclient: string;
        userId: string;
        orderId: string;
        coins: number;
        returnUrl?: string;
        webhookUrl?: string;
    }): Promise<MoneyFusionCreateResponse> {
        if (!MONEYFUSION_API_URL) {
            throw new AppError(
                'MONEYFUSION_API_URL non configuré. Ajoutez la variable dans votre .env',
                500
            );
        }

        const payload: MoneyFusionPaymentRequest = {
            totalPrice: params.amount,
            article: [
                { [`${params.coins} TikTok Coins`]: params.amount },
            ],
            numeroSend: params.phone,
            nomclient: params.nomclient,
            personal_Info: [
                {
                    userId: params.userId,
                    orderId: params.orderId,
                },
            ],
            ...(params.returnUrl && { return_url: params.returnUrl }),
            ...(params.webhookUrl && { webhook_url: params.webhookUrl }),
        };

        let response: Response;
        try {
            response = await fetch(MONEYFUSION_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (networkError) {
            throw new AppError(
                `Impossible de contacter MoneyFusion: ${(networkError as Error).message}`,
                503
            );
        }

        let data: MoneyFusionCreateResponse;
        try {
            data = await response.json();
        } catch {
            throw new AppError('Réponse invalide de MoneyFusion (non-JSON)', 502);
        }

        if (!response.ok || !data.statut) {
            throw new AppError(
                `MoneyFusion a refusé la demande: ${data.message || response.statusText}`,
                response.status === 400 ? 400 : 502
            );
        }

        if (!data.token || !data.url) {
            throw new AppError(
                'Réponse MoneyFusion incomplète: token ou url manquant',
                502
            );
        }

        return data;
    }

    /**
     * Vérifie l'état d'un paiement via le token MoneyFusion.
     *
     * Endpoint documenté : GET https://www.pay.moneyfusion.net/paiementNotif/{token}
     *
     * @param token - Le token retourné lors de la création de la session
     * @returns La réponse de vérification MoneyFusion
     * @throws AppError si la requête échoue
     */
    static async checkPaymentStatus(token: string): Promise<MoneyFusionStatusResponse> {
        if (!token) {
            throw new AppError('Token de paiement requis', 400);
        }

        let response: Response;
        try {
            response = await fetch(`${MONEYFUSION_CHECK_URL}/${token}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (networkError) {
            throw new AppError(
                `Impossible de vérifier le paiement MoneyFusion: ${(networkError as Error).message}`,
                503
            );
        }

        let data: MoneyFusionStatusResponse;
        try {
            data = await response.json();
        } catch {
            throw new AppError('Réponse de vérification invalide (non-JSON)', 502);
        }

        if (!response.ok) {
            throw new AppError(
                `Erreur vérification MoneyFusion: ${data.message || response.statusText}`,
                502
            );
        }

        return data;
    }

    /**
     * Détermine si un paiement est confirmé à partir de la réponse de vérification.
     *
     * @param statusResponse - La réponse de checkPaymentStatus
     * @returns true si le paiement est confirmé (statut: true selon MoneyFusion)
     */
    static isPaymentConfirmed(statusResponse: MoneyFusionStatusResponse): boolean {
        return statusResponse.statut === true;
    }
}
