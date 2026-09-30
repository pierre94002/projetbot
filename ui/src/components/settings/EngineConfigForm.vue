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

const form = reactive({ ...props.config, valueBookmakers: [...(props.config.valueBookmakers ?? [])], maxValueOdds: props.config.maxValueOdds ?? 5 });

watch(
  () => props.config,
  (next) => Object.assign(form, next, { valueBookmakers: [...(next.valueBookmakers ?? [])], maxValueOdds: next.maxValueOdds ?? 5 }),
  { deep: true }
);

// Bookmakers où un pari peut être recommandé (aucun coché = tous). La cote
// juste, elle, vient toujours des bookmakers les plus justes — Pinnacle
// d'abord (cf. server/src/core/engine/valueFinder.js) — et un bookmaker qui
// l'a fixée n'est jamais recommandé pour ce match. Les « fiables » sont
// réglementés par une autorité européenne ; aucun n'est agréé en France.
const BOOKMAKERS = [
  { key: 'williamhill', title: 'William Hill', groupe: 'fiable' },
  { key: 'sport888', title: '888sport', groupe: 'fiable' },
  { key: 'betsson', title: 'Betsson', groupe: 'fiable' },
  { key: 'nordicbet', title: 'Nordic Bet', groupe: 'fiable' },
  { key: 'unibet_nl', title: 'Unibet (NL)', groupe: 'fiable' },
  { key: 'unibet_se', title: 'Unibet (SE)', groupe: 'fiable' },
  { key: 'leovegas_se', title: 'LeoVegas (SE)', groupe: 'fiable' },
  { key: 'tipico_de', title: 'Tipico', groupe: 'fiable' },
  { key: 'coolbet', title: 'Coolbet', groupe: 'fiable' },
  { key: 'codere_it', title: 'Codere (IT)', groupe: 'fiable' },
  { key: 'betclic_fr', title: 'Betclic', groupe: 'france' },
  { key: 'unibet_fr', title: 'Unibet (FR)', groupe: 'france' },
  { key: 'winamax_fr', title: 'Winamax (FR)', groupe: 'france' },
  { key: 'pmu_fr', title: 'PMU', groupe: 'france' },
  { key: 'marathonbet', title: 'Marathon Bet', groupe: 'autre' },
  { key: 'onexbet', title: '1xBet', groupe: 'autre' }
];
const NOTES = { france: 'agréé en France, marge 11 à 15 %', autre: 'non retenu par défaut' };

function basculer(key) {
  const i = form.valueBookmakers.indexOf(key);
  if (i >= 0) form.valueBookmakers.splice(i, 1);
  else form.valueBookmakers.push(key);
}

function handleSave() {
  emit('save', {
    edgeThresholdMin: form.edgeThresholdMin,
    edgeThresholdMax: form.edgeThresholdMax,
    kellyFraction: form.kellyFraction,
    maxStakePercent: form.maxStakePercent,
    defaultCorrelation: form.defaultCorrelation,
    cornersAdjustmentMax: form.cornersAdjustmentMax,
    valueBookmakers: [...form.valueBookmakers],
    maxValueOdds: form.maxValueOdds
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
      <AppSlider v-model="form.defaultCorrelation" label="Corrélation Dixon-Coles (rho)" :min="-0.3" :max="0" :step="0.005" :format-value="(v) => v.toFixed(3)" />
      <AppSlider
        v-model="form.cornersAdjustmentMax"
        label="Écart max affiché signal corners (±, indicatif)"
        :min="0"
        :max="0.2"
        :step="0.005"
        :format-value="asPercent"
      />
      <AppSlider v-model="form.maxValueOdds" label="Cote maximale d'un pari recommandé" :min="1.5" :max="10" :step="0.25" :format-value="(v) => v.toFixed(2)" />
    </div>

    <fieldset class="config-form__bookmakers">
      <legend>Vos bookmakers : un pari n'est recommandé que chez eux</legend>
      <label v-for="b in BOOKMAKERS" :key="b.key" class="config-form__bookmaker">
        <input type="checkbox" :checked="form.valueBookmakers.includes(b.key)" @change="basculer(b.key)" />
        {{ b.title }}
        <span v-if="NOTES[b.groupe]" class="config-form__muted">{{ NOTES[b.groupe] }}</span>
      </label>
      <p class="config-form__muted config-form__hint">
        Aucun coché : tous les bookmakers. Les bookmakers sans mention sont réglementés par une autorité européenne, mais aucun
        n'est agréé en France. La cote juste vient toujours des bookmakers les plus justes, Pinnacle d'abord, et jamais du
        bookmaker où l'on parie.
      </p>
    </fieldset>

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

.config-form__bookmakers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0 0 20px;
  padding: 12px 14px;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-sm);
}

.config-form__bookmakers legend {
  padding: 0 6px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.config-form__bookmaker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--cm-text-primary);
  cursor: pointer;
}

.config-form__muted {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.config-form__hint {
  flex-basis: 100%;
  margin: 2px 0 0;
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
