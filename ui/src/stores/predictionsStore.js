import { defineStore } from 'pinia';
import { predictionsApi } from '@/services/predictionsApi.js';

export const usePredictionsStore = defineStore('predictions', {
  state: () => ({
    entries: [],
    loading: false,
    error: null,
    // Échec du dernier enregistrement d'un scan, affiché dans Mes paris.
    recordError: null
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

    // Journaliser les pronostics ne doit jamais bloquer ni faire échouer le
    // scan lui-même — mais un échec s'affiche (`recordError`) : avalé en
    // silence, il a laissé l'historique vide du 20 au 30/09/2026 sans que
    // personne ne le voie. Par paquets : le serveur refuse une requête de plus
    // de 100 Ko (express.json), et un scan d'une semaine en envoie 200 Ko.
    async recordFindings(entries) {
      if (!entries.length) return;
      const TAILLE_PAQUET = 100;
      this.recordError = null;
      try {
        let updated = null;
        for (let i = 0; i < entries.length; i += TAILLE_PAQUET) {
          ({ entries: updated } = await predictionsApi.record(entries.slice(i, i + TAILLE_PAQUET)));
        }
        this.entries = updated;
      } catch (error) {
        this.recordError = error.message;
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
