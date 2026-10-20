/**
 * destinationHorsDisque.js — OÙ part la copie hebdomadaire hors du disque.
 * -----------------------------------------------------------------------
 * Complément de l'étape 1 du plan (05/10/2026). Décision de Pierre, qui n'a
 * pas de clé USB : pour le moment, la copie part sur son ONEDRIVE ; il doit
 * pouvoir passer plus tard à une clé USB (ou un autre dossier) depuis
 * l'écran Réglages › Sauvegardes, et ne JAMAIS avoir à modifier server/.env.
 *
 * TROIS CHOIX, enregistrés par l'appli dans data/runtime/sauvegarde-hors-disque.json
 * (réglage NON secret : un type et un chemin ; écriture sûre par atomicJson.js) :
 *   onedrive  le dossier %OneDrive%\CoteMaster-sauvegardes, créé au besoin
 *             (hors du dossier du projet), UNE seule copie gardée là-bas :
 *             écrite sur ce même disque, puis envoyée en ligne par OneDrive ;
 *   dossier   une clé USB ou un autre dossier, qui doit exister : 2 copies au
 *             plus (CM_SAUVEGARDE_HORS_DISQUE_GARDER=1 pour une seule) ;
 *   aucune    pas de copie hors du disque, et plus d'alerte.
 *
 * ORDRE DE PRIORITÉ :
 *   1. l'option --hors-disque <dossier> d'un lancement à la main de
 *      scripts/backup-db.mjs (pour cette fois) ;
 *   2. le choix enregistré depuis l'écran ;
 *   3. la variable CM_SAUVEGARDE_HORS_DISQUE (server/.env), si elle existe ;
 *   4. PAR DÉFAUT, OneDrive quand il est détecté (variables OneDriveConsumer
 *      puis OneDrive de Windows, dossier existant) : la décision de Pierre
 *      s'applique sans qu'il ait rien à toucher ;
 *   5. sinon « non réglée » (une alerte le rappelle).
 *
 * DOSSIERS INTERDITS, au moment du choix comme à celui de copier
 * (fichiersSauvegarde.raisonInterdite) : le dossier des sauvegardes (ni lui,
 * ni dedans, ni un dossier qui le contient), un dossier du projet (le code et
 * ses données d'exécution) et, dans le bac à sable, tout dossier hors du bac.
 *
 * ESSAIS : CM_TEST_ONEDRIVE=<dossier> remplace entièrement le dossier
 * OneDrive détecté par un faux dossier ; dans le bac, il doit être DANS le
 * bac (le garde-fou refuse le reste). Jamais posé chez Pierre.
 *
 * Rien n'est gardé en mémoire : le fichier est relu à chaque fois. Un fichier
 * de choix illisible (tenu par OneDrive, abîmé) n'est JAMAIS pris pour « pas
 * de choix » : pas de copie hors disque tant qu'il l'est, une alerte le dit,
 * et le prochain choix enregistré le met de côté avant d'écrire.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { env as configuration } from '../../config/env.js';
import { estDans, cheminReel } from '../../config/bacASable.js';
import { resolveDbPath } from '../db/matchStatsDb.js';
import { HORS_DISQUE_MAX } from './planSauvegardes.js';
import * as f from './fichiersSauvegarde.js';

export const NOM_FICHIER_REGLAGE = 'sauvegarde-hors-disque.json';
export const SOUS_DOSSIER_ONEDRIVE = 'CoteMaster-sauvegardes';
/** Copies gardées sur OneDrive (décision de Pierre) ; sur un dossier : HORS_DISQUE_MAX (2) au plus. */
export const GARDER_ONEDRIVE = 1;
export const TYPES = Object.freeze(['onedrive', 'dossier', 'aucune']);
export const VARIABLE = 'CM_SAUVEGARDE_HORS_DISQUE';
export const VARIABLE_ESSAI_ONEDRIVE = 'CM_TEST_ONEDRIVE';
const LONGUEUR_MAX = 400;

/** Un choix refusé (400 pour la route), à distinguer d'une panne (500 : disque, fichier tenu). */
export class DestinationInvalide extends Error {}

export const fichierReglage = (dossierDonnees = f.DOSSIER_DONNEES) => path.join(dossierDonnees, NOM_FICHIER_REGLAGE);

const garderSurDossier = (n) => Math.min(HORS_DISQUE_MAX, Math.max(1, Number(n) || HORS_DISQUE_MAX));
const mo = (o) => `${Math.round(Number(o ?? 0) / 1048576).toLocaleString('fr-FR')} Mo`;

/**
 * Un chemin de dossier tapé à l'écran : guillemets de « Copier en tant que
 * chemin » retirés, ABSOLU (lettre de lecteur ou partage réseau), résolu.
 * Rend { ok: true, chemin } ou { ok: false, raison }.
 */
export function normaliserChemin(valeur) {
  let v = typeof valeur === 'string' ? valeur.trim() : '';
  if (/^"[^"]*"$/.test(v)) v = v.slice(1, -1).trim();
  if (!v) return { ok: false, raison: 'indiquez le dossier (par exemple E:\\CoteMaster-sauvegardes pour une clé USB)' };
  if (v.length > LONGUEUR_MAX) return { ok: false, raison: `chemin trop long (plus de ${LONGUEUR_MAX} caractères)` };
  const absolu = process.platform === 'win32' ? /^(?:[a-zA-Z]:[\\/]|\\\\[^\\/?.][^\\/]*[\\/][^\\/]+)/.test(v) : path.isAbsolute(v);
  if (!absolu) {
    return { ok: false, raison: `« ${v} » n'est pas un chemin absolu : il faut la lettre du lecteur (E:\\…) ou un partage réseau (\\\\serveur\\partage\\…)` };
  }
  return { ok: true, chemin: path.resolve(v) };
}

/**
 * OneDrive sur ce PC : le dossier que Windows indique — OneDriveConsumer (le
 * OneDrive personnel), sinon OneDrive —, s'il existe. CM_TEST_ONEDRIVE le
 * remplace entièrement (les vraies variables ne sont alors plus lues).
 * Rend { detecte, racine, variable, essai, raison }.
 */
export function detecterOneDrive(environnement = process.env) {
  const essai = String(environnement[VARIABLE_ESSAI_ONEDRIVE] ?? '').trim();
  const candidats = essai
    ? [[VARIABLE_ESSAI_ONEDRIVE, essai]]
    : ['OneDriveConsumer', 'OneDrive'].map((nom) => [nom, String(environnement[nom] ?? '').trim()]).filter(([, valeur]) => valeur);
  if (!candidats.length) {
    return { detecte: false, racine: null, variable: null, essai: false, raison: "OneDrive n'est pas détecté sur ce PC (variables OneDriveConsumer et OneDrive de Windows absentes)" };
  }
  for (const [variable, valeur] of candidats) {
    const c = normaliserChemin(valeur);
    if (c.ok && f.destinationPresente(c.chemin)) return { detecte: true, racine: c.chemin, variable, essai: Boolean(essai), raison: null };
  }
  const [variable, valeur] = candidats[0];
  return { detecte: false, racine: null, variable, essai: Boolean(essai), raison: `OneDrive n'est pas détecté : le dossier ${valeur} (variable ${variable}) n'existe pas` };
}

/**
 * Le choix enregistré : null s'il n'y en a pas, { type, chemin, majLe }, ou
 * { illisible: raison } — jamais confondu avec « pas de choix ».
 */
export function lireChoix(fichier = fichierReglage()) {
  let brut;
  try {
    brut = readJsonFile(fichier, null);
  } catch (error) {
    return { illisible: error.message };
  }
  if (brut === null) return null;
  const nom = path.basename(fichier);
  if (typeof brut !== 'object' || Array.isArray(brut) || !TYPES.includes(brut.type)) {
    return { illisible: `${nom} a une forme inattendue (type ${JSON.stringify(brut?.type ?? null)}) : rien n'est copié hors du disque tant qu'il l'a` };
  }
  if (brut.type !== 'dossier') return { type: brut.type, chemin: null, majLe: brut.majLe ?? null };
  const c = normaliserChemin(brut.chemin);
  if (!c.ok) return { illisible: `${nom} : chemin du dossier invalide (${c.raison})` };
  return { type: 'dossier', chemin: c.chemin, majLe: brut.majLe ?? null };
}

/**
 * La destination qui s'applique, d'après l'ordre de priorité (en-tête).
 *   argument        --hors-disque d'un lancement à la main, ou null
 *   choix           résultat de lireChoix()
 *   valeurVariable  valeur de CM_SAUVEGARDE_HORS_DISQUE
 *   environnement   pour détecter OneDrive
 *   garderDossier   copies gardées sur un dossier (1 ou 2)
 * Rend { reglage: 'configuree'|'refusee'|'non-configuree'|'illisible', type:
 * 'onedrive'|'dossier'|'aucune'|null, destination, garder, source:
 * 'argument'|'reglage'|'variable'|'defaut-onedrive'|'aucune', onedrive,
 * choix, probleme }. `destination` est null pour « onedrive » quand OneDrive
 * n'est pas détecté (probleme dit pourquoi).
 */
export function resoudreDestination({ argument = null, choix = null, valeurVariable = '', environnement = process.env, garderDossier = HORS_DISQUE_MAX } = {}) {
  const onedrive = detecterOneDrive(environnement);
  const garder = garderSurDossier(garderDossier);
  const commun = { onedrive, choix: choix && !choix.illisible ? choix : null, probleme: null };
  const depuisValeur = (valeur, source) => {
    const r = f.reglageHorsDisque(valeur);
    return r.reglage === 'refusee'
      ? { ...commun, reglage: 'refusee', type: 'aucune', destination: null, garder: null, source }
      : { ...commun, reglage: 'configuree', type: 'dossier', destination: r.destination, garder, source };
  };
  const versOneDrive = (source) =>
    onedrive.detecte
      ? { ...commun, reglage: 'configuree', type: 'onedrive', destination: path.join(onedrive.racine, SOUS_DOSSIER_ONEDRIVE), garder: GARDER_ONEDRIVE, source }
      : { ...commun, reglage: 'configuree', type: 'onedrive', destination: null, garder: GARDER_ONEDRIVE, source, probleme: onedrive.raison };

  if (String(argument ?? '').trim()) return depuisValeur(argument, 'argument');
  if (choix?.illisible) return { ...commun, reglage: 'illisible', type: null, destination: null, garder: null, source: 'reglage', probleme: choix.illisible };
  if (choix?.type === 'aucune') return { ...commun, reglage: 'refusee', type: 'aucune', destination: null, garder: null, source: 'reglage' };
  if (choix?.type === 'onedrive') return versOneDrive('reglage');
  if (choix?.type === 'dossier') return { ...commun, reglage: 'configuree', type: 'dossier', destination: choix.chemin, garder, source: 'reglage' };
  if (String(valeurVariable ?? '').trim()) return depuisValeur(valeurVariable, 'variable');
  if (onedrive.detecte) return versOneDrive('defaut-onedrive');
  return { ...commun, reglage: 'non-configuree', type: null, destination: null, garder: null, source: 'aucune', probleme: onedrive.raison };
}

/** La destination en vigueur pour ce processus : fichier de choix, variable, OneDrive. */
export function destinationEnVigueur({
  argument = null,
  dossierDonnees = f.DOSSIER_DONNEES,
  environnement = process.env,
  valeurVariable = configuration.sauvegarde.horsDisque,
  garderDossier = configuration.sauvegarde.horsDisqueGarder
} = {}) {
  const fichier = fichierReglage(dossierDonnees);
  // Avec --hors-disque, le fichier de choix n'est même pas lu.
  const choix = String(argument ?? '').trim() ? null : lireChoix(fichier);
  return {
    ...resoudreDestination({ argument, choix, valeurVariable, environnement, garderDossier }),
    fichierReglage: fichier,
    variable: VARIABLE,
    variableEssai: VARIABLE_ESSAI_ONEDRIVE,
    // Ce que garderait une clé USB ou un autre dossier (OneDrive : toujours GARDER_ONEDRIVE).
    garderDossier: garderSurDossier(garderDossier)
  };
}

/** Le dossier des sauvegardes de ce processus (à côté de la base ; celui du bac dans le bac). */
const dossierSauvegardesEnVigueur = () => f.dossierSauvegardesParDefaut(resolveDbPath());

/**
 * Cette destination est-elle utilisable MAINTENANT ? Rien n'est écrit : ni
 * dossier créé, ni fichier d'essai. Mesures immédiates : existence, place
 * libre (sur la destination, ou sur OneDrive quand son dossier dédié reste à
 * créer), même disque que les sauvegardes, OneDrive détecté.
 *   tailleCopie  ce que pèse une copie (dernier jeu), ou null s'il n'y en a pas encore
 * Rend { type, destination, utilisable, existe, aCreer, garder, onedrive,
 * sousOneDrive, memeDisque, libre, total, tailleCopie, requis,
 * placeSuffisante, problemes: [{ code, texte }], avertissements, verifieLe }.
 */
export function verifierDestination({
  type,
  chemin = null,
  environnement = process.env,
  dossierSauvegardes = null,
  tailleCopie = null,
  garderDossier = configuration.sauvegarde.horsDisqueGarder,
  maintenant = new Date()
} = {}) {
  const v = {
    type,
    destination: null,
    utilisable: false,
    existe: null,
    aCreer: false,
    garder: null,
    onedrive: detecterOneDrive(environnement),
    sousOneDrive: false,
    memeDisque: null,
    libre: null,
    total: null,
    tailleCopie: tailleCopie ?? null,
    requis: null,
    placeSuffisante: null,
    problemes: [],
    avertissements: [],
    verifieLe: maintenant.toISOString()
  };
  const probleme = (code, texte) => v.problemes.push({ code, texte });

  if (type === 'aucune') {
    v.utilisable = true;
    v.avertissements.push('Pas de copie hors du disque : les sauvegardes ne vivent que sur ce disque, et aucune alerte ne le rappellera.');
    return v;
  }
  if (type === 'onedrive') {
    v.garder = GARDER_ONEDRIVE;
    if (!v.onedrive.detecte) {
      probleme('onedrive-absent', v.onedrive.raison);
      return v;
    }
    v.destination = path.join(v.onedrive.racine, SOUS_DOSSIER_ONEDRIVE);
  } else if (type === 'dossier') {
    v.garder = garderSurDossier(garderDossier);
    const c = normaliserChemin(chemin);
    if (!c.ok) {
      probleme('chemin', c.raison);
      return v;
    }
    v.destination = c.chemin;
  } else {
    probleme('type', `type de destination inconnu : ${JSON.stringify(type ?? null)} (onedrive, dossier ou aucune)`);
    return v;
  }

  const interdite = f.raisonInterdite(v.destination, { dossierSauvegardes });
  if (interdite) {
    const essai = type === 'onedrive' && f.bacActif() && !v.onedrive.essai ? ` (pour un essai dans le bac, ${VARIABLE_ESSAI_ONEDRIVE}=<un dossier du bac> remplace OneDrive)` : '';
    probleme('interdit', `${interdite.replace(/\.$/, '')}${essai}`);
  }
  v.existe = f.destinationPresente(v.destination);
  if (!v.existe) {
    // Le dossier dédié de OneDrive se crée à la première copie ; un dossier
    // choisi (clé USB) doit exister : il n'est jamais créé.
    if (type === 'onedrive' && !fs.existsSync(v.destination)) v.aCreer = true;
    else probleme('absent', fs.existsSync(v.destination) ? `${v.destination} n'est pas un dossier` : `le dossier ${v.destination} n'existe pas (clé débranchée ?)`);
  }
  v.sousOneDrive = type === 'onedrive';
  const ouMesurer = interdite ? null : v.existe ? v.destination : v.aCreer ? v.onedrive.racine : null;
  if (ouMesurer) {
    const p = f.placeLibre(ouMesurer);
    v.libre = p.libre;
    v.total = p.total;
    v.requis = v.tailleCopie === null ? null : v.tailleCopie + f.MARGE_HORS_DISQUE;
    v.placeSuffisante = v.libre === null || v.requis === null ? null : v.libre >= v.requis;
    if (v.placeSuffisante === false) {
      probleme('place-insuffisante', `${mo(v.libre)} libres sur ${ouMesurer}, il en faut ${mo(v.requis)} (la dernière sauvegarde, ${mo(v.tailleCopie)}, plus 512 Mo de marge)`);
    }
    const racine = v.onedrive.detecte ? cheminReel(v.onedrive.racine) : null;
    const reel = cheminReel(ouMesurer);
    v.sousOneDrive = type === 'onedrive' || (racine !== null && (f.memeDossier(reel, racine) || estDans(reel, racine))) || f.sousOneDrive(ouMesurer);
    v.memeDisque = dossierSauvegardes ? f.racineVolume(ouMesurer) === f.racineVolume(dossierSauvegardes) : null;
  }
  if (type === 'dossier' && v.sousOneDrive) {
    v.avertissements.push('Ce dossier est dans OneDrive : le choix « OneDrive (en ligne) » fait la même chose, avec une seule copie gardée.');
  } else if (type === 'dossier' && v.memeDisque) {
    v.avertissements.push("Ce dossier est sur le même disque que les sauvegardes : il ne protège pas d'une panne de ce disque (une clé USB, si).");
  }
  v.utilisable = v.problemes.length === 0;
  return v;
}

/** La vérification demandée par l'écran (bouton « Vérifier ») : rien n'est écrit. */
export function verifierChoix({ type, chemin = null } = {}, { dossierSauvegardes, environnement = process.env, maintenant = new Date() } = {}) {
  if (!TYPES.includes(type)) throw new DestinationInvalide('"type" doit valoir onedrive, dossier ou aucune.');
  const sauv = dossierSauvegardes === undefined ? dossierSauvegardesEnVigueur() : dossierSauvegardes;
  return verifierDestination({ type, chemin, environnement, dossierSauvegardes: sauv, tailleCopie: sauv ? f.tailleDernierJeu(sauv) : null, maintenant });
}

const premiereMajuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Enregistre le choix fait à l'écran (PUT idempotent : le même choix ne
 * réécrit rien). Refusé (DestinationInvalide) : type inconnu ; « dossier »
 * sans chemin absolu, interdit ou inexistant (clé débranchée) ; « onedrive »
 * quand OneDrive n'est pas détecté ou que son dossier est interdit (hors du
 * bac, dans le bac à sable). Une place insuffisante n'empêche pas
 * d'enregistrer : la copie de la nuit le redira, sans rien écrire.
 * Un ancien fichier illisible est mis de côté, jamais écrasé en silence.
 * Rend { change, choix, fichier }.
 */
export function enregistrerChoix({ type, chemin = null } = {}, { dossierDonnees = f.DOSSIER_DONNEES, dossierSauvegardes, environnement = process.env, maintenant = new Date() } = {}) {
  if (!TYPES.includes(type)) throw new DestinationInvalide('"type" doit valoir onedrive, dossier ou aucune.');
  let cheminFinal = null;
  if (type !== 'aucune') {
    const sauv = dossierSauvegardes === undefined ? dossierSauvegardesEnVigueur() : dossierSauvegardes;
    const v = verifierDestination({ type, chemin, environnement, dossierSauvegardes: sauv, tailleCopie: null, maintenant });
    const bloquants = v.problemes.filter((p) => p.code !== 'place-insuffisante');
    if (bloquants.length) throw new DestinationInvalide(`${premiereMajuscule(bloquants.map((p) => p.texte).join(' ; '))}.`);
    if (type === 'dossier') cheminFinal = v.destination;
  }
  const fichier = fichierReglage(dossierDonnees);
  const actuel = lireChoix(fichier);
  if (actuel && !actuel.illisible && actuel.type === type && (type !== 'dossier' || f.memeDossier(actuel.chemin, cheminFinal))) {
    return { change: false, choix: actuel, fichier };
  }
  f.gardeEcriture(fichier, 'enregistrement du choix de la destination hors disque');
  if (actuel?.illisible && fs.existsSync(fichier)) {
    const cote = fichier.replace(/\.json$/, `.illisible-${maintenant.toISOString().replace(/[:.]/g, '-')}.json`);
    f.avecReprise(() => fs.renameSync(fichier, cote));
  }
  const choix = { version: 1, type, chemin: cheminFinal, majLe: maintenant.toISOString() };
  writeJsonAtomic(fichier, choix);
  return { change: true, choix: { type, chemin: cheminFinal, majLe: choix.majLe }, fichier };
}
