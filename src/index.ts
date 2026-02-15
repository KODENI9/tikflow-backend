// src/index.ts
import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { db } from './config/firebase';
import adminRoutes from './routes/admin.routes';
import orderRoutes from './routes/order.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import { globalErrorHandler } from './middlewares/error.middleware';


dotenv.config();

const app: Application = express();

// --- Middlewares de base ---
app.use(helmet()); // Sécurité des headers HTTP

// Limitation du taux de requêtes (Rate Limiting)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Augmenté pour éviter le blocage du dashboard admin
    message: "Trop de requêtes, veuillez réessayer plus tard."
});
app.use(limiter);

// Configuration CORS stricte
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'http://localhost:3000', 
    'http://10.0.10.35:3000', 
    'https://tikflow.com',
    'https://tikflowaf.vercel.app'
]; 
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
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