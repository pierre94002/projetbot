<script setup>
import { computed, reactive, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { usePredictionSettlement } from '@/composables/usePredictionSettlement.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchAiAnalysisPanel from '@/components/analysis/MatchAiAnalysisPanel.vue';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { formatOdds, formatDay } from '@/utils/format.js';

const props = defineProps({ matchId: { type: String, required: true } });

const predictionsStore = usePredictionsStore();
const betsStore = useBetsStore();
const matchesStore = useMatchesStore();
const aiAnalysisStore = useAiAnalysisStore();
const matchAiAnalysisStore = useMatchAiAnalysisStore();
const teamStatsModalStore = useTeamStatsModalStore();
const { settling, settleMatch, setPredictionStatus, removePrediction } = usePredictionSettlement();

const PREDICTION_STATUS_LABELS = { pending: 'En attente', correct: 'Correct', incorrect: 'Incorrect', void: 'Annulé' };

// Page atteignable directement par URL (partage de lien, rechargement) — pas
// seulement depuis un clic dans Historique moteur, donc tout se recharge ici
// plutôt que de compter sur un état déjà en mémoire.
const scores = reactive({}); // matchId -> { home, away }

function getScore(matchId) {
  if (!scores[matchId]) scores[matchId] = { home: null, away: null };
  return scores[matchId];
}

function onScoreInput(side, event) {
  const raw = event.target.value;
  getScore(props.matchId)[side] = raw === '' ? null : Number(raw);
}

const group = computed(() => {
  const entries = predictionsStore.entries.filter((e) => e.matchId === props.matchId);
  if (!entries.length) return null;
  const first = entries[0];
  return { matchId: props.matchId, homeName: first.homeName, awayName: first.awayName, league: first.league, day: first.day, entries };
});

const hasResult = computed(() => {
  const score = getScore(props.matchId);
  return score.home !== null && score.away !== null;
});

function matchKickoff() {
  return matchesStore.matches.find((m) => m.matchId === props.matchId)?.commenceTime ?? null;
}

onMounted(() => {
  if (predictionsStore.entries.length === 0) predictionsStore.fetchPredictions();
  if (betsStore.bets.length === 0) betsStore.fetchBets();
  if (!aiAnalysisStore.status) aiAnalysisStore.fetchStatus();
  matchAiAnalysisStore.fetchForMatch(props.matchId);
  if (matchesStore.matches.length === 0) matchesStore.fetchMatches();
  matchResultsApi
    .list()
    .then(({ results }) => {
      const result = results.find((r) => r.matchId === props.matchId);
      if (result) scores[props.matchId] = { home: result.homeGoals, away: result.awayGoals };
    })
    .catch(() => {});
});
</script>

<template>
  <div class="match-detail">
    <RouterLink to="/historique-moteur" class="match-detail__back">
      <AppIcon name="chevronRight" :size="12" class="match-detail__back-icon" />
      Retour à Historique moteur
    </RouterLink>

    <EmptyState
      v-if="!group"
      icon="target"
      title="Match introuvable"
      description="Ce match ne fait partie d'aucun pronostic enregistré, ou les données sont encore en cours de chargement."
    />

    <template v-else>
      <AppCard>
        <div class="match-detail__header">
          <div>
            <p class="match-detail__match">
              <button type="button" class="cm-team-link" @click="teamStatsModalStore.openFor(group.homeName, group.league, group.matchId)">{{ group.homeName }}</button>
              vs
              <button type="button" class="cm-team-link" @click="teamStatsModalStore.openFor(group.awayName, group.league, group.matchId)">{{ group.awayName }}</button>
            </p>
            <p class="cm-text-muted match-detail__meta">
              <LeagueBadge :league="group.league" />
              {{ formatDay(group.day) }}
              <MatchStatusBadge :commence-time="matchKickoff()" class="match-detail__status-badge" />
            </p>
          </div>

          <div class="match-detail__score">
            <span class="cm-text-muted match-detail__score-label">Score final</span>
            <input
              type="number"
              min="0"
              class="score-input"
              :value="getScore(matchId).home"
              placeholder="0"
              @input="onScoreInput('home', $event)"
            />
            <span class="cm-text-muted">-</span>
            <input
              type="number"
              min="0"
              class="score-input"
              :value="getScore(matchId).away"
              placeholder="0"
              @input="onScoreInput('away', $event)"
            />
            <AppButton
              variant="secondary"
              size="sm"
              :loading="settling[matchId]"
              :disabled="getScore(matchId).home === null || getScore(matchId).away === null"
              @click="settleMatch(group, getScore(matchId))"
            >
              Régler
            </AppButton>
          </div>
        </div>
      </AppCard>

      <AppCard title="Pronostics de ce match" :subtitle="`${group.entries.length} marché(s) suivi(s) par le moteur`">
        <div
          v-for="entry in group.entries"
          :key="entry.id"
          class="bets-row"
          :class="`bets-row--${entry.status === 'correct' ? 'won' : entry.status === 'incorrect' ? 'lost' : entry.status}`"
        >
          <div class="bets-row__main">
            <p class="cm-text-muted bets-row__market cm-truncate">
              {{ entry.market }}
              <span v-if="entry.market === 'Résultat' && entry.action === 'RECOMMENDED'" class="cm-positive"> · value bet</span>
            </p>
            <p class="bets-row__pick cm-truncate">{{ entry.predictedLabel }}</p>
          </div>
          <div class="value-bet-row__figures">
            <span class="cm-numeric">@ {{ formatOdds(entry.predictedOdds) }}</span>
          </div>
          <span class="bets-row__status" :class="`bets-row__status--${entry.status === 'correct' ? 'won' : entry.status === 'incorrect' ? 'lost' : entry.status}`">
            {{ PREDICTION_STATUS_LABELS[entry.status] }}
          </span>
          <div class="bets-row__actions">
            <template v-if="entry.status === 'pending'">
              <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'correct')">Correct</AppButton>
              <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'incorrect')">Incorrect</AppButton>
              <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'void')">Annulé</AppButton>
            </template>
            <AppButton v-else variant="ghost" size="sm" @click="setPredictionStatus(entry, 'pending')">Réouvrir</AppButton>
            <button type="button" class="bets-row__delete" title="Supprimer" @click="removePrediction(entry)">
              <AppIcon name="x" :size="14" />
            </button>
          </div>
        </div>
      </AppCard>

      <AppCard title="Analyse IA">
        <MatchAiAnalysisPanel
          :connected="aiAnalysisStore.status?.connected ?? false"
          :running="matchAiAnalysisStore.running"
          :entry="matchAiAnalysisStore.byMatchId[matchId] ?? null"
          :allow-pre-match="false"
          :has-result="hasResult"
          @run-post-match="matchAiAnalysisStore.runPostMatch(matchId)"
        />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.match-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-detail__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.match-detail__back:hover {
  color: var(--cm-accent);
}

.match-detail__back-icon {
  transform: rotate(180deg);
}

.match-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.match-detail__match {
  font-size: 17px;
  font-weight: 700;
}

.match-detail__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12.5px;
}

.match-detail__score {
  display: flex;
  align-items: center;
  gap: 8px;
}

.match-detail__score-label {
  font-size: 11.5px;
}

.score-input {
  width: 44px;
  padding: 6px 4px;
  text-align: center;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-primary);
  font-size: 13px;
}

.bets-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--cm-border-soft);
  border-left: 3px solid transparent;
}

.bets-row:last-child {
  border-bottom: none;
}

.bets-row--won {
  border-left-color: var(--cm-accent);
}

.bets-row--lost {
  border-left-color: var(--cm-danger);
}

.bets-row__market {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.bets-row__pick {
  font-size: 13px;
  font-weight: 600;
  margin-top: 2px;
}

.bets-row__status {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.bets-row__status--won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bets-row__status--lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.bets-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bets-row__delete {
  background: none;
  border: none;
  color: var(--cm-text-muted);
  cursor: pointer;
  display: flex;
  padding: 4px;
}

.bets-row__delete:hover {
  color: var(--cm-danger);
}

@media (max-width: 700px) {
  .bets-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
