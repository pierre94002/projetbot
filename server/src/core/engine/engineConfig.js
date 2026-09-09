import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/engine-config.json');

export const DEFAULT_ENGINE_CONFIG = {
  edgeThresholdMin: 0.04,
  edgeThresholdMax: 0.25,
  defaultCorrelation: -0.075,
  kellyFraction: 0.125,
  maxStakePercent: 0.02,
  homeAdvantage: 1.06,
  cornersAdjustmentMax: 0.08,
  weights: {
    market: 0.7,
    structural: 0.2,
    exogenous: 0.1
  }
};

function loadPersistedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const persisted = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
      return { ...DEFAULT_ENGINE_CONFIG, ...persisted, weights: { ...DEFAULT_ENGINE_CONFIG.weights, ...persisted.weights } };
    }
  } catch {
    // Fichier corrompu ou illisible : on retombe sur la configuration par défaut.
  }
  return { ...DEFAULT_ENGINE_CONFIG };
}

let currentConfig = loadPersistedConfig();

function persistConfig() {
  fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(currentConfig, null, 2), 'utf8');
}

export function getEngineConfig() {
  return currentConfig;
}

export function updateEngineConfig(partialConfig) {
  currentConfig = {
    ...currentConfig,
    ...partialConfig,
    weights: { ...currentConfig.weights, ...partialConfig.weights }
  };
  persistConfig();
  return currentConfig;
}

export function resetEngineConfig() {
  currentConfig = { ...DEFAULT_ENGINE_CONFIG };
  persistConfig();
  return currentConfig;
}
