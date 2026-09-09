<script setup>
import { reactive, watch } from 'vue';
import AppSlider from '@/components/common/AppSlider.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

const props = defineProps({
  config: { type: Object, required: true },
  saving: { type: Boolean, default: false }
});

const emit = defineEmits(['save', 'reset']);

const form = reactive({ ...props.config });

watch(
  () => props.config,
  (next) => Object.assign(form, next),
  { deep: true }
);

function handleSave() {
  emit('save', {
    edgeThresholdMin: form.edgeThresholdMin,
    edgeThresholdMax: form.edgeThresholdMax,
    kellyFraction: form.kellyFraction,
    maxStakePercent: form.maxStakePercent,
    homeAdvantage: form.homeAdvantage,
    defaultCorrelation: form.defaultCorrelation,
    cornersAdjustmentMax: form.cornersAdjustmentMax
  });
}

const asPercent = (value) => `${(value * 100).toFixed(1)}%`;
</script>

<template>
  <form class="config-form" @submit.prevent="handleSave">
    <div class="config-form__grid">
      <AppSlider v-model="form.edgeThresholdMin" label="Edge minimum requis" :min="0" :max="0.2" :step="0.005" :format-value="asPercent" />
      <AppSlider v-model="form.edgeThresholdMax" label="Edge maximum accepté" :min="0.05" :max="0.6" :step="0.005" :format-value="asPercent" />
      <AppSlider v-model="form.kellyFraction" label="Fraction de Kelly" :min="0" :max="1" :step="0.01" :format-value="(v) => v.toFixed(2)" />
      <AppSlider v-model="form.maxStakePercent" label="Mise max (% bankroll)" :min="0" :max="0.1" :step="0.002" :format-value="asPercent" />
      <AppSlider v-model="form.homeAdvantage" label="Avantage terrain par défaut" :min="0.94" :max="1.06" :step="0.005" :format-value="(v) => v.toFixed(3)" />
      <AppSlider v-model="form.defaultCorrelation" label="Corrélation Dixon-Coles (rho)" :min="-0.3" :max="0" :step="0.005" :format-value="(v) => v.toFixed(3)" />
      <AppSlider
        v-model="form.cornersAdjustmentMax"
        label="Écart max affiché signal corners (±, indicatif)"
        :min="0"
        :max="0.2"
        :step="0.005"
        :format-value="asPercent"
      />
    </div>

    <div class="config-form__actions">
      <AppButton type="submit" variant="primary" :loading="saving">
        <template #icon><AppIcon name="check" :size="15" /></template>
        Enregistrer
      </AppButton>
      <AppButton variant="ghost" type="button" @click="emit('reset')">
        <template #icon><AppIcon name="refresh" :size="15" /></template>
        Réinitialiser les valeurs par défaut
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.config-form__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px 28px;
  margin-bottom: 20px;
}

.config-form__actions {
  display: flex;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--cm-border-soft);
}

@media (max-width: 720px) {
  .config-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
