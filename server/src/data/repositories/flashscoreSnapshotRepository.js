import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/flashscore-snapshot.json');

function readSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE_PATH)) return JSON.parse(fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un instantané vide plutôt que de faire échouer l'appli.
  }
  return null;
}

// IMPORTANT : `teams` doit déjà être la table COMPACTE pré-calculée
// (curateFlashscoreTeams, cf. flashscoreEnrichment.js) — jamais les matchs
// bruts renvoyés par l'actor. Un seul jour de Football complet pèse ~110 Mo
// en brut (mesuré le 2026-09-13, mode "with-history") ; la table compacte
// (une entrée par équipe, stats déjà moyennées) pèse quelques centaines de
// Ko, ce qui reste raisonnable à versionner comme les autres fichiers de
// server/data/runtime/.
export function saveFlashscoreSnapshot({ matchCount, teams }) {
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE_PATH), { recursive: true });
  const snapshot = { fetchedAt: new Date().toISOString(), matchCount, teamCount: teams.length, teams };
  fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  return snapshot;
}

export function getFlashscoreSnapshotStatus() {
  const snapshot = readSnapshot();
  return snapshot ? { fetchedAt: snapshot.fetchedAt, matchCount: snapshot.matchCount, teamCount: snapshot.teamCount } : null;
}

// `null` si l'instantané n'existe pas encore ou si aucune équipe ne
// correspond (jamais une erreur : cf. philosophie "dégradation silencieuse"
// du reste de l'enrichissement, matchEnrichment.js).
export function findFlashscoreTeamEntry(teamName) {
  const snapshot = readSnapshot();
  if (!snapshot) return null;
  return findBestTeamNameMatch(teamName, snapshot.teams, (entry) => entry.teamName);
}
