import { defineStore } from 'pinia';
import { aiAnalysisApi } from '@/services/aiAnalysisApi.js';

export const useAiAnalysisStore = defineStore('aiAnalysis', {
  state: () => ({
    status: null,
    history: [], // les 10 dernières analyses, plus récente en premier — pour ne rien perdre entre deux runs espacés dans le temps
    loadingStatus: false,
    connecting: false,
    running: false
  }),
  actions: {
    async fetchStatus() {
      this.loadingStatus = true;
      try {
        this.status = await aiAnalysisApi.getStatus();
      } finally {
        this.loadingStatus = false;
      }
    },
    async fetchHistory() {
      const { entries } = await aiAnalysisApi.getHistory();
      this.history = entries;
    },
    async connect(apiKey, model, workspaceId) {
      this.connecting = true;
      try {
        this.status = await aiAnalysisApi.connect(apiKey, model, workspaceId);
        return this.status;
      } finally {
        this.connecting = false;
      }
    },
    async disconnect() {
      this.status = await aiAnalysisApi.disconnect();
      return this.status;
    },
    async runAnalysis(limit) {
      this.running = true;
      try {
        const result = await aiAnalysisApi.run(limit);
        this.history = [result, ...this.history].slice(0, 10);
        return result;
      } finally {
        this.running = false;
      }
    }
  }
});
