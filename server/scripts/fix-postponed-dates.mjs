#!/usr/bin/env node
/**
 * fix-postponed-dates.mjs
 * -----------------------------------------------------------------------
 * Remet à leur vraie date les rencontres reportées ou interrompues puis
 * rejouées, enregistrées sous la date PRÉVUE.
 *
 * Le symptôme : la date de la clé et la date du coup d'envoi (`meta.kickoff`,
 * relevée chez FotMob) diffèrent de plusieurs jours. Le magasin en comptait
 * vingt ; dix avaient en plus une jumelle à la bonne date, importée depuis,
 * si bien que la rencontre comptait DEUX FOIS au classement — parfois avec
 * deux scores, Fiorentina - Inter valant 0-0 en décembre et 3-0 en février.
 *
 * Deux cas :
 *   - une jumelle existe à la date du coup d'envoi (même identifiant
 *     FotMob) : la ligne périmée est supprimée, ses joueurs et relevés avec ;
 *   - pas de jumelle : la ligne est RE-CLÉE — clé, date, et les clés de ses
 *     lignes joueurs et relevés — sans rien perdre.
 *
 * Un écart d'un jour n'est pas un report : c'est un coup d'envoi tardif en
 * UTC (23 h 15 à Buenos Aires). Le seuil est à deux jours.
 *
 *   node scripts/fix-postponed-dates.mjs            (essai à blanc)
 *   node scripts/fix-postponed-dates.mjs --apply
 * -----------------------------------------------------------------------
 */

import { openDb, backupTo, resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistries } from '../src/data/db/identityRegistry.js';
import { slug } from '../src/utils/nameIdentity.js';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const db = openDb();

const suspects = db.prepare(`
  SELECT match_key, date, league, home_name, away_name, home_goals, away_goals, fotmob_id,
         substr(json_extract(meta, '$.kickoff'), 1, 10) AS kickoff
  FROM matches
  WHERE json_extract(meta, '$.kickoff') IS NOT NULL
    AND ABS(julianday(substr(json_extract(meta, '$.kickoff'), 1, 10)) - julianday(date)) >= 2
  ORDER BY date
`).all();

console.log(`${suspects.length} rencontre(s) enregistrée(s) à deux jours ou plus de leur coup d'envoi${APPLY ? '' : ' — essai à blanc, rien ne sera écrit'}.`);
if (!suspects.length) process.exit(0);

if (APPLY) {
  const sauvegarde = path.join(path.dirname(resolveDbPath()), 'sauvegardes', `avant-dates-${new Date().toISOString().slice(0, 10)}.db`);
  const { bytes } = backupTo(sauvegarde);
  console.log(`Sauvegarde : ${sauvegarde} (${Math.round(bytes / 1e6)} Mo)`);
}

const jumelle = db.prepare('SELECT match_key, home_goals, away_goals FROM matches WHERE fotmob_id = ? AND match_key <> ? AND date = ?');
const existe = db.prepare('SELECT match_key, home_id, away_id, home_goals, away_goals FROM matches WHERE match_key = ?');
const idsDe = db.prepare('SELECT home_id, away_id FROM matches WHERE match_key = ?');

let supprimees = 0;
let recleees = 0;

// Les clés étrangères doivent être levées le temps de renommer une clé
// primaire : les lignes enfants la référencent encore pendant l'opération.
// Hors transaction, impérativement — SQLite ignore le PRAGMA sinon.
if (APPLY) db.exec('PRAGMA foreign_keys = OFF;');
try {
  for (const r of suspects) {
    const twin = r.fotmob_id ? jumelle.get(r.fotmob_id, r.match_key, r.kickoff) : null;
    if (twin) {
      console.log(`  ${r.match_key} (${r.home_goals}-${r.away_goals}) -> doublon de ${twin.match_key} (${twin.home_goals}-${twin.away_goals}) : suppression`);
      if (APPLY) db.prepare('DELETE FROM matches WHERE match_key = ?').run(r.match_key);
      supprimees++;
      continue;
    }
    const nouvelleCle = `${r.kickoff}-${slug(r.home_name)}-${slug(r.away_name)}`;
    const dejaLa = existe.get(nouvelleCle);
    if (dejaLa) {
      // Même date de coup d'envoi, mêmes deux clubs, mais un AUTRE
      // identifiant FotMob : la source a recréé la rencontre en la
      // reprogrammant. C'est bien le même match ; la ligne périmée s'efface.
      const ids = idsDe.get(r.match_key);
      const memesClubs = ids?.home_id && ids.home_id === dejaLa.home_id && ids.away_id === dejaLa.away_id;
      if (memesClubs) {
        console.log(`  ${r.match_key} (${r.home_goals}-${r.away_goals}) -> même rencontre que ${nouvelleCle} (${dejaLa.home_goals}-${dejaLa.away_goals}), autre identifiant : suppression`);
        if (APPLY) db.prepare('DELETE FROM matches WHERE match_key = ?').run(r.match_key);
        supprimees++;
      } else {
        console.log(`  ${r.match_key} -> ${nouvelleCle} existe déjà avec d'autres clubs : laissée telle quelle, à examiner`);
      }
      continue;
    }
    console.log(`  ${r.match_key} -> ${nouvelleCle} (${r.league})`);
    if (APPLY) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE matches SET match_key = ?, date = ? WHERE match_key = ?').run(nouvelleCle, r.kickoff, r.match_key);
        db.prepare('UPDATE players SET match_key = ? WHERE match_key = ?').run(nouvelleCle, r.match_key);
        db.prepare('UPDATE team_stats SET match_key = ? WHERE match_key = ?').run(nouvelleCle, r.match_key);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
        throw error;
      }
    }
    recleees++;
  }
} finally {
  if (APPLY) db.exec('PRAGMA foreign_keys = ON;');
}

console.log(`${supprimees} doublon(s) supprimé(s), ${recleees} rencontre(s) re-clée(s).`);
if (APPLY && (supprimees || recleees)) {
  const orphelins = db.prepare('SELECT COUNT(*) n FROM players p WHERE NOT EXISTS (SELECT 1 FROM matches m WHERE m.match_key = p.match_key)').get().n;
  console.log(`Contrôle : ${orphelins} ligne(s) joueur orpheline(s) (attendu 0).`);
  const bilan = rebuildRegistries();
  console.log(`Annuaires reconstruits : ${JSON.stringify(bilan)}`);
}
