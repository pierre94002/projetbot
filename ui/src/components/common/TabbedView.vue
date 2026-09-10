<script setup>
import { useRoute, useRouter } from 'vue-router';

// Barre d'onglets seule — le contenu de chaque onglet reste géré par la page
// (v-if/v-else-if), sa forme diffère trop d'une page à l'autre pour être
// généralisée ici sans complexifier inutilement ce composant.
const props = defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, required: true }, // [{ value, label, count? }]
  // Nom du paramètre d'URL à synchroniser avec l'onglet actif (ex. "tab") —
  // laissé vide tant qu'aucune page n'en a besoin (état local uniquement).
  queryParam: { type: String, default: null }
});

const emit = defineEmits(['update:modelValue']);

const route = useRoute();
const router = useRouter();

function selectTab(value) {
  emit('update:modelValue', value);
  if (props.queryParam) router.replace({ query: { ...route.query, [props.queryParam]: value } });
}
</script>

<template>
  <div class="tabbed-view__tabs">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="tabbed-view__tab"
      :class="{ 'tabbed-view__tab--active': modelValue === tab.value }"
      @click="selectTab(tab.value)"
    >
      {{ tab.label }}
      <span v-if="tab.count !== undefined" class="cm-numeric tabbed-view__tab-count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabbed-view__tabs {
  display: flex;
  gap: 6px;
}

.tabbed-view__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), border-color var(--cm-transition);
}

.tabbed-view__tab-count {
  font-size: 10.5px;
  opacity: 0.8;
}

.tabbed-view__tab:hover {
  border-color: var(--cm-accent);
  color: var(--cm-text-primary);
}

.tabbed-view__tab--active {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: #06251b;
}
</style>
