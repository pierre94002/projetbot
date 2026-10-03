<script setup>
import { computed, reactive, onMounted } from 'vue';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { usePredictionSettlement } from '@/composables/usePredictionSettlement.js';
import AppCard from '@/components/common/AppCard.vue';
import BackButton from '@/components/common/BackButton.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import MatchAiAnalysisPanel from '@/components/analysis/MatchAiAnalysisPanel.vue';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { formatOdds, formatDay } from '@/utils/format.js';

/**
 * Le détail d'un match de l'Historique moteur : la rencontre et son score
 * final (saisi ici, puis réglé), chaque pronostic du moteur avec son issue,
 * et l'analyse de l'IA avant / après le match. Dessin refait le 02/10/2026
 * sur le modèle de l'onglet Analyse IA (bandeau teinté, cartes, pastilles) ;
 * les données et les actions sont celles d'avant.
 */
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

// ---- présentation (refonte du 02/10/2026) ---------------------------------
// Le bilan des pronostics de ce match, en puces dans l'en-tête de la carte.
const bilan = computed(() => {
  const b = { correct: 0, incorrect: 0, pending: 0, void: 0 };
  for (const e of group.value?.entries ?? []) if (b[e.status] !== undefined) b[e.status]++;
  return b;
});

// L'icône et le ton d'un pronostic d'après son statut : juste en vert, faux
// en rouge, annulé ou en attente en gris (couleurs sémantiques, jamais celle
// de la section).
const STATUTS = {
  correct: { icone: 'check', ton: 'is-accent' },
  incorrect: { icone: 'x', ton: 'is-danger' },
  void: { icone: 'minus', ton: 'is-muted' },
  pending: { icone: 'clock', ton: 'is-muted' }
};
const statutDe = (entry) => STATUTS[entry.status] ?? STATUTS.pending;

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
  <div class="cm-page pmd">
    <BackButton fallback="/historique-moteur" />

    <EmptyState
      v-if="!group"
      icon="target"
      title="Match introuvable"
      description="Ce match ne fait partie d'aucun pronostic enregistré, ou les données sont encore en cours de chargement."
    />

    <template v-else>
      <!-- 1. LE BANDEAU : la rencontre, son score final (saisi ici) et son règlement. -->
      <section class="cm-hero pmd-hero">
        <div class="cm-hero__top">
          <span class="cm-eyebrow pmd-hero__eyebrow"><AppIcon name="history" :size="12" />Historique moteur</span>
          <span class="cm-hero__chips">
            <span class="cm-chip pmd-hero__league"><LeagueBadge :league="group.league" /></span>
            <span class="cm-chip"><AppIcon name="calendar" :size="11" />{{ formatDay(group.day) }}</span>
            <MatchStatusBadge :commence-time="matchKickoff()" class="pmd-hero__status" />
          </span>
        </div>

        <div class="pmd-matchup">
          <div class="pmd-team is-home">
            <TeamCrest :name="group.homeName" :league="group.league" :size="48" />
            <button type="button" class="cm-team-link pmd-team__name" @click="teamStatsModalStore.openFor(group.homeName, group.league, group.matchId)">{{ group.homeName }}</button>
          </div>

          <div class="pmd-score">
            <span class="pmd-score__label">Score final</span>
            <div class="pmd-score__board">
              <input
                type="number"
                min="0"
                class="pmd-score__input"
                :value="getScore(matchId).home"
                placeholder="0"
                @input="onScoreInput('home', $event)"
              />
              <span class="pmd-score__dash">-</span>
              <input
                type="number"
                min="0"
                class="pmd-score__input"
                :value="getScore(matchId).away"
                placeholder="0"
                @input="onScoreInput('away', $event)"
              />
            </div>
            <AppButton
              variant="section"
              size="sm"
              :loading="settling[matchId]"
              :disabled="getScore(matchId).home === null || getScore(matchId).away === null"
              @click="settleMatch(group, getScore(matchId))"
            >
              <AppIcon name="check" :size="14" />
              Régler
            </AppButton>
          </div>

          <div class="pmd-team is-away">
            <TeamCrest :name="group.awayName" :league="group.league" :size="48" />
            <button type="button" class="cm-team-link pmd-team__name" @click="teamStatsModalStore.openFor(group.awayName, group.league, group.matchId)">{{ group.awayName }}</button>
          </div>
        </div>

        <p v-if="hasResult" class="cm-hero__subtitle pmd-hero__hint">Score saisi : « Régler » juge chaque pronostic du moteur et ouvre l'analyse après-match.</p>
        <p v-else class="cm-hero__subtitle pmd-hero__hint">Saisissez le score final pour régler les pronostics du moteur et permettre l'analyse après-match.</p>
      </section>

      <!-- 2. LES PRONOSTICS DU MOTEUR, un par marché, avec leur issue et leurs actions. -->
      <AppCard title="Pronostics de ce match" :subtitle="`${group.entries.length} marché(s) suivi(s) par le moteur`" icon="target" eyebrow="Le moteur">
        <!-- Le bilan d'un coup d'œil, avant la liste. -->
        <div class="pmd-bilan">
          <span v-if="bilan.correct" class="cm-chip is-accent"><AppIcon name="check" :size="11" />{{ bilan.correct }} juste{{ bilan.correct > 1 ? 's' : '' }}</span>
          <span v-if="bilan.incorrect" class="cm-chip is-danger"><AppIcon name="x" :size="11" />{{ bilan.incorrect }} faux</span>
          <span v-if="bilan.pending" class="cm-chip"><AppIcon name="clock" :size="11" />{{ bilan.pending }} en attente</span>
          <span v-if="bilan.void" class="cm-chip"><AppIcon name="minus" :size="11" />{{ bilan.void }} annulé{{ bilan.void > 1 ? 's' : '' }}</span>
        </div>

        <div class="pmd-picks cm-stagger">
          <article v-for="entry in group.entries" :key="entry.id" class="pmd-pick" :class="`is-${entry.status}`">
            <span class="cm-icon-box" :class="statutDe(entry).ton"><AppIcon :name="statutDe(entry).icone" :size="16" /></span>

            <div class="pmd-pick__what">
              <span class="pmd-pick__market">
                <span class="cm-truncate">{{ entry.market }}</span>
                <span v-if="entry.market === 'Résultat' && entry.action === 'RECOMMENDED'" class="cm-chip is-accent pmd-pick__value">value bet</span>
              </span>
              <span class="pmd-pick__label">
                <PickCrest :item="entry" :home="group.homeName" :away="group.awayName" :league="group.league" :size="18" />
                <span class="cm-truncate">{{ entry.predictedLabel }}</span>
              </span>
            </div>

            <span class="cm-pill is-section pmd-pick__odds" title="Cote du pronostic">@ {{ formatOdds(entry.predictedOdds) }}</span>

            <span class="pmd-pick__status">{{ PREDICTION_STATUS_LABELS[entry.status] }}</span>

            <div class="pmd-pick__actions">
              <template v-if="entry.status === 'pending'">
                <AppButton variant="ghost" size="sm" class="is-ok" @click="setPredictionStatus(entry, 'correct')"><AppIcon name="check" :size="13" />Correct</AppButton>
                <AppButton variant="ghost" size="sm" class="is-ko" @click="setPredictionStatus(entry, 'incorrect')"><AppIcon name="x" :size="13" />Incorrect</AppButton>
                <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'void')"><AppIcon name="minus" :size="13" />Annulé</AppButton>
              </template>
              <AppButton v-else variant="ghost" size="sm" @click="setPredictionStatus(entry, 'pending')"><AppIcon name="refresh" :size="13" />Réouvrir</AppButton>
              <button type="button" class="pmd-pick__delete" title="Supprimer" @click="removePrediction(entry)">
                <AppIcon name="x" :size="14" />
              </button>
            </div>
          </article>
        </div>
      </AppCard>

      <!-- 3. L'ANALYSE DE L'IA : la lecture d'avant-match, puis le bilan une fois le score réglé. -->
      <AppCard title="Analyse IA" icon="sparkles" eyebrow="Avant et après le match" subtitle="La lecture de l'IA avant le match, puis son bilan marché par marché une fois le score saisi.">
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
/* ------------------------------------------------------------- bandeau */
.pmd-hero {
  /* Se règle sur SA largeur : page large ou fenêtre étroite. */
  container: pmdhero / inline-size;
}

.pmd-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* La compétition (drapeau + nom) dans une puce : son nom au calibre des puces. */
.pmd-hero__league {
  padding: 2px 10px 2px 4px;
}

.pmd-hero__league :deep(.league-badge__name) {
  font-size: 11.5px;
}

.pmd-hero__status {
  align-self: center;
}

/* La rencontre : l'équipe qui reçoit, le tableau de score, l'autre équipe. */
.pmd-matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
}

.pmd-team {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.pmd-team.is-home {
  flex-direction: row-reverse;
  text-align: right;
}

.pmd-team__name {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--cm-text-primary);
}

/* Le score final, saisi comme sur un tableau d'affichage. */
.pmd-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.pmd-score__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.pmd-score__board {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pmd-score__dash {
  font-size: 22px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

.pmd-score__input {
  width: 58px;
  height: 52px;
  padding: 0;
  text-align: center;
  border-radius: var(--cm-radius);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.3);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  appearance: textfield;
  -moz-appearance: textfield;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.pmd-score__input::-webkit-outer-spin-button,
.pmd-score__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pmd-score__input::placeholder {
  color: var(--cm-text-muted);
}

.pmd-score__input:focus {
  outline: none;
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.2);
}

.pmd-hero__hint {
  font-size: 12px;
}

/* ---------------------------------------------------------- pronostics */
.pmd-bilan {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.pmd-bilan:empty {
  display: none;
}

.pmd-picks {
  container: pmdpicks / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.pmd-pick {
  --ton: var(--cm-text-muted);
  --ton-doux: var(--cm-surface-hover);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.pmd-pick:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

/* Le liseré de gauche dit l'issue : vert juste, rouge faux. */
.pmd-pick.is-correct {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
  box-shadow: inset 3px 0 0 var(--cm-accent);
}

.pmd-pick.is-incorrect {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
  box-shadow: inset 3px 0 0 var(--cm-danger);
}

.pmd-pick__what {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pmd-pick__market {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.pmd-pick__value {
  padding: 1px 8px;
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}

.pmd-pick__label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cm-text-primary);
}

.pmd-pick__odds {
  font-size: 13px;
}

.pmd-pick__status {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--ton-doux);
  color: var(--ton);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.pmd-pick__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.pmd-pick__actions .is-ok {
  color: var(--cm-accent);
}

.pmd-pick__actions .is-ko {
  color: var(--cm-danger);
}

.pmd-pick__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 4px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--cm-text-muted);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.pmd-pick__delete:hover {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* ------------------------------------------------------ panneau étroit */
@container pmdhero (max-width: 560px) {
  .pmd-matchup {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 14px;
  }

  .pmd-team.is-home {
    flex-direction: row;
    text-align: left;
  }
}

@container pmdpicks (max-width: 720px) {
  .pmd-pick {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px 12px;
  }

  .pmd-pick__status {
    grid-column: 2;
    justify-self: start;
  }

  .pmd-pick__actions {
    grid-column: 2 / -1;
  }
}
</style>
