<script setup>
import { ref, computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from './LeagueBadge.vue';
import MatchCard from './MatchCard.vue';
import PickCrest from './PickCrest.vue';
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

// Présentation seulement : combien de rencontres portent les paris affichés,
// pour la puce en tête de carte (le nombre de paris est déjà sur l'onglet).
const matchCount = computed(() => groupedPicks.value.reduce((sum, group) => sum + group.matches.length, 0));
</script>

<template>
  <AppCard :title="title" :subtitle="subtitle" icon="target" eyebrow="Sélection">
    <div class="pks">
      <div class="pks__tools">
        <AppTextField v-model="searchQuery" :placeholder="searchPlaceholder">
          <template #icon><AppIcon name="search" :size="14" /></template>
        </AppTextField>
        <p class="pks__note">
          <AppIcon name="info" :size="12" />
          Cote marché affichée uniquement sur Résultat (1N2) — seul marché avec une vraie cote bookmaker dans l'app.
        </p>
      </div>

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

      <div v-else class="pks__list cm-stagger">
        <section v-for="group in groupedPicks" :key="group.league" class="pks-league" :class="{ 'is-open': isLeagueOpen(group.league) }">
          <div
            class="pks-league__header"
            role="button"
            tabindex="0"
            @click="toggleLeague(group.league)"
            @keydown.enter="toggleLeague(group.league)"
          >
            <LeagueBadge :league="group.league" />
            <span class="cm-pill pks-league__count">{{ group.count }}</span>
            <AppIcon name="chevronRight" :size="14" class="pks-chevron" :class="{ 'is-open': isLeagueOpen(group.league) }" />
          </div>

          <template v-if="isLeagueOpen(group.league)">
          <div class="pks-league__body">
            <div v-for="match in group.matches" :key="match.matchId" class="pks-match">
              <!-- Carte de rencontre commune (MatchCard.vue, 01/10/2026). -->
              <MatchCard
                :match="{
                  matchId: match.matchId,
                  commenceTime: match.commenceTime,
                  date: match.commenceTime ? String(match.commenceTime).slice(0, 10) : null,
                  league: group.league,
                  homeName: match.homeName,
                  awayName: match.awayName
                }"
                :to="`/match-a-venir/${match.matchId}`"
                variant="compact"
                :show-competition="false"
                team-links
                class="pks-match__card"
              >
                <template #aside>
                  <MatchStatusBadge :commence-time="match.commenceTime" />
                </template>
              </MatchCard>

              <div class="pks-match__picks">
                <!-- Le pari le plus probable du match, seul visible tant qu'on n'a pas déplié les autres. -->
                <label class="pks-row" :class="{ 'is-selected': isSelected(match.best) }">
                  <input type="checkbox" class="pks-row__check" :checked="isSelected(match.best)" @change="emit('toggle', match.best)" />
                  <div class="pks-row__main">
                    <span class="pks-row__market cm-truncate">{{ match.best.market }}</span>
                    <p class="pks-row__pick cm-truncate">
                      <PickCrest :item="match.best" :home="match.best.homeName" :away="match.best.awayName" :league="match.best.league" :size="14" />{{ match.best.pick }}
                      <span class="pks-row__probability" title="Probabilité selon le moteur">{{ impliedProbability(match.best.odds) }}%</span>
                    </p>
                  </div>
                  <div class="pks-row__right">
                    <span v-if="match.best.marketOdds" class="pks-row__market-odds cm-numeric">marché @ {{ formatOdds(match.best.marketOdds) }}</span>
                    <span class="cm-pill is-section pks-row__odds">@ {{ formatOdds(match.best.odds) }}</span>
                    <button
                      v-if="match.rest.length"
                      type="button"
                      class="pks-row__expand"
                      :title="expandedMatches.has(match.matchId) ? 'Masquer les autres paris de ce match' : 'Voir les autres paris de ce match'"
                      @click.stop.prevent="toggleMatch(match.matchId)"
                    >
                      +{{ match.rest.length }}
                      <AppIcon name="chevronRight" :size="10" class="pks-chevron" :class="{ 'is-open': expandedMatches.has(match.matchId) }" />
                    </button>
                  </div>
                </label>

                <template v-if="match.rest.length && expandedMatches.has(match.matchId)">
                  <label v-for="c in match.rest" :key="legKey(c)" class="pks-row is-sub" :class="{ 'is-selected': isSelected(c) }">
                    <input type="checkbox" class="pks-row__check" :checked="isSelected(c)" @change="emit('toggle', c)" />
                    <div class="pks-row__main">
                      <span class="pks-row__market cm-truncate">{{ c.market }}</span>
                      <p class="pks-row__pick cm-truncate">
                        <PickCrest :item="c" :home="c.homeName" :away="c.awayName" :league="c.league" :size="14" />{{ c.pick }}
                        <span class="pks-row__probability" title="Probabilité selon le moteur">{{ impliedProbability(c.odds) }}%</span>
                      </p>
                    </div>
                    <div class="pks-row__right">
                      <span v-if="c.marketOdds" class="pks-row__market-odds cm-numeric">marché @ {{ formatOdds(c.marketOdds) }}</span>
                      <span class="cm-pill is-section pks-row__odds">@ {{ formatOdds(c.odds) }}</span>
                    </div>
                  </label>
                </template>
              </div>
            </div>
          </div>
          </template>
        </section>
      </div>
    </div>

    <!-- La puce de tête de carte (déclarée après le corps : sans incidence sur le rendu). -->
    <template #actions>
      <span v-if="scanned && filteredPicks.length" class="cm-chip is-section cm-numeric">{{ filteredPicks.length }} paris · {{ matchCount }} rencontres</span>
    </template>
  </AppCard>
</template>

<style scoped>
/* La carte se règle sur SA largeur (page entière ou panneau étroit). */
.pks {
  container: pks / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pks__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pks__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.pks__note :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.pks__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ------------------------------------------------- un championnat */
.pks-league {
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  overflow: hidden;
  transition: border-color var(--cm-transition);
}

.pks-league.is-open {
  border-color: rgba(var(--cm-section-rgb) / 0.3);
}

.pks-league__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background var(--cm-transition);
}

.pks-league__header:hover {
  background: var(--cm-surface-hover);
}

.pks-league.is-open .pks-league__header {
  border-bottom: 1px solid var(--cm-border-soft);
}

.pks-league__count {
  margin-left: auto;
  min-width: 34px;
  padding: 2px 8px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.pks-chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.pks-chevron.is-open {
  transform: rotate(90deg);
  color: var(--cm-section);
}

.pks-league__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* ----------------------------------------------------- une rencontre */
.pks-match {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pks-match__card {
  --mcard-aside: 92px;
}

/* Les paris du match, en retrait sous sa carte, reliés par un filet. */
.pks-match__picks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 2px solid rgba(var(--cm-section-rgb) / 0.22);
}

.pks-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  cursor: pointer;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.pks-row:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

/* Coché : la ligne prend la couleur de la section. */
.pks-row.is-selected {
  border-color: rgba(var(--cm-section-rgb) / 0.5);
  background: linear-gradient(90deg, var(--cm-section-soft), transparent 70%), var(--cm-surface);
}

.pks-row.is-sub {
  margin-left: 18px;
}

.pks-row__check {
  width: 17px;
  height: 17px;
  margin: 0;
  accent-color: var(--cm-section);
  cursor: pointer;
}

.pks-row__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pks-row__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.pks-row__pick {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La probabilité du moteur, en vert comme l'anneau de l'onglet Analyse IA. */
.pks-row__probability {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-size: 10.5px;
  font-weight: 700;
  vertical-align: middle;
}

.pks-row__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pks-row__market-odds {
  font-size: 11px;
  white-space: nowrap;
  color: var(--cm-text-muted);
}

.pks-row__odds {
  min-width: 58px;
}

.pks-row__expand {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--cm-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color var(--cm-transition), color var(--cm-transition), background var(--cm-transition);
}

.pks-row__expand:hover {
  border-color: var(--cm-section);
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

/* Panneau étroit : la cote et les commandes passent sous le pronostic. */
@container pks (max-width: 520px) {
  .pks-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .pks-row__right {
    grid-column: 2;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .pks-row.is-sub {
    margin-left: 8px;
  }

  .pks-league__body {
    padding: 10px 8px;
  }
}
</style>
