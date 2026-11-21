/**
 * rejeuDuDirect.js — LE REJEU DU BANC DU DIRECT : du déroulé du magasin aux états, créneau par créneau, et les lectures des
 * variantes à chaque état (étape 46 du plan, lot 1, partie C, 12/11/2026 ; conception § 5.1 ; critique R16, R20, R22, R35
 * point 1, R36 point 1 ; essais T-B1, T-B3 de directBanc.test.mjs).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni réseau. Le déroulé est celui de l'export (`resultat`, écrit par
 * scripts/etape46.mjs --exporter avec issuesDuMagasin) : buts et rouges [[créneau, camp]] (camp 0 = domicile, 1 =
 * extérieur), créneaux 0 à 91 (creneauDe : 1-45 → 0-44, 45+x → 45, 46-90 → 46-90, 90+x → 91 ; la prolongation hors
 * du déroulé), et le score de la 90e (hg90, ag90 : un prolongé est jugé à la 90e).
 *
 * etatsDuRejeu(resultat, creneaux)  l'état au DÉBUT de chaque créneau évalué k (part 0) : les buts et les rouges des
 *                                   créneaux STRICTEMENT antérieurs (j < k) — jamais ceux du créneau k (la fuite), jamais
 *                                   le score final (hg90, ag90 ne servent qu'à l'issue). Les rouges sont comptés VRAIS
 *                                   (plus de 2 possibles, R35 point 1) ; « à la minute » (la règle de R16 n'est pas
 *                                   déclenchée).
 * issueDuRejeu(resultat)            le score de la 90e, qui DOIT redonner le déroulé (les buts des créneaux 0 à 91) ; sinon
 *                                   RejeuInvalide (l'étalonnage sous verrou l'arrête : rien n'est jugé).
 * lecturesDuRejeu({ ligne, etats, variantes, … })   à chaque état, les lectures COMPACTES de chaque variante
 *                                   (calculDuDirect.lecturesDuDirect, aux coupes du banc, R21) : le 1N2, le « plus de » de
 *                                   chaque ligne de buts, le « oui » des deux marquent, les lignes OUVERTES (une ligne
 *                                   déjà décidée par le score au point d'évaluation n'entre pas au banc), la somme, la
 *                                   masse négligée + plafonnée (F1), la validité (finie, dans [0 ; 1], somme 1 à 1e-9).
 * LA SOMME « 1 à 1e-9 » (R20 point 1) se lit MASSE NÉGLIGÉE COMPRISE : la grille de la chaîne n'est pas ramenée à 1 (les
 * marchés se lisent dans ses cases telles quelles, comme à l'écran) ; aux coupes du banc la masse négligée vaut jusqu'à
 * ~3·10⁻⁹ au créneau 0 (mesuré le 12/11) — c'est F1 qui la borne. Le contrôle : |somme + masse négligée − 1| ≤ 1e-9 (la
 * conservation de la masse) et |Σ 1N2 − somme| ≤ 1e-9 (le 1N2 lit toute la grille).
 * -----------------------------------------------------------------------
 */

import { lecturesDuDirect, ancrer } from './calculDuDirect.js';
import { COUPES, LIGNES } from './reglagesDirect.js';
import { NB_CRENEAUX } from '../simulation/reglages.js';

/** Le dernier créneau (91 : les arrêts de jeu de la seconde mi-temps). */
export const DERNIER_CRENEAU = NB_CRENEAUX - 1;
/** La tolérance de la somme d'une lecture (R20 point 1). */
export const TOLERANCE_SOMME = 1e-9;

/** Un déroulé qui ne se rejoue pas (événement hors forme, issue qui ne redonne pas les buts). */
export class RejeuInvalide extends Error {}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Les événements d'un déroulé, contrôlés : [[créneau entier 0..91, camp 0 ou 1]]. */
function evenements(liste, quoi) {
  if (!Array.isArray(liste)) throw new RejeuInvalide(`${quoi} : une liste [[créneau, camp]] est attendue.`);
  for (const e of liste) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] > DERNIER_CRENEAU || (e[1] !== 0 && e[1] !== 1)) {
      throw new RejeuInvalide(`${quoi} : événement hors forme (${JSON.stringify(e)}) — [créneau 0..${DERNIER_CRENEAU}, camp 0 ou 1].`);
    }
  }
  return liste;
}

/** LES ÉTATS du rejeu : au début de chaque créneau évalué k, les buts et les rouges des créneaux j < k (voir l'en-tête). */
export function etatsDuRejeu(resultat, creneaux) {
  const buts = evenements(resultat?.buts, 'buts');
  const rouges = evenements(resultat?.rouges ?? [], 'rouges');
  if (!Array.isArray(creneaux) || !creneaux.length) throw new RejeuInvalide('créneaux évalués : une liste non vide est attendue.');
  return creneaux.map((k) => {
    if (!Number.isInteger(k) || k < 0 || k > DERNIER_CRENEAU) throw new RejeuInvalide(`créneau évalué hors de 0..${DERNIER_CRENEAU} (${k}).`);
    let h = 0;
    let a = 0;
    let rh = 0;
    let ra = 0;
    for (const [kb, camp] of buts) {
      if (kb < k) {
        if (camp === 0) h++;
        else a++;
      }
    }
    for (const [kr, camp] of rouges) {
      if (kr < k) {
        if (camp === 0) rh++;
        else ra++;
      }
    }
    return { creneau: k, part: 0, h, a, rh, ra };
  });
}

/** L'ISSUE du rejeu : le score de la 90e, contrôlé contre le déroulé (les buts des créneaux 0 à 91). */
export function issueDuRejeu(resultat) {
  const buts = evenements(resultat?.buts, 'buts');
  let h = 0;
  for (const [, camp] of buts) if (camp === 0) h++;
  const a = buts.length - h;
  if (resultat.hg90 !== h || resultat.ag90 !== a) throw new RejeuInvalide(`le score de la 90e (${resultat.hg90}-${resultat.ag90}) ne redonne pas le déroulé (${h}-${a}).`);
  return { hg: h, ag: a };
}

/** Les clés des lignes de buts d'une lecture compacte, dans l'ordre (LIGNES : 0,5 à 3,5). */
export const CLES_DES_BUTS = Object.freeze([
  ...LIGNES.map((L) => `totalGoals.${L}`),
  'bothTeamsScore',
  ...LIGNES.map((L) => `teamGoals.home.${L}`),
  ...LIGNES.map((L) => `teamGoals.away.${L}`)
]);
/** La famille d'une clé de buts (totalGoals, bothTeamsScore, teamGoals). */
export const familleDe = (cle) => cle.split('.')[0];

/** La ligne est-elle OUVERTE au point d'évaluation (pas encore décidée par le score h-a) ? */
export function ligneOuverte(cle, { h, a }) {
  const [famille, x, y] = cle.split('.');
  if (famille === 'totalGoals') return !(h + a > Number(`${x}.${y}`));
  if (famille === 'bothTeamsScore') return !(h > 0 && a > 0);
  const L = Number(cle.split('.').slice(2).join('.'));
  return x === 'home' ? !(h > L) : !(a > L);
}

/** Ce qui s'est réalisé pour une clé de buts, au score de la 90e. */
export function realiseDe(cle, { hg, ag }) {
  const [famille, x, y] = cle.split('.');
  if (famille === 'totalGoals') return hg + ag > Number(`${x}.${y}`);
  if (famille === 'bothTeamsScore') return hg > 0 && ag > 0;
  const L = Number(cle.split('.').slice(2).join('.'));
  return x === 'home' ? hg > L : ag > L;
}

/** L'indice du 1N2 réalisé (0 domicile, 1 nul, 2 extérieur). */
export const issue1n2 = ({ hg, ag }) => (hg > ag ? 0 : hg === ag ? 1 : 2);

/** UNE LECTURE COMPACTE (voir l'en-tête) ; `valide` faux = la lecture ne sert pas telle quelle (filet de R22, étalonnage). */
export function lectureCompacte(l, etat) {
  const negligee = l?.masseNegligee ?? Number.NaN;
  const plafonnee = l?.massePlafonnee ?? 0;
  const masse = negligee + plafonnee;
  if (!l || l.raison === 'erreur' || !l.marches) return { valide: false, pourquoi: l?.raison === 'erreur' ? 'masse négligée au-delà de 1e-4' : 'lecture absente', somme: l?.somme ?? null, negligee, plafonnee, masse, un2: null, buts: null };
  const m = l.marches;
  const un2 = [m.result.home, m.result.draw, m.result.away];
  const buts = {};
  for (const L of LIGNES) buts[`totalGoals.${L}`] = m.totalGoals[String(L)].over;
  buts.bothTeamsScore = m.bothTeamsScore.yes;
  for (const L of LIGNES) buts[`teamGoals.home.${L}`] = m.teamGoals.home[String(L)].over;
  for (const L of LIGNES) buts[`teamGoals.away.${L}`] = m.teamGoals.away[String(L)].over;
  const nombres = [...un2, ...Object.values(buts)];
  const dans01 = nombres.every((p) => fini(p) && p >= -TOLERANCE_SOMME && p <= 1 + TOLERANCE_SOMME);
  const somme1n2 = un2[0] + un2[1] + un2[2];
  const conservee = fini(l.somme) && fini(negligee) && Math.abs(l.somme + negligee - 1) <= TOLERANCE_SOMME;
  const un2Entier = fini(somme1n2) && fini(l.somme) && Math.abs(somme1n2 - l.somme) <= TOLERANCE_SOMME;
  const pourquoi = !dans01
    ? 'lecture non finie ou hors de [0 ; 1]'
    : !conservee
      ? `somme ${String(l.somme)} + masse négligée ${String(negligee)} hors de 1 ± 1e-9`
      : !un2Entier
        ? `1N2 de somme ${String(somme1n2)} pour une grille de somme ${String(l.somme)}`
        : null;
  return { valide: pourquoi === null, pourquoi, somme: l.somme, negligee, plafonnee, masse, un2, buts, ouvertes: CLES_DES_BUTS.filter((c) => ligneOuverte(c, etat)) };
}

/**
 * LES LECTURES DU REJEU d'un match : `ligne` = { lambda, mu, rho, grille, fair } (la ligne exportée) ; `etats` =
 * etatsDuRejeu(…) ; `variantes` = les identifiants à lire ; `paramsSansEffets` = PARAMS_SANS_EFFETS (obligatoire pour
 * direct-sans-effets, R34) ; `coupes` = COUPES.banc (R21 point 1) ; `championnat` = la clé `matches.league` (R14).
 * L'ancrage est calculé UNE fois par match. Rend { ancrage, points: [{ etat, lectures: { id: lectureCompacte } }] } ; une
 * lecture qui lève devient { valide: false, pourquoi } (jamais une exception en plein passage).
 */
export function lecturesDuRejeu({ ligne, etats, variantes, paramsSansEffets = null, coupes = COUPES.banc, championnat = null }) {
  const ancree = variantes.includes('direct-ancre') || variantes.includes('temps-restant-ancre');
  let ancrage = null;
  if (ancree) {
    try {
      ancrage = ancrer({ ligne });
    } catch (error) {
      ancrage = { fait: false, raison: `ancrage impossible : ${error.message}` };
    }
  }
  const points = etats.map((etat) => {
    const lectures = {};
    for (const id of variantes) {
      try {
        const r = lecturesDuDirect({ ligne, depart: etat, variantes: [id], paramsSansEffets, coupes, championnat, ancrage });
        lectures[id] = lectureCompacte(r.lectures[id], etat);
      } catch (error) {
        lectures[id] = { valide: false, pourquoi: `calcul impossible : ${error.message}`, somme: null, negligee: Number.NaN, plafonnee: Number.NaN, masse: Number.NaN, un2: null, buts: null };
      }
    }
    return { etat, lectures };
  });
  return { ancrage, points };
}
