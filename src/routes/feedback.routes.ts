// src/routes/feedback.routes.ts
import { Router } from 'express';
import { createFeedback, getMyFeedbacks } from '../controllers/feedback.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.post('/', requireAuth, createFeedback);
router.get('/me', requireAuth, getMyFeedbacks);

export default router;
