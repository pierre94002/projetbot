import { httpClient } from './httpClient.js';

export const standingsApi = {
  get: (league) => httpClient.get(`/standings?league=${encodeURIComponent(league)}`)
};
