/**
 * formulesDesJoueurs.js — LA RÈGLE ET LES FORMULES DES CHIFFRES DES JOUEURS (étape 34 du plan, lot 1a, 03/11/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard. TROIS imports permis (test joueursFrontiere, T-X3) :
 * reglagesJoueurs.js, la loi des comptes de l'étape 33 (data/cartons/formulesDesCartons.js : loiDesCartons, perteDesComptes,
 * fnv1a) et la perte binaire du banc (bench/metrics.js : perteLogBinaire). Si le banc retient une famille, le lot 2
 * ajoutera CE fichier à l'empreinte du moteur ; jusque-là il est hors de l'empreinte et rien du moteur ne le lit (T-X2).
 *
 * Ce qu'on y trouve, UNE fois pour le banc, la nuit, l'archive et (au lot 2) le règlement :
 *   - posteDe : le poste d'une ligne (Goalkeeper 1, Defender et Sweeper 2, Midfielder 3, Forward 4 ; sinon null) ;
 *   - regleP : la règle des penalties et de l'xG hors penalty d'une ligne à xG (conception §2.2 ; jamais un 0 fabriqué) ;
 *   - relevesDUnCamp : les relevés d'un camp et les cinq signaux de chacun de ses joueurs (np, pen, sot, av, xa), les
 *     issues de chaque joueur (buts hors csc, tirs cadrés, averti, passes décisives), par IDENTIFIANT FotMob seulement
 *     (jamais un nom ; jamais players.shots ; jamais le passeur nommé du déroulé) ;
 *   - le rappel vers le repère, les minutes attendues, la normalisation (les parts se rajoutent à 1 : 11 titulaires ET
 *     le bloc des remplaçants, critique constat 2) ;
 *   - les lois : marque et passeur en Poisson(λ·g) (critique, constat 9 : l'amincissement de la marge de Dixon-Coles EST
 *     Poisson(λ·g)), tirs cadrés en binomiale négative (binomiale sous une sous-dispersion, la loi de la 33), averti en
 *     Bernoulli plafonnée ; la perte d'une ligne ; la cote juste ;
 *   - le RECALAGE PAR DIXIÈMES (critique, constat 5), la calibration par déciles et le critère « calibré » ;
 *   - le faux joueur des placebos (FNV-1a de « clé du match:numéro » mod M du poste).
 * -----------------------------------------------------------------------
 */

import { REGLE_P, POSTES, MINUTES_MAX, MINUTES_DU_MATCH, RAPPELS, PLAFOND_AVERTI, PLANCHER, FAUX_JOUEURS, CALIBRE } from './reglagesJoueurs.js';
import { loiDesCartons, perteDesComptes, fnv1a } from '../cartons/formulesDesCartons.js';
import { perteLogBinaire } from '../../bench/metrics.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Un nombre lu dans la base : null, '' ou NaN → null (jamais Number(null) = 0). */
export const nombre = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

// ======================================================= le poste

/** Le poste d'une ligne (code) : 1 gardien, 2 défenseur, 3 milieu, 4 attaquant ; null s'il n'est pas dit. */
export const posteDe = (position) => POSTES[String(position ?? '')] ?? null;

/** Le poste dominant de ses dernières apparitions (le plus fréquent ; à égalité, le plus récent) ; 0 sans aucun. */
export function posteDominant(derniers) {
  if (!derniers?.length) return 0;
  const n = new Map();
  for (const p of derniers) n.set(p, (n.get(p) ?? 0) + 1);
  let meilleur = 0;
  let max = 0;
  for (let i = derniers.length - 1; i >= 0; i--) {
    const p = derniers[i];
    if (n.get(p) > max) {
      max = n.get(p);
      meilleur = p;
    }
  }
  return meilleur;
}

// ======================================================= la règle P

/**
 * LA RÈGLE P d'une ligne jouée (xG, xG hors penalty) — v = 0,785, tolérance 0,016, seuil 0,70 :
 *   0 xG absent : 0 tir, donc 0 (FotMob omet les zéros) — cas « 0-sans-xg » ;
 *   1 xG hors penalty PRÉSENT : e = xG − xGnp ; k = arrondi(e / v) si e ≥ 0,70, sinon 0 ; hors penalty = xGnp ;
 *   2 xG hors penalty ABSENT et |xG − n·v| ≤ 0,016 pour un n ≥ 1 : k = n, hors penalty = 0 (FotMob omet un zéro) ;
 *   3 xG hors penalty ABSENT et xG < 0,70 : k = 0, hors penalty = xG ;
 *   4 sinon : INCONNU (le camp perd np, pen et xa pour ce match ; jamais un 0 fabriqué).
 * `inconnuSiAbsent` : le repli écrit d'avance (une année cassée) — tout « absent » devient inconnu.
 * Rend { cas, k, np } (k et np null pour l'inconnu).
 */
export function regleP({ xg, xgnp }, { inconnuSiAbsent = false, regle = REGLE_P } = {}) {
  const g = nombre(xg);
  const n = nombre(xgnp);
  if (g === null) return { cas: '0-sans-xg', k: 0, np: 0 };
  if (n !== null) {
    const e = g - n;
    return e >= regle.seuil ? { cas: '1-ecart-penalty', k: Math.round(e / regle.valeur), np: n } : { cas: '1-ecart-0', k: 0, np: n };
  }
  if (inconnuSiAbsent) return { cas: '4-inconnu', k: null, np: null };
  const multiple = Math.round(g / regle.valeur);
  if (multiple >= 1 && Math.abs(g - regle.valeur * multiple) <= regle.tolerance) return { cas: '2-absent-multiple', k: multiple, np: 0 };
  if (g < regle.seuil) return { cas: '3-absent-petit', k: 0, np: g };
  return { cas: '4-inconnu', k: null, np: null };
}

// ======================================================= les relevés d'un camp

/** Un but sur penalty du déroulé (drapeau « penalty » ou détail « Penalty » ; jamais un csc). */
export const butSurPenalty = (e) => e?.type === 'goal' && !e.ownGoal && (e.penalty === true || String(e.detail ?? '').trim().toLowerCase() === 'penalty');
const CARTONS = new Set(['yellow', 'yellowred', 'red']);
/** Une ligne porte-t-elle une statistique publiée par playerStats (note, touches, passes, xG, tirs cadrés) ? */
export const aDesStatistiques = (l) => [l.rating, l.touches, l.passes, l.xg, l.shotsOnTarget].some((x) => nombre(x) !== null);

/**
 * LES RELEVÉS D'UN CAMP ET LES SIGNAUX DE SES JOUEURS (pur). Entrées NORMALISÉES par le lecteur (identifiants en nombres
 * après people_merges ; 0 ou null = sans identifiant) :
 *   lignes          les lignes `players` du camp : { id, titulaire, poste (code ou null), minutes, entre, xg, xgnp,
 *                   shotsOnTarget, assists, rating, touches, passes } ;
 *   evenements      le déroulé ENTIER du match (buts : side, playerId, ownGoal, penalty, detail, avecPasseur — un drapeau :
 *                   le NOM du passeur n'est jamais gardé ; cartons : side, playerId, card ; penalties manqués : side, playerId) ;
 *   camp            'home' | 'away' ; butsDuCamp : le score du camp ; cadresDEquipe : team_stats.shots_on_goal (ou null) ;
 *   cartonsReleves  le statut des cartons du match (règle de la 33, garde du jour J comprise) est-il relevé ?
 *   inconnuSiAbsent le repli de la règle P (année cassée).
 * Une apparition = une ligne identifiée avec minutes > 0 (minutes comptées jusqu'à 90). Rend :
 *   { releves: { aXg, inconnuP, buteurs, cadres, cartons, passes, np, pen, sot, av, xa }, totaux: { np, pen, sot, av, xa },
 *     equipe: { buts, csc, butsPenalty, butsAvecPasseur, joueesSansId }, parJoueur: Map(id → { minutes, titulaire, poste,
 *     x: { np, pen, sot, av, xa }, buts, butsPenalty, cadres, averti, passes }), casP: { cas: n } }.
 * Un signal non relevé pour le camp vaut null partout (jamais un 0 fabriqué).
 */
export function relevesDUnCamp({ lignes = [], evenements = [], camp, butsDuCamp = null, cadresDEquipe = null, cartonsReleves = false, inconnuSiAbsent = false }) {
  const jouees = lignes.filter((l) => nombre(l.minutes) !== null && nombre(l.minutes) > 0);
  const identifiees = jouees.filter((l) => Number.isSafeInteger(l.id) && l.id > 0);
  const ids = new Set(identifiees.map((l) => l.id));
  const ev = Array.isArray(evenements) ? evenements : [];
  // xG des joueurs : au moins une ligne jouée avec un xG, et aucune ligne inconnue par la règle P.
  const casP = {};
  const regle = new Map();
  let inconnuP = false;
  let avecXg = false;
  for (const l of jouees) {
    const r = regleP(l, { inconnuSiAbsent });
    casP[r.cas] = (casP[r.cas] ?? 0) + 1;
    if (r.cas !== '0-sans-xg') avecXg = true;
    if (r.cas === '4-inconnu') inconnuP = true;
    regle.set(l, r);
  }
  const aXg = avecXg && !inconnuP;
  // Les buts du camp au déroulé (csc crédités au camp compris) face au score : buteurs relevés.
  const butsDuCote = ev.filter((e) => e?.type === 'goal' && e.side === camp);
  const nonCsc = butsDuCote.filter((e) => !e.ownGoal);
  const csc = butsDuCote.length - nonCsc.length;
  const score = nombre(butsDuCamp);
  const buteurs = score !== null && butsDuCote.length === score && nonCsc.every((e) => Number.isSafeInteger(e.playerId) && ids.has(e.playerId));
  const butsPenalty = nonCsc.filter(butSurPenalty).length;
  const butsAvecPasseur = nonCsc.filter((e) => e.avecPasseur === true).length;
  // Statistiques publiées (playerStats non vide).
  const stats = jouees.some(aDesStatistiques);
  // Tirs cadrés relevés : la ligne d'équipe connue, Σ des joueurs qui ont joué (NULL → 0) = elle, et des statistiques publiées.
  const cadresEq = nombre(cadresDEquipe);
  const sommeCadres = jouees.reduce((s, l) => s + (nombre(l.shotsOnTarget) ?? 0), 0);
  const cadres = cadresEq !== null && stats && sommeCadres === cadresEq;
  // Passes relevées (critique, constat 4) : Σ des passes des lignes jouées (NULL → 0) = buts non csc avec un passeur nommé
  // au déroulé (sans rapprocher aucun nom), et des statistiques publiées.
  const sommePasses = jouees.reduce((s, l) => s + (nombre(l.assists) ?? 0), 0);
  const passes = stats && sommePasses === butsAvecPasseur;
  const releves = {
    aXg,
    inconnuP,
    buteurs,
    cadres,
    cartons: Boolean(cartonsReleves),
    passes,
    np: aXg ? 'xg' : buteurs ? 'buts' : null,
    pen: aXg ? 'xg' : buteurs ? 'buts' : null,
    sot: cadres,
    av: Boolean(cartonsReleves),
    xa: aXg ? 'xa' : passes ? 'passes' : null
  };
  // Par joueur identifié : issues et signaux.
  const parJoueur = new Map();
  const butsDe = new Map();
  const penDe = new Map();
  for (const e of nonCsc) {
    if (!Number.isSafeInteger(e.playerId)) continue;
    butsDe.set(e.playerId, (butsDe.get(e.playerId) ?? 0) + 1);
    if (butSurPenalty(e)) penDe.set(e.playerId, (penDe.get(e.playerId) ?? 0) + 1);
  }
  const ratesDe = new Map();
  for (const e of ev) if (e?.type === 'missedpenalty' && e.side === camp && Number.isSafeInteger(e.playerId)) ratesDe.set(e.playerId, (ratesDe.get(e.playerId) ?? 0) + 1);
  const avertis = new Set();
  for (const e of ev) if (e?.type === 'card' && e.side === camp && Number.isSafeInteger(e.playerId) && CARTONS.has(String(e.card ?? 'yellow').toLowerCase())) avertis.add(e.playerId);
  for (const l of identifiees) {
    const r = regle.get(l);
    const buts = butsDe.get(l.id) ?? 0;
    const bp = penDe.get(l.id) ?? 0;
    const x = {
      np: releves.np === 'xg' ? r.np : releves.np === 'buts' ? buts - bp : null,
      pen: releves.pen === 'xg' ? r.k : releves.pen === 'buts' ? bp + (ratesDe.get(l.id) ?? 0) : null,
      sot: releves.sot ? nombre(l.shotsOnTarget) ?? 0 : null,
      av: releves.av ? (avertis.has(l.id) ? 1 : 0) : null,
      xa: releves.xa === 'xa' ? nombre(l.xa) ?? 0 : releves.xa === 'passes' ? nombre(l.assists) ?? 0 : null
    };
    parJoueur.set(l.id, {
      minutes: Math.min(MINUTES_MAX, nombre(l.minutes)),
      titulaire: Boolean(l.titulaire),
      poste: l.poste ?? null,
      x,
      buts,
      butsPenalty: bp,
      cadres: releves.sot ? nombre(l.shotsOnTarget) ?? 0 : null,
      averti: releves.av ? avertis.has(l.id) : null,
      passes: releves.passes ? nombre(l.assists) ?? 0 : null
    });
  }
  // Les totaux de l'équipe (SOMME des lignes du camp, jamais la ligne d'équipe) — joueurs sans identifiant compris.
  const totaux = { np: null, pen: null, sot: null, av: null, xa: null };
  if (releves.np === 'xg') totaux.np = jouees.reduce((s, l) => s + regle.get(l).np, 0);
  else if (releves.np === 'buts') totaux.np = nonCsc.length - butsPenalty;
  if (releves.pen === 'xg') totaux.pen = jouees.reduce((s, l) => s + regle.get(l).k, 0);
  else if (releves.pen === 'buts') totaux.pen = butsPenalty + [...ratesDe.values()].reduce((s, n) => s + n, 0);
  if (releves.sot) totaux.sot = sommeCadres;
  if (releves.av) totaux.av = identifiees.filter((l) => avertis.has(l.id)).length;
  if (releves.xa === 'xa') totaux.xa = jouees.reduce((s, l) => s + (nombre(l.xa) ?? 0), 0);
  else if (releves.xa === 'passes') totaux.xa = sommePasses;
  return { releves, totaux, equipe: { buts: score, csc, butsPenalty, butsAvecPasseur, joueesSansId: jouees.length - identifiees.length, jouees: jouees.length, avecStatistiques: stats }, parJoueur, casP };
}

// ======================================================= rappel, minutes, normalisation

/** Le facteur d'amortissement d'une demi-vie (en apparitions). */
export const amortissement = (h) => 2 ** (-1 / h);

/** LA PART RAPPELÉE vers le repère : (X + κ·repère) / (E + κ) ; κ = ∞ rend le repère (bras A). */
export function partRappelee(X, E, repere, kappa) {
  if (kappa === Infinity) return repere;
  const x = fini(X) ? X : 0;
  const e = fini(E) ? E : 0;
  return (x + kappa * repere) / (e + kappa);
}

/** Les minutes attendues d'un titulaire : min(90, (Σδ min + 3·m0) / (Σδ 1 + 3)) sur ses titularisations. */
export function minutesAttendues(S, N, m0, rappel = RAPPELS.minutes) {
  const s = fini(S) ? S : 0;
  const n = fini(N) ? N : 0;
  const m = fini(m0) ? m0 : MINUTES_MAX;
  return Math.min(MINUTES_MAX, (s + rappel * m) / (n + rappel));
}

/** La chance d'entrer d'un remplaçant listé : (Σδ entrées + 3·e0) / (Σδ présences + 3). */
export function chanceDEntrer(entrees, presences, e0, rappel = RAPPELS.entree) {
  return ((fini(entrees) ? entrees : 0) + rappel * (fini(e0) ? e0 : 0)) / ((fini(presences) ? presences : 0) + rappel);
}

/** Les minutes du bloc des remplaçants : R_T = max(0, 990 − Σ m_i des titulaires). */
export const minutesDuBloc = (minutesDesTitulaires) => Math.max(0, MINUTES_DU_MATCH - minutesDesTitulaires.reduce((s, m) => s + m, 0));

/**
 * LA NORMALISATION d'un camp (critique, constat 2 : 11 titulaires ET le bloc, au banc comme à l'écran) : `parts` =
 * [π̃_i] des titulaires, `minutes` = [m_i], `partBloc` = la part du bloc des remplaçants, `minutesBloc` = R_T. Rend
 * { p: [p_i], pBloc, somme } avec Σ p_i + pBloc = 1 exactement (au flottant près).
 */
export function normaliser(parts, minutes, partBloc, minutesBloc) {
  const w = parts.map((pi, i) => pi * minutes[i]);
  const wBloc = partBloc * minutesBloc;
  const somme = w.reduce((s, x) => s + x, 0) + wBloc;
  if (!(somme > 0)) return { p: w.map(() => 0), pBloc: 0, somme: 0 };
  return { p: w.map((x) => x / somme), pBloc: wBloc / somme, somme };
}

// ======================================================= les lois et les pertes

const lnFact = (() => {
  const t = [0];
  return (n) => {
    for (let i = t.length; i <= n; i++) t[i] = t[i - 1] + Math.log(i);
    return t[n];
  };
})();

/** P(K = k) d'une loi de Poisson de moyenne `l` (l = 0 : 1 en 0). */
export function poisson(k, l) {
  if (!(l > 0)) return k === 0 ? 1 : 0;
  return Math.exp(-l + k * Math.log(l) - lnFact(k));
}

/** La part d'un joueur dans un but de son équipe : g = (1 − q_csc − q_pen)·p_np + q_pen·t. */
export const partDesButs = (pNp, t, qCsc, qPen) => (1 - qCsc - qPen) * pNp + qPen * t;

/** MARQUE : K ~ Poisson(λ·g) ; P(au moins un but) = 1 − e^(−λ·g). */
export const probaMarque = (lambda, g) => 1 - Math.exp(-lambda * g);
/** PASSEUR : K ~ Poisson(λ·a·p_xa) ; P(au moins une passe décisive). */
export const probaPasseur = (lambda, a, pXa) => 1 - Math.exp(-lambda * a * pXa);

/** La loi des tirs cadrés d'un joueur (μ, 1/k) : binomiale négative, binomiale sous une sous-dispersion (la loi de la 33). */
export function loiDesTirsCadres(mu, invK, N = 3) {
  if (!(mu > 0)) return { pmf: [1, ...new Array(Math.max(0, N - 1)).fill(0)], queue: 0 };
  return loiDesCartons(mu, invK, N);
}
/** P(au moins 1) et P(au moins 2) tirs cadrés. */
export function probasCadres(mu, invK) {
  const { pmf } = loiDesTirsCadres(mu, invK, 2);
  return { auMoinsUn: Math.max(0, 1 - pmf[0]), auMoinsDeux: Math.max(0, 1 - pmf[0] - pmf[1]) };
}

/** AVERTI : P = min(0,95 ; κ_av × C_T × p_av) — une loi de Bernoulli. */
export const probaAverti = (C, kAv, pAv) => Math.min(PLAFOND_AVERTI, Math.max(0, kAv * C * pAv));

/**
 * LA PERTE D'UNE LIGNE (plancher 1e-6) — la loi ENTIÈRE du compte (critique de la 32, constat 1), sauf l'averti, binaire
 * par nature :
 *   marque   { lambdaG, k }       −ln Poisson(k ; λ·g) ;
 *   passeur  { moyenne, k }       −ln Poisson(k ; λ·a·p_xa) ;
 *   cadres   { mu, invK, x }      perteDesComptes de la 33 (binomiale négative ou binomiale) ;
 *   averti   { p, averti }        perteLogBinaire du banc.
 */
export function perteDUneLigne(famille, o) {
  if (famille === 'marque') return -Math.log(Math.max(poisson(o.k, o.lambdaG), PLANCHER));
  if (famille === 'passeur') return -Math.log(Math.max(poisson(o.k, o.moyenne), PLANCHER));
  if (famille === 'cadres') return perteDesComptes(o.x, o.mu, o.invK);
  if (famille === 'averti') return perteLogBinaire(Math.min(1, Math.max(0, o.p)), Boolean(o.averti)).valeur;
  throw new Error(`perteDUneLigne : famille inconnue « ${famille} »`);
}

/** LA COTE JUSTE de l'issue « oui » : 1 / P, deux décimales ; null (« — ») sous 0,005 ou au-dessus de 0,995. */
export function coteJuste(p) {
  if (!fini(p) || p < 0.005 || p > 0.995) return null;
  return Math.round((1 / p) * 100) / 100;
}

// ======================================================= le recalage par dixièmes, la calibration

/** Les déciles à effectifs égaux d'une liste de (p, y) : [{ n, annonce, realise }] (tri par p, puis par rang d'arrivée). */
export function decilesDe(points, k = CALIBRE.deciles) {
  const tries = points.map((x, i) => [x[0], x[1], i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const n = tries.length;
  const out = [];
  for (let d = 0; d < k; d++) {
    const de = Math.floor((d * n) / k);
    const a = Math.floor(((d + 1) * n) / k);
    let sp = 0;
    let sy = 0;
    for (let i = de; i < a; i++) {
      sp += tries[i][0];
      sy += tries[i][1];
    }
    const m = a - de;
    out.push({ n: m, annonce: m ? sp / m : null, realise: m ? sy / m : null });
  }
  return out;
}

/**
 * LE RECALAGE PAR DIXIÈMES (critique, constat 5), appris sur des (P, issue) d'un pli : les 10 déciles à effectifs égaux,
 * leur centre (P moyen) et leur fréquence réalisée, rendue MONOTONE (moyennes groupées par voisins, pondérées par les
 * effectifs). Rend { centres, frequences, n } — gelable, recopiable dans une note.
 */
export function apprendreLesDixiemes(points) {
  const d = decilesDe(points).filter((x) => x.n > 0);
  // Monotonie : regroupement des voisins qui violent l'ordre (algorithme des moyennes groupées).
  const blocs = d.map((x) => ({ n: x.n, sp: x.annonce * x.n, sy: x.realise * x.n, k: 1 }));
  for (let i = 1; i < blocs.length; ) {
    if (blocs[i - 1].sy / blocs[i - 1].n > blocs[i].sy / blocs[i].n + 1e-15) {
      const a = blocs[i - 1];
      const b = blocs[i];
      blocs.splice(i - 1, 2, { n: a.n + b.n, sp: a.sp + b.sp, sy: a.sy + b.sy, k: a.k + b.k });
      if (i > 1) i -= 1;
    } else i += 1;
  }
  const centres = [];
  const frequences = [];
  for (const b of blocs) {
    for (let j = 0; j < b.k; j++) frequences.push(b.sy / b.n);
  }
  for (const x of d) centres.push(x.annonce);
  return { centres, frequences, n: points.length };
}

/**
 * P' = le recalage appliqué : interpolé linéairement entre les centres des dixièmes (entre (0, 0) et le premier centre,
 * entre le dernier centre et (1, 1) aux bords) ; monotone, dans [0, 1]. Sans table (null) : P inchangé.
 */
export function recaler(table, p) {
  if (!table || !table.centres?.length) return p;
  const c = [0, ...table.centres, 1];
  const f = [0, ...table.frequences, 1];
  if (!(p > 0)) return 0;
  if (p >= 1) return 1;
  let i = 1;
  while (i < c.length - 1 && p > c[i]) i++;
  const c0 = c[i - 1];
  const c1 = c[i];
  const t = c1 > c0 ? (p - c0) / (c1 - c0) : 1;
  return Math.min(1, Math.max(0, f[i - 1] + t * (f[i] - f[i - 1])));
}

/**
 * LA CALIBRATION par déciles (toutes les lignes) : écart moyen pondéré |annoncé − réalisé|, pire décile, et le critère
 * « calibré » (≤ 1,0 point en moyenne ET chaque décile ≤ max(2,5 points ; 2,58 erreurs types)).
 */
export function calibrationDe(points) {
  const d = decilesDe(points);
  let n = 0;
  let s = 0;
  let pire = 0;
  let horsSeuil = 0;
  for (const x of d) {
    if (!x.n) continue;
    const ecart = Math.abs(x.annonce - x.realise);
    s += ecart * x.n;
    n += x.n;
    pire = Math.max(pire, ecart);
    const et = Math.sqrt(Math.max(x.realise * (1 - x.realise), 1e-12) / x.n);
    if (ecart > Math.max(CALIBRE.pire, CALIBRE.z * et)) horsSeuil += 1;
  }
  const ecartMoyen = n ? s / n : null;
  return { deciles: d, ecartMoyen, pire, calibre: n > 0 && ecartMoyen <= CALIBRE.moyen && horsSeuil === 0, horsSeuil };
}

// ======================================================= le faux joueur

/** L'emplacement d'un faux joueur : « faux:<poste>:<n> », n = FNV-1a(« clé du match:numéro ») mod M du poste (inconnu → milieux). */
export function fauxJoueur(cle, numero, poste) {
  const p = FAUX_JOUEURS[poste] ? poste : 3;
  return `faux:${p}:${fnv1a(`${cle}:${numero}`) % FAUX_JOUEURS[p]}`;
}
