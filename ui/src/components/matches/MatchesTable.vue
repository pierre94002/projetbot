<script setup>
import { computed, reactive, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import TeamAvatar from './TeamAvatar.vue';
import FormBadges from './FormBadges.vue';
import LeagueBadge from './LeagueBadge.vue';
import { formatOdds, formatTime, formatDay } from '@/utils/format.js';
import { groupMatchesByLeague, groupMatchesByDate } from '@/utils/leagueDisplay.js';
import { liveNow } from '@/utils/liveClock.js';
import { computeMatchStatus } from '@/utils/matchStatus.js';

const props = defineProps({
  matches: { type: Array, required: true },
  selectedMatchId: { type: String, default: null },
  formByMatchId: { type: Object, default: () => ({}) },
  aiAnalysisByMatchId: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['select', 'team-click', 'view-standings', 'deselect']);

// Statut estimé par l'heure du coup d'envoi (cf. matchStatus.js) — aucun flux
// de score en direct dans l'app. `liveNow` (partagée, un seul timer pour
// toute l'app) fait recalculer ce statut toutes les 30s sans recharger la
// page (ex. la ligue chinoise qui se joue à une heure décalée passait
// inaperçue, repliée dans une ligue fermée).
function matchStatus(match) {
  return computeMatchStatus(match.commenceTime, liveNow.value);
}
function isLive(match) {
  return matchStatus(match) === 'live';
}
function isFinished(match) {
  return matchStatus(match) === 'finished';
}

// Ensemble des championnats OUVERTS (pas fermés) : vide par défaut, donc
// tous les championnats démarrent fermés tant qu'on ne clique pas dessus.
const expandedLeagues = reactive(new Set());
// Idem pour les groupes de dates À L'INTÉRIEUR d'un championnat — clé
// composite "championnat|jour" puisque la même date apparaît dans plusieurs
// championnats et doit se replier indépendamment dans chacun.
const expandedDates = reactive(new Set());
const groupedMatches = computed(() => groupMatchesByLeague(props.matches));

function dateGroupKey(league, dayKey) {
  return `${league}|${dayKey}`;
}

function matchDayKey(match) {
  return match.commenceTime ? match.commenceTime.slice(0, 10) : 'Date inconnue';
}

// Raccourci depuis le badge "N EN DIRECT" : ouvre le championnat ET le(s)
// groupe(s) de date des matchs en cours (pas besoin de les chercher soi-même
// dans une liste parfois longue), et sélectionne directement le premier pour
// afficher son analyse — cf. la demande d'origine, la ligue chinoise en
// direct passait inaperçue repliée derrière ce badge.
function showLiveMatches(group) {
  expandedLeagues.add(group.league);
  const liveMatches = group.matches.filter(isLive);
  for (const match of liveMatches) {
    expandedDates.add(dateGroupKey(group.league, matchDayKey(match)));
  }
  if (liveMatches[0]) emit('select', liveMatches[0]);
}

// Fermer manuellement le championnat du match actuellement sélectionné doit
// aussi désélectionner ce match (donc masquer son analyse) — un match ne
// doit jamais rester "affiché" alors que son championnat est fermé.
function toggleCollapse(league) {
  if (expandedLeagues.has(league)) {
    expandedLeagues.delete(league);
    const closesSelectedMatch = props.matches.some((m) => m.league === league && m.matchId === props.selectedMatchId);
    if (closesSelectedMatch) emit('deselect');
  } else {
    expandedLeagues.add(league);
  }
}

// Même principe que toggleCollapse, mais pour un groupe de dates : le replier
// alors qu'il contient le match sélectionné désélectionne ce match.
function toggleDateCollapse(league, dayKey, dayMatches) {
  const key = dateGroupKey(league, dayKey);
  if (expandedDates.has(key)) {
    expandedDates.delete(key);
    const closesSelectedMatch = dayMatches.some((m) => m.matchId === props.selectedMatchId);
    if (closesSelectedMatch) emit('deselect');
  } else {
    expandedDates.add(key);
  }
}

// Un match sélectionné (ex. arrivée directe sur /matches/:id, ou rechargement
// de page) ne doit jamais rester "affiché" (analysé à droite) sans que son
// championnat ET son groupe de date soient ouverts — sinon on voit une
// analyse sans savoir à quel match elle correspond dans une liste repliée.
watch(
  () => [props.selectedMatchId, props.matches],
  () => {
    const match = props.matches.find((m) => m.matchId === props.selectedMatchId);
    if (match) {
      expandedLeagues.add(match.league);
      expandedDates.add(dateGroupKey(match.league, matchDayKey(match)));
    }
  },
  { immediate: true }
);

function formatDayHeader(dayKey) {
  return dayKey === 'Date inconnue' ? dayKey : formatDay(dayKey);
}
</script>

<template>
  <div class="match-list">
    <div v-for="group in groupedMatches" :key="group.league" class="league-group">
      <div
        class="league-group__header"
        role="button"
        tabindex="0"
        @click="toggleCollapse(group.league)"
        @keydown.enter="toggleCollapse(group.league)"
      >
        <LeagueBadge :league="group.league" />
        <button
          v-if="group.matches.some(isLive)"
          type="button"
          class="league-group__live"
          title="Voir le(s) match(s) en direct"
          @click.stop="showLiveMatches(group)"
        >
          <span class="league-group__live-dot"></span>{{ group.matches.filter(isLive).length }} en direct
        </button>
        <span v-if="group.matches.some(isFinished)" class="league-group__finished">
          {{ group.matches.filter(isFinished).length }} terminé(s)
        </span>
        <span class="league-group__count cm-text-muted cm-numeric">{{ group.matches.length }}</span>
        <button type="button" class="league-group__standings-link" @click.stop="$emit('view-standings', group.league)">
          Classement
        </button>
        <AppIcon
          name="chevronRight"
          :size="14"
          class="league-group__chevron"
          :class="{ 'league-group__chevron--collapsed': expandedLeagues.has(group.league) }"
        />
      </div>

      <div v-if="expandedLeagues.has(group.league)" class="league-group__matches">
        <template v-for="dateGroup in groupMatchesByDate(group.matches)" :key="dateGroup.dayKey">
          <div
            class="date-group__header"
            role="button"
            tabindex="0"
            @click="toggleDateCollapse(group.league, dateGroup.dayKey, dateGroup.matches)"
            @keydown.enter="toggleDateCollapse(group.league, dateGroup.dayKey, dateGroup.matches)"
          >
            <span class="date-group__label cm-truncate">{{ formatDayHeader(dateGroup.dayKey) }}</span>
            <span class="date-group__count cm-text-muted cm-numeric">{{ dateGroup.matches.length }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="date-group__chevron"
              :class="{ 'date-group__chevron--collapsed': expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey)) }"
            />
          </div>
          <template v-if="expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey))">
            <div
              v-for="match in dateGroup.matches"
              :key="match.matchId"
              class="match-row"
              :class="{ 'match-row--active': match.matchId === selectedMatchId, 'match-row--live': isLive(match), 'match-row--finished': isFinished(match) }"
              role="button"
              tabindex="0"
              @click="$emit('select', match)"
              @keydown.enter="$emit('select', match)"
              @keydown.space.prevent="$emit('select', match)"
            >
              <span class="match-row__time cm-numeric" :class="{ 'cm-text-muted': !isLive(match) && !isFinished(match) }">
                <span v-if="isLive(match)" class="match-row__live">
                  <span class="match-row__live-dot"></span>DIRECT
                </span>
                <span v-else-if="isFinished(match)" class="match-row__finished">TERMINÉ</span>
                <template v-else>{{ formatTime(match.commenceTime) }}</template>
                <span v-if="aiAnalysisByMatchId[match.matchId]" class="match-row__ai-badge" title="Analyse IA disponible pour ce match">
                  <AppIcon name="bolt" :size="9" />IA
                </span>
              </span>

              <span class="match-row__teams">
                <span class="match-row__team">
                  <TeamAvatar :name="match.home" />
                  <button type="button" class="match-row__team-name cm-truncate" @click.stop="$emit('team-click', { name: match.home, league: match.league, matchId: match.matchId })">
                    {{ match.home }}
                  </button>
                  <FormBadges v-if="formByMatchId[match.matchId]" :form="formByMatchId[match.matchId].home?.form" class="match-row__form" />
                </span>
                <span class="match-row__team">
                  <TeamAvatar :name="match.away" />
                  <button type="button" class="match-row__team-name cm-truncate" @click.stop="$emit('team-click', { name: match.away, league: match.league, matchId: match.matchId })">
                    {{ match.away }}
                  </button>
                  <FormBadges v-if="formByMatchId[match.matchId]" :form="formByMatchId[match.matchId].away?.form" class="match-row__form" />
                </span>
              </span>

              <span class="match-row__odds">
                <span class="match-row__odd">{{ formatOdds(match.marketOdds?.odds1) }}</span>
                <span class="match-row__odd match-row__odd--draw">{{ formatOdds(match.marketOdds?.oddsDraw) }}</span>
                <span class="match-row__odd">{{ formatOdds(match.marketOdds?.odds2) }}</span>
              </span>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-list {
  display: flex;
  flex-direction: column;
  max-height: 600px;
  overflow-y: auto;
}

.league-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.league-group__header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 14px;
  background: var(--cm-surface-alt);
  border: none;
  cursor: pointer;
  text-align: left;
}

.league-group__count {
  font-size: 11px;
}

.league-group__live {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: none;
  border-radius: 999px;
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 10px;
  font-family: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: pointer;
}

.league-group__live:hover {
  background: var(--cm-danger);
  color: var(--cm-bg);
}

.league-group__live:hover .league-group__live-dot {
  background: var(--cm-bg);
}

.league-group__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

.league-group__finished {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.league-group__standings-link {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cm-accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.league-group__standings-link:hover {
  color: var(--cm-accent-strong);
}

.league-group__header:focus-visible {
  outline: 2px solid var(--cm-accent);
  outline-offset: -2px;
}

.league-group__chevron {
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.league-group__chevron--collapsed {
  transform: rotate(-90deg);
}

.league-group__matches {
  display: flex;
  flex-direction: column;
}

.date-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 14px;
  background: none;
  border: none;
  border-top: 1px solid var(--cm-border-soft);
  cursor: pointer;
  text-align: left;
}

.league-group__matches .date-group__header:first-child {
  border-top: none;
}

.date-group__header:hover {
  background: var(--cm-surface-hover);
}

.date-group__header:focus-visible {
  outline: 2px solid var(--cm-accent);
  outline-offset: -2px;
}

.date-group__label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  color: var(--cm-text-muted);
  flex: 1;
}

.date-group__count {
  font-size: 10.5px;
}

.date-group__chevron {
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.date-group__chevron--collapsed {
  transform: rotate(-90deg);
}

.match-row {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 14px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--cm-border-soft);
  cursor: pointer;
  text-align: left;
  transition: background var(--cm-transition);
}

.date-group__header + .match-row {
  border-top: none;
}

.match-row:hover {
  background: var(--cm-surface-hover);
}

.match-row:focus-visible {
  outline: 2px solid var(--cm-accent);
  outline-offset: -2px;
}

.match-row--active {
  background: var(--cm-accent-soft);
}

.match-row--live {
  background: var(--cm-danger-soft);
}

.match-row--live:hover {
  background: var(--cm-danger-soft);
  filter: brightness(1.15);
}

.match-row--finished {
  background: var(--cm-warning-soft);
}

.match-row--finished:hover {
  background: var(--cm-warning-soft);
  filter: brightness(1.15);
}

.match-row__time {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  font-size: 11px;
}

.match-row__ai-badge {
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

.match-row__live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--cm-danger);
  letter-spacing: 0.2px;
}

.match-row__finished {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--cm-warning);
  letter-spacing: 0.2px;
}

.match-row__live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

@keyframes cm-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.match-row__teams {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.match-row__team {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--cm-text-primary);
}

.match-row__team-name {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.match-row__team-name:hover {
  text-decoration: underline;
  color: var(--cm-accent);
}

.match-row__form {
  flex-shrink: 0;
}

.match-row__odds {
  display: flex;
  gap: 6px;
}

.match-row__odd {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 5px 0;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.match-row__odd--draw {
  color: var(--cm-text-secondary);
}

.match-row--active .match-row__odd {
  background: var(--cm-surface);
}
</style>
