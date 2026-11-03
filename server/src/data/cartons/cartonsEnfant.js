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
 *   « nuit »     (lot 1b, 02/11/2026) LA NUIT : lancé par cartonsNuit.js (argument « --enfant-cartons » lui aussi), l'instant
 *                de la passe REÇU (jamais l'horloge) : le cache incrémental (seules les rencontres nouvelles ou changées
 *                relues ; les lignes à écrire et les clés à retirer renvoyées au serveur, qui range), la passe
 *                chronologique de tout le registre jusqu'à la VEILLE du jour de la nuit, les tables du jour (équipes,
 *                arbitres, compétitions, couverture par compétition-saison) et le contrôle anti-fuite (second chemin :
 *                controleDesCartons.js). Rien n'est écrit ici ; renvoyé par morceaux, puis la fin.
 * `compterLesCartons`, `passerLeBanc` et `calculerLaNuitDesCartons` sont aussi appelables dans le processus courant (les
 * essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { mettreAJourLeCache, rencontresChronologiques } from './lectureDesCartons.js';
import { comptesDesCartons } from './comptesDesCartons.js';
import { PERIODES_DU_BANC } from './reglagesCartons.js';
import { donneesDuBanc, jugerLesVariantes, valeursFinales, horizonDeLaPreuve } from './bancDesCartons.js';
import { NUIT, VERSION_CARTONS } from './reglagesCartons.js';
import { CartonsAuJourJ, passerLesRencontres } from './cartonsAuJourJ.js';
import { cleDArbitre } from './formulesDesCartons.js';
import { tirerLesCouples, instantaneDeLaPasse, controlerLesInstantanes } from './controleDesCartons.js';

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

// ------------------------------------------------------------ la nuit (lot 1b)

/** Lignes par morceau renvoyé au serveur. */
export const LIGNES_PAR_MORCEAU = 500;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/**
 * L'accumulateur de la nuit : CartonsAuJourJ, plus des relevés qui ne changent aucun chiffre — (1) les couples du
 * contrôle anti-fuite relevés AU MOMENT où les instantanés de leur journée sont pris (AVANT la publication de cette
 * journée ; `fuite` : après — la fuite plantée des essais) ; (2) chaque entrée des fenêtres d'équipe marquée de sa clé et
 * de son jour (ce que le contrôle compare), le dernier championnat de chaque club, le nom et le pays de chaque arbitre,
 * la couverture par compétition-saison (statuts après la garde ; les cartons du banc et du staff comptés à part :
 * critique, constat 4).
 */
class CartonsDeLaNuit extends CartonsAuJourJ {
  constructor({ couples = [], fuite = false } = {}) {
    super();
    this.parJour = new Map();
    for (const c of couples) {
      if (!this.parJour.has(c.date)) this.parJour.set(c.date, []);
      this.parJour.get(c.date).push(c);
    }
    this.fuite = fuite;
    this.instantanes = new Map();
    this.nomsDesArbitres = new Map();
    this.ligueDuClub = new Map();
    this.couverture = new Map();
    this.rencontres = 0;
    this.jours = 0;
  }

  relever(jour, duJour) {
    for (const c of this.parJour.get(jour) ?? []) {
      const r = duJour.find((x) => x.matchKey === c.matchKey);
      if (r) this.instantanes.set(`${c.matchKey}|${c.camp}`, instantaneDeLaPasse(this, c, r));
    }
  }

  finDeJournee() {
    const duJour = this.enAttente;
    const jour = this.jourEnAttente;
    if (jour !== null && !this.fuite) this.relever(jour, duJour);
    const inst = super.finDeJournee();
    if (jour === null) return inst;
    if (this.fuite) this.relever(jour, duJour);
    this.jours++;
    const nouveaux = new Map();
    for (const r of duJour) {
      this.rencontres++;
      const x = inst.get(r.matchKey);
      const cle = cleDArbitre(r.arbitre);
      if (cle && !this.nomsDesArbitres.has(cle)) this.nomsDesArbitres.set(cle, { nom: r.arbitre.nom, pays: r.arbitre.pays ?? '' });
      const cs = `${r.league}|${r.saison ?? ''}`;
      let cv = this.couverture.get(cs);
      if (!cv) {
        cv = { league: r.league, saison: r.saison ?? null, matchs: 0, releves: 0, cartons: 0, horsTerrain: 0, statuts: {} };
        this.couverture.set(cs, cv);
      }
      cv.matchs++;
      cv.statuts[x.statut] = (cv.statuts[x.statut] ?? 0) + 1;
      if (x.releve && r.valeur) {
        cv.releves++;
        cv.cartons += r.valeur.total;
        cv.horsTerrain += r.deroule?.horsTerrain ?? 0;
      }
      if (!x.releve || !r.valeur || !x.m) continue;
      for (const club of [r.home, r.away]) {
        if (!nouveaux.has(club)) nouveaux.set(club, []);
        nouveaux.get(club).push(r);
      }
    }
    for (const [club, rs] of nouveaux) {
      const f = this.equipes.get(club) ?? [];
      const k = Math.min(rs.length, f.length);
      for (let i = 0; i < k; i++) {
        const e = f[f.length - k + i];
        const r = rs[rs.length - k + i];
        e.matchKey = r.matchKey;
        e.date = r.date;
      }
      this.ligueDuClub.set(club, rs.at(-1).league);
    }
    return inst;
  }
}

/**
 * LE CALCUL DE LA NUIT DES CARTONS (le corps du processus à part ; aussi appelable ici pour les essais). `database` : une
 * base ouverte (en lecture seule dans la nuit) ; `instant` (ms) et `jourD` (le jour de Paris de la passe) : reçus ;
 * `graine` : celle du contrôle ; `couples` : leur nombre ; `fuite` : la fuite plantée des essais ; `envoyer(type,
 * lignes)` reçoit chaque morceau (« rencontres », « retirees », « equipes », « arbitres »). Rend { ligues, couverture,
 * controle, bilan }. L'état est pris par etatAuJourJ(jourD), qui LÈVE si la passe contient le jour de la nuit.
 */
export function calculerLaNuitDesCartons({ database, instant, jourD, graine = null, couples: nombreDeCouples = NUIT.couples, fuite = false, envoyer = () => {} }) {
  const t0 = performance.now();
  const durees = {};
  let rssMax = process.memoryUsage.rss();
  const mesurer = (nom, debut) => {
    durees[nom] = Math.round(performance.now() - debut);
    rssMax = Math.max(rssMax, process.memoryUsage.rss());
  };
  const parMorceaux = (type, lignes) => {
    for (let i = 0; i < lignes.length; i += LIGNES_PAR_MORCEAU) envoyer(type, lignes.slice(i, i + LIGNES_PAR_MORCEAU));
  };
  const calculeLe = new Date(instant).toISOString();
  const veille = plusJours(jourD, -1);

  // 1. Le cache incrémental des rencontres.
  let t = performance.now();
  const maj = executerSansPause(mettreAJourLeCache(database));
  parMorceaux('rencontres', maj.aEcrire);
  parMorceaux('retirees', maj.aRetirer);
  mesurer('cache', t);

  // 2. La passe, jusqu'à la veille du jour de la nuit, avec le relevé des couples du contrôle.
  t = performance.now();
  const couples = tirerLesCouples({ database, jourD, graine, nombre: nombreDeCouples });
  const acc = new CartonsDeLaNuit({ couples, fuite });
  executerSansPause(passerLesRencontres(acc, rencontresChronologiques({ database, cache: maj.cache, jusqua: veille })));
  const etat = acc.etatAuJourJ(jourD);
  mesurer('passe', t);

  // 3. Les tables du jour : équipes, arbitres (les faux arbitres du placebo restent en mémoire), compétitions, couverture.
  t = performance.now();
  const equipes = Object.entries(etat.equipes).map(([club, e]) => {
    const f = acc.equipes.get(Number(club)) ?? [];
    return { club: Number(club), n: e.n, pris: e.pris, provoques: e.provoques, rho: e.rho, pi: e.pi, dernier: f.length ? f[f.length - 1].date ?? null : null, league: acc.ligueDuClub.get(Number(club)) ?? null, calcule_le: calculeLe, version: VERSION_CARTONS };
  });
  parMorceaux('equipes', equipes);
  const arbitres = Object.entries(etat.arbitres)
    .filter(([cle]) => !cle.startsWith('faux:'))
    .map(([cle, a]) => {
      const qui = acc.nomsDesArbitres.get(cle) ?? { nom: cle.split('|')[0], pays: cle.split('|').slice(1).join('|') };
      return { cle, nom: qui.nom, pays: qui.pays ?? '', matchs: a.n, observes: a.O, attendus: a.E, indice: a.z, premier: a.premier, dernier: a.dernier, ligues: JSON.stringify(a.ligues), calcule_le: calculeLe, version: VERSION_CARTONS };
    });
  parMorceaux('arbitres', arbitres);
  const ligues = etat.ligues;
  const couverture = [...acc.couverture.values()].sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : String(a.saison) < String(b.saison) ? -1 : String(a.saison) > String(b.saison) ? 1 : 0));
  mesurer('tables', t);

  // 4. Le contrôle anti-fuite (le second chemin).
  t = performance.now();
  const noms = new Map();
  const nomDuClub = (club) => {
    if (!noms.has(club)) {
      let nom = null;
      try {
        nom = database.prepare('SELECT name FROM teams WHERE team_id = ?').get(`fotmob-${club}`)?.name ?? null;
      } catch {
        nom = null;
      }
      noms.set(club, nom ?? `club n° ${club}`);
    }
    return noms.get(club);
  };
  const controle = controlerLesInstantanes({ database, couples, instantanes: acc.instantanes, nomDuClub });
  mesurer('controle', t);

  return {
    ligues,
    couverture,
    controle: { lignes: controle.lignes, ecarts: controle.ecarts, couples: couples.length, ligues: controle.ligues },
    bilan: {
      calculeLe,
      jourD,
      cache: { mode: maj.mode, relues: maj.relues, ecrites: maj.aEcrire.length, retirees: maj.aRetirer.length, total: maj.cache.size },
      passe: {
        rencontres: acc.rencontres,
        jours: acc.jours,
        dernierJour: acc.jour,
        releves: couverture.reduce((s, c) => s + c.releves, 0),
        ligneAZero: couverture.reduce((s, c) => s + (c.statuts['ligne-a-zero'] ?? 0), 0),
        horsTerrain: couverture.reduce((s, c) => s + c.horsTerrain, 0)
      },
      equipes: equipes.length,
      arbitres: arbitres.length,
      ligues: Object.keys(ligues).length,
      dureeMs: Math.round(performance.now() - t0),
      durees,
      aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
    }
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
      else if (m.mode === 'nuit') {
        const fin = calculerLaNuitDesCartons({ ...m, database, envoyer: (type, lignes) => process.send({ morceau: { type, lignes } }) });
        process.send({ fin: true, mode: m.mode, ...fin }, () => process.exit(0));
        return;
      } else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
