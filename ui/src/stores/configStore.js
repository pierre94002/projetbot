import { defineStore } from 'pinia';
import { configApi } from '@/services/configApi.js';

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: null,
    defaults: null,
    tilt: null,
    loading: false
  }),
  actions: {
    async fetchAll() {
      this.loading = true;
      try {
        const [{ config, defaults }, tilt] = await Promise.all([configApi.get(), configApi.getTilt()]);
        this.config = config;
        this.defaults = defaults;
        this.tilt = tilt;
      } finally {
        this.loading = false;
      }
    },
    async updateConfig(partialConfig) {
      const { config } = await configApi.update(partialConfig);
      this.config = config;
      return config;
    },
    async resetConfig() {
      const { config } = await configApi.reset();
      this.config = config;
      return config;
    },
    async setCircuitBreaker(active) {
      this.tilt = await configApi.setCircuitBreaker(active);
      return this.tilt;
    },
    async resetTilt() {
      this.tilt = await configApi.resetTilt();
      return this.tilt;
    }
  }
});
