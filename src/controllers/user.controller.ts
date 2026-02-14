// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

export const getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const userEmail = req.auth.claims?.email; // Récupéré via le token Clerk

        const data = await UserService.getUserProfile(userId, userEmail as string);

        res.status(200).json({
            success: true,
            data: data
        });
    } catch (error) {
        next(error);
    }
};

export const syncUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log("Sync User Payload:", req.body);
        const userId = req.auth.userId;
        const { email, fullname, phoneNumber } = req.body;

        const result = await UserService.syncUser(userId, email, fullname, phoneNumber);

        if (result.isNew) {
            res.status(201).json({ success: true, message: "Utilisateur et Wallet créés", user: result.user });
        } else {
            res.status(200).json({ success: true, message: "Utilisateur synchronisé" });
        }
    } catch (error) {
        next(error);
    }
};

export const getUserHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const history = await UserService.getUserHistory(userId);

        res.status(200).json({
            success: true,
            count: history.length,
            data: history
        });
    } catch (error) {
        next(error);
    }
};

export const getTransactionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const { id } = req.params;
        const transaction = await UserService.getTransactionById(userId, id as string);

        res.status(200).json({
            success: true,
            data: transaction
        });
    } catch (error) {
        next(error);
    }
};

export const getWalletBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const balance = await UserService.getWalletBalance(userId);

        res.status(200).json({ success: true, balance: balance });
    } catch (error) {
        next(error);
    }
};

export const getMyNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const notifications = await UserService.getMyNotifications(userId);

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        next(error);
    }
};

export const updatePhoneNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const { phoneNumber } = req.body;

        await UserService.updatePhoneNumber(userId, phoneNumber);

    } catch (error) {
        next(error);
    }
};

export const linkTiktokAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const { username, password } = req.body;

        await UserService.linkTiktokAccount(userId, username, password);

        res.status(200).json({ success: true, message: "Compte TikTok lié avec succès" });
    } catch (error) {
        next(error);
    }
};

export const submitConfirmationCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth.userId;
        const { transactionId, code } = req.body;

        const message = await UserService.submitConfirmationCode(userId, transactionId, code);

        res.status(200).json({ success: true, message: message });
    } catch (error) {
        next(error);
    }
};
