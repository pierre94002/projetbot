<script setup>
import { computed } from 'vue';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import AppModal from '@/components/common/AppModal.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatsPanel from './MatchStatsPanel.vue';
import TeamHistoryModal from './TeamHistoryModal.vue';
import TeamLineup from './TeamLineup.vue';
import { LINEUP_UNAVAILABLE_MESSAGES } from '@/utils/lineupMessages.js';

const store = useTeamStatsModalStore();

const averagesTeams = computed(() => (store.averages ? [{ teamId: store.teamId, teamName: store.teamName, stats: store.averages }] : []));
</script>

<template>
  <AppModal v-if="store.open" :title="`Statistiques — ${store.teamName}`" @close="store.close">
    <section class="team-modal__section">
      <h4 class="team-modal__section-title">Composition en direct</h4>

      <p v-if="!store.lineupsContext" class="cm-text-muted team-modal__note">
        Pas de match associé à ce clic — compo non disponible dans ce contexte.
      </p>
      <LoadingSpinner v-else-if="store.lineupsLoading" label="Récupération de la composition…" />
      <p v-else-if="store.lineupsError" class="cm-text-muted team-modal__note">Erreur : {{ store.lineupsError }}</p>
      <p v-else-if="store.lineups && !store.lineups.available" class="cm-text-muted team-modal__note">
        {{ describeLineupUnavailable(store.lineups) }}
      </p>

      <div v-else-if="store.lineups?.available" class="team-modal__lineups">
        <TeamLineup v-for="(team, index) in store.lineups.teams" :key="team.teamId ?? `${team.teamName}-${index}`" :team="team" />
      </div>
    </section>

    <section class="team-modal__section">
      <h4 class="team-modal__section-title">Historique</h4>
      <TeamHistoryModal
        :team-id="store.history?.teamId ?? store.teamId"
        :team-name="store.teamName"
        :loading="store.historyLoading"
        :error="store.historyError"
        :matches="store.history?.matches ?? []"
      />
    </section>

    <section class="team-modal__section">
      <h4 class="team-modal__section-title">Statistiques individuelles des joueurs</h4>
      <LoadingSpinner v-if="store.playersLoading" label="Récupération de l'effectif…" />
      <p v-else-if="store.playersError" class="cm-text-muted team-modal__note">Erreur : {{ store.playersError }}</p>
      <EmptyState
        v-else-if="store.players && store.players.players.length === 0"
        icon="target"
        title="Aucun joueur trouvé"
        description="Aucune statistique disponible pour cette équipe sur la saison consultée."
      />
      <div v-else-if="store.players" class="team-modal__players-table-wrap">
        <p class="cm-text-muted team-modal__note">Saison {{ store.players.season }} — {{ store.players.players.length }} joueurs</p>
        <table class="team-modal__players-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th>Apps</th>
              <th>Note</th>
              <th>Buts</th>
              <th>Passes D.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in store.players.players" :key="p.id">
              <td class="team-modal__players-name cm-truncate">{{ p.name }}</td>
              <td class="cm-text-muted">{{ p.position ?? '—' }}</td>
              <td class="cm-numeric">{{ p.appearances ?? '—' }}</td>
              <td class="cm-numeric">{{ p.rating ? p.rating.toFixed(1) : '—' }}</td>
              <td class="cm-numeric">{{ p.goals }}</td>
              <td class="cm-numeric">{{ p.assists }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="team-modal__section">
      <h4 class="team-modal__section-title">Détail complet des statistiques (34 champs)</h4>
      <p v-if="store.averagesInfo" class="cm-text-muted team-modal__note">
        <template v-if="store.averagesInfo.source === 'web'">
          Moyenne sur les {{ store.averagesInfo.sampleSize }} derniers matchs importés (saison en cours, du {{ store.averagesInfo.firstDate }} au {{ store.averagesInfo.lastDate }}) — détail match par match et joueurs dans « Historique ».
        </template>
        <template v-else>Moyenne API-Football (saison 2024, plan gratuit) — aucun match de la saison en cours importé pour cette équipe pour l'instant.</template>
      </p>
      <MatchStatsPanel
        single-team
        :loading="store.averagesLoading"
        :error="store.averagesError"
        :teams="averagesTeams"
        :primary-team-id="store.teamId"
        :fallback-primary-name="store.teamName"
      />
    </section>
  </AppModal>
</template>

<style scoped>
.team-modal__section {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.team-modal__section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.team-modal__section-title {
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 10px;
}

.team-modal__note {
  font-size: 11.5px;
}

.team-modal__lineups .team-lineup + .team-lineup {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.team-modal__players-table-wrap {
  overflow-x: auto;
}

.team-modal__players-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  margin-top: 8px;
}

.team-modal__players-table th,
.team-modal__players-table td {
  padding: 5px 6px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.team-modal__players-table th {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.team-modal__players-table th:first-child,
.team-modal__players-table td:first-child {
  text-align: left;
}

.team-modal__players-name {
  font-weight: 600;
  max-width: 120px;
}
</style>
