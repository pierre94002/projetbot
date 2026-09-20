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
    const result = await teamStatsApi.getLineupsByName(match.home, match.commenceTime, match.away, match.league);
    lineups.value = { loading: false, error: null, result };
  } catch (error) {
    lineups.value = { loading: false, error: error.message, result: null };
    toastStore.error(`Composition indisponible : ${error.message}`);
  }
}

// --- Statistiques individuelles des joueurs ------------------------------
const playersTeamQuery = ref('');
const players = ref(null); // { loading, error, result }

/** « Σ Totaux » (cumul de la saison) ou « ⌀ Par match » (par match joué). */
const playerMode = ref('totals');

/**
 * Colonnes chiffrées du tableau d'effectif. Seules celles qu'au moins un
 * joueur renseigne sont affichées : la source ne publie ni minutes ni note,
 * et les arrêts ne concernent que les gardiens — des colonnes entièrement
 * vides n'apprendraient rien.
 */
const PLAYER_COLUMNS = [
  { key: 'goals', label: 'Buts', title: 'Buts marqués' },
  { key: 'assists', label: 'Passes D.', title: 'Passes décisives' },
  { key: 'shots', label: 'Tirs', title: 'Tirs tentés' },
  { key: 'shotsOnTarget', label: 'Cadrés', title: 'Tirs cadrés' },
  { key: 'foulsCommitted', label: 'Fautes', title: 'Fautes commises' },
  { key: 'foulsSuffered', label: 'Subies', title: 'Fautes subies' },
  { key: 'offsides', label: 'H-J', title: 'Hors-jeu' },
  { key: 'saves', label: 'Arrêts', title: 'Arrêts (gardiens)' },
  { key: 'goalsConceded', label: 'Encaissés', title: 'Buts encaissés (gardiens)' },
  { key: 'yellowCards', label: 'Jaunes', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'Rouges', title: 'Cartons rouges' }
];

const squadPlayers = computed(() => players.value?.result?.players ?? []);
const hasAverages = computed(() => squadPlayers.value.some((p) => p.averages && Object.keys(p.averages).length));

const playerColumns = computed(() =>
  PLAYER_COLUMNS.filter((col) =>
    squadPlayers.value.some((p) => Number.isFinite(Number(p.totals?.[col.key] ?? p[col.key])))
  )
);

/**
 * Une case vide plutôt qu'un zéro : un gardien n'a pas « 0 hors-jeu », la
 * statistique ne le concerne pas. Distinguer les deux évite de laisser croire
 * à une donnée mesurée là où il n'y en a pas.
 */
function playerCell(player, key) {
  if (playerMode.value === 'averages') {
    const value = player.averages?.[key];
    return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '—';
  }
  const value = player.totals?.[key] ?? player[key];
  return Number.isFinite(Number(value)) ? Number(value) : '—';
}

async function loadPlayers() {
  const name = playersTeamQuery.value.trim();
  if (!name) return;

  players.value = { loading: true, error: null, result: null };
  try {
    // Saison réelle en cours (pas resolveCurrentSeason()/2024 côté serveur,
    // qui n'est qu'un repli quand la vraie saison échoue) — même logique que
    // les compositions (getLineupsByName), pour obtenir l'effectif actuel
    // par défaut plutôt que des stats figées de 2024, avec repli recherche
    // web automatique si l'API-Football ne couvre pas cette saison.
    const result = await teamStatsApi.getPlayersByName(name, new Date().getFullYear());
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
        :description="describeLineupUnavailable(lineups.result)"
      />

      <EmptyState v-else-if="lineups?.error" icon="alert" title="Erreur" :description="lineups.error" />

      <template v-else-if="lineups?.result?.available">
        <p v-if="lineups.result.source === 'web'" class="cm-text-muted team-squad__web-source">
          Composition {{ lineups.result.officialOrProbable === 'official' ? 'officielle' : 'probable' }} trouvée via recherche web{{ lineups.result.sourceUrl ? ` (${lineups.result.sourceUrl})` : '' }} — pas depuis API-Football.
        </p>
        <div class="team-squad__lineups">
          <TeamLineup v-for="(team, index) in lineups.result.teams" :key="team.teamId ?? `${team.teamName}-${index}`" :team="team" />
        </div>
      </template>

      <EmptyState
        v-else
        icon="matches"
        title="Choisis un match"
        description="Sélectionne une rencontre puis clique sur « Voir la composition »."
      />
    </AppCard>

    <AppCard
      title="Statistiques individuelles des joueurs"
      subtitle="Effectif complet reconstitué depuis les feuilles de match — totaux de la saison ou moyennes par match joué"
    >
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
        <div class="team-squad__players-head">
          <p class="cm-text-muted team-squad__players-season">
            {{ players.result.teamName }} — saison {{ players.result.season }} ({{ players.result.players.length }} joueurs)
            <template v-if="players.result.source === 'match-stats'">
              — reconstitué depuis {{ players.result.matchesCounted }} feuille(s) de match
            </template>
            <template v-else-if="players.result.source === 'web'"> — trouvé via recherche web, pas depuis API-Football</template>
          </p>
          <div v-if="hasAverages" class="team-squad__toggle">
            <button type="button" :class="{ 'is-active': playerMode === 'totals' }" @click="playerMode = 'totals'">Σ Totaux</button>
            <button type="button" :class="{ 'is-active': playerMode === 'averages' }" @click="playerMode = 'averages'">⌀ Par match</button>
          </div>
        </div>
        <table class="team-squad__players-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th title="Présences sur la feuille de match">Feuille</th>
              <th title="Matchs réellement joués — titularisations et entrées en jeu">Joués</th>
              <th>Titul.</th>
              <th v-for="col in playerColumns" :key="col.key" :title="col.title">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in players.result.players" :key="p.id">
              <td class="team-squad__players-name cm-truncate">{{ p.name }}</td>
              <td class="cm-text-muted">{{ p.position ?? '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ p.onSheet ?? '—' }}</td>
              <td class="cm-numeric">{{ p.appearances ?? '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ p.starts ?? '—' }}</td>
              <td v-for="col in playerColumns" :key="col.key" class="cm-numeric">{{ playerCell(p, col.key) }}</td>
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

.team-squad__web-source {
  font-size: 11px;
  margin-bottom: 10px;
}

.team-squad__players-season {
  font-size: 11.5px;
  margin-bottom: 10px;
}

.team-squad__players-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.team-squad__toggle {
  display: inline-flex;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}

.team-squad__toggle button {
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.team-squad__toggle button:hover {
  background: var(--cm-surface-hover);
}

.team-squad__toggle button.is-active {
  background: var(--cm-accent-soft);
  color: var(--cm-text-primary);
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
