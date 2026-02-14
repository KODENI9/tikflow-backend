// src/controllers/sms.controller.ts
import { Request, Response, NextFunction } from 'express';
import { SmsService } from '../services/sms.service';

export const handleSMSWebhook = async (req: Request, res: Response, next: NextFunction) => {
    console.log("📨 Webhook SMS reçu Payload:", JSON.stringify(req.body, null, 2));

    try {
        const sender = req.body.from || req.body.sender;
        const rawContent = req.body.message || req.body.content;

        const result = await SmsService.handleSMSWebhook(sender, rawContent);

        if (result.status === "duplicate" || result.status === "parsing_failed") {
             // On renvoie 200 pour dire au service SMS "J'ai bien reçu" ou "J'ai géré le doublon"
             res.status(200).send(result.message);
        } else {
             res.status(200).json({ success: true, ref_id: result.ref_id, amount: result.amount });
        }

    } catch (error) {
        next(error);
    }
};