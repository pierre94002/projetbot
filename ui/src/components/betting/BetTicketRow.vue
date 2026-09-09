<script setup>
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { formatOdds, formatCurrency, formatDateTime } from '@/utils/format.js';
import { legStatus } from '@/utils/betTrends.js';

defineProps({
  bet: { type: Object, required: true }
});

const teamStatsModalStore = useTeamStatsModalStore();
const LEG_STATUS_LABELS = { pending: 'En attente', won: 'Gagné', lost: 'Perdu', void: 'Annulé' };
</script>

<template>
  <div class="ticket-row" :class="`ticket-row--${bet.status}`">
    <div class="ticket-row__main">
      <template v-if="bet.legs.length === 1">
        <p class="ticket-row__match cm-truncate">
          <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(bet.legs[0].homeName, bet.legs[0].league, bet.legs[0].matchId)">{{ bet.legs[0].homeName }}</button>
          vs
          <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(bet.legs[0].awayName, bet.legs[0].league, bet.legs[0].matchId)">{{ bet.legs[0].awayName }}</button>
        </p>
        <p class="cm-text-muted ticket-row__market cm-truncate">
          {{ bet.legs[0].market }} <span v-if="bet.legs[0].league">· {{ bet.legs[0].league }}</span>
        </p>
        <p class="ticket-row__pick cm-truncate">{{ bet.legs[0].pick }}</p>
      </template>
      <template v-else>
        <p class="ticket-row__match cm-truncate">Combiné — {{ bet.legs.length }} sélections</p>
      </template>
      <p class="cm-text-muted ticket-row__date">Réglé le {{ formatDateTime(bet.settledAt) }}</p>
    </div>

    <div class="ticket-row__figures">
      <span class="cm-numeric">@ {{ formatOdds(bet.odds) }}</span>
      <span class="cm-numeric">{{ formatCurrency(bet.stake) }}</span>
      <span class="cm-numeric ticket-row__return" :class="bet.status === 'won' ? 'cm-positive' : 'cm-negative'">
        {{ formatCurrency(bet.status === 'won' ? bet.stake * bet.odds : 0) }}
      </span>
    </div>

    <span class="ticket-row__status" :class="`ticket-row__status--${bet.status}`">{{ bet.status === 'won' ? 'Gagné' : 'Perdu' }}</span>

    <div v-if="bet.legs.length > 1" class="ticket-legs">
      <div v-for="(leg, i) in bet.legs" :key="i" class="ticket-leg">
        <div class="ticket-leg__main">
          <p class="ticket-leg__match cm-truncate">
            <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(leg.homeName, leg.league, leg.matchId)">{{ leg.homeName }}</button>
            vs
            <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(leg.awayName, leg.league, leg.matchId)">{{ leg.awayName }}</button>
          </p>
          <p class="cm-text-muted ticket-leg__market cm-truncate">{{ leg.market }} <span v-if="leg.league">· {{ leg.league }}</span></p>
          <p class="ticket-leg__pick cm-truncate">{{ leg.pick }} <span class="cm-text-muted cm-numeric">@ {{ formatOdds(leg.odds) }}</span></p>
        </div>
        <span class="ticket-leg__status" :class="`ticket-leg__status--${legStatus(bet, i)}`">{{ LEG_STATUS_LABELS[legStatus(bet, i)] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ticket-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--cm-border-soft);
  border-left: 3px solid transparent;
}

.ticket-row:last-child {
  border-bottom: none;
}

.ticket-row--won {
  border-left-color: var(--cm-accent);
}

.ticket-row--lost {
  border-left-color: var(--cm-danger);
}

.ticket-row__main {
  min-width: 0;
}

.ticket-row__match {
  font-size: 13px;
  font-weight: 600;
}

.ticket-row__market {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 3px;
}

.ticket-row__pick {
  font-size: 12px;
  font-weight: 600;
  margin-top: 3px;
}

.ticket-row__date {
  font-size: 10px;
  margin-top: 2px;
}

.ticket-row__figures {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 11.5px;
  flex-shrink: 0;
}

.ticket-row__return {
  font-weight: 700;
}

.ticket-row__status {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  flex-shrink: 0;
}

.ticket-row__status--won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ticket-row__status--lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ticket-legs {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}

.ticket-leg {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
}

.ticket-leg__main {
  min-width: 0;
}

.ticket-leg__match {
  font-size: 11.5px;
  font-weight: 600;
}

.ticket-leg__market {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}

.ticket-leg__pick {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
  display: flex;
  gap: 6px;
}

.ticket-leg__status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
  text-align: center;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.ticket-leg__status--won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ticket-leg__status--lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}
</style>
