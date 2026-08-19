import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

class TelegramCallService {
    private clientA: TelegramClient | null = null;
    private clientB: TelegramClient | null = null;
    private isConnectedA = false;
    private isConnectedB = false;
    private connectionPromiseA: Promise<void> | null = null;
    private connectionPromiseB: Promise<void> | null = null;

    constructor() {
        this.init();
    }

    private async init() {
        // Init Compte A
        const sessionA = process.env.TELEGRAM_SESSION;
        const apiIdA = process.env.TELEGRAM_API_ID;
        const apiHashA = process.env.TELEGRAM_API_HASH;

        if (sessionA && apiIdA && apiHashA) {
            const stringSessionA = new StringSession(sessionA);
            this.clientA = new TelegramClient(stringSessionA, parseInt(apiIdA), apiHashA, { connectionRetries: 5 });
            this.connectionPromiseA = this.clientA.connect().then(() => {
                this.isConnectedA = true;
                console.log("[TelegramCallService] Compte A connecté à Telegram (MTProto)");
            }).catch((e) => console.error("[TelegramCallService] Échec connexion Compte A:", e));
        }

        // Init Compte B
        const sessionB = process.env.TELEGRAM_SESSION_B;
        const apiIdB = process.env.TELEGRAM_API_ID_B;
        const apiHashB = process.env.TELEGRAM_API_HASH_B;

        if (sessionB && apiIdB && apiHashB) {
            const stringSessionB = new StringSession(sessionB);
            this.clientB = new TelegramClient(stringSessionB, parseInt(apiIdB), apiHashB, { connectionRetries: 5 });
            this.connectionPromiseB = this.clientB.connect().then(() => {
                this.isConnectedB = true;
                console.log("[TelegramCallService] Compte B connecté à Telegram (MTProto)");
            }).catch((e) => console.error("[TelegramCallService] Échec connexion Compte B:", e));
        }
    }

    private async executeCall(client: TelegramClient, targetStr: string, callerLabel: string) {
        try {
            console.log(`[TelegramCallService] [${callerLabel}] Recherche de l'entité pour ${targetStr}...`);
            const target = await client.getInputEntity(targetStr);

            console.log(`[TelegramCallService] [${callerLabel}] Appel de ${targetStr}...`);
            const result = await client.invoke(new Api.phone.RequestCall({
                userId: target,
                randomId: Math.floor(Math.random() * 1000000000),
                gAHash: Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
                protocol: new Api.PhoneCallProtocol({
                    minLayer: 93,
                    maxLayer: 93,
                    udpP2p: true,
                    udpReflector: true,
                    libraryVersions: ["1.0.0"]
                })
            }));

            // Sonner pendant 12 secondes
            await new Promise((res) => setTimeout(res, 12000));
            
            // Raccrocher pour laisser l'appel manqué
            if (result && 'phoneCall' in result && result.phoneCall && 'id' in result.phoneCall) {
                const call = result.phoneCall as any;
                await client.invoke(new Api.phone.DiscardCall({
                    peer: new Api.InputPhoneCall({
                        id: call.id,
                        accessHash: call.accessHash
                    }),
                    duration: 0,
                    reason: new Api.PhoneCallDiscardReasonMissed(),
                    // @ts-ignore
                    connectionId: 0
                }));
                console.log(`[TelegramCallService] [${callerLabel}] Appel manqué vers ${targetStr} terminé.`);
            }
        } catch (e: any) {
            console.error(`[TelegramCallService] [${callerLabel}] Erreur lors de l'appel vers ${targetStr}:`, e?.message || e);
        }
    }

    public async makeAdminCall() {
        const phoneA = process.env.TELEGRAM_ADMIN_PHONE; // +22899607741
        const phoneB = process.env.TELEGRAM_ADMIN_TARGET_PHONE; // +22890513279

        // 1. Appel du Compte A vers le Compte B
        if (this.clientA) {
            if (this.connectionPromiseA) await this.connectionPromiseA;
            if (this.isConnectedA && phoneB) {
                console.log("[TelegramCallService] ---> Étape 1 : Lancement de l'appel Compte A vers Compte B...");
                await this.executeCall(this.clientA, phoneB, "Compte A -> Compte B");
            }
        }

        // Pause de 2 secondes entre les deux appels
        await new Promise((res) => setTimeout(res, 2000));

        // 2. Appel du Compte B vers le Compte A
        if (this.clientB) {
            if (this.connectionPromiseB) await this.connectionPromiseB;
            if (this.isConnectedB && phoneA) {
                console.log("[TelegramCallService] ---> Étape 2 : Lancement de l'appel Compte B vers Compte A...");
                await this.executeCall(this.clientB, phoneA, "Compte B -> Compte A");
            }
        }
    }
}

export const telegramCallService = new TelegramCallService();
