<script setup>
import AppToggle from '@/components/common/AppToggle.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';

/**
 * Le coupe-circuit manuel : une grande note, rouge quand il est actif
 * (les mises sont suspendues), neutre sinon, avec l'interrupteur dedans.
 * Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) : même interrupteur,
 * même bouton de réinitialisation.
 *
 * Étape 11 du plan (06/10/2026) : les garde-fous de Pierre enclenchent CE
 * coupe-circuit (perte maximale de la semaine atteinte ou engagée) sans le
 * doubler. `circuitBreakerActive` est alors l'état EFFECTIF (mises
 * suspendues), `manuel` l'interrupteur seul (sans lui, l'interrupteur suit
 * l'état comme avant) et `automatique` dit quel garde-fou l'a enclenché.
 */
defineProps({
  manuel: { type: Boolean, default: null },
  automatique: { type: Object, default: null },
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
            <HelpTip terme="series-de-pertes" />
          </p>
          <span class="cm-chip" :class="circuitBreakerActive ? 'is-danger' : 'is-accent'">
            <AppIcon :name="circuitBreakerActive ? 'pause' : 'check'" :size="11" />
            {{ circuitBreakerActive ? 'Coupe-circuit actif' : 'Coupe-circuit inactif' }}
          </span>
        </div>
        <AppToggle
          v-if="manuel === null"
          :model-value="circuitBreakerActive"
          label="Coupe-circuit manuel"
          description="Suspend toute recommandation de mise, tous marchés confondus."
          @update:model-value="emit('toggle', $event)"
        />
        <AppToggle
          v-else
          :model-value="manuel"
          label="Coupe-circuit manuel"
          description="Suspend toute recommandation de mise, tous marchés confondus."
          @update:model-value="emit('toggle', $event)"
        />
        <p v-if="automatique" class="risk-panel__auto">
          <AppIcon name="shield" :size="12" />
          Enclenché par un garde-fou : {{ automatique.texte }}. Il se relâche de lui-même (lundi, quand les paris en attente sont réglés, ou si vous relevez
          le plafond ci-dessous) ; l'interrupteur manuel reste indépendant.
        </p>
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

/* Étape 11 : quand un garde-fou a enclenché le coupe-circuit, pourquoi. */
.risk-panel__auto {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
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
