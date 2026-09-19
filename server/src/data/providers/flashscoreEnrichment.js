import { findFlashscoreTeamEntry } from '../repositories/flashscoreSnapshotRepository.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';

// Sous-ensemble ciblé des ~30 clés de `statistics` disponibles côté
// FlashScore (cf. évaluation du 2026-09-13) — mêmes familles que
// CURATED_STAT_FIELDS (matchAiAnalysisService.js) côté API-Football, pour que
// les deux sources restent comparables dans le prompt envoyé à l'IA.
const STAT_KEYS = ['expected_goals', 'possession', 'total_shots', 'shots_on_goal', 'corners'];

// Beaucoup de valeurs FlashScore sont des chaînes ("78%", "92% (751/819)")
// plutôt que des nombres bruts — on extrait le premier nombre rencontré,
// jamais deviné si absent.
function parseStatValue(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}

// Côté de l'équipe dans un match de son historique — `null` si le nom ne
// correspond à aucun camp (orthographe différente) ou aux deux (derby
// ambigu) : on ignore le match plutôt que de lui attribuer les stats de
// l'adversaire.
function sideOf(teamName, match) {
  const home = teamNamesLikelyMatch(teamName, match.home_team);
  const away = teamNamesLikelyMatch(teamName, match.away_team);
  if (home === away) return null;
  return home ? 'home' : 'away';
}

function averageStat(historicalMatches, teamName, key) {
  const values = historicalMatches
    .map((m) => {
      const side = sideOf(teamName, m);
      return side ? parseStatValue(m.statistics?.[key]?.[side]) : null;
    })
    .filter((v) => v !== null);
  if (!values.length) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
}

function recentFormLetters(historicalMatches, teamName, sampleSize) {
  return historicalMatches
    .slice(0, sampleSize)
    .map((m) => {
      if (!m.score || m.score.home === undefined || m.score.away === undefined) return null;
      const side = sideOf(teamName, m);
      if (!side) return null;
      const isHome = side === 'home';
      const scoreFor = isHome ? m.score.home : m.score.away;
      const scoreAgainst = isHome ? m.score.away : m.score.home;
      if (scoreFor === scoreAgainst) return 'N';
      return scoreFor > scoreAgainst ? 'V' : 'D';
    })
    .filter(Boolean);
}

// Réduit le payload brut de l'actor (~110 Mo/jour en Football, mesuré le
// 2026-09-13 — CHAQUE match embarque jusqu'à 25 matchs historiques par
// équipe) à une table compacte, UNE entrée par équipe déjà moyennée : c'est
// cette table, pas le brut, qui est persistée (flashscoreSnapshotRepository)
// et relue à chaque analyse IA. Une équipe apparaissant plusieurs fois dans
// le run (rare) garde sa première occurrence.
export function curateFlashscoreTeams(rawMatches) {
  const teams = [];
  const seen = new Set();

  for (const match of rawMatches) {
    for (const side of ['home', 'away']) {
      const teamName = side === 'home' ? match.home_team : match.away_team;
      if (!teamName || seen.has(teamName)) continue;

      const teamHistory = match.historical_snapshot?.historical_data?.[`${side}_team`];
      const historicalMatches = teamHistory?.matches ?? [];
      if (!historicalMatches.length) continue;

      const averages = {};
      for (const key of STAT_KEYS) {
        const avg = averageStat(historicalMatches, teamName, key);
        if (avg !== null) averages[key] = avg;
      }
      const recentForm = recentFormLetters(historicalMatches, teamName, 5);
      if (!Object.keys(averages).length && !recentForm.length) continue;

      seen.add(teamName);
      teams.push({
        teamName,
        sampleSize: historicalMatches.length,
        averages: Object.keys(averages).length ? averages : null,
        recentForm: recentForm.length ? recentForm : null,
        collectedAt: match.historical_snapshot?.meta?.collected_at ?? null
      });
    }
  }

  return teams;
}

/**
 * Contexte complémentaire best-effort depuis le dernier instantané FlashScore
 * (server/data/runtime/flashscore-snapshot.json, alimenté manuellement depuis
 * Réglages > Données > Actualiser FlashScore). Source purement ADDITIVE à
 * côté des statistiques API-Football déjà utilisées (jamais une source de
 * score ou de classement) : `null` si aucun instantané n'existe encore, ou si
 * l'équipe n'y est pas trouvée — jamais une erreur.
 */
export function resolveFlashscoreStatsByName(teamName) {
  if (!teamName) return null;
  return findFlashscoreTeamEntry(teamName);
}
