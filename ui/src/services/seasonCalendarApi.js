import { httpClient } from './httpClient.js';

export const seasonCalendarApi = {
  list: (league, season) => {
    const params = new URLSearchParams();
    if (league) params.set('league', league);
    if (season) params.set('season', season);
    const query = params.toString();
    return httpClient.get(`/season-calendar${query ? `?${query}` : ''}`);
  },
  status: () => httpClient.get('/season-calendar/status')
};
