// src/controllers/notification.controller.ts
import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';

export const getNotifications = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Non autorisé" });
        }

        const notifications = await notificationService.getUserNotifications(userId);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des notifications" });
    }
};

export const getUnreadCount = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Non autorisé" });
        }

        const count = await notificationService.getUnreadCount(userId);
        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération du nombre de notifications non lues" });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (typeof id !== 'string') {
            return res.status(400).json({ message: "ID invalide" });
        }
        await notificationService.markAsRead(id);
        res.status(200).json({ message: "Notification marquée comme lue" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la mise à jour de la notification" });
    }
};

export const markAllAsRead = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Non autorisé" });
        }

        await notificationService.markAllAsRead(userId);
        res.status(200).json({ message: "Toutes les notifications sont marquées comme lues" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la mise à jour des notifications" });
    }
};

export const getAdminNotifications = async (req: Request, res: Response) => {
    try {
        console.log("[NotificationController] Admin notification request received");
        const notifications = await notificationService.getUserNotifications('admin');
        console.log(`[NotificationController] Found ${notifications.length} admin notifications`);
        res.status(200).json(notifications);
    } catch (error: any) {
        console.error("[NotificationController] Error fetching admin notifications:", error);
        res.status(500).json({ 
            message: "Erreur lors de la récupération des notifications admin",
            error: error.message 
        });
    }
};

export const getAdminUnreadCount = async (req: Request, res: Response) => {
    try {
        const count = await notificationService.getUnreadCount('admin');
        res.status(200).json({ count });
    } catch (error: any) {
        console.error("[NotificationController] Error fetching admin unread count:", error);
        res.status(500).json({ 
            message: "Erreur lors de la récupération du nombre de notifications admin non lues",
            error: error.message
        });
    }
};
