import { defineStore } from 'pinia';

/**
 * Empreinte des fichiers de données côté serveur (GET /data-version).
 *
 * Sert de signal unique à toute l'appli : le composable useDataAutoRefresh
 * l'alimente, et n'importe quelle vue qui garde ses données en local (plutôt
 * que dans un store) peut surveiller `version` pour se recharger — voir
 * SeasonCalendarView. Les données mises en cache dans les stores Pinia, elles,
 * survivent tant que l'onglet reste ouvert : sans ce signal, une tâche
 * planifiée qui réécrit les JSON pendant la nuit resterait invisible jusqu'au
 * prochain rechargement complet de la page.
 */
export const useDataVersionStore = defineStore('dataVersion', {
  state: () => ({
    /** Empreinte courante, `null` tant que le premier appel n'a pas abouti. */
    version: null,
    /** Date de modification la plus récente parmi les fichiers de données. */
    updatedAt: null,
    /** Un rafraîchissement déclenché par un changement de version est en cours. */
    refreshing: false,
    /** Date du dernier rafraîchissement automatique effectivement joué. */
    lastRefreshedAt: null
  }),
  actions: {
    setVersion(version, updatedAt = null) {
      this.version = version;
      this.updatedAt = updatedAt;
    },
    markRefreshed() {
      this.lastRefreshedAt = new Date().toISOString();
    }
  }
});
