// src/models/ReceivedPayment.ts
export interface ReceivedPayment {
    id?: string;
    ref_id: string;        // L'ID extrait du SMS (Flooz/Tmoney)
    amount: number;        // Le montant trouvé dans le SMS
    sender_phone: string;  // Le numéro qui a envoyé l'argent
    raw_sms: string;       // Le texte complet du SMS (pour preuve)
    status: 'unused' | 'used'; // Pour savoir si ce code a déjà servi à recharger un compte
    received_at: Date;
}