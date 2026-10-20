import { defineStore } from 'pinia';
import { configApi } from '@/services/configApi.js';
import { bookmakerAccountsApi } from '@/services/bookmakerAccountsApi.js';
import { fichesParBookmaker } from '@/utils/gardeFous.js';

/**
 * Les GARDE-FOUS de Pierre et les FICHES de ses comptes bookmakers (étape 11 du
 * plan, 06/10/2026) : lus une fois (GET /api/config/garde-fous et
 * /api/bookmaker-accounts), relus au plus toutes les 2 minutes, mis à jour par
 * les panneaux de Réglages après un enregistrement. Le ticket les reçoit de sa
 * page pour SIGNALER une mise au-delà d'un plafond ou de la mise acceptée — il
 * ne bloque jamais « J'ai parié ».
 */
const FRAIS_MS = 2 * 60_000;
let chargement = null;

export const useRisqueStore = defineStore('risque', {
  state: () => ({
    gardeFous: null, // réponse de GET /api/config/garde-fous : { reglage, etat, series, coupeCircuit, fichier, … }
    comptes: null, // réponse de GET /api/bookmaker-accounts : { bookmakers: [{ cle, titre, fiche }], limitations, … }
    chargeLe: 0,
    erreur: null
  }),
  getters: {
    /** Les fiches, par bookmaker : { williamhill: { soldeDeclare, miseMaxAcceptee, limitation, majLe } }. */
    fiches: (state) => fichesParBookmaker(state.comptes),
    /** Ce que le ticket lit : le réglage et l'état du moment (perte de la semaine atteinte ou non). */
    pourLeTicket: (state) => (state.gardeFous ? { reglage: state.gardeFous.reglage, etat: state.gardeFous.etat } : null)
  },
  actions: {
    async charger({ force = false } = {}) {
      if (!force && this.chargeLe && Date.now() - this.chargeLe < FRAIS_MS) return;
      if (chargement) return chargement;
      chargement = (async () => {
        const [gf, comptes] = await Promise.allSettled([configApi.gardeFous(), bookmakerAccountsApi.list()]);
        if (gf.status === 'fulfilled') this.gardeFous = gf.value;
        if (comptes.status === 'fulfilled') this.comptes = comptes.value;
        const erreurs = [gf, comptes].filter((r) => r.status === 'rejected').map((r) => r.reason?.message ?? String(r.reason));
        this.erreur = erreurs.length ? erreurs.join(' · ') : null;
        this.chargeLe = Date.now();
      })().finally(() => {
        chargement = null;
      });
      return chargement;
    },
    async enregistrerGardeFous(reglage) {
      this.gardeFous = await configApi.setGardeFous(reglage);
      return this.gardeFous;
    },
    async enregistrerCompte(cle, fiche) {
      this.comptes = await bookmakerAccountsApi.save(cle, fiche);
      return this.comptes;
    }
  }
});
