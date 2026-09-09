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
    <select v-model="model" class="field__select" :disabled="disabled">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
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

.field__select {
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  padding: 9px 12px;
  font-size: 13.5px;
  color: var(--cm-text-primary);
  outline: none;
  transition: border-color var(--cm-transition);
}

.field__select:focus {
  border-color: var(--cm-accent);
}

.field__select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
