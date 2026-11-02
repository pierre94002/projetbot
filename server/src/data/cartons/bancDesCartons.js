/**
 * bancDesCartons.js — LE BANC DES CARTONS ET DES RÉGLAGES PAR CHAMPIONNAT (étape 33 du plan, lot 1a, partie B, 02/11/2026).
 * -----------------------------------------------------------------------
 * Le calcul du banc, PUR : ni base, ni fichier, ni horloge, ni hasard (le seul hasard est le générateur à graine du juge
 * de l'étape 16). Les rencontres lui sont apportées par le processus à part (cartonsEnfant.js, base en lecture seule) ;
 * il rend les verdicts. Ce qu'il applique a été FIXÉ AVANT LE REGARD UNIQUE (reglagesCartons.js, formulesDesCartons.js,
 * bench/lancements.js : VARIANTES_DE_L_ETAPE_33 ; ici : les formes des variantes) — décisions de l'orchestrateur du
 * 02/11/2026 et critique :
 *   - LES DONNÉES (donneesDuBanc) : la passe chronologique CartonsAuJourJ sur tout le flux jusqu'au 23/09/2026 ; pour
 *     chaque match des deux plis, l'instantané d'AVANT sa journée (moyennes de la compétition, tendance, fenêtres des
 *     deux équipes, indice de l'arbitre et du faux arbitre) et ses cartons (statut relevé après la garde du jour J) ;
 *     pour les corners, tirs et tirs cadrés, les attendus NEUTRES des fenêtres f10 du moteur et le réalisé ;
 *   - LES CARTONS : régression de Poisson (Newton), niveaux c_dom, c_ext libres, a priori gaussien d'écart-type 1 sur les
 *     exposants λ (tendance, constat 2), α, γ (équipes), β (arbitre) ; trois bras (repère, équipes, complet) ; chaque bras
 *     a ses dispersions (1/k équipe, 1/k total, par les moments autour de SES attendus, sur le pli d'apprentissage) ; la
 *     loi d'une équipe à 1/k < 0 est la binomiale (décision 2) ;
 *     cartons-equipes : A = repère, B = équipes ; cartons-arbitre : A = équipes, B = complet, les DEUX bras appris sur les
 *     MÊMES matchs (arbitre avec un match d'avant : constat 10) ; cartons-placebo : de même avec le faux arbitre ;
 *   - LES RÉGLAGES PAR CHAMPIONNAT : bras A = le COMMUN DU PLI (facteur domicile / extérieur, 1/k équipe / total, appris
 *     sur le pli d'apprentissage sans championnat : constat 1) ; bras B = facteur et dispersions par championnat, ramenés
 *     vers le commun par le bayésien empirique (retenirLesMesures), les dispersions remesurées autour des attendus du
 *     championnat ; un championnat de moins de 30 matchs au pli d'apprentissage (ou absent) reçoit le commun ; la loi du
 *     moteur (statMarkets : un 1/k négatif y est Poisson) ; championnat-placebo : 40 pseudo-championnats ;
 *   - LE JUGE : la perte log de la LOI ENTIÈRE des comptes (équipe à domicile + équipe à l'extérieur + total, chacun
 *     avec SA dispersion), une ligne par match, bloc = le match ; deux plis réunis dans UN comparer (le juge de l'étape
 *     16, inchangé), chaque ligne jugée avec ce qui a été appris sur l'AUTRE pli ; K = VARIANTES_DE_L_ETAPE_33.length ;
 *   - RAPPORTÉ SANS VERDICT : les trois parts de la perte, l'ampleur (sans résultat), la calibration (toutes les lignes,
 *     dix tranches), les dispersions des deux autres conventions de comptage (constat 6), le recentrage commun face aux
 *     constantes du moteur et la même comparaison sur 2023-07 → 2024-06, que les constantes n'ont jamais vue (constat 1) ;
 *   - UTILE : « retenu », au moins 200 matchs jugés, ampleur d'au moins 0,5 point (garde secondaire), et le placebo de sa
 *     famille pas « retenu » (sinon le banc de cette famille est faux, et c'est dit) ;
 *   - LES VALEURS FINALES, apprises sur les deux plis réunis ; l'horizon de la preuve de chaque variante utile.
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/cartons/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { comparer, zPour } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_33 } from '../../bench/lancements.js';
import { STAT_KINDS, statExpectations } from '../../sports/football/statMarkets.js';
import { ajouterALaMesure, reunirMesures, facteurMesure, dispersionMesuree, retenirLesMesures } from '../db/leagueBenchmarks.js';
import { PRIOR_SD, NEWTON, PERIODES_DU_BANC, JUGE, AMPLEUR, MIN_MATCHS_UTILE, PAR_CHAMPIONNAT, PLACEBOS, PREUVE, CONVENTION } from './reglagesCartons.js';
import { attendusDesCartons, attendusParChampionnat, loiDesCartons, perteDesComptes } from './formulesDesCartons.js';
import { CartonsAuJourJ, passerLesRencontres, fauxArbitre, pseudoChampionnat } from './cartonsAuJourJ.js';

export { fauxArbitre, pseudoChampionnat };

/** La forme de la sortie du banc et de la note recopiée. */
export const VERSION_DU_BANC = 1;

/** Gèle un objet et tout ce qu'il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const dans = (jour, p) => jour >= p.de && jour <= p.a;

/** La définition retenue (déclarée, comptée dans K) : elle ne lit aucun résultat, elle n'est pas jugée. */
export const DEFINITION_RETENUE = 'cartons-corners-v1';

/** Les statistiques des réglages par championnat : leur nom au banc → leur clé dans STAT_KINDS (statMarkets.js). */
export const STATISTIQUES = gele({ corners: 'corners', tirs: 'shots', cadres: 'shotsOnTarget' });

/**
 * LES FORMES DES VARIANTES (fixées avant le regard ; les noms sont ceux de VARIANTES_DE_L_ETAPE_33) :
 *   cartons      brasA / brasB parmi repère, équipes, complet ; `sousEnsemble` : 'tous' | 'arbitre' (un match d'avant) |
 *                'faux' (le faux arbitre a un match d'avant) ; `z` : l'indice lu ('arbitre' ou 'faux') ;
 *   championnat  `stat` : corners, tirs ou cadres ; `cle` : 'ligue' (le championnat) ou 'pseudo' (le placebo).
 */
export const FORMES = gele({
  'cartons-equipes': { famille: 'cartons', brasA: 'repere', brasB: 'equipes', sousEnsemble: 'tous', z: null },
  'cartons-arbitre': { famille: 'cartons', brasA: 'equipes', brasB: 'complet', sousEnsemble: 'arbitre', z: 'arbitre' },
  'cartons-placebo': { famille: 'cartons', brasA: 'equipes', brasB: 'complet', sousEnsemble: 'faux', z: 'faux', placebo: true },
  'corners-championnat': { famille: 'championnat', stat: 'corners', cle: 'ligue' },
  'tirs-championnat': { famille: 'championnat', stat: 'tirs', cle: 'ligue' },
  'cadres-championnat': { famille: 'championnat', stat: 'cadres', cle: 'ligue' },
  'championnat-placebo': { famille: 'championnat', stat: 'corners', cle: 'pseudo', placebo: true }
});

/** Les variantes JUGÉES : toutes les déclarées sauf la définition retenue. */
export const VARIANTES_JUGEES = Object.freeze(VARIANTES_DE_L_ETAPE_33.map((v) => v.id).filter((id) => id !== DEFINITION_RETENUE));
/** Le placebo de chaque famille. */
export const PLACEBO_DE_LA_FAMILLE = gele({ cartons: 'cartons-placebo', championnat: 'championnat-placebo' });

/** Les facteurs de terrain du moteur, lus dans statExpectations (statMarkets.js) : jamais recopiés. */
export function facteursDuMoteur() {
  const e = statExpectations({ statInputs: { home: { corners: { for: 1, against: 1 } }, away: { corners: { for: 1, against: 1 } } } }).corners;
  return { dom: e.home, ext: e.away };
}

// ======================================================= les données du banc (la passe, sans aucun calcul de perte)

/**
 * LES DONNÉES DU BANC (générateur pur) : la passe CartonsAuJourJ sur `rencontres` (rencontresChronologiques, dans
 * l'ordre), mise en route comprise ; une rencontre après le dernier jour lu fait LEVER (rien de P5). Rend { cartons:
 * [{ cle, date, league, pli, C, un, trois, m, t, eq, nH, nA, z, nArb, zFaux, nFaux }], stats: { corners: [...], tirs,
 * cadres } ({ cle, date, league, pli, xh, xa, eh, ea }), lues, miseEnRoute }. `pli` : 'A' (2023-07 → 2025-06) ou 'B'.
 */
export function* donneesDuBanc(rencontres, { periodes = PERIODES_DU_BANC } = {}) {
  const A = periodes.plis[0].apprendre;
  const B = periodes.plis[0].juger;
  const pliDe = (jour) => (dans(jour, A) ? 'A' : dans(jour, B) ? 'B' : null);
  const cartons = [];
  const stats = { corners: [], tirs: [], cadres: [] };
  let lues = 0;
  let miseEnRoute = 0;
  const acc = new CartonsAuJourJ();
  const garder = (jour, inst, duJour) => {
    for (const r of duJour) {
      const pli = pliDe(r.date);
      if (!pli) {
        miseEnRoute += 1;
        continue;
      }
      const x = inst.get(r.matchKey);
      if (x.releve && x.m && r.valeur) {
        cartons.push({
          cle: r.matchKey,
          date: r.date,
          league: r.league,
          pli,
          C: r.valeur,
          un: r.conventions?.un ?? null,
          trois: r.conventions?.trois ?? null,
          m: x.m,
          t: x.tendance.valeur,
          eq: { rhoH: x.equipes.home.rho, piH: x.equipes.home.pi, rhoA: x.equipes.away.rho, piA: x.equipes.away.pi },
          nH: x.equipes.home.n,
          nA: x.equipes.away.n,
          z: x.arbitre && x.arbitre.n > 0 ? x.arbitre.z : null,
          nArb: x.arbitre ? x.arbitre.n : 0,
          zFaux: x.faux && x.faux.n > 0 ? x.faux.z : null,
          nFaux: x.faux ? x.faux.n : 0
        });
      }
      if (r.coupe || r.attribue || r.prolongation || r.nonJoue) continue;
      for (const s of Object.keys(stats)) {
        const v = r.stats?.[s];
        if (v?.x && v.neutres) stats[s].push({ cle: r.matchKey, date: r.date, league: r.league, pli, xh: v.x.home, xa: v.x.away, eh: v.neutres.home, ea: v.neutres.away });
      }
    }
  };
  const borne = function* (flux) {
    for (const r of flux) {
      if (r.date > periodes.dernierJourLu) throw new Error(`banc des cartons : la rencontre ${r.matchKey} du ${r.date} est après le dernier jour lu (${periodes.dernierJourLu}) — refusée`);
      lues += 1;
      yield r;
    }
  };
  yield* passerLesRencontres(acc, borne(rencontres), { avantLaJournee: garder });
  return { cartons, stats, lues, miseEnRoute };
}

// ======================================================= la régression de Poisson (les cartons)

/** Résout H·d = g (élimination de Gauss avec pivot partiel). */
function resoudre(H, g) {
  const n = g.length;
  const A = H.map((ligne, i) => [...ligne, g[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[pivot][c])) pivot = i;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    for (let i = c + 1; i < n; i++) {
      const f = A[i][c] / A[c][c];
      for (let k = c; k <= n; k++) A[i][k] -= f * A[c][k];
    }
  }
  const d = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * d[k];
    d[i] = s / A[i][i];
  }
  return d;
}

/** Les coefficients de chaque bras, dans l'ordre du vecteur (les deux niveaux d'abord, libres). */
export const COEFFICIENTS = gele({ repere: ['cDom', 'cExt', 'lambda'], equipes: ['cDom', 'cExt', 'lambda', 'alpha', 'gamma'], complet: ['cDom', 'cExt', 'lambda', 'alpha', 'gamma', 'beta'] });

/** L'indice d'arbitre lu par un bras : celui du vrai arbitre, celui du faux, ou aucun (0). */
const zDe = (m, quel) => (quel === 'arbitre' ? m.z : quel === 'faux' ? m.zFaux : null);

/** Les deux observations (domicile, extérieur) d'un match pour un bras : { y, off, x }. */
function observations(m, bras, quelZ) {
  const lt = Math.log(m.t);
  const z = fini(zDe(m, quelZ)) ? zDe(m, quelZ) : 0;
  const ligne = (y, mm, dom, lr, lp) => {
    const x = [dom ? 1 : 0, dom ? 0 : 1, lt];
    if (bras !== 'repere') x.push(lr, lp);
    if (bras === 'complet') x.push(z);
    return { y, off: Math.log(mm), x };
  };
  return [ligne(m.C.home, m.m.dom, true, Math.log(m.eq.rhoH), Math.log(m.eq.piA)), ligne(m.C.away, m.m.ext, false, Math.log(m.eq.rhoA), Math.log(m.eq.piH))];
}

/**
 * L'APPRENTISSAGE D'UN BRAS DES CARTONS : régression de Poisson (Newton, NEWTON.iterations au plus, arrêt quand le plus
 * grand pas est sous NEWTON.arret), niveaux c libres, a priori gaussien d'écart-type PRIOR_SD (centré sur 0) sur les
 * exposants. `quelZ` : l'indice lu par le bras complet ('arbitre' ou 'faux'). Rend { bras, parametres, vecteur, matchs,
 * iterations, converge }.
 */
export function apprendreLeModele(matchs, bras, { quelZ = 'arbitre', prior = PRIOR_SD, iterations = NEWTON.iterations, arret = NEWTON.arret } = {}) {
  const noms = COEFFICIENTS[bras];
  if (!noms) throw new Error(`banc des cartons : bras inconnu « ${String(bras)} »`);
  const p = noms.length;
  const obs = [];
  for (const m of matchs) obs.push(...observations(m, bras, quelZ));
  const pen = noms.map((n) => (n === 'cDom' || n === 'cExt' ? 0 : 1 / (prior * prior)));
  const b = new Array(p).fill(0);
  let it = 0;
  let converge = false;
  while (it < iterations) {
    it += 1;
    const g = b.map((x, k) => -pen[k] * x);
    const H = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (__, j) => (i === j ? pen[i] : 0)));
    for (const o of obs) {
      let eta = o.off;
      for (let k = 0; k < p; k++) eta += b[k] * o.x[k];
      const mu = Math.exp(eta);
      for (let k = 0; k < p; k++) {
        if (o.x[k] === 0) continue;
        g[k] += (o.y - mu) * o.x[k];
        for (let l = 0; l < p; l++) H[k][l] += mu * o.x[k] * o.x[l];
      }
    }
    const d = resoudre(H, g);
    for (let k = 0; k < p; k++) b[k] += d[k];
    if (Math.max(...d.map((x) => Math.abs(x))) < arret) {
      converge = true;
      break;
    }
  }
  const parametres = Object.fromEntries(noms.map((n, k) => [n, b[k]]));
  return { bras, parametres, vecteur: [...b], matchs: obs.length / 2, iterations: it, converge };
}

/** Les cartons attendus d'un match par un bras appris. */
export function attendusDuBras(m, modele, quelZ = 'arbitre') {
  return attendusDesCartons({ m: m.m, tendance: m.t, equipes: m.eq, z: fini(zDe(m, quelZ)) ? zDe(m, quelZ) : 0, parametres: modele.parametres, bras: modele.bras });
}

/**
 * LES DISPERSIONS PAR LES MOMENTS (la méthode d'ajouterALaMesure / dispersionMesuree, leagueBenchmarks.js), le match comme
 * unité : `paires` = [{ xh, xa, muh, mua }] (réalisé et attendu de chaque camp). Rend { equipe: { valeur, se }, total:
 * { valeur, se }, n } — valeurs BRUTES (négatives comprises : la loi des cartons en fait une binomiale).
 */
export function dispersions(paires) {
  const z = reunirMesures([]);
  for (const q of paires) ajouterALaMesure(z, { xh: q.xh, xa: q.xa, eh: q.muh, ea: q.mua }, { dom: 1, ext: 1 });
  return { equipe: dispersionMesuree(z.equipe, z.n), total: dispersionMesuree(z.total, z.n), n: z.n };
}

/** UN BRAS DES CARTONS appris sur `matchs` : le modèle et ses dispersions (autour de SES attendus). */
export function bras(matchs, nom, quelZ = 'arbitre') {
  const modele = apprendreLeModele(matchs, nom, { quelZ });
  const disp = dispersions(matchs.map((m) => {
    const mu = attendusDuBras(m, modele, quelZ);
    return { xh: m.C.home, xa: m.C.away, muh: mu.home, mua: mu.away };
  }));
  return { ...modele, quelZ, invKEquipe: disp.equipe?.valeur ?? 0, invKTotal: disp.total?.valeur ?? 0, dispersions: disp };
}

// ======================================================= la perte, l'ampleur, la calibration

/** La perte d'un match : les deux équipes (1/k équipe) et le total (1/k total), chacun planché. `loi` : 'cartons' ou 'moteur'. */
export function perteDuMatch(x, mu, invKEquipe, invKTotal, loi = 'cartons') {
  const home = perteDesComptes(x.home, mu.home, invKEquipe, { loi });
  const away = perteDesComptes(x.away, mu.away, invKEquipe, { loi });
  const total = perteDesComptes(x.home + x.away, mu.home + mu.away, invKTotal, { loi });
  return { home, away, total, somme: home + away + total };
}

/** P(plus de ℓ) pour toutes les demi-lignes de 0,5 à `max` + 0,5 (une loi, une somme cumulée). */
function plusDe(mu, invK, max, loi) {
  const N = Math.floor(max) + 1;
  const { pmf } = loiDesCartons(mu, invK, Math.max(1, N), { loi });
  const out = new Array(N).fill(0);
  let s = 0;
  for (let k = 0; k < N; k++) {
    s += pmf[k] ?? 0;
    out[k] = Math.max(0, 1 - Math.min(1, s));
  }
  return out; // out[k] = P(X > k + 0,5) = P(plus de k + 0,5)
}

/**
 * L'AMPLEUR (sans aucun résultat) : pour le total et chaque équipe, la moyenne de |P_B(plus de ℓ) − P_A(plus de ℓ)| pour
 * ℓ ∈ {ℓ* − 1, ℓ*, ℓ* + 1} (ℓ > 0), ℓ* = ⌊μ_A⌋ + 0,5. `matchs` : [{ muA, muB, dispA, dispB }]. Rend { total, home, away,
 * max, portee } (moyennes sur les matchs).
 */
export function ampleur(matchs, loi = 'cartons') {
  const sommes = { total: 0, home: 0, away: 0 };
  let n = 0;
  for (const q of matchs) {
    n += 1;
    for (const portee of ['total', 'home', 'away']) {
      const kA = portee === 'total' ? q.dispA.total : q.dispA.equipe;
      const kB = portee === 'total' ? q.dispB.total : q.dispB.equipe;
      const muA = q.muA[portee];
      const muB = q.muB[portee];
      const etoile = Math.floor(muA);
      const lignes = [etoile - 1, etoile, etoile + 1].filter((k) => k >= 0);
      const pa = plusDe(muA, kA, etoile + 1.5, loi);
      const pb = plusDe(muB, kB, etoile + 1.5, loi);
      let s = 0;
      for (const k of lignes) s += Math.abs(pb[k] - pa[k]);
      sommes[portee] += s / lignes.length;
    }
  }
  const moy = (x) => (n ? x / n : null);
  const out = { total: moy(sommes.total), home: moy(sommes.home), away: moy(sommes.away) };
  const portee = ['total', 'home', 'away'].reduce((a, b) => ((out[b] ?? -1) > (out[a] ?? -1) ? b : a), 'total');
  return { ...out, max: out[portee], portee };
}

/**
 * LA CALIBRATION (rapportée, sans verdict) : toutes les demi-lignes de 0,4 à 1,8 fois l'attendu du bras A (comme
 * lineCandidates), du total et des deux équipes ; la probabilité « plus de » annoncée par chaque bras, rangée en dix
 * tranches, face à la fréquence réalisée ; l'écart moyen pondéré en points. `matchs` : [{ x, muA, muB, dispA, dispB }].
 */
export function calibration(matchs, loi = 'cartons') {
  const tranches = { A: Array.from({ length: 10 }, () => ({ n: 0, p: 0, r: 0 })), B: Array.from({ length: 10 }, () => ({ n: 0, p: 0, r: 0 })) };
  let lignes = 0;
  for (const q of matchs) {
    for (const portee of ['total', 'home', 'away']) {
      const muA = q.muA[portee];
      const reel = portee === 'total' ? q.x.home + q.x.away : q.x[portee];
      const de = Math.max(0.5, Math.floor(muA * 0.4) + 0.5);
      const a = Math.ceil(muA * 1.8) + 0.5;
      const pA = plusDe(muA, portee === 'total' ? q.dispA.total : q.dispA.equipe, a, loi);
      const pB = plusDe(q.muB[portee], portee === 'total' ? q.dispB.total : q.dispB.equipe, a, loi);
      for (let l = de; l <= a; l += 1) {
        const k = Math.floor(l);
        const r = reel > l ? 1 : 0;
        lignes += 1;
        for (const [bras, p] of [['A', pA[k]], ['B', pB[k]]]) {
          const t = tranches[bras][Math.min(9, Math.floor(p * 10))];
          t.n += 1;
          t.p += p;
          t.r += r;
        }
      }
    }
  }
  const resume = (ts) => {
    const n = ts.reduce((s, t) => s + t.n, 0);
    const ecart = n ? ts.reduce((s, t) => s + (t.n ? Math.abs(t.p / t.n - t.r / t.n) * t.n : 0), 0) / n : null;
    return { ecartMoyenPoints: fini(ecart) ? ecart * 100 : null, tranches: ts.map((t, i) => ({ de: i / 10, a: (i + 1) / 10, lignes: t.n, annonce: t.n ? t.p / t.n : null, realise: t.n ? t.r / t.n : null })) };
  };
  return { lignes, A: resume(tranches.A), B: resume(tranches.B) };
}

// ======================================================= le juge

/** Le juge de l'étape 16 sur des lignes (options du banc) : verdict, gain par ligne et en part de la perte de A, z observé. */
export function jugerDesLignes(lignes, { K, tirages = JUGE.tirages, graine = JUGE.graine, minBlocs = JUGE.minBlocs } = {}) {
  const r = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes: K, tirages, graine, minBlocs });
  const base = r.a.moyenne;
  const relatif = (x) => (fini(x) && fini(base) && base > 0 ? x / base : null);
  return {
    verdict: r.verdict,
    raison: r.raison,
    lignes: r.n.lignes,
    blocs: r.n.blocs,
    perteA: base,
    perteB: r.b.moyenne,
    gain: r.gain,
    ecartType: r.ecartType,
    fourchette: r.fourchette,
    gainRelatif: relatif(r.gain),
    fourchetteRelative: r.fourchette ? [relatif(r.fourchette[0]), relatif(r.fourchette[1])] : null,
    zObserve: fini(r.gain) && r.ecartType > 0 ? r.gain / r.ecartType : null,
    p: r.p,
    z: r.seuil.z,
    variantes: r.seuil.variantes
  };
}

const PAS_ASSEZ = (n) => ({ verdict: 'pas-assez-de-matchs', raison: `${n} ligne(s)`, lignes: n, blocs: n, perteA: null, perteB: null, gain: null, ecartType: null, fourchette: null, gainRelatif: null, fourchetteRelative: null, zObserve: null, p: null });

// ======================================================= les cartons : une variante sur les deux plis

/** Les matchs d'une variante des cartons (le sous-ensemble de sa forme). */
export function sousEnsemble(matchs, forme) {
  if (forme.sousEnsemble === 'arbitre') return matchs.filter((m) => m.nArb >= 1 && fini(m.z));
  if (forme.sousEnsemble === 'faux') return matchs.filter((m) => m.nFaux >= 1 && fini(m.zFaux));
  return matchs;
}

/** Les deux plis : pli 0 apprend sur A et juge B ; pli 1 apprend sur B et juge A. */
const PLIS = Object.freeze([{ pli: 0, apprendre: 'A', juger: 'B' }, { pli: 1, apprendre: 'B', juger: 'A' }]);

/**
 * UNE VARIANTE DES CARTONS SUR LES DEUX PLIS : les deux bras appris sur le pli d'apprentissage (le même sous-ensemble),
 * puis une ligne par match jugé { bloc, date, a, b, pli } — chaque ligne jugée avec ce qui a été appris sur l'AUTRE pli.
 * Rend aussi, sans verdict, les parts de la perte, l'ampleur et la calibration ; et les bras appris de chaque pli.
 */
export function lignesDesCartons(matchs, forme) {
  const tous = sousEnsemble(matchs, forme);
  const lignes = [];
  const parts = { A: { home: 0, away: 0, total: 0 }, B: { home: 0, away: 0, total: 0 } };
  const pourAmpleur = [];
  const plis = [];
  for (const P of PLIS) {
    const apprendre = tous.filter((m) => m.pli === P.apprendre);
    const juger = tous.filter((m) => m.pli === P.juger);
    if (!apprendre.length || !juger.length) {
      plis.push({ pli: P.pli, apprisSur: P.apprendre, jugeSur: P.juger, matchsAppris: apprendre.length, matchsJuges: juger.length, A: null, B: null });
      continue;
    }
    const bA = bras(apprendre, forme.brasA, forme.z ?? 'arbitre');
    const bB = bras(apprendre, forme.brasB, forme.z ?? 'arbitre');
    plis.push({ pli: P.pli, apprisSur: P.apprendre, jugeSur: P.juger, matchsAppris: apprendre.length, matchsJuges: juger.length, A: resumeDuBras(bA), B: resumeDuBras(bB) });
    for (const m of juger) {
      const muA = attendusDuBras(m, bA, forme.z ?? 'arbitre');
      const muB = attendusDuBras(m, bB, forme.z ?? 'arbitre');
      const pa = perteDuMatch(m.C, muA, bA.invKEquipe, bA.invKTotal, 'cartons');
      const pb = perteDuMatch(m.C, muB, bB.invKEquipe, bB.invKTotal, 'cartons');
      lignes.push({ bloc: m.cle, date: m.date, a: pa.somme, b: pb.somme, pli: P.pli });
      for (const k of ['home', 'away', 'total']) {
        parts.A[k] += pa[k];
        parts.B[k] += pb[k];
      }
      pourAmpleur.push({ x: m.C, muA, muB, dispA: { equipe: bA.invKEquipe, total: bA.invKTotal }, dispB: { equipe: bB.invKEquipe, total: bB.invKTotal }, m, bA, bB });
    }
  }
  return { lignes, parts, pourAmpleur, plis };
}

const arrondi = (x, n = 6) => (fini(x) ? Number(x.toFixed(n)) : null);
/** Ce qu'on rapporte d'un bras appris. */
function resumeDuBras(b) {
  return { bras: b.bras, parametres: Object.fromEntries(Object.entries(b.parametres).map(([k, v]) => [k, arrondi(v)])), invKEquipe: arrondi(b.invKEquipe), invKTotal: arrondi(b.invKTotal), seEquipe: arrondi(b.dispersions.equipe?.se), seTotal: arrondi(b.dispersions.total?.se), iterations: b.iterations, converge: b.converge, matchs: b.matchs };
}

/**
 * LES DEUX AUTRES CONVENTIONS DE COMPTAGE (critique, constat 6 : des MESURES, pas des variantes) : sur les mêmes lignes
 * (bras B de la variante), les attendus remis à l'échelle de chaque convention (Σ comptes de la convention / Σ comptes C,
 * par camp) et les dispersions par les moments ; et les cartons par match de chaque convention.
 */
export function mesuresDesConventions(pourAmpleur) {
  const out = {};
  const n = pourAmpleur.length;
  for (const [nom, cle] of [['C', 'C'], ['un', 'un'], ['trois', 'trois']]) {
    const x = (q) => (cle === 'C' ? q.m.C : q.m[cle]);
    const valides = pourAmpleur.filter((q) => x(q));
    const sh = valides.reduce((s, q) => s + x(q).home, 0) / Math.max(1e-12, valides.reduce((s, q) => s + q.m.C.home, 0));
    const sa = valides.reduce((s, q) => s + x(q).away, 0) / Math.max(1e-12, valides.reduce((s, q) => s + q.m.C.away, 0));
    const d = dispersions(valides.map((q) => ({ xh: x(q).home, xa: x(q).away, muh: q.muB.home * sh, mua: q.muB.away * sa })));
    out[nom] = { matchs: valides.length, cartonsParMatch: valides.length ? valides.reduce((s, q) => s + x(q).home + x(q).away, 0) / valides.length : null, echelle: { home: arrondi(sh), away: arrondi(sa) }, invKEquipe: arrondi(d.equipe?.valeur), invKTotal: arrondi(d.total?.valeur) };
  }
  return { lignes: n, expulsionApresDeuxJaunes: { C: CONVENTION.expulsionApresDeuxJaunes, un: CONVENTION.autresMesurees.un, trois: CONVENTION.autresMesurees.trois }, ...out };
}

// ======================================================= les réglages par championnat

/** Un réglage : { dom, ext, invKEquipe, invKTotal }. Le réglage du MOTEUR (constantes : statExpectations et STAT_KINDS). */
export function reglageDuMoteur(stat) {
  const f = facteursDuMoteur();
  const k = STAT_KINDS[STATISTIQUES[stat]];
  return { dom: f.dom, ext: f.ext, invKEquipe: k.invKTeam, invKTotal: k.invKTotal };
}

/** Le facteur domicile / extérieur mesuré sur des lignes (estimateur de ratio et son erreur type). */
function facteursMesures(lignes) {
  const z = reunirMesures([]);
  for (const l of lignes) ajouterALaMesure(z, { xh: l.xh, xa: l.xa, eh: l.eh, ea: l.ea }, { dom: 1, ext: 1 });
  return { dom: facteurMesure(z.dom, z.n), ext: facteurMesure(z.ext, z.n), n: z.n };
}
/** La mesure des dispersions autour de facteur × attendus neutres. */
function mesureAutour(lignes, facteur) {
  const z = reunirMesures([]);
  for (const l of lignes) ajouterALaMesure(z, { xh: l.xh, xa: l.xa, eh: l.eh, ea: l.ea }, facteur);
  return z;
}

/** LE COMMUN DU PLI (bras A, constat 1) : facteur domicile / extérieur, puis 1/k équipe / total autour de lui. */
export function reglageCommun(lignes) {
  const f = facteursMesures(lignes);
  if (!f.n || !f.dom || !f.ext) return null;
  const facteur = { dom: f.dom.valeur, ext: f.ext.valeur };
  const z = mesureAutour(lignes, facteur);
  const de = dispersionMesuree(z.equipe, z.n);
  const dt = dispersionMesuree(z.total, z.n);
  return { dom: facteur.dom, ext: facteur.ext, invKEquipe: de?.valeur ?? 0, invKTotal: dt?.valeur ?? 0, n: f.n, se: { dom: f.dom.se, ext: f.ext.se, equipe: de?.se ?? null, total: dt?.se ?? null } };
}

/**
 * LES RÉGLAGES PAR CHAMPIONNAT (bras B) appris sur `lignes` : `cleDe(l)` donne le championnat (ou le pseudo-championnat) ;
 * facteurs mesurés par championnat (30 matchs au moins), ramenés vers le commun par le bayésien empirique ; puis les
 * dispersions remesurées autour des attendus du championnat, ramenées vers la valeur de tous les championnats remesurée
 * de même. Un championnat sous 30 matchs reçoit le commun. Rend { commun, parLigue: Map(ligue → réglage), tau2 }.
 */
export function apprendreParChampionnat(lignes, cleDe = (l) => l.league) {
  const commun = reglageCommun(lignes);
  if (!commun) return { commun: null, parLigue: new Map(), tau2: null };
  const groupes = new Map();
  for (const l of lignes) {
    const k = cleDe(l);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(l);
  }
  const propres = [...groupes].filter(([, g]) => g.length >= PAR_CHAMPIONNAT.minMatchsPropres);
  const facteurs = new Map(propres.map(([k, g]) => [k, facteursMesures(g)]));
  const mesuresDom = Object.fromEntries([...facteurs].map(([k, f]) => [k, f.dom ? { valeur: f.dom.valeur, se: f.dom.se, matchs: f.n } : null]));
  const mesuresExt = Object.fromEntries([...facteurs].map(([k, f]) => [k, f.ext ? { valeur: f.ext.valeur, se: f.ext.se, matchs: f.n } : null]));
  const rDom = retenirLesMesures(mesuresDom, commun.dom);
  const rExt = retenirLesMesures(mesuresExt, commun.ext);
  const facteurDe = (k) => ({ dom: rDom.mesures[k]?.retenue ?? commun.dom, ext: rExt.mesures[k]?.retenue ?? commun.ext });
  const zParLigue = new Map(propres.map(([k, g]) => [k, mesureAutour(g, facteurDe(k))]));
  const reunie = reunirMesures([...zParLigue.values()]);
  const refEquipe = dispersionMesuree(reunie.equipe, reunie.n)?.valeur ?? commun.invKEquipe;
  const refTotal = dispersionMesuree(reunie.total, reunie.n)?.valeur ?? commun.invKTotal;
  const mesE = Object.fromEntries([...zParLigue].map(([k, z]) => {
    const d = dispersionMesuree(z.equipe, z.n);
    return [k, d ? { valeur: d.valeur, se: d.se, matchs: z.n } : null];
  }));
  const mesT = Object.fromEntries([...zParLigue].map(([k, z]) => {
    const d = dispersionMesuree(z.total, z.n);
    return [k, d ? { valeur: d.valeur, se: d.se, matchs: z.n } : null];
  }));
  const rE = retenirLesMesures(mesE, refEquipe);
  const rT = retenirLesMesures(mesT, refTotal);
  const parLigue = new Map();
  for (const [k, g] of groupes) {
    if (!facteurs.has(k)) {
      parLigue.set(k, { dom: commun.dom, ext: commun.ext, invKEquipe: commun.invKEquipe, invKTotal: commun.invKTotal, n: g.length, propre: false });
      continue;
    }
    const f = facteurDe(k);
    parLigue.set(k, {
      dom: f.dom,
      ext: f.ext,
      invKEquipe: rE.mesures[k]?.retenue ?? refEquipe,
      invKTotal: rT.mesures[k]?.retenue ?? refTotal,
      n: g.length,
      propre: true,
      poids: { dom: rDom.mesures[k]?.poids ?? 0, ext: rExt.mesures[k]?.poids ?? 0, equipe: rE.mesures[k]?.poids ?? 0, total: rT.mesures[k]?.poids ?? 0 },
      mesure: { dom: mesuresDom[k]?.valeur ?? null, ext: mesuresExt[k]?.valeur ?? null, equipe: mesE[k]?.valeur ?? null, total: mesT[k]?.valeur ?? null }
    });
  }
  return { commun, parLigue, tau2: { dom: rDom.tau2, ext: rExt.tau2, equipe: rE.tau2, total: rT.tau2 }, references: { equipe: refEquipe, total: refTotal } };
}

/** Le réglage d'un match jugé : celui de son championnat s'il a été appris, sinon le commun (bras A). */
const reglageDe = (appris, k) => appris.parLigue.get(k) ?? { ...appris.commun, propre: false };

/** La perte d'une ligne de statistique sous un réglage (loi du moteur). */
function perteDeLaStat(l, reglage) {
  const mu = attendusParChampionnat({ neutres: { home: l.eh, away: l.ea }, reglage });
  return { mu, p: perteDuMatch({ home: l.xh, away: l.xa }, mu, reglage.invKEquipe, reglage.invKTotal, 'moteur') };
}

/**
 * UNE VARIANTE PAR CHAMPIONNAT SUR LES DEUX PLIS : le commun (A) et les réglages par championnat (B) appris sur le pli
 * d'apprentissage, une ligne par match jugé. `bras` : { A, B } parmi 'moteur', 'commun', 'parChampionnat' (le défaut :
 * commun face à parChampionnat ; « moteur face à commun » sert au rapport du recentrage commun, sans verdict).
 */
export function lignesParChampionnat(lignesStat, forme, { brasA = 'commun', brasB = 'parChampionnat' } = {}) {
  const cleDe = forme.cle === 'pseudo' ? (l) => pseudoChampionnat(l.cle) : (l) => l.league;
  const lignes = [];
  const parts = { A: { home: 0, away: 0, total: 0 }, B: { home: 0, away: 0, total: 0 } };
  const pourAmpleur = [];
  const plis = [];
  for (const P of PLIS) {
    const apprendre = lignesStat.filter((l) => l.pli === P.apprendre);
    const juger = lignesStat.filter((l) => l.pli === P.juger);
    const appris = apprendre.length ? apprendreParChampionnat(apprendre, cleDe) : null;
    if (!appris?.commun || !juger.length) {
      plis.push({ pli: P.pli, apprisSur: P.apprendre, jugeSur: P.juger, matchsAppris: apprendre.length, matchsJuges: juger.length, commun: null });
      continue;
    }
    const moteur = reglageDuMoteur(forme.stat);
    const choisir = (b, l) => (b === 'moteur' ? moteur : b === 'commun' ? appris.commun : reglageDe(appris, cleDe(l)));
    plis.push({ pli: P.pli, apprisSur: P.apprendre, jugeSur: P.juger, matchsAppris: apprendre.length, matchsJuges: juger.length, commun: resumeDuReglage(appris.commun), tau2: appris.tau2, championnatsPropres: [...appris.parLigue.values()].filter((r) => r.propre).length, championnats: appris.parLigue.size });
    for (const l of juger) {
      const rA = choisir(brasA, l);
      const rB = choisir(brasB, l);
      const a = perteDeLaStat(l, rA);
      const b = perteDeLaStat(l, rB);
      lignes.push({ bloc: l.cle, date: l.date, a: a.p.somme, b: b.p.somme, pli: P.pli });
      for (const k of ['home', 'away', 'total']) {
        parts.A[k] += a.p[k];
        parts.B[k] += b.p[k];
      }
      pourAmpleur.push({ x: { home: l.xh, away: l.xa }, muA: a.mu, muB: b.mu, dispA: { equipe: rA.invKEquipe, total: rA.invKTotal }, dispB: { equipe: rB.invKEquipe, total: rB.invKTotal } });
    }
  }
  return { lignes, parts, pourAmpleur, plis };
}

/** Ce qu'on rapporte d'un réglage. */
function resumeDuReglage(r) {
  if (!r) return null;
  return { dom: arrondi(r.dom), ext: arrondi(r.ext), invKEquipe: arrondi(r.invKEquipe), invKTotal: arrondi(r.invKTotal), n: r.n ?? null, ...(r.propre === undefined ? {} : { propre: r.propre }), ...(r.poids ? { poids: Object.fromEntries(Object.entries(r.poids).map(([k, v]) => [k, arrondi(v, 4)])) } : {}) };
}

// ======================================================= le banc entier

/**
 * « UTILE » (fixé avant le regard) : pour chaque variante jugée — { id, famille, placebo, verdict, matchsJuges, ampleur:
 * { max } } —, utile si « retenu », au moins MIN_MATCHS_UTILE matchs jugés, ampleur d'au moins AMPLEUR.seuil, et le
 * placebo de SA famille pas « retenu » (sinon le banc de cette famille est faux). Pose `utile` et `raisons` sur chaque
 * variante ; rend { placebos: { famille: verdict }, bancFaux: { famille: booléen } }.
 */
export function decider(resultats) {
  const placebos = Object.fromEntries(Object.entries(PLACEBO_DE_LA_FAMILLE).map(([fam, id]) => [fam, resultats.find((r) => r.id === id)?.verdict ?? null]));
  const bancFaux = Object.fromEntries(Object.entries(placebos).map(([fam, v]) => [fam, v === 'retenu']));
  for (const r of resultats) {
    const raisons = [];
    if (r.verdict !== 'retenu') raisons.push(`verdict « ${r.verdict} »`);
    if (!(r.matchsJuges >= MIN_MATCHS_UTILE)) raisons.push(`${r.matchsJuges} matchs jugés (au moins ${MIN_MATCHS_UTILE})`);
    if (!(fini(r.ampleur?.max) && r.ampleur.max >= AMPLEUR.seuil)) raisons.push('ampleur sous 0,5 point');
    if (bancFaux[r.famille]) raisons.push(`le placebo de la famille « ${r.famille} » est « retenu » : le banc de cette famille est faux`);
    r.utile = !r.placebo && raisons.length === 0;
    r.raisons = r.placebo ? (bancFaux[r.famille] ? ['le placebo est « retenu » : le banc de sa famille est faux'] : []) : raisons;
  }
  return { placebos, bancFaux };
}

/** Les parts moyennes de la perte, par ligne. */
const partsMoyennes = (parts, n) => (n ? { A: Object.fromEntries(Object.entries(parts.A).map(([k, v]) => [k, v / n])), B: Object.fromEntries(Object.entries(parts.B).map(([k, v]) => [k, v / n])) } : null);

/**
 * LE BANC : pour chaque variante jugée, ses lignes sur les deux plis réunies dans UN jugement. `donnees` : celles de
 * donneesDuBanc. `K` doit valoir le nombre de variantes DÉCLARÉES (VARIANTES_DE_L_ETAPE_33.length) ; une variante non
 * déclarée, ou sans forme, fait lever ; une rencontre d'après le dernier jour lu aussi. Rend { version, K, z, periodes,
 * matchs, variantes: [...], placebos, bancFaux: { cartons, championnat }, utiles, conventions, recentrageCommun,
 * jamaisVue }.
 */
export function jugerLesVariantes(donnees, { periodes = PERIODES_DU_BANC, variantes = VARIANTES_JUGEES, K = VARIANTES_DE_L_ETAPE_33.length, declarees = VARIANTES_DE_L_ETAPE_33, tirages = JUGE.tirages, graine = JUGE.graine, minBlocs = JUGE.minBlocs, rapports = true } = {}) {
  const ids = declarees.map((v) => v.id);
  if (K !== ids.length) throw new Error(`banc des cartons : K (${K}) doit valoir le nombre de variantes déclarées (${ids.length}, VARIANTES_DE_L_ETAPE_33)`);
  for (const id of variantes) {
    if (!ids.includes(id)) throw new Error(`banc des cartons : la variante « ${id} » n'est pas déclarée (VARIANTES_DE_L_ETAPE_33) — refusée`);
    if (!FORMES[id]) throw new Error(`banc des cartons : la variante « ${id} » n'a pas de forme — refusée`);
  }
  const dernier = periodes.dernierJourLu;
  const tout = [...donnees.cartons, ...Object.values(donnees.stats).flat()];
  for (const m of tout) {
    if (m.date > dernier) throw new Error(`banc des cartons : la rencontre ${m.cle} du ${m.date} est après le dernier jour lu (${dernier}) — refusée`);
    if (m.pli !== 'A' && m.pli !== 'B') throw new Error(`banc des cartons : la rencontre ${m.cle} n'est dans aucun pli — refusée`);
  }
  const options = { K, tirages, graine, minBlocs };
  const resultats = [];
  let conventions = null;
  for (const id of variantes) {
    const forme = FORMES[id];
    const v = forme.famille === 'cartons' ? lignesDesCartons(donnees.cartons, forme) : lignesParChampionnat(donnees.stats[forme.stat], forme);
    const juge = v.lignes.length ? jugerDesLignes(v.lignes, options) : PAS_ASSEZ(0);
    const loi = forme.famille === 'cartons' ? 'cartons' : 'moteur';
    const amp = ampleur(v.pourAmpleur, loi);
    resultats.push({
      id,
      famille: forme.famille,
      placebo: Boolean(forme.placebo),
      ...(forme.stat ? { stat: forme.stat } : { brasA: forme.brasA, brasB: forme.brasB }),
      matchsJuges: v.lignes.length,
      ...juge,
      parts: partsMoyennes(v.parts, v.lignes.length),
      ampleur: { ...amp, seuil: AMPLEUR.seuil, secondaire: AMPLEUR.secondaire },
      calibration: rapports ? calibration(v.pourAmpleur, loi) : null,
      plis: v.plis
    });
    if (rapports && id === 'cartons-equipes') conventions = mesuresDesConventions(v.pourAmpleur);
  }
  const { placebos, bancFaux } = decider(resultats);
  // Rapportés SANS verdict (critique, constat 1) : le recentrage commun face aux constantes du moteur, et la même
  // comparaison (par championnat face au commun) sur la sous-fenêtre que les constantes n'ont jamais vue.
  let recentrageCommun = null;
  let jamaisVue = null;
  if (rapports) {
    recentrageCommun = {};
    jamaisVue = {};
    const fen = periodes.jamaisVueParLesConstantes;
    for (const stat of Object.keys(STATISTIQUES)) {
      const forme = { famille: 'championnat', stat, cle: 'ligue' };
      const v = lignesParChampionnat(donnees.stats[stat], forme, { brasA: 'moteur', brasB: 'commun' });
      recentrageCommun[stat] = { quoi: 'constantes du moteur (A) face au commun du pli (B) — rapporté, sans verdict', ...(v.lignes.length ? resumeDuJuge(jugerDesLignes(v.lignes, options)) : null), reglageDuMoteur: resumeDuReglage(reglageDuMoteur(stat)), communs: v.plis.map((p) => p.commun) };
      const w = lignesParChampionnat(donnees.stats[stat], forme);
      const dansFen = w.lignes.filter((l) => dans(l.date, fen));
      const vMoteur = v.lignes.filter((l) => dans(l.date, fen));
      jamaisVue[stat] = {
        fenetre: fen,
        parChampionnatFaceAuCommun: dansFen.length ? resumeDuJuge(jugerDesLignes(dansFen, options)) : null,
        communFaceAuxConstantes: vMoteur.length ? resumeDuJuge(jugerDesLignes(vMoteur, options)) : null
      };
    }
  }
  return {
    version: VERSION_DU_BANC,
    K,
    z: zPour(0.05, K),
    mesure: JUGE.mesure,
    periodes,
    matchs: { cartons: { A: donnees.cartons.filter((m) => m.pli === 'A').length, B: donnees.cartons.filter((m) => m.pli === 'B').length }, stats: Object.fromEntries(Object.entries(donnees.stats).map(([s, l]) => [s, { A: l.filter((m) => m.pli === 'A').length, B: l.filter((m) => m.pli === 'B').length }])) },
    variantes: resultats,
    placebos,
    bancFaux,
    utiles: resultats.filter((r) => r.utile).map((r) => r.id),
    conventions,
    recentrageCommun,
    jamaisVue
  };
}

/** Le jugement rapporté (sans les verdicts : une mesure). */
function resumeDuJuge(j) {
  return { lignes: j.lignes, gain: j.gain, gainRelatif: j.gainRelatif, fourchetteRelative: j.fourchetteRelative, zObserve: j.zObserve, verdictIndicatif: j.verdict };
}

// ======================================================= les valeurs finales (A ∪ B) et l'horizon de la preuve

/**
 * LES VALEURS FINALES, apprises sur les deux plis réunis (le même passage) : les trois bras des cartons (le complet sur
 * les matchs à arbitre connu) et leurs dispersions ; pour chaque statistique, le commun et la table par championnat.
 * La comparaison croisée juge la MÉTHODE ; ces valeurs ne choisissent rien.
 */
export function valeursFinales(donnees) {
  const tous = donnees.cartons;
  const avecArbitre = sousEnsemble(tous, FORMES['cartons-arbitre']);
  const cartons = tous.length
    ? { repere: resumeDuBras(bras(tous, 'repere')), equipes: resumeDuBras(bras(tous, 'equipes')), complet: avecArbitre.length ? resumeDuBras(bras(avecArbitre, 'complet', 'arbitre')) : null, matchs: tous.length, matchsAvecArbitre: avecArbitre.length }
    : null;
  const parChampionnat = {};
  for (const stat of Object.keys(STATISTIQUES)) {
    const l = donnees.stats[stat] ?? [];
    const a = l.length ? apprendreParChampionnat(l) : null;
    parChampionnat[stat] = a?.commun
      ? { commun: resumeDuReglage(a.commun), moteur: resumeDuReglage(reglageDuMoteur(stat)), tau2: a.tau2, championnats: Object.fromEntries([...a.parLigue].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([k, r]) => [k, resumeDuReglage(r)])) }
      : null;
  }
  return { cartons, parChampionnat };
}

/**
 * L'HORIZON DE LA PREUVE d'une variante utile (conception §5 ; critique, constat 12) : n = ⌈n_banc × ((z(K) + 0,8416) /
 * z_banc)²⌉ matchs (80 % de puissance à l'effet vu au banc), et les jours au rythme mesuré des matchs jugeables
 * (`parJour`), 60 au moins.
 */
export function horizonDeLaPreuve({ nBanc, zBanc, K = VARIANTES_DE_L_ETAPE_33.length, parJour }) {
  if (!(nBanc > 0) || !(zBanc > 0)) return null;
  const matchs = Math.ceil(nBanc * ((zPour(0.05, K) + PREUVE.zPuissance) / zBanc) ** 2);
  const jours = fini(parJour) && parJour > 0 ? Math.max(PREUVE.minJours, Math.ceil(matchs / parJour)) : null;
  return { matchs, jours, parJour: fini(parJour) ? arrondi(parJour, 3) : null };
}

// ======================================================= la note recopiée (noteDesCartons.js)

/** Les lignes du tableau de l'écran (lot 1b) et la variante de chacune (null : non mesurable au banc). */
export const LIGNES_DU_BANC = gele({
  equipes: 'cartons-equipes',
  arbitre: 'cartons-arbitre',
  fauxArbitre: 'cartons-placebo',
  corners: 'corners-championnat',
  tirs: 'tirs-championnat',
  cadres: 'cadres-championnat',
  fauxChampionnat: 'championnat-placebo',
  enjeu: null
});

/**
 * CE QUI EST RECOPIÉ dans noteDesCartons.js (CARTONS_AU_BANC), tiré de la sortie du passage unique (banc-cartons-corners.json)
 * — pur ; `sortie` : { fichier, sha1 } de la sortie recopiée telle quelle dans test/fixtures. La recopie se fait PAR SCRIPT
 * (scripts/cartons-corners.mjs --recopier), jamais à la main (test T-B7).
 */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc des cartons (format 1)');
  const parId = new Map(b.variantes.map((v) => [v.id, v]));
  const statuts = {};
  for (const [ligne, id] of Object.entries(LIGNES_DU_BANC)) {
    const v = id ? parId.get(id) : null;
    statuts[ligne] = id === null ? { variante: null, statut: 'non-mesurable' } : { variante: id, statut: v && v.utile && !b.bancFaux[v.famille] ? 'effet-mesure' : 'explication-seulement' };
  }
  const horizons = sortieDuBanc.horizons ?? {};
  return {
    format: VERSION_DU_BANC,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie: sortie ?? null,
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    convention: sortieDuBanc.convention ?? null,
    K: b.K,
    z: arrondi(b.z, 4),
    mesure: b.mesure,
    periodes: b.periodes,
    matchs: b.matchs,
    variantes: b.variantes.map((v) => ({
      id: v.id,
      famille: v.famille,
      verdict: v.verdict,
      utile: v.utile,
      raisons: v.raisons,
      matchsJuges: v.matchsJuges,
      gainRelatif: arrondi(v.gainRelatif, 6),
      fourchetteRelative: Array.isArray(v.fourchetteRelative) ? v.fourchetteRelative.map((x) => arrondi(x, 6)) : null,
      zObserve: arrondi(v.zObserve, 3),
      ampleur: { max: arrondi(v.ampleur?.max, 5), portee: v.ampleur?.portee ?? null },
      calibration: v.calibration ? { A: arrondi(v.calibration.A.ecartMoyenPoints, 3), B: arrondi(v.calibration.B.ecartMoyenPoints, 3) } : null,
      horizon: horizons[v.id] ?? null
    })),
    placebos: b.placebos,
    bancFaux: b.bancFaux,
    utiles: b.utiles,
    statuts,
    final: sortieDuBanc.final ?? null
  };
}

/**
 * Le statut d'une ligne du tableau pour l'écran : « pas-encore-mesure » tant que la note est null ; « non-mesurable »
 * pour l'enjeu ; « effet-mesure » seulement pour une variante utile d'une famille dont le banc n'est pas faux ; sinon
 * « explication-seulement ».
 */
export function statutDeLaLigne(note, ligne) {
  if (!(ligne in LIGNES_DU_BANC)) throw new Error(`statutDeLaLigne : ligne inconnue « ${ligne} »`);
  if (note === null || note === undefined) return 'pas-encore-mesure';
  if (LIGNES_DU_BANC[ligne] === null) return 'non-mesurable';
  return note.statuts?.[ligne]?.statut === 'effet-mesure' ? 'effet-mesure' : 'explication-seulement';
}

/** Le TEXTE de noteDesCartons.js pour une note (la recopie l'écrit tel quel ; le test T-B7 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDesCartons.js — CE QUE DIT LE BANC DES CARTONS ET DES RÉGLAGES PAR CHAMPIONNAT (étape 33 du plan, lot 1a).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/cartons-corners.mjs --recopier, sur la sortie du passage unique du banc), jamais',
    ' * retapé à la main : le test T-B7 (cartonsBanc.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans',
    ' * test/fixtures (banc-cartons-etape33.json, et les règles écrites avant le regard : banc-regles-etape33.md).',
    ' * CARTONS_AU_BANC : pour chaque variante, son verdict (le juge de l’étape 16, perte log des comptes, deux plis, K',
    ' * variantes déclarées), son gain et sa fourchette, son ampleur, son statut à l’écran (« effet-mesure » seulement pour',
    ' * une variante utile), l’horizon de la preuve, et les valeurs finales apprises sur les deux plis réunis.',
    ' * Hors de l’empreinte du moteur (data/cartons/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
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
    '/** Le banc des cartons et des réglages par championnat (null = pas encore mesuré). */',
    `export const CARTONS_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}
