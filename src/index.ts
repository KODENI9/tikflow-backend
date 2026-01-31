// src/index.ts
import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { db } from './config/firebase';
import adminRoutes from './routes/admin.routes';
import orderRoutes from './routes/order.routes';
import userRoutes from './routes/user.routes';


dotenv.config();

const app: Application = express();

// --- Middlewares de base ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes API ---
app.use('/api/users', userRoutes);      // Profil, Wallet
app.use('/api/orders', orderRoutes);    // Achat côté client
app.use('/api/admin', adminRoutes);     // Gestion côté admin

// --- Route de santé ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'TikFlow API is running' });
});

// --- Gestion d'erreurs globale ---
app.use((err: any, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ TikFlow Backend sur http://localhost:${PORT}`);
});