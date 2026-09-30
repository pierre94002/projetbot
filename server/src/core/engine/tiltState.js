import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/tilt-state.json');

/**
 * État de "tilt" : coupe-circuit manuel permettant de suspendre toute
 * recommandation de mise (ex : après une série de pertes), sans toucher à
 * la configuration du moteur. Persisté sur disque (même pattern que
 * engineConfig.js) — un simple redémarrage du serveur (`node --watch`
 * redémarre à chaque sauvegarde de fichier backend) ne doit jamais
 * réactiver silencieusement des mises "RECOMMENDED" juste après que
 * l'utilisateur ait délibérément coupé le circuit.
 */
const DEFAULT_STATE = { currentDownswing: 0, circuitBreakerActive: false };

function loadPersistedState() {
  try {
    return { ...DEFAULT_STATE, ...readJsonFile(STATE_FILE_PATH, {}) };
  } catch {
    // Illisible malgré les nouvelles tentatives (fichier corrompu) : repli sur l'état par défaut.
    return { ...DEFAULT_STATE };
  }
}

let state = loadPersistedState();

function persistState() {
  writeJsonAtomic(STATE_FILE_PATH, state);
}

export function getTiltState() {
  return state;
}

export function setCircuitBreaker(active) {
  state = { ...state, circuitBreakerActive: Boolean(active) };
  persistState();
  return state;
}

export function resetTiltState() {
  state = { ...DEFAULT_STATE };
  persistState();
  return state;
}
