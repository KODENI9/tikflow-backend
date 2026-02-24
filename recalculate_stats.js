
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

async function recalculateStats() {
    try {
        console.log('--- Recalculating Platform Stats ---');

        const transactionsSnapshot = await db.collection('transactions').get();
        const usersSnapshot = await db.collection('users').get();

        let totalDeposits = 0;
        let totalSalesVolume = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let totalTransactions = 0;
        let totalCoinsSold = 0;
        let totalUsersBalance = 0; // This one is tricky as it's a sum of wallets
        const monthlyStats = {};

        console.log(`Processing ${transactionsSnapshot.size} transactions...`);

        transactionsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'completed') return;

            totalTransactions++;

            const date = data.created_at?.toDate?.() || new Date(data.created_at?._seconds * 1000 || 0);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { deposits: 0, sales: 0, cost: 0, profit: 0, transactions: 0 };
            }

            if (data.type === 'recharge') {
                const amount = Number(data.amount_cfa || 0);
                totalDeposits += amount;
                monthlyStats[monthKey].deposits += amount;
                monthlyStats[monthKey].transactions += 1;
            } else if (data.type === 'achat_coins') {
                const saleAmount = Number(data.sale_amount || data.amount_cfa || 0);
                const cost = Number(data.cost_amount || 0);
                const profit = Number(data.profit || (saleAmount - cost));
                const coins = Number(data.amount_coins || 0);

                totalSalesVolume += saleAmount;
                totalCost += cost;
                totalProfit += profit;
                totalCoinsSold += coins;

                monthlyStats[monthKey].sales += saleAmount;
                monthlyStats[monthKey].cost += cost;
                monthlyStats[monthKey].profit += profit;
                monthlyStats[monthKey].transactions += 1;
            }
        });

        console.log('Calculating total user balance...');
        const walletsSnapshot = await db.collection('wallets').get();
        walletsSnapshot.forEach(doc => {
            totalUsersBalance += Number(doc.data().balance || 0);
        });

        const stats = {
            totalDeposits,
            totalSalesVolume,
            totalCost,
            totalProfit,
            averageTransactionValue: totalTransactions > 0 ? totalSalesVolume / totalTransactions : 0,
            totalUsersBalance,
            totalTransactions,
            totalCoinsSold,
            totalUsers: usersSnapshot.size,
            monthlyStats,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        console.log('New stats calculated:', JSON.stringify(stats, null, 2));

        await db.collection('platform_stats').doc('main').set(stats);
        console.log('✅ platform_stats/main updated successfully.');

    } catch (error) {
        console.error('❌ Error recalculating stats:', error);
    } finally {
        process.exit();
    }
}

recalculateStats();
