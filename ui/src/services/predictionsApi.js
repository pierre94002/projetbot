import { httpClient } from './httpClient.js';

export const predictionsApi = {
  list: () => httpClient.get('/predictions'),
  record: (entries) => httpClient.post('/predictions', { entries }),
  updateStatus: (entryId, status) => httpClient.patch(`/predictions/${entryId}/status`, { status }),
  remove: (entryId) => httpClient.delete(`/predictions/${entryId}`)
};
