<script setup>
import { computed } from 'vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { formatShortDay } from '@/utils/format.js';

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  rows: { type: Array, default: () => [] },
  // Table officielle relevée chez FotMob, ou calculée sur les résultats du
  // magasin. La différence se dit : seule l'officielle porte les pénalités
  // de points et les départages du règlement.
  official: { type: Boolean, default: false },
  fetchedAt: { type: String, default: null },
  seasonLabel: { type: String, default: null },
  // Matchs reportés de la saison, pas encore joués (cf. standings.controller.js) :
  // { homeName, awayName, originalDate, newDate|null }. Chaque ligne porte en
  // plus `postponedMatches`, le nombre de ceux qui concernent l'équipe.
  postponed: { type: Array, default: () => [] }
});

function zoneClass(description) {
  if (!description) return '';
  const text = description.toLowerCase();
  if (text.includes('champions league') || text.includes('libertadores')) return 'standings-row--ucl';
  if (text.includes('europa') || text.includes('conference') || text.includes('sudamericana')) return 'standings-row--uel';
  if (text.includes('relegation')) return 'standings-row--relegation';
  if (text.includes('playoff') || text.includes('promotion') || text.includes('championship')) return 'standings-row--playoff';
  return '';
}

const hasDeductions = computed(() => props.rows.some((row) => row.deduction));

const sourceLine = computed(() => {
  const saison = props.seasonLabel ? ` — saison ${props.seasonLabel}` : '';
  if (props.official) {
    const quand = props.fetchedAt ? `, relevé le ${new Date(props.fetchedAt).toLocaleDateString('fr-FR')}` : '';
    return `Classement officiel (FotMob)${saison}${quand}`;
  }
  return `Classement calculé sur les résultats du magasin${saison} — sans pénalités ni départages du règlement`;
});
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération du classement…" />
  <EmptyState v-else-if="error" icon="alert" title="Classement indisponible" :description="error" />
  <EmptyState v-else-if="rows.length === 0" icon="matches" title="Aucun classement trouvé" />

  <div v-else class="standings">
    <p class="standings__source cm-text-muted">{{ sourceLine }}</p>
    <div class="standings__head">
      <span class="standings__rank">#</span>
      <span class="standings__team">Équipe</span>
      <span>J</span>
      <span>G</span>
      <span>N</span>
      <span>P</span>
      <span>Diff</span>
      <span>Pts</span>
    </div>
    <div class="standings__body">
      <div v-for="row in rows" :key="row.teamId ?? row.teamName" class="standings-row" :class="zoneClass(row.description)" :title="row.description ?? ''">
        <span class="standings__rank cm-numeric">{{ row.rank }}</span>
        <span class="standings__team">
          <span class="cm-truncate">{{ row.teamName }}</span>
          <span v-if="row.deduction" class="standings__deduction" :title="`Pénalité de ${Math.abs(row.deduction)} point(s)`">{{ row.deduction > 0 ? '−' : '' }}{{ Math.abs(row.deduction) }}</span>
          <span
            v-if="row.postponedMatches"
            class="standings__postponed"
            :title="`${row.postponedMatches} match(s) en retard : reporté(s), pas encore joué(s) (détail sous le tableau)`"
          ><AppIcon name="clock" :size="10" />{{ row.postponedMatches }}</span>
        </span>
        <span class="cm-numeric">{{ row.played }}</span>
        <span class="cm-numeric">{{ row.won }}</span>
        <span class="cm-numeric">{{ row.drawn }}</span>
        <span class="cm-numeric">{{ row.lost }}</span>
        <span class="cm-numeric" :class="row.goalDiff >= 0 ? 'cm-positive' : 'cm-negative'">{{ row.goalDiff >= 0 ? '+' : '' }}{{ row.goalDiff }}</span>
        <span class="cm-numeric standings__points">{{ row.points }}</span>
      </div>
    </div>
    <div v-if="postponed.length" class="standings__postponed-list">
      <p class="standings__postponed-title">Matchs reportés, pas encore joués</p>
      <ul>
        <li v-for="p in postponed" :key="`${p.originalDate}-${p.homeName}-${p.awayName}`">
          <span class="cm-numeric standings__postponed-date">{{ formatShortDay(p.originalDate) }}</span>
          <span>{{ p.homeName }} - {{ p.awayName }}</span>
          <span class="cm-text-muted">{{ p.newDate ? `re-programmé le ${formatShortDay(p.newDate)}` : 'nouvelle date à venir' }}</span>
        </li>
      </ul>
    </div>
    <div class="standings__legend">
      <span><i class="standings__dot standings__dot--ucl" />Compétition continentale majeure</span>
      <span><i class="standings__dot standings__dot--uel" />Autre coupe continentale</span>
      <span><i class="standings__dot standings__dot--playoff" />Playoffs / promotion</span>
      <span><i class="standings__dot standings__dot--relegation" />Relégation</span>
      <span v-if="hasDeductions">−N : pénalité de points appliquée par la fédération</span>
      <span v-if="postponed.length" class="standings__legend-postponed"><AppIcon name="clock" :size="11" />N : match(s) en retard, reporté(s) et pas encore joué(s)</span>
    </div>
  </div>
</template>

<style scoped>
.standings__source {
  margin: 0 0 8px;
  padding: 0 10px;
  font-size: 11px;
}

.standings__head {
  display: grid;
  grid-template-columns: 28px 1fr repeat(4, 24px) 44px 40px;
  gap: 8px;
  padding: 0 10px 8px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  border-bottom: 1px solid var(--cm-border-soft);
}

.standings__head span:not(.standings__team) {
  text-align: center;
}

.standings__body {
  display: flex;
  flex-direction: column;
}

.standings-row {
  display: grid;
  grid-template-columns: 28px 1fr repeat(4, 24px) 44px 40px;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--cm-border-soft);
  border-left: 3px solid transparent;
  font-size: 12.5px;
}

.standings-row span:not(.standings__team) {
  text-align: center;
}

.standings-row--ucl {
  border-left-color: var(--cm-accent);
}
.standings-row--uel {
  border-left-color: var(--cm-info);
}
.standings-row--playoff {
  border-left-color: var(--cm-success, #2ad572);
}
.standings-row--relegation {
  border-left-color: var(--cm-danger);
}

/* Le nom se tronque, jamais les pastilles qui le suivent (pénalité, match en retard). */
.standings-row .standings__team {
  display: flex;
  align-items: center;
  min-width: 0;
  font-weight: 500;
}

.standings-row .standings__team > span {
  text-align: left;
}

.standings__deduction {
  flex-shrink: 0;
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cm-danger);
}

.standings__points {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.standings__postponed {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.standings__legend-postponed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--cm-warning);
}

.standings__postponed-list {
  margin: 10px 10px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--cm-warning-soft);
  font-size: 11.5px;
}

.standings__postponed-title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--cm-warning);
}

.standings__postponed-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.standings__postponed-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.standings__postponed-date {
  font-weight: 600;
}

.standings__legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.standings__dot--playoff {
  background: var(--cm-success, #2ad572);
}
</style>
