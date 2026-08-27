import { AnalyticsService } from './src/services/analytics.service';
import './src/config/firebase';

async function run() {
    console.log('Rebuilding stats...');
    const result = await AnalyticsService.rebuildStatsFromScratch();
    console.log('Success:', result);
    process.exit(0);
}
run();
