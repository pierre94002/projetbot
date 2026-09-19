import { getDataVersion } from '../../data/repositories/dataVersionRepository.js';

export function getDataVersionInfo(req, res) {
  res.json(getDataVersion());
}
