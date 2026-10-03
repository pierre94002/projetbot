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
    <div class="empty__icon"><AppIcon :name="icon" :size="22" /></div>
    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__description">{{ description }}</p>
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
  padding: 40px 24px;
  border-radius: var(--cm-radius-md);
  border: 1px dashed var(--cm-border);
}

.empty__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--cm-section-soft);
  color: var(--cm-section);
  margin-bottom: 4px;
}

.empty__title {
  font-size: 14.5px;
  font-weight: 700;
}

.empty__description {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
  max-width: 420px;
}
</style>
