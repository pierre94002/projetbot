<script setup>
import { computed, ref } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TeamLineup from '@/components/matches/TeamLineup.vue';
import { formatKickoff } from '@/utils/format.js';
import { LINEUP_UNAVAILABLE_MESSAGES } from '@/utils/lineupMessages.js';

const matchesStore = useMatchesStore();
const toastStore = useToastStore();

// --- Composition en direct ---------------------------------------------

// Option vide en tête : sans elle, le <select> affiche visuellement le
// premier match alors que le modèle reste vide tant que l'utilisateur n'a
// rien choisi — le bouton resterait désactivé sans jamais pouvoir s'activer.
const matchOptions = computed(() => [
  { value: '', label: 'Choisir un match…' },
  ...matchesStore.matches.map((m) => ({ value: m.matchId, label: `${m.home} vs ${m.away} · ${formatKickoff(m.commenceTime)}` }))
]);

const selectedMatchId = ref('');
const lineups = ref(null); // { loading, error, result }

async function loadLineups() {
  const match = matchesStore.matches.find((m) => m.matchId === selectedMatchId.value);
  if (!match) return;

  lineups.value = { loading: true, error: null, result: null };
  try {
    const result = await teamStatsApi.getLineupsByName(match.home, match.commenceTime);
    lineups.value = { loading: false, error: null, result };
  } catch (error) {
    lineups.value = { loading: false, error: error.message, result: null };
    toastStore.error(`Composition indisponible : ${error.message}`);
  }
}

// --- Statistiques individuelles des joueurs ------------------------------
const playersTeamQuery = ref('');
const players = ref(null); // { loading, error, result }

async function loadPlayers() {
  const name = playersTeamQuery.value.trim();
  if (!name) return;

  players.value = { loading: true, error: null, result: null };
  try {
    const result = await teamStatsApi.getPlayersByName(name);
    players.value = { loading: false, error: null, result };
  } catch (error) {
    players.value = { loading: false, error: error.message, result: null };
    toastStore.error(`Effectif indisponible : ${error.message}`);
  }
}
</script>

<template>
  <div class="team-squad">
    <AppCard title="Composition en direct" subtitle="Formation, titulaires et remplaçants publiés par les clubs">
      <div class="team-squad__controls">
        <AppSelect v-model="selectedMatchId" label="Match" :options="matchOptions" />
        <AppButton variant="primary" :loading="lineups?.loading" :disabled="!selectedMatchId" @click="loadLineups">
          <template #icon><AppIcon name="bolt" :size="15" /></template>
          Voir la composition
        </AppButton>
      </div>

      <LoadingSpinner v-if="lineups?.loading" label="Récupération de la composition…" />

      <EmptyState
        v-else-if="lineups?.result && !lineups.result.available"
        icon="target"
        title="Composition indisponible"
        :description="LINEUP_UNAVAILABLE_MESSAGES[lineups.result.reason] ?? 'Composition introuvable pour ce match.'"
      />

      <EmptyState v-else-if="lineups?.error" icon="alert" title="Erreur" :description="lineups.error" />

      <div v-else-if="lineups?.result?.available" class="team-squad__lineups">
        <TeamLineup v-for="team in lineups.result.teams" :key="team.teamId" :team="team" />
      </div>

      <EmptyState
        v-else
        icon="matches"
        title="Choisis un match"
        description="Sélectionne une rencontre puis clique sur « Voir la composition »."
      />
    </AppCard>

    <AppCard title="Statistiques individuelles des joueurs" subtitle="Effectif d'une équipe — apparitions, buts, passes, cartons, note moyenne">
      <div class="team-squad__controls">
        <AppTextField v-model="playersTeamQuery" label="Équipe" placeholder="Ex. Real Madrid…" @keyup.enter="loadPlayers" />
        <AppButton variant="primary" :loading="players?.loading" :disabled="!playersTeamQuery.trim()" @click="loadPlayers">
          <template #icon><AppIcon name="bolt" :size="15" /></template>
          Charger l'effectif
        </AppButton>
      </div>

      <LoadingSpinner v-if="players?.loading" label="Récupération de l'effectif…" />
      <EmptyState v-else-if="players?.error" icon="alert" title="Effectif introuvable" :description="players.error" />
      <EmptyState
        v-else-if="players?.result && players.result.players.length === 0"
        icon="target"
        title="Aucun joueur trouvé"
        description="Aucune statistique disponible pour cette équipe sur la saison consultée."
      />

      <div v-else-if="players?.result" class="team-squad__players-table-wrap">
        <p class="cm-text-muted team-squad__players-season">
          {{ players.result.teamName }} — saison {{ players.result.season }} ({{ players.result.players.length }} joueurs)
        </p>
        <table class="team-squad__players-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th>Apps</th>
              <th>Min.</th>
              <th>Note</th>
              <th>Buts</th>
              <th>Passes D.</th>
              <th>Jaunes</th>
              <th>Rouges</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in players.result.players" :key="p.id">
              <td class="team-squad__players-name cm-truncate">{{ p.name }}</td>
              <td class="cm-text-muted">{{ p.position ?? '—' }}</td>
              <td class="cm-numeric">{{ p.appearances ?? '—' }}</td>
              <td class="cm-numeric">{{ p.minutes ?? '—' }}</td>
              <td class="cm-numeric">{{ p.rating ? p.rating.toFixed(1) : '—' }}</td>
              <td class="cm-numeric">{{ p.goals }}</td>
              <td class="cm-numeric">{{ p.assists }}</td>
              <td class="cm-numeric">{{ p.yellowCards }}</td>
              <td class="cm-numeric">{{ p.redCards }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <EmptyState
        v-else
        icon="matches"
        title="Cherche une équipe"
        description="Tape un nom d'équipe puis clique sur « Charger l'effectif »."
      />
    </AppCard>
  </div>
</template>

<style scoped>
.team-squad {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.team-squad__controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: end;
  margin-bottom: 16px;
}

.team-squad__lineups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.team-squad__players-season {
  font-size: 11.5px;
  margin-bottom: 10px;
}

.team-squad__players-table-wrap {
  overflow-x: auto;
}

.team-squad__players-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.team-squad__players-table th,
.team-squad__players-table td {
  padding: 7px 8px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.team-squad__players-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.team-squad__players-table th:first-child,
.team-squad__players-table td:first-child {
  text-align: left;
}

.team-squad__players-name {
  font-weight: 600;
  max-width: 180px;
}

@media (max-width: 960px) {
  .team-squad__controls {
    grid-template-columns: 1fr;
  }
  .team-squad__lineups {
    grid-template-columns: 1fr;
  }
}
</style>
