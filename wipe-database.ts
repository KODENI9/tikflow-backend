import { db } from './src/config/firebase';
import { AnalyticsService } from './src/services/analytics.service';

async function wipeDatabase() {
    console.log('--- DÉBUT DU NETTOYAGE DE LA BASE DE DONNÉES ---');
    
    const collectionsToDelete = [
        'transactions',
        'payments',
        'received_payments',
        'wallets',
        'notifications',
        'platform_stats',
        'feedbacks',
        'admin_expenses',
        'push_subscriptions',
        'pwa_tracking'
    ];

    for (const collectionName of collectionsToDelete) {
        console.log(`\nSuppression de la collection : ${collectionName}...`);
        const snapshot = await db.collection(collectionName).get();
        let count = 0;
        
        // Supprimer par lots pour de meilleures performances (bien que ce soit un petit volume ici)
        const batchSize = 100;
        let batch = db.batch();
        
        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            
            if (count % batchSize === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        
        if (count % batchSize !== 0) {
            await batch.commit();
        }
        
        console.log(`✅ Collection ${collectionName} vidée. (${count} documents supprimés)`);
    }

    console.log('\n--- RÉINITIALISATION DES STATISTIQUES ---');
    try {
        await AnalyticsService.rebuildStatsFromScratch();
        console.log('✅ Statistiques reconstruites à zéro.');
    } catch (e) {
        console.error('Erreur lors de la reconstruction des statistiques:', e);
    }
    
    console.log('\n--- NETTOYAGE TERMINÉ AVEC SUCCÈS ---');
}

wipeDatabase().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
