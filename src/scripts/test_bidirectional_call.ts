import dotenv from "dotenv";
dotenv.config();

import { telegramCallService } from "../services/telegram-call.service";

(async () => {
    console.log("=== TEST APPEL BIDIRECTIONNEL TELEGRAM ===");
    await telegramCallService.makeAdminCall();
    console.log("=== FIN DU TEST ===");
    process.exit(0);
})();
