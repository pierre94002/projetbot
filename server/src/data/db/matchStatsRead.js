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

/**
 * Classement des joueurs d'une compétition, agrégé par la base.
 *
 * Les 810 000 lignes joueur du magasin n'étaient exposées nulle part : le
 * seul écran joueurs de l'app passait par API-Football, dont le plan gratuit
 * s'arrête à 2024 et ne couvre pas les championnats ajoutés depuis. Tout est
 * calculé en SQL — remonter les lignes pour sommer en mémoire prendrait
 * plusieurs secondes et autant de mégaoctets.
 *
 * `minMinutes` écarte les joueurs anecdotiques, sans quoi le classement par
 * note moyenne est trusté par des entrants de fin de match.
 */
export function playerSeasonStats({
  league,
  season = null,
  team = null,
  role = 'field',
  minMinutes = 180,
  limit = 200,
  database = openDb()
} = {}) {
  const POSITIONS = { goalkeeper: 'Goalkeeper', defender: 'Defender', midfielder: 'Midfielder', forward: 'Forward' };
  const position = POSITIONS[role] ?? null;
  const goalkeepers = role === 'goalkeeper';
  const where = ['m.league = ?'];
  const args = [league];
  if (season) {
    // Une saison va du 1er juillet au 30 juin : "2025" désigne 2025-26.
    where.push('m.date >= ? AND m.date < ?');
    args.push(`${season}-07-01`, `${Number(season) + 1}-07-01`);
  }
  if (team) {
    where.push("(CASE WHEN p.side = 'home' THEN m.home_name ELSE m.away_name END) = ?");
    args.push(team);
  }

  return database
    .prepare(
      // MATERIALIZED, impérativement : la CTE est référencée trois fois
      // (classement, poste, équipe dominante) et SQLite la recalculait à
      // chaque fois — trois jointures complètes, 3,6 s au lieu de 300 ms.
      `WITH lignes AS MATERIALIZED (
         SELECT p.*, (CASE WHEN p.side = 'home' THEN m.home_name ELSE m.away_name END) AS team
         FROM players p
         JOIN matches m ON m.match_key = p.match_key
         WHERE ${where.join(' AND ')}
       ),
       poste AS (
         -- Le poste n'est tagué que sur ~55 % des lignes, et pas forcément
         -- sur celles de la saison consultée : Ayase Ueda n'en a aucune en
         -- 2025-26 alors qu'il est meilleur buteur. On le cherche donc dans
         -- TOUT l'historique du joueur — mais seulement pour les joueurs du
         -- championnat consulté, sinon on rebalaie les 810 000 lignes à
         -- chaque écran (3,6 s mesurées).
         --
         -- Et on retient le poste le PLUS FRÉQUENT, pas MAX() : 37 % des
         -- joueurs en portent plusieurs, et MAX trie alphabétiquement, donc
         -- "Midfielder" l'emportait sur "Forward". Mbappé, tagué attaquant
         -- 116 fois et milieu 4 fois, sortait ainsi dans les milieux.
         SELECT name, position FROM (
           SELECT name, position, ROW_NUMBER() OVER (PARTITION BY name ORDER BY COUNT(*) DESC, position) AS rang
           FROM players
           WHERE position IS NOT NULL AND name IN (SELECT DISTINCT name FROM lignes)
           GROUP BY name, position
         ) WHERE rang = 1
       ),
       equipe AS (
         -- Un même club s'écrit parfois de deux façons selon la source
         -- ("Atlético Madrid"/"Atletico Madrid", "Ajax"/"Ajax Amsterdam").
         -- Grouper par (joueur, équipe) scindait donc le joueur en deux
         -- lignes au classement — Dávid Hancko y figurait deux fois. On
         -- regroupe par joueur seul, et on affiche son club dominant.
         SELECT name, team FROM (
           SELECT name, team, ROW_NUMBER() OVER (PARTITION BY name ORDER BY COUNT(*) DESC, team) AS rang
           FROM lignes GROUP BY name, team
         ) WHERE rang = 1
       )
       SELECT
         p.name AS name,
         MAX(p.player_id) AS playerId,
         MAX(poste.position) AS position,
         MAX(equipe.team) AS team,
         COUNT(*) AS matches,
         SUM(CASE WHEN p.minutes > 0 THEN 1 ELSE 0 END) AS played,
         SUM(CASE WHEN p.starter = 1 THEN 1 ELSE 0 END) AS starts,
         COALESCE(SUM(p.minutes), 0) AS minutes,
         ROUND(AVG(p.rating), 2) AS rating,
         COALESCE(SUM(p.goals), 0) AS goals,
         COALESCE(SUM(p.assists), 0) AS assists,
         COALESCE(SUM(p.shots), 0) AS shots,
         COALESCE(SUM(p.shots_on_target), 0) AS shotsOnTarget,
         ROUND(SUM(p.xg), 2) AS xg,
         ROUND(SUM(p.xa), 2) AS xa,
         COALESCE(SUM(p.key_passes), 0) AS keyPasses,
         COALESCE(SUM(p.big_chances_created), 0) AS bigChancesCreated,
         COALESCE(SUM(p.tackles), 0) AS tackles,
         COALESCE(SUM(p.interceptions), 0) AS interceptions,
         COALESCE(SUM(p.duels_won), 0) AS duelsWon,
         COALESCE(SUM(p.duels_total), 0) AS duelsTotal,
         COALESCE(SUM(p.passes), 0) AS passes,
         COALESCE(SUM(p.passes_accurate), 0) AS passesAccurate,
         COALESCE(SUM(p.final_third_passes), 0) AS finalThirdPasses,
         COALESCE(SUM(p.long_balls), 0) AS longBalls,
         COALESCE(SUM(p.long_balls_accurate), 0) AS longBallsAccurate,
         COALESCE(SUM(p.crosses), 0) AS crosses,
         COALESCE(SUM(p.dribbles_won), 0) AS dribblesWon,
         COALESCE(SUM(p.touches), 0) AS touches,
         COALESCE(SUM(p.touches_opp_box), 0) AS touchesOppBox,
         COALESCE(SUM(p.clearances), 0) AS clearances,
         COALESCE(SUM(p.blocks), 0) AS blocks,
         COALESCE(SUM(p.recoveries), 0) AS recoveries,
         COALESCE(SUM(p.aerials_won), 0) AS aerialsWon,
         COALESCE(SUM(p.aerials_total), 0) AS aerialsTotal,
         COALESCE(SUM(p.dribbled_past), 0) AS dribbledPast,
         COALESCE(SUM(p.dispossessed), 0) AS dispossessed,
         COALESCE(SUM(p.fouls_committed), 0) AS foulsCommitted,
         COALESCE(SUM(p.offsides), 0) AS offsides,
         COALESCE(SUM(p.yellow_cards), 0) AS yellowCards,
         COALESCE(SUM(p.red_cards), 0) AS redCards,
         COALESCE(SUM(p.saves), 0) AS saves,
         COALESCE(SUM(p.goals_conceded), 0) AS goalsConceded,
         -- Un match sans but encaisse ne compte que si la donnee est
         -- RENSEIGNEE : un NULL veut dire "non releve", pas "zero".
         SUM(CASE WHEN p.goals_conceded = 0 AND p.minutes > 0 THEN 1 ELSE 0 END) AS cleanSheets,
         ROUND(SUM(p.xgot_faced), 2) AS xgotFaced,
         ROUND(SUM(p.goals_prevented), 2) AS goalsPrevented
       FROM lignes p
       JOIN equipe ON equipe.name = p.name
       LEFT JOIN poste ON poste.name = p.name
       GROUP BY p.name
       -- Agrégats répétés en toutes lettres : dans un HAVING/ORDER BY,
       -- SQLite résout un nom ambigu vers la COLONNE et non vers l'alias,
       -- et filtrait donc sur les minutes d'une ligne arbitraire du groupe.
       -- Le poste se juge sur le JOUEUR, pas sur la ligne : 53 % des lignes
       -- n'en portent pas, donc un filtre ligne a ligne laisserait un gardien
       -- reapparaitre parmi les joueurs de champ par ses lignes non taguees.
       HAVING ${
         position
           ? 'MAX(poste.position) = ?'
           : "(MAX(poste.position) IS NULL OR MAX(poste.position) <> 'Goalkeeper')"
       }
          AND COALESCE(SUM(p.minutes), 0) >= ?
       ORDER BY ${
         {
           // Chaque poste se juge sur ce qui le définit : un défenseur classé
           // par buts serait un classement de coups francs.
           goalkeeper: 'SUM(CASE WHEN p.goals_conceded = 0 AND p.minutes > 0 THEN 1 ELSE 0 END) DESC, SUM(p.goals_prevented) DESC, AVG(p.rating) DESC',
           defender: 'AVG(p.rating) DESC, COALESCE(SUM(p.tackles), 0) + COALESCE(SUM(p.interceptions), 0) + COALESCE(SUM(p.clearances), 0) DESC',
           midfielder: 'AVG(p.rating) DESC, COALESCE(SUM(p.assists), 0) DESC, COALESCE(SUM(p.key_passes), 0) DESC'
         }[role] ?? 'COALESCE(SUM(p.goals), 0) DESC, COALESCE(SUM(p.assists), 0) DESC, AVG(p.rating) DESC'
       }
       LIMIT ?`
    )
    .all(...args, ...(position ? [position] : []), minMinutes, limit);
}

/** Saisons couvertes par une compétition, la plus récente d'abord. */
export function seasonsForLeague(league, { database = openDb() } = {}) {
  return database
    .prepare(
      `SELECT CAST(strftime('%Y', date, CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7 THEN '0 day' ELSE '-1 year' END) AS INTEGER) AS season,
              COUNT(*) AS matches
       FROM matches WHERE league = ? GROUP BY season ORDER BY season DESC`
    )
    .all(league)
    .filter((r) => r.season !== null);
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
