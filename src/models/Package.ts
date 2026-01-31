// src/models/Package.ts
export interface Package {
    id?: string;
    name: string;        // ex: "Pack Découverte", "Pack Premium"
    coins: number;       // Nombre de coins (ex: 100)
    price_cfa: number;   // Prix correspondant (ex: 700)
    active: boolean;     // Pour afficher/masquer un pack sans le supprimer
    created_at: Date;
    updated_at?: Date;
}