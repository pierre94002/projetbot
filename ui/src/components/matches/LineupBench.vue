<script setup>
import { computed, reactive } from 'vue';
import { RouterLink } from 'vue-router';
import { retourPrevu } from '@/utils/fotmobLabels.js';
import { aUneFiche, photoJoueur, formatNote, classeNote } from '@/utils/playerVisuals.js';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Sous le terrain, pour une équipe : ses remplaçants, ses absents et les
 * titulaires habituels qui ne sont pas dans le onze, chacun en petite fiche
 * (photo, numéro, poste, note moyenne de la saison) qui ouvre la fiche du
 * joueur — demande de Pierre le 01/10/2026 : « tous les remplaçants marqués
 * aussi proprement ». Remplace, sous le terrain, les lignes de texte gardées
 * pour les panneaux d'analyse IA (cf. AiLineupSnapshot.vue).
 *
 * `team` : une équipe décrite par lineupContext.js (bench, unavailable,
 * usualStartersMissing, lastMatch, startXI).
 *
 * Habillage refait le 02/10/2026 (refonte visuelle, cf. ui/DESIGN.md) :
 * fiches en bloc survolable, liseré rouge pour les absents et ambre pour les
 * titulaires habituels hors de la feuille, note en pastille colorée.
 */
const props = defineProps({
  team: { type: Object, required: true },
  derniere: { type: Boolean, default: false }, // dernière composition alignée, pas celle du match
  titre: { type: Boolean, default: true } // nom de l'équipe en tête (deux équipes affichées)
});

const POSTES = { Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Forward: 'Attaquant' };
const echecs = reactive(new Set());

function sigle(j) {
  if (j.number !== null && j.number !== undefined && j.number !== '') return String(j.number);
  const mots = String(j.name ?? '').replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  return mots.length > 1 ? `${mots[0][0]}${mots.at(-1)[0]}`.toUpperCase() : (mots[0] ?? '?').slice(0, 2).toUpperCase();
}

const ans = (j) => (j.age !== null && j.age !== undefined ? `${j.age} ans` : null);
// `infos` : la seconde ligne de la fiche, morceaux joints par « · ».
const carte = (j, infos, extra = {}) => ({
  id: j.id ?? null,
  name: j.name,
  number: j.number ?? null,
  sigle: sigle(j),
  photo: photoJoueur(j.id),
  countryCode: j.countryCode ?? null,
  countryName: j.countryName ?? null,
  infos: infos.filter(Boolean).join(' · '),
  lien: aUneFiche(j.id) ? { to: `/joueur/${j.id}` } : null,
  ...extra
});

// Titulaires habituels hors du onze : signalés sur leur fiche de remplaçant ou
// d'absent ; seuls ceux qui ne figurent nulle part ont leur propre liste.
const habituelsHorsOnze = computed(() => new Set((props.team.usualStartersMissing ?? []).map((j) => j.name)));
const remplacants = computed(() =>
  (props.team.bench ?? []).map((j) =>
    carte(j, [POSTES[j.position], ans(j)], {
      note: formatNote(j.stats?.rating),
      classe: classeNote(j.stats?.rating),
      habituel: habituelsHorsOnze.value.has(j.name)
    })
  )
);
const absents = computed(() =>
  (props.team.unavailable ?? []).map((a) =>
    carte(a, [ans(a), a.reason, a.expectedReturn ? `retour ${retourPrevu(a.expectedReturn)}` : null], {
      habituel: habituelsHorsOnze.value.has(a.name)
    })
  )
);
const habituels = computed(() => {
  const ailleurs = new Set([...(props.team.bench ?? []), ...(props.team.unavailable ?? [])].map((j) => j.name));
  return (props.team.usualStartersMissing ?? [])
    .filter((j) => !ailleurs.has(j.name))
    .map((j) => carte(j, [ans(j), `${j.starts} titularisation${j.starts > 1 ? 's' : ''}`, j.status]));
});

const blocs = computed(() =>
  [
    { cle: 'banc', titre: 'Remplaçants', cartes: remplacants.value },
    { cle: 'absents', titre: 'Absents', cartes: absents.value },
    { cle: 'habituels', titre: 'Titulaires habituels hors de la feuille', cartes: habituels.value }
  ].filter((b) => b.cartes.length)
);

// Un titulaire que FotMob dit indisponible pour ce match.
const contradiction = computed(() => {
  const noms = new Set((props.team.unavailable ?? []).map((a) => a.name));
  return (props.team.startXI ?? []).some((j) => noms.has(j.name));
});

const jourDuMatch = (m) => new Date(`${m.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
</script>

<template>
  <section class="bench">
    <!-- L'équipe (quand deux sont affichées) : logo, nom, formation en puce. -->
    <header v-if="titre" class="bench__team">
      <TeamCrest :name="team.team" :team-id="team.teamId ?? null" :size="22" class="bench__crest" />
      <span class="bench__team-name cm-truncate">{{ team.team }}</span>
      <span v-if="team.formation" class="cm-chip is-section">{{ team.formation }}</span>
    </header>

    <!-- D'où vient ce onze quand c'est la dernière composition alignée. -->
    <p v-if="team.lastMatch" class="bench__from">
      <span class="bench__from-label">Dernier match</span>
      <span class="bench__from-score">
        <TeamCrest :name="team.lastMatch.home" :league="team.lastMatch.league" :size="14" />
        {{ team.lastMatch.home }} <strong class="cm-numeric">{{ team.lastMatch.homeGoals }}-{{ team.lastMatch.awayGoals }}</strong> {{ team.lastMatch.away }}
        <TeamCrest :name="team.lastMatch.away" :league="team.lastMatch.league" :size="14" />
      </span>
      <span class="cm-text-muted">{{ team.lastMatch.league }} · {{ jourDuMatch(team.lastMatch) }}</span>
    </p>

    <div v-if="contradiction" class="cm-note is-warning bench__warning">
      <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
      <p class="cm-note__text">
        <template v-if="derniere">Des titulaires de ce onze sont indisponibles pour ce match selon FotMob : il changera forcément.</template>
        <template v-else>Aligné(s) alors que FotMob le(s) dit indisponible(s) : composition sans doute prévisionnelle.</template>
      </p>
    </div>

    <template v-for="bloc in blocs" :key="bloc.cle">
      <div class="bench__block">
        <h4 class="cm-group-title bench__title">
          {{ bloc.titre }}
          <span class="bench__count">{{ bloc.cartes.length }}</span>
        </h4>
        <div class="bench__grid">
          <component
            :is="j.lien ? RouterLink : 'div'"
            v-for="j in bloc.cartes"
            :key="`${bloc.cle}-${j.id ?? j.name}`"
            v-bind="j.lien ?? {}"
            class="cm-block is-hover bench__card"
            :class="[`bench__card--${bloc.cle}`, { 'is-link': j.lien }]"
            :title="j.lien ? `Fiche de ${j.name}` : j.name"
          >
            <span class="bench__avatar">
              <img v-if="j.photo && !echecs.has(j.id)" :src="j.photo" alt="" loading="lazy" @error="echecs.add(j.id)" />
              <span v-else>{{ j.sigle }}</span>
            </span>
            <span class="bench__who">
              <span class="bench__name cm-truncate"
                ><TeamCrest :name="team.team" :team-id="team.teamId ?? null" :size="14" class="bench__flag" /><PlayerFlag
                  :code="j.countryCode"
                  :name="j.countryName"
                  :player-id="j.id"
                  :size="13"
                  class="bench__flag"
                /><span v-if="j.number != null" class="bench__num">{{ j.number }}</span>{{ j.name }}</span
              >
              <span class="bench__pos">
                <span class="cm-truncate">{{ j.infos }}</span>
                <span v-if="j.habituel" class="cm-chip is-info bench__usual" title="Titulaire habituel cette saison (au moins la moitié des matchs de son équipe)">titulaire</span>
              </span>
            </span>
            <span v-if="j.note" class="bench__rating" :class="j.classe" title="Note moyenne de la saison">{{ j.note }}</span>
          </component>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.bench {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* ------------------------------------------------------------- en-tête */
.bench__team {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.bench__crest {
  flex-shrink: 0;
}

.bench__team-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.bench__from {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.bench__from-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bench__from-score {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 4px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-weight: 600;
  color: var(--cm-text-primary);
}

.bench__from-score strong {
  font-weight: 800;
}

.bench__warning {
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.bench__warning .cm-note__text {
  font-size: 12.5px;
  line-height: 1.5;
}

/* --------------------------------------------------------------- blocs */
.bench__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bench__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--cm-text-secondary);
}

.bench__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
}

/* ------------------------------------------------------------- fiches */
.bench__card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px 8px 9px;
  border-left-width: 3px;
  border-left-color: transparent;
  color: inherit;
  text-decoration: none;
}

/* Remplaçant sans fiche : le liseré gauche reste invisible au survol (le bloc commun le grisait). */
.bench__card.bench__card--banc:hover {
  border-left-color: transparent;
}

.bench__card.is-link:hover {
  border-color: rgba(var(--cm-section-rgb) / 0.45);
}

.bench__card.is-link:hover .bench__name {
  color: var(--cm-section);
}

/* Absents : liseré rouge ; titulaires habituels hors de la feuille : ambre (même au survol). */
.bench__card.bench__card--absents,
.bench__card.bench__card--absents:hover {
  border-left-color: var(--cm-danger);
}

.bench__card.bench__card--habituels,
.bench__card.bench__card--habituels:hover {
  border-left-color: var(--cm-warning);
}

.bench__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--cm-text-primary);
  color: var(--cm-accent-strong);
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 0 0 2px var(--cm-surface-raised), var(--cm-shadow-sm);
}

.bench__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bench__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bench__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
  transition: color var(--cm-transition);
}

.bench__flag {
  margin-right: 5px;
}

.bench__num {
  margin-right: 5px;
  color: var(--cm-text-muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.bench__pos {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.bench__usual {
  flex-shrink: 0;
  padding: 1px 7px;
  font-size: 10px;
}

/* La note moyenne de la saison, en pastille à la FotMob : bleu ≥ 9, vert foncé ≥ 8, vert ≥ 7, ambre ≥ 6, rouge en dessous. */
.bench__rating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cm-bg);
}

.is-top {
  background: var(--cm-info);
}

.is-great {
  background: var(--cm-accent-strong);
}

.is-good {
  background: var(--cm-accent);
}

.is-mid {
  background: var(--cm-warning);
}

.is-low {
  background: var(--cm-danger);
}
</style>
