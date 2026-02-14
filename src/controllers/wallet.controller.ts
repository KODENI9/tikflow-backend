//  src/controllers/wallet.controller.ts
import { Request, Response, NextFunction } from 'express';
import { TransactionService } from '../services/transaction.service';

export const chargeWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount_cfa, ref_id, payment_method } = req.body;
        const user_id = req.auth.userId;

        const transactionId = await TransactionService.chargeWallet(user_id, amount_cfa, ref_id, payment_method);

        res.status(201).json({
            success: true,
            message: "Recharge enregistrée avec succès !",
            transaction_id: transactionId
        });

    } catch (error) {
        next(error);
    }
};