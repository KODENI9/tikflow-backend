import { Request, Response } from 'express';
import NotificationPushService from '../services/notification.push.service';

export const subscribeToPush = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const { subscription } = req.body;
    const userAgent = req.headers['user-agent'] || '';

    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await NotificationPushService.saveSubscription(userId, subscription, userAgent);
    
    res.status(200).json({ success: true, message: "Subscription saved successfully" });
  } catch (error) {
    console.error('Subscribe Error:', error);
    res.status(500).json({ error: "Failed to save subscription" });
  }
};

export const unsubscribeFromPush = async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint" });
    }

    await NotificationPushService.removeSubscription(endpoint);
    
    res.status(200).json({ success: true, message: "Subscription removed successfully" });
  } catch (error) {
    console.error('Unsubscribe Error:', error);
    res.status(500).json({ error: "Failed to remove subscription" });
  }
};
