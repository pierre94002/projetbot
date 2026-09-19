import { httpClient } from './httpClient.js';

export const flashscoreApi = {
  getStatus: () => httpClient.get('/flashscore/status'),
  refresh: () => httpClient.post('/flashscore/refresh')
};
