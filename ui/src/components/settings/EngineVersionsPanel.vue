<script setup>
/**
 * VERSIONS DU MOTEUR (étape 25 du plan, le socle, 07/10/2026), dans Réglages,
 * juste sous « Paramètres du moteur » :
 *   - la version en service : son numéro, sa date, ce qui l'a créée et ce
 *     qu'elle a changé ;
 *   - les versions précédentes (tableau complet, même vide ou en erreur, Σ au pied) ;
 *   - la version candidate en essai (« aucune » jusqu'à l'étape 27) : calculée
 *     à blanc chaque nuit, jamais montrée comme pronostic ;
 *   - le bouton « Revenir à la version précédente », avec une confirmation qui
 *     dit exactement ce qui revient ; désactivé, il dit pourquoi ;
 *   - (seconde moitié, 14/10/2026) l'essai de la candidate, ses DEUX verdicts (l'essai à
 *     blanc qui décide, le banc d'essai indicatif) et le bouton « Adopter la candidate »,
 *     actif seulement sur « retenu », avec une confirmation (EngineCandidateTrial) ;
 *   - l'ALERTE DE DÉRIVE du moteur en service (durable, posée par la calibration du mois)
 *     et la place du réglage refait chaque mois (étape 26) ; la place d'avant (« après la
 *     calibration ») n'est plus montrée que par un serveur pas encore relancé ;
 *   - (étape 27, 21/10/2026) la phrase en mots de la candidate (`enMots`), son « quoi »
 *     technique replié dans « Détail technique » ; pour la candidate du modèle de buts unique, son détail famille
 *     par famille (EngineGoalModelTrial : porte 1 du banc et sa réserve acceptée, verdicts,
 *     calibration, régimes, porte de l'adoption, horizon) ; ses marchés et témoins en mots ;
 *   - (étape 28, 27/10/2026) la simulation complète à blanc (EngineSimulationTrial : la porte 1, la dernière nuit,
 *     l'avancement de la preuve, les deux interrupteurs de l'affichage) — hors du moteur, elle ne fait aucune version.
 * Tout est LU (GET /api/config/versions, un état du serveur qui n'écrit rien) ;
 * les écritures sont le retour arrière (POST /api/config/versions/retour) et
 * l'adoption (POST /api/config/versions/adopter), chacune avec ce qui est vu à
 * l'écran (un double clic ne recule ni n'adopte jamais deux fois), et le
 * lancement du banc de la candidate (POST /api/config/versions/candidate/banc). Les mots viennent de utils/versionsMoteur.js (pur, testé).
 * Règles de dessin (ui/DESIGN.md) : chiffres clés en .cm-kpis, vraie
 * provenance (le fichier sur ce PC), aucun vert (rien ici n'est une value).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import EngineCandidateTrial from '@/components/settings/EngineCandidateTrial.vue';
import EngineGoalModelTrial from '@/components/settings/EngineGoalModelTrial.vue';
import EngineSimulationTrial from '@/components/settings/EngineSimulationTrial.vue';
import { configApi } from '@/services/configApi.js';
import {
  PHRASES,
  kpiEnService,
  kpiRetour,
  kpiCandidate,
  lignesDesChangements,
  phraseDuChangement,
  placeDansLeRetour,
  quandParis,
  texteDeConfirmation,
  kpiAdoption,
  kpiDerive,
  etatDeLaDerive,
  texteDeConfirmationAdoption,
  messageApresAdoption,
  marchesDits,
  estUnModeleDeButs,
  messageApresRetour
} from '@/utils/versionsMoteur.js';
import { useConfigStore } from '@/stores/configStore.js';

const props = defineProps({
  /** Heure du dernier enregistrement des réglages (ou remise aux valeurs par défaut) : la carte se relit. */
  changementLe: { type: String, default: null },
  /** Fin de la dernière passe d'actualisation : la carte se relit. */
  passeTermineeLe: { type: String, default: null }
});

const emit = defineEmits(['retour']);

const etat = ref({ loading: false, error: null, data: null });
const action = ref({ enCours: false, message: null, erreur: null });
// Étape 25, seconde moitié : l'adoption et le lancement du banc de la candidate.
const actionAdoption = ref({ enCours: false, message: null, erreur: null });
const actionBanc = ref({ message: null, erreur: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await configApi.versions() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(charger);
watch(
  () => [props.changementLe, props.passeTermineeLe],
  (apres, avant) => {
    if (apres.some((x, i) => x && x !== avant?.[i])) charger();
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const enService = computed(() => d.value?.enService ?? null);
const precedentes = computed(() => d.value?.precedentes ?? []);
const total = computed(() => (enService.value ? 1 : 0) + precedentes.value.length);
const kpiService = computed(() => kpiEnService(d.value));
const kpiDuRetour = computed(() => kpiRetour(d.value));
const kpiDeLaCandidate = computed(() => kpiCandidate(d.value));
const changementsEnService = computed(() => (enService.value ? lignesDesChangements(enService.value) : []));
const changementsDuRetour = computed(() => (d.value?.retour?.possible ? (d.value.retour.changements ?? []).map(phraseDuChangement) : []));
const retourPossible = computed(() => Boolean(d.value?.retour?.possible) && Boolean(enService.value) && !action.value.enCours);
const raisonDuRetour = computed(() => {
  if (!d.value) return etat.value.error ? 'Versions illisibles pour l’instant : le retour arrière attend.' : 'Lecture en cours…';
  return d.value.retour?.possible ? null : d.value.retour?.texte ?? 'Retour arrière impossible pour l’instant.';
});
const candidate = computed(() => d.value?.candidate ?? null);
const adoption = computed(() => d.value?.aVenir?.adoption ?? { quand: 'après la calibration (étape 20)', quoi: '' });
const derive = computed(() => d.value?.aVenir?.derive ?? { quand: 'après la calibration (étape 20)', quoi: '' });
// Étape 25, seconde moitié (14/10/2026).
const kpiDeLAdoption = computed(() => kpiAdoption(d.value));
const kpiDeLaDerive = computed(() => kpiDerive(d.value));
const laDerive = computed(() => etatDeLaDerive(d.value));
const correctionMensuelle = computed(() => d.value?.aVenir?.correctionMensuelle ?? null);
const ancienServeur = computed(() => Boolean(d.value?.aVenir?.adoption));

async function adopter() {
  const texte = texteDeConfirmationAdoption(d.value);
  if (!texte || !window.confirm(texte)) return;
  actionAdoption.value = { enCours: true, message: null, erreur: null };
  try {
    const r = await configApi.adopterLaCandidate(enService.value.numero, d.value.candidate.id);
    if (r?.versions) etat.value = { loading: false, error: null, data: r.versions };
    actionAdoption.value = { enCours: false, message: messageApresAdoption(r), erreur: null };
    // Le formulaire « Paramètres du moteur » reprend les réglages adoptés (le magasin de Réglages, appelé seulement ici).
    useConfigStore().appliquerAdoption(r);
  } catch (error) {
    actionAdoption.value = { enCours: false, message: null, erreur: error.message };
    charger();
  }
}

async function lancerLeBanc() {
  actionBanc.value = { message: null, erreur: null };
  try {
    await configApi.lancerLeBancDeLaCandidate();
    actionBanc.value = { message: 'Banc lancé dans le serveur : quelques minutes. Relisez la carte ensuite.', erreur: null };
    charger();
  } catch (error) {
    actionBanc.value = { message: null, erreur: error.message };
  }
}

async function revenir() {
  const texte = texteDeConfirmation(d.value);
  if (!texte || !window.confirm(texte)) return;
  action.value = { enCours: true, message: null, erreur: null };
  try {
    const r = await configApi.revenirALaVersionPrecedente(enService.value.numero);
    if (r?.versions) etat.value = { loading: false, error: null, data: r.versions };
    action.value = { enCours: false, message: messageApresRetour(r), erreur: null };
    emit('retour', r);
  } catch (error) {
    action.value = { enCours: false, message: null, erreur: error.message };
    charger();
  }
}
</script>

<template>
  <div class="ev">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture des versions du moteur…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title ev__danger">Versions du moteur illisibles</p>
        <p class="cm-note__text ev__texte">{{ etat.error }} — la carte garde ses blocs, sans valeurs.</p>
      </div>
    </div>

    <p class="ev__texte">{{ PHRASES.quoi }}</p>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis ev__kpis">
      <div class="cm-kpi is-section" :class="kpiService.ton">
        <span class="cm-kpi__label">Version en service</span>
        <span class="cm-kpi__value">{{ kpiService.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiService.detail }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Versions notées</span>
        <span class="cm-kpi__value">{{ d ? total : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ d?.premiereLe ? `la première le ${quandParis(d.premiereLe)}` : 'aucune encore' }}</span>
      </div>
      <div class="cm-kpi" :class="kpiDeLaCandidate.ton">
        <span class="cm-kpi__label">Candidate en essai</span>
        <span class="cm-kpi__value">{{ kpiDeLaCandidate.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiDeLaCandidate.detail }}</span>
      </div>
      <div class="cm-kpi" :class="kpiDuRetour.ton">
        <span class="cm-kpi__label">Retour arrière</span>
        <span class="cm-kpi__value">{{ kpiDuRetour.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiDuRetour.detail }}</span>
      </div>
      <div class="cm-kpi" :class="kpiDeLAdoption.ton">
        <span class="cm-kpi__label">Adoption</span>
        <span class="cm-kpi__value">{{ kpiDeLAdoption.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiDeLAdoption.detail }}</span>
      </div>
      <div class="cm-kpi" :class="kpiDeLaDerive.ton">
        <span class="cm-kpi__label">Dérive</span>
        <span class="cm-kpi__value">{{ kpiDeLaDerive.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiDeLaDerive.detail }}</span>
      </div>
    </div>

    <div class="ev__entete">
      <ProvenanceChip
        source="Registre des versions du moteur, sur ce PC"
        :releve-le="d?.majLe ?? null"
        action="mis à jour"
        :fichier="d?.fichier ?? null"
        :vieux-apres-heures="null"
        detail="Écrit par le serveur seul : au démarrage, à chaque enregistrement des réglages et au retour arrière."
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <div v-if="d?.enSynchro === false" class="cm-note is-warning">
      <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
      <div>
        <p class="cm-note__title">Réglages pas encore notés</p>
        <p class="cm-note__text ev__texte">Le moteur tourne avec des réglages qui ne sont pas encore une version (fichier modifié hors de l’écran) : ils le seront au prochain calcul. Relisez ensuite la carte.</p>
      </div>
    </div>

    <!-- 2. Ce qu'a changé la version en service. -->
    <h4 class="cm-group-title ev__groupe">
      Ce qui a changé avec la version en service
      <HelpTip
        titre="Ce qui fait une version"
        texte="Une version, c’est l’ensemble des réglages du moteur (ceux de Paramètres du moteur, valeurs par défaut comprises) et de son code (les fichiers qui calculent les pronostics). Enregistrer des réglages, ou mettre à jour l’appli, fait une version ; revenir à des réglages déjà vus reprend leur numéro."
      />
    </h4>
    <ul class="ev__changements">
      <li v-if="!enService" class="ev__petit">{{ d ? 'Aucune version en service notée.' : 'Non lu.' }}</li>
      <li v-for="(c, i) in changementsEnService" :key="i">
        <strong>{{ c.titre }}</strong>
        <span>{{ c.texte }}</span>
      </li>
    </ul>

    <!-- 3. Les versions précédentes. -->
    <h4 class="cm-group-title ev__groupe">Versions précédentes</h4>
    <div class="cm-table-wrap ev__wrap">
      <table class="cm-table ev__table">
        <thead>
          <tr>
            <th class="is-left">N°</th>
            <th class="is-left">Notée le</th>
            <th class="is-left">Ce qui l’a créée</th>
            <th class="is-left">Ce qu’elle a changé</th>
            <th class="is-left">Retour arrière</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!precedentes.length">
            <td class="is-left ev__vide" colspan="5">
              {{ d ? (enService ? `Aucune : la version ${enService.numero} est la première notée.` : 'Aucune version notée.') : 'Non lu.' }}
            </td>
          </tr>
          <tr v-for="v in precedentes" :key="v.numero">
            <td class="is-left cm-numeric ev__numero">n° {{ v.numero }}</td>
            <td class="is-left cm-numeric ev__quand">{{ quandParis(v.creeeLe) }}</td>
            <td class="is-left ev__origine">{{ v.pourquoi ?? 'origine non dite' }}</td>
            <td class="is-left ev__ce-qui">
              <span v-for="(c, i) in lignesDesChangements(v)" :key="i" class="ev__ligne"><strong>{{ c.titre }}</strong> : {{ c.texte }}</span>
            </td>
            <td class="is-left ev__place-retour">{{ placeDansLeRetour(v, d) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ total }} version{{ total > 1 ? 's' : '' }}</td>
            <td class="is-left" colspan="4">{{ enService ? `la n° ${enService.numero} en service, ${precedentes.length} précédente${precedentes.length > 1 ? 's' : ''}` : 'aucune en service' }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 4. La candidate en essai. -->
    <div class="cm-block ev__bloc">
      <div class="ev__tete">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="layers" :size="14" /></span>
        <strong>Version candidate en essai</strong>
        <span class="cm-chip">{{ kpiDeLaCandidate.valeur }}</span>
        <HelpTip titre="Calculée « à blanc »" :texte="PHRASES.aBlanc" />
      </div>
      <p v-if="d?.candidateProbleme" class="ev__texte ev__danger">{{ d.candidateProbleme }}</p>
      <p v-if="!candidate" class="ev__texte">{{ PHRASES.aucuneCandidate }}</p>
      <dl v-else class="ev__fiche">
        <dt>Identifiant</dt>
        <dd>{{ candidate.id }}</dd>
        <dt>Étape</dt>
        <dd>
          {{ candidate.etape }} — {{ candidate.enMots ?? candidate.quoi }}
          <!-- Étape 27 : une candidate qui a sa phrase en mots garde son « quoi » technique (celui du registre), replié. -->
          <details v-if="candidate.enMots" class="ev__technique">
            <summary class="ev__technique-titre"><AppIcon name="chevronRight" :size="12" class="ev__technique-chevron" />Détail technique</summary>
            <p class="ev__petit ev__technique-texte">{{ candidate.quoi }}</p>
          </details>
        </dd>
        <dt>Marchés calculés à blanc</dt>
        <dd :title="(candidate.marches ?? []).join(', ')">{{ marchesDits(candidate.marches) }}</dd>
        <template v-if="candidate.temoins?.length">
          <dt>Témoins (regardés, jamais jugés)</dt>
          <dd>{{ marchesDits(candidate.temoins) }}</dd>
        </template>
        <dt>En essai depuis</dt>
        <dd>{{ quandParis(candidate.enEssaiDepuis, 'pas encore mise en essai : au prochain démarrage du serveur') }}</dd>
        <dt>D’où elle vient</dt>
        <dd>{{ candidate.origineDite ?? 'déclarée dans le code' }}</dd>
        <dt>Horizon du verdict</dt>
        <dd>{{ candidate.horizon ? `${candidate.horizon.matchs} matchs joués et ${candidate.horizon.jours} jours` : 'non dit' }}</dd>
      </dl>
      <p class="ev__petit">{{ PHRASES.candidate }}</p>
      <p v-if="d?.candidateAdoptee" class="ev__petit">
        Dernière candidate adoptée : « {{ d.candidateAdoptee.id }} » (étape {{ d.candidateAdoptee.etape }}), devenue la version n° {{ d.candidateAdoptee.version }} le {{ quandParis(d.candidateAdoptee.le) }}.
      </p>
    </div>

    <!-- 4 bis. Étape 27 : la candidate du modèle de buts unique, famille par famille (seulement pour elle). -->
    <EngineGoalModelTrial v-if="candidate && estUnModeleDeButs(candidate)" :candidate="candidate" />

    <!-- 4 ter. L'essai de la candidate, ses deux verdicts et son adoption (étape 25, seconde moitié). -->
    <EngineCandidateTrial
      v-if="candidate"
      :etat="d"
      :occupe="actionAdoption.enCours"
      :message-adoption="actionAdoption.message"
      :erreur-adoption="actionAdoption.erreur"
      :message-banc="actionBanc.message"
      :erreur-banc="actionBanc.erreur"
      @adopter="adopter"
      @banc="lancerLeBanc"
    />
    <p v-if="!candidate && actionAdoption.message" class="ev__texte">{{ actionAdoption.message }}</p>

    <div v-if="d?.lancementADeclarer" class="cm-note is-warning">
      <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
      <div>
        <p class="cm-note__title">Lancement à noter</p>
        <p class="cm-note__text ev__texte">
          La candidate « {{ d.lancementADeclarer.version }} » est adoptée, mais son lancement n’a pas encore pu être noté au registre de la mesure (illisible au moment du clic) : il le sera au prochain démarrage du serveur.
        </p>
      </div>
    </div>

    <!-- 5. Le retour arrière. -->
    <div class="cm-block ev__bloc">
      <div class="ev__tete">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="history" :size="14" /></span>
        <strong>Revenir à la version précédente</strong>
        <HelpTip titre="Retour arrière" :texte="PHRASES.retour" />
      </div>
      <p v-if="d?.retour?.possible" class="ev__texte">Remet la version {{ d.retour.vers }} telle qu’elle était :</p>
      <ul v-if="changementsDuRetour.length" class="ev__changements">
        <li v-for="(c, i) in changementsDuRetour" :key="i">
          <strong>{{ c.titre }}</strong>
          <span>{{ c.texte }}</span>
        </li>
      </ul>
      <p v-if="raisonDuRetour" class="ev__texte ev__raison">{{ raisonDuRetour }}</p>
      <div class="cm-toolbar ev__actions">
        <AppButton variant="secondary" size="sm" :disabled="!retourPossible" :loading="action.enCours" @click="revenir">
          <template #icon><AppIcon name="history" :size="13" /></template>
          Revenir à la version précédente
        </AppButton>
      </div>
      <p v-if="action.message" class="ev__texte">{{ action.message }}</p>
      <p v-if="action.erreur" class="ev__texte ev__danger">{{ action.erreur }}</p>
    </div>

    <!-- 6. L'alerte de dérive du moteur en service (étape 25, seconde moitié) : durable, posée par la calibration du mois. -->
    <div class="cm-note" :class="laDerive.ton">
      <span class="cm-icon-box is-sm" :class="laDerive.ton || 'is-muted'"><AppIcon name="activity" :size="14" /></span>
      <div class="ev__derive">
        <p class="cm-note__title">
          Alerte de dérive : {{ laDerive.titre }}
          <HelpTip terme="calibration" />
        </p>
        <p class="cm-note__text ev__texte">{{ laDerive.phrase }}</p>
        <ul v-if="laDerive.signaux.length" class="ev__signaux">
          <li v-for="(x, i) in laDerive.signaux" :key="i">{{ x }}</li>
        </ul>
        <p v-if="laDerive.dernierMois" class="ev__petit">{{ laDerive.dernierMois }}</p>
        <p class="ev__petit">{{ PHRASES.derive }}</p>
        <p v-for="(r, i) in laDerive.regle" :key="`regle-${i}`" class="ev__petit">{{ r }}</p>
      </div>
    </div>

    <!-- 6 bis. Ce qui reste à venir : le réglage refait chaque mois (étape 26), la place seulement. -->
    <div v-if="correctionMensuelle" class="ev__place">
      <div class="ev__tete">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="clock" :size="14" /></span>
        <strong>Le réglage refait chaque mois</strong>
        <span class="cm-chip">{{ correctionMensuelle.quand }}</span>
      </div>
      <p class="ev__petit">{{ correctionMensuelle.quoi }}</p>
    </div>

    <!-- 6 ter. Un serveur pas encore relancé (d'avant la seconde moitié) annonce encore la place d'avant. -->
    <div v-if="ancienServeur" class="ev__avenir">
      <div class="ev__place">
        <div class="ev__tete">
          <span class="cm-icon-box is-muted is-sm"><AppIcon name="clock" :size="14" /></span>
          <strong>Adopter une candidate</strong>
          <span class="cm-chip">{{ adoption.quand }}</span>
        </div>
        <p class="ev__petit">{{ adoption.quoi }}</p>
      </div>
      <div class="ev__place">
        <div class="ev__tete">
          <span class="cm-icon-box is-muted is-sm"><AppIcon name="activity" :size="14" /></span>
          <strong>Alerte de dérive</strong>
          <span class="cm-chip">{{ derive.quand }}</span>
        </div>
        <p class="ev__petit">{{ derive.quoi }}</p>
      </div>
    </div>

    <!-- 7. Étape 28 : la simulation complète, calculée à blanc chaque nuit, HORS du moteur (aucune version) — la porte 1,
         la dernière nuit, l'avancement de la preuve et les deux interrupteurs ; le bloc lit lui-même son état. -->
    <EngineSimulationTrial />

    <p class="ev__pied">
      <AppIcon name="info" :size="12" />
      <span>{{ PHRASES.sansVersion }}{{ d?.premiereLe ? ` La première version a été notée le ${quandParis(d.premiereLe)}.` : '' }}</span>
    </p>
  </div>
</template>

<style scoped>
.ev {
  container: ev / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ev__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.cm-kpi.is-danger .cm-kpi__value {
  color: var(--cm-danger);
}

.ev__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.ev__danger {
  color: var(--cm-danger);
}

.ev__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* Étape 27 : le « quoi » technique d'une candidate qui a sa phrase en mots — replié, ouvert au clic. */
.ev__technique {
  margin-top: 4px;
}

.ev__technique-titre {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
  list-style: none;
}

.ev__technique-titre::-webkit-details-marker {
  display: none;
}

.ev__technique[open] .ev__technique-chevron {
  transform: rotate(90deg);
}

.ev__technique-texte {
  margin-top: 4px;
}

.ev__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ev__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.ev__changements {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ev__changements li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.ev__changements strong {
  color: var(--cm-text-primary);
}

.ev__wrap {
  max-height: 420px;
}

.ev__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.ev__numero {
  font-weight: 700;
  white-space: nowrap;
}

.ev__quand {
  white-space: nowrap;
}

.ev__origine,
.ev__ce-qui,
.ev__place-retour {
  min-width: 180px;
  white-space: normal;
  line-height: 1.45;
}

.ev__ligne {
  display: block;
  margin-bottom: 3px;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.ev__vide {
  color: var(--cm-text-muted);
}

.ev__bloc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ev__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}

.ev__fiche {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
  font-size: 12.5px;
}

.ev__fiche dt {
  color: var(--cm-text-muted);
}

.ev__fiche dd {
  margin: 0;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.ev__raison {
  color: var(--cm-text-muted);
}

.ev__actions {
  align-items: center;
  flex-wrap: wrap;
}

/* La place de ce qui viendra après la calibration : en tirets, comme la place du bilan de lot. */
.ev__avenir {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ev__place {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px dashed var(--cm-border);
  background: transparent;
}

.ev__derive {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ev__signaux {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.ev__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.ev__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container ev (min-width: 720px) {
  .ev__avenir {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container ev (max-width: 520px) {
  .ev__origine,
  .ev__ce-qui,
  .ev__place-retour {
    min-width: 0;
  }

  .ev__fiche {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
