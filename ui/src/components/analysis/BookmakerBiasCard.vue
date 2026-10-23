<script setup>
/**
 * Les BIAIS des bookmakers (étape 31 du plan, 22/10/2026) : ce que chacun annonce, face à ce qui arrive — pour les
 * outsiders, les nuls, la victoire à domicile et les grandes équipes — telle que l'étape 22 l'a mesurée
 * (data/marketKnowledge.js). L'écart est « réalisé moins annoncé », en points : positif, le bookmaker SOUS-ESTIME ce
 * résultat (il arrive plus souvent qu'il ne le dit) ; négatif, il le SURESTIME. Un biais n'est dit « prouvé » que
 * si la fourchette à 95 % ne contient pas zéro, après correction du nombre de cases essayées.
 *
 * Tout est LU (props : les lignes de GET /api/market-knowledge pour le championnat choisi) ; rien n'est calculé ici.
 * Le tableau reste TOUJOURS affiché, ses quatre colonnes comprises. Aucun vert, aucun rouge : un biais prouvé est
 * bleu (information), « trop peu de matchs » ambre. Les mots viennent de utils/bookmakers.js.
 */
import { computed, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import { CATEGORIES_DE_BIAIS, MOMENTS, MOMENTS_DE_BIAIS, tableauDesBiais } from '@/utils/bookmakers.js';

const props = defineProps({
  lignes: { type: Object, default: () => ({}) },
  livres: { type: Array, default: () => [] },
  nom: { type: String, default: 'Tous les championnats' },
  provenance: { type: Object, default: null },
  /** Le texte d'une ligne vide : « pas encore mesuré », ou « lecture en cours ». */
  vide: { type: String, default: 'pas encore mesuré' }
});

const choix = MOMENTS_DE_BIAIS.map((m) => ({ value: m, label: MOMENTS[m].court }));
const moment = ref(MOMENTS_DE_BIAIS[0]);
watch(
  () => props.lignes,
  () => {
    const l = props.lignes?.biais ?? [];
    if (!l.some((x) => x.moment === moment.value)) moment.value = MOMENTS_DE_BIAIS.find((m) => l.some((x) => x.moment === m)) ?? MOMENTS_DE_BIAIS[0];
  },
  { immediate: true }
);

const tableau = computed(() => tableauDesBiais({ lignes: props.lignes, livres: props.livres, moment: moment.value }));
const categories = Object.entries(CATEGORIES_DE_BIAIS);
</script>

<template>
  <AppCard
    class="bbc"
    icon="sliders"
    eyebrow="Biais"
    title="Ce que chaque bookmaker se trompe à dire"
    subtitle="Ce qu’il annonce face à ce qui arrive : outsiders, nuls, victoire à domicile, grandes équipes. Un écart n’est un biais que s’il dépasse le hasard."
    data-bloc="biais"
    :data-moment="moment"
  >
    <div class="bbc__corps">
      <div class="bbc__choix">
        <span class="bbc__etiquette">À quel moment du prix ?</span>
        <TabbedView v-model="moment" :tabs="choix" />
      </div>
      <p class="bbc__nom">{{ nom }} · {{ MOMENTS[moment].long }}</p>

      <div class="cm-table-wrap bbc__wrap">
        <table class="cm-table bbc__table" data-tableau="biais">
          <thead>
            <tr>
              <th class="is-left">Bookmaker</th>
              <th v-for="[cle, c] in categories" :key="cle" :title="`Annoncé face à réalisé pour ${c.long}`">{{ c.court }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in tableau.lignes" :key="l.livre" :data-livre="l.livre">
              <td class="is-left is-strong">
                {{ l.titre }}
                <span class="cm-chip bbc__type" :class="l.type.ton" :title="l.type.titre">{{ l.type.texte }}</span>
              </td>
              <td v-for="[cle] in categories" :key="cle" class="bbc__case" :class="{ 'is-vide': l.cases[cle].vide }" :title="l.cases[cle].titre">
                <template v-if="!l.cases[cle].vide">
                  <span class="cm-chip bbc__ecart" :class="l.cases[cle].ton">{{ l.cases[cle].texte }}</span>
                  <small class="bbc__petit">{{ l.cases[cle].dit }} · {{ l.cases[cle].n.toLocaleString('fr-FR') }} matchs</small>
                </template>
                <span v-else>{{ l.cases[cle].texte }}</span>
              </td>
            </tr>
            <tr v-if="!tableau.lignes.length">
              <td class="is-left bbc__vide" :colspan="categories.length + 1">{{ vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="bbc__petit">cotes lues, et biais prouvés</small></td>
              <td v-for="[cle] in categories" :key="cle" class="is-strong bbc__sigma">{{ tableau.pied.texte.sigma[cle] }}</td>
            </tr>
            <tr>
              <td class="is-left bbc__moyenne">⌀ Moyenne<small class="bbc__petit">écart moyen, chaque bookmaker compte pour un</small></td>
              <td v-for="[cle] in categories" :key="cle" class="cm-numeric bbc__moyenne">{{ tableau.pied.texte.moyenne[cle] }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="bbc__pied">
        <ProvenanceChip
          v-if="provenance"
          variante="ligne"
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
        <HelpTip
          titre="Comment lire un biais"
          texte="L’écart est « réalisé moins annoncé », en points. +2 : ce résultat arrive 2 points plus souvent que le bookmaker ne le dit (il le sous-estime) ; −2 : 2 points moins souvent (il le surestime). « Pas de biais prouvé » : l’écart peut venir du hasard. Les nuls, par exemple, sont parfois sous-estimés — mais seulement si la fourchette à 95 % reste au-dessus de zéro."
        />
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.bbc {
  container: bbc / inline-size;
}

.bbc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bbc__choix {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.bbc__etiquette {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bbc__nom {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.bbc__wrap {
  max-height: 560px;
}

.bbc__table td {
  vertical-align: top;
}

.bbc__type {
  margin-left: 6px;
  vertical-align: middle;
}

.bbc__case {
  min-width: 132px;
  white-space: normal;
}

.bbc__case.is-vide {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.bbc__ecart {
  font-variant-numeric: tabular-nums;
}

.bbc__petit {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.bbc__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.bbc__sigma {
  font-size: 12px;
  white-space: normal;
}

.bbc__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

.bbc__pied {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
