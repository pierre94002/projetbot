#!/usr/bin/env node
/**
 * fotmob-season-calendar.mjs
 * -----------------------------------------------------------------------
 * Construit le calendrier des compétitions suivies à partir de FotMob, et le
 * fusionne dans server/data/runtime/season-calendar.json.
 *
 * POURQUOI. Le calendrier venait d'ESPN — c'est encore ce que dit le champ
 * `source` des entrées en place. Or les données doivent venir de FotMob, et
 * ESPN ne publie pas tous les championnats suivis : un championnat qu'il
 * ignore n'avait ni matchs à venir dans la page Matchs, ni journée en cours.
 *
 * Ce que ce script apporte en plus de l'import de statistiques : les matchs
 * À VENIR, que `import-fotmob-stats.mjs` laisse de côté puisqu'il ne retient
 * que les rencontres terminées.
 *
 *   node server/scripts/fotmob-season-calendar.mjs --days 45
 *   node server/scripts/fotmob-season-calendar.mjs --league "Ekstraklasa - Poland" --days 60
 *   node server/scripts/fotmob-season-calendar.mjs --from 2026-09-01 --to 2026-12-31
 *
 * Un seul appel par journée couvre TOUTES les compétitions : restreindre
 * avec --league ne fait pas gagner d'appels, seulement du tri.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { FOTMOB_LEAGUES, leagueKeyMatches, fetchMatchesByDate } from '../src/data/providers/fotMobProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../data/runtime');
const CALENDRIER = path.join(RUNTIME_DIR, 'season-calendar.json');

const argv = process.argv.slice(2);
const flag = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 ? argv[i + 1] : null;
};
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const DRY = argv.includes('--dry-run');
const jours = Number(flag('--days') ?? 45);

const jour = (d) => d.toISOString().slice(0, 10);
const from = flag('--from') ?? jour(new Date(Date.now() - 7 * 86400000));
const to = flag('--to') ?? jour(new Date(Date.now() + jours * 86400000));

const voulus = leagues.length
  ? Object.entries(FOTMOB_LEAGUES).filter(([nom]) => leagues.includes(nom))
  : Object.entries(FOTMOB_LEAGUES);
if (!voulus.length) {
  console.error(`Aucune compétition connue parmi : ${leagues.join(', ')}`);
  process.exit(1);
}

const dates = [];
for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
  dates.push(jour(d));
}

console.log(`${voulus.length} compétition(s), ${dates.length} journée(s) du ${from} au ${to}.`);

const sorties = [];
let echecs = 0;
for (const [index, date] of dates.entries()) {
  let rencontres;
  try {
    rencontres = await fetchMatchesByDate(date);
  } catch (error) {
    echecs++;
    console.warn(`  ${date} : ${error.message}`);
    continue;
  }
  for (const m of rencontres) {
    const league = voulus.find(([, motif]) => leagueKeyMatches(motif, m.leagueKey))?.[0];
    if (!league || !m.homeName || !m.awayName) continue;
    sorties.push({
      date: m.date,
      league,
      homeName: m.homeName,
      awayName: m.awayName,
      // « terminé » se lit sur le drapeau de la source, pas sur la présence
      // d'un score : un match arrêté ou en cours en affiche un aussi.
      status: m.finished ? 'finished' : 'scheduled',
      homeGoals: m.finished ? m.homeGoals : null,
      awayGoals: m.finished ? m.awayGoals : null,
      round: null,
      source: 'fotmob'
    });
  }
  if ((index + 1) % 25 === 0 || index === dates.length - 1) {
    console.log(`  ${index + 1}/${dates.length} journées — ${sorties.length} rencontre(s)`);
  }
}

const parLigue = {};
for (const s of sorties) parLigue[s.league] = (parLigue[s.league] ?? 0) + 1;
console.log('\nRelevé :');
for (const [l, n] of Object.entries(parLigue).sort((a, b) => b[1] - a[1])) {
  const avenir = sorties.filter((s) => s.league === l && s.status === 'scheduled').length;
  console.log(`  ${l.padEnd(32)} ${String(n).padStart(4)} dont ${String(avenir).padStart(3)} à venir`);
}
if (echecs) console.log(`${echecs} journée(s) en échec.`);

if (DRY || !sorties.length) {
  console.log(DRY ? '\nEssai à blanc : rien écrit.' : '\nRien à fusionner.');
  process.exit(0);
}

// Le tampon est supprimé QUOI QU'IL ARRIVE. Sans ce `finally`, un échec de
// fusion le laissait sur le disque, où il ressemble à une donnée du projet :
// 20 253 lignes de calendrier dupliqué sont ainsi parties dans un commit.
const tampon = path.join(RUNTIME_DIR, 'calendrier-fotmob.json');
try {
  fs.writeFileSync(tampon, JSON.stringify(sorties, null, 2));
  console.log(`\nFusion dans ${CALENDRIER}…`);
  console.log(execFileSync('node', [path.join(__dirname, 'merge-season-calendar.mjs'), CALENDRIER, tampon], { encoding: 'utf8' }));
} finally {
  fs.rmSync(tampon, { force: true });
}

/**
 * Les rencontres terminées vont AUSSI dans match-results.json.
 *
 * Ce fichier-là est celui que lit le règlement des pronostics et des paris
 * (settle-pending-outcomes.mjs). Le calendrier seul ne suffit donc pas : un
 * pari resterait en attente indéfiniment sur un match dont le score est
 * pourtant connu. `merge-daily-results.mjs` refuse de remplacer un score
 * déjà enregistré par un autre, ce qui rend l'opération rejouable.
 */
const termines = sorties.filter((s) => s.status === 'finished' && s.homeGoals !== null && s.awayGoals !== null);
if (termines.length) {
  const RESULTATS = path.join(RUNTIME_DIR, 'match-results.json');
  const tamponR = path.join(RUNTIME_DIR, 'resultats-fotmob.json');
  try {
    fs.writeFileSync(tamponR, JSON.stringify(termines, null, 2));
    console.log(`Fusion de ${termines.length} résultat(s) dans ${RESULTATS}…`);
    console.log(execFileSync('node', [path.join(__dirname, 'merge-daily-results.mjs'), RESULTATS, tamponR], { encoding: 'utf8' }));
  } catch (error) {
    // Un score divergent fait sortir le script en erreur : c'est un signal,
    // pas une panne. Le calendrier, lui, est déjà écrit.
    console.warn(`Résultats non fusionnés intégralement : ${error.stdout ?? ''}${error.stderr ?? error.message}`);
  } finally {
    fs.rmSync(tamponR, { force: true });
  }
}
