<script setup>
import { computed, onMounted } from 'vue';
import { useBetsStore } from '@/stores/betsStore.js';
import AppCard from '@/components/common/AppCard.vue';
import { formatDay, formatCurrency, formatPercent } from '@/utils/format.js';
import { marketBreakdownLabel, legStatus } from '@/utils/betTrends.js';

const betsStore = useBetsStore();

// Regroupe le carnet par jour de création (pas de règlement — un pari en
// attente reste rattaché au jour où il a été placé, comme un relevé de paris
// classique). Chaque jour agrège gagnés/perdus/en attente et le P&L des
// paris déjà réglés ce jour-là.
const betsDailySummaries = computed(() => {
  const byDay = new Map();
  for (const bet of betsStore.bets) {
    const day = bet.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { day, total: 0, won: 0, lost: 0, pending: 0, void: 0, staked: 0, returned: 0 });
    const entry = byDay.get(day);
    entry.total++;
    entry[bet.status]++;
    if (bet.status === 'won' || bet.status === 'lost') {
      entry.staked += bet.stake;
      entry.returned += bet.status === 'won' ? bet.stake * bet.odds : 0;
    }
  }
  return [...byDay.values()]
    .map((entry) => {
      const settled = entry.won + entry.lost;
      return {
        ...entry,
        netProfit: entry.returned - entry.staked,
        roiPercent: entry.staked > 0 ? ((entry.returned - entry.staked) / entry.staked) * 100 : null,
        hitRate: settled > 0 ? (entry.won / settled) * 100 : null,
        failRate: settled > 0 ? (entry.lost / settled) * 100 : null
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
});

// Taux de réussite PAR MARCHÉ — chaque SÉLECTION compte pour son propre
// marché avec son propre statut, y compris dans un combiné : une jambe qui a
// individuellement gagné reste comptée comme gagnée pour son marché même si
// le ticket entier a perdu à cause d'une autre sélection.
//
// Le Yield (mise réelle × cote réelle, cf. discussion Yield/ROI) n'est
// calculé QUE sur les paris simples : la mise d'un combiné est partagée entre
// plusieurs marchés à la fois, l'attribuer en entier à chacun gonflerait
// artificiellement l'exposition — contrairement au taux de réussite, qui
// reste valable jambe par jambe même dans un combiné.
const betsMarketBreakdown = computed(() => {
  const byMarket = new Map();
  for (const bet of betsStore.bets) {
    bet.legs.forEach((leg, index) => {
      const market = marketBreakdownLabel(leg.market, leg.pick);
      if (!byMarket.has(market)) byMarket.set(market, { market, total: 0, won: 0, lost: 0, pending: 0, void: 0, staked: 0, returned: 0 });
      const m = byMarket.get(market);
      m.total++;
      const status = legStatus(bet, index);
      m[status]++;
      if (bet.legs.length === 1 && (status === 'won' || status === 'lost')) {
        m.staked += bet.stake;
        m.returned += status === 'won' ? bet.stake * bet.odds : 0;
      }
    });
  }
  return [...byMarket.values()]
    .map((m) => {
      const settled = m.won + m.lost;
      return {
        ...m,
        settled,
        hitRate: settled > 0 ? (m.won / settled) * 100 : null,
        failRate: settled > 0 ? (m.lost / settled) * 100 : null,
        yieldPercent: m.staked > 0 ? ((m.returned - m.staked) / m.staked) * 100 : null
      };
    })
    .sort((a, b) => b.total - a.total);
});

// Lignes de synthèse tout en bas de chaque tableau : Σ des comptages et un
// taux RECALCULÉ sur ces sommes — jamais une moyenne des taux par
// jour/marché, qui pondérerait un jour/marché à 1 pari autant qu'un autre à 20.
const betsDailyTotal = computed(() => {
  const total = betsDailySummaries.value.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      won: acc.won + d.won,
      lost: acc.lost + d.lost,
      pending: acc.pending + d.pending,
      staked: acc.staked + d.staked,
      returned: acc.returned + d.returned
    }),
    { total: 0, won: 0, lost: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.won + total.lost;
  return {
    ...total,
    netProfit: total.returned - total.staked,
    roiPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null,
    hitRate: settled > 0 ? (total.won / settled) * 100 : null,
    failRate: settled > 0 ? (total.lost / settled) * 100 : null
  };
});

const betsMarketBreakdownTotal = computed(() => {
  const total = betsMarketBreakdown.value.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      won: acc.won + m.won,
      lost: acc.lost + m.lost,
      pending: acc.pending + m.pending,
      staked: acc.staked + m.staked,
      returned: acc.returned + m.returned
    }),
    { total: 0, won: 0, lost: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.won + total.lost;
  return {
    ...total,
    hitRate: settled > 0 ? (total.won / settled) * 100 : null,
    failRate: settled > 0 ? (total.lost / settled) * 100 : null,
    yieldPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null
  };
});

const betsSettledCount = computed(() => betsStore.settledBets.length);
const betsWonCount = computed(() => betsStore.bets.filter((bet) => bet.status === 'won').length);
const betsHitRatePercent = computed(() => (betsSettledCount.value > 0 ? (betsWonCount.value / betsSettledCount.value) * 100 : null));

const betsPerformanceSummary = computed(() => {
  if (betsStore.bets.length === 0) return null;
  const activeDays = betsDailySummaries.value.length;
  if (betsSettledCount.value === 0) {
    return `${betsStore.bets.length} pari(s) sur ${activeDays} jour(s), aucun résultat réglé pour l'instant.`;
  }
  const profitPhrase = betsStore.netProfit >= 0 ? `+${formatCurrency(betsStore.netProfit)}` : formatCurrency(betsStore.netProfit);
  return `Sur ${activeDays} jour(s) actif(s) : ${betsWonCount.value} gagné(s) / ${betsSettledCount.value} réglé(s) (${betsHitRatePercent.value.toFixed(0)}% de réussite), profit net ${profitPhrase} (ROI ${formatPercent(betsStore.roiPercent, { showSign: true })}).`;
});

// Toujours réactualisé à l'ouverture (pas seulement si vide) — cf. même
// remarque que Mes tickets : un match réglé pendant que cette vue était
// démontée ne remonterait sinon jamais sans ce refetch systématique.
onMounted(() => {
  betsStore.fetchBets();
});
</script>

<template>
  <div class="bets-performance-view">
    <AppCard title="Historique &amp; performance" subtitle="Résultats de tes paris (Mes paris), jour par jour">
      <p v-if="betsPerformanceSummary" class="cm-text-secondary performance-summary">{{ betsPerformanceSummary }}</p>
      <p v-else class="cm-text-muted performance-summary">
        Aucun pari créé pour l'instant — place une sélection depuis <RouterLink to="/paris">Mes paris</RouterLink>.
      </p>

      <div class="daily-table-scroll">
        <table class="daily-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Paris</th>
              <th>Gagnés</th>
              <th>Perdus</th>
              <th>En attente</th>
              <th>Misé</th>
              <th>Retours</th>
              <th>Profit net</th>
              <th>ROI</th>
              <th>Taux de réussite</th>
              <th>Taux d'échec</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!betsDailySummaries.length">
              <td colspan="11" class="daily-table__empty cm-text-muted">Aucune donnée pour l'instant.</td>
            </tr>
            <tr v-for="d in betsDailySummaries" :key="d.day">
              <td class="daily-table__day">{{ formatDay(d.day) }}</td>
              <td class="cm-numeric">{{ d.total }}</td>
              <td class="cm-numeric cm-positive">{{ d.won || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ d.lost || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ d.pending || '—' }}</td>
              <td class="cm-numeric">{{ formatCurrency(d.staked) }}</td>
              <td class="cm-numeric">{{ formatCurrency(d.returned) }}</td>
              <td class="cm-numeric" :class="d.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatCurrency(d.netProfit) }}</td>
              <td class="cm-numeric" :class="(d.roiPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ d.roiPercent === null ? '—' : formatPercent(d.roiPercent, { showSign: true }) }}
              </td>
              <td class="cm-numeric cm-positive">{{ d.hitRate === null ? '—' : `${d.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ d.failRate === null ? '—' : `${d.failRate.toFixed(0)}%` }}</td>
            </tr>
            <tr v-if="betsDailySummaries.length" class="daily-table__total">
              <td class="daily-table__day">Tous les jours</td>
              <td class="cm-numeric">{{ betsDailyTotal.total }}</td>
              <td class="cm-numeric cm-positive">{{ betsDailyTotal.won || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ betsDailyTotal.lost || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ betsDailyTotal.pending || '—' }}</td>
              <td class="cm-numeric">{{ formatCurrency(betsDailyTotal.staked) }}</td>
              <td class="cm-numeric">{{ formatCurrency(betsDailyTotal.returned) }}</td>
              <td class="cm-numeric" :class="betsDailyTotal.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatCurrency(betsDailyTotal.netProfit) }}</td>
              <td class="cm-numeric" :class="(betsDailyTotal.roiPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ betsDailyTotal.roiPercent === null ? '—' : formatPercent(betsDailyTotal.roiPercent, { showSign: true }) }}
              </td>
              <td class="cm-numeric cm-positive">{{ betsDailyTotal.hitRate === null ? '—' : `${betsDailyTotal.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ betsDailyTotal.failRate === null ? '—' : `${betsDailyTotal.failRate.toFixed(0)}%` }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="daily-table__subheading">
        Taux de réussite par marché <span class="cm-text-muted">(chaque sélection compte pour son propre marché, y compris dans un combiné)</span>
      </h3>
      <p class="cm-text-muted daily-table__note">
        Yield calculé sur les paris simples uniquement — la mise d'un combiné est partagée entre plusieurs marchés à la
        fois, l'attribuer en entier à chacun fausserait le calcul.
      </p>
      <div class="daily-table-scroll">
        <table class="daily-table">
          <thead>
            <tr>
              <th>Marché</th>
              <th>Paris</th>
              <th>Gagnés</th>
              <th>Perdus</th>
              <th>En attente</th>
              <th>Taux de réussite</th>
              <th>Taux d'échec</th>
              <th>Yield <span class="cm-text-muted">(paris simples)</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!betsMarketBreakdown.length">
              <td colspan="8" class="daily-table__empty cm-text-muted">Aucune donnée pour l'instant.</td>
            </tr>
            <tr v-for="m in betsMarketBreakdown" :key="m.market">
              <td class="daily-table__day">{{ m.market }}</td>
              <td class="cm-numeric">{{ m.total }}</td>
              <td class="cm-numeric cm-positive">{{ m.won || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ m.lost || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ m.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ m.hitRate === null ? '—' : `${m.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ m.failRate === null ? '—' : `${m.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(m.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ m.yieldPercent === null ? '—' : formatPercent(m.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
            <tr v-if="betsMarketBreakdown.length" class="daily-table__total">
              <td class="daily-table__day">Tous marchés</td>
              <td class="cm-numeric">{{ betsMarketBreakdownTotal.total }}</td>
              <td class="cm-numeric cm-positive">{{ betsMarketBreakdownTotal.won || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ betsMarketBreakdownTotal.lost || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ betsMarketBreakdownTotal.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ betsMarketBreakdownTotal.hitRate === null ? '—' : `${betsMarketBreakdownTotal.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ betsMarketBreakdownTotal.failRate === null ? '—' : `${betsMarketBreakdownTotal.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(betsMarketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ betsMarketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(betsMarketBreakdownTotal.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
.bets-performance-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.performance-summary {
  font-size: 12.5px;
  margin-bottom: 14px;
}

.performance-summary :deep(a) {
  color: var(--cm-accent);
}

.daily-table-scroll {
  overflow-x: auto;
}

.daily-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.daily-table th,
.daily-table td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.daily-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.daily-table th:first-child,
.daily-table td:first-child {
  text-align: left;
}

.daily-table__day {
  font-weight: 600;
  text-transform: capitalize;
}

.daily-table__empty {
  text-align: center !important;
  padding: 20px 10px;
}

.daily-table tbody tr:last-child td {
  border-bottom: none;
}

.daily-table__total td {
  border-top: 2px solid var(--cm-border);
  font-weight: 700;
}

.daily-table__subheading {
  font-size: 12px;
  font-weight: 700;
  margin: 18px 0 10px;
}

.daily-table__note {
  font-size: 11px;
  margin: -6px 0 10px;
}
</style>
