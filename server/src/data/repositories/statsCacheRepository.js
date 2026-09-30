import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/team-stats-cache.json');

/**
 * Cache disque simple pour les statistiques d'équipes (API externe payante
 * et limitée en volume) : chaque entrée expire après sa propre durée de vie.
 *
 * Illisible (OneDrive l'envoie juste après chaque écriture, et une analyse en
 * enchaîne plusieurs) : en LECTURE, c'est un cache manquant, la donnée est
 * redemandée à sa source. Il n'est en revanche jamais relu comme vide avant
 * une écriture : tout le cache y passait, soit autant de requêtes à refaire
 * sur un quota limité.
 */
function readCacheOrEmpty() {
  try {
    return readJsonFile(CACHE_FILE_PATH, {});
  } catch (error) {
    console.warn(`[cache stats] ${error.message}`);
    return {};
  }
}

export function getCachedValue(key, ttlMs) {
  const entry = readCacheOrEmpty()[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) return null;
  return entry.value;
}

export function setCachedValue(key, value) {
  try {
    const cache = readJsonFile(CACHE_FILE_PATH, {});
    cache[key] = { value, cachedAt: Date.now() };
    writeJsonAtomic(CACHE_FILE_PATH, cache);
  } catch (error) {
    // Pas mis en cache cette fois : l'appelant a sa valeur, elle sera
    // simplement redemandée la prochaine fois.
    console.warn(`[cache stats] ${key} non enregistré : ${error.message}`);
  }
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
  const cache = readCacheOrEmpty();
  return Object.entries(cache)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, entry]) => ({ key, value: entry.value, cachedAt: entry.cachedAt }));
}
