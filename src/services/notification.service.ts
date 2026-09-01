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

        // Pour TOUTE notification destinée à l'admin → Telegram bot + appel MTProto
        if (notification.user_id === 'admin') {
            this.sendTelegramNotification(notification.title, notification.message, notification.link).catch(err => {
                console.error('[NotificationService] Telegram bot error:', err);
            });

            const { telegramCallService } = require('./telegram-call.service');
            telegramCallService.makeAdminCall().catch((err: any) => {
                console.error('[NotificationService] Telegram call error:', err);
            });
            
            // Web Push pour tous les admins
            const NotificationPushService = require('./notification.push.service').default;
            NotificationPushService.broadcastAdmins({
                title: notification.title,
                body: notification.message,
                url: notification.link || '/admin/dashboard'
            }).catch((err: any) => console.error('[NotificationService] Admin push error:', err));
        } else {
            // Web Push pour le client
            const NotificationPushService = require('./notification.push.service').default;
            NotificationPushService.sendToUser(notification.user_id, {
                title: notification.title,
                body: notification.message,
                url: notification.link || '/dashboard/history'
            }).catch((err: any) => console.error('[NotificationService] User push error:', err));
        }

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
            // Fallback: fetch without orderBy and limit, then sort manually and slice
            const fallbackSnapshot = await this.collection
                .where('user_id', '==', userId)
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
            }).slice(0, limit);
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
     * Send a notification to Telegram admin chat
     */
    private async sendTelegramNotification(title: string, message: string, link?: string): Promise<void> {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

        if (!botToken || !chatId) {
            console.warn('[NotificationService] Telegram bot token or chat ID is missing. Skipping Telegram notification.');
            return;
        }

        const targetChatIds = [chatId];
        if (process.env.TELEGRAM_ADMIN_GROUP_CHAT_ID) {
            targetChatIds.push(process.env.TELEGRAM_ADMIN_GROUP_CHAT_ID);
        }

        const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        
        const escapeHtml = (unsafe: string) => {
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };

        let text = `🚨 <b>Nouvelle Notification Admin</b>\n<b>Titre:</b> ${escapeHtml(title)}\n<b>Message:</b> ${escapeHtml(message)}`;
        if (link) {
            // Check if link is an absolute URL, if not, try to construct one (optional)
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const fullLink = link.startsWith('http') ? link : `${baseUrl}${link.startsWith('/') ? '' : '/'}${link}`;
            text += `\n<a href="${fullLink}">Voir plus</a>`;
        }

        for (const targetId of targetChatIds) {
            try {
                const response = await fetch(telegramApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        chat_id: targetId,
                        text: text,
                        parse_mode: 'HTML',
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error(`[NotificationService] Failed to send Telegram notification to ${targetId}:`, errorData);
                } else {
                    console.log(`[NotificationService] Telegram notification sent successfully to ${targetId}.`);
                }
            } catch (error) {
                console.error(`[NotificationService] Error sending Telegram notification to ${targetId}:`, error);
            }
        }
    }

    /**
     * Create a notification for admins
     */
    async createAdminNotification(title: string, message: string, type: Notification['type'], link?: string): Promise<string> {
        const notificationId = await this.create({
            user_id: 'admin',
            title,
            message,
            type,
            link
        });

        // The telegram text and call notifications are now automatically handled in `this.create` method.

        return notificationId;
    }
}

export const notificationService = new NotificationService();
