import { defineStore } from 'pinia';
import { configApi } from '@/services/configApi.js';

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: null,
    defaults: null,
    tilt: null,
    loading: false,
    // Étape 25 du plan : la version du moteur que le dernier enregistrement des réglages (ou retour arrière)
    // a mise en service — { numero, nouvelle, reprise, changements, le } —, et l'heure de ce changement, que
    // la carte « Versions du moteur » suit pour se relire.
    derniereVersion: null
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
      const { config, version } = await configApi.update(partialConfig);
      this.config = config;
      this.derniereVersion = version ? { ...version, le: new Date().toISOString() } : null;
      return config;
    },
    async resetConfig() {
      const { config, version } = await configApi.reset();
      this.config = config;
      this.derniereVersion = version ? { ...version, le: new Date().toISOString() } : null;
      return config;
    },
    // Étape 25 : après un retour à la version précédente, les réglages affichés deviennent ceux qu'il a remis.
    appliquerRetour(r) {
      if (r?.config) this.config = r.config;
      this.derniereVersion = Number.isInteger(r?.vers) ? { numero: r.vers, nouvelle: false, reprise: true, changements: r.changements ?? [], le: new Date().toISOString() } : null;
    },
    // Étape 25, seconde moitié : une candidate adoptée remet le formulaire (ses réglages) et dit sa version.
    appliquerAdoption(r) {
      if (r?.config) this.config = r.config;
      this.derniereVersion = Number.isInteger(r?.vers) ? { numero: r.vers, nouvelle: Boolean(r.nouvelle), reprise: !r.nouvelle, changements: r.changements ?? [], le: new Date().toISOString() } : null;
    },
    async setCircuitBreaker(active) {
      this.tilt = await configApi.setCircuitBreaker(active);
      return this.tilt;
    },
    async resetTilt() {
      this.tilt = await configApi.resetTilt();
      return this.tilt;
    },
    // Étape 11 : un garde-fou enregistré peut enclencher (ou relâcher) le coupe-circuit — l'état effectif est relu.
    async refreshTilt() {
      this.tilt = await configApi.getTilt();
      return this.tilt;
    }
  }
});
