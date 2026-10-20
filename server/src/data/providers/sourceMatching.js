/**
 * sourceMatching.js — rattacher les rencontres d'une source de cotes à celles du magasin.
 * -----------------------------------------------------------------------
 * Commun à toutes les sources gratuites de cotes (ESPN, Kalshi, Smarkets,
 * 365Scores, football-data.co.uk). Règle du projet : JAMAIS de rapprochement
 * souple des noms — « Port », « Portsmouth » et « Porto » ont déjà trompé le
 * projet. Deux voies, et deux seulement :
 *
 *   1. Rencontres JOUÉES : le VOTE. Une ligne de la source dont la date
 *      (± 1 jour) et le score désignent UNE seule rencontre du magasin dit
 *      quel club porte chacun de ses deux noms ; majorité nette (60 %) sur
 *      au moins deux votes ; puis chaque ligne est retrouvée par
 *      identifiants, à la date la plus proche à ± 3 jours, score vérifié.
 *      C'est la méthode de footballDataOdds.rattacher, généralisée.
 *   2. Rencontres À VENIR : l'alias déjà appris (table team_source_aliases),
 *      sinon l'annuaire strict (clubDuMagasin : alias exact, mêmes mots,
 *      inclusion stricte des mots, parmi les seuls clubs de la compétition).
 *      Sinon, non résolu : la cote est gardée avec ses noms, sans
 *      identifiant, et le vote la rattachera une fois le match joué.
 *
 * Ce que le vote apprend est PERSISTÉ (team_source_aliases, evidence
 * « vote ») : c'est ce qui permet ensuite de reconnaître « Man United » ou
 * un identifiant d'équipe ESPN pour un match à venir, sans score à voter.
 * Les identifiants stables d'une source (« id:357 » chez ESPN, « uuid:… »
 * chez Kalshi) sont appris en même temps que les noms.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { findTeams, canonicalTeamNames } from '../db/identityRegistry.js';
import { nameTokens } from '../../utils/nameIdentity.js';

/**
 * Abréviations des sources de cotes (football-data, Smarkets, ESPN…) :
 * « Dundee Utd », « Sheffield Wed », « Man City », « Nott'm Forest »,
 * « Sp Gijon ». Développées AVANT la recherche exacte dans l'annuaire.
 */
const ABREVIATIONS = [
  [/\butd\b\.?/gi, 'United'],
  [/\bwed\b\.?/gi, 'Wednesday'],
  [/^man\.? /i, 'Manchester '],
  [/\bnott'?m\b/gi, 'Nottingham'],
  [/^sp\.? /i, 'Sporting ']
];
const developper = (nom) => ABREVIATIONS.reduce((t, [motif, plein]) => t.replace(motif, plein), nom);

const decaler = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const nettoyer = (nom) => String(nom ?? '').trim();

const caches = new WeakMap();
function aliasesDe(database) {
  let c = caches.get(database);
  if (c) return c;
  c = { lu: new Map(), lire: database.prepare('SELECT team_id AS teamId FROM team_source_aliases WHERE source = ? AND name = ? AND league = ?') };
  caches.set(database, c);
  return c;
}

/** L'alias persisté d'un nom chez une source, ou null. */
export function aliasConnu(source, name, league, { database = openDb() } = {}) {
  const nom = nettoyer(name);
  if (!nom) return null;
  const c = aliasesDe(database);
  const cle = `${source}|${league}|${nom}`;
  if (c.lu.has(cle)) return c.lu.get(cle);
  const r = c.lire.get(source, nom, league ?? '');
  const id = r?.teamId ?? null;
  c.lu.set(cle, id);
  return id;
}

/**
 * Enregistre (ou confirme) une traduction nom -> identifiant pour une source.
 *
 * Sondes et essais (ODDS_MATCHING_READONLY=1) : rien n'est écrit en base,
 * l'alias n'est retenu qu'en mémoire pour la durée du processus — plusieurs
 * sondes peuvent ainsi lire la même copie de base sans jamais y écrire.
 */
export function apprendreAlias(source, name, league, teamId, evidence, { database = openDb() } = {}) {
  const nom = nettoyer(name);
  if (!nom || !teamId) return;
  if (process.env.ODDS_MATCHING_READONLY === '1') {
    aliasesDe(database).lu.set(`${source}|${league}|${nom}`, teamId);
    return;
  }
  database
    .prepare(`INSERT INTO team_source_aliases (source, name, league, team_id, evidence, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(source, name, league) DO UPDATE SET team_id = excluded.team_id, evidence = excluded.evidence, updated_at = excluded.updated_at`)
    .run(source, nom, league ?? '', teamId, evidence, new Date().toISOString());
  aliasesDe(database).lu.set(`${source}|${league}|${nom}`, teamId);
}

/**
 * L'identifiant FotMob d'un club nommé par une source, pour un match à
 * venir : alias appris, sinon annuaire strict (persisté à son tour, evidence
 * « annuaire »). `keys` : identifiants stables de la source à mémoriser avec
 * le nom (« id:357 »). Null si rien ne tranche.
 */
const clubsParCompetition = new Map();
/** Les clubs qui ont joué dans une compétition (identifiants FotMob), gardés 30 min. */
function clubsDeLaCompetition(league, database) {
  const connu = clubsParCompetition.get(league);
  if (connu && Date.now() - connu.at < 30 * 60_000) return connu.set;
  let set = new Set();
  try {
    set = new Set(
      database
        .prepare('SELECT home_id AS id FROM matches WHERE league = ? AND home_id IS NOT NULL UNION SELECT away_id FROM matches WHERE league = ? AND away_id IS NOT NULL')
        .all(league, league)
        .map((r) => r.id)
    );
  } catch {
    set = new Set();
  }
  clubsParCompetition.set(league, { at: Date.now(), set });
  return set;
}

/**
 * Deux garde-fous, posés le 04/10/2026 après deux faux alias relevés par la
 * sonde Smarkets — « Dundee Utd » pris pour Dundee FC (règle d'inclusion de
 * mots), et « Everton », nom court d'Everton de Viña del Mar, pris pour
 * l'Everton anglais (seul club de ce nom dans l'annuaire, toutes
 * compétitions confondues) :
 *   1. le club trouvé doit avoir JOUÉ dans cette compétition ;
 *   2. seul un nom EXACT de l'annuaire est appris ici. Un résultat des
 *      règles approchées (mots translittérés, inclusion) sert à la passe en
 *      cours mais n'est jamais gardé : il ne le sera que si la rencontre
 *      qu'il désigne existe au calendrier (confirmFixtureAliases), et le
 *      vote des matchs joués fera le reste.
 */
export function resolveTeamId({ source, name, league, keys = [], database = openDb() }) {
  const nom = nettoyer(name);
  if (!nom || !league) return null;
  for (const k of [nom, ...keys]) {
    const connu = aliasConnu(source, k, league, { database });
    if (connu) return connu;
  }
  const clubs = clubsDeLaCompetition(league, database);
  // 1. Le nom exact de l'annuaire (abréviations développées), parmi les seuls
  //    clubs de la compétition.
  let exacts = [];
  try {
    const ecritures = [...new Set([nom, developper(nom)])];
    const ids = new Map();
    for (const e of ecritures) for (const c of findTeams(e, { database })) if (clubs.has(c.teamId)) ids.set(c.teamId, c);
    exacts = [...ids.values()];
  } catch {
    exacts = [];
  }
  if (exacts.length === 1) {
    for (const k of [nom, ...keys]) apprendreAlias(source, k, league, exacts[0].teamId, 'annuaire', { database });
    return exacts[0].teamId;
  }
  // Deux clubs du même nom dans la même compétition : on ne choisit pas.
  if (exacts.length > 1) return null;
  // 2. Les règles approchées, pour cette passe seulement — et jamais quand
  //    le mot le plus distinctif du nom désigne deux clubs de la compétition
  //    (« Dundee » : Dundee FC et Dundee United).
  let id = null;
  try {
    id = clubDuMagasin(developper(nom), league, database);
  } catch {
    id = null;
  }
  if (!id || !clubs.has(id)) return null;
  return ambigu(nom, clubs, database) ? null : id;
}

/** Le mot le plus long du nom (ex aequo compris) se retrouve-t-il dans le nom de plusieurs clubs de la compétition ? */
function ambigu(nom, clubs, database) {
  const mots = nameTokens(developper(nom)).filter((m) => m.length >= 4);
  if (!mots.length) return false;
  const long = Math.max(...mots.map((m) => m.length));
  const distinctifs = mots.filter((m) => m.length === long);
  let noms;
  try {
    noms = canonicalTeamNames({ database });
  } catch {
    return false;
  }
  for (const mot of distinctifs) {
    let n = 0;
    for (const club of clubs) if (nameTokens(noms.get(club) ?? '').includes(mot)) n++;
    if (n > 1) return true;
  }
  return false;
}

/**
 * Une rencontre de la source rattachée à une rencontre du CALENDRIER (mêmes
 * identifiants, même sens, jour ± 1) confirme les deux noms : ils sont
 * appris (evidence « calendrier »), sauf si l'un d'eux désigne déjà un autre
 * club — on garde alors l'ancien, sans rien écraser.
 */
export function confirmFixtureAliases({ source, league, homeName, awayName, homeId, awayId, homeKeys = [], awayKeys = [], database = openDb() }) {
  let appris = 0;
  for (const [nom, id, keys] of [[homeName, homeId, homeKeys], [awayName, awayId, awayKeys]]) {
    if (!nom || !id) continue;
    for (const k of [nettoyer(nom), ...keys]) {
      const connu = aliasConnu(source, k, league, { database });
      if (connu) continue;
      apprendreAlias(source, k, league, id, 'calendrier', { database });
      appris++;
    }
  }
  return appris;
}

/**
 * Rattache par VOTE des rencontres jouées d'une source aux rencontres du
 * magasin d'une compétition.
 *
 * @param {object} p
 * @param {string} p.source   nom de la source (pour les alias appris)
 * @param {string} p.league   compétition du magasin
 * @param {Array}  p.rows     [{ date, home, away, hg, ag, homeKeys?, awayKeys?, ...reste }]
 *                            date = jour UTC AAAA-MM-JJ ; hg/ag = score final ; *Keys = identifiants stables à apprendre
 * @param {boolean} p.apply   persister les alias appris
 * @returns {{ attachments: Array<{ row, matchKey, homeId, awayId }>, bilan }}
 */
export function voteAttach({ source, league, rows, apply = true, database = openDb() }) {
  const lignes = (rows ?? []).filter((l) => l && l.date && l.home && l.away && Number.isInteger(l.hg) && Number.isInteger(l.ag));
  const bilan = { league, rows: lignes.length, attached: 0, unmatched: 0, scoreMismatch: 0, unresolvedNames: [], learned: 0 };
  if (!lignes.length) return { attachments: [], bilan };

  const dates = lignes.map((l) => l.date).sort();
  const magasin = database
    .prepare(`SELECT match_key, date, home_id, away_id, home_goals, away_goals FROM matches
              WHERE league = ? AND date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL
                AND home_goals IS NOT NULL AND away_goals IS NOT NULL`)
    .all(league, decaler(dates[0], -3), decaler(dates.at(-1), 3));
  const parDate = new Map();
  for (const m of magasin) {
    if (!parDate.has(m.date)) parDate.set(m.date, []);
    parDate.get(m.date).push(m);
  }
  const autour = (date, jours) => {
    const liste = [];
    for (let k = -jours; k <= jours; k++) liste.push(...(parDate.get(decaler(date, k)) ?? []));
    return liste;
  };

  // 1. Votes, sur les lignes dont les deux noms ne sont pas déjà connus.
  const votes = new Map();
  const voter = (nom, id) => {
    const v = votes.get(nom) ?? new Map();
    v.set(id, (v.get(id) ?? 0) + 1);
    votes.set(nom, v);
  };
  for (const l of lignes) {
    const candidates = autour(l.date, 1).filter((m) => m.home_goals === l.hg && m.away_goals === l.ag);
    if (candidates.length === 1) {
      voter(nettoyer(l.home), candidates[0].home_id);
      voter(nettoyer(l.away), candidates[0].away_id);
    }
  }
  // 2. Traduction : alias connu d'abord, sinon majorité nette sur au moins deux votes.
  const idDe = new Map();
  const noms = new Set(lignes.flatMap((l) => [nettoyer(l.home), nettoyer(l.away)]));
  for (const nom of noms) {
    const connu = aliasConnu(source, nom, league, { database });
    if (connu) {
      idDe.set(nom, connu);
      continue;
    }
    const v = votes.get(nom);
    if (!v) continue;
    const tri = [...v.entries()].sort((a, b) => b[1] - a[1]);
    const total = tri.reduce((s, [, n]) => s + n, 0);
    if (tri[0][1] >= 2 && tri[0][1] / total >= 0.6) {
      idDe.set(nom, tri[0][0]);
      if (apply) {
        apprendreAlias(source, nom, league, tri[0][0], 'vote', { database });
        bilan.learned++;
      }
    }
  }
  // Les identifiants stables de la source s'apprennent avec le nom.
  if (apply) {
    for (const l of lignes) {
      for (const [nom, keys] of [[nettoyer(l.home), l.homeKeys], [nettoyer(l.away), l.awayKeys]]) {
        const id = idDe.get(nom);
        if (!id || !keys?.length) continue;
        for (const k of keys) if (!aliasConnu(source, k, league, { database })) apprendreAlias(source, k, league, id, 'vote', { database });
      }
    }
  }

  // 3. Rattachement par identifiants, date la plus proche à ± 3 jours, score vérifié.
  const attachments = [];
  const pris = new Set();
  const nonResolus = new Set();
  for (const l of lignes) {
    const h = idDe.get(nettoyer(l.home));
    const a = idDe.get(nettoyer(l.away));
    if (!h) nonResolus.add(nettoyer(l.home));
    if (!a) nonResolus.add(nettoyer(l.away));
    if (!h || !a) {
      bilan.unmatched++;
      continue;
    }
    const rencontre = autour(l.date, 3)
      .filter((m) => m.home_id === h && m.away_id === a && !pris.has(m.match_key))
      .sort((x, y) => ecartJours(x.date, l.date) - ecartJours(y.date, l.date))[0];
    if (!rencontre) {
      bilan.unmatched++;
      continue;
    }
    if (rencontre.home_goals !== l.hg || rencontre.away_goals !== l.ag) {
      bilan.scoreMismatch++;
      continue;
    }
    pris.add(rencontre.match_key);
    attachments.push({ row: l, matchKey: rencontre.match_key, homeId: h, awayId: a });
  }
  bilan.attached = attachments.length;
  bilan.unresolvedNames = [...nonResolus].sort();
  return { attachments, bilan };
}

/**
 * Les deux identifiants d'une affiche à venir, par alias ou annuaire strict.
 * Rend { homeId, awayId } (chacun pouvant être null).
 */
export function resolveFixture({ source, league, home, away, homeKeys = [], awayKeys = [], database = openDb() }) {
  return {
    homeId: resolveTeamId({ source, name: home, league, keys: homeKeys, database }),
    awayId: resolveTeamId({ source, name: away, league, keys: awayKeys, database })
  };
}
