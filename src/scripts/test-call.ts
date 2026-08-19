require('dotenv').config({ path: __dirname + '/../../.env' });
const { telegramCallService } = require('../services/telegram-call.service');

(async () => {
    console.log("Testing Telegram call to target number...");
    
    // Wait a little for the connection to establish since telegramCallService initiates connect() asynchronously in its constructor
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    try {
        await telegramCallService.makeAdminCall();
        console.log("Test call script finished executing.");
        setTimeout(() => process.exit(0), 1000);
    } catch (e) {
        console.error("Test call failed:", e);
        process.exit(1);
    }
})();
