/**
 * simulationBanc.js — LE BANC DE LA SIMULATION (étape 28 du plan, conception §3 et §6 T13).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge. Les pièces du juge, que les scripts du banc et les tests assemblent :
 *   - reconstituerLambdaMu : λ, μ de la grille d'une rencontre retrouvés depuis ses 81 cases rendues à 6 décimales
 *     (les lignes `scoreExact` du rejeu de l'étape 27 : P2 sans toucher runner.js, conception §3.3) ; garde :
 *     casesRendues(grilleDesButs(λ, μ, ρ)) = les 81 cases à 2e-6 par case, sinon « non rejouable » ;
 *   - annoncesDuMatch : les marchés de déroulé annoncés (chemins stratifiés sur la grille BRUTE, jamais alignée
 *     sur un 1N2 : l'alignement est pour l'écran et le ticket seulement) ;
 *   - issuesDuMatch : ce qui est arrivé, marché par marché (null quand on ne le sait pas : sans minutes, ni premier
 *     but ni « avant la 30e ») ;
 *   - perteLog, ligneDuMatch, lignesDuJuge (une ligne par match × marché, bloc = le match, date du match : la forme
 *     que contrôle le juge, controlerLigne de bench/guard.js), calibration (annoncé, réalisé, perte log, déciles) ;
 *   - COMBINES_DU_BANC et lignesDesCombines : les 14 combinés du banc v2, lus dans la grille (jambes.js), face au
 *     produit des simples et à la grille ρ = 0.
 * JAMAIS importé par la nuit ni par une route : un banc ne tourne pas dans une requête.
 * -----------------------------------------------------------------------
 */

import { grilleDesButs, casesRendues } from '../../core/engine/goalModel.js';
import { simulerMatch, marchesDesChemins, EntreeInvalide } from './simulationMatch.js';
import { probabiliteDuCombine, predicatDeLaJambe } from './jambes.js';
import { CONVENTION_AVANT_30 } from './reglages.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const entier = (x) => Number.isInteger(x) && x >= 0;

// ------------------------------------------------------------ 1. λ, μ depuis les 81 cases

/** La garde de la reconstitution : chaque case refaite à 2e-6 près de la case rendue (arrondie à 6 décimales). */
export const GARDE_DES_CASES = 2e-6;

const cases81 = (lambda, mu, rho) => Float64Array.from(casesRendues(grilleDesButs(lambda, mu, rho)).cases, (c) => c.p);
const ecartMax = (a, b) => {
  let m = 0;
  for (let k = 0; k < 81; k++) m = Math.max(m, Math.abs(a[k] - b[k]));
  return m;
};

/** Le rapport de la conception §3.3 : λ = (i + 1)·L(i + 1)/L(i) sur les deux lignes consécutives les plus lourdes, i ≥ 2. */
function parLeRapport(d) {
  const L = new Float64Array(9);
  const C = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      L[i] += d[i * 9 + j];
      C[j] += d[i * 9 + j];
    }
  }
  const estimer = (S) => {
    let meilleur = -1;
    let somme = -1;
    for (let i = 2; i <= 7; i++) {
      if (S[i] > 0 && S[i + 1] > 0 && S[i] + S[i + 1] > somme) {
        somme = S[i] + S[i + 1];
        meilleur = i;
      }
    }
    return meilleur < 0 ? null : ((meilleur + 1) * S[meilleur + 1]) / S[meilleur];
  };
  return { lambda: estimer(L), mu: estimer(C) };
}

/** Les moindres carrés sur les 81 cases (Gauss-Newton, jacobien par différences finies), depuis le rapport. */
function parLesMoindresCarres(d, depart, rho) {
  let l = depart.lambda;
  let m = depart.mu;
  for (let it = 0; it < 6; it++) {
    const c = cases81(l, m, rho);
    const h = 1e-6;
    const cl = cases81(l + h, m, rho);
    const cm = cases81(l, m + h, rho);
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let k = 0; k < 81; k++) {
      const jl = (cl[k] - c[k]) / h;
      const jm = (cm[k] - c[k]) / h;
      const r = d[k] - c[k];
      a11 += jl * jl;
      a12 += jl * jm;
      a22 += jm * jm;
      b1 += jl * r;
      b2 += jm * r;
    }
    const det = a11 * a22 - a12 * a12;
    if (!(Math.abs(det) > 0)) break;
    const dl = (b1 * a22 - b2 * a12) / det;
    const dm = (a11 * b2 - a12 * b1) / det;
    l += dl;
    m += dm;
    if (!(l > 0 && m > 0)) return null;
    if (Math.abs(dl) + Math.abs(dm) < 1e-12) break;
  }
  return { lambda: l, mu: m };
}

/**
 * λ, μ d'une grille Dixon-Coles retrouvés depuis ses 81 cases rendues (indice home × 9 + away, arrondies à 6
 * décimales). `methode` : 'moindres-carres' (PAR DÉFAUT : décision du 27/10, la garde passe pour les 46 507 rencontres
 * de P2 ; départ = le rapport) ou 'rapport' (la conception §3.3 : 29 838 sur 46 507, les autres écartées par le seul
 * bruit de l'arrondi). Rend { lambda, mu, ecart, rejouable, methode } ; rejouable seulement si la grille refaite
 * redonne chaque case à `garde` près.
 */
export function reconstituerLambdaMu(cases, rho, { methode = 'moindres-carres', garde = GARDE_DES_CASES } = {}) {
  const liste = Array.isArray(cases) || ArrayBuffer.isView(cases) ? Array.from(cases) : null;
  if (!liste || liste.length !== 81 || !liste.every((p) => fini(p))) throw new EntreeInvalide('reconstituerLambdaMu : 81 cases attendues.');
  if (!fini(rho)) throw new EntreeInvalide('reconstituerLambdaMu : ρ obligatoire.');
  if (methode !== 'rapport' && methode !== 'moindres-carres') throw new EntreeInvalide(`reconstituerLambdaMu : méthode inconnue « ${methode} ».`);
  const d = Float64Array.from(cases);
  const r = parLeRapport(d);
  if (!fini(r.lambda) || !fini(r.mu)) return { lambda: null, mu: null, ecart: null, rejouable: false, methode, raison: 'lignes ou colonnes vides : λ, μ non retrouvés' };
  const x = methode === 'rapport' ? r : parLesMoindresCarres(d, r, rho);
  if (!x) return { lambda: null, mu: null, ecart: null, rejouable: false, methode, raison: 'moindres carrés sans solution positive' };
  const ecart = ecartMax(cases81(x.lambda, x.mu, rho), d);
  return { lambda: x.lambda, mu: x.mu, ecart, rejouable: ecart <= garde, methode };
}

// ------------------------------------------------------------ 2. les marchés jugés

/** Les marchés de déroulé du banc (v1 §2), dans l'ordre, avec leur libellé. */
export const MARCHES_JUGES = Object.freeze([
  'htD', 'htH', 'htA', 'htO05', 'htO15', 'htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8',
  'deuxMiTemps05', 'h2plusQueH1', 'premierDom', 'premierExt', 'premierAvant30', 'retourDom', 'retourExt', 'rougeAuMoinsUn'
]);
export const LIBELLES = Object.freeze({
  htD: 'mi-temps nul', htH: 'mi-temps domicile mène', htA: 'mi-temps extérieur mène', htO05: 'mi-temps plus de 0,5', htO15: 'mi-temps plus de 1,5',
  htFt0: '1/1', htFt1: '1/N', htFt2: '1/2', htFt3: 'N/1', htFt4: 'N/N', htFt5: 'N/2', htFt6: '2/1', htFt7: '2/N', htFt8: '2/2',
  deuxMiTemps05: 'un but dans chaque mi-temps', h2plusQueH1: '2e mi-temps plus de buts', premierDom: 'premier but domicile', premierExt: 'premier but extérieur',
  premierAvant30: 'premier but avant la 30e', retourDom: 'domicile gagne mené à la MT', retourExt: 'extérieur gagne mené à la MT', rougeAuMoinsUn: 'au moins un rouge'
});
/** Les 18 marchés du jugement « en bloc » du déroulé (v1 §4). */
export const BLOC_DEROULE = Object.freeze(['htD', 'htH', 'htA', 'htO05', 'htO15', 'htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8', 'deuxMiTemps05', 'premierDom', 'premierExt', 'premierAvant30']);
/** Ce qu'on ne sait pas sans les minutes des buts (football-data : P2) : premier but et « avant la 30e ». */
export const BESOIN_DES_MINUTES = Object.freeze(['premierDom', 'premierExt', 'premierAvant30']);

const lire = (d, k) => (k.startsWith('htFt') ? d.htFt[Number(k.slice(4))] : d[k]);

/**
 * Les marchés de déroulé ANNONCÉS pour une rencontre : `n` chemins stratifiés sur la grille BRUTE grilleDesButs(λ, μ,
 * ρ). `simuler` / `marches` : la simulation et la lecture des chemins (le module par défaut ; un banc peut rejouer un
 * noyau mesuré pour comparaison) ; `options` : passées telles quelles à `simuler`. Rend { p: { [marché]: probabilité },
 * masseNonCouverte, tailleEffective }.
 */
export function annoncesDuMatch({ lambda, mu, rho, params, n, seed, simuler = simulerMatch, marches = marchesDesChemins, dernierCreneauAvant30 = CONVENTION_AVANT_30.dernierCreneau, options = {} }) {
  const grille = grilleDesButs(lambda, mu, rho);
  const ch = simuler({ lambda, mu, grille, params, n, seed, ...options });
  const d = marches(ch, { arrondi: null, dernierCreneauAvant30 });
  const p = {};
  for (const k of MARCHES_JUGES) p[k] = lire(d, k);
  return { p, masseNonCouverte: ch.masseNonCouverte, tailleEffective: ch.tailleEffective };
}

/**
 * Ce qui est ARRIVÉ, marché par marché (1, 0, ou null si on ne le sait pas). `hg`, `ag` : le score à la 90e ; `hHt`,
 * `aHt` : la mi-temps ; `buts` : [[créneau, camp (0 dom, 1 ext)], …] ou null (aucune minute : P2) ; `rouges` :
 * [[créneau, camp], …], un nombre de rouges, ou null. Le premier but est le premier du tri par créneau (stable).
 */
export function issuesDuMatch({ hg, ag, hHt = null, aHt = null, buts = null, rouges = null }, { dernierCreneauAvant30 = CONVENTION_AVANT_30.dernierCreneau } = {}) {
  const y = Object.fromEntries(MARCHES_JUGES.map((k) => [k, null]));
  if (!entier(hg) || !entier(ag)) return y;
  const b = (v) => (v ? 1 : 0);
  const mi = entier(hHt) && entier(aHt);
  if (mi) {
    const rH = hHt > aHt ? 0 : hHt === aHt ? 1 : 2;
    const rF = hg > ag ? 0 : hg === ag ? 1 : 2;
    Object.assign(y, {
      htD: b(rH === 1), htH: b(rH === 0), htA: b(rH === 2), htO05: b(hHt + aHt > 0), htO15: b(hHt + aHt > 1),
      deuxMiTemps05: b(hHt + aHt > 0 && hg + ag - hHt - aHt > 0), h2plusQueH1: b(hg + ag - hHt - aHt > hHt + aHt),
      retourDom: b(rH === 2 && rF === 0), retourExt: b(rH === 0 && rF === 2)
    });
    for (let c = 0; c < 9; c++) y[`htFt${c}`] = b(rH * 3 + rF === c);
  }
  if (Array.isArray(buts)) {
    const gs = buts.slice().sort((x, z) => x[0] - z[0]);
    y.premierDom = b(gs.length > 0 && gs[0][1] === 0);
    y.premierExt = b(gs.length > 0 && gs[0][1] === 1);
    y.premierAvant30 = b(gs.length > 0 && gs[0][0] <= dernierCreneauAvant30);
  }
  if (Array.isArray(rouges)) y.rougeAuMoinsUn = b(rouges.length > 0);
  else if (entier(rouges)) y.rougeAuMoinsUn = b(rouges > 0);
  return y;
}

/**
 * La perte log d'une probabilité p pour l'issue y. `sur: 'p'` (le banc v1) : p bornée à [plancher, 1 − plancher],
 * puis −log(y ? p : 1 − p) ; `sur: 'issue'` (le banc v2) : −log de la probabilité de l'issue bornée.
 */
export function perteLog(p, y, { plancher = 1e-6, sur = 'p' } = {}) {
  if (sur === 'issue') return -Math.log(Math.min(1 - plancher, Math.max(plancher, y ? p : 1 - p)));
  const q = Math.min(1 - plancher, Math.max(plancher, p));
  return -Math.log(y ? q : 1 - q);
}

/**
 * Une ligne de banc pour une rencontre : `cle` (le match : le bloc du juge), `date` (AAAA-MM-JJ), `annonces` ({ [variante]:
 * { [marché]: p } }), `issues` (issuesDuMatch). Seuls les marchés dont l'issue est connue ont une perte. Rend { cle,
 * date, y, p, ll } (p bornées comme la perte).
 */
export function ligneDuMatch({ cle, date, annonces, issues }, { plancher = 1e-6 } = {}) {
  const ligne = { cle, date, y: {}, p: {}, ll: {} };
  for (const v of Object.keys(annonces)) {
    ligne.p[v] = {};
    ligne.ll[v] = {};
  }
  for (const k of MARCHES_JUGES) {
    if (issues[k] === null || issues[k] === undefined) continue;
    ligne.y[k] = issues[k];
    for (const [v, p] of Object.entries(annonces)) {
      if (!fini(p[k])) continue;
      const q = Math.min(1 - plancher, Math.max(plancher, p[k]));
      ligne.p[v][k] = q;
      ligne.ll[v][k] = perteLog(q, issues[k], { plancher });
    }
  }
  return ligne;
}

/**
 * Les lignes du JUGE (comparer / jugerEtape, mode « moyenne », sens « min ») : une par match × marché où les deux
 * variantes ont une perte ; bloc = le match ; a = la perte de la variante `a`, b = celle de `b` (« retenu » : b meilleure).
 */
export function lignesDuJuge(lignes, { a, b, marches }) {
  const sortie = [];
  for (const l of lignes) {
    for (const k of marches) {
      const x = l.ll[a]?.[k];
      const z = l.ll[b]?.[k];
      if (fini(x) && fini(z)) sortie.push({ bloc: l.cle, date: l.date, a: x, b: z });
    }
  }
  return sortie;
}

/**
 * La CALIBRATION d'une variante, marché par marché : n, annoncé moyen, réalisé moyen, perte log moyenne, et les
 * déciles (n, Σ annoncé, Σ réalisé) — la forme de v1 §2 et §3.
 */
export function calibration(lignes, { variante, marches = MARCHES_JUGES }) {
  const sortie = {};
  for (const k of marches) {
    const c = { n: 0, p: 0, r: 0, ll: 0, deciles: Array.from({ length: 10 }, () => ({ n: 0, p: 0, r: 0 })) };
    for (const l of lignes) {
      const p = l.p[variante]?.[k];
      if (!fini(p)) continue;
      const y = l.y[k];
      c.n++;
      c.p += p;
      c.r += y;
      c.ll += l.ll[variante][k];
      const d = c.deciles[Math.min(9, Math.floor(p * 10))];
      d.n++;
      d.p += p;
      d.r += y;
    }
    sortie[k] = c;
  }
  return sortie;
}

// ------------------------------------------------------------ 3. les combinés (v2)

const j = (marketId, params) => Object.freeze({ marketId, params: Object.freeze(params) });
const UN = j('result', { outcome: 'home' });
const NUL = j('result', { outcome: 'draw' });
const DEUX = j('result', { outcome: 'away' });
const BTTS = j('bothTeamsScore', { outcome: 'yes' });
const plus = (line) => j('totalGoals', { line, side: 'over' });
const moins = (line) => j('totalGoals', { line, side: 'under' });

/** Les 14 combinés du banc v2 (mesures/preuve/v2-combines.mjs), écrits comme des sélections du ticket. */
export const COMBINES_DU_BANC = Object.freeze([
  { nom: '1 & plus de 2,5', jambes: [UN, plus(2.5)] },
  { nom: '1 & moins de 2,5', jambes: [UN, moins(2.5)] },
  { nom: 'N & moins de 2,5', jambes: [NUL, moins(2.5)] },
  { nom: '2 & plus de 2,5', jambes: [DEUX, plus(2.5)] },
  { nom: '1 & les deux marquent', jambes: [UN, BTTS] },
  { nom: '2 & les deux marquent', jambes: [DEUX, BTTS] },
  { nom: 'N & les deux marquent', jambes: [NUL, BTTS] },
  { nom: 'plus de 2,5 & les deux marquent', jambes: [plus(2.5), BTTS] },
  { nom: '1 & dom. plus de 1,5', jambes: [UN, j('teamGoals', { team: 'home', line: 1.5, side: 'over' })] },
  { nom: '1 sans encaisser', jambes: [UN, j('teamGoals', { team: 'away', line: 0.5, side: 'under' })] },
  { nom: '1 & plus de 1,5', jambes: [UN, plus(1.5)] },
  { nom: '1 & plus de 2,5 & les deux marquent', jambes: [UN, plus(2.5), BTTS] },
  { nom: 'moins de 3,5 & les deux marquent', jambes: [moins(3.5), BTTS] },
  { nom: 'double chance 1N & moins de 3,5', jambes: [j('doubleChance', { outcome: 'homeDraw' }), moins(3.5)] }
].map((c) => Object.freeze({ ...c, jambes: Object.freeze(c.jambes) })));

/**
 * Les combinés d'une rencontre, lus dans la grille BRUTE (jamais alignée) : pG = la grille (ρ de la candidate), pI = le
 * produit des simples de la même grille (ce que l'appli enregistrait avant l'étape 28), p0 = la grille ρ = 0 ; r = le
 * combiné a-t-il gagné (score à la 90e) ; pertes log (bornées à 1e-9, la forme de v2). Rend [{ nom, r, pG, pI, p0,
 * lG, lI, l0 }].
 */
export function lignesDesCombines({ lambda, mu, rho, hg, ag }, { combines = COMBINES_DU_BANC, plancher = 1e-9 } = {}) {
  if (!entier(hg) || !entier(ag)) throw new EntreeInvalide('lignesDesCombines : le score à la 90e est obligatoire.');
  const g = grilleDesButs(lambda, mu, rho);
  const g0 = grilleDesButs(lambda, mu, 0);
  return combines.map(({ nom, jambes }) => {
    const r = jambes.every((x) => predicatDeLaJambe(x).f(hg, ag)) ? 1 : 0;
    const pG = probabiliteDuCombine({ jambes, grille: g }).probabilite;
    const pI = jambes.reduce((s, x) => s * probabiliteDuCombine({ jambes: [x], grille: g }).probabilite, 1);
    const p0 = probabiliteDuCombine({ jambes, grille: g0 }).probabilite;
    const ll = (p) => perteLog(p, r, { plancher, sur: 'issue' });
    return { nom, r, pG, pI, p0, lG: ll(pG), lI: ll(pI), l0: ll(p0) };
  });
}
