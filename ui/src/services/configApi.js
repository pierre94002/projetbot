import { httpClient } from './httpClient.js';

export const configApi = {
  get: () => httpClient.get('/config'),
  update: (partialConfig) => httpClient.put('/config', partialConfig),
  reset: () => httpClient.post('/config/reset'),
  getTilt: () => httpClient.get('/config/tilt'),
  setCircuitBreaker: (active) => httpClient.put('/config/tilt', { circuitBreakerActive: active }),
  resetTilt: () => httpClient.post('/config/tilt/reset')
};
