import { defineStore } from 'pinia';
import { sourcesApi } from '@/services/sourcesApi.js';

const SOURCE_LABELS = {
  'odds-api': 'Cotes marché (Odds API)',
  sample: 'Jeu de données de test'
};

export const useSourcesStore = defineStore('sources', {
  state: () => ({
    sources: [],
    fixtures: null,
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
        const { sources, fixtures } = await sourcesApi.list();
        this.sources = sources;
        this.fixtures = fixtures;
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
