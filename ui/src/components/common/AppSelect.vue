<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';

/**
 * La liste déroulante de l'appli (03/10/2026, Pierre : « il faut que toutes
 * les colonnes d'affichage soient plus jolies », devant la liste native du
 * navigateur, blanche et surlignée en bleu Windows). Même usage qu'avant —
 * `label`, `options: [{ value, label }]`, v-model, `disabled` — mais une
 * liste dessinée comme le reste de l'appli : panneau sombre, l'option choisie
 * en couleur de section avec sa coche, une recherche dès que la liste est
 * longue, le clavier (flèches, Entrée, Échap, Début, Fin, Page), une lettre
 * pour sauter à la suivante qui commence par elle.
 *
 * Champs d'option facultatifs : `league` (drapeau et nom de la compétition),
 * `favorite` (étoile dorée), `group` (sous-titre de section, à chaque
 * changement), `hint` (précision en gris à droite), `icon` (icône AppIcon).
 *
 * La liste est posée dans <body> (Teleport), sous le champ — au-dessus quand
 * la place manque — et suit le défilement : une carte au fond flouté ne la
 * coupe ni ne la recouvre. Elle reprend la couleur de section de la page
 * d'où elle s'ouvre ([data-section]).
 */
const props = defineProps({
  label: { type: String, default: '' },
  options: { type: Array, required: true }, // [{ value, label, league?, favorite?, group?, hint?, icon? }]
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Choisir…' },
  searchable: { type: Boolean, default: null } // null : une recherche dès 9 options
});

const model = defineModel({ required: true });

const id = useId();
const listeId = `${id}-liste`;
const libelleId = `${id}-libelle`;
const idOption = (index) => `${id}-option-${index}`;

const ouvert = ref(false);
const declencheur = ref(null);
const panneau = ref(null);
const liste = ref(null);
const champRecherche = ref(null);
const filtre = ref('');
const actif = ref(-1); // index dans `visibles`
const position = ref({});
const section = ref(null);

const choisie = computed(() => props.options.find((o) => o.value === model.value) ?? null);
const avecRecherche = computed(() => props.searchable ?? props.options.length > 8);

const normaliser = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const visibles = computed(() => {
  const q = normaliser(filtre.value.trim());
  if (!q) return props.options;
  return props.options.filter((o) => normaliser(`${o.label} ${o.hint ?? ''} ${o.league ?? ''} ${o.group ?? ''}`).includes(q));
});

/** Les lignes du panneau : un sous-titre à chaque changement de groupe, puis les options. */
const lignes = computed(() => {
  const out = [];
  let groupe;
  visibles.value.forEach((option, index) => {
    if (option.group && option.group !== groupe) out.push({ cle: `g${index}`, titre: option.group });
    groupe = option.group;
    out.push({ cle: `o${index}`, option, index });
  });
  return out;
});

// ------------------------------------------------------------ placement
/** Sous le champ, ou au-dessus quand la place manque ; jamais hors de l'écran. */
function placer() {
  const el = declencheur.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const marge = 8;
  const largeur = Math.min(Math.max(r.width, 240), window.innerWidth - 2 * marge);
  const gauche = Math.min(Math.max(marge, r.left), window.innerWidth - largeur - marge);
  const dessous = window.innerHeight - r.bottom - marge - 6;
  const dessus = r.top - marge - 6;
  const versLeHaut = dessous < 240 && dessus > dessous;
  const hauteur = Math.max(120, Math.min(380, versLeHaut ? dessus : dessous));
  position.value = versLeHaut
    ? { left: `${gauche}px`, width: `${largeur}px`, bottom: `${window.innerHeight - r.top + 6}px`, maxHeight: `${hauteur}px` }
    : { left: `${gauche}px`, width: `${largeur}px`, top: `${r.bottom + 6}px`, maxHeight: `${hauteur}px` };
}

let image = null;
function replacer() {
  if (image) return;
  image = requestAnimationFrame(() => {
    image = null;
    if (ouvert.value) placer();
  });
}

function auClicDehors(event) {
  if (declencheur.value?.contains(event.target) || panneau.value?.contains(event.target)) return;
  fermer();
}

function ecouter(oui) {
  const methode = oui ? 'addEventListener' : 'removeEventListener';
  document[methode]('pointerdown', auClicDehors, true);
  window[methode]('scroll', replacer, true);
  window[methode]('resize', replacer);
}

onBeforeUnmount(() => ecouter(false));

// ------------------------------------------------- ouverture, choix
function montrerActif(bloc = 'nearest') {
  nextTick(() => panneau.value?.querySelector('.field__option.is-active')?.scrollIntoView({ block: bloc }));
}

async function ouvrir() {
  if (props.disabled || ouvert.value) return;
  section.value = declencheur.value?.closest('[data-section]')?.getAttribute('data-section') ?? null;
  filtre.value = '';
  placer();
  ouvert.value = true;
  actif.value = Math.max(0, props.options.findIndex((o) => o.value === model.value));
  ecouter(true);
  await nextTick();
  (champRecherche.value ?? liste.value)?.focus({ preventScroll: true });
  montrerActif('center');
}

function fermer({ rendreLeFocus = false } = {}) {
  if (!ouvert.value) return;
  ouvert.value = false;
  ecouter(false);
  if (rendreLeFocus) declencheur.value?.focus({ preventScroll: true });
}

function basculer() {
  if (ouvert.value) fermer();
  else ouvrir();
}

function choisir(option) {
  model.value = option.value;
  fermer({ rendreLeFocus: true });
}

// Une recherche qui change : la première option trouvée devient l'active.
watch(filtre, () => {
  actif.value = visibles.value.length ? 0 : -1;
  montrerActif();
});

// ---------------------------------------------------------------- clavier
function clavierDeclencheur(event) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    ouvrir();
  }
}

function deplacer(pas) {
  const n = visibles.value.length;
  if (!n) return;
  actif.value = Math.min(n - 1, Math.max(0, (actif.value < 0 ? 0 : actif.value) + pas));
  montrerActif();
}

function clavierPanneau(event) {
  const n = visibles.value.length;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      deplacer(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      deplacer(-1);
      break;
    case 'PageDown':
      event.preventDefault();
      deplacer(8);
      break;
    case 'PageUp':
      event.preventDefault();
      deplacer(-8);
      break;
    case 'Home':
    case 'End':
      // Dans le champ de recherche, Début et Fin déplacent le curseur du texte.
      if (avecRecherche.value || !n) break;
      event.preventDefault();
      actif.value = event.key === 'Home' ? 0 : n - 1;
      montrerActif();
      break;
    case 'Enter':
      event.preventDefault();
      if (visibles.value[actif.value]) choisir(visibles.value[actif.value]);
      break;
    case 'Escape':
      event.preventDefault();
      event.stopPropagation();
      fermer({ rendreLeFocus: true });
      break;
    case 'Tab':
      fermer();
      break;
    default:
      // Sans recherche : une lettre saute à la prochaine option qui commence par elle.
      if (!avecRecherche.value && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const lettre = normaliser(event.key);
        for (let pas = 1; pas <= n; pas++) {
          const i = (actif.value + pas) % n;
          if (normaliser(visibles.value[i].label).startsWith(lettre)) {
            actif.value = i;
            montrerActif();
            break;
          }
        }
      }
  }
}
</script>

<template>
  <div class="field" :class="{ 'is-open': ouvert, 'is-disabled': disabled }">
    <span v-if="label" :id="libelleId" class="field__label" @click="!disabled && declencheur?.focus()">{{ label }}</span>
    <button
      ref="declencheur"
      type="button"
      class="field__trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="ouvert"
      :aria-controls="listeId"
      :aria-labelledby="label ? libelleId : undefined"
      :disabled="disabled"
      :title="choisie ? (choisie.hint ? `${choisie.label} · ${choisie.hint}` : choisie.label) : placeholder"
      @click="basculer"
      @keydown="clavierDeclencheur"
    >
      <span class="field__value">
        <template v-if="choisie">
          <AppIcon v-if="choisie.favorite" name="star" :size="12" class="field__star" />
          <AppIcon v-else-if="choisie.icon" :name="choisie.icon" :size="14" class="field__icon" />
          <LeagueBadge v-if="choisie.league" :league="choisie.league" class="field__league" />
          <span v-else class="field__text">{{ choisie.label }}</span>
          <span v-if="choisie.hint" class="field__hint">{{ choisie.hint }}</span>
        </template>
        <span v-else class="field__placeholder">{{ placeholder }}</span>
      </span>
      <svg class="field__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="field-pop">
        <div v-if="ouvert" ref="panneau" class="field__panel" :data-section="section" :style="position" @keydown="clavierPanneau">
          <label v-if="avecRecherche" class="field__search">
            <AppIcon name="search" :size="13" />
            <input
              ref="champRecherche"
              v-model="filtre"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              :aria-controls="listeId"
              :aria-expanded="true"
              :aria-activedescendant="actif >= 0 ? idOption(actif) : undefined"
              :placeholder="`Rechercher parmi ${options.length}…`"
              :aria-label="`Rechercher${label ? ` : ${label}` : ''}`"
            />
          </label>
          <ul
            :id="listeId"
            ref="liste"
            class="field__list"
            role="listbox"
            tabindex="-1"
            :aria-labelledby="label ? libelleId : undefined"
            :aria-activedescendant="!avecRecherche && actif >= 0 ? idOption(actif) : undefined"
          >
            <template v-for="ligne in lignes" :key="ligne.cle">
              <li v-if="ligne.titre" class="field__group" role="presentation">{{ ligne.titre }}</li>
              <li
                v-else
                :id="idOption(ligne.index)"
                class="field__option"
                :class="{ 'is-selected': ligne.option.value === model, 'is-active': ligne.index === actif }"
                role="option"
                :aria-selected="ligne.option.value === model"
                @mousemove="actif = ligne.index"
                @click="choisir(ligne.option)"
              >
                <AppIcon v-if="ligne.option.favorite" name="star" :size="12" class="field__star" />
                <AppIcon v-else-if="ligne.option.icon" :name="ligne.option.icon" :size="14" class="field__icon" />
                <LeagueBadge v-if="ligne.option.league" :league="ligne.option.league" class="field__league" />
                <span v-else class="field__option-label">{{ ligne.option.label }}</span>
                <span v-if="ligne.option.hint" class="field__hint">{{ ligne.option.hint }}</span>
                <AppIcon v-if="ligne.option.value === model" name="check" :size="13" class="field__check" />
              </li>
            </template>
            <li v-if="!lignes.length" class="field__empty" role="presentation">Aucun résultat pour « {{ filtre }} »</li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  cursor: default;
}

/* ---------------------------------------------------------------- le champ */
.field__trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 0 11px 0 12px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition), background var(--cm-transition);
}

.field__trigger:hover:not(:disabled) {
  border-color: var(--cm-border-strong);
}

.field__trigger:focus-visible,
.field.is-open .field__trigger {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
  outline: none;
}

.field__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field__value {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.field__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Dans le champ, la valeur choisie passe avant sa précision grise : quand la
   place manque, c'est la précision qui se raccourcit (« 2026-27 » reste
   entier, « 11 235 rencontres » cède). */
.field__value > .field__text {
  flex: 0 0 auto;
  max-width: 100%;
}

.field__value > .field__hint {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field__placeholder {
  color: var(--cm-text-muted);
}

.field__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.field.is-open .field__chevron {
  transform: rotate(180deg);
  color: var(--cm-section);
}

/* -------------------------------------------- éléments d'une option */
.field__star {
  flex-shrink: 0;
  color: var(--cm-gold);
  fill: currentColor;
}

.field__icon {
  flex-shrink: 0;
  color: var(--cm-text-muted);
}

.field__league {
  min-width: 0;
}

.field__hint {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ----------------------------------------------------------- le panneau */
.field__panel {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border);
  background:
    radial-gradient(120% 70% at 0% 0%, rgba(var(--cm-section-rgb) / 0.07), transparent 60%),
    var(--cm-surface-raised);
  box-shadow: var(--cm-shadow-lg);
  color: var(--cm-text-primary);
  font-family: var(--cm-font);
}

.field-pop-enter-active,
.field-pop-leave-active {
  transition: opacity 140ms ease, transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.field-pop-enter-from,
.field-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* La recherche : un champ-pilule, comme ceux de la barre de commande. */
.field__search {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin-bottom: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-text-muted);
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.field__search:focus-within {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.16);
}

.field__search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.field__search input::placeholder {
  color: var(--cm-text-muted);
}

.field__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  outline: none;
}

/* Un sous-titre de groupe, collé en haut pendant qu'on fait défiler le groupe. */
.field__group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 9px 10px 5px;
  background: var(--cm-surface-raised);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.field__group:first-child {
  padding-top: 4px;
}

.field__option {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.field__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field__option.is-active {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

/* L'option choisie : couleur de section et sa coche. */
.field__option.is-selected {
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-weight: 600;
}

.field__option.is-selected.is-active {
  background: rgba(var(--cm-section-rgb) / 0.2);
}

.field__check {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--cm-section);
}

.field__hint + .field__check {
  margin-left: 0;
}

.field__empty {
  padding: 14px 10px;
  font-size: 12.5px;
  color: var(--cm-text-muted);
  text-align: center;
}
</style>
