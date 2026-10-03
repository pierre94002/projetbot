<script setup>
import { useRouter } from 'vue-router';
import AppIcon from './AppIcon.vue';

/**
 * Bouton « Retour » des pages ouvertes d'un clic (match, match à venir,
 * équipe, pronostic) — demande de Pierre le 01/10/2026. Revient à la page
 * d'où l'on vient ; arrivé par un lien direct (aucune page précédente dans
 * l'appli), va à `fallback`.
 */
const props = defineProps({
  fallback: { type: [String, Object], default: '/matches' },
  label: { type: String, default: 'Retour' }
});

const router = useRouter();

function retour() {
  if (window.history.state?.back) router.back();
  else router.push(props.fallback);
}
</script>

<template>
  <button type="button" class="back-button" @click="retour">
    <span class="back-button__icon"><AppIcon name="arrowLeft" :size="13" /></span>
    {{ label }}
  </button>
</template>

<style scoped>
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 5px 12px 5px 6px;
  border: 1px solid var(--cm-border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: border-color var(--cm-transition), color var(--cm-transition), background var(--cm-transition);
}

.back-button:hover {
  color: var(--cm-text-primary);
  border-color: var(--cm-border);
  background: rgba(255, 255, 255, 0.06);
}

.back-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--cm-section-soft);
  color: var(--cm-section);
}
</style>
