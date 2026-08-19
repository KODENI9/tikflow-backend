import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// @ts-ignore
import input from "input"; // npm i input

const apiId = 38789325;
const apiHash = "403a88075980bb342177bbc4e7a29540";
const stringSession = new StringSession("");

(async () => {
    console.log("Starting Telegram client setup...");
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    
    try {
        await client.start({
            phoneNumber: "+22899607741",
            password: async () => await input.text("Please enter your password (if 2FA is enabled): "),
            phoneCode: async () => await input.text("Please enter the code you received: "),
            onError: (err) => console.error("Error during authentication:", err),
        });
        
        console.log("Successfully connected to Telegram!");
        console.log("=== BEGIN SESSION STRING ===");
        console.log(client.session.save() as unknown as string);
        console.log("=== END SESSION STRING ===");
        
        // Wait a bit and exit
        setTimeout(() => process.exit(0), 1000);
    } catch (e) {
        console.error("Failed to connect:", e);
        process.exit(1);
    }
})();
