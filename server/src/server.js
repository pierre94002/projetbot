import { createApp } from './app.js';
import { env } from './config/env.js';
import { startMatchStatsAutoRefresh } from './jobs/matchStatsAutoRefresh.js';
import { startLineupPrefetch } from './data/providers/lineupPrefetch.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CôteMaster API à l'écoute sur http://localhost:${env.port}`);
  // Les statistiques de match se complètent ensuite toutes seules, en fond.
  startMatchStatsAutoRefresh();
  // Boucle à part, plus fréquente : les compositions des matchs à venir,
  // fraîches à l'approche du coup d'envoi (cf. lineupPrefetch.js).
  if (env.matchStatsRefresh.enabled) startLineupPrefetch(env.lineupPrefetch);
});
