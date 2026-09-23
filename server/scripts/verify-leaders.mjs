#!/usr/bin/env node
/**
 * verify-leaders.mjs
 * -----------------------------------------------------------------------
 * Confronte les classements individuels calculés par le magasin — buteurs,
 * passeurs, clean sheets — à ceux que FotMob publie pour la même saison.
 *
 * FotMob expose ces listes par identifiant de SAISON (« tournamentId »),
 * lu dans `stats.seasonStatLinks` de la page de compétition, puis
 * `leagueseasondeepstats?id=<ligue>&season=<tournoi>&type=players&stat=<x>`.
 * Trois statistiques : goals, goal_assist, clean_sheet.
 *
 * L'écart se mesure sur le top 10 : joueurs communs, et différence de
 * valeur pour chacun. Un joueur de la source absent du magasin signale une
 * rencontre manquante ; une valeur plus basse chez nous, une feuille
 * incomplète ; plus haute, un doublon.
 *
 *   node scripts/verify-leaders.mjs                    # saison en cours, toutes compétitions
 *   node scripts/verify-leaders.mjs --league "EPL" --season 2024
 *
 * Résumé JSON sur stdout, détail sur stderr. Ne corrige rien.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { leagueLeaders, seasonsForLeague } from '../src/data/db/matchStatsRead.js';
import { FOTMOB_LEAGUE_IDS } from '../src/data/providers/fotMobLeagueIds.js';
import { fotmobSeasonBase, seasonLabel, seasonBounds } from '../src/data/providers/seasonWindows.js';
import { hasStandings } from '../src/data/providers/leagueCups.js';

const argv = process.argv.slice(2);
const flag = (nom, defaut) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : defaut; };
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const saisonVoulue = flag('--season', null);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const db = openDb();

const STATS = [['goals', 'scorers'], ['goal_assist', 'assists'], ['clean_sheet', 'cleanSheets']];
// Deux écarts que la source explique elle-même : un match ATTRIBUÉ sur tapis
// vert, où FotMob crédite un clean sheet aux deux gardiens alignés (Chili,
// Paraguay, Libertadores 2026) ; et le classement vénézuélien des clean
// sheets, qui ignore la Clausura alors que ses buteurs la comptent.
const matchsAttribues = db.prepare(`SELECT COUNT(*) n FROM matches WHERE league = ? AND date >= ? AND date < ? AND (home_id = ? OR away_id = ?) AND json_extract(meta, '$.awarded') = 1`);
const explication = (league, season, cle, ligne) => {
  if (cle !== 'cleanSheets') return null;
  if (league === 'Primera División - Venezuela') return 'source : la liste FotMob ignore la Clausura';
  const bornes = seasonBounds(league, season);
  if (ligne.teamId && matchsAttribues.get(league, bornes[0], bornes[1], ligne.teamId, ligne.teamId).n > 0) return 'match attribué : FotMob crédite les deux gardiens';
  return null;
};
const cibles = Object.entries(FOTMOB_LEAGUE_IDS).filter(([l]) => hasStandings(l) && (!leagues.length || leagues.includes(l)));
const resume = { leagues: 0, compared: 0, unavailable: [], failed: [], stats: { scorers: { common: 0, total: 0, exact: 0 }, assists: { common: 0, total: 0, exact: 0 }, cleanSheets: { common: 0, total: 0, exact: 0 } }, details: [] };

for (const [league, id] of cibles) {
  resume.leagues++;
  const season = saisonVoulue ? Number(saisonVoulue) : seasonsForLeague(league, { database: db })[0]?.season;
  if (!season) continue;
  try {
    const page = await get(`https://www.fotmob.com/api/data/leagues?id=${id}`);
    const base = fotmobSeasonBase(league, season);
    const lien = (page?.stats?.seasonStatLinks ?? []).find((l) => String(l.Name ?? '').startsWith(base));
    if (!lien?.TournamentId) { resume.unavailable.push(`${league} ${seasonLabel(league, season)}`); continue; }
    const local = leagueLeaders(league, { season, limit: 100000, database: db });
    const detail = { league, season: seasonLabel(league, season), tournamentId: lien.TournamentId, stats: {} };
    for (const [statSource, cle] of STATS) {
      const d = await get(`https://www.fotmob.com/api/data/leagueseasondeepstats?id=${id}&season=${lien.TournamentId}&type=players&stat=${statSource}`);
      // La liste ENTIÈRE de la source, par identifiant : le top 10 tronqué
      // comparait des ex æquo triés autrement (cent joueurs à 1 but en C1)
      // et signalait « absents » des joueurs bien présents au rang 46.
      const complet = (d?.statsData ?? []).map((p) => ({ id: `fotmob-${p.id}`, name: p.name, value: Number(p.statValue?.value ?? 0) }));
      const notres = new Map((local[cle] ?? []).map((p) => [p.playerId, p]));
      const ligne = (s) => { const n = notres.get(s.id); const l = { name: s.name, source: s.value, store: n ? n.value : null, ok: n ? n.value === s.value : false, teamId: n?.teamId ?? null }; if (!l.ok) l.explained = explication(league, season, cle, l); return l; };
      const lignes = complet.slice(0, 10).map(ligne);
      const tous = complet.map(ligne);
      const st = resume.stats[cle];
      st.total += lignes.length;
      st.common += lignes.filter((l) => l.store !== null).length;
      st.exact += lignes.filter((l) => l.ok).length;
      st.listTotal = (st.listTotal ?? 0) + tous.length;
      st.listExact = (st.listExact ?? 0) + tous.filter((l) => l.ok).length;
      st.listExplained = (st.listExplained ?? 0) + tous.filter((l) => !l.ok && l.explained).length;
      detail.stats[cle] = {
        top10: lignes,
        list: {
          total: tous.length,
          exact: tous.filter((l) => l.ok).length,
          absent: tous.filter((l) => l.store === null).map((l) => `${l.name} ${l.source}`),
          mismatches: tous.filter((l) => l.store !== null && !l.ok).map((l) => `${l.name} ${l.source}/${l.store}`)
        }
      };
      const ecarts = lignes.filter((l) => !l.ok);
      if (ecarts.length) console.error(`${league} ${detail.season} ${cle} : ${ecarts.map((l) => `${l.name} source ${l.source} / magasin ${l.store ?? 'absent'}${l.explained ? ` (${l.explained})` : ''}`).join(' ; ')}`);
      const horsTop = tous.slice(10).filter((l) => !l.ok);
      if (horsTop.length) console.error(`  … ${cle} : ${horsTop.length} écart(s) au-delà du top 10 sur ${tous.length} (${horsTop.slice(0, 6).map((l) => `${l.name} ${l.source}/${l.store ?? 'absent'}`).join(' ; ')})`);
    }
    resume.compared++;
    resume.details.push(detail);
  } catch (error) {
    resume.failed.push(`${league} : ${error.message}`);
  }
}

const { details, ...synthese } = resume;
console.error(`\n${synthese.compared}/${synthese.leagues} compétitions comparées. Top 10 — buteurs ${synthese.stats.scorers.exact}/${synthese.stats.scorers.total} exacts, passeurs ${synthese.stats.assists.exact}/${synthese.stats.assists.total}, clean sheets ${synthese.stats.cleanSheets.exact}/${synthese.stats.cleanSheets.total}. Listes entières — buteurs ${synthese.stats.scorers.listExact}/${synthese.stats.scorers.listTotal}, passeurs ${synthese.stats.assists.listExact}/${synthese.stats.assists.listTotal}, clean sheets ${synthese.stats.cleanSheets.listExact}/${synthese.stats.cleanSheets.listTotal} (dont ${synthese.stats.cleanSheets.listExplained ?? 0} écart(s) expliqué(s) par la source).`);
console.log(JSON.stringify({ ...synthese, details }));
