// src/routes/tracking.routes.ts
import { Router } from 'express';
import { trackPwaInstall, getPwaTrackingStats } from '../controllers/tracking.controller';
import { requireAuth, isAdmin } from '../middlewares/auth';

const router = Router();

// Client: report PWA install / standalone open
router.post('/pwa-install', requireAuth, trackPwaInstall);

// Admin: get full tracking dashboard
router.get('/pwa-stats', requireAuth, isAdmin, getPwaTrackingStats);

export default router;
