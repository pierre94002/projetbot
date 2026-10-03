<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import MatchAiReviewPanel from '@/components/analysis/MatchAiReviewPanel.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import BackButton from '@/components/common/BackButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import MatchupHeader from '@/components/matches/MatchupHeader.vue';
import MatchStatBars from '@/components/matches/MatchStatBars.vue';
import MatchEventList from '@/components/matches/MatchEventList.vue';
import MatchPlayerStats from '@/components/matches/MatchPlayerStats.vue';
import MatchLineups from '@/components/matches/MatchLineups.vue';
import MatchInfoPanel from '@/components/matches/MatchInfoPanel.vue';
import { TEAM_STAT_GROUPS } from '@/constants/matchDetailTabs.js';

const props = defineProps({ matchId: { type: String, required: true } });

const entry = ref(null);
const loading = ref(false);
const error = ref(null);
const tab = ref('resume');

const TABS = [
  { id: 'resume', label: 'Résumé' },
  { id: 'events', label: 'Fil du match' },
  { id: 'lineups', label: 'Compositions' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'players', label: 'Stats joueurs' },
  { id: 'ai', label: 'Analyse IA' }
];

// Présentation seulement (refonte du 01/10/2026) : l'icône de chaque onglet
// dans la barre segmentée, à part de TABS pour ne pas toucher à sa structure.
const TAB_ICONS = { resume: 'list', events: 'clock', lineups: 'users', stats: 'barChart', players: 'activity', ai: 'sparkles' };

// Onglet « Analyse IA » : chargé au premier affichage de l'onglet, une fois
// par match (l'analyse est retrouvée par équipes, compétition et date).
const aiStore = useMatchAiAnalysisStore();
const ai = ref({ loading: false, error: null, entry: null, predictions: [], experience: [], loadedFor: null });
const aiRunning = ref(false);

async function loadAi({ force = false } = {}) {
  const match = entry.value;
  if (!match) return;
  // Clé du match AFFICHÉ, pas de l'adresse : pendant un changement de match,
  // l'ancien reste affiché le temps que le nouveau arrive.
  const cle = `${match.date}|${match.homeName}|${match.awayName}`;
  if (!force && ai.value.loadedFor === cle) return;
  ai.value = { ...ai.value, loading: true, error: null };
  try {
    const [r] = await Promise.all([
      matchAiAnalysisApi.getForFixture({ home: match.homeName, away: match.awayName, league: match.league, date: match.date }),
      aiStore.fetchStatus().catch(() => false)
    ]);
    ai.value = { loading: false, error: null, entry: r.entry ?? null, predictions: r.predictions ?? [], experience: r.experience ?? [], loadedFor: cle };
  } catch (e) {
    ai.value = { loading: false, error: e.message, entry: null, predictions: [], experience: [], loadedFor: null };
  }
}

async function runPostMatchAi() {
  if (!ai.value.entry?.matchId) return;
  aiRunning.value = true;
  try {
    await matchAiAnalysisApi.runPostMatch(ai.value.entry.matchId);
    await loadAi({ force: true });
  } catch (e) {
    ai.value = { ...ai.value, error: e.message };
  } finally {
    aiRunning.value = false;
  }
}

watch([tab, entry], ([t]) => {
  if (t === 'ai') loadAi();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    entry.value = await matchStatsApi.get(props.matchId);
  } catch (e) {
    error.value = e.message;
    entry.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.matchId, load);

/** Onglets réellement disponibles : la source ne publie pas tout partout. */
const availableTabs = computed(() =>
  TABS.filter((t) => {
    if (t.id === 'events') return Boolean(entry.value?.events?.length);
    if (t.id === 'lineups') return Boolean(entry.value?.lineups || entry.value?.players?.home?.length);
    if (t.id === 'players') return Boolean(entry.value?.players?.home?.length);
    return true;
  })
);

watch(availableTabs, (tabs) => {
  if (tabs.length && !tabs.some((t) => t.id === tab.value)) tab.value = tabs[0].id;
});

const scorers = computed(() => (entry.value?.events ?? []).filter((e) => e.type === 'goal'));
const kickoff = computed(() => {
  const iso = entry.value?.meta?.kickoff;
  if (!iso) return null;
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
});

/** Les 9 lignes du bloc « Meilleures statistiques », comme sur la page source. */
const topStats = computed(() => TEAM_STAT_GROUPS[0]);
</script>

<template>
  <div class="match-detail cm-page">
    <BackButton fallback="/matches" />
    <LoadingSpinner v-if="loading" label="Chargement du match…" />
    <EmptyState v-else-if="error" icon="alert" title="Match introuvable" :description="error" />

    <template v-else-if="entry">
      <!-- 1. LE BANDEAU : compétition et journée en puces, la date et le stade, les deux
           clubs face à face autour du score, les buteurs sous le score. -->
      <section class="cm-hero match-detail__hero">
        <div class="cm-hero__top">
          <span class="cm-hero__chips">
            <span class="cm-eyebrow match-detail__eyebrow"><AppIcon name="matches" :size="12" />Match joué</span>
            <span class="cm-chip match-detail__league"><LeagueBadge :league="entry.league" /></span>
            <span v-if="entry.meta?.round" class="cm-chip"><AppIcon name="calendar" :size="11" />Journée {{ entry.meta.round }}</span>
          </span>
          <p v-if="kickoff || entry.meta?.stadium" class="cm-hero__subtitle match-detail__when">
            <AppIcon name="clock" :size="13" />
            <span>
              {{ kickoff }}<template v-if="entry.meta?.stadium"> · {{ entry.meta.stadium }}</template>
              <template v-if="entry.meta?.attendance"> · {{ entry.meta.attendance.toLocaleString('fr-FR') }} spectateurs</template>
            </span>
          </p>
        </div>

        <div class="match-detail__matchup">
          <div class="match-detail__club is-home">
            <span class="match-detail__team">{{ entry.homeName }}</span>
            <TeamCrest :name="entry.homeName" :league="entry.league" :team-id="entry.homeId ?? null" :size="44" />
          </div>
          <span class="cm-pill is-strong cm-numeric match-detail__score">{{ entry.homeGoals }} - {{ entry.awayGoals }}</span>
          <div class="match-detail__club is-away">
            <TeamCrest :name="entry.awayName" :league="entry.league" :team-id="entry.awayId ?? null" :size="44" />
            <span class="match-detail__team">{{ entry.awayName }}</span>
          </div>
        </div>

        <div v-if="scorers.length" class="match-detail__scorers">
          <div class="match-detail__scorers-side is-home">
            <span v-for="(g, i) in scorers.filter((s) => s.side === 'home')" :key="`h${i}`" class="match-detail__scorer">
              <span class="match-detail__scorer-name">{{ g.player }}<template v-if="g.ownGoal"> (CSC)</template></span>
              <span class="match-detail__scorer-minute cm-numeric">{{ g.minute }}'</span>
              <AppIcon name="ball" :size="12" class="match-detail__scorer-ball" />
            </span>
          </div>
          <div class="match-detail__scorers-side is-away">
            <span v-for="(g, i) in scorers.filter((s) => s.side === 'away')" :key="`a${i}`" class="match-detail__scorer">
              <AppIcon name="ball" :size="12" class="match-detail__scorer-ball" />
              <span class="match-detail__scorer-minute cm-numeric">{{ g.minute }}'</span>
              <span class="match-detail__scorer-name">{{ g.player }}<template v-if="g.ownGoal"> (CSC)</template></span>
            </span>
          </div>
        </div>
      </section>

      <!-- 2. LES ONGLETS : barre segmentée, l'actif en couleur de section (même dessin que TabbedView). -->
      <nav class="match-detail__tabs" role="tablist">
        <button
          v-for="t in availableTabs"
          :key="t.id"
          type="button"
          role="tab"
          :class="{ 'is-active': tab === t.id }"
          :aria-selected="tab === t.id"
          @click="tab = t.id"
        >
          <AppIcon :name="TAB_ICONS[t.id] ?? 'list'" :size="13" />
          {{ t.label }}
        </button>
      </nav>

      <!-- RÉSUMÉ : les meilleures statistiques à gauche, le cadre de la rencontre à droite. -->
      <div v-if="tab === 'resume'" class="match-detail__grid cm-stagger">
        <AppCard title="Meilleures statistiques" subtitle="Les neuf chiffres qui résument la rencontre, comme sur la page source." icon="barChart">
          <MatchupHeader :home="entry.homeName" :away="entry.awayName" :league="entry.league" :home-id="entry.homeId ?? null" :away-id="entry.awayId ?? null" :size="22" />
          <MatchStatBars :group="topStats" :home="entry.teamStats?.home" :away="entry.teamStats?.away" />
        </AppCard>
        <AppCard v-if="entry.meta" title="Rencontre" subtitle="Stade, affluence, météo et arbitre publiés par FotMob." icon="mapPin">
          <MatchInfoPanel :meta="entry.meta" />
        </AppCard>
      </div>

      <!-- FIL DU MATCH -->
      <AppCard v-else-if="tab === 'events'" title="Événements" subtitle="Buts, cartons et remplacements, minute par minute, chaque camp de son côté." icon="clock">
        <MatchEventList :events="entry.events" :home-name="entry.homeName" :away-name="entry.awayName" :players="entry.players" :league="entry.league" :home-id="entry.homeId ?? null" :away-id="entry.awayId ?? null" />
      </AppCard>

      <!-- COMPOSITIONS -->
      <AppCard v-else-if="tab === 'lineups'" title="Compositions" subtitle="Les deux onzes sur le terrain avec leur note du match, puis les bancs." icon="users">
        <MatchLineups :entry="entry" />
      </AppCard>

      <!-- STATISTIQUES : un groupe par carte, les deux clubs en tête de chacune. -->
      <div v-else-if="tab === 'stats'" class="match-detail__stats cm-stagger">
        <AppCard v-for="group in TEAM_STAT_GROUPS" :key="group.title" :title="group.title" icon="barChart">
          <MatchupHeader :home="entry.homeName" :away="entry.awayName" :league="entry.league" :home-id="entry.homeId ?? null" :away-id="entry.awayId ?? null" :size="22" />
          <MatchStatBars :group="group" :home="entry.teamStats?.home" :away="entry.teamStats?.away" />
        </AppCard>
      </div>

      <!-- STATS JOUEURS -->
      <AppCard v-else-if="tab === 'players'" title="Stats joueurs" subtitle="Les statistiques individuelles de la feuille de match, par famille, comme chez FotMob." icon="activity">
        <MatchPlayerStats :entry="entry" />
      </AppCard>

      <!-- ANALYSE IA -->
      <AppCard v-else-if="tab === 'ai'" title="Analyse IA" subtitle="La lecture de l'IA avant le match, puis son bilan une fois le résultat connu." icon="sparkles">
        <LoadingSpinner v-if="ai.loading" label="Chargement de l'analyse IA…" />
        <EmptyState v-else-if="ai.error" icon="alert" title="Analyse IA indisponible" :description="ai.error" />
        <MatchAiReviewPanel
          v-else
          :match="entry"
          :entry="ai.entry"
          :predictions="ai.predictions"
          :experience="ai.experience"
          :connected="aiStore.connected"
          :running="aiRunning"
          @run-post-match="runPostMatchAi"
        />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.match-detail {
  /* La page se règle sur SA largeur : deux colonnes seulement si la place existe. */
  container: matchdetail / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.match-detail__hero {
  container: mdhero / inline-size;
  gap: 18px;
}

.match-detail__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

/* La compétition (drapeau + nom) dans une puce : son nom au calibre des puces. */
.match-detail__league {
  padding-left: 5px;
}

.match-detail__league :deep(.league-badge__name) {
  font-size: 11.5px;
}

/* La date, le stade et l'affluence : à droite des puces, l'horloge en couleur de section. */
.match-detail__when {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.match-detail__when :deep(svg) {
  flex-shrink: 0;
  color: var(--cm-section);
}

/* Les deux clubs face à face, le score au centre. */
.match-detail__matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 4px 0;
}

.match-detail__club {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.match-detail__club.is-home {
  justify-content: flex-end;
  text-align: right;
}

.match-detail__team {
  min-width: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

/* Le score : la pastille forte, en très grand. */
.match-detail__score {
  min-width: 96px;
  padding: 7px 20px;
  font-size: 26px;
  letter-spacing: 1px;
  box-shadow: var(--cm-shadow-sm);
}

/* Les buteurs sous le score : ceux du club qui reçoit alignés à droite, les autres à gauche. */
.match-detail__scorers {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px 24px;
}

.match-detail__scorers-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.match-detail__scorers-side.is-home {
  align-items: flex-end;
  text-align: right;
}

.match-detail__scorer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.match-detail__scorer-name {
  min-width: 0;
  font-weight: 600;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.match-detail__scorer-minute {
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

.match-detail__scorer-ball {
  flex-shrink: 0;
  color: var(--cm-section);
}

/* ------------------------------------------------------------ onglets */
.match-detail__tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.match-detail__tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.match-detail__tabs button:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.match-detail__tabs button.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ------------------------------------------------------------ contenu */
.match-detail__grid,
.match-detail__stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* Assez de place : le résumé et les groupes de statistiques sur deux colonnes,
   le premier groupe (« Meilleures statistiques ») en pleine largeur. */
@container matchdetail (min-width: 900px) {
  .match-detail__grid,
  .match-detail__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .match-detail__stats > :first-child {
    grid-column: 1 / -1;
  }
}

/* Bandeau étroit : chaque club en colonne (logo au-dessus du nom), le score entre les deux. */
@container mdhero (max-width: 600px) {
  .match-detail__matchup {
    gap: 10px;
  }

  .match-detail__club,
  .match-detail__club.is-home {
    flex-direction: column;
    justify-content: flex-start;
    gap: 8px;
    text-align: center;
  }

  .match-detail__club.is-home {
    flex-direction: column-reverse;
  }

  .match-detail__team {
    font-size: 14.5px;
  }

  .match-detail__score {
    min-width: 72px;
    padding: 5px 12px;
    font-size: 20px;
  }

  .match-detail__scorers {
    gap: 6px 12px;
  }

  .match-detail__scorer {
    flex-wrap: wrap;
    justify-content: inherit;
  }
}
</style>
