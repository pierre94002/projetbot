<script setup>
import { reactive } from 'vue';
import TeamAvatar from './TeamAvatar.vue';
import MatchResultBadge from './MatchResultBadge.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import MatchStatsPanel from './MatchStatsPanel.vue';
import { formatDateTime } from '@/utils/format.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';

const props = defineProps({
  teamId: { type: Number, default: null },
  teamName: { type: String, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  matches: { type: Array, default: () => [] }
});

// État par match, gardé en mémoire tant que le modal reste ouvert : évite de
// re-télécharger les statistiques si l'utilisateur replie puis rouvre une ligne.
const statsByFixture = reactive({});

function isExpanded(fixtureId) {
  return Boolean(statsByFixture[fixtureId]);
}

async function toggleStats(fixtureId) {
  if (statsByFixture[fixtureId]) {
    statsByFixture[fixtureId] = null;
    return;
  }

  statsByFixture[fixtureId] = { loading: true, error: null, teams: [] };
  try {
    const { teams } = await teamStatsApi.getFixtureStatistics(fixtureId);
    statsByFixture[fixtureId] = { loading: false, error: null, teams };
  } catch (error) {
    statsByFixture[fixtureId] = { loading: false, error: error.message, teams: [] };
  }
}
</script>

<template>
  <div class="team-history">
    <LoadingSpinner v-if="loading" label="Récupération de l'historique…" />
    <EmptyState v-else-if="error" icon="alert" title="Historique indisponible" :description="error" />
    <EmptyState
      v-else-if="matches.length === 0"
      icon="matches"
      title="Aucun résultat récent"
      description="Aucune rencontre terminée trouvée pour cette équipe sur la saison en cours."
    />

    <template v-else>
      <p class="cm-text-muted team-history__count">{{ matches.length }} rencontres jouées (saison 2024 + résultats saisis manuellement)</p>

      <div class="team-history__list">
        <div v-for="match in matches" :key="match.fixtureId" class="team-history__match">
          <button
            type="button"
            class="team-history__row"
            :class="{ 'team-history__row--static': match.local }"
            @click="!match.local && toggleStats(match.fixtureId)"
          >
            <TeamAvatar :name="teamName" />
            <div class="team-history__info">
              <p class="team-history__opponent">{{ match.home ? 'vs' : '@' }} {{ match.opponent }}</p>
              <p class="cm-text-muted team-history__date">{{ formatDateTime(match.date) }}</p>
            </div>
            <span class="team-history__score cm-numeric">{{ match.score }}</span>
            <MatchResultBadge :result="match.result" />
            <span v-if="match.local" class="cm-text-muted team-history__local-tag" title="Score saisi manuellement dans Historique moteur — pas de détail statistique disponible pour ce match.">
              Saisi
            </span>
            <AppIcon
              v-else
              name="chevronRight"
              :size="14"
              class="team-history__chevron"
              :class="{ 'team-history__chevron--open': isExpanded(match.fixtureId) }"
            />
          </button>

          <div v-if="!match.local && isExpanded(match.fixtureId)" class="team-history__stats">
            <MatchStatsPanel
              :loading="statsByFixture[match.fixtureId].loading"
              :error="statsByFixture[match.fixtureId].error"
              :teams="statsByFixture[match.fixtureId].teams"
              :primary-team-id="teamId"
              :fallback-primary-name="teamName"
              :fallback-opponent-name="match.opponent"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.team-history__count {
  font-size: 11.5px;
  margin-bottom: 6px;
}

.team-history__list {
  display: flex;
  flex-direction: column;
}

.team-history__match {
  border-bottom: 1px solid var(--cm-border-soft);
}

.team-history__match:last-child {
  border-bottom: none;
}

.team-history__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 4px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.team-history__row:hover {
  background: var(--cm-surface-hover);
}

.team-history__row--static {
  cursor: default;
}

.team-history__row--static:hover {
  background: none;
}

.team-history__local-tag {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  font-size: 10px;
  font-weight: 600;
}

.team-history__info {
  flex: 1;
  min-width: 0;
}

.team-history__opponent {
  font-size: 13.5px;
  font-weight: 500;
}

.team-history__date {
  font-size: 11.5px;
  margin-top: 2px;
}

.team-history__score {
  font-size: 14px;
  font-weight: 600;
}

.team-history__chevron {
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
  flex-shrink: 0;
}

.team-history__chevron--open {
  transform: rotate(-90deg);
}

.team-history__stats {
  padding: 0 4px 12px;
  background: var(--cm-surface-alt);
  border-radius: var(--cm-radius);
  margin: 0 4px 8px;
}
</style>
