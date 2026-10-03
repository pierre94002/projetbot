<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchesTable from '@/components/matches/MatchesTable.vue';
import AppModal from '@/components/common/AppModal.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import MatchesFilterBar from '@/components/matches/MatchesFilterBar.vue';
import MatchesToolbar from '@/components/matches/MatchesToolbar.vue';
import StandingsTable from '@/components/matches/StandingsTable.vue';
import LeagueLeaders from '@/components/matches/LeagueLeaders.vue';
import CupPanel from '@/components/matches/CupPanel.vue';
import TeamStatsView from '@/views/TeamStatsView.vue';
import SeasonCalendarView from '@/views/SeasonCalendarView.vue';
import PlayerStatsView from '@/views/PlayerStatsView.vue';
import { standingsApi } from '@/services/standingsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { liveNow } from '@/utils/liveClock.js';
import { computeMatchStatus } from '@/utils/matchStatus.js';

/**
 * La page d'accueil (refonte visuelle du 01/10/2026) : la barre d'onglets,
 * puis pour l'onglet Matchs un bandeau compact (ce qu'on regarde, en
 * chiffres : rencontres listées, en direct, aujourd'hui, championnats), puis
 * la liste rangée par compétition et par jour, coiffée de sa barre de
 * commande (MatchesToolbar, 03/10/2026 : recherche, championnat, source,
 * actualisation, filtre de dates, formes). La modale Classement garde ses
 * onglets (tableau, buteurs, passeurs, clean sheets, coupes).
 */
const props = defineProps({ matchId: { type: String, default: null } });

const route = useRoute();
const router = useRouter();
const matchesStore = useMatchesStore();
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();
const dataVersionStore = useDataVersionStore();
const aiAnalysisStore = useAiAnalysisStore();
const matchAiAnalysisStore = useMatchAiAnalysisStore();

// "Statistiques ligue" et "Statistiques joueurs" sont des modules autonomes
// (store/API/état propres) — intégrés ici comme de simples onglets plutôt
// que des pages séparées, pour regrouper tout ce qui concerne les
// matchs/statistiques à un seul endroit. L'onglet « Compo & joueurs » a été
// retiré le 03/10/2026 (demande de Pierre) : la composition d'un match est
// sur sa page, l'effectif d'un club et ses joueurs sur la page du club.
const TABS = [
  { value: 'matches', label: 'Matchs' },
  { value: 'calendar', label: 'Calendrier saison' },
  { value: 'stats', label: 'Statistiques ligue' },
  { value: 'players', label: 'Statistiques joueurs' }
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

// Les chiffres du bandeau (présentation seulement) : parmi les rencontres
// listées, combien se jouent en ce moment, combien restent à jouer
// aujourd'hui, et combien de compétitions. Même règle que les puces de
// MatchesTable : l'heure « 12:00:00Z » d'un match du calendrier n'est pas un
// coup d'envoi ; recalculé avec l'horloge partagée `liveNow`.
const resume = computed(() => {
  const maintenant = liveNow.value;
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  const competitions = new Set();
  let enDirect = 0;
  let duJour = 0;
  for (const match of filteredMatches.value) {
    competitions.add(match.league);
    const statut = match.hasOdds === false ? 'upcoming' : computeMatchStatus(match.commenceTime, maintenant);
    if (statut === 'live') enDirect++;
    else if (statut !== 'finished' && toDateKey(match.commenceTime) === aujourdhui) duJour++;
  }
  return { enDirect, duJour, competitions: competitions.size };
});

async function loadMatches() {
  // Les dates et chemins des fichiers lus (provenance, cf. DataOriginMenu) :
  // en parallèle, sans bloquer la liste si l'appel échoue.
  sourcesStore.fetchSources().catch(() => {});
  await matchesStore.fetchMatches();
  // Ancien lien vers un match sélectionné dans la liste (/matches/:id) : la
  // page du match l'a remplacé.
  if (props.matchId && matchesStore.matches.some((m) => m.matchId === props.matchId)) openMatch(props.matchId, { replace: true });
}

/**
 * Un clic sur un match ouvre SA page (demande de Pierre le 01/10/2026), plus
 * le panneau de droite d'avant : cf. UpcomingMatchView.vue, qui reprend tout
 * ce que ce panneau montrait.
 */
function openMatch(matchId, { replace = false } = {}) {
  const cible = { name: 'upcoming-match', params: { matchId } };
  return replace ? router.replace(cible) : router.push(cible);
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

function handleDeselect() {
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
    seasonLabel: null,
    postponed: []
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
      fetchedAt: result.fetchedAt ?? null,
      postponed: result.postponed ?? []
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
  <div class="matches-view cm-page">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
    <TeamStatsView v-if="activeTab === 'stats'" key="stats" />
    <PlayerStatsView v-else-if="activeTab === 'players'" key="players" />
    <SeasonCalendarView v-else-if="activeTab === 'calendar'" key="calendar" />

    <div v-else key="matches" class="matches-view__default cm-page">
    <!-- Le bandeau : ce qu'on regarde, en chiffres. -->
    <section class="cm-hero matches-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="matches" :size="18" /></span>
          Matchs
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section" title="Rencontres listées avec les filtres en cours">
            <AppIcon name="list" :size="11" />
            {{ filteredMatches.length }} rencontre{{ filteredMatches.length > 1 ? 's' : '' }}
            <span v-if="filteredMatches.length !== matchesStore.matches.length" class="matches-hero__of">sur {{ matchesStore.matches.length }}</span>
          </span>
          <span v-if="resume.enDirect" class="cm-chip is-danger" title="Rencontres en cours en ce moment">
            <span class="cm-live-dot"></span>{{ resume.enDirect }} en direct
          </span>
          <span v-if="resume.duJour" class="cm-chip is-accent" title="Rencontres encore à jouer aujourd'hui">
            <AppIcon name="clock" :size="11" />{{ resume.duJour }} aujourd'hui
          </span>
          <span v-if="resume.competitions" class="cm-chip" title="Compétitions représentées dans la liste">
            <AppIcon name="trophy" :size="11" />{{ resume.competitions }} championnat{{ resume.competitions > 1 ? 's' : '' }}
          </span>
        </span>
      </div>
      <p class="cm-hero__subtitle">
        Les rencontres de vos championnats, rangées par compétition puis par jour, avec les cotes 1 / N / 2 des bookmakers. Un clic ouvre la page du match.
      </p>
    </section>

    <!-- La liste, coiffée de sa barre de commande : recherche, championnat,
         source, actualisation, puis le filtre de dates et les formes. -->
    <div class="matches-view__layout">
      <div class="matches-view__list-column">
        <AppCard :padded="false" class="matches-view__list">
          <MatchesToolbar
            v-model:search="searchQuery"
            v-model:league="leagueQuery"
            v-model:source="matchesStore.source"
            :sources="sourcesStore.options"
            :origins="sourcesStore.origins"
            :fixtures="sourcesStore.fixtures"
            :matches="matchesStore.matches"
            :loading="matchesStore.loading"
            :loading-form="matchesStore.loadingForm"
            @refresh="loadMatches"
            @load-form="handleLoadForm"
          >
            <MatchesFilterBar v-model="dateFilter" :available-dates="availableDates" />
          </MatchesToolbar>
          <div v-if="matchesStore.loading" class="matches-view__state">
            <LoadingSpinner label="Chargement des rencontres…" />
          </div>
          <div v-else-if="matchesStore.error" class="matches-view__state">
            <EmptyState
              icon="alert"
              title="Impossible de charger les matchs"
              :description="matchesStore.error"
            />
          </div>
          <div v-else-if="filteredMatches.length === 0" class="matches-view__state">
            <EmptyState
              icon="matches"
              title="Aucun match trouvé"
              description="Changez de source de données, de date ou ajustez votre recherche."
            />
          </div>
          <MatchesTable
            v-else
            :matches="filteredMatches"
            :selected-match-id="props.matchId"
            :form-by-match-id="matchesStore.formByMatchId"
            :ai-analysis-by-match-id="matchAiAnalysisStore.byMatchId"
            :incomplete-stats-leagues="incompleteStatsLeagues"
            @select="(match) => openMatch(match.matchId)"
            @team-click="handleTeamClick"
            @view-standings="handleViewStandings"
            @deselect="handleDeselect"
          />
        </AppCard>
      </div>
    </div>

    <AppModal v-if="standings" :title="`Classement — ${standings.league}`" @close="standings = null">
      <TabbedView v-model="standingsTab" :tabs="standingsTabs" class="standings-modal__tabs" />
      <template v-if="standingsTab === 'table'">
        <div v-if="standingsSeasonOptions.length > 1 || standingsTableOptions.length > 1" class="cm-toolbar standings-modal__filters">
          <AppSelect v-if="standingsSeasonOptions.length > 1" v-model="standingsSeason" label="Saison" :options="standingsSeasonOptions" class="standings-modal__select" />
          <AppSelect v-if="standingsTableOptions.length > 1" v-model="standingsTable" label="Table" :options="standingsTableOptions" class="standings-modal__select" />
        </div>
        <StandingsTable
          :league="standings.key"
          :loading="standings.loading"
          :error="standings.error"
          :rows="standings.rows"
          :official="standings.official"
          :fetched-at="standings.fetchedAt"
          :season-label="standings.seasonLabel"
          :postponed="standings.postponed"
        />
      </template>
      <CupPanel v-else-if="standingsTab === 'cups'" :league="standings.key" />
      <LeagueLeaders
        v-else
        :league="standings.key"
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
/* ------------------------------------------------------------ bandeau */
/* Compact : le titre et ses puces sur une ligne, la phrase dessous. */
.matches-hero {
  gap: 10px;
  padding: 18px 22px;
}

/* « 12 rencontres sur 60 » : le total en retrait dans la puce. */
.matches-hero__of {
  font-weight: 500;
  opacity: 0.75;
}


/* -------------------------------------------------------------- liste */
/* La liste occupe toute la largeur : un match s'ouvre désormais sur sa page. */
.matches-view__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.matches-view__list-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* Chargement, erreur, vide : la même marge intérieure que la liste. */
.matches-view__state {
  padding: 14px;
}

/* ------------------------------------------------------------- modale */
.standings-modal__tabs {
  margin-bottom: 14px;
}

.standings-modal__filters {
  margin-bottom: 14px;
}

.standings-modal__select {
  flex: 1 1 160px;
}
</style>
