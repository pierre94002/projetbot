<script setup>
import { ref } from 'vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { formatDateTime } from '@/utils/format.js';

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
    <div v-if="fixtures" class="generator-panel__status">
      <div class="generator-panel__status-row">
        <div>
          <span>Cotes marché (The Odds API)</span>
          <p v-if="fixtures.oddsLastSyncedAt" class="cm-text-muted generator-panel__timestamp">
            Synchronisé le {{ formatDateTime(fixtures.oddsLastSyncedAt) }}
          </p>
        </div>
        <div class="generator-panel__status-actions">
          <StatusBadge :status="fixtures.odds ? 'analyzed' : 'rejected'" />
          <AppButton variant="ghost" size="sm" :loading="refreshingOdds" @click="emit('refresh-odds')">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Actualiser
          </AppButton>
        </div>
      </div>
      <p v-if="lastOddsQuota" class="cm-text-muted generator-panel__quota">
        Quota The Odds API restant : {{ lastOddsQuota.remaining ?? '—' }} requêtes (plan gratuit, 500/mois).
      </p>

      <div class="generator-panel__status-row">
        <div>
          <span>Métadonnées compétitions (football-data.org)</span>
          <p v-if="fixtures.competitionsLastSyncedAt" class="cm-text-muted generator-panel__timestamp">
            Synchronisé le {{ formatDateTime(fixtures.competitionsLastSyncedAt) }}
          </p>
        </div>
        <div class="generator-panel__status-actions">
          <StatusBadge :status="fixtures.competitions ? 'analyzed' : 'rejected'" />
          <AppButton variant="ghost" size="sm" :loading="refreshingCompetitions" @click="emit('refresh-competitions')">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Actualiser
          </AppButton>
        </div>
      </div>

      <div class="generator-panel__status-row">
        <span>Jeu de données de test</span>
        <StatusBadge :status="fixtures.sampleMatches ? 'analyzed' : 'rejected'" />
      </div>

      <div class="generator-panel__status-row">
        <div>
          <span>Statistiques FlashScore (Apify, complément IA)</span>
          <p v-if="flashscoreStatus?.fetchedAt" class="cm-text-muted generator-panel__timestamp">
            Actualisé le {{ formatDateTime(flashscoreStatus.fetchedAt) }} — {{ flashscoreStatus.teamCount }} équipe(s) sur
            {{ flashscoreStatus.matchCount }} match(s) scanné(s)
          </p>
        </div>
        <div class="generator-panel__status-actions">
          <StatusBadge :status="flashscoreStatus ? 'analyzed' : 'rejected'" />
          <AppButton variant="ghost" size="sm" :loading="refreshingFlashscore" @click="emit('refresh-flashscore')">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Actualiser
          </AppButton>
        </div>
      </div>
      <p class="cm-text-muted generator-panel__quota">
        Chaque actualisation appelle une API tierce payante (~2-3 $ pour une journée de football, plan Apify) — à ne
        déclencher qu'à la main quand tu veux rafraîchir le contexte IA (forme, xG, possession).
      </p>
    </div>

    <div class="generator-panel__form">
      <AppNumberField v-model="count" label="Nombre de matchs fictifs" :min="1" :max="500" />
      <AppButton variant="secondary" :loading="generating" @click="emit('generate', count)">
        <template #icon><AppIcon name="database" :size="15" /></template>
        Générer un nouveau jeu de test
      </AppButton>
    </div>
    <p class="cm-text-muted generator-panel__hint">
      Remplace le jeu de données de test par des matchs fictifs, utile pour valider les réglages sans dépendre de cotes réelles.
    </p>
  </div>
</template>

<style scoped>
.generator-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.generator-panel__status {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.generator-panel__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  gap: 12px;
}

.generator-panel__status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.generator-panel__timestamp {
  font-size: 11px;
  margin-top: 2px;
}

.generator-panel__quota {
  font-size: 11.5px;
  margin: -4px 0 2px;
}

.generator-panel__form {
  display: flex;
  gap: 12px;
  align-items: end;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.generator-panel__form :deep(.field) {
  max-width: 180px;
}

.generator-panel__hint {
  font-size: 12px;
}
</style>
