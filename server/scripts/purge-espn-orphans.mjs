#!/usr/bin/env node
/**
 * purge-espn-orphans.mjs
 * -----------------------------------------------------------------------
 * Retire les rencontres que SEUL ESPN a écrites et que FotMob connaît déjà
 * sous un autre nom.
 *
 * ESPN créait une rencontre sous ses propres noms de clubs — « Amed SFK »,
 * « Royal Charleroi SC » — là où FotMob l'avait déjà enregistrée sous les
 * siens — « Amed Sportif », « Sporting Charleroi ». Sans identifiant de
 * club, rien ne les rapprochait : deux lignes, un seul match, compté deux
 * fois. ESPN ne constitue plus de rencontres depuis le 2026-09-22 ; ceci
 * nettoie ce qu'il a laissé.
 *
 * Une rencontre ESPN sans jumelle FotMob est LAISSÉE : elle est peut-être
 * vraie et pas encore importée (ou hors de ce que FotMob publie). Elle est
 * listée pour qu'on le sache.
 *
 *   node scripts/purge-espn-orphans.mjs            (essai à blanc)
 *   node scripts/purge-espn-orphans.mjs --apply
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistries } from '../src/data/db/identityRegistry.js';
import { teamNamesLikelyMatch } from '../src/utils/teamNameMatch.js';

const APPLY = process.argv.includes('--apply');
const db = openDb();

const orphelines = db.prepare(`
  SELECT match_key, date, league, home_name, away_name, home_goals, away_goals
  FROM matches
  WHERE sources NOT LIKE '%fotmob.com/api/data/matchDetails%'
  ORDER BY date
`).all();
const voisines = db.prepare(`
  SELECT match_key, home_name, away_name, home_goals, away_goals
  FROM matches WHERE date = ? AND league = ? AND fotmob_id IS NOT NULL AND match_key <> ?
`);

console.log(`${orphelines.length} rencontre(s) sans source FotMob${APPLY ? '' : ' — essai à blanc, rien ne sera écrit'}.`);
let supprimees = 0;
const gardees = [];
for (const r of orphelines) {
  const candidates = voisines.all(r.date, r.league, r.match_key);
  let jumelles = candidates.filter((v) => teamNamesLikelyMatch(v.home_name, r.home_name) && teamNamesLikelyMatch(v.away_name, r.away_name));
  // Un seul des deux noms reconnu (« Royal Charleroi SC » contre « Sporting
  // Charleroi »), mais même jour, même compétition, même score et aucun
  // autre candidat : c'est la même rencontre.
  if (!jumelles.length) {
    jumelles = candidates.filter((v) =>
      (teamNamesLikelyMatch(v.home_name, r.home_name) || teamNamesLikelyMatch(v.away_name, r.away_name)) &&
      v.home_goals === r.home_goals && v.away_goals === r.away_goals);
  }
  if (jumelles.length === 1) {
    const j = jumelles[0];
    const scores = `${r.home_goals}-${r.away_goals}` === `${j.home_goals}-${j.away_goals}` ? 'même score' : `SCORES DIFFÉRENTS ${r.home_goals}-${r.away_goals} / ${j.home_goals}-${j.away_goals}`;
    console.log(`  ${r.match_key} -> doublon de ${j.match_key} (${scores}) : suppression`);
    if (APPLY) db.prepare('DELETE FROM matches WHERE match_key = ?').run(r.match_key);
    supprimees++;
  } else {
    gardees.push(r);
  }
}
console.log(`${supprimees} doublon(s) supprimé(s), ${gardees.length} rencontre(s) ESPN sans jumelle FotMob, laissées :`);
for (const r of gardees) console.log(`  ${r.date} ${r.league} ${r.home_name} - ${r.away_name} (${r.home_goals}-${r.away_goals})`);
if (APPLY && supprimees) console.log(`Annuaires reconstruits : ${JSON.stringify(rebuildRegistries())}`);
