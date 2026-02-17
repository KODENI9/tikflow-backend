// src/models/PlatformStats.ts
export interface MonthlyStat {
    deposits: number;
    sales: number;
    cost: number;
    profit: number;
    transactions: number;
}

export interface PlatformStats {
    totalDeposits: number;      // Total recharges (Money In)
    totalSalesVolume: number;   // Total sales amount (Volume)
    totalCost: number;          // Total supplier cost
    totalProfit: number;        // Sales - Cost
    averageTransactionValue: number; // partial metric, calculated as totalSalesVolume / totalTransactions
    
    totalUsersBalance: number;
    totalTransactions: number;
    totalCoinsSold: number;
    totalUsers: number;
    
    // Map of "YYYY-MM" -> MonthlyStat
    monthlyStats: { [key: string]: MonthlyStat };
    
    updated_at: Date;
}
