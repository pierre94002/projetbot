/**
 * fotMobFixtureGaps.js
 * -----------------------------------------------------------------------
 * Ce que la LISTE DU JOUR de FotMob a omis.
 *
 * Le magasin se constitue par la liste du jour (`matches?date=`), un appel
 * par journée pour toutes les compétitions. Or cette liste omet parfois des
 * rencontres entières, sans rien signaler : aucune rencontre de Bolivie,
 * d'Équateur ni du Paraguay les 18, 19 et 20 juillet 2025 (trois journées,
 * dix-neuf matchs), aucune rencontre brésilienne les 13 et 14 mars 2026,
 * huit rencontres de la Canadian Premier League 2025. Les tables
 * officielles, elles, les comptaient : 29 matchs joués en magasin contre 30.
 *
 * La page de chaque compétition (`leagues?id=&season=`) publie son
 * calendrier COMPLET, `fixtures.allMatches`. Ce module confronte ce
 * calendrier aux identifiants du magasin, saison par saison depuis 2023, et
 * importe les rencontres jouées qui manquent — par identifiant, donc sans
 * repasser par la liste qui les avait omises (cf. importFotmobIds).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { fetchLeagueFixtures } from './fotMobProvider.js';
import { FOTMOB_LEAGUE_IDS } from './fotMobLeagueIds.js';
import { importFotmobIds } from './fotMobRefresh.js';
import { seasonFromFotmobLabel, currentSeason } from './seasonWindows.js';

/** Première saison tenue par le magasin (le carnet de santé la lit aussi). */
export const PREMIERE_SAISON = 2023;

async function pool(items, size, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Les rencontres jouées que la page de la compétition connaît et que le
 * magasin ignore. `scope: 'current'` ne regarde que la saison en cours (la
 * passe automatique) ; `'all'` remonte à 2023.
 *
 * `premiereSaison` (étape 12 du plan, carnet de santé) : remonter plus loin.
 * Le magasin commence le 04/01/2023 (championnats d'année civile), mais ses
 * championnats européens commencent à la saison 2023/2024 : le carnet lit
 * aussi les pages 2022/2023 pour COMPTER ce qui manque avant (hors du
 * périmètre du magasin, jamais une anomalie). Ce module ne fait que lire
 * FotMob et le magasin ; l'import est dans fillFixtureGaps.
 */
export async function findFixtureGaps({ leagues = null, scope = 'all', concurrency = 4, premiereSaison = PREMIERE_SAISON, database = openDb() } = {}) {
  const connus = new Set(
    database.prepare('SELECT fotmob_id FROM matches WHERE fotmob_id IS NOT NULL').all().map((r) => String(r.fotmob_id))
  );
  const cibles = Object.entries(FOTMOB_LEAGUE_IDS).filter(([league]) => !leagues || leagues.includes(league));
  const report = { leagues: 0, seasons: 0, played: 0, missing: [], failed: [] };
  await pool(cibles, concurrency, async ([league, id]) => {
    report.leagues++;
    try {
      const page = await fetchLeagueFixtures(id);
      const actuelle = currentSeason(league);
      const libelles = page.seasons.filter((s) => {
        const an = seasonFromFotmobLabel(s);
        return an !== null && an >= premiereSaison && an <= actuelle && (scope !== 'current' || an === actuelle);
      });
      for (const libelle of libelles) {
        const calendrier = libelle === page.selectedSeason ? page : await fetchLeagueFixtures(id, libelle);
        report.seasons++;
        for (const m of calendrier.fixtures) {
          if (!m.played) continue;
          report.played++;
          if (connus.has(m.matchId)) continue;
          // La même rencontre peut figurer sous deux libellés (Apertura et
          // Clausura d'une même année) : une seule fois.
          connus.add(m.matchId);
          report.missing.push({ league, season: libelle, ...m });
        }
      }
    } catch (error) {
      report.failed.push(`${league} : ${error.message}`);
    }
  });
  report.missing.sort((a, b) => a.league.localeCompare(b.league) || String(a.date).localeCompare(String(b.date)));
  return report;
}

/** Trouve les manques et les importe, compétition par compétition. */
export async function fillFixtureGaps(options = {}) {
  const gaps = await findFixtureGaps(options);
  const parLigue = new Map();
  for (const m of gaps.missing) {
    if (!parLigue.has(m.league)) parLigue.set(m.league, []);
    parLigue.get(m.league).push(m.matchId);
  }
  const imports = {};
  for (const [league, ids] of parLigue) {
    imports[league] = await importFotmobIds([...new Set(ids)], { league, concurrency: options.concurrency ?? 4 });
  }
  return { ...gaps, imports };
}
