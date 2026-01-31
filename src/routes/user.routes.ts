// src/routes/user.routes.ts
import { Router } from 'express';
import { getUserHistory, getUserProfile, getWalletBalance, syncUser, updatePhoneNumber } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth';


const router = Router();

// L'utilisateur accède à ses propres données
router.get('/profile', requireAuth, getUserProfile);

router.post('/sync', requireAuth, syncUser); // Utilise POST pour envoyer email/fullname

// Route pour l'historique complet
router.get('/history', requireAuth, getUserHistory);

// Route pour voir son solde actuel
router.get('/balance', requireAuth, getWalletBalance);

router.patch('/update-phone', requireAuth, updatePhoneNumber);
export default router;