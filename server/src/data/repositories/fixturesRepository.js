import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(__dirname, '../../../data/fixtures');

const PATHS = {
  odds: path.join(FIXTURES_ROOT, 'odds/odds-snapshot.json'),
  competitions: path.join(FIXTURES_ROOT, 'competitions/competitions-snapshot.json'),
  sampleMatches: path.join(FIXTURES_ROOT, 'sample-matches.json')
};

// Lectures et écritures réessayées quand OneDrive tient le fichier, écritures
// atomiques (cf. utils/atomicJson.js) : ces instantanés viennent d'API
// payantes, une écriture refusée les perdait.
function readJson(filePath) {
  return readJsonFile(filePath, null);
}

/** Liste des matchs bruts au format "The Odds API". */
export function loadOddsMatches() {
  const raw = readJson(PATHS.odds);
  return raw?.[0]?.data ?? [];
}

/** Remplace l'instantané de cotes par des données fraîchement récupérées en direct. */
export function saveOddsMatches(matches) {
  writeJsonAtomic(PATHS.odds, [{ data: matches }]);
}

/** Liste des compétitions et de leurs métadonnées (format football-data.org). */
export function loadCompetitions() {
  const raw = readJson(PATHS.competitions);
  return raw?.[0]?.data?.competitions ?? [];
}

/** Remplace l'instantané de compétitions par des données fraîchement récupérées en direct. */
export function saveCompetitions(competitions) {
  writeJsonAtomic(PATHS.competitions, [{ data: { competitions } }]);
}

/** Jeu de matchs de test générés localement (cf. testDataGenerator.js). */
export function loadSampleMatches() {
  return readJson(PATHS.sampleMatches) ?? [];
}

export function saveSampleMatches(matches) {
  writeJsonAtomic(PATHS.sampleMatches, matches);
}

/** Les chemins absolus des instantanés (cf. contrôleur des sources : « le vrai endroit des données »). */
export function getFixturePaths() {
  return { ...PATHS };
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
