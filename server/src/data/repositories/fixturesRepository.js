import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(__dirname, '../../../data/fixtures');

const PATHS = {
  odds: path.join(FIXTURES_ROOT, 'odds/odds-snapshot.json'),
  competitions: path.join(FIXTURES_ROOT, 'competitions/competitions-snapshot.json'),
  sampleMatches: path.join(FIXTURES_ROOT, 'sample-matches.json')
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Liste des matchs bruts au format "The Odds API". */
export function loadOddsMatches() {
  const raw = readJson(PATHS.odds);
  return raw?.[0]?.data ?? [];
}

/** Remplace l'instantané de cotes par des données fraîchement récupérées en direct. */
export function saveOddsMatches(matches) {
  fs.mkdirSync(path.dirname(PATHS.odds), { recursive: true });
  fs.writeFileSync(PATHS.odds, JSON.stringify([{ data: matches }], null, 2), 'utf8');
}

/** Liste des compétitions et de leurs métadonnées (format football-data.org). */
export function loadCompetitions() {
  const raw = readJson(PATHS.competitions);
  return raw?.[0]?.data?.competitions ?? [];
}

/** Remplace l'instantané de compétitions par des données fraîchement récupérées en direct. */
export function saveCompetitions(competitions) {
  fs.mkdirSync(path.dirname(PATHS.competitions), { recursive: true });
  fs.writeFileSync(PATHS.competitions, JSON.stringify([{ data: { competitions } }], null, 2), 'utf8');
}

/** Jeu de matchs de test générés localement (cf. testDataGenerator.js). */
export function loadSampleMatches() {
  return readJson(PATHS.sampleMatches) ?? [];
}

export function saveSampleMatches(matches) {
  fs.mkdirSync(path.dirname(PATHS.sampleMatches), { recursive: true });
  fs.writeFileSync(PATHS.sampleMatches, JSON.stringify(matches, null, 2), 'utf8');
}

export function getFixturesStatus() {
  return {
    odds: fs.existsSync(PATHS.odds),
    competitions: fs.existsSync(PATHS.competitions),
    sampleMatches: fs.existsSync(PATHS.sampleMatches),
    oddsLastSyncedAt: fs.existsSync(PATHS.odds) ? fs.statSync(PATHS.odds).mtime.toISOString() : null,
    competitionsLastSyncedAt: fs.existsSync(PATHS.competitions) ? fs.statSync(PATHS.competitions).mtime.toISOString() : null
  };
}
