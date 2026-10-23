<script setup>
/**
 * Les MARGES des bookmakers (étape 31 du plan, 22/10/2026) : ce que chacun garde sur ses cotes, par moment du prix,
 * telle que l'étape 22 l'a mesurée (data/marketKnowledge.js) — la somme des 1/cote moins 1, en %. Une bourse
 * (Kalshi, Smarkets, Betfair Exchange) n'a pas de marge mais une commission : elle la montre à la place. Une marge
 * plus basse est un meilleur prix : Pinnacle garde environ 3 %, un bookmaker grand public 6 à 10 %.
 *
 * Tout est LU (props : les lignes de GET /api/market-knowledge pour le championnat choisi) ; rien n'est calculé ici.
 * Le tableau reste TOUJOURS affiché, toutes ses colonnes de moments comprises, même sans mesure. Aucun vert, aucun
 * rouge. Les mots viennent de utils/bookmakers.js.
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { MOMENTS, MOMENTS_DE_MARGE, tableauDesMarges } from '@/utils/bookmakers.js';

const props = defineProps({
  lignes: { type: Object, default: () => ({}) },
  livres: { type: Array, default: () => [] },
  nom: { type: String, default: 'Tous les championnats' },
  provenance: { type: Object, default: null },
  /** Le texte d'une ligne vide : « pas encore mesuré », ou « lecture en cours ». */
  vide: { type: String, default: 'pas encore mesuré' }
});

const tableau = computed(() => tableauDesMarges({ lignes: props.lignes, livres: props.livres }));
</script>

<template>
  <AppCard
    class="bmc"
    icon="percent"
    eyebrow="Marges"
    title="Ce que chaque bookmaker garde"
    subtitle="La marge de chaque cote, moment par moment — plus elle est basse, meilleur est le prix. Une bourse montre sa commission à la place."
    data-bloc="marges"
  >
    <div class="bmc__corps">
      <p class="bmc__nom">{{ nom }}</p>

      <div class="cm-table-wrap bmc__wrap">
        <table class="cm-table bmc__table" data-tableau="marges">
          <thead>
            <tr>
              <th class="is-left">Bookmaker</th>
              <th v-for="m in MOMENTS_DE_MARGE" :key="m" :title="MOMENTS[m].long">{{ MOMENTS[m].court }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in tableau.lignes" :key="l.livre" :data-livre="l.livre">
              <td class="is-left is-strong">
                {{ l.titre }}
                <span class="cm-chip bmc__type" :class="l.type.ton" :title="l.type.titre">{{ l.type.texte }}</span>
              </td>
              <td v-for="m in MOMENTS_DE_MARGE" :key="m" class="bmc__case" :class="{ 'is-vide': l.cases[m].vide }" :title="l.cases[m].titre">
                <template v-if="!l.cases[m].vide">
                  <span class="cm-numeric bmc__valeur">{{ l.cases[m].texte }}</span>
                  <small class="bmc__petit">{{ l.cases[m].n.toLocaleString('fr-FR') }} matchs</small>
                </template>
                <span v-else>{{ l.cases[m].texte }}</span>
              </td>
            </tr>
            <tr v-if="!tableau.lignes.length">
              <td class="is-left bmc__vide" :colspan="MOMENTS_DE_MARGE.length + 1">{{ vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="bmc__petit">cotes lues (un match compte une fois par bookmaker qui le cote)</small></td>
              <td v-for="m in MOMENTS_DE_MARGE" :key="m" class="cm-numeric is-strong">{{ tableau.pied.texte.sigma[m] }}</td>
            </tr>
            <tr>
              <td class="is-left bmc__moyenne">⌀ Moyenne<small class="bmc__petit">marge moyenne des bookmakers, chacun compte pour un (les bourses n’y sont pas)</small></td>
              <td v-for="m in MOMENTS_DE_MARGE" :key="m" class="cm-numeric bmc__moyenne">{{ tableau.pied.texte.moyenne[m] }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="bmc__pied">
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
          titre="Comment lire une marge"
          texte="Si les probabilités déduites des cotes d’un match font 105 %, la marge du bookmaker est de 5 % : c’est ce qu’il garde, en moyenne, sur chaque euro misé. Les cases vides disent « pas coté » : ce bookmaker n’a pas de cote à ce moment dans ce championnat (la plupart des moments n’existent que dans les relevés datés, depuis le 04/10/2026)."
        />
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.bmc {
  container: bmc / inline-size;
}

.bmc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bmc__nom {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.bmc__wrap {
  max-height: 560px;
}

.bmc__table td {
  vertical-align: top;
}

.bmc__type {
  margin-left: 6px;
  vertical-align: middle;
}

.bmc__case {
  min-width: 96px;
  white-space: normal;
}

.bmc__case.is-vide {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.bmc__valeur {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.bmc__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.bmc__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.bmc__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

.bmc__pied {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
