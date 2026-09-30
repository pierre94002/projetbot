import { httpClient } from './httpClient.js';

// Note écrite à la main sur un match (vestiaire, rumeur, finances du club…),
// relue par l'analyse IA avant-match — cf. server/src/data/repositories/matchNotesRepository.js.
export const matchNotesApi = {
  get: (matchId) => httpClient.get(`/match-notes/${encodeURIComponent(matchId)}`),
  save: (matchId, { text, homeName, awayName, league }) => httpClient.put(`/match-notes/${encodeURIComponent(matchId)}`, { text, homeName, awayName, league })
};
