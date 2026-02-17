// src/services/analytics.service.ts
import { db } from '../config/firebase';
import { PlatformStats, MonthlyStat } from '../models/PlatformStats';
import { Transaction } from '../models/Transaction';
import { admin } from '../config/firebase'; // Need admin.firestore.FieldValue

export class AnalyticsService {
    private static statsCollection = db.collection('platform_stats');
    private static statsDocRef = db.collection('platform_stats').doc('main');
    private static usersCollection = db.collection('users');

    // Initialize stats if not exists (called lazily or manually)
    static async initStats() {
        const doc = await this.statsDocRef.get();
        if (!doc.exists) {
            const initialStats: PlatformStats = {
                totalDeposits: 0,
                totalSalesVolume: 0,
                totalCost: 0,
                totalProfit: 0,
                averageTransactionValue: 0,
                totalUsersBalance: 0,
                totalTransactions: 0,
                totalCoinsSold: 0,
                totalUsers: 0,
                monthlyStats: {},
                updated_at: new Date()
            };
            await this.statsDocRef.set(initialStats);
        }
    }

    static async getStats(): Promise<PlatformStats> {
        const doc = await this.statsDocRef.get();
        if (!doc.exists) {
            await this.initStats();
            return (await this.statsDocRef.get()).data() as PlatformStats;
        }
        return doc.data() as PlatformStats;
    }

    // Atomic update of global stats
    static async updateStats(transaction: Transaction) {
        // Ensure document exists
        await this.initStats();

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;

        await db.runTransaction(async (t) => {
            const statsDoc = await t.get(this.statsDocRef);
            const currentStats = statsDoc.data() as PlatformStats;
            const currentMonthly = currentStats.monthlyStats || {};
            
            // Initialize month if missing
            if (!currentMonthly[monthKey]) {
                currentMonthly[monthKey] = {
                    deposits: 0,
                    sales: 0,
                    cost: 0,
                    profit: 0,
                    transactions: 0
                };
            }

            const monthStat = currentMonthly[monthKey];

            // Updates based on transaction type
            if (transaction.type === 'recharge' && transaction.status === 'completed') {
                // Money In (Deposit)
                const amount = transaction.amount_cfa;
                
                // Global
                currentStats.totalDeposits = (currentStats.totalDeposits || 0) + amount;
                currentStats.totalUsersBalance = (currentStats.totalUsersBalance || 0) + amount;
                currentStats.totalTransactions = (currentStats.totalTransactions || 0) + 1;
                
                // Monthly
                monthStat.deposits += amount;
                monthStat.transactions += 1;

            } else if (transaction.type === 'achat_coins' && transaction.status === 'completed') {
                // Sales
                const saleAmount = transaction.sale_amount || transaction.amount_cfa;
                const cost = transaction.cost_amount || 0;
                const profit = transaction.profit || (saleAmount - cost);
                const coins = transaction.amount_coins || 0;

                // Global
                currentStats.totalSalesVolume = (currentStats.totalSalesVolume || 0) + saleAmount;
                currentStats.totalCost = (currentStats.totalCost || 0) + cost;
                currentStats.totalProfit = (currentStats.totalProfit || 0) + profit;
                currentStats.totalCoinsSold = (currentStats.totalCoinsSold || 0) + coins;
                currentStats.totalUsersBalance = (currentStats.totalUsersBalance || 0) - saleAmount; // User spent money
                currentStats.totalTransactions = (currentStats.totalTransactions || 0) + 1;

                // Monthly
                monthStat.sales += saleAmount;
                monthStat.cost += cost;
                monthStat.profit += profit;
                monthStat.transactions += 1;
            }

            // Recalculate Average Transaction Value (Sales Volume / Sales Transactions? Or All Transactions?)
            // User request: "averageTransactionValue = Total Sales Volume / Total Transactions"
            // Note: if 'totalTransactions' includes recharges, this dilutes the value. 
            // Usually ATV is for Sales only. But I will follow formula: SalesVol / TotalTx
            // Wait, if TotalTx includes recharges (which have 0 sales volume), it drops the avg.
            // Let's assume User meant "Total Sales Transactions". 
            // But strict request says: "Total Sales Volume / Total Transactions". I will follow strictly but strictly implies all tx.
            // Let's stick to strict request: totalSalesVolume / totalTransactions (where totalTransactions is global count).
            if (currentStats.totalTransactions > 0) {
               currentStats.averageTransactionValue = currentStats.totalSalesVolume / currentStats.totalTransactions;
            }

            currentStats.updated_at = new Date();
            
            // Write back
            t.set(this.statsDocRef, currentStats);
        });
    }

    static async getActiveUsersCount(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const snapshot = await this.usersCollection
            .where('lastTransactionAt', '>=', thirtyDaysAgo)
            .count()
            .get();

        return snapshot.data().count;
    }
}
