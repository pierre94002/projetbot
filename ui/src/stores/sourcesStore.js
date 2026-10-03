import { defineStore } from 'pinia';
import { sourcesApi } from '@/services/sourcesApi.js';

// Ce que dit chaque source (03/10/2026, Pierre : « il faut que tu me mettes
// le vrai endroit des données ») : « odds-api » n'appelle aucune API, elle
// lit sur ce PC le calendrier FotMob et le dernier relevé de cotes The Odds
// API. Le détail (fichiers, dates) vient de /api/sources → `origins`.
const SOURCE_LABELS = {
  'odds-api': 'FotMob + cotes The Odds API',
  sample: 'Jeu de test (généré sur ce PC)'
};

export const useSourcesStore = defineStore('sources', {
  state: () => ({
    sources: [],
    fixtures: null,
    // D'où vient chaque donnée : { calendar, odds, store, sample } avec
    // fournisseur, chemin du fichier et date de modification. Null tant que
    // le serveur n'a pas été relancé avec cette version.
    origins: null,
    loading: false,
    refreshingOdds: false,
    refreshingCompetitions: false,
    lastOddsQuota: null
  }),
  getters: {
    options: (state) => state.sources.map((key) => ({ value: key, label: SOURCE_LABELS[key] ?? key }))
  },
  actions: {
    async fetchSources() {
      this.loading = true;
      try {
        const { sources, fixtures, origins } = await sourcesApi.list();
        this.sources = sources;
        this.fixtures = fixtures;
        this.origins = origins ?? null;
      } finally {
        this.loading = false;
      }
    },
    async refreshOdds() {
      this.refreshingOdds = true;
      try {
        const result = await sourcesApi.refreshOdds();
        this.lastOddsQuota = result.quota;
        await this.fetchSources();
        return result;
      } finally {
        this.refreshingOdds = false;
      }
    },
    async refreshCompetitions() {
      this.refreshingCompetitions = true;
      try {
        const result = await sourcesApi.refreshCompetitions();
        await this.fetchSources();
        return result;
      } finally {
        this.refreshingCompetitions = false;
      }
    }
  }
});
