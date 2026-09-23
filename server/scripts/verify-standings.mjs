#!/usr/bin/env node
/**
 * verify-standings.mjs
 * -----------------------------------------------------------------------
 * Confronte, compétition par compétition et saison par saison, le classement
 * OFFICIEL relevé chez FotMob au classement CALCULÉ sur les rencontres du
 * magasin. Ce que l'écart révèle :
 *
 *   - une équipe présente d'un côté seulement : un club mal identifié, ou
 *     une phase entière absente du magasin ;
 *   - un nombre de matchs joués différent : des rencontres manquent (ou
 *     sont en double) dans le magasin ;
 *   - un bilan différent à matchs égaux (victoires, nuls, défaites, buts) :
 *     un score faux, ou un résultat décidé hors du terrain (match attribué,
 *     annulé) que la source ne publie pas comme la fédération l'applique —
 *     ce qui est précisément pourquoi la table officielle est celle qu'on
 *     affiche.
 *
 * Le bilan se compare en victoires, nuls, défaites, buts pour et contre —
 * jamais en points : les pénalités et les points divisés par deux à
 * l'entrée des playoffs ne sont pas des erreurs de résultat. Une première
 * version ne comparait les points que sur les saisons à table unique et
 * jamais les buts : 84 saisons à plusieurs tables (Apertura/Clausura,
 * conférences, groupes) passaient sans contrôle du bilan, et deux scores
 * brésiliens faux sont restés invisibles.
 *
 * Ne corrige rien. Le résumé JSON part sur stdout, le détail sur stderr.
 *
 *   node scripts/verify-standings.mjs
 *   node scripts/verify-standings.mjs --league "EPL"
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { standingsFromStore, officialStandings, seasonsForLeague } from '../src/data/db/matchStatsRead.js';
import { hasStandings } from '../src/data/providers/leagueCups.js';
import { FOTMOB_LEAGUES } from '../src/data/providers/fotMobProvider.js';
import { seasonLabel, seasonBounds } from '../src/data/providers/seasonWindows.js';

const argv = process.argv.slice(2);
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const db = openDb();

const cibles = Object.keys(FOTMOB_LEAGUES).filter((l) => hasStandings(l) && (!leagues.length || leagues.includes(l)));
const resume = { leagues: 0, seasons: 0, withOfficial: 0, tables: 0, teamsOnlyOfficial: 0, teamsOnlyComputed: 0, playedMismatch: 0, recordMismatch: 0, awardedExplained: 0, exact: 0, exactOrExplained: 0, details: [] };

// Un match ATTRIBUÉ sur tapis vert n'est pas toujours appliqué par la
// fédération comme FotMob l'écrit en en-tête (Mannucci - Municipal 0-0
// « awarded_win », Bastia - Red Star 0-3 sans buts dans la table) : un
// bilan qui diverge pour un club ayant un tel match dans la saison est un
// écart de la source, pas du magasin.
const matchsAttribues = db.prepare(`SELECT COUNT(*) n FROM matches WHERE league = ? AND date >= ? AND date < ? AND (home_id = ? OR away_id = ?) AND json_extract(meta, '$.awarded') = 1`);

const CHAMPS = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst'];
const vide = (teamName) => ({ teamName, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
const bilan = (r) => `${r.played} J ${r.won}V ${r.drawn}N ${r.lost}D ${r.goalsFor}-${r.goalsAgainst}`;
const memeBilan = (a, b) => CHAMPS.every((c) => (a[c] ?? 0) === (b[c] ?? 0));

for (const league of cibles) {
  resume.leagues++;
  for (const { season } of seasonsForLeague(league, { database: db })) {
    resume.seasons++;
    const officiel = officialStandings(league, { season, database: db });
    const calcule = standingsFromStore(league, { season, database: db });
    if (!officiel) {
      console.error(`${league} ${seasonLabel(league, season)} : pas de table officielle relevée`);
      continue;
    }
    resume.withOfficial++;
    const parId = new Map((calcule?.rows ?? []).map((r) => [r.teamId, r]));

    // Une compétition à plusieurs tables ne se compare pas table par table
    // au calcul, qui cumule toutes les phases. Les formats diffèrent : en
    // Colombie, Apertura, Clausura et groupes de playoffs sont DISJOINTS et
    // s'additionnent ; au Danemark, la table du tour final REPREND les
    // matchs de la phase régulière, et c'est son total qui vaut ; en MLS, le
    // Supporters' Shield répète les conférences. Le bilan est donc tenu pour
    // exact s'il vaut l'une des trois lectures : les seules tables
    // régulières, la somme de toutes (sans les doublons), ou la table où le
    // club a le plus de matchs.
    const nonDoublon = officiel.tables.filter((t) => !/shield|annual|overall|aggregate/i.test(t.name));
    const regulieres = nonDoublon.filter((t) => !/playoff|final stage|championship group|relegation group/i.test(t.name));
    const tablesDeBase = regulieres.length ? regulieres : nonDoublon;
    const cumuler = (tables) => {
      const cumul = new Map();
      for (const t of tables) {
        for (const r of t.rows) {
          const c = cumul.get(r.teamId) ?? vide(r.teamName);
          for (const champ of CHAMPS) c[champ] += r[champ] ?? 0;
          cumul.set(r.teamId, c);
        }
      }
      return cumul;
    };
    const base = cumuler(tablesDeBase);
    const toutes = cumuler(nonDoublon);
    const maxTable = new Map();
    for (const t of nonDoublon) {
      for (const r of t.rows) {
        const connu = maxTable.get(r.teamId);
        if (!connu || (r.played ?? 0) > connu.played) maxTable.set(r.teamId, { ...vide(r.teamName), ...Object.fromEntries(CHAMPS.map((c) => [c, r[c] ?? 0])) });
      }
    }
    resume.tables += nonDoublon.length;

    const detail = { league, season: seasonLabel(league, season), tables: nonDoublon.map((t) => t.name), onlyOfficial: [], onlyComputed: [], played: [], record: [], awarded: [] };
    const bornes = seasonBounds(league, season);
    for (const [teamId, o] of toutes) {
      const c = parId.get(teamId);
      // Un club de la table à zéro match (phase de ligue non commencée) n'est
      // pas un club que le magasin ignore.
      if (!c) { if (o.played > 0) detail.onlyOfficial.push(`${o.teamName} (${o.played} J)`); continue; }
      const lectures = [base.get(teamId), toutes.get(teamId), maxTable.get(teamId)].filter(Boolean);
      const memesJ = lectures.filter((l) => l.played === c.played);
      if (!memesJ.length) {
        detail.played.push(`${o.teamName} : officiel ${[...new Set(lectures.map((l) => l.played))].join('/')} J, magasin ${c.played} J`);
      } else if (!memesJ.some((l) => memeBilan(l, c))) {
        const ligne = `${o.teamName} : officiel ${[...new Set(memesJ.map(bilan))].join(' | ')}, magasin ${bilan(c)}`;
        if (matchsAttribues.get(league, bornes[0], bornes[1], teamId, teamId).n > 0) detail.awarded.push(ligne);
        else detail.record.push(ligne);
      }
    }
    for (const [teamId, c] of parId) if (!toutes.has(teamId)) detail.onlyComputed.push(`${c.teamName} (${c.played} J)`);

    resume.teamsOnlyOfficial += detail.onlyOfficial.length;
    resume.teamsOnlyComputed += detail.onlyComputed.length;
    resume.playedMismatch += detail.played.length;
    resume.recordMismatch += detail.record.length;
    resume.awardedExplained += detail.awarded.length;
    const propre = !detail.onlyOfficial.length && !detail.onlyComputed.length && !detail.played.length && !detail.record.length;
    if (propre) resume.exactOrExplained++;
    if (propre && !detail.awarded.length) resume.exact++;
    if (!propre || detail.awarded.length) {
      resume.details.push(detail);
      console.error(`\n${league} ${detail.season} [${detail.tables.join(' + ')}]${propre ? ' — écart expliqué par un résultat attribué' : ''}`);
      if (detail.onlyOfficial.length) console.error(`  seulement officiel : ${detail.onlyOfficial.join(' ; ')}`);
      if (detail.onlyComputed.length) console.error(`  seulement magasin  : ${detail.onlyComputed.join(' ; ')}`);
      for (const p of detail.played) console.error(`  J : ${p}`);
      for (const p of detail.record) console.error(`  bilan : ${p}`);
      for (const p of detail.awarded) console.error(`  attribué : ${p}`);
    }
  }
}

const { details, ...synthese } = resume;
console.error(`\n${synthese.seasons} saison(s) sur ${synthese.leagues} compétition(s) ; ${synthese.withOfficial} avec table officielle ; ${synthese.exact} concordent exactement (clubs, matchs joués, victoires, nuls, défaites, buts), ${synthese.exactOrExplained - synthese.exact} de plus à un résultat attribué près (${synthese.awardedExplained} club(s)).`);
console.log(JSON.stringify({ ...synthese, details }));
