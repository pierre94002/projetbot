<script setup>
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  coverage: { type: Object, default: null },
  refreshing: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh']);

/** Vert au-delà de 90 %, orange à partir de 50 %, rouge en dessous. */
function toneOf(percent) {
  if (percent >= 90) return 'good';
  if (percent >= 50) return 'partial';
  return 'poor';
}
</script>

<template>
  <div class="stats-coverage">
    <template v-if="coverage">
      <div class="stats-coverage__header">
        <div>
          <span class="stats-coverage__total">
            {{ coverage.totals.withStats.toLocaleString('fr-FR') }} match(s) sur
            {{ coverage.totals.finished.toLocaleString('fr-FR') }} ont leurs statistiques
            <strong>({{ coverage.totals.coverage }} %)</strong>
          </span>
          <p class="cm-text-muted stats-coverage__sub">
            dont {{ coverage.totals.withPlayers.toLocaleString('fr-FR') }} avec les statistiques individuelles des joueurs
          </p>
        </div>
        <AppButton variant="ghost" size="sm" :loading="refreshing || coverage.refresh?.running" @click="emit('refresh')">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          {{ coverage.refresh?.running ? 'En cours…' : 'Compléter maintenant' }}
        </AppButton>
      </div>

      <ul class="stats-coverage__list">
        <li v-for="row in coverage.leagues" :key="row.league" class="stats-coverage__row">
          <span class="stats-coverage__league">{{ row.league }}</span>
          <span class="stats-coverage__bar">
            <span class="stats-coverage__fill" :class="`stats-coverage__fill--${toneOf(row.coverage)}`" :style="{ width: `${row.coverage}%` }" />
          </span>
          <span class="stats-coverage__figures">
            {{ row.withStats }}/{{ row.finished }}
            <span class="cm-text-muted">· {{ row.averageFields }} champs</span>
          </span>
          <span v-if="!row.supported" class="stats-coverage__flag" title="Championnat absent de la source ESPN">hors source</span>
        </li>
      </ul>

      <p v-if="coverage.refresh?.last?.finishedAt" class="cm-text-muted stats-coverage__hint">
        Dernier passage le {{ formatDateTime(coverage.refresh.last.finishedAt) }} :
        {{ coverage.refresh.last.merged }} match(s) complété(s).
        <template v-if="coverage.refresh.last.unmatched">
          {{ coverage.refresh.last.unmatched }} rencontre(s) introuvable(s) chez la source.
        </template>
      </p>
      <p class="cm-text-muted stats-coverage__hint">
        Complété automatiquement en fond depuis l'API publique d'ESPN — source gratuite, sans clé ni quota, donc aucun
        coût à l'actualisation. Les champs que la source ne publie pas (xG, duels, grosses occasions) restent vides
        plutôt que d'être estimés.
      </p>
    </template>

    <p v-else class="cm-text-muted">Couverture indisponible.</p>
  </div>
</template>

<style scoped>
.stats-coverage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-coverage__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.stats-coverage__total {
  font-size: 13px;
}

.stats-coverage__sub {
  font-size: 11px;
  margin-top: 2px;
}

.stats-coverage__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  list-style: none;
  margin: 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--cm-border-soft);
}

.stats-coverage__row {
  display: grid;
  grid-template-columns: minmax(120px, 1.4fr) minmax(60px, 2fr) auto auto;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.stats-coverage__league {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-coverage__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--cm-surface-alt);
  overflow: hidden;
}

.stats-coverage__fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width var(--cm-transition);
}

.stats-coverage__fill--good {
  background: var(--cm-accent);
}

.stats-coverage__fill--partial {
  background: var(--cm-warning);
}

.stats-coverage__fill--poor {
  background: var(--cm-danger);
}

.stats-coverage__figures {
  font-family: var(--cm-font-mono);
  font-size: 11px;
  text-align: right;
  white-space: nowrap;
}

.stats-coverage__flag {
  font-size: 10px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.stats-coverage__hint {
  font-size: 11.5px;
  margin: 0;
}
</style>
