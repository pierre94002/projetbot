/**
 * reglagesCartons.js — CE QUI EST FIXÉ AVANT LE REGARD pour les cartons et les réglages par championnat (étape 33 du
 * plan, lot 1a, 02/11/2026).
 * -----------------------------------------------------------------------
 * Des constantes seulement (aucun import, aucune base, aucun fichier, aucune horloge). Ce que le banc d'essai (UN seul
 * regard) applique tel quel : ses périodes (deux plis), son juge, son seuil d'ampleur, ses placebos, les contrôles
 * « définition cassée » des comptes, l'apprentissage. Les seuils des FORMULES (fenêtres, matchs « moyens », garde des
 * « vrais zéros », tendance du championnat) vivent dans formulesDesCartons.js (CONSTANTES_DES_CARTONS). Changer un seuil
 * après le regard = une variante de plus, déclarée avant son passage (bench/lancements.js, VARIANTES_DE_L_ETAPE_33).
 *
 * Décisions de l'orchestrateur du 02/11/2026 et critique (constats 1 à 16) : le bras A des réglages par championnat est le
 * « commun du pli » (constat 1) ; le repère des cartons suit la tendance récente du championnat (constat 2) ; l'effet de
 * l'arbitre se lit avec la désignation non aléatoire (constat 3) ; les cartons du banc et du staff comptent comme les
 * autres, partout (constat 4) ; la loi d'une équipe sous-dispersée est la binomiale (décision 2) ; la convention de
 * comptage est celle que Pierre a dite le 02/11/2026 (Q1).
 * -----------------------------------------------------------------------
 */

/** La forme des tables du jour de la nuit et de la note recopiée : la changer = d'autres lignes (le lecteur l'exige égale). */
export const VERSION_CARTONS = 1;

/** La forme des lignes de `cartons_rencontres` (le cache incrémental) : la changer relit tout. */
export const VERSION_RENCONTRES = 1;

/**
 * LA CONVENTION DE COMPTAGE (Q1, tranchée par Pierre le 02/11/2026) : un joueur exclu après deux jaunes compte pour 2
 * cartons (le premier jaune, puis le second qui EST le rouge). Compté joueur par joueur sur le déroulé (critique,
 * constat 8) : un « yellowred » vaut 2, que le premier jaune soit listé ou non ; sinon jaunes + rouges. Les deux autres
 * conventions (1 et 3 pour une telle expulsion) sont seulement MESURÉES à côté (dispersions rapportées par le banc).
 */
export const CONVENTION = Object.freeze({
  cle: 'C',
  expulsionApresDeuxJaunes: 2,
  autresMesurees: Object.freeze({ un: 1, trois: 3 }),
  phrase: 'Cartons comptés : jaunes et rouges, temps additionnel compris ; un joueur exclu après deux jaunes compte pour deux cartons (le premier jaune, puis le second qui est le rouge).'
});

/** L'a priori des exposants (régression de Poisson : écart-type 1 sur λ, α, γ, β — ce sont des exposants ; les niveaux c sont libres). */
export const PRIOR_SD = 1;

/** Newton : au plus 30 itérations, arrêt quand le plus grand pas est sous 1e-10. */
export const NEWTON = Object.freeze({ iterations: 30, arret: 1e-10 });

/**
 * Les périodes du banc (celles de l'étape 32) : la mise en route accumule sans apprendre ni juger ; puis DEUX PLIS —
 * apprendre sur l'un, juger l'autre, puis l'inverse ; les lignes des deux plis réunies dans UN seul juge, chaque ligne
 * jugée avec des réglages appris sur l'AUTRE pli. Rien après le 23/09/2026 n'est lu.
 */
export const PERIODES_DU_BANC = Object.freeze({
  miseEnRoute: Object.freeze({ de: '2023-01-01', a: '2023-06-30' }),
  plis: Object.freeze([
    Object.freeze({ apprendre: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }), juger: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }) }),
    Object.freeze({ apprendre: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }), juger: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }) })
  ]),
  dernierJourLu: '2026-09-23',
  /** La sous-fenêtre que STAT_KINDS et FACTEUR_TERRAIN n'ont jamais vue (lancements.js, DONNEES_VUES) : la même comparaison y est RAPPORTÉE, sans verdict (critique, constat 1). */
  jamaisVueParLesConstantes: Object.freeze({ de: '2023-07-01', a: '2024-06-30' })
});

/**
 * LE JUGE : la perte log de la LOI ENTIÈRE des comptes (équipe à domicile, équipe à l'extérieur, total), une ligne par
 * match, bloc = le match ; le juge de l'étape 16 inchangé (comparer : moyenne, min, 1 000 tirages, graine 33, 200 blocs
 * au moins) ; K = VARIANTES_DE_L_ETAPE_33.length ; chaque probabilité planchée à 1e-6.
 */
export const JUGE = Object.freeze({ mesure: 'perte-log-des-comptes', tirages: 1000, graine: 33, minBlocs: 200, plancher: 1e-6 });

/**
 * Le seuil d'ampleur d'une variante « utile » : la plus grande, parmi le total et les deux équipes, des moyennes de
 * |P_B(plus de ℓ) − P_A(plus de ℓ)| pour ℓ ∈ {ℓ* − 1, ℓ*, ℓ* + 1}, ℓ* = ⌊μ_A⌋ + 0,5, sur les matchs jugés, sans aucun
 * résultat — au moins 0,5 point. Une garde SECONDAIRE (critique, constat 15 : sous un effet nul, elle vaut déjà 0,2 à
 * 0,5 point) : c'est le verdict qui décide.
 */
export const AMPLEUR = Object.freeze({ seuil: 0.005, secondaire: true });

/** Une variante n'est utile que jugée sur au moins 200 matchs. */
export const MIN_MATCHS_UTILE = 200;

/**
 * Les réglages par championnat : la variance vraie entre championnats (bayésien empirique de retenirLesMesures,
 * leagueBenchmarks.js) se mesure sur les championnats d'au moins 100 matchs — la constante MINIMUM_DISPERSION de
 * leagueBenchmarks.js, non exportée : un test vérifie l'égalité (critique, constat 15). Le bras A est le COMMUN DU PLI
 * (facteur domicile/extérieur et 1/k équipe/total appris sur le pli d'apprentissage, sans championnat : constat 1). Un
 * championnat n'a sa propre mesure qu'à partir de 30 matchs au pli d'apprentissage (minMatchsPropres : en dessous,
 * l'erreur type d'un rapport de quelques matchs est presque nulle et le bayésien empirique lui laisserait sa valeur
 * brute) ; sinon, et s'il est absent du pli, il reçoit EXACTEMENT le bras A.
 */
export const PAR_CHAMPIONNAT = Object.freeze({ minTau2: 100, minMatchsPropres: 30, brasA: 'commun-du-pli', statistiques: Object.freeze(['corners', 'tirs', 'cadres']) });

/**
 * Les placebos : 40 pseudo-championnats (FNV-1a de la clé du match, mod 40) ; 20 faux arbitres par compétition (FNV-1a de
 * la clé du match, mod 20 — un nombre FIXE, critique, constat 15 : compté sur la fenêtre du banc, il en serait un résultat).
 */
export const PLACEBOS = Object.freeze({ pseudoChampionnats: 40, fauxArbitres: 20 });

/**
 * LES CONTRÔLES « DÉFINITION CASSÉE » des comptes (avant tout regard, conception §4.8) : sur A ou sur B, une définition
 * est cassée si :
 *   releveMin      moins de 50 % des matchs non prolongés, non attribués et joués sont relevés ;
 *   accordMin      l'accord ligne / déroulé est sous 80 % des matchs comparés ;
 *   desaccordMax   le désaccord dépasse 3 % des matchs comparés ;
 *   vraiZeroMax    les vrais zéros dépassent 5 % des relevés ;
 *   arbitreMin     l'arbitre est connu pour moins de 50 % des relevés ;
 *   fenetresMin    moins de 70 % des matchs relevés jugeables ont deux fenêtres d'équipe d'au moins 5 matchs ;
 *   cornersMin     un pli a moins de 15 000 lignes jugeables pour les corners ;
 *   fauxMin        le faux arbitre couvre moins de 90 % des lignes à arbitre réel.
 */
export const COMPTES_CASSES = Object.freeze({
  releveMin: 0.5,
  accordMin: 0.8,
  desaccordMax: 0.03,
  vraiZeroMax: 0.05,
  arbitreMin: 0.5,
  fenetresMin: 0.7,
  fenetreMatchs: 5,
  cornersMin: 15000,
  fauxMin: 0.9
});

/** La preuve après lancement (reportée : partie C2, plus tard) : 80 % de puissance à l'effet vu au banc, 60 jours au moins. */
export const PREUVE = Object.freeze({ puissance: 0.8, zPuissance: 0.8416, minJours: 60 });

/** La garde mensuelle de la preuve après lancement : 12 regards au plus, puis elle s'arrête. */
export const GARDE_MENSUELLE = Object.freeze({ variantes: 12, regardsMax: 12 });

/** LA NUIT (lot 1b) : contrôle anti-fuite sur 20 couples (rencontre, camp) des 365 derniers jours ; tranches de 250. */
export const NUIT = Object.freeze({ couples: 20, joursDuControle: 365, tranche: 250 });

/**
 * La réponse de Pierre à Q1 (02/11/2026, vers 17 h 40 ; reponse-Q1.md), ses mots dictés tels quels ; la question des
 * pourcentages à blanc (lignesABlanc, Q7) : null, le défaut de la conception s'applique. Aucun fichier du moteur ne la lit.
 */
export const DECISION_DE_PIERRE = Object.freeze({
  convention: Object.freeze({
    valeur: 'C',
    date: '2026-11-02',
    mots: 'pour les cartons. En plein match. Un carton jaune. Pour le même joueur. Plus un carton jaune. Pour le même joueur. Égale un carton rouge. Du coup, le joueur est exclu du match. Du coup, ça fait un carton jaune plus un carton jaune égale un carton rouge.'
  }),
  lignesABlanc: null
});

/** Les mentions fixes de l'écran (lot 1b), en français simple ; la règle des cartons du banc et du staff (critique, constat 4). */
export const MOTS = Object.freeze({
  convention: CONVENTION.phrase,
  horsTerrain: 'Les cartons du banc et des entraîneurs comptent comme les autres : FotMob ne les distingue pas sur les matchs d’avant octobre 2026.',
  deroule: 'Comptés sur le déroulé du match : depuis octobre 2026, FotMob publie des cartons jaunes à 0 dans treize championnats, alors que le déroulé les donne.',
  exclus: 'Les matchs prolongés et ceux dont FotMob ne publie pas le déroulé complet ne comptent pas.'
});
