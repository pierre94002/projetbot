import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/ai-analysis-history.json');
const MAX_HISTORY_ENTRIES = 10;

function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) return JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un historique vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writeHistory(entries) {
  fs.mkdirSync(path.dirname(HISTORY_FILE_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

/** Plus récent d'abord. */
export function listAnalysisHistory() {
  return readHistory();
}

export function saveAnalysisResult(entry) {
  const history = readHistory();
  history.unshift(entry);
  writeHistory(history.slice(0, MAX_HISTORY_ENTRIES));
  return entry;
}
