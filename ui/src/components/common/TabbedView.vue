<script setup>
import { useRoute, useRouter } from 'vue-router';

// Barre d'onglets seule — le contenu de chaque onglet reste géré par la page
// (v-if/v-else-if), sa forme diffère trop d'une page à l'autre pour être
// généralisée ici. Dessin : une barre segmentée, l'onglet actif en relief
// dans la couleur de la section (refonte du 01/10/2026).
const props = defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, required: true }, // [{ value, label, count?, icon? }]
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
  <div class="tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      class="tabs__tab"
      :class="{ 'is-active': modelValue === tab.value }"
      :aria-selected="modelValue === tab.value"
      @click="selectTab(tab.value)"
    >
      {{ tab.label }}
      <span v-if="tab.count !== undefined" class="cm-numeric tabs__count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgba(255, 255, 255, 0.035);
}

.tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.tabs__tab:hover {
  color: var(--cm-text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.tabs__tab.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.tabs__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 10.5px;
  font-weight: 700;
}

.tabs__tab.is-active .tabs__count {
  background: rgba(0, 0, 0, 0.16);
}
</style>
