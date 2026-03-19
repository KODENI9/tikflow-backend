export interface Recipient {
    id?: string;
    operator: 'flooz' | 'tmoney' | 'moov' | 'mtn' | 'orange' | 'skthib';
    phone: string;
    beneficiary_name: string;
    ussd_template?: string; // e.g. *145*1*{{number}}*{{amount}}*2#
    active: boolean;
    created_at: Date;
    updated_at?: Date;
}
