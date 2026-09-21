/**
 * -----------------------------------------------------------------------
 * Fusionne les rencontres enregistrées deux fois sous des noms différents.
 * -----------------------------------------------------------------------
 * Tant que les rencontres n'étaient désignées que par le nom des deux clubs,
 * une même rencontre publiée par deux sources qui n'écrivent pas pareil
 * entrait DEUX FOIS dans le magasin — « Feyenoord - FC Utrecht » et
 * « Feyenoord Rotterdam - FC Utrecht », clé de match différente, même match.
 * Rien ne permettait de le voir ; les identifiants, eux, le montrent d'un
 * coup : même date, même identifiant à domicile, même identifiant à
 * l'extérieur.
 *
 * Ce que cela faussait : tout. Chaque doublon comptait deux fois dans la
 * forme récente, dans les moyennes d'équipe et dans le total de matchs des
 * classements joueurs.
 *
 * LA FUSION passe par upsertMatches(), qui complète sans jamais remplacer un
 * chiffre par une absence : le survivant reçoit donc tout ce que l'autre
 * avait en plus, et rien n'est perdu avant la suppression.
 *
 *   node server/scripts/merge-duplicate-matches.mjs            (essai a blanc)
 *   node server/scripts/merge-duplicate-matches.mjs --apply    (applique)
 */

import { openDb, upsertMatches, backupTo, resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { loadEntry } from '../src/data/db/matchStatsRead.js';
import { rebuildRegistries } from '../src/data/db/identityRegistry.js';

const APPLY = process.argv.includes('--apply');
const db = openDb();

const groupes = db.prepare(`
  SELECT date, home_id, away_id, COUNT(*) AS n, GROUP_CONCAT(match_key, '|') AS cles
  FROM matches
  WHERE home_id IS NOT NULL AND away_id IS NOT NULL
  GROUP BY date, home_id, away_id
  HAVING n > 1
  ORDER BY date DESC
`).all();

console.log(`${groupes.length} rencontre(s) en double${APPLY ? '' : ' — essai à blanc, rien ne sera écrit'}.`);
if (!groupes.length) process.exit(0);

// Le survivant est celui qui porte le plus de lignes joueur, puis le plus de
// sources : c'est l'entrée la plus complète, donc celle qui a le plus de
// chances d'être déjà référencée ailleurs.
const poids = db.prepare(`
  SELECT (SELECT COUNT(*) FROM players WHERE match_key = ?) AS joueurs,
         (SELECT COUNT(*) FROM team_stats WHERE match_key = ?) AS equipes,
         (SELECT LENGTH(sources) FROM matches WHERE match_key = ?) AS sources
`);

let fusionnees = 0;
let lignesRecuperees = 0;
const exemples = [];

for (const g of groupes) {
  const cles = g.cles.split('|');
  const classees = cles
    .map((cle) => ({ cle, ...poids.get(cle, cle, cle) }))
    .sort((a, b) => b.joueurs - a.joueurs || b.equipes - a.equipes || (b.sources ?? 0) - (a.sources ?? 0) || a.cle.localeCompare(b.cle));

  const gagnant = classees[0];
  const perdants = classees.slice(1);
  if (exemples.length < 10) {
    exemples.push(`${g.date} : garde ${gagnant.cle} (${gagnant.joueurs} j.) — absorbe ${perdants.map((p) => `${p.cle} (${p.joueurs} j.)`).join(', ')}`);
  }

  if (!APPLY) {
    fusionnees++;
    lignesRecuperees += perdants.reduce((s, p) => s + p.joueurs, 0);
    continue;
  }

  const cible = db.prepare('SELECT home_name, away_name, league FROM matches WHERE match_key = ?').get(gagnant.cle);
  for (const perdant of perdants) {
    const entree = loadEntry(perdant.cle, { database: db });
    if (!entree) continue;
    // Réécrit sous l'identité du survivant : c'est sa clé, donc son nom, qui
    // fait foi — sans quoi upsertMatches recréerait la ligne qu'on supprime.
    upsertMatches([{
      ...entree,
      matchKey: gagnant.cle,
      homeName: cible.home_name,
      awayName: cible.away_name,
      league: cible.league
    }], { database: db });
    lignesRecuperees += perdant.joueurs;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const supprime = db.prepare(`DELETE FROM matches WHERE match_key IN (${perdants.map(() => '?').join(',')})`);
    supprime.run(...perdants.map((p) => p.cle));
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
  fusionnees++;
}

console.log('\nExemples :');
for (const e of exemples) console.log('  ' + e);

console.log(`\n${fusionnees} rencontre(s) ${APPLY ? 'fusionnées' : 'à fusionner'}, ${lignesRecuperees} ligne(s) joueur ${APPLY ? 'reversées' : 'concernées'}.`);

if (APPLY) {
  console.log('\nReconstruction des annuaires…');
  console.log(rebuildRegistries({ database: db }));
  const reste = db.prepare(`SELECT COUNT(*) n FROM (SELECT date FROM matches WHERE home_id IS NOT NULL AND away_id IS NOT NULL GROUP BY date, home_id, away_id HAVING COUNT(*) > 1)`).get().n;
  console.log('doublons restants :', reste);
} else {
  console.log(`\nPour appliquer : sauvegardez d'abord (${resolveDbPath()}), puis relancez avec --apply.`);
  void backupTo;
}
