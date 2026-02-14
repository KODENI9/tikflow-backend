import { Router } from 'express';
import { getUserHistory, getUserProfile, getWalletBalance, syncUser, updatePhoneNumber, linkTiktokAccount, submitConfirmationCode, getTransactionById } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth';


import { validate } from '../middlewares/validation.middleware';
import { syncUserSchema, updatePhoneSchema, linkTiktokSchema, submitCodeSchema } from '../schemas/user.schema';

const router = Router();

// L'utilisateur accède à ses propres données
router.get('/profile', requireAuth, getUserProfile);

router.post('/sync', requireAuth, validate(syncUserSchema), syncUser); // Utilise POST pour envoyer email/fullname

// Route pour l'historique complet
router.get('/history', requireAuth, getUserHistory);
router.get('/transactions/:id', requireAuth, getTransactionById);

// Route pour voir son solde actuel
router.get('/balance', requireAuth, getWalletBalance);

router.patch('/update-phone', requireAuth, validate(updatePhoneSchema), updatePhoneNumber);

router.patch('/link-tiktok', requireAuth, validate(linkTiktokSchema), linkTiktokAccount);
router.post('/submit-code', requireAuth, validate(submitCodeSchema), submitConfirmationCode);

export default router;