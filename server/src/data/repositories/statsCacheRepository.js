import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/team-stats-cache.json');

/**
 * Cache disque simple pour les statistiques d'équipes (API externe payante
 * et limitée en volume) : chaque entrée expire après sa propre durée de vie.
 */
function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
  } catch {
    // Cache corrompu : on repart d'un cache vide plutôt que de faire échouer l'appli.
  }
  return {};
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

export function getCachedValue(key, ttlMs) {
  const entry = readCache()[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) return null;
  return entry.value;
}

export function setCachedValue(key, value) {
  const cache = readCache();
  cache[key] = { value, cachedAt: Date.now() };
  writeCache(cache);
  return value;
}

/**
 * Balaye toutes les entrées dont la clé commence par `prefix`, sans vérifier
 * la TTL — utilisé pour ré-exploiter des données déjà en cache (ex. lieu/round
 * d'un match terminé, cf. aiDatasetBuilder.js) qui ne périment jamais
 * vraiment : un match déjà joué ne change pas, contrairement aux moyennes de
 * saison que getCachedValue protège par fraîcheur.
 */
export function getCachedEntriesByPrefix(prefix) {
  const cache = readCache();
  return Object.entries(cache)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, entry]) => ({ key, value: entry.value, cachedAt: entry.cachedAt }));
}
