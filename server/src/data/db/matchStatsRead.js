/**
 * -----------------------------------------------------------------------
 * Lecture du magasin SQLite, au format attendu par le reste du projet.
 * -----------------------------------------------------------------------
 * Reconstruit exactement la forme des entrées JSON : mêmes clés, mêmes
 * types, et surtout MÊMES ABSENCES. Une clé sans valeur est omise, jamais
 * mise à null — la distinction porte du sens dans tout le projet :
 *
 *   - `subbedIn` absent ne veut pas dire « n'est pas entré en jeu » : la
 *     lecture de l'effectif retombe alors sur la présence d'une statistique
 *     non nulle pour savoir si le joueur a foulé le terrain ;
 *   - `Object.keys(stats).length` sert à distinguer un relevé vide d'un
 *     relevé absent.
 *
 * Remplir de null ferait passer « on ne sait pas » pour « zéro », ce qui
 * fausserait toutes les moyennes par match.
 */

import { openDb } from './matchStatsDb.js';
import { TEAM_COLUMNS, PLAYER_COLUMNS, PERCENT_TEAM_KEYS } from './columns.js';

const BOOLEAN_KEYS = new Set(['starter', 'subbedIn']);

function teamStatsFromRow(row) {
  const out = {};
  if (!row) return out;
  for (const c of TEAM_COLUMNS) {
    const value = row[c.column];
    if (value === null || value === undefined) continue;
    // Le magasin publiait ces deux clés en texte pourcenté ; la base les
    // garde en nombre. On rend la forme d'origine, l'affichage n'ayant pas
    // à connaître le changement.
    out[c.key] = PERCENT_TEAM_KEYS.has(c.key) ? `${Number(Number(value).toFixed(1))}%` : value;
  }
  return out;
}

function playerFromRow(row) {
  const out = {};
  for (const c of PLAYER_COLUMNS) {
    const value = row[c.column];
    if (value === null || value === undefined) continue;
    out[c.key] = BOOLEAN_KEYS.has(c.key) ? value === 1 : value;
  }
  // Le camp était redondant avec la liste d'appartenance, et c'est cette
  // redondance qui a révélé 31 feuilles où tous les joueurs avaient été
  // versés du même côté. On le rend depuis la colonne, qui fait foi.
  out.side = row.side;
  return out;
}

const parse = (text) => {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
};

/** Une entrée au format JSON d'origine, à partir de ses trois lignes SQL. */
function buildEntry(match, teamRows, playerRows) {
  const entry = {
    matchId: match.match_id,
    matchKey: match.match_key,
    date: match.date,
    league: match.league,
    homeName: match.home_name,
    awayName: match.away_name,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
    teamStats: {
      home: teamStatsFromRow(teamRows.find((r) => r.side === 'home')),
      away: teamStatsFromRow(teamRows.find((r) => r.side === 'away'))
    },
    players: {
      home: playerRows.filter((r) => r.side === 'home').map(playerFromRow),
      away: playerRows.filter((r) => r.side === 'away').map(playerFromRow)
    },
    sources: parse(match.sources) ?? [],
    updatedAt: match.updated_at ?? null
  };
  for (const [key, column] of [['events', 'events'], ['lineups', 'lineups'], ['meta', 'meta'], ['shotmap', 'shotmap']]) {
    const value = parse(match[column]);
    if (value !== undefined) entry[key] = value;
  }
  return entry;
}

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

/** Charge un ensemble de rencontres par clé, avec équipes et joueurs. */
export function loadEntriesByKeys(keys, { database = openDb() } = {}) {
  if (!keys.length) return [];
  const entries = [];
  // SQLite plafonne le nombre de paramètres d'une requête ; on découpe.
  for (let i = 0; i < keys.length; i += 500) {
    const lot = keys.slice(i, i + 500);
    const marks = placeholders(lot.length);
    const matches = database.prepare(`SELECT * FROM matches WHERE match_key IN (${marks})`).all(...lot);
    const teams = database.prepare(`SELECT * FROM team_stats WHERE match_key IN (${marks})`).all(...lot);
    const players = database.prepare(`SELECT * FROM players WHERE match_key IN (${marks}) ORDER BY match_key, side, ord`).all(...lot);
    const teamsBy = new Map();
    const playersBy = new Map();
    const range = (map, key) => {
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      return list;
    };
    for (const r of teams) range(teamsBy, r.match_key).push(r);
    for (const r of players) range(playersBy, r.match_key).push(r);
    for (const m of matches) entries.push(buildEntry(m, teamsBy.get(m.match_key) ?? [], playersBy.get(m.match_key) ?? []));
  }
  return entries;
}

/** Les noms d'équipe distincts du magasin — l'entrée du rapprochement flou. */
export function distinctTeamNames({ database = openDb() } = {}) {
  return database.prepare('SELECT DISTINCT home_name AS name FROM matches UNION SELECT DISTINCT away_name FROM matches').all().map((r) => r.name);
}

/**
 * Clés des rencontres où l'un des noms donnés apparaît, de la plus récente
 * à la plus ancienne. Le tri est fait par la base, pas en mémoire.
 */
export function matchKeysForNames(names, { database = openDb(), since = null, until = null } = {}) {
  if (!names.length) return [];
  const marks = placeholders(names.length);
  const bornes = [];
  if (since) bornes.push('date >= ?');
  if (until) bornes.push('date <= ?');
  const where = `(home_name IN (${marks}) OR away_name IN (${marks}))${bornes.length ? ' AND ' + bornes.join(' AND ') : ''}`;
  const args = [...names, ...names, ...(since ? [since] : []), ...(until ? [until] : [])];
  return database.prepare(`SELECT match_key FROM matches WHERE ${where} ORDER BY date DESC`).all(...args).map((r) => r.match_key);
}

/** Une rencontre par son matchId ou sa matchKey. */
export function loadEntry(id, { database = openDb() } = {}) {
  const match = database.prepare('SELECT * FROM matches WHERE match_key = ? OR match_id = ?').get(id, id);
  if (!match) return null;
  const teams = database.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(match.match_key);
  const players = database.prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord').all(match.match_key);
  return buildEntry(match, teams, players);
}

/** Comptes globaux du magasin, en une requête plutôt qu'un balayage. */
export function storeStatus({ database = openDb() } = {}) {
  const m = database.prepare('SELECT COUNT(*) AS count, MAX(date) AS lastMatchDate, MAX(updated_at) AS lastUpdatedAt FROM matches').get();
  const p = database.prepare('SELECT COUNT(*) AS playersCount FROM players').get();
  const leagues = database.prepare("SELECT DISTINCT league FROM matches WHERE league <> '' ORDER BY league").all().map((r) => r.league);
  return {
    count: m.count,
    playersCount: p.playersCount,
    leagues,
    lastMatchDate: m.lastMatchDate ?? null,
    lastUpdatedAt: m.lastUpdatedAt ?? null
  };
}
