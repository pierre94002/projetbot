<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  padded: { type: Boolean, default: true }
});
</script>

<template>
  <section class="card" :class="{ 'card--padded': padded }">
    <header v-if="title || $slots.actions" class="card__header">
      <div>
        <h3 v-if="title" class="card__title">{{ title }}</h3>
        <p v-if="subtitle" class="card__subtitle cm-text-secondary">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="card__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--cm-surface);
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-lg);
}

.card--padded {
  padding: 20px;
}

.card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.card__title {
  font-size: 14.5px;
  font-weight: 600;
}

.card__subtitle {
  font-size: 12.5px;
  margin-top: 3px;
}
</style>
