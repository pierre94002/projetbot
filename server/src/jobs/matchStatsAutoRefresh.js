/**
 * matchStatsAutoRefresh.js
 * -----------------------------------------------------------------------
 * Tient les statistiques de match à jour sans qu'on ait à le demander.
 *
 * À intervalle régulier, le serveur cherche les rencontres terminées dont
 * les statistiques manquent et va les chercher chez ESPN. La source étant
 * gratuite et sans clé, cette boucle ne consomme aucun quota : c'est ce qui
 * permet de la laisser tourner en permanence, contrairement aux fournisseurs
 * payants du projet.
 *
 * Une fois le retard comblé, chaque passage ne trouve que les rencontres
 * jouées depuis le précédent — quelques secondes, le plus souvent rien.
 *
 * Réglages (variables d'environnement) :
 *   MATCH_STATS_AUTO_REFRESH          "false" pour désactiver
 *   MATCH_STATS_REFRESH_INTERVAL_MIN  période en minutes (défaut : 180)
 *   MATCH_STATS_REFRESH_DELAY_MIN     attente au démarrage (défaut : 2)
 *   MATCH_STATS_REFRESH_BATCH         matchs par passage (défaut : 300)
 * -----------------------------------------------------------------------
 */

import { refreshMatchStatsExclusive } from '../data/providers/espnMatchStatsRefresh.js';
import { env } from '../config/env.js';

let timer = null;

async function runOnce(reason) {
  try {
    const report = await refreshMatchStatsExclusive({
      limit: env.matchStatsRefresh.batchSize,
      concurrency: env.matchStatsRefresh.concurrency
    });
    if (report.skipped) {
      console.log(`[stats] rafraîchissement ${reason} reporté : ${report.skipped}.`);
      return;
    }
    if (report.considered === 0) return; // Rien à compléter : on reste silencieux.
    console.log(
      `[stats] rafraîchissement ${reason} : ${report.merged} match(s) complété(s), ` +
        `${report.playersMerged} ligne(s) joueur, ${report.unmatched} non apparié(s), ${report.failed} échec(s).`
    );
  } catch (error) {
    // Une panne réseau ou un changement chez ESPN ne doit pas faire tomber
    // l'API : le prochain passage réessaiera.
    console.error(`[stats] rafraîchissement ${reason} en échec : ${error.message}`);
  }
}

/** Démarre la boucle. Sans effet si elle tourne déjà ou si elle est désactivée. */
export function startMatchStatsAutoRefresh() {
  const { enabled, intervalMinutes, startupDelayMinutes } = env.matchStatsRefresh;
  if (!enabled || timer) return false;

  const intervalMs = intervalMinutes * 60_000;
  setTimeout(() => {
    runOnce('au démarrage');
    timer = setInterval(() => runOnce('périodique'), intervalMs);
    // Le minuteur ne doit pas retenir le processus à l'arrêt.
    timer.unref?.();
  }, startupDelayMinutes * 60_000).unref?.();

  console.log(`[stats] rafraîchissement automatique toutes les ${intervalMinutes} min (premier passage dans ${startupDelayMinutes} min).`);
  return true;
}

export function stopMatchStatsAutoRefresh() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
