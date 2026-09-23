/**
 * matchStatsAutoRefresh.js
 * -----------------------------------------------------------------------
 * Tient le magasin à jour sans qu'on ait à le demander — et depuis FotMob
 * uniquement.
 *
 * À intervalle régulier, le serveur enchaîne sous UN seul verrou :
 *   1. le calendrier (matchs joués et à venir, 45 jours d'horizon), qui
 *      alimente aussi match-results.json, lu par le règlement des paris ;
 *   2. les classements OFFICIELS de la saison en cours ;
 *   3. les rencontres terminées des dix derniers jours que le magasin ne
 *      connaît pas encore — c'est ce qui fait entrer les nouvelles journées ;
 *   3 bis. celles que la liste du jour a OMISES, relevées sur la page de
 *      chaque compétition (saison en cours) ;
 *   4. les rencontres déjà connues dont la feuille manque encore.
 *
 * ESPN constituait les rencontres et FotMob les complétait. Ce n'est plus le
 * cas : la règle est qu'hors cotes, tout vienne de FotMob, et ESPN créait
 * des doublons dès qu'il écrivait un nom autrement que FotMob (« Amed SFK »
 * contre « Amed Sportif »). La source étant gratuite et sans clé, cette
 * boucle ne consomme aucun quota.
 *
 * Réglages (variables d'environnement) :
 *   MATCH_STATS_AUTO_REFRESH          "false" pour désactiver
 *   MATCH_STATS_REFRESH_INTERVAL_MIN  période en minutes (défaut : 180)
 *   MATCH_STATS_REFRESH_DELAY_MIN     attente au démarrage (défaut : 2)
 *   MATCH_STATS_REFRESH_BATCH         matchs par passage (défaut : 300)
 * -----------------------------------------------------------------------
 */

import { withRefreshLock } from '../data/providers/refreshLock.js';
import { refreshFromFotMob, importMissingFromFotMob } from '../data/providers/fotMobRefresh.js';
import { refreshCalendarFromFotMob } from '../data/providers/fotMobCalendar.js';
import { fillFixtureGaps } from '../data/providers/fotMobFixtureGaps.js';
import { refreshOfficialStandings } from '../data/providers/fotMobStandingsRefresh.js';
import { env } from '../config/env.js';

/** Dix jours en arrière : une feuille non encore publiée hier le sera demain. */
const FENETRE_JOURS = 10;

let timer = null;

const jour = (d) => d.toISOString().slice(0, 10);

async function runOnce(reason) {
  const { batchSize, concurrency } = env.matchStatsRefresh;
  try {
    const report = await withRefreshLock(async () => {
      const aujourdhui = jour(new Date());
      const depuis = jour(new Date(Date.now() - FENETRE_JOURS * 86_400_000));
      const calendar = await refreshCalendarFromFotMob({ concurrency }).catch((e) => ({ error: e.message }));
      const standings = await refreshOfficialStandings({ concurrency }).catch((e) => ({ error: e.message }));
      const created = await importMissingFromFotMob({ from: depuis, to: aujourdhui, concurrency }).catch((e) => ({ error: e.message }));
      const gaps = await fillFixtureGaps({ scope: 'current', concurrency }).catch((e) => ({ error: e.message }));
      const completed = await refreshFromFotMob({ limit: batchSize, concurrency });
      return { calendar, standings, created, gaps, completed };
    });

    if (report.skipped) {
      console.log(`[stats] rafraîchissement ${reason} reporté : ${report.skipped}.`);
      return;
    }
    const { calendar, standings, created, gaps, completed } = report;
    const changedCalendar = Boolean(calendar?.merge?.created || calendar?.merge?.updated || calendar?.error);
    const rien = !changedCalendar && !created?.merged && !created?.error && !gaps?.missing?.length && !gaps?.error && completed.considered === 0 && !standings?.error;
    if (rien) return; // Rien n'a bougé.
    console.log(
      `[stats] rafraîchissement ${reason} — calendrier : ` +
        `${calendar?.merge ? `${calendar.merge.created ?? 0} créé(s), ${calendar.merge.updated ?? 0} mis à jour, ${calendar.merge.conflicts ?? 0} conflit(s)` : (calendar?.error ?? 'inchangé')}` +
        ` | classements officiels : ${standings?.error ?? `${standings?.leagues ?? 0} compétition(s), ${standings?.tables ?? 0} table(s)${standings?.failed?.length ? `, ${standings.failed.length} en échec` : ''}`}` +
        ` | nouvelles rencontres : ${created?.error ?? `${created?.merged ?? 0} (${created?.noStats ?? 0} sans feuille, ${created?.failed ?? 0} échec(s))`}` +
        ` | omissions de la liste du jour : ${gaps?.error ?? `${gaps?.missing?.length ?? 0} importée(s)`}` +
        ` | feuilles complétées : ${completed.merged} (${completed.unmatched} non apparié(s), ${completed.failed} échec(s)).`
    );
  } catch (error) {
    // Une panne réseau ou un changement chez la source ne doit pas faire
    // tomber l'API : le prochain passage réessaiera.
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

  console.log(`[stats] rafraîchissement automatique FotMob toutes les ${intervalMinutes} min (premier passage dans ${startupDelayMinutes} min).`);
  return true;
}

/** Une passe tout de suite, sous le verrou : ce qu'appelle la route HTTP. */
export function refreshNow() {
  return runOnce('manuel');
}

export function stopMatchStatsAutoRefresh() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
