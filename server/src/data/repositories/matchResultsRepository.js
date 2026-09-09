import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-results.json');

function readResults() {
  try {
    if (fs.existsSync(RESULTS_FILE_PATH)) return JSON.parse(fs.readFileSync(RESULTS_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un journal vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writeResults(results) {
  fs.mkdirSync(path.dirname(RESULTS_FILE_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_FILE_PATH, JSON.stringify(results, null, 2), 'utf8');
}

export function listMatchResults() {
  return readResults().sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
}

// Un seul résultat par match — une nouvelle saisie sur le même match corrige
// l'ancienne plutôt que de la dupliquer (ex. score corrigé après coup).
export function recordMatchResult({ matchId, homeName, awayName, league, homeGoals, awayGoals }) {
  const results = readResults();
  const now = new Date().toISOString();
  const existing = results.find((r) => r.matchId === matchId);
  if (existing) {
    existing.homeGoals = homeGoals;
    existing.awayGoals = awayGoals;
    existing.settledAt = now;
    writeResults(results);
    return existing;
  }

  const entry = { id: crypto.randomUUID(), matchId, homeName, awayName, league: league ?? null, homeGoals, awayGoals, settledAt: now };
  results.push(entry);
  writeResults(results);
  return entry;
}

/**
 * Résultats locaux impliquant une équipe (nom insensible à la casse), sous
 * l'angle "buts marqués / buts encaissés" de CETTE équipe — sert à enrichir
 * les moyennes de buts (cf. matchEnrichment.js) avec les vrais scores que
 * l'utilisateur a lui-même saisis via "Score final", en plus des statistiques
 * API-Football (qui, sur le plan gratuit, ne couvrent pas les saisons
 * récentes — cf. limites documentées du plan).
 */
export function getResultsForTeam(teamName) {
  const normalized = teamName.trim().toLowerCase();
  return readResults()
    .filter((r) => r.homeName.toLowerCase() === normalized || r.awayName.toLowerCase() === normalized)
    .map((r) => {
      const isHome = r.homeName.toLowerCase() === normalized;
      return { matchId: r.matchId, isHome, goalsFor: isHome ? r.homeGoals : r.awayGoals, goalsAgainst: isHome ? r.awayGoals : r.homeGoals };
    });
}
