<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { mouvementDeCote } from '@/utils/langageParis.js';

/**
 * La flèche de MOUVEMENT d'une cote (étape 6 du plan, 06/10/2026) : sa
 * direction et son ampleur, lisibles SANS la couleur — une flèche qui descend
 * ou monte, un signe (« −12,3 % », « +4,1 % »), et la phrase complète pour les
 * lecteurs d'écran (« Cote en baisse de 12,3 % »). La couleur n'est qu'un
 * renfort : du bleu d'information pour toute variation, du gris pour une cote
 * stable ou un mouvement inconnu. Ni vert ni rouge : une cote qui baisse n'est
 * ni bonne ni mauvaise en soi (le marché joue davantage cette issue), et le
 * vert reste celui de la value (ValueBadge).
 *
 * `pourcent` : la variation de la cote en % (négatif : la cote baisse), telle
 * que le serveur la donne ; à défaut, `de` (cote d'ouverture) et `vers` (cote
 * actuelle). Sous un dixième de point : « stable ». `ampleur` faux : la
 * direction seule, sans chiffre (une ligne de bookmaker). L'appelant peut
 * remplacer le texte du chiffre (emplacement par défaut).
 */
const props = defineProps({
  de: { type: Number, default: null },
  vers: { type: Number, default: null },
  pourcent: { type: Number, default: null },
  ampleur: { type: Boolean, default: true },
  taille: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  sujet: { type: String, default: 'Cote' }, // ce qui bouge, dit aux lecteurs d'écran : « Cote juste »
  titre: { type: String, default: null } // la phrase du survol, quand l'appelant en a une plus précise
});

const mouvement = computed(() => mouvementDeCote({ de: props.de, vers: props.vers, pourcent: props.pourcent, sujet: props.sujet }));
const ICONES = { baisse: 'trendDown', hausse: 'trendUp', stable: 'minus', inconnu: 'minus' };
const TAILLES = { sm: 11, md: 13, lg: 16 };
</script>

<template>
  <span class="omove" :class="[`is-${mouvement.sens}`, `omove--${taille}`]" role="img" :aria-label="mouvement.libelle" :title="titre ?? mouvement.libelle">
    <AppIcon :name="ICONES[mouvement.sens]" :size="TAILLES[taille] ?? TAILLES.md" class="omove__icon" />
    <span v-if="ampleur" class="omove__text"><slot>{{ mouvement.texte }}</slot></span>
  </span>
</template>

<style scoped>
.omove {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--cm-info);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: help;
}

.omove__icon {
  flex-shrink: 0;
}

.omove--sm {
  gap: 3px;
  font-size: 11px;
}

.omove--lg {
  gap: 5px;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

/* Stable, ou mouvement inconnu : le gris, sans flèche qui monte ni qui descend. */
.omove.is-stable,
.omove.is-inconnu {
  color: var(--cm-text-muted);
  font-weight: 600;
}
</style>
