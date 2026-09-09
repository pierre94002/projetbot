import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (fs.existsSync(STATE_FILE_PATH)) {
      const persisted = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
      return { ...DEFAULT_STATE, ...persisted };
    }
  } catch {
    // Fichier corrompu ou illisible : repli sur l'état par défaut.
  }
  return { ...DEFAULT_STATE };
}

let state = loadPersistedState();

function persistState() {
  fs.mkdirSync(path.dirname(STATE_FILE_PATH), { recursive: true });
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
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
