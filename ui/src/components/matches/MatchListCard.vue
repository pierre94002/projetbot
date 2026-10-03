<script setup>
import AppIcon from '@/components/common/AppIcon.vue';
import MatchCard from './MatchCard.vue';
import FormBadges from './FormBadges.vue';
import { formatOdds, formatShortDay } from '@/utils/format.js';

/**
 * Une rencontre de la liste des matchs : la carte commune (MatchCard) avec ce
 * que la liste y ajoute — la forme sous chaque club, le badge IA, le report,
 * et à droite les cotes 1 / N / 2 (le favori des bookmakers en couleur de
 * section) ou « pas encore coté » ; une étoile à côté de chaque club pour
 * l'ajouter aux favoris. Sortie de MatchesTable le 03/10/2026 : la même ligne
 * sert aux championnats et au bloc « Mes équipes favorites ».
 */
defineProps({
  match: { type: Object, required: true }, // la rencontre de la liste
  carte: { type: Object, required: true }, // la même au format de MatchCard (cf. MatchesTable, versCarte)
  active: { type: Boolean, default: false },
  form: { type: Object, default: null }, // la forme des deux clubs (formByMatchId[matchId])
  hasAi: { type: Boolean, default: false }, // une analyse IA existe pour ce match
  dateDisplay: { type: String, default: 'none' },
  showCompetition: { type: Boolean, default: false }
});

defineEmits(['select']);

// Présentation seulement : le favori des bookmakers (la cote 1X2 la plus
// basse) ressort en couleur de section dans la carte. Rien n'est calculé
// pour le moteur ici ; sans deux cotes valables, personne n'est mis en avant.
function coteFavorite(match) {
  const cotes = [
    ['1', Number(match.marketOdds?.odds1)],
    ['N', Number(match.marketOdds?.oddsDraw)],
    ['2', Number(match.marketOdds?.odds2)]
  ].filter(([, cote]) => Number.isFinite(cote) && cote > 1);
  if (cotes.length < 2) return null;
  return cotes.reduce((meilleure, c) => (c[1] < meilleure[1] ? c : meilleure))[0];
}
</script>

<template>
  <MatchCard
    :match="carte"
    clickable
    :active="active"
    :date-display="dateDisplay"
    :show-competition="showCompetition"
    team-links
    favorite-toggles
    class="match-list__card"
    @select="$emit('select')"
  >
    <template #home-extra>
      <FormBadges v-if="form" :form="form.home?.form" class="match-row__form" />
    </template>
    <template #away-extra>
      <FormBadges v-if="form" :form="form.away?.form" class="match-row__form" />
    </template>
    <template #aside>
      <span v-if="hasAi" class="match-row__ai-badge" title="Analyse IA disponible pour ce match">
        <AppIcon name="bolt" :size="9" />IA
      </span>
      <span
        v-if="match.postponedFrom"
        class="match-row__postponed"
        :title="`Match reporté : il était prévu le ${formatShortDay(match.postponedFrom)}`"
      >
        Reporté du {{ formatShortDay(match.postponedFrom) }}
      </span>
      <!-- Rencontre connue par le calendrier mais pas encore cotée
           (divisions inférieures, Russie, Chine : les bookmakers
           n'ouvrent qu'à l'approche). Trois tirets se liraient comme
           un échec de chargement, d'où la mention explicite. -->
      <span v-if="match.hasOdds === false" class="match-row__odds match-row__odds--none" title="Aucun bookmaker n'a encore publié de cote pour ce match">
        pas encore coté
      </span>
      <!-- Les trois cotes, chacune sous son repère 1 / N / 2 ; le favori en couleur de section. -->
      <span v-else class="match-row__odds" title="Cotes 1 / N / 2">
        <span class="match-row__odd" :class="{ 'is-favori': coteFavorite(match) === '1' }"><i>1</i>{{ formatOdds(match.marketOdds?.odds1) }}</span>
        <span class="match-row__odd match-row__odd--draw" :class="{ 'is-favori': coteFavorite(match) === 'N' }"><i>N</i>{{ formatOdds(match.marketOdds?.oddsDraw) }}</span>
        <span class="match-row__odd" :class="{ 'is-favori': coteFavorite(match) === '2' }"><i>2</i>{{ formatOdds(match.marketOdds?.odds2) }}</span>
      </span>
    </template>
  </MatchCard>
</template>

<style scoped>
/* Cotes, badge IA et report à droite de la carte : colonne assez large. */
.match-list__card {
  --mcard-aside: 236px;
}

.match-row__form {
  flex-shrink: 0;
}

.match-row__ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.match-row__postponed {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.match-row__odds {
  display: inline-flex;
  gap: 5px;
}

.match-row__odds--none {
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border);
  font-size: 10.5px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

/* Une cote : son repère (1, N, 2) en tout petit au-dessus du chiffre. */
.match-row__odd {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 3px 0 4px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
  transition: background var(--cm-transition), color var(--cm-transition);
}

.match-row__odd i {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
}

.match-row__odd--draw {
  color: var(--cm-text-secondary);
}

/* Le favori des bookmakers (la cote la plus basse). */
.match-row__odd.is-favori {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.match-row__odd.is-favori i {
  color: inherit;
  opacity: 0.8;
}

/* Liste étroite (le conteneur `matchlist` de MatchesTable) : la colonne de
   droite à sa largeur naturelle, des cotes plus serrées. */
@container matchlist (max-width: 680px) {
  .match-list__card {
    --mcard-aside: auto;
  }

  .match-row__odd {
    min-width: 40px;
  }
}
</style>
