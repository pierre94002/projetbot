<script setup>
/**
 * La FIABILITÉ DE L'IA, marché par marché et championnat par championnat (étape 45 du plan, 24/10/2026) : la carte « L'IA a-t-elle souvent
 * raison ? » de la page « Bulletin ». C'est le RÉSUMÉ du carnet de l'IA de l'étape 21 : chaque avis d'avant-match de l'IA, réglé au coup de
 * sifflet final — a-t-il tenu ? fait-elle mieux que le moteur seul ? —, avec le nombre de cas. Le carnet COMPLET (confiance annoncée, forme
 * de la fiche, avis « nuance », clôture, ce qui est écarté) reste à sa place, Historique moteur : une information, une place, avec un lien.
 *
 * Le composant n'appelle rien : la page lui donne la réponse de GET /api/match-ai/scorecard (refaite chaque nuit par l'actualisation) et
 * relit sur son signal. Tous les mots viennent de utils/carnetIA.js (les mêmes que ceux du carnet complet) et de utils/pageBulletin.js (la
 * moyenne par marché). Les deux tableaux sont TOUJOURS là, avec leurs en-têtes, Σ (les comptes additionnés, le pourcentage de tous les avis)
 * et ⌀ (chaque marché ou chaque ligne pèse autant) : jamais une somme de pourcentages, jamais le vert (ce n'est pas une value).
 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { TYPES_PAR_DEFAUT, coupesDites, etatDuCarnet, optionsDesTypes, regleDeCoupure, tableauDesChampionnats, tableauDesTypes } from '@/utils/carnetIA.js';
import { CHAMPIONNATS_MONTRES, LIEN_DU_CARNET, PROVENANCE_DU_CARNET, SECTIONS, boutonDesAutres, moyenneDesMarches } from '@/utils/pageBulletin.js';

const props = defineProps({
  /** La réponse de GET /api/match-ai/scorecard, ou null tant qu'elle n'est pas lue. */
  reponse: { type: Object, default: null },
  chargement: { type: Boolean, default: false },
  /** Le message d'une lecture ratée (la dernière réponse reste affichée). */
  erreur: { type: String, default: null }
});

defineEmits(['relire']);

const favoris = useFavoritesStore();
const marche = ref('tous');
const deplie = ref(false);

const carnet = computed(() => props.reponse?.carnet ?? null);
const seuil = computed(() => props.reponse?.seuil ?? 200);
const types = computed(() => (props.reponse?.typesDeMarche?.length ? props.reponse.typesDeMarche : TYPES_PAR_DEFAUT));
const etatDuCarnetDit = computed(() => (props.reponse ? etatDuCarnet(props.reponse) : { titre: props.erreur ? 'Illisible' : 'Pas encore lu', ton: props.erreur ? 'is-warning' : 'is-info', phrase: props.erreur ? 'Le carnet n’a pas pu être lu.' : 'Lecture du carnet…' }));
const parType = computed(() => tableauDesTypes(carnet.value, { types: types.value, minimum: seuil.value }));
const moyenne = computed(() => moyenneDesMarches(carnet.value));
const optionsMarches = computed(() => optionsDesTypes(types.value));
const ligues = computed(() => tableauDesChampionnats(carnet.value, { marche: marche.value, types: types.value, ordonner: (l) => favoris.favoritesFirst(l, { league: (x) => x.league }) }));
const lignesMontrees = computed(() => (deplie.value ? ligues.value.lignes : ligues.value.lignes.slice(0, CHAMPIONNATS_MONTRES)));
const boutonAutres = computed(() => boutonDesAutres(ligues.value.lignes.length, CHAMPIONNATS_MONTRES, deplie.value));
const coupureActive = computed(() => props.reponse?.coupureActive ?? carnet.value?.coupureActive ?? false);
const coupes = computed(() => coupesDites(carnet.value, { coupureActive: coupureActive.value }));
const regle = computed(() => regleDeCoupure(seuil.value));
const section = SECTIONS.fiabilite;
</script>

<template>
  <AppCard class="fiab" :icon="section.icone" :eyebrow="section.eyebrow" :title="section.titre" :subtitle="section.sousTitre" data-bloc="fiabilite-ia">
    <template #actions>
      <HelpTip terme="fourchette-du-hasard" />
      <AppButton variant="secondary" size="sm" :loading="chargement" @click="$emit('relire')">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Relire
      </AppButton>
    </template>

    <div class="fiab__corps" :class="{ 'is-busy': chargement && carnet }" :aria-busy="chargement">
      <LoadingSpinner v-if="chargement && !reponse" label="Lecture du carnet de l’IA…" />

      <div v-if="erreur" class="cm-note is-danger" data-raison="erreur">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">{{ carnet ? 'Lecture impossible — dernier carnet affiché' : 'Carnet de l’IA indisponible' }}</p>
          <p class="cm-note__text">{{ erreur }} Les tableaux ci-dessous restent affichés.</p>
        </div>
      </div>

      <!-- 0. L'état du carnet et ce que dit la règle de la coupure. -->
      <div class="cm-toolbar fiab__etat">
        <span class="cm-chip" :class="etatDuCarnetDit.ton" data-etat-carnet><AppIcon name="clock" :size="11" />{{ etatDuCarnetDit.titre }}</span>
        <p class="fiab__petit">{{ etatDuCarnetDit.phrase }}</p>
      </div>
      <p class="cm-note fiab__note" :class="carnet?.coupes?.length ? 'is-warning' : 'is-info'" data-coupures>
        <span class="cm-note__text">{{ coupes }} {{ regle }}</span>
      </p>

      <!-- 1. Par marché : toujours les onze types, Σ et ⌀. -->
      <section class="fiab__section">
        <h4 class="cm-group-title">Par marché</h4>
        <div class="cm-table-wrap fiab__wrap">
          <table class="cm-table fiab__table" data-tableau="fiabilite-par-marche">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th title="Avis « confirme » ou « contredit » réglés sur ce marché (les avis « nuance » ne sont jamais comptés)">Avis comptés</th>
                <th title="Confirmer un pronostic qui s’est réalisé, ou contredire un pronostic qui ne s’est pas réalisé">Avis tenus</th>
                <th class="is-left" :title="`Le juge de l’étape 16 : au moins ${seuil} matchs jugés pour un verdict`">Face au moteur seul</th>
                <th class="is-left">État</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in parType.lignes" :key="m.cle" :class="{ 'fiab__vide': m.vide, 'is-coupe': m.etat.coupe, 'is-serait-retire': m.etat.seraitRetire }" :data-marche="m.cle">
                <td class="is-left is-strong">{{ m.libelle }}</td>
                <td class="cm-numeric">{{ m.comptes }}</td>
                <td class="cm-numeric">{{ m.tenus }}</td>
                <td class="is-left"><span class="cm-chip fiab__puce" :class="m.juge.ton" :title="m.juge.detail">{{ m.juge.texte }}</span></td>
                <td class="is-left"><span class="cm-chip fiab__puce" :class="m.etat.ton">{{ m.etat.texte }}</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="fiab__total">
                <td class="is-left is-strong">{{ parType.total.libelle }}</td>
                <td class="cm-numeric is-strong">{{ parType.total.comptes }}</td>
                <td class="cm-numeric is-strong">{{ parType.total.tenus }}</td>
                <td class="is-left" colspan="2"></td>
              </tr>
              <tr class="fiab__moyenne">
                <td class="is-left">⌀ Par marché<template v-if="moyenne.marches"> ({{ moyenne.marches }} avec des avis)</template></td>
                <td class="cm-numeric">{{ moyenne.comptes }}</td>
                <td class="cm-numeric">{{ moyenne.tenus }}<template v-if="moyenne.marches"> tenus · {{ moyenne.taux }}</template></td>
                <td class="is-left" colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="cm-text-muted fiab__petit">Chaque marché pèse autant dans la moyenne. Les pourcentages ne s’additionnent jamais : le total est celui de tous les avis réunis.</p>
      </section>

      <!-- 2. Par championnat : Σ et ⌀, jamais une somme de pourcentages. -->
      <section class="fiab__section">
        <h4 class="cm-group-title">Par championnat</h4>
        <div class="cm-toolbar">
          <AppSelect v-model="marche" label="Marché" :options="optionsMarches" class="fiab__marche" />
        </div>
        <div class="cm-table-wrap fiab__wrap">
          <table class="cm-table fiab__table" data-tableau="fiabilite-par-championnat">
            <thead>
              <tr>
                <th class="is-left">Championnat</th>
                <th class="is-left">Marché</th>
                <th title="Avis comptés">Avis comptés</th>
                <th title="Avis tenus sur les avis comptés">Avis tenus</th>
                <th class="is-left">État</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lignesMontrees" :key="l.cle" :class="{ 'is-coupe': l.etat.coupe }">
                <td class="is-left"><LeagueBadge :league="l.league" /></td>
                <td class="is-left">{{ l.marche }}</td>
                <td class="cm-numeric">{{ l.comptes }}</td>
                <td class="cm-numeric">{{ l.tenus }}</td>
                <td class="is-left"><span class="cm-chip fiab__puce" :class="l.etat.ton">{{ l.etat.texte }}</span></td>
              </tr>
              <tr v-if="!ligues.lignes.length">
                <td class="is-left fiab__vide-ligne" colspan="5" data-vide>Aucun championnat : aucun avis réglé pour l’instant{{ marche === 'tous' ? '' : ' sur ce marché' }}.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="fiab__total">
                <td class="is-left is-strong" colspan="2">Σ Total ({{ ligues.lignes.length }} {{ ligues.lignes.length > 1 ? 'lignes' : 'ligne' }})</td>
                <td class="cm-numeric is-strong">{{ ligues.total.comptes }}</td>
                <td class="cm-numeric is-strong">{{ ligues.total.tenus }}</td>
                <td class="is-left"></td>
              </tr>
              <tr class="fiab__moyenne">
                <td class="is-left" colspan="2">⌀ Par ligne</td>
                <td class="cm-numeric">{{ ligues.moyenne.comptes }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.tenus }} tenus · {{ ligues.moyenne.taux }}</td>
                <td class="is-left"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button v-if="boutonAutres" type="button" class="cm-link fiab__autres" data-autres @click="deplie = !deplie">{{ boutonAutres }}</button>
      </section>

      <!-- 3. Le carnet complet, et d'où viennent ces chiffres. -->
      <footer class="fiab__pied">
        <RouterLink :to="LIEN_DU_CARNET.to" class="cm-link fiab__lien" data-lien="carnet"><AppIcon name="arrowRight" :size="13" />{{ LIEN_DU_CARNET.texte }}</RouterLink>
        <ProvenanceChip :source="PROVENANCE_DU_CARNET.source" :releve-le="carnet?.calculeLe ?? null" :action="PROVENANCE_DU_CARNET.action" :fichier="PROVENANCE_DU_CARNET.fichier" :vieux-apres-heures="null" variante="ligne" />
      </footer>
    </div>
  </AppCard>
</template>

<style scoped>
.fiab__corps {
  container: fiab / inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: opacity var(--cm-transition);
}

.fiab__corps.is-busy {
  opacity: 0.7;
}

.fiab__etat {
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.fiab__note {
  margin: 0;
}

.fiab__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fiab__marche {
  min-width: 220px;
}

.fiab__wrap {
  overflow-x: auto;
}

.fiab__table th,
.fiab__table td {
  font-size: 12.5px;
}

.fiab__vide td {
  color: var(--cm-text-muted);
}

.fiab__vide-ligne {
  color: var(--cm-text-muted);
}

.fiab__puce {
  white-space: nowrap;
}

/* Un marché retiré de la liste de l'IA : sa ligne s'efface un peu, l'étiquette ambre le dit. */
.is-coupe td {
  color: var(--cm-text-secondary);
}

.fiab__total td {
  border-top: 1px solid var(--cm-border);
}

.fiab__moyenne td {
  color: var(--cm-text-secondary);
}

.fiab__petit {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.fiab__autres {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.fiab__pied {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.fiab__lien {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}
</style>
