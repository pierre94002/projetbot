<script setup>
import { computed } from 'vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';

/**
 * Buteurs, passeurs et clean sheets d'une compétition.
 *
 * Une seule colonne de valeur, nommée selon la liste affichée : la structure
 * du tableau est la même dans les trois cas, seul l'intitulé change. En
 * séparer trois composants aurait triplé le même balisage.
 *
 * Les minutes sont montrées à côté du total parce qu'elles le qualifient :
 * sept buts en 386 minutes et sept buts en 630 minutes ne disent pas la même
 * chose, et c'est exactement ce qu'un classement de buteurs masque.
 */
const props = defineProps({
  kind: { type: String, default: 'scorers' }, // scorers | assists | cleanSheets
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null }
});

const LABELS = {
  scorers: { value: 'Buts', empty: 'Aucun buteur relevé' },
  assists: { value: 'PD', empty: 'Aucune passe décisive relevée' },
  cleanSheets: { value: 'CS', empty: 'Aucun clean sheet relevé' }
};

const label = computed(() => LABELS[props.kind] ?? LABELS.scorers);
const perMatch = (row) => (row.played > 0 ? (row.value / row.played).toFixed(2) : '—');
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération du classement…" />
  <EmptyState v-else-if="error" icon="alert" title="Classement indisponible" :description="error" />
  <EmptyState v-else-if="rows.length === 0" icon="matches" :title="label.empty" />

  <div v-else class="leaders">
    <div class="leaders__head">
      <span class="leaders__rank">#</span>
      <span class="leaders__player">Joueur</span>
      <span class="leaders__team">Équipe</span>
      <span>J</span>
      <span>Min</span>
      <span>⌀</span>
      <span>{{ label.value }}</span>
    </div>
    <div class="leaders__body">
      <div v-for="(row, index) in rows" :key="row.playerId" class="leaders-row">
        <span class="leaders__rank cm-numeric">{{ index + 1 }}</span>
        <span class="leaders__player cm-truncate">{{ row.name }}</span>
        <span class="leaders__team cm-truncate cm-text-muted">{{ row.team }}</span>
        <span class="cm-numeric">{{ row.played }}</span>
        <span class="cm-numeric cm-text-muted">{{ row.minutes }}</span>
        <span class="cm-numeric cm-text-muted">{{ perMatch(row) }}</span>
        <span class="cm-numeric leaders__value">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.leaders {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.leaders__head,
.leaders-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1.6fr) minmax(0, 1.2fr) 34px 52px 46px 46px;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
}

.leaders__head {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--cm-text-muted);
}

.leaders__head > span:not(.leaders__rank):not(.leaders__player):not(.leaders__team),
.leaders-row > span.cm-numeric {
  text-align: right;
}

.leaders-row {
  border-radius: 8px;
  background: var(--cm-surface-2);
}

.leaders-row:nth-child(odd) {
  background: var(--cm-surface-1);
}

.leaders__value {
  font-weight: 600;
  color: var(--cm-accent);
}

.leaders__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 60vh;
  overflow-y: auto;
}

@media (max-width: 640px) {
  /* Les minutes et la moyenne sont les premières à sauter : le nom et le
     total sont ce qu'on vient chercher. */
  .leaders__head,
  .leaders-row {
    grid-template-columns: 24px minmax(0, 1.6fr) minmax(0, 1fr) 30px 42px;
  }

  .leaders__head > span:nth-child(5),
  .leaders__head > span:nth-child(6),
  .leaders-row > span:nth-child(5),
  .leaders-row > span:nth-child(6) {
    display: none;
  }
}
</style>
