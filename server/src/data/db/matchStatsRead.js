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
import { IDENTITY_SQL, ensureRegistries, findTeams, canonicalTeamNames } from './identityRegistry.js';
// Les bornes d'une saison dépendent de la compétition : juillet-juin en
// Europe, janvier-décembre dans les pays nordiques et les Amériques. Un seul
// point de vérité pour tous les lecteurs de ce fichier.
import { seasonBounds, seasonStartMonth, seasonLabel } from '../providers/seasonWindows.js';

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

/**
 * Une rencontre COMPTE-T-ELLE au classement ? Pas si elle appartient à une
 * phase à élimination : barrages (« … Qualification »), tours finals (1/8,
 * 1/4, 1/2, final, bronze, play-off), tours préliminaires — ni la Copa de
 * la Liga Profesional, tournoi argentin sans table chez FotMob. Le
 * classement calculé cumulait tout : Ligue 1 à 21 clubs (Metz 36 matchs,
 * Rodez 2), Middlesbrough à 49 matchs, l'Ajax à 36. Les journées se
 * reconnaissent à leur numéro (« 12 », « Clausura - Round 5 », « Group
 * Stage - Round 4 ») ; les tours de playoffs danois ou belges, numérotés eux
 * aussi, comptent — la table officielle les compte. Une journée inconnue
 * (feuille sans en-tête) compte : on n'a rien pour l'écarter.
 */
export function countsForTable(meta) {
  // Annulée, abandonnée, reportée : ce n'est pas un résultat, quel que soit
  // le score que la page a gardé.
  if (/^(cancelled|abandoned|postponed)$/.test(String(meta?.reason ?? ''))) return false;
  const key = String(meta?.leagueKey ?? '');
  if (/ (Qualification|Preliminary Round|Knockout Round Play-offs)$/i.test(key)) return false;
  if (/^ARG\|Copa de la Liga/.test(key)) return false;
  const round = meta?.round;
  const journee = round !== null && round !== undefined && (/^\d+$/.test(String(round)) || /- Round \d+$/i.test(String(round)));
  // Une phase « Playoff » ne compte que si ses tours sont des journées
  // numérotées (Danemark : la table du tour final les compte) ; les
  // playoffs de la MLS n'ont pas d'intitulé de tour du tout, et cumulaient
  // jusqu'à six matchs de plus par club.
  if (/ Playoff$/.test(key)) return journee;
  if (round === null || round === undefined) return true;
  return journee;
}

/**
 * Hors barrages et tours de qualification : FotMob lui-même les tient à
 * part de ses classements individuels (la C3 2026-27 comptait ici les buts
 * des tours préliminaires d'août, pas la source).
 */
// Sauf pour les coupes CONMEBOL : Libertadores et Sudamericana comptent
// leurs tours préliminaires dans leurs listes officielles (Fydriszewski 4 =
// 2 en préliminaires + 2 en groupes), là où l'UEFA les tient à part.
const HORS_QUALIFICATION = "NOT (COALESCE(json_extract(m.meta, '$.leagueKey'), '') LIKE '% Qualification' AND COALESCE(json_extract(m.meta, '$.leagueKey'), '') NOT LIKE 'INT|Copa %')";

/**
 * Clean sheet : gardien sur le terrain TOUT le match, sans but encaissé —
 * la règle de FotMob/Opta. Entré à la 90e (Gallon, Le Havre - Brest), sorti
 * à la 41e (Mihelak) ou exclu à la 88e d'un 0-0 (Paunio) : aucun n'en a un
 * chez la source, tous en avaient un ici (22 gardiens du top 10 sur 16
 * compétitions). Un NULL veut dire « non relevé », pas zéro.
 */
const CLEAN_SHEET = `p.goals_conceded = 0 AND p.minutes >= 90 AND p.sub_in_minute IS NULL AND p.sub_out_minute IS NULL
  AND COALESCE(p.red_cards, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM json_each(m.events) e WHERE json_extract(e.value, '$.type') = 'card'
                  AND json_extract(e.value, '$.card') IN ('red', 'yellowred') AND json_extract(e.value, '$.player') = p.name)`;

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
  ensureRegistries({ database });
  const POSITIONS = { goalkeeper: 'Goalkeeper', defender: 'Defender', midfielder: 'Midfielder', forward: 'Forward' };
  const position = POSITIONS[role] ?? null;
  const goalkeepers = role === 'goalkeeper';
  const where = ['m.league = ?', HORS_QUALIFICATION];
  const args = [league];
  if (season) {
    // "2025" désigne 2025-26 en Europe, l'année civile 2025 ailleurs (cf.
    // seasonWindows.js).
    where.push('m.date >= ? AND m.date < ?');
    args.push(...seasonBounds(league, season));
  }
  if (team) {
    // Par identifiant dès que l'annuaire sait de quel club il s'agit : un
    // filtre sur le nom exact laissait tomber la moitié des rencontres d'un
    // club que les sources n'écrivent pas pareil — « Atlético Madrid » chez
    // l'une, « Atletico Madrid » chez l'autre, et l'égalité SQL les sépare.
    const clubs = findTeams(team, { database });
    const teamId = clubs.length === 1 ? clubs[0].teamId : null;
    if (teamId) {
      where.push("(CASE WHEN p.side = 'home' THEN m.home_id ELSE m.away_id END) = ?");
      args.push(teamId);
    } else {
      where.push("(CASE WHEN p.side = 'home' THEN m.home_name ELSE m.away_name END) = ?");
      args.push(team);
    }
  }

  return database
    .prepare(
      // MATERIALIZED, impérativement : la CTE est référencée deux fois
      // (classement et club dominant) et SQLite la recalculait à chaque
      // fois — deux jointures complètes, 3,6 s au lieu de 300 ms.
      `WITH lignes AS MATERIALIZED (
         SELECT p.*, ${IDENTITY_SQL} AS pid, m.date AS match_date,
                (CASE WHEN ${CLEAN_SHEET} THEN 1 ELSE 0 END) AS clean_sheet,
                (CASE WHEN p.side = 'home' THEN m.home_id ELSE m.away_id END) AS team_id,
                (CASE WHEN p.side = 'home' THEN m.home_name ELSE m.away_name END) AS team_name
         FROM players p
         JOIN matches m ON m.match_key = p.match_key
         WHERE ${where.join(' AND ')}
       ),
       equipe AS (
         -- Le club de ce joueur DANS CE CHAMPIONNAT et cette saison, pas
         -- celui qu'il porte aujourd'hui : dans un classement de Liga 2024-25,
         -- un joueur parti depuis en Premier League doit figurer sous son
         -- club espagnol. Le plus récent des clubs de la période l'emporte,
         -- un transfert en janvier faisant foi sur la demi-saison précédente.
         SELECT pid, team_id, team_name FROM (
           SELECT pid, MAX(team_id) AS team_id, MAX(team_name) AS team_name,
                  ROW_NUMBER() OVER (PARTITION BY pid ORDER BY MAX(match_date) DESC, COUNT(*) DESC) AS rang
           FROM lignes
           -- Par IDENTIFIANT de club quand il est là : « Atlético Madrid » et
           -- « Atletico Madrid » sont le même club, et les grouper par nom
           -- scindait le joueur en deux lignes au classement.
           GROUP BY pid, COALESCE(team_id, 'nom:' || team_name)
         ) WHERE rang = 1
       )
       SELECT
         -- Le nom d'affichage vient de l'annuaire, pas des lignes : un même
         -- homme y est écrit de plusieurs façons selon la source, et
         -- l'annuaire retient la plus employée (cf. identityRegistry.js).
         COALESCE(MAX(ident.name), MAX(p.name)) AS name,
         p.pid AS playerId,
         -- Poste et club canonique lus dans l'annuaire, où ils sont déjà
         -- calculés sur TOUT l'historique du joueur. Les recalculer ici
         -- rebalayait les 810 000 lignes à chaque écran (12 s mesurées).
         MAX(ident.position) AS position,
         COALESCE(MAX(tm.name), MAX(equipe.team_name)) AS team,
         MAX(equipe.team_id) AS teamId,
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
         COALESCE(SUM(p.clean_sheet), 0) AS cleanSheets,
         ROUND(SUM(p.xgot_faced), 2) AS xgotFaced,
         ROUND(SUM(p.goals_prevented), 2) AS goalsPrevented
       FROM lignes p
       LEFT JOIN people ident ON ident.player_id = p.pid
       LEFT JOIN equipe ON equipe.pid = p.pid
       LEFT JOIN teams tm ON tm.team_id = equipe.team_id
       -- Par IDENTIFIANT, jamais par nom. Le nom fusionnait 277 homonymes —
       -- « Juan Cruz » et « Liam Kelly » sont trois hommes chacun — et
       -- éclatait 1 956 joueurs sur leurs variantes d'orthographe.
       GROUP BY p.pid
       -- Agrégats répétés en toutes lettres : dans un HAVING/ORDER BY,
       -- SQLite résout un nom ambigu vers la COLONNE et non vers l'alias,
       -- et filtrait donc sur les minutes d'une ligne arbitraire du groupe.
       -- Le poste se juge sur le JOUEUR, pas sur la ligne : 53 % des lignes
       -- n'en portent pas, donc un filtre ligne a ligne laisserait un gardien
       -- reapparaitre parmi les joueurs de champ par ses lignes non taguees.
       HAVING ${
         position
           ? 'MAX(ident.position) = ?'
           : "(MAX(ident.position) IS NULL OR MAX(ident.position) <> 'Goalkeeper')"
       }
          AND COALESCE(SUM(p.minutes), 0) >= ?
       ORDER BY ${
         {
           // Chaque poste se juge sur ce qui le définit : un défenseur classé
           // par buts serait un classement de coups francs.
           goalkeeper: 'SUM(p.clean_sheet) DESC, SUM(p.goals_prevented) DESC, AVG(p.rating) DESC',
           defender: 'AVG(p.rating) DESC, COALESCE(SUM(p.tackles), 0) + COALESCE(SUM(p.interceptions), 0) + COALESCE(SUM(p.clearances), 0) DESC',
           midfielder: 'AVG(p.rating) DESC, COALESCE(SUM(p.assists), 0) DESC, COALESCE(SUM(p.key_passes), 0) DESC'
         }[role] ?? 'COALESCE(SUM(p.goals), 0) DESC, COALESCE(SUM(p.assists), 0) DESC, AVG(p.rating) DESC'
       }
       LIMIT ?`
    )
    .all(...args, ...(position ? [position] : []), minMinutes, limit);
}


/**
 * Rencontres jouées d'une équipe, de la plus récente à la plus ancienne,
 * avec son camp. Socle commun aux moyennes de buts, de corners et à la forme
 * — toutes trois partaient auparavant chacune vers API-Football.
 */
function rencontresJouees(teamName, { league = null, database = openDb() } = {}) {
  ensureRegistries({ database });
  const clubs = findTeams(teamName, { database });
  const teamId = clubs.length === 1 ? clubs[0].teamId : null;

  const COLONNES = 'match_key, fotmob_id, date, home_name, away_name, home_id, away_id, home_goals, away_goals';
  const joue = 'home_goals IS NOT NULL AND away_goals IS NOT NULL';
  const filtreLigue = league ? ' AND league = ?' : '';
  const cote = (colonne, camp) => `SELECT ${COLONNES}, '${camp}' AS camp FROM matches WHERE ${colonne} = ? AND ${joue}${filtreLigue}`;

  // Deux requêtes réunies plutôt qu'un OR : un OR sur deux colonnes
  // différentes empêche SQLite d'utiliser l'un ou l'autre index et lui fait
  // balayer le championnat entier — 137 ms contre 21 ms mesurées.
  const [cleA, cleB] = teamId ? ['home_id', 'away_id'] : ['home_name', 'away_name'];
  const valeur = teamId ?? teamName;
  const args = league ? [valeur, league, valeur, league] : [valeur, valeur];
  const rows = database
    .prepare(`${cote(cleA, 'home')} UNION ALL ${cote(cleB, 'away')} ORDER BY date DESC`)
    .all(...args);
  return { teamId, rows };
}

/**
 * Forme récente d'une équipe, lue dans le magasin.
 *
 * Même forme de retour que `getRecentForm()` (teamStatsService.js), qui
 * interrogeait API-Football : c'était l'un des derniers points du projet à
 * demander autre chose que des cotes à une API payante, et il était appelé
 * pour chaque équipe de chaque match de la liste.
 *
 * Le magasin rend mieux que ce qu'il remplace : la saison en cours (le plan
 * gratuit s'arrêtait à 2024) et les championnats ajoutés depuis, que le plan
 * ne couvre pas du tout.
 */
export function teamFormFromStore(teamName, { league = null, sampleSize = null, database = openDb() } = {}) {
  const { teamId, rows } = rencontresJouees(teamName, { league, database });
  const retenues = sampleSize ? rows.slice(0, sampleSize) : rows;
  // Le nom de l'adversaire vient de l'annuaire : les colonnes gardent
  // l'écriture de la source qui a créé la rencontre, et le même club y
  // change de nom d'une ligne à l'autre.
  const canon = canonicalTeamNames({ database });
  const matches = retenues.map((r) => {
    const home = r.camp === 'home';
    const pour = home ? r.home_goals : r.away_goals;
    const contre = home ? r.away_goals : r.home_goals;
    return {
      fixtureId: r.fotmob_id ?? r.match_key,
      result: pour > contre ? 'V' : pour === contre ? 'N' : 'D',
      opponent: canon.get(home ? r.away_id : r.home_id) ?? (home ? r.away_name : r.home_name),
      opponentId: (home ? r.away_id : r.home_id) ?? null,
      score: `${pour}-${contre}`,
      date: r.date,
      home
    };
  });
  return { matches, sampleSize: matches.length, totalPlayed: rows.length, requestedSampleSize: sampleSize, teamId };
}

/**
 * Moyennes de buts marqués et encaissés, au format de `getGoalsAverage()`.
 *
 * Calculées, et non recopiées : API-Football publiait des moyennes déjà
 * faites, le magasin a les scores. La répartition domicile/extérieur est
 * donc exacte plutôt qu'arrondie à deux décimales par la source.
 *
 * `null` quand l'équipe n'a aucune rencontre jouée en magasin — l'appelant
 * doit pouvoir distinguer « zéro but » de « on ne sait pas ».
 */
export function teamGoalsFromStore(teamName, { league = null, sampleSize = null, season = null, database = openDb() } = {}) {
  const { teamId, rows } = rencontresJouees(teamName, { league, database });

  // LA SAISON EN COURS, pas tout l'historique. Le magasin garde trois ou
  // quatre saisons, et les moyenner toutes donnait à l'IFK Göteborg
  // « 1,27 but sur 204 matchs » — un chiffre juste, mais qui décrit un club
  // d'il y a trois ans autant que celui d'aujourd'hui, et qui tire chaque
  // équipe vers la moyenne générale. C'est ce que faisait l'appel
  // API-Football remplacé ici, et le moteur a été réglé là-dessus.
  //
  // SAUF en début de saison : à cinq rencontres ou moins, une moyenne de
  // saison est du bruit, et l'historique complet vaut mieux qu'un chiffre
  // tiré de deux matchs.
  const MINIMUM_SAISON = 6;
  const [debut, fin] = season ? seasonBounds(league ?? '', season) : [null, null];
  const deLaSaison = season ? rows.filter((r) => r.date >= debut && r.date < fin) : rows;
  const base = deLaSaison.length >= MINIMUM_SAISON ? deLaSaison : rows;

  const retenues = sampleSize ? base.slice(0, sampleSize) : base;
  if (!retenues.length) return null;

  const cumul = { home: { pour: 0, contre: 0, n: 0 }, away: { pour: 0, contre: 0, n: 0 } };
  for (const r of retenues) {
    const c = cumul[r.camp];
    c.pour += r.camp === 'home' ? r.home_goals : r.away_goals;
    c.contre += r.camp === 'home' ? r.away_goals : r.home_goals;
    c.n++;
  }
  const moy = (somme, n) => (n ? Number((somme / n).toFixed(2)) : null);
  const totalN = cumul.home.n + cumul.away.n;

  return {
    for: {
      home: moy(cumul.home.pour, cumul.home.n),
      away: moy(cumul.away.pour, cumul.away.n),
      total: moy(cumul.home.pour + cumul.away.pour, totalN)
    },
    against: {
      home: moy(cumul.home.contre, cumul.home.n),
      away: moy(cumul.away.contre, cumul.away.n),
      total: moy(cumul.home.contre + cumul.away.contre, totalN)
    },
    fixturesPlayed: totalN,
    teamId,
    // Les dates déjà comptées, pour que l'appelant n'ajoute pas une seconde
    // fois des rencontres que le magasin connaît (cf.
    // blendGoalsWithLocalResults dans matchEnrichment.js).
    dates: retenues.map((r) => r.date)
  };
}

/**
 * Moyenne de corners, au format de `getCornersAverage()`.
 *
 * L'ancienne version coûtait un appel API PAR MATCH de l'échantillon, le
 * détail d'une rencontre étant le seul endroit où API-Football publie les
 * corners. Le magasin les a déjà, dans la colonne du relevé d'équipe.
 */
export function teamCornersFromStore(teamName, { league = null, sampleSize = 5, database = openDb() } = {}) {
  const { rows } = rencontresJouees(teamName, { league, database });
  const retenues = sampleSize ? rows.slice(0, sampleSize) : rows;
  if (!retenues.length) return { average: null, sampleSize: 0, requestedSampleSize: sampleSize };

  const valeurs = [];
  const lire = database.prepare('SELECT "corner_kicks" AS c FROM team_stats WHERE match_key = ? AND side = ?');
  for (const r of retenues) {
    const v = lire.get(r.match_key, r.camp)?.c;
    if (v !== null && v !== undefined) valeurs.push(Number(v));
  }
  return {
    average: valeurs.length ? Number((valeurs.reduce((s, v) => s + v, 0) / valeurs.length).toFixed(2)) : null,
    sampleSize: valeurs.length,
    requestedSampleSize: sampleSize
  };
}

/**
 * Une rencontre du magasin par l'identifiant FotMob, la clé, ou le couple
 * équipe à domicile + date. Trois entrées, une seule sortie.
 */
function rencontreParReference({ fixtureId = null, homeName = null, date = null, database = openDb() }) {
  if (fixtureId != null) {
    const m = database
      .prepare('SELECT * FROM matches WHERE fotmob_id = ? OR match_key = ? OR match_id = ?')
      .get(String(fixtureId), String(fixtureId), String(fixtureId));
    if (m) return m;
  }
  if (homeName && date) {
    ensureRegistries({ database });
    const clubs = findTeams(homeName, { database });
    const teamId = clubs.length === 1 ? clubs[0].teamId : null;
    return teamId
      ? database.prepare('SELECT * FROM matches WHERE home_id = ? AND date = ?').get(teamId, date)
      : database.prepare('SELECT * FROM matches WHERE home_name = ? AND date = ?').get(homeName, date);
  }
  return null;
}

/**
 * Statistiques détaillées d'une rencontre, au format de
 * `getFixtureStatistics()` : une entrée par équipe.
 *
 * Devenu indispensable, et pas seulement souhaitable : la forme récente
 * rend désormais l'identifiant FotMob de chaque rencontre, et le passer à
 * API-Football n'aurait aucun sens — les deux sources ne numérotent pas les
 * matchs pareil.
 */
export function fixtureStatsFromStore(fixtureId, { database = openDb() } = {}) {
  const m = rencontreParReference({ fixtureId, database });
  if (!m) return [];
  const releves = database.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(m.match_key);
  const canon = canonicalTeamNames({ database });
  return ['home', 'away'].map((side) => ({
    teamId: (side === 'home' ? m.home_id : m.away_id) ?? null,
    teamName: canon.get(side === 'home' ? m.home_id : m.away_id) ?? (side === 'home' ? m.home_name : m.away_name),
    home: side === 'home',
    goals: side === 'home' ? m.home_goals : m.away_goals,
    stats: teamStatsFromRow(releves.find((r) => r.side === side))
  })).filter((t) => Object.keys(t.stats).length || t.goals !== null);
}

/**
 * Composition d'une rencontre, au format de `getLiveLineups()`.
 *
 * Le magasin porte la formation et l'entraîneur dans `lineups`, et le rang
 * de chaque joueur sur la feuille dans `players.ord` — c'est-à-dire l'ordre
 * publié par la source, que l'on ne saurait pas reconstituer autrement.
 */
export function lineupsFromStore(homeName, isoDate, { database = openDb() } = {}) {
  const m = rencontreParReference({ homeName, date: String(isoDate).slice(0, 10), database });
  if (!m) return { available: false, reason: 'fixture_not_found' };

  const lignes = database
    .prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord')
    .all(m.match_key);
  if (!lignes.length) return { available: false, reason: 'not_published_yet' };

  const cadre = parse(m.lineups) ?? {};
  const canon = canonicalTeamNames({ database });
  const camp = (side) => {
    const joueurs = lignes.filter((r) => r.side === side).map(playerFromRow);
    return {
      teamId: (side === 'home' ? m.home_id : m.away_id) ?? null,
      teamName: canon.get(side === 'home' ? m.home_id : m.away_id) ?? (side === 'home' ? m.home_name : m.away_name),
      formation: cadre[side]?.formation ?? null,
      coach: cadre[side]?.coach ?? null,
      startXI: joueurs.filter((p) => p.starter === true),
      substitutes: joueurs.filter((p) => p.starter !== true)
    };
  };
  const home = camp('home');
  const away = camp('away');
  // `teams` EN PLUS de `home`/`away` : c'est ce tableau que l'écran de compo
  // parcourt (TeamStatsModal.vue) — sans lui, un match déjà en magasin
  // répondait `available: true` et n'affichait pourtant aucune équipe.
  return { available: true, source: 'fotmob', fixtureId: m.fotmob_id ?? m.match_key, date: m.date, home, away, teams: [home, away] };
}

/**
 * Score et statistiques d'une rencontre, au format de
 * `getLiveMatchDetails()`.
 */
export function matchDetailsFromStore(homeName, isoDate, { database = openDb() } = {}) {
  const m = rencontreParReference({ homeName, date: String(isoDate).slice(0, 10), database });
  if (!m) return { available: false, reason: 'fixture_not_found' };
  if (m.home_goals === null || m.away_goals === null) return { available: false, reason: 'not_played_yet' };

  const [home, away] = fixtureStatsFromStore(m.fotmob_id ?? m.match_key, { database });
  return {
    available: true,
    source: 'fotmob',
    fixtureId: m.fotmob_id ?? m.match_key,
    date: m.date,
    league: m.league,
    status: 'FT',
    score: { home: m.home_goals, away: m.away_goals },
    teams: { home: { name: home?.teamName ?? m.home_name, id: m.home_id }, away: { name: away?.teamName ?? m.away_name, id: m.away_id } },
    stats: { home: home?.stats ?? {}, away: away?.stats ?? {} },
    events: parse(m.events) ?? []
  };
}

/**
 * Classement d'une compétition, CALCULÉ depuis les résultats du magasin.
 *
 * Le classement venait jusqu'ici d'une recherche web quotidienne, avec
 * API-Football en repli. Or le magasin contient déjà tous les résultats :
 * un classement s'en déduit exactement, sans quota, sans clé, et pour
 * n'importe quelle saison conservée plutôt que la seule en cours.
 *
 * Il apporte en plus la répartition DOMICILE/EXTÉRIEUR, que le classement
 * web ne publiait pas — c'est précisément ce qui manquait à
 * `getLeagueGoalAverages()` et l'obligeait à retomber sur API-Football pour
 * alimenter le calcul structurel de lambda/mu.
 *
 * `null` quand la compétition n'a aucune rencontre jouée : un classement
 * vide et un classement inconnu ne sont pas la même chose.
 */
export function standingsFromStore(league, { season = null, database = openDb() } = {}) {
  ensureRegistries({ database });
  // La saison EN COURS par défaut. Sans cela, un championnat dont le magasin
  // garde trois ans d'historique rendait un classement cumulé : le Lech
  // Poznań y figurait avec 110 matchs et 202 points, ce qui n'est le
  // classement d'aucune saison.
  const saison = season ?? seasonsForLeague(league, { database })[0]?.season ?? null;
  const bornes = saison ? ' AND date >= ? AND date < ?' : '';
  const args = saison ? [league, ...seasonBounds(league, saison)] : [league];
  const rows = database.prepare(
    `SELECT home_id, away_id, home_name, away_name, home_goals, away_goals, meta FROM matches
     WHERE league = ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL${bornes}`
  ).all(...args).filter((r) => countsForTable(parse(r.meta)));
  if (!rows.length) return null;

  const canon = canonicalTeamNames({ database });
  const table = new Map();
  const fiche = (id, nom) => {
    const cle = id ?? `nom:${nom}`;
    let t = table.get(cle);
    if (!t) {
      table.set(cle, (t = {
        rank: 0, teamId: id ?? null, teamName: canon.get(id) ?? nom, teamLogo: null,
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
        description: null,
        home: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
        away: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 }
      }));
    }
    return t;
  };

  for (const r of rows) {
    for (const cote of ['home', 'away']) {
      const t = fiche(cote === 'home' ? r.home_id : r.away_id, cote === 'home' ? r.home_name : r.away_name);
      const pour = cote === 'home' ? r.home_goals : r.away_goals;
      const contre = cote === 'home' ? r.away_goals : r.home_goals;
      const issue = pour > contre ? 'won' : pour === contre ? 'drawn' : 'lost';
      t.played++; t[issue]++; t.goalsFor += pour; t.goalsAgainst += contre;
      t.points += issue === 'won' ? 3 : issue === 'drawn' ? 1 : 0;
      const c = t[cote];
      c.played++; c[issue]++; c.goalsFor += pour; c.goalsAgainst += contre;
    }
  }

  // Points, puis différence de buts, puis buts marqués. Les départages
  // propres à chaque fédération — confrontations directes en Italie, en
  // Espagne — ne sont PAS reproduits : ils demanderaient de rejouer les
  // face-à-face, et le classement servirait alors de source plutôt que
  // d'aperçu. Deux équipes à égalité peuvent donc être interverties.
  const classees = [...table.values()].sort((a, b) =>
    b.points - a.points
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || a.teamName.localeCompare(b.teamName));
  classees.forEach((t, i) => { t.rank = i + 1; t.goalDiff = t.goalsFor - t.goalsAgainst; });

  return { leagueName: league, season: saison, source: 'fotmob', rows: classees };
}

/**
 * Les trois classements individuels d'une compétition : buteurs, passeurs,
 * clean sheets.
 *
 * Trois requêtes courtes plutôt qu'un appel à `playerSeasonStats` filtré
 * trois fois : celui-ci agrège les quarante colonnes du référentiel et trie
 * selon le poste, alors qu'il ne s'agit ici que de sommer une colonne. La
 * saison en cours par défaut, comme le classement d'équipes.
 *
 * Le regroupement se fait sur l'IDENTITÉ du joueur, jamais sur son nom —
 * « Pedrinho » désigne cinq hommes, et un classement de buteurs groupé par
 * nom leur additionnerait leurs buts.
 */
export function leagueLeaders(league, { season = null, limit = 20, database = openDb() } = {}) {
  ensureRegistries({ database });
  const saison = season ?? seasonsForLeague(league, { database })[0]?.season ?? null;
  const bornes = saison ? ' AND m.date >= ? AND m.date < ?' : '';
  const args = saison ? [league, ...seasonBounds(league, saison)] : [league];

  const classement = (colonne, extra = '') => database.prepare(`
    SELECT ${IDENTITY_SQL} AS playerId,
           COALESCE(MAX(ident.name), MAX(p.name)) AS name,
           MAX(ident.position) AS position,
           COALESCE(MAX(tm.name), MAX(CASE WHEN p.side = 'home' THEN m.home_name ELSE m.away_name END)) AS team,
           MAX(CASE WHEN p.side = 'home' THEN m.home_id ELSE m.away_id END) AS teamId,
           SUM(CASE WHEN p.minutes > 0 THEN 1 ELSE 0 END) AS played,
           COALESCE(SUM(p.minutes), 0) AS minutes,
           ${colonne} AS value
    FROM players p
    JOIN matches m ON m.match_key = p.match_key
    LEFT JOIN people ident ON ident.player_id = ${IDENTITY_SQL}
    LEFT JOIN teams tm ON tm.team_id = (CASE WHEN p.side = 'home' THEN m.home_id ELSE m.away_id END)
    WHERE m.league = ? AND ${HORS_QUALIFICATION}${bornes}${extra}
    GROUP BY ${IDENTITY_SQL}
    HAVING value > 0
    ORDER BY value DESC, COALESCE(SUM(p.minutes), 0) ASC
    LIMIT ?`).all(...args, limit);

  return {
    league,
    season: saison,
    // Un match sans but encaissé ne compte que si la donnée est RENSEIGNÉE :
    // un NULL veut dire « non relevé », pas « zéro encaissé ». Et seul un
    // gardien ayant réellement joué peut en revendiquer un.
    scorers: classement('COALESCE(SUM(p.goals), 0)'),
    assists: classement('COALESCE(SUM(p.assists), 0)'),
    cleanSheets: classement(
      `SUM(CASE WHEN ${CLEAN_SHEET} THEN 1 ELSE 0 END)`,
      " AND p.position = 'Goalkeeper'"
    )
  };
}

/**
 * Ordre des tours d'une coupe.
 *
 * FotMob les note en clair — « 1 », « 2 », « 1/8 », « 1/4 », « 1/2 »,
 * « final » — et l'ordre alphabétique les mettrait dans le désordre le plus
 * complet : « final » avant « 1 », « 1/2 » avant « 1/4 ». D'où ce barème.
 * Les tours numérotés viennent d'abord, dans l'ordre, puis les phases
 * finales de la plus large à la plus étroite.
 */
const ORDRE_TOUR = { '1/16': 100, '1/8': 200, '1/4': 300, '1/2': 400, final: 500 };
function rangDuTour(round) {
  if (round === null || round === undefined) return 900;
  const texte = String(round).trim().toLowerCase();
  if (ORDRE_TOUR[texte] !== undefined) return ORDRE_TOUR[texte];
  if (/^\d+$/.test(texte)) return Number(texte); // tours preliminaires
  if (texte.includes('final') && !texte.includes('semi') && !texte.includes('quarter')) return 500;
  if (texte.includes('semi')) return 400;
  if (texte.includes('quarter')) return 300;
  if (texte.includes('round of 16') || texte.includes('16')) return 200;
  return 800; // groupe, barrage, intitule inconnu : range a la fin
}

/**
 * Le tableau d'une coupe : ses rencontres groupées par tour, du premier au
 * dernier.
 *
 * Aucune donnée nouvelle n'est nécessaire — le tour est déjà dans `meta`
 * depuis le premier import. Il suffisait de le lire et de l'ordonner.
 */
export function cupBracket(league, { season = null, database = openDb() } = {}) {
  ensureRegistries({ database });
  const saison = season ?? seasonsForLeague(league, { database })[0]?.season ?? null;
  const bornes = saison ? ' AND date >= ? AND date < ?' : '';
  const args = saison ? [league, ...seasonBounds(league, saison)] : [league];

  const canon = canonicalTeamNames({ database });
  const rows = database.prepare(
    `SELECT match_key, fotmob_id, date, home_name, away_name, home_id, away_id, home_goals, away_goals, meta
     FROM matches WHERE league = ?${bornes} ORDER BY date`
  ).all(...args);
  if (!rows.length) return null;

  // Un tour est un BLOC CONTIGU de rencontres portant le même intitulé, et
  // non simplement « toutes les rencontres portant cet intitulé ».
  //
  // La distinction n'est pas théorique : FotMob appelle « final » le dernier
  // tour de QUALIFICATION d'août autant que la finale de mai. Regroupés par
  // intitulé, les deux se retrouvaient ensemble — la Ligue des champions
  // affichait « final : 15 matchs », dont quatorze barrages joués avant même
  // la phase de ligue. Les rencontres étant lues par date, un nouveau bloc
  // s'ouvre dès que l'intitulé change ; les tours intercalés séparent donc
  // naturellement les deux « finales ».
  // Un tour est un ensemble de rencontres portant le même intitulé ET
  // rapprochées dans le temps — pas simplement « toutes celles qui portent
  // cet intitulé », ni « celles qui se suivent sans interruption ».
  //
  // Les deux règles naïves échouent, chacune à sa façon. Regrouper par le
  // seul intitulé mettait ensemble le dernier tour de QUALIFICATION d'août,
  // que FotMob appelle « final », et la finale de mai : la Ligue des
  // champions affichait « final : 15 matchs ». Exiger des rencontres
  // strictement consécutives découpait au contraire le premier tour de FA
  // Cup en quatre morceaux, les rejouages et les matchs sans tour
  // s'intercalant entre ses rencontres.
  //
  // Le critère qui tient est l'ÉCART : un tour se joue sur quelques jours,
  // parfois quelques semaines avec les rejouages, jamais au-delà. Deux
  // rencontres de même intitulé séparées de plus de quarante jours
  // appartiennent à deux tours différents.
  const ECART_MAX_JOURS = 40;
  const JOUR = 86_400_000;
  const parIntitule = new Map();
  for (const r of rows) {
    const round = parse(r.meta)?.round ?? null;
    const cle = round === null ? 'Tour inconnu' : String(round);
    if (!parIntitule.has(cle)) parIntitule.set(cle, []);
    parIntitule.get(cle).push(r);
  }

  const blocs = [];
  for (const [cle, rencontres] of parIntitule) {
    let bloc = null;
    for (const r of rencontres) {
      const ecart = bloc ? (Date.parse(r.date) - Date.parse(bloc.last)) / JOUR : Infinity;
      if (!bloc || ecart > ECART_MAX_JOURS) blocs.push((bloc = { round: cle, from: r.date, last: r.date, matches: [] }));
      bloc.last = r.date;
      bloc.matches.push(ligne(r));
    }
  }

  function ligne(r) {
    return {
      matchId: r.fotmob_id ?? r.match_key,
      date: r.date,
      home: canon.get(r.home_id) ?? r.home_name,
      away: canon.get(r.away_id) ?? r.away_name,
      homeId: r.home_id,
      awayId: r.away_id,
      homeGoals: r.home_goals,
      awayGoals: r.away_goals,
      played: r.home_goals !== null && r.away_goals !== null
    };
  }

  // Un intitulé qui revient est daté, sans quoi deux sections s'appelleraient
  // « final » sans que rien ne les distingue à l'écran.
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const occurrences = blocs.reduce((acc, b) => ({ ...acc, [b.round]: (acc[b.round] ?? 0) + 1 }), {});
  const datation = (from) => `${MOIS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;

  return {
    league,
    season: saison,
    rounds: blocs
      // Chronologie d'abord : c'est l'ordre réel des tours. Le barème ne
      // départage que des blocs commençant le même jour.
      .sort((a, b) => a.from.localeCompare(b.from) || rangDuTour(a.round) - rangDuTour(b.round))
      .map(({ round, from, matches }) => ({
        round: occurrences[round] > 1 ? `${round} — ${datation(from)}` : round,
        from,
        count: matches.length,
        matches
      }))
  };
}

/**
 * Index léger de tout le magasin, par clé de rencontre.
 *
 * Remplace `readStoredEntries()`, qui relisait et analysait les 1,5 Go de
 * fichiers JSON mensuels à chaque appel — au démarrage d'un import, d'un
 * relevé de retard, d'une reprise. C'était la raison d'être de la double
 * écriture, et la voici servie par une requête indexée.
 *
 * LÉGER, délibérément : ni statistiques d'équipe, ni lignes de joueurs, ni
 * déroulé. Les appelants n'ont besoin que de savoir CE QUI EST DÉJÀ LÀ et
 * D'OÙ ÇA VIENT. Charger le reste ferait revenir, sous une autre forme, le
 * coût qu'on supprime.
 *
 * La PRÉSENCE de chaque source est calculée EN SQL, et rendue comme un
 * booléen. Mesuré sur les 55 828 rencontres : remonter le texte des sources
 * jusqu'à JavaScript coûte 13,4 s, le tester sur place 0,8 s — seize fois
 * moins. Ce n'est pas la lecture des lignes qui coûte, c'est le transfert de
 * 55 000 chaînes dont on ne veut qu'un oui ou non.
 */
const MARQUE_FOTMOB = 'fotmob.com/api/data/matchDetails';
const MARQUE_ESPN = 'cdn.espn.com/core/soccer/match';

export function storedEntriesIndex({ database = openDb() } = {}) {
  const index = new Map();
  for (const r of database.prepare(
    `SELECT match_key, date, league, home_name, away_name, home_goals, away_goals, fotmob_id,
            sources LIKE '%' || ? || '%' AS from_fotmob,
            sources LIKE '%' || ? || '%' AS from_espn,
            json_extract(meta, '$.rev') AS meta_rev
     FROM matches`
  ).iterate(MARQUE_FOTMOB, MARQUE_ESPN)) {
    index.set(r.match_key, {
      matchKey: r.match_key,
      date: r.date,
      league: r.league,
      homeName: r.home_name,
      awayName: r.away_name,
      homeGoals: r.home_goals,
      awayGoals: r.away_goals,
      // L'identifiant de la rencontre chez la source : ce qui permet de la
      // reprendre par identité plutôt que par rapprochement de noms.
      fotmobId: r.fotmob_id ?? null,
      fromFotmob: r.from_fotmob === 1,
      fromEspn: r.from_espn === 1,
      metaRev: r.meta_rev ?? null
    });
  }
  return index;
}

/**
 * Saisons couvertes par une compétition, la plus récente d'abord, avec leur
 * libellé (« 2025-26 » ou « 2025 »). Le mois de début vient de la
 * compétition : juillet en Europe, janvier ailleurs — voir seasonWindows.js.
 */
export function seasonsForLeague(league, { database = openDb() } = {}) {
  const debut = seasonStartMonth(league);
  return database
    .prepare(
      `SELECT CAST(strftime('%Y', date, CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= ? THEN '0 day' ELSE '-1 year' END) AS INTEGER) AS season,
              COUNT(*) AS matches
       FROM matches WHERE league = ? GROUP BY season ORDER BY season DESC`
    )
    .all(debut, league)
    .filter((r) => r.season !== null)
    .map((r) => ({ ...r, label: seasonLabel(league, r.season) }));
}

/**
 * Classement OFFICIEL d'une compétition pour une saison, tel que FotMob le
 * publie (cf. fotMobStandingsRefresh.js). Plusieurs tables possibles —
 * conférences, Apertura/Clausura, zones — dans l'ordre de la source. Sans
 * saison, la plus récente enregistrée. `null` si rien n'a été relevé.
 */
export function officialStandings(league, { season = null, database = openDb() } = {}) {
  const saison = season ?? database.prepare('SELECT MAX(season) AS s FROM standings_official WHERE league = ?').get(league)?.s ?? null;
  if (saison === null) return null;
  const rows = database
    .prepare('SELECT table_name, ord, fotmob_league_id, fotmob_season, fetched_at, rows FROM standings_official WHERE league = ? AND season = ? ORDER BY ord, table_name')
    .all(league, Number(saison));
  if (!rows.length) return null;
  return {
    leagueName: league,
    season: Number(saison),
    seasonLabel: seasonLabel(league, saison),
    source: 'fotmob',
    official: true,
    fetchedAt: rows.reduce((max, r) => (r.fetched_at > max ? r.fetched_at : max), ''),
    fotmobLeagueId: rows[0].fotmob_league_id,
    tables: rows.map((r) => ({ name: r.table_name, fotmobSeason: r.fotmob_season, rows: JSON.parse(r.rows) }))
  };
}

/**
 * Championnats dont les rencontres jouées récemment n'ont PAS de statistiques
 * d'équipe (corners, tirs, cartons…) dans `team_stats` — certaines coupes
 * (Taça de Portugal, Copa Chile…) ne sont couvertes que sur le score, jamais
 * sur le détail, alors que le reste du magasin est quasi entièrement à 100 %.
 * Fenêtre glissante plutôt que la saison complète par compétition (bornes
 * différentes selon seasonWindows.js) : on veut savoir si la couverture est
 * bonne EN CE MOMENT, pas historiquement. `minPlayed` évite qu'une coupe qui
 * vient de commencer (1 ou 2 matchs joués) ressorte sur un simple hasard.
 */
export function leaguesWithIncompleteStats({ database = openDb(), sinceDate = null, threshold = 0.9, minPlayed = 5 } = {}) {
  const depuis = sinceDate ?? new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = database
    .prepare(
      `SELECT m.league AS league, COUNT(*) AS joues,
         SUM(CASE WHEN t.match_key IS NOT NULL THEN 1 ELSE 0 END) AS avecStats
       FROM matches m
       LEFT JOIN team_stats t ON t.match_key = m.match_key AND t.side = 'home'
       WHERE m.date >= @depuis AND m.home_goals IS NOT NULL AND m.league <> ''
       GROUP BY m.league`
    )
    .all({ depuis });
  return rows.filter((r) => r.joues >= minPlayed && r.avecStats / r.joues < threshold).map((r) => r.league);
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
    incompleteStatsLeagues: leaguesWithIncompleteStats({ database }),
    lastMatchDate: m.lastMatchDate ?? null,
    lastUpdatedAt: m.lastUpdatedAt ?? null
  };
}

/**
 * Faits nécessaires au calcul de couverture, par rencontre : combien de
 * statistiques d'équipe sont renseignées côté domicile, et si la feuille
 * porte des joueurs.
 *
 * Remplace un `readStoredEntries()` qui relisait et reparsait les 482 Mo du
 * dossier JSON À CHAQUE APPEL — et `node:sqlite` comme `JSON.parse` étant
 * synchrones, ces 17 secondes bloquaient TOUT le serveur, `/status` compris.
 * La page Réglages, elle, renonçait avant la fin et affichait « Couverture
 * indisponible » alors que la donnée était là.
 */
export function coverageFacts({ database = openDb() } = {}) {
  const champs = TEAM_COLUMNS
    .map((c) => `CASE WHEN "${c.column}" IS NOT NULL THEN 1 ELSE 0 END`)
    .join(' + ');
  // TROIS requêtes séparées, assemblées en JavaScript, plutôt qu'une seule
  // avec jointures. Mesuré : chaque morceau coûte 100 à 300 ms, mais les
  // laisser se joindre en SQL faisait 6 s — le planificateur s'y prend mal
  // sur ces agrégats. Et comme node:sqlite est synchrone, ces secondes
  // bloquaient tout le serveur.
  const parCle = new Map();
  for (const m of database.prepare('SELECT match_key, date, league FROM matches').all()) {
    parCle.set(m.match_key, { ...m, champs: 0, joueursDomicile: 0, joueurs: 0 });
  }
  for (const t of database.prepare(`SELECT match_key, ${champs} AS champs FROM team_stats WHERE side = 'home'`).all()) {
    const l = parCle.get(t.match_key);
    if (l) l.champs = t.champs;
  }
  const sql = "SELECT match_key, SUM(CASE WHEN side = 'home' THEN 1 ELSE 0 END) domicile, COUNT(*) total FROM players GROUP BY match_key";
  for (const j of database.prepare(sql).all()) {
    const l = parCle.get(j.match_key);
    if (l) { l.joueursDomicile = j.domicile; l.joueurs = j.total; }
  }
  return parCle;
}

/** Récapitulatif par saison, en une requête plutôt qu'en parcourant le magasin. */
export function seasonSummary({ database = openDb() } = {}) {
  // Une saison va de juillet à juin : le mois décide de l'année de départ.
  return database.prepare(`
    SELECT debut || '-' || substr(CAST(debut + 1 AS TEXT), 3) AS season,
           COUNT(*) AS matches,
           SUM(CASE WHEN joueurs > 0 THEN 1 ELSE 0 END) AS withPlayers,
           SUM(joueurs) AS playerRows,
           COUNT(DISTINCT league) AS leagues
    FROM (
      SELECT m.league,
             CAST(substr(m.date, 1, 4) AS INTEGER)
               - (CASE WHEN CAST(substr(m.date, 6, 2) AS INTEGER) >= 7 THEN 0 ELSE 1 END) AS debut,
             (SELECT COUNT(*) FROM players p WHERE p.match_key = m.match_key) AS joueurs
      FROM matches m
    )
    GROUP BY debut
    ORDER BY debut`).all();
}
