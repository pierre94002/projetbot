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
      <input v-model.number="model" type="number" class="field__input cm-numeric" :min="min" :max="max" :step="step" />
      <span v-if="suffix" class="field__suffix">{{ suffix }}</span>
    </div>
    <span v-if="hint" class="field__hint">{{ hint }}</span>
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
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
  font-weight: 600;
  color: var(--cm-text-primary);
  outline: none;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.field__input:hover {
  border-color: var(--cm-border-strong);
}

.field__input:focus {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.field__suffix {
  position: absolute;
  right: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-muted);
  pointer-events: none;
}

.field__hint {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}
</style>
