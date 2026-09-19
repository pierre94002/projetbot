import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../../../data/runtime/team-profiles.json');

function readAll() {
  try {
    if (fs.existsSync(FILE_PATH)) return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'une table vide plutôt que de faire échouer l'appli.
  }
  return {};
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Profils d'équipe (effectif + forme + moyennes) peuplés par recherche web —
 * cf. resolveTeamProfileViaWeb (webLookupService.js) — pour les équipes des
 * coupes européennes (Ligue des champions/Europa/Conference), qui viennent de
 * ~55 championnats sans équivalent local (contrairement aux 16 championnats
 * couverts par historicalMatchesProvider.js). Peuplé par petits lots au fil
 * des exécutions de la tâche planifiée quotidienne, jamais en direct sur une
 * page consultée par l'utilisateur (contrairement à resolvePlayersByName qui,
 * lui, peut interroger le web à la demande) — ce fichier n'est qu'un CACHE
 * consulté en lecture par le reste de l'appli.
 */
export function getTeamProfile(teamName) {
  if (!teamName) return null;
  const all = readAll();
  const key = findBestTeamNameMatch(teamName, Object.keys(all));
  return key ? all[key] : null;
}

export function saveTeamProfile(teamName, profile) {
  const all = readAll();
  all[teamName] = { ...profile, teamName, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[teamName];
}

/**
 * Équipes déjà en base, avec leur ancienneté — utilisé par la tâche
 * planifiée pour choisir en priorité les entrées manquantes ou les plus
 * anciennes à rafraîchir, plutôt que de retraiter les mêmes équipes en boucle.
 */
export function listTeamProfileFreshness() {
  const all = readAll();
  return Object.fromEntries(Object.entries(all).map(([name, profile]) => [name, profile.updatedAt ?? null]));
}
