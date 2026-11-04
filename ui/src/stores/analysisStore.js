import { defineStore } from 'pinia';
import { analysisApi } from '@/services/analysisApi.js';

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    result: null,
    loading: false,
    loadingCorners: false,
    error: null,
    lastRequest: null
  }),
  actions: {
    // Étape 39 (lot 1a) : plus de `bankroll` — la mise est calculée par le serveur sur le capital de Pierre.
    async analyzeMatchById(matchId, source) {
      this.loading = true;
      this.error = null;
      try {
        this.result = await analysisApi.analyzeMatchById(matchId, source);
        this.lastRequest = { matchId, source };
        return this.result;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },
    /** Relance l'analyse du dernier match consulté en incluant cette fois le signal corners (coûteux en appels API). */
    async fetchCornersForLastMatch() {
      if (!this.lastRequest) return;
      this.loadingCorners = true;
      this.error = null;
      try {
        const { matchId, source } = this.lastRequest;
        this.result = await analysisApi.analyzeMatchById(matchId, source, { includeCorners: true });
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loadingCorners = false;
      }
    },
    clear() {
      this.result = null;
      this.error = null;
      this.lastRequest = null;
    }
  }
});
