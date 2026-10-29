/**
 * lancements.js — ce que le garde-fou de la mesure doit savoir, ÉCRIT DANS LE CODE (étape 16 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Une amélioration des chiffres ne se prouve que sur des matchs joués APRÈS
 * sa mise en service : ceux d'avant ont servi à la construire. Pour le dire,
 * le juge (guard.js, jugerEtape) a besoin de trois choses, rangées ici :
 *   - les étapes dont les chiffres doivent être prouvés (ETAPES_A_JUGER) ;
 *   - les données déjà vues de tous (DONNEES_VUES) : jamais de la preuve neuve ;
 *   - les lancements déclarés par chaque étape (LANCEMENTS) : la version mise
 *     en service, TOUTES les variantes dont on a regardé le résultat pendant
 *     la construction, et les fenêtres de données regardées.
 *
 * Pourquoi dans le CODE, comme plan.js et historique.js : les données
 * d'exécution du bac à sable ne sont JAMAIS recopiées vers l'appli de Pierre.
 * Une variante notée dans data/runtime du bac disparaîtrait à la mise en
 * service, et le juge compterait trop peu de variantes — de fausses preuves.
 * Seule la DATE de lancement vit dans data/runtime (trialsRegistry.js) : c'est
 * celle du premier démarrage de l'appli de Pierre avec ce code, notée au
 * démarrage du serveur sans que personne y pense.
 *
 * À LA FIN D'UNE ÉTAPE QUI TOUCHE AUX CHIFFRES : ajouter son entrée à
 * LANCEMENTS (et, si l'étape n'y est pas, revoir ETAPES_A_JUGER avec Pierre).
 * Un test (registreMesure.test.mjs) passe verifierLancements sur la liste.
 * -----------------------------------------------------------------------
 */

import { normaliserIdEtape } from '../data/roadmap/plan.js';

/**
 * Les étapes dont les chiffres doivent être prouvés sur des matchs joués après leur lancement
 * (proposition de la conception du 07/10/2026 : à confirmer avec Pierre).
 */
export const ETAPES_A_JUGER = Object.freeze(['26', '27', '28', '29', '30', '32', '33', '34', '35', '36', '37', '38', '39', '46', '47']);
// Exclues, et pourquoi : 8 (alignement sur un calcul déjà mesuré, pas un nouveau modèle — dit dans
// l'historique) ; 17, 18, 19, 20, 22, 23 et 24 (elles mesurent, elles ne changent pas les chiffres) ;
// 25 (la porte des versions : chaque adoption est un lancement rangé sous l'étape de la version) ;
// 41 à 45 (l'IA explique, elle n'écrit jamais un chiffre du moteur).

/**
 * Données déjà vues par tout le monde : jamais de la preuve neuve, pour aucune étape (fenêtres inclusives, jours
 * AAAA-MM-JJ). Étape 19 (banc d'essai, 13/10/2026) : trois fenêtres CONTIGUËS au lieu d'une — les constantes
 * du 23/09 ont été APPRISES sur 2024-25 et la règle de pari réglée sur l'historique football-data rattaché au
 * magasin depuis 2023 (rien de rattaché avant le 01/07/2023 pour les 18 divisions à fichier saisonnier : vérifié
 * sur la base du bac, premier rattachement le 28/07/2023). L'`id` de chaque fenêtre dit à l'écran PAR QUOI elle
 * a été vue (le banc compte ses lignes par fenêtre).
 */
export const DONNEES_VUES = Object.freeze([
  Object.freeze({
    id: 'regle-de-value-23-09',
    de: '2023-07-01',
    a: '2024-06-30',
    pour: Object.freeze(['tout']),
    quoi: 'Historique football-data chargé le 23/09 : choix du livre de référence (paliers — Pinnacle d’abord, sinon palier 2, sinon deux avis du palier 3, valueFinder.js —, qui est aussi la probabilité 1N2 du moteur), seuil de value de 2 % et cote maximale de 5, mesurés sur 20 914 matchs de 18 championnats rattachés au magasin, 07/2023 → 09/2026. Vu par le 1N2 (livre de référence) et par la règle de pari ; FIABILITE, MODELES_SCORE, STAT_KINDS et FACTEUR_TERRAIN n’ont pas vu cette fenêtre.'
  }),
  Object.freeze({
    id: 'apprentissage-23-09',
    de: '2024-07-01',
    a: '2025-06-30',
    pour: Object.freeze(['tout']),
    quoi: 'Saison 2024-25 : apprentissage de FIABILITE, FREQUENCES_1N2 et POIDS_MODELE_SANS_COTES (resultPrediction.js), de MODELES_SCORE (scorePrediction.js) et de STAT_KINDS (statMarkets.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés sur 07/2024 → 09/2026 (statInputsRead.js) ; règle de pari (ci-dessus).'
  }),
  Object.freeze({
    id: 'mesures-du-23-09',
    de: '2025-07-01',
    a: '2026-09-23',
    pour: Object.freeze(['tout']),
    quoi: 'Saison 2025-26 : 13 052 matchs de vérification des constantes FIABILITE, de la méthode puissance et de la règle de value (resultPrediction.js, marginRemoval.js, valueFinder.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés jusqu’ici.'
  })
]);

/**
 * LES PORTÉES d'une fenêtre vue (correction du 19/10/2026, après la vérification de l'étape 19) : CE QUE la
 * fenêtre a servi à régler. Une fenêtre n'est « déjà vue » que pour ce qu'elle a réglé :
 *   tout          les réglages du 23/09 (DONNEES_VUES) : vus de toutes les mesures ;
 *   moteur        un chiffre du moteur — ce que mesurent le banc d'essai (19, 25) et le juge de preuve ;
 *   statistiques  la valeur des statistiques (étape 18 : demi-vies, fenêtres, pentes) ;
 *   marche        la connaissance du marché (étape 22 : justesse et vitesse des bookmakers) ;
 *   indice        l'indice de force des équipes (étape 29, jamais lu par le moteur) ;
 *   joueurs       les fiches des joueurs et la force du onze (étape 30, 22/10/2026 ; jamais lues par le moteur) ;
 *   style         les styles de jeu des équipes et des entraîneurs, et les duels de styles (étape 37, 22/10/2026 ;
 *                 jamais lus par le moteur : explication seulement) ;
 *   simulation    la simulation complète : déroulé d'un match, combinés, fins de saison et enjeu (étape 28, 27/10/2026 ;
 *                 jamais lue par le moteur — une candidate du moteur qui lirait un jour l'enjeu recopierait ces vues
 *                 avec `pour: ['moteur']`).
 *   contexte      le contexte du match (étape 32, 29/10/2026 ; data/contexte/) : la fiche de contexte, l'archive
 *                 d'avant-match et le banc des facteurs — jamais lus par le moteur au lot 1 (une candidate du moteur qui
 *                 lirait un jour le contexte recopierait ces vues avec `pour: ['moteur']`).
 * Une étape qui fait LIRE au moteur une grandeur apprise ailleurs (27 lisant l'indice ou une demi-vie de 18)
 * recopie ces fenêtres dans SON lancement avec `pour: ['moteur']` : c'est son lancement qui dit ce que le
 * moteur a vu. Sans cette règle, une fenêtre regardée pour l'indice étiquetait « déjà vu » les lignes du
 * MOTEUR sur 2019-2023 (la note de départ), alors qu'aucun chiffre du moteur ne les avait vues.
 */
export const PORTEES = Object.freeze(['tout', 'moteur', 'statistiques', 'marche', 'indice', 'joueurs', 'style', 'simulation', 'contexte']);

/** Une fenêtre vaut-elle pour cette mesure ? `tout` vaut pour toutes. */
export const pourLaPortee = (pour, portee) => Array.isArray(pour) && (pour.includes(portee) || pour.includes('tout'));

/**
 * Les fenêtres « déjà vu » d'une MESURE (étape 19, corrigé le 19/10) : DONNEES_VUES (« tout »), les `vues` des
 * lancements du code dont la portée couvre la mesure (`pour`), et, pour le banc qui rejoue une candidate, les
 * vues de SA déclaration (`declaration` : { etape, version | id, vues }), quelle que soit leur portée — ce que
 * la candidate a regardé pour se construire. Chacune avec son identifiant : « 27:v1:1 » (première vue de la
 * version v1 de l'étape 27), « candidate:c1:1 ». `portee` : 'moteur' (le banc), 'statistiques' (18),
 * 'marche' (22), 'indice' (29). Pure.
 */
export function fenetresDeclarees({ portee = 'moteur', declaration = null, lancements = LANCEMENTS, donneesVues = DONNEES_VUES } = {}) {
  if (!PORTEES.includes(portee) || portee === 'tout') throw new RangeError(`fenetresDeclarees : portée « ${String(portee)} » inconnue (${PORTEES.filter((p) => p !== 'tout').join(', ')}).`);
  const version = declaration ? (declaration.version ?? declaration.id ?? null) : null;
  // Une candidate déjà déclarée dans le code (même étape, même version) n'est pas comptée deux fois.
  const dejaDansLeCode = Boolean(declaration) && lancements.some((d) => d.etape === declaration.etape && d.version === version);
  return [
    ...donneesVues.map((f) => ({ id: f.id, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: null, version: null, pour: ['tout'], candidate: false })),
    ...lancements.flatMap((d) =>
      (d.vues ?? [])
        .map((f, i) => ({ id: `${d.etape}:${d.version}:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: d.etape, version: d.version, pour: [...(f.pour ?? [])], candidate: false }))
        .filter((f) => pourLaPortee(f.pour, portee))
    ),
    ...(declaration && !dejaDansLeCode
      ? (declaration.vues ?? []).map((f, i) => ({ id: `candidate:${version ?? '?'}:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: declaration.etape ?? null, version, pour: Array.isArray(f.pour) ? [...f.pour] : [portee], candidate: true }))
      : [])
  ];
}

/**
 * Ce que l'étape 18 (valeur des statistiques) a REGARDÉ, pour les étapes qui liront sa demi-vie ou sa fenêtre
 * (29 ; 27 et 30 plus tard) : à recopier dans les `vues` de leur lancement, avec la portée de CE QUE l'étape
 * lectrice règle (29 : 'indice' ; 27 : 'moteur'). Le calcul y a CHOISI ; le jugement y a regardé un résultat.
 * Les jours sont ceux de PERIODES_DU_CALCUL (statValue.js, qui les ré-exporte) : un test vérifie qu'ils restent
 * égaux (ici, pas d'import : statValue.js lit ce fichier).
 */
export const VUES_DE_L_ETAPE_18 = Object.freeze([
  Object.freeze({ de: '2024-07-01', a: '2025-06-30', quoi: 'Étape 18 : demi-vies, fenêtres et pentes choisies sur le magasin (P4a).' }),
  Object.freeze({ de: '2000-07-01', a: '2019-06-30', quoi: 'Étape 18 : demi-vies, fenêtres et pentes choisies sur football-data (P1).' }),
  Object.freeze({ de: '2019-07-01', a: '2023-06-30', quoi: 'Étape 18 : fenêtres et demi-vies jugées sur football-data (P2) — une variante regardée.' })
]);

/** Les fenêtres REGARDÉES par l'étape 29 (en plus de VUES_DE_L_ETAPE_18, dont elle lit les demi-vies). teamStrength.js les ré-exporte. */
export const VUES_DE_L_ETAPE_29 = Object.freeze([
  Object.freeze({ de: '2024-07-01', a: '2025-06-30', quoi: 'Étape 29 : poids de la note et liens « écart → probabilités » appris sur le magasin (P4a).' }),
  Object.freeze({ de: '2023-01-01', a: '2024-06-30', quoi: 'Étape 29 : indice jugé face au classement corrigé xG et au classement réel sur le magasin neuf (P3) — ses variantes comptées.' }),
  Object.freeze({ de: '2025-07-01', a: '2026-10-07', quoi: 'Étape 29 : les mêmes jugements, indicatifs, sur P4b et P5 (déjà vues), jusqu’au dernier jour de la base du bac.' })
]);

/**
 * Les fenêtres REGARDÉES par l'étape 30 (les fiches des joueurs et la force du onze, 22/10/2026), portée « joueurs » :
 * le magasin 2023-07-01 → 2026-09-23 (la conception, puis le banc de la construction : histoire ET cibles, rien
 * avant ni après), et les fenêtres où l'étape 18 a choisi puis jugé les demi-vies des statistiques de JOUEURS (le
 * magasin seulement — jamais football-data) dont la grille de l'étape 30 est partie. Une candidate du MOTEUR qui
 * lirait un jour la force du onze recopierait ces fenêtres-ci avec `pour: ['moteur']`, jamais VUES_DE_L_ETAPE_18
 * en bloc (ses fenêtres football-data P1/P2 ne concernent que les statistiques d'équipe). playerRatingsBanc.js les
 * ré-exporte.
 */
export const VUES_DE_L_ETAPE_30 = Object.freeze([
  Object.freeze({ de: '2023-07-01', a: '2026-09-23', quoi: 'Étape 30 : demi-vies, rétrécissement, corrections, facteurs de championnat et inclinaison de la force du onze mesurés sur le magasin (apprentissage 2023-10 → 2025-06, vérification 2025-07 → 2026-09-23).' }),
  Object.freeze({ de: '2024-07-01', a: '2026-10-18', quoi: 'Étape 18 (partie joueurs, centre de la grille de l’étape 30) : demi-vies et stabilisations choisies sur P4a, jugées sur P4b et P5 jusqu’au calcul du 18/10.' })
]);

/**
 * Les 19 variantes de l'étape 30, toutes regardées face à des matchs joués pendant sa conception et sa construction :
 * les 10 des FICHES (la retenue d'abord, puis les rétrécissements et demi-vies essayés et la fiche sans correction des
 * adversaires) et les 9 signaux de la FORCE DU ONZE jugés au-delà du marché ou des statistiques seules.
 * playerRatingsBanc.js les ré-exporte (le juge du banc compte K = 19).
 */
export const VARIANTES_DE_L_ETAPE_30 = Object.freeze([
  Object.freeze({ id: 'fiches-v1', quoi: 'Fiches retenues : par 90 min, demi-vies 8 à 35 apparitions, rétrécissement au point de stabilisation (la moitié pour récupérations et duels), corrections des adversaires et du championnat.' }),
  Object.freeze({ id: 'fiches-k-0', quoi: 'Fiches sans rétrécissement (la moyenne brute par 90).' }),
  Object.freeze({ id: 'fiches-k-0,5', quoi: 'Fiches au rétrécissement divisé par deux.' }),
  Object.freeze({ id: 'fiches-k-2', quoi: 'Fiches au rétrécissement doublé.' }),
  Object.freeze({ id: 'fiches-k-4', quoi: 'Fiches au rétrécissement quadruplé.' }),
  Object.freeze({ id: 'fiches-h-0,5', quoi: 'Fiches aux demi-vies divisées par deux.' }),
  Object.freeze({ id: 'fiches-h-0,7', quoi: 'Fiches aux demi-vies × 0,7.' }),
  Object.freeze({ id: 'fiches-h-1,4', quoi: 'Fiches aux demi-vies × 1,4.' }),
  Object.freeze({ id: 'fiches-h-2', quoi: 'Fiches aux demi-vies doublées.' }),
  Object.freeze({ id: 'fiches-sans-adversaire', quoi: 'Fiches sans la correction des adversaires.' }),
  Object.freeze({ id: 'onze-plan', quoi: 'Force du onze, signal complet (attaque, récupérations, xG concédés sur le terrain, gardien) sur le 1N2.' }),
  Object.freeze({ id: 'onze-att', quoi: 'Force du onze, écart offensif seul, sur le 1N2.' }),
  Object.freeze({ id: 'onze-note', quoi: 'Force du onze par la note FotMob, sur le 1N2.' }),
  Object.freeze({ id: 'onze-simple', quoi: 'Force du onze par les seules parts de titulaires habituels absents, sur le 1N2.' }),
  Object.freeze({ id: 'onze-plan-xg', quoi: 'Signal complet, championnats couverts en xG seulement.' }),
  Object.freeze({ id: 'onze-att-xg', quoi: 'Écart offensif seul, championnats couverts en xG seulement.' }),
  Object.freeze({ id: 'onze-total-25', quoi: 'Force du onze sur le plus/moins 2,5.' }),
  Object.freeze({ id: 'onze-tirs', quoi: 'Écart de tirs du onze sur les tirs d’une équipe (marché sans cote).' }),
  Object.freeze({ id: 'gardien-remplacant', quoi: 'Le gardien remplaçant face au marché (vérification descriptive).' })
]);

/**
 * Les fenêtres REGARDÉES par l'étape 37 (les styles de jeu, 22/10/2026), portée « style » : le magasin 2023-07-01 →
 * 2026-09-23 où les duels de styles ont été appris puis jugés face à la clôture football-data (histoire ET cibles, rien
 * avant ni après), et le magasin entier de la base du bac (2023-01 → 2026-10-18) où les réglages du style ont été
 * choisis sur la STABILITÉ d'un mois sur l'autre — sans lire un seul résultat, déclaré quand même. teamStyleBanc.js les
 * ré-exporte. Une candidate du MOTEUR qui lirait un jour le style recopierait ces fenêtres avec `pour: ['moteur']`.
 */
export const VUES_DE_L_ETAPE_37 = Object.freeze([
  Object.freeze({ de: '2023-07-01', a: '2026-09-23', quoi: 'Étape 37 : décalages des duels de styles appris sur 2023-07 → 2025-06, jugés sur 2025-07 → 2026-09-23 face à la cote de clôture football-data (1N2 et plus/moins 2,5).' }),
  Object.freeze({ de: '2023-01-01', a: '2026-10-18', quoi: 'Étape 37 : fenêtre, seuil, cran et rétrécissement du style choisis sur la stabilité d’un mois sur l’autre (aucun résultat lu).' })
]);

/** Les cinq étiquettes de l'étape 37, dans l'ordre de teamStyle.js (STYLES_ET_EQUILIBRE) : un test vérifie l'égalité. */
const ETIQUETTES_DE_L_ETAPE_37 = Object.freeze(['possession', 'direct', 'contre', 'cpa', 'equilibre']);

/**
 * Les 53 variantes de l'étape 37, toutes regardées face à des matchs joués pendant sa construction : le style retenu
 * (style-v1, en tête : il n'a lu aucun résultat, mais la version retenue fait partie de ses variantes), les deux
 * jugements globaux des duels (1N2, plus/moins 2,5) et les 50 cases jugées une à une (5 × 5 styles × 2 marchés).
 * teamStyleBanc.js les ré-exporte : le juge du banc compte K = 53 (z ≈ 3,31), le seuil sévère du cahier.
 */
export const VARIANTES_DE_L_ETAPE_37 = Object.freeze([
  Object.freeze({ id: 'style-v1', quoi: 'Style retenu : 20 derniers matchs de championnat (400 jours au plus), z face aux clubs du championnat, seuil 0,75, cran 0,25, parts de tirs ramenées vers le championnat (150 tirs).' }),
  Object.freeze({ id: 'duels-1n2', quoi: 'Duels de styles sur le 1N2 : une inclinaison domicile/extérieur par case, toutes les cases ensemble, face à la clôture.' }),
  Object.freeze({ id: 'duels-plusmoins', quoi: 'Duels de styles sur le plus/moins 2,5 : un décalage par case, toutes les cases ensemble, face à la clôture.' }),
  ...['un2', 'pm'].flatMap((marche) =>
    ETIQUETTES_DE_L_ETAPE_37.flatMap((dom) =>
      ETIQUETTES_DE_L_ETAPE_37.map((ext) => Object.freeze({ id: `case-${marche}-${dom}-${ext}`, quoi: `Case ${dom} (domicile) × ${ext} (extérieur), ${marche === 'un2' ? '1N2' : 'plus/moins 2,5'}, jugée seule face à la clôture.` }))
    )
  )
]);
export const ETIQUETTES_DE_L_ETAPE_37_POUR_LES_TESTS = ETIQUETTES_DE_L_ETAPE_37;

/**
 * Les fenêtres REGARDÉES par l'étape 28 (la simulation complète, 27/10/2026 ; data/simulation/), portée « simulation » :
 * le magasin 2023-07-01 → 2026-09-23 où le profil des minutes, les effets du score et les hasards des rouges ont été
 * appris (2023-07 → 2025-06, puis sur tout, figés), les marchés de déroulé et les combinés jugés (2025-07 → 2026-09-23),
 * les fins de saison et l'enjeu jugés sur 149 phases avec les forces de la candidate de l'étape 27 (texte de la preuve,
 * §5). P2 (football-data 2019-07-01 → 2023-06-30) est déclarée ici comme FENÊTRE DE PORTE (critique de l'étape 28,
 * point 2 ; ajoutée le 27/10/2026 AVANT le regard) : la porte 1, un seul passage, verdict écrit avant (porte1-regles.md
 * de la partie C) ; c'est le second regard sur P2 après la porte 1 de l'étape 27, déclaré (conception §3.1) ; aucune
 * mesure de l'étape 28 n'y sera refaite après le verdict. Une candidate du MOTEUR qui lirait un jour l'enjeu
 * recopierait ces vues avec `pour: ['moteur']`.
 */
export const VUES_DE_L_ETAPE_28 = Object.freeze([
  Object.freeze({ de: '2023-07-01', a: '2026-09-23', quoi: 'Étape 28 : profil des minutes, effets du score et hasards de rouges appris sur 2023-07 → 2025-06 puis sur tout (figés) ; marchés de déroulé et combinés jugés sur 2025-07 → 2026-09-23 ; fins de saison et enjeu jugés sur 149 phases avec les forces de la candidate 27.' }),
  Object.freeze({ de: '2019-07-01', a: '2023-06-30', quoi: 'Étape 28 : porte 1 sur football-data P2, un seul passage le 27/10/2026, verdict écrit avant (SCR porte1-regles.md) ; aucune mesure de 28 n’y sera refaite après le verdict.' })
]);

/**
 * Les 27 VARIANTES de l'étape 28, toutes regardées face à des matchs joués pendant sa conception (la déclaration de
 * la preuve, §5) : la version retenue (simulation-v1, en tête), les 13 regards de l’angle simulation, les 12 de l’angle
 * saisons et celui de l’angle preuve (effets appris sur la moitié A seulement). K = 27. Les corrections de la critique
 * (Poisson exact, « ≥ 90 % » lu sur des déciles déjà imprimés) ne sont pas des variantes. Toute mesure nouvelle (effets
 * par championnat, confrontations directes, seconde phase, seuil des 10 %, une autre empreinte des forces : la nuit la
 * déclare elle-même, « saisons-forces-<empreinte> ») = un identifiant de plus, déclaré AVANT de regarder.
 */
export const VARIANTES_DE_L_ETAPE_28 = Object.freeze([
  Object.freeze({ id: 'simulation-v1', quoi: 'Retenue : 92 créneaux, effets par écart × rouges × tranche appris sur tout, hasard moyen des rouges, Poisson exact, stratifiée sur la grille du moteur ; combinés lus dans la grille ρ −0,05 alignée sur le 1N2 affiché ; fins de saison par les forces de 27, départage simple ; enjeu = écart de probabilité entre victoire et défaite.' }),
  Object.freeze({ id: 'sim-effets-sans-tranche', quoi: 'Angle simulation (1) : multiplicateurs de buts selon l’écart et les rouges, sans tranche de minutes (s1).' }),
  Object.freeze({ id: 'sim-effets-par-tranche', quoi: 'Angle simulation (2) : les mêmes multiplicateurs par trois tranches de minutes (s2, retenus).' }),
  Object.freeze({ id: 'sim-brute', quoi: 'Angle simulation (3) : simulation brute, non recalée sur la grille du moteur.' }),
  Object.freeze({ id: 'sim-stratifiee-effets', quoi: 'Angle simulation (4) : stratifiée sur la grille, avec les effets du score (retenue).' }),
  Object.freeze({ id: 'sim-stratifiee-sans-effets', quoi: 'Angle simulation (5) : stratifiée sur la grille, sans les effets du score (s5a).' }),
  Object.freeze({ id: 'sim-rouges-moyen', quoi: 'Angle simulation (6) : hasard des rouges moyen par bande de minutes et par écart (s1, s2 ; retenu).' }),
  Object.freeze({ id: 'sim-premier-rouge', quoi: 'Angle simulation (7) : premier rouge puis facteurs après (s6a) — déclarée, non retenue (pas prouvé dans les deux sens, v1).' }),
  Object.freeze({ id: 'sim-poisson-exact', quoi: 'Angle simulation (8) : boucle de Poisson exacte par créneau (retenue).' }),
  Object.freeze({ id: 'sim-un-but-par-creneau', quoi: 'Angle simulation (9) : boucle « un but par créneau au plus » (s6b), écartée.' }),
  Object.freeze({ id: 'combines-grille', quoi: 'Angle simulation (10) : combinés lus dans la grille ρ −0,05 (retenu).' }),
  Object.freeze({ id: 'combines-produit', quoi: 'Angle simulation (11) : combinés au produit des simples (ce que l’appli enregistrait avant).' }),
  Object.freeze({ id: 'combines-rho-0', quoi: 'Angle simulation (12) : combinés lus dans la grille ρ = 0 (s3).' }),
  Object.freeze({ id: 'combines-alignement-camp', quoi: 'Angle simulation (13) : grille alignée camp par camp sur le 1N2 affiché (s4, retenu pour l’écran et le ticket).' }),
  Object.freeze({ id: 'saisons-moyennes', quoi: 'Angle saisons (1) : fins de saison par les moyennes du championnat seules (V0).' }),
  Object.freeze({ id: 'saisons-table', quoi: 'Angle saisons (2) : fins de saison par la table officielle (V1, le repli).' }),
  Object.freeze({ id: 'saisons-forces', quoi: 'Angle saisons (3) : fins de saison par les forces de buts de l’étape 27, empreinte v1|35|25|remise-a-zero (V2, retenue).' }),
  Object.freeze({ id: 'saisons-table-poisson', quoi: 'Angle saisons (4) : fins de saison par la table, Poisson indépendant (V1P).' }),
  Object.freeze({ id: 'enjeu-seuils-2-10-20', quoi: 'Angle saisons (5) : seuils de l’enjeu 2 / 10 / 20 points.' }),
  Object.freeze({ id: 'enjeu-effet-forces', quoi: 'Angle saisons (6) : effet de l’enjeu sur le résultat par V2, dé-confondu par le marché.' }),
  Object.freeze({ id: 'enjeu-effet-table', quoi: 'Angle saisons (7) : effet de l’enjeu sur le résultat par V1.' }),
  Object.freeze({ id: 'enjeu-effet-moyennes', quoi: 'Angle saisons (8) : effet de l’enjeu sur le résultat par V0.' }),
  Object.freeze({ id: 'enjeu-nul-arrange', quoi: 'Angle saisons (9) : seuil « le nul arrange les deux » (10 / 2 points).' }),
  Object.freeze({ id: 'restants-construction', quoi: 'Angle saisons (10) : rencontres restantes construites pour un aller-retour simple (k = 2) contre le calendrier seul (p5, comptes).' }),
  Object.freeze({ id: 'departage-simple', quoi: 'Angle saisons (11) : départage simplifié (différence de buts) contre les tables officielles (p1b, comptes).' }),
  Object.freeze({ id: 'saisons-bruit-8-graines', quoi: 'Angle saisons (12) : bruit des fins de saison et de l’enjeu sur 8 graines (p6, comptes).' }),
  Object.freeze({ id: 'sim-effets-appris-2023-2025', quoi: 'Angle preuve : les mêmes effets appris sur 2023-07 → 2025-06 seulement, jugés sur 2025-07 → 2026-09-23 (v1).' })
]);

/** Les variantes de l'indice de l'étape 29, toutes regardées (la retenue d'abord, choisie avant de regarder). teamStrengthBanc.js les ré-exporte. */
export const VARIANTES_INDICE = Object.freeze([
  Object.freeze({ id: 'indice-v1', quoi: 'Indice de force retenu : correction des adversaires, demi-vies mesurées par l’étape 18, note « tous lieux ».' }),
  Object.freeze({ id: 'indice-dom-ext', quoi: 'La note à domicile du club qui reçoit face à la note à l’extérieur du visiteur.' }),
  Object.freeze({ id: 'sans-correction', quoi: 'Sans la correction des adversaires (itération 0 : le classement brut pondéré dans le temps).' }),
  Object.freeze({ id: 'demi-vie-18', quoi: 'L’idée de départ du plan : une demi-vie de 18 matchs pour toutes les statistiques.' })
]);

/**
 * LES 320 VARIANTES DE L'ÉTAPE 27 (le modèle de buts unique, 21/10/2026) : toutes les versions des chiffres dont on a
 * REGARDÉ le résultat face à des matchs joués pendant sa construction — la candidate retenue (modele-buts-v1, en
 * tête), puis les mesures du scratchpad de l'étape 27 (mesures/modele/resultats) : m1 calage sur les cotes et loi
 * des scores (31), m6 nuls (5), m2 forces des équipes (157), m3 mélange (122), m4 livres du plus/moins (3), m7
 * démarrage à froid (1). Identifiants stables générés UNE fois (generer-variantes.mjs) et figés ici : jamais
 * retouchés. CANDIDATE_EN_ESSAI (engineVersions.js) les déclare sans la sienne ; à la mise à blanc, le registre de
 * la mesure compte la candidate « a-blanc » et les 319 autres « construction » : K = 320 (z = 3,78).
 */
export const VARIANTES_DE_L_ETAPE_27 = Object.freeze([
  Object.freeze({ id: "modele-buts-v1", quoi: "Candidate retenue : une seule grille des scores, calée sur les cotes (1N2, et plus/moins 2,5 quand il existe) et mélangée aux forces des équipes (xG ou buts) ; démarrage à froid retenu (m7)." }),
  Object.freeze({ id: "m1-v1-1n2-seul-rho-m0-04", quoi: "m1 calage sur les cotes : v1 1N2 seul (rho −0,04)" }),
  Object.freeze({ id: "m1-v2-total-par-plusmoins-2-5-equilibre-par-1n2-rho-m0-04", quoi: "m1 calage sur les cotes : v2 total par +/−2,5, équilibre par 1N2 (rho −0,04)" }),
  Object.freeze({ id: "m1-v3-moindres-carres-h-a-o-rho-m0-04", quoi: "m1 calage sur les cotes : v3 moindres carrés H,A,O (rho −0,04)" }),
  Object.freeze({ id: "m1-v4-rho-libre-par-match", quoi: "m1 calage sur les cotes : v4 rho libre par match" }),
  Object.freeze({ id: "m1-v2-borne-0-5-2-8", quoi: "m1 calage sur les cotes : v2 borné [0,5 ; 2,8]" }),
  Object.freeze({ id: "m1-v2-grille-0-10", quoi: "m1 calage sur les cotes : v2 grille 0-10" }),
  Object.freeze({ id: "m1-v2-grille-0-12", quoi: "m1 calage sur les cotes : v2 grille 0-12" }),
  Object.freeze({ id: "m1-v2-avec-plusmoins-maximum-du-marche", quoi: "m1 calage sur les cotes : v2 avec +/− maximum du marché" }),
  Object.freeze({ id: "m1-v2-avec-marge-proportionnelle-sur-le-plusmoins", quoi: "m1 calage sur les cotes : v2 avec marge proportionnelle sur le +/−" }),
  Object.freeze({ id: "m1-v2-avec-1n2-pinnacle-depuis-2012-07", quoi: "m1 calage sur les cotes : v2 avec 1N2 Pinnacle (≥ 2012-07)" }),
  Object.freeze({ id: "m1-v2-avec-1n2-moyenne-depuis-2012-07-meme-matchs", quoi: "m1 calage sur les cotes : v2 avec 1N2 moyenne (≥ 2012-07, même matchs)" }),
  Object.freeze({ id: "m1-v1-1n2-seul-pinnacle-depuis-2012-07", quoi: "m1 calage sur les cotes : v1 1N2 seul Pinnacle (≥ 2012-07)" }),
  Object.freeze({ id: "m1-rho-m0.14", quoi: "m1 corrélation des petits scores rho = -0.14 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.12", quoi: "m1 corrélation des petits scores rho = -0.12 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.1", quoi: "m1 corrélation des petits scores rho = -0.1 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.08", quoi: "m1 corrélation des petits scores rho = -0.08 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.07", quoi: "m1 corrélation des petits scores rho = -0.07 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.06", quoi: "m1 corrélation des petits scores rho = -0.06 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.05", quoi: "m1 corrélation des petits scores rho = -0.05 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.04", quoi: "m1 corrélation des petits scores rho = -0.04 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.03", quoi: "m1 corrélation des petits scores rho = -0.03 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.02", quoi: "m1 corrélation des petits scores rho = -0.02 (tour 2)" }),
  Object.freeze({ id: "m1-rho-m0.01", quoi: "m1 corrélation des petits scores rho = -0.01 (tour 2)" }),
  Object.freeze({ id: "m1-rho-0", quoi: "m1 corrélation des petits scores rho = 0 (tour 2)" }),
  Object.freeze({ id: "m1-rho-0.02", quoi: "m1 corrélation des petits scores rho = 0.02 (tour 2)" }),
  Object.freeze({ id: "m1-loi-poisson-et-dc", quoi: "m1 loi des scores : Poisson + DC" }),
  Object.freeze({ id: "m1-loi-poisson-sans-dc-rho-0", quoi: "m1 loi des scores : Poisson sans DC (rho 0)" }),
  Object.freeze({ id: "m1-loi-binomiale-negative-a-0.01-et-dc", quoi: "m1 loi des scores : Binomiale négative a=0.01 + DC" }),
  Object.freeze({ id: "m1-loi-binomiale-negative-a-0.02-et-dc", quoi: "m1 loi des scores : Binomiale négative a=0.02 + DC" }),
  Object.freeze({ id: "m1-loi-binomiale-negative-a-0.04-et-dc", quoi: "m1 loi des scores : Binomiale négative a=0.04 + DC" }),
  Object.freeze({ id: "m1-loi-binomiale-negative-a-0.08-et-dc", quoi: "m1 loi des scores : Binomiale négative a=0.08 + DC" }),
  Object.freeze({ id: "m6-nuls-delta-0", quoi: "m6 nuls ≥ 2-2 gonflés de δ = 0" }),
  Object.freeze({ id: "m6-nuls-delta-0.05", quoi: "m6 nuls ≥ 2-2 gonflés de δ = 0.05" }),
  Object.freeze({ id: "m6-nuls-delta-0.1", quoi: "m6 nuls ≥ 2-2 gonflés de δ = 0.1" }),
  Object.freeze({ id: "m6-nuls-delta-0.15", quoi: "m6 nuls ≥ 2-2 gonflés de δ = 0.15" }),
  Object.freeze({ id: "m6-nuls-delta-0.2", quoi: "m6 nuls ≥ 2-2 gonflés de δ = 0.2" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-6", quoi: "m2 forces des équipes : fd: tour 1 hAtt=6" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-8", quoi: "m2 forces des équipes : fd: tour 1 hAtt=8" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-13", quoi: "m2 forces des équipes : fd: tour 1 hAtt=13" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-18", quoi: "m2 forces des équipes : fd: tour 1 hAtt=18" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-25", quoi: "m2 forces des équipes : fd: tour 1 hAtt=25" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-35", quoi: "m2 forces des équipes : fd: tour 1 hAtt=35" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-50", quoi: "m2 forces des équipes : fd: tour 1 hAtt=50" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-100", quoi: "m2 forces des équipes : fd: tour 1 hAtt=100" }),
  Object.freeze({ id: "m2-fd-tour-1-hatt-inf", quoi: "m2 forces des équipes : fd: tour 1 hAtt=Infinity" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-6", quoi: "m2 forces des équipes : fd: tour 1 hDef=6" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-8", quoi: "m2 forces des équipes : fd: tour 1 hDef=8" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-13", quoi: "m2 forces des équipes : fd: tour 1 hDef=13" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-18", quoi: "m2 forces des équipes : fd: tour 1 hDef=18" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-25", quoi: "m2 forces des équipes : fd: tour 1 hDef=25" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-35", quoi: "m2 forces des équipes : fd: tour 1 hDef=35" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-50", quoi: "m2 forces des équipes : fd: tour 1 hDef=50" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-100", quoi: "m2 forces des équipes : fd: tour 1 hDef=100" }),
  Object.freeze({ id: "m2-fd-tour-1-hdef-inf", quoi: "m2 forces des équipes : fd: tour 1 hDef=Infinity" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-0.5", quoi: "m2 forces des équipes : fd: tour 1 k0=0.5" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-1", quoi: "m2 forces des équipes : fd: tour 1 k0=1" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-2", quoi: "m2 forces des équipes : fd: tour 1 k0=2" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-4", quoi: "m2 forces des équipes : fd: tour 1 k0=4" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-8", quoi: "m2 forces des équipes : fd: tour 1 k0=8" }),
  Object.freeze({ id: "m2-fd-tour-1-k0-16", quoi: "m2 forces des équipes : fd: tour 1 k0=16" }),
  Object.freeze({ id: "m2-fd-tour-1-stat-buts", quoi: "m2 forces des équipes : fd: tour 1 stat=buts" }),
  Object.freeze({ id: "m2-fd-tour-1-fligue-1", quoi: "m2 forces des équipes : fd: tour 1 fLigue=1" }),
  Object.freeze({ id: "m2-fd-tour-1-fligue-0.5", quoi: "m2 forces des équipes : fd: tour 1 fLigue=0.5" }),
  Object.freeze({ id: "m2-fd-tour-1-fligue-0", quoi: "m2 forces des équipes : fd: tour 1 fLigue=0" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-6", quoi: "m2 forces des équipes : fd: tour 2 hAtt=6" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-8", quoi: "m2 forces des équipes : fd: tour 2 hAtt=8" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-13", quoi: "m2 forces des équipes : fd: tour 2 hAtt=13" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-18", quoi: "m2 forces des équipes : fd: tour 2 hAtt=18" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-25", quoi: "m2 forces des équipes : fd: tour 2 hAtt=25" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-35", quoi: "m2 forces des équipes : fd: tour 2 hAtt=35" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-50", quoi: "m2 forces des équipes : fd: tour 2 hAtt=50" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-100", quoi: "m2 forces des équipes : fd: tour 2 hAtt=100" }),
  Object.freeze({ id: "m2-fd-tour-2-hatt-inf", quoi: "m2 forces des équipes : fd: tour 2 hAtt=Infinity" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-6", quoi: "m2 forces des équipes : fd: tour 2 hDef=6" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-8", quoi: "m2 forces des équipes : fd: tour 2 hDef=8" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-13", quoi: "m2 forces des équipes : fd: tour 2 hDef=13" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-18", quoi: "m2 forces des équipes : fd: tour 2 hDef=18" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-25", quoi: "m2 forces des équipes : fd: tour 2 hDef=25" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-35", quoi: "m2 forces des équipes : fd: tour 2 hDef=35" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-50", quoi: "m2 forces des équipes : fd: tour 2 hDef=50" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-100", quoi: "m2 forces des équipes : fd: tour 2 hDef=100" }),
  Object.freeze({ id: "m2-fd-tour-2-hdef-inf", quoi: "m2 forces des équipes : fd: tour 2 hDef=Infinity" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-0.5", quoi: "m2 forces des équipes : fd: tour 2 k0=0.5" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-1", quoi: "m2 forces des équipes : fd: tour 2 k0=1" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-2", quoi: "m2 forces des équipes : fd: tour 2 k0=2" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-4", quoi: "m2 forces des équipes : fd: tour 2 k0=4" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-8", quoi: "m2 forces des équipes : fd: tour 2 k0=8" }),
  Object.freeze({ id: "m2-fd-tour-2-k0-16", quoi: "m2 forces des équipes : fd: tour 2 k0=16" }),
  Object.freeze({ id: "m2-fd-tour-2-stat-buts", quoi: "m2 forces des équipes : fd: tour 2 stat=buts" }),
  Object.freeze({ id: "m2-fd-tour-2-fligue-1", quoi: "m2 forces des équipes : fd: tour 2 fLigue=1" }),
  Object.freeze({ id: "m2-fd-tour-2-fligue-0.5", quoi: "m2 forces des équipes : fd: tour 2 fLigue=0.5" }),
  Object.freeze({ id: "m2-fd-tour-2-fligue-0", quoi: "m2 forces des équipes : fd: tour 2 fLigue=0" }),
  Object.freeze({ id: "m2-fd-avantage-global-1.15", quoi: "m2 forces des équipes : fd: avantage global 1.15" }),
  Object.freeze({ id: "m2-fd-avantage-global-1.2", quoi: "m2 forces des équipes : fd: avantage global 1.2" }),
  Object.freeze({ id: "m2-fd-avantage-global-1.25", quoi: "m2 forces des équipes : fd: avantage global 1.25" }),
  Object.freeze({ id: "m2-fd-avantage-global-1.3", quoi: "m2 forces des équipes : fd: avantage global 1.3" }),
  Object.freeze({ id: "m2-fd-avantage-global-1.35", quoi: "m2 forces des équipes : fd: avantage global 1.35" }),
  Object.freeze({ id: "m2-fd-avantage-par-championnat-retenu", quoi: "m2 forces des équipes : fd: avantage par championnat (retenu)" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.14", quoi: "m2 forces des équipes : fd: rho stats -0.14" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.12", quoi: "m2 forces des équipes : fd: rho stats -0.12" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.1", quoi: "m2 forces des équipes : fd: rho stats -0.1" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.08", quoi: "m2 forces des équipes : fd: rho stats -0.08" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.06", quoi: "m2 forces des équipes : fd: rho stats -0.06" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.05", quoi: "m2 forces des équipes : fd: rho stats -0.05" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.04", quoi: "m2 forces des équipes : fd: rho stats -0.04" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.03", quoi: "m2 forces des équipes : fd: rho stats -0.03" }),
  Object.freeze({ id: "m2-fd-rho-stats-m0.02", quoi: "m2 forces des équipes : fd: rho stats -0.02" }),
  Object.freeze({ id: "m2-fd-rho-stats-0", quoi: "m2 forces des équipes : fd: rho stats 0" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-6", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=6" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-8", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=8" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-13", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=13" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-18", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=18" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-25", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=25" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-35", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=35" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-50", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=50" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-100", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=100" }),
  Object.freeze({ id: "m2-magasin-tour-1-hatt-inf", quoi: "m2 forces des équipes : magasin: tour 1 hAtt=Infinity" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-6", quoi: "m2 forces des équipes : magasin: tour 1 hDef=6" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-8", quoi: "m2 forces des équipes : magasin: tour 1 hDef=8" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-13", quoi: "m2 forces des équipes : magasin: tour 1 hDef=13" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-18", quoi: "m2 forces des équipes : magasin: tour 1 hDef=18" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-25", quoi: "m2 forces des équipes : magasin: tour 1 hDef=25" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-35", quoi: "m2 forces des équipes : magasin: tour 1 hDef=35" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-50", quoi: "m2 forces des équipes : magasin: tour 1 hDef=50" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-100", quoi: "m2 forces des équipes : magasin: tour 1 hDef=100" }),
  Object.freeze({ id: "m2-magasin-tour-1-hdef-inf", quoi: "m2 forces des équipes : magasin: tour 1 hDef=Infinity" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-0.5", quoi: "m2 forces des équipes : magasin: tour 1 k0=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-1", quoi: "m2 forces des équipes : magasin: tour 1 k0=1" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-2", quoi: "m2 forces des équipes : magasin: tour 1 k0=2" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-4", quoi: "m2 forces des équipes : magasin: tour 1 k0=4" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-8", quoi: "m2 forces des équipes : magasin: tour 1 k0=8" }),
  Object.freeze({ id: "m2-magasin-tour-1-k0-16", quoi: "m2 forces des équipes : magasin: tour 1 k0=16" }),
  Object.freeze({ id: "m2-magasin-tour-1-stat-xg", quoi: "m2 forces des équipes : magasin: tour 1 stat=xg" }),
  Object.freeze({ id: "m2-magasin-tour-1-stat-buts", quoi: "m2 forces des équipes : magasin: tour 1 stat=buts" }),
  Object.freeze({ id: "m2-magasin-tour-1-stat-mix", quoi: "m2 forces des équipes : magasin: tour 1 stat=mix" }),
  Object.freeze({ id: "m2-magasin-tour-1-fligue-1", quoi: "m2 forces des équipes : magasin: tour 1 fLigue=1" }),
  Object.freeze({ id: "m2-magasin-tour-1-fligue-0.5", quoi: "m2 forces des équipes : magasin: tour 1 fLigue=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-1-fligue-0", quoi: "m2 forces des équipes : magasin: tour 1 fLigue=0" }),
  Object.freeze({ id: "m2-magasin-tour-1-wxg-0.3", quoi: "m2 forces des équipes : magasin: tour 1 wXg=0.3" }),
  Object.freeze({ id: "m2-magasin-tour-1-wxg-0.5", quoi: "m2 forces des équipes : magasin: tour 1 wXg=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-1-wxg-0.7", quoi: "m2 forces des équipes : magasin: tour 1 wXg=0.7" }),
  Object.freeze({ id: "m2-magasin-tour-1-wxg-0.85", quoi: "m2 forces des équipes : magasin: tour 1 wXg=0.85" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-6", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=6" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-8", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=8" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-13", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=13" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-18", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=18" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-25", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=25" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-35", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=35" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-50", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=50" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-100", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=100" }),
  Object.freeze({ id: "m2-magasin-tour-2-hatt-inf", quoi: "m2 forces des équipes : magasin: tour 2 hAtt=Infinity" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-6", quoi: "m2 forces des équipes : magasin: tour 2 hDef=6" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-8", quoi: "m2 forces des équipes : magasin: tour 2 hDef=8" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-13", quoi: "m2 forces des équipes : magasin: tour 2 hDef=13" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-18", quoi: "m2 forces des équipes : magasin: tour 2 hDef=18" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-25", quoi: "m2 forces des équipes : magasin: tour 2 hDef=25" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-35", quoi: "m2 forces des équipes : magasin: tour 2 hDef=35" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-50", quoi: "m2 forces des équipes : magasin: tour 2 hDef=50" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-100", quoi: "m2 forces des équipes : magasin: tour 2 hDef=100" }),
  Object.freeze({ id: "m2-magasin-tour-2-hdef-inf", quoi: "m2 forces des équipes : magasin: tour 2 hDef=Infinity" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-0.5", quoi: "m2 forces des équipes : magasin: tour 2 k0=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-1", quoi: "m2 forces des équipes : magasin: tour 2 k0=1" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-2", quoi: "m2 forces des équipes : magasin: tour 2 k0=2" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-4", quoi: "m2 forces des équipes : magasin: tour 2 k0=4" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-8", quoi: "m2 forces des équipes : magasin: tour 2 k0=8" }),
  Object.freeze({ id: "m2-magasin-tour-2-k0-16", quoi: "m2 forces des équipes : magasin: tour 2 k0=16" }),
  Object.freeze({ id: "m2-magasin-tour-2-stat-xg", quoi: "m2 forces des équipes : magasin: tour 2 stat=xg" }),
  Object.freeze({ id: "m2-magasin-tour-2-stat-buts", quoi: "m2 forces des équipes : magasin: tour 2 stat=buts" }),
  Object.freeze({ id: "m2-magasin-tour-2-stat-mix", quoi: "m2 forces des équipes : magasin: tour 2 stat=mix" }),
  Object.freeze({ id: "m2-magasin-tour-2-fligue-1", quoi: "m2 forces des équipes : magasin: tour 2 fLigue=1" }),
  Object.freeze({ id: "m2-magasin-tour-2-fligue-0.5", quoi: "m2 forces des équipes : magasin: tour 2 fLigue=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-2-fligue-0", quoi: "m2 forces des équipes : magasin: tour 2 fLigue=0" }),
  Object.freeze({ id: "m2-magasin-tour-2-wxg-0.3", quoi: "m2 forces des équipes : magasin: tour 2 wXg=0.3" }),
  Object.freeze({ id: "m2-magasin-tour-2-wxg-0.5", quoi: "m2 forces des équipes : magasin: tour 2 wXg=0.5" }),
  Object.freeze({ id: "m2-magasin-tour-2-wxg-0.7", quoi: "m2 forces des équipes : magasin: tour 2 wXg=0.7" }),
  Object.freeze({ id: "m2-magasin-tour-2-wxg-0.85", quoi: "m2 forces des équipes : magasin: tour 2 wXg=0.85" }),
  Object.freeze({ id: "m2-magasin-avantage-global-1.15", quoi: "m2 forces des équipes : magasin: avantage global 1.15" }),
  Object.freeze({ id: "m2-magasin-avantage-global-1.2", quoi: "m2 forces des équipes : magasin: avantage global 1.2" }),
  Object.freeze({ id: "m2-magasin-avantage-global-1.25", quoi: "m2 forces des équipes : magasin: avantage global 1.25" }),
  Object.freeze({ id: "m2-magasin-avantage-global-1.3", quoi: "m2 forces des équipes : magasin: avantage global 1.3" }),
  Object.freeze({ id: "m2-magasin-avantage-global-1.35", quoi: "m2 forces des équipes : magasin: avantage global 1.35" }),
  Object.freeze({ id: "m2-magasin-avantage-par-championnat-retenu", quoi: "m2 forces des équipes : magasin: avantage par championnat (retenu)" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.14", quoi: "m2 forces des équipes : magasin: rho stats -0.14" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.12", quoi: "m2 forces des équipes : magasin: rho stats -0.12" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.1", quoi: "m2 forces des équipes : magasin: rho stats -0.1" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.08", quoi: "m2 forces des équipes : magasin: rho stats -0.08" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.06", quoi: "m2 forces des équipes : magasin: rho stats -0.06" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.05", quoi: "m2 forces des équipes : magasin: rho stats -0.05" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.04", quoi: "m2 forces des équipes : magasin: rho stats -0.04" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.03", quoi: "m2 forces des équipes : magasin: rho stats -0.03" }),
  Object.freeze({ id: "m2-magasin-rho-stats-m0.02", quoi: "m2 forces des équipes : magasin: rho stats -0.02" }),
  Object.freeze({ id: "m2-magasin-rho-stats-0", quoi: "m2 forces des équipes : magasin: rho stats 0" }),
  Object.freeze({ id: "m2-magasin-indice-de-force-de-l-etape-29-comme-forces", quoi: "m2 forces des équipes : magasin: indice de force de l’étape 29 comme forces" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0", quoi: "m3 mélange : fd 1N2 seul w=0" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.05", quoi: "m3 mélange : fd 1N2 seul w=0.05" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.1", quoi: "m3 mélange : fd 1N2 seul w=0.1" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.15", quoi: "m3 mélange : fd 1N2 seul w=0.15" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.2", quoi: "m3 mélange : fd 1N2 seul w=0.2" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.25", quoi: "m3 mélange : fd 1N2 seul w=0.25" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.3", quoi: "m3 mélange : fd 1N2 seul w=0.3" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.35", quoi: "m3 mélange : fd 1N2 seul w=0.35" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.4", quoi: "m3 mélange : fd 1N2 seul w=0.4" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.45", quoi: "m3 mélange : fd 1N2 seul w=0.45" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.5", quoi: "m3 mélange : fd 1N2 seul w=0.5" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.55", quoi: "m3 mélange : fd 1N2 seul w=0.55" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.6", quoi: "m3 mélange : fd 1N2 seul w=0.6" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.65", quoi: "m3 mélange : fd 1N2 seul w=0.65" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.7", quoi: "m3 mélange : fd 1N2 seul w=0.7" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.75", quoi: "m3 mélange : fd 1N2 seul w=0.75" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.8", quoi: "m3 mélange : fd 1N2 seul w=0.8" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.85", quoi: "m3 mélange : fd 1N2 seul w=0.85" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.9", quoi: "m3 mélange : fd 1N2 seul w=0.9" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-0.95", quoi: "m3 mélange : fd 1N2 seul w=0.95" }),
  Object.freeze({ id: "m3-fd-1n2-seul-w-1", quoi: "m3 mélange : fd 1N2 seul w=1" }),
  Object.freeze({ id: "m3-fd-1n2-seul-grille-wt-ws-126-couples", quoi: "m3 mélange : fd 1N2 seul grille (wT, wS) 126 couples" }),
  Object.freeze({ id: "m3-fd-1n2-seul-poids-par-championnat-k-0", quoi: "m3 mélange : fd 1N2 seul poids par championnat k=0" }),
  Object.freeze({ id: "m3-fd-1n2-seul-poids-par-championnat-k-100", quoi: "m3 mélange : fd 1N2 seul poids par championnat k=100" }),
  Object.freeze({ id: "m3-fd-1n2-seul-poids-par-championnat-k-300", quoi: "m3 mélange : fd 1N2 seul poids par championnat k=300" }),
  Object.freeze({ id: "m3-fd-1n2-seul-poids-par-championnat-k-1000", quoi: "m3 mélange : fd 1N2 seul poids par championnat k=1000" }),
  Object.freeze({ id: "m3-fd-1n2-seul-poids-par-championnat-k-3000", quoi: "m3 mélange : fd 1N2 seul poids par championnat k=3000" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0", quoi: "m3 mélange : fd 1N2+plus/moins w=0" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.05", quoi: "m3 mélange : fd 1N2+plus/moins w=0.05" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.1", quoi: "m3 mélange : fd 1N2+plus/moins w=0.1" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.15", quoi: "m3 mélange : fd 1N2+plus/moins w=0.15" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.2", quoi: "m3 mélange : fd 1N2+plus/moins w=0.2" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.25", quoi: "m3 mélange : fd 1N2+plus/moins w=0.25" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.3", quoi: "m3 mélange : fd 1N2+plus/moins w=0.3" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.35", quoi: "m3 mélange : fd 1N2+plus/moins w=0.35" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.4", quoi: "m3 mélange : fd 1N2+plus/moins w=0.4" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.45", quoi: "m3 mélange : fd 1N2+plus/moins w=0.45" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.5", quoi: "m3 mélange : fd 1N2+plus/moins w=0.5" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.55", quoi: "m3 mélange : fd 1N2+plus/moins w=0.55" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.6", quoi: "m3 mélange : fd 1N2+plus/moins w=0.6" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.65", quoi: "m3 mélange : fd 1N2+plus/moins w=0.65" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.7", quoi: "m3 mélange : fd 1N2+plus/moins w=0.7" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.75", quoi: "m3 mélange : fd 1N2+plus/moins w=0.75" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.8", quoi: "m3 mélange : fd 1N2+plus/moins w=0.8" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.85", quoi: "m3 mélange : fd 1N2+plus/moins w=0.85" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.9", quoi: "m3 mélange : fd 1N2+plus/moins w=0.9" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-0.95", quoi: "m3 mélange : fd 1N2+plus/moins w=0.95" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-w-1", quoi: "m3 mélange : fd 1N2+plus/moins w=1" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-grille-wt-ws-126-couples", quoi: "m3 mélange : fd 1N2+plus/moins grille (wT, wS) 126 couples" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-poids-par-championnat-k-0", quoi: "m3 mélange : fd 1N2+plus/moins poids par championnat k=0" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-poids-par-championnat-k-100", quoi: "m3 mélange : fd 1N2+plus/moins poids par championnat k=100" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-poids-par-championnat-k-300", quoi: "m3 mélange : fd 1N2+plus/moins poids par championnat k=300" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-poids-par-championnat-k-1000", quoi: "m3 mélange : fd 1N2+plus/moins poids par championnat k=1000" }),
  Object.freeze({ id: "m3-fd-1n2-et-plus-moins-poids-par-championnat-k-3000", quoi: "m3 mélange : fd 1N2+plus/moins poids par championnat k=3000" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.08", quoi: "m3 mélange : fd rho du mélange -0.08" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.06", quoi: "m3 mélange : fd rho du mélange -0.06" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.05", quoi: "m3 mélange : fd rho du mélange -0.05" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.04", quoi: "m3 mélange : fd rho du mélange -0.04" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.03", quoi: "m3 mélange : fd rho du mélange -0.03" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-m0.02", quoi: "m3 mélange : fd rho du mélange -0.02" }),
  Object.freeze({ id: "m3-fd-rho-du-melange-0", quoi: "m3 mélange : fd rho du mélange 0" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0", quoi: "m3 mélange : magasin 1N2 seul w=0" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.05", quoi: "m3 mélange : magasin 1N2 seul w=0.05" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.1", quoi: "m3 mélange : magasin 1N2 seul w=0.1" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.15", quoi: "m3 mélange : magasin 1N2 seul w=0.15" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.2", quoi: "m3 mélange : magasin 1N2 seul w=0.2" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.25", quoi: "m3 mélange : magasin 1N2 seul w=0.25" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.3", quoi: "m3 mélange : magasin 1N2 seul w=0.3" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.35", quoi: "m3 mélange : magasin 1N2 seul w=0.35" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.4", quoi: "m3 mélange : magasin 1N2 seul w=0.4" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.45", quoi: "m3 mélange : magasin 1N2 seul w=0.45" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.5", quoi: "m3 mélange : magasin 1N2 seul w=0.5" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.55", quoi: "m3 mélange : magasin 1N2 seul w=0.55" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.6", quoi: "m3 mélange : magasin 1N2 seul w=0.6" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.65", quoi: "m3 mélange : magasin 1N2 seul w=0.65" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.7", quoi: "m3 mélange : magasin 1N2 seul w=0.7" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.75", quoi: "m3 mélange : magasin 1N2 seul w=0.75" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.8", quoi: "m3 mélange : magasin 1N2 seul w=0.8" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.85", quoi: "m3 mélange : magasin 1N2 seul w=0.85" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.9", quoi: "m3 mélange : magasin 1N2 seul w=0.9" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-0.95", quoi: "m3 mélange : magasin 1N2 seul w=0.95" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-w-1", quoi: "m3 mélange : magasin 1N2 seul w=1" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-grille-wt-ws-126-couples", quoi: "m3 mélange : magasin 1N2 seul grille (wT, wS) 126 couples" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-poids-par-championnat-k-0", quoi: "m3 mélange : magasin 1N2 seul poids par championnat k=0" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-poids-par-championnat-k-100", quoi: "m3 mélange : magasin 1N2 seul poids par championnat k=100" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-poids-par-championnat-k-300", quoi: "m3 mélange : magasin 1N2 seul poids par championnat k=300" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-poids-par-championnat-k-1000", quoi: "m3 mélange : magasin 1N2 seul poids par championnat k=1000" }),
  Object.freeze({ id: "m3-magasin-1n2-seul-poids-par-championnat-k-3000", quoi: "m3 mélange : magasin 1N2 seul poids par championnat k=3000" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0", quoi: "m3 mélange : magasin 1N2+plus/moins w=0" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.05", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.05" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.1", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.1" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.15", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.15" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.2", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.2" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.25", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.25" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.3", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.3" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.35", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.35" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.4", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.4" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.45", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.45" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.5", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.5" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.55", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.55" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.6", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.6" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.65", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.65" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.7", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.7" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.75", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.75" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.8", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.8" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.85", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.85" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.9", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.9" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-0.95", quoi: "m3 mélange : magasin 1N2+plus/moins w=0.95" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-w-1", quoi: "m3 mélange : magasin 1N2+plus/moins w=1" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-grille-wt-ws-126-couples", quoi: "m3 mélange : magasin 1N2+plus/moins grille (wT, wS) 126 couples" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-poids-par-championnat-k-0", quoi: "m3 mélange : magasin 1N2+plus/moins poids par championnat k=0" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-poids-par-championnat-k-100", quoi: "m3 mélange : magasin 1N2+plus/moins poids par championnat k=100" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-poids-par-championnat-k-300", quoi: "m3 mélange : magasin 1N2+plus/moins poids par championnat k=300" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-poids-par-championnat-k-1000", quoi: "m3 mélange : magasin 1N2+plus/moins poids par championnat k=1000" }),
  Object.freeze({ id: "m3-magasin-1n2-et-plus-moins-poids-par-championnat-k-3000", quoi: "m3 mélange : magasin 1N2+plus/moins poids par championnat k=3000" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.08", quoi: "m3 mélange : magasin rho du mélange -0.08" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.06", quoi: "m3 mélange : magasin rho du mélange -0.06" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.05", quoi: "m3 mélange : magasin rho du mélange -0.05" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.04", quoi: "m3 mélange : magasin rho du mélange -0.04" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.03", quoi: "m3 mélange : magasin rho du mélange -0.03" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-m0.02", quoi: "m3 mélange : magasin rho du mélange -0.02" }),
  Object.freeze({ id: "m3-magasin-rho-du-melange-0", quoi: "m3 mélange : magasin rho du mélange 0" }),
  Object.freeze({ id: "m4-livres-moyenne-fd", quoi: "m4 plus/moins 2,5 : la moyenne football-data (pré-clôture), retenue" }),
  Object.freeze({ id: "m4-livres-pinnacle-fd", quoi: "m4 plus/moins 2,5 : Pinnacle (football-data, pré-clôture)" }),
  Object.freeze({ id: "m4-livres-espn", quoi: "m4 plus/moins 2,5 : la moyenne des livres ESPN admis" }),
  Object.freeze({ id: "m7-demarrage-n0-8", quoi: "m7 démarrage à froid : le total statistique rapproché de celui du championnat tant que le club le moins connu a moins de 8 matchs (retenu)" })
]);

/**
 * Les fenêtres REGARDÉES par l'étape 32 (le contexte du match, lot 1a du 29/10/2026 ; data/contexte/), portée « contexte »
 * (déclarée DANS chaque fenêtre : verifierLancements l'exige, et le juge de l'essai de l'étape 27 n'en voit rien) : le
 * magasin 2023-07-01 → 2026-09-23 où le banc (partie B, UN seul regard) apprendra sur un pli et jugera l'autre, puis
 * l'inverse — et où la conception et la critique ont compté les parts et simulé la puissance sans lire un seul résultat
 * (scores simulés), déclaré quand même ; la mise en route 2023-01-01 → 2023-06-30 (états accumulés, rien d'appris ni de
 * jugé). Jamais P5 (depuis le 24/09/2026) : c'est la preuve après lancement. Une candidate du MOTEUR qui lirait un jour le
 * contexte (lot 2) recopierait ces fenêtres avec `pour: ['moteur']`.
 */
export const VUES_DE_L_ETAPE_32 = Object.freeze([
  Object.freeze({
    de: '2023-07-01',
    a: '2026-09-23',
    quoi: 'Étape 32 : banc du contexte, un seul regard — coefficients appris sur 2023-07 → 2025-06 et jugés sur 2025-07 → 2026-09-23, puis l’inverse (deux plis), perte du score exact ; avant lui, parts et puissances comptées sans aucun résultat (scores simulés).',
    pour: Object.freeze(['contexte'])
  }),
  Object.freeze({
    de: '2023-01-01',
    a: '2023-06-30',
    quoi: 'Étape 32 : mise en route du banc du contexte (repos, entraîneurs et arbitres accumulés ; rien d’appris ni de jugé).',
    pour: Object.freeze(['contexte'])
  })
]);

/**
 * Les VARIANTES de l'étape 32, déclarées AVANT le regard unique du banc (décision de l'orchestrateur du 29/10/2026,
 * recommandation 3 de la critique : `repos-ecart` et `arbitre-penalties` retirés, la classe « long » du repos n'est plus
 * mesurée) : la fiche retenue (contexte-v1, en tête : elle ne lit aucun résultat, comptée par prudence comme style-v1),
 * les sept facteurs mesurés et le faux facteur de contrôle. Le banc compte K = VARIANTES_DE_L_ETAPE_32.length et refuse
 * toute variante absente d'ici. Une variante corrigée après le regard = un identifiant de plus, déclaré avant son passage.
 */
export const VARIANTES_DE_L_ETAPE_32 = Object.freeze([
  Object.freeze({ id: 'contexte-v1', quoi: 'Fiche de contexte retenue (version 1) : repos en heures entre deux coups d’envoi, enchaînement à moins de 96 h (le tour suivant d’une même coupe ignoré), distance entre les stades habituels, altitude, pelouse, nouvel entraîneur, arbitre recalculé au jour J ; ne lit aucun résultat.' }),
  Object.freeze({ id: 'repos-court', quoi: 'Repos court (moins de 96 h entre les deux coups d’envoi) : les buts du club × e^a, ceux de son adversaire × e^b (2 coefficients ; « normal » et « long » en référence, « inconnu » sans effet).' }),
  Object.freeze({ id: 'enchainement-serre', quoi: 'Enchaînement serré (le club rejoue moins de 96 h après le coup d’envoi) : ses buts × e^a, ceux de son adversaire × e^b (2 coefficients).' }),
  Object.freeze({ id: 'deplacement-distance', quoi: 'Distance entre les stades habituels, x = ln(1 + km/100) centré sur l’apprentissage : buts du visiteur × e^(a·x), du club qui reçoit × e^(b·x) (2 coefficients) ; un match joué ailleurs est écarté.' }),
  Object.freeze({ id: 'deplacement-altitude', quoi: 'Altitude : stade à 2 000 m ou plus, visiteur sans altitude listée ou 1 500 m plus bas — buts du club qui reçoit × e^a, du visiteur × e^b (2 coefficients).' }),
  Object.freeze({ id: 'pelouse-synthetique', quoi: 'Pelouse synthétique : buts du club qui reçoit × e^a, du visiteur × e^b (2 coefficients) ; les clubs dont la pelouse a pu changer (la base, l’export du 22/09 et venues.json en désaccord) écartés.' }),
  Object.freeze({ id: 'arbitre-buts', quoi: 'Arbitre « à buts » : indice au jour J face à la base statistique (somme des λS + μS recalés de ses matchs d’avant J, 10 matchs moyens ajoutés) — les buts des deux équipes × e^(β·indice) (1 coefficient).' }),
  Object.freeze({ id: 'entraineur-nouveau', quoi: 'Nouvel entraîneur (5 matchs au plus, un autre avant lui, pas de retour sous 365 jours) : ses buts × e^a, ceux de son adversaire × e^b (2 coefficients).' }),
  Object.freeze({ id: 'placebo', quoi: 'Faux facteur de contrôle : la forme de repos-court sur une classe tirée pour chaque club (FNV-1a de « clé du match:camp », mod 100, de 0 à 14 : 15 % des clubs) ; doit sortir « pas prouvé ».' })
]);

/**
 * Les lancements déclarés par les étapes, dans l'ordre où elles sont faites. À la FIN d'une étape qui
 * touche aux chiffres : ajouter son entrée ici (version en service, ce qu'elle change, TOUTES les
 * variantes dont on a regardé le résultat pendant la construction, les fenêtres de données regardées).
 *   etape      l'identifiant du plan, tel qu'il s'écrit dans plan.js (« 27 ») ;
 *   version    un identifiant court et stable (« score-marche-v1 ») : c'est lui que porteront les
 *              pronostics (étape 25) ;
 *   quoi       une phrase simple ;
 *   le         null = la date sera celle du premier démarrage de l'appli avec ce code ; sinon
 *              AAAA-MM-JJ, seulement pour un lancement qui a eu lieu avant que le registre existe, ou
 *              dont la déclaration a été retenue après coup (29 : en service depuis le 14/10) ;
 *   variantes  [{ id, quoi }] — la version retenue en fait partie (verifierLancements l'exige) : est
 *              une variante toute version des chiffres dont on a REGARDÉ le résultat face à des
 *              matchs joués (au banc, à blanc ou dans l'appli), y compris celle qu'on garde ; pas une
 *              correction de bug qui ne change aucun chiffre, ni le même réglage rejoué sur plus de
 *              matchs, ni une variante écrite et jamais évaluée ;
 *   vues       [{ de, a, quoi, pour }] — fenêtres regardées pendant la construction (le banc), en plus de
 *              DONNEES_VUES ; `pour` : les PORTÉES de ce qu'elles ont réglé (au moins une, verifierLancements
 *              l'exige) — 'moteur' pour un chiffre du moteur, sinon 'statistiques', 'marche', 'indice'.
 */
export const LANCEMENTS = Object.freeze([
  // Étape 29 (14/10/2026) : l'indice de force, en service depuis le 14/10 ; il ne règle aucun chiffre du moteur
  // (portée 'indice'). Ses vues : celles de l'étape 18, dont il lit les demi-vies, puis les siennes.
  Object.freeze({
    etape: '29',
    version: 'indice-v1',
    quoi: 'Indice de force des équipes : note et statistiques corrigées de la force des adversaires, pondérées dans le temps (demi-vies de l’étape 18), au total, à domicile et à l’extérieur ; proposé aux modèles, jamais lu par le moteur.',
    le: '2026-10-14',
    variantes: VARIANTES_INDICE,
    vues: Object.freeze([...VUES_DE_L_ETAPE_18, ...VUES_DE_L_ETAPE_29].map((f) => Object.freeze({ ...f, pour: Object.freeze(['indice']) })))
  }),
  // Étape 30 (22/10/2026) : les fiches des joueurs et la force du onze ; elles ne règlent aucun chiffre du moteur
  // (portée 'joueurs' : la règle de Pierre — les compositions ne servent qu'à l'écran et au commentaire). Datée du
  // premier démarrage de l'appli avec ce code ; ses 19 variantes et ses vues (le magasin 2023-07 → 2026-09-23, la
  // partie joueurs de l'étape 18).
  Object.freeze({
    etape: '30',
    version: 'fiches-v1',
    quoi: 'Fiches des joueurs par poste (par 90 min, pondérées dans le temps, corrigées des adversaires et du championnat, ramenées vers la moyenne du poste) et force du onze face à l’équipe habituelle ; affichées et mesurées à blanc, jamais lues par le moteur.',
    le: null,
    variantes: VARIANTES_DE_L_ETAPE_30,
    vues: Object.freeze(VUES_DE_L_ETAPE_30.map((f) => Object.freeze({ ...f, pour: Object.freeze(['joueurs']) })))
  }),
  // Étape 37 (22/10/2026) : les styles de jeu des équipes et des entraîneurs ; ils ne règlent aucun chiffre du moteur
  // (portée 'style' : explication seulement, sauf un duel qui passerait le seuil sévère — et même lui reste affiché,
  // jamais calculé). Datée du premier démarrage de l'appli avec ce code ; ses 53 variantes et ses vues.
  Object.freeze({
    etape: '37',
    version: 'style-v1',
    quoi: 'Styles de jeu des équipes et des entraîneurs (possession, jeu direct, contre-attaque, coups de pied arrêtés) lus sur leurs 20 derniers matchs de championnat ; duels de styles jugés au banc face à la clôture avec un seuil sévère ; affichés, jamais lus par le moteur.',
    le: null,
    variantes: VARIANTES_DE_L_ETAPE_37,
    vues: Object.freeze(VUES_DE_L_ETAPE_37.map((f) => Object.freeze({ ...f, pour: Object.freeze(['style']) })))
  }),
  // Étape 28 (27/10/2026) : la simulation complète — déroulé d'un match, combinés, fins de saison et enjeu ; elle ne
  // règle aucun chiffre du moteur (portée 'simulation'). Datée du premier démarrage de l'appli avec ce code ; ses 27
  // variantes et ses vues (le magasin 2023-07 → 2026-09-23 ; P2, la fenêtre de la porte 1, déclarée le 27/10 avant le
  // regard). Écrite AVANT la porte 1 sur P2 (aucun résultat de P2 lu).
  Object.freeze({
    etape: '28',
    version: 'simulation-v1',
    quoi: 'Simulation complète : le déroulé de chaque match des 48 prochaines heures (10 000 matchs par créneaux d’une minute, effets du score et cartons rouges, recalés sur la grille du modèle de buts), le prix juste des combinés d’un même match, les fins de saison des championnats et l’enjeu de chaque rencontre ; calculée chaque nuit à blanc, montrée d’un clic, jamais lue par le moteur.',
    le: null,
    variantes: VARIANTES_DE_L_ETAPE_28,
    vues: Object.freeze(VUES_DE_L_ETAPE_28.map((f) => Object.freeze({ ...f, pour: Object.freeze(['simulation']) })))
  }),
  // Étape 32 (lot 1a, 29/10/2026) : le contexte du match — la fiche de contexte de chaque match à venir, calculée chaque
  // nuit, et l'archive d'avant-match ; elle ne règle aucun chiffre du moteur (portée 'contexte'). Datée du premier
  // démarrage de l'appli avec ce code (la preuve après lancement jugera les matchs d'après, fiche gelée avant leur coup
  // d'envoi) ; ses variantes et ses vues déclarées AVANT le regard unique du banc (partie B).
  Object.freeze({
    etape: '32',
    version: 'contexte-v1',
    quoi: 'Contexte du match : pour chaque match des 14 prochains jours, une fiche calculée chaque nuit depuis le magasin FotMob (repos et enchaînement des deux clubs, déplacement, altitude, pelouse, entraîneur, arbitre), gardée telle qu’elle était avant le coup d’envoi avec la météo prévue par FotMob ; explication seulement, jamais lue par le moteur.',
    le: null,
    variantes: VARIANTES_DE_L_ETAPE_32,
    vues: VUES_DE_L_ETAPE_32
  })
]);

/** Une liste de lancements qui ne tient pas debout : le serveur le dit au démarrage, le test refuse. */
export class LancementsInvalides extends Error {}

const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** Un jour AAAA-MM-JJ qui existe (« 2026-02-30 » n'existe pas). */
export const jourValide = (j) => typeof j === 'string' && FORME_JOUR.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;

const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Vérifie une liste de lancements : étape connue du plan (écrite comme dans plan.js), version non vide
 * et unique par étape, phrase non vide, `le` null ou jour valide, variantes avec des `id` uniques et la
 * version retenue parmi elles, fenêtres valides avec `de ≤ a`. Rend true ; lève LancementsInvalides
 * avec la première faute trouvée.
 */
export function verifierLancements(liste = LANCEMENTS) {
  if (!Array.isArray(liste)) throw new LancementsInvalides('Les lancements doivent être une liste.');
  const versions = new Set();
  liste.forEach((d, i) => {
    const ou = `Lancement n° ${i + 1}`;
    if (!objetSimple(d)) throw new LancementsInvalides(`${ou} : un objet est attendu.`);
    const etape = normaliserIdEtape(d.etape);
    if (!etape || etape !== d.etape) throw new LancementsInvalides(`${ou} : étape « ${String(d.etape)} » inconnue du plan (plan.js), ou mal écrite.`);
    if (!texte(d.version)) throw new LancementsInvalides(`${ou} (étape ${etape}) : la version est vide.`);
    const cle = `${etape}|${d.version}`;
    if (versions.has(cle)) throw new LancementsInvalides(`${ou} : la version « ${d.version} » est déclarée deux fois pour l’étape ${etape}.`);
    versions.add(cle);
    if (!texte(d.quoi)) throw new LancementsInvalides(`${ou} (${d.version}) : la phrase « quoi » est vide.`);
    if (d.le !== null && d.le !== undefined && !jourValide(d.le)) throw new LancementsInvalides(`${ou} (${d.version}) : « le » doit être null ou un jour AAAA-MM-JJ (${String(d.le)}).`);
    if (!Array.isArray(d.variantes) || d.variantes.length === 0) {
      throw new LancementsInvalides(`${ou} (${d.version}) : au moins une variante est attendue — la version retenue en fait partie.`);
    }
    const ids = new Set();
    for (const v of d.variantes) {
      if (!objetSimple(v) || !texte(v.id)) throw new LancementsInvalides(`${ou} (${d.version}) : une variante sans identifiant.`);
      if (ids.has(v.id)) throw new LancementsInvalides(`${ou} (${d.version}) : la variante « ${v.id} » est déclarée deux fois.`);
      if (v.quoi !== undefined && typeof v.quoi !== 'string') throw new LancementsInvalides(`${ou} (${d.version}) : la phrase de la variante « ${v.id} » n’est pas un texte.`);
      ids.add(v.id);
    }
    if (!ids.has(d.version)) {
      throw new LancementsInvalides(`${ou} : la version retenue « ${d.version} » doit faire partie de ses variantes (elle a été évaluée elle aussi).`);
    }
    if (d.vues !== undefined && !Array.isArray(d.vues)) throw new LancementsInvalides(`${ou} (${d.version}) : « vues » doit être une liste.`);
    for (const f of d.vues ?? []) {
      if (!objetSimple(f) || !jourValide(f.de) || !jourValide(f.a)) throw new LancementsInvalides(`${ou} (${d.version}) : une fenêtre vue sans jours AAAA-MM-JJ valides.`);
      if (f.de > f.a) throw new LancementsInvalides(`${ou} (${d.version}) : une fenêtre vue commence après sa fin (${f.de} > ${f.a}).`);
      // Correction du 19/10 : chaque fenêtre dit ce qu'elle a réglé — sans portée, on ne sait pas qui l'a « déjà vue ».
      if (!Array.isArray(f.pour) || f.pour.length === 0) throw new LancementsInvalides(`${ou} (${d.version}) : la fenêtre ${f.de} → ${f.a} ne dit pas ce qu’elle a réglé (« pour » : ${PORTEES.join(', ')}).`);
      for (const p of f.pour) if (!PORTEES.includes(p)) throw new LancementsInvalides(`${ou} (${d.version}) : portée « ${String(p)} » inconnue (${PORTEES.join(', ')}).`);
      if (new Set(f.pour).size !== f.pour.length) throw new LancementsInvalides(`${ou} (${d.version}) : une portée est écrite deux fois dans la fenêtre ${f.de} → ${f.a}.`);
    }
  });
  return true;
}
