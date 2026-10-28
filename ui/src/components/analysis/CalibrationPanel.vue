<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import CalibrationChart from '@/components/analysis/CalibrationChart.vue';
import { predictionsApi } from '@/services/predictionsApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import {
  moisDit,
  jourDit,
  nombreDit,
  pluriel,
  pourcentDit,
  ecartDit,
  jugeDit,
  etatDuBilan,
  raisonDeLAbsence,
  optionsDesMois,
  optionsDesMarches,
  casDuMarche,
  pointsDeLaCourbe,
  lignesDesTranches,
  tableauDesMarches,
  tableauDesChampionnats,
  clotureDesPronosticsDite,
  clotureDesParisDite,
  ecarteesDites,
  versionsDuMoteurDites,
  lignesDesMoisFiges,
  SEULS_TROIS_MARCHES
} from '@/utils/calibration.js';

/**
 * LA CALIBRATION DU MOIS (étape 20 du plan, 13/10/2026), bloc d'Historique moteur : ce que le moteur avait
 * annoncé (ses pronostics GELÉS, jamais le journal de Mes paris) face à ce qui est arrivé — tranche par
 * tranche (« annoncé entre 60 et 70 % : arrivé combien de fois ? »), par marché et par championnat —, la
 * valeur de clôture de ses pronostics et celle de vos paris, et la liste des mois précédents, chacun figé
 * le 1er du mois suivant et jamais recalculé.
 *
 * Le composant LIT GET /api/predictions/calibration (une lecture à l'ouverture, une à chaque mois choisi ;
 * le mois en cours est PRÉPARÉ chaque nuit par l'actualisation — étape 24 : la route ne calcule plus rien, un
 * mois pas encore préparé s'affiche « pas encore mesuré » avec sa raison) et ne calcule rien : les mots
 * viennent de utils/calibration.js. La courbe est celle du banc d'essai
 * (CalibrationChart, étape 19), jamais recopiée. Le tableau de bord du moteur (étape 24) fera un lien ici :
 * les courbes annoncé / réalisé vivent à cette seule place.
 */

const favoris = useFavoritesStore();

/** Les deux lectures d'un pronostic gelé : sa première valeur (la principale) ou la dernière d'avant le coup d'envoi. */
const LECTURES = Object.freeze([
  { value: 'premiere', label: 'Première valeur', titre: 'Le pronostic d’origine : la première valeur gelée, jamais réécrite.' },
  { value: 'derniere', label: 'Dernière avant le coup d’envoi', titre: 'La dernière révision gelée avant le coup d’envoi (compositions connues, cotes du jour).' }
]);

const etat = ref({ loading: false, error: null, data: null });
const moisChoisi = ref(null);
const lecture = ref('premiere');
const marche = ref('tous');
// Une réponse arrivée après une demande plus récente ne doit pas l'écraser.
let derniereDemande = 0;

async function charger(mois = null) {
  const numero = ++derniereDemande;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await predictionsApi.calibration(mois);
    if (numero !== derniereDemande) return;
    etat.value = { loading: false, error: null, data };
    moisChoisi.value = data.mois;
  } catch (error) {
    // Une lecture ratée garde le dernier bilan à l'écran, l'erreur au-dessus.
    if (numero === derniereDemande) etat.value = { loading: false, error: error.message, data: etat.value.data };
  }
}

onMounted(() => charger());
watch(moisChoisi, (mois, avant) => {
  if (avant && mois && mois !== etat.value.data?.mois) charger(mois);
});

// ------------------------------------------------------------ lecture
const data = computed(() => etat.value.data);
const bilan = computed(() => data.value?.bilan ?? null);
const vue = computed(() => bilan.value?.vues?.[lecture.value] ?? null);
const etatDuMois = computed(() => etatDuBilan(bilan.value, { prochainGel: data.value?.prochainGel, version: data.value?.version }));
// Étape 24 : un mois sans bilan dit POURQUOI (la route ne calcule plus rien : préparé la nuit, ou pas encore figé).
const raisonSansBilan = computed(() => (bilan.value ? null : raisonDeLAbsence(data.value?.preparation)));
const optionsMois = computed(() => optionsDesMois(data.value?.disponibles ?? []));
const optionsMarches = computed(() => optionsDesMarches(vue.value));
// Un marché absent du mois choisi (ou de l'autre lecture) : retour à « tous les marchés ».
watch(vue, (v) => {
  if (marche.value !== 'tous' && !casDuMarche(v, marche.value)) marche.value = 'tous';
});
const cas = computed(() => casDuMarche(vue.value, marche.value));
const points = computed(() => pointsDeLaCourbe(cas.value));
const tranches = computed(() => lignesDesTranches(cas.value));
const marches = computed(() => tableauDesMarches(vue.value));
const ligues = computed(() => tableauDesChampionnats(vue.value, { ordonner: (l) => favoris.favoritesFirst(l, { league: (x) => x.league }) }));
const cloture = computed(() => clotureDesPronosticsDite(vue.value?.cloture));
const paris = computed(() => clotureDesParisDite(bilan.value?.paris?.cloture));
const ecartees = computed(() => ecarteesDites(vue.value, bilan.value?.pronostics));
const versions = computed(() => versionsDuMoteurDites(bilan.value?.pronostics));
// Tous les mois figés, celui qu'on regarde compris (marqué) : l'évolution se lit d'un coup d'œil.
const moisPrecedents = computed(() => lignesDesMoisFiges(data.value?.figes ?? []));
const aucunMoisFige = computed(() => {
  const g = data.value?.prochainGel;
  return g?.le ? `Aucun mois figé pour l’instant : le premier le sera le ${jourDit(g.le)} à partir de ${g.heure ?? 6} h (${moisDit(g.mois)}).` : 'Aucun mois figé pour l’instant : le premier le sera le 1er du mois suivant.';
});
const global = computed(() => vue.value?.global ?? null);
const jugeGlobal = computed(() => jugeDit(global.value?.juge));
const libelleLecture = computed(() => LECTURES.find((l) => l.value === lecture.value)?.label ?? '');
const titreCourbe = computed(() => `${optionsMarches.value.find((o) => o.value === marche.value)?.label ?? 'Tous les marchés'} · ${moisDit(bilan.value?.mois)} · ${libelleLecture.value.toLowerCase()}`);
const minimum = computed(() => nombreDit(data.value?.juge?.minBlocs ?? 200));
const provenance = computed(() => data.value?.provenance ?? null);
</script>

<template>
  <AppCard class="calib" icon="target" eyebrow="Calibration" title="Calibration du mois" subtitle="Ce que le moteur annonçait, face à ce qui est arrivé — tranche par tranche, par marché et par championnat. Chaque mois écoulé est figé le 1er du mois suivant et gardé, pour voir l’évolution.">
    <template #actions>
      <HelpTip terme="calibration" />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger(moisChoisi)">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Relire
      </AppButton>
    </template>

    <div class="calib__corps" :class="{ 'is-busy': etat.loading && bilan }" :aria-busy="etat.loading">
      <!-- 0. Le mois, la lecture, l'état. -->
      <div class="cm-toolbar calib__choix">
        <AppSelect v-if="optionsMois.length" v-model="moisChoisi" label="Mois" :options="optionsMois" class="calib__mois" />
        <div class="calib__lecture" role="radiogroup" aria-label="Quelle valeur de chaque pronostic">
          <button
            v-for="l in LECTURES"
            :key="l.value"
            type="button"
            role="radio"
            class="calib__lecture-btn"
            :class="{ 'is-active': lecture === l.value }"
            :aria-checked="lecture === l.value"
            :title="l.titre"
            @click="lecture = l.value"
          >
            {{ l.label }}
          </button>
        </div>
        <span class="cm-chip calib__etat" :class="etatDuMois.ton"><AppIcon :name="bilan?.fige ? 'lock' : 'clock'" :size="11" />{{ etatDuMois.titre }}</span>
      </div>

      <LoadingSpinner v-if="etat.loading && !bilan" label="Lecture de la calibration du mois…" />

      <div v-if="etat.error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">{{ bilan ? 'Lecture impossible — dernier bilan affiché' : 'Calibration indisponible' }}</p>
          <p class="cm-note__text">{{ etat.error }}</p>
        </div>
      </div>

      <p class="cm-note calib__note" :class="etatDuMois.ton">
        <span class="cm-note__text">{{ etatDuMois.phrase }}</span>
      </p>
      <p v-if="raisonSansBilan" class="cm-note calib__note is-info" data-raison-sans-bilan>
        <span class="cm-note__text">{{ raisonSansBilan }}</span>
      </p>

      <!-- 1. Les chiffres clés de la lecture choisie (tous marchés). -->
      <div class="cm-kpis calib__kpis">
        <div class="cm-kpi is-section" title="Pronostics gelés dont le match est joué et réglé (score de la 90e minute, statistiques relevées)">
          <span class="cm-kpi__label">Pronostics réglés</span>
          <span class="cm-kpi__value">{{ nombreDit(global?.pronostics) }}</span>
          <span class="cm-kpi__detail">sur {{ pluriel(bilan?.pronostics?.geles ?? 0, 'gelé', 'gelés') }} · {{ pluriel(global?.matchs ?? 0, 'match', 'matchs') }}</span>
        </div>
        <div class="cm-kpi" title="Moyenne des probabilités que le moteur donnait à l’issue choisie">
          <span class="cm-kpi__label">Annoncé</span>
          <span class="cm-kpi__value">{{ pourcentDit(global?.annonce) }}</span>
          <span class="cm-kpi__detail">probabilité moyenne de l’issue choisie</span>
        </div>
        <div class="cm-kpi" title="Part des pronostics dont l’issue est arrivée">
          <span class="cm-kpi__label">Réalisé</span>
          <span class="cm-kpi__value">{{ pourcentDit(global?.realise) }}</span>
          <span class="cm-kpi__detail">{{ pluriel(global?.justes ?? 0, 'pronostic juste', 'pronostics justes') }}</span>
        </div>
        <div class="cm-kpi" :title="jugeGlobal.detail">
          <span class="cm-kpi__label">Écart</span>
          <span class="cm-kpi__value">{{ ecartDit(global?.ecart) }}</span>
          <span class="cm-chip calib__juge" :class="jugeGlobal.ton">{{ jugeGlobal.texte }}</span>
        </div>
        <div class="cm-kpi" title="De combien la cote juste du marché de l’issue choisie a baissé entre le gel du pronostic et la clôture">
          <span class="cm-kpi__label">Clôture des pronostics</span>
          <span class="cm-kpi__value">{{ cloture?.valeur ?? 'pas mesurée' }}</span>
          <span class="cm-kpi__detail">{{ cloture?.sur ?? 'aucun pronostic mesuré' }}</span>
        </div>
        <div class="cm-kpi" title="Vos paris simples du mois : cote prise × probabilité de clôture − 1">
          <span class="cm-kpi__label">Clôture de vos paris</span>
          <span class="cm-kpi__value">{{ paris?.valeur ?? 'pas mesurée' }}</span>
          <span class="cm-kpi__detail">{{ paris?.sur ?? 'aucun pari simple ce mois-là' }}</span>
        </div>
      </div>

      <!-- 2. La courbe annoncé / réalisé, marché par marché, et ses dix tranches. -->
      <section class="calib__section">
        <h4 class="cm-group-title calib__titre">
          Annoncé et réalisé, tranche par tranche
          <HelpTip terme="fourchette-du-hasard" />
        </h4>
        <div class="cm-toolbar">
          <AppSelect v-model="marche" label="Marché" :options="optionsMarches" class="calib__marche" />
        </div>
        <div class="calib__courbe">
          <CalibrationChart :points="points" :titre="titreCourbe" />
          <div class="cm-table-wrap calib__wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th class="is-left" title="Probabilité annoncée par le moteur pour l’issue choisie, [de ; a[">Annoncé entre</th>
                  <th title="Pronostics réglés dans la tranche">Pronostics</th>
                  <th title="Matchs différents dans la tranche (deux pronostics d’un même match comptent pour un match)">Matchs</th>
                  <th title="Probabilité moyenne annoncée dans la tranche">Annoncé</th>
                  <th title="Part des pronostics de la tranche dont l’issue est arrivée">Réalisé</th>
                  <th title="Réalisé − annoncé, en points">Écart</th>
                  <th class="is-left" :title="`Le juge de l’étape 16 : au moins ${minimum} matchs pour un verdict`">Juge</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tranches" :key="t.cle" :class="{ 'calib__vide': t.vide }">
                  <td class="is-left is-strong">{{ t.tranche }}</td>
                  <td class="cm-numeric">{{ t.pronostics }}</td>
                  <td class="cm-numeric">{{ t.matchs }}</td>
                  <td class="cm-numeric" :colspan="t.vide ? 3 : 1">{{ t.annonce }}</td>
                  <template v-if="!t.vide">
                    <td class="cm-numeric">{{ t.realise }}</td>
                    <td class="cm-numeric">{{ t.ecart }}</td>
                  </template>
                  <td class="is-left"><span class="cm-chip calib__juge" :class="t.juge.ton" :title="t.juge.detail">{{ t.juge.texte }}</span></td>
                </tr>
                <tr v-if="!tranches.length">
                  <td class="is-left" colspan="7">Aucun pronostic réglé pour l’instant.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 3. Par marché. -->
      <section class="calib__section">
        <h4 class="cm-group-title">Par marché</h4>
        <div class="cm-table-wrap calib__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th>Pronostics</th>
                <th>Matchs</th>
                <th>Annoncé</th>
                <th>Réalisé</th>
                <th title="Réalisé − annoncé, en points">Écart</th>
                <th title="Perte log binaire moyenne de l’affirmation (la note du banc d’essai) : plus petite, mieux c’est">Perte log</th>
                <th class="is-left">Juge</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in marches.lignes" :key="m.cle">
                <td class="is-left is-strong">{{ m.libelle }}</td>
                <td class="cm-numeric">{{ m.pronostics }}</td>
                <td class="cm-numeric">{{ m.matchs }}</td>
                <td class="cm-numeric">{{ m.annonce }}</td>
                <td class="cm-numeric">{{ m.realise }}</td>
                <td class="cm-numeric">{{ m.ecart }}</td>
                <td class="cm-numeric">{{ m.perteLog }}</td>
                <td class="is-left"><span class="cm-chip calib__juge" :class="m.juge.ton" :title="m.juge.detail">{{ m.juge.texte }}</span></td>
              </tr>
              <tr v-if="!marches.lignes.length">
                <td class="is-left" colspan="8">Aucun pronostic réglé pour l’instant.</td>
              </tr>
            </tbody>
            <tfoot v-if="marches.total">
              <tr class="calib__total">
                <td class="is-left is-strong">{{ marches.total.libelle }}</td>
                <td class="cm-numeric is-strong">{{ marches.total.pronostics }}</td>
                <td class="cm-numeric is-strong" title="Matchs différents, comptés une fois">{{ marches.total.matchs }}</td>
                <td class="cm-numeric">{{ marches.total.annonce }}</td>
                <td class="cm-numeric">{{ marches.total.realise }}</td>
                <td class="cm-numeric">{{ marches.total.ecart }}</td>
                <td class="cm-numeric">{{ marches.total.perteLog }}</td>
                <td class="is-left"><span class="cm-chip calib__juge" :class="marches.total.juge.ton" :title="marches.total.juge.detail">{{ marches.total.juge.texte }}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="calib__renvoi">Ces verdicts sont ceux du mois, sur l’issue choisie par le moteur. Le tri « malchance ou vrai défaut » (issue de référence et issue favorite de chaque marché, en comptant toute l’année) est plus bas dans cet onglet (« Écarts du mois », étape 26).</p>
      </section>

      <!-- 4. Par championnat : Σ et ⌀, jamais une somme de pourcentages. -->
      <section class="calib__section">
        <h4 class="cm-group-title">Par championnat</h4>
        <div class="cm-table-wrap calib__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Championnat</th>
                <th>Pronostics</th>
                <th>Matchs</th>
                <th title="Probabilité moyenne annoncée">% annoncé</th>
                <th title="Part des pronostics dont l’issue est arrivée">% réalisé</th>
                <th title="Réalisé − annoncé, en points">Écart</th>
                <th class="is-left">Juge</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in ligues.lignes" :key="l.cle">
                <td class="is-left"><LeagueBadge :league="l.league" /></td>
                <td class="cm-numeric">{{ l.pronostics }}</td>
                <td class="cm-numeric">{{ l.matchs }}</td>
                <td class="cm-numeric">{{ l.annonce }}</td>
                <td class="cm-numeric">{{ l.realise }}</td>
                <td class="cm-numeric">{{ l.ecart }}</td>
                <td class="is-left"><span class="cm-chip calib__juge" :class="l.juge.ton" :title="l.juge.detail">{{ l.juge.texte }}</span></td>
              </tr>
              <tr v-if="!ligues.lignes.length">
                <td class="is-left" colspan="7">Aucun championnat : aucun pronostic réglé pour l’instant.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="calib__total">
                <td class="is-left is-strong">Σ Total</td>
                <td class="cm-numeric is-strong">{{ ligues.total.pronostics }}</td>
                <td class="cm-numeric is-strong">{{ ligues.total.matchs }}</td>
                <td class="cm-numeric">{{ ligues.total.annonce }}</td>
                <td class="cm-numeric">{{ ligues.total.realise }}</td>
                <td class="cm-numeric">{{ ligues.total.ecart }}</td>
                <td class="is-left"><span class="cm-chip calib__juge" :class="ligues.total.juge.ton" :title="ligues.total.juge.detail">{{ ligues.total.juge.texte }}</span></td>
              </tr>
              <tr class="calib__moyenne">
                <td class="is-left" :title="`Moyenne sur ${pluriel(ligues.championnats, 'championnat', 'championnats')}`">⌀ Par championnat</td>
                <td class="cm-numeric">{{ ligues.moyenne.pronostics }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.matchs }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.annonce }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.realise }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.ecart }}</td>
                <td class="is-left"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- 5. La valeur de clôture : celle des pronostics, celle de vos paris. -->
      <section class="calib__section">
        <h4 class="cm-group-title calib__titre">
          Valeur de clôture du mois
          <HelpTip terme="valeur-de-cloture" />
        </h4>
        <div class="cm-grid-2 calib__clotures">
          <div class="cm-block calib__cloture">
            <p class="cm-eyebrow">Pronostics du moteur</p>
            <p class="calib__cloture-valeur">{{ cloture?.valeur ?? 'pas mesurée' }}</p>
            <p class="cm-text-secondary calib__petit">{{ cloture?.sur ?? 'aucun pronostic mesuré' }}</p>
            <span class="cm-chip calib__juge" :class="cloture?.juge?.ton ?? 'is-warning'">{{ cloture?.juge?.texte ?? 'trop peu de matchs' }}</span>
            <ul v-if="cloture?.parMarche?.length" class="calib__liste">
              <li v-for="m in cloture.parMarche" :key="m.cle">{{ m.libelle }} : {{ m.valeur }} sur {{ m.mesures }}</li>
            </ul>
            <p v-if="cloture?.sansCote" class="cm-text-muted calib__petit">{{ cloture.sansCote }}</p>
            <p v-if="cloture?.approx" class="cm-text-muted calib__petit">{{ cloture.approx }}</p>
            <ul v-if="cloture?.raisons?.length" class="calib__liste cm-text-muted">
              <li v-for="r in cloture.raisons" :key="r.cle">{{ r.texte }}</li>
            </ul>
          </div>
          <div class="cm-block calib__cloture">
            <p class="cm-eyebrow">Vos paris</p>
            <p class="calib__cloture-valeur">{{ paris?.valeur ?? 'pas mesurée' }}</p>
            <p class="cm-text-secondary calib__petit">{{ paris?.sur ?? 'aucun pari simple ce mois-là' }}</p>
            <span class="cm-chip calib__juge" :class="paris?.juge?.ton ?? 'is-warning'">{{ paris?.juge?.texte ?? 'trop peu de matchs' }}</span>
            <p v-if="paris?.combines" class="cm-text-muted calib__petit">{{ paris.combines }}</p>
            <p v-if="paris?.aVenir" class="cm-text-muted calib__petit">{{ paris.aVenir }}</p>
            <ul v-if="paris?.raisons?.length" class="calib__liste cm-text-muted">
              <li v-for="r in paris.raisons" :key="r.cle">{{ r.texte }}</li>
            </ul>
          </div>
        </div>
        <p class="cm-note is-info calib__note">
          <span class="cm-note__text">{{ SEULS_TROIS_MARCHES }}</span>
        </p>
      </section>

      <!-- 6. Ce qui n'entre pas dans le bilan, et les versions du moteur. -->
      <section class="calib__section">
        <h4 class="cm-group-title">Pronostics gelés qui n’entrent pas dans cette lecture</h4>
        <p class="calib__petit">{{ ecartees.phrase }}</p>
        <ul v-if="ecartees.lignes.length" class="calib__liste">
          <li v-for="e in ecartees.lignes" :key="e.cle">{{ e.texte }} : {{ e.n }}</li>
        </ul>
        <p v-else class="cm-text-muted calib__petit">Aucun pronostic écarté.</p>
        <p class="cm-text-muted calib__petit">Versions du moteur (première valeur des pronostics joués) : {{ versions }}.</p>
      </section>

      <!-- 7. Les mois précédents, figés : l'évolution. -->
      <section class="calib__section">
        <h4 class="cm-group-title">Mois précédents</h4>
        <div class="cm-table-wrap calib__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Mois</th>
                <th class="is-left">Figé le</th>
                <th>Pronostics</th>
                <th>Annoncé</th>
                <th>Réalisé</th>
                <th>Écart</th>
                <th class="is-left">Juge</th>
                <th title="Valeur de clôture moyenne des pronostics (nombre mesuré)">Clôture pronostics</th>
                <th title="Valeur de clôture moyenne de vos paris simples (nombre mesuré)">Clôture paris</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in moisPrecedents"
                :key="m.cle"
                class="calib__mois-ligne"
                :class="{ 'is-choisi': m.cle === bilan?.mois }"
                tabindex="0"
                :title="`Afficher ${m.mois}`"
                @click="moisChoisi = m.cle"
                @keydown.enter="moisChoisi = m.cle"
              >
                <td class="is-left is-strong">{{ m.mois }}</td>
                <td class="is-left">{{ m.figeLe }}</td>
                <td class="cm-numeric">{{ m.pronostics }}</td>
                <td class="cm-numeric">{{ m.annonce }}</td>
                <td class="cm-numeric">{{ m.realise }}</td>
                <td class="cm-numeric">{{ m.ecart }}</td>
                <td class="is-left"><span class="cm-chip calib__juge" :class="m.juge.ton">{{ m.juge.texte }}</span></td>
                <td class="cm-numeric">{{ m.cloturePronostics }}</td>
                <td class="cm-numeric">{{ m.clotureParis }}</td>
              </tr>
              <tr v-if="!moisPrecedents.length">
                <td class="is-left" colspan="9">{{ aucunMoisFige }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8. D'où viennent ces chiffres. -->
      <footer class="calib__provenance">
        <ProvenanceChip
          source="Pronostics gelés du moteur · magasin FotMob · cotes gratuites archivées"
          :releve-le="bilan?.fige ? bilan?.figeLe : bilan?.calculeLe"
          :action="bilan?.fige ? 'figé' : 'calculé'"
          fichier="Magasin SQLite : tables engine_picks, matches, team_stats, odds_quotes, calibration_monthly ; data/runtime/bets.json"
          :vieux-apres-heures="null"
          variante="ligne"
        />
        <ul v-if="provenance" class="calib__liste cm-text-muted">
          <li>{{ provenance.pronostics }}</li>
          <li>{{ provenance.resultats }}</li>
          <li>{{ provenance.cloture }}</li>
          <li>{{ provenance.paris }}</li>
        </ul>
      </footer>
    </div>
  </AppCard>
</template>

<style scoped>
.calib__corps {
  container: calib / inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: opacity var(--cm-transition);
}
.calib__corps.is-busy {
  opacity: 0.7;
}
.calib__choix {
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.calib__mois,
.calib__marche {
  min-width: 220px;
}
.calib__lecture {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}
.calib__lecture-btn {
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}
.calib__lecture-btn:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}
.calib__lecture-btn.is-active,
.calib__lecture-btn.is-active:hover {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}
.calib__etat {
  align-self: center;
}
.calib__note {
  margin: 0;
}
.calib__titre {
  display: flex;
  align-items: center;
  gap: 8px;
}
.calib__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.calib__courbe {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
.calib__wrap {
  overflow-x: auto;
}
.calib__vide td {
  color: var(--cm-text-muted);
}
.calib__juge {
  white-space: nowrap;
}
.calib__total td {
  border-top: 1px solid var(--cm-border);
}
.calib__moyenne td {
  color: var(--cm-text-secondary);
}
.calib__clotures {
  gap: 12px;
}
.calib__cloture {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.calib__cloture-valeur {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}
.calib__petit {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.calib__liste {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.6;
}
.calib__mois-ligne {
  cursor: pointer;
}
.calib__mois-ligne:hover td,
.calib__mois-ligne:focus-visible td {
  background: var(--cm-surface-hover);
}
/* Pas --cm-section-soft : calculé à la racine, il resterait émeraude dans Historique moteur (DESIGN.md, § 2). */
.calib__mois-ligne.is-choisi td {
  background: rgba(var(--cm-section-rgb) / 0.12);
}
.calib__provenance {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@container calib (min-width: 760px) {
  .calib__courbe {
    grid-template-columns: minmax(240px, 340px) 1fr;
  }
}

/* Étape 26 : la phrase qui renvoie au tri « malchance ou vrai défaut », juste sous ce bloc. */
.calib__renvoi {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}
</style>
