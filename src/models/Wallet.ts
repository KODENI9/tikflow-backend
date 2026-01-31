// src/models/Wallet.ts
export interface Wallet {
    user_id: string;         // FK vers User.clerk_id
    balance: number;         // Solde actuel en Coins TikTok ou CFA selon ta logique
    currency: 'CFA'; 
    updated_at: Date;
}