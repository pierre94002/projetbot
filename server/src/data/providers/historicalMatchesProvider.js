import { openDb } from '../db/matchStatsDb.js';
import { ensureRegistries, findTeams } from '../db/identityRegistry.js';
import { LIGUES } from './footballDataOdds.js';
import { DIVISIONS, FICHIERS_PAR_PAYS, paysDuCode } from './footballDataHistory.js';

/**
 * Historique football-data.co.uk pour l'analyse IA (matchAiAnalysisService.js)
 * — contexte ADDITIF, jamais le remplacement silencieux d'une source déjà
 * utilisée : il ne sert qu'à une équipe que le magasin FotMob ne connaît pas
 * dans la compétition, et son classement seulement de repli.
 *
 * REBRANCHÉ le 06/10/2026 (étape 13 du plan). Avant : 16 championnats et 5
 * saisons de CSV sous server/data/fixtures/historique, lus en mémoire, et le
 * club retrouvé par RESSEMBLANCE de nom (findBestTeamNameMatch) — ce que la
 * règle du projet interdit (« Port », « Portsmouth » et « Porto »). Maintenant :
 * la table fd_history (toutes les saisons depuis 2000-01, 22 divisions et 16
 * fichiers par pays, mise à jour par l'actualisation), et le club retrouvé par
 * son IDENTIFIANT FotMob — le nom EXACT d'un club de l'annuaire (findTeams :
 * toutes les écritures vues au magasin), parmi les seuls clubs qui ont joué
 * dans la compétition, un seul ou rien ; ni mots translittérés ni inclusion de
 * mots (« Arsenal Tula » n'est pas Arsenal) —, relié aux noms football-data
 * par le vote jour + score (fd_teams.team_id) ; à défaut, le nom football-data
 * écrit EXACTEMENT pareil, dans le même pays (un club disparu des
 * championnats suivis avant 2023 n'a pas d'identifiant FotMob). Mêmes
 * fonctions, mêmes formes rendues qu'avant. Le dossier
 * server/data/fixtures/historique n'est plus lu.
 *
 * Le libellé de compétition est celui du magasin (« EPL », « La Liga -
 * Spain ») ; l'ancien format The Odds API « <Ligue> - <Pays> » reste compris
 * (resolveLeagueCode).
 */

/** Libellés des divisions (champ divisionLabel, inchangé pour les 16 d'avant). */
const LIBELLES = {
  E0: 'Premier League',
  E1: 'Championship',
  E2: 'League One',
  E3: 'League Two',
  EC: 'National League',
  SC0: 'Premiership',
  SC1: 'Championship (Écosse)',
  SC2: 'League One (Écosse)',
  SC3: 'League Two (Écosse)',
  D1: 'Bundesliga',
  D2: '2. Bundesliga',
  I1: 'Serie A',
  I2: 'Serie B',
  SP1: 'La Liga',
  SP2: 'La Liga 2',
  F1: 'Ligue 1',
  F2: 'Ligue 2',
  N1: 'Eredivisie',
  B1: 'Pro League',
  P1: 'Primeira Liga',
  T1: 'Süper Lig',
  G1: 'Super League'
};

/**
 * L'ancien repérage par libellé « <Ligue> - <Pays> » (The Odds API), gardé pour
 * les libellés qui ne sont pas ceux du magasin. Pays exigé quand fourni, pour
 * désambiguïser les noms de compétition partagés entre plusieurs pays (ex.
 * « Super League » : Grèce ET Turquie).
 */
const LEAGUE_CODES = {
  E0: { countries: ['england'], leagues: ['premier league', 'epl'] },
  E1: { countries: ['england'], leagues: ['championship'] },
  SC0: { countries: ['scotland'], leagues: ['premiership'] },
  D1: { countries: ['germany'], leagues: ['bundesliga'] },
  D2: { countries: ['germany'], leagues: ['2. bundesliga', 'bundesliga 2', '2 bundesliga'] },
  I1: { countries: ['italy'], leagues: ['serie a'] },
  I2: { countries: ['italy'], leagues: ['serie b'] },
  SP1: { countries: ['spain'], leagues: ['la liga', 'laliga', 'primera division'] },
  SP2: { countries: ['spain'], leagues: ['la liga 2', 'laliga 2', 'segunda division'] },
  F1: { countries: ['france'], leagues: ['ligue 1'] },
  F2: { countries: ['france'], leagues: ['ligue 2'] },
  N1: { countries: ['netherlands'], leagues: ['eredivisie'] },
  // "Belgium First Div" est l'intitulé de The Odds API.
  B1: { countries: ['belgium'], leagues: ['pro league', 'jupiler pro league', 'first division a', 'belgium first div', 'first div'] },
  P1: { countries: ['portugal'], leagues: ['primeira liga', 'liga portugal'] },
  T1: { countries: ['turkey'], leagues: ['super lig', 'super league'] },
  G1: { countries: ['greece'], leagues: ['super league'] }
};

// Une equipe promue ou releguee n'a aucun match dans sa division actuelle :
// tout son historique est dans la division voisine. On l'y cherche plutot que
// de ne rien renvoyer — en signalant d'ou vient la donnee, jamais en la
// faisant passer pour la division du match.
const NEIGHBOUR_CODES = {
  E0: ['E1'],
  E1: ['E0', 'E2'],
  E2: ['E1', 'E3'],
  E3: ['E2', 'EC'],
  SC0: ['SC1'],
  D1: ['D2'],
  D2: ['D1'],
  I1: ['I2'],
  I2: ['I1'],
  SP1: ['SP2'],
  SP2: ['SP1'],
  F1: ['F2'],
  F2: ['F1']
};

function describeDivision(code, primaryCode) {
  return {
    leagueCode: code,
    division: code === primaryCode ? 'same' : 'other',
    divisionLabel: LIBELLES[code] ?? FICHIERS_PAR_PAYS[code] ?? code
  };
}

function normalize(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Même alias que leagueRegistry.js#parseSportTitle — The Odds API nomme
// l'Angleterre "EPL" (sigle seul, sans " - Country").
const SPORT_TITLE_ALIASES = { epl: { leagueName: 'Premier League', countryName: 'England' } };

function parseSportTitle(sportTitle) {
  const alias = SPORT_TITLE_ALIASES[sportTitle.trim().toLowerCase()];
  if (alias) return alias;
  const separatorIndex = sportTitle.lastIndexOf(' - ');
  if (separatorIndex === -1) return { leagueName: sportTitle, countryName: null };
  return { leagueName: sportTitle.slice(0, separatorIndex), countryName: sportTitle.slice(separatorIndex + 3) };
}

/**
 * Le code football-data d'une compétition : d'abord le libellé EXACT du
 * magasin (« La Liga - Spain » -> SP1, « MLS » -> USA), sinon l'ancien
 * repérage par alias de compétition. Null pour une coupe ou un championnat
 * que football-data ne publie pas.
 */
export function resolveLeagueCode(sportTitle) {
  if (!sportTitle) return null;
  const exact = LIGUES.get(sportTitle);
  if (exact) return exact;
  const { leagueName, countryName } = parseSportTitle(sportTitle);
  const normalizedLeague = normalize(leagueName);
  const normalizedCountry = normalize(countryName);
  // Alias exact d'abord, sinon le plus long alias contenu/contenant — sans ça
  // "la liga 2" tombait sur SP1 ('la liga') et "bundesliga 2" sur D1.
  let best = null;
  for (const [code, def] of Object.entries(LEAGUE_CODES)) {
    if (normalizedCountry && !def.countries.includes(normalizedCountry)) continue;
    for (const alias of def.leagues) {
      if (alias === normalizedLeague) return code;
      const related = normalizedLeague.includes(alias) || alias.includes(normalizedLeague);
      if (related && (!best || alias.length > best.length)) best = { code, length: alias.length };
    }
  }
  return best?.code ?? null;
}

/** La compétition du magasin d'un code (pour l'annuaire strict) : le libellé reçu s'il est du magasin, sinon celui du code. */
function competitionDuMagasin(code, leagueLabel) {
  if (LIGUES.get(leagueLabel) === code) return leagueLabel;
  for (const [league, c] of LIGUES) if (c === code) return league;
  return null;
}

/** Les clubs qui ont joué dans une compétition (identifiants FotMob), gardés 30 min. */
const clubsParCompetition = new Map();
function clubsDeLaCompetition(database, league) {
  const connu = clubsParCompetition.get(league);
  if (connu && connu.database === database && Date.now() - connu.at < 30 * 60_000) return connu.ids;
  const ids = new Set(
    database
      .prepare('SELECT home_id AS id FROM matches WHERE league = ? AND home_id IS NOT NULL UNION SELECT away_id FROM matches WHERE league = ? AND away_id IS NOT NULL')
      .all(league, league)
      .map((r) => r.id)
  );
  clubsParCompetition.set(league, { database, at: Date.now(), ids });
  return ids;
}

/** L'identifiant FotMob d'un nom : le nom EXACT d'un club de l'annuaire, parmi les clubs de la compétition ; un seul, sinon null. */
function clubExact(database, teamName, league) {
  ensureRegistries({ database });
  const dans = clubsDeLaCompetition(database, league);
  const retenus = findTeams(teamName, { database }).filter((c) => dans.has(c.teamId));
  return retenus.length === 1 ? retenus[0].teamId : null;
}

/**
 * Les identités football-data (fd_teams.id) d'un club, dans le pays du code :
 * par son identifiant FotMob (nom exact de l'annuaire, parmi les clubs de la
 * compétition), sinon par son nom football-data EXACT. Jamais par
 * ressemblance.
 */
function identitesDuClub(database, code, teamName, leagueLabel) {
  const pays = paysDuCode(code);
  if (!pays || !teamName) return [];
  const ids = new Set();
  let teamId = null;
  const league = competitionDuMagasin(code, leagueLabel);
  try {
    teamId = league ? clubExact(database, teamName, league) : null;
  } catch {
    teamId = null;
  }
  if (teamId) for (const r of database.prepare('SELECT id FROM fd_teams WHERE pays = ? AND team_id = ?').all(pays, teamId)) ids.add(r.id);
  if (!ids.size) for (const r of database.prepare('SELECT id FROM fd_teams WHERE pays = ? AND nom = ?').all(pays, String(teamName).trim())) ids.add(r.id);
  return [...ids];
}

/** Les derniers matchs d'un club dans sa division, sinon dans la division voisine (la première où il en a). */
function recentMatchesForTeam(primaryCode, teamName, leagueLabel, limit, database) {
  for (const code of [primaryCode, ...(NEIGHBOUR_CODES[primaryCode] ?? [])]) {
    const ids = identitesDuClub(database, code, teamName, leagueLabel);
    if (!ids.length) continue;
    const marques = ids.map(() => '?').join(', ');
    const matches = database
      .prepare(
        `SELECT date, dom, ext, bd, be, tirs_d, tirs_e, cadres_d, cadres_e, corners_d, corners_e, jaunes_d, jaunes_e
         FROM fd_history WHERE code = ? AND (dom IN (${marques}) OR ext IN (${marques})) ORDER BY date DESC, id DESC LIMIT ?`
      )
      .all(code, ...ids, ...ids, limit);
    if (matches.length) return { code, ids, matches };
  }
  return { code: null, ids: [], matches: [] };
}

function average(values) {
  const filtered = values.filter((v) => v !== null && v !== undefined);
  if (!filtered.length) return null;
  return Number((filtered.reduce((sum, v) => sum + v, 0) / filtered.length).toFixed(2));
}

/**
 * Moyennes (tirs, tirs cadrés, corners, cartons jaunes, buts) sur les
 * derniers matchs d'une équipe, toutes venues confondues. `null` si la
 * compétition n'est pas publiée par football-data ou si l'équipe n'y est pas
 * trouvée — jamais une erreur.
 */
export function resolveHistoricalStatsByName(teamName, leagueLabel, sampleSize = 10, { database = openDb() } = {}) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;
  const { code: foundCode, ids, matches } = recentMatchesForTeam(code, teamName, leagueLabel, sampleSize, database);
  if (!matches.length) return null;
  const isHome = (m) => ids.includes(m.dom);
  const averages = {
    goalsFor: average(matches.map((m) => (isHome(m) ? m.bd : m.be))),
    goalsAgainst: average(matches.map((m) => (isHome(m) ? m.be : m.bd))),
    shots: average(matches.map((m) => (isHome(m) ? m.tirs_d : m.tirs_e))),
    shotsOnTarget: average(matches.map((m) => (isHome(m) ? m.cadres_d : m.cadres_e))),
    corners: average(matches.map((m) => (isHome(m) ? m.corners_d : m.corners_e))),
    yellowCards: average(matches.map((m) => (isHome(m) ? m.jaunes_d : m.jaunes_e)))
  };
  return { sampleSize: matches.length, averages, ...describeDivision(foundCode, code) };
}

/** Les derniers résultats (V/N/D), du plus récent au plus ancien. */
export function resolveHistoricalFormByName(teamName, leagueLabel, sampleSize = 5, { database = openDb() } = {}) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;
  const { code: foundCode, ids, matches } = recentMatchesForTeam(code, teamName, leagueLabel, sampleSize, database);
  if (!matches.length) return null;
  const results = matches.map((m) => {
    if (m.bd === m.be) return 'N';
    const isHome = ids.includes(m.dom);
    return (isHome && m.bd > m.be) || (!isHome && m.be > m.bd) ? 'V' : 'D';
  });
  return { sampleSize: matches.length, results, ...describeDivision(foundCode, code) };
}

/**
 * Le classement de la saison la plus récente d'une division, calculé sur les
 * résultats de fd_history (3 points la victoire, 1 le nul ; départage :
 * points, différence, buts marqués — comme l'ancien import). C'est un
 * classement CALCULÉ : ni pénalités de points ni départages officiels.
 */
function classementCalcule(database, code) {
  const derniere = database.prepare('SELECT saison FROM fd_history WHERE code = ? ORDER BY date DESC LIMIT 1').get(code)?.saison;
  if (!derniere) return null;
  const table = new Map();
  const ligne = (id) => {
    if (!table.has(id)) table.set(id, { id, J: 0, V: 0, N: 0, D: 0, BP: 0, BC: 0, Pts: 0 });
    return table.get(id);
  };
  for (const m of database.prepare('SELECT dom, ext, bd, be FROM fd_history WHERE code = ? AND saison = ?').all(code, derniere)) {
    const h = ligne(m.dom);
    const a = ligne(m.ext);
    h.J++;
    a.J++;
    h.BP += m.bd;
    h.BC += m.be;
    a.BP += m.be;
    a.BC += m.bd;
    if (m.bd > m.be) {
      h.V++;
      h.Pts += 3;
      a.D++;
    } else if (m.bd < m.be) {
      a.V++;
      a.Pts += 3;
      h.D++;
    } else {
      h.N++;
      a.N++;
      h.Pts++;
      a.Pts++;
    }
  }
  const rangees = [...table.values()].map((t) => ({ ...t, Diff: t.BP - t.BC })).sort((x, y) => y.Pts - x.Pts || y.Diff - x.Diff || y.BP - x.BP);
  rangees.forEach((t, i) => (t.Rang = i + 1));
  // La saison au format d'avant (« 2526 ») pour les fichiers saisonniers, telle quelle pour les fichiers par pays.
  const m = String(derniere).match(/^20(\d{2})-(\d{2})$/);
  return { saison: DIVISIONS[code] && m ? `${m[1]}${m[2]}` : derniere, lignes: rangees };
}

/**
 * Classement local de repli (saison la plus récente de fd_history) pour un
 * championnat couvert — quand getStandingsByLeagueLabel (live) ne trouve rien,
 * jamais un remplacement quand la source live a déjà répondu.
 */
export function resolveHistoricalStandingRow(teamName, leagueLabel, { database = openDb() } = {}) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;
  for (const candidate of [code, ...(NEIGHBOUR_CODES[code] ?? [])]) {
    const ids = identitesDuClub(database, candidate, teamName, leagueLabel);
    if (!ids.length) continue;
    const classement = classementCalcule(database, candidate);
    const row = classement?.lignes.find((l) => ids.includes(l.id));
    if (!row) continue;
    return {
      source: 'football-data.co.uk (historique)',
      season: classement.saison,
      ...describeDivision(candidate, code),
      rank: row.Rang,
      played: row.J,
      won: row.V,
      drawn: row.N,
      lost: row.D,
      goalsFor: row.BP,
      goalsAgainst: row.BC,
      goalDiff: row.Diff,
      points: row.Pts
    };
  }
  return null;
}
