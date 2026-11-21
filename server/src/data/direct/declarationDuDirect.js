/**
 * declarationDuDirect.js — LA DÉCLARATION DU BANC DU DIRECT (étape 46 du plan, lot 1, partie C, 12/11/2026 ; règles du banc
 * en PROJET § 1 à § 6 et § 11 ; critique R1, R12 à R18, R36 point 1 ; consigne de la partie C § 3).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni réseau. Tout ce qui est jugé est déclaré ICI, AVANT tout regard :
 *   - LES DEUX COLONNES de O10 (DECLARATIONS) : « adoptee » (l'étape 27 adoptée, lignes « modele-buts-441 ») et
 *     « non-adoptee » (la version 5 reste, lignes « ancien-81 ») — pour chacune : le modèle jugé (O9, R1), la variante
 *     affichée (P2), la liste des variantes déclarées (la retenue en tête), K, les z, le principal à point de départ égal
 *     (R12), la taille T du regard de preuve, les jugements (R14, R17), les créneaux évalués (R36 point 1) ;
 *   - LA COLONNE retenue : COLONNE, entre ses balises, fixée À UN SEUL ENDROIT, AU SCELLEMENT, PAR SCRIPT
 *     (`node scripts/etape46.mjs --fixer-colonne <adoptee|non-adoptee>`), jamais à la main ; avant : null, et tout mode du
 *     banc qui en dépend refuse (« colonne non fixée ») ;
 *   - JUGE (le juge de bench/guard.js et ses réglages), SEUILS (sûreté, F1, garde de calibration), VUES_DE_L_ETAPE_46.
 * Ce sont des PROPOSITIONS de la critique (§ 4.1) : l'orchestrateur les tranche à la séance du verdict de l'étape 27 ;
 * une proposition changée l'est ICI, AVANT --sceller (le sha1 de ce fichier entre dans SCELLEMENT de bancDuDirect.js), et
 * les essais (directBanc.test.mjs) se relancent.
 * `direct-rouges-exacts` n'existe pas : la règle de R16 n'est pas déclenchée (--libelles du 11/11 : retard médian 0,
 * 0,07 % des matchs suivis sans rouge lu) ; le banc refuse de passer si elle l'était.
 * -----------------------------------------------------------------------
 */

import { PARAMS } from '../simulation/reglages.js';
import { zPour } from '../../bench/guard.js';
import { VARIANTES_CODEES } from './reglagesDirect.js';

/** Gèle un objet et tout ce qu'il contient. */
const geler = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) geler(v);
  }
  return x;
};

/** Les deux colonnes de O10 (l'issue du verdict de l'étape 27). */
export const COLONNES = Object.freeze(['adoptee', 'non-adoptee']);

// <COLONNE fixée par script au scellement — ne pas modifier à la main>
export const COLONNE = 'non-adoptee';
// </COLONNE>

/** Le premier jour de la période du banc (P5 : seuls matchs neufs pour PARAMS, appris jusqu'au 2026-09-23). */
export const DEBUT_DU_BANC = '2026-09-24';
/** La fenêtre DÉJÀ VUE (PARAMS, la table du temps additionnel, les buts moyens des championnats). */
export const FENETRE_VUE = Object.freeze({ de: '2023-07-01', a: '2026-09-23' });
/** Les 8 tranches du banc : les bandes de PARAMS (1-15, 16-30, 31-45, 45+, 46-60, 61-75, 76-90, 90+). */
export const TRANCHES = Object.freeze(PARAMS.bandes.map(([nom]) => nom));
/** Les familles de buts jugées par J2 et J2s (§ 2.10 ; « résultat + total » et « score exact » : non jugés au lot 1). */
export const FAMILLES_DE_BUTS = Object.freeze(['totalGoals', 'bothTeamsScore', 'teamGoals']);

/**
 * LES CRÉNEAUX ÉVALUÉS (R36 point 1, PROPOSITION) : le DÉBUT des créneaux (part 0) — un créneau sur trois dans chaque
 * mi-temps (0, 3, …, 42 puis 46, 49, …, 88), plus 45 (les arrêts de jeu de la 1re) et 91 (ceux de la 2de) : 32 points
 * par match au lieu des 92 (un rapport 0,087 contre 0,088 : rien de plus n'est prouvé avec 92, pour 3 fois le calcul).
 */
export const CRENEAUX_PROPOSES = Object.freeze([
  ...Array.from({ length: 15 }, (_, i) => 3 * i),
  45,
  ...Array.from({ length: 15 }, (_, i) => 46 + 3 * i),
  91
]);

/** LE JUGE (PROJET § 4) : comparer de bench/guard.js ; K et les z viennent de la colonne. */
export const JUGE = Object.freeze({ mode: 'moyenne', sens: 'min', tirages: 2000, graine: 46, alpha: 0.05, minBlocs: 400, minBlocsJ5: 50 });

/**
 * LES SEUILS (PROJET § 5, § 6) : le regard de sûreté exige au moins 600 matchs ; F1 = masse négligée + plafonnée < 1e-5 sur
 * tous les états du rejeu ; les lectures finies, dans [0 ; 1], de somme 1 à 1e-9 ; la minute 0 de direct-ancre à 1e-6 de
 * sa cible (hors borne) ; une paire de calibration « écartée » au-delà de 4 points ET de 3 écarts-types (par blocs de
 * matchs), « à surveiller » quand une seule des deux conditions tient (au regard de preuve). `minMatchsParPaire`
 * (PROPOSITION de la partie C, à confirmer au scellement) : une paire portée par moins de 50 matchs n'est pas jugée (son
 * écart-type par blocs ne veut rien dire), elle est comptée à part.
 * Correctifs du 13/11 (décisions de l'orchestrateur) : `horsF1Part` et `horsF1Max` (C11) — un match dont un état réel sort
 * de F1 est retiré de tous les jugements, nommé et compté ; au-delà de 1 % des matchs du passage OU de 20 matchs, rien n'est
 * jugé ; `identitePart` et `identiteMax` (C12) — au regard de preuve, les matchs communs dont la ligne retenue a changé
 * entre les deux exports sont nommés, comptés et retirés des deux côtés s'ils sont au plus 5 ET au plus 0,5 % des matchs
 * communs ; au-delà, refus.
 */
export const SEUILS = Object.freeze({
  surete: 600,
  f1: 1e-5,
  somme: 1e-9,
  ancre: 1e-6,
  ecartCalibration: 0.04,
  ecartsTypes: 3,
  minMatchsParPaire: 50,
  horsF1Part: 0.01,
  horsF1Max: 20,
  identitePart: 0.005,
  identiteMax: 5
});

/** LES ÉTATS FABRIQUÉS de l'étalonnage (R20 point 1) : 0-0, 9-0, 4-4 à deux rouges de chaque côté, 12-1 ; créneaux 0, 45, 46, 91. */
export const ETATS_D_ETALONNAGE = Object.freeze([
  Object.freeze({ h: 0, a: 0, rh: 0, ra: 0 }),
  Object.freeze({ h: 9, a: 0, rh: 0, ra: 0 }),
  Object.freeze({ h: 4, a: 4, rh: 2, ra: 2 }),
  Object.freeze({ h: 12, a: 1, rh: 0, ra: 0 })
]);
export const CRENEAUX_D_ETALONNAGE = Object.freeze([0, 45, 46, 91]);

const variante = (id) => {
  const v = VARIANTES_CODEES.find((x) => x.id === id);
  if (!v) throw new Error(`declarationDuDirect : variante non codée (${id}).`);
  return v;
};

/** Les jugements des goals, un par famille (J2, J2s). */
const parFamille = (prefixe, a, role, quoi) => FAMILLES_DE_BUTS.map((famille) => ({ id: `${prefixe}-${famille}`, a, b: 'affichee', sur: 'buts', famille, role, quoi }));

/** Les jugements communs aux deux colonnes (le principal et J4c sont propres à chacune). */
const JUGEMENTS_COMMUNS = [
  ...parFamille('J2', 'temps-restant', 'exige', 'les buts (plus/moins 0,5 à 3,5, les deux marquent, buts par équipe ; lignes ouvertes) : exigé « pas moins bon », par famille'),
  ...parFamille('J2s', 'temps-restant-championnat', 'exige', 'les buts face aux buts moyens du championnat (R14) : exigé « pas moins bon », sinon la famille n’est pas montrée en direct'),
  { id: 'J3', a: 'direct-sans-effets', b: 'direct-v1', sur: '1n2', role: 'rapporte', quoi: 'les effets du score et des rouges de la chaîne de l’étape 28' },
  { id: 'J5', a: 'direct-rouges-ignores', b: 'direct-v1', sur: '1n2', rouges: true, role: 'rapporte', quoi: 'ce que coûte un rouge inconnu (points où un rouge est déjà tombé ; nourrit « calcul fait à 11 contre 11 »)' },
  { id: 'profil-des-minutes', a: 'temps-restant', b: 'direct-sans-effets', sur: '1n2', role: 'rapporte', quoi: 'ce que vaut le profil des minutes seul' }
];

/**
 * LES DEUX DÉCLARATIONS de O10 (critique § 4.1, PROPOSITION ; z = zPour(0,05 ; K) de bench/guard.js, tranches K × 8).
 *   modele      la grille jugée et les rôles de R1 point 2 (« adoptee » : service s'il existe, sinon la candidate de
 *               l'empreinte adoptée) ;
 *   affichee    la variante affichée (P2 ; « ancre-si-fair » : direct-ancre avec un `fair`, direct-v1 sans — c'est ce que
 *               calcule direct-ancre elle-même sans `fair`) ;
 *   variantes   la liste déclarée, la retenue en tête (le registre de la mesure la recopie : VARIANTES_DE_L_ETAPE_46) ;
 *   principal   à point de départ égal (R12) ; `repliJ4c` : le principal quand J4c dit direct-ancre « moins bonne » (O3) ;
 *   T           la taille du regard de preuve, fixée AVANT le regard de sûreté (R12 point 4, R15 point 2).
 */
export const DECLARATIONS = geler({
  adoptee: {
    colonne: 'adoptee',
    quoi: 'L’étape 27 adoptée : la version 6 en service, lignes « modele-buts-441 »',
    modele: { grille: 'modele-buts-441', roles: ['service', 'candidate'], empreinteAdoptee: 'f01dd8496f56a415' },
    reglage: 'direct-v1',
    affichee: 'direct-v1',
    variantes: ['direct-v1', 'direct-sans-effets', 'temps-restant', 'direct-rouges-ignores', 'temps-restant-championnat'].map(variante),
    nonDeclarees: ['direct-ancre', 'temps-restant-ancre'],
    K: 5,
    z: 2.576,
    zTranches: 3.227,
    principal: { a: 'temps-restant', b: 'direct-v1' },
    repliJ4c: null,
    T: 1700,
    tFourchette: [1250, 2400],
    creneaux: CRENEAUX_PROPOSES,
    jugements: [{ id: 'principal', a: 'temps-restant', b: 'direct-v1', sur: '1n2', role: 'decide', quoi: 'à point de départ égal : la chaîne en direct face à la simple règle du temps restant, partie des mêmes buts attendus' }, ...JUGEMENTS_COMMUNS]
  },
  'non-adoptee': {
    colonne: 'non-adoptee',
    quoi: 'L’étape 27 non adoptée : la version 5 reste en service, lignes « ancien-81 »',
    modele: { grille: 'ancien-81', roles: ['service'], empreinteAdoptee: null },
    reglage: 'ancre-si-fair',
    affichee: 'direct-ancre',
    variantes: ['direct-ancre', 'direct-v1', 'direct-sans-effets', 'temps-restant', 'direct-rouges-ignores', 'temps-restant-championnat', 'temps-restant-ancre'].map(variante),
    nonDeclarees: [],
    K: 7,
    z: 2.69,
    zTranches: 3.322,
    principal: { a: 'temps-restant-ancre', b: 'direct-ancre' },
    repliJ4c: { a: 'temps-restant', b: 'direct-v1' },
    T: 2300,
    tFourchette: [2300, null],
    creneaux: CRENEAUX_PROPOSES,
    jugements: [
      { id: 'J4c', a: 'direct-v1', b: 'direct-ancre', sur: '1n2', role: 'affichage', quoi: 'la variante affichée : direct-ancre cède à direct-v1 si elle est « moins bonne » (O3) ; lue AVANT le principal (R17 point 2)' },
      { id: 'principal', a: 'temps-restant-ancre', b: 'direct-ancre', sur: '1n2', role: 'decide', quoi: 'à point de départ égal (R12) : la chaîne recalée face à la simple règle du temps restant recalée de même ; sans `fair`, temps-restant face à direct-v1' },
      { id: 'J1-O4', a: 'temps-restant', b: 'affichee', sur: '1n2', role: 'rapporte', quoi: 'partir du 1N2 du pronostic d’avant-match plutôt que des buts attendus du moteur' },
      ...JUGEMENTS_COMMUNS
    ]
  }
});

/** La déclaration d'une colonne ; lève pour une colonne inconnue ou non fixée (null). */
export function declarationDe(colonne) {
  if (colonne === null || colonne === undefined) throw new Error('colonne non fixée : la colonne de O10 se fixe au scellement, par script (--fixer-colonne).');
  const d = DECLARATIONS[colonne];
  if (!d) throw new Error(`colonne inconnue (${String(colonne)}) : adoptee ou non-adoptee.`);
  return d;
}

/** La déclaration de la colonne fixée, ou null avant le scellement. */
export const DECLARATION = COLONNE === null ? null : declarationDe(COLONNE);

/** VARIANTES_DE_L_ETAPE_46 : celles de la colonne fixée, la retenue en tête ([{ id, quoi }]) ; null avant le scellement. */
export const VARIANTES_DE_L_ETAPE_46 = DECLARATION ? DECLARATION.variantes : null;

/**
 * LES FENÊTRES REGARDÉES par l'étape 46 (R18 point 2), portée « direct » : la période du banc (de DEBUT_DU_BANC à la date
 * de l'export : `a` posé par le script de pose du registre, la date donnée), la fenêtre déjà vue de la table du temps
 * additionnel et des buts moyens des championnats, et le constat du 11/11 sur « moins de … buts » et « les deux marquent »
 * (R14 point 4 : J2s naît d'un regard sur la période du banc).
 */
export function vuesDeLEtape46(fin) {
  return geler([
    { de: DEBUT_DU_BANC, a: fin, quoi: 'Étape 46 : la période du banc du direct (P5, matchs joués depuis le 24/09/2026 avec une ligne d’avant-match et une chronologie complète) — les variantes du direct rejouées créneau par créneau, jugées en un ou deux regards nommés (sûreté, preuve) ; rien n’y est appris.', pour: ['direct'] },
    { de: FENETRE_VUE.de, a: FENETRE_VUE.a, quoi: 'Étape 46 : la fenêtre déjà vue de PARAMS — la table du temps additionnel (RESTE_ADDITIONNEL) et les buts moyens des championnats (MOYENNES_DES_CHAMPIONNATS), comptés par script.', pour: ['direct'] },
    { de: '2026-10-24', a: '2026-11-11', quoi: 'Étape 46 : le constat du 11/11 (pronostics réglés de la version 5 : « moins de … buts » et « les deux marquent : non » annoncés bien trop sûrs) — la référence temps-restant-championnat (J2s) en naît ; déclaré vu.', pour: ['direct'] }
  ]);
}

/** VUES_DE_L_ETAPE_46 : la fin de la période du banc (`a` de la première) reste à null jusqu'à la pose du registre. */
export const VUES_DE_L_ETAPE_46 = vuesDeLEtape46(null);

/** Les z de chaque colonne, refaits par zPour : un test vérifie l'égalité avec les valeurs écrites (2,576 / 3,227 ; 2,690 / 3,322). */
export const zDeLaColonne = (d) => ({ z: zPour(JUGE.alpha, d.K), zTranches: zPour(JUGE.alpha, d.K * TRANCHES.length) });
