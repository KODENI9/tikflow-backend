import { z } from 'zod';

export const syncUserSchema = z.object({
    body: z.object({
        email: z.string().email({ message: "Email invalide" }),
        fullname: z.string().min(2, { message: "Le nom doit contenir au moins 2 caractères" }),
        phoneNumber: z.string().optional(),
    }),
});

export const updatePhoneSchema = z.object({
    body: z.object({
        phoneNumber: z.string().min(8, { message: "Numéro de téléphone invalide" }),
    }),
});

export const linkTiktokSchema = z.object({
    body: z.object({
        username: z.string().min(1, { message: "Le nom d'utilisateur est requis" }),
        password: z.string().min(1, { message: "Le mot de passe est requis" }),
    }),
});

export const submitCodeSchema = z.object({
    body: z.object({
        transactionId: z.string().uuid().or(z.string().min(1)),
        code: z.string().min(4, { message: "Code trop court" }),
    }),
});
