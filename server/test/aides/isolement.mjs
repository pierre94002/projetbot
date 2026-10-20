/**
 * Copie de travail ISOLÉE pour les tests qui ouvrent une base ou lisent
 * data/runtime — ce n'est PAS un fichier de test.
 *
 * Pourquoi une copie : les dépôts de l'appli (match-results.json,
 * predictions.json, bets.json, engine-config.json, tilt-state.json…) lisent
 * des chemins FIXES, relatifs au code. Lancé depuis le dépôt, le moteur
 * mélangerait donc les scores saisis par Pierre à ses moyennes, et le
 * règlement écrirait dans ses paris. Ici, le dossier `src` est recopié dans
 * un dossier temporaire, avec un data/runtime à lui (vide, ou rempli de
 * fausses données du test) et SA copie de la base d'essai. Le code tourne
 * dans un sous-processus :
 *   - dossier courant = la copie (aucun .env ; DOTENV_CONFIG_PATH vers un
 *     fichier qui n'existe pas) ;
 *   - environnement sans aucune clé ni jeton (motif du garde-fou du bac), et
 *     sans les variables OneDrive de Windows : la copie hors disque d'un essai
 *     ne peut jamais viser le vrai OneDrive (un faux, CM_TEST_ONEDRIVE, se
 *     passe par `env`) ;
 *   - préchargé : garde.mjs (réseau coupé, heure figée, base contrôlée) ;
 *   - MATCH_STATS_DB = la copie de la base d'essai, jamais une autre.
 * Dans le bac, la copie vit DANS le bac (bac-a-sable\essais-tests) et son
 * garde-fou s'applique aussi ; depuis le dépôt, dans le dossier temporaire du
 * système. Pas de node_modules dans la copie, donc jamais de jonction :
 * sa suppression récursive est sans danger.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as bac from '../../src/config/bacASable.js';

export const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = path.join(SERVEUR, 'test', 'fixtures');
export const ECHANTILLON = path.join(FIXTURES, 'echantillon.db');
export const MANIFESTE_ECHANTILLON = path.join(FIXTURES, 'echantillon.json');
/** L'instant auquel tournent les calculs figés (cf. garde.mjs). */
export const MAINTENANT_FIGE = '2026-10-05T12:00:00.000Z';
const GARDE = pathToFileURL(path.join(SERVEUR, 'test', 'aides', 'garde.mjs')).href;
const BAC = bac.dossierDuBac();
export const RACINE_ESSAIS = BAC ? path.join(BAC, 'essais-tests') : os.tmpdir();

export const sha1Fichier = (fichier) => crypto.createHash('sha1').update(fs.readFileSync(fichier)).digest('hex');

export function nettoyer(dossier) {
  // Aucun lien ni jonction dans la copie (vérifié avant de supprimer).
  for (const e of fs.readdirSync(dossier, { recursive: true, withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error(`Lien inattendu dans la copie de travail : ${path.join(e.parentPath ?? e.path, e.name)} — rien supprimé.`);
  }
  fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/**
 * Prépare une copie de travail : code (src + package.json), data/runtime
 * (vide, ou les fichiers de `runtime` : { 'bets.json': [...] }), base d'essai.
 * `racine` : le dossier où la copie est rangée (par défaut RACINE_ESSAIS) ;
 * aides/bacSimule.mjs s'en sert pour ranger la copie dans un faux bac.
 */
export function preparerCopie({ runtime = {}, base = true, racine = RACINE_ESSAIS } = {}) {
  fs.mkdirSync(racine, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(racine, 'cm-tests-'));
  try {
    const serveur = path.join(dossier, 'code', 'server');
    fs.cpSync(path.join(SERVEUR, 'src'), path.join(serveur, 'src'), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'package.json'), path.join(serveur, 'package.json'));
    const donnees = path.join(serveur, 'data', 'runtime');
    fs.mkdirSync(donnees, { recursive: true });
    for (const [nom, contenu] of Object.entries(runtime)) {
      fs.writeFileSync(path.join(donnees, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
    }
    let fichierBase = path.join(dossier, 'base', 'match-stats.db');
    if (base) {
      fs.mkdirSync(path.dirname(fichierBase), { recursive: true });
      fs.copyFileSync(ECHANTILLON, fichierBase);
    } else {
      fichierBase = path.join(dossier, 'base', 'absente.db');
    }
    for (const suffixe of ['', '-wal', '-shm']) {
      if (path.resolve(fichierBase).toLowerCase() === path.resolve(bac.VRAIE_BASE + suffixe).toLowerCase()) throw new Error('copie = vraie base ?');
    }
    return { dossier, serveur, donnees, base: fichierBase, nettoyer: () => nettoyer(dossier) };
  } catch (error) {
    nettoyer(dossier);
    throw error;
  }
}

/** Variables qui désignent le vrai OneDrive de Windows : jamais transmises à un essai. */
export const VARIABLES_ONEDRIVE = /^OneDrive/i;

/** Environnement d'un sous-processus : aucune clé, aucun drapeau hérité, ni le vrai OneDrive ; la base de la copie. */
function environnement(copie, maintenant, enPlus = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (bac.SECRETS.includes(k) || bac.MOTIF_SECRET.test(k)) continue;
    if (/^(CM_|MATCH_STATS_DB$|DOTENV_)/.test(k)) continue;
    if (/^NODE_(TEST|OPTIONS)/.test(k)) continue;
    if (VARIABLES_ONEDRIVE.test(k)) continue;
    env[k] = v;
  }
  return {
    ...env,
    ...enPlus,
    MATCH_STATS_DB: copie.base,
    CM_TEST_DOSSIER: copie.dossier,
    CM_TEST_MODULES: SERVEUR,
    DOTENV_CONFIG_PATH: path.join(copie.dossier, 'pas-de-fichier-env'),
    ...(maintenant ? { CM_TEST_MAINTENANT: maintenant } : {})
  };
}

/**
 * Exécute `script` (chemin absolu) dans la copie : `node --import garde.mjs
 * script <serveur de la copie> ...args`. La dernière ligne de la sortie
 * standard doit être du JSON. `env` : variables en plus (ex. CM_TEST_ONEDRIVE).
 */
export function executer(copie, script, { args = [], maintenant = MAINTENANT_FIGE, timeout = 120_000, env = {} } = {}) {
  const r = spawnSync(process.execPath, ['--import', GARDE, script, copie.serveur, ...args], {
    cwd: copie.dossier,
    env: environnement(copie, maintenant, env),
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024
  });
  const lignes = (r.stdout ?? '').trim().split(/\r?\n/);
  let json = null;
  try {
    json = JSON.parse(lignes.at(-1));
  } catch {
    // laissé à null : l'appelant dira ce qui est sorti
  }
  return { code: r.status, json, sortie: r.stdout ?? '', erreurs: r.stderr ?? '', reseau: /Appel réseau interdit/.test(r.stderr ?? '') };
}

/** Prépare une copie, exécute, nettoie : pour un test qui n'a besoin que du résultat. */
export function executerIsole(script, { runtime = {}, args = [], maintenant = MAINTENANT_FIGE, apres = null } = {}) {
  const copie = preparerCopie({ runtime });
  try {
    const r = executer(copie, script, { args, maintenant });
    if (apres) r.apres = apres(copie);
    return r;
  } finally {
    copie.nettoyer();
  }
}
