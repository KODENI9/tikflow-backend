// src/index.ts
import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { db } from './config/firebase';
import adminRoutes from './routes/admin.routes';
import orderRoutes from './routes/order.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import feedbackRoutes from './routes/feedback.routes';
import paymentRoutes from './routes/payment.routes';
import pushRoutes from './routes/push.routes';
import trackingRoutes from './routes/tracking.routes';
import { globalErrorHandler } from './middlewares/error.middleware';
import { MarketingService } from './services/marketing.service';

// --- Tâches Planifiées (Cron Jobs) ---
// S'exécute tous les jours à 10h00 du matin (Heure du serveur)
cron.schedule('0 10 * * *', () => {
    console.log('[CRON] Lancement des campagnes marketing automatisées...');
    MarketingService.runAllCampaigns();
});



dotenv.config();

const app: Application = express();

// --- Middlewares de base ---
app.use(helmet()); // Sécurité des headers HTTP

// Indispensable sur Render / tout reverse proxy :
// permet à Express de lire correctement X-Forwarded-For
app.set('trust proxy', 1);

// Limitation du taux de requêtes (Rate Limiting)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Augmenté pour éviter le blocage du dashboard admin
    message: "Trop de requêtes, veuillez réessayer plus tard."
});
app.use(limiter);

// Configuration CORS avec support dev et réseau local
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'http://10.0.10.35:3000', 
    'https://tikflow.com',
    'https://tikflowaf.vercel.app'
]; 

app.use(cors({
    origin: (origin, callback) => {
        // Autoriser si pas d'origin (ex: requêtes serveur à serveur, mobile, curl)
        if (!origin) return callback(null, true);

        // En mode dev ou si l'origine est dans la liste autorisée ou provient d'un IP local (192.168.x.x, 10.x.x.x)
        const isLocalNetwork = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

        if (allowedOrigins.includes(origin) || isLocalNetwork || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes API ---
app.use('/api/users', userRoutes);    // Profil, Wallet
app.use('/api/orders', orderRoutes);    // Achat côté client
app.use('/api/admin', adminRoutes);     // Gestion côté admin
app.use('/api/notifications', notificationRoutes); // Notifications
app.use('/api/feedback', feedbackRoutes); // Feedback
app.use('/api/payments', paymentRoutes); // Paiements MoneyFusion
app.use('/api/push', pushRoutes); // Abonnements Web Push
app.use('/api/tracking', trackingRoutes); // PWA Tracking

// --- Route de santé ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'TikFlow API is running' });
});

// --- Gestion d'erreurs globale ---
app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ TikFlow Backend sur http://localhost:${PORT}`);
    
});