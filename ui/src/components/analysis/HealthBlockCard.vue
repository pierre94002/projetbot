<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { pastilleDuBloc, lienDuBloc, mesureDuBloc } from '@/utils/santeMoteur.js';

/**
 * LE CADRE D'UN BLOC de « Santé du moteur » (étape 24 du plan, 14/10/2026) : le titre et sa pastille d'état, le
 * chiffre (un seul, gros), la phrase, puis — dans l'emplacement — le détail propre au bloc ; en pied, la source
 * réelle et l'heure de la mesure (ProvenanceChip), et le lien vers la vraie place de l'information. Un bloc
 * dont la donnée manque reste là, avec « pas encore mesuré » et pourquoi (jamais un tiret ni un trou).
 *
 * `bloc` est celui de GET /api/engine-health ; le composant ne calcule rien : les mots viennent de
 * utils/santeMoteur.js. `compact` : le cadre d'un des trois feux du haut (pas de détail, pied plus court).
 */
const props = defineProps({
  bloc: { type: Object, required: true },
  icone: { type: String, default: 'activity' },
  compact: { type: Boolean, default: false }
});

const pastille = computed(() => pastilleDuBloc(props.bloc));
const lien = computed(() => lienDuBloc(props.bloc));
const mesure = computed(() => mesureDuBloc(props.bloc));
const manque = computed(() => props.bloc.etat === 'pas-mesure' || props.bloc.etat === 'indisponible');
</script>

<template>
  <AppCard class="sante-bloc" :class="{ 'is-compact': compact, 'is-manque': manque }" :icon="icone" :title="bloc.titre" :data-bloc="bloc.cle" :data-etat="bloc.etat">
    <template #actions>
      <span class="cm-chip sante-bloc__etat" :class="pastille.ton"><AppIcon :name="pastille.icone" :size="11" />{{ pastille.texte }}</span>
    </template>

    <div class="sante-bloc__chiffre">
      <span class="sante-bloc__valeur cm-numeric" :class="{ 'is-manque': manque }">{{ bloc.valeur }}</span>
      <span v-if="bloc.legende" class="sante-bloc__legende cm-text-secondary">{{ bloc.legende }}</span>
    </div>
    <p class="sante-bloc__phrase" :class="{ 'cm-text-secondary': !manque }">{{ bloc.phrase }}</p>

    <slot />

    <footer class="sante-bloc__pied">
      <ProvenanceChip :source="bloc.source?.libelle ?? null" :releve-le="mesure.instant" :action="bloc.action ?? 'relevé'" :fichier="bloc.source?.fichier ?? null" variante="ligne">
        <template v-if="mesure.jourSeul" #quand>{{ bloc.action ?? 'relevé' }} le {{ mesure.jourSeul }}</template>
      </ProvenanceChip>
      <RouterLink v-if="lien" class="cm-link sante-bloc__lien" :to="lien.to">
        {{ lien.libelle }}
        <AppIcon name="arrowRight" :size="12" />
      </RouterLink>
      <span v-else class="sante-bloc__lien cm-text-muted">Pas encore de page : la place est réservée.</span>
    </footer>
  </AppCard>
</template>

<style scoped>
.sante-bloc__etat {
  white-space: nowrap;
}
.sante-bloc__chiffre {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 6px;
}
.sante-bloc__valeur {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--cm-text-primary);
}
.sante-bloc__valeur.is-manque {
  font-size: 17px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}
.sante-bloc.is-compact .sante-bloc__valeur {
  font-size: 22px;
}
.sante-bloc__legende {
  font-size: 12.5px;
}
.sante-bloc__phrase {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
}
.sante-bloc__pied {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}
.sante-bloc__lien {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
}
</style>
