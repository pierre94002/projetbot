import { defineStore } from 'pinia';
import { predictionsApi } from '@/services/predictionsApi.js';

export const usePredictionsStore = defineStore('predictions', {
  state: () => ({
    entries: [],
    loading: false,
    error: null
  }),
  actions: {
    async fetchPredictions() {
      this.loading = true;
      this.error = null;
      try {
        const { entries } = await predictionsApi.list();
        this.entries = entries;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },

    // Silencieux à dessein : journaliser les pronostics ne doit jamais
    // bloquer ni faire échouer le scan lui-même.
    async recordFindings(entries) {
      if (!entries.length) return;
      try {
        const { entries: updated } = await predictionsApi.record(entries);
        this.entries = updated;
      } catch {
        // best-effort
      }
    },

    async updateStatus(entryId, status) {
      const updated = await predictionsApi.updateStatus(entryId, status);
      this.entries = this.entries.map((e) => (e.id === entryId ? updated : e));
      return updated;
    },

    async removeEntry(entryId) {
      await predictionsApi.remove(entryId);
      this.entries = this.entries.filter((e) => e.id !== entryId);
    }
  }
});
