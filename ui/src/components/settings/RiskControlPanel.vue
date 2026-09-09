<script setup>
import AppToggle from '@/components/common/AppToggle.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

defineProps({
  circuitBreakerActive: { type: Boolean, required: true }
});

const emit = defineEmits(['toggle', 'reset']);
</script>

<template>
  <div class="risk-panel">
    <AppToggle
      :model-value="circuitBreakerActive"
      label="Coupe-circuit manuel"
      description="Suspend toute recommandation de mise, tous marchés confondus."
      @update:model-value="emit('toggle', $event)"
    />
    <AppButton variant="ghost" size="sm" @click="emit('reset')">
      <template #icon><AppIcon name="refresh" :size="14" /></template>
      Réinitialiser l'état de risque
    </AppButton>
  </div>
</template>

<style scoped>
.risk-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
