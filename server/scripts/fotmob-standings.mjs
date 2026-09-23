#!/usr/bin/env node
/**
 * fotmob-standings.mjs
 * -----------------------------------------------------------------------
 * Relève les classements OFFICIELS chez FotMob et les garde dans le magasin
 * (table standings_official), compétition par compétition.
 *
 *   node scripts/fotmob-standings.mjs                 # saison en cours, 67 compétitions
 *   node scripts/fotmob-standings.mjs --all           # toutes les saisons présentes en magasin
 *   node scripts/fotmob-standings.mjs --league "EPL"  # une compétition
 *
 * Pourquoi relever plutôt que calculer : voir fotMobStandingsRefresh.js.
 * Le serveur fait la même passe (saison en cours) à chaque rafraîchissement
 * automatique ; cette commande sert à l'historique et au rattrapage.
 * -----------------------------------------------------------------------
 */

import { refreshOfficialStandings } from '../src/data/providers/fotMobStandingsRefresh.js';

const argv = process.argv.slice(2);
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const scope = argv.includes('--all') ? 'all' : 'current';

const debut = Date.now();
console.log(`Classements officiels FotMob — ${scope === 'all' ? 'toutes les saisons du magasin' : 'saison en cours'}${leagues.length ? ` (${leagues.join(', ')})` : ''}.`);

const report = await refreshOfficialStandings({
  leagues: leagues.length ? leagues : null,
  scope,
  onProgress: (info) => {
    if (info.phase === 'league') console.log(`  ${info.done}/${info.total} ${info.league}`);
  }
});

console.log(`\n${report.leagues} compétition(s), ${report.seasons} saison(s), ${report.tables} table(s) en ${Math.round((Date.now() - debut) / 1000)} s.`);
if (report.unavailable.length) console.log(`Sans table chez la source : ${report.unavailable.join(' ; ')}`);
if (report.failed.length) {
  console.error(`Échecs :\n  ${report.failed.join('\n  ')}`);
  process.exitCode = 1;
}
console.log(JSON.stringify(report));
