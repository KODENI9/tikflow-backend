// src/routes/order.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { buyWithWallet} from '../controllers/order.controller';
import { getPackages, getPackageById, getRecipients, getGlobalSettings } from '../controllers/admin.controller';
import { chargeWallet } from '../controllers/wallet.controller';

import { validate } from '../middlewares/validation.middleware';
import { buyCoinsSchema, chargeWalletSchema } from '../schemas/order.schema';

const router = Router();


// Achat direct via le solde du Wallet
router.post('/buy-coins', requireAuth, validate(buyCoinsSchema), buyWithWallet);

// charget le compte du user 
router.post('/ch_wallet', requireAuth, validate(chargeWalletSchema), chargeWallet);

// Route publique/client pour voir les prix
router.get('/packages', getPackages);
router.get('/packages/:id', getPackageById);
router.get('/recipients', getRecipients);
router.get('/app-settings', getGlobalSettings);

export default router;

