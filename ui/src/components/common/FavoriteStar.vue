<script setup>
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';

/**
 * L'étoile des favoris (03/10/2026, Pierre : « des équipes favorites et des
 * ligues favorites »). Un seul dessin partout :
 * - `interactive` (défaut) : un bouton ; contour gris, doré au survol, plein
 *   et doré une fois favori ; le clic n'ouvre jamais la carte ou la ligne
 *   qui l'entoure (propagation arrêtée) ;
 * - `interactive: false` : la simple marque dorée d'un favori, pour les
 *   endroits où l'on ne choisit pas (classement, carte de rencontre).
 * `variant: 'pill'` : un bouton avec son texte (« Ajouter aux favoris » /
 * « Favori »), pour l'en-tête d'une page d'équipe.
 */
const props = defineProps({
  active: { type: Boolean, default: false },
  label: { type: String, default: '' }, // ce que l'étoile désigne : « Arsenal », « La Liga »
  kind: { type: String, default: 'team' }, // 'team' | 'league' : pour le texte de l'info-bulle
  size: { type: Number, default: 14 },
  interactive: { type: Boolean, default: true },
  variant: { type: String, default: 'icon' } // 'icon' | 'pill'
});

const emit = defineEmits(['toggle']);

/** Le nom accessible du bouton icône : constant, l'état est dans aria-pressed. */
const nomAccessible = computed(() => {
  const nom = (props.kind === 'league' && props.label ? parseLeagueLabel(props.label).name : props.label) || '';
  return props.kind === 'league' ? `Championnat favori${nom ? ` : ${nom}` : ''}` : `Équipe favorite${nom ? ` : ${nom}` : ''}`;
});

const titre = computed(() => {
  const ligue = props.kind === 'league';
  // « La Liga - Spain » se dit « La Liga » : le pays est déjà sur le drapeau.
  const nom = (ligue && props.label ? parseLeagueLabel(props.label).name : props.label) || (ligue ? 'ce championnat' : 'cette équipe');
  if (!props.interactive) return ligue ? `${nom} : championnat favori` : `${nom} : équipe favorite`;
  if (props.active) return `Retirer ${nom} des favoris`;
  return ligue
    ? `Ajouter ${nom} aux championnats favoris : il passera en premier`
    : `Ajouter ${nom} aux équipes favorites : ses matchs passeront en premier`;
});

function basculer(event) {
  event.preventDefault();
  event.stopPropagation();
  emit('toggle');
}
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    class="fav"
    :class="[`fav--${variant}`, { 'is-on': active }]"
    :aria-pressed="variant === 'pill' ? undefined : active"
    :aria-label="variant === 'pill' ? undefined : nomAccessible"
    :title="titre"
    @click="basculer"
    @keydown.enter.stop
  >
    <AppIcon name="star" :size="size" class="fav__icon" />
    <span v-if="variant === 'pill'" class="fav__text">{{ active ? 'Favori' : 'Ajouter aux favoris' }}</span>
  </button>
  <span v-else-if="active" class="fav fav--mark is-on" :title="titre" role="img" :aria-label="titre">
    <AppIcon name="star" :size="size" class="fav__icon" />
  </span>
</template>

<style scoped>
.fav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cm-text-muted);
  font: inherit;
  line-height: 1;
}

button.fav {
  cursor: pointer;
}

/* L'étoile pleine et dorée : le favori. */
.fav.is-on {
  color: var(--cm-gold);
}

.fav.is-on .fav__icon {
  fill: currentColor;
  filter: drop-shadow(0 0 6px rgba(var(--cm-gold-rgb) / 0.45));
}

.fav__icon {
  transition: transform var(--cm-transition), color var(--cm-transition);
}

/* --------------------------------------------------------- bouton icône */
.fav--icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.fav--icon:hover {
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
}

.fav--icon:hover .fav__icon,
.fav--pill:hover .fav__icon {
  transform: scale(1.12);
}

.fav--icon:active .fav__icon,
.fav--pill:active .fav__icon {
  transform: scale(0.9);
}

/* ------------------------------------------------- bouton avec son texte */
.fav--pill {
  height: 32px;
  padding: 0 14px 0 11px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  transition: background var(--cm-transition), border-color var(--cm-transition), color var(--cm-transition);
}

.fav--pill:hover {
  border-color: rgba(var(--cm-gold-rgb) / 0.5);
  color: var(--cm-gold);
}

.fav--pill.is-on {
  border-color: rgba(var(--cm-gold-rgb) / 0.45);
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
}

/* ---------------------------------------------------- la simple marque */
.fav--mark {
  cursor: default;
}
</style>
