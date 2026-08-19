const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");

const apiId = 34892516;
const apiHash = "3be554c60981ae1b31e8d40a9b58636d";
const stringSession = new StringSession("");

const codeFile = path.join(__dirname, "telegram_code.txt");

// Delete the code file if it exists from a previous run
if (fs.existsSync(codeFile)) {
    fs.unlinkSync(codeFile);
}

const getCode = async () => {
    console.log(`\nWaiting for you to provide the code...`);
    console.log(`Please create/update the file: ${codeFile} with the 5-digit code.`);
    
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (fs.existsSync(codeFile)) {
                const code = fs.readFileSync(codeFile, "utf-8").trim();
                if (code.length >= 5) {
                    clearInterval(interval);
                    console.log(`Code found: ${code}`);
                    fs.unlinkSync(codeFile); // clean up
                    resolve(code);
                }
            }
        }, 2000);
    });
};

(async () => {
    console.log("Starting Telegram client setup for Account B...");
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    
    try {
        await client.start({
            phoneNumber: "+22890513279",
            password: async () => "",
            phoneCode: async () => await getCode(),
            onError: (err) => console.error("Error during authentication:", err),
        });
        
        console.log("Successfully connected to Telegram!");
        console.log("=== BEGIN SESSION STRING ===");
        console.log(client.session.save());
        console.log("=== END SESSION STRING ===");
        
        // Wait a bit and exit
        setTimeout(() => process.exit(0), 1000);
    } catch (e) {
        console.error("Failed to connect:", e);
        process.exit(1);
    }
})();
