// src/routes/admin.routes.ts
import { Router } from 'express';
import { adjustUserBalance, createPackage, getAdminStats, getAllTransactions, getAllUsers, getPendingTransactions, getReceivedPayments, getTransactionById, updateTransactionStatus, verifyAndCredit, getPackages, getPackageById, requestCode, updatePackage, getAllPackagesAdmin } from '../controllers/admin.controller';
import { isAdmin, requireAuth } from '../middlewares/auth';
import { handleSMSWebhook } from '../controllers/sms.controller';
import { verifyWebhookKey } from '../middlewares/webhookGuard';

const router = Router();

// Voir les transactions en attente

router.get('/pending', requireAuth, isAdmin, getPendingTransactions)
    // router.get('/pending',  getPendingTransactions)

// Valider/Rejeter une transaction spécifique

// router.patch('/verify/:transactionId', requireAuth,isAdmin, updateTransactionStatus);
router.patch('/verify/:transactionId', requireAuth, isAdmin, updateTransactionStatus);

// Route pour ajouter un pack de coins au catalogue
router.post('/packages', requireAuth, isAdmin, createPackage);
router.patch('/packages/:id', requireAuth, isAdmin, updatePackage);
router.get('/packages', requireAuth, isAdmin, getAllPackagesAdmin);
router.get('/packages/:id', getPackageById);



// Route que l'application Android va appeler
// Route protégée par la X-API-KEY
router.post('/sms-webhook', verifyWebhookKey, handleSMSWebhook);

router.get('/transactions', requireAuth, isAdmin, getAllTransactions);

router.get('/transactions/:id', requireAuth, isAdmin, getTransactionById);

router.post('/transactions/:id/request-code', requireAuth, isAdmin, requestCode);

router.get('/stats', requireAuth, isAdmin, getAdminStats);

router.get('/users', requireAuth, isAdmin, getAllUsers);
router.patch('/users/:uid/adjust-balance', requireAuth, isAdmin, adjustUserBalance);

router.get('/payments-log', requireAuth, isAdmin, getReceivedPayments);

// Route pour le bouton "Valider" du Dashboard Admin
// router.patch('/verify-smart/:transactionId', requireAuth, isAdmin, verifyAndCredit);
router.patch('/verify-smart/:transactionId', requireAuth, isAdmin, updateTransactionStatus);

export default router;