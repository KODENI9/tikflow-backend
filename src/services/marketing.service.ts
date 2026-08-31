import { db } from '../config/firebase';
import NotificationPushService from './notification.push.service';

export class MarketingService {
    /**
     * Exécute toutes les vérifications marketing
     * Idéalement appelé par un Cron Job toutes les 12h
     */
    public static async runAllCampaigns() {
        console.log('[Marketing] Début des campagnes automatisées...');
        try {
            await this.campaignWelcomeInactive();
            await this.campaignPendingTransactions();
            await this.campaignChurnRisk();
            console.log('[Marketing] Fin des campagnes automatisées.');
        } catch (error) {
            console.error('[Marketing] Erreur lors de l\'exécution des campagnes', error);
        }
    }

    /**
     * SCÉNARIO 1 : Le Nouvel Inscrit Inactif (Pas d'achat après 3 jours)
     */
    private static async campaignWelcomeInactive() {
        console.log('[Marketing] Lancement de la campagne : Welcome Inactive');
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));

        const snapshot = await db.collection('users')
            .where('created_at', '<=', threeDaysAgo)
            .get();

        let count = 0;
        for (const doc of snapshot.docs) {
            const user = doc.data();
            // Si le flag 'welcome_sent' existe déjà, on saute (Anti-spam)
            if (user.marketing_flags?.welcome_sent) continue;

            // On vérifie s'il a déjà fait un achat (on cherche s'il y a des transactions)
            const txSnap = await db.collection('transactions').where('userId', '==', doc.id).limit(1).get();
            if (txSnap.empty) {
                // Enregistrer dans Firestore notifications
                await db.collection('notifications').add({
                    user_id: doc.id,
                    title: "Besoin d'aide ? 🎁",
                    message: "Vous n'avez pas encore rechargé vos pièces TikTok. Profitez de vos pièces rapidement et boostez vos créateurs favoris !",
                    type: 'marketing',
                    link: '/dashboard',
                    read: false,
                    created_at: new Date()
                });

                // Envoyer la notification push via le service Push existant
                await NotificationPushService.sendToUser(doc.id, {
                    title: "Besoin d'aide ? 🎁",
                    body: "Vous n'avez pas encore rechargé vos pièces TikTok. Profitez de vos pièces rapidement et boostez vos créateurs favoris !",
                    url: "/dashboard/notifications"
                });

                // Enregistrer le flag (Anti-spam)
                await db.collection('users').doc(doc.id).set({
                    marketing_flags: { welcome_sent: true, welcome_sent_at: new Date() }
                }, { merge: true });

                count++;
            }
        }
        console.log(`[Marketing] Campagne Welcome Inactive envoyée à ${count} utilisateur(s).`);
    }

    /**
     * SCÉNARIO 2 : Transaction en attente (Panier abandonné depuis 2h)
     */
    private static async campaignPendingTransactions() {
        console.log('[Marketing] Lancement de la campagne : Pending Transactions');
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));

        const snapshot = await db.collection('transactions')
            .where('status', '==', 'PENDING')
            .where('createdAt', '<=', twoHoursAgo.toISOString()) // On suppose que createdAt est un string ISO
            .get();

        let count = 0;
        for (const doc of snapshot.docs) {
            const tx = doc.data();
            
            // Si on a déjà relancé cette transaction, on saute
            if (tx.marketing_flags?.abandoned_sent) continue;

            if (tx.userId) {
                // Enregistrer dans Firestore notifications
                await db.collection('notifications').add({
                    user_id: tx.userId,
                    title: "Votre commande est en attente ⏳",
                    message: `N'oubliez pas de finaliser votre paiement de ${tx.amount} FCFA pour recevoir vos pièces TikTok !`,
                    type: 'warning',
                    link: '/dashboard/history',
                    read: false,
                    created_at: new Date()
                });

                await NotificationPushService.sendToUser(tx.userId, {
                    title: "Votre commande est en attente ⏳",
                    body: `N'oubliez pas de finaliser votre paiement de ${tx.amount} FCFA pour recevoir vos pièces TikTok !`,
                    url: "/dashboard/notifications"
                });

                // Marquer la transaction
                await db.collection('transactions').doc(doc.id).set({
                    marketing_flags: { abandoned_sent: true, abandoned_sent_at: new Date() }
                }, { merge: true });

                count++;
            }
        }
        console.log(`[Marketing] Campagne Pending Transactions envoyée pour ${count} transaction(s).`);
    }

    /**
     * SCÉNARIO 3 : Risque de Churn (Ancien client, pas d'achat depuis 14 jours)
     */
    private static async campaignChurnRisk() {
        console.log('[Marketing] Lancement de la campagne : Churn Risk');
        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

        const snapshot = await db.collection('users').get();

        let count = 0;
        for (const doc of snapshot.docs) {
            const user = doc.data();

            if (user.marketing_flags?.last_churn_sent_at) {
                const lastSent = user.marketing_flags.last_churn_sent_at.toDate ? user.marketing_flags.last_churn_sent_at.toDate() : new Date(user.marketing_flags.last_churn_sent_at);
                const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                if (lastSent > thirtyDaysAgo) {
                    continue;
                }
            }

            const txSnap = await db.collection('transactions')
                .where('userId', '==', doc.id)
                .where('status', '==', 'COMPLETED')
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

            if (!txSnap.empty) {
                const lastTx = txSnap.docs[0].data();
                const lastTxDate = new Date(lastTx.createdAt);
                
                if (lastTxDate <= fourteenDaysAgo) {
                    // Enregistrer dans Firestore notifications
                    await db.collection('notifications').add({
                        user_id: doc.id,
                        title: "Vous nous manquez ! 🌟",
                        message: "Vos créateurs préférés vous attendent. Rechargez votre compte TikTok dès maintenant et faites-les briller !",
                        type: 'marketing',
                        link: '/dashboard',
                        read: false,
                        created_at: new Date()
                    });

                    await NotificationPushService.sendToUser(doc.id, {
                        title: "Vous nous manquez ! 🌟",
                        body: "Vos créateurs préférés vous attendent. Rechargez votre compte TikTok dès maintenant et faites-les briller !",
                        url: "/dashboard/notifications"
                    });

                    // Enregistrer l'envoi
                    await db.collection('users').doc(doc.id).set({
                        marketing_flags: { last_churn_sent_at: new Date() }
                    }, { merge: true });

                    count++;
                }
            }
        }
        console.log(`[Marketing] Campagne Churn Risk envoyée à ${count} utilisateur(s).`);
    }
}
