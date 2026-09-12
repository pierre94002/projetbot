import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-ai-analyses.json');

function readAll() {
  try {
    if (fs.existsSync(FILE_PATH)) return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'une liste vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writeAll(entries) {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

export function getByMatchId(matchId) {
  return readAll().find((e) => e.matchId === matchId) ?? null;
}

// Sert uniquement à savoir QUELS matchs ont une analyse (badge dans les listes
// Matchs/Historique moteur) — un seul appel plutôt qu'un par matchId visible.
export function listAll() {
  return readAll();
}

// Un seul enregistrement par match : une nouvelle analyse avant-match sur le
// même matchId remplace la précédente plutôt que d'empiler des doublons
// (cohérent avec matchResultsRepository.js). `postMatchReview` n'est jamais
// touché ici — seul savePostMatchReview l'ajoute, à l'étape suivante du cycle.
export function savePreMatchAnalysis(entry) {
  const entries = readAll();
  const now = new Date().toISOString();
  const i = entries.findIndex((e) => e.matchId === entry.matchId);
  const existing = i === -1 ? null : entries[i];
  const saved = { ...existing, ...entry, updatedAt: now, createdAt: existing?.createdAt ?? now };
  if (i === -1) entries.push(saved);
  else entries[i] = saved;
  writeAll(entries);
  return saved;
}

// Nécessite une analyse avant-match déjà enregistrée pour ce match — c'est au
// service (matchAiAnalysisService.js) de vérifier ça et de renvoyer une
// erreur utilisateur claire ; ce repository ne fait qu'écrire.
export function savePostMatchReview(matchId, review) {
  const entries = readAll();
  const i = entries.findIndex((e) => e.matchId === matchId);
  if (i === -1) return null;
  entries[i] = { ...entries[i], postMatchReview: review, updatedAt: new Date().toISOString() };
  writeAll(entries);
  return entries[i];
}
