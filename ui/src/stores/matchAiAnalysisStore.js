import { defineStore } from 'pinia';
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';

export const useMatchAiAnalysisStore = defineStore('matchAiAnalysis', {
  state: () => ({
    byMatchId: {}, // matchId -> entry | null
    loading: false,
    running: false
  }),
  actions: {
    // Un seul appel pour peupler byMatchId pour TOUS les matchs déjà
    // analysés — sert aux badges "analyse IA disponible" dans les listes
    // (Matchs, Historique moteur), plutôt qu'un fetchForMatch par match visible.
    async fetchAll() {
      this.loading = true;
      try {
        const { entries } = await matchAiAnalysisApi.getAll();
        this.byMatchId = { ...this.byMatchId, ...Object.fromEntries(entries.map((e) => [e.matchId, e])) };
        return entries;
      } finally {
        this.loading = false;
      }
    },
    async fetchForMatch(matchId) {
      this.loading = true;
      try {
        const { entry } = await matchAiAnalysisApi.getForMatch(matchId);
        this.byMatchId = { ...this.byMatchId, [matchId]: entry };
        return entry;
      } finally {
        this.loading = false;
      }
    },
    async runPreMatch(matchId, payload) {
      this.running = true;
      try {
        const entry = await matchAiAnalysisApi.runPreMatch(matchId, payload);
        this.byMatchId = { ...this.byMatchId, [matchId]: entry };
        return entry;
      } finally {
        this.running = false;
      }
    },
    async runPostMatch(matchId) {
      this.running = true;
      try {
        const entry = await matchAiAnalysisApi.runPostMatch(matchId);
        this.byMatchId = { ...this.byMatchId, [matchId]: entry };
        return entry;
      } finally {
        this.running = false;
      }
    }
  }
});
