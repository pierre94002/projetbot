import { httpClient } from './httpClient.js';

export const matchResultsApi = {
  list: () => httpClient.get('/match-results'),
  record: (result) => httpClient.post('/match-results', result)
};
