<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { standingsApi } from '@/services/standingsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';

/**
 * Classement des joueurs d'un championnat, servi par le magasin local
 * (FotMob/ESPN). Les 810 000 lignes joueur collectées n'avaient aucun écran :
 * le seul existant, dans "Compo & joueurs", interroge API-Football, dont le
 * plan gratuit s'arrête à 2024 et ne couvre pas les championnats ajoutés
 * depuis (Écosse, Grèce, Turquie, Portugal, Belgique, Pays-Bas).
 */
const leagues = ref([]);
const seasons = ref([]);
const selectedLeague = ref('');
const selectedSeason = ref('');
const teamQuery = ref('');
const sortKey = ref('goals');

const state = ref({ loading: false, error: null, players: [] });

const COLUMNS = [
  { key: 'played', label: 'M', title: 'Matchs joués' },
  { key: 'minutes', label: 'Min', title: 'Minutes jouées' },
  { key: 'rating', label: 'Note', title: 'Note moyenne', decimals: 2 },
  { key: 'goals', label: 'B', title: 'Buts' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'xg', label: 'xG', title: 'Buts attendus cumulés', decimals: 2 },
  { key: 'xa', label: 'xA', title: 'Passes décisives attendues', decimals: 2 },
  { key: 'shots', label: 'Tirs', title: 'Tirs tentés' },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'duelsWon', label: 'Duels', title: 'Duels gagnés' },
  { key: 'tackles', label: 'Tacles', title: 'Tacles' },
  { key: 'interceptions', label: 'Interc.', title: 'Interceptions' },
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' }
];

const leagueOptions = computed(() => leagues.value.map((l) => ({ value: l, label: formatLeagueOptionLabel(l) })));

const seasonOptions = computed(() =>
  seasons.value.map((s) => ({ value: String(s.season), label: `${s.season}-${String(s.season + 1).slice(2)} (${s.matches} matchs)` }))
);

// Filtrage par équipe côté navigateur : la liste renvoyée est déjà bornée,
// un aller-retour serveur par frappe n'apporterait rien.
const displayedPlayers = computed(() => {
  const query = teamQuery.value.trim().toLowerCase();
  const filtered = query
    ? state.value.players.filter((p) => p.team?.toLowerCase().includes(query) || p.name?.toLowerCase().includes(query))
    : state.value.players;
  const key = sortKey.value;
  return [...filtered].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
});

function cell(player, column) {
  const value = player[column.key];
  if (value === null || value === undefined) return '—';
  return column.decimals ? Number(value).toFixed(column.decimals) : value;
}

async function loadSeasons() {
  if (!selectedLeague.value) return;
  try {
    const result = await matchStatsApi.seasons(selectedLeague.value);
    seasons.value = result.seasons ?? [];
    const current = seasons.value[0];
    selectedSeason.value = current ? String(current.season) : '';
  } catch {
    seasons.value = [];
    selectedSeason.value = '';
  }
}

async function loadPlayers() {
  if (!selectedLeague.value || !selectedSeason.value) return;
  state.value = { loading: true, error: null, players: [] };
  try {
    const result = await matchStatsApi.players(selectedLeague.value, { season: selectedSeason.value, limit: 300 });
    state.value = { loading: false, error: null, players: result.players ?? [] };
  } catch (error) {
    state.value = { loading: false, error: error.message, players: [] };
  }
}

watch(selectedLeague, async () => {
  await loadSeasons();
  await loadPlayers();
});
watch(selectedSeason, loadPlayers);

onMounted(async () => {
  // Les championnats viennent du magasin lui-même : proposer une compétition
  // sans relevé joueur donnerait un écran vide sans explication.
  const [couverture, classements] = await Promise.allSettled([matchStatsApi.status(), standingsApi.listLeagues()]);
  const avecStats = couverture.status === 'fulfilled' ? (couverture.value.leagues ?? []) : [];
  const connues = classements.status === 'fulfilled' ? (classements.value.leagues ?? []) : [];
  leagues.value = [...new Set([...avecStats, ...connues.filter((l) => avecStats.includes(l))])].sort();
  if (!selectedLeague.value && leagues.value.length) selectedLeague.value = leagues.value[0];
});
</script>

<template>
  <div class="player-stats">
    <AppCard title="Statistiques des joueurs" subtitle="Buts, passes, notes et volume de jeu, cumulés sur la saison — servis par le magasin local">
      <div class="player-stats__controls">
        <AppSelect v-model="selectedLeague" label="Compétition" :options="leagueOptions" />
        <AppSelect v-model="selectedSeason" label="Saison" :options="seasonOptions" :disabled="!seasonOptions.length" />
        <AppTextField v-model="teamQuery" label="Équipe ou joueur" placeholder="Ex. Ajax, Ueda…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>

      <LoadingSpinner v-if="state.loading" label="Calcul des cumuls…" />
      <EmptyState v-else-if="state.error" icon="alert" title="Statistiques indisponibles" :description="state.error" />
      <EmptyState
        v-else-if="!leagues.length"
        icon="database"
        title="Aucun relevé joueur"
        description="Le magasin ne contient encore aucune statistique de joueur. Lance une actualisation depuis Réglages > Données."
      />
      <EmptyState
        v-else-if="!displayedPlayers.length"
        icon="target"
        title="Aucun joueur"
        :description="teamQuery ? `Aucun joueur ne correspond à « ${teamQuery} ».` : 'Aucun joueur ne totalise assez de minutes sur cette saison.'"
      />

      <div v-else class="player-stats__wrap">
        <table class="player-stats__table">
          <thead>
            <tr>
              <th class="player-stats__rank">#</th>
              <th>Joueur</th>
              <th>Équipe</th>
              <th
                v-for="col in COLUMNS"
                :key="col.key"
                :title="`${col.title} — cliquer pour trier`"
                class="player-stats__sortable"
                :class="{ 'player-stats__sortable--active': sortKey === col.key }"
                @click="sortKey = col.key"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(player, index) in displayedPlayers" :key="`${player.name}-${player.team}`">
              <td class="player-stats__rank cm-numeric">{{ index + 1 }}</td>
              <td class="player-stats__name cm-truncate" :title="player.name">{{ player.name }}</td>
              <td class="cm-text-muted cm-truncate" :title="player.team">{{ player.team }}</td>
              <td v-for="col in COLUMNS" :key="col.key" class="cm-numeric" :class="{ 'player-stats__cell--active': sortKey === col.key }">
                {{ cell(player, col) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="displayedPlayers.length" class="cm-text-muted player-stats__note">
        {{ displayedPlayers.length }} joueur(s) — au moins 180 minutes sur la saison. Clique sur une colonne pour trier.
      </p>
    </AppCard>
  </div>
</template>

<style scoped>
.player-stats__controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.player-stats__wrap {
  overflow-x: auto;
}

.player-stats__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.player-stats__table th,
.player-stats__table td {
  padding: 5px 8px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.player-stats__table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
  position: sticky;
  top: 0;
  background: var(--cm-surface);
}

.player-stats__table th:nth-child(2),
.player-stats__table td:nth-child(2),
.player-stats__table th:nth-child(3),
.player-stats__table td:nth-child(3) {
  text-align: left;
}

.player-stats__rank {
  color: var(--cm-text-muted);
  width: 34px;
}

.player-stats__name {
  font-weight: 600;
  max-width: 180px;
}

.player-stats__sortable {
  cursor: pointer;
  user-select: none;
}

.player-stats__sortable--active {
  color: var(--cm-accent);
}

.player-stats__cell--active {
  color: var(--cm-accent);
  font-weight: 600;
}

.player-stats__note {
  font-size: 11px;
  margin-top: 10px;
}
</style>
