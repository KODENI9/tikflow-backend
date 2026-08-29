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
                // Il n'a jamais rien acheté
                // Envoyer la notification push via le service Push existant
                await NotificationPushService.sendToUser(doc.id, {
                    title: "Besoin d'aide ? 🎁",
                    body: "Vous n'avez pas encore rechargé vos pièces TikTok. Profitez de vos pièces rapidement et boostez vos créateurs favoris !",
                    url: "/dashboard"
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
                await NotificationPushService.sendToUser(tx.userId, {
                    title: "Votre commande est en attente ⏳",
                    body: `N'oubliez pas de finaliser votre paiement de ${tx.amount} FCFA pour recevoir vos pièces TikTok !`,
                    url: "/dashboard/orders"
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

        // On cherche tous les utilisateurs qui ont un champ 'last_transaction_at' (s'il existe, sinon on le calcule)
        // Pour être plus performant, on peut récupérer les utilisateurs dont last_transaction_at <= 14 jours
        // S'il n'existe pas, il faudrait parcourir tous les users. 
        // Supposons qu'on ajoute ce champ. Sinon, on peut simplement scanner ceux qui ont des transactions.
        
        // Requête complexe : chercher des transactions COMPLETED qui datent d'il y a plus de 14j.
        // Puis vérifier s'il a acheté depuis.
        // Pour rester simple et performant : on parcourt les utilisateurs qui ont la date last_churn_sent_at vide ou > 30 jours (pour ne pas les spammer s'ils reviennent toujours pas).
        
        const snapshot = await db.collection('users').get(); // En prod avec des milliers d'users, il faudra indexer et paginer

        let count = 0;
        for (const doc of snapshot.docs) {
            const user = doc.data();

            // Anti-spam strict : On ne relance pour inactivité qu'une fois tous les 30 jours maximum.
            if (user.marketing_flags?.last_churn_sent_at) {
                const lastSent = user.marketing_flags.last_churn_sent_at.toDate ? user.marketing_flags.last_churn_sent_at.toDate() : new Date(user.marketing_flags.last_churn_sent_at);
                const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                if (lastSent > thirtyDaysAgo) {
                    continue; // On l'a déjà relancé il y a moins de 30 jours, on le laisse tranquille.
                }
            }

            // On vérifie sa dernière transaction COMPLETED
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
                    // Dernier achat date de plus de 14 jours
                    await NotificationPushService.sendToUser(doc.id, {
                        title: "Vous nous manquez ! 🌟",
                        body: "Vos créateurs préférés vous attendent. Rechargez votre compte TikTok dès maintenant et faites-les briller !",
                        url: "/dashboard"
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
