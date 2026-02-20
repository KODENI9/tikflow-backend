import { AdminService } from '../services/admin.service';
import { db } from '../config/firebase';

async function main() {
    try {
        console.log("Fetching transactions...");
        const transactions = await AdminService.getAllTransactions();
        console.log(`Found ${transactions.length} transactions.`);
        if (transactions.length > 0) {
            console.log("First transaction:", JSON.stringify(transactions[0], null, 2));
        } else {
            console.log("No transactions returned.");
        }
    } catch (error) {
        console.error("Error fetching transactions:", error);
    } 
}

main();
