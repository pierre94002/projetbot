import { createApp } from './app.js';
import { env } from './config/env.js';
import { startMatchStatsAutoRefresh } from './jobs/matchStatsAutoRefresh.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CôteMaster API à l'écoute sur http://localhost:${env.port}`);
  // Les statistiques de match se complètent ensuite toutes seules, en fond.
  startMatchStatsAutoRefresh();
});
