<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import BetsPerformanceView from '@/views/BetsPerformanceView.vue';
import BetsTicketsView from '@/views/BetsTicketsView.vue';
import { formatDay, formatPercent } from '@/utils/format.js';
import { marketBreakdownLabel } from '@/utils/betTrends.js';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { usePredictionSettlement } from '@/composables/usePredictionSettlement.js';

const route = useRoute();
const predictionsStore = usePredictionsStore();
const betsStore = useBetsStore();
const matchesStore = useMatchesStore();
const teamStatsModalStore = useTeamStatsModalStore();
const matchAiAnalysisStore = useMatchAiAnalysisStore();
const { settling, settleMatch } = usePredictionSettlement();

// "Performance paris" et "Mes tickets" sont des modules autonomes (store/état
// propres) — intégrés ici comme de simples onglets plutôt que des pages
// séparées, même principe que Statistiques ligue dans Matchs : l'onglet
// prioritaire (moteur) reste le défaut, les autres s'ouvrent au clic.
const TABS = [
  { value: 'moteur', label: 'Historique moteur' },
  { value: 'performance', label: 'Performance paris' },
  { value: 'tickets', label: 'Mes tickets' }
];
const activeTab = ref(TABS.some((t) => t.value === route.query.onglet) ? route.query.onglet : 'moteur');

// Le pronostic du moteur pour CHAQUE match scanné (pas seulement les value
// bets), journalisé depuis la page Mes paris — sert à mesurer le taux de
// réussite général du moteur. "Correct" = l'issue pronostiquée (cote la
// plus basse) a bien eu lieu.
const predictionDailySummaries = computed(() => {
  const byDay = new Map();
  for (const entry of predictionsStore.entries) {
    if (!byDay.has(entry.day)) byDay.set(entry.day, { day: entry.day, total: 0, correct: 0, incorrect: 0, pending: 0, void: 0 });
    const d = byDay.get(entry.day);
    d.total++;
    d[entry.status]++;
  }
  return [...byDay.values()]
    .map((entry) => {
      const settled = entry.correct + entry.incorrect;
      return {
        ...entry,
        settled,
        hitRate: settled > 0 ? (entry.correct / settled) * 100 : null,
        failRate: settled > 0 ? (entry.incorrect / settled) * 100 : null
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
});

const predictionSummary = computed(() => {
  if (predictionsStore.entries.length === 0) return null;
  const activeDays = predictionDailySummaries.value.length;
  const settled = predictionsStore.entries.filter((e) => e.status === 'correct' || e.status === 'incorrect');
  if (settled.length === 0) {
    return `${predictionsStore.entries.length} match(s) scanné(s) sur ${activeDays} jour(s), aucun résultat réglé pour l'instant.`;
  }
  const correctCount = predictionsStore.entries.filter((e) => e.status === 'correct').length;
  const hitRate = (correctCount / settled.length) * 100;
  return `Sur ${activeDays} jour(s) : ${correctCount} pronostic(s) correct(s) / ${settled.length} réglé(s) — taux de réussite du moteur ${hitRate.toFixed(0)}% (échec ${(100 - hitRate).toFixed(0)}%).`;
});

// Un taux de réussite élevé peut être trompeur si les cotes prises sont trop
// basses (cf. Cas 1 : 80% de réussite mais perte nette sur des cotes à 1.1) —
// le Yield, calculé sur une mise fixe simulée avec la cote réelle du modèle
// (predictedOdds, déjà journalisée par prédiction), mesure la rentabilité
// réelle plutôt que la seule fréquence de succès. Aucune mise réelle n'est
// engagée ici — seulement Historique moteur, purement indicatif ; les vraies
// mises/retours du carnet sont dans Performance paris.
const SIMULATED_STAKE = 10;

// Taux de réussite ET Yield simulé PAR MARCHÉ (toutes journées confondues) —
// permet de voir par exemple que "Total buts" (Plus de 2.5 buts) a son propre
// taux/yield, distinct du taux global qui mélange tous les marchés.
const marketBreakdown = computed(() => {
  const byMarket = new Map();
  for (const entry of predictionsStore.entries) {
    // Regroupe équipe par équipe sous une catégorie globale, ET distingue la
    // ligne de buts (0.5/1.5/2.5/3.5) déjà présente dans le libellé — un
    // "Plus de 0.5" et un "Plus de 2.5" n'ont pas du tout la même
    // probabilité, les mélanger fausserait le taux de réussite.
    const label = marketBreakdownLabel(entry.market, entry.predictedLabel);
    if (!byMarket.has(label)) byMarket.set(label, { market: label, total: 0, correct: 0, incorrect: 0, pending: 0, void: 0, staked: 0, returned: 0 });
    const m = byMarket.get(label);
    m.total++;
    m[entry.status]++;
    if (entry.status === 'correct' || entry.status === 'incorrect') {
      m.staked += SIMULATED_STAKE;
      m.returned += entry.status === 'correct' ? SIMULATED_STAKE * entry.predictedOdds : 0;
    }
  }
  return [...byMarket.values()]
    .map((m) => {
      const settled = m.correct + m.incorrect;
      return {
        ...m,
        settled,
        hitRate: settled > 0 ? (m.correct / settled) * 100 : null,
        failRate: settled > 0 ? (m.incorrect / settled) * 100 : null,
        yieldPercent: m.staked > 0 ? ((m.returned - m.staked) / m.staked) * 100 : null
      };
    })
    .sort((a, b) => b.total - a.total);
});

// Ligne de synthèse tout en bas du tableau par marché : Σ des comptages
// (total/corrects/incorrects/en attente/mises/retours simulés) et un taux ET
// un yield RECALCULÉS sur ces sommes — jamais une moyenne par marché, qui
// pondérerait un marché à 2 prédictions autant qu'un marché à 50.
const marketBreakdownTotal = computed(() => {
  const total = marketBreakdown.value.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      correct: acc.correct + m.correct,
      incorrect: acc.incorrect + m.incorrect,
      pending: acc.pending + m.pending,
      staked: acc.staked + m.staked,
      returned: acc.returned + m.returned
    }),
    { total: 0, correct: 0, incorrect: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.correct + total.incorrect;
  return {
    ...total,
    hitRate: settled > 0 ? (total.correct / settled) * 100 : null,
    failRate: settled > 0 ? (total.incorrect / settled) * 100 : null,
    yieldPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null
  };
});

// Regroupement par match — sert à saisir le score final UNE SEULE FOIS par
// match plutôt que de cliquer Correct/Incorrect sur chaque marché un par un.
const entryGroups = computed(() => {
  const map = new Map();
  for (const entry of predictionsStore.entries) {
    if (!map.has(entry.matchId)) {
      map.set(entry.matchId, { matchId: entry.matchId, homeName: entry.homeName, awayName: entry.awayName, league: entry.league, day: entry.day, entries: [] });
    }
    map.get(entry.matchId).entries.push(entry);
  }
  return [...map.values()];
});

// Un match dont TOUS les marchés sont réglés (plus aucun "pending") n'a plus
// besoin d'action de l'utilisateur — il sort de la liste par défaut, comme
// le carnet de paris (pas d'affichage continu de ce qui est déjà traité),
// mais reste trouvable via la recherche plutôt que supprimé.
const predictionsSearchQuery = ref('');
const visibleEntryGroups = computed(() => {
  const query = predictionsSearchQuery.value.trim().toLowerCase();
  if (!query) return entryGroups.value.filter((group) => group.entries.some((e) => e.status === 'pending'));
  return entryGroups.value.filter(
    (group) =>
      group.homeName.toLowerCase().includes(query) ||
      group.awayName.toLowerCase().includes(query) ||
      (group.league ?? '').toLowerCase().includes(query) ||
      group.entries.some((e) => e.market.toLowerCase().includes(query) || e.predictedLabel.toLowerCase().includes(query))
  );
});

// Regroupé par championnat — même principe que Matchs et Mes paris, sinon
// les dizaines de matchs en attente de réglage s'affichent tous d'un coup.
const groupedByLeague = computed(() => {
  const byLeague = new Map();
  for (const group of visibleEntryGroups.value) {
    const leagueKey = group.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(group);
  }
  return [...byLeague.entries()].map(([league, groups]) => ({ league, groups }));
});

// Vide par défaut : tous les championnats démarrent fermés, comme dans
// Matchs et Mes paris.
const expandedLeagues = ref(new Set());

function toggleLeague(league) {
  const next = new Set(expandedLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  expandedLeagues.value = next;
}

// Une recherche active doit révéler ses résultats même dans un championnat
// resté fermé — sinon la recherche semblerait ne rien trouver.
function isLeagueOpen(league) {
  return Boolean(predictionsSearchQuery.value.trim()) || expandedLeagues.value.has(league);
}

const scores = reactive({}); // matchId -> { home, away }

function getScore(matchId) {
  if (!scores[matchId]) scores[matchId] = { home: null, away: null };
  return scores[matchId];
}

function onScoreInput(matchId, side, event) {
  const raw = event.target.value;
  getScore(matchId)[side] = raw === '' ? null : Number(raw);
}

// Compte par statut pour le résumé compact de chaque match (le détail
// marché-par-marché vit désormais sur sa propre page, cf. "Voir le détail").
function countByStatus(group, status) {
  return group.entries.filter((e) => e.status === status).length;
}

// Les pronostics n'ont pas leur propre horodatage de coup d'envoi (seulement
// un jour "day") — on le retrouve via matchesStore, déjà chargé pour la
// résolution de compo ci-dessous. Absent (match hors de la fenêtre de l'Odds
// API, ex. très ancien) : pas de badge plutôt qu'un statut deviné.
function matchKickoff(matchId) {
  return matchesStore.matches.find((m) => m.matchId === matchId)?.commenceTime ?? null;
}

onMounted(() => {
  predictionsStore.fetchPredictions();
  betsStore.fetchBets();
  matchAiAnalysisStore.fetchAll();
  // Nécessaire pour que le clic sur une équipe puisse résoudre la compo en
  // direct (teamStatsModalStore croise le matchId avec matchesStore) — sans
  // ça, arriver ici directement (sans passer par Matchs/Mes paris avant)
  // laisserait matchesStore vide et la compo semblerait à tort indisponible.
  if (matchesStore.matches.length === 0) matchesStore.fetchMatches();
  // `scores` ne contenait jusqu'ici que ce que l'utilisateur tape dans la
  // session en cours — un match déjà réglé retrouvé via la recherche
  // affichait donc des champs "Score final" vides au lieu du vrai résultat
  // enregistré. Pré-rempli ici une seule fois depuis match-results.json.
  matchResultsApi
    .list()
    .then(({ results }) => {
      for (const result of results) {
        scores[result.matchId] = { home: result.homeGoals, away: result.awayGoals };
      }
    })
    .catch(() => {});
});
</script>

<template>
  <div class="predictions-history-view">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
    <BetsPerformanceView v-if="activeTab === 'performance'" key="performance" />
    <BetsTicketsView v-else-if="activeTab === 'tickets'" key="tickets" />

    <div v-else key="moteur" class="predictions-history-view__default">
    <AppCard
      title="Historique — Pronostics du moteur"
      subtitle="Résultat, total buts, les 2 équipes marquent, buts par équipe — moyenne générale sur tous les matchs scannés"
    >
      <template #actions>
        <AppButton variant="secondary" size="sm" :loading="predictionsStore.loading" @click="predictionsStore.fetchPredictions">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          Actualiser
        </AppButton>
      </template>

      <p v-if="predictionSummary" class="cm-text-secondary performance-summary performance-summary--main">{{ predictionSummary }}</p>
      <p v-else class="cm-text-muted performance-summary">
        Aucun match scanné pour l'instant — lance un scan depuis <RouterLink to="/paris">Mes paris</RouterLink>.
      </p>

      <h3 class="daily-table__subheading">
        Taux de réussite par marché <span class="cm-text-muted">(toutes journées confondues)</span>
      </h3>
      <div class="daily-table-scroll">
        <table class="daily-table">
          <thead>
            <tr>
              <th>Marché</th>
              <th>Prédictions</th>
              <th>Corrects</th>
              <th>Incorrects</th>
              <th>En attente</th>
              <th>Taux de réussite</th>
              <th>Taux d'échec</th>
              <th>Yield <span class="cm-text-muted">(simulé, mise 10€)</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!marketBreakdown.length">
              <td colspan="8" class="daily-table__empty cm-text-muted">Aucune donnée pour l'instant.</td>
            </tr>
            <tr v-for="m in marketBreakdown" :key="m.market">
              <td class="daily-table__day">{{ m.market }}</td>
              <td class="cm-numeric">{{ m.total }}</td>
              <td class="cm-numeric cm-positive">{{ m.correct || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ m.incorrect || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ m.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ m.hitRate === null ? '—' : `${m.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ m.failRate === null ? '—' : `${m.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(m.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ m.yieldPercent === null ? '—' : formatPercent(m.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
            <tr v-if="marketBreakdown.length" class="daily-table__total">
              <td class="daily-table__day">Tous marchés</td>
              <td class="cm-numeric">{{ marketBreakdownTotal.total }}</td>
              <td class="cm-numeric cm-positive">{{ marketBreakdownTotal.correct || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.incorrect || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ marketBreakdownTotal.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ marketBreakdownTotal.hitRate === null ? '—' : `${marketBreakdownTotal.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.failRate === null ? '—' : `${marketBreakdownTotal.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(marketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ marketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(marketBreakdownTotal.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>

    <AppCard :padded="false" title="">
      <div class="predictions-search">
        <AppTextField v-model="predictionsSearchQuery" placeholder="Rechercher un match réglé (équipe, marché, pick)…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>

      <EmptyState
        v-if="predictionsStore.entries.length === 0"
        icon="target"
        title="Aucun match scanné"
        description="Va sur la page Mes paris et clique sur « Charger les value bets » pour lancer un scan."
      />
      <EmptyState
        v-else-if="visibleEntryGroups.length === 0 && predictionsSearchQuery.trim()"
        icon="search"
        title="Aucun résultat"
        :description="`Aucun match ne correspond à «${predictionsSearchQuery.trim()}».`"
      />
      <EmptyState
        v-else-if="visibleEntryGroups.length === 0"
        icon="target"
        title="Aucun match en attente"
        description="Tous les matchs scannés sont réglés — recherche un match précis ci-dessus pour le retrouver."
      />
      <div v-else class="match-groups">
        <div v-for="leagueGroup in groupedByLeague" :key="leagueGroup.league" class="league-group">
          <div
            class="league-group__header"
            role="button"
            tabindex="0"
            @click="toggleLeague(leagueGroup.league)"
            @keydown.enter="toggleLeague(leagueGroup.league)"
          >
            <LeagueBadge :league="leagueGroup.league" />
            <span class="cm-text-muted cm-numeric league-group__count">{{ leagueGroup.groups.length }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="league-group__chevron"
              :class="{ 'league-group__chevron--open': isLeagueOpen(leagueGroup.league) }"
            />
          </div>

          <template v-if="isLeagueOpen(leagueGroup.league)">
        <div v-for="group in leagueGroup.groups" :key="group.matchId" class="match-group">
          <div class="match-group__header">
            <div class="match-group__title">
              <p class="match-group__match cm-truncate">
                <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(group.homeName, group.league, group.matchId)">{{ group.homeName }}</button>
                vs
                <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(group.awayName, group.league, group.matchId)">{{ group.awayName }}</button>
              </p>
              <p class="cm-text-muted match-group__meta cm-truncate">
                {{ formatDay(group.day) }}
                <MatchStatusBadge :commence-time="matchKickoff(group.matchId)" class="match-group__status-badge" />
                <span v-if="matchAiAnalysisStore.byMatchId[group.matchId]" class="match-group__ai-badge" title="Analyse IA disponible pour ce match">
                  <AppIcon name="bolt" :size="9" />IA
                </span>
              </p>
            </div>
            <div class="match-group__score">
              <span class="cm-text-muted match-group__score-label">Score final</span>
              <input
                type="number"
                min="0"
                class="score-input"
                :value="getScore(group.matchId).home"
                placeholder="0"
                @input="onScoreInput(group.matchId, 'home', $event)"
              />
              <span class="cm-text-muted">-</span>
              <input
                type="number"
                min="0"
                class="score-input"
                :value="getScore(group.matchId).away"
                placeholder="0"
                @input="onScoreInput(group.matchId, 'away', $event)"
              />
              <AppButton
                variant="secondary"
                size="sm"
                :loading="settling[group.matchId]"
                :disabled="getScore(group.matchId).home === null || getScore(group.matchId).away === null"
                @click="settleMatch(group)"
              >
                Régler
              </AppButton>
            </div>
          </div>

          <div class="match-group__summary">
            <span class="cm-text-muted cm-numeric">{{ group.entries.length }} pronostic(s)</span>
            <span v-if="countByStatus(group, 'correct')" class="cm-positive cm-numeric">{{ countByStatus(group, 'correct') }} correct(s)</span>
            <span v-if="countByStatus(group, 'incorrect')" class="cm-negative cm-numeric">{{ countByStatus(group, 'incorrect') }} incorrect(s)</span>
            <span v-if="countByStatus(group, 'pending')" class="cm-text-muted cm-numeric">{{ countByStatus(group, 'pending') }} en attente</span>
            <RouterLink :to="`/historique-moteur/${group.matchId}`" class="match-group__detail-link">
              Voir le détail <AppIcon name="chevronRight" :size="12" />
            </RouterLink>
          </div>
        </div>
          </template>
        </div>
      </div>
    </AppCard>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.predictions-history-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.predictions-history-view__default {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.performance-summary {
  font-size: 12.5px;
  margin-bottom: 14px;
}

.performance-summary--main {
  font-size: 14px;
  font-weight: 600;
}

.daily-table-scroll {
  overflow-x: auto;
}

.daily-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.daily-table th,
.daily-table td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.daily-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.daily-table th:first-child,
.daily-table td:first-child {
  text-align: left;
}

.daily-table__day {
  font-weight: 600;
  text-transform: capitalize;
}

.daily-table__empty {
  text-align: center !important;
  padding: 20px 10px;
}

.daily-table tbody tr:last-child td {
  border-bottom: none;
}

.daily-table__total td {
  border-top: 2px solid var(--cm-border);
  font-weight: 700;
}

.daily-table__subheading {
  font-size: 12px;
  font-weight: 700;
  margin: 18px 0 10px;
}

.predictions-search {
  padding: 14px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.match-groups {
  display: flex;
  flex-direction: column;
}

.league-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.league-group:last-child {
  border-bottom: none;
}

.league-group__header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 16px;
  background: var(--cm-surface-alt);
  border: none;
  cursor: pointer;
  text-align: left;
}

.league-group__count {
  font-size: 11px;
}

.league-group__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.league-group__chevron--open {
  transform: rotate(-90deg);
}

.match-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.match-group:last-child {
  border-bottom: none;
}

.match-group__ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.match-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--cm-surface-alt);
}

.match-group__title {
  min-width: 0;
}

.match-group__match {
  font-size: 13.5px;
  font-weight: 700;
}

.match-group__meta {
  font-size: 11px;
  margin-top: 2px;
}

.match-group__status-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.match-group__score {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.match-group__score-label {
  font-size: 11px;
  margin-right: 2px;
}

.score-input {
  width: 44px;
  padding: 5px 6px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font-size: 13px;
  text-align: center;
}

.score-input::-webkit-inner-spin-button,
.score-input::-webkit-outer-spin-button {
  opacity: 1;
}

.match-group__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 10px 16px;
  font-size: 12px;
}

.match-group__detail-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  font-weight: 600;
  color: var(--cm-accent);
}

.match-group__detail-link:hover {
  color: var(--cm-accent-strong);
}

@media (max-width: 960px) {
  .match-group__header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
