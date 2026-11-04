/**
 * bancFd.js — LES LIGNES FOOTBALL-DATA DU BANC DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026), lues par l'enfant, LECTURE SEULE.
 * -----------------------------------------------------------------------
 * Une ligne par match de `fd_history` (lien = 0) des fenêtres P1 (2005-07-29 → 2019-06-30) et P2 (2019-07-01 →
 * 2023-06-30) : ce que le banc compare, construit avec les fonctions du moteur et du banc, importées, jamais modifiées :
 *   - le marché P_M du 1N2 : la cote juste des paliers (fairFromBookmakers : Pinnacle → régime r1), sinon le repli du
 *     moteur (fairFromAllValid → r3) — la même règle qu'oddsEngine.js ; la moyenne (G : |p_Pinnacle − p_moyenne|) ;
 *   - le marché du plus/moins 2,5 (moyenne d'avant-match, méthode puissance : prix.js plusMoins25) ;
 *   - la partie STATISTIQUE (λS, μS, sans cote) : AccumulateurDesForces + modeleDeButs avec la base statistique de la 32
 *     (BASE_STATISTIQUE), nourris de TOUT football-data depuis 2000-07-28, publiés en fin de journée (jamais le jour J) ;
 *     la même coupée à J−2 (`horloge-j2` : sans J−1) ;
 *   - les DÉCISIONS de pari sous chaque seuil (stakingDuMatch, la règle de la note : cote juste Pinnacle, prix William
 *     Hill), sans jamais lire une colonne de clôture (prixFd passe par `colonne`, qui refuse) ;
 *   - au banc SEULEMENT (`avecResultats`) : l'issue (bd/be), la clôture (clotureDe : Pinnacle, sinon la moyenne) — pour
 *     MESURER, après coup. En comptes, la requête ne lit ni score, ni clôture (seule la PRÉSENCE d'une clôture est comptée).
 * Lit la base de l'appelant (jamais ouverte ici) ; ni horloge, ni réseau.
 * -----------------------------------------------------------------------
 */

import { prixFd, plusMoins25, clotureDe } from '../../bench/prix.js';
import { COLONNES_AVANT_MATCH, COLONNES_CLOTURE } from '../../bench/periodes.js';
import { fairFromBookmakers, fairFromAllValid } from '../../core/engine/valueFinder.js';
import { stakingDuMatch } from '../../core/engine/verdictPari.js';
import { removeMargin } from '../../core/market/marginRemoval.js';
import { faitsDepuisFd } from '../db/dayTable.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre } from '../../core/engine/goalModel.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE } from '../contexte/bancDuContexte.js';
import { CONFIG_DE_LA_REGLE, PERIODES_DU_BANC, COTE_HAUTE } from './reglagesCombinaison.js';

/** Le coupe-circuit neutre du banc (la même valeur que bench/entrees.js : TILT_NEUTRE ; un test les compare). */
export const TILT_NEUTRE = Object.freeze({ currentDownswing: 0, circuitBreakerActive: false });

/** Les seuils dont le banc calcule la décision (toutes les bandes que lisent les règles jugées sur football-data). */
export const SEUILS_CALCULES = Object.freeze([0.01, 0.015, 0.02, 0.03, 0.04, 0.05]);

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const ID = ['id', 'code', 'saison', 'date', 'date_fichier', 'dom', 'ext', 'lien'];

/** SANS RÉSULTAT (« comptes ») : identifiants, prix d'avant-match, et la seule PRÉSENCE d'une clôture. */
export const SQL_FD_COMPTES = `SELECT ${[...ID, ...COLONNES_AVANT_MATCH].join(', ')},
  CASE WHEN pin_c1 IS NOT NULL OR moy_c1 IS NOT NULL THEN 1 ELSE 0 END AS a_cloture,
  CASE WHEN moy_cp25 IS NOT NULL OR pin_cp25 IS NOT NULL THEN 1 ELSE 0 END AS a_cloture25
  FROM fd_history WHERE date >= ? AND date <= ? ORDER BY date, id`;

/** AVEC LES RÉSULTATS (« banc », le passage unique) : plus les buts et les colonnes de clôture. */
export const SQL_FD_BANC = `SELECT ${[...ID, 'bd', 'be', ...COLONNES_AVANT_MATCH, ...COLONNES_CLOTURE].join(', ')}
  FROM fd_history WHERE date >= ? AND date <= ? ORDER BY date, id`;

/** La fenêtre d'un jour ('P1', 'P2' ou null), et ses drapeaux. */
export function fenetreDe(date, periodes = PERIODES_DU_BANC) {
  if (date >= periodes.P2.de && date <= periodes.P2.a) return 'P2';
  if (date >= periodes.P1.de && date <= periodes.P1.a) return 'P1';
  return null;
}

/** La clé d'une ligne football-data (celle du banc d'essai : cleDuFd de bench/entrees.js). */
export const cleDuFd = (l) => `fd:${l.code}|${l.date_fichier ?? l.date}|${Number(l.dom)}|${Number(l.ext)}`;

/** L'issue 1N2 (0 domicile, 1 nul, 2 extérieur) et celle du 2,5 (0 plus, 1 moins), d'après bd/be ; null sans score. */
export function issuesDe(l) {
  const d = Number(l.bd);
  const e = Number(l.be);
  if (l.bd === null || l.be === null || !Number.isFinite(d) || !Number.isFinite(e)) return null;
  return { y: d > e ? 0 : d === e ? 1 : 2, y25: d + e >= 3 ? 0 : 1 };
}

/** La clôture 1N2 complète (clotureDe, le même livre pour les trois issues), et celle du 2,5 ; null sans clôture. */
export function clotureComplete(l) {
  const q = ['home', 'draw', 'away'].map((issue) => clotureDe(l, { marche: '1x2', issue }));
  const q25 = ['over', 'under'].map((issue) => clotureDe(l, { marche: 'ou25', issue }));
  return {
    q: q.every(Boolean) && q[0].livre === q[1].livre && q[1].livre === q[2].livre ? q.map((x) => x.p) : null,
    livre: q[0]?.livre ?? null,
    q25: q25.every(Boolean) && q25[0].livre === q25[1].livre ? q25.map((x) => x.p) : null
  };
}

/** Les décisions d'un match sous chaque seuil calculé : { [seuil]: { o, c, b, ev } | null }, et le refus de la règle à 2 %. */
export function decisionsDuMatch(prix, reference) {
  const match = { home: 'Domicile', away: 'Extérieur', marketOdds: prix, bankroll: 1000 };
  const disponible = Boolean(prix);
  const dec = {};
  let refusA = null;
  for (const t of SEUILS_CALCULES) {
    const s = stakingDuMatch(match, { disponible, reference }, { ...CONFIG_DE_LA_REGLE, valueBookmakers: [...CONFIG_DE_LA_REGLE.valueBookmakers], edgeThresholdMin: t }, TILT_NEUTRE);
    if (s?.action === 'RECOMMENDED') dec[t] = { o: ['home', 'draw', 'away'].indexOf(s.outcome), c: s.odds, b: s.bookmaker, ev: s.ev };
    else {
      dec[t] = null;
      if (t === 0.02) refusA = s?.reason ?? s?.action ?? 'sans_decision';
    }
  }
  return { dec, refusA };
}

/**
 * LA PASSE FOOTBALL-DATA. `avecResultats` : false en comptes (aucun score, aucune clôture lus ; nMin compté par un
 * simple compteur de matchs, sans forces), true au banc. Rend { lignes, bilan }. Une ligne par match de P1 ou P2 (lien =
 * 0) qui a une cote de marché d'avant-match (P_M) ; les forces sont nourries de toutes les lignes depuis 2000-07-28.
 */
export function passeFd({ database, avecResultats = false, periodes = PERIODES_DU_BANC, surJour = null } = {}) {
  const sql = avecResultats ? SQL_FD_BANC : SQL_FD_COMPTES;
  const it = database.prepare(sql).iterate(periodes.miseEnRoute.de, periodes.dernierJourFd);
  const acc = avecResultats ? new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] }) : null;
  const accJ2 = avecResultats ? new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] }) : null;
  const attenteJ2 = [];
  const compteur = new Map();
  const lignes = [];
  const bilan = { lues: 0, lien0: 0, sansMarche: 0, parFenetre: { P1: 0, P2: 0 }, parRegime: {}, sans25: 0 };
  let jour = null;
  let duJour = [];
  const stats = (accu, l, date) => {
    if (!accu) return null;
    const entrees = {
      forces: { home: accu.etat(EMPREINTE_DE_LA_BASE, Number(l.dom)), away: accu.etat(EMPREINTE_DE_LA_BASE, Number(l.ext)) },
      ligue: accu.moyennes(l.code, date, saisonEnNombre(l.saison)),
      plusMoins: null
    };
    const m = modeleDeButs({ fair: null, entrees, reglages: BASE_STATISTIQUE });
    const pr = m.probabilites;
    return { p: [pr.home, pr.draw, pr.away], p25: [pr.over25, 1 - pr.over25], lambda: m.parties.statistiques.lambda, mu: m.parties.statistiques.mu, nMin: m.parties.statistiques.demarrage?.nMin ?? null };
  };
  const finDuJour = () => {
    if (jour === null) return;
    // 1. Les lignes du jour, calculées AVANT que le jour n'entre dans les forces (J−1 ; J−2 pour l'horloge).
    while (accJ2 && attenteJ2.length && attenteJ2[0].jour <= decalerJour(jour, -2)) {
      const j = attenteJ2.shift();
      for (const [dom, ext] of j.rencontres) accJ2.ajouter(dom, ext);
      accJ2.finDeJournee();
    }
    const calculees = [];
    for (const l of duJour) {
      const fenetre = l.lien === 0 ? fenetreDe(jour, periodes) : null;
      if (fenetre === null) continue;
      const ligne = construireLaLigne(l, jour, fenetre, { stats: (x) => stats(acc, x, jour), statsJ2: (x) => stats(accJ2, x, jour), compteur, avecResultats, bilan });
      if (ligne) calculees.push(ligne);
    }
    // 2. La classe « cote haute » PERMUTÉE dans la journée (placebo-classe) : la permutation semée par le jour.
    permuterLaCoteHaute(calculees, jour);
    for (const x of calculees) lignes.push(x);
    // 3. Le jour entre dans les forces (fin de journée) et dans le compteur de matchs.
    const rencontres = [];
    if (acc) {
      for (const f of faitsDepuisFd(duJour, { fdTeams: null })) {
        if (!f.home) continue;
        const r = faitsDeLaRencontre(f);
        if (r) rencontres.push([r.dom, r.ext]);
      }
      for (const [dom, ext] of rencontres) acc.ajouter(dom, ext);
      acc.finDeJournee();
      attenteJ2.push({ jour, rencontres });
    }
    for (const l of duJour) for (const c of [Number(l.dom), Number(l.ext)]) compteur.set(c, (compteur.get(c) ?? 0) + 1);
    if (surJour) surJour(jour);
    duJour = [];
  };
  for (const l of it) {
    bilan.lues++;
    const d = String(l.date).slice(0, 10);
    if (d !== jour) {
      finDuJour();
      jour = d;
    }
    duJour.push(l);
  }
  finDuJour();
  return { lignes, bilan };
}

/** Un jour AAAA-MM-JJ décalé de n jours. */
export function decalerJour(jour, n) {
  const t = new Date(`${jour}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** La ligne d'un match (pur, sauf les fonctions de forces passées par l'appelant). */
export function construireLaLigne(l, jour, fenetre, { stats, statsJ2, compteur, avecResultats, bilan }) {
  bilan.lien0++;
  const prix = prixFd(l, { jeu: 'fd-avant-match' });
  if (!prix) {
    bilan.sansMarche++;
    return null;
  }
  const reference = fairFromBookmakers(prix.byBookmaker, CONFIG_DE_LA_REGLE);
  const repli = reference ? null : fairFromAllValid(prix.byBookmaker);
  const pM = reference ? [...reference.probabilities] : repli ? [...repli.probabilities] : null;
  if (!pM) {
    bilan.sansMarche++;
    return null;
  }
  const regime = reference ? 'r1' : 'r3';
  bilan.parFenetre[fenetre]++;
  bilan.parRegime[`${fenetre}:${regime}`] = (bilan.parRegime[`${fenetre}:${regime}`] ?? 0) + 1;
  const moy = removeMargin([prix.odds1, prix.oddsDraw, prix.odds2]);
  const pMoy = moy.anomaly ? null : [...moy.probabilities];
  const g = reference && pMoy ? Math.max(...pM.map((p, i) => Math.abs(p - pMoy[i]))) : null;
  const pm25 = plusMoins25(l, { jeu: 'fd-avant-match' });
  // Le plus/moins 2,5 tel que le banc d'essai le lit (une marge incohérente rend la lecture proportionnelle, signalée) : la
  // note de départ le compte sur 30 157 matchs de P2, anomalies comprises.
  const pM25 = pm25 ? [pm25.over, pm25.under] : null;
  if (!pM25) bilan.sans25++;
  const { dec, refusA } = decisionsDuMatch(prix, reference);
  const s = stats(l);
  const s2 = statsJ2(l);
  const nMin = s?.nMin ?? Math.min(compteur.get(Number(l.dom)) ?? 0, compteur.get(Number(l.ext)) ?? 0);
  const ligne = {
    cle: cleDuFd(l),
    date: jour,
    code: l.code,
    saison: l.saison,
    fenetre,
    regime,
    pM,
    pMoy,
    g,
    pM25,
    anomalie25: pm25 ? Boolean(pm25.anomalie) : null,
    pS: s?.p ?? null,
    pS25: s?.p25 ?? null,
    lambdaS: s?.lambda ?? null,
    muS: s?.mu ?? null,
    pSj2: s2?.p ?? null,
    nMin,
    dec,
    refusA,
    coteHaute: Boolean(dec[0.02] && dec[0.02].c > COTE_HAUTE),
    coteHautePermutee: false,
    coteHautePermutee2: false,
    aCloture: avecResultats ? null : l.a_cloture === 1,
    aCloture25: avecResultats ? null : l.a_cloture25 === 1
  };
  if (avecResultats) {
    const is = issuesDe(l);
    const c = clotureComplete(l);
    ligne.y = is?.y ?? null;
    ligne.y25 = is?.y25 ?? null;
    ligne.q = c.q;
    ligne.q25 = c.q25;
    ligne.livreCloture = c.livre;
  }
  return ligne;
}

/**
 * placebo-classe : les étiquettes « cote haute » de la journée, permutées entre ses matchs QUI ONT UN PARI sous la règle en
 * service, DEUX fois (deux graines : « placebo-classe|jour » et « placebo-classe-2|jour ») — la même puissance que
 * cote-haute-3pc (le même nombre de paris touchés), sur des paris tirés au hasard ; le placebo juge l'une face à l'autre ; un
 * match sans pari garde « non ».
 */
export function permuterLaCoteHaute(lignes, jour) {
  for (const x of lignes) {
    x.coteHautePermutee = false;
    x.coteHautePermutee2 = false;
  }
  const avecPari = lignes.filter((x) => x.dec?.[0.02]);
  const n = avecPari.length;
  if (n < 2) {
    for (const x of avecPari) x.coteHautePermutee = x.coteHautePermutee2 = x.coteHaute;
    return;
  }
  const etiquettes = avecPari.map((x) => x.coteHaute);
  // Deux permutations INDÉPENDANTES (deux graines) : le placebo compare l'une à l'autre (rien ne doit sortir).
  const ordre = permutationJour(n, `placebo-classe|${jour}`);
  const ordre2 = permutationJour(n, `placebo-classe-2|${jour}`);
  for (let i = 0; i < n; i++) {
    avecPari[i].coteHautePermutee = etiquettes[ordre[i]];
    avecPari[i].coteHautePermutee2 = etiquettes[ordre2[i]];
  }
}

function permutationJour(n, graine) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let h = 2166136261;
  for (const ch of String(graine)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = n - 1; i > 0; i--) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

