/**
 * passeDesDebuts.js — LA PASSE DU BANC des débuts de saison : les rencontres, journée après journée, et ce que le banc
 * retient de chacune (étape 35 du plan, lot 1a, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard ; les rencontres lui sont apportées (lectureDesDebuts.js, dans le
 * processus à part). Une seule passe pour les COMPTES (sans résultat : ni forces, ni buts) et pour le BANC (avec) :
 * DebutsAuJourJ journée après journée ; AVANT de publier la journée J, chaque rencontre de championnat (ni coupe, comptée,
 * non attribuée) d'une fenêtre du banc est lue sur l'état de la veille — rang, statut, faux point, tirage du faux promu,
 * sommes de ses deux clubs, moyennes de ligue de la candidate — et gardée si elle appartient à un ensemble :
 *   rappel     au moins un club `debut` de rang ≤ 10 ;
 *   promus     au moins un club `promu` ou `relegue` de rang ≤ 10 ;
 *   nouveaux   au moins un club `nouveau` de rang ≤ 10 ;
 *   fausse     au moins un club à 10 matchs de championnat ou moins de son faux point (magasin) ;
 *   rappel1120 au moins un club `debut` de rang 11 à 20 (TÉMOIN rapporté, jamais une variante de plus) ;
 *   tout       (football-data P1 seulement) toutes : le k0 du « commun fd » s'y apprend.
 * Le faux promu et la force de l'effectif sont décidés APRÈS la passe (leur seuil, leur écart-type : des comptes de la fenêtre,
 * sans résultat). La force de l'effectif (Δ des fiches de l'étape 30) est demandée à `effectifAuJourJ(club, saison, jour,
 * debuts)` — l'appelant tient les fiches (le rejeu de la 30, publié en fin de journée).
 * -----------------------------------------------------------------------
 */

import { DebutsAuJourJ, estDeChampionnat, passerLesRencontres } from './debutsAuJourJ.js';
import { N_PREMIERES, TRANCHES_DE_RANG, PERIODES_DU_BANC, EFFECTIF } from './reglagesDebuts.js';
import { autreClubDuFauxEffectif, estFauxPromu } from './formulesDebuts.js';
import { continuiteDe } from '../db/squadChanges.js';

const dans = (jour, p) => jour >= p.de && jour <= p.a;
const MOUVEMENT = new Set(['promu', 'relegue']);

/** La fenêtre d'un jour : magasin 'A' (2023-07 → 2025-06), 'B' (2025-07 → 2026-09-23), 'miseEnRoute' ; football-data 'P1', 'P2' ; sinon null. */
export function fenetreDuJour(jour, { fd = false, periodes = PERIODES_DU_BANC } = {}) {
  if (fd) {
    if (dans(jour, periodes.fd.juger)) return 'P2';
    if (dans(jour, periodes.fd.apprendre)) return 'P1';
    return null;
  }
  const m = periodes.magasin;
  if (jour > m.dernierJourLu) return null;
  if (dans(jour, m.plis[0].apprendre)) return 'A';
  if (dans(jour, m.plis[1].apprendre)) return 'B';
  if (dans(jour, m.miseEnRoute)) return 'miseEnRoute';
  return null;
}

/** Les ensembles d'une rencontre lue (deux clubs lus par DebutsAuJourJ.lireLeClub). */
export function ensemblesDe(h, a, { fd = false } = {}) {
  const deux = [h, a].filter((c) => c.valide && c.rang !== null);
  const premiers = (c) => c.rang <= N_PREMIERES;
  return {
    rappel: deux.some((c) => c.statut === 'debut' && premiers(c)),
    promus: deux.some((c) => MOUVEMENT.has(c.statut) && premiers(c)),
    nouveaux: deux.some((c) => c.statut === 'nouveau' && premiers(c)),
    fausse: !fd && deux.some((c) => c.faux && c.faux.rang <= N_PREMIERES),
    rappel1120: deux.some((c) => c.statut === 'debut' && c.rang >= TRANCHES_DE_RANG[2][0] && c.rang <= TRANCHES_DE_RANG[2][1])
  };
}

/**
 * LA PASSE. `rencontres` : itérable dans l'ordre (jour, clé) (lectureDesDebuts.js) ; `avecForces` : le banc (les sommes et les
 * moyennes de la candidate) ; `fd` : football-data ; `effectifAuJourJ` : facultatif (magasin, banc ou comptes de l'effectif) ;
 * `prix1n2` : Map clé → [pH, pN, pA] (le 1N2 d'avant-match rapporté, magasin) ; `surJournee(jour, debuts, duJour)` : facultatif,
 * après la publication. Rend { records, comptes, debuts }. Générateur (rend la main toutes les 25 journées).
 */
export function* passeDesDebuts({ rencontres, avecForces, fd = false, periodes = PERIODES_DU_BANC, effectifAuJourJ = null, prix1n2 = null, surJournee = null, garderTout = fd }) {
  const debuts = new DebutsAuJourJ({ avecForces, fd });
  const records = [];
  const comptes = { lues: 0, deChampionnat: 0, attribuees: 0, sansScore90: 0, parFenetre: {}, clubsSaisons: new Map(), fauxPoints: new Map(), clubsDeLaFenetre: new Map() };
  const debutsDeLaLigue = new Map();
  const avant = (jour, duJour) => {
    const fenetre = fenetreDuJour(jour, { fd, periodes });
    for (const r of duJour) {
      comptes.lues += 1;
      if (r.attribue) comptes.attribuees += 1;
      if (!estDeChampionnat(r)) continue;
      comptes.deChampionnat += 1;
      const h = debuts.lireLeClub(r.home, r);
      const a = debuts.lireLeClub(r.away, r);
      // les comptes des clubs-saisons (statut au premier match de championnat de la saison ; aucun résultat)
      for (const c of [h, a]) {
        if (!c.valide || c.rang !== 1) continue;
        const cle = `${c.club}|${c.saison}|${r.league}`;
        if (!comptes.clubsSaisons.has(cle)) comptes.clubsSaisons.set(cle, { club: c.club, saison: c.saison, league: r.league, statut: c.statut, ligueAvant: c.ligueAvant, premier: jour, fenetre, tirage: c.tirageFauxPromu });
        if (c.statut === 'debut') {
          const k = `${r.league}|${c.saison}`;
          if (!debutsDeLaLigue.has(k)) debutsDeLaLigue.set(k, new Set());
          debutsDeLaLigue.get(k).add(c.club);
        }
      }
      for (const c of [h, a]) if (c.valide && c.faux && c.faux.rang === 1) comptes.fauxPoints.set(`${c.club}|${c.saison}`, jour);
      if (!fenetre || fenetre === 'miseEnRoute') continue;
      // les clubs-saisons qui JOUENT dans la fenêtre (le contrôle du faux point)
      for (const c of [h, a]) if (c.valide) comptes.clubsDeLaFenetre.set(`${c.club}|${c.saison}`, { fenetre, league: r.league, civile: null });
      const f = (comptes.parFenetre[fenetre] ??= { championnat: 0, sansScore90: 0 });
      f.championnat += 1;
      if (!r.aScore90) {
        f.sansScore90 += 1;
        comptes.sansScore90 += 1;
        continue;
      }
      const ens = ensemblesDe(h, a, { fd });
      const garder = ens.rappel || ens.promus || ens.nouveaux || ens.fausse || ens.rappel1120 || (garderTout && fenetre === 'P1');
      if (!garder) continue;
      // la continuité (montrée, jamais jugée) des clubs `debut` de rang 2 à 10 (minutes des matchs déjà joués)
      if (!fd) {
        for (const c of [h, a]) {
          if (!(c.valide && c.statut === 'debut' && c.rang >= 2 && c.rang <= N_PREMIERES)) continue;
          const ms = debuts.minutesDuClub(c.club, c.saison);
          const mav = debuts.minutesDuClub(c.club, c.saison - 1);
          c.continuite = ms && mav ? continuiteDe(ms.joueurs, new Set(mav.joueurs.keys())) : null;
        }
      }
      // la force de l'effectif (Δ) des clubs `debut` de rang 3 à 10, et celle du club de leur faux effectif (ordre FNV)
      if (effectifAuJourJ) {
        for (const c of [h, a]) {
          if (!(c.valide && c.statut === 'debut' && c.rang >= EFFECTIF.rangMin && c.rang <= EFFECTIF.rangMax)) continue;
          c.effectif = effectifAuJourJ(c.club, c.saison, jour, debuts);
          const autre = autreClubDuFauxEffectif(c.club, c.saison, [...(debutsDeLaLigue.get(`${r.league}|${c.saison}`) ?? [])]);
          c.effectifFaux = autre === null ? null : effectifAuJourJ(autre, c.saison, jour, debuts);
          c.autreClub = autre;
        }
      }
      records.push({
        cle: r.cle,
        date: jour,
        league: r.league,
        saison: r.saison,
        libelle: r.libelle ?? null,
        fenetre,
        buts: avecForces ? r.buts90 : null,
        ligue: avecForces ? debuts.moyennes(r.league, jour, r.saison) : null,
        prix1n2: avecForces ? (prix1n2?.get(r.cle) ?? r.prix1n2 ?? null) : null,
        ens,
        h: alleger(h),
        a: alleger(a)
      });
    }
  };
  const apres = surJournee ? (jour, duJour) => surJournee(jour, debuts, duJour) : null;
  yield* passerLesRencontres(debuts, rencontres, { avant, apres });
  return { records, comptes, debuts };
}

/** Ce que le banc garde d'un club lu (sans les références à l'état vivant). */
function alleger(c) {
  if (!c.valide) return { club: c.club, valide: false };
  return {
    club: c.club,
    valide: true,
    saison: c.saison,
    treve: c.treve,
    remise: c.remise,
    rang: c.rang,
    statut: c.statut,
    ligueAvant: c.ligueAvant,
    tirageFauxPromu: c.tirageFauxPromu,
    faux: c.faux ? { rang: c.faux.rang, dep: c.faux.dep } : null,
    sommes: c.sommes,
    continuite: c.continuite ?? null,
    effectif: c.effectif ?? null,
    effectifFaux: c.effectifFaux ?? null,
    autreClub: c.autreClub ?? null
  };
}

// ======================================================= après la passe : faux promu, force de l'effectif (sans résultat)

/**
 * LE SEUIL DU FAUX PROMU d'une fenêtre (sans résultat) : arrondi(1000 × promus et relégués suivis ÷ clubs `debut`) sur les
 * clubs-saisons dont le premier match de championnat est dans la fenêtre (magasin : A ∪ B ; football-data : P1 ∪ P2).
 */
export function seuilDuFauxPromuDe(clubsSaisons, fenetres) {
  let mouvements = 0;
  let debuts = 0;
  for (const c of clubsSaisons.values()) {
    if (!fenetres.includes(c.fenetre)) continue;
    if (MOUVEMENT.has(c.statut)) mouvements += 1;
    else if (c.statut === 'debut') debuts += 1;
  }
  return { mouvements, debuts, seuil: debuts > 0 ? Math.round((1000 * mouvements) / debuts) : 0 };
}

/** L'écart-type (sans résultat) des Δ de la force de l'effectif des clubs concernés (rang 3 à 10, magasin, plis A ∪ B). */
export function ecartTypeDeLEffectif(records) {
  const off = [];
  const def = [];
  for (const r of records) {
    if (r.fenetre !== 'A' && r.fenetre !== 'B') continue;
    for (const c of [r.h, r.a]) {
      if (!concerneEffectif(c) || !c.effectif) continue;
      off.push(c.effectif.dOff);
      def.push(c.effectif.dDef);
    }
  }
  const sd = (v) => {
    const n = v.length;
    if (n < 2) return null;
    const m = v.reduce((s, x) => s + x, 0) / n;
    return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  };
  return { off: sd(off), def: sd(def), n: off.length };
}

export const concerneEffectif = (c) => c?.valide && c.statut === 'debut' && c.rang >= EFFECTIF.rangMin && c.rang <= EFFECTIF.rangMax;

/**
 * Les ensembles décidés APRÈS la passe : `fauxPromu` (un club `debut` tiré, rang ≤ 10) et `effectif` (un club `debut` de rang
 * 3 à 10 avec un Δ ; ses x standardisés posés, et ceux de son faux effectif). En place ; rend les records.
 */
export function marquerLesRecords(records, { seuilFauxPromu, ecartType = null }) {
  for (const r of records) {
    r.ens.fauxPromu = [r.h, r.a].some((c) => c.valide && c.statut === 'debut' && c.rang <= N_PREMIERES && estFauxPromu(c.club, c.saison, seuilFauxPromu));
    for (const c of [r.h, r.a]) {
      if (!c.valide) continue;
      c.fauxPromu = c.statut === 'debut' && c.rang !== null && estFauxPromu(c.club, c.saison, seuilFauxPromu);
      c.x = null;
      c.xFaux = null;
      if (ecartType && concerneEffectif(c)) {
        if (c.effectif && ecartType.off > 0 && ecartType.def > 0) c.x = { off: c.effectif.dOff / ecartType.off, def: c.effectif.dDef / ecartType.def };
        if (c.effectifFaux && ecartType.off > 0 && ecartType.def > 0) c.xFaux = { off: c.effectifFaux.dOff / ecartType.off, def: c.effectifFaux.dDef / ecartType.def };
      }
    }
    r.ens.effectif = Boolean(r.ens.rappel) && [r.h, r.a].some((c) => concerneEffectif(c) && c.x);
    r.ens.effectifFaux = Boolean(r.ens.rappel) && [r.h, r.a].some((c) => concerneEffectif(c) && c.xFaux);
  }
  return records;
}
