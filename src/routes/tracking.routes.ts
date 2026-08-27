// src/routes/tracking.routes.ts
import { Router } from 'express';
import { trackPwaInstall, getPwaTrackingStats, triggerInstallPrompt, clearInstallTrigger } from '../controllers/tracking.controller';
import { requireAuth, isAdmin } from '../middlewares/auth';

const router = Router();

// Client: report PWA install / standalone open
router.post('/pwa-install', requireAuth, trackPwaInstall);

// Client: acknowledge and clear the install trigger flag
router.post('/clear-trigger', requireAuth, clearInstallTrigger);

// Admin: get full tracking dashboard
router.get('/pwa-stats', requireAuth, isAdmin, getPwaTrackingStats);

// Admin: remotely trigger install prompt on a user's screen
router.post('/trigger-install/:userId', requireAuth, isAdmin, triggerInstallPrompt);

export default router;
