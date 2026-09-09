import { httpClient } from './httpClient.js';

export const betsApi = {
  list: () => httpClient.get('/bets'),
  create: (bet) => httpClient.post('/bets', bet),
  updateLegStatus: (betId, legIndex, status) => httpClient.patch(`/bets/${betId}/legs/${legIndex}/status`, { status }),
  remove: (betId) => httpClient.delete(`/bets/${betId}`)
};
