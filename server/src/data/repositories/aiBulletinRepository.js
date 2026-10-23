/**
 * aiBulletinRepository.js — les textes du BULLETIN DU JOUR et du BILAN DE LA SEMAINE (étape 42 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * UN fichier, data/runtime/ai-bulletins.json, écrit par le SERVEUR seul (l'actualisation) :
 *   { version, majLe,
 *     bulletins: { 'AAAA-MM-JJ': entrée },          // un par jour de Paris
 *     bilans:    { 'AAAA-MM-JJ': entrée },          // un par semaine, clé = le LUNDI de la semaine couverte
 *     essais:    { 'bulletin:AAAA-MM-JJ': [...], 'bilan:AAAA-MM-JJ': [...] } }   // les essais RATÉS (appel en échec, schéma
 *                                                    // non respecté, texte refusé par la garde des chiffres)
 * Une entrée : { jour | semaine, ecritLe, modele, mode, texte: { titre, resume, sections: [...] } | null, sansAppel,
 *               fiche (le texte de la fiche telle que l'IA l'a lue), garde, usage, coutUsd, essai }.
 *
 * TOUJOURS PAR utils/atomicJson.js (le dossier est sous OneDrive) : lecture qui échoue plutôt que de passer pour vide,
 * écriture d'un bloc par fichier temporaire renommé. Un fichier présent mais ILLISIBLE (ou d'une autre forme) n'est
 * JAMAIS réécrit : toute écriture lève, l'étape le dit, et aucun appel à Claude ne part — un texte qu'on ne pourrait pas
 * ranger aurait coûté du quota pour rien.
 *
 * UNE FOIS PAR JOUR, UNE FOIS PAR SEMAINE : écrire un texte pour une clé qui en a déjà un est refusé (`deja-ecrit`) ; le
 * remplacer demande `remplacer: true`, que rien dans l'appli ne passe. C'est la dernière ligne de défense : la décision
 * « faut-il appeler Claude » vit dans core/ai/bulletinService.js, qui lit ce fichier avant chaque appel.
 *
 * Seuls les derniers textes sont gardés (GARDER_BULLETINS, GARDER_BILANS) ; les essais ratés des clés disparues avec eux.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_BULLETINS = path.resolve(__dirname, '../../../data/runtime/ai-bulletins.json');
export const VERSION_BULLETINS = 1;
/** Combien de bulletins et de bilans sont gardés (les plus récents) : un mois et un trimestre de lecture. */
export const GARDER_BULLETINS = 31;
export const GARDER_BILANS = 13;
/** Combien d'essais ratés sont gardés par clé (les plus récents). */
const GARDER_ESSAIS = 6;

const CLE_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Un fichier qu'on ne sait pas relire : la raison est dite, rien n'est écrit. */
export class BulletinsIllisibles extends Error {}

const vide = () => ({ version: VERSION_BULLETINS, majLe: null, bulletins: {}, bilans: {}, essais: {} });

const estUnTableauAssociatif = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Le fichier : { etat: 'absent' | 'lu' | 'illisible', donnees, erreur }. Absent : des données vides (jamais écrit). Illisible
 * ou de forme inconnue : `donnees` est null — personne ne l'écrasera. Ne lève jamais.
 */
export function lireLesBulletins({ fichier = FICHIER_BULLETINS } = {}) {
  let brut;
  try {
    brut = readJsonFile(fichier, null);
  } catch (error) {
    return { etat: 'illisible', donnees: null, erreur: error.message };
  }
  if (brut === null) return { etat: 'absent', donnees: vide(), erreur: null };
  const formeOk = estUnTableauAssociatif(brut) && estUnTableauAssociatif(brut.bulletins) && estUnTableauAssociatif(brut.bilans) && (brut.essais === undefined || estUnTableauAssociatif(brut.essais));
  if (!formeOk) return { etat: 'illisible', donnees: null, erreur: 'ai-bulletins.json a une forme inattendue : il n’est pas réécrit, à vérifier à la main.' };
  return { etat: 'lu', donnees: { ...vide(), ...brut, essais: brut.essais ?? {} }, erreur: null };
}

/** Les données à modifier, ou une erreur : jamais d'écriture sur un fichier qu'on n'a pas su lire. */
function aModifier(fichier) {
  const lu = lireLesBulletins({ fichier });
  if (lu.etat === 'illisible') throw new BulletinsIllisibles(lu.erreur);
  return structuredClone(lu.donnees);
}

/** Garde les `n` clés les plus récentes (les clés sont des dates AAAA-MM-JJ : l'ordre alphabétique est l'ordre du temps). */
function recentes(table, n) {
  const gardees = Object.keys(table).sort().slice(-n);
  return Object.fromEntries(gardees.map((k) => [k, table[k]]));
}

function ranger(donnees, maintenant) {
  donnees.bulletins = recentes(donnees.bulletins, GARDER_BULLETINS);
  donnees.bilans = recentes(donnees.bilans, GARDER_BILANS);
  // Les essais ratés d'une clé dont le texte n'est plus gardé disparaissent avec lui ; ceux d'une clé récente restent.
  const plusAncienBulletin = Object.keys(donnees.bulletins)[0] ?? '0000-00-00';
  const plusAncienBilan = Object.keys(donnees.bilans)[0] ?? '0000-00-00';
  for (const cle of Object.keys(donnees.essais)) {
    const [genre, jour] = cle.split(':');
    const limite = genre === 'bilan' ? plusAncienBilan : plusAncienBulletin;
    if (!CLE_JOUR.test(jour ?? '') || jour < limite) delete donnees.essais[cle];
    else donnees.essais[cle] = donnees.essais[cle].slice(-GARDER_ESSAIS);
  }
  donnees.version = VERSION_BULLETINS;
  donnees.majLe = new Date(maintenant).toISOString();
  return donnees;
}

function ecrireUneEntree(genre, cle, entree, { fichier, maintenant, remplacer }) {
  if (!CLE_JOUR.test(cle ?? '')) throw new Error(`Clé de ${genre} invalide : « ${cle} » (AAAA-MM-JJ attendu).`);
  const donnees = aModifier(fichier);
  const table = genre === 'bulletin' ? donnees.bulletins : donnees.bilans;
  if (table[cle] && !remplacer) return { ecrit: false, raison: 'deja-ecrit', entree: table[cle] };
  table[cle] = entree;
  // Un texte écrit efface les essais ratés de sa clé : la clé est faite.
  delete donnees.essais[`${genre}:${cle}`];
  writeJsonAtomic(fichier, ranger(donnees, maintenant));
  return { ecrit: true, raison: null, entree };
}

/**
 * Range le bulletin d'un jour. Refusé (`ecrit: false`, `deja-ecrit`) s'il y en a déjà un, sauf `remplacer: true`.
 * Lève BulletinsIllisibles si le fichier ne se relit pas.
 */
export function ecrireUnBulletin(jour, entree, { fichier = FICHIER_BULLETINS, maintenant = Date.now(), remplacer = false } = {}) {
  return ecrireUneEntree('bulletin', jour, entree, { fichier, maintenant, remplacer });
}

/** Range le bilan d'une semaine (clé = son lundi). Mêmes règles que le bulletin. */
export function ecrireUnBilan(lundi, entree, { fichier = FICHIER_BULLETINS, maintenant = Date.now(), remplacer = false } = {}) {
  return ecrireUneEntree('bilan', lundi, entree, { fichier, maintenant, remplacer });
}

/** Note un essai RATÉ (appel en échec, schéma non respecté, chiffres refusés) : { at, type, raison, ... }. Rend le nombre d'essais de la clé. */
export function noterUnEssaiRate(genre, cle, essai, { fichier = FICHIER_BULLETINS, maintenant = Date.now() } = {}) {
  if (genre !== 'bulletin' && genre !== 'bilan') throw new Error(`Genre inconnu : « ${genre} ».`);
  if (!CLE_JOUR.test(cle ?? '')) throw new Error(`Clé invalide : « ${cle} ».`);
  const donnees = aModifier(fichier);
  const liste = (donnees.essais[`${genre}:${cle}`] ??= []);
  liste.push({ at: new Date(maintenant).toISOString(), ...essai });
  writeJsonAtomic(fichier, ranger(donnees, maintenant));
  return liste.length;
}

/** Les essais ratés d'une clé (les derniers gardés). */
export function essaisRates(donnees, genre, cle) {
  return donnees?.essais?.[`${genre}:${cle}`] ?? [];
}
