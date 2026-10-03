<script setup>
import AppToggle from '@/components/common/AppToggle.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Le coupe-circuit manuel : une grande note, rouge quand il est actif
 * (les mises sont suspendues), neutre sinon, avec l'interrupteur dedans.
 * Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) : même interrupteur,
 * même bouton de réinitialisation.
 */
defineProps({
  circuitBreakerActive: { type: Boolean, required: true }
});

const emit = defineEmits(['toggle', 'reset']);
</script>

<template>
  <div class="risk-panel">
    <div class="cm-note risk-panel__note" :class="{ 'is-danger': circuitBreakerActive }">
      <span class="cm-icon-box" :class="circuitBreakerActive ? 'is-danger' : 'is-accent'">
        <AppIcon :name="circuitBreakerActive ? 'alert' : 'shield'" :size="18" />
      </span>
      <div class="risk-panel__body">
        <div class="risk-panel__head">
          <p class="cm-note__title" :class="{ 'risk-panel__title--danger': circuitBreakerActive }">
            {{ circuitBreakerActive ? 'Mises suspendues' : 'Mises autorisées' }}
          </p>
          <span class="cm-chip" :class="circuitBreakerActive ? 'is-danger' : 'is-accent'">
            <AppIcon :name="circuitBreakerActive ? 'pause' : 'check'" :size="11" />
            {{ circuitBreakerActive ? 'Coupe-circuit actif' : 'Coupe-circuit inactif' }}
          </span>
        </div>
        <AppToggle
          :model-value="circuitBreakerActive"
          label="Coupe-circuit manuel"
          description="Suspend toute recommandation de mise, tous marchés confondus."
          @update:model-value="emit('toggle', $event)"
        />
      </div>
    </div>

    <div class="risk-panel__actions">
      <AppButton variant="ghost" size="sm" @click="emit('reset')">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Réinitialiser l'état de risque
      </AppButton>
    </div>
  </div>
</template>

<style scoped>
.risk-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* La note prend toute la hauteur disponible : le bloc se lit d'un coup. */
.risk-panel__note {
  padding: 16px 18px;
}

.risk-panel__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.risk-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.risk-panel__head .cm-note__title {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.3px;
  color: var(--cm-text-primary);
}

.risk-panel__title--danger {
  color: var(--cm-danger);
}

.risk-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}
</style>
