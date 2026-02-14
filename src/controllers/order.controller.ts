// src/controllers/order.controller.ts
import { Request, Response, NextFunction } from 'express';
import { TransactionService } from '../services/transaction.service';

export const buyWithWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log("Buy With Wallet Payload:", req.body);
        const { packageId, tiktok_username, tiktok_password } = req.body;
        const userId = req.auth.userId;

        const result = await TransactionService.buyWithWallet(userId, packageId, tiktok_username, tiktok_password);

        res.status(200).json({
            success: true,
            message: "Achat réussi ! Vos coins seront livrés sous peu.",
            data: result
        });

    } catch (error) {
        next(error);
    }
};