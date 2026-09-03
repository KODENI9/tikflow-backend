// src/controllers/tracking.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/firebase';

const trackingCollection = db.collection('pwa_tracking');

/**
 * Admin endpoint — remotely triggers the install prompt on the user's screen.
 * Sets a Firestore flag that the user's browser listens to in real-time.
 */
export const triggerInstallPrompt = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: 'userId manquant' });
        }

        const docRef = trackingCollection.doc(userId as string);
        await docRef.set(
            { install_prompt_trigger: true, install_prompt_triggered_at: new Date() },
            { merge: true }
        );

        res.status(200).json({ success: true, message: 'Déclencheur envoyé' });
    } catch (error: any) {
        console.error('[TrackingController] triggerInstallPrompt error:', error);
        res.status(500).json({ message: 'Erreur lors du déclenchement' });
    }
};

/**
 * User endpoint — called by the browser after the install prompt is shown,
 * to acknowledge and clear the trigger flag.
 */
export const clearInstallTrigger = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.auth?.userId;
        if (!userId) return res.status(401).json({ message: 'Non autorisé' });

        await trackingCollection.doc(userId).set(
            { install_prompt_trigger: false },
            { merge: true }
        );

        res.status(200).json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: 'Erreur' });
    }
};

/**
 * Called by the frontend when the user installs the PWA (appinstalled event)
 * or when the app is opened in standalone mode.
 * Stores/updates a tracking document per userId.
 */
export const trackPwaInstall = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Non autorisé' });
        }

        const { platform, userAgent, event_type } = req.body;
        // event_type: 'installed' | 'standalone_open'

        const docRef = trackingCollection.doc(userId);
        const existing = await docRef.get();

        const now = new Date();

        if (!existing.exists) {
            await docRef.set({
                user_id: userId,
                pwa_installed: true,
                first_install_at: now,
                last_open_at: now,
                platform: platform || 'unknown',
                user_agent: userAgent || '',
                install_count: 1,
                event_type: event_type || 'installed',
            });
        } else {
            const updateData: Record<string, any> = {
                last_open_at: now,
                pwa_installed: true,
            };

            if (event_type === 'installed') {
                updateData.first_install_at = existing.data()?.first_install_at || now;
                updateData.platform = platform || existing.data()?.platform;
                updateData.user_agent = userAgent || existing.data()?.user_agent;
                updateData.install_count = (existing.data()?.install_count || 0) + 1;
            }

            await docRef.update(updateData);
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[TrackingController] Error tracking PWA install:', error);
        res.status(500).json({ message: 'Erreur lors du tracking' });
    }
};

/**
 * Admin endpoint — returns all PWA tracking records merged with user data
 */
export const getPwaTrackingStats = async (req: Request, res: Response) => {
    try {
        // Get all users
        const usersSnap = await db.collection('users').get();
        const usersMap: Record<string, any> = {};
        usersSnap.docs.forEach(doc => {
            usersMap[doc.id] = { id: doc.id, ...doc.data() };
        });

        // Get all tracking records
        const trackingSnap = await trackingCollection.get();
        const trackingMap: Record<string, any> = {};
        trackingSnap.docs.forEach(doc => {
            const data = doc.data();
            trackingMap[doc.id] = {
                ...data,
                first_install_at: data.first_install_at?.toDate ? data.first_install_at.toDate() : data.first_install_at,
                last_open_at: data.last_open_at?.toDate ? data.last_open_at.toDate() : data.last_open_at,
            };
        });

        // Get all push subscriptions
        const pushSnap = await db.collection('push_subscriptions').get();
        const pushMap: Record<string, boolean> = {};
        pushSnap.docs.forEach(doc => {
            pushMap[doc.data().userId] = true;
        });

        // Merge: every user gets a tracking status
        const result = Object.values(usersMap)
            .filter((u: any) => u.role !== 'admin') // skip admins
            .map((user: any) => ({
                ...user,
                tracking: trackingMap[user.id] || null,
                pwa_installed: !!trackingMap[user.id]?.pwa_installed,
                push_enabled: !!pushMap[user.id],
            }))
            .sort((a: any, b: any) => {
                // Installed users first
                if (a.pwa_installed && !b.pwa_installed) return -1;
                if (!a.pwa_installed && b.pwa_installed) return 1;
                return 0;
            });

        const totalUsers = result.length;
        const installedCount = result.filter((u: any) => u.pwa_installed).length;
        const pushEnabledCount = result.filter((u: any) => u.push_enabled).length;

        res.status(200).json({
            success: true,
            data: {
                users: result,
                stats: {
                    total_users: totalUsers,
                    installed_count: installedCount,
                    not_installed_count: totalUsers - installedCount,
                    install_rate: totalUsers > 0 ? Math.round((installedCount / totalUsers) * 100) : 0,
                    push_enabled_count: pushEnabledCount,
                },
            },
        });
    } catch (error: any) {
        console.error('[TrackingController] Error getting PWA tracking stats:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des données' });
    }
};
