<script setup>
/**
 * Pronostic du score (cf. server/src/core/engine/scorePrediction.js) : le
 * score le plus probable, les suivants, les buts attendus, la forme des
 * cinq derniers matchs de chaque équipe et ce que cette forme change, et
 * la fiabilité mesurée sur les matchs passés.
 */
import { computed } from 'vue';
import FormBadges from '@/components/matches/FormBadges.vue';

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
  <section v-if="score" class="score">
    <header class="score__head">
      <span class="score__title">Pronostic du score</span>
      <span class="score__source">{{ source }}</span>
    </header>

    <div class="score__main">
      <div class="score__pick">
        <span class="score__team cm-truncate">{{ home }}</span>
        <span class="score__value">{{ score.mostLikely.home }} – {{ score.mostLikely.away }}</span>
        <span class="score__team score__team--away cm-truncate">{{ away }}</span>
      </div>
      <span class="score__confidence">{{ pct(score.mostLikely.probability) }}</span>
    </div>
    <p v-if="dansIssue" class="score__outcome">
      Si « {{ libelleIssue[dansIssue.outcome] }} » se confirme : {{ marque(dansIssue) }} ({{ pct(dansIssue.probability) }}).
    </p>

    <div class="score__others">
      <span v-for="c in score.top.slice(1)" :key="marque(c)" class="score__chip">
        {{ marque(c) }} <span class="score__chip-p">{{ pct(c.probability) }}</span>
      </span>
    </div>

    <p class="score__xg">
      Buts attendus : {{ home }} {{ virgule(score.expectedGoals.home, 2) }}, {{ away }} {{ virgule(score.expectedGoals.away, 2) }}.
    </p>

    <div v-if="equipes.length" class="score__form">
      <span class="score__subtitle">Forme des 5 derniers matchs, toutes compétitions</span>
      <div v-for="e in equipes" :key="e.cle" class="score__team-form">
        <div class="score__team-line">
          <span class="score__team-name cm-truncate">{{ e.nom }}</span>
          <FormBadges :form="e.forme" />
        </div>
        <ul v-if="e.forme.matches.length" class="score__matches">
          <li v-for="m in e.forme.matches" :key="m.date + m.opponent">
            <span class="score__match-date">{{ new Date(`${m.date}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) }}</span>
            <span class="score__match-venue">{{ m.home ? 'dom.' : 'ext.' }}</span>
            <span class="score__match-opp cm-truncate">{{ m.opponent }}</span>
            <span class="score__match-score" :class="`score__match-score--${m.result}`">{{ m.score }}</span>
            <span class="score__match-comp cm-truncate">{{ m.competition }}</span>
          </li>
        </ul>
        <p class="score__team-note">
          {{ moyennes(e.forme) }}
          <template v-if="effet(e.effet)">Ici, {{ effet(e.effet) }}.</template>
        </p>
      </div>
    </div>

    <p class="score__note">{{ note }}</p>
    <p v-if="fiabilite" class="score__reliability">{{ fiabilite }}</p>
  </section>
</template>

<style scoped>
.score {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
}

.score__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.score__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.score__source {
  font-size: 11.5px;
  color: var(--cm-text-muted);
  text-align: right;
}

.score__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.score__pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.score__team {
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-primary);
  text-align: right;
}

.score__team--away {
  text-align: left;
}

.score__value {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.score__confidence {
  font-size: 15px;
  font-weight: 700;
  color: var(--cm-accent);
  font-variant-numeric: tabular-nums;
}

.score__outcome {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.score__others {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.score__chip {
  display: inline-flex;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.score__chip-p {
  font-weight: 400;
  color: var(--cm-text-muted);
}

.score__xg {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.score__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.score__subtitle {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.score__team-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score__team-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.score__team-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.score__matches {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.score__matches li {
  display: grid;
  grid-template-columns: 2.6rem 2.2rem minmax(0, 1fr) 2.6rem minmax(0, 0.8fr);
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.score__match-date,
.score__match-venue,
.score__match-comp {
  color: var(--cm-text-muted);
}

.score__match-score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.score__match-score--V {
  color: var(--cm-accent);
}

.score__match-score--D {
  color: var(--cm-danger);
}

.score__team-note {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.score__note {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.score__reliability {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

@media (max-width: 520px) {
  .score__matches li {
    grid-template-columns: 2.6rem 2.2rem minmax(0, 1fr) 2.6rem;
  }

  .score__match-comp {
    display: none;
  }
}
</style>
