/**
 * reglagesDirect.js — LES RÉGLAGES DU DIRECT (étape 46 du plan « Prédiction en direct », lot 1, partie A).
 * -----------------------------------------------------------------------
 * Les constantes du calcul, de l'état et de la lecture en direct (conception §2 à §4), corrigées par la critique du
 * 11/11 (R3, R4, R5, R7, R8, R14, R21, R35) et par les décisions de l'orchestrateur (O1, O2, P1, P2).
 *
 * HORS de l'empreinte du moteur : data/direct/ n'est ni sous core/ ni sous sports/, et aucun fichier de l'empreinte ne
 * l'importe. Changer une valeur d'ici ne crée pas de version du moteur.
 *
 * Rien n'est recopié de la simulation de l'étape 28 : PARAMS, les créneaux, trancheDu, marchesDuScore, grilleDesEntrees
 * sont IMPORTÉS là où ils servent (calculDuDirect.js, etatDuDirect.js).
 *
 * RESTE_ADDITIONNEL et MOYENNES_DES_CHAMPIONNATS sont RECOPIÉS PAR SCRIPT, jamais à la main :
 *   node scripts/etape46.mjs --mesurer-additionnel   (la fenêtre DÉJÀ VUE 2023-07-01 → 2026-09-23, celle où PARAMS a
 *                                                     été appris : aucune fuite vers la période du banc)
 *   node scripts/etape46.mjs --recopier-additionnel  (écrit les deux tables entre leurs balises)
 * -----------------------------------------------------------------------
 */

import { LOI_TABLE } from '../simulation/reglages.js';

/** La version des règles du direct (lecture du libellé, état, calcul) : portée par chaque réponse. */
export const VERSION_DU_DIRECT = 1;

// ------------------------------------------------------------ le calcul (O2, R21)

/**
 * LES COUPES de la propagation, NOMMÉES (R21) : chaque appel de loiDuScoreFinal dit les siennes.
 *   - direct : le calcul en direct ET C0 (O2 : 10,5 ms par match au coup d'envoi, ≤ 3,6·10⁻⁴ point sur un marché ;
 *     masse négligée de l'ordre de 10⁻⁶) ;
 *   - banc   : les coupes de la conception (§2.3 : masse négligée de l'ordre de 10⁻⁹), celles du banc (R21 point 1) ;
 *   - oracle : les coupes mille fois plus fines des tests d'oracle (O2) ;
 *   - aucune : sans aucune coupe (T-C2, T-C13 : la propagation complète, 90 à 117 ms au coup d'envoi).
 * `seuilEtat` : un état de poids inférieur n'est pas propagé (sa masse est comptée dans masseNegligee) ; `epsLoi` : la
 * queue d'une loi de buts sous ce seuil est posée sur son dernier indice gardé (la loi somme toujours à 1).
 */
export const COUPES = Object.freeze({
  direct: Object.freeze({ nom: 'direct', seuilEtat: 1e-9, epsLoi: 1e-8 }),
  banc: Object.freeze({ nom: 'banc', seuilEtat: 1e-12, epsLoi: 1e-11 }),
  oracle: Object.freeze({ nom: 'oracle', seuilEtat: 1e-15, epsLoi: 1e-14 }),
  aucune: Object.freeze({ nom: 'aucune', seuilEtat: 0, epsLoi: 0 })
});

/** Garde-fou du direct (R21 point 4) : au-delà de cette masse négligée, le calcul est rendu en erreur, jamais montré. */
export const MASSE_NEGLIGEE_ERREUR = 1e-4;

/** Le budget de calcul d'une requête (O2) : au-delà, les matchs restants reviennent « en attente ». */
export const BUDGET_CALCUL_MS = 1000;
/** Aucun bloc de calcul sans rendre la main au-delà de ce temps (O2 ; la frontière garde 300 ms). */
export const BLOC_MAX_MS = 100;
/** La table des calculs en mémoire (conception §4.1) : au plus 600 entrées, clé de O1 (cleDuCalcul). */
export const TABLE_CALCULS_MAX = 600;

/** La part jouée d'une minute ordinaire quand les secondes manquent (§2.4) : la moitié du créneau. */
export const PART_PAR_DEFAUT = 0.5;

// ------------------------------------------------------------ les âges (R3, R4, R5, §2.6 à §2.8, §3)

/** L'état est dit en ambre au-delà du cycle normal des relevés (R3 point 1). */
export const AMBRE_ETAT_MS = 150 * 1000;
/** Relevé périmé : plus de 5 minutes depuis la dernière VRAIE lecture chez FotMob (R4 point 3, R3 point 1). */
export const PERIME_APRES_MS = 5 * 60 * 1000;
/** Minute figée : le libellé n'a pas changé depuis 4 minutes de relevés, hors mi-temps (§2.8). */
export const FIGE_APRES_MS = 4 * 60 * 1000;
/** Les rouges en ambre dès 6 minutes hors mi-temps (R3 point 2). */
export const ROUGES_AMBRE_MS = 6 * 60 * 1000;
// ROUGES_DETAIL_PRIME_MS (« le détail l'emporte s'il a moins de 6 minutes », §2.7 règle 4) : retirée le 13/11 (K10), plus lue
// depuis K1 — en désaccord, la source dont le compte a changé le plus récemment l'emporte (etatDuDirect.js, rougesRetenus).
/** Score de la 90e « relevé » seulement si la lecture d'après la fin suit de moins de 3 minutes une lecture du jeu (R5 point 2). */
export const SCORE90_ECART_MAX_MS = 3 * 60 * 1000;
/** Le dernier état d'un match fini est gardé 3 heures (§2.8) ; « fin relevée il y a moins de 3 h » (R37 point 4). */
export const FINIS_GARDES_MS = 3 * 60 * 60 * 1000;
/** La courbe est coupée quand deux instantanés sont à plus de 12 minutes l'un de l'autre (§3.3). */
export const COURBE_TROU_MS = 12 * 60 * 1000;
/** Une ligne d'avant-match absente est relue au plus toutes les 10 minutes (§3.2). */
export const LIGNE_ABSENTE_RELUE_MS = 10 * 60 * 1000;

// ------------------------------------------------------------ la minute 0 (R8)

/** L'écart de la minute 0 (direct − pronostic d'avant-match) est dit à partir de 2 points (§2.9, R7 point 1, R8). */
export const ECART_DIT_PT = 2;

// ------------------------------------------------------------ les marchés (§2.10)

/** Les lignes de buts calculées (totaux et buts d'une équipe). */
export const LIGNES = Object.freeze([0.5, 1.5, 2.5, 3.5]);
/** Le score exact : les 8 cases les plus probables, et « autre score ». */
export const SCORE_EXACT_CASES = 8;

// ------------------------------------------------------------ les variantes (P1, P2, R7, R14)

/**
 * LES VARIANTES CODÉES (décision provisoire P1 de l'orchestrateur, 11/11) : le surensemble des deux colonnes de O10.
 * Ni `aligne-1n2` ni `strate` ; `direct-rouges-exacts` n'est pas codée (elle viendrait en partie C si la règle de R16 se
 * déclenche). La liste DÉCLARÉE au banc, K, les z et le jugement principal ne sont PAS fixés ici (P3, partie C).
 */
export const VARIANTES_CODEES = Object.freeze([
  Object.freeze({ id: 'direct-v1', quoi: 'la chaîne de l’étape 28 (PARAMS : effets du score, rouges), partie de la ligne d’avant-match, lecture brute' }),
  Object.freeze({ id: 'direct-sans-effets', quoi: 'la même chaîne avec PARAMS_SANS_EFFETS (ni effet du score, ni rouge), passés par l’appelant (R34)' }),
  Object.freeze({ id: 'temps-restant', quoi: 'la règle simple du temps restant (§2.11), partie des buts attendus de la ligne' }),
  Object.freeze({ id: 'direct-rouges-ignores', quoi: 'direct-v1 avec les rouges de l’état forcés à 0-0 (ce que coûte un rouge inconnu)' }),
  Object.freeze({ id: 'temps-restant-championnat', quoi: 'la règle simple partie des buts moyens du championnat (R14 ; repli 1,45 / 1,15)' }),
  Object.freeze({ id: 'direct-ancre', quoi: 'la chaîne à (λ′, μ′) recalés sur le 1N2 de la ligne, total gardé, sans résiduel, bornés à [0,30 ; 4,0] (R7)' }),
  Object.freeze({ id: 'temps-restant-ancre', quoi: 'la règle simple partie des mêmes (λ′, μ′) recalés (O4, R33)' })
]);

/**
 * LA VARIANTE AFFICHÉE (P2) : un réglage à deux valeurs, une par colonne de O10, fixé par l'orchestrateur à la séance du
 * verdict de l'étape 27.
 *   - 'ancre-si-fair' : `direct-ancre` quand la ligne a un 1N2 affiché (`fair`), `direct-v1` sinon (la 27 non adoptée) ;
 *   - 'direct-v1'     : toujours `direct-v1` (la 27 adoptée).
 * Valeur avant le verdict : 'ancre-si-fair' (la version 5 est en service).
 */
export const VARIANTES_AFFICHABLES = Object.freeze(['ancre-si-fair', 'direct-v1']);
export const VARIANTE_AFFICHEE = 'ancre-si-fair';

/** L'ancrage (R7) : λ′ et μ′ dans [0,30 ; 4,0] ; dichotomie de 40 pas sur la grille fermée ; ARRÊTÉ À LA BORNE sinon. */
export const ANCRAGE = Object.freeze({ min: 0.3, max: 4, pas: 40 });

/**
 * La règle simple du temps restant (§2.11) : 99 minutes-équivalent, 45 + 3 d'arrêts et 45 + 6 d'arrêts — deux constantes
 * rondes, déclarées, qui ne viennent pas de PARAMS.
 */
export const REGLE_SIMPLE = Object.freeze({ minutes: 99, arretsPremiere: 3, arretsSeconde: 6 });

/** Le repli des buts moyens d'un championnat absent de la table (R14) : LOI_TABLE de data/simulation/reglages.js, IMPORTÉ (1,45 / 1,15). */
export const REPLI_CHAMPIONNAT = Object.freeze({ domicile: LOI_TABLE.domicile, exterieur: LOI_TABLE.exterieur });

// ------------------------------------------------------------ recopié par script

const geler = (x) => {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) geler(v);
    Object.freeze(x);
  }
  return x;
};

// <RESTE_ADDITIONNEL recopié par script — ne pas modifier à la main>
export const RESTE_ADDITIONNEL = geler({"mesure":{"fichier":"additionnel.json","sha1":"58c364c1a1c17d62fd232c44eb9b6a40888e4c28","de":"2023-07-01","a":"2026-09-23","mesureLe":"2026-11-11T20:49:17.578Z","rencontres":55816,"buts45":5193,"buts91":11089},"plancher":0.05,"X45":6,"X91":9,"reste45":[null,0.8535528596187175,0.7416683005436874,0.6616389862517583,0.6272079547642806,0.5728776045645636,0.5728776045645636],"reste91":[null,0.9232121922626025,0.7715754351158806,0.6141221029849401,0.5071839052992256,0.4452425990371441,0.36330631289599635,0.35996216412266246,0.3521555263395209,0.32782714954676184]});
// </RESTE_ADDITIONNEL>

// <MOYENNES_DES_CHAMPIONNATS recopiées par script — ne pas modifier à la main>
export const MOYENNES_DES_CHAMPIONNATS = geler({"mesure":{"fichier":"additionnel.json","sha1":"58c364c1a1c17d62fd232c44eb9b6a40888e4c28","de":"2023-07-01","a":"2026-09-23","priorMatchs":30,"repli":{"domicile":1.45,"exterieur":1.15}},"championnats":{"Allsvenskan - Sweden":{"matchs":804,"domicile":1.5317745803357314,"exterieur":1.3087529976019185},"Austrian Football Bundesliga":{"matchs":627,"domicile":1.4756468797564688,"exterieur":1.2245053272450532},"Belgium First Div":{"matchs":1004,"domicile":1.5420696324951644,"exterieur":1.2151837524177949},"Besta deildin - Iceland":{"matchs":551,"domicile":1.9819277108433735,"exterieur":1.5344234079173837},"Brazil Série A":{"matchs":1295,"domicile":1.4622641509433962,"exterieur":1.0562264150943397},"Bundesliga - Germany":{"matchs":957,"domicile":1.7512664640324216,"exterieur":1.4473150962512664},"Bundesliga 2 - Germany":{"matchs":977,"domicile":1.656901688182721,"exterieur":1.3599801390268123},"Canadian Championship":{"matchs":52,"domicile":1.9329268292682926,"exterieur":1.0670731707317074},"Canadian Premier League":{"matchs":389,"domicile":1.5214797136038185,"exterieur":1.2517899761336515},"Championship":{"matchs":1763,"domicile":1.447573898494144,"exterieur":1.145844952593419},"Copa Argentina":{"matchs":155,"domicile":1.5702702702702702,"exterieur":0.9864864864864865},"Copa Chile":{"matchs":203,"domicile":1.6330472103004292,"exterieur":1.203862660944206},"Copa Libertadores":{"matchs":458,"domicile":1.4149590163934427,"exterieur":0.9108606557377049},"Copa Sudamericana":{"matchs":473,"domicile":1.4204771371769385,"exterieur":1.0129224652087476},"Copa del Rey - Spain":{"matchs":268,"domicile":0.9983221476510067,"exterieur":2.2130872483221475},"Copa do Brasil":{"matchs":334,"domicile":1.289835164835165,"exterieur":1.0728021978021978},"Coppa Italia - Italy":{"matchs":124,"domicile":2.029220779220779,"exterieur":0.9577922077922078},"Coupe de Belgique":{"matchs":83,"domicile":1.7566371681415929,"exterieur":1.2964601769911503},"Coupe de Chine":{"matchs":170,"domicile":1.2575,"exterieur":1.7275},"Coupe de France":{"matchs":813,"domicile":1.2983392645314353,"exterieur":2.17141162514828},"Coupe de Grèce":{"matchs":154,"domicile":1.513586956521739,"exterieur":1.1929347826086956},"DFB Pokal - Germany":{"matchs":178,"domicile":1.1322115384615385,"exterieur":2.4302884615384617},"Denmark Superliga":{"matchs":632,"domicile":1.603474320241692,"exterieur":1.3919939577039275},"División Profesional - Paraguay":{"matchs":856,"domicile":1.2838600451467268,"exterieur":1.1450338600451466},"Dutch Eredivisie":{"matchs":1017,"domicile":1.7492836676217765,"exterieur":1.4169054441260744},"EFL Cup":{"matchs":282,"domicile":1.6362179487179487,"exterieur":1.501602564102564},"EPL":{"matchs":1190,"domicile":1.605327868852459,"exterieur":1.365983606557377},"Ekstraklasa - Poland":{"matchs":996,"domicile":1.5560428849902534,"exterieur":1.182748538011696},"Eliteserien - Norway":{"matchs":807,"domicile":1.7138590203106332,"exterieur":1.3506571087216248},"FA Cup - England":{"matchs":322,"domicile":1.8480113636363635,"exterieur":1.4247159090909092},"First League - Czechia":{"matchs":908,"domicile":1.5047974413646055,"exterieur":1.2084221748400852},"HNL - Croatia":{"matchs":579,"domicile":1.4786535303776682,"exterieur":1.1206896551724137},"KNVB Cup - Netherlands":{"matchs":142,"domicile":1.8284883720930232,"exterieur":1.694767441860465},"La Liga - Spain":{"matchs":1209,"domicile":1.5137207425343018,"exterieur":1.1594027441485069},"La Liga 2 - Spain":{"matchs":1469,"domicile":1.40527018012008,"exterieur":1.063709139426284},"League 1":{"matchs":1753,"domicile":1.434380257992148,"exterieur":1.1775098149186765},"League 2":{"matchs":1753,"domicile":1.4618620302860348,"exterieur":1.209478407178912},"League of Ireland":{"matchs":586,"domicile":1.3952922077922079,"exterieur":1.1063311688311688},"Leagues Cup":{"matchs":204,"domicile":1.9722222222222223,"exterieur":1.2158119658119657},"Liga 1 - Peru":{"matchs":1035,"domicile":1.6014084507042254,"exterieur":1.0230046948356808},"Liga MX":{"matchs":1090,"domicile":1.6183035714285714,"exterieur":1.2111607142857144},"Ligat ha'Al - Israel":{"matchs":751,"domicile":1.4615877080665813,"exterieur":1.3156209987195904},"Ligue 1 - France":{"matchs":971,"domicile":1.543956043956044,"exterieur":1.2782217782217782},"Ligue 2 - France":{"matchs":1056,"domicile":1.3798342541436464,"exterieur":1.1468692449355433},"MLS":{"matchs":1668,"domicile":1.7382214369846878,"exterieur":1.3454063604240283},"Nike Liga - Slovakia":{"matchs":636,"domicile":1.5187687687687688,"exterieur":1.3055555555555556},"Premier League - Russia":{"matchs":804,"domicile":1.4670263788968825,"exterieur":1.1672661870503598},"Premiership - Scotland":{"matchs":743,"domicile":1.5633893919793014,"exterieur":1.2360931435963778},"Primeira Liga - Portugal":{"matchs":986,"domicile":1.483759842519685,"exterieur":1.2199803149606299},"Primera A - Colombia":{"matchs":1402,"domicile":1.365572625698324,"exterieur":0.9521648044692738},"Primera División - Argentina":{"matchs":1763,"domicile":1.1720580033463468,"exterieur":0.8814835471277189},"Primera División - Bolivia":{"matchs":856,"domicile":1.9294582392776525,"exterieur":1.2048532731376975},"Primera División - Chile":{"matchs":782,"domicile":1.5449507389162562,"exterieur":1.2001231527093597},"Primera División - Venezuela":{"matchs":767,"domicile":1.375784190715182,"exterieur":1.0646173149309912},"Serie A - Ecuador":{"matchs":921,"domicile":1.4053627760252365,"exterieur":1.0425867507886435},"Serie A - Italy":{"matchs":1190,"domicile":1.3577868852459016,"exterieur":1.1913934426229509},"Serie B - Italy":{"matchs":1217,"domicile":1.3949478748997595,"exterieur":1.119887730553328},"Super League - China":{"matchs":824,"domicile":1.7675644028103044,"exterieur":1.3225995316159251},"Super League - Greece":{"matchs":745,"domicile":1.4651612903225806,"exterieur":1.189032258064516},"Super Liga - Serbia":{"matchs":959,"domicile":1.5293225480283115,"exterieur":1.2219413549039433},"Superliga - Romania":{"matchs":1035,"domicile":1.4192488262910798,"exterieur":1.0746478873239436},"Swiss Superleague":{"matchs":743,"domicile":1.7056921086675292,"exterieur":1.3628719275549805},"Taça da Liga - Portugal":{"matchs":40,"domicile":1.7642857142857142,"exterieur":1.0928571428571427},"Taça de Portugal":{"matchs":299,"domicile":1.621580547112462,"exterieur":1.5638297872340425},"Turkey Super League":{"matchs":1080,"domicile":1.5752252252252252,"exterieur":1.2274774774774775},"Türkiye Kupası":{"matchs":302,"domicile":1.9713855421686748,"exterieur":1.3569277108433735},"UEFA Champions League":{"matchs":838,"domicile":1.7701612903225807,"exterieur":1.2966589861751152},"UEFA Europa Conference League":{"matchs":1373,"domicile":1.6568068424803992,"exterieur":1.1635780470420527},"UEFA Europa League":{"matchs":774,"domicile":1.6598258706467661,"exterieur":1.169776119402985},"US Open Cup":{"matchs":198,"domicile":1.9276315789473684,"exterieur":1.2960526315789473},"Veikkausliiga - Finland":{"matchs":588,"domicile":1.559061488673139,"exterieur":1.3341423948220066},"Virsliga - Latvia":{"matchs":599,"domicile":1.6414944356120826,"exterieur":1.2885532591414945}}});
// </MOYENNES_DES_CHAMPIONNATS>
