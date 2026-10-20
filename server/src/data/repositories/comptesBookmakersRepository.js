/**
 * comptesBookmakersRepository.js — une FICHE PAR COMPTE BOOKMAKER (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * data/runtime/comptes-bookmakers.json :
 *   { comptes: { williamhill: { soldeDeclare, miseMaxAcceptee, limitation, majLe }, … } }
 *
 * Ce que Pierre sait de chacun de ses comptes, tapé par lui dans Réglages :
 *   - soldeDeclare      le solde qu'il déclare (euros), ou null ;
 *   - miseMaxAcceptee   la mise maximale que le bookmaker accepte, connue
 *                       (après une limitation, par exemple), ou null ;
 *   - limitation        « aucune », « limite » (mises réduites) ou « ferme » ;
 *   - majLe             la date de mise à jour, posée par l'appli.
 * Elle sert à SIGNALER un pari au-delà de la mise acceptée (ou du solde, ou
 * chez un compte fermé) — jamais à le refuser, jamais à agir sur un compte.
 *
 * JAMAIS DE SECRET : aucun identifiant, aucun mot de passe, aucun courriel,
 * aucune note libre (où un mot de passe pourrait se glisser). Seuls les trois
 * champs ci-dessus sont acceptés à l'écriture ; tout autre champ est refusé
 * (400) et rien n'est écrit. À la lecture, un champ inconnu (fichier modifié à
 * la main) n'est jamais rendu, et la prochaine écriture l'efface.
 * Écritures atomiques (atomicJson) ; fichier illisible : jamais pris pour vide.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { LIMITATIONS, ErreurGardeFous } from '../../core/risk/gardeFous.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER = path.resolve(__dirname, '../../../data/runtime/comptes-bookmakers.json');

export const fichierComptes = () => FICHIER;
/** Les seuls champs d'une fiche. */
export const CHAMPS_FICHE = Object.freeze(['soldeDeclare', 'miseMaxAcceptee', 'limitation']);
export const BORNES_FICHE = Object.freeze({ soldeDeclare: Object.freeze({ min: 0, max: 10_000_000 }), miseMaxAcceptee: Object.freeze({ min: 0.01, max: 1_000_000 }) });
/** Ce qui ressemble à un secret : refusé avec une phrase qui le dit. */
const RESSEMBLE_A_UN_SECRET = /pass|mdp|mot.?de.?passe|login|identifiant|utilisateur|user|e-?mail|courriel|token|jeton|secret|password|pin\b|code/i;

const cents = (x) => Math.round(x * 100) / 100;

function montantDeFiche(champ, valeur) {
  if (valeur === null || valeur === undefined) return null;
  const b = BORNES_FICHE[champ];
  if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur < b.min || valeur > b.max) {
    throw new ErreurGardeFous(`« ${champ} » : un montant en euros de ${b.min.toLocaleString('fr-FR')} à ${b.max.toLocaleString('fr-FR')}, ou null s'il n'est pas connu.`);
  }
  return cents(valeur);
}

/**
 * Le corps d'un PUT : les trois champs seulement (absents = non connus).
 * @returns {{ soldeDeclare: number|null, miseMaxAcceptee: number|null, limitation: string }}
 */
export function validerFiche(entree) {
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) {
    throw new ErreurGardeFous('Une fiche de compte est un objet { soldeDeclare, miseMaxAcceptee, limitation }.');
  }
  const inconnus = Object.keys(entree).filter((k) => !CHAMPS_FICHE.includes(k));
  if (inconnus.some((k) => RESSEMBLE_A_UN_SECRET.test(k))) {
    throw new ErreurGardeFous(
      `Refusé : ${inconnus.map((k) => `« ${k} »`).join(', ')}. Une fiche de compte ne garde JAMAIS d'identifiant, de mot de passe ni de courriel — seulement le solde déclaré, la mise maximale acceptée et la limitation.`
    );
  }
  if (inconnus.length) throw new ErreurGardeFous(`Champ inconnu : ${inconnus.map((k) => `« ${k} »`).join(', ')}. Une fiche n'a que « soldeDeclare », « miseMaxAcceptee » et « limitation ».`);
  const limitation = entree.limitation === undefined || entree.limitation === null ? 'aucune' : entree.limitation;
  if (!Object.hasOwn(LIMITATIONS, limitation)) throw new ErreurGardeFous(`« limitation » vaut ${Object.keys(LIMITATIONS).map((l) => `« ${l} »`).join(', ')}.`);
  return { soldeDeclare: montantDeFiche('soldeDeclare', entree.soldeDeclare), miseMaxAcceptee: montantDeFiche('miseMaxAcceptee', entree.miseMaxAcceptee), limitation };
}

const ficheVide = (f) => f.soldeDeclare === null && f.miseMaxAcceptee === null && f.limitation === 'aucune';

/** Une fiche lue dans le fichier : les trois champs (validés) et sa date ; un champ inconnu n'est pas rendu. */
function ficheLue(cle, brut) {
  try {
    const f = validerFiche(Object.fromEntries(CHAMPS_FICHE.filter((k) => k in (brut ?? {})).map((k) => [k, brut[k]])));
    return { ...f, majLe: typeof brut?.majLe === 'string' && Number.isFinite(Date.parse(brut.majLe)) ? brut.majLe : null };
  } catch (error) {
    throw new ErreurGardeFous(`fiche « ${cle} » illisible (${error.message})`, 503);
  }
}

/**
 * Les fiches enregistrées.
 * @returns {{ comptes: Record<string, object>, source: 'defaut'|'enregistre', fichier: string, champsIgnores: number }}
 * @throws {ErreurGardeFous} (503) fichier présent mais illisible
 */
export function lireComptes() {
  let brut;
  try {
    brut = readJsonFile(FICHIER, null);
  } catch (error) {
    throw new ErreurGardeFous(`Fiches des comptes bookmakers illisibles (${FICHIER}) : ${error.message}`, 503);
  }
  if (brut === null) return { comptes: {}, source: 'defaut', fichier: FICHIER, champsIgnores: 0 };
  if (!brut || typeof brut !== 'object' || Array.isArray(brut) || (brut.comptes !== undefined && (typeof brut.comptes !== 'object' || brut.comptes === null || Array.isArray(brut.comptes)))) {
    throw new ErreurGardeFous(`Fiches des comptes bookmakers illisibles (${FICHIER}) : forme inattendue — rien n'est écrit tant qu'elles ne le sont pas.`, 503);
  }
  const comptes = {};
  let champsIgnores = 0;
  try {
    for (const [cle, fiche] of Object.entries(brut.comptes ?? {})) {
      if (!/^[a-z0-9_]+$/.test(cle) || !fiche || typeof fiche !== 'object') throw new ErreurGardeFous(`fiche « ${cle} » illisible`, 503);
      champsIgnores += Object.keys(fiche).filter((k) => !CHAMPS_FICHE.includes(k) && k !== 'majLe').length;
      comptes[cle] = ficheLue(cle, fiche);
    }
  } catch (error) {
    throw new ErreurGardeFous(`Fiches des comptes bookmakers illisibles (${FICHIER}) : ${error.message} — rien n'est écrit tant qu'elles ne le sont pas.`, 503);
  }
  return { comptes, source: 'enregistre', fichier: FICHIER, champsIgnores };
}

/**
 * Enregistre la fiche d'un de vos bookmakers. Une fiche vide (rien de connu,
 * aucune limitation) est retirée. Même fiche : rien n'est écrit (la date de
 * mise à jour ne bouge pas).
 * @param {string} cle            la clé du bookmaker (williamhill…)
 * @param {object} entree         { soldeDeclare, miseMaxAcceptee, limitation }
 * @param {{ autorises: string[] }} options  vos bookmakers
 * @returns {{ cle, fiche: object|null, ecrit: boolean, fichier: string }}
 */
export function enregistrerCompte(cle, entree, { autorises = [] } = {}) {
  if (typeof cle !== 'string' || !/^[a-z0-9_]+$/.test(cle)) throw new ErreurGardeFous(`« ${cle} » : la clé d'un bookmaker (williamhill, unibet_nl…).`);
  if (!autorises.includes(cle)) throw new ErreurGardeFous(`« ${cle} » n'est pas un de vos bookmakers (Réglages › Paramètres du moteur).`, 404);
  const fiche = validerFiche(entree);
  const actuel = lireComptes();
  const avant = actuel.comptes[cle] ?? null;
  const memes = avant ? ['soldeDeclare', 'miseMaxAcceptee', 'limitation'].every((k) => avant[k] === fiche[k]) : ficheVide(fiche);
  if (memes && actuel.champsIgnores === 0) return { cle, fiche: avant, ecrit: false, fichier: FICHIER };
  const comptes = { ...actuel.comptes };
  if (ficheVide(fiche)) delete comptes[cle];
  else comptes[cle] = { ...fiche, majLe: memes && avant?.majLe ? avant.majLe : new Date().toISOString() };
  // Réécrit à partir des fiches LUES (trois champs et la date) : un champ inconnu du fichier n'y retourne jamais.
  writeJsonAtomic(FICHIER, { comptes: Object.fromEntries(Object.entries(comptes).map(([k, f]) => [k, { soldeDeclare: f.soldeDeclare, miseMaxAcceptee: f.miseMaxAcceptee, limitation: f.limitation, majLe: f.majLe }])) });
  return { cle, fiche: comptes[cle] ?? null, ecrit: true, fichier: FICHIER };
}
