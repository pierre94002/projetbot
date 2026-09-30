import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-ai-analyses.json');

// Cache invalidé par date de modification (même principe que
// matchResultsRepository.js), réaligné après chaque écriture : l'analyse
// automatique enchaîne jusqu'à 50 enregistrements par passe, et relire à
// chaque fois le fichier qu'on vient d'écrire tombait pendant qu'OneDrive
// l'envoyait. Il n'est plus rouvert que s'il a changé ailleurs.
let cache = { mtimeMs: undefined, entries: null };

function currentMtimeMs() {
  try {
    return fs.statSync(FILE_PATH).mtimeMs;
  } catch {
    return null; // Fichier absent : état légitime, liste vide.
  }
}

// Illisible = erreur, jamais liste vide : l'enregistrement suivant aurait
// réécrit le fichier avec cette seule analyse (cf. utils/atomicJson.js).
function readAll() {
  const mtimeMs = currentMtimeMs();
  if (cache.entries && cache.mtimeMs === mtimeMs) return cache.entries;
  cache = { mtimeMs, entries: readJsonFile(FILE_PATH, []) };
  return cache.entries;
}

// Les appelants modifient une COPIE de la liste : si l'écriture échoue, le
// cache reste identique au fichier, qui n'a pas bougé.
function writeAll(entries) {
  writeJsonAtomic(FILE_PATH, entries);
  cache = { mtimeMs: currentMtimeMs(), entries };
}

export function getByMatchId(matchId) {
  return readAll().find((e) => e.matchId === matchId) ?? null;
}

// Sert uniquement à savoir QUELS matchs ont une analyse (badge dans les listes
// Matchs/Historique moteur) — un seul appel plutôt qu'un par matchId visible.
export function listAll() {
  return readAll();
}

/**
 * Retrouve une analyse avant-match par équipes (+ jour si connu), pour
 * l'analyse après-match AUTOMATIQUE : les candidats viennent de la base
 * FotMob (match_key), jamais du matchId Odds API/calendrier sous lequel
 * l'analyse avant-match a été enregistrée — comparer les deux identifiants ne
 * donne jamais rien. `day` (YYYY-MM-DD) écarte l'aller/retour de la même
 * affiche dans une même compétition ; sans lui (analyses enregistrées avant
 * l'ajout de `commenceTime`), équipes + championnat suffisent la plupart du
 * temps.
 */
export function findPreMatchAnalysisByTeams({ homeName, awayName, league, day = null }) {
  return (
    readAll().find((e) => {
      if (e.postMatchReview) return false;
      if (!teamNamesLikelyMatch(e.homeName, homeName) || !teamNamesLikelyMatch(e.awayName, awayName)) return false;
      if (league && e.league && e.league !== league) return false;
      if (day && e.commenceTime) return e.commenceTime.slice(0, 10) === day;
      return true;
    }) ?? null
  );
}

// Un seul enregistrement par match : une nouvelle analyse avant-match sur le
// même matchId remplace la précédente plutôt que d'empiler des doublons
// (cohérent avec matchResultsRepository.js). `postMatchReview` n'est jamais
// touché ici — seul savePostMatchReview l'ajoute, à l'étape suivante du cycle.
export function savePreMatchAnalysis(entry) {
  const entries = [...readAll()];
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
  const entries = [...readAll()];
  const i = entries.findIndex((e) => e.matchId === matchId);
  if (i === -1) return null;
  entries[i] = { ...entries[i], postMatchReview: review, updatedAt: new Date().toISOString() };
  writeAll(entries);
  return entries[i];
}
