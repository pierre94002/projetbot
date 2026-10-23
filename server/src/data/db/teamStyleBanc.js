/**
 * teamStyleBanc.js — LE BANC DES STYLES DE JEU (étape 37 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Deux mesures, toutes EN LECTURE SEULE, aucune n'entre dans le moteur (scripts/team-style.mjs --banc) :
 *   1. LA STABILITÉ d'un mois sur l'autre (mesurerLaStabilite) : la part des clubs établis (12 matchs ou plus dans
 *      la fenêtre) qui gardent leur style du 1er d'un mois au 1er du suivant — avec le cran (hystérésis) et, pour
 *      témoin, sans lui ; le plus mauvais mois ; les débuts de saison. Elle ne lit AUCUN résultat de match : c'est
 *      elle qui a servi à choisir les réglages (REGLAGES_STYLE).
 *   2. LES DUELS DE STYLES face au marché (mesurerLesDuels), sur le magasin 2023-07-01 → 2026-09-23 SEULEMENT
 *      (histoire ET cibles ; 2023-01 → 2023-06 et l'après-23/09 restent jamais vus) : pour chaque case « style du
 *      club qui reçoit × style du visiteur », un décalage appris sur 2023-07 → 2025-06 (1N2 : une inclinaison vers
 *      le domicile ou l'extérieur ; plus/moins 2,5 : un décalage de la chance de « plus »), ramené vers zéro
 *      (prior : écart-type 0,1), puis vérifié sur 2025-07 → 2026-09-23 face à la COTE DE CLÔTURE football-data
 *      (marge retirée par la méthode puissance). Le juge est celui de l'étape 16 (guard.js, comparer : perte log,
 *      blocs = match) avec K = TOUTES les variantes regardées (VARIANTES_DE_L_ETAPE_37 : 53) — le seuil sévère :
 *      z ≈ 3,31 au lieu de 1,96. Ce qui en sort est RECOPIÉ dans teamStyle.js (DUELS_AU_BANC) : seules les cases
 *      « retenu » sont dites « effet mesuré » à l'écran, toutes les autres « explication seulement ».
 * -----------------------------------------------------------------------
 */

import { comparer } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_37, VUES_DE_L_ETAPE_37 } from '../../bench/lancements.js';
import { methodePuissance } from './playerRatingsBanc.js';
import { isCup } from '../providers/leagueCups.js';
import { CalculDesStyles, lireToutesLesRencontres, STYLES_ET_EQUILIBRE, REGLAGES_STYLE, empreinteDesReglages, numeroDe } from './teamStyle.js';

export { VARIANTES_DE_L_ETAPE_37, VUES_DE_L_ETAPE_37 };

/** Les fenêtres du banc (jours compris) : la seule fenêtre permise du magasin, coupée en apprentissage et vérification. */
export const PERIODES_DU_BANC = Object.freeze({
  donnees: Object.freeze({ de: '2023-07-01', a: '2026-09-23' }),
  apprentissage: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }),
  verification: Object.freeze({ de: '2025-07-01', a: '2026-09-23' })
});
/** Le juge : K = toutes les variantes regardées de l'étape 37. */
export const K_VARIANTES = VARIANTES_DE_L_ETAPE_37.length;
/** Le retour vers zéro des décalages appris : un a priori d'écart-type 0,1 (λ = 1 / 0,1²), fixé AVANT de regarder. */
export const LAMBDA = 100;
const PMIN = 1e-6;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

// ======================================================= 1. la stabilité (aucun résultat lu)

/**
 * LA STABILITÉ d'une suite d'instantanés mensuels ([[jour, Map club → entrée]], CalculDesStyles.suite) : la part
 * des clubs établis aux deux 1ers du mois qui gardent le même style ; sans le cran (témoin) ; par mois ; le plus bas ;
 * les débuts de saison (moins de `debutSaison` matchs depuis la trêve au second mois). Pure.
 */
export function mesurerLaStabilite(suite, reglages = REGLAGES_STYLE) {
  const mensuels = suite.filter(([J]) => J.endsWith('-01'));
  let paires = 0;
  let memes = 0;
  let memesSansCran = 0;
  let pairesDebut = 0;
  let memesDebut = 0;
  const parMois = [];
  for (let i = 1; i < mensuels.length; i++) {
    const [J, inst] = mensuels[i];
    const prec = mensuels[i - 1][1];
    let p = 0;
    let m = 0;
    for (const [club, e] of inst) {
      const a = prec.get(club);
      if (!a || a.n < reglages.etabli || e.n < reglages.etabli) continue;
      p++;
      if (a.style === e.style) m++;
      // Le témoin sans le cran : les étiquettes recalculées des seuls scores.
      const sa = sansCran(a.scores, reglages);
      const se = sansCran(e.scores, reglages);
      if (sa === se) memesSansCran++;
      if (e.nSaison < reglages.debutSaison) {
        pairesDebut++;
        if (a.style === e.style) memesDebut++;
      }
    }
    paires += p;
    memes += m;
    if (p) parMois.push({ jour: J, paires: p, part: m / p });
  }
  const plusBas = parMois.reduce((x, y) => (!x || y.part < x.part ? y : x), null);
  return {
    paires,
    part: paires ? memes / paires : null,
    sansCran: paires ? memesSansCran / paires : null,
    debutSaison: { paires: pairesDebut, part: pairesDebut ? memesDebut / pairesDebut : null },
    plusBas,
    parMois
  };
}

function sansCran(scores, reglages) {
  let best = null;
  for (const id of ['possession', 'direct', 'contre', 'cpa']) if (fini(scores[id]) && scores[id] >= reglages.seuil && (best === null || scores[id] > scores[best])) best = id;
  return best ?? 'equilibre';
}

/** La répartition des styles des clubs établis d'un instantané : { style: nombre }. */
export function repartition(instantane, reglages = REGLAGES_STYLE) {
  const out = Object.fromEntries(STYLES_ET_EQUILIBRE.map((id) => [id, 0]));
  for (const e of instantane.values()) if (e.n >= reglages.etabli) out[e.style]++;
  return out;
}

// ======================================================= 2. les duels (petites règles pures)

/** L'inclinaison d'un 1N2 : [pH·e^x, pN, pA·e^−x] renormalisés. */
export function incliner(p, x) {
  const e = [p[0] * Math.exp(x), p[1], p[2] * Math.exp(-x)];
  const s = e[0] + e[1] + e[2];
  return e.map((v) => v / s);
}
const logit = (p) => Math.log(p / (1 - p));
const sigmoide = (x) => 1 / (1 + Math.exp(-x));
/** La chance de « plus de 2,5 » décalée de y sur l'échelle logit. */
export const decaler = (p, y) => sigmoide(logit(Math.min(1 - PMIN, Math.max(PMIN, p))) + y);
export const perte1N2 = (p, issue) => -Math.log(Math.max(PMIN, p[issue]));
export const perteBinaire = (p, oui) => -Math.log(Math.max(PMIN, oui ? p : 1 - p));

/**
 * Le décalage qui minimise Σ perte + λ·x²/2 (une seule inconnue : dichotomie sur la dérivée, croissante). `perteDe(x)`
 * rend la perte totale. Pur.
 */
export function apprendreUnDecalage(perteDe, lambda = LAMBDA) {
  const f = (x) => perteDe(x) + (lambda * x * x) / 2;
  const h = 1e-5;
  const d = (x) => (f(x + h) - f(x - h)) / (2 * h);
  let lo = -2;
  let hi = 2;
  if (d(lo) > 0) return lo;
  if (d(hi) < 0) return hi;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (d(m) > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

/** Les cotes de clôture football-data rattachées (lien = 1) dans la fenêtre : Map clé → { un2, pm, bd, be }. */
export function lireLesCotes(database, { de, a }) {
  const out = new Map();
  const dec = (v) => (v === null || v === undefined ? null : v > 100 ? v / 100 : null);
  for (const r of database.prepare('SELECT match_key, bd, be, moy_c1, moy_cn, moy_c2, moy_cp25, moy_cm25 FROM fd_history WHERE lien = 1 AND match_key IS NOT NULL AND date >= ? AND date <= ?').iterate(de, a)) {
    const un2 = dec(r.moy_c1) && dec(r.moy_cn) && dec(r.moy_c2) ? methodePuissance([dec(r.moy_c1), dec(r.moy_cn), dec(r.moy_c2)]) : null;
    const pm = dec(r.moy_cp25) && dec(r.moy_cm25) ? methodePuissance([dec(r.moy_cp25), dec(r.moy_cm25)]) : null;
    if (!un2 && !pm) continue;
    if (!fini(r.bd) || !fini(r.be)) continue;
    out.set(r.match_key, { un2, pm: pm ? pm[0] : null, bd: r.bd, be: r.be });
  }
  return out;
}

/**
 * Les MATCHS DU BANC : chaque rencontre de championnat de la fenêtre, avec une cote de clôture, dont les deux clubs
 * ont un style ÉTABLI au jour du match (calculé avec les seuls matchs d'avant, le cran pris au 1er du mois). Rend
 * [{ cle, date, dom, ext, un2, pm, issue, plus }].
 */
export function matchsDuBanc({ database, calcul, cotes }) {
  const suite = calcul.suite({ jusqua: PERIODES_DU_BANC.donnees.a });
  const mensuels = new Map(suite);
  const moisDe = (J) => `${J.slice(0, 7)}-01`;
  const precedentDe = (J) => {
    const m = moisDe(J);
    if (m < J) return mensuels.get(m) ?? null;
    const [y, mo] = [Number(m.slice(0, 4)), Number(m.slice(5, 7))];
    const p = mo === 1 ? `${y - 1}-12-01` : `${y}-${String(mo - 1).padStart(2, '0')}-01`;
    return mensuels.get(p) ?? null;
  };
  const rencontres = [];
  for (const m of database.prepare('SELECT match_key, date, league, home_id, away_id FROM matches WHERE date >= ? AND date <= ? ORDER BY date, match_key').iterate(PERIODES_DU_BANC.donnees.de, PERIODES_DU_BANC.donnees.a)) {
    if (isCup(m.league)) continue;
    const c = cotes.get(m.match_key);
    if (!c) continue;
    const h = numeroDe(m.home_id);
    const a = numeroDe(m.away_id);
    if (h === null || a === null) continue;
    rencontres.push({ ...m, h, a, c });
  }
  const parJour = new Map();
  for (const r of rencontres) {
    if (!parJour.has(r.date)) parJour.set(r.date, []);
    parJour.get(r.date).push(r);
  }
  const out = [];
  for (const [J, liste] of parJour) {
    const inst = mensuels.get(J) ?? calcul.instantane(J, precedentDe(J));
    for (const r of liste) {
      const sd = inst.get(r.h);
      const se = inst.get(r.a);
      if (!sd || !se || sd.n < calcul.reglages.etabli || se.n < calcul.reglages.etabli) continue;
      out.push({
        cle: r.match_key,
        date: J,
        dom: sd.style,
        ext: se.style,
        un2: r.c.un2,
        pm: r.c.pm,
        issue: r.c.bd > r.c.be ? 0 : r.c.bd === r.c.be ? 1 : 2,
        plus: r.c.bd + r.c.be > 2.5
      });
    }
  }
  return out;
}

const dansLa = (p, d) => d >= p.de && d <= p.a;
export const casesDuDuel = () => STYLES_ET_EQUILIBRE.flatMap((d) => STYLES_ET_EQUILIBRE.map((e) => `${d}|${e}`));

/**
 * Apprend (sur l'apprentissage) puis JUGE (sur la vérification) les duels : un décalage par case et par marché ; le
 * jugement global de chaque marché (toutes les cases avec leur décalage) et celui de chaque case. Rend { matchs,
 * apprentissage, verification, decalages, global: { un2, pm }, cases: [...] }. Pur (les matchs sont donnés).
 */
export function jugerLesDuels(matchs, { K = K_VARIANTES, lambda = LAMBDA, tirages = 1000, graine = 37 } = {}) {
  const app = matchs.filter((m) => dansLa(PERIODES_DU_BANC.apprentissage, m.date));
  const ver = matchs.filter((m) => dansLa(PERIODES_DU_BANC.verification, m.date));
  const decalages = {};
  for (const cle of casesDuDuel()) {
    const [dom, ext] = cle.split('|');
    const a = app.filter((m) => m.dom === dom && m.ext === ext);
    const a1 = a.filter((m) => m.un2);
    const a2 = a.filter((m) => fini(m.pm));
    decalages[cle] = {
      dom,
      ext,
      apprentissage: { un2: a1.length, pm: a2.length },
      un2: a1.length ? apprendreUnDecalage((x) => a1.reduce((s, m) => s + perte1N2(incliner(m.un2, x), m.issue), 0), lambda) : 0,
      pm: a2.length ? apprendreUnDecalage((y) => a2.reduce((s, m) => s + perteBinaire(decaler(m.pm, y), m.plus), 0), lambda) : 0
    };
  }
  const lignes = (liste, marche) =>
    liste
      .filter((m) => (marche === 'un2' ? m.un2 : fini(m.pm)))
      .map((m) => {
        const d = decalages[`${m.dom}|${m.ext}`][marche];
        return marche === 'un2'
          ? { bloc: m.cle, date: m.date, a: perte1N2(m.un2, m.issue), b: perte1N2(incliner(m.un2, d), m.issue) }
          : { bloc: m.cle, date: m.date, a: perteBinaire(m.pm, m.plus), b: perteBinaire(decaler(m.pm, d), m.plus) };
      });
  const juger = (l) => {
    if (!l.length) return { verdict: 'pas-assez-de-matchs', matchs: 0, gain: null, fourchette: null };
    const r = comparer(l, { mode: 'moyenne', sens: 'min', variantes: K, tirages, graine });
    const base = l.reduce((s, x) => s + x.a, 0) / l.length;
    return {
      verdict: r.verdict,
      matchs: l.length,
      // Le gain en part de la perte du marché (positif = le duel fait mieux que la clôture).
      gain: fini(r.gain) && base ? r.gain / base : null,
      fourchette: r.fourchette && base ? [r.fourchette[0] / base, r.fourchette[1] / base] : null,
      ecartType: r.ecartType
    };
  };
  const global = { un2: juger(lignes(ver, 'un2')), pm: juger(lignes(ver, 'pm')) };
  const cases = [];
  for (const cle of casesDuDuel()) {
    const d = decalages[cle];
    const v = ver.filter((m) => m.dom === d.dom && m.ext === d.ext);
    for (const marche of ['un2', 'pm']) {
      const j = juger(lignes(v, marche));
      const effet =
        marche === 'un2'
          ? moyenneDe(v.filter((m) => m.un2).map((m) => incliner(m.un2, d.un2)[0] - m.un2[0]))
          : moyenneDe(v.filter((m) => fini(m.pm)).map((m) => decaler(m.pm, d.pm) - m.pm));
      cases.push({ dom: d.dom, ext: d.ext, marche, decalage: d[marche], apprentissage: d.apprentissage[marche], ...j, effet });
    }
  }
  return { matchs: matchs.length, apprentissage: app.length, verification: ver.length, decalages, global, cases, K };
}
const moyenneDe = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * LE BANC COMPLET sur une base (lecture seule) : les lignes d'ingrédients de la fenêtre permise SEULEMENT, le calcul,
 * la stabilité, les matchs du banc et le jugement des duels. Rend aussi `aRecopier` : ce que DUELS_AU_BANC doit
 * contenir.
 */
export function mesurerAuBanc({ database, le = null }) {
  const t0 = performance.now();
  const travail = lireToutesLesRencontres(database);
  let e = travail.next();
  while (!e.done) e = travail.next();
  const lignes = e.value.filter((l) => l.date >= PERIODES_DU_BANC.donnees.de && l.date <= PERIODES_DU_BANC.donnees.a);
  const calcul = new CalculDesStyles(lignes);
  const tLecture = performance.now();
  const cotes = lireLesCotes(database, PERIODES_DU_BANC.donnees);
  const matchs = matchsDuBanc({ database, calcul, cotes });
  const stabilite = mesurerLaStabilite([...calcul.instantanes.entries()].filter(([J]) => J.endsWith('-01')).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const tMatchs = performance.now();
  const duels = jugerLesDuels(matchs);
  const dernierMois = [...calcul.instantanes.keys()].filter((J) => J.endsWith('-01')).sort().at(-1);
  const r = {
    periodes: PERIODES_DU_BANC,
    K: K_VARIANTES,
    reglages: empreinteDesReglages(),
    stabilite,
    repartition: dernierMois ? { jour: dernierMois, ...repartition(calcul.instantanes.get(dernierMois)) } : null,
    duels,
    durees: { lecture: Math.round(tLecture - t0), matchs: Math.round(tMatchs - tLecture), juge: Math.round(performance.now() - tMatchs) }
  };
  r.aRecopier = {
    le,
    reglages: r.reglages,
    K: K_VARIANTES,
    global: Object.fromEntries(['un2', 'pm'].map((m) => [m, { verdict: duels.global[m].verdict, matchs: duels.global[m].matchs, gain: arrondi(duels.global[m].gain), fourchette: duels.global[m].fourchette?.map(arrondi) ?? null }])),
    casesJugees: duels.cases.filter((c) => c.verdict !== 'pas-assez-de-matchs').length,
    casesTropPetites: duels.cases.filter((c) => c.verdict === 'pas-assez-de-matchs').length,
    cases: duels.cases
      .filter((c) => c.verdict === 'retenu')
      .map((c) => ({ dom: c.dom, ext: c.ext, marche: c.marche, verdict: c.verdict, matchs: c.matchs, gain: arrondi(c.gain), fourchette: c.fourchette?.map(arrondi) ?? null, effet: arrondi(c.effet), decalage: arrondi(c.decalage) }))
  };
  return r;
}
const arrondi = (x) => (fini(x) ? Math.round(x * 1e5) / 1e5 : null);
