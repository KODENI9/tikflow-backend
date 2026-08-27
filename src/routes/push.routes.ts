import { Router } from 'express';
import { subscribeToPush, unsubscribeFromPush } from '../controllers/push.controller';

const router = Router();

router.post('/subscribe', subscribeToPush);
router.post('/unsubscribe', unsubscribeFromPush);

export default router;
