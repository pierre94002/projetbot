<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import DirectMarkets from '@/components/direct/DirectMarkets.vue';
import DirectCurve from '@/components/direct/DirectCurve.vue';
import { directApi } from '@/services/directApi.js';
import { liveNow } from '@/utils/liveClock.js';
import {
  ageDeLEtatDit,
  avantMatchDit,
  chiffresDeLaCarte,
  minuteDite,
  nonSuiviDit,
  notesDeLEtat,
  provenances,
  rougesDits,
  scoreDit
} from '@/utils/direct.js';

/**
 * UN MATCH EN COURS (étape 46 du plan, lot 1, partie D, 12/11/2026 ; conception § 1.2, critique R29) : l'en-tête est la
 * carte commune des rencontres (MatchCard : les deux clubs, leurs logos, le score, « Direct · 34e ») ; dessous, l'âge du
 * relevé, la ligne des cartons rouges (toujours là), les notes (chacune avec le logo du camp qu'elle nomme), les chiffres
 * du calcul quand le banc d'essai les a jugés — sinon « pas encore jugé », aucun pourcentage (P4) —, le point de départ
 * (le pronostic d'avant-match, R9) et la provenance de chaque chiffre. « Détail » ouvre tous les marchés et la courbe
 * (lus à l'ouverture, relus toutes les 30 secondes, jamais deux lectures à la fois).
 *
 * `lien` (l'encart de la page du match) : l'en-tête ouvre la page Direct sur ce match ; sinon il ouvre le détail.
 * `detail` : un détail déjà lu (l'encart) — aucune lecture de plus. `instant` : un rejeu (R28).
 */
const props = defineProps({
  entree: { type: Object, required: true },
  boucle: { type: Object, default: null },
  instant: { type: String, default: null },
  maintenant: { type: Number, default: null },
  decalageS: { type: Number, default: 0 },
  cible: { type: Boolean, default: false },
  ouvertAuDepart: { type: Boolean, default: false },
  page: { type: String, default: null },
  lien: { type: Object, default: null },
  detail: { type: Object, default: null }
});

const e = computed(() => props.entree);
const et = computed(() => e.value.etat ?? {});
// Correctifs D2 (12/11/2026, point 3) : la page du match DANS L'APPLI — celle que donne l'adresse, sinon celle que le
// serveur a trouvée de façon sûre (`entree.page` : le match_id de la ligne de nuit, ou l'UNIQUE entrée du calendrier du
// même jour dont les deux clubs ont ces identifiants FotMob ; jamais un nom ; deux entrées : aucune) ; sinon, la phrase.
const pageDeLApp = computed(() => props.page ?? (typeof e.value.page?.id === 'string' && e.value.page.id ? e.value.page.id : null));
const STATUTS = { termine: 'finished', arrete: 'finished', attribue: 'finished', avant: 'scheduled', 'sans-releve': 'scheduled' };
const statut = computed(() => STATUTS[et.value.phase] ?? 'live');
const scoreConnu = computed(() => Boolean(et.value.score?.connu));

// L'en-tête : la carte commune. Sans score publié, ni heure ni jour (le centre dit « — », jamais l'heure du coup d'envoi).
const carte = computed(() => ({
  matchId: pageDeLApp.value,
  commenceTime: scoreConnu.value ? e.value.kickoff ?? null : null,
  date: scoreConnu.value ? e.value.date ?? null : null,
  league: e.value.league ?? null,
  homeName: e.value.home?.nom ?? 'Domicile',
  awayName: e.value.away?.nom ?? 'Extérieur',
  homeId: e.value.home?.id ?? null,
  awayId: e.value.away?.id ?? null,
  homeGoals: scoreConnu.value ? et.value.score.home : null,
  awayGoals: scoreConnu.value ? et.value.score.away : null,
  status: statut.value,
  fotmobId: e.value.fotmobId ?? null,
  minute: statut.value === 'live' ? minuteDite(et.value) : null
}));

const age = computed(() => ageDeLEtatDit(et.value, { decalageS: props.decalageS }));
const score = computed(() => scoreDit(e.value));
const rouges = computed(() => rougesDits(e.value));
const notes = computed(() => notesDeLEtat(e.value, { boucle: props.boucle }));
const chiffres = computed(() => chiffresDeLaCarte(e.value));
const depart = computed(() => avantMatchDit(e.value.avantMatch));
const lesProvenances = computed(() => provenances(e.value));
const nomDe = (c) => e.value[c]?.nom ?? (c === 'home' ? 'Domicile' : 'Extérieur');
const idDe = (c) => e.value[c]?.id ?? null;
const largeur = (p) => `${Math.round(Math.max(0, Math.min(1, Number(p) || 0)) * 100)}%`;
const lienDeLaPage = computed(() =>
  pageDeLApp.value ? { path: `/match-a-venir/${encodeURIComponent(pageDeLApp.value)}`, query: props.instant ? { instant: props.instant } : {} } : null
);

// ------------------------------------------------------------ le détail (lu à l'ouverture, relu toutes les 30 secondes)
const ouvert = ref(props.ouvertAuDepart);
const detailLu = ref(props.detail);
const erreurDuDetail = ref(null);
const detailEnLecture = ref(false);
let luA = 0;
const cache = () => typeof document !== 'undefined' && document.hidden;

async function lireLeDetail() {
  if (props.detail || detailEnLecture.value) return;
  detailEnLecture.value = true;
  try {
    detailLu.value = await directApi.match({ id: e.value.fotmobId, instant: props.instant });
    erreurDuDetail.value = null;
    luA = Date.now();
  } catch (error) {
    erreurDuDetail.value = error.message;
  } finally {
    detailEnLecture.value = false;
  }
}

function basculer() {
  ouvert.value = !ouvert.value;
  if (ouvert.value && !detailLu.value) lireLeDetail();
}

onMounted(() => (ouvert.value && !detailLu.value ? lireLeDetail() : undefined));
watch(liveNow, () => {
  if (!ouvert.value || props.detail || cache() || Date.now() - luA < 30_000) return;
  if (!props.instant || detailLu.value?.calculs?.enAttente > 0) lireLeDetail();
});
watch(
  () => props.detail,
  (d) => {
    if (d) detailLu.value = d;
  }
);
watch(
  () => props.ouvertAuDepart,
  (v) => {
    if (v && !ouvert.value) basculer();
  }
);
const matchDuDetail = computed(() => (detailLu.value?.suivi ? detailLu.value.match ?? e.value : e.value));
</script>

<template>
  <article
    :id="`direct-${entree.fotmobId}`"
    class="direct-card"
    :class="{ 'is-cible': cible, 'is-perime': et.perime }"
    :data-match="entree.fotmobId"
    :data-phase="et.phase ?? ''"
    :data-raison="entree.calcul?.raison ?? ''"
    :data-variante="entree.calcul?.variante ?? ''"
    :data-a-blanc="entree.calcul?.aBlanc ? 'oui' : 'non'"
  >
    <MatchCard
      :match="carte"
      :to="lien"
      :clickable="!lien"
      :active="ouvert && !lien"
      :direct-link="false"
      date-display="none"
      class="direct-card__entete"
      @select="basculer"
    />

    <p class="direct-card__age" :class="`is-${age.ton}`" data-age>
      <span>{{ age.texte }}</span>
      <span v-if="score.depuis"> · {{ score.depuis }}</span>
    </p>

    <p class="direct-card__ligne" :class="`is-${rouges.ton}`" data-rouges>
      <TeamCrest v-for="c in rouges.camps" :key="c" :name="nomDe(c)" :league="entree.league" :team-id="idDe(c)" :size="16" />
      <span>{{ rouges.texte }}</span>
    </p>

    <ul v-if="notes.length" class="direct-card__notes">
      <li v-for="n in notes" :key="n.cle" class="direct-card__ligne" :class="`is-${n.ton}`" :data-note="n.cle">
        <TeamCrest v-for="c in n.camps" :key="c" :name="nomDe(c)" :league="entree.league" :team-id="idDe(c)" :size="16" />
        <span>{{ n.texte }}</span>
      </li>
    </ul>

    <div v-if="chiffres.montre" class="direct-card__chiffres" data-bloc="direct-chiffres">
      <div class="direct-card__un2">
        <div v-for="l in chiffres.un2" :key="l.cle" class="direct-card__issue" :class="`is-${l.ton}`" :data-issue="l.issue">
          <span class="direct-card__issue-nom">
            <TeamCrest v-if="l.issue !== 'draw'" :name="nomDe(l.issue)" :league="entree.league" :team-id="idDe(l.issue)" :size="16" />
            {{ l.titre }}
          </span>
          <template v-if="l.montre">
            <strong class="direct-card__valeur cm-numeric">{{ l.valeur }}</strong>
            <div class="cm-bar direct-card__barre"><div class="cm-bar__fill" :style="{ width: largeur(l.p) }"></div></div>
            <span v-if="l.avant" class="direct-card__avant">pronostic d'avant-match : {{ l.avant }}</span>
            <span v-if="l.raison" class="direct-card__raison">{{ l.raison }}</span>
          </template>
          <span v-else class="direct-card__raison">{{ l.raison }}</span>
        </div>
      </div>
      <ul class="direct-card__buts">
        <li v-for="l in chiffres.buts" :key="l.cle" :class="`is-${l.ton}`" :data-issue="l.issue">
          <span>{{ l.texte }}</span>
          <strong v-if="l.montre" class="cm-numeric">{{ l.valeur }}</strong>
          <span v-if="l.raison" class="direct-card__raison">{{ l.raison }}</span>
        </li>
      </ul>
    </div>

    <p class="direct-card__depart" :class="`is-${depart.ton}`" data-depart>{{ depart.texte }}</p>

    <div class="direct-card__provenances">
      <ProvenanceChip
        v-for="p in lesProvenances"
        :key="p.cle"
        :source="p.source"
        :releve-le="p.releveLe"
        :action="p.action"
        :vieux-apres-heures="null"
        :maintenant="maintenant"
        variante="ligne"
        :titre="p.titre"
        :data-provenance="p.cle"
      >
        <template #quand>{{ p.texte }}</template>
      </ProvenanceChip>
    </div>

    <div class="direct-card__actions">
      <AppButton variant="secondary" size="sm" :loading="detailEnLecture" data-action="detail" @click="basculer">
        {{ ouvert ? 'Fermer le détail' : 'Détail : tous les marchés et la courbe' }}
      </AppButton>
      <RouterLink v-if="lienDeLaPage" :to="lienDeLaPage" class="cm-link" data-lien="page-du-match">Page du match</RouterLink>
      <span v-else class="direct-card__sans-page">Page du match : à ouvrir depuis <RouterLink to="/matches" class="cm-link">Matchs</RouterLink></span>
    </div>

    <div v-if="ouvert" class="direct-card__detail" data-bloc="direct-detail">
      <LoadingSpinner v-if="!detailLu && detailEnLecture" label="Lecture du détail…" />
      <p v-else-if="erreurDuDetail && !detailLu" class="direct-card__ligne is-warning">Détail illisible : {{ erreurDuDetail }}. La carte ci-dessus reste à jour.</p>
      <template v-else-if="detailLu">
        <p v-if="!detailLu.suivi" class="direct-card__ligne is-muted">{{ nonSuiviDit(detailLu) }}</p>
        <template v-else>
          <DirectMarkets :match="matchDuDetail" :reference="detailLu.reference" :maintenant="maintenant" />
          <DirectCurve :courbe="detailLu.courbe" :match="matchDuDetail" />
        </template>
      </template>
    </div>
  </article>
</template>

<style scoped>
.direct-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  scroll-margin-top: 16px;
}

/* Le match visé par l'adresse (puce « Direct », encart de la page du match). */
.direct-card.is-cible {
  border-color: rgba(var(--cm-info-rgb) / 0.6);
  box-shadow: 0 0 0 1px rgba(var(--cm-info-rgb) / 0.35);
}

/* Un relevé périmé : les chiffres restent, en gris. */
.direct-card.is-perime .direct-card__chiffres {
  opacity: 0.6;
  filter: grayscale(1);
}

.direct-card__age,
.direct-card__ligne,
.direct-card__depart {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.direct-card__age {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.is-warning {
  color: var(--cm-warning);
}

.is-muted {
  color: var(--cm-text-muted);
}

.is-info {
  color: var(--cm-text-secondary);
}

.direct-card__notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.direct-card__chiffres {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.direct-card__un2 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.direct-card__issue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.direct-card__issue-nom {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.direct-card__valeur {
  font-size: 18px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

/* Les barres du direct sont bleues (--cm-info), jamais la couleur de section ni une couleur de verdict. */
.direct-card__barre .cm-bar__fill {
  background: var(--cm-info);
}

.direct-card__issue.is-warning .cm-bar__fill {
  background: var(--cm-warning);
}

.direct-card__avant,
.direct-card__raison {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.direct-card__buts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.direct-card__buts li {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.direct-card__buts li.is-warning strong {
  color: var(--cm-warning);
}

.direct-card__provenances {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.direct-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.direct-card__sans-page {
  font-size: 12px;
  color: var(--cm-text-muted);
}

.direct-card__detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}

/* Une colonne sur un téléphone : les trois issues l'une sous l'autre. */
@media (max-width: 480px) {
  .direct-card__un2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
