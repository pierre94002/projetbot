<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useAnalysisStore } from '@/stores/analysisStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
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
import OddsProfilePanel from '@/components/analysis/OddsProfilePanel.vue';
import ResultPredictionCard from '@/components/analysis/ResultPredictionCard.vue';
import ScorePredictionCard from '@/components/analysis/ScorePredictionCard.vue';
import TeamNewsCard from '@/components/analysis/TeamNewsCard.vue';
import AppModal from '@/components/common/AppModal.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import MatchesFilterBar from '@/components/matches/MatchesFilterBar.vue';
import StandingsTable from '@/components/matches/StandingsTable.vue';
import LeagueLeaders from '@/components/matches/LeagueLeaders.vue';
import CupPanel from '@/components/matches/CupPanel.vue';
import TeamStatsView from '@/views/TeamStatsView.vue';
import TeamSquadView from '@/views/TeamSquadView.vue';
import SeasonCalendarView from '@/views/SeasonCalendarView.vue';
import PlayerStatsView from '@/views/PlayerStatsView.vue';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { standingsApi } from '@/services/standingsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { resolveTeamAverages } from '@/utils/resolveTeamAverages.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';

const props = defineProps({ matchId: { type: String, default: null } });

const route = useRoute();
const router = useRouter();
const matchesStore = useMatchesStore();
const analysisStore = useAnalysisStore();
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();
const dataVersionStore = useDataVersionStore();
const aiAnalysisStore = useAiAnalysisStore();
const matchAiAnalysisStore = useMatchAiAnalysisStore();

// "Statistiques ligue" et "Compo & joueurs" sont des modules autonomes
// (store/API/état propres) — intégrés ici comme de simples onglets plutôt
// que des pages séparées, pour regrouper tout ce qui concerne les
// matchs/statistiques à un seul endroit.
const TABS = [
  { value: 'matches', label: 'Matchs' },
  { value: 'calendar', label: 'Calendrier saison' },
  { value: 'stats', label: 'Statistiques ligue' },
  { value: 'players', label: 'Statistiques joueurs' },
  { value: 'squad', label: 'Compo & joueurs' }
];
// Onglet initial lu depuis ?vue=... s'il est valide (lien partagé/rechargement
// de page) — sinon "Matchs" par défaut, comme avant l'ajout du reflet d'URL.
const activeTab = ref(TABS.some((t) => t.value === route.query.onglet) ? route.query.onglet : 'matches');

const searchQuery = ref('');
const leagueQuery = ref('');
const dateFilter = ref('all'); // 'all' | 'today' | 'week' | 'YYYY-MM-DD'
const standings = ref(null); // { league, loading, error, rows }
// Championnats sans statistiques d'équipe complètes (cf. matchStatsRead.js
// leaguesWithIncompleteStats) — chargé une fois, affiché en petit badge par
// championnat dans MatchesTable plutôt que découvert en creux dans l'analyse.
const incompleteStatsLeagues = ref([]);
const averagesComparison = ref(null); // { homeName, awayName, homeTeamId, loading, error, teams }
const liveMatchDetails = ref(null); // { loading, error, data }

// Panneau d'analyse : le moteur (« Analyse mathématique ») ou le profilage
// de cotes. Le choix est retenu pour ce navigateur.
const ANALYSIS_MODES = [
  { value: 'math', label: 'Analyse mathématique' },
  { value: 'profile', label: 'Profilage de cotes' }
];
const CLE_MODE = 'cotemaster.analysisMode';
function lireMode() {
  try {
    const mode = localStorage.getItem(CLE_MODE);
    return ANALYSIS_MODES.some((m) => m.value === mode) ? mode : 'math';
  } catch {
    return 'math';
  }
}
const analysisMode = ref(lireMode());
watch(analysisMode, (mode) => {
  try {
    localStorage.setItem(CLE_MODE, mode);
  } catch {
    /* stockage indisponible : le choix ne sera pas retenu */
  }
});
const selectedMatch = computed(() => matchesStore.matches.find((m) => m.matchId === analysisStore.result?.matchId) ?? null);

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
  matchAiAnalysisStore.fetchForMatch(matchId).catch(() => {});
}

async function handleRunPreMatchAi() {
  const matchId = analysisStore.result?.matchId;
  const match = matchesStore.matches.find((m) => m.matchId === matchId);
  if (!match) {
    toastStore.error('Match introuvable dans la liste actuelle — actualisez puis réessayez.');
    return;
  }
  try {
    await matchAiAnalysisStore.runPreMatch(matchId, { home: match.home, away: match.away, league: match.league, engineResult: analysisStore.result });
  } catch (error) {
    toastStore.error(`Analyse IA pré-match impossible : ${error.message}`);
  }
}

async function handleRunPostMatchAi() {
  const matchId = analysisStore.result?.matchId;
  try {
    await matchAiAnalysisStore.runPostMatch(matchId);
  } catch (error) {
    toastStore.error(`Analyse IA après-match impossible : ${error.message}`);
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
    resolveTeamAverages(homeName, league),
    resolveTeamAverages(awayName, league)
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

// Onglet courant de la modale « Classement ». Remis sur le tableau a chaque
// ouverture : c'est ce qu'on vient voir en cliquant sur « Classement ».
const standingsTab = ref('table');
const leaders = ref(null); // { loading, error, scorers, assists, cleanSheets }

const standingsTabs = computed(() => [
  { value: 'table', label: 'Classement' },
  { value: 'scorers', label: 'Buteurs', count: leaders.value?.scorers?.length },
  { value: 'assists', label: 'Passeurs', count: leaders.value?.assists?.length },
  { value: 'cleanSheets', label: 'Clean sheets', count: leaders.value?.cleanSheets?.length },
  { value: 'cups', label: 'Coupes' }
]);

/**
 * Les trois classements individuels sont charges EN MEME TEMPS que le
 * tableau, pas au clic sur leur onglet : ils arrivent d'un seul appel, et
 * les compteurs des onglets seraient vides jusqu'au premier clic sinon.
 */
async function loadLeaders(league) {
  leaders.value = { loading: true, error: null, scorers: [], assists: [], cleanSheets: [] };
  try {
    const r = await matchStatsApi.getLeagueLeaders(league);
    leaders.value = { loading: false, error: null, scorers: r.scorers ?? [], assists: r.assists ?? [], cleanSheets: r.cleanSheets ?? [] };
  } catch (error) {
    leaders.value = { loading: false, error: error.message, scorers: [], assists: [], cleanSheets: [] };
  }
}

/**
 * Ouvre (ou recharge) le classement d'une compétition.
 *
 * `season` et `table` sont ce que l'utilisateur a choisi dans la modale :
 * une compétition garde plusieurs saisons en magasin, et certaines publient
 * plusieurs tables pour une même saison (conférences MLS, Apertura /
 * Clausura). Les saisons disponibles ne sont demandées qu'à l'ouverture,
 * pas à chaque changement de table.
 */
async function handleViewStandings(league, { season = null, table = null } = {}) {
  const memeLigue = standings.value?.key === league;
  if (!memeLigue) {
    standingsTab.value = 'table';
    loadLeaders(league);
  }
  // `key` conserve le libellé demandé : `league` affiché peut être réécrit par
  // le serveur (leagueName), et c'est `key` qu'il faut réutiliser pour
  // recharger le même classement.
  const precedent = memeLigue ? standings.value : null;
  standings.value = {
    key: league,
    league,
    loading: true,
    error: null,
    rows: [],
    seasons: precedent?.seasons ?? [],
    season: season ?? precedent?.season ?? null,
    tables: [],
    table: table ?? null,
    official: false,
    fetchedAt: null,
    seasonLabel: null
  };
  try {
    const [result, saisons] = await Promise.all([
      standingsApi.get(league, { season, table }),
      memeLigue && precedent?.seasons?.length ? Promise.resolve(null) : matchStatsApi.seasons(league).catch(() => null)
    ]);
    standings.value = {
      key: league,
      league: result.leagueName ?? league,
      loading: false,
      error: null,
      rows: result.rows,
      seasons: saisons?.seasons ?? precedent?.seasons ?? [],
      season: result.season ?? season ?? null,
      seasonLabel: result.seasonLabel ?? null,
      tables: result.tables ?? [],
      table: result.table ?? null,
      official: Boolean(result.official),
      fetchedAt: result.fetchedAt ?? null
    };
  } catch (error) {
    standings.value = { ...standings.value, loading: false, error: error.message, rows: [] };
  }
}

const standingsSeasonOptions = computed(() =>
  (standings.value?.seasons ?? []).map((s) => ({ value: s.season, label: s.label ?? String(s.season) }))
);
const standingsTableOptions = computed(() =>
  (standings.value?.tables ?? []).map((name) => ({ value: name, label: name }))
);
// Une saison ou une table choisie dans la modale recharge le classement ;
// les classements individuels et les coupes suivent la saison, pas la table.
const standingsSeason = computed({
  get: () => standings.value?.season ?? null,
  set: (value) => {
    if (standings.value?.key && value !== standings.value.season) handleViewStandings(standings.value.key, { season: value });
  }
});
const standingsTable = computed({
  get: () => standings.value?.table ?? null,
  set: (value) => {
    if (standings.value?.key && value !== standings.value.table) handleViewStandings(standings.value.key, { season: standings.value.season, table: value });
  }
});

// Le classement affiché dans la modale vit en local (pas dans un store), donc
// le rafraîchissement automatique global ne le couvre pas : on le recharge si
// la modale est ouverte au moment où les données changent côté serveur.
watch(
  () => dataVersionStore.version,
  (next, previous) => {
    if (previous && next && next !== previous && standings.value?.key) handleViewStandings(standings.value.key);
  }
);

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
  if (!aiAnalysisStore.status) aiAnalysisStore.fetchStatus();
  matchAiAnalysisStore.fetchAll();
  matchAiAnalysisStore.fetchStatus();
  loadMatches();
  matchStatsApi
    .status()
    .then((r) => { incompleteStatsLeagues.value = r?.incompleteStatsLeagues ?? []; })
    .catch(() => {}); // Purement informatif : une erreur ne prive que du petit badge, pas de la liste des matchs.
});
</script>

<template>
  <div class="matches-view">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
    <TeamStatsView v-if="activeTab === 'stats'" key="stats" />
    <PlayerStatsView v-else-if="activeTab === 'players'" key="players" />
    <TeamSquadView v-else-if="activeTab === 'squad'" key="squad" />
    <SeasonCalendarView v-else-if="activeTab === 'calendar'" key="calendar" />

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
          Charger les formes
        </AppButton>
        <span class="cm-text-muted matches-view__hint">Lu dans le magasin local (FotMob) — aucun appel facturé.</span>
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
            :ai-analysis-by-match-id="matchAiAnalysisStore.byMatchId"
            :incomplete-stats-leagues="incompleteStatsLeagues"
            @select="(match) => selectMatch(match.matchId)"
            @team-click="handleTeamClick"
            @view-standings="handleViewStandings"
            @deselect="handleDeselect"
          />
        </AppCard>
      </div>

      <AppCard title="Analyse du match" class="matches-view__detail">
        <LoadingSpinner v-if="analysisStore.loading" label="Analyse en cours…" />
        <EmptyState
          v-else-if="!analysisStore.result"
          icon="target"
          title="Sélectionnez un match"
          description="Choisissez une rencontre dans la liste pour voir l'analyse complète du moteur."
        />
        <div v-else class="matches-view__detail-stack">
          <div class="matches-view__modes" role="tablist" aria-label="Type d'analyse">
            <button
              v-for="mode in ANALYSIS_MODES"
              :key="mode.value"
              type="button"
              role="tab"
              class="matches-view__mode"
              :class="{ 'matches-view__mode--active': analysisMode === mode.value }"
              :aria-selected="analysisMode === mode.value"
              @click="analysisMode = mode.value"
            >
              {{ mode.label }}
            </button>
          </div>
          <template v-if="analysisMode === 'math'">
            <ResultPredictionCard :result="analysisStore.result" />
            <ScorePredictionCard :result="analysisStore.result" />
            <TeamNewsCard :result="analysisStore.result" />
            <SafestPicksSummary
              :result="analysisStore.result"
              :averages-comparison="averagesComparison"
              @compare-averages-click="handleCompareAverages"
            />
            <AnalysisResultPanel
              :result="analysisStore.result"
              :averages-comparison="averagesComparison"
              :live-match-details="liveMatchDetails"
              :match-ai="{ connected: matchAiAnalysisStore.connected, running: matchAiAnalysisStore.running, entry: matchAiAnalysisStore.byMatchId[analysisStore.result.matchId] ?? null }"
              @compare-averages-click="handleCompareAverages"
              @show-live-match-click="handleShowLiveMatch"
              @run-pre-match-ai-click="handleRunPreMatchAi"
              @run-post-match-ai-click="handleRunPostMatchAi"
            />
          </template>
          <OddsProfilePanel v-else :match="selectedMatch" />
        </div>
      </AppCard>
    </div>

    <AppModal v-if="standings" :title="`Classement — ${standings.league}`" @close="standings = null">
      <TabbedView v-model="standingsTab" :tabs="standingsTabs" class="standings-modal__tabs" />
      <template v-if="standingsTab === 'table'">
        <div v-if="standingsSeasonOptions.length > 1 || standingsTableOptions.length > 1" class="standings-modal__filters">
          <AppSelect v-if="standingsSeasonOptions.length > 1" v-model="standingsSeason" label="Saison" :options="standingsSeasonOptions" />
          <AppSelect v-if="standingsTableOptions.length > 1" v-model="standingsTable" label="Table" :options="standingsTableOptions" />
        </div>
        <StandingsTable
          :loading="standings.loading"
          :error="standings.error"
          :rows="standings.rows"
          :official="standings.official"
          :fetched-at="standings.fetchedAt"
          :season-label="standings.seasonLabel"
        />
      </template>
      <CupPanel v-else-if="standingsTab === 'cups'" :league="standings.key" />
      <LeagueLeaders
        v-else
        :kind="standingsTab"
        :rows="leaders?.[standingsTab] ?? []"
        :loading="leaders?.loading ?? false"
        :error="leaders?.error ?? null"
      />
    </AppModal>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.standings-modal__tabs {
  margin-bottom: 12px;
}

.standings-modal__filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

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

.matches-view__detail-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.matches-view__modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--cm-border);
  border-radius: 999px;
  background: var(--cm-surface-alt);
}

.matches-view__mode {
  padding: 7px 10px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.matches-view__mode:hover {
  color: var(--cm-text-primary);
}

.matches-view__mode--active {
  background: var(--cm-accent);
  color: #06251b;
}

.matches-view__mode--active:hover {
  color: #06251b;
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
