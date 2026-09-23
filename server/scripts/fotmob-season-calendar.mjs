#!/usr/bin/env node
/**
 * fotmob-season-calendar.mjs
 * -----------------------------------------------------------------------
 * Construit le calendrier des compétitions suivies à partir de FotMob, et le
 * fusionne dans server/data/runtime/season-calendar.json — et les rencontres
 * terminées dans match-results.json, lu par le règlement des paris.
 *
 * Ce que ce script apporte en plus de l'import de statistiques : les matchs
 * À VENIR, que `import-fotmob-stats.mjs` laisse de côté puisqu'il ne retient
 * que les rencontres terminées.
 *
 *   node server/scripts/fotmob-season-calendar.mjs --days 45
 *   node server/scripts/fotmob-season-calendar.mjs --league "Ekstraklasa - Poland" --days 60
 *   node server/scripts/fotmob-season-calendar.mjs --from 2026-09-01 --to 2026-12-31
 *   node server/scripts/fotmob-season-calendar.mjs --dry-run
 *
 * Un seul appel par journée couvre TOUTES les compétitions : restreindre
 * avec --league ne fait pas gagner d'appels, seulement du tri. Le travail
 * lui-même vit dans src/data/providers/fotMobCalendar.js, que le serveur
 * appelle aussi à chaque rafraîchissement automatique.
 */

import { refreshCalendarFromFotMob } from '../src/data/providers/fotMobCalendar.js';

const argv = process.argv.slice(2);
const flag = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 ? argv[i + 1] : null;
};
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);

const report = await refreshCalendarFromFotMob({
  from: flag('--from'),
  to: flag('--to'),
  days: Number(flag('--days') ?? 45),
  leagues: leagues.length ? leagues : null,
  dryRun: argv.includes('--dry-run'),
  onProgress: (info) => {
    if (info.phase === 'scanning') console.log(`  ${info.done}/${info.total} journées — ${info.found} rencontre(s)`);
  }
});

console.log(`${report.days} journée(s) du ${report.from} au ${report.to} : ${report.matches} rencontre(s), dont ${report.upcoming} à venir.`);
console.log('\nRelevé :');
for (const [l, n] of Object.entries(report.byLeague).sort((a, b) => b[1].matches - a[1].matches)) {
  console.log(`  ${l.padEnd(32)} ${String(n.matches).padStart(4)} dont ${String(n.upcoming).padStart(3)} à venir`);
}
if (report.failures) console.log(`${report.failures} journée(s) en échec.`);
if (report.merge) console.log(`\nCalendrier : ${JSON.stringify(report.merge)}`);
if (report.results) console.log(`Résultats : ${JSON.stringify(report.results)}`);
if (report.resultsError) console.warn(`Résultats non fusionnés intégralement : ${report.resultsError}`);
if (!report.merge && !argv.includes('--dry-run')) console.log('\nRien à fusionner.');
if (argv.includes('--dry-run')) console.log('\nEssai à blanc : rien écrit.');
