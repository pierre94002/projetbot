<script setup>
defineProps({
  coverage: { type: Object, default: null }
});

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
          <span v-if="!row.supported" class="stats-coverage__flag" title="Compétition que FotMob ne suit pas pour l'appli">hors source</span>
        </li>
      </ul>

      <div v-if="coverage.seasons?.length" class="stats-coverage__seasons">
        <span class="stats-coverage__seasons-label">Historique en base</span>
        <span v-for="s in coverage.seasons" :key="s.season" class="stats-coverage__season">
          <strong>{{ s.season }}</strong>
          {{ s.matches.toLocaleString('fr-FR') }} matchs · {{ s.leagues }} champ.
        </span>
      </div>

      <p class="cm-text-muted stats-coverage__hint">
        Complété par l'actualisation automatique depuis FotMob, source gratuite et sans clé. Les champs que la source ne publie pas
        pour un match restent vides plutôt que d'être estimés. Calculé sur le calendrier de saison : une compétition ajoutée
        récemment n'y compte que les journées vues depuis son ajout.
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

.stats-coverage__seasons {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.stats-coverage__seasons-label {
  color: var(--cm-text-muted);
}

.stats-coverage__season strong {
  font-family: var(--cm-font-mono);
  margin-right: 4px;
}
</style>
