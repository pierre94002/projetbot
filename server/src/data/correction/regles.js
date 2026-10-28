/**
 * regles.js — LES RÈGLES ÉCRITES D'AVANCE de la boucle de correction (étape 26 du plan, 27/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard ; des constantes et quelques fonctions sur elles. Tout ce qui
 * décide « malchance ou vrai défaut » et « quel réglage essayer » est écrit ICI, d'avance, une fois pour toutes —
 * jamais choisi après avoir vu les chiffres d'un mois.
 *
 * LE TRI DU MOIS (data/correction/tri.js) regarde 22 CASES = 11 familles de marchés × 2 mesures, sur les
 * pronostics gelés de la version du moteur en service (et de ses sœurs aux mêmes probabilités) :
 *   - NIVEAU : l'issue de RÉFÉRENCE de la famille (« plus de » pour un plus/moins, « oui » pour les deux équipes
 *     marquent, la victoire de l'équipe qui reçoit pour le 1N2 ; pour « Résultat + total buts », les trois issues
 *     « plus de » ensemble) arrive-t-elle aussi souvent qu'annoncé ? (« le moteur voit trop de buts ») ;
 *   - CONFIANCE : l'issue LA PLUS PROBABLE de la distribution gelée (le favori, jamais le choix gelé du moteur)
 *     arrive-t-elle aussi souvent qu'annoncé ? (« le moteur est trop sûr de lui »).
 *   Pour le 1N2, le niveau ne regarde donc que la victoire à domicile et la confiance que le favori (pas « toutes
 *   les issues ») : un défaut sur le seul match nul n'y paraît qu'à moitié — le détail par régime (tri.js) le
 *   montre à part, sans le juger.
 * Une case est un « VRAI DÉFAUT » seulement si, sur la fenêtre de ses 2 ou 3 derniers mois comptés : le juge de
 * l'étape 16 (bench/guard.js, comparer, TEL QUEL) dit l'écart au-delà du hasard en comptant TOUS les regards
 * d'une année (22 cases × 12 mois = 264 : z = 3,733) ; l'écart fait au moins 2 points ; les deux derniers mois
 * vont dans le même sens. Sinon : malchance, petit écart, à surveiller, trop tôt, trop peu, en essai.
 *
 * MOIS PARTIELS (décision de l'orchestrateur, 27/10, constat 7 de la critique) : un mois où la version en
 * service a changé compte quand même, avec les SEULES lignes de la version en service à la fin du mois (et de
 * ses sœurs), s'il en a au moins 200 matchs pour la case ; sinon il est dit « mois de changement de version » et
 * coupe la fenêtre. Les mois d'une autre version ne comptent jamais dans la fenêtre.
 *
 * CONFIANCE D'ABORD (constat 6) : un moteur trop sûr de lui déplace AUSSI le niveau (mesuré : jusqu'à +2,6 points
 * sur « les deux équipes marquent » avec un bruit de 30 % sur les buts attendus). Quand la confiance d'une famille
 * de buts est un vrai défaut « trop sûr », le mois ne propose QUE le réglage de la confiance ; le niveau des
 * familles de buts est dit « à revoir après la correction de la confiance ».
 *
 * LES RÉGLAGES QU'ON PEUT PROPOSER (décision 5) : seulement des sous-clés du modèle de buts unique de l'étape 27
 * (`modeleDeButs`) ; `defaultCorrelation` et `homeAdvantage` sont RETIRÉS (l'essai ne juge la porte des familles
 * et la sûreté que pour une candidate qui porte `modeleDeButs`). Sans levier : « demande du code (plus tard) ».
 * Le recalage automatique de 2 points du cahier n'existe pas et n'est pas écrit : rien ne change jamais un chiffre
 * du moteur tout seul.
 * -----------------------------------------------------------------------
 */

const gel = (x) => Object.freeze(x);

// ============================================================ les familles et les mesures

/** Une famille : son identifiant (celui du marché, comme la calibration), son nom, ses lignes par match, son issue de référence. */
const famille = (id, libelle, lignesParMatch, canonique, { buts = false } = {}) => gel({ id, libelle, lignesParMatch, canonique: gel(canonique), buts });
const PLUS = (quoi) => ({ cle: 'over', dit: `plus de ${quoi}` });

/**
 * Les 11 familles, dans l'ordre de l'écran de la calibration (calibration.js, MARCHES : mêmes identifiants, mêmes
 * noms — testé). `buts` : les quatre familles du modèle de buts unique (étape 27).
 */
export const FAMILLES = gel([
  famille('result', 'Résultat (1N2)', 1, { cle: 'home', dit: 'victoire de l’équipe qui reçoit' }),
  famille('totalGoals', 'Total buts', 1, PLUS('buts que la ligne'), { buts: true }),
  famille('bothTeamsScore', 'Les 2 équipes marquent', 1, { cle: 'yes', dit: 'les deux équipes marquent' }, { buts: true }),
  famille('teamGoals', 'Buts d’une équipe', 2, PLUS('buts que la ligne pour l’équipe'), { buts: true }),
  famille('resultAndTotal', 'Résultat + total buts', 1, { cle: 'plus', dit: 'plus de buts que la ligne (avec le résultat)' }, { buts: true }),
  famille('totalCorners', 'Corners du match', 1, PLUS('corners que la ligne')),
  famille('teamCorners', 'Corners d’une équipe', 2, PLUS('corners que la ligne pour l’équipe')),
  famille('totalShots', 'Tirs du match', 1, PLUS('tirs que la ligne')),
  famille('teamShots', 'Tirs d’une équipe', 2, PLUS('tirs que la ligne pour l’équipe')),
  famille('totalShotsOnTarget', 'Tirs cadrés du match', 1, PLUS('tirs cadrés que la ligne')),
  famille('teamShotsOnTarget', 'Tirs cadrés d’une équipe', 2, PLUS('tirs cadrés que la ligne pour l’équipe'))
]);
const PAR_ID = new Map(FAMILLES.map((f) => [f.id, f]));
/** La famille d'un identifiant de marché, ou null. */
export const familleDe = (id) => PAR_ID.get(id) ?? null;
/** Les quatre familles du modèle de buts unique (étape 27). */
export const FAMILLES_DE_BUTS = gel(FAMILLES.filter((f) => f.buts).map((f) => f.id));
export const estDeButs = (id) => FAMILLES_DE_BUTS.includes(id);

/**
 * L'ordre FIXE des issues de chaque forme de distribution (markets.js, distributionDuMarche) : il départage deux
 * issues également probables pour la confiance (la première gagne), et dit quelles clés une distribution doit avoir.
 */
export const ISSUES_DE_LA_FAMILLE = gel({
  result: gel(['home', 'draw', 'away']),
  bothTeamsScore: gel(['yes', 'no']),
  resultAndTotal: gel(['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder']),
  totalGoals: gel(['over', 'under']),
  teamGoals: gel(['over', 'under']),
  totalCorners: gel(['over', 'under']),
  teamCorners: gel(['over', 'under']),
  totalShots: gel(['over', 'under']),
  teamShots: gel(['over', 'under']),
  totalShotsOnTarget: gel(['over', 'under']),
  teamShotsOnTarget: gel(['over', 'under'])
});

/** Les deux mesures, en mots simples. */
export const MESURES = gel([
  gel({ id: 'niveau', libelle: 'niveau', question: 'l’issue de référence arrive-t-elle aussi souvent qu’annoncé ?' }),
  gel({ id: 'confiance', libelle: 'confiance', question: 'l’issue la plus probable arrive-t-elle aussi souvent qu’annoncé ?' })
]);

/** Les 22 cases du tri, toujours les mêmes, dans cet ordre : « famille|mesure ». */
export const CASES_DU_TRI = gel(FAMILLES.flatMap((f) => MESURES.map((m) => `${f.id}|${m.id}`)));
export const lireLaCase = (cas) => {
  const [familleId, mesure] = String(cas).split('|');
  return { famille: familleId, mesure };
};

// ============================================================ le juge du tri

/** Les regards d'une année : chaque case jugée une fois par mois. C'est le m de la correction de Bonferroni du juge. */
export const REGARDS_PAR_AN = CASES_DU_TRI.length * 12;
/** L'écart minimum utile pour un pari (l'avantage minimum d'un pari est de 2 %, engineConfig.js) : en dessous, « petit écart ». */
export const SEUIL_D_AMPLEUR = 0.02;
/** La fenêtre : les 3 derniers mois comptés au plus, 2 au moins (un seul : « trop tôt »). */
export const MOIS_DE_LA_FENETRE = 3;
export const MOIS_MIN_DE_LA_FENETRE = 2;
/** Le juge de l'étape 16, tel quel : ses seuils par défaut (200 matchs, 5 %, 1 000 tirages) ; une graine fixe (un tri se rejoue au bit près). */
export const JUGE_DU_TRI = gel({ minBlocs: 200, alpha: 0.05, tirages: 1000, graine: 26 });
/** Un mois compte pour une case avec au moins autant de matchs (le minimum du juge). */
export const MATCHS_MIN_PAR_MOIS = JUGE_DU_TRI.minBlocs;
/** Les distributions complètes existent depuis le 07/10/2026 : le premier mois trié est octobre 2026. */
export const PREMIER_MOIS_DU_TRI = '2026-10';
/** Au plus tant de mois triés par passe (un long arrêt de l'appli se rattrape en quelques passes, dans l'ordre). */
export const MOIS_PAR_PASSE = 6;
/** La forme du tri : un mois trié l'est une fois par forme ; une forme corrigée s'AJOUTE (clé mois + forme), la lecture prend la plus haute. */
export const VERSION_DU_TRI = 1;
/** Décision de l'orchestrateur (27/10, constat 7) : les mois partiels comptent, avec les seules lignes de la version en service. */
export const MOIS_PARTIELS = true;

/**
 * Les statuts d'une case, dans l'ordre où ils se décident (le premier qui s'applique), avec les mots de l'écran
 * et leur ton (jamais le vert : un écart n'est jamais un gain).
 */
export const STATUTS = gel({
  'en-essai': gel({ rang: 1, dit: 'en essai', ton: 'info' }),
  'mois-de-changement': gel({ rang: 2, dit: 'mois de changement de version : trop peu de matchs depuis le changement, pas jugé', ton: null }),
  'trop-tot': gel({ rang: 3, dit: 'trop tôt : un seul mois compté', ton: null }),
  'trop-peu': gel({ rang: 4, dit: 'trop peu de matchs', ton: null }),
  'dans-la-marge': gel({ rang: 5, dit: 'malchance : dans la marge normale', ton: null }),
  'petit-ecart': gel({ rang: 6, dit: 'écart réel mais petit (moins de 2 points)', ton: null }),
  'a-surveiller': gel({ rang: 7, dit: 'à surveiller : pas dans le même sens deux mois de suite', ton: 'attention-tirets' }),
  'vrai-defaut': gel({ rang: 8, dit: 'vrai défaut : à corriger', ton: 'attention' })
});

/** Pourquoi un pronostic gelé n'entre pas dans le tri : chaque raison comptée, jamais en silence (celles de la calibration en plus). */
export const RAISONS_DU_TRI = gel({
  autreVersion: 'Calculé par une autre version du moteur (aux probabilités différentes)',
  sansVersion: 'Gelé sans numéro de version du moteur',
  sansDistribution: 'Distribution complète absente ou illisible',
  issueAbsente: 'L’issue arrivée n’est pas dans la distribution gelée',
  marcheInconnu: 'Marché inconnu du tri',
  sansIdentifiant: 'Club reconnu par son nom seulement au gel : la rencontre ne se lit pas au magasin',
  sansResultat: 'Résultat absent du magasin (match reporté, pas encore importé, ou introuvable)',
  rencontreAmbigue: 'Deux rencontres possibles au magasin : aucune n’est prise au hasard',
  sansScore: 'Rencontre au magasin sans score',
  attribue: 'Match attribué sur tapis vert : rien à régler',
  prolongationSansScore90: 'Match prolongé sans le score de la 90e minute',
  prolongationStats: 'Match prolongé : ses corners et ses tirs couvrent 120 minutes',
  statNonRelevee: 'Corners ou tirs non relevés au magasin',
  nonReglable: 'Aucune règle de règlement pour ce pronostic',
  apresCoupDEnvoi: 'Gelé seulement après le coup d’envoi',
  heureInconnue: 'Gelé le jour du match, heure du coup d’envoi inconnue',
  sansPremiere: 'Aucune révision gelée'
});

// ============================================================ la lignée : ce qui ne change aucune probabilité

/**
 * Les RÉGLAGES DE PARI : ils décident d'une mise ou d'une value, jamais d'une probabilité (lus seulement par
 * staking.js, valueFinder.js, coteMinimale.js et verdictPari.js ; prouvé par leviersEtPari.test.mjs, T-PA1). Deux
 * versions qui ne diffèrent que par eux donnent les mêmes pronostics : la même LIGNÉE.
 */
export const REGLAGES_DE_PARI = gel(['edgeThresholdMin', 'edgeThresholdMax', 'valueBookmakers', 'maxValueOdds', 'kellyFraction', 'maxStakePercent', 'maxExpectedRateGap']);

// ============================================================ les réglages qu'on peut proposer

/**
 * Les leviers du formulaire de Pierre (partie B) : des sous-clés du modèle de buts unique SEULEMENT (décision 5 :
 * `defaultCorrelation` et `homeAdvantage` retirés). `court` : le mot de l'identifiant d'une proposition ; bornes
 * comprises sauf `ouvertes`.
 */
export const LEVIERS = gel({
  'modeleDeButs.rho': gel({ court: 'rho', min: -0.3, max: 0.3, ouvertes: true, pas: 0.01 }),
  'modeleDeButs.prior': gel({ court: 'prior', min: 0, max: 40, pas: 1 }),
  'modeleDeButs.poidsXg': gel({ court: 'poidsxg', min: 0, max: 1, pas: 0.05 }),
  'modeleDeButs.melange.avecPlusMoins.wT': gel({ court: 'wt-pm', min: 0, max: 1, pas: 0.01 }),
  'modeleDeButs.melange.avecPlusMoins.wS': gel({ court: 'ws-pm', min: 0, max: 1, pas: 0.01 }),
  'modeleDeButs.melange.sans.wT': gel({ court: 'wt-sans', min: 0, max: 1, pas: 0.01 }),
  'modeleDeButs.melange.sans.wS': gel({ court: 'ws-sans', min: 0, max: 1, pas: 0.01 }),
  'modeleDeButs.demarrageAFroid.matchs': gel({ court: 'froid', min: 1, max: 30, pas: 1 })
});
/** Les réglages qui ne sont PLUS des leviers (décision 5) : refusés partout dans la boucle. */
export const LEVIERS_RETIRES = gel(['defaultCorrelation', 'homeAdvantage']);

/** Les marchés qu'un levier du modèle de buts change (déclarés avec sa candidate) et son témoin. */
export const MARCHES_DU_MODELE_DE_BUTS = gel(['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
export const TEMOINS_DU_MODELE_DE_BUTS = gel(['scoreExact']);

/**
 * LA TABLE DES RÈGLES (écrite d'avance) : d'une case en « vrai défaut » au réglage à essayer, quand le moteur en
 * service a le modèle de buts unique. UNE valeur par règle (le moins de variantes possible).
 *   - « Les 2 équipes marquent », niveau → `rho` : annonce trop haut (« oui » arrive moins qu'annoncé) → ρ + 0,03 ;
 *     trop bas → ρ − 0,03 (augmenter ρ baisse « oui »), bornée à ]−0,3 ; 0,3[ ;
 *   - total buts, buts d'une équipe, résultat + total, niveau → `melange.sans.wT` ÷ 2 (« plus près du marché »),
 *     SEULEMENT si l'écart vient des matchs cotés en 1N2 sans cote plus/moins (régimes « cotes-1n2-* », où cette
 *     part vaut 0,55 ; constat 16) — sinon « demande du code » ;
 *   - confiance des quatre familles de buts → `prior` : trop sûr → × 1,5 (8 → 12) ; pas assez → ÷ 1,5 (8 → 5).
 * Les valeurs exactes sont posées par propositions.js (partie B), sur une COPIE PROFONDE des réglages en service.
 */
export const REGLES_DE_PROPOSITION = gel({
  rho: gel({ cle: 'modeleDeButs.rho', cases: gel(['bothTeamsScore|niveau']), pas: 0.03, borne: 0.3 }),
  wT: gel({ cle: 'modeleDeButs.melange.sans.wT', cases: gel(['totalGoals|niveau', 'teamGoals|niveau', 'resultAndTotal|niveau']), facteur: 0.5, regime: 'cotes-1n2' }),
  prior: gel({ cle: 'modeleDeButs.prior', cases: gel(FAMILLES_DE_BUTS.map((f) => `${f}|confiance`)), facteur: 1.5 })
});

/** Les phrases « demande du code » : un défaut que rien ne corrige par un réglage — dit, jamais forcé. */
export const DEMANDES_DU_CODE = gel({
  result: 'demande du code : le 1N2 vient des cotes du marché ; aucun réglage ne l’améliore (le marché seul a été mesuré meilleur sur 12 943 matchs)',
  statistiques: 'demande du code : la loi des corners et des tirs est écrite dans le moteur ; à reprendre avec l’étape 33 ou plus tard',
  ancienModele: 'demande du code : une nouvelle version du modèle de buts (suite de l’étape 27)',
  wT: 'demande du code : l’écart ne vient pas des matchs cotés en 1N2 seulement ; aucun réglage simple ne le vise'
});
export const A_REVOIR_APRES_LA_CONFIANCE = 'à revoir après la correction de la confiance : un moteur trop sûr de lui déplace aussi ce chiffre';

const signeDe = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Le régime « cotes-1n2 » explique-t-il l'écart de niveau d'une famille de buts (constat 16) ? `regimes` : les
 * sommes de la fenêtre par régime { [regime]: { lignes, matchs, sa, sb } } ; `gain` : l'écart de la fenêtre.
 * Vrai seulement si les matchs « cotes-1n2-* » sont assez nombreux (au moins MATCHS_MIN_PAR_MOIS), leur écart fait au
 * moins SEUIL_D_AMPLEUR dans le sens du défaut, et dépasse celui des autres régimes. Rend { vrai, ecart1n2, ecartAutres, matchs1n2 }.
 */
export function ecartDesCotes1n2(regimes, gain) {
  const somme = (garder) => {
    const t = { lignes: 0, matchs: 0, sa: 0, sb: 0 };
    for (const [regime, r] of Object.entries(regimes ?? {})) {
      if (!garder(regime)) continue;
      t.lignes += r.lignes ?? 0;
      t.matchs += r.matchs ?? 0;
      t.sa += r.sa ?? 0;
      t.sb += r.sb ?? 0;
    }
    return { ...t, ecart: t.lignes ? (t.sb - t.sa) / t.lignes : null };
  };
  const unN2 = somme((r) => r.startsWith(REGLES_DE_PROPOSITION.wT.regime));
  const autres = somme((r) => !r.startsWith(REGLES_DE_PROPOSITION.wT.regime));
  const vrai =
    unN2.matchs >= MATCHS_MIN_PAR_MOIS &&
    unN2.ecart !== null &&
    Math.abs(unN2.ecart) >= SEUIL_D_AMPLEUR &&
    signeDe(unN2.ecart) === signeDe(gain) &&
    (autres.ecart === null || Math.abs(unN2.ecart) > Math.abs(autres.ecart));
  return { vrai, ecart1n2: unN2.ecart, ecartAutres: autres.ecart, matchs1n2: unN2.matchs };
}

/**
 * LE RÉGLAGE VISÉ par une case du tri (pur) : null (pas un vrai défaut) ; { attente: 'confiance', phrase } (confiance
 * d'abord) ; { cle, sens: 'monter' | 'descendre', phrase, … } (un levier de la table) ; { code: true, phrase }
 * (« demande du code »). `avecModeleDeButs` : le moteur en service a la clé `modeleDeButs` ; `regimes` : les
 * sommes de la fenêtre de la famille par régime (pour wT). La VALEUR proposée se calcule en partie B, jamais ici.
 */
export function levierDeLaCase(c, { avecModeleDeButs = false, regimes = null } = {}) {
  if (!c || c.statut !== 'vrai-defaut') return null;
  if (c.aRevoir) return { attente: 'confiance', phrase: A_REVOIR_APRES_LA_CONFIANCE };
  const gain = c.fenetre?.ecart ?? 0;
  if (c.famille === 'result') return { code: true, phrase: DEMANDES_DU_CODE.result };
  if (!estDeButs(c.famille)) return { code: true, phrase: DEMANDES_DU_CODE.statistiques };
  if (!avecModeleDeButs) return { code: true, phrase: DEMANDES_DU_CODE.ancienModele };
  const cas = `${c.famille}|${c.mesure}`;
  if (REGLES_DE_PROPOSITION.rho.cases.includes(cas)) {
    // Trop haut (gain < 0 : « oui » arrive moins qu'annoncé) → ρ monte (∂P(oui)/∂ρ < 0) ; trop bas → ρ descend.
    return { cle: REGLES_DE_PROPOSITION.rho.cle, sens: gain < 0 ? 'monter' : 'descendre', phrase: gain < 0 ? 'la corrélation des petits scores monte un peu : « les deux équipes marquent » sera annoncé un peu moins souvent' : 'la corrélation des petits scores descend un peu : « les deux équipes marquent » sera annoncé un peu plus souvent' };
  }
  if (REGLES_DE_PROPOSITION.prior.cases.includes(cas)) {
    return { cle: REGLES_DE_PROPOSITION.prior.cle, sens: gain < 0 ? 'monter' : 'descendre', phrase: gain < 0 ? 'plus de matchs « moyens » ajoutés à chaque équipe : le moteur sera moins sûr de lui' : 'moins de matchs « moyens » ajoutés à chaque équipe : le moteur sera plus sûr de lui' };
  }
  if (REGLES_DE_PROPOSITION.wT.cases.includes(cas)) {
    const r = ecartDesCotes1n2(regimes, gain);
    if (!r.vrai) return { code: true, phrase: DEMANDES_DU_CODE.wT, regimes: { ecart1n2: r.ecart1n2, ecartAutres: r.ecartAutres, matchs1n2: r.matchs1n2 } };
    return {
      cle: REGLES_DE_PROPOSITION.wT.cle,
      sens: 'descendre',
      phrase: `sur les matchs cotés en 1N2 sans cote plus/moins, le moteur annonçait ${gain < 0 ? 'trop' : 'pas assez'} souvent « plus de buts » : la part des statistiques dans le total baisse, plus près du marché`,
      regimes: { ecart1n2: r.ecart1n2, ecartAutres: r.ecartAutres, matchs1n2: r.matchs1n2 }
    };
  }
  return { code: true, phrase: DEMANDES_DU_CODE.ancienModele };
}

// ============================================================ les propositions : états et transitions

/** Les états d'une proposition ; les finaux ne bougent plus (sauf « adoptee », qu'un retrait peut fermer). */
export const ETATS_DE_PROPOSITION = gel(['proposee', 'au-banc', 'bancee', 'banc-impossible', 'acceptee', 'a-blanc', 'jugee', 'adoptee', 'rejetee', 'refusee', 'perimee', 'interrompue', 'retiree']);
export const ETATS_FINAUX = gel(['rejetee', 'refusee', 'perimee', 'interrompue', 'retiree']);

/**
 * Les transitions permises : un événement → { depuis: [états], vers: état }. Le banc part au clic de Pierre
 * (décision 1) ; un banc interrompu (appli fermée) ramène à « proposee » (constat 2) ; « Mettre à l'essai » vient
 * après le banc, « Refuser » est possible avant ; la reprise d'une mise à blanc interrompue est la même transition
 * « acceptee → a-blanc » (constat 3).
 */
export const TRANSITIONS = gel({
  'au-banc': gel({ depuis: gel(['proposee']), vers: 'au-banc' }),
  bancee: gel({ depuis: gel(['au-banc']), vers: 'bancee' }),
  'banc-impossible': gel({ depuis: gel(['au-banc']), vers: 'banc-impossible' }),
  'banc-interrompu': gel({ depuis: gel(['au-banc']), vers: 'proposee' }),
  acceptee: gel({ depuis: gel(['bancee', 'banc-impossible']), vers: 'acceptee' }),
  perimee: gel({ depuis: gel(['acceptee']), vers: 'perimee' }),
  'mise-a-l-essai': gel({ depuis: gel(['acceptee']), vers: 'a-blanc' }),
  jugee: gel({ depuis: gel(['a-blanc']), vers: 'jugee' }),
  // Partie B : le verdict d'une correction jugée est effacé par l'étape 25 (la version en service a changé avant
  // l'adoption) : son essai recommence — elle redevient « à l'essai ».
  'essai-repris': gel({ depuis: gel(['jugee']), vers: 'a-blanc' }),
  adoptee: gel({ depuis: gel(['jugee']), vers: 'adoptee' }),
  rejetee: gel({ depuis: gel(['jugee']), vers: 'rejetee' }),
  refusee: gel({ depuis: gel(['proposee', 'au-banc', 'bancee', 'banc-impossible', 'acceptee', 'a-blanc', 'jugee']), vers: 'refusee' }),
  interrompue: gel({ depuis: gel(['a-blanc', 'jugee']), vers: 'interrompue' }),
  retiree: gel({ depuis: gel(['adoptee']), vers: 'retiree' })
});

/** Les événements du journal qui ne changent l'état d'aucune proposition. */
export const EVENEMENTS_SANS_ETAT = gel(['tri', 'proposee', 'essai-recommence', 'demande-du-code', 'place-liberee', 'resume-ecrit']);
export const EVENEMENTS = gel([...EVENEMENTS_SANS_ETAT, ...Object.keys(TRANSITIONS)]);
export const SOURCES_DU_JOURNAL = gel(['nuit', 'pierre', 'regle', 'registre']);
export const SOURCES_DE_PROPOSITION = gel(['regle', 'pierre', 'retrait']);

/** L'état d'arrivée d'une proposition dans l'état `etat` après `evenement`, ou null si ce n'est pas permis. */
export function transitionPermise(etat, evenement) {
  const t = TRANSITIONS[evenement];
  return t && t.depuis.includes(etat) ? t.vers : null;
}

// ============================================================ après le tri (partie B)

/** L'horizon de l'essai à blanc d'une correction : comme la candidate de l'étape 27. */
export const HORIZON_DES_CORRECTIONS = gel({ matchs: 800, jours: 21 });
/** Un réglage rejeté, refusé ou retiré n'est plus proposé avant tant de mois. */
export const ATTENTE_AVANT_DE_REPROPOSER_MOIS = 6;
