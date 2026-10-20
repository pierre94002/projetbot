<script setup>
import { computed, ref, onMounted } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import {
  nombreDit,
  pluriel,
  tenusDits,
  tableauDesTypes,
  tableauDesChampionnats,
  optionsDesTypes,
  lignesDeConfiance,
  lignesDesFiches,
  lignesDesNuances,
  ecartesDits,
  etatDuCarnet,
  coupesDites,
  regleDeCoupure,
  TYPES_PAR_DEFAUT,
  TYPE_ARGUMENT_PAR_DEFAUT
} from '@/utils/carnetIA.js';

/**
 * LE CARNET DE L'IA (étape 21 du plan, 14/10/2026), bloc d'Historique moteur : chaque avis d'avant-match de
 * l'IA réglé au coup de sifflet final — a-t-il tenu ? la cote a-t-elle bougé dans son sens ? l'IA fait-elle
 * mieux que le moteur seul ? —, par marché, par championnat, par confiance et par forme de fiche, avec le
 * nombre de cas ; et les marchés où elle n'apporte rien, qu'elle ne commente plus.
 *
 * Ici plutôt que dans l'onglet Analyse IA d'un match : c'est un bilan de TOUTES les analyses, pas d'un match ;
 * l'onglet d'un match l'aurait recopié sur chaque page. Il voisine avec la calibration du moteur (étape 20),
 * l'autre bilan « annoncé face au réalisé ». L'étape 45 (« l'IA à l'écran ») pourra y faire un lien.
 *
 * Le composant LIT GET /api/match-ai/scorecard (une lecture à l'ouverture, « Relire ») et ne calcule rien : le
 * carnet est refait chaque nuit par l'actualisation ; les mots viennent de utils/carnetIA.js.
 */

const favoris = useFavoritesStore();

const etat = ref({ loading: false, error: null, data: null });
const marche = ref('tous');
let derniereDemande = 0;

async function charger() {
  const numero = ++derniereDemande;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchAiAnalysisApi.scorecard();
    if (numero !== derniereDemande) return;
    etat.value = { loading: false, error: null, data };
  } catch (error) {
    // Une lecture ratée garde le dernier carnet à l'écran, l'erreur au-dessus.
    if (numero === derniereDemande) etat.value = { loading: false, error: error.message, data: etat.value.data };
  }
}

onMounted(() => charger());

const data = computed(() => etat.value.data);
const carnet = computed(() => data.value?.carnet ?? null);
const seuil = computed(() => data.value?.seuil ?? 200);
const types = computed(() => (data.value?.typesDeMarche?.length ? data.value.typesDeMarche : TYPES_PAR_DEFAUT));
const etatCarnet = computed(() => etatDuCarnet(data.value));
const parType = computed(() => tableauDesTypes(carnet.value, { types: types.value, minimum: seuil.value }));
const optionsMarches = computed(() => optionsDesTypes(types.value));
const ligues = computed(() => tableauDesChampionnats(carnet.value, { marche: marche.value, types: types.value, ordonner: (l) => favoris.favoritesFirst(l, { league: (x) => x.league }) }));
const confiance = computed(() => lignesDeConfiance(carnet.value));
const fiches = computed(() => lignesDesFiches(carnet.value));
const nuancesDites = computed(() => lignesDesNuances(carnet.value, { types: types.value }));
const ecartes = computed(() => ecartesDits(carnet.value));
const total = computed(() => carnet.value?.total ?? null);
const nuances = computed(() => total.value?.avis?.nuance ?? 0);
const contredits = computed(() => total.value?.avis?.contredit ?? 0);
const clotureTotale = computed(() => parType.value.total.cloture);
// Retouche du 14/10 : la coupure désactivée tant que Pierre n'a pas décidé (l'état du code, dit par la route).
const coupureActive = computed(() => data.value?.coupureActive ?? carnet.value?.coupureActive ?? false);
const coupes = computed(() => coupesDites(carnet.value, { coupureActive: coupureActive.value }));
const seraientRetires = computed(() => carnet.value?.seraientRetires?.length ?? 0);
const regle = computed(() => regleDeCoupure(seuil.value));
const typeArgument = computed(() => data.value?.typeArgument ?? carnet.value?.typeArgument ?? { phrase: TYPE_ARGUMENT_PAR_DEFAUT, pourquoi: '' });
const provenance = computed(() => carnet.value?.provenance ?? data.value?.provenance ?? null);
</script>

<template>
  <AppCard
    class="carnet-ia"
    icon="sparkles"
    eyebrow="Carnet de l’IA"
    title="Carnet de l’IA"
    subtitle="Chaque avis d’avant-match de l’IA, réglé au coup de sifflet final : a-t-il tenu, la cote lui a-t-elle donné raison, fait-elle mieux que le moteur seul ? Par marché et par championnat, refait chaque nuit."
  >
    <template #actions>
      <HelpTip terme="fourchette-du-hasard" />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger()">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Relire
      </AppButton>
    </template>

    <div class="carnet-ia__corps" :class="{ 'is-busy': etat.loading && carnet }" :aria-busy="etat.loading">
      <LoadingSpinner v-if="etat.loading && !data" label="Lecture du carnet de l’IA…" />

      <div v-if="etat.error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">{{ carnet ? 'Lecture impossible — dernier carnet affiché' : 'Carnet de l’IA indisponible' }}</p>
          <p class="cm-note__text">{{ etat.error }}</p>
        </div>
      </div>

      <!-- 0. L'état du carnet et la règle de la coupure. -->
      <div class="cm-toolbar carnet-ia__etat">
        <span class="cm-chip" :class="etatCarnet.ton"><AppIcon name="clock" :size="11" />{{ etatCarnet.titre }}</span>
        <p class="carnet-ia__petit">{{ etatCarnet.phrase }}</p>
      </div>

      <!-- 1. Les chiffres clés. -->
      <div class="cm-kpis carnet-ia__kpis">
        <div class="cm-kpi is-section" title="Avis « confirme » ou « contredit » sur un pronostic réglé (les avis « nuance » ne sont jamais comptés)">
          <span class="cm-kpi__label">Avis comptés</span>
          <span class="cm-kpi__value">{{ nombreDit(total?.bilan?.aiVerdicts ?? 0) }}</span>
          <span class="cm-kpi__detail">{{ pluriel(total?.matchsJuges ?? 0, 'match', 'matchs') }} · {{ pluriel(contredits, 'contredit', 'contredits') }}</span>
        </div>
        <div class="cm-kpi" title="Confirmer un pronostic qui s’est réalisé, ou contredire un pronostic qui ne s’est pas réalisé">
          <span class="cm-kpi__label">Avis tenus</span>
          <span class="cm-kpi__value">{{ tenusDits(total?.bilan?.aiRight, total?.bilan?.aiVerdicts) }}</span>
          <span class="cm-kpi__detail">moteur seul sur les mêmes cas : {{ tenusDits(total?.moteurJusteSurLesAvis, total?.bilan?.aiVerdicts) }}</span>
        </div>
        <div class="cm-kpi" title="Avis « nuance » : ni pour ni contre, jamais comptés">
          <span class="cm-kpi__label">Avis nuancés</span>
          <span class="cm-kpi__value">{{ nombreDit(nuances) }}</span>
          <span class="cm-kpi__detail">jamais comptés</span>
        </div>
        <div class="cm-kpi" :title="clotureTotale.detail">
          <span class="cm-kpi__label">La cote dans son sens</span>
          <span class="cm-kpi__value">{{ clotureTotale.moyenne }}</span>
          <span class="cm-kpi__detail">{{ clotureTotale.texte }}</span>
        </div>
        <div class="cm-kpi" :title="regle">
          <span class="cm-kpi__label">Marchés retirés</span>
          <span class="cm-kpi__value">{{ nombreDit(carnet?.coupes?.length ?? 0) }}</span>
          <span class="cm-kpi__detail">{{ coupureActive ? `sur ${nombreDit(types.length)} types de marché` : `règle en attente de votre décision : ${pluriel(seraientRetires, 'marché', 'marchés')} à retirer si elle était en service` }}</span>
        </div>
      </div>

      <p class="cm-note carnet-ia__note" :class="carnet?.coupes?.length ? 'is-warning' : 'is-info'">
        <span class="cm-note__text">{{ coupes }} {{ regle }}</span>
      </p>

      <!-- 2. Par marché : toujours les onze types. -->
      <section class="carnet-ia__section">
        <h4 class="cm-group-title">Par marché</h4>
        <div class="cm-table-wrap carnet-ia__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th class="is-left" title="Avis donnés sur ce marché : confirme · nuance · contredit">Avis</th>
                <th title="Matchs où au moins un avis a été compté">Matchs</th>
                <th title="Avis tenus sur les avis comptés">Tenus</th>
                <th title="Pronostics du moteur réalisés, sur les MÊMES cas">Moteur seul</th>
                <th class="is-left" :title="`Le juge de l’étape 16 : au moins ${nombreDit(seuil)} matchs pour un verdict`">Face au moteur seul</th>
                <th class="is-left" title="Le marché a-t-il bougé dans le sens de l’IA entre son analyse et la clôture ?">Clôture</th>
                <th title="Valeur de clôture moyenne en suivant l’IA">Moyenne</th>
                <th class="is-left">État</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in parType.lignes" :key="m.cle" :class="{ 'carnet-ia__vide': m.vide, 'is-coupe': m.etat.coupe, 'is-serait-retire': m.etat.seraitRetire }">
                <td class="is-left is-strong">{{ m.libelle }}</td>
                <td class="is-left">{{ m.avis }}</td>
                <td class="cm-numeric">{{ m.matchs }}</td>
                <td class="cm-numeric">{{ m.tenus }}</td>
                <td class="cm-numeric">{{ m.moteur }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="m.juge.ton" :title="m.juge.detail">{{ m.juge.texte }}</span></td>
                <td class="is-left" :title="m.cloture.detail">{{ m.cloture.texte }}</td>
                <td class="cm-numeric">{{ m.cloture.moyenne }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="m.etat.ton">{{ m.etat.texte }}</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="carnet-ia__total">
                <td class="is-left is-strong">{{ parType.total.libelle }}</td>
                <td class="is-left">{{ parType.total.avis }}</td>
                <td class="cm-numeric is-strong" title="Matchs différents, comptés une fois">{{ parType.total.matchs }}</td>
                <td class="cm-numeric is-strong">{{ parType.total.tenus }}</td>
                <td class="cm-numeric">{{ parType.total.moteur }}</td>
                <td class="is-left"></td>
                <td class="is-left" :title="parType.total.cloture.detail">{{ parType.total.cloture.texte }}</td>
                <td class="cm-numeric">{{ parType.total.cloture.moyenne }}</td>
                <td class="is-left"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="cm-text-muted carnet-ia__petit">
          Clôture <HelpTip terme="valeur-de-cloture" /> : seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » ont des cotes de clôture gratuites.
        </p>
      </section>

      <!-- 3. Par championnat : Σ et ⌀, jamais une somme de pourcentages. -->
      <section class="carnet-ia__section">
        <h4 class="cm-group-title">Par championnat</h4>
        <div class="cm-toolbar">
          <AppSelect v-model="marche" label="Marché" :options="optionsMarches" class="carnet-ia__marche" />
        </div>
        <div class="cm-table-wrap carnet-ia__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Championnat</th>
                <th class="is-left">Marché</th>
                <th title="Avis comptés">Avis comptés</th>
                <th title="Avis tenus sur les avis comptés">Tenus</th>
                <th class="is-left" title="Le marché a-t-il bougé dans le sens de l’IA ?">Clôture</th>
                <th class="is-left">État</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in ligues.lignes" :key="l.cle" :class="{ 'is-coupe': l.etat.coupe }">
                <td class="is-left"><LeagueBadge :league="l.league" /></td>
                <td class="is-left">{{ l.marche }}</td>
                <td class="cm-numeric">{{ l.comptes }}</td>
                <td class="cm-numeric">{{ l.tenus }}</td>
                <td class="is-left" :title="l.cloture.detail">{{ l.cloture.texte }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="l.etat.ton">{{ l.etat.texte }}</span></td>
              </tr>
              <tr v-if="!ligues.lignes.length">
                <td class="is-left" colspan="6">Aucun championnat : aucun avis réglé pour l’instant.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="carnet-ia__total">
                <td class="is-left is-strong" colspan="2">Σ Total</td>
                <td class="cm-numeric is-strong">{{ ligues.total.comptes }}</td>
                <td class="cm-numeric is-strong">{{ ligues.total.tenus }}</td>
                <td class="is-left" colspan="2"></td>
              </tr>
              <tr class="carnet-ia__moyenne">
                <td class="is-left" colspan="2">⌀ Par ligne</td>
                <td class="cm-numeric">{{ ligues.moyenne.comptes }}</td>
                <td class="cm-numeric">{{ ligues.moyenne.tenus }} tenus · {{ ligues.moyenne.taux }}</td>
                <td class="is-left" colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- 4. Par confiance annoncée et par forme de fiche ; le type d'argument. -->
      <div class="cm-grid-2 carnet-ia__deux">
        <section class="carnet-ia__section">
          <h4 class="cm-group-title">Par confiance annoncée</h4>
          <div class="cm-table-wrap carnet-ia__wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th class="is-left">Confiance</th>
                  <th>Avis comptés</th>
                  <th>Tenus</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in confiance" :key="c.cle">
                  <td class="is-left is-strong">{{ c.niveau }}</td>
                  <td class="cm-numeric">{{ c.comptes }}</td>
                  <td class="cm-numeric">{{ c.tenus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="carnet-ia__section">
          <h4 class="cm-group-title">Par forme de fiche</h4>
          <div class="cm-table-wrap carnet-ia__wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th class="is-left">Fiche lue par l’IA</th>
                  <th>Avis comptés</th>
                  <th>Tenus</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in fiches" :key="f.cle">
                  <td class="is-left is-strong">{{ f.libelle }}</td>
                  <td class="cm-numeric">{{ f.comptes }}</td>
                  <td class="cm-numeric">{{ f.tenus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- 4 bis. Ce que disent ses « nuance » : pour information, jamais comptées. -->
      <section class="carnet-ia__section">
        <h4 class="cm-group-title">Ce que disent ses avis « nuance »</h4>
        <p class="cm-text-muted carnet-ia__petit">
          Jamais comptés dans les avis tenus ni pour retirer un marché : marché par marché, ce que le moteur annonçait pour son pronostic et ce qui est arrivé, selon que l’IA confirmait ou nuançait, avec le juge (au moins 200 matchs pour conclure).
        </p>
        <div class="cm-table-wrap carnet-ia__wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th title="Avis « confirme » : avis, probabilité moyenne annoncée par le moteur → part des pronostics réalisés">Quand elle confirme</th>
                <th class="is-left">Juge</th>
                <th title="Avis « nuance » : avis, probabilité moyenne annoncée par le moteur → part des pronostics réalisés">Quand elle nuance</th>
                <th class="is-left">Juge</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in nuancesDites.lignes" :key="n.cle">
                <td class="is-left is-strong">{{ n.libelle }}</td>
                <td class="cm-numeric">{{ n.confirmes.texte }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="n.confirmes.juge.ton" :title="n.confirmes.juge.detail">{{ n.confirmes.juge.texte }}</span></td>
                <td class="cm-numeric">{{ n.nuances.texte }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="n.nuances.juge.ton" :title="n.nuances.juge.detail">{{ n.nuances.juge.texte }}</span></td>
              </tr>
              <tr v-if="!nuancesDites.lignes.length">
                <td class="is-left" colspan="5">Aucun avis réglé pour l’instant.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="carnet-ia__total">
                <td class="is-left is-strong">Σ Tous les marchés</td>
                <td class="cm-numeric">{{ nuancesDites.total.confirmes.texte }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="nuancesDites.total.confirmes.juge.ton" :title="nuancesDites.total.confirmes.juge.detail">{{ nuancesDites.total.confirmes.juge.texte }}</span></td>
                <td class="cm-numeric">{{ nuancesDites.total.nuances.texte }}</td>
                <td class="is-left"><span class="cm-chip carnet-ia__juge" :class="nuancesDites.total.nuances.juge.ton" :title="nuancesDites.total.nuances.juge.detail">{{ nuancesDites.total.nuances.juge.texte }}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="carnet-ia__section">
        <h4 class="cm-group-title">Par type d’argument</h4>
        <p class="cm-note is-info carnet-ia__note">
          <span class="cm-note__text">{{ typeArgument.phrase }} {{ typeArgument.pourquoi }}</span>
        </p>
      </section>

      <!-- 5. Ce qui n'entre pas dans le carnet. -->
      <section class="carnet-ia__section">
        <h4 class="cm-group-title">Pronostics commentés qui n’entrent pas dans le carnet</h4>
        <ul v-if="ecartes.length" class="carnet-ia__liste">
          <li v-for="e in ecartes" :key="e.cle">{{ e.texte }}</li>
        </ul>
        <p v-else class="cm-text-muted carnet-ia__petit">Aucun pronostic commenté écarté.</p>
      </section>

      <!-- 6. D'où viennent ces chiffres. -->
      <footer class="carnet-ia__provenance">
        <ProvenanceChip
          source="Analyses de l’IA · magasin FotMob · cotes gratuites archivées"
          :releve-le="carnet?.calculeLe ?? null"
          action="calculé"
          fichier="data/runtime/carnet-ia.json (refait chaque nuit) ; data/runtime/match-ai-analyses.json ; magasin SQLite : tables matches, team_stats, engine_picks, odds_quotes"
          :vieux-apres-heures="null"
          variante="ligne"
        />
        <ul v-if="provenance" class="carnet-ia__liste cm-text-muted">
          <li>{{ provenance.avis }}</li>
          <li>{{ provenance.resultats }}</li>
          <li>{{ provenance.cloture }}</li>
          <li>{{ provenance.juge }}</li>
        </ul>
      </footer>
    </div>
  </AppCard>
</template>

<style scoped>
.carnet-ia__corps {
  container: carnetia / inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: opacity var(--cm-transition);
}
.carnet-ia__corps.is-busy {
  opacity: 0.7;
}
.carnet-ia__etat {
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.carnet-ia__note {
  margin: 0;
}
.carnet-ia__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.carnet-ia__marche {
  min-width: 220px;
}
.carnet-ia__wrap {
  overflow-x: auto;
}
.carnet-ia__vide td {
  color: var(--cm-text-muted);
}
.carnet-ia__juge {
  white-space: nowrap;
}
/* Un marché retiré de la liste de l'IA : sa ligne s'efface un peu, l'étiquette ambre le dit. */
.is-coupe td {
  color: var(--cm-text-secondary);
}
.carnet-ia__total td {
  border-top: 1px solid var(--cm-border);
}
.carnet-ia__moyenne td {
  color: var(--cm-text-secondary);
}
.carnet-ia__deux {
  gap: 16px;
}
.carnet-ia__petit {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.carnet-ia__liste {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.6;
}
.carnet-ia__provenance {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
