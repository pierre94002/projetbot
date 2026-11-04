/**
 * reglagesCombinaison.js — LES RÉGLAGES DE L'ÉTAPE 38 « Combinaison + confiance + seuil de value » (lot 1a, 03-04/11/2026).
 * -----------------------------------------------------------------------
 * Tout ce qui a été écrit AVANT le regard unique du banc : les décisions de Pierre (null = le défaut prudent de la
 * conception, §10), la règle de confiance (degrés, seuils, « fragile » si un degré 2 ou une somme ≥ 2), les bandes et
 * les règles du seuil (jamais apprises par optimisation), les fenêtres du banc, les juges, les tailles minimales, la
 * nuit (lot 1b) et l'étalonnage (la note de départ, P2). Hors de l'empreinte du moteur (data/combinaison/) : aucun
 * chiffre du moteur n'en dépend. Pur : n'importe rien, ne lit rien.
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

/** La version de la règle (étiquette, confiance, classe de seuil) : chaque ligne de la nuit la porte. */
export const VERSION_DE_LA_REGLE = '38.1';

/**
 * LES DÉCISIONS DE PIERRE (conception §10). `null` = pas de réponse : le DÉFAUT PRUDENT de la conception (rien ne change
 * de ce qu'il voit ; rien n'est adopté sans lui). Q-H a sa réponse (décisions du 02/11, n° 7, 03/11 vers 19 h 20) : il
 * parie chez Unibet et Betclic (marge 11-15 %, aucune value prouvée chez eux) — la mention « jamais mesuré chez ce
 * bookmaker » s'applique ; capital 300 € (étape 39). Ses réglages du moteur ne sont PAS touchés avant le verdict de la 27.
 */
export const DECISIONS_DE_PIERRE = gele({
  qA: null,
  qB: null,
  qC: null,
  qG: null,
  qH: { reponse: 'mention', le: '2026-11-03', source: 'decisions-pierre-02-11.md, n° 7', livres: ['unibet_fr', 'betclic_fr'], phrase: 'Pour l’instant, les deux bookmakers que j’ai, c’est Unibet et Betclic.' },
  defauts: {
    qA: 'Le moteur reste le marché sur le 1N2 et le plus/moins 2,5 cotés tant que rien n’a prouvé qu’il y ajoute quelque chose ; l’écran le dit.',
    qB: 'Rien avant le lot 2 sur les cotes saisies (jamais deux verdicts sur un écran).',
    qC: 'compo-avant-cote déclarée et rapportée ; aucun β compo sur le 1N2.',
    qG: 'La mention « jamais mesuré » (palier 3) ; jamais « aucune value » sans l’ombre.',
    qH: 'La mention « jamais mesuré chez ce bookmaker » et l’ombre les compte à part (affichage seulement).'
  }
});

/** Les familles de marchés (une famille = un verdict ; jamais réunies). */
export const FAMILLES = gele(['1n2', 'buts', 'corners', 'tirs', 'cadres', 'cartons', 'joueurs']);

/** Les marchés gelés de chaque famille (identifiants de marché du moteur). */
export const MARCHES_DE_LA_FAMILLE = gele({
  '1n2': ['result'],
  buts: ['totalGoals', 'teamGoals', 'bothTeamsScore', 'resultAndTotal', 'scoreExact'],
  corners: ['totalCorners', 'teamCorners'],
  tirs: ['totalShots', 'teamShots'],
  cadres: ['totalShotsOnTarget', 'teamShotsOnTarget'],
  cartons: ['totalCards', 'teamCards'],
  joueurs: ['playerScorer', 'playerShotsOnTarget', 'playerBooked', 'playerAssist']
});

/**
 * LA RÈGLE DE CONFIANCE (conception §2.1-2.2, hypothèses scellées). Degré 0 = rien à redire ; 1 = un manque ; 2 =
 * « fragile » à lui seul. « fragile » si max(degrés) = 2 ou Σ degrés ≥ 2 ; « sur » sinon (le mot « sûr » n'est jamais
 * montré avant un verdict). B (fraîcheur) n'est JAMAIS un degré (critique, constat 1) : une explication seulement.
 * Aucun ingrédient ne lit la probabilité ni la distribution, sinon pour une PROVENANCE (T-C2).
 */
export const REGLE_DE_CONFIANCE = gele({
  ingredients: ['A', 'C', 'D', 'E', 'F', 'G'],
  fragileSiUnDegre: 2,
  fragileSiSomme: 2,
  seuils: {
    nMinPlein: 8,
    cornersReleves: 6,
    accord1n2Points: 0.03,
    accordButsLog: 0.35,
    aVerifierJours: 60
  },
  /** Ce que lit chaque famille (les joueurs héritent de l'équipe : les degrés des buts). */
  lectures: {
    '1n2': ['A', 'E', 'F', 'G'],
    buts: ['A', 'C', 'D', 'E', 'F', 'G'],
    corners: ['A', 'C', 'D', 'E'],
    tirs: ['A', 'C', 'D', 'E'],
    cadres: ['A', 'C', 'D', 'E'],
    cartons: ['A', 'C', 'E'],
    joueurs: ['A', 'C', 'D', 'E', 'F', 'G']
  },
  /** Degré de A par ancre (régime) : la cote juste et sa provenance. */
  degreDeLAncre: {
    pinnacle: 0,
    palier2: 0,
    'buts-plusmoins': 0,
    'corners-releves': 0,
    palier3: 1,
    'buts-1n2': 1,
    repli: 2,
    'sans-cote': 2,
    'buts-stats-seules': 2,
    'buts-service': 2
  },
  /** Degré de F par verdict de la case (version × marché × dixième, matchs joués avant J). */
  degreDeLaCase: { 'dans-le-hasard': 0, 'trop-peu': 0, 'trop-haut': 2, 'trop-bas': 2 }
});

/** Les bandes du seuil (en part, jamais apprises). */
export const BANDES = gele([0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.1, 0.25]);

/** Le seuil en service (2 %, valueFinder.js : edgeThresholdMin) : la règle A de toute comparaison. */
export const SEUIL_EN_SERVICE = 0.02;

/**
 * LES RÈGLES DU SEUIL : pour une classe de seuil { ancre, accord, aVerifier, livre, coteHaute }, le seuil (une bande) ou
 * null (« aucune value »). Écrites AVANT le regard ; seuil-v1 = la règle en service. Les variantes P5-b (l'ombre) sont
 * déclarées ici aussi et ne sont jugées qu'après le lancement.
 */
export const REGLES_DE_SEUIL = gele({
  'seuil-v1': { base: 0.02 },
  'pinnacle-1pc': { base: 0.02, pinnacle: 0.01 },
  'pinnacle-1-5pc': { base: 0.02, pinnacle: 0.015 },
  'pinnacle-3pc': { base: 0.02, pinnacle: 0.03 },
  'pinnacle-5pc': { base: 0.02, pinnacle: 0.05 },
  'accord-disperse-4pc': { base: 0.02, disperse: 0.04 },
  'accord-disperse-aucune': { base: 0.02, disperse: 'aucune' },
  'cote-haute-3pc': { base: 0.02, coteHaute: 0.03 },
  'placebo-classe': { base: 0.02, coteHautePermutee: 0.03, brasA: 'placebo-classe-bras-a' },
  'placebo-classe-bras-a': { base: 0.02, coteHautePermutee2: 0.03, interne: true },
  'palier2-3pc': { base: 0.02, palier2: 0.03 },
  'palier3-5pc': { base: 0.02, palier3: 0.05 },
  'palier3-aucune': { base: 0.02, palier3: 'aucune' },
  'a-verifier-aucune': { base: 0.02, aVerifier: 'aucune' },
  'francais-aucune': { base: 0.02, francais: 'aucune' }
});

/** La cote au-delà de laquelle un pari est de la classe « cote haute » (cote-haute-3pc, placebo-classe). */
export const COTE_HAUTE = 3;

/** Les variantes emboîtées d'une même classe (règle de choix scellée : la plus proche de la règle en service, T-B17). */
export const EMBOITEES = gele({ pinnacle: ['pinnacle-1pc', 'pinnacle-1-5pc', 'pinnacle-3pc', 'pinnacle-5pc'], disperse: ['accord-disperse-4pc', 'accord-disperse-aucune'] });

/** Les bookmakers français (« livre » non mesuré, conception §3.4). */
export const LIVRES_FRANCAIS = gele(['betclic_fr', 'unibet_fr', 'winamax_fr', 'pmu_fr']);

/**
 * LA RÈGLE DE PARI DE L'ÉTALONNAGE ET DU BANC DU SEUIL (celle de la note de départ, P2 : cote juste Pinnacle, prix
 * William Hill ; les livres cochés chez Pierre AVANT le 23/10, ceux du bac). Seul edgeThresholdMin change d'une règle à
 * l'autre (configSousRegle) ; jamais écrite dans engine-config.json.
 */
export const CONFIG_DE_LA_REGLE = gele({
  edgeThresholdMin: 0.02,
  edgeThresholdMax: 0.25,
  maxValueOdds: 5,
  valueBookmakers: ['williamhill', 'sport888', 'betsson', 'nordicbet', 'unibet_nl', 'unibet_se', 'leovegas_se', 'tipico_de', 'coolbet', 'codere_it'],
  kellyFraction: 0.125,
  maxStakePercent: 0.02
});

/**
 * LES FENÊTRES DU BANC (jours UTC, bornes comprises ; conception §4.1). football-data (`fd_history`, lien = 0) :
 *   miseEnRoute   2000-07-28 → 2005-07-28 : les forces s'accumulent, rien n'est appris ni jugé ;
 *   P1            2005-07-29 → 2019-06-30 : APPRENDRE (β, τ², recalages) ;
 *   P1pinnacle    2012-07-27 → 2019-06-30 : les dixièmes de la confiance appris ; le seuil JUGÉ (rien n'y est appris) ;
 *   E2            2017-07-01 → 2019-06-30 : le recalage du marché (α, β) appris sur les deux saisons d'avant P2 ;
 *   P2            2019-07-01 → 2023-06-30 : JUGER (apprentissage interdit) ; huis clos à part ;
 * le magasin : P5a 2026-10-06 → 2026-10-18 (le dernier jour joué de la base du bac) : les classes de confiance par
 * origine, contre la clôture gratuite — jugées seulement si la classe minoritaire a 300 lignes avec clôture DANS l'origine.
 */
export const PERIODES_DU_BANC = gele({
  miseEnRoute: { de: '2000-07-28', a: '2005-07-28' },
  P1: { de: '2005-07-29', a: '2019-06-30' },
  P1pinnacle: { de: '2012-07-27', a: '2019-06-30' },
  E2: { de: '2017-07-01', a: '2019-06-30' },
  P2: { de: '2019-07-01', a: '2023-06-30' },
  huisClos: { de: '2020-03-14', a: '2021-05-31' },
  P5a: { de: '2026-10-06', a: '2026-10-18' },
  dernierJourFd: '2023-06-30'
});

/** Les saisons de P2 (pour le signe saison par saison de E2, T-B18) : 1er juillet → 30 juin. */
export const SAISONS_DE_P2 = gele(['2019-20', '2020-21', '2021-22', '2022-23']);

/** LES JUGES (conception §4.3) : comparer, 1 000 tirages, 200 blocs, K = 38 (z 3,2125). */
export const JUGE = gele({
  tirages: 1000,
  minBlocs: 200,
  graineCombinaison: 38,
  graineConfiance: 38,
  graineSeuil: 1,
  K: 38,
  alpha: 0.05
});

/** Les a priori et tailles (hypothèses scellées, conception §5.1) — décidées AVANT toute perte (T-B16). */
export const A_PRIORI = gele({ sigma0: 0.25, matchsParRegime: 2000, lignesParClasse: 300, matchsParCase: 200 });

/** L'ampleur, garde SECONDAIRE (jamais seule) : combinaison 0,5 point ; confiance 1 point de dixième ou 0,05 de pente. */
export const AMPLEUR = gele({ combinaisonPoints: 0.5, confiancePoints: 1, confiancePente: 0.05 });

/** Newton (β, recalages) : au plus 30 itérations, arrêt sous 1e-10. */
export const NEWTON = gele({ iterations: 30, arret: 1e-10 });

/** Le recalage par dixièmes : 9 bornes, 20 lignes fictives par dixième (critique 34-5). */
export const DIXIEMES = gele({ bornes: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], fictives: 20 });

/** Le faux championnat (40 pseudo-championnats) et le faux ingrédient (FNV-1a de la clé mod 10 < 3). */
export const PLACEBOS = gele({ fauxChampionnats: 40, fauxIngredient: { modulo: 10, moins: 3 } });

/** LA NUIT (lot 1b) : tranches de 250, délai 10 min, 20 couples anti-fuite, 512 Mo. */
export const NUIT = gele({ tranche: 250, delaiMs: 600000, couples: 20, memoireMo: 512 });

/**
 * L'ÉTALONNAGE (T-B12), AVANT la première variante : la note de départ (bench/noteDeDepart.js, P2, prix d'avant-match
 * football-data) — 30 158 décisions, 555 paris, refus par raison, valeur de clôture moyenne +4,66 % ; perte log du
 * marché du plus/moins 2,5 (moyenne d'avant-match, méthode puissance) 0,677013 sur 30 157 matchs ; perte log du 1N2 du
 * moteur (cote juste Pinnacle, sinon le repli) 1,0040 sur 30 158. Un écart arrête tout (aucune variante jugée).
 * `--comptes` vérifie déjà les décisions, les paris et les refus (aucun résultat).
 */
export const ETALONNAGE = gele({
  P2: {
    decisions: 30158,
    paris: 555,
    refus: { pas_de_value: 28380, trop_peu_de_bookmakers: 130, value_hors_limites: 145, aucun_bookmaker_autorise: 948 },
    vcMoyenne: 0.0466,
    vcDecimales: 4,
    perteLog25: 0.677013,
    perteLog25Decimales: 6,
    n25: 30157,
    perteLog1n2: 1.004,
    perteLog1n2Decimales: 4
  }
});

/**
 * CE QUE LE BANC DU LOT 1a NE PEUT PAS DIRE, en mots simples (décisions de l'orchestrateur du 04/11/2026 après minuit, points 1,
 * 2, 6 et 7 de avant-scellement.md) : recopié tel quel dans la note.
 */
export const LIMITES_DU_LOT_1A = gele([
  'Sur la base du bac, la confiance (confiance-v1, classes du régime, de l’accord, de la couverture et de la compo) et les poids par régime ne sont pas jugeables : trop peu de lignes dans la classe la plus rare (300 exigées, 2 000 pour un régime). Elles seront jugées sur les matchs joués après le lancement (lot 1c).',
  'Le seuil de value face aux cotes de vos bookmakers (l’ombre) n’a aucun horizon tant que les cotes sont relevées à la main : avec votre règle (cote de moins de 60 minutes, relevée après l’annonce des compositions), aucun relevé n’est encore frais une heure avant le coup d’envoi (0 sur 197 rencontres).',
  'Le plus/moins 2,5 n’a pas de cote de clôture avant 2019 chez football-data : la couverture des statistiques ne peut pas y être apprise face à la clôture.',
  'La couverture des statistiques et l’accord des estimations des buts ne sont pas gardés dans les pronostics gelés : la nuit du lot 1b devra les lire ailleurs, sinon ils restent « inconnus ».'
]);

/** Les mots de l'écran par verdict (scellés dans les règles ; jamais « sûr », jamais une pastille verte). */
export const MOTS = gele({
  verdicts: { retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'non-jugeable-ici': 'non jugeable ici', 'pas-assez-de-matchs': 'pas assez de matchs', definition: 'définition (aucun résultat lu)' },
  rienNeManque: 'Rien ne manque à ce pronostic. La confiance du moteur n’est pas encore mesurée.',
  pied: 'À blanc : rien de tout cela ne change le pourcentage ni le conseil.',
  seuilPinnacle: 'Seuil de value de 2 % : mesuré pour une cote juste Pinnacle (555 paris, 2019-2023).',
  seuilJamais: 'jamais mesuré',
  livreJamais: 'jamais mesuré chez ce bookmaker (marge 11 à 15 %)',
  rienNeSAjoute: 'Sur ce marché, rien ne s’ajoute aux cotes'
});
