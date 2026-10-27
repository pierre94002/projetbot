<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { simulationApi } from '@/services/simulationApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { finDeSaisonDite, LEGENDE_DES_EXTREMES, LEGENDE_UNANIME } from '@/utils/simulation.js';

/**
 * L'ONGLET « FIN DE SAISON » d'un classement (étape 28 du plan, 27/10/2026 ; DESIGN.md § 5) — dans LeagueStandingsPanel,
 * après « Classement » et « Corrigé par les xG », seulement quand Réglages l'a allumé et jamais pour une coupe.
 * Il LIT ce que la passe de nuit a rangé (GET /api/simulation/saison?league=) : 10 000 fins de saison simulées à partir du
 * classement officiel FotMob et des rencontres restantes. Rien n'est calculé à l'ouverture.
 *   - l'ordre OFFICIEL de la table, jamais réordonné ; un favori en or (fond doré léger, étoile) ; le logo de CHAQUE club ;
 *   - une colonne par famille présente (1re place, Europe, promotion, barrage, phase finale, descente…) ; au point près
 *     entre 10 et 90 %, « ≥ 90 % » et « ≤ 10 % » au-delà ; gris « acquis sauf surprise » à 10 000 sur 10 000 ;
 *   - la provenance réelle avec l'heure (la nuit, le relevé du classement, les rencontres restantes, la loi) ; la loi
 *     employée dite dans les trois cas (forces du modèle en essai, en service, ou classement seul — avec son avertissement) ;
 *   - « Mesuré sur les saisons 2023-2026 … pas encore sur la saison en cours » ; la scission, le départage simplifié, les
 *     pénalités (« −8 pts ») ;
 *   - non calculée : la raison (« 2 clubs non reconnus : … »).
 * Aucun vert : rien ici n'est une value ; la couleur des favoris est l'or.
 */
const props = defineProps({
  league: { type: String, required: true }
});

const etat = ref({ loading: false, error: null, data: null });
const favoris = useFavoritesStore();

async function charger() {
  const ligue = props.league;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await simulationApi.saison(ligue);
    if (props.league !== ligue) return;
    etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.league !== ligue) return;
    etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(() => props.league, charger);

const dit = computed(() => (etat.value.data ? finDeSaisonDite(etat.value.data) : null));
const plusieursTables = computed(() => (dit.value?.tables?.length ?? 0) > 1);
const avecUnanime = computed(() => (dit.value?.tables ?? []).some((t) => t.lignes.some((l) => l.cellules.some((c) => c.gris && c.texte === 'acquis sauf surprise'))));
const estFavori = (l) => favoris.isFavoriteTeam(l.nom, props.league, l.teamId ?? undefined);
</script>

<template>
  <div class="fds" data-bloc="fin-de-saison">
    <LoadingSpinner v-if="etat.loading && !etat.data" label="Lecture de la fin de saison simulée…" />
    <EmptyState v-else-if="etat.error" icon="alert" title="Fin de saison illisible" :description="`${etat.error} — rien n’est calculé à l’ouverture : la fin de saison se relit à la prochaine visite.`" />
    <EmptyState v-else-if="dit && dit.etat === 'non-calcule'" icon="info" :title="dit.titre" :description="dit.raison" />

    <template v-else-if="dit && dit.etat === 'calcule'">
      <!-- La provenance réelle, avec l'heure de la nuit ; le détail (relevé, rencontres restantes, loi) écrit dessous. -->
      <div class="fds__entete">
        <ProvenanceChip :source="dit.provenance.source" :releve-le="dit.provenance.calculeLe" action="calculé" :detail="dit.provenance.detail" />
        <HelpTip terme="fin-de-saison" />
      </div>
      <p v-if="dit.provenance.detail" class="fds__detail">{{ dit.provenance.detail }}</p>

      <!-- La loi employée : avertie quand c'est le classement seul (trop sûr de lui sur 2023-2026). -->
      <p v-if="dit.loi.avertissement" class="cm-note is-warning fds__loi" data-loi="table">
        <AppIcon name="alert" :size="14" />
        <span>{{ dit.loi.phrase }}.<template v-if="dit.loi.pourquoi"> Pourquoi : {{ dit.loi.pourquoi }}.</template></span>
      </p>
      <p v-else class="fds__loi-texte" data-loi="forces">
        <AppIcon name="layers" :size="12" />
        <span>{{ dit.loi.phrase }}.</span>
      </p>
      <p class="fds__mesure"><AppIcon name="history" :size="12" /><span>{{ dit.mesure }}</span></p>
      <p v-if="dit.mentions.length" class="fds__mentions">
        <span v-for="m in dit.mentions" :key="m" class="cm-chip">{{ m }}</span>
      </p>

      <section v-for="t in dit.tables" :key="t.nom" class="fds__table-bloc">
        <h4 v-if="plusieursTables" class="cm-group-title fds__table-titre">{{ t.nom }}</h4>
        <div class="cm-table-wrap fds__wrap">
          <table class="cm-table fds__table" data-tableau="fin-de-saison">
            <thead>
              <tr>
                <th class="is-center fds__col-rang" title="Rang au classement officiel">#</th>
                <th class="is-left">Équipe</th>
                <th class="fds__col-pts" title="Points au classement officiel (pénalités comprises)">Pts</th>
                <th v-for="f in t.familles" :key="f.cle" class="fds__col-famille" :title="`Chance de finir dans cette zone : ${f.libelle}`">{{ f.libelle }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in t.lignes" :key="l.teamId ?? l.nom" class="fds__ligne" :class="{ 'is-favorite': estFavori(l) }">
                <td class="is-center cm-numeric fds__rang">{{ l.rang ?? '—' }}</td>
                <td class="is-left fds__equipe">
                  <span class="fds__equipe-dedans">
                    <TeamCrest :name="l.nom" :league="league" :team-id="l.teamId" :size="20" />
                    <span class="fds__nom cm-truncate">{{ l.nom }}</span>
                    <FavoriteStar v-if="estFavori(l)" active :interactive="false" :size="11" :label="l.nom" />
                    <span v-if="l.penalite" class="fds__penalite" :title="`Pénalité de la fédération : ${l.penalite}, déjà retirés des points`">{{ l.penalite }}</span>
                  </span>
                </td>
                <td class="cm-numeric is-strong">{{ l.points ?? '—' }}</td>
                <td v-for="c in l.cellules" :key="c.cle" class="cm-numeric fds__case" :class="{ 'is-gris': c.gris }" :title="c.titre">{{ c.texte }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="fds__legende">
        <span class="cm-chip fds__legende-chip">{{ LEGENDE_DES_EXTREMES }}</span>
        <span v-if="avecUnanime" class="cm-chip fds__legende-chip">{{ LEGENDE_UNANIME }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fds {
  container: fds / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fds__entete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.fds__detail,
.fds__mesure,
.fds__loi-texte {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.fds__loi-texte {
  color: var(--cm-text-secondary);
}

.fds__mesure :deep(svg),
.fds__loi-texte :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.fds__loi {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.fds__mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.fds__table-bloc {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fds__table-titre {
  margin: 4px 0 0;
}

.fds__table {
  table-layout: auto;
}

th.fds__col-rang {
  width: 34px;
}

th.fds__col-pts {
  width: 44px;
}

th.fds__col-famille {
  white-space: nowrap;
}

.fds__rang {
  color: var(--cm-text-muted);
}

.fds__equipe-dedans {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fds__nom {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.fds__penalite {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(var(--cm-danger-rgb) / 0.35);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--cm-danger);
  white-space: nowrap;
}

.fds__case {
  white-space: nowrap;
  font-weight: 600;
  color: var(--cm-text-primary);
}

/* « Acquis sauf surprise » (10 000 sur 10 000), et les cases sans probabilité : en gris, jamais un « 100 % ». */
.fds__case.is-gris {
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* Un favori : fond doré léger (DESIGN.md § 5 : l'or, jamais la couleur de section) ; l'ordre ne bouge pas. */
.fds__ligne.is-favorite > td {
  background-color: rgba(var(--cm-gold-rgb) / 0.07);
}

.fds__legende {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fds__legende-chip {
  white-space: normal;
  line-height: 1.45;
}

@container fds (max-width: 520px) {
  .fds__case {
    font-size: 11.5px;
  }
}
</style>
