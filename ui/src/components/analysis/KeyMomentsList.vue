<script setup>
/**
 * Les MOMENTS CLÉS d'un match joué (étape 45 du plan, 24/10/2026), sur la page du match (onglet Résumé) : les buts avec le score qui
 * suit, les penalties manqués, les expulsions (l'équipe « à dix ») et les remplacements sur blessure — tirés du déroulé que l'étape 43
 * a appris à lire pour la revue d'après-match de l'IA. Les jaunes et les remplacements ordinaires restent dans le fil du match.
 *
 * Tout est LU (GET /api/match-stats/:matchId/deroule, la même fonction que celle de l'IA sur les événements déjà rangés au magasin) :
 * rien n'est calculé à l'ouverture, aucun appel à FotMob ni à Claude. La carte reste TOUJOURS affichée, tableau compris (Σ et ⌀), même
 * sans moment : ce qu'on ne sait pas se DIT (déroulé non publié, seuls les buts publiés, lecture d'avant l'étape 43), jamais « aucun but ».
 * Le logo du club sur chaque ligne, le drapeau de chaque joueur nommé. Les mots viennent de utils/momentsCles.js (pur, rejoué par
 * server/test/momentsClesEcran.test.mjs sur les vraies réponses de la route).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { GENRES_DE_MOMENT, INTRO_DES_MOMENTS, etatDesMoments, momentsCles, nombreDit } from '@/utils/momentsCles.js';
import { idDuJoueur, indexDesJoueurs } from '@/utils/joueursDuMatch.js';

const props = defineProps({
  /** L'identifiant du match (celui de l'adresse de la page). */
  matchId: { type: String, default: null },
  homeName: { type: String, default: '' },
  awayName: { type: String, default: '' },
  league: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  /** La feuille du match { home: [{ playerId, name }], away: [...] } : pour retrouver le drapeau de chaque joueur nommé. */
  players: { type: Object, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const id = props.matchId;
  if (!id) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.deroule(id);
    // Une réponse arrivée après un changement de match est ignorée.
    if (props.matchId === id) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.matchId === id) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(
  () => props.matchId,
  (apres, avant) => {
    if (apres === avant) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

const lu = computed(() => etatDesMoments({ chargement: etat.value.loading, erreur: etat.value.error, reponse: etat.value.data, matchId: props.matchId }));
const moments = computed(() => momentsCles(etat.value.data));
const index = computed(() => indexDesJoueurs(props.players));
const nomDe = (camp) => (camp === 'home' ? props.homeName || etat.value.data?.home?.name : props.awayName || etat.value.data?.away?.name) ?? '';
const idDe = (camp) => (camp === 'home' ? props.homeId ?? etat.value.data?.home?.id ?? null : props.awayId ?? etat.value.data?.away?.id ?? null);
const leagueDe = computed(() => props.league ?? etat.value.data?.league ?? null);

/** Les lignes du tableau : le moment, son équipe (logo), le drapeau du joueur nommé. */
const lignes = computed(() =>
  moments.value.moments.map((m) => ({
    ...m,
    icone: GENRES_DE_MOMENT[m.genre]?.icone ?? 'info',
    ton: GENRES_DE_MOMENT[m.genre]?.ton ?? '',
    genreDit: GENRES_DE_MOMENT[m.genre]?.libelle ?? m.genre,
    equipeNom: m.equipe || nomDe(m.camp),
    equipeId: idDe(m.camp),
    joueurId: m.joueur && m.joueurDe ? idDuJoueur(index.value, m.joueurDe, m.joueur) : null
  }))
);

/** Ce que dit la ligne vide : la raison, pas un tiret. */
const phraseVide = computed(() => lu.value.texte?.replace(/ Le tableau ci-dessous reste affiché, sans valeurs\.$/, '') ?? 'Pas de moment clé.');
const comptes = computed(() => moments.value.resume);
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard class="km" icon="clock" eyebrow="Déroulé du match" title="Moments clés" :subtitle="INTRO_DES_MOMENTS" :data-etat="lu.cle" data-bloc="moments-cles">
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="!matchId" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="km__corps">
      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture du déroulé…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text km__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <!-- 1. Les comptes d'un coup d'œil : toujours les quatre, même à zéro. -->
      <div class="km__comptes" data-comptes>
        <span class="cm-chip is-section" data-compte="buts"><AppIcon name="ball" :size="11" />{{ nombreDit(comptes.buts) }} but{{ comptes.buts > 1 ? 's' : '' }}</span>
        <span class="cm-chip" :class="comptes.penaltiesManques ? 'is-warning' : ''" data-compte="penalties-manques"><AppIcon name="x" :size="11" />{{ nombreDit(comptes.penaltiesManques) }} penalty manqué{{ comptes.penaltiesManques > 1 ? 's' : '' }}</span>
        <span class="cm-chip" :class="comptes.expulsions ? 'is-danger' : ''" data-compte="expulsions"><AppIcon name="cards" :size="11" />{{ nombreDit(comptes.expulsions) }} expulsion{{ comptes.expulsions > 1 ? 's' : '' }}</span>
        <span class="cm-chip" :class="comptes.blessures ? 'is-info' : ''" data-compte="blessures"><AppIcon name="userX" :size="11" />{{ nombreDit(comptes.blessures) }} blessure{{ comptes.blessures > 1 ? 's' : '' }}</span>
      </div>

      <!-- 2. Le tableau : toujours là, ses en-têtes, ses lignes, Σ et ⌀. -->
      <div class="cm-table-wrap">
        <table class="cm-table km__table" data-tableau="moments-cles">
          <thead>
            <tr>
              <th class="is-left">Minute</th>
              <th class="is-left">Équipe</th>
              <th class="is-left">Moment</th>
              <th title="Le score après le but">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in lignes" :key="m.cle" :data-genre="m.genre" :data-sous-genre="m.sousGenre">
              <td class="is-left cm-numeric km__minute">{{ m.minuteDite }}</td>
              <td class="is-left">
                <span class="km__equipe"><TeamCrest :name="m.equipeNom" :league="leagueDe" :team-id="m.equipeId" :size="16" /><span>{{ m.equipeNom }}</span></span>
              </td>
              <td class="is-left">
                <span class="km__moment">
                  <span class="cm-icon-box is-sm" :class="m.ton" :title="m.genreDit"><AppIcon :name="m.icone" :size="14" /></span>
                  <span class="km__moment-texte">
                    <strong class="km__titre">{{ m.titre }}<PlayerFlag v-if="m.joueurId" :player-id="m.joueurId" :size="13" /></strong>
                    <small v-if="m.detail" class="km__detail">{{ m.detail }}</small>
                  </span>
                </span>
              </td>
              <td class="cm-numeric is-strong" :title="m.score ? 'Score après le but : domicile - extérieur' : 'Le score ne change pas'">{{ m.score ?? '—' }}</td>
            </tr>
            <tr v-if="!lignes.length">
              <td class="is-left km__vide" colspan="4" data-vide>{{ phraseVide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="3" class="is-strong">{{ moments.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left km__moyenne">⌀ Moyenne</td>
              <td colspan="3" class="km__moyenne">{{ moments.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 3. Ce qu'on ne sait pas. -->
      <ul v-if="moments.notes.length" class="km__notes" data-notes>
        <li v-for="n in moments.notes" :key="n.cle" :data-note="n.cle"><AppIcon name="info" :size="12" /><span>{{ n.texte }}</span></li>
      </ul>

      <!-- 4. D'où vient ce déroulé. -->
      <footer class="km__provenance">
        <ProvenanceChip
          :source="moments.provenance?.source ?? 'FotMob · événements du match rangés au magasin'"
          :releve-le="moments.provenance?.releveLe ?? null"
          action="relevé"
          :fichier="moments.provenance?.fichier ?? null"
          :detail="moments.provenance?.table ? `Table ${moments.provenance.table}.` : null"
          :vieux-apres-heures="null"
          variante="ligne"
        />
      </footer>
    </div>
  </AppCard>
</template>

<style scoped>
.km__corps {
  container: km / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.km__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.km__comptes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.km__table th,
.km__table td {
  font-size: 12.5px;
  white-space: normal;
  vertical-align: middle;
}

.km__minute {
  width: 64px;
  font-weight: 700;
  color: var(--cm-text-primary);
  white-space: nowrap;
}

.km__equipe {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.km__moment {
  display: flex;
  align-items: center;
  gap: 10px;
}

.km__moment-texte {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.km__titre {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.km__detail {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.km__vide {
  color: var(--cm-text-muted);
  white-space: normal;
}

.km__moyenne {
  color: var(--cm-text-secondary);
}

.km__notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.km__notes li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.km__notes :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.km__provenance {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Carte étroite : le tableau défile dans son cadre plutôt que de s'écraser. */
@container km (max-width: 520px) {
  .km__minute {
    width: 52px;
  }
}
</style>
