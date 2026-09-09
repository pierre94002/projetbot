<script setup>
defineProps({
  label: { type: String, default: 'Chargement…' }
});
</script>

<template>
  <div class="spinner-wrap">
    <span class="spinner" />
    <span v-if="label" class="cm-text-muted">{{ label }}</span>
  </div>
</template>

<style scoped>
.spinner-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px;
  font-size: 13px;
  justify-content: center;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--cm-border);
  border-top-color: var(--cm-accent);
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
