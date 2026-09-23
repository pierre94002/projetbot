/**
 * -----------------------------------------------------------------------
 * Classements officiels, relevés chez FotMob et gardés dans le magasin.
 * -----------------------------------------------------------------------
 * Le classement calculé sur les résultats (standingsFromStore) est exact
 * pour les points, faux pour tout ce que le règlement ajoute : pénalités
 * (Everton −8 en 2023-24), points divisés par deux à l'entrée des playoffs
 * belges, points conservés au tour final danois, conférences de la MLS,
 * zones argentines, départages par confrontation directe. FotMob publie la
 * table OFFICIELLE de chaque saison ; c'est elle qu'on montre, le calcul
 * restant le contrôle et le repli.
 *
 * Deux portées :
 *   - « current » : la saison en cours de chaque compétition — c'est la
 *     passe quotidienne, 67 appels ;
 *   - « all » : toutes les saisons dont le magasin a des rencontres.
 *
 * Les libellés de saison de FotMob varient — « 2025/2026 », « 2025 »,
 * « 2025 - Clausura », « 2025/2026 - Apertura » — et sont rapprochés par
 * leur DÉBUT de l'année de saison du magasin (cf. seasonWindows.js).
 */

import { fetchLeagueTables } from './fotMobProvider.js';
import { FOTMOB_LEAGUE_IDS } from './fotMobLeagueIds.js';
import { fotmobSeasonBase, seasonFromFotmobLabel } from './seasonWindows.js';
import { hasStandings } from './leagueCups.js';
import { upsertOfficialStandings } from '../db/matchStatsDb.js';
import { seasonsForLeague } from '../db/matchStatsRead.js';

async function pool(items, size, worker) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.max(1, size) }, async () => {
    while (index < items.length) await worker(items[index++]);
  }));
}

/** « 2025 - Clausura » -> « 2025 » ; « 2025/2026 - Apertura » -> « 2025/2026 ». */
const baseDe = (label) => String(label ?? '').split(' - ')[0].trim();
/** « 2025/2026 - Apertura » -> « Apertura » ; « 2025 » -> null. */
const phaseDe = (label) => {
  const morceaux = String(label ?? '').split(' - ');
  return morceaux.length > 1 ? morceaux.slice(1).join(' - ').trim() : null;
};

/**
 * Nom sous lequel une table est rangée. Quand FotMob rend une seule table
 * pour un libellé à phase (« 2025/2026 - Apertura » -> « Liga MX »), c'est
 * la phase qui la distingue de sa jumelle de Clausura ; sinon le nom que la
 * source donne à chaque table (« Eastern », « Clausura Playoff Grp. A »).
 */
function nomDeTable(label, table, nombre) {
  const phase = phaseDe(label);
  if (nombre === 1 && phase) return phase;
  return table.name || phase || 'Classement';
}

export async function refreshOfficialStandings({ leagues = null, scope = 'current', concurrency = 3, onProgress = null } = {}) {
  const cibles = Object.entries(FOTMOB_LEAGUE_IDS)
    .filter(([league]) => (!leagues || leagues.includes(league)) && hasStandings(league));
  const report = { scope, leagues: 0, seasons: 0, tables: 0, failed: [], unavailable: [] };
  let faites = 0;

  await pool(cibles, concurrency, async ([league, id]) => {
    try {
      const courant = await fetchLeagueTables(id);
      const labels = new Set();
      if (scope === 'all') {
        const voulues = new Set(seasonsForLeague(league).map((s) => fotmobSeasonBase(league, s.season)));
        for (const label of courant.seasons) if (voulues.has(baseDe(label))) labels.add(label);
      }
      // La saison en cours, avec ses phases sœurs (Apertura et Clausura de
      // la même année) : elles vivent sous des libellés distincts.
      if (courant.selectedSeason) {
        labels.add(courant.selectedSeason);
        for (const label of courant.seasons) if (baseDe(label) === baseDe(courant.selectedSeason)) labels.add(label);
      }

      let saisons = 0;
      for (const label of labels) {
        const donnees = label === courant.selectedSeason ? courant : await fetchLeagueTables(id, label);
        if (!donnees.tables.length) {
          report.unavailable.push(`${league} ${label}`);
          continue;
        }
        const season = seasonFromFotmobLabel(label);
        if (season === null) continue;
        const entrees = donnees.tables.map((table, ord) => ({
          league,
          season,
          tableName: nomDeTable(label, table, donnees.tables.length),
          ord,
          fotmobLeagueId: id,
          fotmobSeason: label,
          rows: table.rows
        }));
        upsertOfficialStandings(entrees);
        report.tables += entrees.length;
        saisons++;
      }
      report.seasons += saisons;
      report.leagues++;
    } catch (error) {
      report.failed.push(`${league} : ${error.message}`);
    }
    faites++;
    onProgress?.({ phase: 'league', done: faites, total: cibles.length, league });
  });

  return report;
}
