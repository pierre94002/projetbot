/**
 * bancDesJoueurs.js — LE BANC DES CHIFFRES DES JOUEURS (étape 34 du plan, lot 1a, partie B, 03/11/2026).
 * -----------------------------------------------------------------------
 * Le calcul du banc, PUR : ni base, ni fichier, ni horloge, ni hasard (le seul hasard est le générateur à graine du juge
 * de l'étape 16 ; l'échantillon de la grille des κ est tiré par FNV-1a de la graine et de la clé, sans générateur). Les
 * observations lui sont apportées par le processus à part (joueursEnfant.js, base en lecture seule) — ou, dans les essais,
 * par des mondes tirés au hasard. Ce qu'il applique a été FIXÉ AVANT LE REGARD UNIQUE (reglagesJoueurs.js,
 * formulesDesJoueurs.js, bench/lancements.js : VARIANTES_DE_L_ETAPE_34 ; ici : les formes des variantes) :
 *   - LES DONNÉES (DonneesDuBanc) : pour chaque camp d'un match des deux plis (ni attribué, ni prolongé, joué), la
 *     composition OFFICIELLE (titulaires) avec, pour chacun, les sommes amorties du joueur et de son faux joueur, le repère
 *     de son poste dans la compétition (bras A : repère global × rapport de la compétition, critique constat 8) et ses
 *     minutes attendues — tout cela pris AVANT la journée (JoueursAuJourJ) ; le repère du bloc des remplaçants ; la base
 *     de l'équipe au jour J (λS de la base statistique de la 32, S de la formule du moteur sur les fenêtres f10, C = la
 *     moyenne de la compétition pour ce côté de l'étape 33) ; les relevés et les issues du jour J ;
 *   - CE QUI S'APPREND sur le pli d'apprentissage (jamais sur le pli jugé) : le recalage de la base (niveau par côté et
 *     pente, Poisson, Newton), q_csc, q_pen, a, κ_av, les totaux moyens T̄, les κ des bras B et des placebos (grille FINIE,
 *     en matchs moyens, sur au plus 60 000 camps), le 1/k des tirs cadrés de chaque bras (moments), le RECALAGE PAR
 *     DIXIÈMES de chaque famille et de chaque bras (critique, constat 5) ;
 *   - LE JUGE : la perte log de la loi ENTIÈRE du compte du joueur (marque, tirs cadrés, passeur ; binaire pour l'averti),
 *     une ligne par titulaire officiel identifié qui a joué et dont l'issue est relevée, bloc = le match ; deux plis réunis
 *     dans UN comparer (le juge de l'étape 16, inchangé), K = VARIANTES_DE_L_ETAPE_34.length ;
 *   - RAPPORTÉ SANS VERDICT : ampleur (sans résultat), calibration de chaque bras (brute et recalée), par poste et par
 *     couverture, la base (λ et S par déciles), les minutes, l'attribution seule, la part des penalties du premier tireur ;
 *   - UTILE : « retenu », au moins 200 matchs jugés, ampleur ≥ 0,5 point (0,3 pour le tireur), et le placebo de SA famille
 *     pas « retenu » (sinon le banc de cette famille est faux) ; « CALIBRÉ » : le modèle retenu de la famille (bras B si
 *     utile, sinon A), recalé par dixièmes, passe le critère ;
 *   - LES VALEURS FINALES, apprises sur les deux plis réunis ; l'horizon de la preuve de chaque variante utile.
 * Les rapports « dernière alignée » et « remplaçants » (d'autres versions des chiffres) ne sont PAS calculés au banc
 * (critique, constat 17, et K = 11 fixé par l'orchestrateur) : seuls leurs COMPTES (compositions) sont dans --comptes ; ils
 * seront déclarés et jugés sur l'archive d'avant-match.
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/joueurs/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { comparer, zPour } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_34 } from '../../bench/lancements.js';
import { fnv1a } from '../cartons/formulesDesCartons.js';
import { GARDIENS_JUGES, DEBUT_DES_CADRES_JUGES, SIGNAUX, GRILLE_KAPPA, BORNES_LAMBDA, NEWTON, JUGE, AMPLEUR, CALIBRE, MIN_MATCHS_UTILE, PERIODES_DU_BANC, PREUVE, PLAFOND_AVERTI, MINUTES_DU_MATCH, VERSION_JOUEURS } from './reglagesJoueurs.js';
import { relevesDUnCamp, partDesButs, perteDUneLigne, loiDesTirsCadres, apprendreLesDixiemes, recaler, calibrationDe, decilesDe, nombre } from './formulesDesJoueurs.js';

/** La forme de la sortie du banc et de la note recopiée. */
export const VERSION_DU_BANC = 1;
export const DEFINITION_RETENUE = 'joueurs-v1';
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const arrondi = (x, d = 6) => (fini(x) ? Number(x.toFixed(d)) : null);
const S = Object.freeze(Object.fromEntries(SIGNAUX.map((s, i) => [s, i])));
const NS = SIGNAUX.length;
const dans = (jour, p) => jour >= p.de && jour <= p.a;

/**
 * LES FORMES DES VARIANTES (fixées avant le regard ; noms de VARIANTES_DE_L_ETAPE_34). Pour chaque bras : le bras de
 * chaque signal employé — 'A' (repère × rapport de la compétition), 'B' (le joueur, rappelé), 'P' (le faux joueur, rappelé).
 */
export const FORMES = gele({
  'buteur-parts': { famille: 'marque', A: { np: 'A', pen: 'A' }, B: { np: 'B', pen: 'A' }, appris: { signal: 'np', bras: 'B' } },
  'buteur-tireur': { famille: 'marque', A: { np: 'B', pen: 'A' }, B: { np: 'B', pen: 'B' }, appris: { signal: 'pen', bras: 'B' }, tireur: true },
  'cadres-parts': { famille: 'cadres', A: { sot: 'A' }, B: { sot: 'B' }, appris: { signal: 'sot', bras: 'B' } },
  'averti-parts': { famille: 'averti', A: { av: 'A' }, B: { av: 'B' }, appris: { signal: 'av', bras: 'B' } },
  'passeur-parts': { famille: 'passeur', A: { xa: 'A' }, B: { xa: 'B' }, appris: { signal: 'xa', bras: 'B' } },
  'placebo-parts': { famille: 'marque', placebo: true, A: { np: 'A', pen: 'A' }, B: { np: 'P', pen: 'A' }, appris: { signal: 'np', bras: 'P' } },
  'placebo-tireur': { famille: 'marque', placebo: true, A: { np: 'B', pen: 'A' }, B: { np: 'B', pen: 'P' }, appris: { signal: 'pen', bras: 'P' }, tireur: true },
  'placebo-cadres': { famille: 'cadres', placebo: true, A: { sot: 'A' }, B: { sot: 'P' }, appris: { signal: 'sot', bras: 'P' } },
  'placebo-averti': { famille: 'averti', placebo: true, A: { av: 'A' }, B: { av: 'P' }, appris: { signal: 'av', bras: 'P' } },
  'placebo-passeur': { famille: 'passeur', placebo: true, A: { xa: 'A' }, B: { xa: 'P' }, appris: { signal: 'xa', bras: 'P' } }
});
/** Les variantes JUGÉES : toutes les déclarées sauf la fiche retenue. */
export const VARIANTES_JUGEES = Object.freeze(VARIANTES_DE_L_ETAPE_34.map((v) => v.id).filter((id) => id !== DEFINITION_RETENUE));
/** Le placebo qui garde chaque variante (un placebo « retenu » → le banc de ces variantes est faux). */
export const PLACEBO_DE = gele({ 'buteur-parts': 'placebo-parts', 'buteur-tireur': 'placebo-tireur', 'cadres-parts': 'placebo-cadres', 'averti-parts': 'placebo-averti', 'passeur-parts': 'placebo-passeur' });
/** La variante « parts » de chaque famille (le modèle retenu de l'écran prend son bras B si elle est utile). */
export const PARTS_DE_LA_FAMILLE = gele({ marque: 'buteur-parts', cadres: 'cadres-parts', averti: 'averti-parts', passeur: 'passeur-parts' });
/** Le signal de chaque famille (pour la couverture rapportée). */
const SIGNAL_DE_LA_FAMILLE = { marque: 'np', cadres: 'sot', averti: 'av', passeur: 'xa' };

// ======================================================= les données (colonnes)

/** Un tableau typé qui grandit (doublement). */
class Colonne {
  constructor(Type, capacite) {
    this.Type = Type;
    this.v = new Type(capacite);
    this.n = 0;
  }
  pousser(x) {
    if (this.n === this.v.length) {
      const w = new this.Type(this.v.length * 2);
      w.set(this.v);
      this.v = w;
    }
    this.v[this.n++] = x;
  }
}

const RELEVE = Object.freeze({ buteurs: 1, cadres: 2, cartons: 4, passes: 8, aXg: 16 });

/**
 * LES DONNÉES DU BANC, en colonnes (≈ 140 octets par titulaire). Un camp : clé du match, jour, pli ('A' : 2023-07 →
 * 2025-06, 'B' : 2025-07 → 2026-09-23), compétition, côté, base (λS, S, C), comptes de l'équipe au jour J (buts, csc,
 * buts sur penalty, buts avec passeur, tirs cadrés d'équipe, joueurs avertis, totaux des cinq signaux), relevés, le
 * repère du bloc des remplaçants, et ses titulaires (lignes). Une ligne : identifiant, poste, minutes attendues, a joué,
 * sommes du joueur et du faux joueur, repère (A) des cinq signaux, issues (buts hors csc, tirs cadrés, averti, passes).
 */
export class DonneesDuBanc {
  constructor({ camps = 1 << 12, lignes = 1 << 15 } = {}) {
    const F = (n) => new Colonne(Float64Array, n);
    const f = (n) => new Colonne(Float32Array, n);
    this.camp = {
      cle: [],
      date: [],
      league: [],
      pli: new Colonne(Uint8Array, camps),
      dom: new Colonne(Uint8Array, camps),
      lambdaS: F(camps),
      Sraw: F(camps),
      C: F(camps),
      buts: F(camps),
      csc: F(camps),
      butsPen: F(camps),
      avecPasseur: F(camps),
      cadresEq: F(camps),
      avertis: F(camps),
      T: Array.from({ length: NS }, () => F(camps)),
      releves: new Colonne(Uint8Array, camps),
      bloc: Array.from({ length: NS }, () => F(camps)),
      debut: new Colonne(Int32Array, camps),
      n: new Colonne(Uint8Array, camps)
    };
    this.ligne = {
      id: new Colonne(Int32Array, lignes),
      poste: new Colonne(Uint8Array, lignes),
      m: F(lignes),
      joue: new Colonne(Uint8Array, lignes),
      minJ: f(lignes),
      X: Array.from({ length: NS }, () => f(lignes)),
      E: Array.from({ length: NS }, () => f(lignes)),
      fX: Array.from({ length: NS }, () => f(lignes)),
      fE: Array.from({ length: NS }, () => f(lignes)),
      rep: Array.from({ length: NS }, () => F(lignes)),
      K: new Colonne(Int16Array, lignes),
      sot: new Colonne(Int16Array, lignes),
      av: new Colonne(Int8Array, lignes),
      passes: new Colonne(Int16Array, lignes),
      kPen: new Colonne(Int16Array, lignes)
    };
    this.lues = 0;
    this.miseEnRoute = 0;
  }

  get nCamps() {
    return this.camp.pli.n;
  }
  get nLignes() {
    return this.ligne.id.n;
  }

  /**
   * AJOUTE une observation de la passe (une rencontre et ce qui a été pris avant sa journée) : { r, entrees: { home,
   * away }, base: { lambda: { lambda, mu } | null, cadres: { home, away } | null, cartons: { dom, ext } | null } }. Seuls
   * les matchs des deux plis, ni attribués, ni prolongés, joués, sont gardés ; `periodes` : celles du banc. Lève sur une
   * rencontre d'après le dernier jour lu.
   */
  ajouterLObservation(o, { periodes = PERIODES_DU_BANC } = {}) {
    const r = o.r;
    this.lues += 1;
    if (r.date > periodes.dernierJourLu) throw new Error(`banc des joueurs : la rencontre ${r.matchKey} du ${r.date} est après le dernier jour lu (${periodes.dernierJourLu}) — refusée`);
    const pli = periodes.plis.find((p) => dans(r.date, p.juger))?.nom ?? null;
    if (!pli) {
      this.miseEnRoute += 1;
      return;
    }
    if (!r.joue || r.attribue || r.prolongation) return;
    for (const camp of ['home', 'away']) {
      const c = r.camps[camp];
      const e = o.entrees?.[camp];
      if (!c || !e) continue;
      const rel = relevesDUnCamp({ lignes: c.lignes ?? [], evenements: r.evenements ?? [], camp, butsDuCamp: c.buts, cadresDEquipe: c.cadresDEquipe, cartonsReleves: r.cartonsReleves });
      const K = this.camp;
      K.cle.push(r.matchKey);
      K.date.push(r.date);
      K.league.push(r.league);
      K.pli.pousser(pli === 'A' ? 1 : 2);
      K.dom.pousser(camp === 'home' ? 1 : 0);
      const lam = o.base?.lambda ? (camp === 'home' ? o.base.lambda.lambda : o.base.lambda.mu) : null;
      K.lambdaS.pousser(fini(lam) ? lam : NaN);
      const s = o.base?.cadres ? o.base.cadres[camp] : null;
      K.Sraw.pousser(fini(s) && s > 0 ? s : NaN);
      const C = o.base?.cartons ? (camp === 'home' ? o.base.cartons.dom : o.base.cartons.ext) : null;
      K.C.pousser(fini(C) ? C : NaN);
      K.buts.pousser(fini(c.buts) ? c.buts : NaN);
      K.csc.pousser(rel.equipe.csc);
      K.butsPen.pousser(rel.equipe.butsPenalty);
      K.avecPasseur.pousser(rel.equipe.butsAvecPasseur);
      K.cadresEq.pousser(fini(nombre(c.cadresDEquipe)) ? nombre(c.cadresDEquipe) : NaN);
      K.avertis.pousser(rel.totaux.av ?? NaN);
      for (let i = 0; i < NS; i++) K.T[i].pousser(rel.totaux[SIGNAUX[i]] ?? NaN);
      K.releves.pousser((rel.releves.buteurs ? RELEVE.buteurs : 0) | (rel.releves.cadres ? RELEVE.cadres : 0) | (rel.releves.cartons ? RELEVE.cartons : 0) | (rel.releves.passes ? RELEVE.passes : 0) | (rel.releves.aXg ? RELEVE.aXg : 0));
      for (let i = 0; i < NS; i++) K.bloc[i].pousser(fini(e.bloc?.repere?.[i]) ? e.bloc.repere[i] : NaN);
      K.debut.pousser(this.nLignes);
      const tit = (c.lignes ?? []).filter((l) => l.titulaire);
      if (tit.length !== e.titulaires.length) throw new Error(`banc des joueurs : ${r.matchKey} ${camp} — ${tit.length} titulaires sur la feuille, ${e.titulaires.length} entrées`);
      K.n.pousser(tit.length);
      const L = this.ligne;
      tit.forEach((l, j) => {
        const t = e.titulaires[j];
        const pj = Number.isSafeInteger(l.id) && l.id > 0 ? rel.parJoueur.get(l.id) : null;
        L.id.pousser(t.id ?? 0);
        L.poste.pousser(t.poste ?? 0);
        L.m.pousser(t.m);
        L.joue.pousser(pj ? 1 : 0);
        L.minJ.pousser(pj ? pj.minutes : 0);
        for (let i = 0; i < NS; i++) {
          L.X[i].pousser(t.X[i]);
          L.E[i].pousser(t.E[i]);
          L.fX[i].pousser(t.fX[i]);
          L.fE[i].pousser(t.fE[i]);
          L.rep[i].pousser(fini(t.repere?.[i]) ? t.repere[i] : NaN);
        }
        L.K.pousser(pj ? pj.buts : -1);
        L.sot.pousser(pj && pj.cadres !== null ? pj.cadres : -1);
        L.av.pousser(pj && pj.averti !== null ? (pj.averti ? 1 : 0) : -1);
        L.passes.pousser(pj && pj.passes !== null ? pj.passes : -1);
        L.kPen.pousser(pj ? pj.butsPenalty : -1);
      });
    }
  }

  /** Les indices des camps d'une fenêtre ('A', 'B') ou des deux (null). */
  campsDu(pli = null) {
    const out = [];
    const code = pli === 'A' ? 1 : pli === 'B' ? 2 : 0;
    for (let c = 0; c < this.nCamps; c++) if (!code || this.camp.pli.v[c] === code) out.push(c);
    return out;
  }
}

// ======================================================= les parts d'un camp

const releve = (D, c, drapeau) => (D.camp.releves.v[c] & drapeau) !== 0;

/**
 * LES PARTS d'un signal dans un camp (normalisation du §2.5, avec le bloc des remplaçants : critique, constat 2) : bras
 * 'A' (repère × rapport), 'B' (joueur rappelé, κ), 'P' (faux joueur rappelé, κ). Rend Float64Array des p_i des titulaires
 * (dans l'ordre), ou null si un repère manque (base indisponible pour ce signal).
 */
export function partsDuCamp(D, c, s, bras, kappa) {
  const K = D.camp;
  const L = D.ligne;
  const debut = K.debut.v[c];
  const n = K.n.v[c];
  const repBloc = K.bloc[s].v[c];
  if (!fini(repBloc)) return null;
  const p = new Float64Array(n);
  let somme = 0;
  let minutes = 0;
  for (let j = 0; j < n; j++) {
    const i = debut + j;
    const rep = L.rep[s].v[i];
    if (!fini(rep)) return null;
    let pi = rep;
    // κ = ∞ rend le repère (la règle de partRappelee) ; la grille du banc est finie, seul le bras A est ∞.
    if (bras === 'B' && kappa !== Infinity) pi = (L.X[s].v[i] + kappa * rep) / (L.E[s].v[i] + kappa);
    else if (bras === 'P' && kappa !== Infinity) pi = (L.fX[s].v[i] + kappa * rep) / (L.fE[s].v[i] + kappa);
    const w = pi * L.m.v[i];
    p[j] = w;
    somme += w;
    minutes += L.m.v[i];
  }
  const RT = Math.max(0, MINUTES_DU_MATCH - minutes);
  somme += repBloc * RT;
  if (!(somme > 0)) return null;
  for (let j = 0; j < n; j++) p[j] /= somme;
  return p;
}

// ======================================================= l'apprentissage d'un pli

/** Résout un système 3 × 3 (élimination de Gauss avec pivot). */
function resoudre3(H, g) {
  const A = H.map((l, i) => [...l, g[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-300) return null;
    for (let i = c + 1; i < 3; i++) {
      const f = A[i][c] / A[c][c];
      for (let k = c; k <= 3; k++) A[i][k] -= f * A[c][k];
    }
  }
  const d = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = A[i][3];
    for (let k = i + 1; k < 3; k++) s -= A[i][k] * d[k];
    d[i] = s / A[i][i];
  }
  return d;
}

/**
 * LE RECALAGE de la base (niveau par côté et pente) : régression de Poisson y ~ e^(c_côté + β·ln base), Newton (30 pas
 * au plus, arrêt sous 1e-10), départ c = 0, β = 1. `obs` : [{ dom (booléen), base, y }]. Rend { cDom, cExt, beta, n }.
 */
export function recalage(obs, { iterations = NEWTON.iterations, arret = NEWTON.arret } = {}) {
  let t = [0, 0, 1];
  const lignes = obs.filter((o) => fini(o.base) && o.base > 0 && fini(o.y));
  if (!lignes.length) return { cDom: 0, cExt: 0, beta: 1, n: 0 };
  for (let it = 0; it < iterations; it++) {
    const g = [0, 0, 0];
    const H = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (const o of lignes) {
      const x = [o.dom ? 1 : 0, o.dom ? 0 : 1, Math.log(o.base)];
      const mu = Math.exp(t[0] * x[0] + t[1] * x[1] + t[2] * x[2]);
      for (let a = 0; a < 3; a++) {
        g[a] += (o.y - mu) * x[a];
        for (let b = 0; b < 3; b++) H[a][b] += mu * x[a] * x[b];
      }
    }
    const d = resoudre3(H, g);
    if (!d) break;
    t = t.map((v, i) => v + d[i]);
    if (Math.max(...d.map(Math.abs)) < arret) break;
  }
  return { cDom: t[0], cExt: t[1], beta: t[2], n: lignes.length };
}

/** La base recalée d'un camp (λ borné, S, C tel quel). */
export const baseRecalee = (r, dom, base, bornes = null) => {
  if (!fini(base) || !(base > 0)) return NaN;
  const v = Math.exp((dom ? r.cDom : r.cExt) + r.beta * Math.log(base));
  return bornes ? Math.min(bornes[1], Math.max(bornes[0], v)) : v;
};

/** L'échantillon semé des camps pour la grille des κ : au plus `n` camps, les plus petits FNV-1a(« graine:clé:côté »). */
export function echantillon(D, camps, n = JUGE.echantillonKappa, graine = JUGE.graine) {
  if (camps.length <= n) return camps;
  return camps
    .map((c) => [fnv1a(`${graine}:${D.camp.cle[c]}:${D.camp.dom.v[c]}`), c])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, n)
    .map((x) => x[1])
    .sort((a, b) => a - b);
}

/**
 * LES LIGNES D'UNE FAMILLE dans un camp, sous une configuration de bras : pour chaque titulaire identifié qui a joué et
 * dont l'issue est relevée, { i (indice de ligne), P (l'issue binaire), perte, mu? }. `p` : les paramètres appris du pli
 * (recalages, q, a, κ_av, κ, 1/k). `invK` : imposé (sinon celui de `p`). Rend null si la base manque.
 */
export function lignesDuCamp(D, c, famille, conf, p, { invK = null, avecPerte = true } = {}) {
  const K = D.camp;
  const L = D.ligne;
  const debut = K.debut.v[c];
  const n = K.n.v[c];
  const dom = K.dom.v[c] === 1;
  const out = [];
  const kap = (s, bras) => (bras === 'A' ? Infinity : p.kappa[`${s}:${bras}`]);
  if (famille === 'marque' || famille === 'passeur') {
    if (famille === 'marque' && !releve(D, c, RELEVE.buteurs)) return out;
    if (famille === 'passeur' && !releve(D, c, RELEVE.passes)) return out;
    const lam = baseRecalee(p.recalageLambda, dom, K.lambdaS.v[c], BORNES_LAMBDA);
    if (!fini(lam)) return null;
    if (famille === 'marque') {
      const pNp = partsDuCamp(D, c, S.np, conf.np, kap('np', conf.np));
      const t = partsDuCamp(D, c, S.pen, conf.pen, kap('pen', conf.pen));
      if (!pNp || !t) return null;
      for (let j = 0; j < n; j++) {
        const i = debut + j;
        if (!L.joue.v[i] || !(L.id.v[i] > 0) || (!GARDIENS_JUGES && L.poste.v[i] === 1) || L.K.v[i] < 0) continue;
        const g = partDesButs(pNp[j], t[j], p.qCsc, p.qPen);
        const lg = lam * g;
        out.push({ i, P: 1 - Math.exp(-lg), y: L.K.v[i] >= 1 ? 1 : 0, perte: avecPerte ? perteDUneLigne('marque', { lambdaG: lg, k: L.K.v[i] }) : null, g, lam });
      }
    } else {
      const px = partsDuCamp(D, c, S.xa, conf.xa, kap('xa', conf.xa));
      if (!px) return null;
      for (let j = 0; j < n; j++) {
        const i = debut + j;
        if (!L.joue.v[i] || !(L.id.v[i] > 0) || (!GARDIENS_JUGES && L.poste.v[i] === 1) || L.passes.v[i] < 0) continue;
        const moy = lam * p.a * px[j];
        out.push({ i, P: 1 - Math.exp(-moy), y: L.passes.v[i] >= 1 ? 1 : 0, perte: avecPerte ? perteDUneLigne('passeur', { moyenne: moy, k: L.passes.v[i] }) : null });
      }
    }
    return out;
  }
  if (famille === 'cadres') {
    if (!releve(D, c, RELEVE.cadres)) return out;
    const St = baseRecalee(p.recalageCadres, dom, K.Sraw.v[c]);
    if (!fini(St)) return null;
    const ps = partsDuCamp(D, c, S.sot, conf.sot, kap('sot', conf.sot));
    if (!ps) return null;
    const ik = invK ?? p.invK[`sot:${conf.sot}`] ?? 0;
    for (let j = 0; j < n; j++) {
      const i = debut + j;
      if (!L.joue.v[i] || !(L.id.v[i] > 0) || (!GARDIENS_JUGES && L.poste.v[i] === 1) || L.sot.v[i] < 0) continue;
      const mu = St * ps[j];
      const loi = loiDesTirsCadres(mu, ik, 1);
      out.push({ i, P: Math.max(0, 1 - loi.pmf[0]), y: L.sot.v[i] >= 1 ? 1 : 0, perte: avecPerte ? perteDUneLigne('cadres', { x: L.sot.v[i], mu, invK: ik }) : null, mu, x: L.sot.v[i] });
    }
    return out;
  }
  if (famille === 'averti') {
    if (!releve(D, c, RELEVE.cartons)) return out;
    const C = K.C.v[c];
    if (!fini(C)) return null;
    const pa = partsDuCamp(D, c, S.av, conf.av, kap('av', conf.av));
    if (!pa) return null;
    for (let j = 0; j < n; j++) {
      const i = debut + j;
      if (!L.joue.v[i] || !(L.id.v[i] > 0) || (!GARDIENS_JUGES && L.poste.v[i] === 1) || L.av.v[i] < 0) continue;
      const P = Math.min(PLAFOND_AVERTI, Math.max(0, p.kAv * C * pa[j]));
      out.push({ i, P, y: L.av.v[i], perte: avecPerte ? perteDUneLigne('averti', { p: P, averti: L.av.v[i] === 1 }) : null });
    }
    return out;
  }
  throw new Error(`lignesDuCamp : famille inconnue « ${famille} »`);
}

/** Le 1/k par les moments autour des μ : Σ[(x − μ)² − μ] / Σ μ² (0 sans matière). */
export function invKParLesMoments(points) {
  let num = 0;
  let den = 0;
  for (const q of points) {
    num += (q.x - q.mu) ** 2 - q.mu;
    den += q.mu * q.mu;
  }
  return den > 0 ? num / den : 0;
}

/** La perte totale d'une famille sur des camps (les camps sans base sont sautés). */
function perteTotale(D, camps, famille, conf, p, options) {
  let s = 0;
  let n = 0;
  for (const c of camps) {
    const l = lignesDuCamp(D, c, famille, conf, p, options);
    if (!l) continue;
    for (const x of l) {
      s += x.perte;
      n += 1;
    }
  }
  return { s, n };
}

/** Les points (μ, x) des tirs cadrés d'une configuration, pour les moments. */
function pointsDesCadres(D, camps, conf, p) {
  const pts = [];
  for (const c of camps) {
    const l = lignesDuCamp(D, c, 'cadres', conf, p, { invK: 0, avecPerte: false });
    if (l) for (const x of l) pts.push({ mu: x.mu, x: x.x });
  }
  return pts;
}

/**
 * APPRENDRE SUR UN PLI (les camps `camps`, jamais ceux du pli jugé) : recalages, q_csc, q_pen, a, κ_av, T̄, κ des bras B
 * et P (grille finie, en matchs moyens) et 1/k des tirs cadrés de chaque bras, recalage par dixièmes de chaque variante
 * et de chaque bras. Pur. `variantes` : celles dont il faut les tables.
 */
export function apprendreLePli(D, camps, { variantes = VARIANTES_JUGEES, grille = GRILLE_KAPPA, n = JUGE.echantillonKappa, graine = JUGE.graine } = {}) {
  const K = D.camp;
  // 1. Les recalages de la base.
  const obsL = [];
  const obsS = [];
  for (const c of camps) {
    obsL.push({ dom: K.dom.v[c] === 1, base: K.lambdaS.v[c], y: K.buts.v[c] });
    obsS.push({ dom: K.dom.v[c] === 1, base: K.Sraw.v[c], y: K.cadresEq.v[c] });
  }
  const recalageLambda = recalage(obsL);
  const recalageCadres = recalage(obsS);
  // 2. Les parts de l'équipe : csc, penalties, passes décisives, joueurs avertis ; les totaux moyens.
  let buts = 0;
  let csc = 0;
  let pen = 0;
  let butsP = 0;
  let passes = 0;
  let avertis = 0;
  let cartons = 0;
  const T = new Array(NS).fill(0);
  const nT = new Array(NS).fill(0);
  for (const c of camps) {
    if (releve(D, c, RELEVE.buteurs) && fini(K.buts.v[c])) {
      buts += K.buts.v[c];
      csc += K.csc.v[c];
      pen += K.butsPen.v[c];
    }
    if (releve(D, c, RELEVE.passes) && fini(K.buts.v[c])) {
      butsP += K.buts.v[c];
      passes += K.avecPasseur.v[c];
    }
    if (releve(D, c, RELEVE.cartons) && fini(K.C.v[c]) && fini(K.avertis.v[c])) {
      avertis += K.avertis.v[c];
      cartons += K.C.v[c];
    }
    for (let i = 0; i < NS; i++) {
      if (fini(K.T[i].v[c])) {
        T[i] += K.T[i].v[c];
        nT[i] += 1;
      }
    }
  }
  const p = {
    recalageLambda,
    recalageCadres,
    qCsc: buts > 0 ? csc / buts : 0,
    qPen: buts > 0 ? pen / buts : 0,
    a: butsP > 0 ? passes / butsP : 0,
    kAv: cartons > 0 ? avertis / cartons : 0,
    Tbar: Object.fromEntries(SIGNAUX.map((s, i) => [s, nT[i] ? T[i] / nT[i] : 0])),
    kappa: {},
    kappaMatchs: {},
    invK: {},
    pertesDeLaGrille: {},
    camps: camps.length
  };
  // 3. La grille des κ, sur l'échantillon semé du pli.
  const ech = echantillon(D, camps, n, graine);
  p.echantillon = ech.length;
  const chercher = (signal, bras, famille, confDe) => {
    const essais = [];
    let meilleur = null;
    for (const km of grille) {
      const k = km * (p.Tbar[signal] || 1);
      p.kappa[`${signal}:${bras}`] = k;
      let opt = {};
      if (famille === 'cadres') {
        const ik = invKParLesMoments(pointsDesCadres(D, ech, confDe(), p));
        p.invK[`sot:${bras}`] = ik;
        opt = { invK: ik };
      }
      const t = perteTotale(D, ech, famille, confDe(), p, opt);
      essais.push({ kappaMatchs: km, perte: t.n ? t.s / t.n : null, lignes: t.n, ...(famille === 'cadres' ? { invK: opt.invK } : {}) });
      if (t.n && (meilleur === null || t.s < meilleur.s)) meilleur = { km, k, s: t.s, invK: opt.invK };
    }
    const choisi = meilleur ?? { km: grille[grille.length - 1], k: grille[grille.length - 1] * (p.Tbar[signal] || 1), invK: 0 };
    p.kappa[`${signal}:${bras}`] = choisi.k;
    p.kappaMatchs[`${signal}:${bras}`] = choisi.km;
    if (famille === 'cadres') p.invK[`sot:${bras}`] = choisi.invK ?? 0;
    p.pertesDeLaGrille[`${signal}:${bras}`] = essais;
  };
  // 1/k du bras A (repère) des tirs cadrés, par les moments.
  p.invK['sot:A'] = invKParLesMoments(pointsDesCadres(D, camps, { sot: 'A' }, p));
  chercher('np', 'B', 'marque', () => ({ np: 'B', pen: 'A' }));
  chercher('pen', 'B', 'marque', () => ({ np: 'B', pen: 'B' }));
  chercher('np', 'P', 'marque', () => ({ np: 'P', pen: 'A' }));
  chercher('pen', 'P', 'marque', () => ({ np: 'B', pen: 'P' }));
  chercher('sot', 'B', 'cadres', () => ({ sot: 'B' }));
  chercher('sot', 'P', 'cadres', () => ({ sot: 'P' }));
  chercher('av', 'B', 'averti', () => ({ av: 'B' }));
  chercher('av', 'P', 'averti', () => ({ av: 'P' }));
  chercher('xa', 'B', 'passeur', () => ({ xa: 'B' }));
  chercher('xa', 'P', 'passeur', () => ({ xa: 'P' }));
  // 4. Le recalage par dixièmes de chaque variante et de chaque bras, sur les prédictions du pli d'apprentissage.
  p.dixiemes = {};
  for (const id of variantes) {
    const forme = FORMES[id];
    for (const bras of ['A', 'B']) {
      const pts = [];
      for (const c of camps) {
        const l = lignesDuCamp(D, c, forme.famille, forme[bras], p, { avecPerte: false });
        if (l) for (const x of l) pts.push([x.P, x.y]);
      }
      p.dixiemes[`${id}:${bras}`] = pts.length ? apprendreLesDixiemes(pts) : null;
    }
  }
  return p;
}

// ======================================================= le juge

/** Le juge de l'étape 16 sur des lignes (options du banc) : verdict, gain, z observé. */
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

/** Le paramètre appris de l'AUTRE pli pour un camp jugé. */
const pliJuge = (D, c) => (D.camp.pli.v[c] === 1 ? 'A' : 'B');

/**
 * LES LIGNES D'UNE VARIANTE sur les deux plis : chaque camp jugé avec les paramètres appris sur l'AUTRE pli
 * (`parametres` : { A: appris pour juger A, B: appris pour juger B }). Rend { lignes: [{ bloc, date, a, b }], PA, PB, y,
 * PAr, PBr (recalés), postes, couverture, matchs }.
 */
export function lignesDUneVariante(D, id, parametres) {
  const forme = FORMES[id];
  if (!forme) throw new Error(`banc des joueurs : la variante « ${id} » n'a pas de forme — refusée`);
  const lignes = [];
  const PA = [];
  const PB = [];
  const PAr = [];
  const PBr = [];
  const y = [];
  const postes = [];
  const couverture = [];
  const matchs = new Set();
  for (let c = 0; c < D.nCamps; c++) {
    // Les tirs cadrés d'un pli ne sont jugés qu'à partir de DEBUT_DES_CADRES_JUGES (A : 01/01/2024, la base S naissante).
    if (forme.famille === 'cadres' && D.camp.date[c] < DEBUT_DES_CADRES_JUGES[pliJuge(D, c)]) continue;
    const p = parametres[pliJuge(D, c)];
    const a = lignesDuCamp(D, c, forme.famille, forme.A, p);
    const b = lignesDuCamp(D, c, forme.famille, forme.B, p);
    if (!a || !b) continue;
    if (a.length !== b.length) throw new Error(`banc des joueurs : ${id}, camp ${D.camp.cle[c]} — lignes différentes entre les bras`);
    const tA = p.dixiemes?.[`${id}:A`] ?? null;
    const tB = p.dixiemes?.[`${id}:B`] ?? null;
    for (let k = 0; k < a.length; k++) {
      lignes.push({ bloc: D.camp.cle[c], date: D.camp.date[c], a: a[k].perte, b: b[k].perte });
      PA.push(a[k].P);
      PB.push(b[k].P);
      PAr.push(recaler(tA, a[k].P));
      PBr.push(recaler(tB, b[k].P));
      y.push(a[k].y);
      postes.push(D.ligne.poste.v[a[k].i]);
      couverture.push(releve(D, c, RELEVE.aXg) ? 1 : 0);
      matchs.add(D.camp.cle[c]);
    }
  }
  return { lignes, PA, PB, PAr, PBr, y, postes, couverture, matchs: matchs.size };
}

/** L'ampleur d'une variante : la moyenne de |P_B − P_A| de l'issue binaire, SANS aucun résultat. */
export function ampleur(PA, PB) {
  if (!PA.length) return null;
  let s = 0;
  for (let k = 0; k < PA.length; k++) s += Math.abs(PB[k] - PA[k]);
  return s / PA.length;
}

/** La calibration rapportée d'une liste (annoncé, réalisé). */
const calibrationDesPoints = (P, y) => {
  const c = calibrationDe(P.map((x, k) => [x, y[k]]));
  return { ecartMoyenPoints: arrondi(100 * c.ecartMoyen, 4), pirePoints: arrondi(100 * c.pire, 4), calibre: c.calibre, horsSeuil: c.horsSeuil, deciles: c.deciles.map((d) => ({ n: d.n, annonce: arrondi(d.annonce, 5), realise: arrondi(d.realise, 5) })) };
};

/** Le gain par sous-groupe (rapporté, sans verdict) : perte moyenne A, B et leur écart. */
function parGroupe(lignes, cles) {
  const g = new Map();
  lignes.forEach((l, k) => {
    const x = g.get(cles[k]) ?? { n: 0, a: 0, b: 0 };
    x.n += 1;
    x.a += l.a;
    x.b += l.b;
    g.set(cles[k], x);
  });
  return Object.fromEntries([...g].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, x]) => [k, { lignes: x.n, perteA: arrondi(x.a / x.n), perteB: arrondi(x.b / x.n), gainRelatif: arrondi((x.a - x.b) / x.a) }]));
}

/**
 * « UTILE » et « BANC FAUX » (fixés avant le regard) : pour chaque variante jugée — utile si « retenu », au moins 200
 * matchs jugés, ampleur ≥ son seuil, et son placebo pas « retenu ». Pose `utile` et `raisons` ; rend { placebos, bancFaux }.
 */
export function decider(resultats) {
  const verdictDe = (id) => resultats.find((r) => r.id === id)?.verdict ?? null;
  const placebos = Object.fromEntries(Object.values(PLACEBO_DE).map((id) => [id, verdictDe(id)]));
  const bancFaux = Object.fromEntries(Object.entries(PLACEBO_DE).map(([id, pl]) => [id, verdictDe(pl) === 'retenu']));
  for (const r of resultats) {
    if (r.placebo) {
      r.utile = false;
      r.raisons = r.verdict === 'retenu' ? ['le faux joueur est « retenu » : le banc de sa variante est faux'] : [];
      continue;
    }
    const seuil = FORMES[r.id].tireur ? AMPLEUR.tireur : AMPLEUR.seuil;
    const raisons = [];
    if (r.verdict !== 'retenu') raisons.push(`verdict « ${r.verdict} »`);
    if (!(r.matchsJuges >= MIN_MATCHS_UTILE)) raisons.push(`${r.matchsJuges} matchs jugés (au moins ${MIN_MATCHS_UTILE})`);
    if (!(fini(r.ampleur) && r.ampleur >= seuil)) raisons.push(`ampleur sous ${seuil === AMPLEUR.tireur ? '0,3' : '0,5'} point`);
    if (bancFaux[r.id]) raisons.push(`son faux joueur (${PLACEBO_DE[r.id]}) est « retenu » : le banc de cette variante est faux`);
    r.utile = raisons.length === 0;
    r.raisons = raisons;
  }
  return { placebos, bancFaux };
}

const PAS_ASSEZ = (n) => ({ verdict: 'pas-assez-de-matchs', raison: `${n} ligne(s)`, lignes: n, blocs: 0, perteA: null, perteB: null, gain: null, ecartType: null, fourchette: null, gainRelatif: null, fourchetteRelative: null, zObserve: null, p: null });

/**
 * LE BANC : les paramètres de chaque pli (appris sur l'autre), puis pour chaque variante jugée ses lignes des deux plis
 * dans UN jugement. `K` doit valoir VARIANTES_DE_L_ETAPE_34.length ; une variante non déclarée ou sans forme fait lever.
 * Rend { version, K, z, periodes, camps, variantes, placebos, bancFaux, utiles, modeleRetenu, calibre, rapports,
 * parametres }.
 */
export function jugerLesVariantes(D, { periodes = PERIODES_DU_BANC, variantes = VARIANTES_JUGEES, K = VARIANTES_DE_L_ETAPE_34.length, declarees = VARIANTES_DE_L_ETAPE_34, tirages = JUGE.tirages, graine = JUGE.graine, minBlocs = JUGE.minBlocs, n = JUGE.echantillonKappa, grille = GRILLE_KAPPA } = {}) {
  const ids = declarees.map((v) => v.id);
  if (K !== ids.length) throw new Error(`banc des joueurs : K (${K}) doit valoir le nombre de variantes déclarées (${ids.length}, VARIANTES_DE_L_ETAPE_34)`);
  for (const id of variantes) {
    if (!ids.includes(id)) throw new Error(`banc des joueurs : la variante « ${id} » n'est pas déclarée (VARIANTES_DE_L_ETAPE_34) — refusée`);
    if (!FORMES[id]) throw new Error(`banc des joueurs : la variante « ${id} » n'a pas de forme — refusée`);
  }
  for (let c = 0; c < D.nCamps; c++) if (D.camp.date[c] > periodes.dernierJourLu) throw new Error(`banc des joueurs : le camp ${D.camp.cle[c]} du ${D.camp.date[c]} est après le dernier jour lu — refusé`);
  // Chaque pli jugé reçoit les paramètres appris sur l'AUTRE fenêtre (critique de la 33, constat 1 : jamais sur le pli jugé).
  const parametres = {};
  for (const pli of periodes.plis) {
    const autre = pli.nom === 'A' ? 'B' : 'A';
    parametres[pli.nom] = apprendreLePli(D, D.campsDu(autre), { variantes, grille, n, graine });
    parametres[pli.nom].apprisSur = autre;
  }
  const options = { K, tirages, graine, minBlocs };
  const resultats = [];
  const pourCalibre = {};
  for (const id of variantes) {
    const forme = FORMES[id];
    const v = lignesDUneVariante(D, id, parametres);
    const juge = v.lignes.length ? jugerDesLignes(v.lignes, options) : PAS_ASSEZ(0);
    const r = {
      id,
      famille: forme.famille,
      placebo: Boolean(forme.placebo),
      matchsJuges: v.matchs,
      ...juge,
      ampleur: ampleur(v.PA, v.PB),
      calibration: v.lignes.length ? { A: calibrationDesPoints(v.PA, v.y), B: calibrationDesPoints(v.PB, v.y), Arecale: calibrationDesPoints(v.PAr, v.y), Brecale: calibrationDesPoints(v.PBr, v.y) } : null,
      parPoste: parGroupe(v.lignes, v.postes),
      parCouverture: forme.famille === 'marque' || forme.famille === 'passeur' ? parGroupe(v.lignes, v.couverture.map((x) => (x ? 'xG des joueurs' : 'buts ou passes seuls'))) : null
    };
    resultats.push(r);
    if (!forme.placebo && PARTS_DE_LA_FAMILLE[forme.famille] === id) pourCalibre[forme.famille] = v;
  }
  const { placebos, bancFaux } = decider(resultats);
  // Le modèle retenu de chaque famille (bras B si sa variante « parts » est utile, sinon A) et « calibré » (recalé).
  const modeleRetenu = {};
  const calibre = {};
  for (const [famille, id] of Object.entries(PARTS_DE_LA_FAMILLE)) {
    const r = resultats.find((x) => x.id === id);
    const bras = r?.utile ? 'B' : 'A';
    modeleRetenu[famille] = { variante: id, bras, tireur: famille === 'marque' ? Boolean(resultats.find((x) => x.id === 'buteur-tireur')?.utile) : null };
    const v = pourCalibre[famille];
    calibre[famille] = v && v.lignes.length ? { bras, exige: CALIBRE.exige.includes(famille), ...calibrationDesPoints(bras === 'B' ? v.PBr : v.PAr, v.y) } : null;
  }
  return {
    version: VERSION_DU_BANC,
    K,
    z: zPour(0.05, K),
    periodes,
    camps: { A: D.campsDu('A').length, B: D.campsDu('B').length, lignesDeTitulaires: D.nLignes },
    variantes: resultats,
    placebos,
    bancFaux,
    utiles: resultats.filter((r) => r.utile).map((r) => r.id),
    modeleRetenu,
    calibre,
    rapports: rapportsDuBanc(D, parametres),
    parametres: Object.fromEntries(Object.entries(parametres).map(([k, p]) => [k, resumeDesParametres(p)]))
  };
}

// ======================================================= les rapports (sans verdict)

/**
 * LES RAPPORTS SANS VERDICT (ils ne décident de rien ; les retirer laisse les verdicts identiques, T-B14) : la base (λ :
 * P(l'équipe marque) par déciles ; S : moyenne annoncée face au réalisé par déciles), les minutes (écart moyen absolu
 * par poste), l'attribution seule (bras B de buteur-parts : P(i marque | n buts de l'équipe) = 1 − (1 − g)^n, déciles),
 * la part des buts sur penalty marqués par le titulaire qui a la plus grande part des penalties (bras B de buteur-tireur).
 */
export function rapportsDuBanc(D, parametres) {
  const K = D.camp;
  const L = D.ligne;
  const lam = [];
  const sot = [];
  const minutes = new Map();
  const attribution = [];
  let pensTotal = 0;
  let pensTireur = 0;
  for (let c = 0; c < D.nCamps; c++) {
    const p = parametres[pliJuge(D, c)];
    const dom = K.dom.v[c] === 1;
    const l = baseRecalee(p.recalageLambda, dom, K.lambdaS.v[c], BORNES_LAMBDA);
    if (fini(l) && fini(K.buts.v[c])) lam.push([1 - Math.exp(-l), K.buts.v[c] >= 1 ? 1 : 0]);
    const s = baseRecalee(p.recalageCadres, dom, K.Sraw.v[c]);
    if (fini(s) && fini(K.cadresEq.v[c])) sot.push([s, K.cadresEq.v[c]]);
    const debut = K.debut.v[c];
    for (let j = 0; j < K.n.v[c]; j++) {
      const i = debut + j;
      if (!L.joue.v[i]) continue;
      const x = minutes.get(L.poste.v[i]) ?? { n: 0, s: 0, ecart: 0 };
      x.n += 1;
      x.s += L.m.v[i];
      x.ecart += Math.abs(L.m.v[i] - L.minJ.v[i]);
      minutes.set(L.poste.v[i], x);
    }
    if (releve(D, c, RELEVE.buteurs) && fini(K.buts.v[c]) && fini(l)) {
      const pNp = partsDuCamp(D, c, S.np, 'B', p.kappa['np:B']);
      const t = partsDuCamp(D, c, S.pen, 'A', Infinity);
      if (pNp && t) {
        for (let j = 0; j < K.n.v[c]; j++) {
          const i = debut + j;
          if (!L.joue.v[i] || !(L.id.v[i] > 0) || (!GARDIENS_JUGES && L.poste.v[i] === 1) || L.K.v[i] < 0) continue;
          const g = partDesButs(pNp[j], t[j], p.qCsc, p.qPen);
          attribution.push([1 - (1 - g) ** K.buts.v[c], L.K.v[i] >= 1 ? 1 : 0]);
        }
      }
      if (K.butsPen.v[c] > 0) {
        const tB = partsDuCamp(D, c, S.pen, 'B', p.kappa['pen:B']);
        if (tB) {
          let jmax = -1;
          for (let j = 0; j < K.n.v[c]; j++) if (jmax < 0 || tB[j] > tB[jmax]) jmax = j;
          pensTotal += K.butsPen.v[c];
          if (jmax >= 0 && L.kPen.v[debut + jmax] > 0) pensTireur += L.kPen.v[debut + jmax];
        }
      }
    }
  }
  const decilesMoyennes = (pts) => decilesDe(pts).map((d) => ({ n: d.n, annonce: arrondi(d.annonce, 4), realise: arrondi(d.realise, 4) }));
  return {
    quoi: 'rapporté, sans verdict',
    baseButs: lam.length ? calibrationDesPoints(lam.map((x) => x[0]), lam.map((x) => x[1])) : null,
    baseCadres: sot.length ? decilesMoyennes(sot) : null,
    minutes: Object.fromEntries([...minutes].sort((a, b) => a[0] - b[0]).map(([k, x]) => [k, { titulairesQuiOntJoue: x.n, minutesAttenduesMoyennes: arrondi(x.s / x.n, 2), ecartMoyenAbsolu: arrondi(x.ecart / x.n, 2) }])),
    attributionSeule: attribution.length ? calibrationDesPoints(attribution.map((x) => x[0]), attribution.map((x) => x[1])) : null,
    penaltiesDuPremierTireur: { butsSurPenalty: pensTotal, parLePremierTireur: pensTireur, part: pensTotal ? arrondi(pensTireur / pensTotal, 4) : null }
  };
}

/** Les paramètres d'un pli, lisibles (arrondis ; sans les tables d'essais de la grille, gardées à part). */
export function resumeDesParametres(p) {
  return {
    apprisSur: p.apprisSur ?? null,
    camps: p.camps,
    echantillon: p.echantillon,
    recalageLambda: { cDom: arrondi(p.recalageLambda.cDom), cExt: arrondi(p.recalageLambda.cExt), beta: arrondi(p.recalageLambda.beta), n: p.recalageLambda.n },
    recalageCadres: { cDom: arrondi(p.recalageCadres.cDom), cExt: arrondi(p.recalageCadres.cExt), beta: arrondi(p.recalageCadres.beta), n: p.recalageCadres.n },
    qCsc: arrondi(p.qCsc),
    qPen: arrondi(p.qPen),
    a: arrondi(p.a),
    kAv: arrondi(p.kAv),
    Tbar: Object.fromEntries(Object.entries(p.Tbar).map(([k, v]) => [k, arrondi(v)])),
    kappaMatchs: { ...p.kappaMatchs },
    invK: Object.fromEntries(Object.entries(p.invK).map(([k, v]) => [k, arrondi(v)])),
    pertesDeLaGrille: Object.fromEntries(Object.entries(p.pertesDeLaGrille).map(([k, l]) => [k, l.map((x) => ({ kappaMatchs: x.kappaMatchs, perte: arrondi(x.perte, 8), lignes: x.lignes }))])),
    dixiemes: Object.fromEntries(Object.entries(p.dixiemes ?? {}).map(([k, t]) => [k, t ? { centres: t.centres.map((x) => arrondi(x, 6)), frequences: t.frequences.map((x) => arrondi(x, 6)), n: t.n } : null]))
  };
}

// ======================================================= les valeurs finales (A ∪ B) et l'horizon de la preuve

/** LES VALEURS FINALES, apprises sur les deux plis réunis (le même passage) ; elles ne choisissent rien. */
export function valeursFinales(D, options = {}) {
  const p = apprendreLePli(D, D.campsDu(null), options);
  p.apprisSur = 'A ∪ B';
  return resumeDesParametres(p);
}

/** L'HORIZON DE LA PREUVE d'une variante utile : ⌈n_banc × ((z(K) + 0,8416) / z_banc)²⌉ matchs, 60 jours au moins au rythme `parJour`. */
export function horizonDeLaPreuve({ nBanc, zBanc, K = VARIANTES_DE_L_ETAPE_34.length, parJour }) {
  if (!(nBanc > 0) || !(zBanc > 0)) return null;
  const matchs = Math.ceil(nBanc * ((zPour(0.05, K) + PREUVE.zPuissance) / zBanc) ** 2);
  const jours = fini(parJour) && parJour > 0 ? Math.max(PREUVE.minJours, Math.ceil(matchs / parJour)) : null;
  return { matchs, jours, parJour: fini(parJour) ? arrondi(parJour, 3) : null };
}

// ======================================================= la note recopiée (noteDesJoueurs.js)

/** Les lignes du tableau de l'écran (lot 1b) et la variante de chacune. */
export const LIGNES_DU_BANC = gele({
  buteurs: 'buteur-parts',
  tireur: 'buteur-tireur',
  cadres: 'cadres-parts',
  averti: 'averti-parts',
  passeur: 'passeur-parts',
  fauxButeurs: 'placebo-parts',
  fauxTireurs: 'placebo-tireur',
  fauxCadres: 'placebo-cadres',
  fauxAvertis: 'placebo-averti',
  fauxPasseurs: 'placebo-passeur'
});

/**
 * CE QUI EST RECOPIÉ dans noteDesJoueurs.js (JOUEURS_AU_BANC), tiré de la sortie du passage unique — pur. La recopie se
 * fait PAR SCRIPT (scripts/joueurs-a-blanc.mjs --recopier), jamais à la main (test T-B6).
 */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc des joueurs (format 1)');
  const statuts = {};
  for (const [famille, m] of Object.entries(b.modeleRetenu)) statuts[famille] = { variante: m.variante, statut: m.bras === 'B' ? 'mesure' : 'poste', tireur: m.tireur, calibre: b.calibre[famille] ? { ecartMoyenPoints: b.calibre[famille].ecartMoyenPoints, calibre: b.calibre[famille].calibre } : null };
  return {
    format: VERSION_DU_BANC,
    version: VERSION_JOUEURS,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie: sortie ?? null,
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    cartons: sortieDuBanc.cartons ?? null,
    K: b.K,
    z: arrondi(b.z, 4),
    periodes: b.periodes,
    camps: b.camps,
    variantes: b.variantes.map((v) => ({
      id: v.id,
      famille: v.famille,
      placebo: v.placebo,
      verdict: v.verdict,
      utile: v.utile,
      raisons: v.raisons,
      matchsJuges: v.matchsJuges,
      gainRelatif: arrondi(v.gainRelatif, 6),
      fourchetteRelative: Array.isArray(v.fourchetteRelative) ? v.fourchetteRelative.map((x) => arrondi(x, 6)) : null,
      zObserve: arrondi(v.zObserve, 3),
      ampleurPoints: arrondi(100 * v.ampleur, 4),
      calibration: v.calibration ? { A: v.calibration.Arecale.ecartMoyenPoints, B: v.calibration.Brecale.ecartMoyenPoints } : null,
      horizon: sortieDuBanc.horizons?.[v.id] ?? null
    })),
    placebos: b.placebos,
    bancFaux: b.bancFaux,
    utiles: b.utiles,
    statuts,
    final: sortieDuBanc.final ?? null
  };
}

/** Le TEXTE de noteDesJoueurs.js pour une note (la recopie l'écrit tel quel ; le test T-B6 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDesJoueurs.js — CE QUE DIT LE BANC DES CHIFFRES DES JOUEURS (étape 34 du plan, lot 1a).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/joueurs-a-blanc.mjs --recopier, sur la sortie du passage unique du banc), jamais',
    ' * retapé à la main : le test T-B6 (joueursBanc.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans',
    ' * test/fixtures (banc-joueurs-etape34.json, et les règles écrites avant le regard : banc-regles-etape34.md).',
    ' * JOUEURS_AU_BANC : pour chaque variante, son verdict (le juge de l’étape 16, deux plis, K variantes déclarées), son',
    ' * gain et sa fourchette, son ampleur, le statut de chaque famille à l’écran (« mesure » seulement pour une variante',
    ' * utile, sinon « poste »), sa calibration recalée, l’horizon de la preuve, et les valeurs finales apprises sur les deux',
    ' * plis réunis (null = pas encore mesuré : aucun pourcentage n’est montré).',
    ' * Hors de l’empreinte du moteur (data/joueurs/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
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
    '/** Le banc des chiffres des joueurs (null = pas encore mesuré). */',
    `export const JOUEURS_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}
