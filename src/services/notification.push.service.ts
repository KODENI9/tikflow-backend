import webpush from 'web-push';
import { db } from '../config/firebase';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    'mailto:contact@tikflowaf.online', // Contact email for push service providers
    publicVapidKey,
    privateVapidKey
  );
} else {
  console.warn("VAPID keys not set. Push notifications will not work.");
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

class NotificationPushService {
  /**
   * Save a user's push subscription to Firestore.
   */
  async saveSubscription(userId: string, subscription: PushSubscriptionPayload, userAgent: string = "", isAdmin: boolean = false) {
    try {
      const subscriptionsRef = db.collection('push_subscriptions');
      
      // We can use the endpoint as the document ID or store a composite ID
      // To allow multiple devices per user, we store them as separate documents
      
      // Check if this endpoint already exists to avoid duplicates
      const existing = await subscriptionsRef.where('endpoint', '==', subscription.endpoint).get();
      
      if (!existing.empty) {
        const docId = existing.docs[0].id;
        await subscriptionsRef.doc(docId).update({
          userId,
          userAgent,
          isAdmin,
          updatedAt: new Date()
        });
        return;
      }

      await subscriptionsRef.add({
        userId,
        subscription,
        userAgent,
        isAdmin,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`Saved push subscription for user: ${userId}`);
    } catch (error) {
      console.error("Error saving push subscription:", error);
      throw error;
    }
  }

  /**
   * Remove a push subscription (e.g. on logout or invalid push)
   */
  async removeSubscription(endpoint: string) {
    try {
      const subscriptionsRef = db.collection('push_subscriptions');
      const snapshot = await subscriptionsRef.where('endpoint', '==', endpoint).get();
      
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log("Removed invalid/expired push subscription");
      }
    } catch (error) {
      console.error("Error removing push subscription:", error);
    }
  }

  /**
   * Send a notification to a specific user (all their devices).
   */
  async sendToUser(userId: string, payload: PushNotificationPayload) {
    try {
      const subscriptionsRef = db.collection('push_subscriptions');
      const snapshot = await subscriptionsRef.where('userId', '==', userId).get();

      if (snapshot.empty) {
        console.log(`No active push subscriptions found for user: ${userId}`);
        return;
      }

      const stringifiedPayload = JSON.stringify(payload);
      
      const sendPromises = snapshot.docs.map(async (doc) => {
        const subData = doc.data();
        try {
          await webpush.sendNotification(subData.subscription, stringifiedPayload);
        } catch (error: any) {
          // 410 Gone means the subscription is no longer valid
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`Subscription invalid, removing doc: ${doc.id}`);
            await doc.ref.delete();
          } else {
            console.error("Error sending push notification to endpoint:", error);
          }
        }
      });

      await Promise.all(sendPromises);
    } catch (error) {
      console.error(`Error in sendToUser for user ${userId}:`, error);
    }
  }

  /**
   * Broadcast a notification to all subscribed users.
   * Useful for admin announcements.
   */
  async broadcast(payload: PushNotificationPayload) {
    try {
      const subscriptionsRef = db.collection('push_subscriptions');
      const snapshot = await subscriptionsRef.get();
      
      if (snapshot.empty) return 0;

      const stringifiedPayload = JSON.stringify(payload);
      let successCount = 0;

      const sendPromises = snapshot.docs.map(async (doc) => {
        const subData = doc.data();
        try {
          await webpush.sendNotification(subData.subscription, stringifiedPayload);
          successCount++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await doc.ref.delete();
          }
        }
      });

      await Promise.all(sendPromises);
      return successCount;
    } catch (error) {
      console.error("Error broadcasting push notifications:", error);
      return 0;
    }
  }

  /**
   * Broadcast a notification to all subscribed admins.
   */
  async broadcastAdmins(payload: PushNotificationPayload) {
    try {
      const subscriptionsRef = db.collection('push_subscriptions');
      const snapshot = await subscriptionsRef.where('isAdmin', '==', true).get();
      
      if (snapshot.empty) return 0;

      const stringifiedPayload = JSON.stringify(payload);
      let successCount = 0;

      const sendPromises = snapshot.docs.map(async (doc) => {
        const subData = doc.data();
        try {
          await webpush.sendNotification(subData.subscription, stringifiedPayload);
          successCount++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await doc.ref.delete();
          }
        }
      });

      await Promise.all(sendPromises);
      return successCount;
    } catch (error) {
      console.error("Error broadcasting to admins:", error);
      return 0;
    }
  }
}

export default new NotificationPushService();
