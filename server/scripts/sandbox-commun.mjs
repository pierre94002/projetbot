/**
 * sandbox-commun.mjs — socle commun du bac à sable officiel (étape 2 du plan
 * CôteMaster) : où vit le bac, ce qu'on y copie, et la comparaison avec son
 * manifeste. Utilisé par sandbox-prepare.mjs, sandbox-diff.mjs et
 * sandbox-apply.mjs. Mode d'emploi : docs/bac-a-sable.md.
 * -----------------------------------------------------------------------
 * LE BAC : C:\Users\<nom>\CoteMaster\bac-a-sable — hors OneDrive, à côté de
 * la vraie base mais jamais elle :
 *   code\server, code\ui   copie du code ; leurs node_modules sont des
 *                          JONCTIONS vers ceux du dépôt (jamais de
 *                          npm install dans le bac : il écrirait dans le dépôt)
 *   base\match-stats.db    copie de la base
 *   manifeste.json         empreinte sha1 de chaque fichier source copié
 *   recopies\              ce que sandbox-apply a remplacé dans le dépôt
 *   compteur-ia.json       (étape 41) analyses IA réelles consommées
 * Une piste parallèle a son propre bac : bac-a-sable\pistes\<nom> (--piste).
 *
 * CE QUI EST COPIÉ : server\ et ui\ du dépôt, SAUF
 *   - node_modules, dist, caches de Vite (.vite, .vite-cache) ;
 *   - les secrets : tout .env (sauf .env.example) et ai-config.json ;
 *   - sous server\data : l'ancien miroir JSON runtime\match-stats (1,5 Go,
 *     plus lu par l'API depuis le 22/09/2026), le brut FlashScore, les
 *     tampons _tmp-*, backups\ et reports\, le verrou d'actualisation et les
 *     fichiers d'écriture temporaires.
 * Deux classes de fichiers :
 *   - SOURCE : tout, sauf server\data. Empreinte au manifeste ; c'est ce que
 *     diff compare et ce qu'apply recopie vers le dépôt.
 *   - DONNÉE : server\data (runtime, fixtures). Copiée pour que le bac tourne
 *     sur des données réelles ; le bac y écrit librement ; JAMAIS recopiée
 *     vers le dépôt.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ICI = path.dirname(fileURLToPath(import.meta.url));
/** Le dépôt : deux niveaux au-dessus de server/scripts. */
export const DEPOT = path.resolve(ICI, '..', '..');
export const COTEMASTER = path.join(os.homedir(), 'CoteMaster');
export const RACINE_BACS = path.join(COTEMASTER, 'bac-a-sable');
export const VRAIE_BASE = path.join(COTEMASTER, 'match-stats.db');
export const SAUVEGARDES = path.join(COTEMASTER, 'sauvegardes');
/** La seule copie autorisée de la vraie base passe par ce script. */
export const SCRIPT_SAUVEGARDE = path.join(ICI, 'backup-db.mjs');
export const PARTIES = ['server', 'ui'];

const WINDOWS = process.platform === 'win32';
const sansPrefixeLong = (p) => String(p).replace(/^\\\\\?\\/, '');
/** Forme comparable d'un chemin : résolu, « / » ou « \ », casse ignorée sous Windows. */
export const cle = (p) => {
  const r = path.resolve(sansPrefixeLong(p));
  return WINDOWS ? r.toLowerCase() : r;
};
export const memeChemin = (a, b) => cle(a) === cle(b);
/** `chemin` est-il STRICTEMENT dans `dossier` ? */
export function estDans(chemin, dossier) {
  const rel = path.relative(cle(dossier), cle(chemin));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
/** Chemin réel : jonctions et liens résolus sur la plus longue partie qui existe. */
export function cheminReel(p) {
  let existant = path.resolve(sansPrefixeLong(p));
  const reste = [];
  for (;;) {
    try {
      return path.join(sansPrefixeLong(fs.realpathSync.native(existant)), ...reste);
    } catch {
      const parent = path.dirname(existant);
      if (parent === existant) return path.resolve(sansPrefixeLong(p));
      reste.unshift(path.basename(existant));
      existant = parent;
    }
  }
}

/** Options « --nom valeur » et « --drapeau » ; refuse ce qui n'est pas prévu (faute de frappe). */
export function lireOptions(argv, { avecValeur = [], drapeaux = [] } = {}) {
  const valeurs = {};
  const poses = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const nom = a.startsWith('--') ? a.slice(2) : null;
    if (nom && avecValeur.includes(nom)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`L'option --${nom} attend une valeur.`);
      valeurs[nom] = v;
      i++;
    } else if (nom && drapeaux.includes(nom)) {
      poses.add(nom);
    } else {
      const prevues = [...avecValeur.map((o) => `--${o} <valeur>`), ...drapeaux.map((o) => `--${o}`)].join(', ');
      throw new Error(`Option inconnue : ${a}. Options prévues : ${prevues}.`);
    }
  }
  return { valeurs, drapeaux: poses };
}

/** Dossier du bac : le bac principal, celui d'une piste parallèle, ou --bac (essais du script). */
export function dossierDuBac({ bac, piste } = {}) {
  if (bac && piste) throw new Error('--bac et --piste ne vont pas ensemble.');
  if (piste) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/i.test(piste)) throw new Error(`Nom de piste invalide : « ${piste} » (lettres, chiffres et tirets).`);
    return path.join(RACINE_BACS, 'pistes', piste);
  }
  return path.resolve(bac ?? RACINE_BACS);
}

export function cheminsDuBac(dossier) {
  return {
    dossier,
    code: path.join(dossier, 'code'),
    base: path.join(dossier, 'base'),
    fichierBase: path.join(dossier, 'base', 'match-stats.db'),
    manifeste: path.join(dossier, 'manifeste.json'),
    marqueur: path.join(dossier, 'preparation-en-cours.json'),
    recopies: path.join(dossier, 'recopies'),
    abandonnes: path.join(dossier, 'changements-abandonnes')
  };
}

/** Contrôles d'emplacement communs aux trois scripts ; lève avec un message clair. */
export function controlerEmplacements({ depot, dossier }) {
  if (estDans(ICI, RACINE_BACS)) {
    throw new Error(`Ce script tourne depuis une copie du bac (${ICI}). Lancez-le depuis le dépôt : node server/scripts/<script>.mjs`);
  }
  for (const f of ['server/src/server.js', 'server/package.json', 'ui/package.json']) {
    if (!fs.existsSync(path.join(depot, f))) throw new Error(`Dépôt introuvable ou incomplet : ${path.join(depot, f)} manque.`);
  }
  if (memeChemin(dossier, depot) || estDans(dossier, depot) || estDans(depot, dossier)) {
    throw new Error(`Le bac (${dossier}) et le dépôt (${depot}) ne doivent pas s'emboîter.`);
  }
  if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(dossier)) {
    throw new Error(`Le bac ne doit pas vivre sous OneDrive (${dossier}) : verrous, journal WAL et synchronisation ne font pas bon ménage.`);
  }
  if (memeChemin(dossier, COTEMASTER) || estDans(VRAIE_BASE, dossier) || memeChemin(cheminReel(dossier), cheminReel(COTEMASTER))) {
    throw new Error(`Le bac (${dossier}) contiendrait la vraie base (${VRAIE_BASE}).`);
  }
}

/** Ni le bac, ni code\, ni base\, ni code\server, ni code\ui ne doivent être des liens : on y écrit et on y supprime. */
export function controlerPasDeLien(ch) {
  for (const d of [ch.dossier, ch.code, ch.base, ...PARTIES.map((p) => path.join(ch.code, p))]) {
    let st = null;
    try {
      st = fs.lstatSync(d);
    } catch {
      continue; // pas encore créé
    }
    if (st.isSymbolicLink()) throw new Error(`${d} est une jonction ou un lien : le bac doit être un vrai dossier. Rien n'a été touché.`);
  }
}

// --- Ce qu'on copie ---------------------------------------------------------

const DOSSIERS_EXCLUS = new Set(['node_modules', 'dist', '.vite', '.vite-cache', '.git']);
const DONNEES_EXCLUES = [
  /^runtime\/match-stats(\/|$)/, // ancien miroir JSON (1,5 Go), plus lu par l'API depuis le 22/09/2026
  /^runtime\/flashscore-raw(\/|$)/, // brut FlashScore (~110 Mo par journée)
  /^runtime\/_tmp-/, // tampons d'import
  /^backups(\/|$)/, // sauvegardes ponctuelles des scripts de migration
  /^reports(\/|$)/ // rapports générés
];
const NOMS_DONNEES_EXCLUS = [/^espn-refresh\.lock/, /\.tmp$/, /\.new$/, /\.abandonne$/, /^refresh-status\.illisible-/, /\.en-cours$/];

/** Texte des exclusions, recopié dans le manifeste. */
export const EXCLUSIONS = [
  'node_modules (jonction vers le dépôt), dist, .vite, .vite-cache, .git',
  'tout .env (sauf .env.example) et ai-config.json : jamais copiés',
  'server/data/runtime/match-stats/ (ancien miroir JSON, plus lu par l\'API), flashscore-raw/, _tmp-*',
  'server/data/backups/ et server/data/reports/',
  'verrou espn-refresh.lock*, fichiers .tmp, .new, .abandonne, .en-cours, refresh-status.illisible-*',
  'configurations Vite compilées à la volée (*.timestamp-*.mjs) et journaux *.log'
];

function dossierExclu(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => DOSSIERS_EXCLUS.has(p))) return true;
  if (parts[0] === 'server' && parts[1] === 'data' && parts.length > 2) {
    const sous = parts.slice(2).join('/');
    return DONNEES_EXCLUES.some((r) => r.test(sous));
  }
  return false;
}

/**
 * Classe d'un chemin relatif au dossier de code (« server/src/server.js ») :
 * 'source', 'donnee', ou null s'il n'est jamais copié.
 */
export function classer(rel) {
  const parts = String(rel).split('/');
  const nom = parts[parts.length - 1];
  if (parts.length < 2 || !PARTIES.includes(parts[0])) return null;
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  if (parts.some((p) => DOSSIERS_EXCLUS.has(p))) return null;
  if (nom.toLowerCase() === 'ai-config.json') return null; // clé API en clair
  if (/^\.env(\.|$)/i.test(nom) && nom.toLowerCase() !== '.env.example') return null; // secrets
  if (/\.timestamp-\d+(-[0-9a-f]+)?\.m?js$/i.test(nom)) return null; // config Vite compilée à la volée
  if (/\.log$/i.test(nom)) return null;
  if (parts[0] === 'server' && parts[1] === 'data') {
    const sous = parts.slice(2).join('/');
    if (DONNEES_EXCLUES.some((r) => r.test(sous))) return null;
    if (NOMS_DONNEES_EXCLUS.some((r) => r.test(nom))) return null;
    return 'donnee';
  }
  return 'source';
}

/**
 * Fichiers copiables sous `racineCode` (le dépôt, ou le code\ du bac) :
 * Map rel → { classe, abs }. Ne suit JAMAIS un lien ni une jonction : la
 * jonction node_modules du bac reste hors du parcours.
 */
export function lister(racineCode, { classes = ['source', 'donnee'] } = {}) {
  const fichiers = new Map();
  const parcourir = (dossier, rel) => {
    let entrees;
    try {
      entrees = fs.readdirSync(dossier, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const e of entrees) {
      const relE = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!dossierExclu(relE)) parcourir(path.join(dossier, e.name), relE);
        continue;
      }
      if (!e.isFile()) continue;
      const classe = classer(relE);
      if (classe && classes.includes(classe)) fichiers.set(relE, { classe, abs: path.join(dossier, e.name) });
    }
  };
  for (const partie of PARTIES) parcourir(path.join(racineCode, partie), partie);
  return new Map([...fichiers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// --- Lectures et écritures prudentes ---------------------------------------

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Réessaie une opération de fichier gênée par un verrou passager (OneDrive, antivirus). */
export function avecReprise(fn, { essais = 8, attenteMs = 250 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return fn();
    } catch (error) {
      if (i >= essais || !['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
      pause(attenteMs * i);
    }
  }
}

export const sha1 = (abs) => avecReprise(() => crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex'));

export function lireManifeste(fichier) {
  try {
    return JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Manifeste illisible (${fichier}) : ${error.message}`);
  }
}

/** Écriture d'un JSON du bac (hors OneDrive) : brouillon puis renommage. */
export function ecrireJson(fichier, objet) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const brouillon = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(brouillon, `${JSON.stringify(objet, null, 2)}\n`);
  avecReprise(() => fs.renameSync(brouillon, fichier));
}

/**
 * La base du bac est-elle ouverte (serveur du bac lancé) ? SQLite ouvre ses
 * fichiers sans partage de suppression sous Windows : un renommage échoue
 * alors. Rien n'est touché si elle l'est ; sinon elle est renommée puis
 * aussitôt remise à son nom.
 */
export function baseOccupee(fichier) {
  if (!fs.existsSync(fichier)) return false;
  const essai = `${fichier}.verification-usage`;
  try {
    fs.renameSync(fichier, essai);
  } catch (error) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) return true;
    throw error;
  }
  avecReprise(() => fs.renameSync(essai, fichier));
  return false;
}

export function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// --- Comparaison avec le manifeste -----------------------------------------

/**
 * Ce qui a changé dans le bac depuis sa préparation (fichiers SOURCE), et si
 * le même fichier a aussi bougé dans le dépôt depuis.
 *   type          'modifié' | 'ajouté' | 'supprimé' (côté bac, face au manifeste)
 *   dejaIdentique le dépôt a déjà exactement l'état du bac : rien à recopier
 *   conflit       le dépôt a changé ce fichier depuis la préparation, autrement
 * Sans manifeste, la référence est vide : tout fichier du bac qui diffère du
 * dépôt compte comme un changement.
 */
export function comparer({ depot, codeBac, manifeste }) {
  const reference = manifeste?.fichiers ?? {};
  const bac = lister(codeBac, { classes: ['source'] });
  const dep = lister(depot, { classes: ['source'] });
  const empreinte = (liste, rel) => (liste.has(rel) ? sha1(liste.get(rel).abs) : null);
  const changements = [];
  const vus = new Set();
  for (const rel of [...new Set([...Object.keys(reference), ...bac.keys()])].sort()) {
    const ref = reference[rel]?.sha1 ?? null;
    const x = empreinte(bac, rel);
    if (x === ref) continue;
    vus.add(rel);
    const d = empreinte(dep, rel);
    const type = ref === null ? 'ajouté' : x === null ? 'supprimé' : 'modifié';
    const dejaIdentique = d === x;
    changements.push({ rel, type, sha1Bac: x, sha1Reference: ref, sha1Depot: d, dejaIdentique, conflit: !dejaIdentique && d !== ref });
  }
  const depotSeulement = [];
  if (manifeste) {
    for (const rel of [...new Set([...Object.keys(reference), ...dep.keys()])].sort()) {
      if (vus.has(rel)) continue;
      const ref = reference[rel]?.sha1 ?? null;
      const d = empreinte(dep, rel);
      if (d !== ref) depotSeulement.push({ rel, type: ref === null ? 'ajouté' : d === null ? 'supprimé' : 'modifié' });
    }
  }
  return { changements, depotSeulement, fichiersBac: bac.size, fichiersDepot: dep.size };
}

// --- Affichage ----------------------------------------------------------------

export const dateLocale = (d = new Date()) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
export function horodatage(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}`;
}
export const mo = (octets) => `${(octets / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
export function duree(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
