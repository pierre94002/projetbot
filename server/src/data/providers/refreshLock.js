/**
 * -----------------------------------------------------------------------
 * Verrou de rafraîchissement, partagé par tout ce qui écrit dans le magasin.
 * -----------------------------------------------------------------------
 * Un seul import à la fois, quel que soit le processus : le serveur, la
 * tâche planifiée et la ligne de commande peuvent tous lancer une passe, et
 * deux passes concurrentes se disputeraient la base.
 *
 * Deux niveaux : `inFlight` retient la promesse en cours DANS ce processus,
 * le fichier de verrou la signale AUX AUTRES. Le fichier porte le pid de son
 * détenteur, ce qui permet d'abandonner un verrou dont le processus n'existe
 * plus — un serveur arrêté au milieu d'une passe laisserait sinon le verrou
 * en place une heure durant, pour rien.
 *
 * Vivait dans espnMatchStatsRefresh.js, d'où le nom de fichier historique
 * du verrou ; il n'a rien d'ESPN.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const LOCK_FILE = path.join(RUNTIME_DIR, 'espn-refresh.lock');

/** Au-delà, un verrou est tenu pour abandonné (processus tué, coupure). */
const LOCK_STALE_MINUTES = 60;

let inFlight = null;

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
 * Prise de verrou atomique (`wx` : création exclusive). Un verrou plus vieux
 * que LOCK_STALE_MINUTES, ou dont le détenteur n'existe plus, est écarté.
 */
function acquireLock() {
  try {
    const previous = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const ageMinutes = (Date.now() - new Date(previous.startedAt).getTime()) / 60_000;
    if (ageMinutes < LOCK_STALE_MINUTES && pidAlive(previous.pid)) return false;
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    // Pas de verrou, ou verrou illisible : on tente de le prendre.
  }
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
    return true;
  } catch {
    return false; // Un autre processus l'a pris entre-temps.
  }
}

function releaseLock() {
  try {
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    // Rien à faire : le prochain passage le traitera comme périmé.
  }
}

/**
 * Exécute `task` sous le verrou. Si une passe est déjà en cours dans ce
 * processus, rend SA promesse ; si un autre processus tient le verrou, rend
 * un rapport « reporté » sans rien faire — plutôt que d'aller écraser ses
 * écritures.
 */
export function withRefreshLock(task) {
  if (inFlight) return inFlight;
  if (!acquireLock()) {
    return Promise.resolve({ skipped: 'verrou détenu par un autre processus', considered: 0, merged: 0, playersMerged: 0, unmatched: 0, failed: 0 });
  }
  inFlight = Promise.resolve()
    .then(task)
    .finally(() => {
      releaseLock();
      inFlight = null;
    });
  return inFlight;
}

export function isRefreshRunning() {
  return inFlight !== null;
}
