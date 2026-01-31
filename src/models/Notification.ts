// src/models/Notification.ts
export interface Notification {
    user_id: string;
    title: string;
    message: string;
    type: 'recharge_success' | 'recharge_error' | 'order_delivered';
    read: boolean;
    created_at: Date;
}