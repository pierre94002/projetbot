#!/usr/bin/env node
/**
 * csv-to-season-data.mjs
 * -------------------------------------------------------------------------
 * Transforme les CSV déjà téléchargés (import-historical-matches.js,
 * football-data.co.uk) en deux fichiers "nouveaux-matchs"/"nouveau-classement"
 * au format attendu par merge-season-calendar.mjs / merge-standings.mjs, pour
 * les championnats couverts par ces CSV (pas les coupes) — gratuit, aucune
 * recherche web nécessaire pour ces championnats-là.
 *
 * Usage :
 *   node csv-to-season-data.mjs <code> "<Libellé Ligue - Pays>" [<saison>]
 *   ex : node csv-to-season-data.mjs SP1 "La Liga - Spain"          (saison en cours)
 *        node csv-to-season-data.mjs SP1 "La Liga - Spain" 2526     (saison précise)
 *
 * Le classement n'est émis QUE pour la saison en cours : merge-standings.mjs
 * remplace la table entière d'une compétition, et le classement final d'une
 * saison terminée écraserait le classement web courant.
 * -------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HIST_DIR = path.resolve(__dirname, '..', 'data', 'fixtures', 'historique');
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'runtime', '_tmp-season-import');

const [, , code, leagueLabel, seasonArg] = process.argv;
if (!code || !leagueLabel) {
  console.error('Usage: node csv-to-season-data.mjs <code> "<Libellé Ligue - Pays>" [<saison ex. 2526>]');
  process.exit(1);
}

// Même correction que historicalMatchesProvider.js : le "ß" de ce nom est
// corrompu à la source (octets C3 78 au lieu de C3 9F).
const TEAM_NAME_FIXES = { 'Preu�xen Münster': 'Preußen Münster' };
const fixTeamName = (name) => TEAM_NAME_FIXES[name] ?? name;

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ''));
    return obj;
  });
}

function ddmmyyyyToIso(s) {
  const [d, m, y] = (s ?? '').split('/').map(Number);
  if (!d || !m || !y) return null;
  const fullYear = y < 100 ? 2000 + y : y;
  return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Code football-data.co.uk de la saison en cours : "2627" à partir du 1er juillet 2026.
function currentSeasonCode(now = new Date()) {
  const start = (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1) % 100;
  return `${String(start).padStart(2, '0')}${String(start + 1).padStart(2, '0')}`;
}

const leagueDir = path.join(HIST_DIR, code);
const currentSeason = currentSeasonCode();
const season = seasonArg ?? currentSeason;
const seasonFile = path.join(leagueDir, `${season}.csv`);
if (!fs.existsSync(seasonFile)) {
  console.error(`Pas de fichier ${season}.csv pour ${code} — relance import-historical-matches.js ou passe une saison existante en 3e argument.`);
  process.exit(1);
}

// --- Calendrier (résultats déjà joués — football-data.co.uk ne liste pas les
// matchs à venir, seulement ceux déjà arbitrés) ---
const matchesText = fs.readFileSync(seasonFile, 'utf8');
const matchRows = rowsToObjects(parseCsvText(matchesText)).filter((o) => o.HomeTeam && o.AwayTeam);
const calendarEntries = matchRows
  .map((r) => {
    const date = ddmmyyyyToIso(r.Date);
    const homeGoals = Number(r.FTHG);
    const awayGoals = Number(r.FTAG);
    if (!date || Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) return null;
    return {
      date,
      league: leagueLabel,
      homeName: fixTeamName(r.HomeTeam),
      awayName: fixTeamName(r.AwayTeam),
      status: 'finished',
      homeGoals,
      awayGoals,
      round: null,
      source: 'football-data.co.uk'
    };
  })
  .filter(Boolean);

fs.mkdirSync(OUT_DIR, { recursive: true });
const calendarOutPath = path.join(OUT_DIR, `${code}-calendar.json`);
fs.writeFileSync(calendarOutPath, JSON.stringify(calendarEntries, null, 2));

// --- Classement (déjà calculé par import-historical-matches.js) ---
let standingsOutPath = null;
let teams = 0;
if (season === currentSeason) {
  const standingsFile = path.join(leagueDir, `${season}-classement.csv`);
  if (fs.existsSync(standingsFile)) {
    const standingsRows = rowsToObjects(parseCsvText(fs.readFileSync(standingsFile, 'utf8')));
    const standingsPayload = {
      [leagueLabel]: {
        season,
        rows: standingsRows.map((r) => ({
          rank: Number(r.Rang),
          teamName: fixTeamName(r.Equipe),
          played: Number(r.J),
          won: Number(r.V),
          drawn: Number(r.N),
          lost: Number(r.D),
          goalsFor: Number(r.BP),
          goalsAgainst: Number(r.BC),
          goalDiff: Number(r.Diff),
          points: Number(r.Pts),
          description: null
        }))
      }
    };
    standingsOutPath = path.join(OUT_DIR, `${code}-standings.json`);
    fs.writeFileSync(standingsOutPath, JSON.stringify(standingsPayload, null, 2));
    teams = standingsRows.length;
  }
} else {
  console.error(`Classement non émis : la saison ${season} n'est pas la saison en cours (${currentSeason}), il écraserait le classement web courant.`);
}

console.log(JSON.stringify({ season, calendarOutPath, standingsOutPath, matches: calendarEntries.length, teams }));
