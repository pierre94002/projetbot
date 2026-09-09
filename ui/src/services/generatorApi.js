import { httpClient } from './httpClient.js';

export const generatorApi = {
  generateSampleMatches: (count) => httpClient.post('/generator/sample-matches', { count })
};
