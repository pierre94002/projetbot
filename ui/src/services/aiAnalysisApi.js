import { httpClient } from './httpClient.js';

export const aiAnalysisApi = {
  getStatus: () => httpClient.get('/ai-analysis/status'),
  connect: (apiKey, model, workspaceId) => httpClient.post('/ai-analysis/connect', { apiKey, model, workspaceId }),
  disconnect: () => httpClient.post('/ai-analysis/disconnect'),
  run: (limit) => httpClient.post('/ai-analysis/run', { limit }),
  getHistory: () => httpClient.get('/ai-analysis/history')
};
