import { defineStore } from 'pinia';
import { flashscoreApi } from '@/services/flashscoreApi.js';

export const useFlashscoreStore = defineStore('flashscore', {
  state: () => ({
    status: null,
    loading: false,
    refreshing: false
  }),
  actions: {
    async fetchStatus() {
      this.loading = true;
      try {
        const { status } = await flashscoreApi.getStatus();
        this.status = status;
      } finally {
        this.loading = false;
      }
    },
    async refresh() {
      this.refreshing = true;
      try {
        const { status } = await flashscoreApi.refresh();
        this.status = status;
        return status;
      } finally {
        this.refreshing = false;
      }
    }
  }
});
