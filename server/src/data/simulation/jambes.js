/**
 * jambes.js — LE PRIX JUSTE D'UN COMBINÉ DU MÊME MATCH (étape 28 du plan, conception §1.5).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge. Une sélection du ticket = { marketId, params, pick } (étape 10). Chaque jambe
 * devient un prédicat, rangé par « porte » :
 *   - score   : result, totalGoals, bothTeamsScore, teamGoals, resultAndTotal, scoreExact, doubleChance → prédicat
 *               sur le score final (i, j) : la probabilité est une somme de cases de la GRILLE, exacte, sans bruit
 *               (score exact et double chance se chiffrent mais ne se règlent pas encore : jamais « J'ai parié ») ;
 *   - deroule : mi-temps, mi-temps/fin, premier but, un but dans chaque mi-temps… → prédicat sur une case de la
 *               TABLE JOINTE de la nuit (lireTableJointe), pondérée sur la grille : déroulé × score = Σ des poids
 *               des cases, jamais un produit ;
 *   - stat    : corners, tirs, tirs cadrés → un facteur multiplicatif (leur loi est à part), SUPPOSÉS indépendants
 *               des buts — non mesuré, dit dans les mentions.
 *   P(combiné) = Σ_cases poids(case) · Π_jambes 1[jambe(case)] × Π_stat p(stat)
 *   prix juste = 1 / P ; cote minimale = 1 / P ; si indépendants = Π P(jambe) (montré en gris) ;
 *   écart à une cote = cote × P − 1 (neutre, jamais vert : aucune value de combiné n'est mesurable).
 * Règles : contradictoires (1 & 2) → P = 0, « impossible », pas de prix ; redondantes (1 & plus de 0,5) → le prix
 * est celui de la plus forte, dit ; prix juste sous COTE_MINIMALE (1,20) → « non conseillé » ; une jambe de déroulé
 * (ou de score exact) se lit et se chiffre mais ne se parie pas en v1 (le règlement ne sait pas la régler).
 * Contradiction et redondance se décident sur l'espace LOGIQUE des issues (tous les scores et déroulés possibles),
 * jamais sur les seuls chemins tirés.
 * -----------------------------------------------------------------------
 */

import { COTE_MINIMALE } from '../../sports/football/markets.js';
import { TAILLE_GRILLE } from './reglages.js';

const T = TAILLE_GRILLE;
const MI_TEMPS_INCONNUE = 255;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Une ligne de buts sans remboursement possible : un demi-entier positif (0,5 ; 1,5 ; …). */
const ligneValide = (x) => fini(Number(x)) && Number(x) > 0 && Number.isInteger(Number(x) * 2) && !Number.isInteger(Number(x));
const SENS = (side) => (side === 'over' ? (v, l) => v > l : side === 'under' ? (v, l) => v < l : null);
const RESULTAT = (o) => (o === 'home' ? (i, j) => i > j : o === 'draw' ? (i, j) => i === j : o === 'away' ? (i, j) => i < j : null);
const OUI_NON = (o) => (o === 'yes' ? true : o === 'no' ? false : null);

/** Les marchés du score final (porte « score ») et ceux que le règlement sait régler (« J'ai parié » admis). */
export const MARCHES_DU_SCORE = Object.freeze(['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal', 'scoreExact', 'doubleChance']);
const SCORE_REGLABLE = new Set(['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
/** Les marchés de déroulé (porte « deroule ») : lus dans la table jointe, jamais réglés en v1. */
export const MARCHES_DE_DEROULE = Object.freeze([
  'halfTimeResult', 'halfTimeGoals', 'halfTimeFullTime', 'goalInBothHalves', 'secondHalfMoreGoals', 'teamScoresBothHalves',
  'firstGoal', 'firstGoalBefore30', 'comeback', 'redCard'
]);
/** Corners, tirs et tirs cadrés (porte « stat ») : la probabilité vient de leur loi (statLines), supposée indépendante. */
export const MARCHES_STAT = Object.freeze(['totalCorners', 'totalShots', 'totalShotsOnTarget', 'teamCorners', 'teamShots', 'teamShotsOnTarget']);

/** La clé d'une jambe (marché et paramètres), pour retrouver sa probabilité dans `statLines`. */
export const cleDeLaJambe = ({ marketId, params }) => `${marketId}|${JSON.stringify(Object.keys(params ?? {}).sort().map((k) => [k, params[k]]))}`;

// ------------------------------------------------------------ les prédicats

function predicatDuScore(marketId, p) {
  switch (marketId) {
    case 'result': {
      const f = RESULTAT(p.outcome);
      return f ? f : 'issue du 1N2 inconnue (home, draw ou away)';
    }
    case 'totalGoals': {
      const s = SENS(p.side);
      if (!s || !ligneValide(p.line)) return 'ligne ou sens du total de buts invalide';
      const l = Number(p.line);
      return (i, j) => s(i + j, l);
    }
    case 'bothTeamsScore': {
      const o = OUI_NON(p.outcome);
      if (o === null) return 'issue « les deux marquent » inconnue (yes ou no)';
      return (i, j) => (i > 0 && j > 0) === o;
    }
    case 'teamGoals': {
      const s = SENS(p.side);
      if (!s || !ligneValide(p.line) || (p.team !== 'home' && p.team !== 'away')) return 'équipe, ligne ou sens des buts d’une équipe invalide';
      const l = Number(p.line);
      return p.team === 'home' ? (i) => s(i, l) : (i, j) => s(j, l);
    }
    case 'resultAndTotal': {
      const m = /^(home|draw|away)(Over|Under)$/.exec(String(p.key ?? ''));
      if (!m || !ligneValide(p.line)) return 'issue ou ligne du résultat + total invalide';
      const r = RESULTAT(m[1]);
      const s = SENS(m[2].toLowerCase());
      const l = Number(p.line);
      return (i, j) => r(i, j) && s(i + j, l);
    }
    case 'scoreExact': {
      const h = Number(p.home);
      const a = Number(p.away);
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h >= T || a >= T) return 'score exact invalide';
      return (i, j) => i === h && j === a;
    }
    case 'doubleChance': {
      const f = { homeDraw: (i, j) => i >= j, homeAway: (i, j) => i !== j, drawAway: (i, j) => i <= j }[p.outcome];
      return f ?? 'issue de la double chance inconnue (homeDraw, homeAway ou drawAway)';
    }
    default:
      return null;
  }
}

/** Les prédicats de déroulé, sur une case { hh, ha, fh, fa, pc, avant30, rouge } (mi-temps inconnue : jamais vrai). */
function predicatDuDeroule(marketId, p) {
  const connue = (c) => c.hh !== MI_TEMPS_INCONNUE;
  switch (marketId) {
    case 'halfTimeResult': {
      const r = RESULTAT(p.outcome);
      return r ? (c) => connue(c) && r(c.hh, c.ha) : 'issue de la mi-temps inconnue';
    }
    case 'halfTimeGoals': {
      const s = SENS(p.side);
      if (!s || !ligneValide(p.line)) return 'ligne ou sens des buts de la mi-temps invalide';
      const l = Number(p.line);
      return (c) => connue(c) && s(c.hh + c.ha, l);
    }
    case 'halfTimeFullTime': {
      const rh = RESULTAT(p.ht);
      const rf = RESULTAT(p.ft);
      return rh && rf ? (c) => connue(c) && rh(c.hh, c.ha) && rf(c.fh, c.fa) : 'issue mi-temps/fin inconnue';
    }
    case 'goalInBothHalves': {
      const o = OUI_NON(p.outcome);
      return o === null ? 'issue « un but dans chaque mi-temps » inconnue' : (c) => connue(c) && (c.hh + c.ha > 0 && c.fh + c.fa - c.hh - c.ha > 0) === o;
    }
    case 'secondHalfMoreGoals': {
      const o = OUI_NON(p.outcome);
      return o === null ? 'issue « 2e mi-temps plus de buts » inconnue' : (c) => connue(c) && (c.fh + c.fa - c.hh - c.ha > c.hh + c.ha) === o;
    }
    case 'teamScoresBothHalves': {
      const o = OUI_NON(p.outcome);
      if (o === null || (p.team !== 'home' && p.team !== 'away')) return 'équipe ou issue « marque dans les deux mi-temps » invalide';
      return p.team === 'home' ? (c) => connue(c) && (c.hh > 0 && c.fh > c.hh) === o : (c) => connue(c) && (c.ha > 0 && c.fa > c.ha) === o;
    }
    case 'firstGoal': {
      const camp = { home: 0, away: 1, none: 2 }[p.team];
      return camp === undefined ? 'camp du premier but inconnu (home, away ou none)' : (c) => c.pc === camp;
    }
    case 'firstGoalBefore30': {
      const o = OUI_NON(p.outcome);
      return o === null ? 'issue « premier but avant la 30e » inconnue' : (c) => Boolean(c.avant30) === o;
    }
    case 'comeback': {
      const o = OUI_NON(p.outcome);
      return o === null ? 'issue « l’équipe menée à la mi-temps gagne » inconnue' : (c) => connue(c) && ((c.hh < c.ha && c.fh > c.fa) || (c.hh > c.ha && c.fh < c.fa)) === o;
    }
    case 'redCard': {
      const o = OUI_NON(p.outcome);
      return o === null ? 'issue « au moins un rouge » inconnue' : (c) => Boolean(c.rouge) === o;
    }
    default:
      return null;
  }
}

/**
 * Le prédicat d'une jambe : { porte: 'score', f(i, j) } | { porte: 'deroule', f(case) } | { porte: 'stat' }, avec
 * `pariable` (le règlement sait-il la régler ?) ; ou { raison } en mots quand la jambe ne se chiffre pas.
 */
export function predicatDeLaJambe({ marketId, params, pick } = {}) {
  const p = params ?? {};
  const nom = pick ? `« ${pick} »` : `« ${String(marketId)} »`;
  if (MARCHES_DU_SCORE.includes(marketId)) {
    const f = predicatDuScore(marketId, p);
    return typeof f === 'function' ? { porte: 'score', f, pariable: SCORE_REGLABLE.has(marketId) } : { raison: `${nom} : ${f}` };
  }
  if (MARCHES_DE_DEROULE.includes(marketId)) {
    const f = predicatDuDeroule(marketId, p);
    return typeof f === 'function' ? { porte: 'deroule', f, pariable: false } : { raison: `${nom} : ${f}` };
  }
  if (MARCHES_STAT.includes(marketId)) {
    if (!SENS(p.side) || !fini(Number(p.line))) return { raison: `${nom} : ligne ou sens invalide` };
    if (/^team/.test(marketId) && p.team !== 'home' && p.team !== 'away') return { raison: `${nom} : équipe invalide` };
    return { porte: 'stat', pariable: true };
  }
  return { raison: `${nom} : marché inconnu, pas de prix juste` };
}

// ------------------------------------------------------------ l'espace logique des issues

/** Tous les scores finaux 0..20 × 0..20 : l'espace logique des jambes du score. */
function scoresLogiques() {
  const s = [];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) s.push({ fh: i, fa: j });
  return s;
}

/**
 * Les déroulés logiquement possibles (jusqu'à 10 buts par équipe) : mi-temps ≤ fin, camp du premier but cohérent
 * avec les buts (un but de 1re mi-temps vient d'un camp qui a marqué avant la pause), « avant la 30e » seulement si
 * un but a été marqué en 1re mi-temps, rouge ou non.
 */
function deroulesLogiques() {
  const s = [];
  for (let fh = 0; fh <= 10; fh++) {
    for (let fa = 0; fa <= 10; fa++) {
      for (let hh = 0; hh <= fh; hh++) {
        for (let ha = 0; ha <= fa; ha++) {
          const camps = fh + fa === 0 ? [2] : hh + ha > 0 ? [hh > 0 ? 0 : null, ha > 0 ? 1 : null].filter((x) => x !== null) : [fh > 0 ? 0 : null, fa > 0 ? 1 : null].filter((x) => x !== null);
          const avant = hh + ha > 0 ? [false, true] : [false];
          for (const pc of camps) for (const avant30 of avant) for (const rouge of [false, true]) s.push({ hh, ha, fh, fa, pc, avant30, rouge });
        }
      }
    }
  }
  return s;
}

let memoScores = null;
let memoDeroules = null;
const ESPACE = { score: () => (memoScores ??= scoresLogiques()), deroule: () => (memoDeroules ??= deroulesLogiques()) };

/** Une jambe évaluée sur une issue de l'espace (score : (fh, fa) ; déroulé : la case). */
const vraie = (j, x) => (j.porte === 'score' ? j.f(x.fh, x.fa) : j.f(x));

/**
 * Les jambes peuvent-elles gagner ensemble AU-DELÀ de 10 buts d'une équipe (vérification du 27/10, constat 4) ? L'espace
 * des déroulés s'arrête à 10 buts par équipe : un combiné qui en demande plus (11-0 et la mi-temps, « domicile plus de
 * 10,5 » et pas de rouge) n'y rencontre aucune issue sans être impossible. Les mêmes règles de déroulé, scores de 0 à 20,
 * parcourus sans rien garder ; s'arrête à la première issue où tout gagne. Seulement quand l'espace de 0 à 10 n'a rien
 * trouvé (rare, et gardé en mémoire avec l'analyse).
 */
function possibleAuDelaDeDix(logiques) {
  for (let fh = 0; fh < T; fh++) {
    for (let fa = 0; fa < T; fa++) {
      if (fh <= 10 && fa <= 10) continue;
      if (!logiques.every(({ j }) => j.porte !== 'score' || j.f(fh, fa))) continue;
      for (let hh = 0; hh <= fh; hh++) {
        for (let ha = 0; ha <= fa; ha++) {
          const camps = hh + ha > 0 ? [hh > 0 ? 0 : null, ha > 0 ? 1 : null].filter((x) => x !== null) : [fh > 0 ? 0 : null, fa > 0 ? 1 : null].filter((x) => x !== null);
          const avant = hh + ha > 0 ? [false, true] : [false];
          for (const pc of camps) for (const avant30 of avant) for (const rouge of [false, true]) if (logiques.every(({ j }) => vraie(j, { hh, ha, fh, fa, pc, avant30, rouge }))) return true;
        }
      }
    }
  }
  return false;
}

/**
 * L'ANALYSE LOGIQUE d'un jeu de jambes (sans la grille) : contradiction, redondances (indices dans `logiques`) et,
 * pour des jambes du score seules, les cases (indices home × 21 + away, croissants) qui les satisfont toutes et
 * celles de chaque jambe. Ne dépend que des marchés et paramètres : gardée en mémoire (au plus MEMO_MAX analyses),
 * une analyse de 441 ou ~35 000 issues par combinaison, pas par appel.
 */
const MEMO_MAX = 500;
const memoAnalyses = new Map();
function analyseLogique(jambes, preds, logiques, avecDeroule) {
  const cle = `${avecDeroule ? 'deroule' : 'score'}|${logiques.map(({ k }) => cleDeLaJambe(jambes[k])).join('&')}`;
  const deja = memoAnalyses.get(cle);
  if (deja) return deja;
  const espace = avecDeroule ? ESPACE.deroule() : ESPACE.score();
  const ensembles = logiques.map(({ j }) => Uint8Array.from(espace, (x) => (vraie(j, x) ? 1 : 0)));
  const rienDansLEspace = logiques.length > 0 && !espace.some((_, q) => ensembles.every((e) => e[q]));
  // Rien dans l'espace des déroulés (0 à 10 buts) mais possible au-delà : « trop rare », jamais « impossible » (constat 4).
  const impossible = rienDansLEspace && !(avecDeroule && possibleAuDelaDeDix(logiques));
  const redondantes = [];
  if (!rienDansLEspace) {
    for (let b = 0; b < logiques.length; b++) {
      for (let a = 0; a < logiques.length; a++) {
        if (a === b || redondantes.some((r) => r.b === a)) continue;
        const A = ensembles[a];
        const B = ensembles[b];
        const inclus = A.every((v, q) => !v || B[q]);
        const egaux = inclus && B.every((v, q) => !v || A[q]);
        if (inclus && (!egaux || a < b)) {
          redondantes.push({ b, a });
          break;
        }
      }
    }
  }
  const analyse = { impossible, redondantes, cellules: null, cellulesParJambe: null };
  if (!avecDeroule) {
    // L'espace du score est la grille elle-même, dans l'ordre home × 21 + away : les sommes se font dans le même ordre.
    const toutes = [];
    for (let q = 0; q < espace.length; q++) if (ensembles.every((e) => e[q])) toutes.push(q);
    analyse.cellules = Int32Array.from(toutes);
    analyse.cellulesParJambe = ensembles.map((e) => {
      const c = [];
      for (let q = 0; q < e.length; q++) if (e[q]) c.push(q);
      return Int32Array.from(c);
    });
  }
  if (memoAnalyses.size >= MEMO_MAX) memoAnalyses.clear();
  memoAnalyses.set(cle, analyse);
  return analyse;
}

// ------------------------------------------------------------ le combiné

const pickDe = (jambe, k) => (jambe.pick ? `« ${jambe.pick} »` : `la sélection ${k + 1}`);
const sommeDesCellules = (grille, cellules) => {
  let s = 0;
  for (let q = 0; q < cellules.length; q++) s += grille[cellules[q]];
  return s;
};

/** La probabilité d'une seule jambe (score : grille ; déroulé : table ; stat : statLines). */
function probabiliteDeLaJambe(j, jambe, { grille, cases, statLines, cellules = null }) {
  if (j.porte === 'score') {
    if (cellules) return sommeDesCellules(grille, cellules);
    let s = 0;
    for (let i = 0; i < T; i++) for (let k = 0; k < T; k++) if (j.f(i, k)) s += grille[i * T + k];
    return s;
  }
  if (j.porte === 'deroule') {
    let s = 0;
    for (const c of cases) if (j.f(c)) s += c.w;
    return s;
  }
  const p = typeof statLines === 'function' ? statLines(jambe) : statLines?.[cleDeLaJambe(jambe)];
  return fini(p) && p >= 0 && p <= 1 ? p : null;
}

/**
 * LE PRIX JUSTE d'un combiné du même match. `jambes` : [{ marketId, params, pick }] ; `grille` : la grille des scores
 * (441 cases ; alignée sur le 1N2 affiché pour l'écran et le ticket) ; `table` : les cases repondérées de la table
 * jointe (lireTableJointe sur la même grille), seulement s'il y a une jambe de déroulé ; `statLines` : la probabilité
 * de chaque jambe de corners/tirs ({ [cleDeLaJambe]: p } ou une fonction). Rend { probabilite, prixJuste,
 * coteMinimale, siIndependants, impossible, nonConseille, pariable, redondantes, mentions, raisons, parJambe }.
 */
export function probabiliteDuCombine({ jambes, grille, table = null, statLines = null, coteMinimale = COTE_MINIMALE } = {}) {
  const raisons = [];
  const mentions = [];
  if (!Array.isArray(jambes) || jambes.length === 0) return { probabilite: null, raisons: ['aucune sélection'], mentions };
  if (!((Array.isArray(grille) || ArrayBuffer.isView(grille)) && grille.length === T * T)) return { probabilite: null, raisons: ['grille des scores absente'], mentions };
  const preds = jambes.map((jambe) => predicatDeLaJambe(jambe));
  preds.forEach((j, k) => j.raison && raisons.push(j.raison));
  if (raisons.length) return { probabilite: null, raisons, mentions };
  const avecDeroule = preds.some((j) => j.porte === 'deroule');
  const cases = avecDeroule ? (Array.isArray(table) ? table : table?.cases) : null;
  if (avecDeroule && !Array.isArray(cases)) return { probabilite: null, raisons: ['déroulé simulé absent pour ce match : une sélection de déroulé ne se chiffre pas sans lui'], mentions };

  // Contradiction et redondance, sur l'espace LOGIQUE (jamais sur les chemins tirés).
  const logiques = preds.map((j, k) => ({ j, k })).filter((x) => x.j.porte !== 'stat');
  const analyse = analyseLogique(jambes, preds, logiques, avecDeroule);
  const pariable = preds.every((j) => j.pariable);
  if (!pariable) {
    const k = preds.findIndex((j) => !j.pariable);
    mentions.push(preds.some((j) => j.porte === 'deroule') ? 'une sélection de déroulé se lit et se chiffre, elle ne se parie pas : ce pari ne se règle pas automatiquement' : `${pickDe(jambes[k], k)} se lit et se chiffre, elle ne se parie pas encore : ce pari ne se règle pas automatiquement`);
  }
  if (analyse.impossible) {
    return { probabilite: 0, prixJuste: null, coteMinimale: null, siIndependants: null, impossible: true, nonConseille: false, pariable, redondantes: [], mentions: [...mentions, 'impossible : ces sélections ne peuvent pas gagner ensemble'], raisons, parJambe: [] };
  }
  const redondantes = analyse.redondantes.map(({ b, a }) => ({ jambe: logiques[b].k, compriseDans: logiques[a].k }));
  for (const r of redondantes) mentions.push(`${pickDe(jambes[r.jambe], r.jambe)} est déjà comprise dans ${pickDe(jambes[r.compriseDans], r.compriseDans)} : le prix est celui de la sélection la plus forte`);

  // La probabilité : somme des cases (grille, ou table si déroulé), puis les facteurs des statistiques.
  let pPart = 0;
  if (avecDeroule) {
    for (const c of cases) if (logiques.every(({ j }) => vraie(j, c))) pPart += c.w;
  } else if (logiques.length) {
    pPart = sommeDesCellules(grille, analyse.cellules);
  } else {
    pPart = 1;
  }
  const position = new Map(logiques.map(({ k }, q) => [k, q]));
  const parJambe = preds.map((j, k) => probabiliteDeLaJambe(j, jambes[k], { grille, cases, statLines, cellules: analyse.cellulesParJambe && position.has(k) ? analyse.cellulesParJambe[position.get(k)] : null }));
  let pStat = 1;
  for (let k = 0; k < preds.length; k++) {
    if (preds[k].porte !== 'stat') continue;
    if (parJambe[k] === null) return { probabilite: null, raisons: [`${pickDe(jambes[k], k)} : probabilité des corners ou des tirs absente`], mentions };
    pStat *= parJambe[k];
  }
  if (preds.some((j) => j.porte === 'stat') && logiques.length) mentions.push('corners et tirs supposés indépendants des buts : non mesuré');
  if (avecDeroule) mentions.push('déroulé simulé : ± 0,5 point de hasard du tirage ; l’écart au réel mesuré est plus grand');
  const probabilite = pPart * pStat;
  const siIndependants = parJambe.reduce((s, p) => s * p, 1);
  if (!(probabilite > 0)) {
    return { probabilite: 0, prixJuste: null, coteMinimale: null, siIndependants, impossible: false, nonConseille: false, pariable, redondantes, mentions, raisons: ['trop rare dans les matchs simulés : pas de prix juste'], parJambe };
  }
  const prixJuste = 1 / probabilite;
  const nonConseille = prixJuste < coteMinimale;
  if (nonConseille) mentions.push(`prix juste sous ${coteMinimale.toFixed(2).replace('.', ',')} : non conseillé`);
  return { probabilite, prixJuste, coteMinimale: prixJuste, siIndependants, impossible: false, nonConseille, pariable, redondantes, mentions, raisons, parJambe };
}

/** L'écart d'une cote tapée au prix juste : cote × P − 1 (neutre : ni vert ni rouge, aucune value de combiné n'est prouvée). */
export const ecartALaCote = (cote, probabilite) => (fini(cote) && cote > 1 && fini(probabilite) && probabilite > 0 ? cote * probabilite - 1 : null);

/** Des combinés de matchs DIFFÉRENTS : le produit, « supposés indépendants (non mesuré) ». `parMatch` : [probabilité]. */
export function combinerLesMatchs(parMatch) {
  if (!Array.isArray(parMatch) || !parMatch.length || parMatch.some((p) => !fini(p) || p < 0 || p > 1)) return { probabilite: null, mentions: [] };
  return { probabilite: parMatch.reduce((s, p) => s * p, 1), mentions: parMatch.length > 1 ? ['matchs différents : supposés indépendants (non mesuré)'] : [] };
}
