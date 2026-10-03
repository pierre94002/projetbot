<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { aUneFiche } from '@/utils/playerVisuals.js';

/**
 * Buteurs, passeurs et clean sheets d'une compétition.
 *
 * Une seule colonne de valeur, nommée selon la liste affichée : la structure
 * du tableau est la même dans les trois cas, seul l'intitulé change. En
 * séparer trois composants aurait triplé le même balisage.
 *
 * Les minutes sont montrées à côté du total parce qu'elles le qualifient :
 * sept buts en 386 minutes et sept buts en 630 minutes ne disent pas la même
 * chose, et c'est exactement ce qu'un classement de buteurs masque.
 */
const props = defineProps({
  kind: { type: String, default: 'scorers' }, // scorers | assists | cleanSheets
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  league: { type: String, default: null } // pour retrouver le logo d'un club sans identifiant
});

const LABELS = {
  scorers: { value: 'Buts', empty: 'Aucun buteur relevé' },
  assists: { value: 'PD', empty: 'Aucune passe décisive relevée' },
  cleanSheets: { value: 'CS', empty: 'Aucun clean sheet relevé' }
};

const label = computed(() => LABELS[props.kind] ?? LABELS.scorers);
const perMatch = (row) => (row.played > 0 ? (row.value / row.played).toFixed(2) : '—');

// Présentation (refonte du 02/10/2026) : l'intitulé long de la colonne de
// valeur, en info-bulle de son en-tête abrégé.
const TITRES = { scorers: 'Buts marqués', assists: 'Passes décisives', cleanSheets: 'Clean sheets (matchs sans but encaissé)' };
const titreValeur = computed(() => TITRES[props.kind] ?? TITRES.scorers);
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération du classement…" />
  <EmptyState v-else-if="error" icon="alert" title="Classement indisponible" :description="error" />
  <EmptyState v-else-if="rows.length === 0" icon="matches" :title="label.empty" />

  <!-- Le classement, sur le dessin commun des tableaux : rang gris, drapeau et
       nom du joueur en gras, logo et club en retrait, le total en couleur de
       section. L'en-tête reste collé en haut quand la liste défile. -->
  <div v-else class="leaders">
    <div class="cm-table-wrap leaders__wrap">
      <table class="cm-table leaders__table">
        <!-- Les largeurs sont posées sur l'en-tête (table-layout: fixed) : le
             joueur et le club sont élastiques, les chiffres gardent leur place. -->
        <thead>
          <tr>
            <th class="is-center leaders__col-rank" title="Rang">#</th>
            <th class="is-left">Joueur</th>
            <th class="is-left leaders__col-team"><span class="leaders__team-label">Équipe</span></th>
            <th class="leaders__col-played" title="Matchs joués">J</th>
            <th class="leaders__col-min" title="Minutes jouées">Min</th>
            <th class="leaders__col-avg" title="Moyenne par match joué">⌀</th>
            <th class="leaders__col-value" :title="titreValeur">{{ label.value }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.playerId" class="leaders-row">
            <td class="is-center leaders__rank cm-numeric">{{ index + 1 }}</td>
            <td class="is-left">
              <span class="leaders__cell leaders__player">
                <PlayerFlag :code="row.countryCode ?? null" :name="row.countryName ?? null" :player-id="row.playerId ?? null" :size="16" />
                <RouterLink v-if="aUneFiche(row.playerId)" :to="`/joueur/${row.playerId}`" class="leaders__link cm-truncate">{{ row.name }}</RouterLink>
                <span v-else class="leaders__name cm-truncate">{{ row.name }}</span>
              </span>
            </td>
            <td class="is-left">
              <span class="leaders__cell leaders__team">
                <TeamCrest v-if="row.team" :name="row.team" :league="league" :team-id="row.teamId ?? null" :size="20" />
                <span class="cm-truncate leaders__team-name">{{ row.team }}</span>
              </span>
            </td>
            <td class="cm-numeric">{{ row.played }}</td>
            <td class="cm-numeric cm-text-muted leaders__col-min">{{ row.minutes }}</td>
            <td class="cm-numeric cm-text-muted leaders__col-avg">{{ perMatch(row) }}</td>
            <td class="cm-numeric is-strong leaders__value">{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.leaders {
  /* Se règle sur SA largeur : fenêtre du classement (≈ 480 px) ou page. */
  container: leaders / inline-size;
}

/* La liste défile dans son cadre, l'en-tête collant en haut. */
.leaders__wrap {
  max-height: 60vh;
  overflow-y: auto;
}

/* Colonnes fixes : le joueur et le club sont élastiques et se tronquent,
   les chiffres gardent leur place. */
.leaders__table {
  table-layout: fixed;
}

th.leaders__col-rank {
  width: 38px;
}

th.leaders__col-team {
  width: 32%;
}

th.leaders__col-played {
  width: 42px;
}

th.leaders__col-min {
  width: 58px;
}

th.leaders__col-avg {
  width: 52px;
}

th.leaders__col-value {
  width: 56px;
}

/* Le rang : gris, centré (la règle commune aligne la première colonne à gauche). */
th.leaders__col-rank,
.leaders__rank {
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* Drapeau (joueur) ou logo (club), puis le nom, tronqué au besoin. */
.leaders__cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.leaders__player {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.leaders__team {
  color: var(--cm-text-secondary);
}

.leaders__link,
.leaders__name {
  flex: 1 1 auto;
  min-width: 0;
}

.leaders__link {
  color: inherit;
  text-decoration: none;
  transition: color var(--cm-transition);
}

.leaders__link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

.leaders__team-name {
  flex: 1 1 auto;
  min-width: 0;
}

/* La colonne décisive : le total, en couleur de section. */
.leaders__value {
  color: var(--cm-section);
  font-size: 13.5px;
  font-weight: 800;
}

/* Panneau étroit (fenêtre du classement) : le logo seul dit le club (son nom
   au survol), la place va au nom du joueur. */
@container leaders (max-width: 520px) {
  .leaders__table th,
  .leaders__table td {
    padding: 8px 7px;
    font-size: 12px;
  }

  th.leaders__col-team {
    width: 36px;
  }

  .leaders__team-name {
    display: none;
  }

  .leaders__team-label {
    visibility: hidden;
  }
}

/* Très étroit (téléphone) : les minutes et la moyenne sont les premières à
   sauter, le nom et le total sont ce qu'on vient chercher. */
@container leaders (max-width: 420px) {
  .leaders__col-min,
  .leaders__col-avg {
    display: none;
  }

  th.leaders__col-rank {
    width: 32px;
  }

  th.leaders__col-played {
    width: 36px;
  }

  th.leaders__col-value {
    width: 48px;
  }
}
</style>
