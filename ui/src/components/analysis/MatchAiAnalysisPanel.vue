<script setup>
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

defineProps({
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  entry: { type: Object, default: null } // { analysis, postMatchReview? } | null
});

defineEmits(['run-pre-match', 'run-post-match']);
</script>

<template>
  <div class="match-ai">
    <p v-if="!connected" class="cm-text-muted match-ai__hint">Connectez une clé API Anthropic depuis Réglages > Connexion IA pour activer l'analyse IA.</p>

    <template v-else-if="!entry?.analysis">
      <AppButton variant="primary" size="sm" :loading="running" @click="$emit('run-pre-match')">
        <template #icon><AppIcon name="bolt" :size="14" /></template>
        Lancer l'analyse IA
      </AppButton>
      <p class="cm-text-muted match-ai__hint">Commentaire qualitatif de Claude en complément du chiffrage du moteur — coût de quelques centimes.</p>
    </template>

    <template v-else>
      <div class="match-ai__block">
        <p class="match-ai__summary">{{ entry.analysis.summary }}</p>

        <div v-if="entry.analysis.keyFactors?.length" class="match-ai-factors-wrap">
          <table class="match-ai-factors">
            <thead>
              <tr>
                <th>Facteur</th>
                <th>Constat</th>
                <th>Preuve</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(factor, index) in entry.analysis.keyFactors" :key="index">
                <td><span class="match-ai-factors__factor">{{ factor.factor }}</span></td>
                <td>{{ factor.observation }}</td>
                <td class="cm-text-muted">{{ factor.evidence }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="match-ai__alignment"><strong>Par rapport au moteur : </strong>{{ entry.analysis.alignmentWithModel }}</p>
        <p v-if="entry.analysis.caveats" class="cm-text-muted match-ai__caveats">{{ entry.analysis.caveats }}</p>
      </div>

      <div v-if="entry.postMatchReview" class="match-ai__block match-ai__block--review">
        <p class="match-ai__review-head">Après-match</p>
        <p class="match-ai__summary">{{ entry.postMatchReview.summary }}</p>
        <p class="match-ai__review-line"><strong>Bien anticipé : </strong>{{ entry.postMatchReview.whatWasRight }}</p>
        <p class="match-ai__review-line"><strong>Manqué : </strong>{{ entry.postMatchReview.whatWasMissed }}</p>
        <p class="match-ai__alignment"><strong>Résultat vs moteur : </strong>{{ entry.postMatchReview.outcomeVsEngine }}</p>
        <p v-if="entry.postMatchReview.caveats" class="cm-text-muted match-ai__caveats">{{ entry.postMatchReview.caveats }}</p>
      </div>

      <AppButton v-else variant="secondary" size="sm" :loading="running" @click="$emit('run-post-match')">
        <template #icon><AppIcon name="bolt" :size="14" /></template>
        Analyser l'après-match
      </AppButton>
    </template>
  </div>
</template>

<style scoped>
.match-ai {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-ai__hint {
  font-size: 11.5px;
}

.match-ai__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-ai__block--review {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-ai__review-head {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
}

.match-ai__review-line {
  font-size: 12.5px;
  line-height: 1.5;
}

.match-ai__summary {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.match-ai__alignment {
  font-size: 12.5px;
  line-height: 1.5;
}

.match-ai__caveats {
  font-size: 11px;
  font-style: italic;
}

.match-ai-factors-wrap {
  overflow-x: auto;
}

.match-ai-factors {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

.match-ai-factors th,
.match-ai-factors td {
  padding: 6px 9px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: normal;
  overflow-wrap: break-word;
}

.match-ai-factors th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.match-ai-factors th:nth-child(1),
.match-ai-factors td:nth-child(1) {
  width: 18%;
}

.match-ai-factors tbody tr:last-child td {
  border-bottom: none;
}

.match-ai-factors__factor {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
</style>
