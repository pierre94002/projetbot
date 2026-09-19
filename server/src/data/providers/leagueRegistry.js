import { searchLeaguesRaw } from './apiFootballClient.js';
import { getCachedValue, setCachedValue } from '../repositories/statsCacheRepository.js';

const LEAGUE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// getCachedValue renvoie null aussi bien pour "absent" que pour une valeur
// null stockée : une compétition inconnue d'API-Football est donc mémorisée
// sous une sentinelle, sinon chaque appel reconsommerait le quota.
const NO_LEAGUE = 'none';

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
  if (cached !== null) return cached === NO_LEAGUE ? null : cached;

  const results = await searchLeaguesRaw(leagueName);
  const match = countryName
    ? results?.find((entry) => entry.country?.name?.toLowerCase() === countryName.toLowerCase())
    : results?.[0];

  const leagueId = match?.league?.id ?? null;
  setCachedValue(cacheKey, leagueId ?? NO_LEAGUE);
  return leagueId;
}

// The Odds API nomme certains championnats par un sigle plutôt que
// "<Ligue> - <Pays>" (vérifié le 2026-09-14 via GET /v4/sports) — ex. "EPL"
// pour l'Angleterre, sans aucun " - " ni nom de pays. Recherché tel quel, ce
// sigle ne correspond à rien côté API-Football (dont le vrai nom est
// "Premier League") ni côté sources web/CSV locales, d'où un classement qui
// échoue silencieusement. Normalisé ici, au point d'entrée commun, plutôt
// que dans chaque source séparément.
const SPORT_TITLE_ALIASES = {
  epl: { leagueName: 'Premier League', countryName: 'England' }
};

function parseSportTitle(sportTitle) {
  const alias = SPORT_TITLE_ALIASES[sportTitle.trim().toLowerCase()];
  if (alias) return alias;

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
