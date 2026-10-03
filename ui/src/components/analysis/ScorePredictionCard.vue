<script setup>
/**
 * Pronostic du score (cf. server/src/core/engine/scorePrediction.js) : le
 * score le plus probable, les suivants, les buts attendus, la forme des
 * cinq derniers matchs de chaque équipe et ce que cette forme change, et
 * la fiabilité mesurée sur les matchs passés.
 *
 * Dessin (refonte du 01/10/2026) : une carte à icône ; le score le plus
 * probable en très grand entre les deux logos ; les autres scores en
 * pastilles ; les buts attendus en chiffres clés ; la forme de chaque équipe
 * en bloc (cartes de rencontre), sur deux colonnes quand la place existe.
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FormBadges from '@/components/matches/FormBadges.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';

const props = defineProps({
  result: { type: Object, required: true }
});

const score = computed(() => props.result.scorePrediction ?? null);
const home = computed(() => props.result.teamStats?.home?.name ?? props.result.label?.split(' vs ')[0] ?? 'Domicile');
const away = computed(() => props.result.teamStats?.away?.name ?? props.result.label?.split(' vs ')[1] ?? 'Extérieur');

const virgule = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
const pct = (p, d = 1) => `${virgule(p * 100, d)} %`;
const marque = (c) => `${c.home}-${c.away}`;

const libelleIssue = computed(() => ({ home: `${home.value} gagne`, draw: 'match nul', away: `${away.value} gagne` }));

// Le score le plus probable n'est pas toujours dans l'issue pronostiquée :
// 1-1 est souvent le score le plus probable d'un match serré. On donne alors
// aussi le meilleur score de l'issue annoncée.
const dansIssue = computed(() => {
  const s = score.value;
  if (!s?.inPredictedOutcome) return null;
  if (s.inPredictedOutcome.home === s.mostLikely.home && s.inPredictedOutcome.away === s.mostLikely.away) return null;
  return s.inPredictedOutcome;
});

const source = computed(() =>
  score.value?.source === 'cotes' ? "d'après les cotes, la forme et la saison" : "d'après la forme et la saison, faute de cote"
);

const equipes = computed(() => {
  const s = score.value;
  if (!s?.form) return [];
  return [
    { cle: 'home', nom: s.form.home.name ?? home.value, forme: s.form.home, effet: s.formEffect?.home ?? null, buts: s.expectedGoals.home },
    { cle: 'away', nom: s.form.away.name ?? away.value, forme: s.form.away, effet: s.formEffect?.away ?? null, buts: s.expectedGoals.away }
  ];
});

// Un match de la forme au format de la carte de rencontre commune
// (MatchCard.vue, 01/10/2026) : domicile à gauche, score au centre.
function versCarte(e, m) {
  const [pour, contre] = String(m.score ?? '')
    .split('-')
    .map(Number);
  const club = { nom: e.nom, id: e.forme.teamId ?? null };
  const adversaire = { nom: m.opponent, id: m.opponentId ?? null };
  const [dom, ext] = m.home ? [club, adversaire] : [adversaire, club];
  return {
    date: m.date,
    league: m.competition,
    homeName: dom.nom,
    awayName: ext.nom,
    homeId: dom.id,
    awayId: ext.id,
    homeGoals: m.home ? pour : contre,
    awayGoals: m.home ? contre : pour,
    status: 'finished',
    side: m.home ? 'home' : 'away'
  };
}

// L'effet porte sur les buts attendus de l'équipe : son attaque récente ET
// la défense récente de l'adversaire (xG et tirs cadrés compris), d'où une
// équipe qui marque peu mais crée assez, face à une défense qui prend
// l'eau, peut voir ses buts attendus monter.
const effet = (e) => {
  if (e === null || e === undefined) return '';
  if (Math.abs(e) < 0.005) return "sa forme récente et celle de la défense adverse ne changent presque rien à ses buts attendus";
  return `sa forme récente et celle de la défense adverse ${e > 0 ? 'ajoutent' : 'retirent'} ${pct(Math.abs(e), 0)} à ses buts attendus`;
};

const moyennes = (f) => {
  const parties = [];
  if (f.goalsFor !== null) parties.push(`buts ${virgule(f.goalsFor)} marqués, ${virgule(f.goalsAgainst)} encaissés`);
  if (f.xgFor !== null) parties.push(`xG ${virgule(f.xgFor, 2)} pour, ${virgule(f.xgAgainst, 2)} contre`);
  return parties.length ? `Par match : ${parties.join(' ; ')}.` : '';
};

const fiabilite = computed(() => {
  const r = score.value?.reliability;
  if (!r) return null;
  const debut = new Date(`${r.since}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const phrases = [
    `Sur ${r.matches.toLocaleString('fr-FR')} matchs joués depuis ${debut}, le score annoncé a été le bon ${virgule(r.exact)} % du temps, et l'un des trois premiers ${virgule(r.top3)} % du temps.`,
    `Annoncer 1-1 à chaque match donnait ${virgule(r.alwaysOneOne)} %.`
  ];
  if (r.band) phrases.push(`Quand le score favori est annoncé entre ${r.band.range[0]} et ${r.band.range[1] > 100 ? 100 : r.band.range[1]} %, il est tombé ${virgule(r.band.realized)} % du temps.`);
  return phrases.join(' ');
});

const note = computed(() =>
  score.value?.source === 'cotes'
    ? "Les cotes contiennent déjà la forme récente : l'étude sur les matchs passés ne lui a laissé qu'un poids de 0 à 4 %."
    : 'Sans cote, la forme des cinq derniers matchs pèse davantage que la saison dans le calcul.'
);
</script>

<template>
  <AppCard v-if="score" title="Pronostic du score" icon="ball" eyebrow="Le moteur" class="spc">
    <template #actions>
      <span class="cm-chip spc__source" title="Ce qui fonde le pronostic">{{ source }}</span>
    </template>

    <div class="spc__body">
      <!-- Le score le plus probable, en très grand entre les deux logos. -->
      <div class="spc__hero">
        <div class="spc__club is-home">
          <span class="spc__team cm-truncate">{{ home }}</span>
          <TeamCrest :name="home" :league="result.league" :size="44" />
        </div>
        <div class="spc__center">
          <span class="spc__label">Score le plus probable</span>
          <span class="spc__value cm-numeric">{{ score.mostLikely.home }} – {{ score.mostLikely.away }}</span>
          <span class="cm-pill is-accent" title="Probabilité de ce score exact selon le moteur">{{ pct(score.mostLikely.probability) }}</span>
        </div>
        <div class="spc__club is-away">
          <TeamCrest :name="away" :league="result.league" :size="44" />
          <span class="spc__team cm-truncate">{{ away }}</span>
        </div>
      </div>

      <div v-if="dansIssue" class="cm-note is-info">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="target" :size="14" /></span>
        <div>
          <p class="cm-note__title">Dans l'issue annoncée</p>
          <p class="cm-note__text spc__outcome">
            Si « <PickCrest :side="dansIssue.outcome" :home="home" :away="away" :league="result.league" :size="14" />{{ libelleIssue[dansIssue.outcome] }} » se confirme :
            <strong class="cm-numeric">{{ marque(dansIssue) }}</strong> (<span class="cm-numeric">{{ pct(dansIssue.probability) }}</span>).
          </p>
        </div>
      </div>

      <!-- Les scores suivants, en pastilles. -->
      <div class="spc__others">
        <p class="cm-group-title">Autres scores probables</p>
        <div class="spc__chips">
          <span v-for="c in score.top.slice(1)" :key="marque(c)" class="cm-pill spc__chip" :title="`${marque(c)} : ${pct(c.probability)} de chances`">
            {{ marque(c) }} <span class="spc__chip-p">{{ pct(c.probability) }}</span>
          </span>
        </div>
      </div>

      <!-- Les buts attendus de chaque équipe, en chiffres clés. -->
      <div class="cm-kpis spc__xg">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Buts attendus</span>
          <span class="cm-kpi__value">{{ virgule(score.expectedGoals.home, 2) }}</span>
          <span class="cm-kpi__detail spc__xg-team"><TeamCrest :name="home" :league="result.league" :size="14" /> <span class="cm-truncate">{{ home }}</span></span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Buts attendus</span>
          <span class="cm-kpi__value">{{ virgule(score.expectedGoals.away, 2) }}</span>
          <span class="cm-kpi__detail spc__xg-team"><TeamCrest :name="away" :league="result.league" :size="14" /> <span class="cm-truncate">{{ away }}</span></span>
        </div>
      </div>

      <!-- La forme de chaque équipe : ses cinq derniers matchs en cartes de rencontre. -->
      <div v-if="equipes.length" class="spc__form">
        <p class="cm-group-title">Forme des 5 derniers matchs, toutes compétitions</p>
        <div class="spc__teams">
          <div v-for="e in equipes" :key="e.cle" class="cm-block spc__team-form">
            <div class="spc__team-line">
              <span class="spc__team-name cm-truncate">
                <TeamCrest :name="e.nom" :league="result.league" :team-id="e.forme.teamId ?? null" :size="22" class="spc__crest" />{{ e.nom }}
              </span>
              <FormBadges :form="e.forme" />
            </div>
            <div v-if="e.forme.matches.length" class="spc__matches">
              <MatchCard
                v-for="m in e.forme.matches"
                :key="m.date + m.opponent"
                :match="versCarte(e, m)"
                :to="m.matchKey ? `/match/${m.matchKey}` : null"
                variant="compact"
                :show-competition="false"
              />
            </div>
            <p class="spc__team-note">
              {{ moyennes(e.forme) }}
              <template v-if="effet(e.effet)">Ici, {{ effet(e.effet) }}.</template>
            </p>
          </div>
        </div>
      </div>

      <div class="cm-note spc__note">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="info" :size="14" /></span>
        <div>
          <p class="cm-note__title">Le poids de la forme</p>
          <p class="cm-note__text spc__note-text">{{ note }}</p>
        </div>
      </div>

      <div v-if="fiabilite" class="cm-note spc__reliability">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="history" :size="14" /></span>
        <div>
          <p class="cm-note__title">Fiabilité mesurée</p>
          <p class="cm-note__text spc__note-text">{{ fiabilite }}</p>
        </div>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.spc__body {
  /* Se règle sur SA largeur : page large comme panneau étroit. */
  container: spc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spc__source {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ------------------------------------------------- le score le plus probable */
.spc__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.22);
  background:
    radial-gradient(120% 140% at 50% 0%, rgba(var(--cm-section-rgb) / 0.12), transparent 60%),
    var(--cm-surface-alt);
}

.spc__club {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.spc__club.is-home {
  justify-content: flex-end;
  text-align: right;
}

.spc__team {
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.spc__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.spc__label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-section);
  white-space: nowrap;
}

.spc__value {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--cm-text-primary);
  white-space: nowrap;
}

/* ------------------------------------------------------------ autres scores */
.spc__others {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spc__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.spc__chip {
  gap: 6px;
  color: var(--cm-text-primary);
}

.spc__chip-p {
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------------ buts attendus */
.spc__xg {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.spc__xg-team {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

/* ------------------------------------------------------------------- forme */
.spc__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.spc__teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.spc__team-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.spc__team-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.spc__team-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.spc__crest {
  margin-right: 8px;
}

.spc__matches {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spc__team-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------------- notes finales */
.spc__note-text {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

/* Assez de place : la forme des deux équipes côte à côte. */
@container spc (min-width: 640px) {
  .spc__teams {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : chaque club en colonne (logo au-dessus du nom), le score plus petit. */
@container spc (max-width: 420px) {
  .spc__hero {
    gap: 8px;
    padding: 14px 12px;
  }

  .spc__club,
  .spc__club.is-home {
    flex-direction: column;
    justify-content: flex-start;
    gap: 6px;
    text-align: center;
  }

  .spc__club.is-home {
    flex-direction: column-reverse;
  }

  .spc__team {
    max-width: 100%;
    font-size: 12px;
  }

  .spc__value {
    font-size: 30px;
  }

  .spc__xg {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
