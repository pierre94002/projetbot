import fs from 'node:fs';
import path from 'node:path';
import { getFixturesStatus, getFixturePaths } from '../../data/repositories/fixturesRepository.js';
import { CALENDAR_FILE_PATH } from '../../data/repositories/seasonCalendarRepository.js';
import { resolveDbPath } from '../../data/db/matchStatsDb.js';
import { DATA_SOURCE_KEYS } from '../../data/matchSources.js';
import { refreshLiveOdds, refreshLiveCompetitions } from '../../data/providers/liveDataSync.js';
import { quotesSummary } from '../../data/db/oddsQuotesRepository.js';
import { NOMS_DES_SOURCES } from '../../data/freeMarketOdds.js';

/** Un fichier : son chemin absolu et sa dernière modification (null s'il manque). */
function fichier(chemin) {
  try {
    return { file: chemin, updatedAt: fs.statSync(chemin).mtime.toISOString() };
  } catch {
    return { file: chemin, updatedAt: null };
  }
}

/**
 * D'où viennent VRAIMENT les données de la page Matchs (03/10/2026, Pierre :
 * « il faut que tu me mettes le vrai endroit des données » devant la pilule
 * « Source : Cotes marché (Odds API) »). La source `odds-api` ne fait aucun
 * appel : elle lit sur ce PC le dernier relevé de cotes The Odds API (fait à
 * la main, payant) et, pour les compétitions sans cotes à venir, le
 * calendrier FotMob ; formes, statistiques et compositions viennent du
 * magasin local (FotMob). Chemins absolus et dates de modification, pour que
 * l'interface les montre tels quels. Lecture seule : rien n'est ouvert.
 */
function originesDesDonnees() {
  const chemins = getFixturePaths();
  let base = null;
  try {
    base = path.resolve(resolveDbPath()); // MATCH_STATS_DB peut s'écrire avec des « / » : même forme que les autres chemins.
  } catch {
    base = null; // Profil de service : la base n'a pas de chemin sûr, l'interface le tait.
  }
  // Cotes gratuites (04/10/2026) : relevées par l'appli, gardées dans la
  // base locale, une ligne par source avec son dernier relevé.
  let gratuites = [];
  try {
    gratuites = quotesSummary().sources.map((s) => ({ ...s, name: NOMS_DES_SOURCES[s.source] ?? s.source }));
  } catch {
    gratuites = []; // base d'avant les cotes gratuites
  }
  return {
    calendar: { provider: 'FotMob', ...fichier(CALENDAR_FILE_PATH) },
    odds: { provider: 'The Odds API', ...fichier(chemins.odds) },
    freeOdds: { provider: gratuites.map((s) => s.name).join(', ') || null, file: base, sources: gratuites },
    store: { provider: 'FotMob', file: base },
    sample: { provider: null, ...fichier(chemins.sampleMatches) }
  };
}

export function listSources(req, res) {
  res.json({ sources: DATA_SOURCE_KEYS, fixtures: getFixturesStatus(), origins: originesDesDonnees() });
}

/** Rafraîchit les cotes en direct depuis The Odds API — consomme du quota, jamais automatique. */
export async function postRefreshOdds(req, res) {
  const result = await refreshLiveOdds();
  res.json(result);
}

/** Rafraîchit la liste des compétitions en direct depuis football-data.org. */
export async function postRefreshCompetitions(req, res) {
  const result = await refreshLiveCompetitions();
  res.json(result);
}
