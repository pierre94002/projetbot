/**
 * reglagesCoupes.js — CE QUI EST FIXÉ AVANT LE REGARD pour les coupes et les matchs à part (étape 36 du plan, lot 1,
 * 09/11/2026).
 * -----------------------------------------------------------------------
 * Des constantes seulement (aucun import, aucune base, aucun fichier, aucune horloge). Ce que l'appariement des
 * confrontations applique (la table des tours, les seuils des natures, la séance de tirs au but, la règle d'après
 * 90 minutes), ce que la calibration de la chance de qualification (UN seul regard, rapporté, jamais un verdict) applique
 * telle quelle, et la nuit. Changer une constante après le regard = un regard de plus, déclaré avant son passage
 * (bench/lancements.js, VARIANTES_DE_L_ETAPE_36).
 *
 * Décisions de l'orchestrateur du 02/11/2026 (étape 36) après la critique : AUCUN banc de pronostic ; UN seul regard, la
 * calibration de la chance de qualification exigée par la fiche, RAPPORTÉE avec des bornes fixées d'avance, jamais de
 * vert sur la chance de la page ; la prolongation modélisée et les tirs au but « favori » ne sont PAS mesurés au lot 1
 * (Pierre ne joue pas « qualifié ») ; la règle du FORMAT (prolongation puis séance, ou séance directe) est celle du
 * correctif du règlement EN SERVICE, importée (confrontations.js), jamais recopiée. Décisions de Pierre du 02/11/2026
 * (n° 6) : finale dans le stade d'un des deux clubs = PAS neutre pour lui ; tirs au but = 50/50, dit à l'écran.
 * -----------------------------------------------------------------------
 */

/** La forme des lignes et des fiches rangées par la nuit : la changer = d'autres lignes (le lecteur l'exige égale). */
export const VERSION_COUPES = 1;

/** La forme des lignes de `coupes_rencontres` : la changer relit tout. */
export const VERSION_RENCONTRES = 1;

/**
 * LA TABLE DES TOURS (couche 2) : chaque intitulé FotMob, sans casse ni accents, espaces réduits, vers un CODE stable.
 * `exacts` : les intitulés reconnus tels quels ; `motif` : une expression (le numéro du tour en premier groupe). Tout
 * autre intitulé reste `brut:<intitulé stable>`, compté, jamais fusionné avec un autre. Liste relevée sur la base du bac
 * le 09/11/2026 (35 intitulés distincts dans les 24 coupes ; partie 0 de l'écriture).
 */
export const TOURS = Object.freeze([
  Object.freeze({ code: '1/64', exacts: Object.freeze(['1/64', '64th finals', 'round of 128']), libelle: 'Soixante-quatrièmes de finale' }),
  Object.freeze({ code: '1/32', exacts: Object.freeze(['1/32', '32nd finals', 'round of 64']), libelle: 'Trente-deuxièmes de finale' }),
  Object.freeze({ code: '1/16', exacts: Object.freeze(['1/16', '16th finals', 'round of 32', 'last 32']), libelle: 'Seizièmes de finale' }),
  Object.freeze({ code: '1/8', exacts: Object.freeze(['1/8', '8th finals', 'round of 16', 'last 16']), libelle: 'Huitièmes de finale' }),
  Object.freeze({ code: '1/4', exacts: Object.freeze(['1/4', 'quarter-finals', 'quarter-final', 'quarterfinals', 'quarterfinal', 'quarter finals', 'quarter final']), libelle: 'Quarts de finale' }),
  Object.freeze({ code: '1/2', exacts: Object.freeze(['1/2', 'semi-finals', 'semi-final', 'semifinals', 'semifinal', 'semi finals', 'semi final']), libelle: 'Demi-finales' }),
  Object.freeze({ code: 'final', exacts: Object.freeze(['final', 'finals']), libelle: 'Finale' }),
  Object.freeze({ code: '3e-place', exacts: Object.freeze(['bronze', '3rd place', 'third place', 'third place play-off', '3rd place play-off']), libelle: 'Match pour la 3e place' }),
  Object.freeze({ code: 'preliminaire', exacts: Object.freeze(['preliminary round', 'preliminary', 'qualification', 'qualifying round']), libelle: 'Tour préliminaire' }),
  Object.freeze({ code: 'barrage', exacts: Object.freeze(['play-offs', 'playoffs', 'play-off', 'playoff', 'knockout round play-offs', 'knockout round playoffs']), libelle: 'Barrages' })
]);

/** Les tours numérotés : « 3 », « Round 3 », « 3rd Round » → `tour-3` ; « Group Stage - Round 3 » → `groupe-3`. */
export const TOURS_NUMEROTES = Object.freeze([
  Object.freeze({ prefixe: 'tour', motif: /^(\d{1,2})$/ }),
  Object.freeze({ prefixe: 'tour', motif: /^round (\d{1,2})$/ }),
  Object.freeze({ prefixe: 'tour', motif: /^(\d{1,2})(?:st|nd|rd|th) round$/ }),
  Object.freeze({ prefixe: 'groupe', motif: /^group stage - round (\d{1,2})$/ })
]);

/** La FAMILLE d'une phase (meta.leagueKey) : groupes (« Grp », « Group »), qualification (« Qualification », « Preliminary »), autre. */
export const FAMILLES = Object.freeze({ groupes: /\b(grp|group)\b/i, qualification: /\b(qualification|preliminary)\b/i });

/** La règle de cupBracket (matchStatsRead.js:1003) : deux rencontres de même intitulé à plus de 40 jours = deux tours (testée égale). */
export const ECART_MAX_JOURS = 40;

/**
 * LES NATURES D'UN BLOC (le passé, saison complète ; critique de l'étape 36, constat 4 — l'ordre corrigé) :
 * groupe → aller-retour → un-match-rejouages → troisieme-place → finale → un-match → ambigu.
 *   partAllerRetour 0,8   part des rencontres du bloc dans une paire inversée (2 × paires / rencontres) ;
 *   partUnMatch 0,5       au-dessous : un match unique, une finale, une 3e place ou des rejouages ;
 *   rejouagesMin 2        au moins 2 paires inversées, TOUTES à premier match nul (FA Cup jusqu'en 2023-24) ;
 *   suiteJours 120        « la suite » : les deux équipes rejouent-elles dans un bloc plus tardif de la coupe-saison ;
 *   groupeDeux 0,5        les deux rejouent dans au moins la moitié des rencontres → une phase de ligue ;
 *   unMatchUne 0,8        exactement une rejoue dans au moins 80 % des rencontres → un match unique.
 */
export const NATURES = Object.freeze({ partAllerRetour: 0.8, partUnMatch: 0.5, rejouagesMin: 2, suiteJours: 120, groupeDeux: 0.5, unMatchUne: 0.8 });

/** La séance de tirs au but lue sur la carte des tirs : au moins 6 tirs, 3 par camp, un écart d'un tir au plus, buts différents. */
export const SEANCE = Object.freeze({ tirsMin: 6, parCampMin: 3, ecartMax: 1 });

/**
 * LA RÈGLE D'APRÈS 90 MINUTES (le format, critique constats 3 et 6) : l'observation d'un match vient de la fonction du
 * correctif du règlement EN SERVICE (settlementService.quoiDeLaProlongation, importée) ; « direct » ne se dit que sur un
 * déroulé COMPLET (au moins un remplacement de chaque camp) — sinon l'observation est « indéterminée » ; le format d'une
 * compétition-saison-nature = la majorité d'au moins 80 % d'au moins 3 observations déterminées d'AVANT le jour J, sinon
 * « mixte » ; à défaut, la saison d'avant entière, puis la dernière saison ANTÉRIEURE qui en a, sinon « inconnu ».
 */
export const FORMAT = Object.freeze({ majorite: 0.8, observationsMin: 3, remplacementsParCampMin: 1 });

/** Les buts à l'extérieur : un CONTRÔLE seulement (critique, constat 10) — l'alerte durable à partir de 3 retours d'une compétition-saison. */
export const BUTS_EXTERIEUR = Object.freeze({ cas: 3 });

/**
 * LA BASE STATISTIQUE : les réglages `modeleDeButs` de la candidate de l'étape 27 (modele-buts-v1), recopiés et figés —
 * la même que celle de l'étape 32 (data/contexte/bancDuContexte.js) ; un test les compare (T-Q5). Seul le régime « sans
 * cote » sert (fair: null) : λS, μS des forces et du démarrage à froid.
 */
export const BASE_STATISTIQUE = Object.freeze({
  version: 1,
  rho: -0.05,
  demiVies: Object.freeze({ attaque: 35, defense: 25 }),
  prior: 8,
  statistique: 'mix',
  poidsXg: 0.7,
  changementDeChampionnat: 'remise-a-zero',
  ancrage: Object.freeze({ ligne: 2.5, methode: 'total-equilibre' }),
  melange: Object.freeze({ avecPlusMoins: Object.freeze({ wT: 0.1, wS: 0.1 }), sans: Object.freeze({ wT: 0.55, wS: 0.1 }) }),
  demarrageAFroid: Object.freeze({ matchs: 8 }),
  bornes: Object.freeze([0.2, 6])
});
/** L'empreinte des sommes des forces de cette base (empreinteDesForces de goalModel.js ; un test la recalcule). */
export const EMPREINTE_DE_LA_BASE = 'v1|35|25|remise-a-zero';

/**
 * Les périodes (celles de l'étape 32, testées égales) : la mise en route accumule les forces sans rien juger ; puis DEUX
 * PLIS — le recalage de la base appris sur l'un, la calibration lue sur l'autre, puis l'inverse. Rien après le 23/09/2026
 * n'est lu.
 */
export const PERIODES_DU_BANC = Object.freeze({
  miseEnRoute: Object.freeze({ de: '2023-01-01', a: '2023-06-30' }),
  plis: Object.freeze([
    Object.freeze({ apprendre: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }), juger: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }) }),
    Object.freeze({ apprendre: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }), juger: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }) })
  ]),
  dernierJourLu: '2026-09-23'
});

/**
 * LA CALIBRATION DE LA CHANCE DE QUALIFICATION (critique, constat 1 : RAPPORTÉE, une équivalence et non une absence de
 * preuve ; décision 1 de l'orchestrateur) :
 *   - régression de Cox : logit(q) = α + β · logit(chance du club qui reçoit le match décisif), Newton (25 itérations,
 *     arrêt 1e-10), chances planchées à 1e-6 ; fourchettes à 95 % par 1 000 tirages des unités (graine 36) ;
 *   - dixièmes : les unités rangées par chance, dix groupes de tailles égales (à une près) ; l'écart moyen = la moyenne,
 *     sur les dix, de |chance moyenne − fréquence de qualification| ;
 *   - LE MOT, fixé d'avance, sur TOUTES les unités jugées : « calibrée » si la fourchette de β est dans [0,85 ; 1,15], celle
 *     de α dans [−0,15 ; 0,15] ET l'écart moyen par dixième au plus 3 points ; sinon « trop sûre d'elle » si β < 0,85,
 *     « pas assez sûre d'elle » si β > 1,15, « non tranché » entre les deux ; « pas assez de matchs » sous 200 unités ;
 *   - à côté, SANS mot : les retours seuls (≈ 1 240 : aucune équivalence serrée n'y est atteignable), chaque nature, et la
 *     calibration du 1N2 À 90 MINUTES de la même base sur les mêmes matchs (domicile, nul, extérieur) ;
 *   - « annoncé / réalisé » (la ligne de l'écran) : la chance moyenne de la FAVORITE de chaque confrontation face à la part
 *     des confrontations qu'elle a gagnées.
 */
export const CALIBRATION = Object.freeze({
  tirages: 1000,
  graine: 36,
  dixiemes: 10,
  plancher: 1e-6,
  newton: Object.freeze({ iterations: 25, arret: 1e-10 }),
  bornes: Object.freeze({ beta: Object.freeze([0.85, 1.15]), alpha: Object.freeze([-0.15, 0.15]), ecartMoyenMax: 0.03 }),
  minUnites: 200
});

/** Les mots de la calibration, fixés d'avance (ceux de l'écran). */
export const MOTS_DE_LA_CALIBRATION = Object.freeze({
  calibree: 'calibrée',
  tropSure: 'trop sûre d’elle',
  pasAssezSure: 'pas assez sûre d’elle',
  nonTranche: 'non tranché',
  pasAssez: 'pas assez de matchs'
});

/**
 * LES CONTRÔLES « DÉFINITION CASSÉE » des comptes (avant le regard ; fixés dans les règles scellées) : sur A ou sur B,
 *   ambiguMax 5 %            blocs `ambigu` (hors `ambigu-fin-des-donnees`, critique constat 11) parmi les rencontres ;
 *   qualifieRejoueMin 95 %   le qualifié rejoue au tour suivant (unités décidées par le score, tour suivant connu) ;
 *   accordCarteMin 90 %      accord carte des tirs / tour suivant sur les séances où les deux existent ;
 *   seanceInconnueMax 15 %   séances au vainqueur inconnu ;
 *   unitesMin 1 500          unités jugeables sur un pli ;
 *   butsExterieurUefa 3      une compétition-saison UEFA avec au moins 3 retours décidés à égalité de cumul sans prolongation.
 * Une définition cassée se corrige AVANT le regard, sans compter de regard (aucune probabilité n'a été calculée).
 */
export const COMPTES_CASSES = Object.freeze({ ambiguMax: 0.05, qualifieRejoueMin: 0.95, accordCarteMin: 0.9, seanceInconnueMax: 0.15, unitesMin: 1500, butsExterieurUefa: 3 });

/** Les coupes de l'UEFA (le contrôle des buts à l'extérieur : supprimés en 2021). */
export const COUPES_UEFA = Object.freeze(['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League']);

/** LE LIEU (explication seulement, jamais dans un chiffre) : le stade le plus fréquent d'un club À DOMICILE sur 365 jours (au moins 3 réceptions), et les autres stades d'au moins 3 réceptions ; deux coordonnées à 2 km au plus = le même stade. */
export const STADES = Object.freeze({ fenetreJours: 365, receptionsMin: 3, memeStadeKm: 2 });

/**
 * LA NUIT : les rencontres de coupe jusqu'à la veille, les fiches FIGÉES des matchs de coupe des 14 prochains jours
 * (jamais réécrites après le coup d'envoi, jamais élaguées pour un match joué ; une fiche orpheline part après 30 jours),
 * rangées par tranches de 250 ; l'historique des tours lu par la page sur 400 jours.
 */
export const NUIT = Object.freeze({ fenetreJours: 14, tranche: 250, orphelinesJours: 30, historiqueJours: 400, allerJours: 40 });

/**
 * Les décisions de Pierre (02/11/2026, n° 6) appliquées telles quelles ; `qualifieDansLaSaisie` : null (Q3 « pariez-vous
 * sur qualifié ? » restée ouverte : défaut prudent, pas dans la saisie au lot 1). Aucun fichier du moteur ne la lit.
 */
export const DECISION_DE_PIERRE = Object.freeze({
  qualifieDansLaSaisie: null,
  tirsAuBut: Object.freeze({ valeur: '50/50', date: '2026-11-02' }),
  finaleAuStadeDUnClub: Object.freeze({ valeur: 'pas-neutre-pour-lui', date: '2026-11-02' }),
  prolongeRegleA90: Object.freeze({ valeur: 'correctif-du-reglement', date: '2026-11-02' })
});
