<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import MatchStatsPanel from '@/components/matches/MatchStatsPanel.vue';
import MatchAiAnalysisPanel from './MatchAiAnalysisPanel.vue';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { useMatchStatus } from '@/composables/useMatchStatus.js';
import { LIVE_MATCH_UNAVAILABLE_MESSAGES } from '@/utils/lineupMessages.js';

const teamStatsModalStore = useTeamStatsModalStore();

const props = defineProps({
  result: { type: Object, required: true },
  averagesComparison: { type: Object, default: null }, // { loading, error, teams, homeTeamId, homeName, awayName }
  liveMatchDetails: { type: Object, default: null }, // { loading, error, data }
  matchAi: { type: Object, default: () => ({ connected: false, running: false, entry: null }) }
});

defineEmits(['compare-averages-click', 'show-live-match-click', 'run-pre-match-ai-click', 'run-post-match-ai-click']);

// Bouton "Voir le direct" affiché uniquement pour un match dont l'heure de
// coup d'envoi est passée depuis moins de 130 min (cf. matchStatus.js) —
// aucun intérêt à proposer ça pour un match pas encore joué ou déjà terminé.
const matchStatus = useMatchStatus(() => props.result.commenceTime);
</script>

<template>
  <div class="analysis">
    <header class="analysis__header">
      <p class="analysis__match">
        <button type="button" class="cm-team-link" @click="teamStatsModalStore.openFor(result.teamStats?.home?.name ?? 'Domicile', result.league, result.matchId)">{{ result.teamStats?.home?.name ?? 'Domicile' }}</button>
        vs
        <button type="button" class="cm-team-link" @click="teamStatsModalStore.openFor(result.teamStats?.away?.name ?? 'Extérieur', result.league, result.matchId)">{{ result.teamStats?.away?.name ?? 'Extérieur' }}</button>
      </p>
    </header>

    <div class="analysis__tabs-row">
      <button
        type="button"
        class="analysis__compare-tab"
        title="Voir la moyenne de toutes les statistiques des deux équipes"
        @click="
          $emit('compare-averages-click', {
            homeName: result.teamStats.home.name,
            awayName: result.teamStats.away.name,
            league: result.league
          })
        "
      >
        <AppIcon name="trendUp" :size="12" />
        Moyennes des deux équipes
      </button>

      <button
        v-if="matchStatus === 'live'"
        type="button"
        class="analysis__compare-tab analysis__compare-tab--live"
        title="Voir le score et les statistiques en direct"
        @click="$emit('show-live-match-click', { homeName: result.teamStats.home.name, commenceTime: result.commenceTime })"
      >
        <span class="analysis__live-dot"></span>
        Voir le direct
      </button>
    </div>

    <CollapsibleSection default-open class="analysis__match-ai">
      <template #header>
        <p class="analysis__odds-1x2-head">Analyse IA</p>
      </template>
      <MatchAiAnalysisPanel
        :connected="matchAi.connected"
        :running="matchAi.running"
        :entry="matchAi.entry"
        @run-pre-match="$emit('run-pre-match-ai-click')"
        @run-post-match="$emit('run-post-match-ai-click')"
      />
    </CollapsibleSection>

    <CollapsibleSection v-if="liveMatchDetails" default-open class="analysis__live-match">
      <template #header>
        <p class="analysis__odds-1x2-head">En direct</p>
      </template>
      <p v-if="liveMatchDetails.loading" class="cm-text-muted analysis__live-note">Récupération du score et des statistiques…</p>
      <p v-else-if="liveMatchDetails.error" class="cm-text-muted analysis__live-note">Erreur : {{ liveMatchDetails.error }}</p>
      <p v-else-if="liveMatchDetails.data && !liveMatchDetails.data.available" class="cm-text-muted analysis__live-note">
        {{ LIVE_MATCH_UNAVAILABLE_MESSAGES[liveMatchDetails.data.reason] ?? 'Détails en direct indisponibles pour ce match.' }}
      </p>
      <template v-else-if="liveMatchDetails.data?.available">
        <p class="analysis__live-score">
          <span class="cm-numeric">{{ liveMatchDetails.data.score.home ?? '—' }} - {{ liveMatchDetails.data.score.away ?? '—' }}</span>
          <span v-if="liveMatchDetails.data.status?.elapsed" class="cm-text-muted"> · {{ liveMatchDetails.data.status.elapsed }}'</span>
          <span v-if="liveMatchDetails.data.status?.long" class="cm-text-muted"> · {{ liveMatchDetails.data.status.long }}</span>
        </p>
        <MatchStatsPanel
          v-if="liveMatchDetails.data.teams?.length"
          :teams="liveMatchDetails.data.teams"
          :primary-team-id="result.teamStats?.home?.id ?? null"
          :fallback-primary-name="result.teamStats?.home?.name"
          :fallback-opponent-name="result.teamStats?.away?.name"
        />
        <p v-else class="cm-text-muted analysis__live-note">Statistiques détaillées pas encore publiées pour ce match.</p>
      </template>
    </CollapsibleSection>

    <CollapsibleSection v-if="averagesComparison" default-open class="analysis__averages-table">
      <template #header>
        <p class="analysis__odds-1x2-head">Détail complet des statistiques <span class="cm-text-muted">(34 champs)</span></p>
      </template>
      <MatchStatsPanel
        :loading="averagesComparison.loading"
        :error="averagesComparison.error"
        :teams="averagesComparison.teams"
        :primary-team-id="averagesComparison.homeTeamId"
        :fallback-primary-name="averagesComparison.homeName"
        :fallback-opponent-name="averagesComparison.awayName"
      />
    </CollapsibleSection>
  </div>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.analysis__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.analysis__match {
  font-size: 15px;
  font-weight: 600;
}

.analysis__odds-1x2-head {
  font-size: 12.5px;
  font-weight: 600;
}

.analysis__averages-table {
  padding: 12px 14px;
  background: var(--cm-surface-alt);
  border-radius: var(--cm-radius);
}

.analysis__tabs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.analysis__compare-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--cm-transition), color var(--cm-transition);
}

.analysis__compare-tab:hover {
  border-color: var(--cm-accent);
  color: var(--cm-accent);
}

.analysis__compare-tab--live {
  border-color: var(--cm-danger);
  color: var(--cm-danger);
}

.analysis__compare-tab--live:hover {
  border-color: var(--cm-danger);
  color: var(--cm-danger);
  background: var(--cm-danger-soft);
}

.analysis__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

@keyframes cm-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.analysis__live-match {
  padding: 12px 14px;
  background: var(--cm-surface-alt);
  border-radius: var(--cm-radius);
}

.analysis__match-ai {
  padding: 12px 14px;
  background: var(--cm-surface-alt);
  border-radius: var(--cm-radius);
}

.analysis__live-note {
  font-size: 11.5px;
}

.analysis__live-score {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 10px;
}
</style>
