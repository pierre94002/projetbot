<script setup>
/**
 * Ce que le calcul ne voit pas : blessures et suspensions longues,
 * changement d'entraîneur (FotMob, gratuit, cf. server/src/data/providers/
 * teamNewsResolver.js), et une note libre que Pierre écrit lui-même —
 * vestiaire, rumeur, finances du club, tout ce qu'aucune donnée mesurée ne
 * capture. Relu par l'analyse IA avant-match ; n'entre jamais dans le
 * pronostic chiffré ni dans la mise (cf. README, section moteur).
 */
import { ref, computed, watch } from 'vue';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { matchNotesApi } from '@/services/matchNotesApi.js';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { formatDateTime } from '@/utils/format.js';

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
</script>

<template>
  <section class="team-news">
    <header class="team-news__head">
      <span class="team-news__title">Actualités d'équipe</span>
      <span class="team-news__source">d'après FotMob, gratuit</span>
    </header>

    <div v-if="newsLoading" class="cm-text-muted team-news__loading">Recherche des blessures et suspensions…</div>

    <div v-else-if="equipes.length" class="team-news__teams">
      <div v-for="e in equipes" :key="e.cle" class="team-news__team">
        <p class="team-news__team-name cm-truncate">{{ e.nom }}</p>
        <p v-if="e.actu.coachChange" class="team-news__coach">
          <AppIcon name="info" :size="13" />
          Changement d'entraîneur : {{ e.actu.coachChange.previousCoach }} → {{ e.actu.coachChange.currentCoach }}
          <span v-if="e.actu.coachChange.since" class="cm-text-muted">(dernier match connu avec l'ancien, le {{ formatDateTime(e.actu.coachChange.since) }})</span>
        </p>
        <ul v-if="e.actu.longTermAbsences?.length" class="team-news__absences">
          <li v-for="a in e.actu.longTermAbsences" :key="a.name">
            <span class="team-news__absence-tag" :class="`team-news__absence-tag--${a.type}`">{{ libelleType(a.type) }}</span>
            <span class="cm-truncate">{{ a.name }}</span>
            <span v-if="a.expectedReturn" class="cm-text-muted">— retour {{ a.expectedReturn }}</span>
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="cm-text-muted team-news__empty">
      Rien signalé par FotMob pour l'instant — jamais la preuve qu'il ne se passe rien, seulement que rien n'est publié.
    </p>

    <div class="team-news__note">
      <label class="team-news__note-label" for="team-news-note">
        Note pour l'IA <span class="cm-text-muted">— vestiaire, rumeur, finances du club… ce qu'aucune donnée ne capture</span>
      </label>
      <textarea
        id="team-news-note"
        v-model="noteText"
        class="team-news__textarea"
        rows="3"
        placeholder="Écris ici ce que tu sais et qui ne figure dans aucune statistique…"
        :disabled="!noteLoaded"
      />
      <div class="team-news__note-actions">
        <span class="cm-text-muted team-news__note-hint">
          <template v-if="noteSaving">Enregistrement…</template>
          <template v-else-if="noteChanged">Modifiée, pas encore enregistrée.</template>
          <template v-else-if="noteSavedAt">Enregistrée le {{ formatDateTime(noteSavedAt) }}.</template>
        </span>
        <AppButton variant="ghost" size="sm" :loading="noteSaving" :disabled="!noteChanged" @click="enregistrerNote">
          <template #icon><AppIcon name="check" :size="13" /></template>
          Enregistrer la note
        </AppButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.team-news {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
}

.team-news__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.team-news__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.team-news__source {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.team-news__loading,
.team-news__empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.team-news__teams {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.team-news__team-name {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.team-news__coach {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.team-news__coach :deep(svg) {
  flex: none;
  margin-top: 2px;
}

.team-news__absences {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-news__absences li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.team-news__absence-tag {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.team-news__absence-tag--blessure {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.team-news__absence-tag--suspension {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.team-news__note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.team-news__note-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.team-news__textarea {
  width: 100%;
  resize: vertical;
  min-height: 60px;
  padding: 8px 10px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.45;
}

.team-news__textarea:disabled {
  opacity: 0.6;
}

.team-news__note-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.team-news__note-hint {
  font-size: 11px;
}
</style>
