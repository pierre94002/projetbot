<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, default: '' },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  step: { type: Number, default: 0.01 },
  formatValue: { type: Function, default: (v) => v }
});

const model = defineModel({ type: Number, required: true });

const fillPercent = computed(() => ((model.value - props.min) / (props.max - props.min)) * 100);
</script>

<template>
  <label class="field">
    <div class="field__top">
      <span class="field__label">{{ label }}</span>
      <span class="field__value cm-numeric">{{ formatValue(model) }}</span>
    </div>
    <input
      v-model.number="model"
      type="range"
      class="field__range"
      :min="min"
      :max="max"
      :step="step"
      :style="{ '--fill': fillPercent + '%' }"
    />
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.field__label {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.field__value {
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-accent);
}

.field__range {
  -webkit-appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--cm-accent) var(--fill), var(--cm-border) var(--fill));
  outline: none;
}

.field__range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--cm-text-primary);
  border: 3px solid var(--cm-accent);
  cursor: pointer;
}

.field__range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--cm-text-primary);
  border: 3px solid var(--cm-accent);
  cursor: pointer;
}
</style>
