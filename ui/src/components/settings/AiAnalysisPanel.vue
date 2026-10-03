<script setup>
import { ref } from 'vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import AiFindingsTable from '@/components/settings/AiFindingsTable.vue';
import { formatDateTime } from '@/utils/format.js';

/**
 * L'analyse IA des pronostics réglés : le lancement, puis la dernière
 * analyse en carte (date, taille du jeu, modèle, synthèse, constats en
 * tableau, limites) et les précédentes repliées. Refonte visuelle du
 * 01/10/2026 (guide ui/DESIGN.md) : aucune donnée ni action n'a bougé.
 */
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
    <!-- 1. Lancer : combien de pronostics, et ce que ça coûte. -->
    <section class="ai-analysis__launch">
      <div class="cm-toolbar">
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
      <div v-if="!connected" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="lock" :size="16" /></span>
        <div>
          <p class="cm-note__title ai-analysis__note-title--warning">IA non connectée</p>
          <p class="cm-note__text ai-analysis__note-text">Connectez une clé API Anthropic ci-dessus pour activer l'analyse.</p>
        </div>
      </div>
    </section>

    <EmptyState
      v-if="history.length === 0"
      icon="target"
      title="Aucune analyse encore lancée"
      description="Lancez une analyse pour corréler la justesse des pronostics avec lieu, type de compétition et phase de saison. Relancez-la régulièrement à mesure que tu rentres des scores — les résultats passés restent consultables ci-dessous, rien n'est perdu d'un run à l'autre."
    />

    <!-- La plus récente reste toujours dépliée ; les précédentes se replient pour ne pas noyer le dernier constat. -->
    <template v-else>
      <!-- 2. La dernière analyse, en carte. -->
      <article class="ai-run is-latest">
        <header class="ai-run__head">
          <span class="cm-icon-box is-info"><AppIcon name="sparkles" :size="17" /></span>
          <div class="ai-run__title">
            <span class="cm-eyebrow">Dernière analyse</span>
            <span class="ai-run__date cm-numeric">{{ formatDateTime(history[0].createdAt) }}</span>
          </div>
          <div class="ai-run__chips">
            <span class="cm-chip is-section">{{ history[0].datasetMeta?.returnedCount }} pronostics analysés</span>
            <span class="cm-chip">{{ history[0].datasetMeta?.enrichedCount }} enrichis lieu/compétition/saison</span>
            <span class="cm-chip" title="Modèle qui a produit l'analyse"><AppIcon name="cpu" :size="11" />modèle {{ history[0].model }}</span>
          </div>
        </header>

        <p class="ai-run__summary">{{ history[0].analysis?.summary }}</p>

        <AiFindingsTable :findings="history[0].analysis?.findings ?? []" />

        <p v-if="history[0].analysis?.caveats" class="ai-run__caveats">
          <AppIcon name="info" :size="12" class="ai-run__caveats-icon" />
          <span>{{ history[0].analysis.caveats }}</span>
        </p>
      </article>

      <!-- 3. Les précédentes, repliées, chacune dans sa carte. -->
      <CollapsibleSection v-if="history.length > 1" class="ai-analysis__history">
        <template #header>
          <p class="ai-analysis__history-head">
            Analyses précédentes
            <span class="cm-pill ai-analysis__history-count">{{ history.length - 1 }}</span>
          </p>
        </template>

        <div class="ai-analysis__past cm-stagger">
          <article v-for="entry in history.slice(1)" :key="entry.id" class="ai-run">
            <header class="ai-run__head">
              <span class="cm-icon-box is-muted"><AppIcon name="history" :size="17" /></span>
              <div class="ai-run__title">
                <span class="cm-eyebrow ai-run__eyebrow--past">Analyse du</span>
                <span class="ai-run__date cm-numeric">{{ formatDateTime(entry.createdAt) }}</span>
              </div>
              <div class="ai-run__chips">
                <span class="cm-chip">{{ entry.datasetMeta?.returnedCount }} pronostics analysés</span>
                <span class="cm-chip">{{ entry.datasetMeta?.enrichedCount }} enrichis</span>
                <span class="cm-chip" title="Modèle qui a produit l'analyse"><AppIcon name="cpu" :size="11" />modèle {{ entry.model }}</span>
              </div>
            </header>
            <p class="ai-run__summary">{{ entry.analysis?.summary }}</p>
            <AiFindingsTable :findings="entry.analysis?.findings ?? []" />
            <p v-if="entry.analysis?.caveats" class="ai-run__caveats">
              <AppIcon name="info" :size="12" class="ai-run__caveats-icon" />
              <span>{{ entry.analysis.caveats }}</span>
            </p>
          </article>
        </div>
      </CollapsibleSection>
    </template>
  </div>
</template>

<style scoped>
.ai-analysis {
  /* Se règle sur SA largeur : les puces de la carte passent sous le titre quand c'est étroit. */
  container: aianalysis / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* -------------------------------------------------------------- lancement */
.ai-analysis__launch {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-analysis__launch :deep(.field) {
  width: 200px;
  max-width: 100%;
}

.ai-analysis__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.ai-analysis__note-title--warning {
  color: var(--cm-warning);
}

.ai-analysis__note-text {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------- une analyse */
.ai-run {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* La dernière : liseré et halo bleu de l'IA. */
.ai-run.is-latest {
  border-color: rgba(var(--cm-info-rgb) / 0.28);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-info-rgb) / 0.09), transparent 55%), var(--cm-surface-alt);
}

.ai-run__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
}

.ai-run__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-run.is-latest .cm-eyebrow {
  color: var(--cm-info);
}

.ai-run__eyebrow--past {
  color: var(--cm-text-muted);
}

.ai-run__date {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-run__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  grid-column: 2;
}

@container aianalysis (min-width: 720px) {
  .ai-run__head {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .ai-run__chips {
    grid-column: auto;
    justify-content: flex-end;
  }
}

.ai-run__summary {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.ai-run__caveats {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.ai-run__caveats-icon {
  flex-shrink: 0;
  margin-top: 3px;
}

/* -------------------------------------------------------------- historique */
.ai-analysis__history {
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-analysis__history-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-analysis__history-count {
  min-width: 0;
  padding: 2px 8px;
  font-size: 11px;
}

.ai-analysis__past {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
