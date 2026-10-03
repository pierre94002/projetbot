<script setup>
import { computed } from 'vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { campsDe } from '@/utils/pronosticEquipe.js';

/**
 * Pronostics du moteur, marché par marché, dans le dessin des cartes de
 * rencontre — demande de Pierre le 01/10/2026 (capture de l'onglet Marchés) :
 * « la même esthétique que le reste, que les matchs », et « des logos à
 * chaque ligne où il y a un nom d'équipe ».
 *
 * « Le match » (résultat, résultat + total buts, les deux équipes marquent) :
 * une carte par marché, le logo de l'équipe visée (les deux pour un marché
 * qui ne vise aucune équipe). Buts, corners, tirs et tirs cadrés : une carte
 * face à face par famille — l'équipe qui reçoit à gauche, l'autre à droite,
 * le total au centre comme le score d'une rencontre.
 *
 * Probabilité = 1 / cote juste : le moteur ne donne pas l'une sans l'autre.
 * La cote du bookmaker n'existe que pour le résultat (The Odds API ne cote
 * que le 1N2 de vos bookmakers).
 */
const props = defineProps({
  predictions: { type: Array, default: () => [] },
  match: { type: Object, required: true }, // { home, away, league }
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  // Avis de l'IA d'avant-match (`analysis.marketViews`) : la phrase qui
  // explique chaque pourcentage, sous son pronostic (01/10/2026).
  views: { type: Array, default: () => [] }
});

const FAMILLES = [
  { cle: 'buts', titre: 'Buts', total: 'totalGoals', equipe: 'teamGoals' },
  { cle: 'corners', titre: 'Corners', total: 'totalCorners', equipe: 'teamCorners' },
  { cle: 'tirs', titre: 'Tirs', total: 'totalShots', equipe: 'teamShots' },
  { cle: 'cadres', titre: 'Tirs cadrés', total: 'totalShotsOnTarget', equipe: 'teamShotsOnTarget' }
];
const DU_MATCH = ['result', 'resultAndTotal', 'bothTeamsScore'];

const virgule = (x) => Number(x).toFixed(2).replace('.', ',');
const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? virgule(x) : null);
const proba = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? `${Math.round(100 / Number(x))} %` : null);

// « Arsenal — Moins de 3.5 buts » → « Moins de 3.5 buts » : son côté de la carte dit déjà le club.
function sansEquipe(p, nom) {
  const libelle = String(p?.predictedLabel ?? '');
  return nom && libelle.startsWith(`${nom} — `) ? libelle.slice(nom.length + 3) : libelle;
}

const cleTexte = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// L'explication de l'IA pour CE pronostic : même marché et même choix (un
// pronostic qui a changé depuis l'analyse n'a plus d'explication), avec le
// pourcentage d'alors quand les cotes l'ont fait bouger de plus d'un point.
function explication(p) {
  const v = props.views.find((x) => cleTexte(x.market) === cleTexte(p.market));
  if (!v?.explanation || cleTexte(v.pick) !== cleTexte(p.predictedLabel)) return null;
  const maintenant = Number(p.predictedOdds) > 1 ? Math.round(100 / Number(p.predictedOdds)) : null;
  const alors = Number.isFinite(Number(v.probability)) && v.probability !== null ? Number(v.probability) : null;
  return {
    texte: v.explanation,
    // La phrase commence d'ordinaire par « 76 % : » : le pourcentage n'est alors pas répété devant.
    dejaChiffree: /^\s*\d{1,3}\s*%/.test(v.explanation),
    alors: alors !== null && maintenant !== null && Math.abs(alors - maintenant) > 1 ? alors : null
  };
}

/** Le pourcentage en nombre entier, ou null. */
const pourcentage = (odds) => (Number.isFinite(Number(odds)) && Number(odds) > 1 ? Math.round(100 / Number(odds)) : null);

/**
 * Le pourcentage dit en mots (02/10/2026, Pierre : « une représentation du
 * pourcentage, une phrase simple ») — affiché quand l'IA n'a pas encore
 * expliqué ce pronostic (analyse plus ancienne, ou pronostic qui a changé).
 */
function phraseSimple(pct) {
  if (pct === null) return null;
  let mots;
  if (pct >= 95) mots = 'presque à coup sûr';
  else if (pct >= 85) mots = 'environ 9 fois sur 10';
  else if (pct >= 78) mots = 'environ 4 fois sur 5';
  else if (pct >= 70) mots = 'environ 3 fois sur 4';
  else if (pct >= 62) mots = 'environ 2 fois sur 3';
  else if (pct >= 55) mots = 'un peu plus d’une fois sur deux';
  else if (pct >= 46) mots = 'environ une fois sur deux';
  else if (pct >= 38) mots = 'un peu moins d’une fois sur deux';
  else if (pct >= 29) mots = 'environ une fois sur trois';
  else if (pct >= 22) mots = 'environ une fois sur quatre';
  else if (pct >= 17) mots = 'environ une fois sur cinq';
  else mots = 'moins d’une fois sur cinq';
  return `${pct} % de chances selon le moteur : ${mots}.`;
}

const fiche = (p, texte = p.predictedLabel) => ({
  p,
  texte,
  marche: p.market,
  pct: pourcentage(p.predictedOdds),
  proba: proba(p.predictedOdds),
  juste: cote(p.predictedOdds),
  bookmaker: cote(p.predictedMarketOdds),
  ia: explication(p),
  simple: phraseSimple(pourcentage(p.predictedOdds))
});

const rang = (p) => {
  const i = DU_MATCH.indexOf(p.marketId);
  return i === -1 ? DU_MATCH.length : i;
};

const tableau = computed(() => {
  const restants = new Set(props.predictions);
  const prendre = (test) => {
    const p = props.predictions.find(test) ?? null;
    if (p) restants.delete(p);
    return p;
  };
  const familles = FAMILLES.map((f) => {
    const total = prendre((x) => x.marketId === f.total);
    const home = prendre((x) => x.marketId === f.equipe && x.params?.team === 'home');
    const away = prendre((x) => x.marketId === f.equipe && x.params?.team === 'away');
    return {
      ...f,
      total: total && fiche(total),
      home: home && fiche(home, sansEquipe(home, props.match.home)),
      away: away && fiche(away, sansEquipe(away, props.match.away))
    };
  }).filter((f) => f.total || f.home || f.away);
  // Les marchés du match, puis tout ce qu'aucune famille ne range (marché
  // ajouté depuis, ou pronostic d'un ancien format) : rien ne disparaît.
  const duMatch = [...restants].sort((a, b) => rang(a) - rang(b)).map((p) => fiche(p));
  return { duMatch, familles };
});

const visesEquipe = (p) => campsDe(p, { home: props.match.home, away: props.match.away }).length > 0;
</script>

<template>
  <div class="mboard">
    <section v-if="tableau.duMatch.length" class="mboard__section">
      <p class="mboard__title">Le match</p>
      <div v-for="f in tableau.duMatch" :key="f.marche" class="mboard__card">
        <span class="mboard__crest">
          <PickCrest
            v-if="visesEquipe(f.p)"
            :item="f.p"
            :home="match.home"
            :away="match.away"
            :league="match.league"
            :home-id="homeId"
            :away-id="awayId"
            :size="30"
            class="mboard__pick-crest"
          />
          <span v-else class="mboard__duo" :title="`${match.home} - ${match.away}`">
            <TeamCrest :name="match.home" :league="match.league" :team-id="homeId" :size="22" />
            <TeamCrest :name="match.away" :league="match.league" :team-id="awayId" :size="22" class="mboard__duo-away" />
          </span>
        </span>
        <span class="mboard__what">
          <span class="mboard__pick">{{ f.texte }}</span>
          <span class="mboard__market">{{ f.marche }}</span>
          <span v-if="f.pct !== null" class="mboard__meter" :title="`${f.pct} % selon le moteur`"><span :style="{ width: `${f.pct}%` }" /></span>
          <span v-if="f.ia" class="mboard__why">
            <span class="mboard__why-tag">IA</span>{{ f.ia.texte }}<span v-if="f.ia.alors !== null" class="mboard__why-then"> (analyse faite à {{ f.ia.alors }} %)</span>
          </span>
          <span v-else-if="f.simple" class="mboard__why">{{ f.simple }}</span>
        </span>
        <span class="mboard__figures">
          <span class="mboard__pill is-proba" title="Probabilité selon le moteur (1 / cote juste)">{{ f.proba ?? '—' }}</span>
          <span class="mboard__odds" title="Cote juste du moteur">
            <span class="mboard__odds-label">juste</span>
            {{ f.juste ?? '—' }}
          </span>
          <span class="mboard__odds is-book" :title="f.bookmaker ? 'Meilleure cote de vos bookmakers' : 'Pas de cote bookmaker pour ce marché'">
            <span class="mboard__odds-label">bookmaker</span>
            {{ f.bookmaker ?? '—' }}
          </span>
        </span>
      </div>
    </section>

    <section v-for="fam in tableau.familles" :key="fam.cle" class="mboard__section">
      <p class="mboard__title">{{ fam.titre }}</p>
      <div class="mboard__duel">
        <div class="mboard__side is-home">
          <span v-if="fam.home" class="mboard__side-text">
            <span class="mboard__team">{{ match.home }}</span>
            <span class="mboard__pick">{{ fam.home.texte }}</span>
            <span class="mboard__mini">
              <span class="mboard__pill is-proba is-small">{{ fam.home.proba ?? '—' }}</span>
              <span class="mboard__pill is-small" title="Cote juste du moteur">{{ fam.home.juste ?? '—' }}</span>
            </span>
          </span>
          <span v-else class="mboard__none">Pas de pronostic coté 1,20 ou plus</span>
          <TeamCrest :name="match.home" :league="match.league" :team-id="homeId" :size="30" />
        </div>

        <div class="mboard__center">
          <span class="mboard__center-label">Total du match</span>
          <template v-if="fam.total">
            <span class="mboard__pick">{{ fam.total.texte }}</span>
            <span class="mboard__mini">
              <span class="mboard__pill is-proba is-small">{{ fam.total.proba ?? '—' }}</span>
              <span class="mboard__pill is-small" title="Cote juste du moteur">{{ fam.total.juste ?? '—' }}</span>
            </span>
          </template>
          <span v-else class="mboard__none">—</span>
        </div>

        <div class="mboard__side">
          <TeamCrest :name="match.away" :league="match.league" :team-id="awayId" :size="30" />
          <span v-if="fam.away" class="mboard__side-text">
            <span class="mboard__team">{{ match.away }}</span>
            <span class="mboard__pick">{{ fam.away.texte }}</span>
            <span class="mboard__mini">
              <span class="mboard__pill is-proba is-small">{{ fam.away.proba ?? '—' }}</span>
              <span class="mboard__pill is-small" title="Cote juste du moteur">{{ fam.away.juste ?? '—' }}</span>
            </span>
          </span>
          <span v-else class="mboard__none">Pas de pronostic coté 1,20 ou plus</span>
        </div>

        <!-- Sous chaque pronostic de la famille : la jauge, puis la phrase de
             l'IA (quand elle a analysé ce pronostic), sinon la phrase simple. -->
        <div v-if="fam.home || fam.total || fam.away" class="mboard__whys">
          <p v-if="fam.home" class="mboard__why">
            <TeamCrest :name="match.home" :league="match.league" :team-id="homeId" :size="14" />
            <span v-if="fam.home.pct !== null" class="mboard__meter is-inline"><span :style="{ width: `${fam.home.pct}%` }" /></span>
            <template v-if="fam.home.ia">
              <span v-if="!fam.home.ia.dejaChiffree" class="mboard__why-pct">{{ fam.home.proba }}</span>{{ fam.home.ia.texte }}<span v-if="fam.home.ia.alors !== null" class="mboard__why-then"> (analyse faite à {{ fam.home.ia.alors }} %)</span>
            </template>
            <template v-else>{{ fam.home.simple }}</template>
          </p>
          <p v-if="fam.total" class="mboard__why">
            <span class="mboard__why-tag">Total</span>
            <span v-if="fam.total.pct !== null" class="mboard__meter is-inline"><span :style="{ width: `${fam.total.pct}%` }" /></span>
            <template v-if="fam.total.ia">
              <span v-if="!fam.total.ia.dejaChiffree" class="mboard__why-pct">{{ fam.total.proba }}</span>{{ fam.total.ia.texte }}<span v-if="fam.total.ia.alors !== null" class="mboard__why-then"> (analyse faite à {{ fam.total.ia.alors }} %)</span>
            </template>
            <template v-else>{{ fam.total.simple }}</template>
          </p>
          <p v-if="fam.away" class="mboard__why">
            <TeamCrest :name="match.away" :league="match.league" :team-id="awayId" :size="14" />
            <span v-if="fam.away.pct !== null" class="mboard__meter is-inline"><span :style="{ width: `${fam.away.pct}%` }" /></span>
            <template v-if="fam.away.ia">
              <span v-if="!fam.away.ia.dejaChiffree" class="mboard__why-pct">{{ fam.away.proba }}</span>{{ fam.away.ia.texte }}<span v-if="fam.away.ia.alors !== null" class="mboard__why-then"> (analyse faite à {{ fam.away.ia.alors }} %)</span>
            </template>
            <template v-else>{{ fam.away.simple }}</template>
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mboard {
  /* Se règle sur SA largeur (comme les cartes de rencontre), pas sur l'écran. */
  container: mboard / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mboard__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mboard__title {
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------ cartes « Le match » */
.mboard__card,
.mboard__duel {
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.mboard__card:hover,
.mboard__duel:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

.mboard__card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.mboard__crest {
  display: flex;
  justify-content: center;
}

.mboard__crest .mboard__pick-crest {
  margin-right: 0;
}

.mboard__duo {
  display: inline-flex;
  align-items: center;
}

.mboard__duo-away {
  margin-left: -7px;
  box-shadow: 0 0 0 2px var(--cm-surface-alt);
}

.mboard__what {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mboard__pick {
  max-width: 100%;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mboard__market {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mboard__figures {
  display: grid;
  grid-template-columns: 58px 58px 74px;
  align-items: center;
  gap: 8px;
}

.mboard__pill {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 12.5px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mboard__pill.is-proba {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.mboard__pill.is-small {
  min-width: 46px;
  padding: 2px 7px;
  font-size: 11.5px;
}

.mboard__odds {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.mboard__odds.is-book {
  color: var(--cm-text-secondary);
}

.mboard__odds-label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* ------------------------------------------ cartes face à face */
.mboard__duel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.mboard__side {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.mboard__side.is-home {
  justify-content: flex-end;
}

.mboard__side-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.mboard__side.is-home .mboard__side-text {
  align-items: flex-end;
  text-align: right;
}

.mboard__team {
  max-width: 100%;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mboard__mini {
  display: inline-flex;
  gap: 5px;
}

.mboard__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--cm-surface-hover);
  text-align: center;
}

.mboard__center-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mboard__none {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* La phrase de l'IA : sous le pronostic (carte du match) ou en pied de la
   carte face à face, une ligne par pronostic. */
.mboard__why {
  display: block;
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.mboard__whys {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.mboard__whys .mboard__why {
  margin: 0;
}

.mboard__whys .crest {
  margin-right: 6px;
}

/* La jauge du pourcentage : une barre fine remplie à proportion. */
.mboard__meter {
  display: block;
  width: 120px;
  max-width: 100%;
  height: 4px;
  margin: 6px 0 4px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  overflow: hidden;
}

.mboard__meter > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--cm-accent);
  transition: width var(--cm-transition-slow);
}

.mboard__meter.is-inline {
  display: inline-block;
  width: 64px;
  margin: 0 8px 0 0;
  vertical-align: middle;
}

.mboard__why-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  vertical-align: 1px;
}

.mboard__why-pct {
  margin-right: 6px;
  font-weight: 700;
  color: var(--cm-accent);
  font-variant-numeric: tabular-nums;
}

.mboard__why-then {
  color: var(--cm-text-muted);
}

/* Panneau étroit : la carte du match passe ses chiffres dessous, le face à
   face s'empile (l'équipe qui reçoit, le total, l'autre équipe). */
@container mboard (max-width: 600px) {
  .mboard__card {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .mboard__figures {
    grid-column: 2;
    justify-content: start;
  }

  .mboard__duel {
    grid-template-columns: minmax(0, 1fr);
  }

  .mboard__side.is-home {
    flex-direction: row-reverse;
    justify-content: flex-end;
  }

  .mboard__side.is-home .mboard__side-text {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
