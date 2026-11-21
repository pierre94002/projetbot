<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import DirectMatchCard from '@/components/direct/DirectMatchCard.vue';
import { directApi } from '@/services/directApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { liveNow } from '@/utils/liveClock.js';
import { surVisible } from '@/composables/usePageVisible.js';
import {
  boucleDite,
  chargeDite,
  cibleDeLAdresse,
  estLaCible,
  etatDuTableau,
  finDite,
  heureCourte,
  illisibleDit,
  instantDeLAdresse,
  lienDuFini,
  noteDite,
  nonSuiviDit,
  PHRASE_DU_BANDEAU,
  PHRASE_DU_RETARD,
  PHRASE_SANS_PAGE_DU_FINI,
  provenanceDeLEnTete,
  rejeuDit,
  relireAuTic,
  resumeDuTableau
} from '@/utils/direct.js';

/**
 * LA PAGE « DIRECT » (étape 46 du plan, lot 1, partie D, 12/11/2026 ; conception § 1.1, critique R3, R10, R25, R28, R29,
 * R30 ; décisions P4, P6, P6 bis) : tous les matchs en cours des championnats suivis, chacun sur sa carte cliquable,
 * sans plafond, les favoris d'abord ; puis les matchs terminés depuis moins de 3 heures. Le bandeau dit d'où viennent
 * les faits (FotMob), le retard, l'interrupteur (la note du banc d'essai) et l'état de la boucle. Relu à chaque tic de
 * l'horloge partagée (30 secondes), jamais deux lectures à la fois, ni page cachée ; un rejeu (`?instant=`) n'est relu que
 * tant que des calculs sont en attente. `?match=` (ou `?home=&away=&coup=`) : la page s'ouvre sur ce match.
 *
 * Correctifs D2 (12/11/2026) : une page montée dans un onglet caché relit dès que l'onglet redevient visible, et à chaque
 * tic tant qu'aucune réponse n'est arrivée ni aucune erreur dite — en direct comme en rejeu (point 1) ; en rejeu, la
 * provenance de l'en-tête dit les instantanés rangés et l'instant, pas la liste du jour d'une boucle coupée (point 4).
 *
 * Correctifs D3 (12/11/2026, point 2) : sous chaque match terminé, le lien « Page du match terminé » (/match/<clé>, l'instant
 * d'un rejeu gardé) quand le serveur a trouvé sa fiche au magasin par les identifiants FotMob et le jour ; sinon, pas de lien
 * et la phrase « pas encore rangée ». Jamais la page d'un match à venir, qui n'ouvre pas un match fini.
 */
const route = useRoute();
const favoris = useFavoritesStore();
const instant = computed(() => instantDeLAdresse(route.query));
const cible = computed(() => cibleDeLAdresse(route.query));

const reponse = ref(null);
const erreur = ref(null);
const erreurLe = ref(null);
const enLecture = ref(false);
const luLe = ref(null);
const cibleAbsente = ref(null);
let cibleCherchee = null;
let positionnee = null;
const cache = () => typeof document !== 'undefined' && document.hidden;

const etat = computed(() => etatDuTableau(reponse.value, { erreur: reponse.value ? null : erreur.value }));
const matchs = computed(() =>
  favoris.favoritesFirst(reponse.value?.matchs ?? [], {
    league: (e) => e.league ?? null,
    teams: (e) => [
      [e.home?.nom, e.league ?? null, e.home?.id ?? undefined],
      [e.away?.nom, e.league ?? null, e.away?.id ?? undefined]
    ]
  })
);
const finis = computed(() => reponse.value?.finis ?? []);
const resume = computed(() => resumeDuTableau(reponse.value));
const interrupteur = computed(() => noteDite(reponse.value?.note));
const laBoucle = computed(() => (reponse.value ? boucleDite(reponse.value.boucle, { matchs: matchs.value.length }) : null));
const laCharge = computed(() => chargeDite(reponse.value?.boucle?.charge));
const enAttente = computed(() => reponse.value?.calculs?.enAttente ?? 0);
const maintenantMs = computed(() => (instant.value ? Date.parse(instant.value) : liveNow.value));
const decalageS = computed(() => {
  if (instant.value || !reponse.value?.genereLe) return 0;
  return Math.max(0, (liveNow.value - Date.parse(reponse.value.genereLe)) / 1000);
});
const listeLue = computed(() => reponse.value?.boucle?.listeLueLe ?? null);
const rejeu = computed(() => (reponse.value?.rejeu || instant.value ? rejeuDit(reponse.value?.rejeu?.instant ?? instant.value) : null));
// Point 4 : en rejeu, « instantanés rangés · rejeu du 07/11 à 16 h 40 » ; en direct, la liste du jour de FotMob.
const provenance = computed(() => provenanceDeLEnTete({ instant: reponse.value?.rejeu?.instant ?? instant.value, listeLueLe: listeLue.value }));

function carteDuFini(f) {
  return {
    commenceTime: f.kickoff ?? null,
    date: f.date ?? null,
    league: f.league ?? null,
    homeName: f.home?.nom ?? 'Domicile',
    awayName: f.away?.nom ?? 'Extérieur',
    homeId: f.home?.id ?? null,
    awayId: f.away?.id ?? null,
    homeGoals: Number.isInteger(f.score?.home) ? f.score.home : null,
    awayGoals: Number.isInteger(f.score?.away) ? f.score.away : null,
    status: 'finished'
  };
}

async function chercherLaCible() {
  const c = cible.value;
  const cle = c ? JSON.stringify([c, instant.value]) : null;
  if (!c || !reponse.value) return;
  if ((reponse.value.matchs ?? []).some((e) => estLaCible(e, c))) {
    cibleAbsente.value = null;
    if (positionnee !== cle && typeof document !== 'undefined') {
      positionnee = cle;
      await nextTick();
      const e = reponse.value.matchs.find((x) => estLaCible(x, c));
      document.getElementById(`direct-${e?.fotmobId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    return;
  }
  if (cibleCherchee === cle) return;
  cibleCherchee = cle;
  try {
    cibleAbsente.value = await directApi.match({ ...c, instant: instant.value });
  } catch (error) {
    cibleAbsente.value = { suivi: false, raison: null, erreur: error.message };
  }
}

async function lire() {
  if (enLecture.value || cache()) return;
  enLecture.value = true;
  try {
    reponse.value = await directApi.tableau({ instant: instant.value });
    erreur.value = null;
    luLe.value = new Date().toISOString();
  } catch (error) {
    erreur.value = error.message;
    erreurLe.value = new Date().toISOString();
  } finally {
    enLecture.value = false;
  }
  await chercherLaCible();
}

onMounted(lire);
// Point 1 : montée dans un onglet caché, la page n'a rien lu ; elle lit dès que l'onglet redevient visible.
let arreterDEcouter = null;
onMounted(() => {
  arreterDEcouter = surVisible(lire);
});
onBeforeUnmount(() => arreterDEcouter?.());
watch(liveNow, () => {
  if (relireAuTic({ instant: instant.value, reponse: reponse.value, erreur: erreur.value, enAttente: enAttente.value })) lire();
});
watch(
  () => JSON.stringify([route.query.match, route.query.home, route.query.away, route.query.coup, route.query.instant]),
  () => {
    cibleCherchee = null;
    positionnee = null;
    cibleAbsente.value = null;
    reponse.value = null;
    lire();
  }
);
</script>

<template>
  <div class="direct-board" data-bloc="direct" :data-etat="etat">
    <section class="cm-hero" aria-labelledby="direct-titre">
      <div class="cm-hero__top">
        <h2 id="direct-titre" class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="bolt" :size="18" /></span>
          Direct
        </h2>
        <div class="cm-hero__chips">
          <span v-if="resume.enCours" class="cm-chip is-danger" data-compte="en-cours">
            <span class="cm-live-dot"></span>{{ resume.enCours }} en cours
          </span>
          <span v-else class="cm-chip" data-compte="en-cours">aucun match en cours</span>
          <span v-if="resume.miTemps" class="cm-chip is-info">{{ resume.miTemps }} à la mi-temps</span>
          <span v-if="rejeu" class="cm-chip is-warning">Rejeu</span>
          <ProvenanceChip
            :source="provenance.source"
            :releve-le="provenance.releveLe"
            action="lu"
            :vieux-apres-heures="null"
            :maintenant="maintenantMs"
            :titre="provenance.titre"
            :data-provenance="provenance.rejeu ? 'instantanes' : 'liste'"
          >
            <template #quand>{{ provenance.quand }}</template>
          </ProvenanceChip>
          <AppButton variant="secondary" size="sm" :loading="enLecture" data-action="relire" @click="lire">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Relire
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">{{ PHRASE_DU_BANDEAU }}</p>
      <p v-if="rejeu" class="direct-board__bandeau is-warning" data-rejeu>
        <AppIcon name="clock" :size="14" />
        <span>{{ rejeu }}</span>
      </p>
      <p class="direct-board__bandeau" :class="`is-${interrupteur.ton}`" data-interrupteur :data-note="interrupteur.etat">
        <AppIcon name="info" :size="14" />
        <span>{{ interrupteur.texte }}</span>
      </p>
      <p v-if="laBoucle && laBoucle.cle !== 'vide'" class="direct-board__bandeau" :class="`is-${laBoucle.ton}`" data-boucle :data-cle="laBoucle.cle">
        <AppIcon :name="laBoucle.ton === 'warning' ? 'alert' : 'info'" :size="14" />
        <span>{{ laBoucle.texte }}</span>
      </p>
      <p v-if="erreur && reponse" class="direct-board__bandeau is-warning" data-erreur>
        <AppIcon name="alert" :size="14" />
        <span>Dernière lecture ratée{{ heureCourte(erreurLe) ? ` à ${heureCourte(erreurLe)}` : '' }} ({{ erreur }}) : chiffres de la lecture précédente.</span>
      </p>
      <p class="direct-board__retard" data-phrase="retard">{{ PHRASE_DU_RETARD }}</p>
    </section>

    <p v-if="cibleAbsente" class="direct-board__bandeau is-info direct-board__cible" data-cible-absente>
      <AppIcon name="info" :size="14" />
      <span>Le match demandé : {{ cibleAbsente.erreur ? `lecture ratée (${cibleAbsente.erreur})` : nonSuiviDit(cibleAbsente) }}</span>
    </p>

    <section class="direct-board__section" aria-labelledby="direct-en-cours">
      <h3 id="direct-en-cours" class="direct-board__titre">En cours</h3>
      <LoadingSpinner v-if="etat === 'chargement'" label="Lecture du direct…" />
      <EmptyState
        v-else-if="etat === 'erreur'"
        icon="alert"
        title="Direct illisible"
        :description="`Lecture ratée : ${erreur}. Les autres pages de l'appli ne sont pas touchées ; « Relire » réessaie.`"
      />
      <EmptyState v-else-if="etat === 'illisible'" icon="alert" title="Direct illisible" :description="illisibleDit(reponse)" />
      <template v-else>
        <p v-if="enAttente && interrupteur.etat === 'allume'" class="direct-board__bandeau is-info" data-en-attente>
          <AppIcon name="clock" :size="14" />
          <span>{{ enAttente }} {{ enAttente > 1 ? 'calculs en cours' : 'calcul en cours' }} sur le serveur : les chiffres arrivent à la prochaine lecture.</span>
        </p>
        <div v-if="matchs.length" class="direct-board__liste">
          <DirectMatchCard
            v-for="e in matchs"
            :key="e.fotmobId"
            :entree="e"
            :boucle="reponse.boucle"
            :instant="instant"
            :maintenant="maintenantMs"
            :decalage-s="decalageS"
            :cible="estLaCible(e, cible)"
            :ouvert-au-depart="estLaCible(e, cible)"
            :page="estLaCible(e, cible) ? cible.page : null"
          />
        </div>
        <EmptyState v-else icon="bolt" title="Aucun match en cours" :description="laBoucle?.texte ?? 'Aucun match des championnats suivis ne se joue en ce moment.'" />
      </template>
    </section>

    <section class="direct-board__section" aria-labelledby="direct-finis" data-bloc="direct-finis">
      <h3 id="direct-finis" class="direct-board__titre">Terminés — fin relevée il y a moins de 3 h</h3>
      <div v-if="finis.length" class="direct-board__liste">
        <div v-for="f in finis" :key="f.fotmobId" class="direct-board__fini" :data-match="f.fotmobId">
          <MatchCard :match="carteDuFini(f)" :direct-link="false" date-display="none" />
          <p class="direct-board__fin">{{ finDite(f) }}</p>
          <p class="direct-board__fin" data-page-du-fini>
            <RouterLink v-if="lienDuFini(f, instant)" :to="lienDuFini(f, instant)" class="cm-link" data-lien="page-du-fini">Page du match terminé</RouterLink>
            <template v-else>{{ PHRASE_SANS_PAGE_DU_FINI }}</template>
          </p>
        </div>
      </div>
      <p v-else class="direct-board__fin">
        {{ etat === 'chargement' || etat === 'erreur' || etat === 'illisible' ? 'Pas encore lu.' : 'Aucun match terminé depuis 3 heures.' }}
      </p>
    </section>

    <p v-if="laCharge" class="direct-board__charge" data-charge>{{ laCharge }}</p>
  </div>
</template>

<style scoped>
.direct-board {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.direct-board__bandeau {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.direct-board__bandeau :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.direct-board__bandeau.is-warning {
  color: var(--cm-warning);
}

.direct-board__bandeau.is-muted {
  color: var(--cm-text-muted);
}

.direct-board__retard,
.direct-board__fin,
.direct-board__charge {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.direct-board__cible {
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-info-rgb) / 0.35);
}

.direct-board__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.direct-board__titre {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.direct-board__liste {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr));
  gap: 12px;
  align-items: start;
}

.direct-board__fini {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
