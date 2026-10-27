/**
 * reglages.js — LES RÉGLAGES DE LA SIMULATION (étape 28 du plan : déroulé d'un match, combinés, fins de saison, enjeu).
 * -----------------------------------------------------------------------
 * HORS de l'empreinte du moteur : data/simulation/ n'est ni sous core/ ni sous sports/, et aucun fichier de
 * l'empreinte ne l'importe. Changer une valeur d'ici ne crée pas de version du moteur et ne recommence pas l'essai
 * de l'étape 27 (conception de l'étape 28, §4.1 et §4.7).
 *
 * PARAMS et ECARTS_MESURES_V sont RECOPIÉS PAR SCRIPT, jamais à la main (scratchpad de l'étape 28,
 * partieA/recopie-reglages.mjs) :
 *   - PARAMS depuis mesures/simulation/s2-parametres.json : la part de chaque créneau (profil, 92 valeurs), les
 *     multiplicateurs de buts selon l'état (MH domicile, MA extérieur : 5 écarts × 3 écarts de rouges × 3 tranches,
 *     indice ((d + 2)·3 + (r + 1))·3 + b), le hasard d'un rouge par équipe et par créneau selon la bande de minutes
 *     (rougeBande, 8 bandes) et son multiplicateur selon l'écart vu de l'équipe sanctionnée (rougeEtat, 5) ;
 *     appris sur tout le magasin permis (2023-07-01 → 2026-09-23 : 44 482 matchs à chronologie complète avec cotes
 *     de clôture), dé-confondus par les buts attendus du marché ;
 *   - ECARTS_MESURES_V depuis le rejeu T13 du MODULE du bac sur V (partieA/t13/v1-exact-29.txt §2 : Poisson exact,
 *     « avant la 30e » à la convention FIGÉE, créneaux 0..29) : l'écart annoncé − réalisé de chaque marché de déroulé
 *     sur la moitié NON apprise (2025-07-01 → 2026-09-23, 17 818 matchs, grille des cotes de clôture, paramètres appris
 *     sur 2023-07 → 2025-06), en points ; montré au survol de chaque ligne. Vérification du 27/10 (constat 5) : le
 *     tableau décrit le module livré — avant, 21 marchés venaient du noyau mesuré de v1 (Taylor, mesures/preuve/
 *     v1-split.txt), à 0,01 point au plus de ceux-ci ; « premier but avant la 30e » = −0,71 (décision du 27/10).
 * Toute re-mesure des paramètres = VERSION_SIMULATION + 1 (la graine d'un match la porte).
 * -----------------------------------------------------------------------
 */

/** La version des paramètres de la simulation d'un match : entre dans la graine et dans chaque ligne rangée. */
export const VERSION_SIMULATION = 1;
/** La version des règles des fins de saison (phase, familles, restants, lois) : rangée avec chaque nuit. */
export const VERSION_SAISONS = 1;

/** Le nombre de matchs (ou de fins de saison) simulés. */
export const N = 10000;
/** La fenêtre des rencontres simulées la nuit : celles dont le coup d'envoi tombe dans les 48 heures. */
export const FENETRE_H = 48;
/** Au-delà de 10 % d'écart sur λ ou μ depuis la nuit, le déroulé rangé n'est plus montré (refait la nuit suivante). */
export const ECART_MAX = 0.1;

/** L'horizon de la preuve neuve (F6, la règle de l'étape 27) : 800 matchs ET 21 jours après le lancement de l'étape 28. */
export const HORIZON_DE_LA_PREUVE = Object.freeze({ matchs: 800, jours: 21 });
/** 92 créneaux : 0..44 = minutes 1..45 ; 45 = temps additionnel de la 1re mi-temps ; 46..90 = minutes 46..90 ; 91 = additionnel de la 2e. */
export const NB_CRENEAUX = 92;
/** Le dernier créneau de la 1re mi-temps (le bloc 45+ en fait partie : la mi-temps se relève APRÈS lui). */
export const CRENEAU_MI_TEMPS = 45;
/** La grille des scores : 0 à 20 buts par équipe (indice home × 21 + away), celle de goalModel.js. */
export const TAILLE_GRILLE = 21;
/** Au plus 8 buts d'une équipe dans un même créneau (l'inversion exacte s'arrête là). */
export const BUTS_MAX_PAR_CRENEAU = 8;
/** Au plus 2 rouges par équipe. */
export const ROUGES_MAX = 2;

/**
 * « Premier but avant la 30e » : convention FIGÉE (critique E9) — créneaux 0 à 29, soit les minutes 1 à 30, jusqu'à
 * 30:00 exclu (un but noté 30', marqué entre 29:00 et 29:59, compte). Écrite avec le marché, avant tout règlement.
 */
export const CONVENTION_AVANT_30 = Object.freeze({
  dernierCreneau: 29,
  texte: 'premier but marqué avant 30:00 (minutes 1 à 30 comprises)'
});

// ------------------------------------------------------------ fins de saison et enjeu

/** ρ de la grille Dixon-Coles tirée pour chaque rencontre restante (celle de l'étape 27). */
export const RHO_SAISONS = -0.05;
/** Les bornes des buts attendus d'une rencontre restante (celles du modèle de buts). */
export const BORNES_BUTS = Object.freeze([0.2, 6]);
/** Loi « table » (V1) : moyennes du championnat rappelées vers 1,45 / 1,15 sur 30 rencontres, forces rappelées sur 8 matchs. */
export const LOI_TABLE = Object.freeze({ priorMatchs: 30, domicile: 1.45, exterieur: 1.15, rappel: 8 });
/** Loi « forces » (V2) : le démarrage à froid du modèle de buts (attenuerLeTotal), 8 matchs. */
export const DEMARRAGE_SAISONS = 8;
/** Loi affichée : V2 si au moins 90 % des clubs de la table ont une ligne de forces de moins de 3 jours. */
export const LOI_AFFICHEE = Object.freeze({ partMin: 0.9, joursMax: 3 });

/** Catégories de l'enjeu (points de probabilité) : « sans enjeu » si les deux camps sont sous 2 ; « gros enjeu » si un camp atteint 20. */
export const SEUILS_ENJEU = Object.freeze({ sans: 2, gros: 20 });
/** L'enjeu s'affiche arrondi à 5 points (bruit mesuré : 0,98 pt en médiane, 1,47 au pire). */
export const ARRONDI_ENJEU = 5;
/** Aux extrêmes, « ≥ 90 % » et « ≤ 10 % » (critique §1.3) ; entre les deux, le point près. */
export const BORNES_AFFICHAGE = Object.freeze({ bas: 0.1, haut: 0.9 });

/** Les tables en doublon d'une saison (jamais simulées) : le Supporters' Shield de la MLS, les cumuls annuels. */
export const TABLES_EN_DOUBLON = /shield|annual|overall|aggregate/i;
/** Une table relevée plus d'une heure avant la plus récente de la même saison est orpheline (renommée chez FotMob). */
export const ORPHELINE_MS = 3600 * 1000;
/** Un petit groupe (moins de 8 clubs) n'est gardé que s'il n'y a aucune grande table dans la phase. */
export const PETIT_GROUPE = 8;

/**
 * Les FAMILLES de zones, dans l'ordre d'affichage. La 1re place est toujours le rang 1 de la table ; les autres
 * se lisent dans le libellé `description` de la ligne (FotMob, d'après la couleur de la légende) : les 24
 * libellés du magasin se rangent ainsi (mesures/saisons/p1-regles-tables.txt §4). Une famille n'existe pour une
 * table que si au moins un rang la porte.
 */
export const FAMILLES = Object.freeze([
  Object.freeze({ cle: 'premiere', libelle: '1re place', motif: null }),
  Object.freeze({ cle: 'europe', libelle: 'Europe', motif: /Champions League|Europa|Conference League|Copa Libertadores|Copa Sudamericana|AFC Champions|CONMEBOL/i }),
  Object.freeze({ cle: 'promotion', libelle: 'Promotion', motif: /^Promotion$/i }),
  Object.freeze({ cle: 'promotion_barrage', libelle: 'Barrage de promotion', motif: /^Promotion qualification$/i }),
  Object.freeze({ cle: 'playoff', libelle: 'Phase finale', motif: /Championship playoff|Qualification next stage|Qualification to 1\/8|Possible qualification|^Play-off$|^Final$/i }),
  Object.freeze({ cle: 'relegation_barrage', libelle: 'Barrage de descente', motif: /^Relegation qualification$/i }),
  Object.freeze({ cle: 'relegation', libelle: 'Descente', motif: /^Relegation$/i })
]);

/**
 * Les championnats où le départage officiel n'est pas la différence de buts (confrontations directes, victoires) et
 * où l'égalité de points s'est mal classée au moins 3 fois sur les tables finales 2023-2026 (mesures/saisons/p1b) :
 * la fin de saison y porte la mention « départage simplifié (différence de buts) ».
 */
export const DEPARTAGE_SIMPLIFIE = Object.freeze([
  'La Liga - Spain',
  'La Liga 2 - Spain',
  'Serie A - Italy',
  'Serie B - Italy',
  'Turkey Super League',
  'Primeira Liga - Portugal',
  'Superliga - Romania',
  'Super Liga - Serbia',
  'Austrian Football Bundesliga',
  'Belgium First Div',
  'MLS',
  'Brazil Série A',
  'Ekstraklasa - Poland',
  'Super League - Greece',
  'Nike Liga - Slovakia'
]);

/**
 * Les 14 championnats à SCISSION (propositions « saisons », p1 §3) : la table régulière ne porte que « Championship
 * playoff » et « Relegation qualification » ; v1 simule jusqu'à la scission — finir dans le haut du tableau, éviter le
 * groupe de relégation —, le titre, l'Europe et la descente se jouant ensuite (seconde phase NON simulée en v1).
 */
export const CHAMPIONNATS_A_SCISSION = Object.freeze([
  'Austrian Football Bundesliga',
  'Belgium First Div',
  'First League - Czechia',
  'Denmark Superliga',
  'Super League - Greece',
  "Ligat ha'Al - Israel",
  'Superliga - Romania',
  'Premiership - Scotland',
  'Super Liga - Serbia',
  'Nike Liga - Slovakia',
  'Swiss Superleague',
  'Veikkausliiga - Finland',
  'Besta deildin - Iceland',
  'Serie A - Ecuador'
]);
/** Les libellés des deux familles d'une table à scission : ce qu'elles veulent dire avant la scission. */
export const LIBELLES_DE_SCISSION = Object.freeze({ playoff: 'Haut du tableau', relegation_barrage: 'Groupe de relégation' });

/** Ce que la nuit garde (élagage par tranches de 250). */
export const RETENTION = Object.freeze({
  matchs: Object.freeze({ joursApresLaRencontre: 2, jours: 400 }),
  saisons: Object.freeze({ chaqueNuitJours: 14, uneNuitParSemaineJusquAuVerdict: true, jours: 400 }),
  enjeux: Object.freeze({ jours: 400 }),
  tranche: 250
});

// ------------------------------------------------------------ recopié par script

const geler = (x) => {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) geler(v);
    Object.freeze(x);
  }
  return x;
};

// <PARAMS recopiés par script — ne pas modifier à la main>
export const PARAMS = geler({
  profil: [0.004586112710427743, 0.006940618564050599, 0.007922718080114122, 0.008643378675232816, 0.0085477946301379, 0.008872672974143575, 0.00897881055352029, 0.009723022112915744, 0.009626918207062535, 0.009237700446607764, 0.009393231775340538, 0.009364999312753261, 0.00959520538305893, 0.009139423160871794, 0.009245163429822545, 0.00959383543821969, 0.009021639967513151, 0.009511939062075932, 0.008990496091744966, 0.0096481752256462, 0.009302467635154778, 0.009541024540115113, 0.009412311021079178, 0.009659457984569518, 0.009472944315243847, 0.009085932202624918, 0.008924593184228802, 0.009405606244370642, 0.009577186799752285, 0.009891461999394072, 0.009596753884447223, 0.009285313912422955, 0.009658039821055333, 0.009763395419171044, 0.00980127556744827, 0.00922353622376706, 0.009710704833364638, 0.010123151521922792, 0.009662402105312076, 0.009733498618404196, 0.009489150982043433, 0.009769106841189815, 0.00945946000238747, 0.010203288126606197, 0.009842864876474604, 0.03417910974669857, 0.005878664674177803, 0.009413158149644652, 0.010206453602143319, 0.01064245782932142, 0.011193983899212407, 0.011628628649756357, 0.011285612615157474, 0.012083872418394074, 0.01107138102436275, 0.011770820277588608, 0.011379030282401047, 0.011425780624459722, 0.011076022039405303, 0.011327169054075315, 0.010951911723144692, 0.01111408514415948, 0.01032808739015363, 0.011048702982175165, 0.010624404905343622, 0.010908925339213844, 0.010477815203132401, 0.010557492823033199, 0.010176135381959803, 0.010403341702397343, 0.010318717696843506, 0.010298898195100832, 0.010469048799391993, 0.010055917732441117, 0.01041422901159034, 0.01007519232130215, 0.010129533587283978, 0.01058635979251354, 0.010264178669225308, 0.01057332774870883, 0.010538936365438721, 0.01078248408717119, 0.010305407196445085, 0.010565189656071202, 0.010259539601846198, 0.01061658586615796, 0.010457986665732081, 0.010765964691264498, 0.011040296145667818, 0.010807790382331234, 0.010985161213885812, 0.07235742262826421],
  MH: [0.6518617457086443, 0.5249204781209044, 0.7506930959689164, 1.0367955538847164, 1.1181900830202673, 1.12881898847033, 2.3935221040922725, 2.7143108012426724, 2.1617744048044276, 0.5391860185683934, 0.5943860756869043, 0.735428539008764, 1.0208260657821673, 1.0812455489848403, 1.1514037014825038, 1.7302859346807402, 1.8429834181017262, 2.0921728875591046, 0.524700912391348, 0.5126704439269197, 0.5110466201414557, 0.9924296347434064, 0.9693155192838431, 1.0113724227904977, 1.6348427971401682, 1.641612235913034, 1.7804318495367493, 0.385220327755302, 0.3967802585194371, 0.3942847803906852, 0.9090858128289154, 0.9129107650330167, 0.8217247035781632, 1.5422896386885008, 1.3527670608947568, 1.3657533228059682, 0.4493687769654142, 0.4493687769654142, 0.4688007646656954, 0.8956054641752662, 0.9155943542024657, 0.8867794774473332, 1.3717129723078434, 1.2670779746542111, 1.2964917841056744],
  MA: [0.6162801070860225, 0.5549632275519402, 0.6328499064660074, 1.023909688430756, 1.085483037165031, 1.109290533276482, 2.029338494194206, 2.3342870652879455, 1.8479975705945961, 0.8382231142820654, 0.641338804838311, 0.7202477670300197, 1.0453564686256562, 1.0979887752486905, 1.1782918225638483, 1.8156936626805653, 1.4749932170542668, 1.9258091663767105, 0.3712054375127746, 0.444611002038075, 0.5034260820528627, 0.9975560045281813, 0.9929345633312564, 0.9846340306521698, 1.682391697601903, 1.628241928277703, 1.78882597869387, 0.4325178672492507, 0.4646545977062687, 0.4150016988986927, 0.9349787162069022, 0.9710687225267081, 0.8439041631040332, 1.7147579590171187, 1.4649276146955896, 1.6385719289474667, 0.45062649762947493, 0.45062649762947493, 0.45062649762947493, 0.8960182924859454, 0.9697580418459907, 0.935196318272803, 1.397793901869702, 1.306950323807784, 1.4578629786686919],
  rougeBande: [0.0003019948143818473, 0.0005822579919967627, 0.0008430376331999461, 0.005114428308079673, 0.0009726780870164711, 0.0013196349085023156, 0.0017422777752798884, 0.02440312935569444],
  rougeEtat: [1.4861555665737416, 1.4427334321367893, 0.7773103295728206, 1.0483643846278718, 0.8038010730752673],
  bandes: [["1-15", 0, 14], ["16-30", 15, 29], ["31-45", 30, 44], ["45+", 45, 45], ["46-60", 46, 60], ["61-75", 61, 75], ["76-90", 76, 90], ["90+", 91, 91]]
});
// </PARAMS>

// <ECARTS_MESURES_V recopiés par script — ne pas modifier à la main>
/** Fenêtre et conditions de la mesure : moitié V, grille des cotes de clôture, paramètres appris sur la moitié A ; les 22 marchés rejoués par le module du bac (T13 : Poisson exact, « avant la 30e » à la convention FIGÉE, créneaux 0..29) — vérification du 27/10, constat 5. */
export const ECARTS_MESURES_V = geler({
  mesure: { de: '2025-07-01', a: '2026-09-23', matchs: 17818, grille: 'cotes de clôture', apprisSur: '2023-07-01 → 2025-06-30', source: 'partieA/t13/v1-exact-29.txt §2 (rejeu T13 du module du bac sur V, Poisson exact, créneaux 0..29)' },
  marches: {
    htD: { libelle: "mi-temps nul", annonce: 41.2, realise: 41.04, ecart: 0.15 },
    htH: { libelle: "mi-temps domicile mène", annonce: 34.57, realise: 34.33, ecart: 0.24 },
    htA: { libelle: "mi-temps extérieur mène", annonce: 24.23, realise: 24.63, ecart: -0.39 },
    htO05: { libelle: "mi-temps plus de 0,5", annonce: 69.67, realise: 70.48, ecart: -0.81 },
    htO15: { libelle: "mi-temps plus de 1,5", annonce: 33.49, realise: 34.77, ecart: -1.29 },
    htFt0: { libelle: "1/1", annonce: 27.92, realise: 26.81, ecart: 1.11 },
    htFt1: { libelle: "1/N", annonce: 4.85, realise: 5.24, ecart: -0.39 },
    htFt2: { libelle: "1/2", annonce: 1.8, realise: 2.28, ecart: -0.48 },
    htFt3: { libelle: "N/1", annonce: 14.66, realise: 14.84, ecart: -0.18 },
    htFt4: { libelle: "N/N", annonce: 15.78, realise: 15.44, ecart: 0.34 },
    htFt5: { libelle: "N/2", annonce: 10.76, realise: 10.76, ecart: 0 },
    htFt6: { libelle: "2/1", annonce: 2.37, realise: 2.87, ecart: -0.5 },
    htFt7: { libelle: "2/N", annonce: 4.69, realise: 5.04, ecart: -0.35 },
    htFt8: { libelle: "2/2", annonce: 17.17, realise: 16.72, ecart: 0.45 },
    deuxMiTemps05: { libelle: "un but dans chaque mi-temps", annonce: 54.15, realise: 56.41, ecart: -2.26 },
    h2plusQueH1: { libelle: "2e mi-temps plus de buts", annonce: 42.97, realise: 44.71, ecart: -1.74 },
    premierDom: { libelle: "premier but domicile", annonce: 52.38, realise: 52.51, ecart: -0.13 },
    premierExt: { libelle: "premier but extérieur", annonce: 39.8, realise: 40.5, ecart: -0.7 },
    premierAvant30: { libelle: "premier but avant la 30e", annonce: 51.46, realise: 52.17, ecart: -0.71 },
    retourDom: { libelle: "domicile gagne mené à la MT", annonce: 2.37, realise: 2.87, ecart: -0.5 },
    retourExt: { libelle: "extérieur gagne mené à la MT", annonce: 1.8, realise: 2.28, ecart: -0.48 },
    rougeAuMoinsUn: { libelle: "au moins un rouge", annonce: 21.05, realise: 20.57, ecart: 0.48 }
  }
});
// </ECARTS_MESURES_V>
