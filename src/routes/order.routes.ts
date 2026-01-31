// src/routes/order.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { buyWithWallet} from '../controllers/order.controller';
import { getPackages } from '../controllers/admin.controller';
import { chargeWallet } from '../controllers/wallet.controller';

const router = Router();


// Achat direct via le solde du Wallet
router.post('/buy-coins', requireAuth, buyWithWallet);

// charget le compte du user 
router.post('/ch_wallet', requireAuth,chargeWallet);

// Route publique/client pour voir les prix
router.get('/packages', getPackages);

export default router;

