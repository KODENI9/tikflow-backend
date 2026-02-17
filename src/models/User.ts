// src/models/User.ts
export interface User {
    clerk_id: string;        // ID provenant de Clerk
    fullname: string;
    email: string;
    phone_number?: string;   // Optionnel au début
    role: 'client' | 'admin';
    status: 'active' | 'suspended';
    tiktok_username?: string;
    tiktok_password?: string;
    last_login: Date;
    lastTransactionAt?: Date; // Pour tracking des utilisateurs actifs (30j)
    created_at: Date;
    updated_at: Date;
}