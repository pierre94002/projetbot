<script setup>
/**
 * Sous une sélection de Mes paris : comment elle a été réglée (« Réglé sur le score à la 90e… ») ou pourquoi elle attend
 * encore (correctif du règlement, 02/11/2026). La phrase vient toute faite du serveur (`reglement` de GET /api/bets,
 * calculé à la lecture du carnet, jamais écrit) ; rien n'est affiché quand le serveur n'a rien à dire.
 */
import AppIcon from '@/components/common/AppIcon.vue';

defineProps({
  /** { etat: 'regle-a-la-90e' | 'en-attente', code, texte } ou rien. */
  reglement: { type: Object, default: null }
});
</script>

<template>
  <p v-if="reglement?.texte" class="reglement-selection" :class="`is-${reglement.etat}`" :data-code="reglement.code">
    <AppIcon :name="reglement.etat === 'regle-a-la-90e' ? 'check' : 'info'" :size="11" class="reglement-selection__icone" />
    <span>{{ reglement.texte }}</span>
  </p>
</template>

<style scoped>
.reglement-selection {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cm-text-muted);
  white-space: normal;
}

.reglement-selection__icone {
  flex: none;
  margin-top: 2px;
}
</style>
