/**
 * periodes.js — ce que le BANC D'ESSAI sait d'avance, écrit dans le code (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Le banc rejoue le moteur actuel, tel quel, sur le passé, jour après jour,
 * en ne lui donnant que ce qu'on sait aujourd'hui des matchs d'avant le jour
 * J (feuilles tardives, omissions rattrapées et scores corrigés compris :
 * rien ne date leur arrivée — le banc mesure donc une BORNE HAUTE de ce que
 * l'appli pouvait faire ; `date < J` tient partout) et les prix d'avant le
 * coup d'envoi. Ce fichier fixe ses périodes, ses jeux de prix, ses marchés,
 * les quatre décisions de Pierre et quelques règles pures (période d'un jour,
 * coupure des cotes, étiquette « déjà vu »). Il ne lit rien : ni base, ni
 * réseau, ni fichier.
 *
 * Vocabulaire (un seul mot partout) :
 *   - « preuve au banc » : un verdict de comparer sur une fenêtre jamais vue
 *     (P1, P2), hors du registre de la mesure ;
 *   - « preuve neuve » : jugerEtape, sur des matchs joués après le lancement
 *     d'une étape (P5) ;
 *   - « déjà vu » : une fenêtre de DONNEES_VUES ou d'un lancement — un bon
 *     score dessus ne prouve rien.
 * -----------------------------------------------------------------------
 */

import { fenetresDeclarees } from './lancements.js';

/** Version du banc : change quand une règle du rejeu change (les résumés de deux versions ne se comparent pas). */
export const VERSION_BANC = 1;
/** Forme des lignes détaillées (une par match × marché × jeu de prix). */
export const FORMAT_LIGNES = 1;
/** Forme des fichiers d'échange (JSON Lines) que `bench.mjs --lignes` écrit et que `--comparer` lit. */
export const FORMAT_ECHANGE = 1;

/**
 * LES QUATRE DÉCISIONS DE PIERRE (fin des amendements du 13/10/2026), au même endroit pour qu'un changement
 * d'avis tienne en une ligne :
 *   1. parisDeP5 — 'tous' : tous les relevés de vos bookmakers d'avant H−1 comptent comme « vos paris »,
 *      étiquetés frais / à rafraîchir, et les deux comptes sont affichés ; 'frais' : seulement les frais.
 *   2. uneCaseParLigne — true : une case par ligne de marché (plus/moins 0,5 … 3,5 séparés), fourchettes
 *      élargies pour le nombre de cases jugées (K) ; rejeu de 10 à 13 min chez Pierre. false : les lignes d'un
 *      même marché réunies en une case (moins de cases, fourchettes plus étroites).
 *   3. secondJugementParis — les paris de P5 ne prouvent rien avant des mois (≈ 46 par mois) : dit tel quel, et
 *      un second jugement fixé dans le régime de croisière, plutôt qu'un seuil baissé.
 *   4. lien4 — les lignes football-data sans rencontre au magasin (lien = 4) : 'ecarter' (comptées) ou
 *      'rejouer' (comme lien = 0 : omissions récupérées, doublons possibles).
 */
export const DECISIONS_DE_PIERRE = Object.freeze({
  parisDeP5: 'tous',
  uneCaseParLigne: true,
  dureeAcceptee: Object.freeze({ chezPierreMinutes: Object.freeze([10, 13]) }),
  secondJugementParis: '2027-03-31',
  phraseParisP5:
    'Vos paris depuis le lancement ne prouveront rien avant des mois : environ 46 par mois, quand il en faut plusieurs centaines. Un second jugement est fixé fin mars 2027, dans le régime de croisière.',
  lien4: 'ecarter'
});

/**
 * LES CINQ PÉRIODES (jours UTC, bornes comprises). Une rencontre est rejouée une seule fois : par le magasin
 * quand elle y est (P3 à P5), par football-data seulement pour une ligne `lien = 0` (P1, P2).
 */
export const PERIODES = Object.freeze({
  P1: Object.freeze({
    id: 'P1',
    nom: 'Conception',
    de: '2000-07-01',
    a: '2019-06-30',
    source: 'fd',
    // Faits depuis 2000 ; moteur rejoué à partir de la première moyenne d'avant-match de football-data.
    moteurDepuis: '2005-07-29',
    apprentissageInterdit: false,
    role: 'Réservée aux étapes qui apprennent (18, 27, 29) : le banc y rejoue le moteur actuel pour information. Jamais vue par les réglages du 23/09.'
  }),
  P2: Object.freeze({
    id: 'P2',
    nom: 'Preuve ancienne',
    de: '2019-07-01',
    a: '2023-06-30',
    source: 'fd',
    moteurDepuis: null,
    apprentissageInterdit: true,
    role: 'Preuve au banc pour le 1N2 et le plus/moins 2,5 face au marché et pour la valeur de clôture des paris ; rendement rapporté, jamais jugé. Le juge de preuve ne voit jamais cette période : la seule garde est l’étiquette du banc, et « apprentissage interdit » est une règle déclarée qu’aucun code ne vérifie.'
  }),
  P3: Object.freeze({
    id: 'P3',
    nom: 'Magasin neuf',
    de: '2023-01-01',
    a: '2024-06-30',
    source: 'magasin',
    moteurDepuis: null,
    apprentissageInterdit: false,
    role: 'Preuve au banc face au repère et pour la calibration face à FIABILITE ; indicatif pour la perte log du 1N2 et pour les paris (le livre de référence et la règle de pari ont vu 07/2023 → 06/2024).'
  }),
  P4: Object.freeze({
    id: 'P4',
    nom: 'Déjà vu',
    de: '2024-07-01',
    a: '2026-09-23',
    source: 'magasin',
    moteurDepuis: null,
    apprentissageInterdit: false,
    sous: Object.freeze({
      P4a: Object.freeze({ id: 'P4a', nom: 'Déjà vu — apprentissage', de: '2024-07-01', a: '2025-06-30' }),
      P4b: Object.freeze({ id: 'P4b', nom: 'Déjà vu — vérification du 23/09', de: '2025-07-01', a: '2026-09-23' })
    }),
    role: 'La note de départ et l’étalonnage du banc (reproduction du 23/09) ; jamais une preuve.'
  }),
  P5: Object.freeze({
    id: 'P5',
    nom: 'Depuis le lancement',
    de: '2026-09-24',
    a: null,
    source: 'magasin',
    moteurDepuis: null,
    apprentissageInterdit: false,
    role: 'La seule preuve neuve (jugerEtape, étapes 25 et 47) : vos prix relevés avant le coup d’envoi.'
  })
});

/** Les tranches du résumé, dans l'ordre : P4 coupée en P4a et P4b (la note de départ lit P4b). */
export const TRANCHES_DU_RESUME = Object.freeze(['P1', 'P2', 'P3', 'P4a', 'P4b', 'P5']);
/** Les bornes de chaque tranche du résumé. */
export const BORNES_DES_TRANCHES = Object.freeze({
  P1: Object.freeze({ de: PERIODES.P1.de, a: PERIODES.P1.a }),
  P2: Object.freeze({ de: PERIODES.P2.de, a: PERIODES.P2.a }),
  P3: Object.freeze({ de: PERIODES.P3.de, a: PERIODES.P3.a }),
  P4a: Object.freeze({ de: PERIODES.P4.sous.P4a.de, a: PERIODES.P4.sous.P4a.a }),
  P4b: Object.freeze({ de: PERIODES.P4.sous.P4b.de, a: PERIODES.P4.sous.P4b.a }),
  P5: Object.freeze({ de: PERIODES.P5.de, a: null })
});

/** Le huis clos (14/03/2020 → 31/05/2021, à l'intérieur de P2) : rien n'est retiré, chaque ligne le porte. */
export const HUIS_CLOS = Object.freeze({ de: '2020-03-14', a: '2021-05-31' });
export const estHuisClos = (date) => date >= HUIS_CLOS.de && date <= HUIS_CLOS.a;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const jourValide = (j) => typeof j === 'string' && JOUR.test(j);

/**
 * La période d'un jour, selon la SOURCE qui rejoue la rencontre : football-data ('fd') jusqu'au 30/06/2023
 * pour P2, le magasin à partir du 01/01/2023 pour P3 — le 15/03/2023 est P2 pour une ligne football-data, P3
 * pour une rencontre du magasin. Rend 'P1' … 'P5'.
 */
export function periodeDe(date, source) {
  if (!jourValide(date)) throw new RangeError(`periodeDe : jour illisible (${String(date)}).`);
  if (source !== 'fd' && source !== 'magasin') throw new RangeError(`periodeDe : source inconnue (${String(source)}) — « fd » ou « magasin ».`);
  if (date <= PERIODES.P1.a) return 'P1';
  if (source === 'fd' ? date <= PERIODES.P2.a : date < PERIODES.P3.de) return 'P2';
  if (date <= PERIODES.P3.a) return 'P3';
  if (date <= PERIODES.P4.a) return 'P4';
  return 'P5';
}

/** La tranche du résumé d'un jour : P4 coupée en P4a / P4b. */
export function trancheDuResume(date, source) {
  const p = periodeDe(date, source);
  if (p !== 'P4') return p;
  return date <= PERIODES.P4.sous.P4a.a ? 'P4a' : 'P4b';
}

/** Une période (ou une tranche) a-t-elle cette source ? P1-P2 : football-data ; P3-P5 : le magasin. */
export function sourceDeLaPeriode(periode) {
  const id = periode === 'P4a' || periode === 'P4b' ? 'P4' : periode;
  return PERIODES[id]?.source ?? null;
}

// ------------------------------------------------------------------ les prix

/** Les colonnes AVANT-MATCH de fd_history (pré-clôture du vendredi ou du mardi) : 1X2 et plus/moins 2,5. */
export const COLONNES_AVANT_MATCH = Object.freeze([
  'moy_1', 'moy_n', 'moy_2', 'max_1', 'max_n', 'max_2', 'pin_1', 'pin_n', 'pin_2', 'b365_1', 'b365_n', 'b365_2', 'wh_1', 'wh_n', 'wh_2',
  'moy_p25', 'moy_m25', 'max_p25', 'max_m25', 'pin_p25', 'pin_m25', 'b365_p25', 'b365_m25'
]);
/** Les colonnes de CLÔTURE que le banc lit pour MESURER, après coup (valeur de clôture, témoins) — jamais pour décider. */
export const COLONNES_CLOTURE = Object.freeze(['moy_c1', 'moy_cn', 'moy_c2', 'pin_c1', 'pin_cn', 'pin_c2', 'moy_cp25', 'moy_cm25', 'pin_cp25', 'pin_cm25']);

/**
 * LES JEUX DE PRIX, jamais mélangés. `colonnes` : ce que prix.js a le droit de lire dans fd_history pour
 * nourrir le moteur ; `decision` : un pari peut-il en sortir (jamais sur une clôture : ce serait voir l'avenir).
 * Étape 27 : l'avant-match lit aussi la moyenne du plus/moins 2,5 d'avant-match (moy_p25, moy_m25) — l'ancre du
 * total du modèle de buts ; la clôture n'en donne aucune.
 */
export const JEUX_DE_PRIX = Object.freeze({
  'fd-avant-match': Object.freeze({
    id: 'fd-avant-match',
    titre: 'football-data, avant-match',
    detail: 'Pré-clôture du vendredi ou du mardi : moyenne du marché, Pinnacle, William Hill, Bet365 (le maximum seulement affiché).',
    source: 'fd',
    decision: true,
    cloture: false,
    colonnes: Object.freeze(['moy_1', 'moy_n', 'moy_2', 'max_1', 'max_n', 'max_2', 'pin_1', 'pin_n', 'pin_2', 'b365_1', 'b365_n', 'b365_2', 'wh_1', 'wh_n', 'wh_2', 'moy_p25', 'moy_m25'])
  }),
  'fd-cloture': Object.freeze({
    id: 'fd-cloture',
    titre: 'football-data, clôture (témoin)',
    detail: 'Moyenne de clôture seule : la reproduction du 23/09 et un témoin. Jamais une décision de pari.',
    source: 'fd',
    decision: false,
    cloture: true,
    colonnes: Object.freeze(['moy_c1', 'moy_cn', 'moy_c2'])
  }),
  'gratuites-avant-match': Object.freeze({
    id: 'gratuites-avant-match',
    titre: 'Cotes gratuites archivées',
    detail: 'ESPN, 365Scores, football-data, bourses à volume suffisant : ce que le moteur lit quand The Odds API ne cote pas. Référence seulement, jamais un pari.',
    source: 'gratuites',
    decision: false,
    cloture: false,
    colonnes: Object.freeze([])
  }),
  'vos-bookmakers': Object.freeze({
    id: 'vos-bookmakers',
    titre: 'Vos bookmakers',
    detail: 'Les cotes payantes archivées (The Odds API), le dernier relevé au plus tard une heure avant le coup d’envoi.',
    source: 'payantes',
    decision: true,
    cloture: false,
    colonnes: Object.freeze([])
  })
});
/** La case des lignes qui n'ont de prix dans AUCUN jeu demandé : une fois par rencontre × marché, face au repère seulement. */
export const SANS_COTE = 'sans-cote';

/** Les jeux de prix par défaut : dans l'appli (P2 à P5) et dans le bac (tous, reproduction comprise). */
export const PRIX_PAR_DEFAUT = Object.freeze(['fd-avant-match', 'gratuites-avant-match', 'vos-bookmakers']);
export const PERIODES_PAR_DEFAUT = Object.freeze(['P2', 'P3', 'P4', 'P5']);

/** Les dates qui bornent ce que l'historique permet (dossier 17-19, m1). */
export const BORNES_DES_LIVRES = Object.freeze({
  premierPinnacle: '2012-07-27',
  dernierWilliamHill: '2025-03-27',
  dernierPinnacle: '2026-01-15'
});

/**
 * Les règles d'un lien football-data → magasin (`fd_history.lien`), pour « une rencontre, un rejeu » :
 * 0 rejouée par football-data (hors période du magasin, ou championnat non suivi) ; 1 prix rattachés à la
 * rencontre du magasin ; 2 la rencontre du magasin est rejouée sans ces prix (score différent) ; 3 écartée
 * (rattachement incertain) ; 4 selon la décision de Pierre (DECISIONS_DE_PIERRE.lien4).
 */
export function regleDuLien(lien) {
  if (lien === 0) return 'rejouer-fd';
  if (lien === 1) return 'prix-du-magasin';
  if (lien === 2) return 'scoreDifferent';
  if (lien === 3) return 'rattachementIncertain';
  if (lien === 4) return DECISIONS_DE_PIERRE.lien4 === 'rejouer' ? 'rejouer-fd' : 'sansRencontreAuMagasin';
  return 'lienInconnu';
}

// ------------------------------------------------------------- la coupure

/** Le dernier relevé admis : une heure avant le coup d'envoi. */
export const AVANCE_DE_LA_COUPURE_MINUTES = 60;

/**
 * La COUPURE des cotes d'un match, une seule règle pour les cotes gratuites et pour vos bookmakers :
 * coup d'envoi − 60 min quand l'heure est connue (`heureSure`), sinon minuit UTC du jour du match (la
 * veille). `kickoff` : meta.kickoff du magasin (sans lui, minuit : plus prudent ; odds_events.kickoff n'est pas lu —
 * mesuré le 19/10, toutes les rencontres du magasin ont meta.kickoff). Jamais l'horloge du moment.
 */
export function coupureDe({ date, kickoff = null } = {}) {
  if (!jourValide(date)) throw new RangeError(`coupureDe : jour illisible (${String(date)}).`);
  const t = typeof kickoff === 'string' ? Date.parse(kickoff) : Number.NaN;
  if (Number.isFinite(t)) return { instant: new Date(t - AVANCE_DE_LA_COUPURE_MINUTES * 60_000).toISOString(), jour: date, heureSure: true, coupDEnvoi: new Date(t).toISOString() };
  return { instant: `${date}T00:00:00.000Z`, jour: date, heureSure: false, coupDEnvoi: null };
}

/** La coupure d'un pronostic gelé : l'heure des cotes qu'il a lues (`engine_picks.odds_at`). */
export function coupureDuGel(oddsAt) {
  const t = typeof oddsAt === 'string' ? Date.parse(oddsAt) : Number.NaN;
  if (!Number.isFinite(t)) return null;
  return { instant: new Date(t).toISOString(), jour: new Date(t).toISOString().slice(0, 10), heureSure: true, coupDEnvoi: null };
}

/** Un relevé est-il admis ? Au plus tard à la coupure (strictement avant minuit quand l'heure est inconnue). */
export function avantLaCoupure(releveAt, coupure) {
  const t = typeof releveAt === 'string' ? Date.parse(releveAt) : Number.NaN;
  const c = Date.parse(coupure?.instant ?? '');
  if (!Number.isFinite(t) || !Number.isFinite(c)) return false;
  return coupure.heureSure ? t <= c : t < c;
}

// ------------------------------------------------------------- les marchés

const LIGNES_DE_BUTS = Object.freeze([0.5, 1.5, 2.5, 3.5]);
/**
 * Les 27 LIGNES DE MARCHÉ d'une rencontre (marketKey = la clé du moteur, cleDuMarche de gelPronostics.js) :
 *   mesure 'categorie' (1N2, combiné), 'binaire' (plus/moins, les deux marquent), 'grille' (81 scores),
 *   'comptes' (corners, tirs, tirs cadrés : la loi complète ; `ligne` = la demi-ligne du pronostic retenu).
 *   `marche` : un marché historique existe (1N2 ; plus/moins 2,5 seulement — rien pour 1,5 ou 3,5).
 */
export const MARCHES_DU_BANC = Object.freeze([
  Object.freeze({ marketKey: 'result', famille: 'result', ligne: null, mesure: 'categorie', marche: true }),
  ...LIGNES_DE_BUTS.map((l) => Object.freeze({ marketKey: 'totalGoals', famille: 'totalGoals', ligne: l, mesure: 'binaire', marche: l === 2.5 })),
  Object.freeze({ marketKey: 'bothTeamsScore', famille: 'bothTeamsScore', ligne: null, mesure: 'binaire', marche: false }),
  ...['home', 'away'].flatMap((e) => LIGNES_DE_BUTS.map((l) => Object.freeze({ marketKey: `teamGoals:${e}`, famille: 'teamGoals', equipe: e, ligne: l, mesure: 'binaire', marche: false }))),
  ...[1.5, 2.5, 3.5].map((l) => Object.freeze({ marketKey: 'resultAndTotal', famille: 'resultAndTotal', ligne: l, mesure: 'categorie', marche: false })),
  Object.freeze({ marketKey: 'scoreExact', famille: 'scoreExact', ligne: null, mesure: 'grille', marche: false }),
  ...[
    ['corners', 'totalCorners', 'teamCorners'],
    ['shots', 'totalShots', 'teamShots'],
    ['shotsOnTarget', 'totalShotsOnTarget', 'teamShotsOnTarget']
  ].flatMap(([kind, total, equipe]) => [
    Object.freeze({ marketKey: total, famille: kind, stat: kind, portee: 'total', ligne: null, mesure: 'comptes', marche: false }),
    Object.freeze({ marketKey: `${equipe}:home`, famille: kind, stat: kind, portee: 'home', ligne: null, mesure: 'comptes', marche: false }),
    Object.freeze({ marketKey: `${equipe}:away`, famille: kind, stat: kind, portee: 'away', ligne: null, mesure: 'comptes', marche: false })
  ])
]);
/** Les familles de marchés (l'option --marches) : result, totalGoals, bothTeamsScore, teamGoals, resultAndTotal, scoreExact, corners, shots, shotsOnTarget. */
export const FAMILLES_DU_BANC = Object.freeze([...new Set(MARCHES_DU_BANC.map((m) => m.famille))]);
/** Pas de marché, pas de règlement : les cartons (étape 33). */
export const MARCHES_NON_REJOUES = Object.freeze({ cartons: 'aucun marché et aucun règlement (étape 33)' });

/** La clé d'une ligne : match × marché × ligne × jeu de prix (une ligne nulle s'écrit « - »). */
export const cleDeLigne = ({ fixtureKey, marketKey, ligne = null, prix }) => `${fixtureKey}|${marketKey}|${ligne ?? '-'}|${prix}`;

// ------------------------------------------------------------- « déjà vu »

/**
 * Les fenêtres avec lesquelles le banc étiquette ses lignes (corrigé le 19/10 : par portée) : celles du code
 * qui valent pour le MOTEUR (fenetresDeclarees, portée « moteur » : DONNEES_VUES et les vues « moteur » des
 * lancements), la DÉCLARATION de la candidate rejouée (`declaration` : ses vues, « candidate:… »), et les `vues`
 * passées au rejeu, « rejeu:1 », « rejeu:2 »… Jamais une fenêtre regardée pour une autre grandeur.
 */
export function fenetresDuBanc({ vues = [], declaration = null, lancements, donneesVues } = {}) {
  const declarees = fenetresDeclarees({ portee: 'moteur', declaration, ...(lancements ? { lancements } : {}), ...(donneesVues ? { donneesVues } : {}) });
  return [...declarees, ...(vues ?? []).map((f, i) => ({ id: `rejeu:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: null, version: null, pour: ['moteur'], candidate: false }))];
}

/** Les identifiants des fenêtres qui contiennent ce jour (bornes comprises) ; [] = jamais vu. */
export function fenetresDuJour(date, fenetres) {
  const ids = [];
  for (const f of fenetres) if (date >= f.de && date <= f.a) ids.push(f.id);
  return ids;
}

/** Ce que l'écran dit d'une fenêtre vue (§6.4) ; « jamais vues » quand aucune. */
export function texteDesVues(ids) {
  if (!ids?.length) return 'jamais vues';
  const textes = ids.map((id) =>
    id === 'mesures-du-23-09' ? 'déjà vues (vérification du 23/09)'
    : id === 'apprentissage-23-09' ? 'déjà vues (apprentissage du 23/09)'
    : id === 'regle-de-value-23-09' ? 'déjà vues par le choix du livre de référence et la règle de pari'
    : texteDUneFenetre(id)
  );
  return [...new Set(textes)].join(' ; ');
}

/** « déjà vues (étape 27, version v1) », « déjà vues (candidate) », « déjà vues (fenêtre du rejeu) » ; sinon l'identifiant. */
export function texteDUneFenetre(id) {
  const m = /^(\d+|E):([^:]+):\d+$/.exec(String(id));
  if (/^candidate:/.test(String(id))) return 'déjà vues (candidate)';
  if (/^rejeu:\d+$/.test(String(id))) return 'déjà vues (fenêtre du rejeu)';
  if (m) return `déjà vues (étape ${m[1]}, version ${m[2]})`;
  return `déjà vues (${id})`;
}
