/**
 * footballDataCache.js — les fichiers CSV de football-data.co.uk gardés sur le disque.
 * -----------------------------------------------------------------------
 * Étape 13 du plan (06/10/2026). Un fichier de football-data ne se
 * télécharge qu'une fois : l'historique depuis 2000 (footballDataHistory.js)
 * relit ici ce que l'étape « cotes passées » (footballDataOdds.js, toutes les
 * douze heures) vient de télécharger, au lieu de le redemander au site.
 *
 * OÙ : à côté de la base, jamais dans le dépôt Git ni sous OneDrive —
 *   la vraie appli : %USERPROFILE%\CoteMaster\football-data\
 *   le bac à sable : bac-a-sable\base\football-data\
 *   un essai       : le dossier de sa copie de base.
 * Un fichier y est rangé sous son chemin chez la source :
 * mmz4281\2627\E0.csv, new\ARG.csv. Les octets sont gardés tels que le site
 * les a envoyés (l'encodage se décide à la lecture : UTF-8 récent, Windows
 * 1252 pour certains fichiers anciens). ~600 fichiers, 60 à 100 Mo.
 *
 * ÉCRITURE D'UN BLOC : brouillon puis renommage, jamais un fichier à moitié
 * écrit. La date du fichier (mtime) est l'heure du téléchargement ; un
 * contenu identique n'est pas réécrit, seule sa date est remise à l'heure.
 * Rien ici ne lève : un cache illisible ou plein n'empêche jamais un relevé
 * de cotes de se faire, il se retélécharge simplement plus tard.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDbPath } from '../db/matchStatsDb.js';

export const NOM_DOSSIER = 'football-data';
const MOTIF_URL = /football-data\.co\.uk\/((?:mmz4281\/\d{4}\/[A-Z0-9]{1,4})|(?:new\/[A-Z]{3}))\.csv$/i;

export const sha1 = (octets) => crypto.createHash('sha1').update(octets).digest('hex');

/** Le dossier du cache : à côté de la base ouverte (`database`), sinon de celle que désigne resolveDbPath. */
export function dossierCache({ database = null, base = null } = {}) {
  let fichier = base;
  if (!fichier && database && typeof database.location === 'function') {
    try {
      fichier = database.location();
    } catch {
      fichier = null;
    }
  }
  return path.join(path.dirname(path.resolve(fichier || resolveDbPath())), NOM_DOSSIER);
}

/** « mmz4281/2627/E0 » ou « new/ARG » pour une adresse du site, sinon null. */
export function nomDuFichier(url) {
  const m = String(url ?? '').match(MOTIF_URL);
  return m ? m[1] : null;
}

/** Chemin local d'une adresse du site (null si l'adresse n'est pas un fichier de données). */
export function cheminDansLeCache(url, dossier) {
  const nom = nomDuFichier(url);
  return nom ? path.join(dossier, ...`${nom}.csv`.split('/')) : null;
}

/**
 * Range les octets d'un fichier téléchargé. Rend { fichier, octets, sha1,
 * nouveau } ou null (adresse inconnue, disque en erreur) — sans jamais lever.
 * `version` : l'en-tête Last-Modified du site, gardé à côté (facultatif).
 */
export function deposerDansLeCache(url, octets, { database = null, dossier = null, version = null, maintenant = new Date() } = {}) {
  try {
    const cible = cheminDansLeCache(url, dossier ?? dossierCache({ database }));
    if (!cible || !octets?.length) return null;
    const empreinte = sha1(octets);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    let identique = false;
    try {
      identique = fs.statSync(cible).size === octets.length && sha1(fs.readFileSync(cible)) === empreinte;
    } catch {
      identique = false;
    }
    if (!identique) {
      const brouillon = `${cible}.${process.pid}.tmp`;
      fs.writeFileSync(brouillon, octets);
      fs.renameSync(brouillon, cible);
    }
    // L'heure du relevé : celle du fichier (même inchangé, il vient d'être vérifié auprès du site).
    fs.utimesSync(cible, maintenant, maintenant);
    if (version) {
      try {
        fs.writeFileSync(`${cible}.version`, String(version));
      } catch {
        // la version n'est qu'une information
      }
    }
    return { fichier: cible, octets: octets.length, sha1: empreinte, nouveau: !identique };
  } catch {
    return null;
  }
}

/** Le fichier gardé pour une adresse : { fichier, octets (Buffer), lu (ISO), version } ou null. */
export function lireDuCache(url, { database = null, dossier = null } = {}) {
  const cible = cheminDansLeCache(url, dossier ?? dossierCache({ database }));
  if (!cible) return null;
  try {
    const info = fs.statSync(cible);
    let version = null;
    try {
      version = fs.readFileSync(`${cible}.version`, 'utf8').trim() || null;
    } catch {
      version = null;
    }
    return { fichier: cible, octets: fs.readFileSync(cible), lu: new Date(info.mtimeMs).toISOString(), version, taille: info.size };
  } catch {
    return null;
  }
}

/** Date du fichier gardé (ISO), sans le lire ; null s'il n'existe pas. */
export function dateDansLeCache(url, { database = null, dossier = null } = {}) {
  const cible = cheminDansLeCache(url, dossier ?? dossierCache({ database }));
  if (!cible) return null;
  try {
    return new Date(fs.statSync(cible).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

/** Nombre de fichiers et octets du cache (pour l'écran). */
export function tailleDuCache({ database = null, dossier = null } = {}) {
  const racine = dossier ?? dossierCache({ database });
  let fichiers = 0;
  let octets = 0;
  try {
    for (const e of fs.readdirSync(racine, { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !/\.csv$/i.test(e.name)) continue;
      fichiers++;
      try {
        octets += fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size;
      } catch {
        // fichier retiré entre-temps
      }
    }
  } catch {
    return { dossier: racine, fichiers: 0, octets: 0 };
  }
  return { dossier: racine, fichiers, octets };
}
