<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { GUIDE_DE_LECTURE, etatInfobulleInitial, infobulleOuverte, transitionInfobulle } from '@/utils/langageParis.js';

/**
 * La petite bulle « ? » du GUIDE DE LECTURE (étape 6 du plan, 06/10/2026) : une
 * phrase simple pour expliquer value, valeur de clôture, sûr / fragile, séries de
 * pertes normales et cote juste (utils/langageParis.js, GUIDE_DE_LECTURE — un seul
 * endroit pour les phrases). `terme` en choisit une ; `titre` et `texte` posent
 * les leurs pour une notion qui n'est pas au guide.
 *
 * Accessible au clavier, et à la souris comme au doigt :
 *   - Tab sur le « ? » ouvre la bulle, Échap la ferme sans bouger le focus, Tab
 *     ailleurs la ferme ; Entrée ou Espace l'épingle ;
 *   - le survol l'ouvre, la quitter (ou aller sur la bulle sans la quitter) la
 *     ferme au bout d'un instant — on peut donc aller lire la bulle ; un clic
 *     l'épingle, un clic ailleurs la ferme (une touche de doigt fait de même) ;
 *   - la phrase est AUSSI dans la page, masquée à l'œil (aria-describedby) : un
 *     lecteur d'écran la lit dès que le bouton prend le focus, bulle ouverte ou non.
 * Le comportement vit dans transitionInfobulle (utils/langageParis.js), testé sans
 * navigateur.
 *
 * La bulle est posée dans <body> en position fixe, sous le bouton (au-dessus quand
 * la place manque) : une en-tête de tableau défilant ou une carte floutée ne la
 * coupe pas. Le clic n'atteint jamais ce qui entoure le « ? » (un en-tête de
 * colonne triable, une carte cliquable).
 */
const props = defineProps({
  terme: { type: String, default: null },
  titre: { type: String, default: null },
  texte: { type: String, default: null }
});

const id = useId();
const idPhrase = `${id}-phrase`;
const idBulle = `${id}-bulle`;

const entree = computed(() => (props.terme ? GUIDE_DE_LECTURE[props.terme] ?? null : null));
const titreLu = computed(() => props.titre ?? entree.value?.titre ?? '');
const phrase = computed(() => props.texte ?? entree.value?.phrase ?? '');

// ------------------------------------------------------------- l'état
const etat = ref(etatInfobulleInitial());
const ouvert = computed(() => infobulleOuverte(etat.value));
const declencheur = ref(null);
const position = ref({});
let minuteur = null;

const evenement = (nom) => {
  etat.value = transitionInfobulle(etat.value, nom);
};

function survol() {
  clearTimeout(minuteur);
  evenement('survol-entre');
}

/** Quitter le « ? » ne ferme pas tout de suite : le temps d'atteindre la bulle, qui est à côté. */
function quitter() {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => evenement('survol-sort'), 150);
}

function echapSurLeBouton(event) {
  // Elle ne ferme que la bulle : pas la fenêtre ou la liste qui l'entoure.
  if (ouvert.value) event.stopPropagation();
  evenement('echap');
}

// ------------------------------------------------------------ placement
function placer() {
  const el = declencheur.value;
  if (!el || typeof window === 'undefined') return;
  const r = el.getBoundingClientRect();
  const marge = 8;
  const largeur = Math.min(280, window.innerWidth - 2 * marge);
  const gauche = Math.min(Math.max(marge, r.left + r.width / 2 - largeur / 2), window.innerWidth - largeur - marge);
  const dessous = window.innerHeight - r.bottom - marge;
  const versLeHaut = dessous < 150 && r.top - marge > dessous;
  position.value = versLeHaut
    ? { left: `${gauche}px`, width: `${largeur}px`, bottom: `${window.innerHeight - r.top + 6}px` }
    : { left: `${gauche}px`, width: `${largeur}px`, top: `${r.bottom + 6}px` };
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
  if (declencheur.value?.contains(event.target)) return;
  if (event.target?.closest?.(`[id="${idBulle}"]`)) return;
  evenement('dehors');
}

function auClavier(event) {
  if (event.key === 'Escape') evenement('echap');
}

// Écouteurs sur le document seulement bulle ouverte : l'Échap d'une souris posée sur le « ? »
// (sans focus) ferme aussi la bulle ; un tableau qui défile la replace.
function ecouter(oui) {
  const methode = oui ? 'addEventListener' : 'removeEventListener';
  document[methode]('pointerdown', auClicDehors, true);
  document[methode]('keydown', auClavier);
  window[methode]('scroll', replacer, true);
  window[methode]('resize', replacer);
}

watch(ouvert, (oui) => {
  if (oui) placer();
  ecouter(oui);
});

onBeforeUnmount(() => {
  clearTimeout(minuteur);
  if (typeof document !== 'undefined') ecouter(false);
});
</script>

<template>
  <span v-if="phrase" class="helptip">
    <button
      ref="declencheur"
      type="button"
      class="helptip__btn"
      :class="{ 'is-open': ouvert }"
      :aria-label="`Qu'est-ce que « ${titreLu} » ?`"
      :aria-describedby="idPhrase"
      @mousedown.prevent
      @click.stop.prevent="evenement('clic')"
      @focus="evenement('focus')"
      @blur="evenement('blur')"
      @pointerenter="survol"
      @pointerleave="quitter"
      @keydown.esc="echapSurLeBouton"
    >?</button>
    <!-- La phrase pour les lecteurs d'écran : toujours dans la page, masquée à l'œil. `aria-hidden` : elle n'entre pas dans le nom
         de la cellule d'en-tête qui porte le « ? » (sinon chaque colonne annoncerait toute la phrase), mais `aria-describedby`
         la lit quand même, comme la lecture de n'importe quel élément référencé. -->
    <span :id="idPhrase" class="cm-visually-hidden" aria-hidden="true">{{ titreLu }} : {{ phrase }}</span>
    <Teleport to="body">
      <Transition name="helptip-pop">
        <span v-if="ouvert" :id="idBulle" class="helptip__bulle" :style="position" aria-hidden="true" @pointerenter="survol" @pointerleave="quitter">
          <span class="helptip__titre">{{ titreLu }}</span>
          {{ phrase }}
        </span>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.helptip {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  /* Une en-tête de colonne est en petites capitales : la bulle ne les reprend pas. */
  text-transform: none;
  letter-spacing: 0;
}

.helptip__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-left: 5px;
  padding: 0;
  border: 1px solid var(--cm-border-strong);
  border-radius: 50%;
  background: transparent;
  color: var(--cm-text-muted);
  font: inherit;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1;
  cursor: help;
  transition: color var(--cm-transition), border-color var(--cm-transition), background var(--cm-transition);
}

/* La zone à toucher dépasse le cercle de quelques pixels, sans le grossir. */
.helptip__btn::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
}

/* Neutre au survol comme ouverte : une aide n'est ni une value (vert) ni une alerte, et ne prend pas la couleur de la section. */
.helptip__btn:hover,
.helptip__btn.is-open {
  border-color: var(--cm-text-secondary);
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

/* ------------------------------------------------------------- la bulle */
.helptip__bulle {
  position: fixed;
  z-index: 1000;
  display: block;
  padding: 10px 12px 11px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-strong);
  background: var(--cm-surface-raised);
  box-shadow: var(--cm-shadow-lg);
  color: var(--cm-text-primary);
  font-family: var(--cm-font);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0;
  text-align: left;
  text-transform: none;
  white-space: normal;
}

.helptip__titre {
  display: block;
  margin-bottom: 3px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.helptip-pop-enter-active,
.helptip-pop-leave-active {
  transition: opacity 140ms ease, transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.helptip-pop-enter-from,
.helptip-pop-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
