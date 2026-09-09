<script setup>
import AppIcon from './AppIcon.vue';

defineProps({
  icon: { type: String, default: 'database' },
  title: { type: String, required: true },
  description: { type: String, default: '' }
});
</script>

<template>
  <div class="empty">
    <div class="empty__icon"><AppIcon :name="icon" :size="20" /></div>
    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__description cm-text-secondary">{{ description }}</p>
    <slot name="action" />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 48px 24px;
}

.empty__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  margin-bottom: 6px;
}

.empty__title {
  font-size: 14px;
  font-weight: 600;
}

.empty__description {
  font-size: 12.5px;
  max-width: 340px;
}
</style>
