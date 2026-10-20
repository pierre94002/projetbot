/**
 * Un AUTRE ÉCRIVAIN qui tient le verrou d'écriture de la base — ce n'est PAS un
 * fichier de test. Lancé par test/aides/script-verrou.mjs, dans une copie de
 * travail, avec la garde des essais (réseau coupé, base de la copie) :
 *   node --import garde.mjs script-verrou-tenu.mjs [tenirAuPlusMs]
 *
 * Ouvre la base de la copie (MATCH_STATS_DB), prend le verrou d'écriture
 * (BEGIN IMMEDIATE), écrit une ligne témoin, écrit « {"tenu":true} » sur stdout,
 * puis garde le verrou jusqu'à recevoir « rendre » sur son entrée standard (ou
 * jusqu'à `tenirAuPlusMs`, 60 s par défaut : un essai ne reste jamais bloqué) ;
 * alors COMMIT, « {"rendu":true} », et il s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';

const tenirAuPlusMs = Number(process.argv[2]) || 60_000;
const db = new DatabaseSync(process.env.MATCH_STATS_DB);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('BEGIN IMMEDIATE');
db.exec('CREATE TABLE IF NOT EXISTS essai_verrou (quoi TEXT)');
db.prepare('INSERT INTO essai_verrou (quoi) VALUES (?)').run('écrit par l’autre écrivain');
console.log(JSON.stringify({ tenu: true }));

let rendu = false;
function rendre(raison) {
  if (rendu) return;
  rendu = true;
  db.exec('COMMIT');
  db.close();
  console.log(JSON.stringify({ rendu: true, raison }));
  process.exit(0);
}
const minuterie = setTimeout(() => rendre('délai'), tenirAuPlusMs);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (texte) => {
  if (/rendre/.test(texte)) {
    clearTimeout(minuterie);
    rendre('demandé');
  }
});
process.stdin.on('end', () => {
  clearTimeout(minuterie);
  rendre('entrée fermée');
});
