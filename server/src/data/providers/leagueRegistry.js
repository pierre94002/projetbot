import { searchLeaguesRaw } from './apiFootballClient.js';
import { getCachedValue, setCachedValue } from '../repositories/statsCacheRepository.js';

const LEAGUE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Résout l'identifiant de compétition API-Football à partir du libellé de
 * la source de cotes (ex. "La Liga - Spain", "Premier League - Russia").
 * Interroge /leagues par nom plutôt que de maintenir une table d'IDs
 * codés en dur (peu fiable) : on filtre par pays quand le libellé en
 * fournit un, pour désambiguïser les noms de compétition partagés entre
 * plusieurs pays (ex. "Premier League").
 */
export async function resolveLeagueId(sportTitle) {
  if (!sportTitle) return null;

  const { leagueName, countryName } = parseSportTitle(sportTitle);
  const cacheKey = `league:${leagueName.toLowerCase()}:${(countryName ?? '').toLowerCase()}`;
  const cached = getCachedValue(cacheKey, LEAGUE_CACHE_TTL_MS);
  if (cached !== null) return cached;

  const results = await searchLeaguesRaw(leagueName);
  const match = countryName
    ? results?.find((entry) => entry.country?.name?.toLowerCase() === countryName.toLowerCase())
    : results?.[0];

  const leagueId = match?.league?.id ?? null;
  return setCachedValue(cacheKey, leagueId);
}

function parseSportTitle(sportTitle) {
  const separatorIndex = sportTitle.lastIndexOf(' - ');
  if (separatorIndex === -1) return { leagueName: sportTitle, countryName: null };
  return {
    leagueName: sportTitle.slice(0, separatorIndex),
    countryName: sportTitle.slice(separatorIndex + 3)
  };
}

/**
 * Le plan gratuit API-Football ne donne accès qu'aux saisons 2022 à 2024 :
 * on retombe sur la plus récente saison complète disponible plutôt que sur
 * l'année en cours (qui échouerait systématiquement). À ajuster si vous
 * passez sur un plan payant donnant accès aux saisons courantes.
 */
export const LATEST_AVAILABLE_SEASON = 2024;

export function resolveCurrentSeason() {
  return LATEST_AVAILABLE_SEASON;
}
