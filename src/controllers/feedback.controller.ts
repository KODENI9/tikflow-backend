// src/controllers/feedback.controller.ts
import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../services/feedback.service';

export const createFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.uid;
        const { rating, comment, context } = req.body;
        
        const feedback = await FeedbackService.createFeedback(userId, { rating, comment, context });
        res.status(201).json(feedback);
    } catch (error) {
        next(error);
    }
};

export const getMyFeedbacks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.uid;
        const feedbacks = await FeedbackService.getMyFeedbacks(userId);
        res.status(200).json(feedbacks);
    } catch (error) {
        next(error);
    }
};

export const getAllFeedbacks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const feedbacks = await FeedbackService.getAllFeedbacks();
        res.status(200).json(feedbacks);
    } catch (error) {
        next(error);
    }
};
