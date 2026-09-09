<script setup>
import { ref } from 'vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import AiFindingsTable from '@/components/settings/AiFindingsTable.vue';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  history: { type: Array, default: () => [] } // les 10 dernières analyses, plus récente en premier
});

const emit = defineEmits(['run']);

const limit = ref(50);
</script>

<template>
  <div class="ai-analysis">
    <div class="ai-analysis__form">
      <AppNumberField v-model="limit" label="Pronostics à analyser" :min="5" :max="100" />
      <AppButton variant="primary" :loading="running" :disabled="!connected" @click="emit('run', limit)">
        <template #icon><AppIcon name="bolt" :size="15" /></template>
        Lancer l'analyse
      </AppButton>
    </div>
    <p class="cm-text-muted ai-analysis__hint">
      Envoie jusqu'à {{ limit }} pronostics réglés à l'API Claude (payante, hors plans gratuits) — coût de quelques
      centimes par analyse selon le modèle.
    </p>
    <p v-if="!connected" class="cm-text-muted ai-analysis__hint">Connectez une clé API Anthropic ci-dessus pour activer l'analyse.</p>

    <EmptyState
      v-if="history.length === 0"
      icon="target"
      title="Aucune analyse encore lancée"
      description="Lancez une analyse pour corréler la justesse des pronostics avec lieu, type de compétition et phase de saison. Relancez-la régulièrement à mesure que tu rentres des scores — les résultats passés restent consultables ci-dessous, rien n'est perdu d'un run à l'autre."
    />

    <!-- La plus récente reste toujours dépliée ; les précédentes se replient pour ne pas noyer le dernier constat. -->
    <template v-else>
      <div class="ai-analysis__result">
        <p class="cm-text-muted ai-analysis__meta">
          {{ formatDateTime(history[0].createdAt) }} — {{ history[0].datasetMeta?.returnedCount }} pronostics analysés
          ({{ history[0].datasetMeta?.enrichedCount }} enrichis lieu/compétition/saison) — modèle {{ history[0].model }}
        </p>

        <p class="ai-analysis__summary">{{ history[0].analysis?.summary }}</p>

        <AiFindingsTable :findings="history[0].analysis?.findings ?? []" />

        <p v-if="history[0].analysis?.caveats" class="cm-text-muted ai-analysis__caveats">{{ history[0].analysis.caveats }}</p>
      </div>

      <CollapsibleSection v-if="history.length > 1" class="ai-analysis__history">
        <template #header>
          <p class="ai-analysis__history-head">Analyses précédentes <span class="cm-text-muted">({{ history.length - 1 }})</span></p>
        </template>

        <div v-for="entry in history.slice(1)" :key="entry.id" class="ai-analysis__result ai-analysis__result--past">
          <p class="cm-text-muted ai-analysis__meta">
            {{ formatDateTime(entry.createdAt) }} — {{ entry.datasetMeta?.returnedCount }} pronostics analysés
            ({{ entry.datasetMeta?.enrichedCount }} enrichis) — modèle {{ entry.model }}
          </p>
          <p class="ai-analysis__summary">{{ entry.analysis?.summary }}</p>
          <AiFindingsTable :findings="entry.analysis?.findings ?? []" />
          <p v-if="entry.analysis?.caveats" class="cm-text-muted ai-analysis__caveats">{{ entry.analysis.caveats }}</p>
        </div>
      </CollapsibleSection>
    </template>
  </div>
</template>

<style scoped>
.ai-analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-analysis__form {
  display: flex;
  gap: 12px;
  align-items: end;
}

.ai-analysis__form :deep(.field) {
  max-width: 200px;
}

.ai-analysis__hint {
  font-size: 11.5px;
  margin: -4px 0 2px;
}

.ai-analysis__result {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-analysis__result--past {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.ai-analysis__result--past + .ai-analysis__result--past {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-analysis__meta {
  font-size: 11px;
}

.ai-analysis__summary {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
}

.ai-analysis__caveats {
  font-size: 11px;
  font-style: italic;
}

.ai-analysis__history {
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-analysis__history-head {
  font-size: 12.5px;
  font-weight: 600;
}
</style>
