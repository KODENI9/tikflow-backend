import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { subscribeToPush, unsubscribeFromPush } from '../controllers/push.controller';

const router = Router();

router.post('/subscribe', requireAuth, subscribeToPush);
router.post('/unsubscribe', unsubscribeFromPush);

export default router;
