/**
 * État de "tilt" en mémoire : coupe-circuit manuel permettant de suspendre
 * toute recommandation de mise (ex : après une série de pertes), sans
 * toucher à la configuration du moteur.
 */
let state = {
  currentDownswing: 0,
  circuitBreakerActive: false
};

export function getTiltState() {
  return state;
}

export function setCircuitBreaker(active) {
  state = { ...state, circuitBreakerActive: Boolean(active) };
  return state;
}

export function resetTiltState() {
  state = { currentDownswing: 0, circuitBreakerActive: false };
  return state;
}
