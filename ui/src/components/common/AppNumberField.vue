<script setup>
defineProps({
  label: { type: String, default: '' },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: [Number, String], default: 1 },
  suffix: { type: String, default: '' },
  hint: { type: String, default: '' }
});

const model = defineModel({ type: [Number, null], required: true });
</script>

<template>
  <label class="field">
    <span v-if="label" class="field__label">{{ label }}</span>
    <div class="field__input-wrap">
      <input v-model.number="model" type="number" class="field__input" :min="min" :max="max" :step="step" />
      <span v-if="suffix" class="field__suffix">{{ suffix }}</span>
    </div>
    <span v-if="hint" class="field__hint cm-text-muted">{{ hint }}</span>
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.field__input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field__input {
  width: 100%;
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  padding: 9px 12px;
  font-size: 13.5px;
  color: var(--cm-text-primary);
  outline: none;
  transition: border-color var(--cm-transition);
}

.field__input:focus {
  border-color: var(--cm-accent);
}

.field__suffix {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--cm-text-muted);
  pointer-events: none;
}

.field__hint {
  font-size: 11.5px;
}
</style>
