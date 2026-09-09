import { generateSampleMatches } from '../../pipelines/testDataGenerator.js';

export function postGenerateSampleMatches(req, res) {
  const count = Number(req.body?.count) || 60;
  const matches = generateSampleMatches(count);
  res.json({ count: matches.length, matches });
}
