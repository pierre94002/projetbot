import { httpClient } from './httpClient.js';

export const dataVersionApi = {
  get: () => httpClient.get('/data-version')
};
