<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
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
  { id: 'players', label: 'Stats joueurs' }
];

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
  <div class="match-detail">
    <LoadingSpinner v-if="loading" label="Chargement du match…" />
    <EmptyState v-else-if="error" icon="alert" title="Match introuvable" :description="error" />

    <template v-else-if="entry">
      <AppCard padded>
        <div class="match-detail__head">
          <LeagueBadge :league="entry.league" />
          <span v-if="entry.meta?.round" class="cm-text-muted">Journée {{ entry.meta.round }}</span>
        </div>
        <p v-if="kickoff || entry.meta?.stadium" class="cm-text-muted match-detail__when">
          {{ kickoff }}<template v-if="entry.meta?.stadium"> · {{ entry.meta.stadium }}</template>
          <template v-if="entry.meta?.attendance"> · {{ entry.meta.attendance.toLocaleString('fr-FR') }} spectateurs</template>
        </p>

        <div class="match-detail__score">
          <span class="match-detail__team match-detail__team--home">{{ entry.homeName }}</span>
          <span class="match-detail__goals">{{ entry.homeGoals }} - {{ entry.awayGoals }}</span>
          <span class="match-detail__team">{{ entry.awayName }}</span>
        </div>

        <div v-if="scorers.length" class="match-detail__scorers">
          <div class="match-detail__scorers-side">
            <span v-for="(g, i) in scorers.filter((s) => s.side === 'home')" :key="`h${i}`">
              {{ g.player }} {{ g.minute }}'<template v-if="g.ownGoal"> (CSC)</template>
            </span>
          </div>
          <div class="match-detail__scorers-side match-detail__scorers-side--away">
            <span v-for="(g, i) in scorers.filter((s) => s.side === 'away')" :key="`a${i}`">
              {{ g.player }} {{ g.minute }}'<template v-if="g.ownGoal"> (CSC)</template>
            </span>
          </div>
        </div>

        <nav class="match-detail__tabs">
          <button v-for="t in availableTabs" :key="t.id" type="button" :class="{ 'is-active': tab === t.id }" @click="tab = t.id">
            {{ t.label }}
          </button>
        </nav>
      </AppCard>

      <template v-if="tab === 'resume'">
        <AppCard title="Meilleures statistiques">
          <MatchStatBars :group="topStats" :home="entry.teamStats?.home" :away="entry.teamStats?.away" />
        </AppCard>
        <AppCard v-if="entry.meta" title="Rencontre">
          <MatchInfoPanel :meta="entry.meta" />
        </AppCard>
      </template>

      <AppCard v-else-if="tab === 'events'" title="Événements">
        <MatchEventList :events="entry.events" :home-name="entry.homeName" :away-name="entry.awayName" />
      </AppCard>

      <AppCard v-else-if="tab === 'lineups'" title="Compositions">
        <MatchLineups :entry="entry" />
      </AppCard>

      <template v-else-if="tab === 'stats'">
        <AppCard v-for="group in TEAM_STAT_GROUPS" :key="group.title" :title="group.title">
          <MatchStatBars :group="group" :home="entry.teamStats?.home" :away="entry.teamStats?.away" />
        </AppCard>
      </template>

      <AppCard v-else-if="tab === 'players'" title="Stats joueurs">
        <MatchPlayerStats :entry="entry" />
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

.match-detail__head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.match-detail__when {
  margin: 6px 0 0;
  font-size: 11.5px;
}

.match-detail__score {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  margin: 18px 0 4px;
}

.match-detail__team {
  font-size: 16px;
  font-weight: 600;
}

.match-detail__team--home {
  text-align: right;
}

.match-detail__goals {
  font-family: var(--cm-font-mono);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 1px;
}

.match-detail__scorers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.match-detail__scorers-side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: right;
}

.match-detail__scorers-side--away {
  text-align: left;
}

.match-detail__tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-detail__tabs button {
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  padding: 7px 14px;
  border-radius: var(--cm-radius-sm);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.match-detail__tabs button:hover {
  background: var(--cm-surface-hover);
}

.match-detail__tabs button.is-active {
  background: var(--cm-accent-soft);
  color: var(--cm-text-primary);
  font-weight: 600;
}

@media (max-width: 640px) {
  .match-detail__team {
    font-size: 13.5px;
  }
  .match-detail__goals {
    font-size: 21px;
  }
}
</style>
