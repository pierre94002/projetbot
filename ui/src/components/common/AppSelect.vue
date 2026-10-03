<script setup>
defineProps({
  label: { type: String, default: '' },
  options: { type: Array, required: true }, // [{ value, label }]
  disabled: { type: Boolean, default: false }
});

const model = defineModel({ required: true });
</script>

<template>
  <label class="field">
    <span v-if="label" class="field__label">{{ label }}</span>
    <span class="field__select-wrap">
      <select v-model="model" class="field__select" :disabled="disabled">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <svg class="field__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
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

.field__select-wrap {
  position: relative;
  display: flex;
}

.field__select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  padding: 9px 34px 9px 12px;
  font-size: 13.5px;
  color: var(--cm-text-primary);
  outline: none;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.field__select:hover:not(:disabled) {
  border-color: var(--cm-border-strong);
}

.field__select:focus {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.field__select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field__chevron {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--cm-text-muted);
  pointer-events: none;
}
</style>
