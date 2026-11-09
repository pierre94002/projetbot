/**
 * bancDesDebuts.js — LE BANC DES DÉBUTS DE SAISON, à UN SEUL REGARD (étape 35 du plan, lot 1a, partie B, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard (le seul hasard est le générateur à graine du juge de l'étape 16). Les
 * rencontres lues lui sont apportées (passeDesDebuts.js, dans le processus à part) ; il rend les verdicts. Ce qu'il applique
 * a été FIXÉ AVANT LE REGARD (reglagesDebuts.js ; bench/lancements.js : VARIANTES_DE_L_ETAPE_35 ; ici : les FORMES) — décisions
 * de l'orchestrateur du 02/11/2026 (lot allégé, K = 11) et critique de la 35 :
 *   - LES BRAS (critique, constats 1, 2, 4, 6) : rappel — la candidate face à la candidate + l'oubli d (grille, a priori) ;
 *     promus — « le commun des remis à zéro » (UN centre, attaque et défense, pour les promus ET les relégués) face aux
 *     centres DIRIGÉS (θ pour un promu, −θ pour un relégué) ; nouveaux venus — le commun posé sur eux face au centre des
 *     promus posé sur eux (rien n'est appris sur eux) ; force de l'effectif — le rappel du pli face au rappel + β·x (x : Δ
 *     standardisé, a priori 0,05) ; contrôles : la fausse rentrée, le faux promu (sans remise à zéro, taille comptée), le faux
 *     effectif (les Δ d'un autre club). Les familles promus / nouveaux / faux promu lisent leurs DEUX bras avec la remise à zéro
 *     faite avant le 1er match d'un club qui change de championnat (formulesDebuts.js) ;
 *   - À FOOTBALL-DATA (constat 2), TOUS les bras lisent le « commun fd » : le k0 réappris sur P1 (GRILLE_K0_FD) si FORME_FD le
 *     dit (fixé par T-B2bis avant le regard), sinon k0 = 8 ;
 *   - LE RECALAGE : chaque bras reçoit SES deux niveaux (forme fermée de Poisson) sur le MÊME ensemble — celui de la période
 *     d'apprentissage ; puis les bornes [0,2 ; 6] ;
 *   - L'APPRENTISSAGE : vraisemblance de Poisson des buts à la 90e (profil des niveaux) moins l'a priori ; grille pour d (à
 *     égalité la plus petite), Newton (gradient et hessien numériques) pour les centres et les β ;
 *   - LE JUGE : la perte log du SCORE EXACT, grille 0-20 (ρ de la base), plancher 1e-6 ; une ligne par match, bloc = le match ;
 *     magasin en deux plis croisés réunis dans UN comparer, football-data P1 → P2 ; K = VARIANTES_DE_L_ETAPE_35.length ;
 *   - RAPPORTÉ sans verdict : les 13 marchés témoins (et l'ampleur), les tranches de rang, la tranche 11-20 du rappel, P2 saison
 *     par saison et le huis clos, le « 1N2 seul » (le 1N2 d'avant-match football-data, quand il existe) ;
 *   - UTILE (§5.5, contrôles par fenêtre) : « retenu » sur une fenêtre au moins, avec 200 matchs et une ampleur ≥ 0,5 point ;
 *     « moins bon » nulle part ; son contrôle de la MÊME fenêtre pas « retenu ».
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/debutsDeSaison/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { comparer, zPour } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_35 } from '../../bench/lancements.js';
import { ancrerSurLeMarche, melanger } from '../../core/engine/goalModel.js';
import {
  BASE_STATISTIQUE, VERSION_DU_BANC, GRILLE_D, PRIOR_U, NEWTON, PRIOR_CENTRES, PRIOR_EFFECTIF, GRILLE_K0_FD, FORME_FD, FORMES_FD,
  PERIODES_DU_BANC, JUGE, AMPLEUR, MIN_MATCHS_UTILE, FICHE_RETENUE, FAMILLES, N_PREMIERES, TRANCHES_DE_RANG, EFFECTIF, PREUVE,
  LIMITES_DU_LOT_1A, DECISION_DE_PIERRE
} from './reglagesDebuts.js';
import { forcesDeDebut, attendusDebut, grilleDuJuge, perteDuScore, probabilitesTemoins, issuesTemoins, MARCHES_TEMOINS } from './formulesDebuts.js';
import { seuilDuFauxPromuDe, ecartTypeDeLEffectif, marquerLesRecords, concerneEffectif } from './passeDesDebuts.js';

export { seuilDuFauxPromuDe, ecartTypeDeLEffectif, marquerLesRecords };

const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const MOUVEMENT = new Set(['promu', 'relegue']);
const B = BASE_STATISTIQUE;
const borne = (x) => Math.min(B.bornes[1], Math.max(B.bornes[0], x));

export { VERSION_DU_BANC };

/**
 * LES FORMES DES VARIANTES (fixées avant le regard ; les noms sont ceux de VARIANTES_DE_L_ETAPE_35) : sa famille, sa fenêtre,
 * l'ensemble jugé, la sorte de ses bras, et si c'est un contrôle (placebo).
 */
export const FORMES = gele({
  'magasin-rappel-sans-cote': { famille: 'rappel', fenetre: 'magasin', ensemble: 'rappel', sorte: 'rappel', placebo: false },
  'magasin-placebo-fausse-rentree': { famille: 'rappel', fenetre: 'magasin', ensemble: 'fausse', sorte: 'fausse', placebo: true },
  'magasin-promus-sans-cote': { famille: 'promus', fenetre: 'magasin', ensemble: 'promus', sorte: 'promus', placebo: false },
  'magasin-nouveaux-sans-cote': { famille: 'nouveaux', fenetre: 'magasin', ensemble: 'nouveaux', sorte: 'nouveaux', placebo: false },
  'magasin-placebo-faux-promu': { famille: 'promus', fenetre: 'magasin', ensemble: 'fauxPromu', sorte: 'fauxPromu', placebo: true },
  'magasin-force-effectif-sans-cote': { famille: 'effectif', fenetre: 'magasin', ensemble: 'effectif', sorte: 'effectif', placebo: false },
  'magasin-placebo-faux-effectif': { famille: 'effectif', fenetre: 'magasin', ensemble: 'effectif', sorte: 'effectifFaux', placebo: true },
  'fd-promus-sans-cote': { famille: 'promus', fenetre: 'fd', ensemble: 'promus', sorte: 'promus', placebo: false },
  'fd-nouveaux-sans-cote': { famille: 'nouveaux', fenetre: 'fd', ensemble: 'nouveaux', sorte: 'nouveaux', placebo: false },
  'fd-placebo-faux-promu': { famille: 'promus', fenetre: 'fd', ensemble: 'fauxPromu', sorte: 'fauxPromu', placebo: true }
});

/** Les variantes JUGÉES : toutes les déclarées sauf la fiche retenue. */
export const VARIANTES_JUGEES = Object.freeze(VARIANTES_DE_L_ETAPE_35.map((v) => v.id).filter((id) => id !== FICHE_RETENUE));
/** Les familles dont une variante lit ses deux bras AVEC la remise à zéro du 1er match (le commun des remis à zéro). */
const AVEC_REMISE = new Set(['promus', 'nouveaux', 'fauxPromu']);

// ======================================================= les bras

/** Ce qu'un club lit dans un bras : { lu, p } (les sommes à lire, les réglages). */
function luDuClub(c, remise) {
  const s = c.sommes;
  if (!s) return null;
  if (remise && c.remise) return { tot: new Float64Array(8), sai: new Float64Array(8), n: s.n, nx: s.nx, dep: null };
  return { tot: s.tot, sai: s.sai, n: s.n, nx: s.nx, dep: c.faux?.dep ?? null };
}

/**
 * UN BRAS : une fonction (club, record) → réglages p de formulesDebuts.forcesDeDebut, la remise à zéro du 1er match ou non, le
 * k0 commun. `sorte` : 'candidate' | 'rappel' | 'fausse' | 'commun' | 'dirige' | 'nouveauxCommun' | 'nouveauxDirige' |
 * 'fauxPromu' | 'effectif' | 'effectifFaux' ; `v` : ses paramètres.
 */
export function bras(sorte, v = {}, { k0 = null, remise = false } = {}) {
  const base = k0 === null ? {} : { k0 };
  const centre = (t) => ({ cA: Math.exp(t[0]), cD: Math.exp(t[1]) });
  let pDe;
  switch (sorte) {
    case 'candidate':
      pDe = () => base;
      break;
    case 'rappel':
      pDe = () => ({ ...base, d: v.d });
      break;
    case 'fausse':
      pDe = (c) => (c.faux ? { ...base, dF: v.dF } : base);
      break;
    case 'commun':
      pDe = (c) => (MOUVEMENT.has(c.statut) ? { ...base, ...centre(v.c0) } : base);
      break;
    case 'dirige':
      pDe = (c) => (c.statut === 'promu' ? { ...base, ...centre(v.theta) } : c.statut === 'relegue' ? { ...base, ...centre([-v.theta[0], -v.theta[1]]) } : base);
      break;
    case 'nouveauxCommun':
      pDe = (c) => (c.statut === 'nouveau' ? { ...base, ...centre(v.c0) } : base);
      break;
    case 'nouveauxDirige':
      pDe = (c) => (c.statut === 'nouveau' ? { ...base, ...centre(v.theta) } : base);
      break;
    case 'fauxPromu':
      pDe = (c) => {
        const p = MOUVEMENT.has(c.statut) && v.c0 ? { ...base, ...centre(v.c0) } : { ...base };
        if (c.fauxPromu && v.m) {
          p.mA = Math.exp(v.m[0]);
          p.mD = Math.exp(v.m[1]);
        }
        return p;
      };
      break;
    case 'effectif':
    case 'effectifFaux':
      pDe = (c) => {
        const x = sorte === 'effectif' ? c.x : c.xFaux;
        const p = { ...base, d: v.d ?? 0 };
        if (v.b && x && concerneEffectif(c)) {
          p.bOff = v.b[0];
          p.xOff = x.off;
          p.bDef = v.b[1];
          p.xDef = x.def;
        }
        return p;
      };
      break;
    default:
      throw new Error(`banc des débuts : bras inconnu « ${sorte} »`);
  }
  return { sorte, v, remise, pDe };
}

/** Le marché ancré d'un record (le 1N2 d'avant-match, « 1N2 seul », RAPPORTÉ) — gardé sur le record. */
function marcheDe(r) {
  if (!r.prix1n2) return null;
  if (r._marche === undefined) {
    try {
      r._marche = ancrerSurLeMarche({ fair: r.prix1n2, plusMoins: null, rho: B.rho });
    } catch {
      r._marche = null;
    }
  }
  return r._marche;
}

/** Les buts attendus d'un record dans un bras (avant recalage et bornes) ; « 1n2 » : le mélange de la candidate (wT 0,55, wS 0,1). */
export function attendusDuBras(r, br, regime = 'sans') {
  const lh = luDuClub(r.h, br.remise);
  const la = luDuClub(r.a, br.remise);
  if (!lh || !la || !r.ligue) return null;
  const fh = forcesDeDebut(lh, br.pDe(r.h, r), B);
  const fa = forcesDeDebut(la, br.pDe(r.a, r), B);
  const s = attendusDebut({ ligue: r.ligue, fh, fa, r: B });
  if (regime === 'sans') return s;
  const m = marcheDe(r);
  return m ? melanger(m, s, B.melange.sans) : null;
}

/** Les attendus d'un bras sur des records (null écartés, comptés). */
function preDe(records, br, regime) {
  const pre = [];
  for (const r of records) {
    const e = attendusDuBras(r, br, regime);
    if (!e || !fini(e.lambda) || !fini(e.mu) || !(e.lambda > 0) || !(e.mu > 0)) pre.push(null);
    else pre.push(e);
  }
  return pre;
}

/** LE RECALAGE d'un bras sur des records (forme fermée de Poisson) : { cDom, cExt, matchs } ; lève s'il est impossible. */
export function recaler(records, br, regime = 'sans', pre = null) {
  const p = pre ?? preDe(records, br, regime);
  let yd = 0;
  let ye = 0;
  let ld = 0;
  let le = 0;
  let n = 0;
  records.forEach((r, i) => {
    if (!p[i] || !r.buts) return;
    yd += r.buts.dom;
    ye += r.buts.ext;
    ld += p[i].lambda;
    le += p[i].mu;
    n += 1;
  });
  if (!n || !(yd > 0) || !(ye > 0) || !(ld > 0) || !(le > 0)) throw new Error(`banc des débuts : recalage impossible (${n} matchs)`);
  return { cDom: Math.log(yd / ld), cExt: Math.log(ye / le), matchs: n };
}

/** La vraisemblance de Poisson (profil des niveaux : le recalage du bras) des buts à la 90e de records, bornes du modèle. */
export function vraisemblance(records, br, regime = 'sans') {
  if (!records.length) return { ll: 0, recalage: null };
  const pre = preDe(records, br, regime);
  const rc = recaler(records, br, regime, pre);
  const ed = Math.exp(rc.cDom);
  const ee = Math.exp(rc.cExt);
  let ll = 0;
  records.forEach((r, i) => {
    if (!pre[i] || !r.buts) return;
    const l = borne(pre[i].lambda * ed);
    const m = borne(pre[i].mu * ee);
    ll += r.buts.dom * Math.log(l) - l + r.buts.ext * Math.log(m) - m;
  });
  return { ll, recalage: rc };
}

/** La pénalité de l'a priori de l'oubli : ln(1 + d)² / (2 · 1,5²). */
export const penaliteDeD = (d, sd = PRIOR_U) => Math.log(1 + d) ** 2 / (2 * sd * sd);

/** L'oubli appris sur une grille (à égalité, la plus petite valeur). `faire(d)` → un bras. */
export function apprendreSurLaGrille(records, faire, { grille = GRILLE_D, regime = 'sans' } = {}) {
  let meilleur = null;
  for (const d of grille) {
    const crit = vraisemblance(records, faire(d), regime).ll - penaliteDeD(d);
    if (!meilleur || crit > meilleur.crit + 1e-9) meilleur = { d, crit };
  }
  return meilleur.d;
}

/** NEWTON (gradient et hessien numériques) : maximise f(x) − Σ x²/(2·prior²) ; rend { x, iterations, converge }. */
export function newton(f, x0, prior, { iterations = NEWTON.iterations, arret = NEWTON.arret, h = NEWTON.pas } = {}) {
  const x = [...x0];
  const p = x.length;
  const F = (v) => f(v) - v.reduce((t, z) => t + (z * z) / (2 * prior * prior), 0);
  let it = 0;
  let converge = false;
  while (it < iterations) {
    it += 1;
    const f0 = F(x);
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      const xp = [...x];
      xp[i] += h;
      const xm = [...x];
      xm[i] -= h;
      const fp = F(xp);
      const fm = F(xm);
      g[i] = (fp - fm) / (2 * h);
      H[i][i] = (fp - 2 * f0 + fm) / (h * h);
      for (let j = 0; j < i; j++) {
        const a = [...x];
        a[i] += h;
        a[j] += h;
        const b = [...x];
        b[i] += h;
        b[j] -= h;
        const c = [...x];
        c[i] -= h;
        c[j] += h;
        const e = [...x];
        e[i] -= h;
        e[j] -= h;
        H[i][j] = H[j][i] = (F(a) - F(b) - F(c) + F(e)) / (4 * h * h);
      }
    }
    // (−H) dx = g, par élimination de Gauss
    const A = H.map((l, i) => [...l.map((v) => -v), g[i]]);
    for (let c = 0; c < p; c++) {
      let piv = c;
      for (let i = c + 1; i < p; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let i = c + 1; i < p; i++) {
        const q = A[i][c] / A[c][c];
        for (let k = c; k <= p; k++) A[i][k] -= q * A[c][k];
      }
    }
    const dx = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let s = A[i][p];
      for (let k = i + 1; k < p; k++) s -= A[i][k] * dx[k];
      dx[i] = s / A[i][i];
    }
    if (!dx.every(fini)) break;
    for (let k = 0; k < p; k++) x[k] += dx[k];
    if (Math.max(...dx.map(Math.abs)) < arret) {
      converge = true;
      break;
    }
  }
  return { x, iterations: it, converge };
}

// ======================================================= les ensembles et les plis

const dans = (jour, p) => jour >= p.de && jour <= p.a;
/** Les records d'un ensemble sur une période (avec buts, forces et moyennes de ligue). */
const ensembleSur = (records, ens, p) => records.filter((r) => r.ens[ens] && r.buts && r.ligue && dans(r.date, p));

/**
 * LES PLIS d'une fenêtre : magasin, deux plis (apprendre A / juger B, puis l'inverse) ; football-data, un (P1 → P2). Rien après
 * le dernier jour lu au magasin, rien de P2 dans l'apprentissage à football-data : le juge LÈVE (T-B6).
 */
export function plisDe(fenetre, periodes = PERIODES_DU_BANC) {
  if (fenetre === 'magasin') return periodes.magasin.plis.map((p, f) => ({ pli: f, apprendre: p.apprendre, juger: p.juger, nom: f === 0 ? 'B' : 'A' }));
  if (fenetre === 'fd') return [{ pli: 0, apprendre: periodes.fd.apprendre, juger: periodes.fd.juger, nom: 'P2' }];
  throw new Error(`banc des débuts : fenêtre inconnue « ${fenetre} »`);
}

function verifierLesPeriodes(records, periodes) {
  for (const r of records) {
    if (r.fenetre === 'A' || r.fenetre === 'B') {
      if (r.date > periodes.magasin.dernierJourLu) throw new Error(`banc des débuts : la rencontre ${r.cle} du ${r.date} est après le dernier jour lu (${periodes.magasin.dernierJourLu}) — refusée`);
    }
  }
  const fd = periodes.fd;
  if (fd.apprendre.a >= fd.juger.de) throw new Error('banc des débuts : P2 dans l’apprentissage à football-data — refusé');
  for (const p of periodes.magasin.plis) if (!(p.apprendre.a < p.juger.de || p.juger.a < p.apprendre.de)) throw new Error('banc des débuts : un pli apprend sur ce qu’il juge — refusé');
}

// ======================================================= l'apprentissage d'une variante sur un pli

/**
 * LE COMMUN FD : le k0 de la candidate réappris sur P1 (TOUTES les rencontres de championnat de P1 avec un score), dans
 * GRILLE_K0_FD (à égalité, le plus petit) ; le même dans tous les bras (critique, constat 2). Rend { k0, parK0 }.
 */
export function apprendreLeK0Fd(records, { grille = GRILLE_K0_FD, periodes = PERIODES_DU_BANC } = {}) {
  const p1 = records.filter((r) => r.buts && r.ligue && dans(r.date, periodes.fd.apprendre));
  let meilleur = null;
  const parK0 = [];
  for (const k0 of grille) {
    const ll = vraisemblance(p1, bras('candidate', {}, { k0 })).ll;
    parK0.push({ k0, ll });
    if (!meilleur || ll > meilleur.ll + 1e-9) meilleur = { k0, ll };
  }
  return { k0: meilleur.k0, parK0, matchs: p1.length };
}

/**
 * L'APPRENTISSAGE d'une variante sur l'ensemble d'apprentissage `L` d'un pli : ses deux bras. `ctx` : ce que le pli a déjà
 * appris (dRappel, c0 et theta des promus), le k0 commun. Rend { A, B, appris }.
 */
export function apprendreLaVariante(id, L, ctx) {
  const forme = FORMES[id];
  if (!forme) throw new Error(`banc des débuts : la variante « ${id} » n'a pas de forme — refusée`);
  const o = { k0: ctx.k0 ?? null, remise: AVEC_REMISE.has(forme.sorte) };
  switch (forme.sorte) {
    case 'rappel': {
      const d = apprendreSurLaGrille(L, (x) => bras('rappel', { d: x }, o));
      return { A: bras('candidate', {}, o), B: bras('rappel', { d }, o), appris: { d } };
    }
    case 'fausse': {
      const dF = apprendreSurLaGrille(L, (x) => bras('fausse', { dF: x }, o));
      return { A: bras('candidate', {}, o), B: bras('fausse', { dF }, o), appris: { dF } };
    }
    case 'promus': {
      const c0 = newton((x) => vraisemblance(L, bras('commun', { c0: x }, o)).ll, [0, 0], PRIOR_CENTRES).x;
      const theta = newton((x) => vraisemblance(L, bras('dirige', { theta: x }, o)).ll, [0, 0], PRIOR_CENTRES).x;
      return { A: bras('commun', { c0 }, o), B: bras('dirige', { theta }, o), appris: { c0, theta } };
    }
    case 'nouveaux': {
      if (!ctx.promus) throw new Error('banc des débuts : les nouveaux venus sans les centres des promus du même pli');
      return { A: bras('nouveauxCommun', { c0: ctx.promus.c0 }, o), B: bras('nouveauxDirige', { theta: ctx.promus.theta }, o), appris: { c0: ctx.promus.c0, theta: ctx.promus.theta } };
    }
    case 'fauxPromu': {
      const c0 = ctx.promus?.c0 ?? [0, 0];
      const m = newton((x) => vraisemblance(L, bras('fauxPromu', { c0, m: x }, o)).ll, [0, 0], PRIOR_CENTRES).x;
      return { A: bras('fauxPromu', { c0, m: null }, o), B: bras('fauxPromu', { c0, m }, o), appris: { c0, m } };
    }
    case 'effectif':
    case 'effectifFaux': {
      const d = ctx.dRappel ?? 0;
      const b = newton((x) => vraisemblance(L, bras(forme.sorte, { d, b: x }, o)).ll, [0, 0], PRIOR_EFFECTIF).x;
      return { A: bras('rappel', { d }, o), B: bras(forme.sorte, { d, b }, o), appris: { d, b } };
    }
    default:
      throw new Error(`banc des débuts : sorte inconnue « ${forme.sorte} »`);
  }
}

/** Ce que chaque pli apprend d'abord (le contexte des variantes qui en dépendent) : dRappel, les centres des promus. */
export function contexteDuPli(records, fenetre, pl, { k0 = null } = {}) {
  const o = { k0, remise: false };
  const ctx = { k0 };
  if (fenetre === 'magasin') {
    const Lr = ensembleSur(records, 'rappel', pl.apprendre);
    ctx.dRappel = Lr.length ? apprendreSurLaGrille(Lr, (x) => bras('rappel', { d: x }, o)) : 0;
  }
  const Lp = ensembleSur(records.filter((r) => fenetreDe(r) === fenetre), 'promus', pl.apprendre);
  ctx.promus = { c0: [0, 0], theta: [0, 0] };
  if (Lp.length) {
    // un ensemble dégénéré (recalage impossible : aucun but d'un côté) n'arrête jamais le banc : les centres restent neutres, dit
    try {
      const a = apprendreLaVariante(fenetre === 'fd' ? 'fd-promus-sans-cote' : 'magasin-promus-sans-cote', Lp, ctx);
      ctx.promus = { c0: a.appris.c0, theta: a.appris.theta };
    } catch (error) {
      ctx.erreur = String(error?.message ?? error);
    }
  }
  return ctx;
}

const fenetreDe = (r) => (r.fenetre === 'P1' || r.fenetre === 'P2' ? 'fd' : 'magasin');

// ======================================================= le juge

/** Les lignes du juge d'une variante sur un pli : perte du score exact des deux bras (recalés sur L), témoins, ampleur, tranches. */
function lignesDuPli({ A, B: bB, L, J, pli, regime = 'sans' }) {
  const rA = recaler(L, A, regime);
  const rB = recaler(L, bB, regime);
  const eA = [Math.exp(rA.cDom), Math.exp(rA.cExt)];
  const eB = [Math.exp(rB.cDom), Math.exp(rB.cExt)];
  const lignes = [];
  const ampleur = new Float64Array(13);
  let temA = 0;
  let temB = 0;
  let ecartees = 0;
  const parLigne = [];
  for (const r of J) {
    const a = attendusDuBras(r, A, regime);
    const b = attendusDuBras(r, bB, regime);
    if (!a || !b || ![a.lambda, a.mu, b.lambda, b.mu].every((x) => fini(x) && x > 0)) {
      ecartees += 1;
      continue;
    }
    const gA = grilleDuJuge(a.lambda * eA[0], a.mu * eA[1], B);
    const gB = grilleDuJuge(b.lambda * eB[0], b.mu * eB[1], B);
    const pA = probabilitesTemoins(gA);
    const pB = probabilitesTemoins(gB);
    for (let q = 0; q < 13; q++) ampleur[q] += Math.abs(pB[q] - pA[q]);
    const issues = issuesTemoins(r.buts);
    const perte13 = (p) => p.reduce((s, x, q) => s - Math.log(Math.max(issues[q] ? x : 1 - x, JUGE.plancher)), 0);
    temA += perte13(pA);
    temB += perte13(pB);
    const l = { bloc: r.cle, date: r.date, a: perteDuScore(gA, r.buts), b: perteDuScore(gB, r.buts), pli };
    lignes.push(l);
    parLigne.push({ l, r });
  }
  return { lignes, parLigne, ampleur, temoins: { perteA: temA, perteB: temB }, ecartees, recalages: { A: rA, B: rB } };
}

/** Le juge de l'étape 16 sur des lignes : verdict, gain, gain relatif (en part de la perte du bras A), fourchettes. */
export function jugerDesLignes(lignes, { K, tirages = JUGE.tirages, graine = JUGE.graine, minBlocs = JUGE.minBlocs } = {}) {
  if (!lignes.length) return { verdict: 'pas-assez-de-matchs', lignes: 0, blocs: 0, gain: null, gainRelatif: null, fourchette: null, fourchetteRelative: null, z: zPour(JUGE.alpha, K) };
  const r = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes: K, tirages, graine, minBlocs, alpha: JUGE.alpha });
  const base = r.a.moyenne;
  const relatif = (x) => (fini(x) && fini(base) && base > 0 ? x / base : null);
  return {
    verdict: r.verdict,
    raison: r.raison,
    lignes: r.n.lignes,
    blocs: r.n.blocs,
    perteBase: base,
    perteVariante: r.b.moyenne,
    gain: r.gain,
    ecartType: r.ecartType,
    zObserve: fini(r.gain) && r.ecartType > 0 ? r.gain / r.ecartType : null,
    fourchette: r.fourchette,
    gainRelatif: relatif(r.gain),
    fourchetteRelative: r.fourchette ? [relatif(r.fourchette[0]), relatif(r.fourchette[1])] : null,
    z: r.seuil.z,
    variantes: r.seuil.variantes
  };
}

/** Le gain RAPPORTÉ d'un sous-ensemble de lignes (sans verdict) : moyenne de a − b, en part de la perte du bras A. */
function gainRapporte(lignes) {
  if (!lignes.length) return { matchs: 0, gain: null, gainRelatif: null };
  let a = 0;
  let b = 0;
  for (const l of lignes) {
    a += l.a;
    b += l.b;
  }
  return { matchs: lignes.length, gain: (a - b) / lignes.length, gainRelatif: a > 0 ? (a - b) / a : null };
}

/** La tranche de rang d'un record pour une famille : le plus petit rang des clubs concernés. */
function rangConcerne(r, ens) {
  const c = [r.h, r.a].filter((x) => x.valide && x.rang !== null);
  const ok = (x) =>
    ens === 'rappel' || ens === 'effectif' || ens === 'fauxPromu' ? x.statut === 'debut' : ens === 'promus' ? MOUVEMENT.has(x.statut) : ens === 'nouveaux' ? x.statut === 'nouveau' : ens === 'fausse' ? Boolean(x.faux) : false;
  const rangs = c.filter(ok).map((x) => (ens === 'fausse' ? x.faux.rang : x.rang));
  return rangs.length ? Math.min(...rangs) : null;
}

/**
 * UNE VARIANTE SUR SES PLIS : ses bras appris sur la période d'apprentissage de chaque pli, puis les lignes des matchs JUGÉS de
 * ce pli (chacune jugée avec ce qui a été appris sur l'AUTRE période). Rend le jugement et ce qui est rapporté.
 */
export function jugerUneVariante(id, records, { K, contextes, periodes = PERIODES_DU_BANC, tirages, graine, minBlocs }) {
  const forme = FORMES[id];
  const plis = plisDe(forme.fenetre, periodes);
  const lignes = [];
  const parLigne = [];
  const ampleur = new Float64Array(13);
  const temoins = { perteA: 0, perteB: 0 };
  const appris = [];
  const recalages = [];
  let ecartees = 0;
  const lignes1n2 = [];
  const lignes1120 = [];
  const sienne = records.filter((r) => fenetreDe(r) === forme.fenetre);
  for (const pl of plis) {
    const ctx = contextes[forme.fenetre][pl.pli];
    const L = ensembleSur(sienne, forme.ensemble, pl.apprendre);
    const J = ensembleSur(sienne, forme.ensemble, pl.juger);
    if (!L.length || !J.length) {
      appris.push({ pli: pl.pli, apprisSur: pl.apprendre, jugeSur: pl.juger, matchsAppris: L.length, matchsJuges: J.length, appris: null });
      continue;
    }
    let m;
    let res;
    try {
      m = apprendreLaVariante(id, L, ctx);
      res = lignesDuPli({ A: m.A, B: m.B, L, J, pli: pl.pli });
    } catch (error) {
      // un pli dégénéré (recalage impossible) : aucune ligne, dit — jamais un arrêt du passage
      appris.push({ pli: pl.pli, apprisSur: pl.apprendre, jugeSur: pl.juger, matchsAppris: L.length, matchsJuges: J.length, appris: null, erreur: String(error?.message ?? error) });
      continue;
    }
    lignes.push(...res.lignes);
    parLigne.push(...res.parLigne);
    res.ampleur.forEach((x, q) => {
      ampleur[q] += x;
    });
    temoins.perteA += res.temoins.perteA;
    temoins.perteB += res.temoins.perteB;
    ecartees += res.ecartees;
    recalages.push({ pli: pl.pli, A: res.recalages.A, B: res.recalages.B });
    appris.push({ pli: pl.pli, apprisSur: pl.apprendre, jugeSur: pl.juger, matchsAppris: L.length, matchsJuges: J.length, appris: m.appris });
    // RAPPORTÉ : « 1N2 seul » (les mêmes bras, le mélange de la candidate, recalés dans ce régime sur L avec un 1N2)
    const L1 = L.filter((r) => r.prix1n2);
    const J1 = J.filter((r) => r.prix1n2);
    if (L1.length >= 50 && J1.length) {
      try {
        lignes1n2.push(...lignesDuPli({ A: m.A, B: m.B, L: L1, J: J1, pli: pl.pli, regime: '1n2' }).lignes);
      } catch {
        // rien de rapporté si le recalage est impossible
      }
    }
    // RAPPORTÉ : la tranche 11-20 du rappel (la même variante sur plus de matchs)
    if (forme.sorte === 'rappel') {
      const J1120 = sienne.filter((r) => r.ens.rappel1120 && !r.ens.rappel && r.buts && r.ligue && dans(r.date, pl.juger));
      if (J1120.length) lignes1120.push(...lignesDuPli({ A: m.A, B: m.B, L, J: J1120, pli: pl.pli }).lignes);
    }
  }
  const juge = jugerDesLignes(lignes, { K, tirages, graine, minBlocs });
  const n = lignes.length;
  const parMarche = Object.fromEntries(MARCHES_TEMOINS.map((nom, q) => [nom, n ? ampleur[q] / n : null]));
  const max = n ? Math.max(...ampleur) / n : null;
  // RAPPORTÉ : les tranches de rang, P2 saison par saison, le huis clos
  const tranches = TRANCHES_DE_RANG.slice(0, 2).map(([de, a]) => ({ de, a, ...gainRapporte(parLigne.filter(({ r }) => { const x = rangConcerne(r, forme.ensemble); return x !== null && x >= de && x <= a; }).map(({ l }) => l)) }));
  const saisons = forme.fenetre === 'fd' ? periodes.fd.saisonsJugees.map((s) => ({ saison: s, ...gainRapporte(parLigne.filter(({ r }) => r.libelle === s).map(({ l }) => l)) })) : null;
  const huisClos = forme.fenetre === 'fd' ? gainRapporte(parLigne.filter(({ r }) => dans(r.date, periodes.fd.huisClos)).map(({ l }) => l)) : null;
  return {
    id,
    famille: forme.famille,
    fenetre: forme.fenetre,
    ensemble: forme.ensemble,
    placebo: forme.placebo,
    appris,
    recalages,
    matchsJuges: n,
    ecartees,
    ...juge,
    ampleur: { max, marche: n ? MARCHES_TEMOINS[ampleur.indexOf(Math.max(...ampleur))] : null, parMarche, seuil: AMPLEUR.seuil },
    temoins: { perteBase: n ? temoins.perteA / n : null, perteVariante: n ? temoins.perteB / n : null, gainRelatif: temoins.perteA > 0 ? (temoins.perteA - temoins.perteB) / temoins.perteA : null, juge: false },
    rapporte: { unDeuxSeul: gainRapporte(lignes1n2), tranches, tranche1120: forme.sorte === 'rappel' ? gainRapporte(lignes1120) : null, saisons, huisClos }
  };
}

/**
 * LE BANC ENTIER : les records de la passe (magasin et football-data, avec résultats ; `marquerLesRecords` déjà fait), puis
 * chaque variante jugée. `K` doit valoir le nombre de variantes DÉCLARÉES (VARIANTES_DE_L_ETAPE_35.length) ; une variante non
 * déclarée, ou sans forme, fait lever. Rend { version, K, z, k0Fd, contextes, variantes, familles, utiles, bancFaux }.
 */
export function jugerLesVariantes(records, { K = VARIANTES_DE_L_ETAPE_35.length, variantes = VARIANTES_JUGEES, declarees = VARIANTES_DE_L_ETAPE_35, periodes = PERIODES_DU_BANC, formeFd = FORME_FD, tirages, graine, minBlocs } = {}) {
  const ids = declarees.map((v) => v.id);
  if (K !== ids.length) throw new Error(`banc des débuts : K (${K}) doit valoir le nombre de variantes déclarées (${ids.length}, VARIANTES_DE_L_ETAPE_35)`);
  for (const id of variantes) {
    if (!ids.includes(id)) throw new Error(`banc des débuts : la variante « ${id} » n'est pas déclarée (VARIANTES_DE_L_ETAPE_35) — refusée`);
    if (!FORMES[id]) throw new Error(`banc des débuts : la variante « ${id} » n'a pas de forme — refusée`);
  }
  if (!FORMES_FD.includes(formeFd)) throw new Error(`banc des débuts : forme du commun fd inconnue « ${formeFd} »`);
  verifierLesPeriodes(records, periodes);
  const fd = records.filter((r) => fenetreDe(r) === 'fd');
  let k0Fd = { k0: B.prior, parK0: null, matchs: 0 };
  if (formeFd === 'k0-commun' && fd.length) {
    try {
      k0Fd = apprendreLeK0Fd(fd, { periodes });
    } catch (error) {
      k0Fd = { k0: B.prior, parK0: null, matchs: 0, erreur: String(error?.message ?? error) };
    }
  }
  const contextes = {
    magasin: plisDe('magasin', periodes).map((pl) => contexteDuPli(records, 'magasin', pl)),
    fd: plisDe('fd', periodes).map((pl) => contexteDuPli(fd, 'fd', pl, { k0: k0Fd.k0 }))
  };
  const resultats = variantes.map((id) => jugerUneVariante(id, records, { K, contextes, periodes, tirages, graine, minBlocs }));
  const familles = utileParFamille(resultats);
  return {
    version: VERSION_DU_BANC,
    K,
    z: zPour(JUGE.alpha, K),
    mesure: JUGE.mesure,
    periodes,
    formeFd,
    k0Fd,
    contextes: { magasin: contextes.magasin.map(resumerContexte), fd: contextes.fd.map(resumerContexte) },
    variantes: resultats,
    familles,
    utiles: Object.entries(familles).filter(([, f]) => f.utile).map(([nom]) => nom),
    bancFaux: Object.fromEntries(Object.entries(familles).map(([nom, f]) => [nom, f.bancFaux]))
  };
}

const resumerContexte = (c) => ({ k0: c.k0 ?? null, dRappel: c.dRappel ?? null, promus: c.promus ?? null });

/**
 * LA RÈGLE « UTILE » (§5.5, contrôles PAR FENÊTRE : critique, constat 2) : une famille est utile si, sur au moins une fenêtre,
 * sa variante est « retenu » avec au moins 200 matchs jugés et une ampleur ≥ 0,5 point, et que le contrôle de cette fenêtre
 * n'est pas « retenu » ; ET si sa variante n'est « moins bon » sur AUCUNE fenêtre. Un contrôle « retenu » sur une fenêtre rend
 * le banc FAUX pour la famille sur cette fenêtre (son verdict y est annulé, dit). La force de l'effectif : toujours « prudent ».
 */
export function utileParFamille(resultats) {
  const parId = new Map(resultats.map((r) => [r.id, r]));
  const out = {};
  for (const [nom, fam] of Object.entries(FAMILLES)) {
    const fenetres = {};
    let moinsBon = false;
    let retenue = null;
    const bancFaux = {};
    for (const [fenetre, { variante, placebo }] of Object.entries(fam.fenetres)) {
      const v = parId.get(variante) ?? null;
      const p = parId.get(placebo) ?? null;
      const faux = p?.verdict === 'retenu';
      bancFaux[fenetre] = faux;
      const raisons = [];
      if (!v) raisons.push('non jugée');
      else {
        if (v.verdict !== 'retenu') raisons.push(`verdict « ${v.verdict} »`);
        if (!(v.matchsJuges >= MIN_MATCHS_UTILE)) raisons.push(`${v.matchsJuges} matchs jugés (au moins ${MIN_MATCHS_UTILE})`);
        if (!(fini(v.ampleur.max) && v.ampleur.max >= AMPLEUR.seuil)) raisons.push('ampleur sous 0,5 point');
        if (v.verdict === 'moins-bon') moinsBon = true;
      }
      if (faux) raisons.push('le contrôle de cette fenêtre est « retenu » : le banc est faux pour la famille sur cette fenêtre');
      fenetres[fenetre] = { variante, placebo, verdict: v?.verdict ?? null, placeboVerdict: p?.verdict ?? null, raisons, retenueIci: raisons.length === 0 };
      if (raisons.length === 0 && !retenue) retenue = fenetre;
    }
    const utile = Boolean(retenue) && !moinsBon;
    out[nom] = { mot: fam.mot, utile, fenetre: utile ? retenue : null, prudent: fam.prudent || (utile && retenue === 'magasin'), moinsBonQuelquePart: moinsBon, bancFaux, fenetres };
  }
  return out;
}

/** LES VALEURS FINALES d'une famille, apprises sur A ∪ B du magasin (football-data : P1, pour information). */
export function valeursFinales(records, { formeFd = FORME_FD, periodes = PERIODES_DU_BANC } = {}) {
  const tout = { de: periodes.magasin.plis[0].apprendre.de, a: periodes.magasin.dernierJourLu };
  const pl = { pli: 'A∪B', apprendre: tout };
  const ctx = contexteDuPli(records, 'magasin', pl);
  const fd = records.filter((r) => fenetreDe(r) === 'fd');
  const k0 = formeFd === 'k0-commun' && fd.length ? apprendreLeK0Fd(fd, { periodes }).k0 : B.prior;
  const ctxFd = fd.length ? contexteDuPli(fd, 'fd', { pli: 'P1', apprendre: periodes.fd.apprendre }, { k0 }) : null;
  const eff = ensembleSur(records, 'effectif', tout);
  const effectif = eff.length ? apprendreLaVariante('magasin-force-effectif-sans-cote', eff, ctx).appris : null;
  return { magasin: { dRappel: ctx.dRappel, promus: ctx.promus, effectif }, fd: ctxFd ? { k0, promus: ctxFd.promus } : null };
}

/** L'horizon de la preuve d'une famille utile (§5.10) : ⌈n_banc × ((z(K) + 0,84) ÷ z_banc)²⌉ matchs concernés. */
export function horizonDeLaPreuve({ matchsJuges, zObserve }, K = VARIANTES_DE_L_ETAPE_35.length) {
  if (!(matchsJuges > 0) || !(zObserve > 0)) return null;
  return Math.ceil(matchsJuges * ((zPour(JUGE.alpha, K) + PREUVE.zPuissance) / zObserve) ** 2);
}

// ======================================================= la note recopiée (noteDesDebuts.js)

const arrondi = (x, n = 6) => (fini(x) ? Number(x.toFixed(n)) : null);
const arrondis = (a, n = 6) => (Array.isArray(a) ? a.map((x) => arrondi(x, n)) : null);

/**
 * CE QUI EST RECOPIÉ dans noteDesDebuts.js (DEBUTS_AU_BANC), tiré de la sortie du passage unique — pur ; `sortie` : { fichier,
 * sha1 } de la sortie gardée dans test/fixtures. La recopie se fait PAR SCRIPT (scripts/debuts-de-saison.mjs --recopier).
 */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc des débuts de saison (format 1)');
  const statuts = Object.fromEntries(Object.entries(b.familles).map(([nom, f]) => [nom, f.utile ? (f.prudent ? 'effet-mesure-prudent' : 'effet-mesure') : 'explication-seulement']));
  return {
    format: VERSION_DU_BANC,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie: sortie ?? null,
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    K: b.K,
    z: arrondi(b.z, 4),
    mesure: b.mesure,
    formeFd: b.formeFd,
    k0Fd: b.k0Fd?.k0 ?? null,
    variantes: b.variantes.map((v) => ({
      id: v.id,
      famille: v.famille,
      fenetre: v.fenetre,
      placebo: v.placebo,
      verdict: v.verdict,
      matchsJuges: v.matchsJuges,
      gainRelatif: arrondi(v.gainRelatif, 6),
      fourchetteRelative: arrondis(v.fourchetteRelative, 6),
      ampleur: { max: arrondi(v.ampleur.max, 5), marche: v.ampleur.marche },
      unDeuxSeul: { matchs: v.rapporte.unDeuxSeul.matchs, gainRelatif: arrondi(v.rapporte.unDeuxSeul.gainRelatif, 6) },
      appris: v.appris.map((a) => ({ pli: a.pli, matchsAppris: a.matchsAppris, matchsJuges: a.matchsJuges, appris: a.appris ? JSON.parse(JSON.stringify(a.appris, (k, x) => (typeof x === 'number' ? arrondi(x, 5) : x))) : null }))
    })),
    familles: b.familles,
    utiles: b.utiles,
    bancFaux: b.bancFaux,
    statuts,
    valeursFinales: sortieDuBanc.final ?? null,
    horizons: sortieDuBanc.horizons ?? null,
    decisionDePierre: DECISION_DE_PIERRE,
    limites: [...LIMITES_DU_LOT_1A]
  };
}

/** Le statut d'une famille à l'écran : « pas-encore-mesure » tant que la note est null ; sinon celui de la note. */
export function statutDeLaFamille(note, famille) {
  if (!(famille in FAMILLES)) throw new Error(`statutDeLaFamille : famille inconnue « ${famille} »`);
  if (note === null || note === undefined) return 'pas-encore-mesure';
  return note.statuts?.[famille] ?? 'explication-seulement';
}

/** Le TEXTE de noteDesDebuts.js pour une note (la recopie l'écrit tel quel ; le test T-B7 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDesDebuts.js — CE QUE DIT LE BANC DES DÉBUTS DE SAISON (étape 35 du plan, lot 1a, partie B).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/debuts-de-saison.mjs --recopier, sur la sortie du passage unique du banc ; avant lui',
    ' * --note-nulle), jamais retapé à la main : le test T-B7 (debutsBanc.test.mjs) refait ce texte à l’octet depuis la sortie',
    ' * gardée dans test/fixtures (banc-debuts-etape35.json, et les règles écrites avant le regard : banc-regles-etape35.md).',
    ' * DEBUTS_AU_BANC : pour chaque variante, son verdict (le juge de l’étape 16, perte du score exact, K variantes déclarées),',
    ' * son gain et sa fourchette, son ampleur ; pour chaque famille, utile ou non, et son statut à l’écran. null = pas encore',
    ' * mesuré. Hors de l’empreinte du moteur (data/debutsDeSaison/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
    ' * -----------------------------------------------------------------------',
    ' */',
    '',
    '/** Gèle un objet et tout ce qu’il contient : la note ne se modifie pas en mémoire. */',
    'const gele = (o) => {',
    "  if (o && typeof o === 'object' && !Object.isFrozen(o)) {",
    '    Object.freeze(o);',
    '    for (const v of Object.values(o)) gele(v);',
    '  }',
    '  return o;',
    '};',
    '',
    '/** Le banc des débuts de saison : verdicts, gains, fourchettes, ampleurs, familles utiles (null = pas encore mesuré). */',
    `export const DEBUTS_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}
