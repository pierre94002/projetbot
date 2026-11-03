/**
 * reglagesJoueurs.js — CE QUI EST FIXÉ AVANT LE REGARD pour les chiffres des joueurs (étape 34 du plan, lot 1a, 03/11/2026).
 * -----------------------------------------------------------------------
 * Pur, et AUCUN import (test joueursFrontiere, T-X3). Hors de l'empreinte du moteur (data/joueurs/) : aucun fichier du
 * moteur ne le lit (T-X2). Changer une seule de ces valeurs après le regard unique du banc = une variante de plus,
 * déclarée avant son passage (bench/lancements.js, VARIANTES_DE_L_ETAPE_34) ; le seuil de toutes devient z(K + 1).
 * Sources : conception de l'étape 34 (§2.11, §6), sa critique (constats 2, 4, 5, 8, 9, 14, 17, 18, 19, 20), les décisions
 * de l'orchestrateur et de Pierre du 02/11/2026 (décisions-pierre-02-11, n° 1 et n° 6).
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

/** La version de la fiche des joueurs (joueurs-v1) et des tables. */
export const VERSION_JOUEURS = 1;

/** Les quatre familles du lot 1 (décision n° 6 de Pierre : PAS de premier buteur, PAS de « tirs » d'un joueur). */
export const FAMILLES = gele(['marque', 'cadres', 'averti', 'passeur']);

/** Les cinq signaux d'une apparition (conception §2.2) : xG hors penalty, penalties tirés, tirs cadrés, averti, xA. */
export const SIGNAUX = gele(['np', 'pen', 'sot', 'av', 'xa']);

/**
 * Les demi-vies des sommes amorties, en apparitions RELEVÉES pour ce signal (fixées a priori, conception §2.3) ; les
 * penalties PAR CLUB (remise à zéro au changement de club) ; les minutes d'un titulaire en titularisations ; le banc en
 * présences sur le banc listé.
 */
export const DEMI_VIES = gele({ np: 20, xa: 20, sot: 20, av: 30, pen: 40, minutes: 10, entree: 20, banc: 20 });

/**
 * Les repères (conception §2.3 ; critique, constat 8) :
 *   jours 90          le repère GLOBAL du poste : ses apparitions de titulaire, toutes compétitions, des 90 jours d'avant J ;
 *   joursLigue 365    le RAPPORT de la compétition pour ce poste (bras A = repère du poste × rapport, rétréci) : ses
 *                     apparitions des 365 jours d'avant J, x réalisé face à x prévu par le repère global du jour ;
 *   kappaLigue 40     le rappel du rapport vers 1, en événements attendus.
 */
export const REPERES = gele({ jours: 90, joursLigue: 365, kappaLigue: 40 });

/** Le rappel des minutes d'un titulaire (3 titularisations « moyennes ») et de la chance d'entrer (3 présences). */
export const RAPPELS = gele({ minutes: 3, entree: 3 });

/**
 * LA GRILLE DES κ du bras B, en « matchs moyens » (κ = κm × T̄ du signal) : FINIE — un bras sans information ne redevient
 * jamais le repère, il paie son bruit (c'est ce qui rend un placebo parlant). Le repère (bras A) est κ = ∞.
 */
export const GRILLE_KAPPA = gele([0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]);

/**
 * LA RÈGLE P (penalties et xG hors penalty d'une ligne à xG ; conception §2.2) : un penalty vaut 0,785 d'xG chez FotMob
 * (tolérance 0,016) ; un écart d'au moins 0,70 entre xG et xG hors penalty est un penalty ; sous 0,70 d'xG sans xG hors
 * penalty, aucun penalty possible. `parAnnee` : le contrôle de la règle se fait par année (critique, constat 14) ; une
 * année cassée → ses « absents » redeviennent inconnus (repli écrit d'avance).
 */
export const REGLE_P = gele({ valeur: 0.785, tolerance: 0.016, seuil: 0.7 });

/**
 * LES GARDIENS NE SONT PAS JUGÉS (03/11/2026, avant le regard ; essai T-B11bis) : leurs parts sont minuscules (tirs cadrés,
 * buts, passes), le rapport de leur poste par compétition n'a que quelques événements attendus par an (bien moins que les
 * 40 du rappel) et reste donc près de 1 : un écart de CONTEXTE compétition × gardien se ferait passer pour un effet du
 * joueur (dans les mondes tirés au hasard, 26 % de perte en moins sur les seuls gardiens, aucun écart propre au joueur).
 * Ils restent dans la composition et dans la normalisation ; à l'écran, leur chiffre est celui du poste.
 */
export const GARDIENS_JUGES = false;

/**
 * LES TIRS CADRÉS DU PLI A JUGÉS À PARTIR DU 01/01/2024 (décision de l'orchestrateur du 03/11/2026, choix b ; décidé avant le
 * regard, sur un compte de couverture seulement, aucun résultat lu) : la base S (formule du moteur sur les fenêtres f10, 6
 * matchs au moins de chaque côté) naît avec le magasin (janvier 2023) et ne couvre que 64,7 % des matchs du 2e semestre
 * 2023 (garde `baseCadresMin` : 79,4 % sur le pli A entier, sous ses 80 %). Les lignes « tirs cadrés » de A d'avant cette
 * date ne sont pas jugées ; l'apprentissage (pour juger B) garde tout ce qui a une base ; la garde reste à 80 %, comptée sur
 * la fenêtre jugée. Les autres familles ne changent pas.
 */
export const DEBUT_DES_CADRES_JUGES = gele({ A: '2024-01-01', B: '2025-07-01' });

/** Les minutes d'un match (11 × 90) ; minutes d'une apparition comptées jusqu'à 90. */
export const MINUTES_DU_MATCH = 990;
export const MINUTES_MAX = 90;

/** Le plafond de la chance d'être averti (conception §2.8). */
export const PLAFOND_AVERTI = 0.95;

/** Les bornes du λ d'une équipe (celles de BASE_STATISTIQUE, data/contexte/bancDuContexte.js : égalité testée). */
export const BORNES_LAMBDA = gele([0.2, 6]);

/** Newton (recalage de la base) : au plus 30 itérations, arrêt sous 1e-10. */
export const NEWTON = gele({ iterations: 30, arret: 1e-10 });

/** Le plancher d'une probabilité (= PROBA_MIN de bench/metrics.js et celui des cartons : égalité testée). */
export const PLANCHER = 1e-6;

/**
 * Les postes (codes) : 1 gardien, 2 défenseur (Sweeper compris), 3 milieu, 4 attaquant ; 0 inconnu (repère de tous les
 * joueurs de champ) ; « R » : les remplaçants ENTRÉS (le repère du bloc des remplaçants). Un poste absent de la ligne :
 * le poste dominant des 10 dernières apparitions du joueur.
 */
export const POSTES = gele({ Goalkeeper: 1, Defender: 2, Sweeper: 2, Midfielder: 3, Forward: 4 });
export const POSTE_DOMINANT_SUR = 10;

/**
 * LES FAUX JOUEURS des placebos (emplacements par poste ; ≈ 35 apparitions par an chacun) : l'emplacement d'une
 * apparition = FNV-1a 32 bits des octets UTF-8 de « clé du match:numéro du joueur » mod M du poste ; un poste inconnu
 * va au pool des milieux (3). Nombre FIXÉ avant (critique de la 33, constat 15).
 */
export const FAUX_JOUEURS = gele({ 1: 1000, 2: 4400, 3: 4800, 4: 2700 });

/**
 * Les périodes du banc (celles des étapes 32 et 33) : la mise en route accumule sans apprendre ni juger ; deux plis
 * croisés ; rien après le 23/09/2026 n'est lu.
 */
export const PERIODES_DU_BANC = gele({
  miseEnRoute: { de: '2023-01-01', a: '2023-06-30' },
  plis: [
    { nom: 'A', apprendre: { de: '2025-07-01', a: '2026-09-23' }, juger: { de: '2023-07-01', a: '2025-06-30' } },
    { nom: 'B', apprendre: { de: '2023-07-01', a: '2025-06-30' }, juger: { de: '2025-07-01', a: '2026-09-23' } }
  ],
  dernierJourLu: '2026-09-23'
});

/**
 * LE JUGE : comparer de l'étape 16 (guard.js), inchangé — moyenne, min, 1 000 tirages, graine 34, 200 blocs au moins ;
 * K = VARIANTES_DE_L_ETAPE_34.length (11, placebo-passeur compris : critique, constat 8). `echantillonKappa` : la grille
 * des κ s'apprend sur au plus 60 000 camps du pli d'apprentissage, tirés par la graine 34.
 */
export const JUGE = gele({ tirages: 1000, graine: 34, minBlocs: 200, echantillonKappa: 60000, plancher: PLANCHER });

/**
 * Le seuil d'AMPLEUR d'une variante utile (garde SECONDAIRE ; critique, constat 19.2 — près du bruit pour l'averti) :
 * la moyenne, sur les lignes jugées, de |P_B − P_A| de l'issue binaire de la famille, sans aucun résultat ; 0,5 point,
 * 0,3 point pour le tireur (un joueur par équipe).
 */
export const AMPLEUR = gele({ seuil: 0.005, tireur: 0.003, secondaire: true });

/**
 * « CALIBRÉ » (conception §6.5) : sur toutes les lignes jugées, après le RECALAGE PAR DIXIÈMES appris sur l'autre pli
 * (critique, constat 5), l'écart moyen pondéré des 10 déciles ≤ 1,0 point et aucun décile au-delà de max(2,5 points ;
 * 2,58 erreurs types). Le « fini quand » de la fiche l'exige pour « marque » et « au moins un tir cadré ».
 */
export const CALIBRE = gele({ moyen: 0.01, pire: 0.025, z: 2.58, deciles: 10, exige: ['marque', 'cadres'] });

/** Une variante n'est utile que jugée sur au moins 200 matchs. */
export const MIN_MATCHS_UTILE = 200;

/** La preuve après lancement (lot 1b et plus tard) : 80 % de puissance à l'effet vu au banc, 60 jours au moins. */
export const PREUVE = gele({ zPuissance: 0.8416, minJours: 60 });

/**
 * LES CONTRÔLES « DÉFINITION CASSÉE » de `--comptes` (conception §6.8, critique constats 4 et 14), sur A ou sur B :
 *   titulairesMin       moins de 300 000 titulaires jugeables pour « marque » ;
 *   buteursMin          buteurs relevés pour moins de 85 % des camps non prolongés et non attribués à feuille ;
 *   rattachesMin        moins de 95 % des buts et cartons du déroulé (non csc, avec identifiant) rattachés à une ligne jouée ;
 *   reglePCas2Min       cas 2 (multiple de 0,785) avec un but sur penalty du même identifiant sous 60 % — PAR ANNÉE ;
 *   reglePCas1Min       cas 1 à écart « penalty » avec un but sur penalty du même identifiant sous 60 % — PAR ANNÉE ;
 *   reglePZeroMax       cas « k = 0 » (1 à écart 0, 3) avec un but sur penalty du même identifiant au-dessus de 1 % — PAR ANNÉE ;
 *   reglePInconnuMax    cas 4 (inconnu) au-dessus de 0,5 % des lignes à xG — PAR ANNÉE ;
 *   cadresMin           tirs cadrés relevés pour moins de 80 % des camps à feuille ;
 *   cartonsMin          cartons relevés (33) pour moins de 50 % des matchs non prolongés, non attribués ;
 *   passesMin           passes relevées (xA, sinon l'égalité des passes) pour moins de 80 % des camps à feuille ;
 *   baseLambdaMin       base λ pour moins de 95 % des matchs jugeables ; baseCadresMin : base S pour moins de 80 % ;
 *   baseCartonsMin      repère des cartons pour moins de 70 % des matchs aux cartons relevés ;
 *   fauxMin / fauxMax   faux joueurs à moins de 10 ou plus de 80 apparitions par emplacement et par an (médiane).
 * Repli écrit d'avance pour la règle P : une année cassée → ses « xG hors penalty absent » redeviennent INCONNUS (les
 * camps concernés perdent np, pen et xa) ; aucune variante n'est comptée. Repli des passes (critique, constat 4) : la
 * règle de départ est déjà l'égalité de comptes ; rien d'autre n'est prévu.
 */
export const COMPTES_CASSES = gele({
  titulairesMin: 300000,
  buteursMin: 0.85,
  rattachesMin: 0.95,
  reglePCas2Min: 0.6,
  reglePCas1Min: 0.6,
  reglePZeroMax: 0.01,
  reglePInconnuMax: 0.005,
  cadresMin: 0.8,
  cartonsMin: 0.5,
  passesMin: 0.8,
  baseLambdaMin: 0.95,
  baseCadresMin: 0.8,
  baseCartonsMin: 0.7,
  fauxMin: 10,
  fauxMax: 80
});

/** La nuit (lot 1b) : tranches de 250, 20 couples du contrôle anti-fuite sur 365 jours, calendrier à 18 jours, archive à 36 h, fiches des 540 derniers jours. */
export const NUIT = gele({ tranche: 250, couples: 20, joursDuControle: 365, calendrierJours: 18, archiveHeures: 36, fichesJours: 540 });

/** L'enregistreur d'avant-match (lot 1b) : toutes les 10 minutes, les matchs des 150 prochaines minutes. */
export const AVANT_MATCH = gele({ rythmeMin: 10, fenetreMin: 150 });

/**
 * LES DÉCISIONS DE PIERRE (02/11/2026, decisions-pierre-02-11.md ; critique, constat 18 : remplies AVANT le scellement) :
 *   regles   n° 6 : joueur non entré = pari REMBOURSÉ, but contre son camp exclu, prolongation exclue (90 minutes et
 *            temps additionnel) ; averti = un carton reçu sur le terrain, jaune ou rouge, deuxième jaune comprise ; tir
 *            cadré au sens habituel ; passe décisive = celle que publie FotMob ;
 *   marches  n° 6 : buteur à tout moment, tirs cadrés d'un joueur, joueur averti, passeur décisif (PAS de premier buteur ;
 *            PAS de « tirs » d'un joueur : players.shots oublie les tirs contrés) ;
 *   place    n° 6 (« toutes les recommandations ») : un onglet « Joueurs » juste après « Compositions » ;
 *   compositions  n° 1 : les compositions dans les chiffres « oui partout, à l'essai » — au lot 2 seulement, par le chemin
 *            habituel (banc, essai à blanc, clic « Adopter »).
 */
export const DECISION_DE_PIERRE = gele({
  regles: { valeur: 'rembourse-csc-exclu-90-minutes', date: '2026-11-02', source: 'decisions-pierre-02-11.md, n° 6', mots: 'joueur non entré = pari REMBOURSÉ, but contre son camp exclu, prolongation exclue (90 minutes et temps additionnel)' },
  marches: { valeur: ['buteur', 'tirs-cadres', 'averti', 'passeur'], date: '2026-11-02', source: 'decisions-pierre-02-11.md, n° 6', mots: 'buteur à tout moment, tirs cadrés d’un joueur, joueur averti, passeur décisif (PAS « premier buteur »)' },
  place: { valeur: 'onglet-joueurs-apres-compositions', date: '2026-11-02', source: 'decisions-pierre-02-11.md, n° 6 (« toutes les recommandations »)' },
  compositions: { valeur: 'oui-partout-a-l-essai', date: '2026-11-02', source: 'decisions-pierre-02-11.md, n° 1', lot: 2 }
});

/** Les mentions fixes de l'écran (lot 1b), en français simple (critique, constat 16). */
export const MOTS = gele({
  regles: 'Un but contre son camp ne compte pas pour un buteur. Les chiffres valent pour le temps réglementaire et le temps additionnel. Un joueur qui ne joue pas : pari remboursé chez la plupart des bookmakers (à vérifier chez le vôtre).',
  averti: 'Avertissement : un carton jaune ou rouge, deuxième jaune comprise ; un carton reçu sur le banc compte aussi dans ces chiffres (FotMob ne le distingue pas avant octobre 2026).',
  tirs: 'Tirs (plus de X) : pas calculé. Le magasin ne garde pas les tirs contrés d’un joueur ; ce sera possible après une correction du relevé FotMob.',
  penaltiesAuPoste: 'Les penalties sont répartis comme d’habitude pour chaque poste : le tireur n’a pas été prouvé au banc d’essai.',
  penaltiesAuTireur: 'Les penalties vont au tireur que l’appli reconnaît par son identifiant FotMob.'
});
