<script setup>
import { ref, computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from './LeagueBadge.vue';
import { formatOdds, formatKickoff } from '@/utils/format.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';

const teamStatsModalStore = useTeamStatsModalStore();

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  searchPlaceholder: { type: String, default: 'Rechercher (équipe, marché, pick)…' },
  picks: { type: Array, required: true },
  scanning: { type: Boolean, default: false },
  scanned: { type: Boolean, default: false },
  emptyDescription: { type: String, default: 'Aucun pari de ce type trouvé sur la période scannée.' },
  isSelected: { type: Function, required: true },
  legKey: { type: Function, required: true }
});

const emit = defineEmits(['toggle']);

const searchQuery = ref('');

const filteredPicks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.picks;
  return props.picks.filter(
    (c) =>
      c.homeName.toLowerCase().includes(query) ||
      c.awayName.toLowerCase().includes(query) ||
      c.market.toLowerCase().includes(query) ||
      c.pick.toLowerCase().includes(query) ||
      (c.league ?? '').toLowerCase().includes(query)
  );
});

// Rangé par ligue puis par rencontre plutôt qu'en liste plate — beaucoup
// plus simple à parcourir dès qu'il y a plusieurs dizaines de paris. Pour
// chaque match, le pick le plus probable (cote la plus basse) est isolé :
// c'est la seule ligne visible par défaut (repliée), les autres se
// dévoilent au clic — condensé plutôt qu'une liste de 4-5 lignes par match.
const groupedPicks = computed(() => {
  const byLeague = new Map();
  for (const pick of filteredPicks.value) {
    const leagueKey = pick.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, new Map());
    const byMatch = byLeague.get(leagueKey);
    if (!byMatch.has(pick.matchId)) {
      byMatch.set(pick.matchId, { matchId: pick.matchId, homeName: pick.homeName, awayName: pick.awayName, commenceTime: pick.commenceTime, picks: [] });
    }
    byMatch.get(pick.matchId).picks.push(pick);
  }
  return [...byLeague.entries()].map(([league, byMatch]) => ({
    league,
    count: [...byMatch.values()].reduce((sum, m) => sum + m.picks.length, 0),
    matches: [...byMatch.values()].map((m) => {
      const sorted = [...m.picks].sort((a, b) => a.odds - b.odds);
      return { ...m, best: sorted[0], rest: sorted.slice(1) };
    })
  }));
});

const expandedMatches = ref(new Set());

function toggleMatch(matchId) {
  const next = new Set(expandedMatches.value);
  if (next.has(matchId)) next.delete(matchId);
  else next.add(matchId);
  expandedMatches.value = next;
}

// Vide par défaut : tous les championnats démarrent fermés, comme dans
// Matchs — sinon des dizaines de picks par ligue s'affichent d'un coup.
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
  return Boolean(searchQuery.value.trim()) || expandedLeagues.value.has(league);
}

function impliedProbability(odds) {
  return odds > 1 ? Math.round((1 / odds) * 100) : null;
}
</script>

<template>
  <AppCard :title="title" :subtitle="subtitle">
    <AppTextField v-model="searchQuery" :placeholder="searchPlaceholder" class="picks-search__field">
      <template #icon><AppIcon name="search" :size="14" /></template>
    </AppTextField>
    <p class="cm-text-muted picks-search__note">
      Cote marché affichée uniquement sur Résultat (1N2) — seul marché avec une vraie cote bookmaker dans l'app.
    </p>

    <LoadingSpinner v-if="scanning && picks.length === 0" label="Analyse des matchs…" />
    <EmptyState
      v-else-if="!scanned"
      icon="bolt"
      title="Aucun scan encore lancé"
      description="Choisis une période et clique sur « Scanner les matchs »."
    />
    <EmptyState
      v-else-if="filteredPicks.length === 0 && searchQuery.trim()"
      icon="search"
      title="Aucun résultat"
      :description="`Aucun pari ne correspond à «${searchQuery.trim()}».`"
    />
    <EmptyState v-else-if="filteredPicks.length === 0" icon="target" title="Rien à afficher" :description="emptyDescription" />

    <div v-else class="picks-search__list">
      <div v-for="group in groupedPicks" :key="group.league" class="picks-search__league">
        <div
          class="picks-search__league-header"
          role="button"
          tabindex="0"
          @click="toggleLeague(group.league)"
          @keydown.enter="toggleLeague(group.league)"
        >
          <LeagueBadge :league="group.league" />
          <span class="cm-text-muted cm-numeric">{{ group.count }}</span>
          <AppIcon
            name="chevronRight"
            :size="12"
            class="picks-search__league-chevron"
            :class="{ 'picks-search__league-chevron--open': isLeagueOpen(group.league) }"
          />
        </div>

        <template v-if="isLeagueOpen(group.league)">
        <div v-for="match in group.matches" :key="match.matchId" class="picks-search__match">
          <p class="picks-search__match-header cm-truncate">
            <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(match.homeName, group.league, match.matchId)">{{ match.homeName }}</button>
            vs
            <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(match.awayName, group.league, match.matchId)">{{ match.awayName }}</button>
            <span class="cm-text-muted">· {{ formatKickoff(match.commenceTime) }}</span>
            <MatchStatusBadge :commence-time="match.commenceTime" class="picks-search__status" />
          </p>

          <label class="picks-search__row">
            <input type="checkbox" :checked="isSelected(match.best)" @change="emit('toggle', match.best)" />
            <div class="picks-search__main">
              <p class="picks-search__pick cm-truncate">
                <span class="cm-text-muted">{{ match.best.market }} —</span> {{ match.best.pick }}
                <span class="picks-search__probability">{{ impliedProbability(match.best.odds) }}%</span>
              </p>
            </div>
            <div class="picks-search__row-right">
              <span class="cm-numeric picks-search__odds">@ {{ formatOdds(match.best.odds) }}</span>
              <span v-if="match.best.marketOdds" class="cm-text-muted picks-search__market-odds">marché @ {{ formatOdds(match.best.marketOdds) }}</span>
              <button
                v-if="match.rest.length"
                type="button"
                class="picks-search__expand"
                @click.stop.prevent="toggleMatch(match.matchId)"
              >
                +{{ match.rest.length }}
                <AppIcon
                  name="chevronRight"
                  :size="10"
                  class="picks-search__expand-icon"
                  :class="{ 'picks-search__expand-icon--open': expandedMatches.has(match.matchId) }"
                />
              </button>
            </div>
          </label>

          <template v-if="match.rest.length && expandedMatches.has(match.matchId)">
            <label v-for="c in match.rest" :key="legKey(c)" class="picks-search__row picks-search__row--sub">
              <input type="checkbox" :checked="isSelected(c)" @change="emit('toggle', c)" />
              <div class="picks-search__main">
                <p class="picks-search__pick cm-truncate">
                  <span class="cm-text-muted">{{ c.market }} —</span> {{ c.pick }}
                  <span class="picks-search__probability">{{ impliedProbability(c.odds) }}%</span>
                </p>
              </div>
              <div class="picks-search__row-right">
                <span class="cm-numeric picks-search__odds">@ {{ formatOdds(c.odds) }}</span>
                <span v-if="c.marketOdds" class="cm-text-muted picks-search__market-odds">marché @ {{ formatOdds(c.marketOdds) }}</span>
              </div>
            </label>
          </template>
        </div>
        </template>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.picks-search__field {
  margin-bottom: 14px;
}

.picks-search__note {
  font-size: 10.5px;
  margin: -6px 0 14px;
}

.picks-search__market-odds {
  font-size: 10.5px;
  white-space: nowrap;
}

.picks-search__list {
  display: flex;
  flex-direction: column;
  max-height: 420px;
  overflow-y: auto;
}

.picks-search__league {
  border-bottom: 1px solid var(--cm-border-soft);
}

.picks-search__league:last-child {
  border-bottom: none;
}

.picks-search__league-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 8px;
  background: var(--cm-surface-alt);
  border: none;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: pointer;
  text-align: left;
}

.picks-search__league-header .cm-numeric {
  margin-left: auto;
  font-size: 10.5px;
  text-transform: none;
  letter-spacing: normal;
}

.picks-search__league-chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.picks-search__league-chevron--open {
  transform: rotate(-90deg);
}

.picks-search__match {
  padding-left: 4px;
}

.picks-search__match-header {
  padding: 8px 8px 4px;
  font-size: 11.5px;
  font-weight: 600;
}

.picks-search__match-header .cm-team-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.picks-search__status {
  margin-left: 6px;
  vertical-align: middle;
}

.picks-search__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 7px 8px 7px 20px;
  cursor: pointer;
}

.picks-search__row:hover {
  background: var(--cm-surface-hover);
}

.picks-search__row--sub {
  padding-left: 20px;
}

.picks-search__row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--cm-accent);
  cursor: pointer;
}

.picks-search__main {
  min-width: 0;
}

.picks-search__pick {
  font-size: 12.5px;
  font-weight: 600;
}

.picks-search__probability {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-size: 10px;
  font-weight: 700;
  vertical-align: middle;
}

.picks-search__row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.picks-search__odds {
  font-size: 12.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.picks-search__expand {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  border: 1px solid var(--cm-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-muted);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.picks-search__expand:hover {
  border-color: var(--cm-accent);
  color: var(--cm-accent);
}

.picks-search__expand-icon {
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.picks-search__expand-icon--open {
  transform: rotate(-90deg);
}
</style>
