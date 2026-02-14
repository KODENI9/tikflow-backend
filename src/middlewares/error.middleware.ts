// src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    // Default error values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Handle specific error types if needed (e.g., CastError, validation errors)
    if (err.name === 'CastError') {
        const message = `Invalid resource identifier: ${err.path}`;
        // statusCode = 400; // You might want to use AppError here
    }

    // Prepare response
    const response: any = {
        success: false,
        status: statusCode,
        message: message,
    };

    // Include stack trace in development mode
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    // Log the error for debugging
    console.error('❌ Error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    res.status(statusCode).json(response);
};
