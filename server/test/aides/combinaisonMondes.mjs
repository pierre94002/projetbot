/**
 * DES MONDES TIRÉS AU HASARD pour le banc de l'étape 38 (lot 1a, 03-04/11/2026) — ce n'est PAS un fichier de test. Aucun
 * résultat réel : des lignes à la forme de bancFd.js (football-data) et de lecteurP5.js (lignes gelées), fabriquées par un
 * générateur à graine, aux ordres de grandeur réels (conception §4.4 : β 0,02-0,10, σ 0,1-0,6).
 *
 * mondeFd({ graine, nP1, nP2, signal, sigmaMarche, sigmaSignal, ligueEffet, courbe, dispersePart, peuCouvertPart })
 *   la vérité T ; le marché M = T bruité (σ marché) ; le signal statistique S : 'verite' (T bruité de σ signal : il apprend
 *   quelque chose au marché), 'marche' (M bruité : il ne sait rien de plus — le monde NUL) ; la clôture Q = T bruité de
 *   0,05 ; l'issue y tirée de T ; le plus/moins 2,5 de même ; les prix d'un livre (William Hill) à 6 % de marge bruités,
 *   les décisions aux seuils calculés (la règle de findValueBet : avantage > seuil, cote ≤ 5, avantage ≤ 25 %).
 *   `ligueEffet` : le β propre à chaque championnat (écart-type) ; `courbe` : un marché mal calibré de façon COURBE
 *   (T = M poussé vers les extrêmes au-dessus de 0,5 et vers le centre en dessous).
 * mondeP5({ graine, n, partCoupDEnvoi, classeNuit, classeCoup, bruitNuit, bruitCoup }) : des lignes gelées PAR ORIGINE ; la
 *   classe tirée au sort selon l'origine, SANS AUCUN effet à origine donnée (T-C8, critique constat 1).
 */

import { permuterLaCoteHaute, SEUILS_CALCULES } from '../../src/data/combinaison/bancFd.js';

const JOUR_MS = 86_400_000;
export const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** Générateur à graine (mulberry32). */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normale = (u) => {
  const a = Math.max(1e-12, u());
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
};
const softmax = (l) => {
  const m = Math.max(...l);
  const e = l.map((x) => Math.exp(x - m));
  const t = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / t);
};
const bruite = (u, p, s) => softmax(p.map((x) => Math.log(x) + s * normale(u)));
const tirer = (u, p) => {
  const r = u();
  let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i];
    if (r < c) return i;
  }
  return p.length - 1;
};
const sig = (x) => 1 / (1 + Math.exp(-x));
const lg = (p) => Math.log(p / (1 - p));
export const CODES = Object.freeze(['E0', 'E1', 'SP1', 'D1', 'I1', 'F1', 'N1', 'B1']);

/** Les décisions d'un match aux seuils calculés, pour une distribution juste `pM` et les cotes d'un livre. */
export function decisionsFabriquees(pM, cotes) {
  const dec = {};
  let refusA = null;
  for (const t of SEUILS_CALCULES) {
    let meilleur = null;
    for (let i = 0; i < 3; i++) {
      const ev = pM[i] * cotes[i] - 1;
      if (cotes[i] <= 5 && ev <= 0.25 && ev > t && (!meilleur || ev > meilleur.ev)) meilleur = { o: i, c: cotes[i], b: 'williamhill', ev };
    }
    dec[t] = meilleur;
    if (t === 0.02 && !meilleur) refusA = 'pas_de_value';
  }
  return { dec, refusA };
}

/** Un monde football-data (lignes à la forme de bancFd.js, AVEC résultats). */
export function mondeFd({ graine = 1, nP1 = 16000, nP2 = 10000, signal = 'marche', beta = 0, sigmaMarche = 0.15, sigmaSignal = 0.3, ligueEffet = 0, courbe = 0, dispersePart = 0.12, peuCouvertPart = 0.12, parJour = null, sansSignal = false, biais = null } = {}) {
  const u = generateur(graine);
  const betaLigue = Object.fromEntries(CODES.map((c) => [c, ligueEffet * normale(u)]));
  const lignes = [];
  const fabriquer = (fenetre, debut, n, parJour) => {
    let jour = debut;
    let k = 0;
    const duJour = [];
    const fin = () => {
      permuterLaCoteHaute(duJour, jour);
      lignes.push(...duJour);
      duJour.length = 0;
    };
    for (let i = 0; i < n; i++) {
      if (k === parJour) {
        fin();
        jour = plusJours(jour, 1);
        k = 0;
      }
      k++;
      const a = 0.9 * normale(u);
      let T = softmax([0.35 + a, -0.15 * Math.abs(a), -0.1 - a]);
      const M0 = bruite(u, T, sigmaMarche);
      let M = M0;
      if (courbe) M = softmax(M0.map((p) => Math.log(p) / (1 + courbe * (p - 0.5))));
      const code = CODES[Math.floor(u() * CODES.length)];
      let S;
      if (signal === 'verite') S = bruite(u, T, sigmaSignal);
      else S = bruite(u, M, sigmaSignal);
      if (beta) {
        // Le monde « planté » : la vérité EST le mélange du marché et du signal au β donné (+ celui du championnat).
        const b = beta + (betaLigue[code] ?? 0);
        T = softmax(M.map((p, j) => Math.log(p) + b * (Math.log(S[j]) - Math.log(p))));
      }
      // Un marché mal calibré sur le domicile (E2) : la vérité décalée de biais(jour) en log-cote du domicile.
      if (biais) T = softmax(T.map((p, j) => Math.log(p) + (j === 0 ? biais(jour) : 0)));
      const Q = bruite(u, T, 0.05);
      const y = tirer(u, T);
      const t25 = sig(lg(0.52) + 0.6 * normale(u));
      const m25 = sig(lg(t25) + 0.1 * normale(u));
      const y25 = u() < t25 ? 0 : 1;
      const q25o = sig(lg(t25) + 0.05 * normale(u));
      const cotes = M.map((p) => (1 / (p * 1.06)) * Math.exp(0.04 * normale(u)));
      const { dec, refusA } = decisionsFabriquees(M, cotes);
      const disperse = u() < dispersePart;
      const g = disperse ? 0.031 + 0.03 * u() : 0.02 * u();
      const pMoy = M.map((p, j) => p + (j === 0 ? g : j === 2 ? -g : 0));
      duJour.push({
        cle: `fd:${code}|${jour}|${i}|${n}`,
        date: jour,
        code,
        saison: jour.slice(0, 4),
        fenetre,
        regime: u() < 0.01 ? 'r3' : 'r1',
        pM: M,
        pMoy,
        g,
        pM25: [m25, 1 - m25],
        pS: sansSignal ? null : S,
        pS25: null,
        pSj2: sansSignal ? null : bruite(u, S, 0.02),
        nMin: u() < peuCouvertPart ? Math.floor(u() * 8) : 8 + Math.floor(u() * 30),
        dec,
        refusA,
        coteHaute: Boolean(dec[0.02] && dec[0.02].c > 3),
        coteHautePermutee: false,
        y,
        y25,
        q: Q,
        q25: [q25o, 1 - q25o],
        livreCloture: 'pinnacle'
      });
    }
    fin();
  };
  // P1 couvre 2014-01-01 → 2019-06-30 (le recalage du marché apprend sur 2017-07 → 2019-06), P2 couvre 2019-07-01 → 2023-06-30.
  fabriquer('P1', '2014-01-01', nP1, parJour ?? Math.ceil(nP1 / 2006));
  fabriquer('P2', '2019-07-01', nP2, parJour ?? Math.ceil(nP2 / 1460));
  return lignes;
}

/**
 * Des lignes gelées de P5 par origine (forme de lecteurP5.js, AVEC résultats). La classe (« fragile » / « sur ») est tirée
 * à `classeNuit` la nuit et `classeCoup` au coup d'envoi ; elle n'a AUCUN effet à origine donnée. Les cotes de la nuit sont
 * vieilles (bruit `bruitNuit` autour de la vérité), celles du coup d'envoi fraîches (`bruitCoup`) ; la clôture = la vérité
 * bruitée de 0,03.
 */
export function mondeP5({ graine = 1, nNuit = 8000, nCoup = 4000, classeNuit = 0.05, classeCoup = 0.9, bruitNuit = 0.25, bruitCoup = 0.08, effet = 0 } = {}) {
  const u = generateur(graine);
  const lignes = [];
  const fabriquer = (origine, n, partClasse, bruit) => {
    for (let i = 0; i < n; i++) {
      const a = 0.9 * normale(u);
      const T = softmax([0.35 + a, -0.15 * Math.abs(a), -0.1 - a]);
      const fragile = u() < partClasse;
      const p = bruite(u, T, bruit + (fragile ? effet : 0));
      lignes.push({ cle: `p5:${origine}:${i}`, origine, date: plusJours('2026-10-06', i % 12), p, q: bruite(u, T, 0.03), y: tirer(u, T), classe: fragile ? 'fragile' : 'sur', aCloture: true });
    }
  };
  fabriquer('nuit', nNuit, classeNuit, bruitNuit);
  fabriquer('coup-d-envoi', nCoup, classeCoup, bruitCoup);
  return lignes;
}
