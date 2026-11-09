/**
 * reglagesDebuts.js — CE QUI EST FIXÉ AVANT LE REGARD pour les débuts de saison et les changements d'effectif (étape 35 du
 * plan, lot 1a, 09/11/2026).
 * -----------------------------------------------------------------------
 * Des constantes seulement (aucun import, aucune base, aucun fichier, aucune horloge, aucun hasard). Ce que le banc d'essai
 * à UN SEUL REGARD appliquera tel quel : la base statistique (copie figée des réglages du modèle de buts en essai), les
 * grilles et les a priori, les fenêtres, les ensembles, le juge, les seuils « utile », les contrôles « définition cassée »,
 * les tables des divisions. Les changer après le regard = une variante de plus, déclarée avant son passage
 * (bench/lancements.js, VARIANTES_DE_L_ETAPE_35), et le seuil de TOUTES devient z(K + 1).
 *
 * Ordre de priorité suivi : décisions de l'orchestrateur du 02/11/2026 (lot allégé : 11 variantes jugées, seuil 2,8376,
 * toutes « sans cote » ; « 1N2 seul » rapporté seulement ; la force de l'effectif DEDANS, verdict « prudent ») > décisions
 * de Pierre du 02/11 (n° 1 : compositions « oui partout, à l'essai » ; n° 6 : « qui compte » = 30 % des minutes, promu d'une
 * division non suivie = promu moyen) > critique > conception.
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/debutsDeSaison/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

/** Gèle un objet et tout ce qu'il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};

/** La forme de l'état et des fiches de l'étape (la changer = une autre version, refaite entière). */
export const VERSION_DEBUTS = 1;
/** La forme de la fiche gardée avant le coup d'envoi (lot 1b). */
export const VERSION_FICHE = 1;
/** La forme de la sortie du banc et de la note recopiée. */
export const VERSION_DU_BANC = 1;

/**
 * LA BASE STATISTIQUE : les réglages `modeleDeButs` de la candidate de l'étape 27 (modele-buts-v1), recopiés et figés AVANT
 * le regard (un test les compare à CANDIDATE_EN_ESSAI, comme la 32) : le banc reste défini même si la candidate change ou
 * est refusée. Le bras A de chaque comparaison est cette base, lue par son propre code (AccumulateurDesForces, forcesDe).
 */
export const BASE_STATISTIQUE = gele({
  version: 1,
  rho: -0.05,
  demiVies: { attaque: 35, defense: 25 },
  prior: 8,
  statistique: 'mix',
  poidsXg: 0.7,
  changementDeChampionnat: 'remise-a-zero',
  ancrage: { ligne: 2.5, methode: 'total-equilibre' },
  melange: { avecPlusMoins: { wT: 0.1, wS: 0.1 }, sans: { wT: 0.55, wS: 0.1 } },
  demarrageAFroid: { matchs: 8 },
  bornes: [0.2, 6]
});
/** L'empreinte des sommes des forces de cette base (empreinteDesForces de goalModel.js ; un test la recalcule). */
export const EMPREINTE_DE_LA_BASE = 'v1|35|25|remise-a-zero';

/** Les premiers matchs de championnat jugés : rangs 1 à 10 (la fiche du plan : « les 5 à 10 premières journées »). */
export const N_PREMIERES = 10;
/** Les tranches de rang RAPPORTÉES sans verdict (11-20 : la même variante sur plus de matchs, jamais une variante de plus). */
export const TRANCHES_DE_RANG = gele([[1, 5], [6, 10], [11, 20]]);

/** L'oubli à la trêve : d en matchs de vieillissement de plus pour tout ce qui précède la saison en cours. */
export const GRILLE_D = gele([0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64]);
/** L'a priori de l'oubli : gaussien d'écart-type 1,5 sur u = ln(1 + d) (un profil plat garde d ≈ 0). */
export const PRIOR_U = 1.5;
/** Newton (gradient et hessien numériques, pas 1e-4) : 25 itérations au plus, arrêt quand le plus grand pas est sous 1e-7. */
export const NEWTON = gele({ iterations: 25, arret: 1e-7, pas: 1e-4 });
/** L'a priori des centres (θ, en logarithme) : gaussien d'écart-type 0,5 — un centre de 0,6 ou 1,65 reste possible. */
export const PRIOR_CENTRES = 0.5;
/**
 * L'a priori du coefficient STANDARDISÉ de la force de l'effectif (critique, constat 6) : écart-type 0,05 par écart-type de
 * Δ (deux écarts-types ≈ ±10 % de buts). Un a priori plus serré monte le z mais rapetisse l'effet montré (dit à l'écran).
 */
export const PRIOR_EFFECTIF = 0.05;

/**
 * LE « COMMUN FD » (critique, constats 1 et 2) : à football-data (des buts seuls, aucun xG), les deux bras lisent le même
 * rétrécissement k0, réappris sur P1 dans cette grille (le même dans A et B), SI le test T-B2bis le permet (football-data
 * fabriqué SANS effet de promu : au plus 5 % de « retenu » sur 50 graines pour promus et nouveaux venus) ; sinon le commun
 * des remis à zéro seul (k0 = 8, celui de la base). `FORME_FD` est fixé par la mesure de T-B2bis AVANT le regard :
 * 'k0-commun' ou 'remis-a-zero-seul'.
 * MESURÉ le 09/11/2026 (test/fixtures/t-b2bis-etape35.json, 50 graines par monde, aucun effet de promu) : la forme complète
 * (k0 commun) sort « retenu » à tort pour 6 % des graines chez les promus (3 sur 50) dans le monde aux forces couplées —
 * au-delà des 5 % : la règle écrite avant s'applique, le commun des remis à zéro SEUL (k0 = 8).
 */
export const GRILLE_K0_FD = gele([8, 11, 16, 24]);
export const FORMES_FD = gele(['k0-commun', 'remis-a-zero-seul']);
export const FORME_FD = 'remis-a-zero-seul';

/** « Qui compte » (Pierre, 02/11, n° 6) : au moins 30 % des minutes possibles (90 × les matchs du club) ; un arrivé compte après 2 matchs du club. */
export const QUI_COMPTE = gele({ part: 0.3, minMatchsArrivee: 2 });
/** La force de l'effectif : au moins 2 matchs (avec feuille) joués dans la saison ; jugée sur les rangs 3 à 10. */
export const EFFECTIF = gele({ minMatchs: 2, rangMin: 3, rangMax: 10 });

/**
 * LES DIVISIONS SUIVIES AU MAGASIN (libellés EXACTS de day_matches.league, relevés dans la base du bac le 09/11) : les 7
 * frontières de montée et de descente. La direction vient de cette table, jamais d'un nom.
 */
export const NIVEAUX = gele({
  EPL: { pays: 'ENG', niveau: 1 },
  Championship: { pays: 'ENG', niveau: 2 },
  'League 1': { pays: 'ENG', niveau: 3 },
  'League 2': { pays: 'ENG', niveau: 4 },
  'La Liga - Spain': { pays: 'ESP', niveau: 1 },
  'La Liga 2 - Spain': { pays: 'ESP', niveau: 2 },
  'Serie A - Italy': { pays: 'ITA', niveau: 1 },
  'Serie B - Italy': { pays: 'ITA', niveau: 2 },
  'Bundesliga - Germany': { pays: 'GER', niveau: 1 },
  'Bundesliga 2 - Germany': { pays: 'GER', niveau: 2 },
  'Ligue 1 - France': { pays: 'FRA', niveau: 1 },
  'Ligue 2 - France': { pays: 'FRA', niveau: 2 }
});

/** LES DIVISIONS FOOTBALL-DATA (DIVISIONS de footballDataHistory.js) : 11 frontières ; l'identité du club est celle de son pays (fd_teams). */
export const NIVEAUX_FD = gele({
  E0: { pays: 'ENG', niveau: 1 },
  E1: { pays: 'ENG', niveau: 2 },
  E2: { pays: 'ENG', niveau: 3 },
  E3: { pays: 'ENG', niveau: 4 },
  EC: { pays: 'ENG', niveau: 5 },
  SC0: { pays: 'SCO', niveau: 1 },
  SC1: { pays: 'SCO', niveau: 2 },
  SC2: { pays: 'SCO', niveau: 3 },
  SC3: { pays: 'SCO', niveau: 4 },
  D1: { pays: 'GER', niveau: 1 },
  D2: { pays: 'GER', niveau: 2 },
  I1: { pays: 'ITA', niveau: 1 },
  I2: { pays: 'ITA', niveau: 2 },
  SP1: { pays: 'ESP', niveau: 1 },
  SP2: { pays: 'ESP', niveau: 2 },
  F1: { pays: 'FRA', niveau: 1 },
  F2: { pays: 'FRA', niveau: 2 },
  N1: { pays: 'NED', niveau: 1 },
  B1: { pays: 'BEL', niveau: 1 },
  P1: { pays: 'POR', niveau: 1 },
  T1: { pays: 'TUR', niveau: 1 },
  G1: { pays: 'GRE', niveau: 1 }
});

/**
 * LES IDENTITÉS FOOTBALL-DATA CORRIGÉES (avant le regard, 09/11/2026). Le contrôle « nouveaux-max-fd » des comptes a trouvé
 * G1 2005-06 à 5 nouveaux venus sur 16, dont « Kallithea », qui jouait en G1 la saison d'avant sous le nom « Kalithea » : un
 * même club sous deux noms, donc deux numéros fd_teams (un faux nouveau venu, ses forces reparties de rien). L'audit de tous
 * les numéros (mêmes pays, noms voisins, jamais la même saison ; chaque cas jugé À LA MAIN, jamais par un rapprochement
 * souple) en trouve trois autres d'une saison à la suivante dans la même division. `de` → `vers`, à partir du jour `depuis`
 * s'il est donné ; rien d'autre n'est réuni (des clubs différents aux noms voisins — Cesena / Cosenza, Farense / Feirense —
 * ou séparés par des années hors des divisions suivies restent à part).
 */
export const ALIAS_FD = gele([
  { de: 1213, vers: 1223, depuis: null, quoi: 'Kallithea (G1 2005-06) = Kalithea (G1 2002-03 à 2004-05)' },
  { de: 1065, vers: 1162, depuis: null, quoi: 'Roda (N1 2010-11 à 2017-18) = Roda JC (N1 2000-01 à 2009-10)' },
  { de: 1096, vers: 1134, depuis: null, quoi: 'Telford United (EC 2012-13, 2014-15) = AFC Telford United (EC 2011-12)' },
  { de: 1024, vers: 1086, depuis: '2010-07-01', quoi: 'Mouscron (B1 2016-17 à 2020-21) = Mouscron-Peruwelz (B1 2014-15, 2015-16), renommé en 2016 ; le Mouscron de 2000-01 à 2008-09, un autre club, garde son numéro' }
]);

/**
 * LES DIVISIONS-SAISONS FOOTBALL-DATA au-delà de 25 % de nouveaux venus VÉRIFIÉES par leur nom (avant le regard, 09/11/2026) :
 * chaque nouveau venu est un club distinct venu d'une division non suivie (Pierre n° 6 : un promu moyen), pas un problème
 * d'identifiants. Le contrôle « nouveaux-max-fd » les montre sans les compter cassées, SI leurs nouveaux venus sont
 * EXACTEMENT ces numéros (sinon, cassé).
 */
export const NOUVEAUX_VERIFIES_FD = gele([
  { league: 'G1', saison: 2011, clubs: [901, 902, 982, 1107, 1142], quoi: 'G1 2011-12 : Levadeiakos, Panetolikos, Giannina, OFI, Doxa Dramas arrivent ; Iraklis, Panserraikos, Larisa, Olympiakos Volou, Kavala partent : dix noms distincts, aucun dans les deux listes' }
]);

/**
 * LA FAUSSE RENTRÉE (placebo de la famille « rappel ») : juillet-juin, le 1er mars de la seconde année ; année civile, le
 * 1er septembre ; + (FNV-1a de « club:saison:f » mod 45) jours ; le faux point = le premier match de championnat du club à ce
 * jour ou après ; ses 10 premiers matchs de championnat jugés (loin des mercatos, des débuts et des fins de saison).
 */
export const FAUSSE_RENTREE = gele({ juilletJuin: { mois: 3, jour: 1 }, civile: { mois: 9, jour: 1 }, modulo: 45, matchsJuges: 10 });
/**
 * LE FAUX PROMU (placebo des familles « promus » et « nouveaux venus ») : un club `debut` tiré par FNV-1a de « club:saison:p »
 * mod 1000 < seuil ; seuil = arrondi(1000 × promus et relégués suivis ÷ clubs `debut`) de sa fenêtre (magasin ; football-data),
 * compté par la passe sans aucun résultat. Il ne remet RIEN à zéro (conception §5.4).
 */
export const FAUX_PROMU = gele({ modulo: 1000 });
/** LE FAUX EFFECTIF (placebo de la force de l'effectif) : les Δ du club suivant dans l'ordre FNV-1a de « club:saison:m », même championnat et même saison. */
export const FAUX_EFFECTIF = gele({ graine: 'm' });

/**
 * LES FENÊTRES DU BANC :
 *   magasin : mise en route 2023-01-01 → 2023-06-30 (états accumulés, rien d'appris ni de jugé) ; DEUX PLIS (apprendre sur
 *             l'un, juger l'autre, puis l'inverse ; les lignes des deux plis dans UN juge) ; rien après le 23/09/2026 ;
 *   fd      : les forces s'accumulent depuis 2000-07-01 ; P1 (2005-07-01 → 2019-06-30) APPREND ; P2 (2019-07-01 →
 *             2023-06-30) JUGE, sans rien y apprendre ; P2 saison par saison et 2020-21 (huis clos) rapportés à part.
 */
export const PERIODES_DU_BANC = gele({
  magasin: {
    miseEnRoute: { de: '2023-01-01', a: '2023-06-30' },
    plis: [
      { apprendre: { de: '2023-07-01', a: '2025-06-30' }, juger: { de: '2025-07-01', a: '2026-09-23' } },
      { apprendre: { de: '2025-07-01', a: '2026-09-23' }, juger: { de: '2023-07-01', a: '2025-06-30' } }
    ],
    dernierJourLu: '2026-09-23'
  },
  fd: {
    forcesDepuis: '2000-07-01',
    apprendre: { de: '2005-07-01', a: '2019-06-30' },
    juger: { de: '2019-07-01', a: '2023-06-30' },
    dernierJourLu: '2023-06-30',
    saisonsJugees: ['2019-20', '2020-21', '2021-22', '2022-23'],
    huisClos: { de: '2020-03-14', a: '2021-05-31' }
  }
});

/**
 * LE JUGE (le comparer de l'étape 16, inchangé) : la perte log du SCORE EXACT à la 90e, −ln p(score), grille 0-20 de
 * grilleDesButs (ρ de la base), plancher 1e-6 ; une ligne par match concerné, bloc = le match ; moyenne, sens min,
 * 1 000 tirages, graine 35, 200 blocs au moins, α 0,05 ; K = VARIANTES_DE_L_ETAPE_35.length (11 : z = 2,8376).
 */
export const JUGE = gele({ mesure: 'perte-log-score-exact', grilleMax: 20, plancher: 1e-6, tirages: 1000, graine: 35, minBlocs: 200, alpha: 0.05 });
/** L'ampleur d'une variante (sans résultat) : la plus grande des moyennes |P_B − P_A| parmi les 13 marchés témoins ; au moins 0,5 point. */
export const AMPLEUR = gele({ seuil: 0.005, sur: 'plus-grand-des-13-marches' });
/** Une famille n'est utile que retenue sur au moins 200 matchs jugés de sa fenêtre. */
export const MIN_MATCHS_UTILE = 200;

/** La définition retenue (déclarée, comptée dans K) : elle ne lit aucun résultat, elle n'est pas jugée. */
export const FICHE_RETENUE = 'debuts-de-saison-v1';

/**
 * LES FAMILLES, leurs variantes jugées par fenêtre et leur contrôle (placebo) PAR FENÊTRE (critique, constat 2 : un
 * contrôle « retenu » à football-data n'annule que le verdict football-data de sa famille, et inversement). La force de
 * l'effectif est jugée sur des fenêtres où les fiches de l'étape 30 ont été réglées : son verdict est toujours « prudent ».
 */
export const FAMILLES = gele({
  rappel: { mot: 'oubli à la trêve', fenetres: { magasin: { variante: 'magasin-rappel-sans-cote', placebo: 'magasin-placebo-fausse-rentree' } }, prudent: false },
  promus: {
    mot: 'promus et relégués',
    fenetres: { magasin: { variante: 'magasin-promus-sans-cote', placebo: 'magasin-placebo-faux-promu' }, fd: { variante: 'fd-promus-sans-cote', placebo: 'fd-placebo-faux-promu' } },
    prudent: false
  },
  nouveaux: {
    mot: 'nouveaux venus',
    fenetres: { magasin: { variante: 'magasin-nouveaux-sans-cote', placebo: 'magasin-placebo-faux-promu' }, fd: { variante: 'fd-nouveaux-sans-cote', placebo: 'fd-placebo-faux-promu' } },
    prudent: false
  },
  effectif: { mot: 'force de l’effectif', fenetres: { magasin: { variante: 'magasin-force-effectif-sans-cote', placebo: 'magasin-placebo-faux-effectif' } }, prudent: true }
});

/**
 * LES CONTRÔLES « DÉFINITION CASSÉE » (sur `--comptes`, AVANT le regard ; conception §5.8, ajustés au lot allégé). Une
 * définition cassée se corrige AVANT le regard (aucune perte n'a été calculée), sans compter de variante ; « Modifié avant le
 * regard le … » dans les règles. Un compte surprenant mais non cassé est seulement dit.
 * Modifié avant le regard le 09/11/2026 (comptes, essai 1) : le faux point se compte sur les clubs-saisons dont le JOUR du
 * faux point est lu (au plus le dernier jour lu) — une saison coupée par la fin de la fenêtre n'en a pas, par construction ;
 * les divisions-saisons de NOUVEAUX_VERIFIES_FD ne comptent pas cassées (leurs nouveaux venus vérifiés un par un).
 */
export const COMPTES_CASSES = gele({
  rappelMinParPeriode: 2500,
  promusMinClubsSaisonsParPeriode: 20,
  nouveauxMaxPartDUnChampionnat: 0.25,
  zoneContraireMaxPart: 0.1,
  fauxPointManquantMaxPart: 0.2,
  fauxPromuEcartMaxPart: 0.2,
  p2PromusMinClubsSaisons: 100,
  p1MinMatchs: 10000,
  effectifManquantMaxPart: 0.25,
  clubFdDansDeuxPays: 0
});

/** La preuve après lancement (partie 1c, avant janvier 2027) : puissance visée 0,8 ; la garde du mois : 12 regards au plus. */
export const PREUVE = gele({ puissance: 0.8, zPuissance: 0.8416 });
export const GARDE_MENSUELLE = gele({ variantes: 12, regardsMax: 12 });

/** La nuit (lot 1b) : les fiches des 14 prochains jours, tranches de 250, 20 couples du contrôle anti-fuite sur 365 jours, 10 min au plus. */
export const NUIT = gele({ fenetreJours: 14, tranche: 250, couples: 20, joursDuControle: 365, delaiMs: 600000 });

/**
 * LES DÉCISIONS DE PIERRE (02/11/2026 au soir, `scratchpad/decisions-pierre-02-11.md`), avec leur date et leur source.
 * Aucun fichier du moteur, du chemin de l'essai 27, du gel des pronostics ni de l'IA ne les lit (T-X6).
 */
export const DECISION_DE_PIERRE = gele({
  effectifAuBanc: { reponse: 'oui', le: '2026-11-02', source: 'décision n° 1 : compositions « oui partout, à l’essai »' },
  effectifDansLesChiffres: { reponse: null, le: null, source: 'seulement par le chemin habituel : banc, essai à blanc d’une candidate, clic « Adopter »' },
  quiCompte: { reponse: 0.3, le: '2026-11-02', source: 'décision n° 6 : au moins 30 % des minutes qu’il pouvait jouer' },
  nonSuivis: { reponse: 'promu moyen', le: '2026-11-02', source: 'décision n° 6 : promu d’une division non suivie = traité comme un promu moyen' },
  secondTournoi: { reponse: 'pas un début de saison', le: '2026-11-02', source: 'décisions de l’orchestrateur, n° 3 (défaut de Pierre)' },
  ouAfficher: { reponse: 'contexte du match', le: '2026-11-02', source: 'décisions de l’orchestrateur, n° 3' }
});

/** Les limites du lot 1a, en mots simples (recopiées dans la note du banc). */
export const LIMITES_DU_LOT_1A = gele([
  'Le magasin de 2023 à 2026 a déjà servi à d’autres réglages : un effet mesuré là est un jugement prudent.',
  'football-data de 2019 à 2023 n’a que des buts (aucun xG) : il juge la méthode, jamais les valeurs du magasin.',
  'La force de l’effectif est jugée sur des fenêtres où les fiches des joueurs ont été réglées : son verdict est toujours « prudent ».',
  'L’exemple des titulaires majeurs absents relève de la force du onze du jour (étapes 30 et 34), pas de l’effectif de la saison.',
  'Avec les cotes, rien n’est jugé au lot 1 : « 1N2 seul » est rapporté, « avec cotes » attend l’essai d’une candidate.',
  'À football-data, la forme retenue (le commun des remis à zéro seul) se trompe du côté prudent : sous un effet nul, il y a environ 6 % de chances qu’un « moins bon » à football-data bloque les nouveaux venus — une erreur prudente, jamais une utilité à tort.'
]);
