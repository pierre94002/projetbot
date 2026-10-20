/**
 * fichiersSauvegarde.js — ce que les sauvegardes lisent et écrivent sur le disque.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Les règles (noms, rotation, cadences, alertes)
 * sont dans planSauvegardes.js ; ici, les opérations : inventaire du dossier,
 * rotation appliquée, compression, archive des données de l'appli, copie hors
 * du disque, fichiers d'état. Utilisé par scripts/backup-db.mjs,
 * scripts/restore-test-db.mjs, l'étape « sauvegarde » de l'actualisation,
 * les routes /api/backups et le choix de la destination hors disque
 * (destinationHorsDisque.js). N'ouvre JAMAIS la base : ça, c'est le travail
 * des deux scripts, dans leur propre processus.
 *
 * Trois protections valent pour tout ce qui suit :
 *   - BAC À SABLE : quand le code tourne dans le bac (config/bacASable.js),
 *     toute écriture hors du bac est refusée avant de toucher au disque —
 *     dossier des sauvegardes, dossier temporaire, destination hors disque
 *     (qui n'est en plus jamais le dossier des sauvegardes ni un dossier du
 *     projet : raisonInterdite) ;
 *   - on ne supprime que des fichiers dont le nom est l'un des nôtres
 *     (planSauvegardes.classerNom) : une copie faite à la main ne l'est jamais,
 *     un dossier ou un lien non plus ;
 *   - jamais de secret dans une archive : ai-config.json, tout .env, et tout
 *     fichier qui contiendrait une clé (motif sk-ant-…, ou la valeur d'une
 *     variable secrète de ce processus) restent dehors. Les noms des fichiers
 *     écartés sont notés ; jamais leur contenu.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { modeBacASable, dossierDuBac, RACINE_BAC, estDans, cheminReel, SECRETS, MOTIF_SECRET } from '../../config/bacASable.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../../core/engine/engineConfig.js';
import { classerNom, classerDossierTemp, planRotation, compterParType, POLITIQUE, FICHIERS_ETAT, HORS_DISQUE_MAX } from './planSauvegardes.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
/** Les données de l'appli : server/data/runtime (sous OneDrive chez Pierre). */
export const DOSSIER_DONNEES = path.resolve(ICI, '../../../data/runtime');
/** Le projet : le code et ses données d'exécution (…\ProjetBot, ou …\bac-a-sable\code). Jamais une destination de copie. */
export const DOSSIER_PROJET = path.resolve(ICI, '../../../..');

const CODES_VERROU = new Set(['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN']);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Réessaie une opération gênée par un verrou passager (OneDrive, antivirus, clé USB lente). */
export function avecReprise(fn, { essais = 8, attenteMs = 250 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return fn();
    } catch (error) {
      if (i >= essais || !CODES_VERROU.has(error.code)) throw error;
      pause(attenteMs * i);
    }
  }
}

export function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// --- Où l'on écrit ----------------------------------------------------------

/** Le bac qui contient ce code (ou celui désigné par CM_BAC_A_SABLE), sinon null. */
export const bacActif = () => (modeBacASable() ? dossierDuBac() ?? RACINE_BAC : null);

/**
 * Garde-fou d'écriture : dans le bac à sable, rien ne s'écrit hors du bac.
 * Rend le chemin résolu, ou lève AVANT toute écriture.
 */
export function gardeEcriture(chemin, quoi = 'écriture') {
  const resolu = path.resolve(String(chemin));
  const bac = bacActif();
  if (bac && (!estDans(resolu, bac) || !estDans(cheminReel(resolu), cheminReel(bac)))) {
    throw new Error(`Bac à sable : ${quoi} refusée hors du bac (${resolu}). Dans le bac, tout s'écrit sous ${bac}.`);
  }
  return resolu;
}

/**
 * Dossier des sauvegardes par défaut : à côté de la base (C:\Users\<nom>\
 * CoteMaster\sauvegardes) ; dans le bac à sable, <bac>\sauvegardes — jamais
 * le vrai dossier des sauvegardes de l'appli.
 */
export function dossierSauvegardesParDefaut(cheminBase) {
  const bac = bacActif();
  if (bac) return path.join(bac, 'sauvegardes');
  return path.join(path.dirname(path.resolve(cheminBase)), 'sauvegardes');
}

export const cheminsEtat = (dossier) => ({
  sauvegarde: path.join(dossier, FICHIERS_ETAT.sauvegarde),
  restauration: path.join(dossier, FICHIERS_ETAT.restauration)
});

// --- Fichiers d'état (hors OneDrive, à côté des sauvegardes) ---------------

/**
 * Lit un fichier d'état. Absent : null. Illisible : mis de côté (sauf
 * `mettreDeCote: false`, pour un simple lecteur comme la route) puis null —
 * jamais écrasé en silence.
 */
export function lireEtat(fichier, { mettreDeCote = true } = {}) {
  try {
    return readJsonFile(fichier, null);
  } catch (error) {
    if (mettreDeCote) {
      try {
        const cote = fichier.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.renameSync(fichier, cote);
      } catch {
        // déjà déplacé
      }
    }
    return null;
  }
}

export function ecrireEtat(fichier, etat) {
  gardeEcriture(fichier, "écriture de l'état des sauvegardes");
  writeJsonAtomic(fichier, etat);
}

// --- Inventaire et rotation --------------------------------------------------

const EXTENSIONS_COPIE = /\.(db|sqlite|sqlite3|db\.gz|zip)$/i;

/**
 * Ce que contient le dossier des sauvegardes. Ne suit ni dossier ni lien.
 *   jeux       sauvegardes automatiques, une par jour, la plus récente d'abord
 *              { jour, fichiers: { base?, donnees?, bilan?, ancienne? }, ancienFormat, octets }
 *   manuelles  copies de base faites à la main (.db, .db.gz…) : jamais touchées
 *   autres     tout autre fichier : jamais touché
 *   travail    écritures en cours ou abandonnées (avec leur processus)
 *   tempRestauration  dossiers temporaires de restauration d'essai
 */
export function inventaire(dossier) {
  const vide = { dossier, present: false, jeux: [], manuelles: [], autres: [], travail: [], tempRestauration: [] };
  let entrees;
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return vide;
    throw error;
  }
  const jeux = new Map();
  const inv = { ...vide, present: true };
  for (const e of entrees) {
    if (e.isDirectory() && !e.isSymbolicLink()) {
      const t = classerDossierTemp(e.name);
      if (t) inv.tempRestauration.push({ nom: e.name, pid: t.pid });
      continue;
    }
    if (!e.isFile()) continue;
    let st;
    try {
      st = fs.statSync(path.join(dossier, e.name));
    } catch {
      continue; // disparu entre-temps
    }
    const f = { nom: e.name, octets: st.size, modifieLe: st.mtime.toISOString() };
    const c = classerNom(e.name);
    if (!c) {
      (EXTENSIONS_COPIE.test(e.name) ? inv.manuelles : inv.autres).push(f);
      continue;
    }
    if (c.type === 'etat') continue;
    if (c.type === 'travail') {
      inv.travail.push({ ...f, pid: c.pid });
      continue;
    }
    const jeu = jeux.get(c.jour) ?? { jour: c.jour, fichiers: {}, ancienFormat: false, octets: 0 };
    jeu.fichiers[c.partie] = f;
    jeu.octets += st.size;
    if (c.type === 'ancienne' && !jeu.fichiers.base) jeu.ancienFormat = true;
    if (c.type === 'jeu' && c.partie === 'base') jeu.ancienFormat = false;
    jeux.set(c.jour, jeu);
  }
  inv.jeux = [...jeux.values()].sort((a, b) => (a.jour < b.jour ? 1 : -1));
  inv.manuelles.sort((a, b) => (a.modifieLe < b.modifieLe ? 1 : -1));
  return inv;
}

export function supprimerFichier(abs) {
  avecReprise(() => fs.rmSync(abs, { force: true }));
}

/** Un jeu compte dans la rotation s'il a sa base (compressée, ou à l'ancien format). */
export const aUneBase = (jeu) => Boolean(jeu.fichiers.base || jeu.fichiers.ancienne);

/**
 * Applique la rotation 7/4/12 au dossier. Ne supprime que des fichiers
 * d'un jeu automatique (nom vérifié une seconde fois juste avant), jamais le
 * jeu le plus récent ni ceux de `proteger` (le jeu que l'on vient de faire :
 * une horloge qui reculerait le nommerait d'un jour « ancien »), jamais rien
 * d'autre. Un jeu dont la base a disparu (supprimée à la main) n'occupe pas
 * de place dans la rotation et n'est pas effacé : il est seulement signalé
 * (« incomplets »).
 */
export function appliquerRotation(dossier, politique = POLITIQUE, { proteger = [] } = {}) {
  gardeEcriture(dossier, 'rotation des sauvegardes');
  const inv = inventaire(dossier);
  const avecBase = inv.jeux.filter(aUneBase);
  const plan = planRotation(avecBase.map((j) => j.jour), politique);
  const plusRecent = avecBase[0]?.jour ?? null;
  const supprimees = [];
  for (const jour of plan.supprimer) {
    if (jour === plusRecent || proteger.includes(jour)) continue;
    const jeu = avecBase.find((j) => j.jour === jour);
    for (const f of Object.values(jeu.fichiers)) {
      const c = classerNom(f.nom);
      if (!c || (c.type !== 'jeu' && c.type !== 'ancienne') || c.jour !== jour) continue;
      supprimerFichier(path.join(dossier, f.nom));
      supprimees.push(f.nom);
    }
  }
  const gardees = avecBase
    .filter((j) => plan.garder.has(j.jour) || proteger.includes(j.jour))
    .map((j) => ({ jour: j.jour, raisons: plan.garder.get(j.jour) ?? ['protégée (copie du jour)'], octets: j.octets, ancienFormat: j.ancienFormat, fichiers: Object.values(j.fichiers).map((f) => f.nom) }));
  const incomplets = inv.jeux.filter((j) => !aUneBase(j)).map((j) => ({ jour: j.jour, fichiers: Object.values(j.fichiers).map((f) => f.nom) }));
  return { politique, gardees, supprimees, incomplets, compte: compterParType(plan.garder) };
}

/** Fichiers d'écriture et dossiers temporaires laissés par un processus qui n'existe plus. */
export function nettoyerAbandons(dossier) {
  gardeEcriture(dossier, 'nettoyage du dossier des sauvegardes');
  const inv = inventaire(dossier);
  const retires = [];
  for (const f of inv.travail) {
    if (processusVivant(f.pid)) continue;
    supprimerFichier(path.join(dossier, f.nom));
    retires.push(f.nom);
  }
  for (const d of inv.tempRestauration) {
    if (processusVivant(d.pid)) continue;
    viderDossierTemp(path.join(dossier, d.nom));
    retires.push(`${d.nom}\\`);
  }
  return retires;
}

/** Vide puis retire un dossier temporaire À NOUS : fichiers seulement, jamais à travers un lien. */
export function viderDossierTemp(abs) {
  const st = fs.lstatSync(abs, { throwIfNoEntry: false });
  if (!st) return;
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`${abs} n'est pas un vrai dossier : laissé tel quel.`);
  if (!classerDossierTemp(path.basename(abs))) throw new Error(`${abs} n'est pas un dossier temporaire de restauration : laissé tel quel.`);
  gardeEcriture(abs, 'nettoyage du dossier temporaire');
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isFile()) supprimerFichier(path.join(abs, e.name));
  }
  avecReprise(() => fs.rmdirSync(abs));
}

// --- Compression ---------------------------------------------------------------

const robinet = (hash, compteur) =>
  new Transform({
    transform(chunk, _encodage, suite) {
      hash.update(chunk);
      compteur.n += chunk.length;
      suite(null, chunk);
    }
  });

/** gzip en flux de `source` vers `cible` (écrite jusqu'au disque) ; empreintes des deux côtés. */
export async function compresserGzip(source, cible, { niveau = 6 } = {}) {
  gardeEcriture(cible, 'écriture de la sauvegarde compressée');
  const hBrut = crypto.createHash('sha256');
  const hGz = crypto.createHash('sha256');
  const brut = { n: 0 };
  const gz = { n: 0 };
  await pipeline(
    fs.createReadStream(source, { highWaterMark: 1 << 20 }),
    robinet(hBrut, brut),
    zlib.createGzip({ level: niveau }),
    robinet(hGz, gz),
    fs.createWriteStream(cible, { flush: true })
  );
  return { octets: brut.n, octetsCompresses: gz.n, sha256: hBrut.digest('hex'), sha256Gz: hGz.digest('hex') };
}

/** Décompression en flux ; empreinte de ce qui sort (la base restaurée). */
export async function decompresserGzip(source, cible) {
  gardeEcriture(cible, 'restauration');
  const hBrut = crypto.createHash('sha256');
  const brut = { n: 0 };
  await pipeline(fs.createReadStream(source, { highWaterMark: 1 << 20 }), zlib.createGunzip(), robinet(hBrut, brut), fs.createWriteStream(cible, { flush: true }));
  return { octets: brut.n, sha256: hBrut.digest('hex') };
}

/** Copie en flux avec empreinte (copie hors disque, copie d'une sauvegarde à l'ancien format). */
export async function copierAvecEmpreinte(source, cible) {
  gardeEcriture(cible, 'copie');
  const h = crypto.createHash('sha256');
  const n = { n: 0 };
  await pipeline(fs.createReadStream(source, { highWaterMark: 1 << 20 }), robinet(h, n), fs.createWriteStream(cible, { flush: true }));
  return { octets: n.n, sha256: h.digest('hex') };
}

/** Taille annoncée par la fin d'un .gz (modulo 4 Go : seulement un repère quand le bilan manque). */
export function tailleAnnonceeGzip(fichier) {
  const fd = fs.openSync(fichier, 'r');
  try {
    const t = fs.fstatSync(fd).size;
    if (t < 18) return null;
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, t - 4);
    return b.readUInt32LE(0);
  } finally {
    fs.closeSync(fd);
  }
}

// --- Archive .zip des données de l'appli ------------------------------------

function dateDos(instant) {
  const d = new Date(instant ?? Date.now());
  const annee = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((annee - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

/**
 * Une archive .zip (deflate, noms UTF-8) que l'Explorateur de Windows ouvre
 * d'un double-clic. `entrees` : [{ nom, donnees: Buffer, mtime }].
 */
export function construireZip(entrees) {
  if (entrees.length > 0xffff) throw new Error("trop de fichiers pour une archive simple");
  const morceaux = [];
  const central = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(e.nom, 'utf8');
    const comprime = zlib.deflateRawSync(e.donnees, { level: 6 });
    const crc = zlib.crc32(e.donnees) >>> 0;
    const { heure, date } = dateDos(e.mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprime.length, 18);
    local.writeUInt32LE(e.donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(heure, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comprime.length, 20);
    cd.writeUInt32LE(e.donnees.length, 24);
    cd.writeUInt16LE(nom.length, 28);
    cd.writeUInt32LE(decalage, 42);
    morceaux.push(local, nom, comprime);
    central.push(cd, nom);
    decalage += 30 + nom.length + comprime.length;
    if (decalage > 0xffffffff) throw new Error("archive trop grosse pour le format simple (4 Go)");
  }
  const repertoire = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...morceaux, repertoire, fin]);
}

/**
 * Relit une archive écrite par construireZip et contrôle chaque fichier
 * (décompression, taille, CRC). Rend [{ nom, octets, ok, erreur, donnees? }].
 */
export function lireZip(buffer, { garderDonnees = false } = {}) {
  let fin = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('archive illisible : fin de répertoire introuvable');
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const entrees = [];
  for (let k = 0; k < total; k++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error("répertoire de l'archive abîmé");
    const methode = buffer.readUInt16LE(p + 10);
    const crc = buffer.readUInt32LE(p + 16);
    const tailleC = buffer.readUInt32LE(p + 20);
    const tailleU = buffer.readUInt32LE(p + 24);
    const ln = buffer.readUInt16LE(p + 28);
    const lx = buffer.readUInt16LE(p + 30);
    const lc = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nom = buffer.toString('utf8', p + 46, p + 46 + ln);
    p += 46 + ln + lx + lc;
    const entree = { nom, octets: tailleU, ok: true, erreur: null };
    try {
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('en-tête local absent');
      const debut = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const brut = buffer.subarray(debut, debut + tailleC);
      const donnees = methode === 8 ? zlib.inflateRawSync(brut) : methode === 0 ? brut : null;
      if (!donnees) throw new Error(`méthode de compression ${methode} inconnue`);
      if (donnees.length !== tailleU || (zlib.crc32(donnees) >>> 0) !== crc) throw new Error('taille ou CRC différents');
      if (garderDonnees) entree.donnees = donnees;
    } catch (error) {
      entree.ok = false;
      entree.erreur = error.message;
    }
    entrees.push(entree);
  }
  return entrees;
}

// Ce qui ne part JAMAIS dans l'archive des données.
const DOSSIERS_EXCLUS = [
  [/^match-stats$/i, "ancien miroir JSON des statistiques (1,5 Go), plus lu depuis le 22/09/2026 : la base le remplace"],
  [/^flashscore-raw$/i, 'brut FlashScore'],
  [/^_tmp-/i, "tampon d'import"]
];
const FICHIERS_EXCLUS = [
  // Toute variante du nom (ai-config.json.bak, AI-CONFIG.JSON…) : la clé y serait aussi.
  [/ai-config/i, 'clé API en clair : jamais sauvegardée'],
  [/(^\.env|\.env$)/i, 'secrets : jamais sauvegardés'],
  [/^espn-refresh\.lock/i, "verrou de l'actualisation"],
  [/\.(tmp|new|abandonne|en-cours)$/i, "fichier d'écriture temporaire"],
  [/^refresh-status\.illisible-/i, 'état illisible mis de côté'],
  [/^(calendrier|resultats)-fotmob\.json$/i, 'tampon de travail']
];
/** Une clé Anthropic (API ou jeton Claude Code) écrite en clair, où qu'elle soit. */
const MOTIF_CLE = /sk-ant-[A-Za-z0-9_-]{10,}/;
const TAILLE_MAX_FICHIER = 300 * 1024 * 1024;

/** Valeurs des variables secrètes de ce processus (jamais affichées : servent à écarter un fichier). */
export function secretsConnus(env = process.env) {
  const noms = new Set([...SECRETS, ...Object.keys(env).filter((k) => MOTIF_SECRET.test(k))]);
  return [...noms]
    .map((n) => String(env[n] ?? '').trim())
    .filter((v) => v.length >= 12)
    .map((v) => Buffer.from(v, 'utf8'));
}

export function contientSecret(buffer, secrets = []) {
  if (secrets.some((s) => buffer.includes(s))) return true;
  return MOTIF_CLE.test(buffer.toString('latin1'));
}

/** Raison d'écarter un fichier par son seul nom, ou null. */
export function exclusParNom(nom) {
  return FICHIERS_EXCLUS.find(([re]) => re.test(nom))?.[1] ?? null;
}

function listerDonnees(racine, exclus, rel = '') {
  const fichiers = [];
  let entrees;
  try {
    entrees = fs.readdirSync(path.join(racine, rel), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return fichiers;
    throw error;
  }
  for (const e of entrees) {
    const relE = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) {
      exclus.push({ fichier: relE, raison: 'lien ou jonction : jamais suivi' });
      continue;
    }
    if (e.isDirectory()) {
      const regle = DOSSIERS_EXCLUS.find(([re]) => re.test(e.name));
      if (regle) exclus.push({ fichier: `${relE}/`, raison: regle[1] });
      else fichiers.push(...listerDonnees(racine, exclus, relE));
      continue;
    }
    if (e.isFile()) fichiers.push({ rel: relE, nom: e.name, abs: path.join(racine, rel, e.name) });
  }
  return fichiers.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/**
 * Lecture tolérante d'un fichier de data/runtime : OneDrive le tient parfois
 * juste après une écriture (EBUSY, EPERM, « UNKNOWN ») — on réessaie ; un
 * JSON qui ne se lit pas (écrivain au milieu) est relu deux fois avant d'être
 * pris tel quel, signalé. Jamais de message qui citerait le contenu.
 */
export function lireTolerant(abs, { json = false } = {}) {
  let dernier = null;
  for (let essai = 1; essai <= 6; essai++) {
    let buffer;
    let mtime;
    try {
      mtime = fs.statSync(abs).mtime;
      buffer = fs.readFileSync(abs);
    } catch (error) {
      if (!CODES_VERROU.has(error.code) || essai >= 6) throw error;
      pause(250 * essai);
      continue;
    }
    if (!json) return { buffer, mtime, jsonValide: null };
    try {
      JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
      return { buffer, mtime, jsonValide: true };
    } catch {
      dernier = { buffer, mtime, jsonValide: false };
      if (essai >= 3) return dernier;
      pause(300 * essai);
    }
  }
  return dernier;
}

/**
 * Archive les données de l'appli (data/runtime) dans `cible`, sans secrets,
 * sans verrou ni temporaires, sans l'ancien miroir JSON ; puis RELIT l'archive
 * et contrôle chaque fichier. Les entrées sont rangées sous data/runtime/ :
 * extraire l'archive dans server/ remet chaque fichier à sa place.
 */
export function archiverDonnees({ dossierDonnees = DOSSIER_DONNEES, cible, secrets = secretsConnus(), prefixe = 'data/runtime' }) {
  gardeEcriture(cible, "écriture de l'archive des données");
  const exclus = [];
  const avertissements = [];
  const entrees = [];
  const fichiers = [];
  for (const f of listerDonnees(dossierDonnees, exclus)) {
    const raison = exclusParNom(f.nom);
    if (raison) {
      exclus.push({ fichier: f.rel, raison });
      continue;
    }
    let lu;
    try {
      if (fs.statSync(f.abs).size > TAILLE_MAX_FICHIER) {
        exclus.push({ fichier: f.rel, raison: 'plus de 300 Mo : pas une donnée de l\'appli' });
        continue;
      }
      lu = lireTolerant(f.abs, { json: /\.json$/i.test(f.nom) });
    } catch (error) {
      avertissements.push(`${f.rel} illisible (${error.code ?? 'erreur'}) : non archivé`);
      continue;
    }
    if (contientSecret(lu.buffer, secrets)) {
      exclus.push({ fichier: f.rel, raison: 'contient une clé ou un jeton : non archivé' });
      avertissements.push(`${f.rel} contient une clé ou un jeton : non archivé`);
      continue;
    }
    if (lu.jsonValide === false) avertissements.push(`${f.rel} : JSON invalide sur le disque, archivé tel quel`);
    entrees.push({ nom: `${prefixe}/${f.rel}`, donnees: lu.buffer, mtime: lu.mtime });
    fichiers.push({ nom: f.rel, octets: lu.buffer.length, sha256: crypto.createHash('sha256').update(lu.buffer).digest('hex'), jsonValide: lu.jsonValide });
  }
  const zip = construireZip(entrees);
  avecReprise(() => fs.writeFileSync(cible, zip, { flush: true }));
  // Relecture de ce qui est sur le disque, pas du tampon en mémoire.
  const relu = lireZip(fs.readFileSync(cible));
  const abimes = relu.filter((e) => !e.ok);
  if (relu.length !== entrees.length || abimes.length) {
    throw new Error(`archive des données invalide à la relecture (${abimes.length} fichier(s) abîmé(s) sur ${relu.length})`);
  }
  return {
    octets: zip.length,
    sha256: crypto.createHash('sha256').update(zip).digest('hex'),
    octetsDonnees: fichiers.reduce((n, f) => n + f.octets, 0),
    fichiers,
    exclus,
    avertissements
  };
}

/**
 * L'état des réglages du moteur au moment de la sauvegarde : le fichier
 * engine-config.json (empreinte, date) et les valeurs effectives (défauts du
 * code + fichier), plus le coupe-circuit (tilt-state.json). Les versions
 * numérotées du moteur arrivent à l'étape 25 du plan.
 */
export function reglagesMoteur(dossierDonnees = DOSSIER_DONNEES) {
  const lire = (nom) => {
    const abs = path.join(dossierDonnees, nom);
    if (!fs.existsSync(abs)) return { present: false };
    try {
      const lu = lireTolerant(abs, { json: true });
      return {
        present: true,
        modifieLe: lu.mtime.toISOString(),
        sha256: crypto.createHash('sha256').update(lu.buffer).digest('hex'),
        contenu: lu.jsonValide ? JSON.parse(lu.buffer.toString('utf8').replace(/^\uFEFF/, '')) : null,
        jsonValide: lu.jsonValide
      };
    } catch (error) {
      return { present: true, illisible: error.code ?? 'erreur' };
    }
  };
  const fichier = lire('engine-config.json');
  const brut = fichier.contenu ?? {};
  const parSport = Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT).some((s) => brut[s]) ? brut : { football: brut };
  const effectifs = {};
  for (const [sport, defauts] of Object.entries(DEFAULT_ENGINE_CONFIG_BY_SPORT)) {
    const p = parSport[sport];
    effectifs[sport] = p ? { ...defauts, ...p, weights: { ...defauts.weights, ...p.weights } } : { ...defauts };
  }
  const { contenu: _contenu, ...fichierSansContenu } = fichier;
  const coupeCircuit = lire('tilt-state.json');
  return {
    fichier: { nom: 'data/runtime/engine-config.json', ...fichierSansContenu },
    origine: fichier.present && fichier.contenu ? 'fichier engine-config.json par-dessus les valeurs par défaut du code' : 'valeurs par défaut du code (pas de engine-config.json lisible)',
    effectifs,
    coupeCircuit: coupeCircuit.present ? { nom: 'data/runtime/tilt-state.json', modifieLe: coupeCircuit.modifieLe, etat: coupeCircuit.contenu ?? null } : null,
    versionMoteur: null
  };
}

// --- Disque -------------------------------------------------------------------

export function placeLibre(dossier) {
  try {
    const s = fs.statfsSync(dossier);
    return { libre: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return { libre: null, total: null };
  }
}

/** Racine du volume (c:\, e:\) d'un chemin réel : deux dossiers sur le même disque l'ont en commun. */
export const racineVolume = (p) => path.parse(cheminReel(p)).root.toLowerCase();
/** Un chemin dont un dossier s'appelle OneDrive… : la place mesurée y est celle du disque, pas celle du compte. */
export const sousOneDrive = (p) => /[\\/]onedrive[^\\/]*([\\/]|$)/i.test(cheminReel(p));

// --- Copie hors du disque ------------------------------------------------------

/** Marge demandée sur la destination hors disque, en plus de la taille du jeu copié. */
export const MARGE_HORS_DISQUE = 512 * 1024 ** 2;

const cleDossier = (p) => (process.platform === 'win32' ? path.resolve(String(p)).toLowerCase() : path.resolve(String(p)));
/** Même dossier (chemins résolus, casse ignorée sous Windows) ? Faux si l'un des deux manque. */
export const memeDossier = (a, b) => Boolean(a) && Boolean(b) && cleDossier(a) === cleDossier(b);

/**
 * Pourquoi `destination` ne peut pas recevoir la copie hors disque (texte),
 * ou null. Comparaisons sur les chemins RÉELS : une jonction ne fait ni
 * sortir du bac, ni échapper au dossier des sauvegardes ou au projet.
 *   - dans le bac à sable, tout dossier hors du bac (garde-fou) ;
 *   - le dossier des sauvegardes, l'un de ses sous-dossiers ou un dossier qui
 *     le contient : la rotation de là-bas y effacerait les sauvegardes ;
 *   - le dossier du projet ou l'un de ses sous-dossiers (code, data\runtime).
 * Ne lit ni n'écrit rien (sauf la résolution des jonctions).
 */
export function raisonInterdite(destination, { dossierSauvegardes = null } = {}) {
  try {
    gardeEcriture(destination, 'copie hors disque');
  } catch (error) {
    return error.message;
  }
  const dest = cheminReel(destination);
  if (dossierSauvegardes) {
    const sauv = cheminReel(dossierSauvegardes);
    if (memeDossier(dest, sauv) || estDans(dest, sauv) || estDans(sauv, dest)) {
      return `la destination hors disque (${destination}) ne peut pas être le dossier des sauvegardes (${dossierSauvegardes}), ni être dedans, ni le contenir : sa rotation y effacerait les sauvegardes`;
    }
  }
  const projet = cheminReel(DOSSIER_PROJET);
  if (memeDossier(dest, projet) || estDans(dest, projet)) {
    return `la destination hors disque (${destination}) ne peut pas être un dossier du projet (${DOSSIER_PROJET}) : le code et ses données d'exécution ne reçoivent jamais de sauvegarde`;
  }
  return null;
}

/** Ce que pèse une copie hors disque : le dernier jeu complet (base + données + bilan) ; null sans jeu. */
export function tailleDernierJeu(dossierSauvegardes, inv = inventaire(dossierSauvegardes)) {
  const jeu = inv.jeux.find((j) => j.fichiers.base && j.fichiers.bilan);
  return jeu ? ['base', 'donnees', 'bilan'].reduce((n, p) => n + (jeu.fichiers[p]?.octets ?? 0), 0) : null;
}

/** Une valeur de CM_SAUVEGARDE_HORS_DISQUE ou de --hors-disque (vide = non réglé, « aucune » = refusé). */
export function reglageHorsDisque(valeur) {
  const v = String(valeur ?? '').trim();
  if (!v) return { reglage: 'non-configuree', destination: null };
  if (/^(aucune?|non|no|off|false|0)$/i.test(v)) return { reglage: 'refusee', destination: null };
  return { reglage: 'configuree', destination: path.resolve(v) };
}

/** La destination est-elle là, maintenant ? (clé branchée, dossier existant) */
export function destinationPresente(destination) {
  if (!destination) return false;
  try {
    return fs.statSync(destination).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Copie hors du disque du dernier jeu complet (base compressée + bilan +
 * données) vers `destination`. Jamais la base vivante ni son journal : ce
 * sont les fichiers de la sauvegarde, déjà fermés. Refuse les dossiers
 * interdits (raisonInterdite). Vérifie la place AVANT d'écrire, alerte au
 * lieu d'écrire si elle manque ou si la destination est absente ; garde au
 * plus `garder` jeux là-bas (1 ou 2) et ne touche à rien d'autre.
 *   type     'onedrive' : `destination` est le dossier dédié dans OneDrive
 *            (…\OneDrive\CoteMaster-sauvegardes), créé au besoin quand
 *            OneDrive lui-même est là ; 'dossier' (clé USB, autre dossier) :
 *            il doit exister, jamais créé (clé débranchée = rien d'écrit).
 *   absente  pourquoi il n'y a pas de destination (OneDrive non détecté).
 * Rend un bilan { statut: 'faite' | 'absente' | 'place-insuffisante'
 * | 'rien-a-copier' | 'erreur', type, destination, … }.
 */
export async function copierHorsDisque({ dossierSauvegardes, destination, garder = HORS_DISQUE_MAX, jour = null, type = 'dossier', absente = null }) {
  const debut = new Date();
  const bilan = (statut, extra = {}) => ({ debut: debut.toISOString(), fin: new Date().toISOString(), dureeMs: Date.now() - debut.getTime(), statut, type, destination, ...extra });
  try {
    garder = Math.min(HORS_DISQUE_MAX, Math.max(1, Number(garder) || HORS_DISQUE_MAX));
    if (!destination) return bilan('absente', { message: `${absente ?? 'aucune destination'} : rien n'a été copié` });
    const interdite = raisonInterdite(destination, { dossierSauvegardes });
    if (interdite) return bilan('erreur', { message: interdite.replace(/\.$/, '') });
    // Où mesurer la place : la destination, ou OneDrive lui-même quand son
    // dossier dédié reste à créer. Rien n'est créé avant les contrôles.
    const aCreer = type === 'onedrive' && !destinationPresente(destination);
    if (aCreer && !destinationPresente(path.dirname(destination))) {
      return bilan('absente', { message: `le dossier OneDrive ${path.dirname(destination)} n'existe pas (OneDrive arrêté ou délié de ce PC ?) : rien n'a été copié` });
    }
    if (!aCreer && !destinationPresente(destination)) {
      return bilan('absente', { message: `le dossier ${destination} n'existe pas (clé débranchée ?) : rien n'a été copié` });
    }
    const ouMesurer = aCreer ? path.dirname(destination) : destination;
    const inv = inventaire(dossierSauvegardes);
    const jeu = inv.jeux.find((j) => j.fichiers.base && j.fichiers.bilan && (!jour || j.jour === jour));
    if (!jeu) return bilan('rien-a-copier', { message: "aucune sauvegarde au format de nuit à copier (les copies d'ancien format ne partent pas hors disque)" });
    const aCopier = ['base', 'donnees', 'bilan'].map((p) => jeu.fichiers[p]).filter(Boolean);
    const taille = aCopier.reduce((n, f) => n + f.octets, 0);
    const place = placeLibre(ouMesurer);
    const requis = taille + MARGE_HORS_DISQUE;
    const memeDisque = racineVolume(ouMesurer) === racineVolume(dossierSauvegardes);
    const onedrive = type === 'onedrive' || sousOneDrive(ouMesurer);
    if (place.libre !== null && place.libre < requis) {
      return bilan('place-insuffisante', { jour: jeu.jour, octets: taille, libre: place.libre, requis, message: `${Math.round(place.libre / 1048576)} Mo libres, il en faut ${Math.round(requis / 1048576)} : rien n'a été copié` });
    }
    if (aCreer) avecReprise(() => fs.mkdirSync(destination));
    const attendu = lireEtat(path.join(dossierSauvegardes, jeu.fichiers.bilan.nom), { mettreDeCote: false });
    const copies = [];
    for (const f of aCopier) {
      const travail = path.join(destination, `${f.nom}.${process.pid}.en-cours`);
      try {
        const r = await copierAvecEmpreinte(path.join(dossierSauvegardes, f.nom), travail);
        if (r.octets !== f.octets) throw new Error(`${f.nom} : ${r.octets} octets copiés au lieu de ${f.octets}`);
        const empreinteAttendue = f === jeu.fichiers.base ? attendu?.base?.sha256Gz : f === jeu.fichiers.donnees ? attendu?.donnees?.sha256 : null;
        if (empreinteAttendue && r.sha256 !== empreinteAttendue) throw new Error(`${f.nom} : empreinte différente de celle du bilan (copie abîmée ?)`);
        avecReprise(() => fs.renameSync(travail, path.join(destination, f.nom)), { essais: 12 });
        copies.push({ nom: f.nom, octets: r.octets, sha256: r.sha256 });
      } catch (error) {
        try {
          supprimerFichier(travail);
        } catch {
          // laissé : il sera retiré par une prochaine copie
        }
        throw error;
      }
    }
    // Rotation LÀ-BAS : seulement nos jeux, les `garder` plus récents restent.
    const invDest = inventaire(destination);
    const supprimees = [];
    for (const vieux of invDest.jeux.filter((j) => j.fichiers.base && j.jour !== jeu.jour).slice(garder - 1)) {
      for (const f of Object.values(vieux.fichiers)) {
        const c = classerNom(f.nom);
        if (c?.type !== 'jeu' || c.jour !== vieux.jour) continue;
        supprimerFichier(path.join(destination, f.nom));
        supprimees.push(f.nom);
      }
    }
    const apres = placeLibre(destination);
    return bilan('faite', {
      jour: jeu.jour,
      octets: taille,
      fichiers: copies,
      supprimees,
      garder,
      copiesLaBas: inventaire(destination).jeux.filter((j) => j.fichiers.base).map((j) => ({ jour: j.jour, octets: j.octets })),
      libreApres: apres.libre,
      memeDisque: memeDisque && !onedrive,
      onedrive,
      dossierCree: aCreer
    });
  } catch (error) {
    return bilan('erreur', { message: String(error.message).slice(0, 300) });
  }
}
