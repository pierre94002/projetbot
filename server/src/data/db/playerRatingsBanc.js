/**
 * playerRatingsBanc.js — LE BANC DES FICHES ET DE LA FORCE DU ONZE (étape 30 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Trois choses, toutes EN LECTURE SEULE, aucune n'entre dans le moteur :
 *   1. À LA CONSTRUCTION (scripts/player-ratings.mjs --banc, --facteurs, --repli), sur le magasin 2023-07-01 →
 *      2026-09-23 SEULEMENT (histoire ET cibles ; 2023-S1 et P5 restent jamais vus) : les facteurs de niveau des
 *      championnats (apprendreLesFacteurs), les coefficients du repli sans xG (coefficientsDuRepli), et la mesure
 *      de la force du onze au-delà du marché (mesurerAuBanc : l'inclinaison du 1N2 apprise sur 2023-10 → 2025-06,
 *      vérifiée sur 2025-07 → 2026-09-23 face à la clôture et à la pré-clôture football-data ; les tirs d'équipe,
 *      marché sans cote) et de la justesse des fiches face à la moyenne du poste. Ce qui en sort est RECOPIÉ dans
 *      les réglages versionnés de playerRatings.js (FACTEURS_DE_CHAMPIONNAT, REPLI_SANS_XG, INCLINAISON) ;
 *   2. CHAQUE NUIT (mesureABlanc, dans le processus à part des fiches), sur les seuls matchs joués DEPUIS LE
 *      LANCEMENT de l'étape 30 (sa date au registre de la mesure) : la même mesure, avec l'inclinaison FIGÉE —
 *      la preuve neuve des fiches (portée « joueurs ») et de quoi reposer la question de Pierre sur des matchs
 *      jamais vus. Rien n'est montré comme pronostic.
 *   3. Les variantes et fenêtres vues de l'étape 30 sont déclarées dans lancements.js (VARIANTES_DE_L_ETAPE_30,
 *      VUES_DE_L_ETAPE_30 : portée « joueurs ») et ré-exportées ici.
 * Le juge est celui de l'étape 16 (guard.js, comparer : perte log, blocs = match, K = 19 variantes).
 * -----------------------------------------------------------------------
 */

import { comparer } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_30, VUES_DE_L_ETAPE_30 } from '../../bench/lancements.js';
import {
  RejeuDesFiches, chargerLesRencontres, rejouer, joueursDe, forceDuOnze, valeursDUneApparition, facteurDe, ligneDuPoste, numeroDuJour, jourIso,
  INCLINAISON, COMPOSANTES, FACTEURS_DE_CHAMPIONNAT, __pourLesTests
} from './playerRatings.js';

export { VARIANTES_DE_L_ETAPE_30, VUES_DE_L_ETAPE_30 };

/** Les fenêtres du banc (jours compris) : la seule fenêtre permise du magasin, coupée en apprentissage et vérification. */
export const PERIODES_DU_BANC = Object.freeze({
  donnees: Object.freeze({ de: '2023-07-01', a: '2026-09-23' }),
  apprentissage: Object.freeze({ de: '2023-10-01', a: '2025-06-30' }),
  verification: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }),
  fiches: Object.freeze({ de: '2024-07-01', a: '2026-09-23' })
});
/** Le juge : K = les 19 variantes regardées de l'étape 30. */
export const K_VARIANTES = VARIANTES_DE_L_ETAPE_30.length;
/** La justesse des fiches se mesure sur les apparitions d'au moins 20 minutes. */
export const MINUTES_MESUREES = 20;
/** Les tirs d'équipe : facteur de terrain et dispersion de la loi binomiale négative du modèle de référence. */
export const MODELE_DES_TIRS = Object.freeze({ domicile: 1.1, exterieur: 0.9, dispersion: 0.053 });
const PMIN = 1e-6;
const { IX, NC } = __pourLesTests;
const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ======================================================= petites règles (pures)

/** La marge retirée par la méthode PUISSANCE (les cotes d'un 1N2 → probabilités qui font 1) ; null si illisible. */
export function methodePuissance(cotes) {
  if (!Array.isArray(cotes) || cotes.length < 2 || cotes.some((c) => !(Number(c) > 1))) return null;
  const inv = cotes.map((c) => 1 / Number(c));
  let lo = 0.5;
  let hi = 3;
  for (let it = 0; it < 80; it++) {
    const k = (lo + hi) / 2;
    if (inv.reduce((a, x) => a + x ** k, 0) > 1) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const p = inv.map((x) => x ** k);
  const s = p.reduce((a, x) => a + x, 0);
  return p.map((x) => x / s);
}

/** L'inclinaison d'un 1N2 : [pH·e^x, pN, pA·e^−x] renormalisés. */
export function incliner(p, x) {
  const e = [p[0] * Math.exp(x), p[1], p[2] * Math.exp(-x)];
  const s = e[0] + e[1] + e[2];
  return e.map((v) => v / s);
}

function lnGamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const c of g) s += c / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
/** La perte log d'un compte y sous une binomiale négative de moyenne mu et de dispersion a (Var = mu + a·mu²). */
export function perteBinomialeNegative(y, mu, a = MODELE_DES_TIRS.dispersion) {
  const r = 1 / a;
  return -(lnGamma(y + r) - lnGamma(r) - lnGamma(y + 1) + r * Math.log(r / (r + mu)) + y * Math.log(mu / (r + mu)));
}

const perte1N2 = (p, issue) => -Math.log(Math.max(PMIN, p[issue]));

// ======================================================= ce qu'on mesure d'un match (avant J)

/** Les cotes football-data rattachées (lien = 1) des rencontres de la liste : Map clé → { pre, clo } (1N2). */
export function cotesDes(database, rencontres) {
  const out = new Map();
  if (!rencontres.length) return out;
  const de = rencontres[0].date;
  const a = rencontres.at(-1).date;
  const cles = new Set(rencontres.map((m) => m.matchKey));
  const dec = (v) => (v === null || v === undefined ? null : v > 100 ? v / 100 : null);
  try {
    for (const r of database.prepare('SELECT match_key, moy_1, moy_n, moy_2, moy_c1, moy_cn, moy_c2 FROM fd_history WHERE lien = 1 AND match_key IS NOT NULL AND date >= ? AND date <= ?').iterate(de, a)) {
      if (!cles.has(r.match_key)) continue;
      const t = (x, y, z) => (dec(x) && dec(y) && dec(z) ? [dec(x), dec(y), dec(z)] : null);
      out.set(r.match_key, { pre: t(r.moy_1, r.moy_n, r.moy_2), clo: t(r.moy_c1, r.moy_cn, r.moy_c2) });
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  return out;
}

/**
 * Ce que dit la force du onze d'une rencontre AVANT son jour (le rejeu n'a pas encore vu la journée) : pour chaque
 * camp, l'écart offensif et défensif du onze face à l'équipe habituelle, l'écart de tirs (Σ tirs par 90 des
 * titulaires de champ − celui de l'équipe habituelle) ; les titulaires identifiés de la feuille (les autres :
 * inconnus, en milieu) ; les tirs moyens de l'équipe (demi-vie 10) pour le modèle de référence.
 */
export function ceQueDitLeOnze(m, rejeu) {
  const lignes = joueursDe(m);
  const camps = [];
  for (const [camp, club] of [[1, m.home], [0, m.away]]) {
    const tit = lignes.filter((l) => (l.camp === 1 ? 1 : 0) === camp && l.titulaire === 1);
    const h = rejeu.habituelle(club);
    const fiches = new Map();
    for (const l of tit) {
      const f = rejeu.ficheEnLigne(l.joueur);
      if (f) fiches.set(l.joueur, f);
    }
    for (const p of h?.parts ?? []) if (!fiches.has(p[0])) {
      const f = rejeu.ficheEnLigne(p[0]);
      if (f) fiches.set(p[0], f);
    }
    const titulaires = tit.map((l) => ({ joueur: l.joueur, ligne: ligneDuPoste(l.poste) }));
    const inconnus = Array.from({ length: Math.max(0, 11 - titulaires.length) }, () => ({ ligne: 3 }));
    // Les moyennes du championnat DU CLUB, celles de sa ligne rangée de player_ratings_teams ; sans équipe habituelle,
    // pas de ligne rangée : rien (le lecteur de la page du match fait exactement pareil).
    const moy = h ? rejeu.moyennesOffensives(rejeu.ligueDuClub(club, null)) : [0, 0, 0, 0];
    const force = forceDuOnze({ titulaires, inconnus, fiches, habituelle: h, moyennesOff: moy });
    // L'écart de tirs : la même somme sur la composante « tirs » des fiches (×1000).
    let tAuj = 0;
    for (const t of titulaires) {
      const f = fiches.get(t.joueur);
      const l = t.ligne ?? f?.poste ?? 3;
      if (f && l !== 1) tAuj += f.tirs ?? 0;
    }
    let tHab = 0;
    for (const [j, part, partGk, ligne] of h?.parts ?? []) {
      const f = fiches.get(j);
      const l = partGk * 2 > part ? 1 : ligne;
      if (f && l !== 1) tHab += (part * (f.tirs ?? 0)) / 1000;
    }
    const c = rejeu.clubs.get(club);
    camps.push({
      club,
      identifies: titulaires.length,
      force,
      ecartTirs: h ? (tAuj - tHab) / 1000 : null,
      tirs: c && c.tw > 0 ? { pour: c.tp / c.tw, contre: c.tc / c.tw, poids: c.tw } : null
    });
  }
  return camps;
}

/** Un match utilisable pour la mesure de la force du onze : non attribué, onzes identifiés (≥ 10), équipes habituelles connues. */
const utilisable = (m, camps) => !m.attribue && camps.every((c) => c.identifies >= 10 && c.force.offensif.habituel !== null);

// ======================================================= la mesure (à blanc la nuit, au banc à la construction)

/**
 * LA MESURE (un objet qui suit le rejeu) : `attacher(rencontres)` puis, à chaque journée, `avantJournee(jour,
 * rejeu)` — pour les rencontres du jour dans [de ; a] : la force du onze et l'issue (1N2 à la 90e, tirs) ; pour
 * les apparitions du jour dans la fenêtre des fiches : l'erreur de la fiche et celle de la moyenne du poste.
 * `inclinaison` : figée (la nuit) ou null (le banc apprend). `cotes` : Map clé → { pre, clo }.
 */
export function creerMesure({ de = null, a = null, fichesDe = null, fichesA = null, cotes = new Map() } = {}) {
  const parJour = new Map();
  const matchs = [];
  const erreurs = COMPOSANTES.map(() => ({ base: 0, fiche: 0, n: 0 }));
  const jDe = de ? numeroDuJour(de) : -Infinity;
  const jA = a ? numeroDuJour(a) : Infinity;
  const fDe = fichesDe ? numeroDuJour(fichesDe) : jDe;
  const fA = fichesA ? numeroDuJour(fichesA) : jA;
  return {
    matchs,
    erreurs,
    attacher(rencontres) {
      for (const m of rencontres) {
        if (m.jour < Math.min(jDe, fDe) || m.jour > Math.max(jA, fA)) continue;
        if (!parJour.has(m.jour)) parJour.set(m.jour, []);
        parJour.get(m.jour).push(m);
      }
    },
    avantJournee(jour, rejeu) {
      const duJour = parJour.get(jour);
      if (!duJour) return;
      for (const m of duJour) {
        if (m.attribue) continue;
        if (jour >= jDe && jour <= jA) {
          const camps = ceQueDitLeOnze(m, rejeu);
          if (utilisable(m, camps)) {
            const L = m.ligneDom;
            const bd = L.prolongation === 1 ? L.bp90 : L.bp;
            const be = L.prolongation === 1 ? L.bc90 : L.bc;
            const cote = cotes.get(m.matchKey) ?? null;
            const ligne = {
              cle: m.matchKey,
              jour: m.date,
              issue: bd === null || be === null ? null : bd > be ? 0 : bd === be ? 1 : 2,
              pre: methodePuissance(cote?.pre),
              clo: methodePuissance(cote?.clo),
              dOff: camps[0].force.offensif.ecart - camps[1].force.offensif.ecart,
              dDef: camps[0].force.defensif.ecart - camps[1].force.defensif.ecart,
              tirs: camps.map((c, i) => ({
                y: m.tirsEquipe?.[i] ?? null,
                base: c.tirs && camps[1 - i].tirs ? ((c.tirs.pour + camps[1 - i].tirs.contre) / 2) * (i === 0 ? MODELE_DES_TIRS.domicile : MODELE_DES_TIRS.exterieur) : null,
                ecart: c.ecartTirs
              })),
              tirsReleves: !(m.tirsEquipe?.[0] === 0 && m.tirsEquipe?.[1] === 0) && !m.prolongation
            };
            matchs.push(ligne);
          }
        }
        if (jour >= fDe && jour <= fA) {
          // La justesse des fiches : la valeur corrigée de chaque apparition face à la fiche d'avant J et à la moyenne du poste.
          const fH = rejeu.facteursDe(m.home);
          const fA2 = rejeu.facteursDe(m.away);
          const F = facteurDe(m.league, rejeu.facteurs);
          for (const l of joueursDe(m)) {
            // Au moins 20 minutes : en dessous, une seule action fait une « moyenne par 90 » démesurée pour la fiche
            // comme pour la moyenne du poste (la mesure de la conception, r1, faisait de même).
            if (!(Number(l.minutes) >= MINUTES_MESUREES)) continue;
            const fiche = rejeu.fiche(l.joueur);
            if (!fiche) continue;
            const camp = l.camp === 1 ? 1 : 0;
            const adv = camp === 1 ? fA2 : fH;
            const posteJour = ligneDuPoste(l.poste);
            const vals = valeursDUneApparition(l, {
              possession: m.possession?.[camp === 1 ? 0 : 1],
              tirsAdverses: m.tirsAdverses ? (camp === 1 ? m.tirsAdverses.dom : m.tirsAdverses.ext) : null,
              facteurDef: adv.def,
              facteurAtt: adv.att,
              facteurLigue: F,
              gardien: posteJour === 1 || (posteJour === null && fiche.poste === 1)
            });
            for (let c = 0; c < NC; c++) {
              const v = vals?.[c];
              if (!v || fiche.valeurs[c] === null || fiche.moyennes[c] === null) continue;
              const def = COMPOSANTES[c];
              const Ff = def.championnat ? fiche.facteur : 1;
              const r = fiche.valeurs[c] / Ff;
              const mo = fiche.moyennes[c] / Ff;
              const E = erreurs[c];
              E.base += (v[0] - mo * v[1]) ** 2 / v[1];
              E.fiche += (v[0] - r * v[1]) ** 2 / v[1];
              E.n++;
            }
          }
        }
      }
    }
  };
}

/** Le gain de la fiche contre la moyenne du poste, par composante (part de l'erreur en moins). */
export function gainsDesFiches(erreurs) {
  return Object.fromEntries(COMPOSANTES.map((c, i) => [c.id, erreurs[i].n ? { apparitions: erreurs[i].n, gain: erreurs[i].base > 0 ? 1 - erreurs[i].fiche / erreurs[i].base : null } : { apparitions: 0, gain: null }]));
}

/** Les lignes du juge (comparer, mode moyenne, sens min) : la perte du marché (a) face à celle du marché incliné (b), un bloc par match. */
export function lignesDuJuge1N2(matchs, cle, inclinaison) {
  const out = [];
  for (const l of matchs) {
    if (l.issue === null || !l[cle]) continue;
    const x = inclinaison.off * l.dOff + inclinaison.def * l.dDef;
    out.push({ bloc: l.cle, match: l.cle, a: perte1N2(l[cle], l.issue), b: perte1N2(incliner(l[cle], x), l.issue) });
  }
  return out;
}
export function lignesDuJugeTirs(matchs, b) {
  const out = [];
  for (const l of matchs) {
    if (!l.tirsReleves) continue;
    for (const [i, t] of l.tirs.entries()) {
      if (t.y === null || t.base === null || !(t.base > 0) || t.ecart === null) continue;
      out.push({ bloc: l.cle, match: l.cle, cle: `${l.cle}|${i}`, a: perteBinomialeNegative(t.y, t.base), b: perteBinomialeNegative(t.y, t.base * Math.exp(b * t.ecart)) });
    }
  }
  return out;
}

/** L'inclinaison du 1N2 apprise par Newton sur des lignes : x = off·dOff + def·dDef. */
export function apprendreInclinaison(matchs, cle) {
  let beta = [0, 0];
  const lignes = matchs.filter((l) => l.issue !== null && l[cle]);
  for (let it = 0; it < 40; it++) {
    const g = [0, 0];
    const H = [
      [-1e-6, 0],
      [0, -1e-6]
    ];
    for (const l of lignes) {
      const f = [l.dOff, l.dDef];
      const q = incliner(l[cle], beta[0] * f[0] + beta[1] * f[1]);
      const s = l.issue === 0 ? 1 : l.issue === 2 ? -1 : 0;
      const d1 = s - (q[0] - q[2]);
      const d2 = -(q[0] + q[2] - (q[0] - q[2]) ** 2);
      for (let i = 0; i < 2; i++) {
        g[i] += d1 * f[i];
        for (let j = 0; j < 2; j++) H[i][j] += d2 * f[i] * f[j];
      }
    }
    const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    const p0 = (H[1][1] * g[0] - H[0][1] * g[1]) / det;
    const p1 = (H[0][0] * g[1] - H[1][0] * g[0]) / det;
    beta = [beta[0] - p0, beta[1] - p1];
    if (Math.abs(p0) + Math.abs(p1) < 1e-12) break;
  }
  return { off: beta[0], def: beta[1], n: lignes.length };
}

/** Le coefficient des tirs (la moyenne × exp(b × écart)), appris par Newton (quasi-Poisson). */
export function apprendreTirs(matchs) {
  let b = 0;
  const lignes = [];
  for (const l of matchs) if (l.tirsReleves) for (const t of l.tirs) if (t.y !== null && t.base > 0 && t.ecart !== null) lignes.push(t);
  for (let it = 0; it < 40; it++) {
    let g = 0;
    let h = -1e-9;
    for (const t of lignes) {
      const mu = t.base * Math.exp(b * t.ecart);
      g += (t.y - mu) * t.ecart;
      h -= mu * t.ecart * t.ecart;
    }
    const pas = g / h;
    b -= pas;
    if (Math.abs(pas) < 1e-12) break;
  }
  return { tirs: b, n: lignes.length };
}

/** Le jugement d'un jeu de lignes par le juge de l'étape 16, en pourcentage de la perte de base. */
function juger(lignes, variantes = K_VARIANTES) {
  if (lignes.length < 2) return { n: lignes.length, verdict: 'pas-assez' };
  const r = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes, tirages: 1000, graine: 30 });
  const base = r.a?.moyenne ?? null;
  const pct = (x) => (x === null || x === undefined || !base ? null : Math.round((10000 * x) / base) / 100);
  return { n: r.n, verdict: r.verdict, raison: r.raison ?? null, perteMarche: base, perteOnze: r.b?.moyenne ?? null, gainPourcent: pct(r.gain ?? r.observe ?? null), fourchettePourcent: Array.isArray(r.fourchette) ? r.fourchette.map(pct) : null };
}

/**
 * LA MESURE À BLANC DE LA NUIT (créée par calculerLesFiches dans l'enfant) : depuis le lancement de l'étape 30
 * (`depuis`, AAAA-MM-JJ ; null tant qu'elle n'est pas lancée : rien à mesurer), l'inclinaison FIGÉE (INCLINAISON).
 */
export function mesureABlanc({ depuis = null, database = null } = {}) {
  let mesure = null;
  let rencontres = [];
  return {
    attacher(liste) {
      if (!depuis) return;
      rencontres = liste.filter((m) => m.date >= depuis);
      mesure = creerMesure({ de: depuis, fichesDe: depuis, cotes: database ? cotesDes(database, rencontres) : new Map() });
      mesure.attacher(rencontres);
    },
    avantJournee(jour, rejeu) {
      mesure?.avantJournee(jour, rejeu);
    },
    resultat() {
      if (!depuis || !mesure) return { depuis: depuis ?? null, lancee: Boolean(depuis), matchs: 0, quoi: depuis ? 'aucun match depuis le lancement' : 'l’étape 30 n’est pas encore lancée : rien à mesurer' };
      const somme = (lignes) => ({ n: lignes.length, perteMarche: lignes.reduce((s, l) => s + l.a, 0), perteOnze: lignes.reduce((s, l) => s + l.b, 0) });
      return {
        depuis,
        lancee: true,
        matchs: mesure.matchs.length,
        inclinaison: INCLINAISON,
        un2: { cloture: somme(lignesDuJuge1N2(mesure.matchs, 'clo', INCLINAISON.cloture)), preCloture: somme(lignesDuJuge1N2(mesure.matchs, 'pre', INCLINAISON.preCloture)) },
        tirs: somme(lignesDuJugeTirs(mesure.matchs, INCLINAISON.tirs)),
        fiches: gainsDesFiches(mesure.erreurs)
      };
    }
  };
}

/**
 * LE BANC DE LA CONSTRUCTION (générateur ; base en lecture seule) : le rejeu sur 2023-07-01 → 2026-09-23 seulement,
 * la force du onze de chaque match à partir du 2023-10-01, la justesse des fiches à partir du 2024-07-01 ;
 * l'inclinaison apprise sur 2023-10 → 2025-06 et jugée sur 2025-07 → 2026-09-23 (K = 19). `facteurs` : ceux à
 * essayer (par défaut ceux du code). Rend le rapport (ce que le script range dans player_ratings_state « banc »).
 */
export function* mesurerAuBanc({ database, facteurs = FACTEURS_DE_CHAMPIONNAT } = {}) {
  const P = PERIODES_DU_BANC;
  const rencontres = yield* chargerLesRencontres(database, { de: P.donnees.de, a: P.donnees.a });
  for (const m of rencontres) if (m.date < P.donnees.de || m.date > P.donnees.a) throw new Error(`banc : rencontre hors de la fenêtre permise (${m.date})`);
  const cotes = cotesDes(database, rencontres);
  const mesure = creerMesure({ de: P.apprentissage.de, a: P.verification.a, fichesDe: P.fiches.de, fichesA: P.fiches.a, cotes });
  mesure.attacher(rencontres);
  const rejeu = new RejeuDesFiches({ facteurs, avantJournee: (jour, r) => mesure.avantJournee(jour, r) });
  yield* rejouer(rejeu, rencontres);
  const app = mesure.matchs.filter((l) => l.jour >= P.apprentissage.de && l.jour <= P.apprentissage.a);
  const ver = mesure.matchs.filter((l) => l.jour >= P.verification.de && l.jour <= P.verification.a);
  const incClo = apprendreInclinaison(app, 'clo');
  const incPre = apprendreInclinaison(app, 'pre');
  const tirs = apprendreTirs(app);
  return {
    le: null,
    periodes: P,
    rencontres: rencontres.length,
    matchsMesures: mesure.matchs.length,
    apprentissage: app.length,
    verification: ver.length,
    inclinaisonApprise: { cloture: incClo, preCloture: incPre, tirs },
    jugements: {
      cloture: juger(lignesDuJuge1N2(ver, 'clo', incClo)),
      preCloture: juger(lignesDuJuge1N2(ver, 'pre', incPre)),
      tirs: juger(lignesDuJugeTirs(ver, tirs.tirs))
    },
    fiches: gainsDesFiches(mesure.erreurs),
    variantes: K_VARIANTES
  };
}

// ======================================================= les facteurs de championnat et le repli (construction)

/**
 * LES FACTEURS DE NIVEAU DES CHAMPIONNATS : pour chaque joueur qui change de championnat (premier match de
 * championnat dans un autre), sa production (xG hors penalty + xA par 90) sur ses 365 jours d'avant dans l'ancien
 * et ses 365 jours d'après dans le nouveau (≥ 900 min de chaque côté, xG relevés) ; log F_nouveau − log F_ancien
 * = log(après/avant), moindres carrés rétrécis vers 0 (a priori : `apriori` paires), ancrés sur la moyenne pondérée
 * par les minutes. Fenêtre : 2023-07-01 → 2026-09-23 seulement. Rend { facteurs, couples, paires }.
 */
export function apprendreLesFacteurs({ database, de = PERIODES_DU_BANC.donnees.de, a = PERIODES_DU_BANC.donnees.a, apriori = 30, minimumPaires = 20 } = {}) {
  const ligue = new Map();
  for (const r of database.prepare(`SELECT d.rencontre, d.league, t.coupe, t.xg_p FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE d.date >= ? AND d.date <= ?`).iterate(de, a)) {
    ligue.set(r.rencontre, { lg: r.league, coupe: r.coupe === 1, xg: r.xg_p !== null });
  }
  const parJoueur = new Map();
  for (const r of database.prepare(`SELECT joueur, date, rencontre, minutes, xgnp, xa FROM player_day WHERE joue = 1 AND minutes > 0 AND date >= ? AND date <= ?`).iterate(de, a)) {
    const m = ligue.get(r.rencontre);
    if (!m || m.coupe) continue;
    let l = parJoueur.get(r.joueur);
    if (!l) parJoueur.set(r.joueur, (l = []));
    l.push({ j: numeroDuJour(r.date), lg: m.lg, min: r.minutes, x: m.xg && r.xgnp !== null && r.xa !== null ? (r.xgnp + r.xa) / 1000 : null });
  }
  const paires = [];
  const minutesParLigue = new Map();
  for (const l of parJoueur.values()) {
    l.sort((x, y) => x.j - y.j);
    for (const y of l) minutesParLigue.set(y.lg, (minutesParLigue.get(y.lg) ?? 0) + y.min);
    for (let i = 1; i < l.length; i++) {
      if (l[i].lg === l[i - 1].lg) continue;
      const t = l[i].j;
      const avant = l.filter((y) => y.j < t && y.j >= t - 365 && y.lg === l[i - 1].lg && y.x !== null);
      const apres = l.filter((y) => y.j >= t && y.j < t + 365 && y.lg === l[i].lg && y.x !== null);
      const mA = avant.reduce((s, y) => s + y.min, 0);
      const mP = apres.reduce((s, y) => s + y.min, 0);
      if (mA < 900 || mP < 900) continue;
      const pA = (avant.reduce((s, y) => s + y.x, 0) / mA) * 90;
      const pP = (apres.reduce((s, y) => s + y.x, 0) / mP) * 90;
      if (!(pA > 0.02) || !(pP > 0.02)) continue;
      paires.push({ de: l[i - 1].lg, vers: l[i].lg, r: Math.log(pP / pA) });
    }
  }
  const compte = new Map();
  for (const p of paires) for (const k of [p.de, p.vers]) compte.set(k, (compte.get(k) ?? 0) + 1);
  const ligues = [...compte.keys()].filter((k) => compte.get(k) >= minimumPaires).sort();
  const idx = new Map(ligues.map((k, i) => [k, i]));
  const n = ligues.length;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (const p of paires) {
    const i = idx.get(p.vers);
    const j = idx.get(p.de);
    if (i === undefined || j === undefined) continue;
    A[i][i] += 1;
    A[j][j] += 1;
    A[i][j] -= 1;
    A[j][i] -= 1;
    b[i] += p.r;
    b[j] -= p.r;
  }
  for (let i = 0; i < n; i++) A[i][i] += apriori / Math.max(1, compte.get(ligues[i]));
  const f = resoudre(A, b);
  let sw = 0;
  let sf = 0;
  for (let i = 0; i < n; i++) {
    const w = minutesParLigue.get(ligues[i]) ?? 0;
    sw += w;
    sf += w * f[i];
  }
  const centre = sw > 0 ? sf / sw : 0;
  const facteurs = {};
  for (let i = 0; i < n; i++) facteurs[ligues[i]] = Math.round(Math.exp(f[i] - centre) * 1000) / 1000;
  const couples = new Map();
  for (const p of paires) {
    const k = `${p.de} → ${p.vers}`;
    const c = couples.get(k) ?? { n: 0, s: 0 };
    c.n++;
    c.s += p.r;
    couples.set(k, c);
  }
  return {
    facteurs,
    paires: paires.length,
    couples: [...couples].map(([k, c]) => ({ k, n: c.n, rapport: Math.round(Math.exp(c.s / c.n) * 1000) / 1000 })).sort((x, y) => y.n - x.n).slice(0, 30)
  };
}

function resoudre(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => (r[i] ? r[n] / r[i] : 0));
}

/** Les coefficients du REPLI SANS xG : xG hors penalty par tir, xA par passe clé, sur les lignes couvertes de la fenêtre permise. */
export function coefficientsDuRepli({ database, de = PERIODES_DU_BANC.donnees.de, a = PERIODES_DU_BANC.donnees.a } = {}) {
  const r = database.prepare(`SELECT SUM(xgnp) xgnp, SUM(xa) xa, SUM(tirs) tirs, SUM(pc) pc FROM player_day WHERE joue = 1 AND minutes > 0 AND xgnp IS NOT NULL AND date >= ? AND date <= ?`).get(de, a);
  return { tirs: r.tirs ? Math.round((r.xgnp / 1000 / r.tirs) * 1000) / 1000 : null, pc: r.pc ? Math.round((r.xa / 1000 / r.pc) * 1000) / 1000 : null };
}

export const __pourLesTestsDuBanc = Object.freeze({ IX, jourIso, nombre });
