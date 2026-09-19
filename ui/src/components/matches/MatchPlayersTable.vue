<script setup>
import { computed, ref } from 'vue';

/**
 * Stats individuelles des joueurs sur UN match (import quotidien 7h30, cf.
 * server/scripts/merge-match-stats.mjs). Une colonne sans aucune valeur pour
 * l'équipe affichée est masquée plutôt que remplie de "—" : une trentaine de
 * colonnes vides rendrait le tableau illisible dans la modale.
 */
const props = defineProps({
  teamName: { type: String, required: true },
  opponentName: { type: String, default: 'Adversaire' },
  players: { type: Object, default: () => ({ team: [], opponent: [] }) } // { team: [...], opponent: [...] }
});

const COLUMNS = [
  { key: 'minutes', label: 'Min' },
  { key: 'rating', label: 'Note', format: (v) => v.toFixed(1) },
  { key: 'goals', label: 'Buts' },
  { key: 'assists', label: 'PD' },
  { key: 'shots', label: 'Tirs', render: (p) => (p.shots == null ? null : p.shotsOnTarget == null ? p.shots : `${p.shots} (${p.shotsOnTarget})`), title: 'Tirs (cadrés)' },
  { key: 'xg', label: 'xG', format: (v) => v.toFixed(2) },
  { key: 'xa', label: 'xA', format: (v) => v.toFixed(2) },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'passes', label: 'Passes', render: (p) => (p.passes == null ? null : p.passesAccurate == null ? p.passes : `${p.passesAccurate}/${p.passes}`), title: 'Passes réussies / tentées' },
  { key: 'crosses', label: 'Centres' },
  { key: 'dribblesWon', label: 'Drib.', title: 'Dribbles réussis' },
  { key: 'touches', label: 'Ballons', title: 'Ballons touchés' },
  { key: 'tackles', label: 'Tacles' },
  { key: 'interceptions', label: 'Interc.' },
  { key: 'clearances', label: 'Dégag.' },
  { key: 'duelsWon', label: 'Duels', render: (p) => (p.duelsWon == null ? null : p.duelsTotal == null ? p.duelsWon : `${p.duelsWon}/${p.duelsTotal}`), title: 'Duels gagnés / disputés' },
  { key: 'foulsCommitted', label: 'Fautes', title: 'Fautes commises' },
  { key: 'foulsSuffered', label: 'Subies', title: 'Fautes subies' },
  { key: 'offsides', label: 'HJ', title: 'Hors-jeux' },
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' },
  { key: 'saves', label: 'Arrêts' },
  { key: 'goalsConceded', label: 'Enc.', title: 'Buts encaissés' }
];

const activeSide = ref('team');

const displayedPlayers = computed(() =>
  [...(props.players?.[activeSide.value] ?? [])].sort(
    (a, b) => Number(Boolean(b.starter)) - Number(Boolean(a.starter)) || (b.minutes ?? 0) - (a.minutes ?? 0)
  )
);

const visibleColumns = computed(() => COLUMNS.filter((col) => displayedPlayers.value.some((p) => p[col.key] != null)));

function cell(player, col) {
  if (col.render) return col.render(player) ?? '—';
  const value = player[col.key];
  if (value == null) return '—';
  return col.format ? col.format(value) : value;
}

const hasAnyPlayers = computed(() => (props.players?.team?.length ?? 0) + (props.players?.opponent?.length ?? 0) > 0);
const hasStarterInfo = computed(() => displayedPlayers.value.some((p) => typeof p.starter === 'boolean'));
</script>

<template>
  <div class="match-players">
    <p class="match-players__title">Statistiques des joueurs sur ce match</p>

    <p v-if="!hasAnyPlayers" class="cm-text-muted match-players__note">
      Aucune statistique joueur confirmée pour ce match (source indisponible lors de l'import).
    </p>

    <template v-else>
      <div class="match-players__tabs">
        <button type="button" class="match-players__tab" :class="{ 'match-players__tab--active': activeSide === 'team' }" @click="activeSide = 'team'">
          {{ teamName }} ({{ players.team?.length ?? 0 }})
        </button>
        <button type="button" class="match-players__tab" :class="{ 'match-players__tab--active': activeSide === 'opponent' }" @click="activeSide = 'opponent'">
          {{ opponentName }} ({{ players.opponent?.length ?? 0 }})
        </button>
      </div>

      <p v-if="displayedPlayers.length === 0" class="cm-text-muted match-players__note">Aucun joueur importé pour cette équipe.</p>

      <div v-else class="match-players__wrap">
        <table class="match-players__table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th v-for="col in visibleColumns" :key="col.key" :title="col.title ?? col.label">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, index) in displayedPlayers" :key="`${activeSide}-${index}-${p.name}`" :class="{ 'match-players__sub': p.starter === false }">
              <td class="match-players__name cm-truncate" :title="p.name">{{ p.name }}</td>
              <td class="cm-text-muted">{{ p.position ?? '—' }}</td>
              <td v-for="col in visibleColumns" :key="col.key" class="cm-numeric">{{ cell(p, col) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cm-text-muted match-players__note"><template v-if="hasStarterInfo">Remplaçants en grisé · </template>colonnes sans aucune donnée masquées.</p>
    </template>
  </div>
</template>

<style scoped>
.match-players {
  padding: 10px 4px 4px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-players__title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
  margin-bottom: 8px;
}

.match-players__tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.match-players__tab {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: none;
  color: var(--cm-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.match-players__tab--active {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: #fff;
}

.match-players__wrap {
  overflow-x: auto;
}

.match-players__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.match-players__table th,
.match-players__table td {
  padding: 4px 6px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.match-players__table th {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.match-players__table th:first-child,
.match-players__table td:first-child,
.match-players__table th:nth-child(2),
.match-players__table td:nth-child(2) {
  text-align: left;
}

.match-players__name {
  font-weight: 600;
  max-width: 130px;
}

.match-players__sub td {
  opacity: 0.65;
}

.match-players__note {
  font-size: 10.5px;
  margin-top: 6px;
}
</style>
