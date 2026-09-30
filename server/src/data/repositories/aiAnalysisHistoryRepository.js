import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/ai-analysis-history.json');
const MAX_HISTORY_ENTRIES = 10;

// Illisible = erreur, jamais historique vide : l'audit suivant aurait
// réécrit le fichier avec ce seul résultat (cf. utils/atomicJson.js).
function readHistory() {
  return readJsonFile(HISTORY_FILE_PATH, []);
}

function writeHistory(entries) {
  writeJsonAtomic(HISTORY_FILE_PATH, entries);
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
