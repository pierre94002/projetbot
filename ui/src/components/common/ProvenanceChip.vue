<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { liveNow } from '@/utils/liveClock.js';
import { etatProvenance, RELEVE_ANCIEN_APRES_HEURES } from '@/utils/langageParis.js';

/**
 * La pastille de PROVENANCE (étape 6 du plan, 06/10/2026) : d'où vient un
 * chiffre et de quand. La règle de Pierre du 03/10/2026 — « il faut que tu me
 * mettes le vrai endroit des données » — en un composant : le fournisseur RÉEL
 * (« The Odds API », « ESPN, football-data.co.uk », « magasin FotMob »), jamais
 * un libellé de source générique, et l'heure du relevé. Un relevé ancien passe
 * à l'ambre ET dit « il y a 15 jours » (lisible sans la couleur) ; une source
 * absente ou une heure inconnue se DISENT (« source non indiquée », « heure du
 * relevé inconnue »), jamais un tiret ni le silence.
 *
 * `source` : le fournisseur réel. `releveLe` : l'instant du relevé (ISO).
 * `action` : « relevé » (défaut), « calculé », « mis à jour ». `fichier` : où c'est
 * lu sur ce PC, au survol. `payant` : la source coûte du quota. `vieuxApresHeures` :
 * au-delà, le relevé est ancien (défaut 24 h, comme DataOriginMenu ; null : jamais).
 * Deux emplacements pour que l'appelant garde ses propres mots : `source` (le
 * nom) et `quand` (la partie « relevé le … », avec { texte, ancien, ilYA } pour
 * reprendre l'ambre et le « il y a N jours » à son compte). `detail` : une
 * précision de plus au survol. Le panneau complet des sources reste celui de
 * DataOriginMenu ; ceci en est la pastille, posée à côté d'un chiffre.
 */
const props = defineProps({
  source: { type: String, default: null },
  releveLe: { type: [String, Number], default: null },
  action: { type: String, default: 'relevé' },
  fichier: { type: String, default: null },
  detail: { type: String, default: null }, // une précision de plus pour le survol (la durée d'un calcul, ce que couvre le relevé)
  payant: { type: Boolean, default: false },
  vieuxApresHeures: { type: Number, default: RELEVE_ANCIEN_APRES_HEURES },
  maintenant: { type: Number, default: null },
  variante: { type: String, default: 'pastille' } // 'pastille' (cadre, pour un bandeau) | 'ligne' (sans cadre, pour un pied de carte)
});

const lu = computed(() =>
  etatProvenance({
    source: props.source,
    releveLe: props.releveLe,
    action: props.action,
    vieuxApresHeures: props.vieuxApresHeures,
    maintenant: props.maintenant ?? liveNow.value
  })
);
const titre = computed(() => `${lu.value.titre}${props.detail ? ` ${props.detail}` : ''}${props.fichier ? ` Lu dans ${props.fichier}.` : ''}${props.payant ? ' Source payante.' : ''}`);
const ICONES = { recent: 'database', ancien: 'clock', 'sans-heure': 'info', 'sans-source': 'alert' };
</script>

<template>
  <span class="prov" :class="[`is-${lu.etat}`, `prov--${variante}`]" :title="titre">
    <AppIcon :name="ICONES[lu.etat]" :size="11" class="prov__icon" />
    <span class="prov__source"><slot name="source">{{ lu.source ?? lu.texte }}</slot></span>
    <span v-if="lu.source" class="prov__when"><slot name="quand" :texte="lu.texte" :ancien="lu.ancien" :il-y-a="lu.ilYA">{{ lu.texte }}</slot></span>
    <span v-if="payant" class="prov__paid">payant</span>
  </span>
</template>

<style scoped>
.prov {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  max-width: 100%;
  padding: 4px 10px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.4;
  cursor: help;
}

.prov__icon {
  flex-shrink: 0;
  color: var(--cm-text-muted);
}

/* Le fournisseur en clair, le plus lisible des deux ; l'heure, un cran plus discrète. */
.prov__source {
  min-width: 0;
  font-weight: 700;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.prov__when {
  color: var(--cm-text-muted);
}

.prov__when::before {
  content: '·';
  margin-right: 6px;
}

.prov__paid {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

/* Une ligne de pied de carte : sans cadre ni fond tant que tout va bien (l'ambre, lui, garde son cadre). */
.prov--ligne {
  padding: 0 4px 0 0;
  border-color: transparent;
  background: transparent;
  font-size: 11px;
}

.prov--ligne.is-ancien {
  padding: 3px 9px;
}

/* Un relevé ancien : l'ambre, et les mots « il y a N jours » dans le texte. */
.prov.is-ancien {
  border-color: rgba(var(--cm-warning-rgb) / 0.3);
  background: var(--cm-warning-soft);
}

.prov.is-ancien .prov__icon,
.prov.is-ancien .prov__when {
  color: var(--cm-warning);
}

/* Heure inconnue ou source absente : pointillés et ambre, jamais passé sous silence. */
.prov.is-sans-heure,
.prov.is-sans-source {
  border-style: dashed;
  border-color: rgba(var(--cm-warning-rgb) / 0.4);
  background: transparent;
}

.prov.is-sans-heure .prov__when,
.prov.is-sans-source .prov__source {
  color: var(--cm-warning);
}
</style>
