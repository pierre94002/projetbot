<script setup>
import { computed, useSlots } from 'vue';
import { RouterLink } from 'vue-router';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import MatchResultBadge from '@/components/matches/MatchResultBadge.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { tour } from '@/utils/fotmobLabels.js';

/**
 * Une rencontre, dessinée pareil dans toute l'appli — demande de Pierre le
 * 01/10/2026, sur le calendrier d'une équipe : « fais-moi ce design partout
 * où il y a des rencontres ». La date en bloc à gauche, les deux clubs face
 * à face avec leur logo (le club qui reçoit à gauche), l'heure — ou le score
 * — au centre, la compétition à droite ; toute la carte ouvre le match.
 *
 * `match` : { date, commenceTime, league, round, homeName, awayName, homeId,
 *   awayId, homeGoals, awayGoals, status ('scheduled'|'live'|'finished'|
 *   'postponed'), side ('home'|'away' : le club du point de vue duquel on
 *   lit, discret, avec son résultat V/N/D), hasOdds, postponedFrom }.
 * `to` : la page ouverte au clic (lien) ; sinon `clickable` émet `select`.
 * `dateDisplay` : 'block' (date à gauche) ou 'none' (liste déjà rangée par
 *   jour : l'heure suffit). `teamLinks` : les noms ouvrent la page du club.
 * Emplacements : `info` (remplace la compétition), `aside` (à droite :
 * cotes, chiffres d'un joueur…), `home-extra` / `away-extra` (sous un nom).
 * Favoris (03/10/2026) : un club favori porte son étoile dorée (sauf le club
 * dont on lit la page, `side` : elle se répéterait sur chaque carte) ;
 * `favoriteToggles` en fait un bouton, et montre au survol l'étoile des
 * autres clubs pour les ajouter.
 */
const props = defineProps({
  match: { type: Object, required: true },
  to: { type: [String, Object], default: null },
  clickable: { type: Boolean, default: false },
  variant: { type: String, default: 'row' }, // 'row' | 'compact'
  dateDisplay: { type: String, default: 'block' }, // 'block' | 'none'
  showCompetition: { type: Boolean, default: true },
  teamLinks: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  favoriteToggles: { type: Boolean, default: false }
});
const emit = defineEmits(['select']);
const slots = useSlots();
const teamStatsModalStore = useTeamStatsModalStore();

const m = computed(() => props.match);
const avecScore = computed(() => m.value.homeGoals !== null && m.value.homeGoals !== undefined && m.value.awayGoals !== null && m.value.awayGoals !== undefined);
const statut = computed(() => m.value.status ?? (avecScore.value ? 'finished' : 'scheduled'));

// Un match à heure connue la porte (ISO) ; un match du calendrier, son jour seulement (midi UTC).
const instant = computed(() => (m.value.commenceTime ? new Date(m.value.commenceTime) : m.value.date ? new Date(`${m.value.date}T12:00:00Z`) : null));
const heureConnue = computed(() => Boolean(m.value.commenceTime) && !String(m.value.commenceTime).endsWith('T12:00:00Z'));
const format = (options) => (instant.value ? new Intl.DateTimeFormat('fr-FR', { ...options, ...(heureConnue.value ? {} : { timeZone: 'UTC' }) }).format(instant.value) : '');
const jourSemaine = computed(() => format({ weekday: 'short' }).replace('.', '').toUpperCase());
const jour = computed(() => format({ day: 'numeric' }));
const mois = computed(() => format({ month: 'short' }).replace('.', '').toUpperCase());
const annee = computed(() => {
  if (!instant.value) return null;
  const y = heureConnue.value ? instant.value.getFullYear() : instant.value.getUTCFullYear();
  return y !== new Date().getFullYear() ? String(y) : null;
});
const heure = computed(() => (heureConnue.value ? format({ hour: '2-digit', minute: '2-digit' }) : null));

const centre = computed(() => {
  if (statut.value === 'postponed') return { texte: 'Reporté', classe: 'is-postponed' };
  if (avecScore.value) return { texte: `${m.value.homeGoals} - ${m.value.awayGoals}`, classe: statut.value === 'live' ? 'is-live' : 'is-score' };
  return { texte: heure.value ?? '—', classe: heure.value ? '' : 'is-unknown' };
});

const resultat = computed(() => {
  if (!avecScore.value || !m.value.side || statut.value === 'live') return null;
  const pour = m.value.side === 'home' ? m.value.homeGoals : m.value.awayGoals;
  const contre = m.value.side === 'home' ? m.value.awayGoals : m.value.homeGoals;
  return pour > contre ? 'V' : pour < contre ? 'D' : 'N';
});

const manche = computed(() => (m.value.round ? tour(m.value.round, m.value.league) : null));

const etiquette = computed(() => {
  if (statut.value === 'postponed') return { texte: 'Reporté', classe: 'is-reporte', titre: 'Reporté, nouvelle date à venir' };
  if (m.value.postponedFrom && !avecScore.value) {
    return { texte: 'Reprogrammé', classe: 'is-reprogramme', titre: `Reporté du ${String(m.value.postponedFrom).split('-').reverse().join('/')}` };
  }
  if (m.value.hasOdds && !avecScore.value) return { texte: 'Coté', classe: 'is-cote', titre: 'Des cotes de bookmakers sont relevées pour ce match' };
  return null;
});

const equipes = computed(() => [
  { cote: 'home', nom: m.value.homeName, id: m.value.homeId ?? null, club: m.value.side === 'home' },
  { cote: 'away', nom: m.value.awayName, id: m.value.awayId ?? null, club: m.value.side === 'away' }
]);

const balise = computed(() => (props.to ? RouterLink : 'div'));
const attributs = computed(() => {
  if (props.to) return { to: props.to };
  if (props.clickable) return { role: 'button', tabindex: 0 };
  return {};
});
const estCliquable = computed(() => Boolean(props.to) || props.clickable);

function choisir() {
  if (!props.to && props.clickable) emit('select');
}

function ouvrirEquipe(nom) {
  teamStatsModalStore.openFor(nom, m.value.league ?? null, m.value.matchId ?? null);
}

const avecInfo = computed(() => props.showCompetition || Boolean(slots.info));

// Favoris : l'identifiant du club s'il est donné, sinon demandé (cf. teamIds.js).
const favoris = useFavoritesStore();
const estFavori = (equipe) => favoris.isFavoriteTeam(equipe.nom, m.value.league ?? null, equipe.id ?? undefined);

function basculerFavori(equipe) {
  favoris.toggleTeam({ name: equipe.nom, league: m.value.league ?? null, id: equipe.id ?? undefined });
}
</script>

<template>
  <component
    :is="balise"
    v-bind="attributs"
    class="mcard"
    :class="[
      `mcard--${variant}`,
      {
        'is-link': estCliquable,
        'is-active': active,
        'is-live': statut === 'live',
        'is-postponed': statut === 'postponed',
        'has-date': dateDisplay === 'block',
        'has-info': avecInfo
      }
    ]"
    @click="choisir"
    @keydown.enter="choisir"
  >
    <div class="mcard__grid">
    <div v-if="dateDisplay === 'block'" class="mcard__date">
      <span class="mcard__weekday">{{ jourSemaine }}</span>
      <span class="mcard__day">{{ jour }}</span>
      <span class="mcard__month">{{ mois }}<template v-if="annee"> {{ annee.slice(2) }}</template></span>
    </div>

    <div class="mcard__match">
      <div class="mcard__side is-home">
        <span class="mcard__name-wrap">
          <span class="mcard__name-line">
            <FavoriteStar
              v-if="favoriteToggles || (estFavori(equipes[0]) && !equipes[0].club)"
              :active="estFavori(equipes[0])"
              :interactive="favoriteToggles"
              :label="equipes[0].nom"
              :size="12"
              class="mcard__fav"
              @toggle="basculerFavori(equipes[0])"
            />
            <button
              v-if="teamLinks"
              type="button"
              class="mcard__name mcard__name--link"
              :class="{ 'is-club': equipes[0].club }"
              :title="`Voir la page de ${equipes[0].nom}`"
              @click.stop.prevent="ouvrirEquipe(equipes[0].nom)"
            >
              {{ equipes[0].nom }}
            </button>
            <span v-else class="mcard__name" :class="{ 'is-club': equipes[0].club }">{{ equipes[0].nom }}</span>
          </span>
          <slot name="home-extra" />
        </span>
        <TeamCrest :name="equipes[0].nom" :league="match.league" :team-id="equipes[0].id" :size="variant === 'compact' ? 24 : 30" />
      </div>
      <div class="mcard__center">
        <span v-if="statut === 'live'" class="mcard__status is-live"><span class="mcard__live-dot" />Direct</span>
        <span class="mcard__pill" :class="centre.classe">{{ centre.texte }}</span>
        <span v-if="dateDisplay === 'none' && statut === 'finished' && !avecScore" class="mcard__status">Terminé</span>
      </div>
      <div class="mcard__side is-away">
        <TeamCrest :name="equipes[1].nom" :league="match.league" :team-id="equipes[1].id" :size="variant === 'compact' ? 24 : 30" />
        <span class="mcard__name-wrap">
          <span class="mcard__name-line">
            <button
              v-if="teamLinks"
              type="button"
              class="mcard__name mcard__name--link"
              :class="{ 'is-club': equipes[1].club }"
              :title="`Voir la page de ${equipes[1].nom}`"
              @click.stop.prevent="ouvrirEquipe(equipes[1].nom)"
            >
              {{ equipes[1].nom }}
            </button>
            <span v-else class="mcard__name" :class="{ 'is-club': equipes[1].club }">{{ equipes[1].nom }}</span>
            <FavoriteStar
              v-if="favoriteToggles || (estFavori(equipes[1]) && !equipes[1].club)"
              :active="estFavori(equipes[1])"
              :interactive="favoriteToggles"
              :label="equipes[1].nom"
              :size="12"
              class="mcard__fav"
              @toggle="basculerFavori(equipes[1])"
            />
          </span>
          <slot name="away-extra" />
        </span>
      </div>
    </div>

    <div v-if="avecInfo" class="mcard__info">
      <slot name="info">
        <LeagueBadge v-if="match.league" :league="match.league" />
        <span v-if="manche" class="mcard__round">{{ manche }}</span>
      </slot>
    </div>

    <div class="mcard__aside">
      <slot name="aside">
        <span v-if="etiquette" class="mcard__tag" :class="etiquette.classe" :title="etiquette.titre">{{ etiquette.texte }}</span>
        <MatchResultBadge v-if="resultat" :result="resultat" />
      </slot>
      <span v-if="estCliquable" class="mcard__chevron">›</span>
    </div>
    </div>
  </component>
</template>

<style scoped>
.mcard {
  /* Colonne de droite à largeur fixe : les colonnes restent alignées d'une carte à l'autre. */
  --mcard-aside: 112px;
  /* La carte se règle sur SA largeur, pas sur celle de l'écran : la même
     rencontre tient dans une page comme dans un panneau latéral étroit. */
  container: mcard / inline-size;
  display: block;
  padding: 10px 14px;
  border-radius: var(--cm-radius-md, 12px);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt, rgba(255, 255, 255, 0.02));
  color: inherit;
  text-decoration: none;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.mcard__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--mcard-aside);
  align-items: center;
  gap: 16px;
}

.mcard.has-date .mcard__grid {
  grid-template-columns: 52px minmax(0, 1fr) var(--mcard-aside);
}

.mcard.has-info .mcard__grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 220px) var(--mcard-aside);
}

.mcard.has-date.has-info .mcard__grid {
  grid-template-columns: 52px minmax(0, 1fr) minmax(0, 220px) var(--mcard-aside);
}

.mcard--compact {
  --mcard-aside: 78px;
  padding: 8px 12px;
}

.mcard--compact .mcard__grid {
  gap: 12px;
}

.mcard--compact.has-date .mcard__grid {
  grid-template-columns: 44px minmax(0, 1fr) var(--mcard-aside);
}

.mcard--compact.has-date.has-info .mcard__grid {
  grid-template-columns: 44px minmax(0, 1fr) minmax(0, 140px) var(--mcard-aside);
}

.mcard.is-link {
  cursor: pointer;
}

.mcard.is-link:hover,
.mcard.is-active {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  background: var(--cm-surface-hover);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.mcard.is-live {
  border-color: rgba(248, 113, 113, 0.45);
}

.mcard.is-postponed {
  opacity: 0.75;
}

/* ------------------------------------------------------------ date */
.mcard__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.05;
  padding: 4px 0;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
}

.mcard__weekday,
.mcard__month {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.mcard__day {
  font-size: 19px;
  font-weight: 800;
  color: var(--cm-text-primary);
  margin: 1px 0;
}

.mcard--compact .mcard__day {
  font-size: 16px;
}

/* ----------------------------------------------------------- match */
.mcard__match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mcard__side {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mcard__side.is-home {
  justify-content: flex-end;
}

.mcard--compact .mcard__side {
  gap: 7px;
}

.mcard__name-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mcard__side.is-home .mcard__name-wrap {
  align-items: flex-end;
  text-align: right;
}

.mcard__name {
  max-width: 100%;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcard--compact .mcard__name {
  font-size: 12.5px;
}

/* Le nom et l'étoile de favori, côte à côte ; le nom garde ses points de suspension. */
.mcard__name-line {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

.mcard__name-line .mcard__name {
  min-width: 0;
}

/* L'étoile d'un club : dorée et toujours là pour un favori ; pour les
   autres, invisible tant qu'on ne survole pas la carte (place gardée, rien
   ne bouge). */
.mcard .mcard__fav {
  width: 20px;
  height: 20px;
}

.mcard .mcard__fav:not(.is-on) {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--cm-transition), background var(--cm-transition), color var(--cm-transition);
}

.mcard:hover .mcard__fav,
.mcard:focus-within .mcard__fav {
  opacity: 1;
  pointer-events: auto;
}

/* Le club de la page reste discret ; l'adversaire ressort. */
.mcard__name.is-club {
  color: var(--cm-text-secondary);
  font-weight: 600;
}

.mcard__name--link {
  border: 0;
  padding: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
  text-align: inherit;
}

.mcard__name--link:hover {
  color: var(--cm-accent);
  text-decoration: underline;
}

.mcard__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.mcard__pill {
  min-width: 58px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mcard--compact .mcard__pill {
  min-width: 46px;
  padding: 3px 6px;
  font-size: 12px;
}

.mcard__pill.is-score {
  background: var(--cm-text-primary);
  color: var(--cm-bg, #0b0f17);
  font-weight: 800;
  letter-spacing: 0.5px;
}

.mcard__pill.is-live {
  background: var(--cm-danger);
  color: #fff;
  font-weight: 800;
}

.mcard__pill.is-unknown {
  color: var(--cm-text-muted);
  font-weight: 500;
}

.mcard__pill.is-postponed {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 11.5px;
}

.mcard__status {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mcard__status.is-live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--cm-danger);
}

.mcard__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: mcard-pulse 1.4s ease-in-out infinite;
}

@keyframes mcard-pulse {
  50% {
    opacity: 0.3;
  }
}

/* ------------------------------------------------- compétition, côté */
.mcard__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.mcard__round {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.mcard__aside {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.mcard__chevron {
  font-size: 20px;
  line-height: 1;
  color: var(--cm-text-muted);
}

.mcard.is-link:hover .mcard__chevron {
  color: var(--cm-section);
}

.mcard__tag {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.mcard__tag.is-cote {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.mcard__tag.is-reporte {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.mcard__tag.is-reprogramme {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

/* Carte moyenne : la compétition passe sous les équipes. */
@container mcard (max-width: 620px) {
  .mcard.has-info .mcard__grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .mcard.has-date.has-info .mcard__grid {
    grid-template-columns: 48px minmax(0, 1fr) auto;
  }

  .mcard.has-info .mcard__info {
    grid-row: 2;
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .mcard.has-date.has-info .mcard__info {
    grid-column: 2 / -1;
  }
}

/* Carte étroite (panneau latéral) : les deux équipes l'une sous l'autre,
   l'heure ou le score à droite, comme FotMob sur un téléphone. */
@container mcard (max-width: 380px) {
  .mcard__grid,
  .mcard.has-date .mcard__grid,
  .mcard--compact.has-date .mcard__grid {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .mcard.has-date .mcard__grid,
  .mcard--compact.has-date .mcard__grid {
    grid-template-columns: 40px minmax(0, 1fr) auto;
  }

  .mcard .mcard__info {
    display: none;
  }

  .mcard__match {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'home centre'
      'away centre';
    row-gap: 5px;
  }

  .mcard__side.is-home {
    grid-area: home;
    flex-direction: row-reverse;
    justify-content: flex-end;
  }

  .mcard__side.is-away {
    grid-area: away;
  }

  .mcard__center {
    grid-area: centre;
  }

  .mcard__side.is-home .mcard__name-wrap {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
