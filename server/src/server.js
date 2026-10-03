import { createApp } from './app.js';
import { env } from './config/env.js';
import { startMatchStatsAutoRefresh } from './jobs/matchStatsAutoRefresh.js';
import { startLineupPrefetch } from './data/providers/lineupPrefetch.js';
import { startKickoffAiAnalysis } from './jobs/kickoffAiAnalysis.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CôteMaster API à l'écoute sur http://localhost:${env.port}`);
  // Les statistiques de match se complètent ensuite toutes seules, en fond.
  startMatchStatsAutoRefresh();
  // Boucle à part, plus fréquente : les compositions des matchs à venir,
  // fraîches à l'approche du coup d'envoi (cf. lineupPrefetch.js).
  if (env.matchStatsRefresh.enabled) startLineupPrefetch(env.lineupPrefetch);
  // L'analyse IA de chaque match une heure avant son coup d'envoi, avec la
  // composition (cf. jobs/kickoffAiAnalysis.js) ; même coupe-circuit que les
  // autres analyses automatiques (AUTO_AI_ANALYSIS=false).
  if (env.matchStatsRefresh.enabled && env.autoAiAnalysis.enabled) startKickoffAiAnalysis();
});
