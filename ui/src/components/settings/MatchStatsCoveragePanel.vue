<script setup>
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Couverture des statistiques de match, championnat par championnat : les
 * totaux en chiffres clés, un tableau avec une barre de couverture par
 * compétition, les saisons en base, la source. Refonte visuelle du
 * 01/10/2026 (guide ui/DESIGN.md) : aucune donnée n'a bougé.
 */
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
      <!-- 1. Les totaux : la couverture en vedette, les comptes à côté. -->
      <div class="cm-kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Couverture</span>
          <span class="cm-kpi__value">{{ coverage.totals.coverage }} %</span>
          <span class="cm-kpi__detail">des matchs joués ont leurs statistiques</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Matchs avec statistiques</span>
          <span class="cm-kpi__value">{{ coverage.totals.withStats.toLocaleString('fr-FR') }}</span>
          <span class="cm-kpi__detail">match(s) sur {{ coverage.totals.finished.toLocaleString('fr-FR') }} ont leurs statistiques</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Avec les joueurs</span>
          <span class="cm-kpi__value">{{ coverage.totals.withPlayers.toLocaleString('fr-FR') }}</span>
          <span class="cm-kpi__detail">dont avec les statistiques individuelles des joueurs</span>
        </div>
      </div>

      <!-- 2. Championnat par championnat : la barre, les comptes, les champs. -->
      <div class="cm-table-wrap">
        <table class="cm-table stats-coverage__table">
          <thead>
            <tr>
              <th>Championnat</th>
              <th class="is-left stats-coverage__th-bar">Couverture</th>
              <th title="Matchs avec statistiques / matchs joués">Matchs</th>
              <th title="Nombre moyen de champs renseignés par match">Champs</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in coverage.leagues" :key="row.league">
              <td class="is-strong stats-coverage__league-cell">
                <span class="stats-coverage__league">{{ row.league }}</span>
                <span v-if="!row.supported" class="cm-chip stats-coverage__flag" title="Compétition que FotMob ne suit pas pour l'appli">hors source</span>
              </td>
              <td class="is-left">
                <div class="stats-coverage__cover">
                  <span class="cm-bar stats-coverage__bar">
                    <span class="cm-bar__fill stats-coverage__fill" :class="`is-${toneOf(row.coverage)}`" :style="{ width: `${row.coverage}%` }" />
                  </span>
                  <span class="cm-numeric stats-coverage__pct" :class="`is-${toneOf(row.coverage)}`">{{ row.coverage }} %</span>
                </div>
              </td>
              <td class="cm-numeric">{{ row.withStats }}/{{ row.finished }}</td>
              <td class="cm-numeric cm-text-muted">{{ row.averageFields }} champs</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 3. Les saisons en base. -->
      <div v-if="coverage.seasons?.length" class="stats-coverage__seasons">
        <p class="cm-group-title">Historique en base</p>
        <div class="stats-coverage__season-list">
          <span v-for="s in coverage.seasons" :key="s.season" class="cm-chip stats-coverage__season">
            <strong class="cm-numeric">{{ s.season }}</strong>
            {{ s.matches.toLocaleString('fr-FR') }} matchs · {{ s.leagues }} champ.
          </span>
        </div>
      </div>

      <!-- 4. D'où ça vient. -->
      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="cm-note__title">Source</p>
          <p class="cm-note__text stats-coverage__hint">
            Complété par l'actualisation automatique depuis FotMob, source gratuite et sans clé. Les champs que la source ne publie pas
            pour un match restent vides plutôt que d'être estimés. Calculé sur le calendrier de saison : une compétition ajoutée
            récemment n'y compte que les journées vues depuis son ajout.
          </p>
        </div>
      </div>
    </template>

    <div v-else class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title stats-coverage__title--danger">Couverture</p>
        <p class="cm-note__text stats-coverage__hint">Couverture indisponible.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-coverage {
  /* Se règle sur SA largeur : la barre s'élargit quand la place existe. */
  container: coverage / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------------------------------------------------------------- tableau */
.stats-coverage__table td {
  font-size: 12.5px;
}

.stats-coverage__th-bar {
  min-width: 180px;
}

.stats-coverage__league-cell {
  max-width: 260px;
}

.stats-coverage__league {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.stats-coverage__flag {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 10px;
  vertical-align: middle;
}

.stats-coverage__cover {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}

.stats-coverage__bar {
  flex: 1;
  min-width: 80px;
}

/* Les couleurs sémantiques : la couverture est bonne, partielle ou faible
   (la barre prend la couleur en fond, le pourcentage en texte). */
.stats-coverage__fill.is-good {
  background: var(--cm-accent);
}

.stats-coverage__fill.is-partial {
  background: var(--cm-warning);
}

.stats-coverage__fill.is-poor {
  background: var(--cm-danger);
}

.stats-coverage__pct {
  flex: 0 0 auto;
  min-width: 44px;
  text-align: right;
  font-size: 12px;
  font-weight: 700;
}

.stats-coverage__pct.is-good {
  color: var(--cm-accent);
}

.stats-coverage__pct.is-partial {
  color: var(--cm-warning);
}

.stats-coverage__pct.is-poor {
  color: var(--cm-danger);
}

@container coverage (min-width: 760px) {
  .stats-coverage__th-bar {
    min-width: 260px;
  }

  .stats-coverage__cover {
    min-width: 240px;
  }
}

/* ---------------------------------------------------------------- saisons */
.stats-coverage__seasons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stats-coverage__season-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stats-coverage__season {
  gap: 6px;
  font-weight: 500;
}

.stats-coverage__season strong {
  font-weight: 800;
  color: var(--cm-text-primary);
}

.stats-coverage__hint {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.stats-coverage__title--danger {
  color: var(--cm-danger);
}
</style>
