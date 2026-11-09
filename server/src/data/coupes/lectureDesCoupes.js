/**
 * lectureDesCoupes.js — CE QUE LES COUPES LISENT DU MAGASIN (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Des LECTURES seulement, sur la base de l'appelant (aucune écriture, aucune horloge) — le processus à part de la nuit,
 * des comptes et de la calibration ouvre la base EN LECTURE SEULE (coupesEnfant.js). Les clubs par leur IDENTIFIANT
 * FotMob en nombre (une seule conversion : numeroDuClub de l'étape 32), jamais par un nom.
 *   - `rencontresDeCoupe` : les rencontres des 24 coupes (structure, intitulé et phase, fin, score, stade, score à la
 *     90e de la table du jour J) ; le déroulé et la carte des tirs SEULEMENT pour les matchs finis après la 90e (la règle
 *     du format, le vainqueur de la séance) ;
 *   - `passeDesForces` : la base statistique au jour J (forces de la candidate 27, régime sans cote) — la passe de
 *     l'étape 32 (day_matches × team_day, camp qui reçoit, dans l'ordre jour puis clé), refaite ici pour les seuls
 *     matchs demandés : λS et μS AVANT la journée, puis la journée publiée (T-Q5 : les mêmes à l'octet) ;
 *   - `receptionsDesClubs` : les matchs à domicile de chaque club (toutes compétitions) et leur stade ;
 *   - pour la nuit : la page relevée (upcoming_lineups), l'archive d'avant-match (contexte_avant_match), la dernière
 *     ligne « service » de la simulation de l'étape 28 (simulation_matchs).
 * -----------------------------------------------------------------------
 */

import { CUPS_BY_LEAGUE } from '../providers/leagueCups.js';
import { numeroDuClub, texteStable } from '../contexte/formulesDuContexte.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre, empreinteDesForces } from '../../core/engine/goalModel.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE } from './reglagesCoupes.js';

/** Les 24 coupes du magasin (leagueCups.js, isCup), dans l'ordre alphabétique. */
export const COUPES = Object.freeze([...new Set(Object.values(CUPS_BY_LEAGUE).flat())].sort());

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nombreOuNull = (x) => (x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const json = (t) => {
  if (t === null || t === undefined) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** La lecture des rencontres de coupe (une ligne par match ; le score à la 90e par la table du jour J, camp qui reçoit). */
export const SQL_RENCONTRES = (n) => `SELECT m.match_key, m.fotmob_id, m.date, m.league, m.home_id, m.away_id, m.home_goals, m.away_goals,
  m.updated_at, m.events IS NOT NULL AS a_deroule,
  json_extract(m.meta, '$.round') AS tour, json_extract(m.meta, '$.leagueKey') AS phase, json_extract(m.meta, '$.reason') AS fin,
  json_extract(m.meta, '$.awarded') AS awarded, json_extract(m.meta, '$.stadium') AS stade, json_extract(m.meta, '$.city') AS ville,
  json_extract(m.meta, '$.lat') AS lat, json_extract(m.meta, '$.long') AS long,
  CASE WHEN json_extract(m.meta, '$.reason') IN ('afterextra', 'afterpenalties') THEN m.events END AS events,
  CASE WHEN json_extract(m.meta, '$.reason') IN ('afterextra', 'afterpenalties') THEN m.shotmap END AS shotmap,
  t.bp90, t.bc90
  FROM matches m
  LEFT JOIN day_matches d ON d.match_key = m.match_key
  LEFT JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE m.league IN (${Array.from({ length: n }, () => '?').join(', ')}) AND m.date >= ? AND m.date <= ?
  ORDER BY m.league, m.date, m.match_key`;

/** Une rencontre de coupe lue (la forme de toursDeCoupe.js et confrontations.js). */
export function rencontreDeLaLigne(l) {
  const awarded = l.awarded === 1 || l.awarded === true || l.awarded === 'true';
  return {
    matchKey: l.match_key,
    fotmobId: l.fotmob_id ?? null,
    date: l.date,
    league: l.league,
    home: numeroDuClub(l.home_id),
    away: numeroDuClub(l.away_id),
    hg: nombreOuNull(l.home_goals),
    ag: nombreOuNull(l.away_goals),
    fin: l.fin ?? null,
    awarded,
    tour: l.tour === null || l.tour === undefined ? null : String(l.tour),
    phase: l.phase ?? null,
    stade: texteStable(l.stade ?? null),
    ville: texteStable(l.ville ?? null),
    lat: nombreOuNull(l.lat),
    long: nombreOuNull(l.long),
    updatedAt: l.updated_at ?? null,
    aDeroule: Boolean(Number(l.a_deroule)),
    events: Array.isArray(json(l.events)) ? json(l.events) : null,
    shotmap: Array.isArray(json(l.shotmap)) ? json(l.shotmap) : null,
    bp90: nombreOuNull(l.bp90),
    bc90: nombreOuNull(l.bc90)
  };
}

/** LES RENCONTRES DE COUPE de `depuis` à `jusqua` inclus (générateur), par compétition puis par date. */
export function* rencontresDeCoupe(database, { depuis = '2000-01-01', jusqua, coupes = COUPES } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jusqua ?? ''))) throw new Error(`coupes : dernier jour illisible (« ${String(jusqua)} »)`);
  for (const l of database.prepare(SQL_RENCONTRES(coupes.length)).iterate(...coupes, depuis, jusqua)) yield rencontreDeLaLigne(l);
}

/** La lecture de la passe des forces : celle de l'étape 32 (SQL_DU_BANC, sans ce que les forces ne lisent pas), même ordre. */
export const SQL_PASSE = `SELECT d.match_key, d.date, d.league, d.saison, d.home, d.away,
  t.club, t.adversaire, t.camp, t.attribue, t.prolongation, t.compte, t.coupe, t.bp, t.bc, t.bp90, t.bc90, t.xg_p, t.xg_c
  FROM day_matches d
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE d.date <= ?
  ORDER BY d.date, d.match_key`;

if (empreinteDesForces(BASE_STATISTIQUE) !== EMPREINTE_DE_LA_BASE) throw new Error('coupes : l’empreinte des forces de la base a changé');

/**
 * LA BASE STATISTIQUE AU JOUR J des matchs `cles` (un Set de match_key) : la passe de tout le magasin jusqu'à `jusqua`,
 * les forces publiées jour après jour ; pour un match demandé (non attribué), λS et μS AVANT sa journée. Rend une Map
 * match_key → { lambdaS, muS, jour } et { lues } (le nombre de rencontres lues).
 */
export function passeDesForces(database, { jusqua, cles }) {
  const acc = new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] });
  const bases = new Map();
  let jour = null;
  let duJour = [];
  let lues = 0;
  const publier = () => {
    if (!duJour.length) return;
    for (const l of duJour) {
      if (!cles.has(l.match_key) || Number(l.attribue)) continue;
      const s = modeleDeButs({
        fair: null,
        entrees: { forces: { home: acc.etat(EMPREINTE_DE_LA_BASE, Number(l.home)), away: acc.etat(EMPREINTE_DE_LA_BASE, Number(l.away)) }, ligue: acc.moyennes(l.league, jour, saisonEnNombre(l.saison)), plusMoins: null },
        reglages: BASE_STATISTIQUE
      }).parties.statistiques;
      bases.set(l.match_key, { lambdaS: s.lambda, muS: s.mu, jour });
    }
    for (const l of duJour) {
      const f = faitsDeLaRencontre({ matchKey: l.match_key, club: l.club, adversaire: l.adversaire, camp: l.camp, date: l.date, league: l.league, saison: l.saison, attribue: l.attribue, prolongation: l.prolongation, compte: l.compte, coupe: l.coupe, bp: l.bp, bc: l.bc, bp90: l.bp90, bc90: l.bc90, xg_p: l.xg_p, xg_c: l.xg_c });
      if (f) acc.ajouter(f.dom, f.ext);
    }
    acc.finDeJournee();
    duJour = [];
  };
  for (const l of database.prepare(SQL_PASSE).iterate(jusqua)) {
    lues++;
    if (jour !== null && l.date !== jour) publier();
    jour = l.date;
    duJour.push(l);
  }
  publier();
  return { bases, lues };
}

/** Les matchs à domicile de chaque club (toutes compétitions) entre deux jours : [{ club, date, stade, lat, long }]. */
export function receptionsDesClubs(database, { de, a }) {
  const out = [];
  for (const l of database
    .prepare(`SELECT home_id, date, json_extract(meta, '$.stadium') AS stade, json_extract(meta, '$.lat') AS lat, json_extract(meta, '$.long') AS long
      FROM matches WHERE date >= ? AND date <= ? AND home_id IS NOT NULL ORDER BY date, match_key`)
    .iterate(de, a)) {
    const club = numeroDuClub(l.home_id);
    const stade = texteStable(l.stade ?? null);
    if (club === null || !stade) continue;
    out.push({ club, date: l.date, stade, lat: nombreOuNull(l.lat), long: nombreOuNull(l.long) });
  }
  return out;
}

/**
 * LES PAGES RELEVÉES des matchs à venir (upcoming_lineups) : { tour, phase, stade, ville, lat, long, releveLe, kickoff } —
 * TOUTES, avec l'heure de leur lecture : la nuit n'en garde que celles lues AVANT le coup d'envoi et compte les autres (la
 * garde des fuites). Par jour et identifiants.
 */
export function pagesRelevees(database, { de, a }) {
  const out = [];
  for (const l of database.prepare('SELECT fotmob_id, date, kickoff, league, home_id, away_id, payload, fetched_at FROM upcoming_lineups WHERE date >= ? AND date <= ?').iterate(de, a)) {
    const p = json(l.payload);
    const meta = p?.meta ?? {};
    const ko = Date.parse(meta.kickoff ?? l.kickoff ?? '');
    const lu = Date.parse(l.fetched_at ?? '');
    if (!fini(lu)) continue;
    out.push({
      fotmobId: l.fotmob_id,
      date: l.date,
      league: l.league ?? null,
      home: numeroDuClub(l.home_id ?? p?.home?.teamId),
      away: numeroDuClub(l.away_id ?? p?.away?.teamId),
      tour: meta.round === null || meta.round === undefined ? null : String(meta.round),
      phase: meta.leagueKey ?? null,
      stade: texteStable(meta.stadium ?? null),
      ville: texteStable(meta.city ?? null),
      lat: nombreOuNull(meta.lat),
      long: nombreOuNull(meta.long),
      releveLe: new Date(lu).toISOString(),
      kickoff: fini(ko) ? new Date(ko).toISOString() : null
    });
  }
  return out;
}

/** L'ARCHIVE D'AVANT-MATCH de l'étape 32 (écrite seulement avant le coup d'envoi) : le stade et ses coordonnées. */
export function avantMatchs(database, { de, a }) {
  const out = [];
  for (const l of database.prepare('SELECT fotmob_id, date, kickoff, league, home_id, away_id, releve_le, avant_match FROM contexte_avant_match WHERE date >= ? AND date <= ?').iterate(de, a)) {
    const m = json(l.avant_match) ?? {};
    out.push({ fotmobId: l.fotmob_id, date: l.date, kickoff: l.kickoff, league: l.league ?? null, home: numeroDuClub(l.home_id), away: numeroDuClub(l.away_id), stade: texteStable(m.stadium ?? null), ville: texteStable(m.city ?? null), lat: nombreOuNull(m.lat), long: nombreOuNull(m.long), releveLe: l.releve_le });
  }
  return out;
}

/**
 * LA GRILLE DE LA PAGE (étape 28) : pour chaque match, la DERNIÈRE ligne « service » de simulation_matchs calculée AVANT
 * son coup d'envoi (jamais une ligne d'après) : { lambda, mu, rho, grille, fair, oddsSource, oddsAt, calculeLe, kickoff }.
 */
export function lignesDeLaPage(database, { de, a }) {
  const out = [];
  for (const l of database
    .prepare("SELECT fixture_key, calcule_le, grille, league, date, kickoff, kickoff_connu, home_id, away_id, lambda, mu, rho, fair, odds_source, odds_at, apres_coup_d_envoi FROM simulation_matchs WHERE role = 'service' AND date >= ? AND date <= ? ORDER BY calcule_le")
    .iterate(de, a)) {
    out.push({
      fixtureKey: l.fixture_key,
      calculeLe: l.calcule_le,
      grille: l.grille,
      league: l.league ?? null,
      date: l.date,
      kickoff: l.kickoff ?? null,
      kickoffConnu: Boolean(Number(l.kickoff_connu)),
      home: numeroDuClub(l.home_id),
      away: numeroDuClub(l.away_id),
      lambda: nombreOuNull(l.lambda),
      mu: nombreOuNull(l.mu),
      rho: nombreOuNull(l.rho),
      fair: json(l.fair),
      oddsSource: l.odds_source ?? null,
      oddsAt: l.odds_at ?? null,
      apresCoupDEnvoi: Boolean(Number(l.apres_coup_d_envoi))
    });
  }
  return out;
}
