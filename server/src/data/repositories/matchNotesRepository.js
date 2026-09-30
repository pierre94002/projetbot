/**
 * matchNotesRepository.js — les notes que Pierre écrit lui-même sur un match.
 * -----------------------------------------------------------------------
 * Rien de ce qui est mesuré (forme, statistiques, moteur) ne capture le
 * vestiaire, une rumeur de départ, une brouille interne, des soucis
 * financiers du club — tout ce qui n'existe dans aucune source structurée.
 * Une note libre, par match, relue par l'analyse IA avant-match (cf.
 * matchAiAnalysisService.js) EN PLUS des données mesurées, jamais à leur
 * place : elle n'entre ni dans le pronostic chiffré ni dans la mise.
 *
 * Une entrée par matchId (le même identifiant que l'analyse IA et les
 * pronostics journalisés) ; un texte vide supprime la note.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-notes.json');

function readNotes() {
  return readJsonFile(NOTES_FILE_PATH, []);
}

function writeNotes(notes) {
  writeJsonAtomic(NOTES_FILE_PATH, notes);
}

/** La note d'un match, ou `null` si Pierre n'en a pas écrit. */
export function getMatchNote(matchId) {
  return readNotes().find((n) => n.matchId === matchId) ?? null;
}

/**
 * Écrit ou remplace la note d'un match. `text` vide (ou blanc) supprime la
 * note plutôt que de garder une entrée sans contenu.
 */
export function setMatchNote({ matchId, homeName, awayName, league, text }) {
  const notes = readNotes();
  const propre = String(text ?? '').trim();
  const index = notes.findIndex((n) => n.matchId === matchId);

  if (!propre) {
    if (index !== -1) {
      notes.splice(index, 1);
      writeNotes(notes);
    }
    return null;
  }

  const now = new Date().toISOString();
  if (index !== -1) {
    notes[index] = { ...notes[index], text: propre, homeName: homeName ?? notes[index].homeName, awayName: awayName ?? notes[index].awayName, league: league ?? notes[index].league, updatedAt: now };
    writeNotes(notes);
    return notes[index];
  }

  const entry = { matchId, homeName: homeName ?? null, awayName: awayName ?? null, league: league ?? null, text: propre, createdAt: now, updatedAt: now };
  notes.push(entry);
  writeNotes(notes);
  return entry;
}
