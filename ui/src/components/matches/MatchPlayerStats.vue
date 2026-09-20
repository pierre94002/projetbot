<script setup>
import { computed, ref } from 'vue';
import { PLAYER_STAT_TABS } from '@/constants/matchDetailTabs.js';

/**
 * Tableau des statistiques individuelles, avec les mêmes onglets que FotMob :
 * Meilleures statistiques, Attaque, Passes, Défense, Duels, Gardien.
 */
const props = defineProps({ entry: { type: Object, required: true } });

const tab = ref(PLAYER_STAT_TABS[0].id);
const side = ref('all');

const current = computed(() => PLAYER_STAT_TABS.find((t) => t.id === tab.value) ?? PLAYER_STAT_TABS[0]);

const rows = computed(() => {
  const home = (props.entry.players?.home ?? []).map((p) => ({ ...p, teamName: props.entry.homeName, team: 'home' }));
  const away = (props.entry.players?.away ?? []).map((p) => ({ ...p, teamName: props.entry.awayName, team: 'away' }));
  let all = side.value === 'home' ? home : side.value === 'away' ? away : [...home, ...away];

  // L'onglet Gardien ne concerne que les gardiens ; ailleurs, on écarte les
  // joueurs restés sur le banc, dont toutes les cases seraient vides.
  if (current.value.keepersOnly) all = all.filter((p) => p.saves !== undefined || p.position === 'Goalkeeper');
  else all = all.filter((p) => p.minutes || p.starter || p.subbedIn);

  const first = current.value.columns[0].key;
  return all.sort((a, b) => (Number(b[first] ?? -Infinity) || -Infinity) - (Number(a[first] ?? -Infinity) || -Infinity));
});

/**
 * Case vide plutôt que zéro quand la statistique ne concerne pas le joueur :
 * un attaquant n'a pas « 0 arrêt », la mesure ne s'applique pas à lui.
 */
function cell(player, column) {
  const value = player[column.key];
  if (value === null || value === undefined) return '—';
  const shown = column.decimals ? Number(value).toFixed(column.decimals).replace('.', ',') : value;
  if (!column.fraction) return String(shown);
  const total = player[column.fraction];
  if (total === null || total === undefined) return String(shown);
  const pct = total ? Math.round((100 * Number(value)) / Number(total)) : 0;
  return `${shown}/${total} (${pct} %)`;
}
</script>

<template>
  <div class="player-stats">
    <div class="player-stats__controls">
      <div class="player-stats__tabs">
        <button v-for="t in PLAYER_STAT_TABS" :key="t.id" type="button" :class="{ 'is-active': tab === t.id }" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>
      <div class="player-stats__sides">
        <button type="button" :class="{ 'is-active': side === 'all' }" @click="side = 'all'">Les deux</button>
        <button type="button" :class="{ 'is-active': side === 'home' }" @click="side = 'home'">{{ entry.homeName }}</button>
        <button type="button" :class="{ 'is-active': side === 'away' }" @click="side = 'away'">{{ entry.awayName }}</button>
      </div>
    </div>

    <div v-if="rows.length" class="player-stats__wrap">
      <table class="player-stats__table">
        <thead>
          <tr>
            <th>Joueur</th>
            <th v-if="side === 'all'">Équipe</th>
            <th v-for="col in current.columns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.playerId ?? `${p.team}-${p.name}`">
            <td class="player-stats__name cm-truncate">
              <span v-if="p.number != null" class="player-stats__number">{{ p.number }}</span>{{ p.name }}
            </td>
            <td v-if="side === 'all'" class="cm-text-muted cm-truncate">{{ p.teamName }}</td>
            <td v-for="col in current.columns" :key="col.key" class="cm-numeric" :class="{ 'player-stats__highlight': col.highlight && p[col.key] != null }">
              {{ cell(p, col) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="cm-text-muted">Aucune statistique individuelle pour cette sélection.</p>
  </div>
</template>

<style scoped>
.player-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-stats__controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
}

.player-stats__tabs,
.player-stats__sides {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.player-stats__tabs button,
.player-stats__sides button {
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 11.5px;
  padding: 5px 11px;
  border-radius: var(--cm-radius-sm);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.player-stats__tabs button:hover,
.player-stats__sides button:hover {
  background: var(--cm-surface-hover);
}

.player-stats__tabs button.is-active,
.player-stats__sides button.is-active {
  background: var(--cm-accent-soft);
  color: var(--cm-text-primary);
  font-weight: 600;
}

.player-stats__wrap {
  overflow-x: auto;
}

.player-stats__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.player-stats__table th,
.player-stats__table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--cm-border-soft);
  text-align: right;
}

.player-stats__table th {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.player-stats__table th:first-child,
.player-stats__table td:first-child,
.player-stats__table th:nth-child(2),
.player-stats__table td:nth-child(2) {
  text-align: left;
}

.player-stats__name {
  max-width: 190px;
}

.player-stats__number {
  display: inline-block;
  min-width: 20px;
  margin-right: 6px;
  color: var(--cm-text-muted);
  font-family: var(--cm-font-mono);
  font-size: 10.5px;
}

.player-stats__highlight {
  font-weight: 700;
  color: var(--cm-accent);
}
</style>
