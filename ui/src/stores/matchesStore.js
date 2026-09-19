import { defineStore } from 'pinia';
import { matchesApi } from '@/services/matchesApi.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';

export const useMatchesStore = defineStore('matches', {
  state: () => ({
    source: 'odds-api',
    bankroll: 10000,
    matches: [],
    loading: false,
    error: null,
    formByMatchId: {},
    loadingForm: false
  }),
  actions: {
    async fetchMatches() {
      this.loading = true;
      this.error = null;
      try {
        const { matches } = await matchesApi.list(this.source, this.bankroll);
        // Un match dont le score est connu est terminé — il n'a plus rien à
        // faire dans la liste des matchs à analyser/parier, sur AUCUNE page
        // (Matchs, Mes paris, Compo & joueurs partagent tous cette même
        // liste). Centralisé ici plutôt que filtré séparément par chaque vue.
        //
        // C'est le serveur qui pose `settled` : un score saisi à la main porte
        // le matchId The Odds API, mais un résultat importé par la tâche
        // quotidienne n'a qu'un id "web-<date>-<équipes>". Les rapprocher
        // demande le registre de noms d'équipe, qui n'existe que côté serveur
        // — comparer les identifiants ici ne retirait jamais ces matchs-là.
        this.matches = matches.filter((match) => !match.settled);
      } catch (error) {
        this.error = error.message;
        this.matches = [];
      } finally {
        this.loading = false;
      }
    },
    setSource(source) {
      this.source = source;
    },
    /**
     * Retrait immédiat d'un match tout juste réglé (score saisi dans
     * Historique moteur), sans attendre un nouveau fetchMatches() complet —
     * ce dernier ré-interrogerait l'Odds API pour rien alors que le seul
     * changement est "ce match est désormais terminé". Sans ça, le state
     * Pinia (qui persiste tant que l'app reste ouverte) resterait périmé et
     * un scan dans Mes paris pourrait encore proposer ce match.
     */
    removeMatch(matchId) {
      this.matches = this.matches.filter((match) => match.matchId !== matchId);
    },
    setBankroll(bankroll) {
      this.bankroll = bankroll;
    },
    /** Récupère la forme récente des deux équipes pour chaque match actuellement affiché (API-Football, action groupée explicite). */
    async loadForm() {
      if (this.matches.length === 0) return;
      this.loadingForm = true;
      try {
        const { results } = await teamStatsApi.getBulkForm(
          this.matches.map((match) => ({ matchId: match.matchId, home: match.home, away: match.away, league: match.league }))
        );
        this.formByMatchId = Object.fromEntries(results.map((entry) => [entry.matchId, { home: entry.home, away: entry.away }]));
      } finally {
        this.loadingForm = false;
      }
    }
  }
});
