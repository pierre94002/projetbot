/**
 * Étape 46 du plan, lot 1 — mineur du 13/11/2026 soir (vérification « sûreté », constat 6 ; sa méthode :
 * SCR46/verif/surete/note-absente/compare-note.mjs). Les réponses des TROIS routes du direct (tableau, détail, en cours)
 * d'une COPIE, appelées comme par le contrôleur : sans la clé `note` (la note par défaut, chargée par import() :
 * noteDuDirect.js présent à null, ou retiré de la copie) et sans `chiffresABlanc`.
 *   node --import garde.mjs script-note-absente.mjs <serveur de la copie>      (lancé par O12, directBanc.test.mjs, avec executer())
 * Le code lu est celui de la COPIE ; les aides fabriquées viennent du bac (CM_TEST_MODULES). Données FABRIQUÉES : base en
 * mémoire, état de minute et lignes fabriqués ; aucune base réelle, aucun réseau, rien d'écrit.
 * Sortie : une ligne JSON { noteDuFichier, tableau, details, enCours }, sans les durées mesurées (`ms`, `blocMaxMs`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const serveur = process.argv[2];
const L = await import(pathToFileURL(path.join(serveur, 'src', 'data', 'direct', 'lectureDuDirect.js')).href);
const F = await import(pathToFileURL(path.join(process.env.CM_TEST_MODULES, 'test', 'aides', 'directFabrique.mjs')).href);

const MIN = 60_000;
const T = Date.parse('2026-11-14T20:34:40.000Z');
const iso = (t) => new Date(t).toISOString();
const lbl = (m) => `${m}${String.fromCharCode(0x2019)}`;
function suivi(id, homeId, awayId, minute, h, a) {
  const kickoff = iso(T - (minute > 45 ? minute + 15 : minute) * MIN);
  const liste = F.listeEnJeu({ id, homeId, awayId, kickoff, label: lbl(minute), maxTime: minute > 45 ? 90 : 45, h, a, rh: 0, ra: 0, halfTime: false });
  return F.matchSuivi({ id, homeId, awayId, kickoff, rang: 3, memoire: true, lectures: [{ t: T - 20_000, liste }] });
}

const db = F.baseDuDirect();
const matchs = [suivi(5101, 'fotmob-1201', 'fotmob-1202', 34, 1, 0), suivi(5102, 'fotmob-1203', 'fotmob-1204', 80, 0, 1), suivi(5103, 'fotmob-1205', 'fotmob-1206', 12, 0, 0)];
const em = F.etatMinute({ maintenant: T, matchs });
// Comme le contrôleur : aucune option `chiffresABlanc` (les sources des essais la portent : elle est retirée).
const { chiffresABlanc, ...sources } = F.sourcesActives(em);
const ligneDe = (q) => F.ligneFabriquee({ ...q });
const tableau = await L.tableauDuDirect({ maintenant: T, database: db, ...sources, ligneDe });
const details = {};
for (const id of ['5101', '5102', '5103']) details[id] = await L.matchDuDirect({ maintenant: T, database: db, ...sources, ligneDe, id });
const enCours = await L.enCoursDuDirect({ maintenant: T, database: db, ...sources });
const noteDuFichier = fs.existsSync(path.join(serveur, 'src', 'data', 'direct', 'noteDuDirect.js')) ? 'presente' : 'absente';
process.stdout.write(`${JSON.stringify({ noteDuFichier, tableau, details, enCours }, (k, v) => (k === 'ms' || k === 'blocMaxMs' ? undefined : v))}\n`);
