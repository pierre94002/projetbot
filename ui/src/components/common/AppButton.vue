<script setup>
defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | danger
  size: { type: String, default: 'md' }, // sm | md
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  type: { type: String, default: 'button' }
});

defineEmits(['click']);
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--loading': loading }]"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="btn__spinner" />
    <slot name="icon" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  transition: background var(--cm-transition), border-color var(--cm-transition), color var(--cm-transition), opacity var(--cm-transition);
  white-space: nowrap;
}

.btn--md {
  padding: 9px 16px;
}
.btn--sm {
  padding: 6px 11px;
  font-size: 12.5px;
}

.btn--primary {
  background: var(--cm-accent);
  color: #06251b;
}
.btn--primary:hover:not(:disabled) {
  background: var(--cm-accent-strong);
}

.btn--secondary {
  background: var(--cm-surface-hover);
  border-color: var(--cm-border);
  color: var(--cm-text-primary);
}
.btn--secondary:hover:not(:disabled) {
  border-color: var(--cm-accent);
}

.btn--ghost {
  background: transparent;
  color: var(--cm-text-secondary);
}
.btn--ghost:hover:not(:disabled) {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

.btn--danger {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  border-color: rgba(248, 113, 113, 0.3);
}
.btn--danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.2);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn__spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  opacity: 0.8;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
