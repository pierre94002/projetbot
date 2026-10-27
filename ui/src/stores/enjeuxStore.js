import { defineStore } from 'pinia';
import { simulationApi } from '@/services/simulationApi.js';
import { cleDEnjeu } from '@/utils/simulation.js';

/**
 * L'ENJEU DES RENCONTRES (étape 28 du plan, 27/10/2026) pour les cartes de rencontre (MatchCard) : UNE requête par jour
 * affiché (GET /api/simulation/enjeux?du=&au=, le même jour), gardée 10 minutes ; les cartes du même jour partagent la
 * réponse. Un enjeu se retrouve par le championnat, le jour et les deux numéros FotMob — jamais par un nom. Tant que les
 * fins de saison sont éteintes (Réglages › Versions du moteur), le serveur ne rend rien : aucune pastille. Lu après
 * l'affichage de la carte (jamais pendant son rendu) : rien n'est calculé, une lecture de ce que la nuit a rangé.
 */
export const GARDE_DES_ENJEUX_MS = 10 * 60_000;
const enVol = new Map(); // jour → promesse

export const useEnjeuxStore = defineStore('enjeux', {
  state: () => ({
    jours: {} // jour → { luLe, affichage, enjeux: { [cle]: ligne }, erreur }
  }),
  getters: {
    /** Les fins de saison sont-elles montrées pour ce jour (la réponse du serveur) ? */
    allume: (state) => (jour) => state.jours[jour]?.affichage === 'allume',
    /** L'enjeu d'une rencontre (une ligne du serveur), ou null. */
    enjeuDe: (state) => (rencontre) => {
      const j = state.jours[rencontre?.date];
      if (!j || j.affichage !== 'allume') return null;
      const cle = cleDEnjeu(rencontre);
      return cle ? (j.enjeux[cle] ?? null) : null;
    }
  },
  actions: {
    /** Lit les enjeux d'un jour, au plus une fois toutes les 10 minutes (une seule requête à la fois par jour). */
    async demander(jour, maintenant = Date.now()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? ''))) return;
      const deja = this.jours[jour];
      if (deja && maintenant - deja.luLe < GARDE_DES_ENJEUX_MS) return;
      if (enVol.has(jour)) return enVol.get(jour);
      const promesse = (async () => {
        try {
          const r = await simulationApi.enjeux(jour, jour);
          const enjeux = {};
          for (const e of r?.enjeux ?? []) {
            const cle = cleDEnjeu(e);
            if (cle) enjeux[cle] = e;
          }
          this.jours = { ...this.jours, [jour]: { luLe: maintenant, affichage: r?.affichage ?? null, enjeux, erreur: null } };
        } catch (error) {
          // Un serveur pas encore relancé (route absente) ou une panne : aucune pastille, réessayé après la garde.
          this.jours = { ...this.jours, [jour]: { luLe: maintenant, affichage: null, enjeux: {}, erreur: error.message } };
        } finally {
          enVol.delete(jour);
        }
      })();
      enVol.set(jour, promesse);
      return promesse;
    }
  }
});
