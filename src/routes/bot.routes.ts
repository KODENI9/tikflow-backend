import { Router } from 'express';
import { BotController } from '../controllers/bot.controller';
import { requireAuth, isAdmin } from '../middlewares/auth';

const router = Router();

// Routes réservées à l'administrateur
router.use(requireAuth as any);
router.use(isAdmin as any);

router.post('/start', BotController.start as any);
router.post('/pause/:orderId', BotController.pause as any);
router.post('/resume/:orderId', BotController.resume as any);
router.post('/2fa/:orderId', BotController.submit2FA as any);
router.post('/cancel/:orderId', BotController.cancel as any);
router.get('/task/:orderId', BotController.getTask as any);
router.get('/tasks', BotController.getAllTasks as any);

export default router;
