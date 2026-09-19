import { defineStore } from 'pinia';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { resolveTeamAverages } from '@/utils/resolveTeamAverages.js';
import { useMatchesStore } from './matchesStore.js';

/**
 * L'historique API-Football (getFullHistoryByName) ne couvre que la saison
 * 2024 (plan gratuit) — les matchs saisis à la main par l'utilisateur
 * (Historique moteur) depuis sont invisibles autrement. On les fusionne ici,
 * au même format que les entrées API, plutôt que de les laisser absentes de
 * "Historique" alors que la donnée existe bel et bien (cf. match-results.json).
 * `fixtureId` préfixé "local-" + `local:true` : pas de vrai fixture
 * API-Football pour ces matchs, donc pas de détail par match à charger.
 */
async function buildLocalHistoryEntries(teamName) {
  const normalized = teamName.trim().toLowerCase();
  const { results } = await matchResultsApi.list().catch(() => ({ results: [] }));
  return results
    .filter((r) => r.homeName.toLowerCase() === normalized || r.awayName.toLowerCase() === normalized)
    .map((r) => {
      const isHome = r.homeName.toLowerCase() === normalized;
      const goalsFor = isHome ? r.homeGoals : r.awayGoals;
      const goalsAgainst = isHome ? r.awayGoals : r.homeGoals;
      return {
        fixtureId: `local-${r.matchId}`,
        result: goalsFor > goalsAgainst ? 'V' : goalsFor < goalsAgainst ? 'D' : 'N',
        opponent: isHome ? r.awayName : r.homeName,
        score: `${goalsFor}-${goalsAgainst}`,
        // Les résultats importés (web-<date>-…) n'ont que la date d'import
        // dans settledAt : la date du match est celle encodée dans l'id.
        date: typeof r.matchId === 'string' && /^web-\d{4}-\d{2}-\d{2}-/.test(r.matchId) ? r.matchId.slice(4, 14) : r.settledAt,
        home: isHome,
        local: true,
        // Même clé que les stats importées (date + équipes) pour les
        // résultats web — sert à ne pas afficher deux fois le même match.
        matchKey: typeof r.matchId === 'string' && r.matchId.startsWith('web-') ? r.matchId.slice(4) : null
      };
    });
}

/**
 * Matchs de la saison en cours avec stats d'équipe complètes + stats de
 * chaque joueur, importés chaque matin (tâche de 7h30). Dépliables comme
 * les matchs API-Football, mais sans nouvel appel réseau : tout le détail
 * est déjà dans la réponse.
 */
async function buildWebStatsEntries(teamName) {
  const { matches } = await matchStatsApi.listByTeam(teamName).catch(() => ({ matches: [] }));
  return matches.map((m) => ({
    fixtureId: m.matchId,
    matchKey: m.matchKey,
    result: m.result,
    opponent: m.opponent,
    score: m.score ?? '—',
    date: m.date,
    home: m.home,
    league: m.league,
    web: true,
    teams: m.teams,
    players: m.players,
    sources: m.sources
  }));
}

function mergeHistory(apiMatches, localMatches, webMatches) {
  const webKeys = new Set(webMatches.map((m) => m.matchKey));
  const locals = localMatches.filter((m) => !m.matchKey || !webKeys.has(m.matchKey));
  return [...webMatches, ...locals, ...apiMatches].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Modal globale montée une seule fois dans AppShell — n'importe quel
// composant peut ouvrir le détail complet d'une équipe (34 champs, compo en
// direct, stats individuelles des joueurs) d'un simple appel à
// openFor(name, league, matchId), sans avoir à remonter l'état à travers
// chaque vue qui affiche un nom d'équipe.
export const useTeamStatsModalStore = defineStore('teamStatsModal', {
  state: () => ({
    open: false,
    teamId: null,
    teamName: null,

    averagesLoading: false,
    averagesError: null,
    averages: null,
    averagesInfo: null, // { source: 'web'|'api-football', sampleSize, firstDate, lastDate }

    playersLoading: false,
    playersError: null,
    players: null,

    historyLoading: false,
    historyError: null,
    history: null, // { teamId, teamName, matches }

    // La compo est liée à UN match précis (pas juste l'équipe) : on la
    // résout via le matchId passé à openFor, croisé avec matchesStore (déjà
    // chargé dès qu'on est sur une page qui affiche des équipes). Si le
    // matchId n'est pas fourni ou introuvable dans la liste actuelle,
    // lineupsContext reste null — la modale l'affiche honnêtement plutôt que
    // de deviner un autre match.
    lineupsContext: null, // { commenceTime } | null
    lineupsLoading: false,
    lineupsError: null,
    lineups: null
  }),
  actions: {
    async openFor(teamName, league, matchId = null) {
      this.open = true;
      this.teamId = null;
      this.teamName = teamName;

      this.averagesLoading = true;
      this.averagesError = null;
      this.averages = null;
      this.averagesInfo = null;

      this.playersLoading = true;
      this.playersError = null;
      this.players = null;

      this.historyLoading = true;
      this.historyError = null;
      this.history = null;

      this.lineupsContext = null;
      this.lineupsLoading = false;
      this.lineupsError = null;
      this.lineups = null;

      const match = matchId ? useMatchesStore().matches.find((m) => m.matchId === matchId) ?? null : null;

      await Promise.all([
        resolveTeamAverages(teamName, league)
          .then((result) => {
            this.teamId = result.teamId ?? this.teamId;
            this.teamName = result.teamName ?? this.teamName;
            this.averages = result.stats?.averages ?? {};
            this.averagesInfo = {
              source: result.stats?.source ?? 'api-football',
              sampleSize: result.stats?.sampleSize ?? null,
              firstDate: result.stats?.firstDate ?? null,
              lastDate: result.stats?.lastDate ?? null
            };
          })
          .catch((error) => {
            this.averagesError = error.message;
          })
          .finally(() => {
            this.averagesLoading = false;
          }),
        teamStatsApi
          .getPlayersByName(teamName)
          .then((result) => {
            this.teamId = result.teamId ?? this.teamId;
            this.teamName = result.teamName ?? this.teamName;
            this.players = result;
          })
          .catch((error) => {
            this.playersError = error.message;
          })
          .finally(() => {
            this.playersLoading = false;
          }),
        teamStatsApi
          .getFullHistoryByName(teamName, league)
          .then(async (result) => {
            this.teamId = result.teamId ?? this.teamId;
            this.teamName = result.teamName ?? this.teamName;
            const apiMatches = result.form?.matches ?? [];
            const [localMatches, webMatches] = await Promise.all([buildLocalHistoryEntries(teamName), buildWebStatsEntries(teamName)]);
            const matches = mergeHistory(apiMatches, localMatches, webMatches);
            this.history = { teamId: result.teamId ?? null, teamName: result.teamName ?? teamName, matches };
          })
          .catch(async (error) => {
            // L'historique API a échoué (quota, équipe introuvable…) : les
            // matchs saisis localement restent affichables quand même,
            // plutôt que de tout perdre pour une source en panne.
            const [localMatches, webMatches] = await Promise.all([buildLocalHistoryEntries(teamName), buildWebStatsEntries(teamName)]);
            const matches = mergeHistory([], localMatches, webMatches);
            if (matches.length > 0) {
              this.history = { teamId: null, teamName, matches };
            } else {
              this.historyError = error.message;
            }
          })
          .finally(() => {
            this.historyLoading = false;
          }),
        match
          ? (() => {
              this.lineupsContext = { commenceTime: match.commenceTime };
              this.lineupsLoading = true;
              // L'endpoint résout le match par son équipe à domicile ; sans
              // adversaire ni ligue, le repli recherche web (saison hors plan
              // API-Football) ne se déclenche pas.
              return teamStatsApi
                .getLineupsByName(match.home, match.commenceTime, match.away, match.league)
                .then((result) => {
                  this.lineups = result;
                })
                .catch((error) => {
                  this.lineupsError = error.message;
                })
                .finally(() => {
                  this.lineupsLoading = false;
                });
            })()
          : null
      ]);
    },
    close() {
      this.open = false;
    }
  }
});
