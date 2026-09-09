import { getEngineConfig, updateEngineConfig, resetEngineConfig, DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../../core/engine/engineConfig.js';
import { getTiltState, setCircuitBreaker, resetTiltState } from '../../core/engine/tiltState.js';

function resolveSportId(req) {
  return req.query.sport || 'football';
}

export function getConfig(req, res) {
  const sportId = resolveSportId(req);
  res.json({ config: getEngineConfig(sportId), defaults: DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId] ?? DEFAULT_ENGINE_CONFIG_BY_SPORT.football });
}

export function putConfig(req, res) {
  const sportId = resolveSportId(req);
  res.json({ config: updateEngineConfig(sportId, req.body ?? {}) });
}

export function postResetConfig(req, res) {
  const sportId = resolveSportId(req);
  res.json({ config: resetEngineConfig(sportId) });
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
