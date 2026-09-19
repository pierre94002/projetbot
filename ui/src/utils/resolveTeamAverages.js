import { teamStatsApi } from '@/services/teamStatsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';

// Moyennes web (import quotidien 7h30, saison en cours) en priorité — repli
// sur API-Football (quota limité à 100 requêtes/jour, saisons 2022-2024
// seulement) uniquement si cette équipe n'a encore aucune stat web importée
// (hors périmètre suivi, ou tâche du matin pas encore passée). Même forme de
// réponse dans les deux cas : { teamId, teamName, stats: { averages, ... } }.
export function resolveTeamAverages(teamName, league) {
  return matchStatsApi.getTeamAverages(teamName).catch(() => teamStatsApi.getAverageStatsByName(teamName, league));
}
