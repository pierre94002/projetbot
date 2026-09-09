<script setup>
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';

defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  rows: { type: Array, default: () => [] }
});

function zoneClass(description) {
  if (!description) return '';
  const text = description.toLowerCase();
  if (text.includes('champions league')) return 'standings-row--ucl';
  if (text.includes('europa') || text.includes('conference')) return 'standings-row--uel';
  if (text.includes('relegation')) return 'standings-row--relegation';
  return '';
}
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération du classement…" />
  <EmptyState v-else-if="error" icon="alert" title="Classement indisponible" :description="error" />
  <EmptyState v-else-if="rows.length === 0" icon="matches" title="Aucun classement trouvé" />

  <div v-else class="standings">
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
      <div v-for="row in rows" :key="row.teamId" class="standings-row" :class="zoneClass(row.description)">
        <span class="standings__rank cm-numeric">{{ row.rank }}</span>
        <span class="standings__team cm-truncate">{{ row.teamName }}</span>
        <span class="cm-numeric">{{ row.played }}</span>
        <span class="cm-numeric">{{ row.won }}</span>
        <span class="cm-numeric">{{ row.drawn }}</span>
        <span class="cm-numeric">{{ row.lost }}</span>
        <span class="cm-numeric" :class="row.goalDiff >= 0 ? 'cm-positive' : 'cm-negative'">{{ row.goalDiff >= 0 ? '+' : '' }}{{ row.goalDiff }}</span>
        <span class="cm-numeric standings__points">{{ row.points }}</span>
      </div>
    </div>
    <div class="standings__legend">
      <span><i class="standings__dot standings__dot--ucl" />Ligue des Champions</span>
      <span><i class="standings__dot standings__dot--uel" />Coupe d'Europe</span>
      <span><i class="standings__dot standings__dot--relegation" />Relégation</span>
    </div>
  </div>
</template>

<style scoped>
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
.standings-row--relegation {
  border-left-color: var(--cm-danger);
}

.standings__team {
  font-weight: 500;
}

.standings__points {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.standings__legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.standings__legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.standings__dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  display: inline-block;
}
.standings__dot--ucl {
  background: var(--cm-accent);
}
.standings__dot--uel {
  background: var(--cm-info);
}
.standings__dot--relegation {
  background: var(--cm-danger);
}
</style>
