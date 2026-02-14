// src/routes/notification.routes.ts
import { Router } from 'express';
import { 
    getNotifications, 
    markAsRead, 
    markAllAsRead, 
    getUnreadCount,
    getAdminNotifications,
    getAdminUnreadCount
} from '../controllers/notification.controller';
import { requireAuth, isAdmin } from '../middlewares/auth';

const router = Router();

// Routes pour les utilisateurs
router.get('/', requireAuth, getNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.patch('/mark-all-read', requireAuth, markAllAsRead);
router.patch('/:id/read', requireAuth, markAsRead);

// Routes pour les admins
router.get('/admin', requireAuth, isAdmin, getAdminNotifications);
router.get('/admin/unread-count', requireAuth, isAdmin, getAdminUnreadCount);

export default router;
