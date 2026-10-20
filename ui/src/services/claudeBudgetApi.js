import { httpClient } from './httpClient.js';

// Budget Claude (étape 4 du plan) : les tokens que l'appli a consommés
// (journal de chaque appel, tenu par le serveur), face au budget du jour et de
// la semaine choisi par Pierre, le mode (normal / économe) et pourquoi. La
// lecture ne lance rien ; seul le réglage du budget s'enregistre ici.
export const claudeBudgetApi = {
  /** `relire` : sans attendre les 15 s pendant lesquelles le serveur garde l'état. */
  overview: (relire = false) => httpClient.get(`/claude-budget${relire ? '?force=1' : ''}`),
  /** { tokensParJour, tokensParSemaine, mode: 'auto'|'econome' } → l'état complet, à jour (idempotent). */
  saveSettings: (reglage) => httpClient.put('/claude-budget/reglage', reglage)
};
