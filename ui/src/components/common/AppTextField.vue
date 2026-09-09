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
}

.field__label {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.field__input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  padding: 0 12px;
  transition: border-color var(--cm-transition);
}

.field__input-wrap:focus-within {
  border-color: var(--cm-accent);
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
</style>
