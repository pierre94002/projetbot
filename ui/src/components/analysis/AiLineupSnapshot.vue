<script setup>
import { computed } from 'vue';
import { retourPrevu } from '@/utils/fotmobLabels.js';
import LineupPitch from '@/components/matches/LineupPitch.vue';
import LineupBench from '@/components/matches/LineupBench.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Les compositions que l'IA a eues sous les yeux pour son analyse d'avant
 * coup d'envoi (cf. server/src/data/providers/lineupContext.js) : le onze de
 * chaque équipe par ligne, les titulaires habituels qui n'y sont pas, les
 * absents et leur motif.
 *
 * Sert aussi, tant que FotMob n'a rien publié pour le match, à la DERNIÈRE
 * composition alignée par chaque équipe (`source: 'magasin'`, chaque équipe
 * avec le match d'où vient son onze, `lastMatch`) — demande de Pierre le
 * 01/10/2026.
 *
 * `pitch` : les onzes dessinés sur un terrain (cf. LineupPitch.vue, onglets
 * Composition des pages de match et d'équipe) au lieu des lignes de texte,
 * gardées pour les panneaux d'analyse IA. Sous le terrain, remplaçants,
 * absents et titulaires habituels absents en petites fiches (LineupBench.vue).
 *
 * `side` ('home' | 'away') : une seule équipe, sur tout le terrain — page
 * d'une équipe (01/10/2026 : « il n'y ait que les joueurs d'Arsenal »).
 *
 * Habillage refait le 02/10/2026 (refonte visuelle, cf. ui/DESIGN.md) : la
 * version texte met chaque équipe en carte (logo, lignes par poste en grille
 * libellé/noms, banc, absents en note) ; la version terrain ne change pas.
 */
const props = defineProps({
  snapshot: { type: Object, required: true }, // { fetchedAt, minutesBeforeKickoff, home, away } ou { source: 'magasin', home, away }
  pitch: { type: Boolean, default: false },
  side: { type: String, default: null }
});

const seule = computed(() => (props.side === 'home' || props.side === 'away') && Boolean(props.snapshot[props.side]));
const equipesAffichees = computed(() => (seule.value ? [props.snapshot[props.side]] : [props.snapshot.home, props.snapshot.away].filter(Boolean)));

// Le onze au format du terrain : note moyenne de la saison, et
// l'avertissement des titulaires que FotMob dit indisponibles.
function versTerrain(t) {
  if (!t) return { name: '', starters: [] };
  const absents = new Map((t.unavailable ?? []).map((a) => [a.name, a]));
  return {
    name: t.team,
    teamId: t.teamId ?? null,
    formation: t.formation ?? null,
    coach: t.coach ?? null,
    starters: (t.startXI ?? []).map((j) => {
      const absent = absents.get(j.name);
      return {
        id: j.id,
        name: j.name,
        number: j.number,
        position: j.position,
        x: j.x,
        y: j.y,
        age: j.age ?? null,
        countryCode: j.countryCode ?? null,
        countryName: j.countryName ?? null,
        rating: j.stats?.rating ?? null,
        warning: absent ? `Indisponible : ${absent.reason}${absent.expectedReturn ? `, retour : ${retourPrevu(absent.expectedReturn)}` : ''}` : null
      };
    })
  };
}
const terrain = computed(() => ({ home: versTerrain(props.snapshot.home), away: versTerrain(props.snapshot.away) }));

const derniere = computed(() => props.snapshot.source === 'magasin');
const jourDuMatch = (m) => new Date(`${m.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

// Un joueur des listes en texte : son drapeau (01/10/2026), puis son nom.
const enLigne = (j, texte) => ({ cle: j.id ?? j.name, id: j.id ?? null, code: j.countryCode ?? null, pays: j.countryName ?? null, texte });

const LIGNES = [
  ['Goalkeeper', 'Gardien'],
  ['Defender', 'Défense'],
  ['Midfielder', 'Milieu'],
  ['Forward', 'Attaque']
];

const heure = computed(() =>
  props.snapshot.fetchedAt ? new Date(props.snapshot.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null
);

// Buts et passes décisives de la saison, seulement quand il y en a : le reste encombre.
function chiffres(joueur) {
  const s = joueur.stats;
  if (!s) return '';
  const morceaux = [];
  if (s.goals) morceaux.push(`${s.goals} b.`);
  if (s.assists) morceaux.push(`${s.assists} p.d.`);
  return morceaux.length ? ` (${morceaux.join(', ')})` : '';
}


const equipes = computed(() =>
  ['home', 'away']
    .map((cote) => props.snapshot[cote])
    .filter(Boolean)
    .map((t) => {
      // Un titulaire que FotMob dit aussi indisponible : signe d'une composition prévisionnelle.
      const indisponibles = new Set((t.unavailable ?? []).map((a) => a.name));
      const nom = (j) => `${j.name}${chiffres(j)}${indisponibles.has(j.name) ? ' ⚠' : ''}`;
      return {
        ...t,
        contradiction: t.startXI.some((j) => indisponibles.has(j.name)),
        lignes: [
          ...LIGNES.map(([pos, libelle]) => ({ libelle, joueurs: t.startXI.filter((j) => j.position === pos) })),
          { libelle: 'Poste ?', joueurs: t.startXI.filter((j) => !LIGNES.some(([pos]) => pos === j.position)) }
        ]
          .filter((l) => l.joueurs.length)
          .map((l) => ({ ...l, noms: l.joueurs.map((j) => enLigne(j, nom(j))) })),
        banc: (t.bench ?? []).map((j) => enLigne(j, `${j.name}${chiffres(j)}`)),
        habituelsAbsents: (t.usualStartersMissing ?? []).map((j) => enLigne(j, `${j.name} (${j.status})`)),
        indisponibles: (t.unavailable ?? []).map((a) =>
          enLigne(a, `${a.name} (${a.reason}${a.expectedReturn ? `, retour : ${retourPrevu(a.expectedReturn)}` : ''})`)
        )
      };
    })
);
</script>

<template>
  <div class="ais">
    <!-- D'où viennent ces compositions : la dernière alignée (bandeau ambré), ou celles publiées par FotMob (heure et délai en puces). -->
    <div v-if="derniere" class="ais__status is-last">
      <span class="cm-icon-box is-warning is-sm"><AppIcon name="clock" :size="14" /></span>
      <p class="ais__status-text">
        Composition du match pas encore publiée : voici la dernière composition alignée {{ seule ? "par l'équipe" : 'par chaque équipe' }}.
        Elle sera remplacée par la composition d'avant-match dès que FotMob la publie.
      </p>
    </div>
    <div v-else class="ais__status">
      <span class="cm-icon-box is-sm"><AppIcon name="users" :size="14" /></span>
      <span class="ais__status-text">Compositions FotMob relevées</span>
      <span v-if="heure" class="cm-chip"><AppIcon name="clock" :size="11" />à {{ heure }}</span>
      <span v-if="snapshot.minutesBeforeKickoff != null" class="cm-chip is-section">{{ snapshot.minutesBeforeKickoff }} min avant le coup d'envoi</span>
    </div>

    <!-- Version terrain : le dessin de LineupPitch, puis les bancs côte à côte quand la place existe. -->
    <template v-if="pitch">
      <LineupPitch :home="seule ? terrain[side] : terrain.home" :away="seule ? null : terrain.away" saison />
      <div class="ais__benches" :class="{ 'is-single': seule }">
        <LineupBench v-for="t in equipesAffichees" :key="t.team" :team="t" :derniere="derniere" :titre="!seule" />
      </div>
    </template>

    <!-- Version texte (panneaux d'analyse IA) : une carte par équipe. -->
    <div v-else class="ais__teams">
      <article v-for="t in equipes" :key="t.team" class="ais__team">
        <header class="ais__team-head">
          <TeamCrest :name="t.team" :team-id="t.teamId ?? null" :size="22" class="ais__crest" />
          <span class="ais__team-name cm-truncate">{{ t.team }}</span>
          <span v-if="t.formation" class="cm-chip is-section">{{ t.formation }}</span>
        </header>

        <p v-if="t.lastMatch" class="ais__from">
          <span class="ais__from-label">Dernier match</span>
          <span class="ais__from-score">
            <TeamCrest :name="t.lastMatch.home" :league="t.lastMatch.league" :size="13" />
            {{ t.lastMatch.home }} <strong class="cm-numeric">{{ t.lastMatch.homeGoals }}-{{ t.lastMatch.awayGoals }}</strong> {{ t.lastMatch.away }}
            <TeamCrest :name="t.lastMatch.away" :league="t.lastMatch.league" :size="13" />
          </span>
          <span class="cm-text-muted">{{ t.lastMatch.league }} · {{ jourDuMatch(t.lastMatch) }}</span>
        </p>

        <div class="ais__lines">
          <p v-for="l in pitch ? [] : t.lignes" :key="l.libelle" class="ais__line">
            <span class="ais__line-label">{{ l.libelle }}</span>
            <span class="ais__line-names">
              <TeamCrest :name="t.team" :team-id="t.teamId ?? null" :size="13" class="ais__flag" /><template v-for="(n, i) in l.noms" :key="n.cle"
                ><PlayerFlag :code="n.code" :name="n.pays" :player-id="n.id" :size="12" class="ais__flag" />{{ n.texte }}<template v-if="i < l.noms.length - 1">, </template></template
              >
            </span>
          </p>
          <p v-if="t.banc.length" class="ais__line is-bench">
            <span class="ais__line-label">Banc</span>
            <span class="ais__line-names cm-text-muted">
              <TeamCrest :name="t.team" :team-id="t.teamId ?? null" :size="13" class="ais__flag" /><template v-for="(n, i) in t.banc" :key="n.cle"
                ><PlayerFlag :code="n.code" :name="n.pays" :player-id="n.id" :size="12" class="ais__flag" />{{ n.texte }}<template v-if="i < t.banc.length - 1">, </template></template
              >
            </span>
          </p>
        </div>

        <div v-if="t.contradiction && derniere" class="cm-note is-warning ais__note">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
          <p class="cm-note__text">Indisponible(s) pour ce match selon FotMob : ce onze changera forcément.</p>
        </div>
        <div v-else-if="t.contradiction" class="cm-note is-warning ais__note">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
          <p class="cm-note__text">Aligné(s) alors que FotMob le(s) dit indisponible(s) : composition sans doute prévisionnelle.</p>
        </div>

        <div v-if="t.habituelsAbsents.length" class="cm-note is-warning ais__note">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="userX" :size="14" /></span>
          <div class="ais__note-body">
            <p class="cm-note__title">Titulaires habituels absents du onze</p>
            <p class="cm-note__text">
              <TeamCrest :name="t.team" :team-id="t.teamId ?? null" :size="13" class="ais__flag" /><template v-for="(n, i) in t.habituelsAbsents" :key="n.cle"
                ><PlayerFlag :code="n.code" :name="n.pays" :player-id="n.id" :size="12" class="ais__flag" />{{ n.texte }}<template v-if="i < t.habituelsAbsents.length - 1">, </template></template
              >
            </p>
          </div>
        </div>
        <div v-if="t.indisponibles.length" class="cm-note is-danger ais__note">
          <span class="cm-icon-box is-danger is-sm"><AppIcon name="userX" :size="14" /></span>
          <div class="ais__note-body">
            <p class="cm-note__title">Indisponibles</p>
            <p class="cm-note__text cm-text-secondary">
              <TeamCrest :name="t.team" :team-id="t.teamId ?? null" :size="13" class="ais__flag" /><template v-for="(n, i) in t.indisponibles" :key="n.cle"
                ><PlayerFlag :code="n.code" :name="n.pays" :player-id="n.id" :size="12" class="ais__flag" />{{ n.texte }}<template v-if="i < t.indisponibles.length - 1">, </template></template
              >
            </p>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.ais {
  /* Se règle sur SA largeur : une page entière comme un panneau étroit. */
  container: ai-lineups / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ----------------------------------------------------- ligne de source */
.ais__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.ais__status-text {
  margin: 0;
  line-height: 1.5;
}

/* La dernière composition alignée, pas celle du match : bandeau ambré. */
.ais__status.is-last {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-warning-rgb) / 0.28);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-warning-rgb) / 0.09), transparent 55%), var(--cm-surface-alt);
  color: var(--cm-text-primary);
}

/* ------------------------------------------------------ version terrain */
.ais__benches {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.ais__benches > * + * {
  padding-top: 20px;
  border-top: 1px solid var(--cm-border-soft);
}

/* -------------------------------------------------------- version texte */
.ais__teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.ais__team {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ais__team-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ais__crest {
  flex-shrink: 0;
}

.ais__team-name {
  min-width: 0;
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.ais__from {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
  font-size: 11px;
  color: var(--cm-text-secondary);
}

.ais__from-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ais__from-score {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 4px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-weight: 600;
  color: var(--cm-text-primary);
}

.ais__from-score strong {
  font-weight: 800;
}

/* Le onze par ligne : libellé en petites capitales, les noms en face. */
.ais__lines {
  display: flex;
  flex-direction: column;
}

.ais__line {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.ais__line + .ais__line {
  border-top: 1px solid var(--cm-border-soft);
}

.ais__line-label {
  padding-top: 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ais__line-names {
  min-width: 0;
}

.ais__flag {
  margin-right: 4px;
}

/* Les notes (avertissement, absents) : compactes dans une carte d'équipe. */
.ais__note {
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.ais__note-body {
  min-width: 0;
}

.ais__note .cm-note__title {
  font-size: 10px;
}

.ais__note .cm-note__text {
  font-size: 12px;
  line-height: 1.5;
}

/* Assez de place : les deux équipes côte à côte, les bancs aussi (séparés d'un filet). */
@container ai-lineups (min-width: 700px) {
  .ais__teams {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container ai-lineups (min-width: 760px) {
  .ais__benches:not(.is-single) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }

  .ais__benches:not(.is-single) > :first-child {
    padding-right: 20px;
  }

  .ais__benches:not(.is-single) > * + * {
    padding-top: 0;
    padding-left: 20px;
    border-top: 0;
    border-left: 1px solid var(--cm-border-soft);
  }
}
</style>
