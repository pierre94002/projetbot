import { getEngineConfig, updateEngineConfig, resetEngineConfig, DEFAULT_ENGINE_CONFIG } from '../../core/engine/engineConfig.js';
import { getTiltState, setCircuitBreaker, resetTiltState } from '../../core/engine/tiltState.js';

export function getConfig(req, res) {
  res.json({ config: getEngineConfig(), defaults: DEFAULT_ENGINE_CONFIG });
}

export function putConfig(req, res) {
  res.json({ config: updateEngineConfig(req.body ?? {}) });
}

export function postResetConfig(req, res) {
  res.json({ config: resetEngineConfig() });
}

export function getTilt(req, res) {
  res.json(getTiltState());
}

export function putTilt(req, res) {
  res.json(setCircuitBreaker(req.body?.circuitBreakerActive));
}

export function postResetTilt(req, res) {
  res.json(resetTiltState());
}
