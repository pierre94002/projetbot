/**
 * -----------------------------------------------------------------------
 * Pose les identifiants FotMob sur les rencontres déjà en magasin.
 * -----------------------------------------------------------------------
 * Le magasin a été construit avant que les identifiants ne soient conservés :
 * 19 508 rencontres n'y sont désignées que par le nom des deux clubs. Ce
 * script les identifie sans rien redemander de coûteux.
 *
 * COMMENT. Un seul appel par DATE — `matches?date=AAAAMMJJ` renvoie toutes
 * les rencontres du jour, tous championnats confondus, avec l'identifiant de
 * la rencontre et celui des deux clubs. 909 appels couvrent donc les 19 508
 * rencontres, là où l'endpoint de détail en aurait demandé 19 508.
 *
 * LE RAPPROCHEMENT, lui, se fait forcément par le nom : c'est la seule chose
 * que les deux côtés partagent avant que ce script ne passe. C'est le DERNIER
 * endroit du projet où un nom sert d'identité, et il est borné à une seule
 * journée, ce qui rend l'homonymie très improbable. Le nom est comparé sur
 * son slug, puis, à défaut, par rapprochement flou — et toute journée qui
 * laisse des rencontres non appariées est signalée, jamais devinée.
 *
 *   node server/scripts/backfill-identities.mjs [--from AAAA-MM-JJ]
 *                                               [--to AAAA-MM-JJ] [--dry-run]
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistries, registryCoverage } from '../src/data/db/identityRegistry.js';
import { fetchMatchesByDate } from '../src/data/providers/fotMobProvider.js';
import { slug } from '../src/utils/nameIdentity.js';
import { teamNamesLikelyMatch } from '../src/utils/teamNameMatch.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = args.includes('--dry-run');
const FROM = flag('--from');
const TO = flag('--to');

const db = openDb();

const dates = db.prepare(`
  SELECT DISTINCT date FROM matches
  WHERE (home_id IS NULL OR away_id IS NULL)
    AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
  ORDER BY date
`).all(FROM, FROM, TO, TO).map((r) => r.date);

console.log(`${dates.length} journée(s) à identifier${DRY ? ' (essai à blanc)' : ''}.`);

const majMatch = db.prepare('UPDATE matches SET home_id = ?, away_id = ?, fotmob_id = ? WHERE match_key = ?');

let apparies = 0;
let orphelins = 0;
let echecs = 0;
const nonApparies = [];

for (const [index, date] of dates.entries()) {
  let jour;
  try {
    jour = await fetchMatchesByDate(date);
  } catch (error) {
    echecs++;
    console.warn(`  ${date} : ${error.message}`);
    continue;
  }

  const enMagasin = db.prepare(
    'SELECT match_key, home_name, away_name, league FROM matches WHERE date = ? AND (home_id IS NULL OR away_id IS NULL)'
  ).all(date);

  // Index par couple de slugs : le cas courant, et le seul qui ne demande
  // aucun jugement. Le rapprochement flou ne sert qu'au reliquat.
  const parSlug = new Map();
  for (const m of jour) {
    if (!m.homeId || !m.awayId) continue;
    parSlug.set(`${slug(m.homeName)}|${slug(m.awayName)}`, m);
  }

  const lot = [];
  for (const row of enMagasin) {
    let trouve = parSlug.get(`${slug(row.home_name)}|${slug(row.away_name)}`);
    if (!trouve) {
      trouve = jour.find((m) => m.homeId && m.awayId
        && teamNamesLikelyMatch(m.homeName, row.home_name)
        && teamNamesLikelyMatch(m.awayName, row.away_name));
    }
    if (!trouve) {
      orphelins++;
      if (nonApparies.length < 40) nonApparies.push(`${date} ${row.league} : ${row.home_name} - ${row.away_name}`);
      continue;
    }
    lot.push([trouve.homeId, trouve.awayId, trouve.matchId, row.match_key]);
  }

  if (lot.length && !DRY) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const valeurs of lot) majMatch.run(...valeurs);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
      throw error;
    }
  }
  apparies += lot.length;

  if ((index + 1) % 25 === 0 || index === dates.length - 1) {
    console.log(`  ${index + 1}/${dates.length} journées — ${apparies} rencontres identifiées, ${orphelins} sans correspondance, ${echecs} journées en échec`);
  }
}

if (nonApparies.length) {
  console.log('\nRencontres sans correspondance (échantillon) :');
  for (const ligne of nonApparies) console.log('  ' + ligne);
}

if (!DRY) {
  console.log('\nReconstruction des annuaires…');
  const debut = Date.now();
  console.log(rebuildRegistries({ database: db }), `en ${Date.now() - debut} ms`);
}

console.log('\nCouverture :');
console.log(registryCoverage({ database: db }));
