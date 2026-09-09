import { getLeaguesRaw } from '../../data/providers/sportMonksClient.js';

/** Endpoint d'exploration : liste brute des compétitions couvertes par le plan SportMonks actif. */
export async function getSportMonksLeagues(req, res) {
  const leagues = await getLeaguesRaw();
  res.json({ leagues });
}
