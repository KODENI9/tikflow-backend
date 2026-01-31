// src/models/User.ts
export interface User {
    clerk_id: string;        // ID provenant de Clerk
    fullname: string;
    email: string;
    phone_number?: string;   // Optionnel au début
    role: 'client' | 'admin';
    status: 'active' | 'suspended';
    last_login: Date;
    created_at: Date;
    updated_at: Date;
}