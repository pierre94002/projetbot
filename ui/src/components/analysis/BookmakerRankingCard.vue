<script setup>
/**
 * Le CLASSEMENT des bookmakers (étape 31 du plan, 22/10/2026) pour une mesure de l'étape 22, à un moment du prix :
 *   - `justesse` : qui est le plus juste — la perte log de ses probabilités justes (marge retirée par la méthode
 *     puissance) face au résultat, TOUJOURS comparée sur les MÊMES matchs pour deux bookmakers ;
 *   - `vitesse`  : qui bouge le premier vers la clôture — la part du mouvement du marché qu'il a déjà faite.
 * Le meneur est celui qui BAT le plus d'autres livres sur leurs matchs communs ; il est jugé face à chacun par le
 * juge de l'étape 16 (fourchette élargie pour le nombre de comparaisons essayées, jamais sous 200 matchs).
 *
 * Tout est LU (props : les lignes de GET /api/market-knowledge pour le championnat choisi) ; rien n'est calculé ici.
 * Le tableau reste TOUJOURS affiché, même sans meneur à ce moment (« pas mesuré »). Aucun vert, aucun rouge : rien
 * ici n'est une value. Les mots viennent de utils/bookmakers.js.
 */
import { computed, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import { MOMENTS, MOMENTS_DE_JUSTESSE, MOMENTS_DE_VITESSE, classementDuMoment } from '@/utils/bookmakers.js';

const props = defineProps({
  /** 'justesse' ou 'vitesse'. */
  mesure: { type: String, required: true },
  /** Les lignes du championnat lu : { justesse, vitesse, … } (la route). */
  lignes: { type: Object, default: () => ({}) },
  livres: { type: Array, default: () => [] },
  /** Le nom du championnat lu, pour le titre. */
  nom: { type: String, default: 'Tous les championnats' },
  /** { source, releveLe, action, fichier, detail } : la provenance de la page (utils/bookmakers.js). */
  provenance: { type: Object, default: null },
  /** Le texte d'une ligne vide : « pas encore mesuré », ou « lecture en cours ». */
  vide: { type: String, default: 'pas encore mesuré' },
  /** Vrai seulement quand les chiffres du championnat sont lus : l'absence de meneur peut alors dire POURQUOI ; sinon elle dit `vide`. */
  calculLu: { type: Boolean, default: false }
});

const justesse = computed(() => props.mesure === 'justesse');
const MOMENTS_PROPOSES = computed(() => (justesse.value ? MOMENTS_DE_JUSTESSE : MOMENTS_DE_VITESSE));
const choix = computed(() => MOMENTS_PROPOSES.value.map((m) => ({ value: m, label: MOMENTS[m].court })));
const moment = ref(MOMENTS_PROPOSES.value[0]);

/** Le premier moment qui a un meneur (le choix de Pierre est gardé tant qu'il en a un). */
function momentParDefaut() {
  const lignes = props.lignes?.[props.mesure] ?? [];
  return MOMENTS_PROPOSES.value.find((m) => lignes.some((l) => l.cle === 'meneur' && l.moment === m)) ?? MOMENTS_PROPOSES.value[0];
}
watch(
  () => [props.lignes, props.mesure],
  () => {
    const lignes = props.lignes?.[props.mesure] ?? [];
    if (!lignes.some((l) => l.cle === 'meneur' && l.moment === moment.value)) moment.value = momentParDefaut();
  },
  { immediate: true }
);

const classement = computed(() => classementDuMoment({ lignes: props.lignes, livres: props.livres, mesure: props.mesure, moment: moment.value }));
const titre = computed(() => (justesse.value ? 'Qui est le plus juste ?' : 'Qui bouge le premier ?'));
const sousTitre = computed(() =>
  justesse.value
    ? 'La perte log de chaque bookmaker (plus c’est bas, plus il est juste), marge retirée de ses cotes — et chacun comparé aux autres sur les MÊMES matchs'
    : 'La part du mouvement du marché qu’un bookmaker a déjà faite quand tous sont regardés au même instant — celui qui bouge avant les autres donne le prix de demain'
);
const colonneValeur = computed(() => (justesse.value ? 'Perte log sur ses matchs' : 'Avance sur le marché'));
const aideValeur = computed(() =>
  justesse.value
    ? 'Plus la perte log est basse, plus ses probabilités justes se rapprochent des résultats. Calculée sur SES matchs : ne se compare pas d’un livre à l’autre, seules les colonnes « bat » et « face au meneur » le font.'
    : '+100 % : déjà au prix de clôture ; 0 : avec le marché ; négatif : en retard. Calculée sur SES matchs : seules les colonnes « devance » et « face au meneur » comparent deux livres.'
);
const mot = computed(() => (justesse.value ? { bat: 'Bat', perd: 'Perd contre', egal: 'À égalité' } : { bat: 'Devance', perd: 'Est devancé par', egal: 'À égalité' }));
</script>

<template>
  <AppCard
    class="brc"
    :icon="justesse ? 'target' : 'bolt'"
    :eyebrow="justesse ? 'Justesse' : 'Vitesse'"
    :title="titre"
    :subtitle="sousTitre"
    :data-bloc="justesse ? 'justesse' : 'vitesse'"
    :data-moment="moment"
  >
    <div class="brc__corps">
      <div class="brc__choix">
        <span class="brc__etiquette">À quel moment du prix ?</span>
        <TabbedView v-model="moment" :tabs="choix" />
      </div>
      <p class="brc__moment">{{ nom }} · {{ MOMENTS[moment].long }}</p>

      <p v-if="classement.disponible" class="brc__phrase" data-meneur>
        <AppIcon name="award" :size="14" />
        <span>{{ classement.phrase }}</span>
      </p>
      <p v-else class="brc__phrase is-vide" data-meneur>
        <AppIcon name="info" :size="14" />
        <span v-if="calculLu">Pas mesuré {{ MOMENTS[moment].long }} pour {{ nom }} : aucun bookmaker n’a assez de matchs en commun avec un autre pour être comparé (200 au moins).</span>
        <span v-else>Pas mesuré {{ MOMENTS[moment].long }} pour {{ nom }} : {{ vide }}.</span>
      </p>

      <div class="cm-table-wrap brc__wrap">
        <table class="cm-table brc__table" :data-tableau="mesure">
          <thead>
            <tr>
              <th class="is-left">Rang</th>
              <th class="is-left">Bookmaker</th>
              <th title="Le nombre de matchs que ce bookmaker a cotés à ce moment">Matchs</th>
              <th :title="aideValeur">{{ colonneValeur }}</th>
              <th :title="justesse ? 'Combien d’autres livres il bat sur leurs matchs communs' : 'Combien d’autres livres il devance sur leurs matchs communs'">{{ mot.bat }}</th>
              <th :title="justesse ? 'Combien d’autres livres le battent sur leurs matchs communs' : 'Combien d’autres livres le devancent sur leurs matchs communs'">{{ mot.perd }}</th>
              <th>{{ mot.egal }}</th>
              <th class="is-left" title="Le meneur face à ce livre, sur leurs matchs communs, jugé par le juge de la mesure">Face au meneur</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in classement.lignes" :key="l.livre" :class="{ 'is-meneur': l.meneur }" :data-livre="l.livre">
              <td class="is-left cm-numeric">{{ l.rang }}</td>
              <td class="is-left is-strong">
                {{ l.titre }}
                <span class="cm-chip brc__type" :class="l.type.ton" :title="l.type.titre">{{ l.type.texte }}</span>
              </td>
              <td class="cm-numeric">{{ l.n === null ? 'non lu' : l.n.toLocaleString('fr-FR') }}</td>
              <td class="cm-numeric">{{ l.valeurTexte }}</td>
              <td class="cm-numeric is-strong">{{ l.bat }}</td>
              <td class="cm-numeric">{{ l.perd }}</td>
              <td class="cm-numeric">{{ l.egal }}</td>
              <td class="is-left brc__face">
                <span v-if="l.meneur" class="cm-chip is-info"><AppIcon name="award" :size="11" />le meneur</span>
                <template v-else-if="l.face">
                  <span class="cm-chip" :class="l.face.ton" :title="l.face.titre">{{ l.face.texte }}</span>
                  <small class="brc__petit">{{ l.face.nTexte }}</small>
                  <small v-if="l.faceJamaisVues" class="brc__petit" :title="l.faceJamaisVues.titre">matchs jamais vus : {{ l.faceJamaisVues.texte }} ({{ l.faceJamaisVues.nTexte }})</small>
                </template>
                <span v-else class="brc__vide">pas comparé au meneur : moins de 200 matchs en commun</span>
              </td>
            </tr>
            <tr v-if="!classement.lignes.length">
              <td class="is-left brc__vide" colspan="8">{{ vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="2">Σ Total<small class="brc__petit">{{ classement.pied.texte.sigma }}</small></td>
              <td class="cm-numeric is-strong" :title="'Chaque match compte une fois par bookmaker qui le cote'">{{ classement.pied.texte.cotes }}</td>
              <td class="brc__moyenne">somme sans objet</td>
              <td class="cm-numeric is-strong">{{ classement.pied.sigma.bat }}</td>
              <td class="cm-numeric is-strong">{{ classement.pied.sigma.perd }}</td>
              <td class="cm-numeric is-strong">{{ classement.pied.sigma.egal }}</td>
              <td class="is-left brc__moyenne">une victoire est la défaite d’un autre</td>
            </tr>
            <tr>
              <td class="is-left brc__moyenne" colspan="2">⌀ Moyenne<small class="brc__petit">chaque livre compte pour un</small></td>
              <td class="cm-numeric brc__moyenne">{{ classement.pied.texte.n }}</td>
              <td class="cm-numeric brc__moyenne">{{ classement.pied.texte.valeur }}</td>
              <td class="cm-numeric brc__moyenne">{{ classement.pied.texte.bat }}</td>
              <td class="cm-numeric brc__moyenne"></td>
              <td class="cm-numeric brc__moyenne"></td>
              <td class="is-left brc__moyenne"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="brc__pied">
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
          :titre="justesse ? 'Comment on juge la justesse' : 'Comment on mesure la vitesse'"
          :texte="justesse
            ? 'Pour chaque match, la marge du bookmaker est retirée de ses cotes (méthode puissance), puis on regarde la probabilité qu’il donnait au résultat qui s’est produit : la perte log est la moyenne de ces erreurs. Deux bookmakers ne se comparent que sur les matchs qu’ILS COTENT TOUS LES DEUX ; le meneur est celui qui en bat le plus. « Jamais vus » : les matchs qui n’ont servi à aucune règle déjà réglée sur ces mêmes cotes.'
            : 'À un même instant pour tous (le relevé du vendredi ou du mardi, ou trois heures avant le coup d’envoi), on regarde où chaque bookmaker met sa probabilité par rapport à la moyenne, puis de combien le marché bouge jusqu’à la clôture : l’avance est la part de ce mouvement déjà faite.'"
        />
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.brc {
  container: brc / inline-size;
}

.brc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brc__choix {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.brc__etiquette {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.brc__moment {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.brc__phrase {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-info-rgb) / 0.3);
  background: var(--cm-info-soft);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.brc__phrase.is-vide {
  border-style: dashed;
  border-color: var(--cm-border);
  background: transparent;
  font-weight: 500;
  color: var(--cm-text-secondary);
}

.brc__phrase :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.brc__wrap {
  max-height: 520px;
}

.brc__table td {
  vertical-align: top;
}

.brc__type {
  margin-left: 6px;
  vertical-align: middle;
}

.brc__face {
  min-width: 200px;
  white-space: normal;
}

.brc__petit {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.brc__vide {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.brc__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

.brc__table tr.is-meneur td {
  background: rgba(var(--cm-info-rgb) / 0.06);
}

.brc__pied {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
