/**
 * formulesDebuts.js — LES FORMULES des débuts de saison, une seule fois (étape 35 du plan, lot 1a, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard. Imports : goalModel.js (la grille, le démarrage à froid, la saison en
 * nombre — importés, jamais modifiés), seasonWindows.js (la saison d'un championnat), reglagesDebuts.js (constantes).
 *
 * L'ÉTAT SCINDÉ (conception §2.2) : les huit sommes pondérées de la candidate de l'étape 27 (sa, wa, sd, wd, sga, wga, sgd,
 * wgd ; indices 0 à 7), tenues en DEUX cases — `saison` (les matchs de la saison en cours du club) et `avant` (tout ce qui
 * précède) — avec n, nx, le dernier championnat (`ligue`) et la saison du dernier match. Pour chaque match du club : 1. la
 * trêve (premier match d'une nouvelle saison) verse `saison` dans `avant` ; 2. la remise à zéro de la candidate (un match de
 * championnat dans un autre championnat) vide les SEIZE sommes ; 3. chaque case vieillit comme la candidate (×α), puis seule
 * `saison` reçoit le match. Alors `avant + saison` = les sommes de la candidate (T-R4).
 *
 * LA LECTURE AU JOUR J (conception §2.3, §2.4 ; avant-scellement) : l'état publié est celui d'AVANT le jour J. La trêve du
 * match du jour est donc appliquée À LA LECTURE (sans effet sur les sommes totales : la candidate en sort intacte quand
 * d = 0) ; la remise à zéro d'un club qui change de championnat ne l'est QUE pour les familles « promus », « nouveaux
 * venus » et leur contrôle (`remise: true`, dans leurs DEUX bras) : la candidate, elle, lit encore au 1er match les forces
 * de l'ancien championnat (sa remise à zéro se fait après ce match, goalModel.js jouerUnMatch).
 *
 * LES FORCES LUES avec des réglages p = { d, cA, cD, k0, dF, mA, mD, bOff, bDef, xOff, xDef } : δ = 2^(−d/h) sur `avant`
 * (h = 35 en attaque, 25 en défense), centres c dans le rétrécissement (S + k0·c)/(W + k0), la fausse rentrée δF sur ce qui
 * précède le faux point, le déplacement du faux promu (W_saison + 8m)/(W_saison + 8), la force de l'effectif en log. Avec
 * d = 0, c = 1 et rien d'autre : EXACTEMENT les forces de la candidate (forcesDe).
 * -----------------------------------------------------------------------
 */

import { grilleDesButs, N_CALCUL, attenuerLeTotal } from '../../core/engine/goalModel.js';
import { seasonOf, isCalendarYearLeague } from '../providers/seasonWindows.js';
import { BASE_STATISTIQUE, FAUSSE_RENTREE, FAUX_PROMU, JUGE } from './reglagesDebuts.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Les indices des sommes qui vieillissent avec la demi-vie d'ATTAQUE (sa, wa, sga, wga) ; les autres, la défense. */
export const INDICES_ATTAQUE = Object.freeze([0, 1, 4, 5]);
export const INDICES_DEFENSE = Object.freeze([2, 3, 6, 7]);
const EST_ATTAQUE = [true, true, false, false, true, true, false, false];

/** Un club bien identifié : un numéro FotMob (ou fd_teams.id à football-data), entier ≥ 1 — jamais 0, jamais un nom. */
export const clubValide = (c) => Number.isSafeInteger(c) && c > 0;

// ======================================================= hasards semés (copies de la 32, égalité testée)

/** FNV-1a 32 bits des octets UTF-8 d'un texte (la fonction de bancDuContexte.js, recopiée ; un test les compare). */
export function fnv1a(texte) {
  const octets = new TextEncoder().encode(String(texte));
  let h = 0x811c9dc5;
  for (const o of octets) {
    h ^= o;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ======================================================= l'état scindé

/** Un état vide : deux cases de huit sommes, n, nx, le dernier championnat, la saison du dernier match. */
export const etatScindeVide = () => ({ saison: new Float64Array(8), avant: new Float64Array(8), n: 0, nx: 0, ligue: null, derniereSaison: null });
export const ETAT_SCINDE_VIDE = Object.freeze({ saison: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]), avant: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]), n: 0, nx: 0, ligue: null, derniereSaison: null });

const copieEtat = (e) => ({ saison: Float64Array.from(e?.saison ?? new Float64Array(8)), avant: Float64Array.from(e?.avant ?? new Float64Array(8)), n: e?.n ?? 0, nx: e?.nx ?? 0, ligue: e?.ligue ?? null, derniereSaison: e?.derniereSaison ?? null });

/**
 * La trêve : le match de la saison `saisonDuMatch` ouvre-t-il une nouvelle saison pour ce club (son dernier match était
 * d'une saison plus ancienne) ? Le tout premier match d'un club n'est pas une trêve (rien n'est « avant »).
 */
export const estUneTreve = (etat, saisonDuMatch) => etat?.derniereSaison !== null && etat?.derniereSaison !== undefined && fini(saisonDuMatch) && saisonDuMatch > etat.derniereSaison;

/** La remise à zéro de la candidate : un match de CHAMPIONNAT dans un autre championnat que le dernier. */
export const estUneRemise = (etat, championnat, r = BASE_STATISTIQUE) => Boolean(championnat) && Boolean(etat?.ligue) && championnat !== etat.ligue && r.changementDeChampionnat === 'remise-a-zero';

/**
 * Ce qu'un match AJOUTE aux huit sommes (les rapports de jouerUnMatch, goalModel.js, à l'identique) : [xa, 1, xd, 1, bp/L,
 * 1, bc/L, 1] et le drapeau xG. `m` : la forme de jouerUnMatch.
 */
export function incrementDuMatch(m) {
  const aXg = m.xgPour !== null && m.xgPour !== undefined && m.xgContre !== null && m.xgContre !== undefined;
  const bp = m.butsPour ?? 0;
  const bc = m.butsContre ?? 0;
  const xa = aXg ? m.xgPour / m.moyennes.xg.lieu : bp / m.moyennes.buts.lieu;
  const xd = aXg ? m.xgContre / m.moyennes.xg.adverse : bc / m.moyennes.buts.adverse;
  return { ajout: [xa, 1, xd, 1, bp / m.moyennes.buts.lieu, 1, bc / m.moyennes.buts.adverse, 1], aXg };
}

/** Fait vieillir huit sommes d'un match (×α attaque ou défense) — en place. */
export function vieillir(s, r = BASE_STATISTIQUE) {
  const aA = Math.pow(2, -1 / r.demiVies.attaque);
  const aD = Math.pow(2, -1 / r.demiVies.defense);
  for (let k = 0; k < 8; k++) s[k] *= EST_ATTAQUE[k] ? aA : aD;
  return s;
}

/**
 * L'état scindé APRÈS un match (pur : l'état d'avant n'est pas modifié). `m` : la forme de jouerUnMatch (goalModel.js) —
 * { xgPour, xgContre, butsPour, butsContre, moyennes: { buts: { lieu, adverse }, xg: { lieu, adverse } }, championnat } ;
 * `saisonDuMatch` : la saison du club pour ce match (saisonDuClub). Les rapports xa, xd et les buts sont EXACTEMENT ceux de
 * jouerUnMatch.
 */
export function jouerUnMatchScinde(etat, m, r = BASE_STATISTIQUE, { saisonDuMatch } = {}) {
  const e = copieEtat(etat);
  // 1. la trêve : tout ce qui précède passe dans « avant »
  if (estUneTreve(e, saisonDuMatch)) {
    for (let k = 0; k < 8; k++) {
      e.avant[k] += e.saison[k];
      e.saison[k] = 0;
    }
  }
  // 2. la remise à zéro de la candidate (les seize sommes)
  if (estUneRemise(e, m.championnat, r)) {
    e.saison.fill(0);
    e.avant.fill(0);
  }
  if (m.championnat) e.ligue = m.championnat;
  // 3. chaque case vieillit comme la candidate, puis seule « saison » reçoit le match
  vieillir(e.saison, r);
  vieillir(e.avant, r);
  const { ajout, aXg } = incrementDuMatch(m);
  for (let k = 0; k < 8; k++) e.saison[k] += ajout[k];
  e.n += 1;
  if (aXg) e.nx += 1;
  if (fini(saisonDuMatch)) e.derniereSaison = e.derniereSaison === null ? saisonDuMatch : Math.max(e.derniereSaison, saisonDuMatch);
  return e;
}

/**
 * CE QUE LIT LE BANC d'un club au jour J (avant le match du jour) : `tot` (les huit sommes de la candidate), `sai` (celles
 * de la saison en cours, APRÈS la trêve du jour appliquée à la lecture), n, nx. `remise` : la remise à zéro du jour appliquée
 * aussi à la lecture (familles « promus », « nouveaux venus » et leur contrôle seulement).
 */
export function sommesLues(etat, { treve = false, remise = false } = {}) {
  const tot = new Float64Array(8);
  const sai = new Float64Array(8);
  if (etat && !remise) {
    for (let k = 0; k < 8; k++) {
      tot[k] = etat.saison[k] + etat.avant[k];
      sai[k] = treve ? 0 : etat.saison[k];
    }
  }
  return { tot, sai, n: etat?.n ?? 0, nx: etat?.nx ?? 0 };
}

/** δ de l'oubli : 2^(−d/h) (h = 35 en attaque, 25 en défense). */
export const deltaDe = (d, h) => (d ? Math.pow(2, -d / h) : 1);

/**
 * LES FORCES LUES (conception §2.3-2.4, §5.4, §5.9). `lu` : { tot, sai, n, nx, dep? } (sommesLues ; `dep` : les sommes depuis
 * le faux point) ; `p` : { d, cA, cD, k0, dF, mA, mD, bOff, bDef, xOff, xDef } (tous facultatifs). Rend { attaque, defense,
 * matchs, matchsXg } — avec p vide : forcesDe de la candidate (n = 0 : 1 et 1).
 */
export function forcesDeDebut(lu, p = {}, r = BASE_STATISTIQUE) {
  const n = lu?.n ?? 0;
  const nx = lu?.nx ?? 0;
  const d = p.d ?? 0;
  const S = new Float64Array(8);
  if (lu) {
    if (d === 0) for (let k = 0; k < 8; k++) S[k] = lu.tot[k];
    else {
      const dA = deltaDe(d, r.demiVies.attaque);
      const dD = deltaDe(d, r.demiVies.defense);
      for (let k = 0; k < 8; k++) S[k] = lu.sai[k] + (EST_ATTAQUE[k] ? dA : dD) * (lu.tot[k] - lu.sai[k]);
    }
    if (p.dF && lu.dep) {
      const fA = deltaDe(p.dF, r.demiVies.attaque);
      const fD = deltaDe(p.dF, r.demiVies.defense);
      for (let k = 0; k < 8; k++) S[k] = lu.dep[k] + (EST_ATTAQUE[k] ? fA : fD) * (S[k] - lu.dep[k]);
    }
  }
  const cA = p.cA ?? 1;
  const cD = p.cD ?? 1;
  const k0 = p.k0 ?? r.prior;
  let lA;
  let lD;
  if (!n && cA === 1 && cD === 1 && !p.mA && !p.mD && !p.bOff && !p.bDef) return { attaque: 1, defense: 1, matchs: 0, matchsXg: 0 };
  const att = (S[0] + k0 * cA) / (S[1] + k0);
  const def = (S[2] + k0 * cD) / (S[3] + k0);
  const gatt = (S[4] + k0 * cA) / (S[5] + k0);
  const gdef = (S[6] + k0 * cD) / (S[7] + k0);
  if (r.statistique === 'xg') {
    lA = Math.log(att);
    lD = Math.log(def);
  } else if (r.statistique === 'buts') {
    lA = Math.log(gatt);
    lD = Math.log(gdef);
  } else {
    const w = r.poidsXg;
    lA = w * Math.log(att) + (1 - w) * Math.log(gatt);
    lD = w * Math.log(def) + (1 - w) * Math.log(gdef);
  }
  // le déplacement du faux promu (conception §5.3, n° 9) : entier au 1er match de la saison, s'efface comme 8/(W_saison + 8)
  if (p.mA !== undefined && p.mA !== null && lu) lA += Math.log((lu.sai[1] + r.prior * p.mA) / (lu.sai[1] + r.prior));
  if (p.mD !== undefined && p.mD !== null && lu) lD += Math.log((lu.sai[3] + r.prior * p.mD) / (lu.sai[3] + r.prior));
  // la force de l'effectif (standardisée) : ln A' = ln A + β_off·x_off ; ln D' = ln D − β_def·x_def
  if (p.bOff && fini(p.xOff)) lA += p.bOff * p.xOff;
  if (p.bDef && fini(p.xDef)) lD -= p.bDef * p.xDef;
  // la forme exacte de forcesDe pour la candidate (exp du mélange ; « xg » et « buts » sans aller-retour quand rien ne s'ajoute)
  const simple = !p.mA && !p.mD && !p.bOff && !p.bDef;
  if (simple && r.statistique === 'xg') return { attaque: att, defense: def, matchs: n, matchsXg: nx };
  if (simple && r.statistique === 'buts') return { attaque: gatt, defense: gdef, matchs: n, matchsXg: nx };
  return { attaque: Math.exp(lA), defense: Math.exp(lD), matchs: n, matchsXg: nx };
}

/**
 * LES BUTS ATTENDUS « sans cote » d'un bras (conception §2.6) : λS = L_dom·A_h·D_a, μS = L_ext·A_a·D_h, puis le démarrage à
 * froid de la candidate (attenuerLeTotal, n0 = 8) — exactement parties.statistiques de modeleDeButs. `ligue` : moyennesAvant
 * du championnat du match au jour J (la MÊME dans tous les bras). Rend { lambda, mu } (avant recalage et bornes).
 */
export function attendusDebut({ ligue, fh, fa, r = BASE_STATISTIQUE }) {
  const brutes = { lambda: ligue.buts.home * fh.attaque * fa.defense, mu: ligue.buts.away * fa.attaque * fh.defense };
  if (!r.demarrageAFroid) return brutes;
  const a = attenuerLeTotal(brutes, ligue, Math.min(fh.matchs, fa.matchs), r.demarrageAFroid.matchs);
  return { lambda: a.lambda, mu: a.mu };
}

// ======================================================= saisons, statuts, faux points (purs)

/**
 * La saison d'un club pour une rencontre (conception §2.1) : celle du championnat du match ; pour une coupe, celle du
 * championnat du club (son dernier match de championnat), sinon celle de la coupe. À football-data : le libellé du fichier
 * (déjà en nombre, `saison`).
 */
export function saisonDuClub({ league, date, coupe, saison = null }, ligueDuClub = null, { fd = false } = {}) {
  if (fd) return saison;
  return seasonOf(coupe && ligueDuClub ? ligueDuClub : league, String(date).slice(0, 10));
}

/**
 * LE STATUT d'un club à son premier match de championnat de la saison (conception §2.1 ; Pierre n° 6) : `premier-au-magasin`
 * (son championnat n'avait aucun match la saison d'avant) ; `nouveau` (lui n'en avait aucun) ; `debut` (même championnat) ;
 * `promu` / `relegue` (deux championnats de la table des niveaux, d'un même pays, vers le haut / le bas) ; sinon
 * `autre-changement`. `ligueAvant` : le championnat où il a joué le plus de matchs de championnat la saison d'avant.
 */
export function statutDuClub({ ligue, ligueAvant, ligueAvaitDesMatchs }, niveaux) {
  if (!ligueAvaitDesMatchs) return 'premier-au-magasin';
  if (ligueAvant === null || ligueAvant === undefined) return 'nouveau';
  if (ligueAvant === ligue) return 'debut';
  const a = niveaux?.[ligueAvant];
  const b = niveaux?.[ligue];
  if (a && b && a.pays === b.pays && a.niveau !== b.niveau) return a.niveau > b.niveau ? 'promu' : 'relegue';
  return 'autre-changement';
}

/** Le championnat d'une saison d'avant : le plus de matchs de championnat, à égalité le plus récent (dernier jour), puis le libellé. */
export function ligueLaPlusJouee(parLigue) {
  let meilleur = null;
  for (const [ligue, v] of parLigue ?? []) {
    if (!meilleur || v.n > meilleur.n || (v.n === meilleur.n && (v.dernier > meilleur.dernier || (v.dernier === meilleur.dernier && ligue < meilleur.ligue)))) meilleur = { ligue, n: v.n, dernier: v.dernier };
  }
  return meilleur ? meilleur.ligue : null;
}

const jourPlus = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const deux = (x) => String(x).padStart(2, '0');

/**
 * LE JOUR DU FAUX POINT d'un club-saison (placebo « fausse rentrée ») : juillet-juin, le 1er mars de l'année saison + 1 ;
 * année civile, le 1er septembre de l'année saison ; + (FNV-1a de « club:saison:f » mod 45) jours.
 */
export function fauxPointDe(club, saison, civile) {
  const b = civile ? FAUSSE_RENTREE.civile : FAUSSE_RENTREE.juilletJuin;
  const an = civile ? saison : saison + 1;
  return jourPlus(`${an}-${deux(b.mois)}-${deux(b.jour)}`, fnv1a(`${club}:${saison}:f`) % FAUSSE_RENTREE.modulo);
}

/** La saison est-elle d'année civile (le faux point de septembre) ? Toujours non à football-data (divisions juillet-juin). */
export const saisonCivile = (league, { fd = false } = {}) => !fd && isCalendarYearLeague(league);

/** Le tirage du faux promu d'un club-saison : FNV-1a de « club:saison:p » mod 1000 (le seuil est compté sur la fenêtre). */
export const tirageFauxPromu = (club, saison) => fnv1a(`${club}:${saison}:p`) % FAUX_PROMU.modulo;
export const estFauxPromu = (club, saison, seuil) => tirageFauxPromu(club, saison) < seuil;
/** Le seuil du faux promu d'une fenêtre : arrondi(1000 × promus et relégués suivis ÷ clubs `debut`). */
export const seuilDuFauxPromu = ({ mouvements, debuts }) => (debuts > 0 ? Math.round((FAUX_PROMU.modulo * mouvements) / debuts) : 0);

/** L'ordre du faux effectif : les clubs d'un championnat-saison triés par FNV-1a de « club:saison:m » ; le suivant (circulaire). */
export function autreClubDuFauxEffectif(club, saison, clubs) {
  const ordre = [...new Set(clubs)].sort((a, b) => fnv1a(`${a}:${saison}:m`) - fnv1a(`${b}:${saison}:m`) || a - b);
  const i = ordre.indexOf(club);
  if (i < 0 || ordre.length < 2) return null;
  return ordre[(i + 1) % ordre.length];
}

// ======================================================= le juge : la perte du score exact, les 13 marchés témoins (copies de la 32)

const T = N_CALCUL + 1;
const PMIN = JUGE.plancher;

/** La perte log du score exact à la 90e sur la grille 0-20 (plancher 1e-6 ; au-delà de 20 buts, la probabilité 0). */
export function perteDuScore(grille, buts) {
  const p = buts.dom <= N_CALCUL && buts.ext <= N_CALCUL ? grille[buts.dom * T + buts.ext] : 0;
  return -Math.log(Math.max(p, PMIN));
}

/** Les 13 marchés témoins, dans cet ordre (ceux de la 32). */
export const MARCHES_TEMOINS = Object.freeze(['plus05', 'plus15', 'plus25', 'plus35', 'lesDeuxMarquent', 'dom05', 'dom15', 'dom25', 'dom35', 'ext05', 'ext15', 'ext25', 'ext35']);

/** Les 13 probabilités des marchés témoins d'une grille de calcul (la fonction de bancDuContexte.js, recopiée ; égalité testée). */
export function probabilitesTemoins(g) {
  let o0 = 0;
  let o1 = 0;
  let o2 = 0;
  let o3 = 0;
  let btts = 0;
  let d0 = 0;
  let d1 = 0;
  let d2 = 0;
  let d3 = 0;
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  for (let i = 0; i <= N_CALCUL; i++) {
    for (let j = 0; j <= N_CALCUL; j++) {
      const p = g[i * T + j];
      if (p === 0) continue;
      if (i > 0 && j > 0) btts += p;
      const t = i + j;
      if (t > 0.5) o0 += p;
      if (i > 0.5) d0 += p;
      if (j > 0.5) e0 += p;
      if (t > 1.5) o1 += p;
      if (i > 1.5) d1 += p;
      if (j > 1.5) e1 += p;
      if (t > 2.5) o2 += p;
      if (i > 2.5) d2 += p;
      if (j > 2.5) e2 += p;
      if (t > 3.5) o3 += p;
      if (i > 3.5) d3 += p;
      if (j > 3.5) e3 += p;
    }
  }
  return [o0, o1, o2, o3, btts, d0, d1, d2, d3, e0, e1, e2, e3];
}

/** Les 13 issues (0/1) d'un score à la 90e, dans l'ordre de MARCHES_TEMOINS. */
export function issuesTemoins(buts) {
  const { dom: i, ext: j } = buts;
  const t = i + j;
  return [t > 0.5, t > 1.5, t > 2.5, t > 3.5, i > 0 && j > 0, i > 0.5, i > 1.5, i > 2.5, i > 3.5, j > 0.5, j > 1.5, j > 2.5, j > 3.5].map((b) => (b ? 1 : 0));
}

/** La grille du juge pour des buts attendus (déjà recalés), bornés comme le modèle ; ρ de la base. */
export const grilleDuJuge = (lambda, mu, r = BASE_STATISTIQUE) => grilleDesButs(Math.min(r.bornes[1], Math.max(r.bornes[0], lambda)), Math.min(r.bornes[1], Math.max(r.bornes[0], mu)), r.rho);

/**
 * L'EFFET EN BUTS d'un centre dans un match (l'écran, lot 1b) : la différence des buts attendus du club (et de son
 * adversaire) entre le bras qui porte le centre et celui qui ne le porte pas.
 */
export const effetEnButs = ({ avec, sans }) => ({ club: avec.lambda - sans.lambda, adversaire: avec.mu - sans.mu });
