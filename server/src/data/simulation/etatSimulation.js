/**
 * etatSimulation.js — L'ÉTAT DE LA SIMULATION (étape 28 du plan, conception §4.3 et §4.6) : la table simulation_state.
 * -----------------------------------------------------------------------
 * Une clé, une valeur (texte ; JSON pour un objet). Écrite par le SERVEUR seul : les interrupteurs de l'affichage
 * (au clic, PUT /api/simulation/affichage) et les nuits (le rangement de simulationNuit.js). JAMAIS dans
 * engine-config.json : un clic ne change ni l'empreinte des réglages du moteur, ni ses versions, ni l'essai de
 * l'étape 27 (T15).
 *   affichage_saisons   'eteint' | 'allume'                   (absente : éteint)
 *   affichage_matchs    'eteint' | 'combines' | 'tout'        (absente : éteint)
 *   en_cours_saisons, en_cours_matchs   l'instant de la nuit EN COURS de rangement (absente : aucune) ; les lecteurs
 *                       lisent alors la nuit d'avant (nuit_*)
 *   nuit_saisons, nuit_matchs           la dernière nuit COMPLÈTE : JSON { calculeLe, bilan }
 *   jugement            le jugement PROVISOIRE de la dernière nuit (JSON) ; principal : le jugement principal, pris
 *                       UNE fois à l'horizon (JSON) ; controle : le dernier contrôle de nuit (JSON)
 * conditionsDesCombines : ce qui manque pour montrer les prix de combinés et le déroulé (la clé modeleDeButs en
 * service ; le jugement principal de l'étape 28 « retenu » ; la garde de sûreté, elle, éteint SEULS les marchés
 * fautifs et se dit comme une information). affichageEffectif : ce que les
 * lecteurs montrent vraiment — l'interrupteur des matchs relu avec ces conditions à CHAQUE lecture (comme éteint, et
 * pourquoi, quand elles ne tiennent plus ; la valeur rangée jamais modifiée).
 * Lit et écrit la base qu'on lui passe ; jamais l'horloge (aucun instant n'est écrit ici, sauf celui qu'on reçoit).
 * -----------------------------------------------------------------------
 */

import { reglagesDuModeleDeButs } from '../../core/engine/goalModel.js';
import { ECARTS_MESURES_V } from './reglages.js';

/** « 27/10/2026 » (Paris) d'un instant ISO ou d'un jour AAAA-MM-JJ ; « date inconnue » sinon (vérification du 27/10, constat 26). */
const FORMAT_JOUR_DIT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
export const jourDit = (iso) => {
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? '')) ? `${iso}T12:00:00Z` : String(iso ?? ''));
  return Number.isFinite(t) ? FORMAT_JOUR_DIT.format(new Date(t)) : 'date inconnue';
};

/** Les valeurs permises de chaque interrupteur, dans l'ordre (la première est celle par défaut). */
export const AFFICHAGES = Object.freeze({
  saisons: Object.freeze(['eteint', 'allume']),
  matchs: Object.freeze(['eteint', 'combines', 'tout'])
});

/** Les clés rangées (pour les tests et l'écran de Réglages). */
export const CLES = Object.freeze({
  affichage: (quoi) => `affichage_${quoi}`,
  enCours: (quoi) => `en_cours_${quoi}`,
  nuit: (quoi) => `nuit_${quoi}`,
  jugement: 'jugement',
  principal: 'principal',
  controle: 'controle'
});

/** Un refus d'affichage : 409 et une phrase pour Pierre. */
export class AffichageRefuse extends Error {
  constructor(message) {
    super(message);
    this.statut = 409;
    this.statusCode = 409;
  }
}

const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));
const json = (t) => {
  if (typeof t !== 'string' || t === '') return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** Toutes les clés rangées, en texte brut ({} si la table n'existe pas encore). */
export function lireLesValeurs(database) {
  try {
    return Object.fromEntries(database.prepare('SELECT cle, valeur FROM simulation_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (tableAbsente(error)) return {};
    throw error;
  }
}

/** Écrit une clé (texte tel quel, un objet en JSON). */
export function ecrireLaValeur(database, cle, valeur) {
  const texte = typeof valeur === 'string' ? valeur : JSON.stringify(valeur);
  database.prepare('INSERT OR REPLACE INTO simulation_state (cle, valeur) VALUES (?, ?)').run(cle, texte);
}

/** Retire une clé. */
export function effacerLaValeur(database, cle) {
  database.prepare('DELETE FROM simulation_state WHERE cle = ?').run(cle);
}

/** La valeur d'un interrupteur, contrôlée (une valeur inconnue au registre vaut « éteint »). */
const affichageDe = (valeurs, quoi) => (AFFICHAGES[quoi].includes(valeurs[CLES.affichage(quoi)]) ? valeurs[CLES.affichage(quoi)] : AFFICHAGES[quoi][0]);

/**
 * L'ÉTAT, lu tel qu'il est rangé : { affichage: { saisons, matchs }, enCours: { saisons, matchs }, nuits: { saisons,
 * matchs }, jugement, principal, controle }. Jamais d'écriture.
 */
export function lireEtat({ database } = {}) {
  const v = lireLesValeurs(database);
  return {
    affichage: { saisons: affichageDe(v, 'saisons'), matchs: affichageDe(v, 'matchs') },
    enCours: { saisons: v[CLES.enCours('saisons')] ?? null, matchs: v[CLES.enCours('matchs')] ?? null },
    nuits: { saisons: json(v[CLES.nuit('saisons')]), matchs: json(v[CLES.nuit('matchs')]) },
    jugement: json(v[CLES.jugement]),
    principal: json(v[CLES.principal]),
    controle: json(v[CLES.controle])
  };
}

/**
 * Ce qu'il faut pour MONTRER les prix de combinés et le déroulé (décision 3 de la conception) : la clé modeleDeButs
 * dans les réglages EN SERVICE (l'étape 27 adoptée) ET le jugement principal de l'étape 28 « retenu » — un principal du
 * LANCEMENT COURANT seulement : `lancement` = le dernier lancement de l'étape 28 au registre de la mesure ({ le,
 * version }, lancementDe('28'), lu par l'appelant : ce module ne lit aucun fichier) ; un principal d'un lancement d'avant
 * (une autre version de la simulation), ou pas de lancement, n'ouvre rien (« pas encore jugé pour cette version »,
 * décision de l'orchestrateur du 27/10).
 * LA GARDE DE SÛRETÉ (F6, vérification du 27/10, constats 7 et 12) n'est PAS une condition : un marché ou un combiné
 * au-delà de 4 points sur vos matchs s'éteint SEUL (marchesEcartes, `gardeDuPrincipal`), le reste reste montré ; elle est
 * rendue comme information (`garde` : aucun éteint ; `eteintsParLaGarde` : leurs libellés ; `information` : la phrase de
 * Réglages). `definitif` : la preuve de CE lancement est jugée sans être « retenue » — rien ne changera pour cette
 * version de l'étape 28. Rend { possible, cle, retenu, garde, gardeDuPrincipal, eteintsParLaGarde, information, definitif,
 * lancement, principalDuLancement, manques: [phrases] }. Ne lit que la base (état) et ce qu'on lui passe.
 */
export function conditionsDesCombines({ database, reglagesEnService = null, lancement = null } = {}) {
  let cle = false;
  try {
    cle = reglagesDuModeleDeButs(reglagesEnService) !== null;
  } catch {
    cle = false;
  }
  const range = lireEtat({ database }).principal;
  const courant = typeof lancement?.le === 'string' && lancement.le !== '' ? lancement : null;
  const deCeLancement = Boolean(range && courant && range.lancement === courant.le && (!range.version || !courant.version || range.version === courant.version));
  const principal = deCeLancement ? range : null;
  const retenu = principal?.verdict === 'retenu';
  const garde = Boolean(principal?.garde) && principal.garde.ok === true;
  const gardeDuPrincipal = principal?.garde && typeof principal.garde === 'object' ? principal.garde : null;
  // Les éteints de la garde, nommés par leurs LIBELLÉS (un combiné porte déjà son nom en mots), jamais par leurs clés.
  const eteintsParLaGarde = (Array.isArray(gardeDuPrincipal?.eteints) ? gardeDuPrincipal.eteints : []).filter((k) => typeof k === 'string' && k).map((k) => ({ cle: k, libelle: ECARTS_MESURES_V.marches[k]?.libelle ?? k }));
  const information = eteintsParLaGarde.length
    ? `La garde de sûreté a éteint, pour cette version de l’étape 28, ${eteintsParLaGarde.length > 1 ? `${eteintsParLaGarde.length} marchés ou combinés` : 'un marché ou combiné'} : ${eteintsParLaGarde.map((e) => `« ${e.libelle} »`).join(', ')} — sur vos matchs, ${eteintsParLaGarde.length > 1 ? 'ils se sont écartés' : 'il s’est écarté'} de plus de ${gardeDuPrincipal?.seuilPt ?? 4} points de ce qui est arrivé ; ${eteintsParLaGarde.length > 1 ? 'ils ne sont' : 'il n’est'} jamais montré${eteintsParLaGarde.length > 1 ? 's' : ''}, le reste l’est`
    : null;
  const definitif = Boolean(principal) && !retenu;
  const manques = [];
  if (!cle) manques.push('le modèle de buts (étape 27) n’est pas en service : un prix de combiné partirait d’une grille qui annonce le plus/moins 2,5 trop haut');
  if (range && !deCeLancement) manques.push(`pas encore jugé pour cette version de l’étape 28 : le jugement rangé est celui d’un autre lancement (${jourDit(range.lancement)}${courant ? `, lancement en cours : ${jourDit(courant.le)}` : ', aucun lancement en cours au registre'})`);
  else if (!principal) manques.push('la preuve de l’étape 28 n’est pas encore jugée (800 matchs et 21 jours après la première nuit)');
  else if (!retenu) manques.push(`la preuve de l’étape 28 a été jugée « ${principal.verdict === 'moins-bon' ? 'moins bon' : principal.verdict === 'pas-prouve' ? 'pas prouvé' : String(principal.verdict)} » : les combinés restent éteints`);
  return { possible: cle && retenu, cle, retenu, garde, gardeDuPrincipal, eteintsParLaGarde, information, definitif, lancement: courant?.le ?? null, principalDuLancement: range?.lancement ?? null, manques };
}

/**
 * L'AFFICHAGE EFFECTIF — chaque interrupteur RELU AVEC SES CONDITIONS à CHAQUE lecture (partie C de l'étape 28). Un
 * interrupteur des matchs rangé sur « combines » ou « tout » alors que ses conditions ne tiennent plus (un nouveau
 * lancement de l'étape 28, le jugement principal absent ou d'un autre lancement, le modèle de buts plus en service…) se
 * comporte comme ÉTEINT, et la raison est dite ; la valeur rangée n'est JAMAIS modifiée ici (seul le clic de Réglages
 * l'écrit). Les fins de saison (« allume ») n'ont pas de condition : une information. `lancement` : { le, version }, ou
 * une fonction qui le rend (appelée seulement quand un interrupteur des matchs est ouvert : la page du match ne lit pas
 * le registre de la mesure quand tout est éteint). Rend { saisons, matchs, range: { saisons, matchs },
 * pourquoi: { saisons, matchs }, conditions } (conditions : null quand l'interrupteur des matchs est éteint).
 */
export function affichageEffectif({ database, reglagesEnService = null, lancement = null, etat = null } = {}) {
  const e = etat ?? lireEtat({ database });
  const range = { saisons: e.affichage.saisons, matchs: e.affichage.matchs };
  let matchs = range.matchs;
  let pourquoi = null;
  let conditions = null;
  if (matchs !== 'eteint') {
    let l = null;
    try {
      l = typeof lancement === 'function' ? lancement() : lancement;
    } catch {
      l = null;
    }
    conditions = conditionsDesCombines({ database, reglagesEnService, lancement: l });
    if (!conditions.possible) {
      matchs = 'eteint';
      // Une preuve de CE lancement jugée sans « retenu » ne se rattrape pas : jamais « il se rallumera » (constat 12).
      pourquoi = `${range.matchs === 'tout' ? 'Déroulé simulé et prix de combinés éteints' : 'Prix de combinés éteints'} : l’interrupteur est resté sur « ${range.matchs === 'tout' ? 'tout' : 'combinés'} », mais ${conditions.manques.join(' ; ')}. ${conditions.definitif ? 'Ils restent éteints pour cette version de l’étape 28.' : 'Il se rallumera de lui-même quand ce sera réglé.'}`;
    }
  }
  return { saisons: range.saisons, matchs, range, pourquoi: { saisons: null, matchs: pourquoi }, conditions };
}

/**
 * CHANGE UN INTERRUPTEUR (le clic de Réglages) : `cle` ∈ { saisons, matchs }, `valeur` ∈ AFFICHAGES[cle]. Les combinés
 * et le déroulé (`combines`, `tout`) sont REFUSÉS (AffichageRefuse, 409, une phrase) tant que conditionsDesCombines ne
 * le permet pas ; éteindre est toujours permis ; les fins de saison s'allument d'un clic (une information). Écrit
 * dans simulation_state SEULEMENT. `lancement` : celui de conditionsDesCombines. Rend l'état relu.
 */
export function changerAffichage(cle, valeur, { database, reglagesEnService = null, lancement = null } = {}) {
  if (!Object.hasOwn(AFFICHAGES, cle ?? '')) throw new TypeError(`Interrupteur inconnu « ${String(cle).slice(0, 30)} » : saisons ou matchs.`);
  if (!AFFICHAGES[cle].includes(valeur)) throw new TypeError(`« ${String(valeur).slice(0, 30)} » n’est pas une valeur de l’interrupteur ${cle} (${AFFICHAGES[cle].join(', ')}).`);
  if (cle === 'matchs' && valeur !== 'eteint') {
    const c = conditionsDesCombines({ database, reglagesEnService, lancement });
    if (!c.possible) {
      // « pas encore » quand cela peut venir (preuve pas jugée, modèle de buts pas adopté) ; « pour cette version de
      // l'étape 28 » quand la preuve de ce lancement est jugée sans « retenu » (vérification du 27/10, constat 7).
      throw new AffichageRefuse(`${valeur === 'tout' ? 'Le déroulé simulé et les prix de combinés ne peuvent' : 'Les prix de combinés ne peuvent'} ${c.definitif ? 'pas être montrés pour cette version de l’étape 28' : 'pas encore être montrés'} : ${c.manques.join(' ; ')}.`);
    }
  }
  ecrireLaValeur(database, CLES.affichage(cle), valeur);
  return lireEtat({ database });
}
