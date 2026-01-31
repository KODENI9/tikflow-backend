// src/models/Transaction.ts
export interface Transaction {
    id?: string;             // ID auto-généré par Firestore
    user_id: string;
    type: 'achat_coins' | 'recharge'; 
    payment_method: 'flooz' | 'tmoney' | 'moov' | 'skthib'; // methode "skthib"
    ref_id: string;          // ID de transaction Mobile Money fourni par le client
    amount_cfa: number;      // Argent payé
    amount_coins: number;    // Nombre de coins demandés
    tiktok_username?: string; 
    tiktok_password?: string; // Si vraiment nécessaire
    status: 'pending' | 'completed' | 'rejected' | 'failed';
    admin_note?: string;     // Pour dire pourquoi c'est rejeté par exemple
    created_at: Date;
}