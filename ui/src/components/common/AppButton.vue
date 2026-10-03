<script setup>
defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | danger | section
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
  font-weight: 600;
  letter-spacing: -0.005em;
  white-space: nowrap;
  transition:
    background var(--cm-transition),
    border-color var(--cm-transition),
    color var(--cm-transition),
    opacity var(--cm-transition),
    transform var(--cm-transition),
    box-shadow var(--cm-transition);
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn--md {
  padding: 9px 16px;
}
.btn--sm {
  padding: 6px 12px;
  font-size: 12.5px;
  border-radius: 8px;
}

/* Le bouton principal : la couleur de la section, en dégradé, avec un halo. */
.btn--primary {
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.78));
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.25);
}
.btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(var(--cm-section-rgb) / 0.4);
  filter: brightness(1.06);
}

/* Toujours la couleur de la marque (validation, positif), quelle que soit la section. */
.btn--section {
  background: linear-gradient(135deg, var(--cm-accent), var(--cm-accent-strong));
  color: var(--cm-text-on-accent);
  box-shadow: 0 4px 14px rgba(var(--cm-accent-rgb) / 0.25);
}
.btn--section:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(var(--cm-accent-rgb) / 0.4);
}

.btn--secondary {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--cm-border);
  color: var(--cm-text-primary);
}
.btn--secondary:hover:not(:disabled) {
  border-color: var(--cm-section);
  background: rgba(var(--cm-section-rgb) / 0.08);
}

.btn--ghost {
  background: transparent;
  color: var(--cm-text-secondary);
}
.btn--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: var(--cm-text-primary);
}

.btn--danger {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  border-color: rgba(var(--cm-danger-rgb) / 0.3);
}
.btn--danger:hover:not(:disabled) {
  background: rgba(var(--cm-danger-rgb) / 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
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
