<script setup>
defineProps({
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' }
});

const model = defineModel({ type: String, default: '' });
</script>

<template>
  <label class="field">
    <span v-if="label" class="field__label">{{ label }}</span>
    <div class="field__input-wrap">
      <slot name="icon" />
      <input v-model="model" :type="type" class="field__input" :placeholder="placeholder" />
    </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  padding: 0 12px;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.field__input-wrap:hover {
  border-color: var(--cm-border-strong);
}

.field__input-wrap:focus-within {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.field__input-wrap :deep(svg) {
  color: var(--cm-text-muted);
  flex-shrink: 0;
}

.field__input {
  width: 100%;
  background: transparent;
  border: none;
  padding: 9px 0;
  font-size: 13.5px;
  color: var(--cm-text-primary);
  outline: none;
}

.field__input::placeholder {
  color: var(--cm-text-muted);
}
</style>
