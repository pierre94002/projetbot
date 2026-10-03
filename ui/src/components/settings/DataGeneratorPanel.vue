<script setup>
import { ref } from 'vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { formatDateTime } from '@/utils/format.js';

/**
 * Les sources de données : une ligne par source avec son icône, sa date de
 * synchronisation, son état et son bouton ; les quotas en chiffres clés ;
 * puis le générateur de jeu de test. Refonte visuelle du 01/10/2026 (guide
 * ui/DESIGN.md) : aucune donnée ni action n'a bougé.
 */
const props = defineProps({
  fixtures: { type: Object, default: null },
  generating: { type: Boolean, default: false },
  refreshingOdds: { type: Boolean, default: false },
  refreshingCompetitions: { type: Boolean, default: false },
  lastOddsQuota: { type: Object, default: null },
  flashscoreStatus: { type: Object, default: null },
  refreshingFlashscore: { type: Boolean, default: false }
});

const emit = defineEmits(['generate', 'refresh-odds', 'refresh-competitions', 'refresh-flashscore']);

const count = ref(60);
</script>

<template>
  <div class="generator-panel">
    <template v-if="fixtures">
      <!-- 1. Les sources, une ligne chacune : icône, nom, date, état, action. -->
      <ul class="generator-panel__sources cm-stagger">
        <li class="source">
          <span class="cm-icon-box" :class="fixtures.odds ? 'is-accent' : 'is-danger'"><AppIcon name="percent" :size="17" /></span>
          <div class="source__body">
            <span class="source__name">Cotes marché (The Odds API)</span>
            <p v-if="fixtures.oddsLastSyncedAt" class="source__meta">Synchronisé le {{ formatDateTime(fixtures.oddsLastSyncedAt) }}</p>
          </div>
          <div class="source__actions">
            <StatusBadge :status="fixtures.odds ? 'analyzed' : 'rejected'" />
            <AppButton variant="ghost" size="sm" :loading="refreshingOdds" @click="emit('refresh-odds')">
              <template #icon><AppIcon name="refresh" :size="13" /></template>
              Actualiser
            </AppButton>
          </div>
        </li>

        <li class="source">
          <span class="cm-icon-box" :class="fixtures.competitions ? 'is-accent' : 'is-danger'"><AppIcon name="trophy" :size="17" /></span>
          <div class="source__body">
            <span class="source__name">Métadonnées compétitions (football-data.org)</span>
            <p v-if="fixtures.competitionsLastSyncedAt" class="source__meta">Synchronisé le {{ formatDateTime(fixtures.competitionsLastSyncedAt) }}</p>
          </div>
          <div class="source__actions">
            <StatusBadge :status="fixtures.competitions ? 'analyzed' : 'rejected'" />
            <AppButton variant="ghost" size="sm" :loading="refreshingCompetitions" @click="emit('refresh-competitions')">
              <template #icon><AppIcon name="refresh" :size="13" /></template>
              Actualiser
            </AppButton>
          </div>
        </li>

        <li class="source">
          <span class="cm-icon-box" :class="fixtures.sampleMatches ? 'is-accent' : 'is-danger'"><AppIcon name="database" :size="17" /></span>
          <div class="source__body">
            <span class="source__name">Jeu de données de test</span>
            <p class="source__meta">Matchs fictifs générés ci-dessous</p>
          </div>
          <div class="source__actions">
            <StatusBadge :status="fixtures.sampleMatches ? 'analyzed' : 'rejected'" />
          </div>
        </li>

        <li class="source">
          <span class="cm-icon-box" :class="flashscoreStatus ? 'is-accent' : 'is-danger'"><AppIcon name="activity" :size="17" /></span>
          <div class="source__body">
            <span class="source__name">Statistiques FlashScore (Apify, complément IA)</span>
            <p v-if="flashscoreStatus?.fetchedAt" class="source__meta">Actualisé le {{ formatDateTime(flashscoreStatus.fetchedAt) }}</p>
          </div>
          <div class="source__actions">
            <StatusBadge :status="flashscoreStatus ? 'analyzed' : 'rejected'" />
            <AppButton variant="ghost" size="sm" :loading="refreshingFlashscore" @click="emit('refresh-flashscore')">
              <template #icon><AppIcon name="refresh" :size="13" /></template>
              Actualiser
            </AppButton>
          </div>
        </li>
      </ul>

      <!-- 2. Les quotas et compteurs des sources payantes, en chiffres clés. -->
      <div v-if="lastOddsQuota || flashscoreStatus?.fetchedAt" class="cm-kpis">
        <div v-if="lastOddsQuota" class="cm-kpi is-section">
          <span class="cm-kpi__label">Quota The Odds API restant</span>
          <span class="cm-kpi__value">{{ lastOddsQuota.remaining ?? '—' }}</span>
          <span class="cm-kpi__detail">requêtes (plan gratuit, 500/mois)</span>
        </div>
        <template v-if="flashscoreStatus?.fetchedAt">
          <div class="cm-kpi">
            <span class="cm-kpi__label">Équipes FlashScore</span>
            <span class="cm-kpi__value">{{ flashscoreStatus.teamCount }}</span>
            <span class="cm-kpi__detail">équipe(s) avec stats</span>
          </div>
          <div class="cm-kpi">
            <span class="cm-kpi__label">Matchs FlashScore</span>
            <span class="cm-kpi__value">{{ flashscoreStatus.matchCount }}</span>
            <span class="cm-kpi__detail">match(s) scanné(s)</span>
          </div>
        </template>
      </div>

      <div class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="euro" :size="16" /></span>
        <div>
          <p class="cm-note__title">FlashScore est payant</p>
          <p class="cm-note__text generator-panel__note">
            Chaque actualisation appelle une API tierce payante (~2-3 $ pour une journée de football, plan Apify) — à ne
            déclencher qu'à la main quand tu veux rafraîchir le contexte IA (forme, xG, possession).
          </p>
        </div>
      </div>
    </template>

    <div v-else class="cm-note">
      <span class="cm-icon-box is-muted"><AppIcon name="database" :size="16" /></span>
      <div>
        <p class="cm-note__title">Sources</p>
        <p class="cm-note__text generator-panel__note">État des sources indisponible pour l'instant.</p>
      </div>
    </div>

    <!-- 3. Le générateur de matchs fictifs. -->
    <section class="generator-panel__form">
      <h4 class="cm-section-title">
        Jeu de test
        <span class="cm-section-title__hint">des matchs fictifs pour valider les réglages</span>
      </h4>
      <div class="cm-toolbar">
        <AppNumberField v-model="count" label="Nombre de matchs fictifs" :min="1" :max="500" />
        <AppButton variant="secondary" :loading="generating" @click="emit('generate', count)">
          <template #icon><AppIcon name="database" :size="15" /></template>
          Générer un nouveau jeu de test
        </AppButton>
      </div>
      <p class="cm-text-muted generator-panel__hint">
        Remplace le jeu de données de test par des matchs fictifs, utile pour valider les réglages sans dépendre de cotes réelles.
      </p>
    </section>
  </div>
</template>

<style scoped>
.generator-panel {
  /* Se règle sur SA largeur : dans une demi-page comme dans une page entière. */
  container: generator / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------------------------------------------------------------- sources */
.generator-panel__sources {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.source {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 12px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  transition: border-color var(--cm-transition);
}

.source:hover {
  border-color: var(--cm-border);
}

.source__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.source__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.source__meta {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.source__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  /* Étroit : l'état et le bouton passent sous le nom, alignés sur le texte. */
  grid-column: 2;
}

/* Assez de place : l'état et le bouton à droite, sur la même ligne. */
@container generator (min-width: 560px) {
  .source {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .source__actions {
    grid-column: auto;
    flex-wrap: nowrap;
  }
}

.generator-panel__note {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------- générateur */
.generator-panel__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--cm-border-soft);
}

.generator-panel__form :deep(.field) {
  width: 200px;
  max-width: 100%;
}

.generator-panel__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
