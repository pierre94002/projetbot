<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Le filtre de dates de la liste des matchs : trois raccourcis dans une barre
 * segmentée (même dessin que TabbedView, l'actif en couleur de section) et,
 * à droite, la navigation jour par jour avec la liste de tous les jours qui
 * ont au moins une rencontre. Refonte visuelle du 01/10/2026 : la logique
 * (valeurs, flèches, liste déroulante) n'a pas bougé.
 */
const props = defineProps({
  modelValue: { type: String, required: true }, // 'all' | 'today' | 'week' | 'YYYY-MM-DD'
  availableDates: { type: Array, required: true } // ['YYYY-MM-DD', ...] triées, une entrée par jour ayant au moins un match
});

const emit = defineEmits(['update:modelValue']);

const QUICK_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' }
];

const isSpecificDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(props.modelValue));

// « mer. 2 oct. » → « Mer. 2 oct. » : une majuscule au début seulement (le
// text-transform: capitalize d'avant en mettait une à chaque mot).
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

const dateLabel = computed(() => {
  if (!isSpecificDate.value) return 'Choisir une date';
  return majuscule(new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(props.modelValue)));
});

function currentDateIndex() {
  if (!isSpecificDate.value) return -1;
  return props.availableDates.indexOf(props.modelValue);
}

function goToAdjacentDate(direction) {
  const index = currentDateIndex();
  const nextIndex = index === -1 ? (direction > 0 ? 0 : props.availableDates.length - 1) : index + direction;
  if (nextIndex < 0 || nextIndex >= props.availableDates.length) return;
  emit('update:modelValue', props.availableDates[nextIndex]);
}

const canGoPrevious = computed(() => currentDateIndex() !== 0 && props.availableDates.length > 0);
const canGoNext = computed(() => currentDateIndex() !== props.availableDates.length - 1 && props.availableDates.length > 0);

// Liste déroulante avec TOUTES les dates disponibles (pas seulement pas-à-pas
// via les flèches) — pratique pour sauter directement à une date lointaine
// du championnat sans cliquer la flèche N fois.
const dropdownOpen = ref(false);

function formatDateOption(dateStr) {
  return majuscule(new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dateStr)));
}

function selectDate(dateStr) {
  emit('update:modelValue', dateStr);
  dropdownOpen.value = false;
}

// Fermeture au clic hors du sélecteur et à Échap (03/10/2026). L'ancien voile
// `position: fixed` ne couvrait que la carte qui contient le filtre : un fond
// flouté (backdrop-filter) contient ses éléments fixes, et un clic sur le
// bandeau ou la barre latérale laissait la liste ouverte.
const selecteur = ref(null);

function auClicDehors(event) {
  if (!selecteur.value?.contains(event.target)) dropdownOpen.value = false;
}

function auClavier(event) {
  if (event.key === 'Escape') dropdownOpen.value = false;
}

function ecouter(oui) {
  const methode = oui ? 'addEventListener' : 'removeEventListener';
  document[methode]('pointerdown', auClicDehors, true);
  document[methode]('keydown', auClavier);
}

watch(dropdownOpen, ecouter);
onBeforeUnmount(() => ecouter(false));
</script>

<template>
  <div class="filter-bar">
    <!-- Les trois raccourcis : une barre segmentée, l'actif en couleur de section. -->
    <div class="filter-bar__pills" role="tablist">
      <button
        v-for="filter in QUICK_FILTERS"
        :key="filter.value"
        type="button"
        role="tab"
        class="filter-bar__pill"
        :class="{ 'filter-bar__pill--active': modelValue === filter.value }"
        :aria-selected="modelValue === filter.value"
        @click="emit('update:modelValue', filter.value)"
      >
        {{ filter.label }}
      </button>
    </div>

    <!-- Jour par jour : précédent, le jour choisi (ouvre la liste), suivant. -->
    <div class="filter-bar__date-nav" :class="{ 'is-active': isSpecificDate }">
      <button type="button" class="filter-bar__nav-btn" title="Jour précédent" :disabled="!canGoPrevious" @click="goToAdjacentDate(-1)">
        <AppIcon name="chevronLeft" :size="14" />
      </button>

      <div ref="selecteur" class="filter-bar__date-picker">
        <button
          type="button"
          class="filter-bar__date-label"
          :class="{ 'filter-bar__date-label--active': isSpecificDate }"
          :disabled="!availableDates.length"
          @click="dropdownOpen = !dropdownOpen"
        >
          <AppIcon name="calendar" :size="13" class="filter-bar__date-icon" />
          <span class="filter-bar__date-text">{{ dateLabel }}</span>
          <AppIcon name="chevronDown" :size="12" class="filter-bar__date-caret" :class="{ 'is-open': dropdownOpen }" />
        </button>

        <template v-if="dropdownOpen">
          <div class="filter-bar__date-dropdown">
            <p class="filter-bar__date-dropdown-title">{{ availableDates.length }} jour{{ availableDates.length > 1 ? 's' : '' }} avec des rencontres</p>
            <div class="filter-bar__date-options">
              <button
                v-for="date in availableDates"
                :key="date"
                type="button"
                class="filter-bar__date-option"
                :class="{ 'filter-bar__date-option--active': date === modelValue }"
                @click="selectDate(date)"
              >
                <span class="filter-bar__date-option-label">{{ formatDateOption(date) }}</span>
                <AppIcon v-if="date === modelValue" name="check" :size="12" />
              </button>
            </div>
          </div>
        </template>
      </div>

      <button type="button" class="filter-bar__nav-btn" title="Jour suivant" :disabled="!canGoNext" @click="goToAdjacentDate(1)">
        <AppIcon name="chevronRight" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  /* Se règle sur SA largeur : la barre vit dans une carte large comme dans un panneau étroit. */
  container: filterbar / inline-size;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 14px;
}

/* ------------------------------------------------------- raccourcis */
/* Barre segmentée : même fond et même relief que les onglets (TabbedView). */
.filter-bar__pills {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.filter-bar__pill {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.filter-bar__pill:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.filter-bar__pill--active,
.filter-bar__pill--active:hover {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ------------------------------------------------ navigation de date */
.filter-bar__date-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  transition: border-color var(--cm-transition);
}

/* Une date précise est choisie : la barre entière prend le liseré de section. */
.filter-bar__date-nav.is-active {
  border-color: rgba(var(--cm-section-rgb) / 0.35);
}

.filter-bar__nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.filter-bar__nav-btn:hover:not(:disabled) {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.filter-bar__nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.filter-bar__date-picker {
  position: relative;
}

.filter-bar__date-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 156px;
  height: 28px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.filter-bar__date-label:hover:not(:disabled) {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.filter-bar__date-label:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-bar__date-label--active,
.filter-bar__date-label--active:hover:not(:disabled) {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.filter-bar__date-icon {
  flex-shrink: 0;
  color: var(--cm-text-muted);
}

.filter-bar__date-label--active .filter-bar__date-icon {
  color: inherit;
}

.filter-bar__date-text {
  flex: 1;
  text-align: center;
  white-space: nowrap;
}

.filter-bar__date-caret {
  flex-shrink: 0;
  transition: transform var(--cm-transition);
}

.filter-bar__date-caret.is-open {
  transform: rotate(180deg);
}

/* --------------------------------------------------- liste des jours */
.filter-bar__date-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 31;
  display: flex;
  flex-direction: column;
  min-width: 212px;
  max-height: 320px;
  padding: 6px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-raised);
  box-shadow: var(--cm-shadow-lg);
  animation: filter-bar-pop 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes filter-bar-pop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filter-bar__date-dropdown-title {
  margin: 0;
  padding: 6px 10px 8px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  border-bottom: 1px solid var(--cm-border-soft);
}

.filter-bar__date-options {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 4px;
  overflow-y: auto;
}

.filter-bar__date-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--cm-radius-sm);
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.filter-bar__date-option:hover {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

.filter-bar__date-option--active,
.filter-bar__date-option--active:hover {
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-weight: 700;
}

/* Moins large : des raccourcis plus serrés, toujours sur une ligne. */
@container filterbar (max-width: 540px) {
  .filter-bar__pill {
    padding: 0 10px;
  }
}

/* Panneau étroit, la ligne ne tient plus (≈ 500 px avec les raccourcis
   serrés) : les raccourcis sur toute la largeur, la navigation de date
   dessous, sur toute la largeur aussi. Une requête de conteneur ne règle que
   les DESCENDANTS du conteneur : ce sont donc les deux groupes qui prennent
   chacun une ligne entière — l'ancienne règle qui passait .filter-bar (le
   conteneur lui-même) en colonne ne s'appliquait jamais. */
@container filterbar (max-width: 500px) {
  .filter-bar__pills,
  .filter-bar__date-nav {
    display: flex;
    flex: 1 1 100%;
  }

  .filter-bar__pill {
    flex: 1;
    padding: 0 8px;
    text-align: center;
  }

  .filter-bar__date-nav {
    justify-content: space-between;
  }

  .filter-bar__date-picker {
    flex: 1;
  }

  .filter-bar__date-label {
    width: 100%;
  }

  .filter-bar__date-dropdown {
    left: 0;
    right: 0;
  }
}
</style>
