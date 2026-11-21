<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import DirectMatchCard from '@/components/direct/DirectMatchCard.vue';
import { directApi } from '@/services/directApi.js';
import { liveNow } from '@/utils/liveClock.js';
import { surVisible } from '@/composables/usePageVisible.js';
import { adresseDuDirect, nonSuiviDit, noteDite, RAISONS_NON_SUIVI_DITES, relireAuTic } from '@/utils/direct.js';

/**
 * L'ENCART « EN DIRECT » DE LA PAGE DU MATCH (étape 46 du plan, lot 1, partie D, 12/11/2026 ; décision P6, question 2 :
 * il remplace la carte payante d'API-Football ; P6 bis : il est cliquable et ouvre la page Direct sur CE match). Le match
 * est demandé par ses deux clubs (identifiants FotMob, jamais un nom) et son coup d'envoi (à moins de 3 heures, la règle
 * de la route) ; sans identifiants, la phrase de R11 et aucune lecture. Lu au montage seulement, puis à chaque tic de
 * l'horloge partagée tant que le match n'est pas terminé (en rejeu : tant que des calculs sont en attente).
 *
 * Correctifs D2 (12/11/2026) : `fotmobId` — l'identifiant FotMob du match, quand l'ensemble des matchs en cours le donne
 * (la page du match le passe, même pour un match du calendrier sans heure) : le direct est alors demandé par lui
 * (`id=`), et l'adresse de la page Direct le porte (point 2 e). Monté dans un onglet caché, l'encart lit dès que l'onglet
 * redevient visible, et à chaque tic tant qu'aucune réponse n'est arrivée ni aucune erreur dite (point 1).
 */
const props = defineProps({
  fotmobId: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  coupDEnvoi: { type: String, default: null },
  matchId: { type: String, default: null },
  instant: { type: String, default: null }
});

const ID_FOTMOB = /^fotmob-[1-9]\d*$/;
const ID_MATCH = /^[1-9]\d*$/;
const parId = computed(() => ID_MATCH.test(props.fotmobId ?? ''));
const avecIds = computed(() => parId.value || (ID_FOTMOB.test(props.homeId ?? '') && ID_FOTMOB.test(props.awayId ?? '') && Boolean(props.coupDEnvoi)));
const adresse = computed(() => {
  if (parId.value) return adresseDuDirect({ id: props.fotmobId, page: props.matchId, instant: props.instant });
  return avecIds.value
    ? adresseDuDirect({ home: props.homeId, away: props.awayId, coup: props.coupDEnvoi, page: props.matchId, instant: props.instant })
    : adresseDuDirect({ instant: props.instant });
});
const reponse = ref(null);
const erreur = ref(null);
const enLecture = ref(false);
const cache = () => typeof document !== 'undefined' && document.hidden;
const termine = computed(() => reponse.value && !reponse.value.suivi && ['fini', 'coupure-4h'].includes(reponse.value.raison));
const maintenantMs = computed(() => (props.instant ? Date.parse(props.instant) : liveNow.value));
const interrupteur = computed(() => (reponse.value ? noteDite(reponse.value.note) : null));
const etat = computed(() => (!avecIds.value ? 'sans-identifiants' : erreur.value && !reponse.value ? 'erreur' : !reponse.value ? 'chargement' : reponse.value.suivi ? 'suivi' : 'non-suivi'));

async function lire() {
  if (!avecIds.value || enLecture.value || cache()) return;
  enLecture.value = true;
  try {
    reponse.value = await directApi.match(
      parId.value ? { id: props.fotmobId, instant: props.instant } : { home: props.homeId, away: props.awayId, coup: props.coupDEnvoi, instant: props.instant }
    );
    erreur.value = null;
  } catch (error) {
    erreur.value = error.message;
  } finally {
    enLecture.value = false;
  }
}

onMounted(lire);
let arreterDEcouter = null;
onMounted(() => {
  arreterDEcouter = surVisible(lire);
});
onBeforeUnmount(() => arreterDEcouter?.());
watch(liveNow, () => {
  if (relireAuTic({ instant: props.instant, reponse: reponse.value, erreur: erreur.value, enAttente: reponse.value?.calculs?.enAttente ?? 0, termine: termine.value })) lire();
});
// L'identifiant FotMob arrive après le montage (l'ensemble est lu une fois par minute) : le direct est relu par lui.
watch(
  () => props.fotmobId,
  (id, avant) => {
    if (id && id !== avant && !termine.value) lire();
  }
);
</script>

<template>
  <div class="direct-encart" data-bloc="direct-encart" :data-etat="etat">
    <p class="direct-encart__texte">
      Le direct de ce match : le score, la minute et les cartons rouges relevés chez FotMob.
      <RouterLink :to="adresse" class="cm-link" data-lien="direct">Ouvrir la page Direct, sur ce match</RouterLink>
    </p>
    <p v-if="etat === 'sans-identifiants'" class="direct-encart__gris">{{ RAISONS_NON_SUIVI_DITES['sans-identifiants'] }}</p>
    <LoadingSpinner v-else-if="etat === 'chargement'" label="Lecture du direct…" />
    <p v-else-if="etat === 'erreur'" class="direct-encart__gris is-warning">Direct illisible : {{ erreur }}. Le reste de la page n'est pas touché.</p>
    <template v-else-if="etat === 'suivi'">
      <p v-if="interrupteur && interrupteur.etat !== 'non-juge'" class="direct-encart__gris" :data-note="interrupteur.etat">{{ interrupteur.texte }}</p>
      <DirectMatchCard
        :entree="reponse.match"
        :boucle="reponse.boucle"
        :instant="instant"
        :maintenant="maintenantMs"
        :lien="adresse"
        :detail="reponse"
        :page="matchId"
      />
    </template>
    <p v-else class="direct-encart__gris" :data-raison="reponse.raison">{{ nonSuiviDit(reponse) }}</p>
  </div>
</template>

<style scoped>
.direct-encart {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.direct-encart__texte,
.direct-encart__gris {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.direct-encart__gris {
  font-size: 12.5px;
  color: var(--cm-text-muted);
}

.direct-encart__gris.is-warning {
  color: var(--cm-warning);
}
</style>
