import { defineStore } from 'pinia';
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';

export const useMatchAiAnalysisStore = defineStore('matchAiAnalysis', {
  state: () => ({
    byMatchId: {}, // matchId -> entry | null
    loading: false,
    running: false
  }),
  actions: {
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
