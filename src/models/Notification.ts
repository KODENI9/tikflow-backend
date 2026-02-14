// src/models/Notification.ts
export interface Notification {
    id?: string;
    user_id: string; // 'admin' if it's for all admins
    title: string;
    message: string;
    type: 'recharge_success' | 'recharge_error' | 'order_delivered' | 'system_alert' | 'payment_received' | 'warning';
    link?: string;
    read: boolean;
    created_at: Date;
}