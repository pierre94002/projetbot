/**
 * joueursEnfant.js — LES CHIFFRES DES JOUEURS, DANS UN PROCESSUS À PART (étape 34 du plan, lot 1a, partie B, 03/11/2026).
 * -----------------------------------------------------------------------
 * UN SEUL fichier d'enfant, à modes (comme cartonsEnfant.js de la 33) ; lancé par scripts/joueurs-a-blanc.mjs (fork,
 * sérialisation « avancée », argument « --enfant-joueurs ») — la nuit (lot 1b) y ajoutera son mode. Ce n'est pas un script
 * à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ; aucune
 * écriture, aucune horloge (seules des durées), ni réseau, ni Claude. Deux modes :
 *   « comptes »  AVANT LE REGARD : la passe chronologique jusqu'au dernier jour lu et les comptes (comptesDesJoueurs.js :
 *                couvertures, relevés, règle des penalties par année, compositions, faux joueurs — jamais une perte, un
 *                attendu ni une part de joueur) ;
 *   « banc »     LE PASSAGE UNIQUE : la même passe ; les données du banc, puis jugerLesVariantes, valeursFinales et les
 *                horizons (bancDesJoueurs.js).
 * LA PASSE (passeDesJoueurs, commune) : trois accumulateurs côte à côte, journée par journée, tous publiés en fin de
 * journée —
 *   - CartonsAuJourJ de la 33 (le flux des cartons construit EN MÉMOIRE par la fonction même de l'enfant du banc de la 33 :
 *     mettreAJourLeCache jusqu'au dernier jour lu, puis rencontresChronologiques de lectureDesCartons.js — critique,
 *     constat 7) : le statut des cartons du jour J (relevés, garde comprise) et la moyenne de la compétition pour chaque
 *     côté au jour J (C, « le repère de la 33 sans la pente »), la MÊME base au banc, à l'écran et dans l'archive ;
 *   - AccumulateurDesForces (forcesButs.js) et modeleDeButs sans cote (BASE_STATISTIQUE de la 32) : λS et μS au jour J,
 *     comme passeDuBanc de la 32 (T-F5) ;
 *   - JoueursAuJourJ : les entrées de chaque composition au jour J.
 * `passeDesJoueurs`, `compterLesJoueurs` et `passerLeBanc` sont aussi appelables dans le processus courant (les essais,
 * sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre, empreinteDesForces } from '../../core/engine/goalModel.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE } from '../contexte/bancDuContexte.js';
import { mettreAJourLeCache, rencontresChronologiques as fluxDesCartons } from '../cartons/lectureDesCartons.js';
import { CartonsAuJourJ } from '../cartons/cartonsAuJourJ.js';
import { PERIODES_DU_BANC, BORNES_LAMBDA } from './reglagesJoueurs.js';
import { JoueursAuJourJ } from './joueursAuJourJ.js';
import { rencontresChronologiques, fusions } from './lectureDesJoueurs.js';
import { compteurDesJoueurs } from './comptesDesJoueurs.js';
import { DonneesDuBanc, jugerLesVariantes, valeursFinales, horizonDeLaPreuve } from './bancDesJoueurs.js';

const JOUR_MS = 86_400_000;
if (empreinteDesForces(BASE_STATISTIQUE) !== EMPREINTE_DE_LA_BASE) throw new Error('joueurs : l’empreinte des forces de la base a changé');
if (BASE_STATISTIQUE.bornes[0] !== BORNES_LAMBDA[0] || BASE_STATISTIQUE.bornes[1] !== BORNES_LAMBDA[1]) throw new Error('joueurs : les bornes de λ ne sont plus celles de la base statistique');

/** Le flux des cartons EN MÉMOIRE jusqu'au dernier jour lu (la fonction de l'enfant du banc de la 33 ; rien n'est rangé). */
export function fluxDesCartonsEnMemoire(database, jusqua) {
  const t = performance.now();
  const maj = executerSansPause(mettreAJourLeCache(database, { jusqua }));
  return { cache: maj.cache, relues: maj.relues, mode: maj.mode, duree: Math.round(performance.now() - t) };
}

/**
 * LA PASSE COMMUNE (comptes et banc) : les rencontres jusqu'au dernier jour lu (rien de P5) ; pour chaque journée, dans
 * l'ordre : les cartons du jour (statut relevé et moyennes d'avant la journée) posés sur chaque rencontre ; la base λ de
 * chaque rencontre non attribuée (forces d'avant la journée) ; la dernière feuille de chaque club (d'avant la journée) ;
 * les entrées des compositions (JoueursAuJourJ, d'avant la journée) ; `surObservation(o)` pour chaque rencontre ; puis
 * les forces de la journée publiées. Rend { lues, durees, cartons: { relues, mode } }.
 */
export function passeDesJoueurs({ database, periodes = PERIODES_DU_BANC, surObservation }) {
  const durees = {};
  let t = performance.now();
  const cartons = fluxDesCartonsEnMemoire(database, periodes.dernierJourLu);
  durees.cartons = cartons.duree;
  t = performance.now();
  const parFusion = fusions(database);
  const accC = new CartonsAuJourJ();
  const accF = new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] });
  const accJ = new JoueursAuJourJ();
  const itC = fluxDesCartons({ database, cache: cartons.cache, jusqua: periodes.dernierJourLu })[Symbol.iterator]();
  let lues = 0;
  let jour = null;
  let duJour = [];
  const publier = () => {
    if (!duJour.length) return;
    // 1. Les cartons du jour (le même registre, le même ordre (jour, clé) que le flux des joueurs).
    const cartonsDuJour = [];
    for (let k = 0; k < duJour.length; k++) {
      const n = itC.next();
      if (n.done || n.value.matchKey !== duJour[k].matchKey) throw new Error(`passe des joueurs : le flux des cartons n’est pas aligné (${duJour[k].matchKey} ≠ ${n.done ? 'fin' : n.value.matchKey})`);
      cartonsDuJour.push(n.value);
      accC.ajouter(n.value);
    }
    const instC = accC.finDeJournee();
    // 2. La base λ (forces d'avant la journée), la dernière feuille, puis les entrées des compositions.
    const observations = duJour.map((r) => {
      const c = instC.get(r.matchKey);
      r.cartonsReleves = Boolean(c?.releve);
      let lambda = null;
      if (!r.attribue) {
        const s = modeleDeButs({
          fair: null,
          entrees: { forces: { home: accF.etat(EMPREINTE_DE_LA_BASE, r.home), away: accF.etat(EMPREINTE_DE_LA_BASE, r.away) }, ligue: accF.moyennes(r.league, jour, saisonEnNombre(r.saison)), plusMoins: null },
          reglages: BASE_STATISTIQUE
        }).parties.statistiques;
        lambda = { lambda: s.lambda, mu: s.mu };
      }
      const cadres = r.camps.home.cadresAttendus !== null && r.camps.away.cadresAttendus !== null ? { home: r.camps.home.cadresAttendus, away: r.camps.away.cadresAttendus } : null;
      return { r, base: { lambda, cadres, cartons: c?.m ? { dom: c.m.dom, ext: c.m.ext } : null }, cartons: { statut: c?.statut ?? null, releve: Boolean(c?.releve) }, dernieres: { home: accJ.derniereFeuille(r.home), away: accJ.derniereFeuille(r.away) } };
    });
    for (const r of duJour) accJ.ajouter(r);
    const entrees = accJ.finDeJournee();
    for (const o of observations) {
      o.entrees = entrees.get(o.r.matchKey);
      surObservation(o);
    }
    // 3. Les forces de la journée, publiées.
    for (const r of duJour) {
      const f = faitsDeLaRencontre(r.fait);
      if (f) accF.ajouter(f.dom, f.ext);
    }
    accF.finDeJournee();
    lues += duJour.length;
    duJour = [];
  };
  for (const r of rencontresChronologiques({ database, jusqua: periodes.dernierJourLu, parFusion })) {
    if (jour !== null && r.date < jour) throw new Error(`passe des joueurs : rencontres dans le désordre (${r.date} après ${jour})`);
    if (jour !== null && r.date !== jour) publier();
    jour = r.date;
    duJour.push(r);
  }
  publier();
  if (!itC.next().done) throw new Error('passe des joueurs : le flux des cartons a des rencontres de plus');
  durees.passe = Math.round(performance.now() - t);
  return { lues, durees, cartons: { relues: cartons.relues, mode: cartons.mode } };
}

/** LES COMPTES (avant le regard) : aucune perte, aucun attendu, aucune part de joueur. */
export function compterLesJoueurs({ database, periodes = PERIODES_DU_BANC }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const compteur = compteurDesJoueurs({ periodes });
  let n = 0;
  const passe = passeDesJoueurs({
    database,
    periodes,
    surObservation: (o) => {
      // Les entrées des compositions ne sont pas lues : seules les PRÉSENCES de la base comptent (aucune part de joueur).
      compteur.ajouter({ r: o.r, base: { lambda: Boolean(o.base.lambda), cadres: Boolean(o.base.cadres), cartons: Boolean(o.base.cartons) }, dernieres: o.dernieres });
      if (++n % 5000 === 0) rssMax = Math.max(rssMax, process.memoryUsage.rss());
    }
  });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t = performance.now();
  const comptes = compteur.fin();
  return {
    aucunAttenduNiPerte: true,
    dernierJourLu: periodes.dernierJourLu,
    lues: passe.lues,
    cartons: passe.cartons,
    comptes,
    durees: { ...passe.durees, comptes: Math.round(performance.now() - t), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
  };
}

/** LE PASSAGE UNIQUE DU BANC : les données, les verdicts, les valeurs finales, les horizons des variantes utiles. */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, K, tirages, graine, minBlocs }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const D = new DonneesDuBanc({ camps: 1 << 17, lignes: 1 << 20 });
  const passe = passeDesJoueurs({ database, periodes, surObservation: (o) => D.ajouterLObservation(o, { periodes }) });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t2 = performance.now();
  const banc = jugerLesVariantes(D, { periodes, K, ...(tirages ? { tirages } : {}), ...(graine ? { graine } : {}), ...(minBlocs ? { minBlocs } : {}) });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t3 = performance.now();
  const final = valeursFinales(D);
  // L'horizon de chaque variante utile, au rythme mesuré des matchs jugés de la fenêtre la plus récente (B).
  const B = periodes.plis.find((p) => p.nom === 'B').juger;
  const joursB = Math.round((Date.parse(`${B.a}T00:00:00Z`) - Date.parse(`${B.de}T00:00:00Z`)) / JOUR_MS) + 1;
  const horizons = {};
  for (const v of banc.variantes) if (v.utile) horizons[v.id] = horizonDeLaPreuve({ nBanc: v.matchsJuges, zBanc: v.zObserve, K: banc.K, parJour: (v.matchsJuges * (D.campsDu('B').length / Math.max(1, D.nCamps))) / joursB });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    comptesDuPassage: { lues: passe.lues, miseEnRoute: D.miseEnRoute, camps: banc.camps, cartons: passe.cartons },
    banc,
    final,
    horizons,
    durees: { ...passe.durees, juge: Math.round(t3 - t2), final: Math.round(performance.now() - t3), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-joueurs') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLesJoueurs({ database, periodes: m.periodes ?? PERIODES_DU_BANC });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, K: m.K, tirages: m.tirages, graine: m.graine, minBlocs: m.minBlocs });
      else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
