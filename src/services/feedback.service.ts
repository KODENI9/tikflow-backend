// src/services/feedback.service.ts
import { db } from '../config/firebase';
import { AppError } from '../utils/AppError';

export class FeedbackService {
    private static feedbackCollection = db.collection('feedbacks');
    private static usersCollection = db.collection('users');

    static async createFeedback(userId: string, data: { rating: number; comment?: string; context: string }) {
        const { rating, comment, context } = data;

        // Validation
        if (!rating || rating < 1 || rating > 5) {
            throw new AppError("La note doit être comprise entre 1 et 5.", 400);
        }

        if (comment && comment.length > 1000) {
            throw new AppError("Le commentaire ne doit pas dépasser 1000 caractères.", 400);
        }

        const userRef = this.usersCollection.doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            throw new AppError("Utilisateur introuvable.", 404);
        }

        const userData = userDoc.data();
        const lastFeedbackAt = userData?.last_feedback_at?.toDate();

        if (lastFeedbackAt) {
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            const now = new Date().getTime();
            if (now - lastFeedbackAt.getTime() < thirtyDaysInMs) {
                throw new AppError("Vous avez déjà donné un avis récemment. Merci de réessayer dans 30 jours.", 429);
            }
        }

        // Determine NPS score
        let nps_score = "neutral";
        if (rating >= 4) nps_score = "promoter";
        else if (rating <= 2) nps_score = "detractor";

        const feedbackData = {
            user_id: userId,
            rating,
            comment: comment || "",
            context,
            nps_score,
            created_at: new Date(),
            updated_at: new Date()
        };

        const feedbackRef = this.feedbackCollection.doc();
        await feedbackRef.set(feedbackData);

        // Update user's last feedback timestamp
        await userRef.update({
            last_feedback_at: new Date()
        });

        return { id: feedbackRef.id, ...feedbackData };
    }

    static async getMyFeedbacks(userId: string) {
        const snapshot = await this.feedbackCollection
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    static async getAllFeedbacks() {
        const snapshot = await this.feedbackCollection.orderBy('created_at', 'desc').get();
        const feedbacks = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const userDoc = await this.usersCollection.doc(data.user_id).get();
            const userData = userDoc.data();

            feedbacks.push({
                id: doc.id,
                ...data,
                user: {
                    fullname: userData?.fullname || "Inconnu",
                    phone_number: userData?.phone_number || "N/A",
                    email: userData?.email || "N/A"
                }
            });
        }

        return feedbacks;
    }
}
