import { defineStore } from 'pinia';
import { betsApi } from '@/services/betsApi.js';

export const useBetsStore = defineStore('bets', {
  state: () => ({
    bets: [],
    loading: false,
    error: null
  }),
  getters: {
    // Le P&L ne compte que les paris tranchés (gagné/perdu) — un pari en
    // attente ou annulé n'a pas encore de résultat réel à mesurer.
    settledBets: (state) => state.bets.filter((bet) => bet.status === 'won' || bet.status === 'lost'),
    totalStaked: (state) => state.settledBets.reduce((sum, bet) => sum + bet.stake, 0),
    totalReturned: (state) =>
      state.settledBets.reduce((sum, bet) => sum + (bet.status === 'won' ? bet.stake * bet.odds : 0), 0),
    netProfit() {
      return this.totalReturned - this.totalStaked;
    },
    roiPercent() {
      return this.totalStaked > 0 ? (this.netProfit / this.totalStaked) * 100 : null;
    }
  },
  actions: {
    async fetchBets() {
      this.loading = true;
      this.error = null;
      try {
        const { bets } = await betsApi.list();
        this.bets = bets;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },

    async createBet(bet) {
      const created = await betsApi.create(bet);
      this.bets = [created, ...this.bets];
      return created;
    },

    async updateBetLegStatus(betId, legIndex, status) {
      const updated = await betsApi.updateLegStatus(betId, legIndex, status);
      this.bets = this.bets.map((bet) => (bet.id === betId ? updated : bet));
      return updated;
    },

    async removeBet(betId) {
      await betsApi.remove(betId);
      this.bets = this.bets.filter((bet) => bet.id !== betId);
    }
  }
});
