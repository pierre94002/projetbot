<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { ditDeLaCase, texteCourt, ecartDeLaCase } from '@/utils/carteOuParier.js';

/**
 * UNE CASE de la carte « où parier » (étape 23 du plan, 22/10/2026) — le seul dessin d'une case, posé dans la
 * grille (BettingMapGrid), sur la page Opportunités et dans le Repérage.
 *
 * La couleur vient du serveur (bettingMap.js) et ne fait que suivre son mot :
 *   - vert (`--cm-accent`, le vert de la value) SEULEMENT « Prouvé » — l'avantage du moteur au prix prouvé
 *     sur au moins 200 matchs (l'exception écrite dans DESIGN.md § 3 bis) ;
 *   - rouge (`--cm-danger`) « Moins bien que le marché », prouvé ;
 *   - gris en pointillés : pas prouvé, trop peu de matchs, pas encore mesurée, contradictoire, suspendue ;
 *   - gris hachuré : pas de cote archivée.
 * Elle se lit sans la couleur : une icône et un mot, la phrase complète au survol et pour les lecteurs d'écran.
 * `caseCarte` : la case ({ couleur, raison, phrase, matchs, epreuves? }) ; `compacte` : le mot seul (Repérage) ;
 * `avecEcart` : l'écart en % après le mot (grille).
 */
const props = defineProps({
  caseCarte: { type: Object, default: null },
  compacte: { type: Boolean, default: false },
  avecEcart: { type: Boolean, default: false }
});

const dit = computed(() => ditDeLaCase(props.caseCarte));
const texte = computed(() => (props.compacte ? (dit.value.court ?? dit.value.mot) : texteCourt(props.caseCarte)));
const ecart = computed(() => (props.avecEcart ? ecartDeLaCase(props.caseCarte) : null));
const phrase = computed(() => props.caseCarte?.phrase || dit.value.mot);
</script>

<template>
  <span v-if="caseCarte" class="bmc" :class="[`bmc--${dit.ton}`, { 'bmc--compacte': compacte }]" role="note" :aria-label="`Carte « où parier » : ${phrase}`" :title="phrase">
    <AppIcon :name="dit.icone" :size="compacte ? 10 : 11" class="bmc__icone" />
    <span class="bmc__mot">{{ texte }}</span>
    <span v-if="ecart" class="bmc__ecart cm-numeric">{{ ecart }}</span>
  </span>
</template>

<style scoped>
.bmc {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  cursor: help;
  white-space: nowrap;
}

.bmc--compacte {
  padding: 1px 7px 1px 6px;
  font-size: 10.5px;
}

/* Le vert de la value, ici SEULEMENT pour « Prouvé » (DESIGN.md § 3 bis, exception de l'étape 23). */
.bmc--vert {
  border: 1px solid rgba(var(--cm-accent-rgb) / 0.55);
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bmc--rouge {
  border: 1px solid rgba(var(--cm-danger-rgb) / 0.55);
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* Pas de cote archivée : hachuré, le plus discret — rien à mesurer ici. */
.bmc--hachure {
  border-style: dotted;
  color: var(--cm-text-muted);
  background: repeating-linear-gradient(135deg, var(--cm-surface-alt) 0 5px, var(--cm-surface) 5px 10px);
  font-weight: 600;
}

.bmc__icone {
  flex-shrink: 0;
}

.bmc__mot {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bmc__ecart {
  font-weight: 800;
}
</style>
