import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data/fixtures/historique');

/**
 * Source locale et gratuite (football-data.co.uk, cf.
 * scripts/import-historical-matches.js) — 16 grands championnats européens,
 * 5 dernières saisons, ~28 000 matchs déjà téléchargés en CSV. Aucune limite
 * de requêtes, contrairement à API-Football (plan gratuit : 100 req/jour,
 * saisons 2022-2024 uniquement) — sert de contexte ADDITIF pour l'analyse IA
 * (matchAiAnalysisService.js), jamais de remplacement silencieux d'une
 * source déjà utilisée.
 *
 * Le libellé de ligue partout ailleurs dans CôteMaster suit le format Odds
 * API "<Ligue> - <Pays>" (cf. leagueRegistry.js#parseSportTitle) — la table
 * ci-dessous fait le lien avec les codes football-data.co.uk (ex. "SP1").
 * Pays exigé quand fourni, pour désambiguïser les noms de compétition
 * partagés entre plusieurs pays (ex. "Super League" : Grèce ET Turquie).
 */
const LEAGUE_CODES = {
  E0: { countries: ['england'], leagues: ['premier league', 'epl'], label: 'Premier League' },
  E1: { countries: ['england'], leagues: ['championship'], label: 'Championship' },
  SC0: { countries: ['scotland'], leagues: ['premiership'], label: 'Premiership' },
  D1: { countries: ['germany'], leagues: ['bundesliga'], label: 'Bundesliga' },
  D2: { countries: ['germany'], leagues: ['2. bundesliga', 'bundesliga 2', '2 bundesliga'], label: '2. Bundesliga' },
  I1: { countries: ['italy'], leagues: ['serie a'], label: 'Serie A' },
  I2: { countries: ['italy'], leagues: ['serie b'], label: 'Serie B' },
  SP1: { countries: ['spain'], leagues: ['la liga', 'laliga', 'primera division'], label: 'La Liga' },
  SP2: { countries: ['spain'], leagues: ['la liga 2', 'laliga 2', 'segunda division'], label: 'La Liga 2' },
  F1: { countries: ['france'], leagues: ['ligue 1'], label: 'Ligue 1' },
  F2: { countries: ['france'], leagues: ['ligue 2'], label: 'Ligue 2' },
  N1: { countries: ['netherlands'], leagues: ['eredivisie'], label: 'Eredivisie' },
  B1: { countries: ['belgium'], leagues: ['pro league', 'jupiler pro league', 'first division a'], label: 'Pro League' },
  P1: { countries: ['portugal'], leagues: ['primeira liga', 'liga portugal'], label: 'Primeira Liga' },
  T1: { countries: ['turkey'], leagues: ['super lig', 'super league'], label: 'Süper Lig' },
  G1: { countries: ['greece'], leagues: ['super league'], label: 'Super League' }
};

// Une equipe promue ou relegue n'a aucun match dans sa division actuelle :
// tout son historique est dans la division voisine (Wolfsburg en D1 alors
// qu'il joue en D2, Hull en E1 alors qu'il joue en E0...). On l'y cherche
// plutot que de ne rien renvoyer — en signalant d'ou vient la donnee, jamais
// en la faisant passer pour la division du match.
const NEIGHBOUR_CODES = {
  E0: ['E1'],
  E1: ['E0'],
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
    divisionLabel: LEAGUE_CODES[code]?.label ?? code
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
// l'Angleterre "EPL" (sigle seul, sans " - Country"), vérifié le 2026-09-14.
const SPORT_TITLE_ALIASES = { epl: { leagueName: 'Premier League', countryName: 'England' } };

function parseSportTitle(sportTitle) {
  const alias = SPORT_TITLE_ALIASES[sportTitle.trim().toLowerCase()];
  if (alias) return alias;

  const separatorIndex = sportTitle.lastIndexOf(' - ');
  if (separatorIndex === -1) return { leagueName: sportTitle, countryName: null };
  return { leagueName: sportTitle.slice(0, separatorIndex), countryName: sportTitle.slice(separatorIndex + 3) };
}

export function resolveLeagueCode(sportTitle) {
  if (!sportTitle) return null;
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

// Un seul nom non-ASCII dans tout le jeu football-data.co.uk, et son "ß" est
// corrompu à la source (octets C3 78 au lieu de C3 9F) — corrigé ici plutôt
// que d'afficher "Preu�xen".
const TEAM_NAME_FIXES = { 'Preu�xen Münster': 'Preußen Münster' };

function fixTeamName(name) {
  return TEAM_NAME_FIXES[name] ?? name;
}

// Parseur CSV minimal (identique à scripts/import-historical-matches.js),
// tolère les champs entre guillemets contenant des virgules.
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  // Les CSV bruts commencent par un BOM UTF-8 — retiré ici plutôt que de
  // supposer un fichier propre.
  const header = rows[0].map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ''));
    return obj;
  });
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Format football-data.co.uk : "15/08/2025" (parfois "05/08/25" sur
// d'anciens exports) -> Date triable, jamais devinée si incomplète.
function parseMatchDate(ddmmyyyy) {
  const [d, m, y] = (ddmmyyyy ?? '').split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y < 100 ? 2000 + y : y, m - 1, d);
}

function loadLeagueMatches(code) {
  const leagueDir = path.join(DATA_DIR, code);
  if (!fs.existsSync(leagueDir)) return [];

  const matches = [];
  for (const file of fs.readdirSync(leagueDir)) {
    if (!/^\d{4}\.csv$/.test(file)) continue; // exclut les *-classement.csv
    const text = fs.readFileSync(path.join(leagueDir, file), 'utf8');
    const rows = rowsToObjects(parseCsvText(text)).filter((o) => o.HomeTeam && o.AwayTeam);
    for (const row of rows) {
      const fullTimeHomeGoals = toNumberOrNull(row.FTHG);
      const fullTimeAwayGoals = toNumberOrNull(row.FTAG);
      if (fullTimeHomeGoals === null || fullTimeAwayGoals === null) continue;
      matches.push({
        date: parseMatchDate(row.Date),
        homeTeam: fixTeamName(row.HomeTeam),
        awayTeam: fixTeamName(row.AwayTeam),
        fullTimeHomeGoals,
        fullTimeAwayGoals,
        result: row.FTR,
        homeShots: toNumberOrNull(row.HS),
        awayShots: toNumberOrNull(row.AS),
        homeShotsOnTarget: toNumberOrNull(row.HST),
        awayShotsOnTarget: toNumberOrNull(row.AST),
        homeCorners: toNumberOrNull(row.HC),
        awayCorners: toNumberOrNull(row.AC),
        homeYellowCards: toNumberOrNull(row.HY),
        awayYellowCards: toNumberOrNull(row.AY)
      });
    }
  }
  return matches;
}

// Chargé une seule fois par process (~28 000 lignes, quelques centaines de
// ms) puis conservé en mémoire — pas de relecture disque à chaque analyse.
let cachedIndex = null;

function getIndex() {
  if (!cachedIndex) {
    cachedIndex = {};
    for (const code of Object.keys(LEAGUE_CODES)) cachedIndex[code] = loadLeagueMatches(code);
  }
  return cachedIndex;
}

// Nom football-data.co.uk de l'équipe ("Man United", "Inter", "Milan"…)
// résolu une fois pour toutes parmi les équipes du championnat, puis
// comparé strictement : un filtre flou match par match mélangeait Inter et
// Milan ("Inter Milan") et donnait les deux camps d'un derby à domicile.
function resolveCsvTeamName(code, teamName) {
  const all = getIndex()[code] ?? [];
  const names = [...new Set(all.flatMap((m) => [m.homeTeam, m.awayTeam]))];
  return findBestTeamNameMatch(teamName, names);
}

function recentMatchesForTeam(primaryCode, teamName) {
  for (const code of [primaryCode, ...(NEIGHBOUR_CODES[primaryCode] ?? [])]) {
    const csvName = resolveCsvTeamName(code, teamName);
    if (!csvName) continue;
    const matches = (getIndex()[code] ?? [])
      .filter((m) => m.homeTeam === csvName || m.awayTeam === csvName)
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    if (matches.length) return { code, csvName, matches };
  }
  return { code: null, csvName: null, matches: [] };
}

function average(values) {
  const filtered = values.filter((v) => v !== null && v !== undefined);
  if (!filtered.length) return null;
  return Number((filtered.reduce((sum, v) => sum + v, 0) / filtered.length).toFixed(2));
}

/**
 * Moyennes locales (tirs, tirs cadrés, corners, cartons, buts) sur les
 * derniers matchs d'une équipe, toutes venues confondues (même niveau de
 * détail que le sous-ensemble déjà envoyé à l'IA côté API-Football, cf.
 * CURATED_STAT_FIELDS dans matchAiAnalysisService.js). `null` si la ligue
 * n'est pas parmi les 16 couvertes ou si l'équipe n'y est pas trouvée —
 * jamais une erreur.
 */
export function resolveHistoricalStatsByName(teamName, leagueLabel, sampleSize = 10) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;

  const { code: foundCode, csvName, matches } = recentMatchesForTeam(code, teamName);
  const recent = matches.slice(0, sampleSize);
  if (!recent.length) return null;

  const isHome = (m) => m.homeTeam === csvName;
  const averages = {
    goalsFor: average(recent.map((m) => (isHome(m) ? m.fullTimeHomeGoals : m.fullTimeAwayGoals))),
    goalsAgainst: average(recent.map((m) => (isHome(m) ? m.fullTimeAwayGoals : m.fullTimeHomeGoals))),
    shots: average(recent.map((m) => (isHome(m) ? m.homeShots : m.awayShots))),
    shotsOnTarget: average(recent.map((m) => (isHome(m) ? m.homeShotsOnTarget : m.awayShotsOnTarget))),
    corners: average(recent.map((m) => (isHome(m) ? m.homeCorners : m.awayCorners))),
    yellowCards: average(recent.map((m) => (isHome(m) ? m.homeYellowCards : m.awayYellowCards)))
  };

  return { sampleSize: recent.length, averages, ...describeDivision(foundCode, code) };
}

export function resolveHistoricalFormByName(teamName, leagueLabel, sampleSize = 5) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;

  const { code: foundCode, csvName, matches } = recentMatchesForTeam(code, teamName);
  const recent = matches.slice(0, sampleSize);
  if (!recent.length) return null;

  const results = recent.map((m) => {
    if (m.result === 'D') return 'N';
    const isHome = m.homeTeam === csvName;
    const won = (isHome && m.result === 'H') || (!isHome && m.result === 'A');
    return won ? 'V' : 'D';
  });

  return { sampleSize: recent.length, results, ...describeDivision(foundCode, code) };
}

/**
 * Classement local (déjà calculé par import-historical-matches.js, saison la
 * plus récente disponible) pour un championnat couvert — fallback quand
 * getStandingsByLeagueLabel (API-Football, live) ne trouve rien (compétition
 * hors couverture du plan gratuit, coupe...), jamais un remplacement quand la
 * source live a déjà répondu.
 */
function standingRowForCode(code, teamName) {
  const leagueDir = path.join(DATA_DIR, code);
  if (!fs.existsSync(leagueDir)) return null;

  const standingsFiles = fs.readdirSync(leagueDir).filter((f) => /^\d{4}-classement\.csv$/.test(f)).sort();
  const latestFile = standingsFiles[standingsFiles.length - 1];
  if (!latestFile) return null;

  const rows = rowsToObjects(parseCsvText(fs.readFileSync(path.join(leagueDir, latestFile), 'utf8'))).map((r) => ({ ...r, Equipe: fixTeamName(r.Equipe) }));
  const row = findBestTeamNameMatch(teamName, rows, (r) => r.Equipe);
  return row ? { row, season: latestFile.replace('-classement.csv', '') } : null;
}

export function resolveHistoricalStandingRow(teamName, leagueLabel) {
  const code = resolveLeagueCode(leagueLabel);
  if (!code || !teamName) return null;

  for (const candidate of [code, ...(NEIGHBOUR_CODES[code] ?? [])]) {
    const found = standingRowForCode(candidate, teamName);
    if (!found) continue;
    const { row, season } = found;
    return {
      source: 'football-data.co.uk (historique)',
      season,
      ...describeDivision(candidate, code),
      rank: Number(row.Rang),
      played: Number(row.J),
      won: Number(row.V),
      drawn: Number(row.N),
      lost: Number(row.D),
      goalsFor: Number(row.BP),
      goalsAgainst: Number(row.BC),
      goalDiff: Number(row.Diff),
      points: Number(row.Pts)
    };
  }
  return null;
}
