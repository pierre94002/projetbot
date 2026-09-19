import { httpClient } from './httpClient.js';

export const seasonCalendarApi = {
  list: (league) => httpClient.get(`/season-calendar${league ? `?league=${encodeURIComponent(league)}` : ''}`),
  status: () => httpClient.get('/season-calendar/status')
};
