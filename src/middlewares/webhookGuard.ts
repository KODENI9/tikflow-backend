import { Request, Response, NextFunction } from 'express';

export const verifyWebhookKey = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.SMS_WEBHOOK_KEY;

    if (!apiKey || apiKey !== validKey) {
        console.log("🚨 Tentative d'accès non autorisée au Webhook SMS !");
        res.status(401).json({ success: false, message: "Accès refusé : Clé API invalide" });
        return;
    }

    next();
};