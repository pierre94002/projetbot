import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/engine-config.json');

export const DEFAULT_ENGINE_CONFIG_BY_SPORT = {
  football: {
    edgeThresholdMin: 0.04,
    edgeThresholdMax: 0.25,
    defaultCorrelation: -0.075,
    kellyFraction: 0.125,
    maxStakePercent: 0.02,
    homeAdvantage: 1.06,
    cornersAdjustmentMax: 0.08,
    // Garde-fou plausibilité du staking (cf. risk/staking.js) : au-delà de cet
    // écart de taux domicile/extérieur, on ne recommande pas de mise. Sorti
    // du fichier générique vers la config du sport qui l'utilise.
    maxExpectedRateGap: 0.4,
    weights: {
      market: 0.7,
      structural: 0.2,
      exogenous: 0.1
    }
  }
};

/**
 * `engine-config.json` était, avant le refactor sport, un objet plat
 * (un seul sport = football existait). Un fichier déjà au nouveau format
 * (une clé par sport) est renvoyé tel quel ; un fichier à l'ancien format
 * plat est traité comme la config football — migration silencieuse et
 * rétrocompatible, pas de script à lancer à la main pour ce fichier.
 */
function migrateToSportKeyed(raw) {
  if (!raw) return {};
  const looksAlreadySportKeyed = Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT).some((sportId) => raw[sportId]);
  return looksAlreadySportKeyed ? raw : { football: raw };
}

function loadPersistedConfig() {
  let raw = null;
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      raw = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    }
  } catch {
    // Fichier corrompu ou illisible : on repart de la configuration par défaut.
    raw = null;
  }

  const migrated = migrateToSportKeyed(raw);
  const result = {};
  for (const sportId of Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT)) {
    const defaults = DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId];
    const persisted = migrated[sportId];
    result[sportId] = persisted
      ? { ...defaults, ...persisted, weights: { ...defaults.weights, ...persisted.weights } }
      : { ...defaults };
  }
  return result;
}

/**
 * Cache invalidé par la date de modification du fichier, sur le modèle de
 * matchStatsWebRepository. La config est relue à chaque analyse de match : la
 * garder en mémoire évite de re-parser le fichier à chaque appel, mais la
 * comparer au mtime fait qu'une modification venue d'ailleurs — édition à la
 * main, script de fusion, restauration d'une sauvegarde — est prise en compte
 * sans redémarrer le serveur. C'était le seul fichier de data/runtime qui
 * exigeait encore un redémarrage.
 */
let cache = { mtimeMs: undefined, configBySport: null };

function currentMtimeMs() {
  try {
    return fs.statSync(CONFIG_FILE_PATH).mtimeMs;
  } catch {
    return null; // Fichier absent : état légitime, on sert les valeurs par défaut.
  }
}

function getConfigBySport() {
  const mtimeMs = currentMtimeMs();
  if (cache.configBySport && cache.mtimeMs === mtimeMs) return cache.configBySport;
  cache = { mtimeMs, configBySport: loadPersistedConfig() };
  return cache.configBySport;
}

function persistConfig(configBySport) {
  fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configBySport, null, 2), 'utf8');
  // On réaligne le cache sur le fichier qu'on vient d'écrire, sinon le
  // prochain appel le relirait pour rien.
  cache = { mtimeMs: currentMtimeMs(), configBySport };
}

export function getEngineConfig(sportId = 'football') {
  const configBySport = getConfigBySport();
  return configBySport[sportId] ?? configBySport.football;
}

export function updateEngineConfig(sportId, partialConfig) {
  // Rétrocompat : ancien appel à 1 argument (partialConfig seul) = football implicite.
  if (typeof sportId !== 'string') {
    partialConfig = sportId;
    sportId = 'football';
  }
  const current = getEngineConfig(sportId);
  const next = {
    ...getConfigBySport(),
    [sportId]: { ...current, ...partialConfig, weights: { ...current.weights, ...partialConfig.weights } }
  };
  persistConfig(next);
  return next[sportId];
}

export function resetEngineConfig(sportId = 'football') {
  const next = { ...getConfigBySport(), [sportId]: { ...DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId] } };
  persistConfig(next);
  return next[sportId];
}
