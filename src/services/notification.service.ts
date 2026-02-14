// src/services/notification.service.ts
import { db } from '../config/firebase';
import { Notification } from '../models/Notification';

class NotificationService {
    private collection = db.collection('notifications');

    /**
     * Create a new notification
     */
    async create(notification: Omit<Notification, 'id' | 'created_at' | 'read'>): Promise<string> {
        console.log(`[NotificationService] Creating notification for user: ${notification.user_id}`);
        const newNotification: Notification = {
            ...notification,
            read: false,
            created_at: new Date()
        };

        const docRef = await this.collection.add(newNotification);
        console.log(`[NotificationService] Notification created with ID: ${docRef.id}`);
        return docRef.id;
    }

    /**
     * Get notifications for a specific user
     */
    async getUserNotifications(userId: string, limit: number = 20): Promise<Notification[]> {
        console.log(`[NotificationService] Fetching notifications for user: ${userId}`);
        try {
            const snapshot = await this.collection
                .where('user_id', '==', userId)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate ? data.created_at.toDate() : data.created_at
                } as Notification;
            });
        } catch (error: any) {
            console.warn(`[NotificationService] Possible missing index for user_id=${userId}. Falling back to simple query...`);
            // Fallback: fetch without orderBy and sort manually
            const fallbackSnapshot = await this.collection
                .where('user_id', '==', userId)
                .limit(limit)
                .get();

            const docs = fallbackSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate ? data.created_at.toDate() : data.created_at
                } as Notification;
            });

            // Sort manually
            return docs.sort((a, b) => {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                return dateB - dateA;
            });
        }
    }

    /**
     * Get unread notification count for a user
     */
    async getUnreadCount(userId: string): Promise<number> {
        const snapshot = await this.collection
            .where('user_id', '==', userId)
            .where('read', '==', false)
            .count()
            .get();

        return snapshot.data().count;
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string): Promise<void> {
        await this.collection.doc(notificationId).update({ read: true });
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string): Promise<void> {
        const snapshot = await this.collection
            .where('user_id', '==', userId)
            .where('read', '==', false)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { read: true });
        });

        await batch.commit();
    }

    /**
     * Create a notification for admins
     */
    async createAdminNotification(title: string, message: string, type: Notification['type'], link?: string): Promise<string> {
        return this.create({
            user_id: 'admin',
            title,
            message,
            type,
            link
        });
    }
}

export const notificationService = new NotificationService();
