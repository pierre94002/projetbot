<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { PLAYER_STAT_TABS } from '@/constants/matchDetailTabs.js';
import EmptyState from '@/components/common/EmptyState.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { aUneFiche } from '@/utils/playerVisuals.js';

/**
 * Tableau des statistiques individuelles, avec les mêmes onglets que FotMob :
 * Meilleures statistiques, Attaque, Passes, Défense, Duels, Gardien.
 *
 * Refonte du 01/10/2026 : les familles de statistiques et le choix du camp
 * en barres segmentées (l'actif en couleur de section), le tableau commun
 * `.cm-table` avec le drapeau du joueur et le logo du club, la colonne
 * vedette (la note) en couleur de section.
 */
const props = defineProps({ entry: { type: Object, required: true } });

const tab = ref(PLAYER_STAT_TABS[0].id);
const side = ref('all');

const current = computed(() => PLAYER_STAT_TABS.find((t) => t.id === tab.value) ?? PLAYER_STAT_TABS[0]);

const rows = computed(() => {
  const home = (props.entry.players?.home ?? []).map((p) => ({ ...p, teamName: props.entry.homeName, teamId: props.entry.homeId ?? null, team: 'home' }));
  const away = (props.entry.players?.away ?? []).map((p) => ({ ...p, teamName: props.entry.awayName, teamId: props.entry.awayId ?? null, team: 'away' }));
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
    <!-- Les familles de statistiques à gauche, le camp à droite : deux barres segmentées. -->
    <div class="player-stats__controls">
      <div class="player-stats__tabs" role="tablist">
        <button v-for="t in PLAYER_STAT_TABS" :key="t.id" type="button" role="tab" :class="{ 'is-active': tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>
      <div class="player-stats__sides" role="tablist">
        <button type="button" role="tab" :class="{ 'is-active': side === 'all' }" :aria-selected="side === 'all'" @click="side = 'all'">Les deux</button>
        <button type="button" role="tab" :class="{ 'is-active': side === 'home' }" :aria-selected="side === 'home'" @click="side = 'home'">
          <TeamCrest :name="entry.homeName" :league="entry.league" :team-id="entry.homeId ?? null" :size="16" />{{ entry.homeName }}
        </button>
        <button type="button" role="tab" :class="{ 'is-active': side === 'away' }" :aria-selected="side === 'away'" @click="side = 'away'">
          <TeamCrest :name="entry.awayName" :league="entry.league" :team-id="entry.awayId ?? null" :size="16" />{{ entry.awayName }}
        </button>
      </div>
    </div>

    <div v-if="rows.length" class="cm-table-wrap player-stats__wrap">
      <table class="cm-table player-stats__table">
        <thead>
          <tr>
            <th>Joueur</th>
            <th v-if="side === 'all'" class="is-left">Équipe</th>
            <th v-for="col in current.columns" :key="col.key" :class="{ 'player-stats__head-highlight': col.highlight }">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.playerId ?? `${p.team}-${p.name}`">
            <td class="player-stats__name">
              <span class="player-stats__who">
                <span v-if="p.number != null" class="player-stats__number cm-numeric">{{ p.number }}</span>
                <TeamCrest v-if="side !== 'all'" :name="p.teamName" :league="entry.league" :team-id="p.teamId" :size="16" />
                <PlayerFlag :player-id="p.playerId ?? null" :size="14" />
                <RouterLink v-if="aUneFiche(p.playerId)" :to="`/joueur/${p.playerId}`" class="player-stats__link cm-truncate">{{ p.name }}</RouterLink>
                <span v-else class="cm-truncate">{{ p.name }}</span>
              </span>
            </td>
            <td v-if="side === 'all'" class="is-left cm-text-muted">
              <span class="player-stats__who">
                <TeamCrest :name="p.teamName" :league="entry.league" :team-id="p.teamId" :size="16" />
                <span class="cm-truncate">{{ p.teamName }}</span>
              </span>
            </td>
            <td v-for="col in current.columns" :key="col.key" class="cm-numeric" :class="{ 'player-stats__highlight': col.highlight && p[col.key] != null }">
              {{ cell(p, col) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState v-else icon="users" title="Aucune statistique individuelle" description="Aucune statistique individuelle pour cette sélection." />
  </div>
</template>

<style scoped>
.player-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.player-stats__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* Deux barres segmentées, le même dessin que TabbedView : fond discret,
   l'actif en relief dans la couleur de la section. */
.player-stats__tabs,
.player-stats__sides {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.player-stats__tabs button,
.player-stats__sides button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.player-stats__tabs button:hover,
.player-stats__sides button:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.player-stats__tabs button.is-active,
.player-stats__sides button.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ----------------------------------------------------------- tableau */
.player-stats__table {
  font-size: 12.5px;
}

.player-stats__name {
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Numéro, drapeau, puis le joueur (sa fiche au clic) ; logo, puis le club. */
.player-stats__who {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 240px;
}

.player-stats__link {
  color: inherit;
  text-decoration: none;
}

.player-stats__link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

.player-stats__number {
  display: inline-block;
  flex-shrink: 0;
  min-width: 20px;
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

/* La colonne vedette (la note) : en-tête et valeurs en couleur de section. */
.player-stats__head-highlight {
  color: var(--cm-section);
}

.player-stats__highlight {
  font-weight: 800;
  color: var(--cm-section);
}
</style>
