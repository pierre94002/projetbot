/**
 * aiDossiersRepository.js — les DOSSIERS DE LA MÉMOIRE DE L'IA (étape 44 du plan, 23/10/2026).
 * -----------------------------------------------------------------------
 * UN fichier, data/runtime/ai-dossiers.json, écrit par le SERVEUR seul (l'étape « dossiersIA » de l'actualisation) :
 *   { version, calculeLe, regles,
 *     equipes:      { 'fotmob-9825': dossier },     // par IDENTIFIANT FotMob, jamais par le nom
 *     championnats: { 'EPL': dossier },             // par libellé de compétition du magasin
 *     lecons:       { '<analyse>|<marché>@<portée>': état },   // l'état gardé de chaque leçon dans chaque portée
 *     bilan }                                        // ce qu'a fait la dernière nuit
 *
 * POURQUOI UN FICHIER, ET PAS UNE TABLE DU MAGASIN (choix de l'étape) : c'est du TEXTE pour l'IA, de la même famille
 * que le carnet de l'IA (carnet-ia.json) et les bulletins (ai-bulletins.json) ; la base des chiffres n'a ainsi aucun
 * écrivain de plus (trois incidents du journal WAL : la nuit des dossiers ne fait que LIRE la base) ; et « le moteur
 * ne lit jamais les dossiers » se vérifie sur un nom de fichier. Le fichier est petit (quelques Mo), réécrit une fois
 * par nuit ; il est À PART de match-ai-analyses.json, déjà lourd et réécrit en entier à chaque analyse.
 *
 * TOUJOURS PAR utils/atomicJson.js (le dossier est sous OneDrive) : une lecture qui échoue n'est jamais prise pour
 * un fichier vide ; un fichier présent mais ILLISIBLE (ou d'une autre forme) n'est JAMAIS réécrit — l'étape le dit,
 * les analyses partent avec la fiche d'avant (les trois dernières leçons), rien ne se perd.
 * Lecture mise en cache par date de modification (chaque analyse d'avant-match lit deux équipes et un championnat).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { VERSION_DOSSIERS } from '../../core/ai/aiMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_DOSSIERS = path.resolve(__dirname, '../../../data/runtime/ai-dossiers.json');

/** Un fichier qu'on ne sait pas relire : la raison est dite, rien n'est écrit. */
export class DossiersIllisibles extends Error {}

const estUnObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
export const dossiersVides = () => ({ version: VERSION_DOSSIERS, calculeLe: null, regles: null, equipes: {}, championnats: {}, lecons: {}, bilan: null });

let cache = { fichier: null, mtimeMs: undefined, lu: null };

function mtime(fichier) {
  try {
    return fs.statSync(fichier).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Le fichier : { etat: 'absent' | 'lu' | 'illisible' | 'autreVersion', donnees, erreur }. Absent : des données vides
 * (jamais écrit). Illisible ou de forme inconnue : `donnees` null — personne ne l'écrasera. Ne lève jamais.
 */
export function lireLesDossiers({ fichier = FICHIER_DOSSIERS } = {}) {
  const m = mtime(fichier);
  if (cache.fichier === fichier && cache.mtimeMs === m && cache.lu) return cache.lu;
  let lu;
  let brut;
  try {
    brut = readJsonFile(fichier, null);
  } catch (error) {
    lu = { etat: 'illisible', donnees: null, erreur: error.message };
  }
  if (!lu) {
    if (brut === null) lu = { etat: 'absent', donnees: dossiersVides(), erreur: null };
    else if (!estUnObjet(brut) || !estUnObjet(brut.equipes) || !estUnObjet(brut.championnats) || !estUnObjet(brut.lecons ?? {}))
      lu = { etat: 'illisible', donnees: null, erreur: 'ai-dossiers.json a une forme inattendue : il n’est pas réécrit, à vérifier à la main.' };
    // Une autre forme du calcul : relue pour l'écran, refaite en entier la nuit suivante, jamais remise à l'IA.
    else if (brut.version !== VERSION_DOSSIERS) lu = { etat: 'autreVersion', donnees: { ...dossiersVides(), ...brut, lecons: brut.lecons ?? {} }, erreur: null };
    else lu = { etat: 'lu', donnees: { ...dossiersVides(), ...brut, lecons: brut.lecons ?? {} }, erreur: null };
  }
  cache = { fichier, mtimeMs: m, lu };
  return lu;
}

/** Écrit le fichier d'un bloc. Lève DossiersIllisibles si le fichier présent ne se relit pas (il n'est jamais écrasé). */
export function ecrireLesDossiers(donnees, { fichier = FICHIER_DOSSIERS } = {}) {
  const avant = lireLesDossiers({ fichier });
  if (avant.etat === 'illisible') throw new DossiersIllisibles(avant.erreur);
  writeJsonAtomic(fichier, donnees, { indent: 0 });
  cache = { fichier: null, mtimeMs: undefined, lu: null };
  return { octets: mtime(fichier) === null ? 0 : fs.statSync(fichier).size };
}

/**
 * Les dossiers d'une analyse : ceux des deux clubs (par identifiant FotMob) et du championnat, ou null chacun.
 * { etat, calculeLe, home, away, championnat }. Ne lève JAMAIS : une analyse ne doit pas échouer pour sa mémoire.
 */
export function dossiersPour({ homeId = null, awayId = null, league = null, fichier = FICHIER_DOSSIERS } = {}) {
  try {
    const { etat, donnees } = lireLesDossiers({ fichier });
    if (etat !== 'lu') return { etat, calculeLe: donnees?.calculeLe ?? null, home: null, away: null, championnat: null };
    return {
      etat,
      calculeLe: donnees.calculeLe,
      home: homeId ? donnees.equipes[homeId] ?? null : null,
      away: awayId ? donnees.equipes[awayId] ?? null : null,
      championnat: league ? donnees.championnats[league] ?? null : null
    };
  } catch (error) {
    return { etat: 'illisible', erreur: error.message, calculeLe: null, home: null, away: null, championnat: null };
  }
}

/** Pour les tests : oublier le cache. */
export const __testing = { oublier: () => (cache = { fichier: null, mtimeMs: undefined, lu: null }) };
