<script setup>
defineProps({
  label: { type: String, default: 'Chargement…' }
});
</script>

<template>
  <div class="spinner-wrap" role="status">
    <span class="spinner" />
    <span v-if="label" class="spinner-wrap__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.spinner-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 28px;
  font-size: 13px;
}

.spinner-wrap__label {
  color: var(--cm-text-secondary);
}

.spinner {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(var(--cm-section-rgb) / 0.18);
  border-top-color: var(--cm-section);
  animation: spin 800ms cubic-bezier(0.5, 0.15, 0.5, 0.85) infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
