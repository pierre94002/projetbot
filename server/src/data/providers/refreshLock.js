/**
 * -----------------------------------------------------------------------
 * Verrou de rafraîchissement, partagé par tout ce qui écrit dans le magasin.
 * -----------------------------------------------------------------------
 * Un seul import à la fois, quel que soit le processus : le serveur et la
 * ligne de commande peuvent tous deux lancer une passe, et deux passes
 * concurrentes se disputeraient la base et les fichiers JSON.
 *
 * Deux niveaux : `inFlight` retient la promesse en cours DANS ce processus,
 * le fichier de verrou la signale AUX AUTRES.
 *
 * LE BATTEMENT. Le détenteur réécrit l'heure du verrou toutes les minutes
 * tant qu'il travaille. Un verrou n'est tenu pour abandonné que si ce
 * battement s'est tu depuis plus de dix minutes (processus tué, veille,
 * coupure) ou si son processus n'existe plus. L'ancienne règle — abandonné
 * au bout de 60 min, même détenteur vivant — laissait une passe longue se
 * faire doubler par une seconde, d'où deux écrivains simultanés. Un verrou
 * de l'ANCIEN format (sans battement, posé par un serveur pas encore
 * relancé) garde l'ancienne règle : 60 minutes, ou processus mort.
 *
 * LE JETON. Chaque prise porte un jeton ; on ne libère, et on ne bat, que
 * le verrou dont on détient le jeton.
 *
 * LA CRÉATION est atomique AVEC son contenu : le verrou est écrit à part
 * puis lié sous son nom (échoue s'il existe déjà). Un fichier créé vide puis
 * rempli laissait un instant où un autre processus le lisait « illisible »,
 * donc abandonné, et le prenait.
 *
 * LA REPRISE d'un verrou abandonné passe par un renommage, puis une
 * vérification : si ce qu'on a écarté n'est pas le verrou jugé abandonné
 * (un autre processus l'a repris entre-temps), on le remet en place.
 *
 * LA MARQUE. En libérant, une commande qui a écrit (import en ligne de
 * commande) pose data/runtime/data-stamp.json, que l'empreinte de version
 * suit : l'interface ouverte se recharge. L'actualisation du serveur gère
 * sa propre marque (dataChangedAt) et n'en pose pas.
 *
 * Vivait dans espnMatchStatsRefresh.js, d'où le nom de fichier historique
 * du verrou ; il n'a rien d'ESPN.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic, removeFileWithRetry } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const LOCK_FILE = path.join(RUNTIME_DIR, 'espn-refresh.lock');
const STAMP_FILE = path.join(RUNTIME_DIR, 'data-stamp.json');

/** Battement : toutes les minutes. Abandon : dix minutes sans battement. */
const HEARTBEAT_MS = 60_000;
const STALE_MS = 10 * 60_000;
/** Ancien format, sans battement : l'ancienne règle. */
const STALE_OLD_FORMAT_MS = 60 * 60_000;
/** Un verrou illisible n'est tenu pour abandonné qu'après ce délai. */
const UNREADABLE_GRACE_MS = 60_000;

let inFlight = null;
let jeton = null;
let battement = null;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 ne fait rien : il ne sert qu'à tester l'existence du processus.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = le processus existe mais appartient à un autre utilisateur.
    return error.code === 'EPERM';
  }
}

/**
 * Contenu du verrou et date du fichier ; `data` null s'il est illisible.
 * `patient` relit pendant ~1,5 s un verrou illisible (cf. readJsonFile) :
 * en libérant, faute d'avoir pu relire NOTRE verrou pendant qu'OneDrive
 * l'envoyait (il change à chaque battement), on le laissait en place, et il
 * bloquait la passe suivante pendant dix minutes.
 */
function lireVerrou(fichier = LOCK_FILE, { patient = false } = {}) {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(fichier).mtimeMs;
  } catch {
    return null; // Pas de verrou.
  }
  try {
    if (!patient) return { data: JSON.parse(fs.readFileSync(fichier, 'utf8')), mtimeMs };
    const data = readJsonFile(fichier, null);
    return data === null ? null : { data, mtimeMs }; // null : disparu entre-temps.
  } catch {
    return { data: null, mtimeMs };
  }
}

/** Le verrou lu est-il abandonné ? */
function abandonne(lu) {
  if (!lu) return true;
  const { data, mtimeMs } = lu;
  // Illisible : en cours d'écriture chez son détenteur, ou abîmé. Abandonné
  // seulement s'il ne bouge plus depuis un moment.
  if (!data) return Date.now() - mtimeMs > UNREADABLE_GRACE_MS;
  if (!pidAlive(data.pid)) return true;
  if (data.heartbeatAt) {
    const dernier = Date.parse(data.heartbeatAt);
    return !Number.isFinite(dernier) || Date.now() - dernier > STALE_MS;
  }
  const debut = Date.parse(data.startedAt ?? '');
  return !Number.isFinite(debut) || Date.now() - debut > STALE_OLD_FORMAT_MS;
}

const memeVerrou = (a, b) => Boolean(a && b) && a.pid === b.pid && a.token === b.token && a.startedAt === b.startedAt;

/**
 * Supprime un fichier de travail du verrou (brouillon, verrou écarté). S'il
 * est tenu — OneDrive envoie chaque fichier qui apparaît dans data/runtime —
 * il reste là, sans conséquence : son nom est unique, git et l'empreinte de
 * version l'ignorent. Une exception ici faisait échouer une prise de verrou
 * pourtant réussie, et le verrou posé restait sans battement, donc
 * bloquant, pendant dix minutes.
 */
function oublier(fichier) {
  try {
    fs.rmSync(fichier, { force: true });
  } catch {
    // Laissé en place, cf. ci-dessus.
  }
}

/** Crée le verrou d'un bloc, contenu compris ; false s'il existe déjà. */
function creer(contenu) {
  const brouillon = `${LOCK_FILE}.${process.pid}.${crypto.randomUUID()}.new`;
  fs.writeFileSync(brouillon, JSON.stringify(contenu));
  try {
    fs.linkSync(brouillon, LOCK_FILE); // EEXIST s'il existe : atomique.
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    // Liens physiques refusés par le système de fichiers : création
    // exclusive classique, contenu écrit dans le même appel.
    try {
      fs.writeFileSync(LOCK_FILE, JSON.stringify(contenu), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  } finally {
    oublier(brouillon);
  }
}

function acquireLock() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const existant = lireVerrou();
  if (existant) {
    if (!abandonne(existant)) return false;
    // Écarté par renommage : un seul processus y parvient...
    const ecarte = `${LOCK_FILE}.${process.pid}.${Date.now()}.abandonne`;
    try {
      fs.renameSync(LOCK_FILE, ecarte);
    } catch {
      return false; // Un autre l'a écarté avant nous.
    }
    // ...mais ce qu'on a écarté est-il bien le verrou jugé abandonné ? Si un
    // autre processus l'a remplacé par le sien entre notre lecture et le
    // renommage, on le lui rend (lien : seulement si la place est libre).
    const pris = lireVerrou(ecarte);
    if (existant.data && !memeVerrou(pris?.data, existant.data)) {
      try {
        fs.linkSync(ecarte, LOCK_FILE);
      } catch {
        // La place a déjà été reprise : le verrou écarté est perdu pour son
        // détenteur, qui le verra au prochain battement.
      }
      oublier(ecarte);
      return false;
    }
    oublier(ecarte);
  }
  const monJeton = crypto.randomUUID();
  const maintenant = new Date().toISOString();
  if (!creer({ pid: process.pid, token: monJeton, startedAt: maintenant, heartbeatAt: maintenant })) return false;
  jeton = monJeton;
  battement = setInterval(battre, HEARTBEAT_MS);
  battement.unref?.();
  return true;
}

/** Réécrit l'heure du verrou, s'il est toujours le nôtre. */
function battre() {
  const lu = lireVerrou();
  if (!lu?.data || lu.data.token !== jeton) return;
  try {
    const tmp = `${LOCK_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...lu.data, heartbeatAt: new Date().toISOString() }));
    fs.renameSync(tmp, LOCK_FILE);
  } catch {
    // Un battement manqué n'est pas grave : il en faut dix pour perdre le verrou.
  }
}

function releaseLock({ stamp }) {
  clearInterval(battement);
  battement = null;
  const lu = lireVerrou(LOCK_FILE, { patient: true });
  // On ne retire que NOTRE verrou.
  if (lu?.data && lu.data.token === jeton) {
    try {
      // Réessayé : OneDrive envoie le verrou à chaque battement, et un verrou
      // resté en place bloquait tout import pendant dix minutes.
      removeFileWithRetry(LOCK_FILE);
    } catch {
      // Le prochain passage le verra sans battement, donc abandonné.
    }
  }
  jeton = null;
  if (stamp) {
    try {
      writeJsonAtomic(STAMP_FILE, { at: new Date().toISOString(), pid: process.pid }, { indent: 0 });
    } catch {
      // Sans marque, l'interface se rechargera à la passe suivante.
    }
  }
}

/**
 * Exécute `task` sous le verrou. Si une passe est déjà en cours dans ce
 * processus, rend SA promesse ; si un autre processus tient le verrou, rend
 * un rapport « reporté » sans rien faire — plutôt que d'aller écraser ses
 * écritures.
 *
 * @param {() => Promise<any>} task
 * @param {{ stamp?: boolean }} options  `stamp: false` : ne pas poser la
 *   marque de données en libérant (l'actualisation du serveur pose la sienne)
 */
export function withRefreshLock(task, { stamp = true } = {}) {
  if (inFlight) return inFlight;
  if (!acquireLock()) {
    return Promise.resolve({ skipped: 'verrou détenu par un autre processus', considered: 0, merged: 0, playersMerged: 0, unmatched: 0, failed: 0 });
  }
  inFlight = Promise.resolve()
    .then(task)
    .finally(() => {
      releaseLock({ stamp });
      inFlight = null;
    });
  return inFlight;
}

/** Une passe tourne-t-elle, dans ce processus ou dans un autre ? */
export function isRefreshRunning() {
  if (inFlight !== null) return true;
  const lu = lireVerrou();
  return Boolean(lu) && !abandonne(lu);
}

/** Qui tient le verrou (pid, depuis quand), ou null. */
export function lockHolder() {
  const lu = lireVerrou();
  if (!lu || abandonne(lu) || !lu.data) return null;
  return { pid: lu.data.pid, startedAt: lu.data.startedAt, heartbeatAt: lu.data.heartbeatAt ?? null, self: lu.data.pid === process.pid };
}
