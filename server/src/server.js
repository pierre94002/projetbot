// Bac à sable (docs/bac-a-sable.md) : TOUJOURS le premier import. Les imports
// s'évaluent dans l'ordre et avant le corps du module : ce garde-fou passe
// avant que quoi que ce soit n'ait lu l'environnement ou ouvert la base, et
// refuse de démarrer sur la vraie base. Hors bac à sable, il ne fait rien.
import './config/demarrageBac.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startMatchStatsAutoRefresh } from './jobs/matchStatsAutoRefresh.js';
import { startLineupPrefetch } from './data/providers/lineupPrefetch.js';
import { startKickoffAiAnalysis } from './jobs/kickoffAiAnalysis.js';
import { startOddsWatch } from './jobs/oddsWatch.js';
import { startEnregistreurs } from './jobs/enregistreurs.js';
import { enregistrerLancements } from './bench/trialsRegistry.js';
import { demarrerVersions } from './core/engine/engineVersions.js';

const app = createApp();

// Étape 25 du plan (versions du moteur) : AVANT d'écouter le port, pour que le
// premier calcul servi porte déjà son numéro. La toute première fois, la
// version 1 = l'état du moteur, notée sans rien changer aux chiffres ; ensuite,
// une mise à jour du code ou des réglages fait une version. Jamais bloquant.
try {
  const { versions, candidate, probleme, lancementEnAttente } = demarrerVersions();
  if (versions.source === 'illisible') console.warn(`[versions du moteur] registre illisible, rien n'y est écrit (les pronostics seront « sans version ») : ${versions.probleme}`);
  else console.log(`[versions du moteur] version ${versions.numero} en service${versions.change ? (versions.nouvelle ? ' (nouvelle)' : ' (reprise)') : ''}${candidate?.candidate ? `, candidate « ${candidate.candidate.id} » en essai` : ''}.`);
  if (probleme) console.warn(`[versions du moteur] candidate non mise en essai : ${probleme}`);
  // Étape 25, seconde moitié : le lancement d'une adoption resté « à déclarer » au registre de la mesure.
  if (lancementEnAttente) console.log(`[versions du moteur] lancement de l'adoption ${lancementEnAttente.declare ? 'déclaré au registre de la mesure' : `toujours à déclarer : ${lancementEnAttente.probleme}`}.`);
} catch (error) {
  console.warn(`[versions du moteur] non accordées au démarrage (le serveur tourne quand même) : ${error.message}`);
}

app.listen(env.port, () => {
  console.log(`CôteMaster API à l'écoute sur http://localhost:${env.port}`);
  // Les statistiques de match se complètent ensuite toutes seules, en fond.
  startMatchStatsAutoRefresh();
  // Boucle à part, plus fréquente : les compositions des matchs à venir,
  // fraîches à l'approche du coup d'envoi (cf. lineupPrefetch.js).
  if (env.matchStatsRefresh.enabled) startLineupPrefetch(env.lineupPrefetch);
  // Les cotes gratuites autour du coup d'envoi, en direct, et le rattrapage
  // de leur historique (cf. jobs/oddsWatch.js).
  if (env.matchStatsRefresh.enabled && env.freeOdds.enabled) startOddsWatch(env.freeOdds);
  // L'analyse IA de chaque match une heure avant son coup d'envoi, avec la
  // composition (cf. jobs/kickoffAiAnalysis.js) ; même coupe-circuit que les
  // autres analyses automatiques (AUTO_AI_ANALYSIS=false).
  if (env.matchStatsRefresh.enabled && env.autoAiAnalysis.enabled) startKickoffAiAnalysis();
  // Les enregistreurs (étape E du plan) : absents du jour, matchs en direct,
  // cotes payantes archivées ; le gel des pronostics est une étape de
  // l'actualisation. Même interrupteur que l'actualisation (cf.
  // jobs/enregistreurs.js), plus ENREGISTREURS=false.
  if (env.matchStatsRefresh.enabled && env.enregistreurs.enabled) startEnregistreurs(env.enregistreurs);
  try { enregistrerLancements(); } catch (error) { console.warn(`[garde-fou de la mesure] lancements non notés au registre (le serveur tourne quand même) : ${error.message}`); } // étape 16 : date de mise en service des versions déclarées dans bench/lancements.js
});
