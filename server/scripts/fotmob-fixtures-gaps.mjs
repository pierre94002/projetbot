#!/usr/bin/env node
/**
 * fotmob-fixtures-gaps.mjs
 * -----------------------------------------------------------------------
 * Rencontres que la liste du jour de FotMob a OMISES et que la page de la
 * compétition connaît (cf. src/data/providers/fotMobFixtureGaps.js).
 *
 *   node scripts/fotmob-fixtures-gaps.mjs                  # état des lieux, depuis 2023
 *   node scripts/fotmob-fixtures-gaps.mjs --apply           # importe les manquantes
 *   node scripts/fotmob-fixtures-gaps.mjs --current         # saison en cours seulement
 *   node scripts/fotmob-fixtures-gaps.mjs --league "EPL" --league "MLS"
 *
 * Résumé JSON sur stdout, détail sur stderr. Sans --apply, ne modifie rien.
 * -----------------------------------------------------------------------
 */

import { findFixtureGaps, fillFixtureGaps } from '../src/data/providers/fotMobFixtureGaps.js';
import { withRefreshLock } from '../src/data/providers/refreshLock.js';

const argv = process.argv.slice(2);
const flag = (nom, defaut) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : defaut; };
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const apply = argv.includes('--apply');
const options = {
  leagues: leagues.length ? leagues : null,
  scope: argv.includes('--current') ? 'current' : 'all',
  concurrency: Number(flag('--concurrency', 4))
};

const run = async () => {
  const report = apply ? await fillFixtureGaps(options) : await findFixtureGaps(options);
  const parSaison = new Map();
  for (const m of report.missing) {
    const cle = `${m.league} ${m.season}`;
    parSaison.set(cle, (parSaison.get(cle) ?? 0) + 1);
  }
  for (const [cle, n] of [...parSaison].sort((a, b) => b[1] - a[1])) console.error(`${cle} : ${n} manquante(s)`);
  for (const m of report.missing.slice(0, 40)) {
    console.error(`  ${m.league} | ${m.date} ${m.homeName} - ${m.awayName} ${m.homeGoals}-${m.awayGoals} (${m.matchId}, tour ${m.round ?? '?'}${m.awarded ? ', attribué' : ''})`);
  }
  if (report.missing.length > 40) console.error(`  … et ${report.missing.length - 40} autres.`);
  for (const f of report.failed) console.error(`échec : ${f}`);
  if (report.imports) {
    for (const [league, r] of Object.entries(report.imports)) {
      console.error(`import ${league} : ${r.merged} entrée(s) (${r.fetched} avec feuille, ${r.noStats} sans, ${r.notFinished} non terminée(s), ${r.failed} échec(s))`);
    }
  }
  console.error(`\n${report.leagues} compétition(s), ${report.seasons} saison(s), ${report.played} rencontres jouées chez la source, ${report.missing.length} absente(s) du magasin.`);
  console.log(JSON.stringify({ ...report, missing: report.missing.length, sample: report.missing.slice(0, 100) }));
};

if (apply) {
  const result = await withRefreshLock(run);
  if (result?.skipped) {
    console.error(`Import reporté : ${result.skipped}`);
    process.exit(2);
  }
} else {
  await run();
}
