#!/usr/bin/env node
/**
 * merge-standings.mjs
 * -----------------------------------------------------------------------
 * Remplace, compétition par compétition, la table de classement dans
 * server/data/runtime/standings-web.json, lue en priorité par
 * getStandingsByLeagueLabel (server/src/data/providers/standingsService.js)
 * — avant repli sur l'appel API-Football existant si aucune donnée web
 * n'existe encore pour cette compétition.
 *
 * Usage :
 *   node merge-standings.mjs <chemin-standings-web.json> <chemin-nouveau-classement.json>
 *
 * "nouveau-classement.json" est un OBJET clé = libellé de compétition
 * (même format "<Ligue> - <Pays>" utilisé partout ailleurs dans l'appli) :
 *   {
 *     "Ligue 1 - France": {
 *       "rows": [
 *         { "rank": 1, "teamName": "Paris Saint Germain", "played": 5, "won": 4,
 *           "drawn": 1, "lost": 0, "goalsFor": 12, "goalsAgainst": 3, "goalDiff": 9,
 *           "points": 13, "description": null,
 *           "home": { "played": 3, "goalsFor": 8, "goalsAgainst": 1 },
 *           "away": { "played": 2, "goalsFor": 4, "goalsAgainst": 2 } },
 *         ...
 *       ]
 *     },
 *     "Premier League - England": { "rows": [...] }
 *   }
 *
 * "home"/"away" sont optionnels (mettre { "played": 0, "goalsFor": 0,
 * "goalsAgainst": 0 } si non trouvés de façon fiable) — sans eux,
 * getLeagueGoalAverages() se dégrade silencieusement (retourne null) plutôt
 * que de planter, comme partout ailleurs dans l'appli.
 *
 * Ne touche PAS aux compétitions absentes de ce fichier d'entrée : seules
 * les clés présentes dans "nouveau-classement.json" sont remplacées.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , standingsPath, newStandingsPath] = process.argv;
if (!standingsPath || !newStandingsPath) {
  console.error('Usage: node merge-standings.mjs <standings-web.json> <nouveau-classement.json>');
  process.exit(1);
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Attention : ${p} illisible/corrompu (${e.message}), on repart de la valeur par défaut.`);
  }
  return fallback;
}

function normalizeRow(row) {
  const goalsFor = Number(row.goalsFor ?? 0);
  const goalsAgainst = Number(row.goalsAgainst ?? 0);
  return {
    rank: Number(row.rank),
    teamId: row.teamId ?? `web-${(row.teamName ?? '').toLowerCase().replace(/\s+/g, '-')}`,
    teamName: row.teamName,
    teamLogo: row.teamLogo ?? null,
    played: Number(row.played ?? 0),
    won: Number(row.won ?? 0),
    drawn: Number(row.drawn ?? 0),
    lost: Number(row.lost ?? 0),
    goalsFor,
    goalsAgainst,
    goalDiff: row.goalDiff !== undefined ? Number(row.goalDiff) : goalsFor - goalsAgainst,
    points: Number(row.points ?? 0),
    description: row.description ?? null,
    home: {
      played: Number(row.home?.played ?? 0),
      goalsFor: Number(row.home?.goalsFor ?? 0),
      goalsAgainst: Number(row.home?.goalsAgainst ?? 0)
    },
    away: {
      played: Number(row.away?.played ?? 0),
      goalsFor: Number(row.away?.goalsFor ?? 0),
      goalsAgainst: Number(row.away?.goalsAgainst ?? 0)
    }
  };
}

const standings = readJson(standingsPath, {});
const newStandings = readJson(newStandingsPath, {});

let leaguesUpdated = 0;

for (const [leagueLabel, data] of Object.entries(newStandings)) {
  if (!Array.isArray(data?.rows) || !data.rows.length) {
    console.error(`Ignoré (pas de lignes) : ${leagueLabel}`);
    continue;
  }
  standings[leagueLabel] = {
    leagueName: leagueLabel,
    season: data.season ?? new Date().getFullYear(),
    updatedAt: new Date().toISOString(),
    rows: data.rows.map(normalizeRow).sort((a, b) => a.rank - b.rank)
  };
  leaguesUpdated++;
}

fs.mkdirSync(path.dirname(standingsPath), { recursive: true });
fs.writeFileSync(standingsPath, JSON.stringify(standings, null, 2), 'utf8');

console.log(JSON.stringify({ leaguesUpdated, totalLeaguesStored: Object.keys(standings).length }));
