/**
 * leagueBenchmarks.js — les REPÈRES de chaque championnat (étape 15 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Ce qu'est un match « normal » dans un championnat, saison par saison :
 * buts par match, avantage du terrain, part de nuls, de plus de 1,5 / 2,5 /
 * 3,5 buts, des deux équipes qui marquent, scores les plus fréquents, buts
 * par mi-temps, corners, tirs, cartons, penalties — et leur évolution dans la
 * saison (mois par mois). Calculé chaque nuit par l'étape « reperes » de
 * l'actualisation (jobs/matchStatsAutoRefresh.js), gardé dans la table
 * league_benchmarks (matchStatsDb.js), lu tel quel par
 * GET /api/match-stats/benchmarks (onglet « Statistiques ligue », bloc
 * « Repères du championnat »).
 *
 * À QUOI ÇA SERT : le modèle de base du banc d'essai (étape 19) et l'alarme de
 * qualité (étape 14, contrôles « hors repères » : cf. valeursAttendues).
 * MESURER SEULEMENT : rien ici n'entre dans le moteur. Le facteur de terrain
 * (1,10 / 0,90) et les constantes de dispersion de statMarkets.js restent ce
 * qu'ils sont ; l'étape 33 branchera les repères, après le banc d'essai.
 *
 * UNE SAISON = UNE SEULE SOURCE, écrite sur chaque ligne :
 *   - FotMob (le magasin) quand la saison y est ENTIÈRE, c'est-à-dire
 *     commencée depuis le début du magasin (janvier 2023) ;
 *   - sinon football-data.co.uk (table fd_history, étape 13), pour les
 *     championnats qu'il couvre : jusqu'à 23 saisons de plus. Il n'a ni les
 *     minutes des buts ni les penalties : ces cases restent vides (« non
 *     relevé ») ; ses buts par mi-temps viennent de son score à la mi-temps.
 *     Ses fichiers par pays n'ont que le score final.
 * Les bornes de saison sont celles de seasonWindows.js (juillet-juin ; année
 * civile pour les pays nordiques, les Amériques sauf le Mexique, la Chine).
 * Une saison football-data garde le libellé de son fichier (2019-20, finie en
 * juillet 2020, reste 2019-20 ; l'Argentine a eu des saisons à cheval).
 *
 * CE QUI NE COMPTE PAS (côté FotMob, le seul qui le sait) : un résultat
 * attribué sur tapis vert, un match annulé, abandonné ou reporté, un match
 * hors classement (barrages, playoffs, tours de qualification :
 * countsForTable), un match décidé en prolongation. Chez FotMob, un 0 DES
 * DEUX CÔTÉS veut dire « non relevé » (corners, tirs, tirs cadrés — la règle
 * de statInputsRead.js et du règlement — et les cartons jaunes, sans lesquels
 * les rouges ne comptent pas non plus), jamais zéro : le match ne compte pas
 * pour ce repère, et chaque case dit sur combien de matchs elle porte. Chez
 * football-data, une case vide est « non publié » et un 0 un vrai zéro.
 * LES COUPES sont tenues à part (terrain neutre, prolongations, tirs au but) :
 * aucun repère pour elles ; la route le dit.
 *
 * PETITS CHAMPIONNATS : la moyenne de toutes les saisons d'un championnat est
 * aussi donnée « retenue », ramenée vers la moyenne des championnats d'autant
 * plus qu'elle porte sur peu de matchs (bayésien empirique : le championnat
 * pèse ses n matchs, la moyenne des championnats pèse k matchs, k = variance
 * d'un match / variance vraie entre championnats). Les attendus de l'étape 14
 * et du banc d'essai partent de cette valeur retenue.
 *
 * DISPERSION ET FACTEUR DE TERRAIN (corners, tirs, tirs cadrés), mesurés par
 * championnat HORS ÉCHANTILLON, comme le moteur les emploie
 * (sports/football/statMarkets.js) : l'attendu d'une équipe = facteur de
 * terrain × moyenne de ce qu'elle produit sur ses 10 derniers matchs relevés
 * et de ce que l'adversaire concède sur les siens (toutes compétitions, au
 * moins 6 : la fenêtre de statInputsRead.js), avec les SEULS matchs d'avant.
 * La dispersion (1/k de la binomiale négative : variance = moyenne + moyenne²
 * × 1/k) se mesure autour de cet attendu (méthode des moments), jamais sur les
 * comptes bruts du championnat, qui mêlent l'écart entre équipes au hasard (la
 * « dispersion brute », donnée à côté pour le montrer). Chaque mesure a son
 * erreur type et son intervalle à 95 %, et sa valeur retenue (ramenée vers la
 * mesure de tous les championnats réunis). FotMob seulement : la fenêtre du
 * moteur court sur toutes les compétitions, que football-data n'a pas.
 *
 * LE SERVEUR N'EST JAMAIS FIGÉ : la nuit, le calcul rend la main entre deux
 * saisons et toutes les ~25 ms des boucles longues ; il ne recalcule que les
 * saisons qui ont changé (empreinte de leurs rencontres, de leur fichier
 * football-data, de la version du calcul) ; la dispersion, qui ne lit que des
 * index et team_stats, est refaite entière.
 *
 * JAMAIS DE RESSEMBLANCE DE NOMS : clubs par identifiant FotMob seulement
 * (home_id / away_id), championnats par leur libellé du magasin, fichiers
 * football-data par leur code (FD_SAISONNIERS / FD_PAYS).
 * -----------------------------------------------------------------------
 */

import { createHash } from 'node:crypto';
import { openDb } from './matchStatsDb.js';
import { TEAM_COLUMNS } from './columns.js';
import { countsForTable } from './matchStatsRead.js';
import { STAT_KINDS, statExpectations } from '../../sports/football/statMarkets.js';
import { seasonOf, seasonBounds, seasonLabel, currentSeason } from '../providers/seasonWindows.js';
import { isCup } from '../providers/leagueCups.js';
import { FD_SAISONNIERS, FD_PAYS } from '../providers/footballDataOdds.js';

/** Forme du calcul : une saison calculée par une autre version est refaite. */
export const VERSION_REPERES = 1;
/** Le magasin FotMob commence en janvier 2023 : une saison commencée avant n'y est pas entière. */
export const DEBUT_MAGASIN = '2023-01-01';
/** La « saison » des lignes qui réunissent toutes les saisons d'un championnat. */
export const TOUTES = 'toutes';
/** Le « championnat » des lignes qui réunissent tous les championnats. */
export const GENERAL = '*';
/**
 * La fenêtre du moteur (statInputsRead.js : STAT_SAMPLE, STAT_MIN_SAMPLE, et
 * ses deux lectures de 30 matchs) — recopiée ici pour ne pas importer sa
 * lecture des clubs par leur nom ; un test vérifie qu'elle n'a pas bougé.
 */
export const FENETRE_STATS = 10;
export const MINIMUM_FENETRE = 6;
export const FENETRE_PAR_COTE = 30;
/** Une mesure de dispersion sur moins de matchs n'entre pas dans la variance entre championnats. */
const MINIMUM_DISPERSION = 100;
/** Une saison de moins de matchs n'entre pas dans la variance entre saisons. */
const MINIMUM_SAISON = 30;

export const SOURCES = Object.freeze({
  fotmob: Object.freeze({ cle: 'fotmob', nom: 'FotMob', detail: 'magasin SQLite, rencontre par rencontre (feuilles de match FotMob)' }),
  'football-data': Object.freeze({ cle: 'football-data', nom: 'football-data.co.uk', detail: 'fichiers CSV gratuits, une ligne par match (table fd_history)' })
});

const R = (cle, libelle, court, type, enPlus = {}) => Object.freeze({ cle, libelle, court, type, famille: 'buts', mensuel: false, fotmobSeul: false, ...enPlus });

/**
 * Les repères d'une saison. `type` : 'moyenne' (par match) ou 'part' (de 0 à 1,
 * jamais additionnée). `mensuel` : gardé aussi mois par mois (l'évolution dans
 * la saison). `fotmobSeul` : football-data ne le relève pas.
 */
export const REPERES = Object.freeze([
  R('buts', 'Buts par match', 'Buts', 'moyenne', { mensuel: true }),
  R('buts_dom', 'Buts de l’équipe qui reçoit, par match', 'Buts dom.', 'moyenne'),
  R('buts_ext', 'Buts de l’équipe qui se déplace, par match', 'Buts ext.', 'moyenne'),
  R('avantage_terrain', 'Avantage du terrain : buts de l’équipe qui reçoit moins ceux de l’équipe qui se déplace, par match', 'Avantage terrain', 'moyenne', { signe: true }),
  R('victoires_dom', 'Victoires de l’équipe qui reçoit', 'Victoires dom.', 'part', { famille: 'resultat' }),
  R('nuls', 'Matchs nuls', 'Nuls', 'part', { famille: 'resultat', mensuel: true }),
  R('victoires_ext', 'Victoires de l’équipe qui se déplace', 'Victoires ext.', 'part', { famille: 'resultat' }),
  R('plus_1_5', 'Plus de 1,5 but (2 buts ou plus)', '+1,5', 'part', { famille: 'lignes' }),
  R('plus_2_5', 'Plus de 2,5 buts (3 buts ou plus)', '+2,5', 'part', { famille: 'lignes', mensuel: true }),
  R('plus_3_5', 'Plus de 3,5 buts (4 buts ou plus)', '+3,5', 'part', { famille: 'lignes' }),
  R('deux_marquent', 'Les deux équipes marquent', 'Les 2 marquent', 'part', { famille: 'lignes', mensuel: true }),
  R('buts_1re_mt', 'Buts en première mi-temps, par match', '1re mi-temps', 'moyenne', { famille: 'mi-temps' }),
  R('buts_2e_mt', 'Buts en seconde mi-temps, par match', '2e mi-temps', 'moyenne', { famille: 'mi-temps' }),
  R('corners', 'Corners par match', 'Corners', 'moyenne', { famille: 'statistiques', mensuel: true }),
  R('corners_dom', 'Corners de l’équipe qui reçoit, par match', 'Corners dom.', 'moyenne', { famille: 'statistiques' }),
  R('corners_ext', 'Corners de l’équipe qui se déplace, par match', 'Corners ext.', 'moyenne', { famille: 'statistiques' }),
  R('tirs', 'Tirs par match', 'Tirs', 'moyenne', { famille: 'statistiques' }),
  R('tirs_dom', 'Tirs de l’équipe qui reçoit, par match', 'Tirs dom.', 'moyenne', { famille: 'statistiques' }),
  R('tirs_ext', 'Tirs de l’équipe qui se déplace, par match', 'Tirs ext.', 'moyenne', { famille: 'statistiques' }),
  R('tirs_cadres', 'Tirs cadrés par match', 'Tirs cadrés', 'moyenne', { famille: 'statistiques' }),
  R('cartons_jaunes', 'Cartons jaunes par match', 'Jaunes', 'moyenne', { famille: 'cartons', mensuel: true }),
  R('cartons_rouges', 'Cartons rouges par match', 'Rouges', 'moyenne', { famille: 'cartons' }),
  R('penalties', 'Penalties marqués par match', 'Penalties', 'moyenne', { famille: 'penalties', fotmobSeul: true }),
  R('penalties_tires', 'Penalties tirés par match (carte des tirs FotMob)', 'Pen. tirés', 'moyenne', { famille: 'penalties', fotmobSeul: true })
]);

/** Les trois statistiques dont on mesure la dispersion et le facteur de terrain, avec leur clé dans le moteur. */
export const STATISTIQUES = Object.freeze([
  Object.freeze({ cle: 'corners', moteur: 'corners', libelle: 'Corners', colonne: 'c' }),
  Object.freeze({ cle: 'tirs', moteur: 'shots', libelle: 'Tirs', colonne: 's' }),
  Object.freeze({ cle: 'tirs_cadres', moteur: 'shotsOnTarget', libelle: 'Tirs cadrés', colonne: 'o' })
]);

const COL = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, c.column]));
const C_CORNERS = COL['Corner Kicks'];
const C_TIRS = COL['Total Shots'];
const C_CADRES = COL['Shots on Goal'];
const C_JAUNES = COL['Yellow Cards'];
const C_ROUGES = COL['Red Cards'];

const nombreOuNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Le facteur de terrain DU MOTEUR, lu par sa propre fonction (statExpectations
 * avec 100 produits et 100 concédés de chaque côté) : jamais recopié, il ne
 * peut pas diverger de ce que le moteur emploie.
 */
export function facteurTerrainDuMoteur() {
  const cent = { for: 100, against: 100 };
  const e = statExpectations({ statInputs: { home: { corners: cent }, away: { corners: cent } } })?.corners;
  return { dom: e.home / 100, ext: e.away / 100 };
}

// ======================================================= une rencontre

/**
 * FotMob — deux comptes relevés : ni absents, ni 0 des deux côtés. FotMob
 * publie 0 à la place d'un champ qu'il n'a pas relevé (couverture réduite) :
 * un 0 des deux côtés veut dire « non relevé », jamais zéro (la règle de
 * statInputsRead.js et du règlement).
 */
export function paireRelevee(d, e) {
  const a = nombreOuNull(d);
  const b = nombreOuNull(e);
  if (a === null || b === null) return null;
  if (a === 0 && b === 0) return null;
  return [a, b];
}

/**
 * FotMob — les cartons d'un match : seulement quand les jaunes sont relevés
 * (ni absents, ni 0 des deux côtés). Mesuré le 07/10/2026 : en Argentine,
 * depuis janvier 2026, FotMob publie les jaunes à 0 et garde les rouges
 * (0,1 jaune par match au lieu de 4,9 au déroulé) ; un rouge relevé ne
 * prouve donc pas que les jaunes le sont. Les rouges d'un match dont les
 * jaunes manquent ne comptent pas non plus.
 */
export function cartonsReleves(jd, je, rd, re) {
  const jaunes = paireRelevee(jd, je);
  if (!jaunes) return null;
  const d = nombreOuNull(rd);
  const e = nombreOuNull(re);
  return { jaunes: jaunes[0] + jaunes[1], rouges: d === null || e === null ? null : d + e };
}

/**
 * football-data — deux comptes relevés : ni l'un ni l'autre absent. Ses
 * zéros sont de vrais zéros (étape 13 : une case vide = non publié, jamais
 * 0) ; un match sans carton y existe (6 % des matchs de Premier League
 * depuis 2000).
 */
export function paireFd(d, e) {
  const a = nombreOuNull(d);
  const b = nombreOuNull(e);
  return a === null || b === null ? null : [a, b];
}

/** football-data — les cartons : jaunes et rouges chacun s'il est publié, zéros compris. */
export function cartonsFd(jd, je, rd, re) {
  const jaunes = paireFd(jd, je);
  const rouges = paireFd(rd, re);
  if (!jaunes && !rouges) return null;
  return { jaunes: jaunes ? jaunes[0] + jaunes[1] : null, rouges: rouges ? rouges[0] + rouges[1] : null };
}

function valeursDuScore(hg, ag) {
  const total = hg + ag;
  return {
    buts: total,
    buts_dom: hg,
    buts_ext: ag,
    avantage_terrain: hg - ag,
    victoires_dom: hg > ag ? 1 : 0,
    nuls: hg === ag ? 1 : 0,
    victoires_ext: hg < ag ? 1 : 0,
    plus_1_5: total >= 2 ? 1 : 0,
    plus_2_5: total >= 3 ? 1 : 0,
    plus_3_5: total >= 4 ? 1 : 0,
    deux_marquent: hg > 0 && ag > 0 ? 1 : 0
  };
}

function valeursDesStatistiques(v, corners, tirs, cadres, cartons) {
  v.corners = corners ? corners[0] + corners[1] : null;
  v.corners_dom = corners ? corners[0] : null;
  v.corners_ext = corners ? corners[1] : null;
  v.tirs = tirs ? tirs[0] + tirs[1] : null;
  v.tirs_dom = tirs ? tirs[0] : null;
  v.tirs_ext = tirs ? tirs[1] : null;
  v.tirs_cadres = cadres ? cadres[0] + cadres[1] : null;
  v.cartons_jaunes = cartons ? cartons.jaunes : null;
  v.cartons_rouges = cartons ? cartons.rouges ?? null : null;
  return v;
}

/**
 * Pourquoi une rencontre du magasin ne compte pas, ou null. `meta` : la
 * colonne meta de la rencontre (objet).
 */
export function exclusionDUneRencontre({ homeGoals, awayGoals, meta }) {
  if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) return 'nonJoues';
  const m = meta ?? {};
  // Résultat attribué sur tapis vert : FotMob le dit de deux façons (cf. scoreFormRead.js).
  if (m.awarded === 1 || m.awarded === true || m.reason === 'awarded_win' || m.reason === 'id_reused') return 'attribues';
  if (/^(cancelled|abandoned|postponed)$/.test(String(m.reason ?? ''))) return 'nonJoues';
  if (!countsForTable(m)) return 'horsClassement';
  // Le score d'un match prolongé n'est pas celui des 90 minutes.
  if (m.reason === 'afterextra' || m.reason === 'afterpenalties') return 'prolongations';
  return null;
}

/**
 * Les valeurs d'une rencontre FotMob : le score, le déroulé (`events`), la
 * carte des tirs (`shotmap`) et les statistiques d'équipe (`stats` : lignes
 * team_stats { home, away }). Une valeur non relevée vaut null.
 *   - mi-temps et penalties marqués : seulement quand le déroulé a TOUS les
 *     buts du score, chacun avec sa minute (≤ 45, arrêts de jeu compris = 1re
 *     mi-temps : FotMob note 45+2 en minute 45 et temps ajouté 2) ;
 *   - penalties tirés : la carte des tirs, quand FotMob la publie (tirs au but
 *     d'une séance exclus, au-delà de la 120e).
 */
export function valeursDUneRencontre({ homeGoals, awayGoals, events = null, shotmap = null, stats = null }) {
  const hg = Number(homeGoals);
  const ag = Number(awayGoals);
  const v = valeursDuScore(hg, ag);
  const buts = Array.isArray(events) ? events.filter((e) => e?.type === 'goal') : null;
  const deroule = Boolean(buts) && buts.length === hg + ag && buts.every((b) => b.minute !== null && b.minute !== undefined && Number.isFinite(Number(b.minute)));
  v.buts_1re_mt = deroule ? buts.filter((b) => Number(b.minute) <= 45).length : null;
  v.buts_2e_mt = deroule ? hg + ag - v.buts_1re_mt : null;
  v.penalties = deroule ? buts.filter((b) => b.detail === 'Penalty' && !b.ownGoal).length : null;
  v.penalties_tires = Array.isArray(shotmap) && shotmap.length ? shotmap.filter((t) => t?.situation === 'penalty' && !(Number(t.minute) > 120)).length : null;
  const h = stats?.home ?? null;
  const a = stats?.away ?? null;
  return valeursDesStatistiques(
    v,
    paireRelevee(h?.[C_CORNERS], a?.[C_CORNERS]),
    paireRelevee(h?.[C_TIRS], a?.[C_TIRS]),
    paireRelevee(h?.[C_CADRES], a?.[C_CADRES]),
    cartonsReleves(h?.[C_JAUNES], a?.[C_JAUNES], h?.[C_ROUGES], a?.[C_ROUGES])
  );
}

/**
 * Les valeurs d'une ligne de fd_history : score final et à la mi-temps,
 * tirs, tirs cadrés, corners, cartons. Ni minutes ni penalties : null.
 */
export function valeursDUneLigneFd(l) {
  const hg = Number(l.bd);
  const ag = Number(l.be);
  const v = valeursDuScore(hg, ag);
  const d = nombreOuNull(l.mtd);
  const e = nombreOuNull(l.mte);
  const mt = d !== null && e !== null && d <= hg && e <= ag ? d + e : null;
  v.buts_1re_mt = mt;
  v.buts_2e_mt = mt === null ? null : hg + ag - mt;
  v.penalties = null;
  v.penalties_tires = null;
  return valeursDesStatistiques(
    v,
    paireFd(l.corners_d, l.corners_e),
    paireFd(l.tirs_d, l.tirs_e),
    paireFd(l.cadres_d, l.cadres_e),
    cartonsFd(l.jaunes_d, l.jaunes_e, l.rouges_d, l.rouges_e)
  );
}

// ======================================================= une saison

export function nouvelAccumulateur() {
  return {
    matchs: 0,
    reperes: Object.fromEntries(REPERES.map((r) => [r.cle, { n: 0, s: 0, s2: 0, mois: r.mensuel ? {} : null }])),
    scores: {},
    premier: null,
    dernier: null
  };
}

/** Ajoute un match (ses valeurs, son jour) à une saison. */
export function ajouter(acc, valeurs, date) {
  acc.matchs++;
  const mois = String(date).slice(5, 7);
  for (const r of REPERES) {
    const v = valeurs[r.cle];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const c = acc.reperes[r.cle];
    c.n++;
    c.s += v;
    c.s2 += v * v;
    if (c.mois) {
      const m = (c.mois[mois] ??= [0, 0, 0]);
      m[0]++;
      m[1] += v;
      m[2] += v * v;
    }
  }
  const score = `${valeurs.buts_dom}-${valeurs.buts_ext}`;
  acc.scores[score] = (acc.scores[score] ?? 0) + 1;
  if (!acc.premier || date < acc.premier) acc.premier = date;
  if (!acc.dernier || date > acc.dernier) acc.dernier = date;
}

/** Moyenne et écart-type d'un match, à partir des sommes : { valeur, matchs, ecart }. */
export function moyenneEtEcart({ n, s, s2 }) {
  if (!n) return { valeur: null, matchs: 0, ecart: null };
  return { valeur: s / n, matchs: n, ecart: n > 1 ? Math.sqrt(Math.max(0, (s2 - (s * s) / n) / (n - 1))) : null };
}

/** Les sommes d'une ligne gardée (valeur, matchs, écart) : de quoi réunir des saisons sans rien relire. */
export function sommesDe({ valeur, matchs, ecart }) {
  const n = Number(matchs ?? 0);
  if (!n || valeur === null || valeur === undefined) return { n: 0, s: 0, s2: 0 };
  const s = Number(valeur) * n;
  return { n, s, s2: Number(ecart ?? 0) ** 2 * (n - 1) + (s * s) / n };
}

const reunir = (liste) => liste.reduce((t, x) => ({ n: t.n + x.n, s: t.s + x.s, s2: t.s2 + x.s2 }), { n: 0, s: 0, s2: 0 });

/** Les scores, du plus fréquent au moins fréquent (à égalité, le moins de buts d'abord). */
export function scoresTries(scores) {
  const total = (s) => s.split('-').reduce((t, x) => t + Number(x), 0);
  return Object.entries(scores ?? {}).sort((a, b) => b[1] - a[1] || total(a[0]) - total(b[0]) || a[0].localeCompare(b[0]));
}

// ======================================================= les sources

/** Le code football-data d'un championnat du magasin, ou null. */
export function codeFootballData(league) {
  for (const table of [FD_SAISONNIERS, FD_PAYS]) {
    const code = Object.keys(table).find((c) => table[c] === league);
    if (code) return code;
  }
  return null;
}

/** Le fichier football-data d'une saison : « mmz4281/2324/E0 » (saisonnier) ou « new/USA » (par pays). */
export function fichierFootballData(code, saison) {
  if (FD_PAYS[code]) return `new/${code}`;
  const m = String(saison).match(/^(\d{2})(\d{2})-(\d{2})$/);
  return m ? `mmz4281/${m[2]}${m[3]}/${code}` : `mmz4281/?/${code}`;
}

/** Année de début d'un libellé de saison (« 2023-24 » -> 2023, « 2026 » -> 2026). */
export const debutDuLibelle = (libelle) => {
  const m = String(libelle ?? '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
};

/** Une saison FotMob est-elle entière au magasin ? Commencée depuis son début. */
export const saisonEntiereAuMagasin = (league, season) => seasonBounds(league, season)[0] >= DEBUT_MAGASIN;

/**
 * UNE SAISON = UNE SEULE SOURCE. `fotmob` : [{ saison, debut, entiere }] ;
 * `fd` : [{ saison, debut }]. FotMob quand la saison y est entière ; sinon
 * football-data s'il la publie ; sinon FotMob (« saison partielle »).
 * Rend { retenues, ecartees } (chaque écartée avec sa raison).
 */
export function choisirLesSources({ fotmob = [], fd = [] }) {
  const entieres = new Set(fotmob.filter((s) => s.entiere).map((s) => s.debut));
  const fdDebuts = new Set(fd.map((s) => s.debut));
  const retenues = [];
  const ecartees = [];
  for (const s of fotmob) {
    if (s.entiere) retenues.push({ ...s, source: 'fotmob', partielle: false });
    else if (fdDebuts.has(s.debut)) ecartees.push({ ...s, source: 'fotmob', raison: 'saison commencée avant le magasin FotMob (janvier 2023) : football-data.co.uk l’a entière' });
    else retenues.push({ ...s, source: 'fotmob', partielle: true });
  }
  for (const s of fd) {
    if (entieres.has(s.debut)) ecartees.push({ ...s, source: 'football-data', raison: 'saison entière au magasin FotMob, qui fait foi' });
    else retenues.push({ ...s, source: 'football-data', partielle: false });
  }
  const ordre = (a, b) => b.debut - a.debut || String(b.saison).localeCompare(String(a.saison));
  return { retenues: retenues.sort(ordre), ecartees: ecartees.sort(ordre) };
}

// ======================================================= petits championnats

/**
 * La moyenne des championnats et la variance VRAIE entre eux, pour un repère
 * (méthode des moments) : `ligues` = [{ n, s, s2 }], chaque championnat
 * toutes saisons réunies. La variance observée entre les moyennes moins ce
 * que le hasard y met (variance d'un match / n) ; k = variance d'un match /
 * variance vraie : le poids, en matchs, de la moyenne des championnats.
 */
export function entreChampionnats(ligues) {
  const avec = ligues.filter((l) => l.n > 1);
  if (!avec.length) return null;
  const moyennes = avec.map((l) => l.s / l.n);
  const moyenne = moyennes.reduce((a, b) => a + b, 0) / moyennes.length;
  let somme = 0;
  let degres = 0;
  for (const l of avec) {
    somme += l.s2 - (l.s * l.s) / l.n;
    degres += l.n - 1;
  }
  const variance = degres > 0 ? Math.max(0, somme / degres) : 0;
  const bruit = avec.reduce((t, l) => t + variance / l.n, 0) / avec.length;
  const observee = avec.length > 1 ? moyennes.reduce((t, m) => t + (m - moyenne) ** 2, 0) / (avec.length - 1) : 0;
  const tau2 = Math.max(0, observee - bruit);
  const matchs = avec.reduce((t, l) => t + l.n, 0);
  // Variance vraie nulle : les championnats ne diffèrent pas plus que le hasard, la moyenne des championnats l'emporte (k plafonné).
  const k = Math.min(1e9, tau2 > 0 ? variance / tau2 : 1e9);
  return { moyenne, ligues: avec.length, matchs, parMatch: avec.reduce((t, l) => t + l.s, 0) / matchs, variance, tau2, k };
}

/** La valeur retenue d'un championnat : (n × sa moyenne + k × moyenne des championnats) / (n + k). */
export function retenir(valeur, n, general) {
  if (!general) return valeur ?? null;
  if (valeur === null || valeur === undefined || !n) return general.moyenne;
  return (n * valeur + general.k * general.moyenne) / (n + general.k);
}

/**
 * La variance VRAIE d'une saison à l'autre dans un même championnat (réunie
 * sur tous les championnats) : `parLigue` = [[{ n, s, s2 }, …] par saison].
 * Saisons d'au moins 30 matchs ; ce que le hasard met dans chaque moyenne
 * de saison est retiré.
 */
export function entreSaisons(parLigue) {
  let somme = 0;
  let degres = 0;
  for (const saisons of parLigue) {
    const assez = saisons.filter((x) => x.n >= MINIMUM_SAISON);
    if (assez.length < 2) continue;
    const tout = reunir(assez);
    const m = tout.s / tout.n;
    const variance = tout.n > 1 ? Math.max(0, (tout.s2 - (tout.s * tout.s) / tout.n) / (tout.n - 1)) : 0;
    for (const x of assez) somme += (x.s / x.n - m) ** 2 - variance / x.n;
    degres += assez.length - 1;
  }
  return degres > 0 ? Math.max(0, somme / degres) : 0;
}

// ======================================================= dispersion et facteur de terrain

/**
 * Les historiques par club, pour les fenêtres du moteur : chaque rencontre
 * qui a ses deux lignes team_stats (la jointure de statInputsRead.js), à
 * domicile et à l'extérieur, triées par jour. `rencontres` : [{ k, date, h, a,
 * stats: { home: { c, s, o }, away: { c, s, o } } }].
 */
export function preparerHistoriques(rencontres) {
  const parClub = new Map();
  for (const m of rencontres) {
    if (!m.h || !m.a || !m.stats?.home || !m.stats?.away) continue;
    for (const [id, cote] of [[m.h, 'home'], [m.a, 'away']]) {
      let e = parClub.get(id);
      if (!e) parClub.set(id, (e = { home: [], away: [] }));
      e[cote].push(m);
    }
  }
  const parJour = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  for (const e of parClub.values()) {
    e.home.sort(parJour);
    e.away.sort(parJour);
  }
  return parClub;
}

/** La statistique `col` est-elle relevée dans cette rencontre (ni absente, ni 0 des deux côtés) ? */
function relevee(m, col) {
  const d = m.stats.home[col];
  const e = m.stats.away[col];
  return d !== null && d !== undefined && e !== null && e !== undefined && !(Number(d) === 0 && Number(e) === 0);
}

function avantLeJour(liste, date) {
  let bas = 0;
  let haut = liste.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (liste[milieu].date < date) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

/**
 * Ce qu'un club produisait (`pour`) et concédait (`contre`) AVANT `date`, en
 * `col` : exactement la sélection de statInputsRead.moyennesEquipe — ses 30
 * dernières rencontres à domicile et ses 30 dernières à l'extérieur, réunies
 * du plus récent au plus ancien, les 10 premières où la statistique est
 * relevée, au moins 6. null sinon.
 */
export function fenetreAvant(historique, date, col) {
  if (!historique) return null;
  const dom = historique.home;
  const ext = historique.away;
  // Les deux listes sont triées par jour : on les parcourt ensemble à rebours,
  // du plus récent au plus ancien, sans rien recopier (des dizaines de
  // milliers de fenêtres par nuit).
  let i = avantLeJour(dom, date) - 1;
  let j = avantLeJour(ext, date) - 1;
  const iMin = Math.max(0, i + 1 - FENETRE_PAR_COTE);
  const jMin = Math.max(0, j + 1 - FENETRE_PAR_COTE);
  let n = 0;
  let pour = 0;
  let contre = 0;
  while (n < FENETRE_STATS && (i >= iMin || j >= jMin)) {
    const aDomicile = j < jMin || (i >= iMin && dom[i].date >= ext[j].date);
    const m = aDomicile ? dom[i--] : ext[j--];
    if (!relevee(m, col)) continue;
    pour += Number(aDomicile ? m.stats.home[col] : m.stats.away[col]);
    contre += Number(aDomicile ? m.stats.away[col] : m.stats.home[col]);
    n++;
  }
  return n >= MINIMUM_FENETRE ? { pour: pour / n, contre: contre / n, n } : null;
}

function nouvelleMesure() {
  const ratio = () => ({ sx: 0, se: 0, sxx: 0, sxe: 0, see: 0 });
  const moments = () => ({ sa: 0, sb: 0, saa: 0, sab: 0, sbb: 0 });
  return { n: 0, dom: ratio(), ext: ratio(), equipe: moments(), total: moments(), brut: { h: { s: 0, s2: 0 }, a: { s: 0, s2: 0 }, t: { s: 0, s2: 0 } } };
}

/**
 * Ajoute un match à la mesure : x = ce qui a été relevé, e = l'attendu
 * NEUTRE (sans facteur de terrain), mu = l'attendu du moteur (avec).
 */
export function ajouterALaMesure(z, { xh, xa, eh, ea }, facteur) {
  const muh = facteur.dom * eh;
  const mua = facteur.ext * ea;
  z.n++;
  for (const [r, x, e] of [[z.dom, xh, eh], [z.ext, xa, ea]]) {
    r.sx += x;
    r.se += e;
    r.sxx += x * x;
    r.sxe += x * e;
    r.see += e * e;
  }
  // Dispersion par équipe : le match est l'unité (ses deux équipes ne sont pas indépendantes).
  const a = (xh - muh) ** 2 - muh + (xa - mua) ** 2 - mua;
  const b = muh * muh + mua * mua;
  const xt = xh + xa;
  const mut = muh + mua;
  const at = (xt - mut) ** 2 - mut;
  const bt = mut * mut;
  for (const [m, va, vb] of [[z.equipe, a, b], [z.total, at, bt]]) {
    m.sa += va;
    m.sb += vb;
    m.saa += va * va;
    m.sab += va * vb;
    m.sbb += vb * vb;
  }
  z.brut.h.s += xh;
  z.brut.h.s2 += xh * xh;
  z.brut.a.s += xa;
  z.brut.a.s2 += xa * xa;
  z.brut.t.s += xt;
  z.brut.t.s2 += xt * xt;
}

/** Réunit deux mesures (tous les championnats). */
export function reunirMesures(liste) {
  const z = nouvelleMesure();
  for (const m of liste) {
    z.n += m.n;
    for (const cle of ['dom', 'ext', 'equipe', 'total']) for (const k of Object.keys(z[cle])) z[cle][k] += m[cle][k];
    for (const c of ['h', 'a', 't']) {
      z.brut[c].s += m.brut[c].s;
      z.brut[c].s2 += m.brut[c].s2;
    }
  }
  return z;
}

const correction = (n) => (n > 1 ? Math.sqrt(n / (n - 1)) : 1);

/** Facteur de terrain mesuré (Σ relevé / Σ attendu neutre) et son erreur type (estimateur de ratio). */
export function facteurMesure(r, n) {
  if (!n || !(r.se > 0)) return null;
  const f = r.sx / r.se;
  const residus = Math.max(0, r.sxx - 2 * f * r.sxe + f * f * r.see);
  return { valeur: f, se: (Math.sqrt(residus) / r.se) * correction(n) };
}

/** 1/k mesuré (méthode des moments autour de l'attendu du moteur) et son erreur type. */
export function dispersionMesuree(m, n) {
  if (!n || !(m.sb > 0)) return null;
  const k = m.sa / m.sb;
  const residus = Math.max(0, m.saa - 2 * k * m.sab + k * k * m.sbb);
  return { valeur: k, se: (Math.sqrt(residus) / m.sb) * correction(n) };
}

/**
 * La dispersion BRUTE : 1/k sur les comptes du championnat, autour de sa seule
 * moyenne (domicile et extérieur à part), sans l'attendu de chaque équipe.
 * Elle mêle l'écart entre équipes au hasard : toujours plus forte.
 */
export function dispersionBrute(z) {
  if (!z.n) return { equipe: null, total: null };
  const n = z.n;
  const partie = ({ s, s2 }) => {
    const m = s / n;
    return { num: s2 - n * m * m - n * m, den: n * m * m };
  };
  const h = partie(z.brut.h);
  const a = partie(z.brut.a);
  const t = partie(z.brut.t);
  return { equipe: h.den + a.den > 0 ? (h.num + a.num) / (h.den + a.den) : null, total: t.den > 0 ? t.num / t.den : null };
}

/**
 * La valeur RETENUE de chaque championnat : ramenée vers la mesure de tous les
 * championnats réunis d'autant plus que son erreur type est grande
 * (bayésien empirique : poids = τ² / (τ² + se²), τ² = variance vraie entre
 * championnats, mesures d'au moins 100 matchs). `mesures` : { ligue: { valeur, se, matchs } }.
 */
export function retenirLesMesures(mesures, reference) {
  const assez = Object.values(mesures).filter((m) => m && m.matchs >= MINIMUM_DISPERSION && Number.isFinite(m.se));
  let tau2 = 0;
  if (assez.length > 1) {
    const moyenne = assez.reduce((t, m) => t + m.valeur, 0) / assez.length;
    const observee = assez.reduce((t, m) => t + (m.valeur - moyenne) ** 2, 0) / (assez.length - 1);
    const bruit = assez.reduce((t, m) => t + m.se * m.se, 0) / assez.length;
    tau2 = Math.max(0, observee - bruit);
  }
  const out = {};
  for (const [ligue, m] of Object.entries(mesures)) {
    if (!m || reference === null || reference === undefined) {
      out[ligue] = m ? { ...m, retenue: m.valeur, poids: 1 } : null;
      continue;
    }
    const poids = tau2 + m.se * m.se > 0 ? tau2 / (tau2 + m.se * m.se) : 0;
    out[ligue] = { ...m, retenue: reference + poids * (m.valeur - reference), poids };
  }
  return { mesures: out, tau2 };
}

// ======================================================= écriture

const rendreLaMainParDefaut = () => new Promise((fin) => setImmediate(fin));

/** Les lignes d'une saison calculée, prêtes à écrire. */
export function lignesDUneSaison({ league, saison, debut, source, acc, detail, calculeLe }) {
  const lignes = [{ league, saison, repere: 'matchs', debut, valeur: acc.matchs, matchs: acc.matchs, ecart: null, source, detail, calcule_le: calculeLe }];
  for (const r of REPERES) {
    const c = acc.reperes[r.cle];
    const { valeur, matchs, ecart } = moyenneEtEcart(c);
    lignes.push({ league, saison, repere: r.cle, debut, valeur, matchs, ecart, source, detail: c.mois && Object.keys(c.mois).length ? { mois: c.mois } : null, calcule_le: calculeLe });
  }
  const scores = scoresTries(acc.scores);
  lignes.push({ league, saison, repere: 'scores', debut, valeur: scores.length, matchs: acc.matchs, ecart: null, source, detail: { scores }, calcule_le: calculeLe });
  return lignes;
}

function ecrireLignes(database, { effacer = [], lignes = [] }) {
  if (!effacer.length && !lignes.length) return;
  const suppression = database.prepare('DELETE FROM league_benchmarks WHERE league = ? AND saison = ?');
  const insertion = database.prepare(
    `INSERT INTO league_benchmarks (league, saison, repere, debut, valeur, matchs, ecart, source, detail, calcule_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (league, saison, repere) DO UPDATE SET debut = excluded.debut, valeur = excluded.valeur, matchs = excluded.matchs,
       ecart = excluded.ecart, source = excluded.source, detail = excluded.detail, calcule_le = excluded.calcule_le`
  );
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const [league, saison] of effacer) suppression.run(league, saison);
    for (const l of lignes) {
      insertion.run(l.league, l.saison, l.repere, l.debut ?? null, l.valeur ?? null, l.matchs ?? 0, l.ecart ?? null, l.source, l.detail === null || l.detail === undefined ? null : JSON.stringify(l.detail), l.calcule_le);
    }
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // déjà annulée
    }
    throw error;
  }
}

// ======================================================= lectures (calcul de nuit)

/**
 * Toutes les rencontres du magasin, en léger (clé, championnat, jour, date
 * de mise à jour : le début de chaque ligne, jamais les colonnes JSON), par
 * tranches de 5 000 dans l'ordre de la clé — une lecture par championnat
 * passait par l'index puis par la table, ligne à ligne : 5 s au lieu de 0,2.
 */
async function lireLeMagasin(database, siLongtemps) {
  const parLigue = new Map();
  const tranche = database.prepare('SELECT match_key AS k, league, date, updated_at AS u FROM matches WHERE match_key > ? ORDER BY match_key LIMIT 5000');
  let apres = '';
  for (;;) {
    const lignes = tranche.all(apres);
    if (!lignes.length) break;
    for (const r of lignes) {
      let l = parLigue.get(r.league);
      if (!l) parLigue.set(r.league, (l = []));
      l.push(r);
    }
    apres = lignes.at(-1).k;
    await siLongtemps('lecture légère du magasin');
  }
  return parLigue;
}

/** Les saisons FotMob d'un championnat et leur empreinte (clé et date de mise à jour de chaque rencontre, dans l'ordre des clés). */
export function saisonsFotmob(league, rencontres) {
  const parSaison = new Map();
  for (const r of rencontres ?? []) {
    const season = seasonOf(league, r.date);
    let s = parSaison.get(season);
    if (!s) parSaison.set(season, (s = { season, lignes: [] }));
    s.lignes.push(`${r.k}|${r.u ?? ''}|${r.date}`);
  }
  return [...parSaison.values()].map((s) => ({
    season: s.season,
    saison: seasonLabel(league, s.season),
    debut: s.season,
    entiere: saisonEntiereAuMagasin(league, s.season),
    rencontres: s.lignes.length,
    empreinte: createHash('sha1').update(`v${VERSION_REPERES}\n${s.lignes.join('\n')}`).digest('hex')
  }));
}

const COLONNES_FD = 'id, saison, date, bd, be, mtd, mte, tirs_d, tirs_e, cadres_d, cadres_e, corners_d, corners_e, jaunes_d, jaunes_e, rouges_d, rouges_e';

/**
 * Les saisons football-data d'un code, avec leurs lignes et leur empreinte
 * (nombre de lignes, plus grand identifiant : un fichier relu remplace ses
 * lignes). Les repères d'une saison ne se calculent qu'à la demande
 * (accumulerFd) : la nuit, seulement celles qui ont changé et celles du
 * recoupement. Lues par tranches de trois ans (index code + jour) : le
 * serveur reprend la main entre deux, même quand le disque est froid.
 */
export async function saisonsFootballData(database, code, siLongtemps = async () => {}) {
  if (!code) return [];
  let tranche;
  try {
    tranche = database.prepare(`SELECT ${COLONNES_FD} FROM fd_history WHERE code = ? AND date >= ? AND date < ?`);
  } catch (error) {
    // Base d'avant l'étape 13 (pas de table fd_history) : aucune saison football-data.
    if (/no such table/i.test(error.message)) return [];
    throw error;
  }
  const parSaison = new Map();
  const derniere = new Date().getUTCFullYear() + 2;
  for (let annee = 1999; annee <= derniere; annee += 3) {
    for (const l of tranche.all(code, `${annee}-01-01`, `${annee + 3}-01-01`)) {
      let s = parSaison.get(l.saison);
      if (!s) parSaison.set(l.saison, (s = { saison: l.saison, debut: debutDuLibelle(l.saison), lignes: [], acc: null, n: 0, maxId: 0 }));
      s.n++;
      if (l.id > s.maxId) s.maxId = l.id;
      s.lignes.push(l);
    }
    await siLongtemps(`football-data ${code} · ${annee}-${annee + 2}`);
  }
  return [...parSaison.values()]
    .filter((s) => s.debut !== null)
    .map((s) => ({ ...s, code, fichier: fichierFootballData(code, s.saison), empreinte: createHash('sha1').update(`v${VERSION_REPERES}|${code}|${s.saison}|${s.n}|${s.maxId}`).digest('hex') }));
}

/** Les repères d'une saison football-data (calculés une fois). Une ligne sans score ne compte pas. */
export function accumulerFd(s) {
  if (!s.acc) {
    s.acc = nouvelAccumulateur();
    for (const l of s.lignes) {
      if (l.bd === null || l.bd === undefined || l.be === null || l.be === undefined) continue;
      ajouter(s.acc, valeursDUneLigneFd(l), l.date);
    }
  }
  return s.acc;
}

/** Les mois d'une saison, [début, fin) : la saison se lit mois par mois (le serveur reprend la main entre deux). */
export function moisDeLaSaison(league, season) {
  const [debut, fin] = seasonBounds(league, season);
  const out = [];
  let a = Number(debut.slice(0, 4));
  let m = Number(debut.slice(5, 7));
  for (let d = debut; d < fin; ) {
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
    const suivant = `${a}-${String(m).padStart(2, '0')}-01`;
    out.push([d, suivant < fin ? suivant : fin]);
    d = suivant;
  }
  return out;
}

/** Les rencontres d'un championnat entre deux jours [debut, fin), avec leur déroulé, leur carte des tirs et leurs statistiques. */
function rencontresEntre(database, league, debut, fin) {
  const cols = [C_CORNERS, C_TIRS, C_CADRES, C_JAUNES, C_ROUGES];
  const selection = cols.map((c) => `th."${c}" AS "h_${c}", ta."${c}" AS "a_${c}"`).join(', ');
  return database
    .prepare(
      `SELECT m.match_key AS k, m.date, m.home_goals AS hg, m.away_goals AS ag, m.events, m.meta, m.shotmap,
              th.match_key AS th_cle, ta.match_key AS ta_cle, ${selection}
       FROM matches m
       LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
       LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
       WHERE m.league = ? AND m.date >= ? AND m.date < ?`
    )
    .all(league, debut, fin)
    .map((r) => {
      const stats = r.th_cle && r.ta_cle ? { home: Object.fromEntries(cols.map((c) => [c, r[`h_${c}`]])), away: Object.fromEntries(cols.map((c) => [c, r[`a_${c}`]])) } : null;
      return { k: r.k, date: r.date, homeGoals: r.hg, awayGoals: r.ag, events: parse(r.events), meta: parse(r.meta) ?? {}, shotmap: parse(r.shotmap), stats };
    });
}

function parse(texte) {
  if (texte === null || texte === undefined || texte === '') return null;
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

/** Une saison FotMob qui se calcule : l'accumulateur, les rencontres écartées (comptées par raison, et leurs clés). */
const nouvelleSaisonFotmob = () => ({ acc: nouvelAccumulateur(), exclus: { attribues: 0, nonJoues: 0, horsClassement: 0, prolongations: 0 }, exclusCles: [] });

function ajouterRencontre(etat, r) {
  const raison = exclusionDUneRencontre(r);
  if (raison) {
    etat.exclus[raison]++;
    etat.exclusCles.push(r.k);
    return;
  }
  ajouter(etat.acc, valeursDUneRencontre(r), r.date);
}

/** Une saison FotMob calculée d'un coup (rencontres déjà lues). */
export function calculerSaisonFotmob(rencontres) {
  const etat = nouvelleSaisonFotmob();
  for (const r of rencontres) ajouterRencontre(etat, r);
  etat.exclusCles.sort();
  return etat;
}

/** Une saison FotMob lue et calculée MOIS PAR MOIS : jamais plus d'un mois de feuilles de match d'un bloc. */
async function calculerSaisonFotmobParMois(database, league, season, siLongtemps) {
  const etat = nouvelleSaisonFotmob();
  for (const [debut, fin] of moisDeLaSaison(league, season)) {
    for (const r of rencontresEntre(database, league, debut, fin)) ajouterRencontre(etat, r);
    await siLongtemps(`${league} · ${debut.slice(0, 7)}`);
  }
  etat.exclusCles.sort();
  return etat;
}

/** Les lignes gardées d'un championnat : { saison: { repere: ligne } }. */
function lignesGardees(database, league) {
  const out = new Map();
  for (const r of database.prepare('SELECT * FROM league_benchmarks WHERE league = ?').all(league)) {
    let s = out.get(r.saison);
    if (!s) out.set(r.saison, (s = {}));
    s[r.repere] = { ...r, detail: parse(r.detail) };
  }
  return out;
}

/** Les sommes de chaque repère d'une saison gardée (lignes de la table). */
function sommesDUneSaison(lignes) {
  const out = {};
  for (const r of REPERES) {
    const l = lignes?.[r.cle];
    out[r.cle] = l ? { ...sommesDe(l), mois: l.detail?.mois ?? null } : { n: 0, s: 0, s2: 0, mois: null };
  }
  return out;
}

/** Les sommes d'un accumulateur, au même format. */
function sommesDUnAccumulateur(acc) {
  return Object.fromEntries(REPERES.map((r) => [r.cle, { n: acc.reperes[r.cle].n, s: acc.reperes[r.cle].s, s2: acc.reperes[r.cle].s2, mois: acc.reperes[r.cle].mois }]));
}

function reunirMois(liste) {
  const out = {};
  for (const mois of liste) {
    if (!mois) continue;
    for (const [m, [n, s, s2]] of Object.entries(mois)) {
      const t = (out[m] ??= [0, 0, 0]);
      t[0] += n;
      t[1] += s;
      t[2] += s2;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Le RECOUPEMENT des deux sources sur les saisons qu'elles ont toutes les deux
 * (finies, au magasin depuis 2023) : pour chaque repère, la valeur FotMob,
 * la valeur football-data (mêmes saisons réunies) et l'écart.
 */
export function recoupement(fotmob, fd, saisons) {
  if (!saisons.length) return null;
  const out = {};
  for (const r of REPERES) {
    const a = moyenneEtEcart(reunir(fotmob.map((s) => s[r.cle])));
    const b = moyenneEtEcart(reunir(fd.map((s) => s[r.cle])));
    if (!a.matchs || !b.matchs) continue;
    out[r.cle] = { fotmob: a.valeur, footballData: b.valeur, ecart: b.valeur - a.valeur, matchsFotmob: a.matchs, matchsFootballData: b.matchs };
  }
  return { saisons, reperes: out };
}

/**
 * Le CALCUL DE NUIT (étape « reperes » de l'actualisation) : chaque
 * championnat, chaque saison (une source chacune), seulement ce qui a changé
 * (sauf `tout`) ; puis les moyennes de toutes les saisons, la moyenne des
 * championnats, les valeurs retenues, le recoupement des deux sources ; puis
 * la dispersion et le facteur de terrain. Rend la main au serveur entre deux
 * saisons et dans les boucles longues (`rendreLaMain`). Écrit dans la base :
 * à lancer sous le verrou d'actualisation (la passe le tient).
 */
export async function calculerReperes({ database = openDb(), maintenant = new Date(), tout = false, rendreLaMain = rendreLaMainParDefaut, journal = null } = {}) {
  const debut = Date.now();
  const calculeLe = maintenant.toISOString();
  let dernierePause = Date.now();
  // Le plus long moment passé sans rendre la main, et ce qui l'a pris : la preuve que le serveur n'est jamais figé.
  let blocMax = { ms: 0, ou: null };
  let pauses = 0;
  const pause = async (ou) => {
    const ms = Date.now() - dernierePause;
    if (ms > blocMax.ms) blocMax = { ms, ou: ou ?? null };
    pauses++;
    await rendreLaMain();
    dernierePause = Date.now();
  };
  const siLongtemps = async (ou) => {
    if (Date.now() - dernierePause > 25) await pause(ou);
  };

  const bilan = {
    championnats: 0,
    saisons: { fotmob: 0, footballData: 0, partielles: 0 },
    recalculees: { fotmob: 0, footballData: 0 },
    inchangees: 0,
    retirees: 0,
    ecartees: 0,
    matchs: { fotmob: 0, footballData: 0 },
    lignesEcrites: 0
  };
  const magasin = await lireLeMagasin(database, siLongtemps);
  const ligues = [...magasin.keys()].filter((l) => l && !isCup(l)).sort((a, b) => a.localeCompare(b, 'fr'));
  await pause('liste des championnats');
  const parLigue = new Map();
  // Le temps passé dans chaque partie du calcul (millisecondes), pour le bilan de la passe.
  const etapesMs = { empreintes: 0, footballData: 0, saisons: 0, toutes: 0, dispersion: 0, ecriture: 0 };
  const chrono = (partie, debutPartie) => {
    etapesMs[partie] += Date.now() - debutPartie;
  };

  // 1. Saison par saison, une source chacune ; seulement ce qui a changé.
  for (const league of ligues) {
    const code = codeFootballData(league);
    let t = Date.now();
    const fotmob = saisonsFotmob(league, magasin.get(league));
    chrono('empreintes', t);
    await siLongtemps(`empreintes FotMob · ${league}`);
    t = Date.now();
    const fd = await saisonsFootballData(database, code, siLongtemps);
    chrono('footballData', t);
    await siLongtemps(`football-data ${code ?? '—'} · ${league}`);
    t = Date.now();
    const { retenues, ecartees } = choisirLesSources({ fotmob, fd });
    const gardees = lignesGardees(database, league);
    const aEcrire = [];
    const effacer = [];
    for (const s of retenues) {
      const ancienne = gardees.get(s.saison)?.matchs?.detail ?? null;
      const inchangee = !tout && ancienne && ancienne.version === VERSION_REPERES && ancienne.source === s.source && ancienne.empreinte === s.empreinte;
      if (s.source === 'fotmob') bilan.saisons.fotmob++;
      else bilan.saisons.footballData++;
      if (s.partielle) bilan.saisons.partielles++;
      if (inchangee) {
        bilan.inchangees++;
        continue;
      }
      let acc;
      let detail;
      if (s.source === 'fotmob') {
        const calcul = await calculerSaisonFotmobParMois(database, league, s.season, siLongtemps);
        acc = calcul.acc;
        detail = { version: VERSION_REPERES, source: 'fotmob', empreinte: s.empreinte, rencontres: s.rencontres, exclus: calcul.exclus, exclusCles: calcul.exclusCles, premier: acc.premier, dernier: acc.dernier, entiere: s.entiere };
        bilan.recalculees.fotmob++;
      } else {
        acc = accumulerFd(s);
        detail = { version: VERSION_REPERES, source: 'football-data', empreinte: s.empreinte, rencontres: s.n, code: s.code, fichier: s.fichier, premier: acc.premier, dernier: acc.dernier };
        bilan.recalculees.footballData++;
      }
      effacer.push([league, s.saison]);
      aEcrire.push(...lignesDUneSaison({ league, saison: s.saison, debut: s.debut, source: s.source, acc, detail, calculeLe }));
      if (aEcrire.length >= 300) {
        bilan.lignesEcrites += aEcrire.length;
        ecrireLignes(database, { effacer: effacer.splice(0), lignes: aEcrire.splice(0) });
        await pause(`écriture · ${league}`);
      } else {
        await siLongtemps(`saison ${s.saison} (${s.source}) · ${league}`);
      }
    }
    // Les saisons gardées qui ne sont plus retenues (remplacées par FotMob, disparues) : retirées.
    const retenuesNoms = new Set(retenues.map((s) => s.saison));
    for (const saison of gardees.keys()) {
      if (saison === TOUTES || retenuesNoms.has(saison)) continue;
      effacer.push([league, saison]);
      bilan.retirees++;
    }
    bilan.lignesEcrites += aEcrire.length;
    ecrireLignes(database, { effacer, lignes: aEcrire });
    bilan.ecartees += ecartees.length;
    bilan.championnats++;
    chrono('saisons', t);
    parLigue.set(league, { code, retenues, ecartees, fd });
    await pause(`fin · ${league}`);
  }

  // 2. Toutes les saisons de chaque championnat, la moyenne des championnats, les valeurs retenues, le recoupement.
  let t = Date.now();
  const reunies = new Map();
  for (const league of ligues) {
    const gardees = lignesGardees(database, league);
    const { retenues, ecartees, fd } = parLigue.get(league);
    const saisons = retenues.map((s) => ({ s, sommes: sommesDUneSaison(gardees.get(s.saison)), lignes: gardees.get(s.saison) })).filter((x) => x.lignes?.matchs);
    const tout = Object.fromEntries(REPERES.map((r) => [r.cle, { ...reunir(saisons.map((x) => x.sommes[r.cle])), mois: reunirMois(saisons.map((x) => x.sommes[r.cle].mois)) }]));
    const scores = {};
    for (const x of saisons) for (const [score, n] of x.lignes.scores?.detail?.scores ?? []) scores[score] = (scores[score] ?? 0) + n;
    // Recoupement : les saisons finies qu'ont les deux sources (football-data écartée parce que FotMob l'a entière).
    const courante = currentSeason(league, maintenant);
    const communes = ecartees.filter((e) => e.source === 'football-data' && e.debut !== courante && saisons.some((x) => x.s.saison === e.saison && x.s.source === 'fotmob'));
    const fdParSaison = new Map(fd.map((f) => [f.saison, f]));
    const croise = recoupement(
      communes.map((e) => saisons.find((x) => x.s.saison === e.saison).sommes),
      communes.map((e) => sommesDUnAccumulateur(accumulerFd(fdParSaison.get(e.saison)))),
      communes.map((e) => e.saison).sort()
    );
    reunies.set(league, { tout, scores, saisons, croise, ecartees });
    await siLongtemps(`toutes saisons · ${league}`);
  }
  const general = {};
  for (const r of REPERES) {
    general[r.cle] = entreChampionnats(ligues.map((l) => reunies.get(l).tout[r.cle]));
    general[r.cle] &&= { ...general[r.cle], tau2Saisons: entreSaisons(ligues.map((l) => reunies.get(l).saisons.map((x) => x.sommes[r.cle]))) };
  }
  const lignesToutes = [];
  for (const league of ligues) {
    const { tout, scores, saisons, croise, ecartees } = reunies.get(league);
    const n = saisons.reduce((t, x) => t + (x.lignes.matchs?.matchs ?? 0), 0);
    const sources = { fotmob: saisons.filter((x) => x.s.source === 'fotmob').length, 'football-data': saisons.filter((x) => x.s.source === 'football-data').length };
    const source = sources.fotmob && sources['football-data'] ? 'fotmob+football-data' : sources.fotmob ? 'fotmob' : 'football-data';
    const libelles = saisons.map((x) => x.s.saison);
    lignesToutes.push({
      league,
      saison: TOUTES,
      repere: 'matchs',
      debut: null,
      valeur: n,
      matchs: n,
      ecart: null,
      source,
      detail: { version: VERSION_REPERES, saisons: saisons.length, sources, premiere: libelles.at(-1) ?? null, derniere: libelles[0] ?? null, recoupement: croise, ecartees: ecartees.map((e) => ({ saison: e.saison, source: e.source, raison: e.raison })) },
      calcule_le: calculeLe
    });
    for (const r of REPERES) {
      const { valeur, matchs, ecart } = moyenneEtEcart(tout[r.cle]);
      const g = general[r.cle];
      lignesToutes.push({
        league,
        saison: TOUTES,
        repere: r.cle,
        debut: null,
        valeur,
        matchs,
        ecart,
        source,
        detail: { retenue: matchs ? retenir(valeur, matchs, g) : null, k: g?.k ?? null, poids: matchs && g ? matchs / (matchs + g.k) : null, mois: tout[r.cle].mois },
        calcule_le: calculeLe
      });
    }
    const tries = scoresTries(scores);
    lignesToutes.push({ league, saison: TOUTES, repere: 'scores', debut: null, valeur: tries.length, matchs: n, ecart: null, source, detail: { scores: tries }, calcule_le: calculeLe });
  }
  for (const r of REPERES) {
    const g = general[r.cle];
    lignesToutes.push({
      league: GENERAL,
      saison: TOUTES,
      repere: r.cle,
      debut: null,
      valeur: g?.moyenne ?? null,
      matchs: g?.matchs ?? 0,
      ecart: g ? Math.sqrt(g.variance) : null,
      source: 'fotmob+football-data',
      detail: g ? { ligues: g.ligues, parMatch: g.parMatch, variance: g.variance, tau2: g.tau2, k: g.k, tau2Saisons: g.tau2Saisons } : null,
      calcule_le: calculeLe
    });
  }
  lignesToutes.push({ league: GENERAL, saison: TOUTES, repere: 'matchs', debut: null, valeur: ligues.length, matchs: ligues.reduce((t, l) => t + reunies.get(l).saisons.reduce((u, x) => u + (x.lignes.matchs?.matchs ?? 0), 0), 0), ecart: null, source: 'fotmob+football-data', detail: { version: VERSION_REPERES, ligues }, calcule_le: calculeLe });
  chrono('toutes', t);
  await pause('moyenne des championnats');

  // 3. Dispersion et facteur de terrain, hors échantillon (FotMob).
  t = Date.now();
  const dispersion = await mesurerDispersion(database, { ligues, parLigue: reunies, magasin, siLongtemps, pause });
  for (const ligne of lignesDeDispersion(dispersion, calculeLe)) lignesToutes.push(ligne);
  chrono('dispersion', t);
  t = Date.now();

  // Les lignes « toutes » et la dispersion, d'un bloc (une ligue disparue du magasin perd les siennes).
  const anciennes = database.prepare('SELECT DISTINCT league FROM league_benchmarks WHERE saison = ?').all(TOUTES).map((r) => r.league);
  const effacer = [...new Set([...anciennes, ...ligues, GENERAL])].map((l) => [l, TOUTES]);
  for (const l of database.prepare('SELECT DISTINCT league FROM league_benchmarks').all().map((r) => r.league)) {
    if (l !== GENERAL && !ligues.includes(l)) {
      for (const s of database.prepare('SELECT DISTINCT saison FROM league_benchmarks WHERE league = ?').all(l)) effacer.push([l, s.saison]);
    }
  }
  ecrireLignes(database, { effacer, lignes: lignesToutes });
  bilan.lignesEcrites += lignesToutes.length;
  chrono('ecriture', t);
  await pause('écriture des lignes « toutes »');

  for (const league of ligues) {
    for (const x of reunies.get(league).saisons) {
      if (x.s.source === 'fotmob') bilan.matchs.fotmob += x.lignes.matchs.matchs;
      else bilan.matchs.footballData += x.lignes.matchs.matchs;
    }
  }
  const resume = resumeDispersion(dispersion);
  journal?.(`[repères] ${bilan.championnats} championnats, ${bilan.recalculees.fotmob + bilan.recalculees.footballData} saison(s) recalculée(s) en ${Date.now() - debut} ms`);
  const dernier = Date.now() - dernierePause;
  if (dernier > blocMax.ms) blocMax = { ms: dernier, ou: 'bilan' };
  return { ...bilan, dispersion: resume, dureeMs: Date.now() - debut, etapesMs, blocMaxMs: blocMax.ms, blocMaxOu: blocMax.ou, pauses, calculeLe };
}

/**
 * Les rencontres pour la dispersion, sans toucher aux grosses colonnes : le
 * championnat et le jour de la lecture légère du magasin, les clubs par les
 * index home_id / away_id, les trois statistiques dans team_stats (par
 * tranches).
 */
async function lireRencontresPourDispersion(database, magasin, siLongtemps) {
  const info = new Map();
  for (const [league, rencontres] of magasin) for (const r of rencontres) info.set(r.k, { k: r.k, league, date: r.date, h: null, a: null, stats: null });
  await siLongtemps('dispersion : rencontres');
  // Les clubs, par leurs index (couvrants : jamais la table), par tranches de 10 000.
  for (const [colonne, champ] of [['home_id', 'h'], ['away_id', 'a']]) {
    const tranche = database.prepare(
      `SELECT match_key AS k, ${colonne} AS id FROM matches WHERE ${colonne} IS NOT NULL AND (${colonne}, match_key) > (?, ?) ORDER BY ${colonne}, match_key LIMIT 10000`
    );
    let apres = ['', ''];
    for (;;) {
      const lignes = tranche.all(...apres);
      if (!lignes.length) break;
      for (const r of lignes) {
        const m = info.get(r.k);
        if (m) m[champ] = r.id;
      }
      apres = [lignes.at(-1).id, lignes.at(-1).k];
      await siLongtemps(`dispersion : index ${colonne}`);
    }
  }
  const tranche = database.prepare(
    `SELECT match_key AS k, side, "${C_CORNERS}" AS c, "${C_TIRS}" AS s, "${C_CADRES}" AS o FROM team_stats
     WHERE match_key > ? ORDER BY match_key LIMIT 10000`
  );
  let apres = '';
  for (;;) {
    const lignes = tranche.all(apres);
    if (!lignes.length) break;
    for (const r of lignes) {
      const m = info.get(r.k);
      if (!m) continue;
      m.stats ??= {};
      m.stats[r.side] = { c: r.c, s: r.s, o: r.o };
    }
    apres = lignes.at(-1).k;
    await siLongtemps('dispersion : team_stats');
  }
  for (const m of info.values()) if (m.stats && (!m.stats.home || !m.stats.away)) m.stats = null;
  return info;
}

/**
 * Les historiques des clubs tels que le calcul de nuit les lit (lecture
 * légère du magasin, index des clubs, team_stats) : pour les essais, qui
 * comparent ses fenêtres à celles du moteur (statInputsRead.js).
 */
export async function historiquesDuMagasin(database = openDb()) {
  const rien = async () => {};
  const magasin = await lireLeMagasin(database, rien);
  const rencontres = await lireRencontresPourDispersion(database, magasin, rien);
  return { rencontres, historiques: preparerHistoriques([...rencontres.values()]) };
}

/**
 * Mesure, championnat par championnat, le facteur de terrain et la
 * dispersion des corners, tirs et tirs cadrés autour de l'attendu du moteur,
 * hors échantillon. Les rencontres mesurées : celles des championnats qui
 * comptent (les écartées des saisons FotMob ne le sont pas), où la
 * statistique est relevée et où les deux clubs ont leur fenêtre.
 */
async function mesurerDispersion(database, { ligues, parLigue, magasin, siLongtemps, pause }) {
  const info = await lireRencontresPourDispersion(database, magasin, siLongtemps);
  const historiques = preparerHistoriques([...info.values()]);
  await pause('dispersion : historiques des clubs');
  const facteur = facteurTerrainDuMoteur();
  const exclues = new Set();
  for (const league of ligues) {
    for (const x of parLigue.get(league).saisons) for (const k of x.lignes.matchs?.detail?.exclusCles ?? []) exclues.add(k);
  }
  const fotmobSaisons = new Map(ligues.map((l) => [l, new Set(parLigue.get(l).saisons.filter((x) => x.s.source === 'fotmob').map((x) => x.s.saison))]));
  const mesures = Object.fromEntries(STATISTIQUES.map((st) => [st.cle, new Map()]));
  let compte = 0;
  for (const m of info.values()) {
    if (!m.stats || !m.h || !m.a || exclues.has(m.k)) continue;
    const saisons = fotmobSaisons.get(m.league);
    if (!saisons || !saisons.has(seasonLabel(m.league, seasonOf(m.league, m.date)))) continue;
    for (const st of STATISTIQUES) {
      const x = paireRelevee(m.stats.home[st.colonne], m.stats.away[st.colonne]);
      if (!x) continue;
      const h = fenetreAvant(historiques.get(m.h), m.date, st.colonne);
      const a = fenetreAvant(historiques.get(m.a), m.date, st.colonne);
      if (!h || !a) continue;
      let z = mesures[st.cle].get(m.league);
      if (!z) mesures[st.cle].set(m.league, (z = nouvelleMesure()));
      ajouterALaMesure(z, { xh: x[0], xa: x[1], eh: (h.pour + a.contre) / 2, ea: (a.pour + h.contre) / 2 }, facteur);
    }
    if (++compte % 500 === 0) await siLongtemps('dispersion : fenêtres');
  }
  return { mesures, facteur, ligues };
}

const ic95 = (m) => (m ? [m.valeur - 1.96 * m.se, m.valeur + 1.96 * m.se] : null);

/** Les mesures d'une statistique, prêtes à garder : par championnat et réunies, avec la valeur retenue. */
export function resultatsDeDispersion({ mesures, facteur }) {
  const out = {};
  for (const st of STATISTIQUES) {
    const constantes = STAT_KINDS[st.moteur];
    const parLigue = mesures[st.cle];
    const reunie = reunirMesures([...parLigue.values()]);
    const moteur = { dom: facteur.dom, ext: facteur.ext, equipe: constantes.invKTeam, total: constantes.invKTotal };
    const mesurer = (z) => {
      const brute = dispersionBrute(z);
      return {
        matchs: z.n,
        dom: facteurMesure(z.dom, z.n),
        ext: facteurMesure(z.ext, z.n),
        equipe: dispersionMesuree(z.equipe, z.n),
        total: dispersionMesuree(z.total, z.n),
        brute
      };
    };
    const general = mesurer(reunie);
    const ligues = Object.fromEntries([...parLigue.entries()].map(([l, z]) => [l, mesurer(z)]));
    const resultat = { moteur, general, ligues: {} };
    for (const l of Object.keys(ligues)) resultat.ligues[l] = { matchs: ligues[l].matchs, brute: ligues[l].brute };
    for (const quoi of ['dom', 'ext', 'equipe', 'total']) {
      const { mesures: retenues, tau2 } = retenirLesMesures(
        Object.fromEntries(Object.entries(ligues).map(([l, m]) => [l, m[quoi] ? { ...m[quoi], matchs: m.matchs } : null])),
        general[quoi]?.valeur ?? null
      );
      resultat[`tau2_${quoi}`] = tau2;
      for (const l of Object.keys(ligues)) resultat.ligues[l][quoi] = retenues[l];
    }
    out[st.cle] = resultat;
  }
  return out;
}

/** Les lignes de la dispersion (saison « toutes »), par championnat et pour tous réunis. */
function lignesDeDispersion(dispersion, calculeLe) {
  const res = resultatsDeDispersion(dispersion);
  const lignes = [];
  for (const st of STATISTIQUES) {
    const r = res[st.cle];
    const pousser = (league, quoi, m, brute, matchs, tau2) => {
      const moteur = r.moteur[quoi];
      lignes.push({
        league,
        saison: TOUTES,
        repere: `${quoi === 'dom' || quoi === 'ext' ? 'terrain' : 'dispersion'}_${st.cle}_${quoi}`,
        debut: null,
        valeur: m?.valeur ?? null,
        matchs: matchs ?? 0,
        ecart: m?.se ?? null,
        source: 'fotmob',
        detail: m
          ? { moteur, ic95: ic95(m), retenue: m.retenue ?? m.valeur, poids: m.poids ?? 1, ecartAuMoteur: m.se > 0 ? (m.valeur - moteur) / m.se : null, brute: brute ?? null, tau2: tau2 ?? null }
          : { moteur },
        calcule_le: calculeLe
      });
    };
    for (const quoi of ['dom', 'ext', 'equipe', 'total']) {
      const brute = quoi === 'equipe' ? r.general.brute.equipe : quoi === 'total' ? r.general.brute.total : null;
      pousser(GENERAL, quoi, r.general[quoi] ? { ...r.general[quoi], retenue: r.general[quoi].valeur, poids: 1 } : null, brute, r.general.matchs, r[`tau2_${quoi}`]);
      for (const [l, m] of Object.entries(r.ligues)) {
        const b = quoi === 'equipe' ? m.brute.equipe : quoi === 'total' ? m.brute.total : null;
        pousser(l, quoi, m[quoi], b, m.matchs, null);
      }
    }
  }
  return lignes;
}

function resumeDispersion(dispersion) {
  const res = resultatsDeDispersion(dispersion);
  const out = {};
  for (const st of STATISTIQUES) {
    const r = res[st.cle];
    const g = r.general;
    const loin = Object.entries(r.ligues)
      .filter(([, m]) => m.equipe && m.matchs >= MINIMUM_DISPERSION)
      .map(([l, m]) => ({ league: l, mesure: m.equipe.valeur, se: m.equipe.se, z: m.equipe.se > 0 ? (m.equipe.valeur - r.moteur.equipe) / m.equipe.se : null }))
      .sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))
      .slice(0, 3);
    out[st.cle] = {
      matchs: g.matchs,
      dom: g.dom?.valeur ?? null,
      ext: g.ext?.valeur ?? null,
      equipe: g.equipe?.valeur ?? null,
      total: g.total?.valeur ?? null,
      bruteEquipe: g.brute.equipe,
      moteur: r.moteur,
      plusLoin: loin
    };
  }
  return out;
}

// ======================================================= lectures (route, étape 14)

/** Une ligne de la table, lue. */
const lue = (r) => ({ valeur: r.valeur, matchs: r.matchs, ecart: r.ecart, detail: parse(r.detail) });

/**
 * Pourquoi une case est vide : la source ne relève pas ce repère, ou aucune
 * feuille de la saison ne le porte.
 */
export function raisonNonReleve(r, source, code) {
  if (source === 'football-data') {
    if (r.fotmobSeul) return 'non relevé par football-data.co.uk';
    if (FD_PAYS[code]) return 'pas dans le fichier par pays de football-data.co.uk (score final seulement)';
    return 'non relevé dans ce fichier football-data.co.uk';
  }
  if (r.cle === 'penalties_tires') return 'pas de carte des tirs FotMob pour ces matchs';
  return 'aucune feuille FotMob avec ce relevé';
}

const moisDe = (mois) =>
  Object.entries(mois ?? {})
    .map(([m, [n, s]]) => ({ mois: m, matchs: n, valeur: n ? s / n : null }))
    .sort((a, b) => a.mois.localeCompare(b.mois));

/**
 * Les repères d'un championnat, tels que la route les rend : chaque saison
 * (la plus récente d'abord), toutes les saisons réunies (avec la valeur
 * retenue), la moyenne des championnats, la dispersion et le facteur de
 * terrain, la provenance. Lecture seule ; jamais calculé, coupe, championnat
 * inconnu : `etat` le dit et la forme reste la même.
 */
export function lireReperes(league, { database = openDb(), maintenant = new Date() } = {}) {
  const definitions = REPERES.map((r) => ({ cle: r.cle, libelle: r.libelle, court: r.court, type: r.type, famille: r.famille, mensuel: r.mensuel, fotmobSeul: r.fotmobSeul, signe: Boolean(r.signe) }));
  const vide = { league, definitions, sources: SOURCES, statistiques: STATISTIQUES.map((s) => ({ cle: s.cle, libelle: s.libelle })), saisons: [], toutes: null, general: null, dispersion: null, calculeLe: null, version: VERSION_REPERES };
  let lignes;
  try {
    lignes = database.prepare('SELECT * FROM league_benchmarks WHERE league IN (?, ?)').all(league, GENERAL);
  } catch (error) {
    if (/no such table/i.test(error.message)) return { ...vide, etat: 'jamais', raison: 'le serveur n’a pas encore calculé les repères (table absente)' };
    throw error;
  }
  if (isCup(league)) {
    return { ...vide, etat: 'coupe', raison: 'les coupes sont tenues à part (terrain neutre, prolongations, tirs au but) : pas de repères de championnat pour elles' };
  }
  const siens = lignes.filter((r) => r.league === league);
  const generaux = lignes.filter((r) => r.league === GENERAL);
  if (!siens.length) {
    const connu = database.prepare('SELECT 1 FROM matches WHERE league = ? LIMIT 1').get(league);
    return { ...vide, etat: connu ? 'jamais' : 'inconnu', raison: connu ? 'pas encore calculés : ils le seront à la prochaine passe de nuit de l’actualisation' : `aucune rencontre de « ${league} » au magasin` };
  }
  const code = codeFootballData(league);
  const parSaison = new Map();
  for (const r of siens) {
    let s = parSaison.get(r.saison);
    if (!s) parSaison.set(r.saison, (s = {}));
    s[r.repere] = r;
  }
  const courante = seasonLabel(league, currentSeason(league, maintenant));
  const saisons = [];
  for (const [saison, s] of parSaison) {
    if (saison === TOUTES || !s.matchs) continue;
    const m = lue(s.matchs);
    const source = s.matchs.source;
    const reperes = {};
    const mois = {};
    for (const r of REPERES) {
      const l = s[r.cle] ? lue(s[r.cle]) : { valeur: null, matchs: 0, ecart: null, detail: null };
      reperes[r.cle] = { valeur: l.matchs ? l.valeur : null, matchs: l.matchs, ecart: l.ecart, ...(l.matchs ? {} : { nonReleve: raisonNonReleve(r, source, code) }) };
      if (r.mensuel && l.detail?.mois) mois[r.cle] = moisDe(l.detail.mois);
    }
    saisons.push({
      saison,
      debut: s.matchs.debut,
      source,
      fichier: m.detail?.fichier ?? null,
      matchs: m.matchs,
      rencontres: m.detail?.rencontres ?? null,
      premier: m.detail?.premier ?? null,
      dernier: m.detail?.dernier ?? null,
      exclus: m.detail?.exclus ?? null,
      enCours: saison === courante,
      partielle: source === 'fotmob' && m.detail?.entiere === false,
      calculeLe: s.matchs.calcule_le,
      reperes,
      scores: (s.scores ? lue(s.scores).detail?.scores ?? [] : []).slice(0, 5),
      mois
    });
  }
  saisons.sort((a, b) => b.debut - a.debut || String(b.saison).localeCompare(String(a.saison)));
  const t = parSaison.get(TOUTES) ?? {};
  const g = Object.fromEntries(generaux.map((r) => [r.repere, r]));
  let toutes = null;
  if (t.matchs) {
    const tm = lue(t.matchs);
    const reperes = {};
    const mois = {};
    for (const r of REPERES) {
      const l = t[r.cle] ? lue(t[r.cle]) : { valeur: null, matchs: 0, detail: null };
      reperes[r.cle] = { valeur: l.matchs ? l.valeur : null, matchs: l.matchs ?? 0, ecart: l.ecart ?? null, retenue: l.detail?.retenue ?? null, k: l.detail?.k ?? null, poids: l.detail?.poids ?? null };
      if (r.mensuel && l.detail?.mois) mois[r.cle] = moisDe(l.detail.mois);
    }
    toutes = {
      matchs: tm.matchs,
      saisons: tm.detail?.saisons ?? saisons.length,
      sources: tm.detail?.sources ?? null,
      premiere: tm.detail?.premiere ?? null,
      derniere: tm.detail?.derniere ?? null,
      source: t.matchs.source,
      reperes,
      scores: (t.scores ? lue(t.scores).detail?.scores ?? [] : []).slice(0, 8),
      mois,
      recoupement: tm.detail?.recoupement ?? null,
      ecartees: tm.detail?.ecartees ?? []
    };
  }
  const general = g.matchs
    ? {
        ligues: lue(g.matchs).valeur,
        matchs: lue(g.matchs).matchs,
        reperes: Object.fromEntries(
          REPERES.map((r) => {
            const l = g[r.cle] ? lue(g[r.cle]) : null;
            return [r.cle, l ? { valeur: l.valeur, matchs: l.matchs, parMatch: l.detail?.parMatch ?? null, k: l.detail?.k ?? null, ligues: l.detail?.ligues ?? null } : null];
          })
        )
      }
    : null;
  const dispersion = {
    statistiques: STATISTIQUES.map((st) => {
      const bloc = (league, quoi) => {
        const ligne = (league === GENERAL ? g : t)[`${quoi === 'dom' || quoi === 'ext' ? 'terrain' : 'dispersion'}_${st.cle}_${quoi}`];
        if (!ligne) return null;
        const l = lue(ligne);
        return { mesure: l.valeur, se: l.ecart, matchs: l.matchs, ic95: l.detail?.ic95 ?? null, retenue: l.detail?.retenue ?? null, moteur: l.detail?.moteur ?? null, brute: l.detail?.brute ?? null, ecartAuMoteur: l.detail?.ecartAuMoteur ?? null };
      };
      const quoi = ['dom', 'ext', 'equipe', 'total'];
      return {
        cle: st.cle,
        libelle: st.libelle,
        ligue: Object.fromEntries(quoi.map((q) => [q, bloc(league, q)])),
        tous: Object.fromEntries(quoi.map((q) => [q, bloc(GENERAL, q)]))
      };
    })
  };
  const calculeLe = siens.reduce((d, r) => (!d || r.calcule_le > d ? r.calcule_le : d), null);
  return {
    ...vide,
    etat: 'pret',
    calculeLe,
    codeFootballData: code,
    saisons,
    toutes,
    general,
    dispersion
  };
}

/** L'attendu d'une saison part des saisons les plus proches d'elle : le football change (buts, cartons, temps additionnel). */
export const SAISONS_PROCHES = 5;

/**
 * POUR L'ÉTAPE 14 (contrôles « hors repères ») et le banc d'essai : pour un
 * championnat et une saison (libellé, « 2025-26 » ou « 2026 »), la valeur
 * ATTENDUE de chaque repère et son ÉCART NORMAL.
 *   - attendu      : la moyenne des cinq saisons du championnat les plus
 *                    proches d'elle (jamais elle-même : une saison n'entre pas
 *                    dans son propre attendu), ramenée vers la moyenne des
 *                    championnats comme un petit championnat (k matchs) ;
 *                    les plus proches et non toutes, parce que le football
 *                    change : en Premier League, 3,3 jaunes par match de 2000
 *                    à 2023, 4,2 depuis ;
 *   - ecartMatch   : l'écart-type d'UN match du championnat (pour un match
 *                    aberrant : 25 corners, 9 buts…) ;
 *   - ecartSaison  : l'écart normal de la moyenne d'une saison de `matchs`
 *                    matchs — la variation vraie d'une saison à l'autre
 *                    (mesurée sur tous les championnats) plus le hasard d'un
 *                    nombre fini de matchs ;
 *   - valeur, ecarts : la valeur mesurée de la saison, si elle est calculée,
 *                    et son écart à l'attendu en écarts normaux ;
 *   - base         : les saisons et les matchs d'où vient l'attendu.
 * Les seuils (2, 3 écarts normaux…) sont à l'étape 14. Sans repère calculé
 * pour ce championnat : `etat` le dit et `reperes` est vide.
 */
export function valeursAttendues(league, saison, { database = openDb(), matchs = null, saisonsProches = SAISONS_PROCHES } = {}) {
  const cible = String(saison);
  let lignes;
  try {
    lignes = database.prepare('SELECT * FROM league_benchmarks WHERE league IN (?, ?)').all(league, GENERAL);
  } catch (error) {
    if (/no such table/i.test(error.message)) return { league, saison: cible, etat: 'jamais', reperes: {} };
    throw error;
  }
  if (isCup(league)) return { league, saison: cible, etat: 'coupe', reperes: {} };
  const parSaison = new Map();
  for (const r of lignes.filter((x) => x.league === league && x.saison !== TOUTES)) {
    let s = parSaison.get(r.saison);
    if (!s) parSaison.set(r.saison, (s = {}));
    s[r.repere] = r;
  }
  if (!parSaison.size) return { league, saison: cible, etat: 'jamais', reperes: {} };
  const generaux = Object.fromEntries(lignes.filter((x) => x.league === GENERAL && x.saison === TOUTES).map((r) => [r.repere, { ...r, detail: parse(r.detail) }]));
  const elle = parSaison.get(cible) ?? null;
  const debutCible = elle?.matchs?.debut ?? debutDuLibelle(cible);
  const reperes = {};
  for (const r of REPERES) {
    const proches = [...parSaison.entries()]
      .filter(([s, x]) => s !== cible && x[r.cle] && x[r.cle].matchs > 0)
      .map(([s, x]) => ({ saison: s, debut: Number(x.matchs?.debut ?? debutDuLibelle(s)), sommes: sommesDe(x[r.cle]) }))
      .sort((a, b) => Math.abs(a.debut - debutCible) - Math.abs(b.debut - debutCible) || a.debut - b.debut || a.saison.localeCompare(b.saison))
      .slice(0, saisonsProches);
    const t = reunir(proches.map((p) => p.sommes));
    const gl = generaux[r.cle];
    const general = gl?.detail ? { moyenne: gl.valeur, k: gl.detail.k, variance: gl.detail.variance, tau2Saisons: gl.detail.tau2Saisons } : null;
    if (!t.n && !general) continue;
    const m = t.n ? t.s / t.n : null;
    const variance = t.n > 1 ? Math.max(0, (t.s2 - (t.s * t.s) / t.n) / (t.n - 1)) : general?.variance ?? null;
    const attendu = retenir(m, t.n, general);
    const mesure = elle?.[r.cle] && elle[r.cle].matchs ? elle[r.cle] : null;
    const n = matchs ?? mesure?.matchs ?? null;
    const tau2 = general?.tau2Saisons ?? 0;
    const ecartSaison = variance !== null && n ? Math.sqrt(tau2 + variance / n) : null;
    reperes[r.cle] = {
      attendu,
      ecartMatch: variance === null ? null : Math.sqrt(variance),
      ecartSaison,
      matchs: n,
      base: { matchs: t.n, saisons: proches.map((p) => p.saison) },
      valeur: mesure ? mesure.valeur : null,
      ecarts: mesure && ecartSaison ? (mesure.valeur - attendu) / ecartSaison : null
    };
  }
  return { league, saison: cible, etat: 'pret', source: elle?.matchs?.source ?? null, matchs: elle?.matchs?.matchs ?? null, reperes };
}
