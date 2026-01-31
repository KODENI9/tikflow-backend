// src/routes/admin.routes.ts
import { Router } from 'express';
import { createPackage, getAdminStats, getAllUsers, getPendingTransactions, getReceivedPayments, updateTransactionStatus, verifyAndCredit } from '../controllers/admin.controller';
import { isAdmin, requireAuth } from '../middlewares/auth';
import { handleSMSWebhook } from '../controllers/sms.controller';
import { verifyWebhookKey } from '../middlewares/webhookGuard';

const router = Router();

// Voir les transactions en attente

router.get('/pending', requireAuth, isAdmin, getPendingTransactions)
    // router.get('/pending',  getPendingTransactions)

// Valider/Rejeter une transaction spécifique

router.patch('/verify/:transactionId', requireAuth,isAdmin, updateTransactionStatus);
// router.patch('/verify/:transactionId', updateTransactionStatus);

// Route pour ajouter un pack de coins au catalogue
router.post('/packages', requireAuth, isAdmin, createPackage);
// router.post('/packages',  createPackage);



// Route que l'application Android va appeler
// Route protégée par la X-API-KEY
router.post('/sms-webhook', verifyWebhookKey, handleSMSWebhook);




router.get('/stats', requireAuth, isAdmin, getAdminStats);

router.get('/users', requireAuth, isAdmin, getAllUsers);

router.get('/payments-log', requireAuth, isAdmin, getReceivedPayments);

// Route pour le bouton "Valider" du Dashboard Admin
router.patch('/verify-smart/:transactionId', requireAuth, isAdmin, verifyAndCredit);

export default router;