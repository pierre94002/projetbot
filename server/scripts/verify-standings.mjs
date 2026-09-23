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
 *   - des points différents à matchs égaux, non expliqués par une pénalité :
 *     un score faux, ou une règle du championnat (points divisés, conservés)
 *     que le calcul ne connaît pas — ce qui est précisément pourquoi la
 *     table officielle est celle qu'on affiche.
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
import { seasonLabel } from '../src/data/providers/seasonWindows.js';

const argv = process.argv.slice(2);
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const db = openDb();

const cibles = Object.keys(FOTMOB_LEAGUES).filter((l) => hasStandings(l) && (!leagues.length || leagues.includes(l)));
const resume = { leagues: 0, seasons: 0, withOfficial: 0, tables: 0, teamsOnlyOfficial: 0, teamsOnlyComputed: 0, playedMismatch: 0, pointsMismatch: 0, exact: 0, details: [] };

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
    // Supporters' Shield répète les conférences. Le nombre de matchs joués
    // est donc tenu pour exact s'il vaut l'une des trois lectures : les
    // seules tables régulières, la somme de toutes (sans les doublons), ou
    // le maximum d'une table. Les points ne se comparent que sur la table
    // régulière unique, où ils sont sans ambiguïté.
    const nonDoublon = officiel.tables.filter((t) => !/shield|annual|overall|aggregate/i.test(t.name));
    const regulieres = nonDoublon.filter((t) => !/playoff|final stage|championship group|relegation group/i.test(t.name));
    const tablesDeBase = regulieres.length ? regulieres : nonDoublon;
    const cumuler = (tables) => {
      const cumul = new Map();
      for (const t of tables) {
        for (const r of t.rows) {
          const c = cumul.get(r.teamId) ?? { teamName: r.teamName, played: 0, max: 0, points: 0, deduction: 0, won: 0, drawn: 0, goalsFor: 0, goalsAgainst: 0 };
          c.played += r.played; c.max = Math.max(c.max, r.played); c.points += r.points; c.deduction += r.deduction ?? 0; c.won += r.won; c.drawn += r.drawn;
          c.goalsFor += r.goalsFor; c.goalsAgainst += r.goalsAgainst;
          cumul.set(r.teamId, c);
        }
      }
      return cumul;
    };
    const base = cumuler(tablesDeBase);
    const toutes = cumuler(nonDoublon);
    resume.tables += nonDoublon.length;

    const detail = { league, season: seasonLabel(league, season), tables: nonDoublon.map((t) => t.name), onlyOfficial: [], onlyComputed: [], played: [], points: [] };
    for (const [teamId, o] of toutes) {
      const c = parId.get(teamId);
      // Un club de la table à zéro match (phase de ligue non commencée) n'est
      // pas un club que le magasin ignore.
      if (!c) { if (o.played > 0) detail.onlyOfficial.push(`${o.teamName} (${o.played} J)`); continue; }
      const b = base.get(teamId);
      const lectures = new Set([b?.played, o.played, o.max].filter((n) => Number.isFinite(n)));
      if (!lectures.has(c.played)) detail.played.push(`${o.teamName} : officiel ${[...lectures].join('/')} J, magasin ${c.played} J`);
      // Points bruts attendus : V×3 + N, sur ce que le magasin a vu. Comparés
      // aux points officiels corrigés de la pénalité déclarée, sur la seule
      // table régulière, quand elle est unique.
      if (tablesDeBase.length === 1 && b && c.played === b.played) {
        // FotMob écrit la pénalité tantôt négative (Everton, -8), tantôt
        // positive (Ironi Tiberias, 6) : seule sa valeur absolue compte.
        const attendus = b.points + Math.abs(b.deduction);
        const bruts = c.won * 3 + c.drawn;
        if (attendus !== bruts) detail.points.push(`${o.teamName} : officiel ${b.points}${b.deduction ? ` (pénalité ${b.deduction})` : ''}, calculé ${c.points}, buts ${b.goalsFor}-${b.goalsAgainst} vs ${c.goalsFor}-${c.goalsAgainst}`);
      }
    }
    for (const [teamId, c] of parId) if (!toutes.has(teamId)) detail.onlyComputed.push(`${c.teamName} (${c.played} J)`);

    resume.teamsOnlyOfficial += detail.onlyOfficial.length;
    resume.teamsOnlyComputed += detail.onlyComputed.length;
    resume.playedMismatch += detail.played.length;
    resume.pointsMismatch += detail.points.length;
    const propre = !detail.onlyOfficial.length && !detail.onlyComputed.length && !detail.played.length && !detail.points.length;
    if (propre) resume.exact++;
    else {
      resume.details.push(detail);
      console.error(`\n${league} ${detail.season} [${detail.tables.join(' + ')}]`);
      if (detail.onlyOfficial.length) console.error(`  seulement officiel : ${detail.onlyOfficial.join(' ; ')}`);
      if (detail.onlyComputed.length) console.error(`  seulement magasin  : ${detail.onlyComputed.join(' ; ')}`);
      for (const p of detail.played) console.error(`  J : ${p}`);
      for (const p of detail.points) console.error(`  pts : ${p}`);
    }
  }
}

const { details, ...synthese } = resume;
console.error(`\n${synthese.seasons} saison(s) sur ${synthese.leagues} compétition(s) ; ${synthese.withOfficial} avec table officielle ; ${synthese.exact} concordent exactement.`);
console.log(JSON.stringify({ ...synthese, details }));
