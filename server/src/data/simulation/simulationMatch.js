/**
 * simulationMatch.js — LE DÉROULÉ D'UN MATCH, créneau par créneau (étape 28 du plan, conception §1.2-§1.6).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni hasard non amorcé (le hasard vient d'une graine passée en argument).
 * HORS de l'empreinte du moteur (data/simulation/) : il lit le moteur (la grille des scores de goalModel.js, la loi
 * de Poisson et Dixon-Coles de core/model) sans jamais le modifier.
 *
 * 92 créneaux k = 0..91 : 0..44 = minutes 1..45 ; 45 = temps additionnel de la 1re mi-temps ; 46..90 = minutes
 * 46..90 ; 91 = temps additionnel de la 2e. Tranches b : 0 pour k ≤ 45, 1 pour 46..75, 2 pour 76..91. État vu du camp
 * c : d = buts de c − buts adverses (borné à −2..+2), r = rouges adverses − rouges propres (borné à −1..+1).
 *
 *   x_c(k) = Λ_c · profil[k] · M_c[((d + 2)·3 + (r + 1))·3 + b]       Λ = λ (reçoit) ou μ (visiteuse) ; M = MH ou MA
 *   buts du camp c au créneau k ~ Poisson(x_c), par INVERSION EXACTE sur un uniforme u (critique E4) :
 *       p = exp(−x) ; cum = p ; j = 0 ; tant que u > cum et j < 8 : j++ ; p = p·x/j ; cum += p
 *   rouge du camp c ~ Bernoulli(rougeBande[bande(k)] · rougeEtat[d + 2]), au plus 2 par camp (hasard moyen, E5)
 *
 * Ordre des tirages dans un créneau, figé : buts domicile, buts extérieur, rouge domicile, rouge extérieur. Les
 * deux tirages de buts lisent l'état du DÉBUT du créneau (les buts du créneau comptent pour le créneau suivant) ;
 * le rouge lit l'écart APRÈS les buts du créneau — c'est l'ordre du noyau mesuré (mesures/simulation/sim-core.mjs)
 * que les bancs v1/v2 ont jugé. Un tirage de rouge n'est fait que si le camp a moins de 2 rouges. La mi-temps se
 * relève APRÈS le créneau 45 (le bloc 45+ est dans la 1re mi-temps) ; le score final est celui de la fin du créneau
 * 91 (la 90e et son temps additionnel, comme le règlement) ; plafond de 20 buts par camp pour l'indice de case.
 *
 * STRATIFICATION SUR LA GRILLE (conception §1.3) : n(i, j) = chemins finis en (i, j) ; couverte = Σ_{n > 0} grille ;
 *   poids(chemin fini en (i, j)) = grille(i, j) / n(i, j) / couverte
 * Les marchés du score final se lisent dans la GRILLE (marchesDuScore), jamais dans les chemins ; dans les
 * chemins, Σ poids par case = grille / couverte, et la masse des cases jamais atteintes est rapportée.
 * -----------------------------------------------------------------------
 */

import { poissonProbability } from '../../core/model/poisson.js';
import { dixonColesAdjustment } from '../../core/model/dixonColes.js';
import { marchesDeLaGrille } from '../../core/engine/goalModel.js';
import { NB_CRENEAUX, CRENEAU_MI_TEMPS, TAILLE_GRILLE, BUTS_MAX_PAR_CRENEAU, ROUGES_MAX, VERSION_SIMULATION, CONVENTION_AVANT_30, N } from './reglages.js';

const T = TAILLE_GRILLE;
/** Premier but : créneau 255 = aucun but ; 254 = inconnu (des buts avaient déjà été marqués au départ `depuis`). */
export const AUCUN_CRENEAU = 255;
export const CRENEAU_INCONNU = 254;
/** Camp du premier but : 0 domicile, 1 extérieur, 2 aucun, 3 inconnu (départ `depuis` avec des buts). */
export const PREMIER_INCONNU = 3;
/** Mi-temps inconnue (départ `depuis` après la mi-temps). */
export const MI_TEMPS_INCONNUE = 255;
/** Une table jointe : 7 octets par case (mi-temps dom., ext., fin dom., ext., code, compte sur 2 octets). */
export const OCTETS_PAR_CASE = 7;

class EntreeInvalide extends Error {}
export { EntreeInvalide };

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
/** La tranche d'un créneau pour les multiplicateurs : 1re mi-temps (45+ compris), 46-75, 76-90+. */
export const trancheDu = (k) => (k <= CRENEAU_MI_TEMPS ? 0 : k <= 75 ? 1 : 2);

// ------------------------------------------------------------ le hasard amorcé

/** FNV-1a 32 bits d'une chaîne (unités UTF-16), jamais 0. */
export function fnv1a(chaine) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < chaine.length; i++) {
    h ^= chaine.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

/** xoshiro128** amorcé par splitmix32 (le noyau mesuré, recopié) : rend une fonction qui tire un uniforme dans [0, 1). */
export function generateur(seed) {
  let s = seed >>> 0;
  const mot = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = mot();
  let b = mot();
  let c = mot();
  let d = mot();
  return () => {
    let res = Math.imul(b, 5) >>> 0;
    res = ((res << 7) | (res >>> 25)) >>> 0;
    res = Math.imul(res, 9) >>> 0;
    const t = (b << 9) >>> 0;
    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;
    c = (c ^ t) >>> 0;
    d = ((d << 11) | (d >>> 21)) >>> 0;
    return res / 4294967296;
  };
}

/**
 * La graine d'un match : FNV-1a de « clé | rôle | version | λ (3 déc.) | μ (3 déc.) | ρ » — même entrée, mêmes chemins
 * à l'octet ; λ ou μ qui bougent d'un millième, autres chemins. `cle` : la clé du match (fixture_key) ; `role` :
 * 'service' ou 'candidate'.
 */
export function graineDuMatch({ cle, role, lambda, mu, rho, version = VERSION_SIMULATION }) {
  if (typeof cle !== 'string' || cle === '') throw new EntreeInvalide('graineDuMatch : la clé du match est obligatoire.');
  if (typeof role !== 'string' || role === '') throw new EntreeInvalide('graineDuMatch : le rôle est obligatoire.');
  if (!fini(lambda) || !fini(mu) || !fini(rho)) throw new EntreeInvalide('graineDuMatch : λ, μ et ρ doivent être des nombres finis.');
  return fnv1a(`${cle}|${role}|${version}|${lambda.toFixed(3)}|${mu.toFixed(3)}|${rho}`);
}

// ------------------------------------------------------------ la loi de Poisson tirée

/** Le nombre de buts d'un créneau : inversion EXACTE de Poisson(x) sur l'uniforme u (au plus BUTS_MAX_PAR_CRENEAU). */
export function poissonInverse(u, x) {
  return poissonInverseDepuis(u, x, Math.exp(-x));
}

/** La même inversion, P(0) = exp(−x) déjà calculé (table des taux du match : un seul exp par créneau et par état). */
function poissonInverseDepuis(u, x, p0) {
  let p = p0;
  let cum = p;
  let j = 0;
  while (u > cum && j < BUTS_MAX_PAR_CRENEAU) {
    j++;
    p = (p * x) / j;
    cum += p;
  }
  return j;
}

// ------------------------------------------------------------ les paramètres

function verifierParams(params) {
  const tableau = (v, n) => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === n && Array.from(v).every((x) => fini(x) && x >= 0);
  if (!params || typeof params !== 'object') throw new EntreeInvalide('simulerMatch : paramètres absents.');
  if (!tableau(params.profil, NB_CRENEAUX)) throw new EntreeInvalide('simulerMatch : profil de 92 parts attendu.');
  if (!tableau(params.MH, 45) || !tableau(params.MA, 45)) throw new EntreeInvalide('simulerMatch : MH et MA de 45 multiplicateurs attendus.');
  if (!Array.isArray(params.bandes) || !params.bandes.length) throw new EntreeInvalide('simulerMatch : bandes des rouges absentes.');
  if (!tableau(params.rougeBande, params.bandes.length) || !tableau(params.rougeEtat, 5)) throw new EntreeInvalide('simulerMatch : hasards des rouges absents.');
}

/** L'indice de la bande des rouges de chaque créneau (−1 si aucune bande ne le couvre : jamais de rouge alors). */
function bandesDesCreneaux(bandes) {
  const b = new Int8Array(NB_CRENEAUX);
  for (let k = 0; k < NB_CRENEAUX; k++) b[k] = bandes.findIndex(([, de, a]) => k >= de && k <= a);
  return b;
}

// ------------------------------------------------------------ la simulation

/**
 * Simule `n` déroulés d'un match. `lambda`, `mu` : buts attendus (domicile, extérieur) ; `grille` : la grille des
 * scores (441 cases, indice home × 21 + away) sur laquelle les chemins sont stratifiés, ou null (poids 1/n) ;
 * `params` : PARAMS de reglages.js (ou une variante pour un banc) ; `seed` : la graine (graineDuMatch) ; `depuis` :
 * un état de départ { slot, h, a, rh, ra } (le direct, la prolongation ; 0-0 au créneau 0 par défaut).
 * Rend { n, ftH, ftA, htH, htA, premierSlot, premierCamp, rougesH, rougesA (Uint8Array), poids (Float64Array),
 * masseNonCouverte, couverte, tailleEffective, seed }.
 */
export function simulerMatch({ lambda, mu, grille = null, params, n = N, seed, depuis = null }) {
  if (!fini(lambda) || !fini(mu) || lambda < 0 || mu < 0) throw new EntreeInvalide(`simulerMatch : λ et μ positifs attendus (${lambda}, ${mu}).`);
  if (!Number.isInteger(n) || n < 1) throw new EntreeInvalide(`simulerMatch : n entier positif attendu (${n}).`);
  if (!fini(seed)) throw new EntreeInvalide('simulerMatch : la graine est obligatoire (jamais un hasard non amorcé).');
  if (grille !== null && !((Array.isArray(grille) || ArrayBuffer.isView(grille)) && grille.length === T * T)) throw new EntreeInvalide('simulerMatch : grille de 441 cases attendue.');
  verifierParams(params);
  const s0 = depuis ?? { slot: 0, h: 0, a: 0, rh: 0, ra: 0 };
  if (![s0.slot, s0.h, s0.a, s0.rh, s0.ra].every((x) => Number.isInteger(x) && x >= 0) || s0.slot >= NB_CRENEAUX) throw new EntreeInvalide('simulerMatch : état de départ invalide.');

  const rng = generateur(seed);
  const { profil, MH, MA, rougeBande, rougeEtat } = params;
  const bandeK = bandesDesCreneaux(params.bandes);
  const trancheK = Uint8Array.from({ length: NB_CRENEAUX }, (_, k) => trancheDu(k));
  const ftH = new Uint8Array(n);
  const ftA = new Uint8Array(n);
  const htH = new Uint8Array(n);
  const htA = new Uint8Array(n);
  const premierSlot = new Uint8Array(n);
  const premierCamp = new Uint8Array(n);
  const rougesH = new Uint8Array(n);
  const rougesA = new Uint8Array(n);
  // Les taux x et P(0) = exp(−x) de chaque (créneau, état), calculés une fois par match : mêmes nombres qu'un exp par tirage.
  const xH = new Float64Array(NB_CRENEAUX * 45);
  const xA = new Float64Array(NB_CRENEAUX * 45);
  const p0H = new Float64Array(NB_CRENEAUX * 45);
  const p0A = new Float64Array(NB_CRENEAUX * 45);
  for (let k = 0; k < NB_CRENEAUX; k++) {
    for (let e = 0; e < 45; e++) {
      xH[k * 45 + e] = lambda * profil[k] * MH[e];
      xA[k * 45 + e] = mu * profil[k] * MA[e];
      p0H[k * 45 + e] = Math.exp(-xH[k * 45 + e]);
      p0A[k * 45 + e] = Math.exp(-xA[k * 45 + e]);
    }
  }
  const dejaMarque = s0.h + s0.a > 0;
  const miTempsPassee = s0.slot > CRENEAU_MI_TEMPS;

  for (let p = 0; p < n; p++) {
    let h = s0.h;
    let a = s0.a;
    let rh = s0.rh;
    let ra = s0.ra;
    let hh = miTempsPassee ? -1 : 0;
    let ha = 0;
    let pSlot = dejaMarque ? CRENEAU_INCONNU : AUCUN_CRENEAU;
    let pCamp = dejaMarque ? PREMIER_INCONNU : 2;
    for (let k = s0.slot; k < NB_CRENEAUX; k++) {
      const d = clip(h - a, -2, 2);
      const r = clip(ra - rh, -1, 1);
      const b = trancheK[k];
      const iH = k * 45 + ((d + 2) * 3 + (r + 1)) * 3 + b;
      const iA = k * 45 + ((-d + 2) * 3 + (-r + 1)) * 3 + b;
      const uH = rng();
      const gH = uH > p0H[iH] ? poissonInverseDepuis(uH, xH[iH], p0H[iH]) : 0;
      if (gH > 0) {
        if (pSlot === AUCUN_CRENEAU) {
          pSlot = k;
          pCamp = 0;
        }
        h += gH;
      }
      const uA = rng();
      const gA = uA > p0A[iA] ? poissonInverseDepuis(uA, xA[iA], p0A[iA]) : 0;
      if (gA > 0) {
        if (pSlot === AUCUN_CRENEAU) {
          pSlot = k;
          pCamp = 1;
        }
        a += gA;
      }
      const bk = bandeK[k];
      if (rh < ROUGES_MAX && rng() < (bk >= 0 ? rougeBande[bk] : 0) * rougeEtat[clip(h - a, -2, 2) + 2]) rh++;
      if (ra < ROUGES_MAX && rng() < (bk >= 0 ? rougeBande[bk] : 0) * rougeEtat[clip(a - h, -2, 2) + 2]) ra++;
      if (k === CRENEAU_MI_TEMPS && hh >= 0) {
        hh = h;
        ha = a;
      }
    }
    ftH[p] = h > T - 1 ? T - 1 : h;
    ftA[p] = a > T - 1 ? T - 1 : a;
    htH[p] = hh < 0 ? MI_TEMPS_INCONNUE : hh > 254 ? 254 : hh;
    htA[p] = hh < 0 ? MI_TEMPS_INCONNUE : ha > 254 ? 254 : ha;
    premierSlot[p] = pSlot;
    premierCamp[p] = pCamp;
    rougesH[p] = rh;
    rougesA[p] = ra;
  }

  const poids = new Float64Array(n).fill(1 / n);
  let masseNonCouverte = 0;
  let couverte = 1;
  let tailleEffective = n;
  if (grille) {
    const compte = new Int32Array(T * T);
    for (let p = 0; p < n; p++) compte[ftH[p] * T + ftA[p]]++;
    couverte = 0;
    for (let c = 0; c < T * T; c++) {
      if (compte[c]) couverte += grille[c];
      else masseNonCouverte += grille[c];
    }
    if (!(couverte > 0)) throw new EntreeInvalide('simulerMatch : aucun chemin ne tombe sur une case de la grille.');
    let s2 = 0;
    for (let p = 0; p < n; p++) {
      const c = ftH[p] * T + ftA[p];
      poids[p] = grille[c] / compte[c] / couverte;
      s2 += poids[p] * poids[p];
    }
    tailleEffective = s2 > 0 ? 1 / s2 : 0;
  }
  return { n, ftH, ftA, htH, htA, premierSlot, premierCamp, rougesH, rougesA, poids, masseNonCouverte, couverte, tailleEffective, seed };
}

// ------------------------------------------------------------ les marchés

/** Les marchés du score final, lus dans la GRILLE (jamais dans les chemins) : la forme de marchesDeLaGrille. */
export const marchesDuScore = (grille) => marchesDeLaGrille(grille);

const nouveauxMarches = () => ({
  htH: 0, htD: 0, htA: 0, htO05: 0, htO15: 0, ht00: 0, htFt: new Float64Array(9), miTempsConnue: 0,
  deuxMiTemps05: 0, h2plusQueH1: 0, domMarqueDeuxMT: 0, extMarqueDeuxMT: 0,
  premierDom: 0, premierExt: 0, premierAucun: 0, premierInconnu: 0, premierAvant30: 0,
  retourDom: 0, retourExt: 0, meneMiTempsGagne: 0, menaitMiTempsGagne: 0, rougeAuMoinsUn: 0, total: 0
});

/** Ajoute une case (ou un chemin) de poids w aux marchés de déroulé. */
function accumuler(m, hh, ha, fh, fa, pc, a30, rouge, w) {
  m.total += w;
  if (hh !== MI_TEMPS_INCONNUE) {
    const rH = hh > ha ? 0 : hh === ha ? 1 : 2;
    const rF = fh > fa ? 0 : fh === fa ? 1 : 2;
    m.miTempsConnue += w;
    if (rH === 0) m.htH += w;
    else if (rH === 1) m.htD += w;
    else m.htA += w;
    if (hh + ha > 0) m.htO05 += w;
    if (hh + ha > 1) m.htO15 += w;
    if (hh + ha === 0) m.ht00 += w;
    m.htFt[rH * 3 + rF] += w;
    const secondes = fh + fa - hh - ha;
    if (hh + ha > 0 && secondes > 0) m.deuxMiTemps05 += w;
    if (secondes > hh + ha) m.h2plusQueH1 += w;
    if (hh > 0 && fh > hh) m.domMarqueDeuxMT += w;
    if (ha > 0 && fa > ha) m.extMarqueDeuxMT += w;
    if (rH === 2 && rF === 0) m.retourDom += w;
    if (rH === 0 && rF === 2) m.retourExt += w;
    if ((rH === 2 && rF === 0) || (rH === 0 && rF === 2)) m.meneMiTempsGagne += w;
    if ((rH === 0 && rF === 0) || (rH === 2 && rF === 2)) m.menaitMiTempsGagne += w;
  }
  if (pc === 0) m.premierDom += w;
  else if (pc === 1) m.premierExt += w;
  else if (pc === 2) m.premierAucun += w;
  else m.premierInconnu += w;
  if (a30) m.premierAvant30 += w;
  if (rouge) m.rougeAuMoinsUn += w;
}

function finir(m, arrondi) {
  const r = arrondi === null || arrondi === undefined ? (x) => x : (x) => Number(x.toFixed(arrondi));
  const sortie = {};
  for (const [k, v] of Object.entries(m)) sortie[k] = k === 'htFt' ? Array.from(v, r) : r(v);
  return sortie;
}

/** Le premier but compte-t-il « avant la 30e » ? (convention figée : créneaux 0..dernierCreneau). */
const avant30 = (slot, dernierCreneau) => slot !== AUCUN_CRENEAU && slot !== CRENEAU_INCONNU && slot <= dernierCreneau;

/**
 * Les marchés de déroulé lus dans les CHEMINS pondérés (le banc, les tests). `dernierCreneauAvant30` : la convention
 * du marché « premier but avant la 30e » (29 par défaut, CONVENTION_AVANT_30 ; 28 rejoue la convention de v1).
 * `arrondi` : décimales (6 par défaut ; null = valeurs brutes).
 */
export function marchesDesChemins(ch, { dernierCreneauAvant30 = CONVENTION_AVANT_30.dernierCreneau, arrondi = 6 } = {}) {
  const m = nouveauxMarches();
  for (let p = 0; p < ch.n; p++) {
    accumuler(m, ch.htH[p], ch.htA[p], ch.ftH[p], ch.ftA[p], ch.premierCamp[p], avant30(ch.premierSlot[p], dernierCreneauAvant30), ch.rougesH[p] + ch.rougesA[p] > 0, ch.poids[p]);
  }
  return finir(m, arrondi);
}

/**
 * Les marchés de déroulé lus dans les CASES d'une table jointe (lireTableJointe) : même accumulation que les chemins.
 * Accepte le tableau des cases ou l'objet rendu par lireTableJointe.
 */
export function marchesDeDeroule(cases, { arrondi = 6 } = {}) {
  const liste = Array.isArray(cases) ? cases : cases?.cases;
  if (!Array.isArray(liste)) throw new EntreeInvalide('marchesDeDeroule : cases attendues.');
  const m = nouveauxMarches();
  for (const c of liste) accumuler(m, c.hh, c.ha, c.fh, c.fa, c.pc, c.avant30, c.rouge, c.w);
  return finir(m, arrondi);
}

// ------------------------------------------------------------ la table jointe

/**
 * La TABLE JOINTE rangée la nuit : le compte des chemins par (mi-temps dom., mi-temps ext., fin dom., fin ext.,
 * code), code = camp du premier but (0, 1, 2, 3) | avant la 30e << 2 | au moins un rouge << 3 ; 7 octets par case
 * (5 de clé, 2 de compte en petit-boutiste), cases triées par clé : mêmes chemins, mêmes octets.
 */
export function tableJointe(ch, { dernierCreneauAvant30 = CONVENTION_AVANT_30.dernierCreneau } = {}) {
  if (ch.n > 65535) throw new EntreeInvalide('tableJointe : au plus 65 535 chemins (compte sur 2 octets).');
  const comptes = new Map();
  for (let p = 0; p < ch.n; p++) {
    const code = ch.premierCamp[p] | ((avant30(ch.premierSlot[p], dernierCreneauAvant30) ? 1 : 0) << 2) | ((ch.rougesH[p] + ch.rougesA[p] > 0 ? 1 : 0) << 3);
    const cle = (((ch.htH[p] * 256 + ch.htA[p]) * 256 + ch.ftH[p]) * 256 + ch.ftA[p]) * 256 + code;
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }
  const cles = [...comptes.keys()].sort((x, y) => x - y);
  const t = new Uint8Array(cles.length * OCTETS_PAR_CASE);
  cles.forEach((cle, i) => {
    let r = cle;
    const code = r % 256;
    r = (r - code) / 256;
    const fa = r % 256;
    r = (r - fa) / 256;
    const fh = r % 256;
    r = (r - fh) / 256;
    const ha = r % 256;
    const hh = (r - ha) / 256;
    const c = comptes.get(cle);
    const o = i * OCTETS_PAR_CASE;
    t[o] = hh;
    t[o + 1] = ha;
    t[o + 2] = fh;
    t[o + 3] = fa;
    t[o + 4] = code;
    t[o + 5] = c & 0xff;
    t[o + 6] = c >>> 8;
  });
  return t;
}

/**
 * Relit une table jointe et la REPONDÈRE sur `grille` (celle de la nuit, ou celle d'une analyse plus récente, alignée
 * ou non) : poids d'une case = grille(fin) / couverte × compte / n(fin). Rend { cases: [{ hh, ha, fh, fa, pc,
 * avant30, rouge, n, w }], n, couverte, masseNonCouverte }.
 */
export function lireTableJointe(table, grille) {
  if (!(table instanceof Uint8Array) || table.length % OCTETS_PAR_CASE !== 0) throw new EntreeInvalide('lireTableJointe : table jointe illisible.');
  if (!((Array.isArray(grille) || ArrayBuffer.isView(grille)) && grille.length === T * T)) throw new EntreeInvalide('lireTableJointe : grille de 441 cases attendue.');
  const cases = [];
  const nFin = new Float64Array(T * T);
  let total = 0;
  for (let o = 0; o < table.length; o += OCTETS_PAR_CASE) {
    const code = table[o + 4];
    const c = { hh: table[o], ha: table[o + 1], fh: table[o + 2], fa: table[o + 3], pc: code & 3, avant30: (code & 4) !== 0, rouge: (code & 8) !== 0, n: table[o + 5] | (table[o + 6] << 8), w: 0 };
    if (c.fh >= T || c.fa >= T) throw new EntreeInvalide('lireTableJointe : case hors de la grille.');
    cases.push(c);
    nFin[c.fh * T + c.fa] += c.n;
    total += c.n;
  }
  let couverte = 0;
  let masseNonCouverte = 0;
  for (let f = 0; f < T * T; f++) {
    if (nFin[f]) couverte += grille[f];
    else masseNonCouverte += grille[f];
  }
  if (!(couverte > 0)) throw new EntreeInvalide('lireTableJointe : aucune case de la table ne porte de masse dans la grille.');
  for (const c of cases) c.w = (grille[c.fh * T + c.fa] / couverte) * (c.n / nFin[c.fh * T + c.fa]);
  return { cases, n: total, couverte, masseNonCouverte };
}

// ------------------------------------------------------------ la grille de l'ancien modèle

/**
 * La grille de l'ANCIEN modèle (le service sans la clé `modeleDeButs`) : la formule de computeScoreMatrix posée case
 * par case (0..8 × 0..8, Poisson × Dixon-Coles, max(0, ·), renormalisée sur ces 81 cases) dans un tableau 21 × 21,
 * le reste à 0. À λ, μ, ρ égaux, ses marchés sont ceux de computeScoreMatrix (mesures/branchement/b1 : 1,8e-15).
 */
export function grilleAncienne81(lambda, mu, rho) {
  if (!fini(lambda) || !fini(mu) || !fini(rho)) throw new EntreeInvalide('grilleAncienne81 : λ, μ et ρ doivent être des nombres finis.');
  const g = new Float64Array(T * T);
  let s = 0;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const p = Math.max(0, poissonProbability(i, lambda) * poissonProbability(j, mu) * dixonColesAdjustment(i, j, lambda, mu, rho));
      g[i * T + j] = p;
      s += p;
    }
  }
  for (let k = 0; k < g.length; k++) g[k] /= s;
  return g;
}
