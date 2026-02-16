// src/controllers/admin.controller.ts
import { Request, Response, NextFunction } from "express";
import { AdminService } from "../services/admin.service";

export const getPendingTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await AdminService.getPendingTransactions();
        res.status(200).json({ success: true, data: transactions });
    } catch (error) {
        next(error);
    }
};

export const getAllTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const transactions = await AdminService.getAllTransactions();
        res.status(200).json({ success: true, data: transactions });
    } catch (error) {
        next(error);
    }
};

export const getTransactionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = await AdminService.getTransactionById(id as string);
        res.status(200).json({ success: true, data: data });
    } catch (error) {
        next(error);
    }
};

export const verifyAndCredit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId } = req.params;
        const message = await AdminService.verifyAndCredit(transactionId as string);
        res.status(200).json({ success: true, message: message });
    } catch (error) {
        next(error);
    }
};

export const updateTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transactionId } = req.params;
        const { status, admin_note } = req.body;
        const message = await AdminService.updateTransactionStatus(transactionId as string, status, admin_note);
        res.status(200).json({ success: true, message: message });
    } catch (error) {
        next(error);
    }
};

export const createPackage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, coins, price_cfa } = req.body;
        const id = await AdminService.createPackage(name, coins, price_cfa);
        res.status(201).json({ success: true, id: id });
    } catch (error) {
        next(error);
    }
};

export const getPackages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const packages = await AdminService.getPackages(true);
        res.status(200).json({ success: true, data: packages });
    } catch (error) {
        next(error);
    }
};

export const getAllPackagesAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const packages = await AdminService.getPackages(false);
        res.status(200).json({ success: true, data: packages });
    } catch (error) {
        next(error);
    }
};

export const getPackageById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const pkg = await AdminService.getPackageById(id as string);
        res.status(200).json({ success: true, data: pkg });
    } catch (error) {
        next(error);
    }
};

export const updatePackage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const result = await AdminService.updatePackage(id as string, updates);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getAdminStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await AdminService.getAdminStats();
        res.status(200).json({ success: true, data: data });
    } catch (error) {
        next(error);
    }
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const usersList = await AdminService.getAllUsers();
        res.status(200).json(usersList);
    } catch (error) {
        next(error);
    }
};

export const adjustUserBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { uid } = req.params;
        const { amount } = req.body;
        await AdminService.adjustUserBalance(uid as string, amount);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const getReceivedPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payments = await AdminService.getReceivedPayments();
        res.status(200).json(payments);
    } catch (error) {
        next(error);
    }
};

export const requestCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const message = await AdminService.requestCode(id as string);
        res.status(200).json({ success: true, message: message });
    } catch (error) {
        next(error);
    }
};

// --- RECIPIENTS ---
export const createRecipient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = await AdminService.createRecipient(req.body);
        res.status(201).json({ success: true, id: id });
    } catch (error) {
        next(error);
    }
};

export const getRecipients = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const activeOnly = req.query.active === 'true';
        const recipients = await AdminService.getRecipients(activeOnly);
        res.status(200).json({ success: true, data: recipients });
    } catch (error) {
        next(error);
    }
};

export const updateRecipient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await AdminService.updateRecipient(id as string, req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const deleteRecipient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await AdminService.deleteRecipient(id as string);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// --- GLOBAL SETTINGS ---
export const getGlobalSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const settings = await AdminService.getGlobalSettings();
        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
};

export const updateGlobalSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await AdminService.updateGlobalSettings(req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};
export const sendUserNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { uid } = req.params;
        const { title, message } = req.body;
        const id = await AdminService.sendUserNotification(uid as string, title, message);
        res.status(201).json({ success: true, id: id });
    } catch (error) {
        next(error);
    }
};
