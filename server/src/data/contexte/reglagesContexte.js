/**
 * reglagesContexte.js — CE QUI EST FIXÉ AVANT LE REGARD pour le contexte du match (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Des constantes seulement (aucun import, aucune base, aucun fichier, aucune horloge). Les seuils de la fiche de contexte
 * (repos, enchaînement, altitude, entraîneur, arbitre), la garde des fiches et de l'avant-match, le contrôle anti-fuite de
 * la nuit, et ce que le banc d'essai (partie B, UN seul regard, plus tard) devra appliquer tel quel : ses périodes (deux
 * plis), sa mesure (la perte du SCORE EXACT ; les 13 marchés de buts en témoins), son seuil d'ampleur. Les changer après
 * le regard = une variante de plus, déclarée avant son passage (bench/lancements.js, VARIANTES_DE_L_ETAPE_32).
 *
 * Décisions de l'orchestrateur du 29/10/2026 (constats 1, 2, 8, 9, 10 de la critique) : juge sur le score exact en deux
 * plis ; la classe « long » du repos n'est plus mesurée (gardée à l'écran avec sa mention) ; la rétention suit l'horizon
 * de la preuve (les fiches gelées des matchs joués et leur avant-match ne sont JAMAIS élaguées) ; l'indice « de buts » de
 * l'arbitre pour le banc se calcule sur la base statistique (λS + μS), celui « face au championnat » sert à l'écran.
 * -----------------------------------------------------------------------
 */

/** La forme de la fiche de contexte : la changer = des fiches d'une autre version (le lecteur du moteur, au lot 2, l'exige égale). */
export const VERSION_CONTEXTE = 1;

/** La forme des lignes de `contexte_rencontres` (le cache incrémental de la nuit) : la changer relit tout. */
export const VERSION_RENCONTRES = 1;

/**
 * Les seuils de la fiche (tous en heures, mètres, matchs ou jours) :
 *   courtH 96 / longH 240       repos « court » sous 96 h, « long » à 240 h ou plus (normal entre les deux) ;
 *   serreH 96                    le club rejoue moins de 96 h après le coup d'envoi du jour J ;
 *   altitudeM 2000 / ecartAltitudeM 1500   stade à 2 000 m ou plus, visiteur sans altitude listée ou 1 500 m plus bas ;
 *   nouvelEntraineurMatchs 5 / retourJours 365   nouvel entraîneur : 5 matchs au plus, un autre avant lui, et il n'avait
 *                                pas dirigé ce club dans les 365 jours avant le début de sa suite (un intérim A → B → A ne
 *                                fait pas d'A un « nouveau ») ;
 *   kArbitreButs 10 / kArbitrePen 20   les matchs « moyens » ajoutés pour ramener un arbitre peu connu vers 0 ;
 *   penDefaut 0,25 / minLiguePen 30    le taux de penalties d'un championnat sous 30 matchs à déroulé complet ;
 *   fenetreLigueJours 365        les moyennes d'un championnat (cartons, fautes, penalties) : ses 365 derniers jours ;
 *   repliLigueButs 2,6           buts par match d'un championnat sans moyenne connue (1,45 + 1,15, la table du jour J).
 */
export const SEUILS = Object.freeze({
  courtH: 96,
  longH: 240,
  serreH: 96,
  altitudeM: 2000,
  ecartAltitudeM: 1500,
  nouvelEntraineurMatchs: 5,
  retourJours: 365,
  kArbitreButs: 10,
  kArbitrePen: 20,
  penDefaut: 0.25,
  minLiguePen: 30,
  fenetreLigueJours: 365,
  repliLigueButs: 2.6
});

/**
 * Les mois où un club brésilien joue aussi son championnat d'État, que l'appli ne suit pas : son repos y est surestimé
 * (la fiche porte la mention, comme pour tout repos « long »).
 */
export const MOIS_DES_CHAMPIONNATS_D_ETAT = Object.freeze([1, 2, 3, 4]);

/** Les coupes continentales (clés de FOTMOB_LEAGUES, fotMobProvider.js) : dites dans le repos et l'enchaînement. */
export const COUPES_CONTINENTALES = Object.freeze(['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League', 'Copa Libertadores', 'Copa Sudamericana', 'Leagues Cup']);

/**
 * LA NUIT : les fiches des matchs des `fenetreJours` prochains jours (le calendrier de saison), le « prochain match »
 * cherché jusqu'à `prochainsJours`, et les matchs du calendrier des `prevusDepuisJours` derniers jours pas encore au
 * magasin (joués tard, feuille pas encore lue) comptés comme « match précédent » ; le contrôle anti-fuite : `couples`
 * (rencontre, camp) tirés avec la graine du jour parmi les `joursDuControle` derniers jours.
 */
export const NUIT = Object.freeze({ fenetreJours: 14, prochainsJours: 18, prevusDepuisJours: 2, couples: 20, joursDuControle: 365 });

/**
 * LA GARDE (constat 8 de la critique) : les fiches gelées des matchs JOUÉS et leur avant-match ne sont JAMAIS élaguées
 * (environ 20 000 matchs × 2 Ko par an : la preuve après lancement en a besoin d'un an au moins) ; seules les fiches
 * ORPHELINES (match reporté ou annulé : aucune rencontre jouée à cette date entre ces deux clubs) partent après
 * `orphelinesJours` jours. Rangement par tranches de `tranche` lignes, une transaction par tranche.
 */
export const GARDE = Object.freeze({ orphelinesJours: 30, tranche: 250 });

/**
 * L'archive d'avant-match : sa liste blanche et sa règle vivent dans data/db/matchStatsDb.js (CHAMPS_AVANT_MATCH,
 * ligneDAvantMatch, archiverLAvantMatch) — le module de la base est atteint par le moteur, data/contexte/ ne doit pas
 * l'être (T-X2).
 */

// ======================================================= le banc (partie B) : fixé ici AVANT le regard unique

/** L'a priori des coefficients (Poisson pénalisé, écart-type 0,1 sur chaque coefficient ; niveaux fixés au recalage). */
export const PRIOR_SD = 0.1;

/**
 * Les périodes du banc (décision 1 de l'orchestrateur, 29/10/2026) : la mise en route accumule sans apprendre ni juger ;
 * puis DEUX PLIS — apprendre sur l'un, juger l'autre, puis l'inverse ; les lignes des deux plis réunies dans UN seul juge,
 * chaque ligne jugée avec des coefficients appris sur l'AUTRE pli. Rien après le 23/09/2026 n'est lu.
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
 * Le juge du banc (constat 1 de la critique) : la perte log du SCORE EXACT à la 90e (−log p(score), grille 0-20 du modèle
 * de buts), une ligne par match concerné, bloc = le match ; le juge de l'étape 16 inchangé (comparer : moyenne, min,
 * 1 000 tirages, graine 32, 200 blocs au moins) ; K = le nombre de variantes déclarées (VARIANTES_DE_L_ETAPE_32.length).
 * Les 13 marchés binaires de buts sont des TÉMOINS rapportés, jamais jugés.
 */
export const JUGE_DU_BANC = Object.freeze({ mesure: 'perte-log-score-exact', grilleMax: 20, plancher: 1e-6, tirages: 1000, graine: 32, minBlocs: 200, temoins: 'marches-de-buts-13' });

/**
 * Le seuil d'ampleur d'une variante « utile » (constat 10 de la critique) : la plus grande des moyennes absolues de
 * changement parmi les 13 marchés de buts, sur les matchs concernés, calculée sans résultat — au moins 0,5 point.
 */
export const AMPLEUR = Object.freeze({ seuil: 0.005, sur: 'plus-grand-des-13-marches' });

/** La garde mensuelle de la preuve après lancement (partie C2) : 12 regards au plus, puis elle s'arrête. */
export const GARDE_MENSUELLE = Object.freeze({ variantes: 12, regardsMax: 12 });

/** La réponse de Pierre à Q1 (le contexte un jour dans les chiffres ?) : null tant qu'il n'a pas répondu. Aucun fichier du moteur ne la lit. */
export const DECISION_DE_PIERRE = Object.freeze({ contexteDansLesChiffres: null });
