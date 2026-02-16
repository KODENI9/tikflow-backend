export interface Recipient {
    id?: string;
    operator: 'flooz' | 'tmoney' | 'moov' | 'mtn' | 'orange' | 'skthib';
    phone: string;
    beneficiary_name: string;
    active: boolean;
    created_at: Date;
    updated_at?: Date;
}
