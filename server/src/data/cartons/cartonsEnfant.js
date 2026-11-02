/**
 * cartonsEnfant.js — LES CARTONS, DANS UN PROCESSUS À PART (étape 33 du plan, lot 1a, partie B, 02/11/2026).
 * -----------------------------------------------------------------------
 * UN SEUL fichier d'enfant, à modes (critique de l'étape 33, recommandation 4) ; lancé par scripts/cartons-corners.mjs
 * (fork, sérialisation « avancée », argument « --enfant-cartons ») — la nuit (lot 1b) y ajoutera son mode. Ce n'est pas un
 * script à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ;
 * aucune écriture, aucune horloge (seules des durées), ni réseau, ni Claude. Deux modes :
 *   « comptes »  AVANT LE REGARD : le cache des cartons relu en mémoire (rien n'est rangé), le flux jusqu'au dernier jour
 *                lu, la passe et les comptes (comptesDesCartons.js : statuts, accords, couvertures, TAILLES des fenêtres —
 *                jamais une moyenne, un attendu ni une perte) ; et, sur l'archive d'avant-match de l'étape 32 (si la base
 *                l'a), la couverture de l'arbitre désigné et la part d'arbitres d'après-match différents (critique,
 *                constat 12 : la validité du proxy du banc) ;
 *   « banc »     LE PASSAGE UNIQUE : la même lecture, bornée au dernier jour lu (rien de P5) ; donneesDuBanc, puis
 *                jugerLesVariantes, valeursFinales et les horizons (bancDesCartons.js).
 * `compterLesCartons` et `passerLeBanc` sont aussi appelables dans le processus courant (les essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { mettreAJourLeCache, rencontresChronologiques } from './lectureDesCartons.js';
import { comptesDesCartons } from './comptesDesCartons.js';
import { PERIODES_DU_BANC } from './reglagesCartons.js';
import { donneesDuBanc, jugerLesVariantes, valeursFinales, horizonDeLaPreuve } from './bancDesCartons.js';

const JOUR_MS = 86_400_000;
const absente = (error) => /no such table/i.test(String(error?.message ?? ''));

/** Le cache relu EN MÉMOIRE jusqu'au dernier jour lu (rien de P5) ; rien n'est rangé. */
function lireLeMagasin(database, periodes) {
  const t = performance.now();
  const maj = executerSansPause(mettreAJourLeCache(database, { jusqua: periodes.dernierJourLu }));
  return { cache: maj.cache, relues: maj.relues, mode: maj.mode, dureeCache: Math.round(performance.now() - t) };
}

/**
 * L'ARCHIVE D'AVANT-MATCH de l'étape 32 (contexte_avant_match, écrite avant le coup d'envoi) : combien de rencontres y
 * ont un arbitre désigné, et, parmi celles rattachées au magasin, combien ont un arbitre d'après-match DIFFÉRENT (nom
 * exact). Aucun carton, aucun score. null si la table n'existe pas dans cette base.
 */
export function couvertureDeLArchive(database) {
  try {
    const r = database
      .prepare(
        `SELECT COUNT(*) AS rencontres,
           SUM(CASE WHEN json_extract(a.avant_match, '$.referee.name') IS NOT NULL THEN 1 ELSE 0 END) AS avecArbitre
         FROM contexte_avant_match a`
      )
      .get();
    const c = database
      .prepare(
        `SELECT COUNT(*) AS rattachees,
           SUM(CASE WHEN json_extract(m.meta, '$.referee.name') IS NULL THEN 1 ELSE 0 END) AS sansArbitreApres,
           SUM(CASE WHEN json_extract(m.meta, '$.referee.name') IS NOT NULL AND json_extract(m.meta, '$.referee.name') <> json_extract(a.avant_match, '$.referee.name') THEN 1 ELSE 0 END) AS differents
         FROM contexte_avant_match a JOIN matches m ON m.fotmob_id = a.fotmob_id
         WHERE json_extract(a.avant_match, '$.referee.name') IS NOT NULL`
      )
      .get();
    return { rencontres: r.rencontres, avecArbitreDesigne: r.avecArbitre ?? 0, rattacheesAuMagasin: c.rattachees, sansArbitreApres: c.sansArbitreApres ?? 0, arbitreApresDifferent: c.differents ?? 0 };
  } catch (error) {
    if (absente(error) || /no such column/i.test(String(error?.message ?? ''))) return { absente: true, raison: String(error.message).slice(0, 200) };
    throw error;
  }
}

/** LES COMPTES (avant le regard) : aucune moyenne, aucun attendu, aucune perte. */
export function compterLesCartons({ database, periodes = PERIODES_DU_BANC }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const m = lireLeMagasin(database, periodes);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t = performance.now();
  const comptes = executerSansPause(comptesDesCartons(rencontresChronologiques({ database, cache: m.cache, jusqua: periodes.dernierJourLu }), { periodes }));
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    aucunAttenduNiPerte: true,
    dernierJourLu: periodes.dernierJourLu,
    cache: { relues: m.relues, mode: m.mode },
    comptes,
    archiveDAvantMatch: couvertureDeLArchive(database),
    durees: { cache: m.dureeCache, comptes: Math.round(performance.now() - t), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

/** LE PASSAGE UNIQUE DU BANC : les données, les verdicts, les valeurs finales, les horizons des variantes utiles. */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, K, tirages, graine, minBlocs }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const m = lireLeMagasin(database, periodes);
  const t1 = performance.now();
  const donnees = executerSansPause(donneesDuBanc(rencontresChronologiques({ database, cache: m.cache, jusqua: periodes.dernierJourLu }), { periodes }));
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t2 = performance.now();
  const banc = jugerLesVariantes(donnees, { periodes, K, ...(tirages ? { tirages } : {}), ...(graine ? { graine } : {}), ...(minBlocs ? { minBlocs } : {}) });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t3 = performance.now();
  const final = valeursFinales(donnees);
  // L'horizon de chaque variante utile, au rythme mesuré des matchs jugeables sur la période la plus récente (B).
  const B = periodes.plis[0].juger;
  const joursB = Math.round((Date.parse(`${B.a}T00:00:00Z`) - Date.parse(`${B.de}T00:00:00Z`)) / JOUR_MS) + 1;
  const horizons = {};
  for (const v of banc.variantes) {
    if (!v.utile) continue;
    const lignesB = v.famille === 'cartons' ? donnees.cartons.filter((x) => x.pli === 'B').length : donnees.stats[v.stat].filter((x) => x.pli === 'B').length;
    horizons[v.id] = horizonDeLaPreuve({ nBanc: v.matchsJuges, zBanc: v.zObserve, K: banc.K, parJour: lignesB / joursB });
  }
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    comptesDuPassage: { lues: donnees.lues, miseEnRoute: donnees.miseEnRoute, cartons: banc.matchs.cartons, stats: banc.matchs.stats, cache: { relues: m.relues, mode: m.mode } },
    banc,
    final,
    horizons,
    durees: { cache: m.dureeCache, donnees: Math.round(t2 - t1), juge: Math.round(t3 - t2), final: Math.round(performance.now() - t3), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-cartons') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLesCartons({ database, periodes: m.periodes ?? PERIODES_DU_BANC });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, K: m.K, tirages: m.tirages, graine: m.graine, minBlocs: m.minBlocs });
      else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
