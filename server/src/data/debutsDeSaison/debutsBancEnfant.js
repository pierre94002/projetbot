/**
 * debutsBancEnfant.js — LE BANC DES DÉBUTS DE SAISON, DANS UN PROCESSUS À PART (étape 35 du plan, lot 1a, partie B, 09/11/2026).
 * -----------------------------------------------------------------------
 * Lancé par scripts/debuts-de-saison.mjs (fork, sérialisation « avancée », argument « --enfant-debuts-banc ») ; ce n'est pas un
 * script à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ; aucune
 * écriture, aucune horloge (seules des durées), ni réseau, ni Claude. Deux modes :
 *   « comptes »  AVANT LE REGARD : la passe des débuts SANS AUCUN RÉSULTAT (ni score, ni but, ni xG : seule la présence d'un
 *                score à la 90e), au magasin et à football-data ; les zones officielles de la saison d'avant (un compte de
 *                contrôle, jamais un chiffre) ; et, avec `effectif`, les Δ de la force de l'effectif : le rejeu des fiches de
 *                l'étape 30 (playerRatings.js, importé, jamais modifié) lit les feuilles d'avant J comme chaque nuit — la passe
 *                des débuts, elle, reçoit les rencontres SANS score ni xG ; aucune perte, aucun réglage ;
 *   « banc »     LE PASSAGE UNIQUE : la même passe AVEC les résultats (les forces de la candidate, AccumulateurDesForces),
 *                bornée au dernier jour lu (rien de P5 ; à football-data, rien après le 30/06/2023), les Δ de l'effectif au
 *                jour J (fiches publiées en fin de journée), le 1N2 d'avant-match (rapporté) ; puis bancDesDebuts.js juge.
 * `passerLesComptes` et `passerLeBanc` sont aussi appelables dans le processus courant (les essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { chargerLesRencontres, joueursDe, RejeuDesFiches } from '../db/playerRatings.js';
import { forceDeLEffectif } from '../db/squadChanges.js';
import { PERIODES_DU_BANC, NIVEAUX, NIVEAUX_FD, EFFECTIF, FORME_FD } from './reglagesDebuts.js';
import { rencontresDuMagasin, minutesParRencontre, depuisLeRejeu, rencontresFd, paysDesClubsFd, prix1n2DuMagasin } from './lectureDesDebuts.js';
import { passeDesDebuts, seuilDuFauxPromuDe, ecartTypeDeLEffectif, marquerLesRecords } from './passeDesDebuts.js';
import { comptesDUnePasse, controlesDesComptes } from './comptesDesDebuts.js';
import { jugerLesVariantes, valeursFinales, horizonDeLaPreuve, VARIANTES_JUGEES } from './bancDesDebuts.js';

const memoire = { max: 0 };
const noter = () => {
  memoire.max = Math.max(memoire.max, process.memoryUsage.rss());
};

/** Les zones officielles des classements (standings_official) : Map « league|saison|club » → description (un COMPTE de contrôle, jamais un chiffre). */
export function zonesOfficielles(database) {
  const out = new Map();
  let lignes;
  try {
    lignes = database.prepare('SELECT league, season, rows FROM standings_official').all();
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return out;
    throw error;
  }
  for (const l of lignes) {
    let rows;
    try {
      rows = JSON.parse(l.rows);
    } catch {
      continue;
    }
    for (const r of Array.isArray(rows) ? rows : []) {
      const m = /^fotmob-([1-9]\d*)$/.exec(String(r?.teamId ?? ''));
      if (!m || !r.description) continue;
      out.set(`${l.league}|${l.season}|${Number(m[1])}`, String(r.description));
    }
  }
  return out;
}

/**
 * LA FORCE DE L'EFFECTIF AU JOUR J (conception §2.8) : les minutes publiées du club (cette saison, la saison d'avant), les
 * fiches du rejeu publiées à la fin de la veille ; la même fiche pour les deux saisons. Les fiches sont gardées par jour.
 */
export function effectifDepuisLeRejeu(rejeu) {
  let jourDuCache = null;
  let cache = new Map();
  const ficheDe = (j) => {
    if (!cache.has(j)) {
      const f = rejeu.fiche(j);
      cache.set(j, f ? { apportOff: f.apportOff, apportDef: f.apportDef } : null);
    }
    return cache.get(j);
  };
  return (club, saison, jour, debuts) => {
    if (jour !== jourDuCache) {
      jourDuCache = jour;
      cache = new Map();
    }
    const ms = debuts.minutesDuClub(club, saison);
    const mav = debuts.minutesDuClub(club, saison - 1);
    if (!ms || !mav || !(ms.matchs >= EFFECTIF.minMatchs) || !(mav.matchs >= 1)) return null;
    const fiches = new Map();
    for (const j of [...ms.joueurs.keys(), ...mav.joueurs.keys()]) {
      const f = ficheDe(j);
      if (f) fiches.set(j, f);
    }
    return forceDeLEffectif({ minutesSaison: ms.joueurs, matchsSaison: ms.matchs, minutesAvant: mav.joueurs, matchsAvant: mav.matchs, fiches, minMatchs: EFFECTIF.minMatchs });
  };
}

/**
 * LA PASSE DU MAGASIN par le rejeu des fiches (comptes avec l'effectif, banc) : les rencontres de chargerLesRencontres, mises à
 * la forme de la passe (SANS score ni xG pour les comptes), le rejeu nourri APRÈS la publication de chaque journée (ses fiches
 * valent « la veille » au jour J). Rend la passe et la durée.
 */
function passeDuMagasinParLeRejeu(database, { periodes, avecResultats, effectif, prix1n2 = null }) {
  const t0 = performance.now();
  const rencontres = executerSansPause(chargerLesRencontres(database, { a: periodes.magasin.dernierJourLu }));
  noter();
  const duree = { lecture: Math.round(performance.now() - t0) };
  const t1 = performance.now();
  const rejeu = effectif ? new RejeuDesFiches() : null;
  const formes = rencontres.map((m) => {
    const r = depuisLeRejeu(m, joueursDe);
    if (!avecResultats) {
      r.faitDom = null;
      r.buts90 = null;
    }
    r.original = m;
    return r;
  });
  const passe = executerSansPause(
    passeDesDebuts({
      rencontres: formes,
      avecForces: avecResultats,
      fd: false,
      periodes,
      prix1n2,
      effectifAuJourJ: rejeu ? effectifDepuisLeRejeu(rejeu) : null,
      surJournee: rejeu
        ? (jour, debuts, duJour) => {
            for (const r of duJour) rejeu.ajouter(r.original);
            rejeu.finDeJournee();
          }
        : null
    })
  );
  for (const r of formes) delete r.original;
  noter();
  duree.passe = Math.round(performance.now() - t1);
  return { passe, duree };
}

/** LA PASSE DU MAGASIN SANS LE REJEU (les comptes sans l'effectif) : la lecture sans résultat, les minutes. */
function passeDuMagasinSansResultat(database, { periodes }) {
  const t0 = performance.now();
  const minutes = minutesParRencontre(database, { jusqua: periodes.magasin.dernierJourLu });
  const rencontres = [...rencontresDuMagasin({ database, jusqua: periodes.magasin.dernierJourLu, avecResultats: false, minutes })];
  noter();
  const passe = executerSansPause(passeDesDebuts({ rencontres, avecForces: false, fd: false, periodes }));
  noter();
  return { passe, duree: { total: Math.round(performance.now() - t0) } };
}

/** LA PASSE DE FOOTBALL-DATA (forces depuis 2000-07-01, jusqu'à la fin de P2). */
function passeFd(database, { periodes, avecResultats }) {
  const t0 = performance.now();
  const rencontres = rencontresFd({ database, de: periodes.fd.forcesDepuis, a: periodes.fd.dernierJourLu, avecResultats });
  const passe = executerSansPause(passeDesDebuts({ rencontres, avecForces: avecResultats, fd: true, periodes, garderTout: true }));
  noter();
  return { passe, duree: { total: Math.round(performance.now() - t0) } };
}

// ======================================================= le mode « comptes » (aucun résultat)

/**
 * LES COMPTES (AUCUN RÉSULTAT LU par la passe des débuts) : magasin et football-data, zones officielles, faux points, seuils du
 * faux promu, ensembles, continuité ; avec `effectif`, la couverture et l'écart-type des Δ (le rejeu des fiches). Rend
 * { aucunResultatLu, magasin, fd, controles, casse, seuils, ecartTypeEffectif, durees }.
 */
export function passerLesComptes({ database, periodes = PERIODES_DU_BANC, effectif = true }) {
  const t0 = performance.now();
  const mag = effectif ? passeDuMagasinParLeRejeu(database, { periodes, avecResultats: false, effectif: true }) : passeDuMagasinSansResultat(database, { periodes });
  const fd = passeFd(database, { periodes, avecResultats: false });
  const zones = zonesOfficielles(database);
  const pays = paysDesClubsFd(database);
  const magasin = comptesDUnePasse(mag.passe, { source: 'magasin', zones, niveaux: NIVEAUX, dernierJourLu: periodes.magasin.dernierJourLu });
  const cfd = comptesDUnePasse(fd.passe, { source: 'fd', paysDesClubs: pays, niveaux: NIVEAUX_FD, dernierJourLu: periodes.fd.dernierJourLu });
  const controles = controlesDesComptes({ magasin, fd: cfd });
  const ecartType = effectif ? ecartTypeDeLEffectif(mag.passe.records) : null;
  return {
    aucunResultatLu: true,
    effectifParLeRejeu: effectif,
    dernierJourLu: { magasin: periodes.magasin.dernierJourLu, fd: periodes.fd.dernierJourLu },
    magasin,
    fd: cfd,
    controles,
    casse: controles.some((c) => c.casse),
    ecartTypeEffectif: ecartType,
    formeFd: FORME_FD,
    durees: { magasin: mag.duree, fd: fd.duree, total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: memoire.max }
  };
}

// ======================================================= le mode « banc »

/**
 * LE PASSAGE DU BANC : les passes avec les résultats (magasin par le rejeu des fiches, football-data), les seuils du faux
 * promu et l'écart-type des Δ (sans résultat), puis le juge (K = les variantes déclarées), les valeurs finales et les horizons.
 * Rend { banc, comptesDuPassage, final, horizons, durees, aPart }.
 */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, K = undefined, variantes = VARIANTES_JUGEES, formeFd = FORME_FD }) {
  const t0 = performance.now();
  const prix1n2 = prix1n2DuMagasin(database);
  const mag = passeDuMagasinParLeRejeu(database, { periodes, avecResultats: true, effectif: true, prix1n2 });
  const fd = passeFd(database, { periodes, avecResultats: true });
  const seuilMagasin = seuilDuFauxPromuDe(mag.passe.comptes.clubsSaisons, ['A', 'B']);
  const seuilFd = seuilDuFauxPromuDe(fd.passe.comptes.clubsSaisons, ['P1', 'P2']);
  const ecartType = ecartTypeDeLEffectif(mag.passe.records);
  marquerLesRecords(mag.passe.records, { seuilFauxPromu: seuilMagasin.seuil, ecartType });
  marquerLesRecords(fd.passe.records, { seuilFauxPromu: seuilFd.seuil, ecartType: null });
  const records = [...mag.passe.records, ...fd.passe.records];
  noter();
  const t1 = performance.now();
  const banc = jugerLesVariantes(records, { periodes, variantes, formeFd, ...(K === undefined ? {} : { K }) });
  const dureeJuge = Math.round(performance.now() - t1);
  const final = valeursFinales(records, { formeFd, periodes });
  const horizons = Object.fromEntries(
    Object.entries(banc.familles)
      .filter(([, f]) => f.utile)
      .map(([nom, f]) => {
        const v = banc.variantes.find((x) => x.id === f.fenetres[f.fenetre].variante);
        return [nom, { fenetre: f.fenetre, matchs: horizonDeLaPreuve({ matchsJuges: v.matchsJuges, zObserve: v.zObserve }, banc.K) }];
      })
  );
  noter();
  const compter = (rs) => ({ records: rs.length, parFenetre: rs.reduce((o, r) => ({ ...o, [r.fenetre]: (o[r.fenetre] ?? 0) + 1 }), {}) });
  return {
    banc,
    comptesDuPassage: {
      magasin: { ...compter(mag.passe.records), lues: mag.passe.comptes.lues, deChampionnat: mag.passe.comptes.deChampionnat, sansScore90: mag.passe.comptes.sansScore90 },
      fd: { ...compter(fd.passe.records), lues: fd.passe.comptes.lues },
      seuilFauxPromu: { magasin: seuilMagasin, fd: seuilFd },
      ecartTypeEffectif: ecartType,
      prix1n2Magasin: prix1n2.size
    },
    final,
    horizons,
    durees: { magasin: mag.duree, fd: fd.duree, juge: dureeJuge, total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: memoire.max }
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-debuts-banc') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = passerLesComptes({ database, periodes: m.periodes ?? PERIODES_DU_BANC, effectif: m.effectif !== false });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, K: m.K, formeFd: m.formeFd ?? FORME_FD });
      else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
