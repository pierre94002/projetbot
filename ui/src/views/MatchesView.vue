<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useAnalysisStore } from '@/stores/analysisStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchesTable from '@/components/matches/MatchesTable.vue';
import AnalysisResultPanel from '@/components/analysis/AnalysisResultPanel.vue';
import SafestPicksSummary from '@/components/analysis/SafestPicksSummary.vue';
import AppModal from '@/components/common/AppModal.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import MatchesFilterBar from '@/components/matches/MatchesFilterBar.vue';
import StandingsTable from '@/components/matches/StandingsTable.vue';
import TeamStatsView from '@/views/TeamStatsView.vue';
import TeamSquadView from '@/views/TeamSquadView.vue';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { standingsApi } from '@/services/standingsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';

const props = defineProps({ matchId: { type: String, default: null } });

const route = useRoute();
const router = useRouter();
const matchesStore = useMatchesStore();
const analysisStore = useAnalysisStore();
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();

// "Statistiques ligue" et "Compo & joueurs" sont des modules autonomes
// (store/API/état propres) — intégrés ici comme de simples onglets plutôt
// que des pages séparées, pour regrouper tout ce qui concerne les
// matchs/statistiques à un seul endroit.
const TABS = [
  { value: 'matches', label: 'Matchs' },
  { value: 'stats', label: 'Statistiques ligue' },
  { value: 'squad', label: 'Compo & joueurs' }
];
// Onglet initial lu depuis ?vue=... s'il est valide (lien partagé/rechargement
// de page) — sinon "Matchs" par défaut, comme avant l'ajout du reflet d'URL.
const activeTab = ref(TABS.some((t) => t.value === route.query.onglet) ? route.query.onglet : 'matches');

const searchQuery = ref('');
const leagueQuery = ref('');
const dateFilter = ref('all'); // 'all' | 'today' | 'week' | 'YYYY-MM-DD'
const standings = ref(null); // { league, loading, error, rows }
const averagesComparison = ref(null); // { homeName, awayName, homeTeamId, loading, error, teams }
const liveMatchDetails = ref(null); // { loading, error, data }

function toDateKey(isoString) {
  return isoString?.slice(0, 10) ?? null;
}

// Matchs filtrés par recherche équipe/championnat SEULEMENT (pas encore par
// date) : sert de base à la fois à la liste affichée et aux dates
// disponibles dans le sélecteur, pour que ce dernier ne propose que les
// dates du championnat/de l'équipe actuellement recherché(e).
const searchFilteredMatches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const leagueSearch = leagueQuery.value.trim().toLowerCase();

  return matchesStore.matches.filter((match) => {
    const matchesQuery =
      !query || match.home.toLowerCase().includes(query) || match.away.toLowerCase().includes(query);
    if (!matchesQuery) return false;

    return !leagueSearch || (match.league ?? '').toLowerCase().includes(leagueSearch);
  });
});

const availableDates = computed(() => [...new Set(searchFilteredMatches.value.map((m) => toDateKey(m.commenceTime)).filter(Boolean))].sort());

const filteredMatches = computed(() => {
  const today = toDateKey(new Date().toISOString());
  const weekAhead = toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  return searchFilteredMatches.value.filter((match) => {
    const matchDate = toDateKey(match.commenceTime);
    if (dateFilter.value === 'all') return true;
    if (dateFilter.value === 'today') return matchDate === today;
    if (dateFilter.value === 'week') return matchDate >= today && matchDate <= weekAhead;
    return matchDate === dateFilter.value;
  });
});

async function loadMatches() {
  await matchesStore.fetchMatches();
  if (props.matchId) {
    const stillExists = matchesStore.matches.some((m) => m.matchId === props.matchId);
    if (stillExists) selectMatch(props.matchId, { skipNavigate: true });
  }
}

async function selectMatch(matchId, { skipNavigate = false } = {}) {
  if (!skipNavigate) router.push(`/matches/${matchId}`);
  averagesComparison.value = null;
  liveMatchDetails.value = null;
  try {
    await analysisStore.analyzeMatchById(matchId, matchesStore.source, matchesStore.bankroll);
  } catch (error) {
    toastStore.error(`Analyse impossible : ${error.message}`);
  }
}

async function handleLoadForm() {
  try {
    await matchesStore.loadForm();
  } catch (error) {
    toastStore.error(`Récupération des formes impossible : ${error.message}`);
  }
}

function handleTeamClick({ name, league, matchId }) {
  teamStatsModalStore.openFor(name, league, matchId);
}

/**
 * Récupère les moyennes des DEUX équipes qui s'affrontent et les affiche en
 * comparaison (réutilise MatchStatsPanel, conçu pour comparer deux jeux de
 * statistiques). Chaque équipe est résolue indépendamment (Promise.allSettled) :
 * si l'une échoue (ex. quota API épuisé), l'autre s'affiche quand même.
 */
async function handleCompareAverages({ homeName, awayName, league }) {
  averagesComparison.value = { homeName, awayName, homeTeamId: null, loading: true, error: null, teams: [] };

  const [homeResult, awayResult] = await Promise.allSettled([
    teamStatsApi.getAverageStatsByName(homeName, league),
    teamStatsApi.getAverageStatsByName(awayName, league)
  ]);

  const teams = [];
  let error = null;
  let homeTeamId = null;

  if (homeResult.status === 'fulfilled') {
    homeTeamId = homeResult.value.teamId;
    teams.push({ teamId: homeResult.value.teamId, teamName: homeResult.value.teamName, stats: homeResult.value.stats?.averages ?? {} });
  } else {
    error = homeResult.reason.message;
  }

  if (awayResult.status === 'fulfilled') {
    teams.push({ teamId: awayResult.value.teamId, teamName: awayResult.value.teamName, stats: awayResult.value.stats?.averages ?? {} });
  } else {
    error = error ?? awayResult.reason.message;
  }

  averagesComparison.value = { homeName, awayName, homeTeamId, loading: false, error, teams };
}

/**
 * Score + stats en direct — action explicite (coûte un appel API-Football),
 * même principe que "Moyennes des deux équipes". Renvoie toujours
 * `available: false` avec une raison plutôt qu'une erreur tant que le plan
 * actuel ne couvre pas la saison en cours (cf. resolveLiveMatchDetails côté
 * serveur) — ça débloquera de soi-même dès le passage sur un plan sans cette
 * limite, sans changement de code ici.
 */
async function handleShowLiveMatch({ homeName, commenceTime }) {
  liveMatchDetails.value = { loading: true, error: null, data: null };
  try {
    const data = await teamStatsApi.getLiveMatchByName(homeName, commenceTime);
    liveMatchDetails.value = { loading: false, error: null, data };
  } catch (error) {
    liveMatchDetails.value = { loading: false, error: error.message, data: null };
  }
}

function handleDeselect() {
  analysisStore.clear();
  averagesComparison.value = null;
  liveMatchDetails.value = null;
  router.replace({ path: '/matches', query: route.query });
}

async function handleViewStandings(league) {
  standings.value = { league, loading: true, error: null, rows: [] };
  try {
    const result = await standingsApi.get(league);
    standings.value = { league: result.leagueName ?? league, loading: false, error: null, rows: result.rows };
  } catch (error) {
    standings.value = { league, loading: false, error: error.message, rows: [] };
  }
}

watch(
  () => matchesStore.source,
  () => {
    analysisStore.clear();
    router.replace({ path: '/matches', query: route.query });
    loadMatches();
  }
);

onMounted(() => {
  if (!sourcesStore.sources.length) sourcesStore.fetchSources();
  loadMatches();
});
</script>

<template>
  <div class="matches-view">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
    <TeamStatsView v-if="activeTab === 'stats'" key="stats" />
    <TeamSquadView v-else-if="activeTab === 'squad'" key="squad" />

    <div v-else key="matches" class="matches-view__default">
    <AppCard padded>
      <div class="matches-view__controls">
        <AppSelect v-model="matchesStore.source" label="Source de données" :options="sourcesStore.options" />
        <AppTextField v-model="searchQuery" label="Recherche" placeholder="Équipe…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
        <AppTextField v-model="leagueQuery" label="Championnat" placeholder="Ex. La Liga…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
        <AppButton variant="secondary" :loading="matchesStore.loading" @click="loadMatches">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          Actualiser
        </AppButton>
      </div>
      <div class="matches-view__secondary-actions">
        <AppButton variant="ghost" size="sm" :loading="matchesStore.loadingForm" @click="handleLoadForm">
          <template #icon><AppIcon name="trendUp" :size="14" /></template>
          Charger les formes (API-Football)
        </AppButton>
        <span class="cm-text-muted matches-view__hint">Coûte jusqu'à 2 appels API par équipe unique de la liste — mis en cache.</span>
      </div>
    </AppCard>

    <div class="matches-view__layout">
      <div class="matches-view__list-column">
        <AppCard :padded="false" title="" class="matches-view__list">
          <div class="matches-view__filter-bar">
            <MatchesFilterBar v-model="dateFilter" :available-dates="availableDates" />
          </div>
          <LoadingSpinner v-if="matchesStore.loading" />
          <EmptyState
            v-else-if="matchesStore.error"
            icon="alert"
            title="Impossible de charger les matchs"
            :description="matchesStore.error"
          />
          <EmptyState
            v-else-if="filteredMatches.length === 0"
            icon="matches"
            title="Aucun match trouvé"
            description="Changez de source de données, de date ou ajustez votre recherche."
          />
          <MatchesTable
            v-else
            :matches="filteredMatches"
            :selected-match-id="props.matchId"
            :form-by-match-id="matchesStore.formByMatchId"
            @select="(match) => selectMatch(match.matchId)"
            @team-click="handleTeamClick"
            @view-standings="handleViewStandings"
            @deselect="handleDeselect"
          />
        </AppCard>

        <SafestPicksSummary
          v-if="analysisStore.result"
          :result="analysisStore.result"
          :averages-comparison="averagesComparison"
          @compare-averages-click="handleCompareAverages"
        />
      </div>

      <AppCard title="Analyse du match" class="matches-view__detail">
        <LoadingSpinner v-if="analysisStore.loading" label="Analyse en cours…" />
        <EmptyState
          v-else-if="!analysisStore.result"
          icon="target"
          title="Sélectionnez un match"
          description="Choisissez une rencontre dans la liste pour voir l'analyse complète du moteur."
        />
        <AnalysisResultPanel
          v-else
          :result="analysisStore.result"
          :averages-comparison="averagesComparison"
          :live-match-details="liveMatchDetails"
          @compare-averages-click="handleCompareAverages"
          @show-live-match-click="handleShowLiveMatch"
        />
      </AppCard>
    </div>

    <AppModal v-if="standings" :title="`Classement — ${standings.league}`" @close="standings = null">
      <StandingsTable :loading="standings.loading" :error="standings.error" :rows="standings.rows" />
    </AppModal>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.matches-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.matches-view__default {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.matches-view__controls {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1.4fr auto;
  gap: 14px;
  align-items: end;
}

.matches-view__secondary-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.matches-view__hint {
  font-size: 11.5px;
}

.matches-view__filter-bar {
  padding: 14px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.matches-view__layout {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  align-items: start;
}

.matches-view__list-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 960px) {
  .matches-view__controls {
    grid-template-columns: 1fr;
  }
  .matches-view__layout {
    grid-template-columns: 1fr;
  }
}
</style>
