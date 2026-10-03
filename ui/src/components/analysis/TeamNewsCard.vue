<script setup>
/**
 * Ce que le calcul ne voit pas : blessures et suspensions longues,
 * changement d'entraîneur (FotMob, gratuit, cf. server/src/data/providers/
 * teamNewsResolver.js), et une note libre que Pierre écrit lui-même —
 * vestiaire, rumeur, finances du club, tout ce qu'aucune donnée mesurée ne
 * capture. Relu par l'analyse IA avant-match ; n'entre jamais dans le
 * pronostic chiffré ni dans la mise (cf. README, section moteur).
 *
 * Dessin (refonte du 01/10/2026) : une carte à icône ; chaque club dans un
 * bloc avec son logo, ses absents en lignes (drapeau, étiquette blessé ou
 * suspendu colorée), le changement d'entraîneur en note ; la note manuscrite
 * dans un champ au dessin des champs communs (anneau de focus couleur de
 * section), le bouton d'enregistrement en vert de la marque.
 */
import { ref, computed, watch } from 'vue';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { matchNotesApi } from '@/services/matchNotesApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { formatDateTime } from '@/utils/format.js';
import { retourPrevu } from '@/utils/fotmobLabels.js';

const props = defineProps({
  result: { type: Object, required: true }
});

const home = computed(() => props.result.teamStats?.home?.name ?? props.result.label?.split(' vs ')[0] ?? 'Domicile');
const away = computed(() => props.result.teamStats?.away?.name ?? props.result.label?.split(' vs ')[1] ?? 'Extérieur');

const news = ref(null);
const newsLoading = ref(false);

const noteText = ref('');
const noteSavedText = ref('');
const noteLoaded = ref(false);
const noteSaving = ref(false);
const noteSavedAt = ref(null);

const noteChanged = computed(() => noteLoaded.value && noteText.value !== noteSavedText.value);

async function chargerActualites() {
  news.value = null;
  if (!props.result.commenceTime) return;
  newsLoading.value = true;
  try {
    news.value = await teamStatsApi.getTeamNews(home.value, props.result.commenceTime, away.value, props.result.league);
  } catch {
    news.value = null;
  } finally {
    newsLoading.value = false;
  }
}

async function chargerNote() {
  noteLoaded.value = false;
  noteText.value = '';
  noteSavedText.value = '';
  try {
    const r = await matchNotesApi.get(props.result.matchId);
    noteText.value = r?.text ?? '';
    noteSavedText.value = r?.text ?? '';
    noteSavedAt.value = r?.updatedAt ?? null;
  } catch {
    // Note indisponible : le champ reste vide, modifiable, réessayable à l'enregistrement.
  } finally {
    noteLoaded.value = true;
  }
}

async function enregistrerNote() {
  noteSaving.value = true;
  try {
    const r = await matchNotesApi.save(props.result.matchId, { text: noteText.value, homeName: home.value, awayName: away.value, league: props.result.league });
    noteSavedText.value = noteText.value;
    noteSavedAt.value = r?.updatedAt ?? new Date().toISOString();
  } finally {
    noteSaving.value = false;
  }
}

let matchIdCourant = null;
watch(
  () => props.result.matchId,
  (id) => {
    if (!id || id === matchIdCourant) return;
    matchIdCourant = id;
    chargerActualites();
    chargerNote();
  },
  { immediate: true }
);

const LABEL_TYPE = { blessure: 'Blessé', suspension: 'Suspendu' };
const libelleType = (t) => LABEL_TYPE[t] ?? t;

const equipes = computed(() => {
  const n = news.value;
  if (!n) return [];
  return [
    { cle: 'home', nom: home.value, actu: n.home },
    { cle: 'away', nom: away.value, actu: n.away }
  ].filter((e) => e.actu);
});

// ---- présentation ---------------------------------------------------------
// Le nombre d'absents de chaque club, pour la pastille de son bloc.
const nombreAbsents = (e) => e.actu.longTermAbsences?.length ?? 0;
</script>

<template>
  <AppCard title="Actualités d'équipe" subtitle="Blessures, suspensions et changement d'entraîneur d'après FotMob, gratuit." icon="userX" class="tnc">
    <div class="tnc__body">
      <LoadingSpinner v-if="newsLoading" label="Recherche des blessures et suspensions…" />

      <!-- Chaque club dans son bloc : logo, nombre d'absents, entraîneur, absents. -->
      <div v-else-if="equipes.length" class="tnc__teams">
        <div v-for="e in equipes" :key="e.cle" class="cm-block tnc__team">
          <p class="tnc__team-head">
            <span class="tnc__team-name cm-truncate">
              <TeamCrest :name="e.nom" :league="result.league" :team-id="e.actu.teamId ?? null" :size="26" class="tnc__crest" />{{ e.nom }}
            </span>
            <span class="cm-pill tnc__count" :class="nombreAbsents(e) ? 'is-danger' : ''" :title="`${nombreAbsents(e)} absent(s) de longue durée`">
              {{ nombreAbsents(e) }} absent{{ nombreAbsents(e) > 1 ? 's' : '' }}
            </span>
          </p>

          <div v-if="e.actu.coachChange" class="cm-note is-info tnc__coach">
            <span class="cm-icon-box is-info is-sm"><AppIcon name="swap" :size="14" /></span>
            <div>
              <p class="cm-note__title">Changement d'entraîneur</p>
              <p class="cm-note__text tnc__coach-text">
                {{ e.actu.coachChange.previousCoach }} <span class="tnc__arrow">→</span> {{ e.actu.coachChange.currentCoach }}
                <span v-if="e.actu.coachChange.since" class="cm-text-muted tnc__coach-since">(dernier match connu avec l'ancien, le {{ formatDateTime(e.actu.coachChange.since) }})</span>
              </p>
            </div>
          </div>

          <ul v-if="e.actu.longTermAbsences?.length" class="tnc__absences">
            <li v-for="a in e.actu.longTermAbsences" :key="a.name" class="tnc__absence">
              <PlayerFlag :player-id="a.id ?? null" :size="16" />
              <span class="tnc__absence-name cm-truncate">{{ a.name }}</span>
              <span v-if="a.expectedReturn" class="cm-text-muted tnc__absence-return">retour {{ retourPrevu(a.expectedReturn) }}</span>
              <span class="tnc__tag" :class="`is-${a.type}`">{{ libelleType(a.type) }}</span>
            </li>
          </ul>
          <p v-else class="tnc__none">Aucun absent de longue durée signalé.</p>
        </div>
      </div>

      <EmptyState
        v-else
        icon="userX"
        title="Rien signalé par FotMob pour l'instant"
        description="Jamais la preuve qu'il ne se passe rien, seulement que rien n'est publié."
        class="tnc__empty"
      />

      <!-- La note manuscrite pour l'IA : un champ au dessin des champs communs. -->
      <div class="tnc__note">
        <label class="tnc__note-label" for="team-news-note">
          <span class="tnc__note-title"><AppIcon name="edit" :size="12" />Note pour l'IA</span>
          <span class="tnc__note-hint">vestiaire, rumeur, finances du club… ce qu'aucune donnée ne capture</span>
        </label>
        <textarea
          id="team-news-note"
          v-model="noteText"
          class="tnc__textarea"
          rows="3"
          placeholder="Écris ici ce que tu sais et qui ne figure dans aucune statistique…"
          :disabled="!noteLoaded"
        />
        <div class="tnc__note-actions">
          <span class="tnc__note-status" :class="{ 'is-changed': noteChanged && !noteSaving }">
            <template v-if="noteSaving">Enregistrement…</template>
            <template v-else-if="noteChanged">Modifiée, pas encore enregistrée.</template>
            <template v-else-if="noteSavedAt"><AppIcon name="check" :size="12" />Enregistrée le {{ formatDateTime(noteSavedAt) }}.</template>
          </span>
          <AppButton variant="section" size="sm" :loading="noteSaving" :disabled="!noteChanged" @click="enregistrerNote">
            <template #icon><AppIcon name="check" :size="13" /></template>
            Enregistrer la note
          </AppButton>
        </div>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.tnc__body {
  /* Se règle sur SA largeur : les deux clubs côte à côte quand la place existe. */
  container: tnc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* -------------------------------------------------------------- les clubs */
.tnc__teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.tnc__team {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.tnc__team-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
}

.tnc__team-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.tnc__crest {
  margin-right: 9px;
}

.tnc__count {
  font-size: 11px;
  color: var(--cm-text-secondary);
}

.tnc__count.is-danger {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.tnc__coach {
  padding: 10px 12px;
}

.tnc__coach-text {
  font-size: 12.5px;
}

.tnc__arrow {
  color: var(--cm-text-muted);
}

.tnc__coach-since {
  font-size: 11.5px;
}

/* Les absents : drapeau, nom, retour prévu, étiquette colorée à droite. */
.tnc__absences {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tnc__absence {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.tnc__absence:first-child {
  border-top: 0;
  padding-top: 0;
}

.tnc__absence:last-child {
  padding-bottom: 0;
}

.tnc__absence-name {
  font-weight: 600;
  color: var(--cm-text-primary);
}

.tnc__absence-return {
  font-size: 11.5px;
  white-space: nowrap;
}

.tnc__tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Blessé en rouge, suspendu en ambre : des couleurs sémantiques, stables. */
.tnc__tag.is-blessure {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.tnc__tag.is-suspension {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.tnc__none {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.tnc__empty {
  padding: 22px 20px;
}

/* ----------------------------------------------------- la note manuscrite */
.tnc__note {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.tnc__note-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.tnc__note-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.tnc__note-title :deep(svg) {
  color: var(--cm-section);
}

.tnc__note-hint {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* Le même dessin que les champs communs (AppTextField) : surface, filet, anneau de focus couleur de section. */
.tnc__textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  padding: 9px 12px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  outline: none;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.tnc__textarea::placeholder {
  color: var(--cm-text-muted);
}

.tnc__textarea:hover:not(:disabled) {
  border-color: var(--cm-border-strong);
}

.tnc__textarea:focus {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.tnc__textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tnc__note-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.tnc__note-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.tnc__note-status :deep(svg) {
  color: var(--cm-accent);
}

.tnc__note-status.is-changed {
  color: var(--cm-warning);
}

/* Assez de place : les deux clubs côte à côte. */
@container tnc (min-width: 620px) {
  .tnc__teams {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : le retour prévu passe sous le nom. */
@container tnc (max-width: 360px) {
  .tnc__absence {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .tnc__absence-return {
    grid-column: 2;
    white-space: normal;
  }
}
</style>
