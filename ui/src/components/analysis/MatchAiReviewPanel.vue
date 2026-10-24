<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import AiLineupSnapshot from './AiLineupSnapshot.vue';
import AiMarketCard from './AiMarketCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { LIEN_VERS_LA_FIABILITE, PROVENANCE_DE_L_EXPERIENCE, groupesDeMarches, tableauDeLExperience } from '@/utils/bilanApresMatch.js';

/**
 * Onglet « Analyse IA » de la page de match : ce qui était prédit AVANT
 * (pronostic du moteur, avis de l'IA sur CHAQUE marché, commentaire général)
 * face à ce que le match a donné APRÈS (issue de chaque marché, avis de l'IA
 * validé ou à corriger, leçons), et l'expérience de l'IA par type de marché.
 *
 * Dessin refait le 02/10/2026 sur le modèle de l'onglet Analyse IA d'avant
 * match (MatchAiAnalysisPanel), puis ACHEVÉ à l'étape 45 (24/10/2026) : les
 * marchés ne sont plus des cartes à part mais la MÊME carte que l'onglet
 * d'avant-match (AiMarketCard, rangée dans les mêmes familles : Le match,
 * Buts, Corners, Tirs, Tirs cadrés), à laquelle le bilan ajoute l'issue du
 * pronostic, l'avis de l'IA tenu ou démenti, ce qui s'est passé et la leçon.
 * Le tableau de l'expérience de l'IA a son Σ et son ⌀, sa provenance réelle
 * et l'heure de sa lecture, et renvoie à la page « Bulletin » pour la
 * fiabilité championnat par championnat. Rien n'est calculé ici hors de la
 * mise en forme (utils/bilanApresMatch.js, testé sans navigateur) ; aucun
 * appel, hors le bouton « Lancer l'analyse après-match » qui existait déjà.
 */
const props = defineProps({
  match: { type: Object, required: true }, // { homeName, awayName, homeGoals, awayGoals }
  entry: { type: Object, default: null }, // analyse IA : { matchId, analysis, postMatchReview?, engineSnapshot, createdAt }
  predictions: { type: Array, default: () => [] }, // pronostics du moteur sur nos marchés
  experience: { type: Array, default: () => [] }, // bilan de l'IA par type de marché (cf. aiMarketExperience)
  // L'instant où la page a lu l'analyse et l'expérience (ISO) : l'heure de leur relevé, dite sous le tableau de l'expérience.
  lueLe: { type: String, default: null },
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false }
});

defineEmits(['run-post-match']);

const engine = computed(() => props.entry?.engineSnapshot ?? null);
const review = computed(() => props.entry?.postMatchReview ?? null);

// Probabilités du moteur, tirées de ses cotes justes (1 / cote, ramenées à 100 %).
const outcomes = computed(() => {
  const e = engine.value;
  if (!e?.trueOdds) return [];
  const brut = [
    { key: 'home', label: `${props.match.homeName} gagne`, fair: e.trueOdds.home, book: e.market?.odds1 },
    { key: 'draw', label: 'Match nul', fair: e.trueOdds.draw, book: e.market?.oddsDraw },
    { key: 'away', label: `${props.match.awayName} gagne`, fair: e.trueOdds.away, book: e.market?.odds2 }
  ].filter((o) => Number(o.fair) > 1);
  const somme = brut.reduce((s, o) => s + 1 / o.fair, 0);
  return brut.map((o) => ({ ...o, prob: 1 / o.fair / somme }));
});

const favori = computed(() => outcomes.value.reduce((best, o) => (!best || o.prob > best.prob ? o : best), null));

const resultatReel = computed(() => {
  const { homeGoals: h, awayGoals: a } = props.match;
  if (h === null || h === undefined || a === null || a === undefined) return null;
  return h > a ? 'home' : h === a ? 'draw' : 'away';
});

const favoriJuste = computed(() => (favori.value && resultatReel.value ? favori.value.key === resultatReel.value : null));

const ORDRE_MARCHES = ['Résultat', 'Total buts', 'Les 2 équipes marquent', 'Résultat + Total buts', 'Total corners', 'Total tirs', 'Total tirs cadrés'];
const rang = (marche) => (ORDRE_MARCHES.includes(marche) ? ORDRE_MARCHES.indexOf(marche) : ORDRE_MARCHES.length);

/**
 * Une ligne par marché : le pronostic que l'IA a vu (figé avec son analyse,
 * sinon celui du journal des pronostics), son avis d'avant-match, et le
 * bilan d'après-match (issue, avis tenu ou non, explication, leçon).
 */
const lignes = computed(() => {
  const vues = new Map((props.entry?.analysis?.marketViews ?? []).map((v) => [v.market, v]));
  const revues = new Map((review.value?.marketReviews ?? []).map((r) => [r.market, r]));
  const journal = new Map(props.predictions.map((p) => [p.market, p]));
  const figes = props.entry?.engineSnapshot?.marketPredictions ?? [];
  const base = figes.length
    ? figes.map((f) => ({ market: f.market, pick: f.predictedLabel, odds: f.predictedOdds, source: f }))
    : props.predictions.map((p) => ({ market: p.market, pick: p.predictedLabel, odds: p.predictedOdds, source: p }));
  return base
    .map((b) => {
      const p = journal.get(b.market);
      const r = revues.get(b.market) ?? null;
      const status = r ? (r.outcome === 'juste' ? 'correct' : r.outcome === 'faux' ? 'incorrect' : 'pending') : (p?.status ?? 'pending');
      return { ...b, action: p?.action ?? null, status, vue: vues.get(b.market) ?? null, revue: r };
    })
    .sort((a, b) => rang(a.market) - rang(b.market) || String(a.market).localeCompare(String(b.market)));
});

const bilanMarches = computed(() => {
  const bilan = { correct: 0, incorrect: 0, pending: 0 };
  for (const l of lignes.value) bilan[l.status === 'correct' || l.status === 'incorrect' ? l.status : 'pending']++;
  return bilan;
});

// Leçons par marché : validées là où l'avis de l'IA a tenu, à corriger là où
// il s'est trompé ; sans avis d'avant-match, d'après l'issue du pronostic.
const leconsValidees = computed(() => lignes.value.filter((l) => l.revue?.lesson && (l.revue.aiWasRight === true || (l.revue.aiWasRight == null && l.status === 'correct'))));
const leconsACorriger = computed(() => lignes.value.filter((l) => l.revue?.lesson && (l.revue.aiWasRight === false || (l.revue.aiWasRight == null && l.status === 'incorrect'))));

const pct = (x) => `${Math.round(x * 100)} %`;
const nombre = (x, d = 2) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
// 1,00 ou moins : pas de vraie cote relevée pour ce marché (buts par équipe) — dit, jamais un tiret.
const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? nombre(x, 2) : 'pas de cote');
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '');

const decision = computed(() => {
  const s = engine.value?.staking;
  if (!s) return null;
  return s.action === 'RECOMMENDED' ? `mise recommandée${s.stake ? ` : ${s.stake}` : ''}` : 'pas de mise';
});

// ---- présentation ---------------------------------------------------------
// La probabilité du moteur montrée en anneau sur chaque marché : celle que
// l'IA a expliquée (enregistrée avec son avis), sinon 1 / cote du pronostic.
const probaDe = (l) => {
  const p = l.vue?.probability;
  if (p !== null && p !== undefined && Number.isFinite(Number(p))) return Number(p);
  return Number(l.odds) > 1 ? Math.round(100 / Number(l.odds)) : null;
};

// Les marchés rangés par famille, comme l'onglet d'avant-match (étape 45) : la carte de chacun porte son avis d'avant-match
// (ou « pas d'avis de l'IA » quand elle n'en a donné aucun), l'issue du pronostic et le bilan de l'IA.
const familles = computed(() =>
  groupesDeMarches(
    lignes.value.map((l) => ({ ...l, carte: l.vue ?? { market: l.market, pick: l.pick, verdict: 'aucun', confidence: null, explanation: null, reasoning: null } })),
    (l) => l.source?.marketId ?? null
  )
);
const coteDe = (l) => (Number.isFinite(Number(l.odds)) ? Number(l.odds) : 0);

// L'expérience de l'IA par type de marché : toujours les onze types, avec Σ et ⌀.
const xp = computed(() => tableauDeLExperience(props.experience));

// D'un coup d'œil : combien de pronostics du moteur l'IA avait confirmés,
// nuancés, contredits (barre du bandeau, comme dans l'onglet d'avant match).
const bilanAvis = computed(() => {
  const b = { confirme: 0, nuance: 0, contredit: 0, total: 0 };
  for (const l of lignes.value) {
    if (!l.vue || b[l.vue.verdict] === undefined) continue;
    b[l.vue.verdict]++;
    b.total++;
  }
  return b;
});

// L'icône et le ton d'une clé du match d'après son thème (même grille que
// l'onglet Analyse IA d'avant match).
const sansAccents = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const THEMES = [
  [/forme|serie|dynamique/, { icone: 'activity', ton: 'accent' }],
  [/classement|rang|tableau|points/, { icone: 'award', ton: 'info' }],
  [/absen|bless|suspen|indispon/, { icone: 'userX', ton: 'danger' }],
  [/compo|onze|effectif|joueur|rotation/, { icone: 'users', ton: 'info' }],
  [/stat|moyenne|chiffre|xg|attaque|defense|tirs|corners/, { icone: 'barChart', ton: 'violet' }],
  [/edge|moteur|cote|valeur|value|marche/, { icone: 'bolt', ton: 'warning' }],
  [/domicile|exterieur|terrain|lieu/, { icone: 'target', ton: 'accent' }]
];
const themeDe = (facteur) => THEMES.find(([motif]) => motif.test(sansAccents(facteur)))?.[1] ?? { icone: 'info', ton: 'muted' };

// Où en est le bilan, pour la page et ses tests : pas d'analyse du tout, l'avant-match seul, ou le bilan fait.
const etatDuBilan = computed(() => (review.value ? 'bilan' : props.entry?.analysis ? 'avant-match-seul' : 'sans-analyse'));
</script>

<template>
  <EmptyState
    v-if="!entry && !predictions.length"
    icon="bolt"
    title="Aucune analyse IA pour ce match"
    description="L'IA analyse les matchs dans les 48 heures qui précèdent le coup d'envoi ; celui-ci n'a pas été analysé avant d'être joué."
  />

  <div v-else class="match-ai-review" data-bloc="bilan-apres-match" :data-etat="etatDuBilan">
    <!-- 1. LA LECTURE DE L'IA AVANT LE MATCH : synthèse, moment, clés, compositions. -->
    <div v-if="entry?.analysis" class="ai-group">
      <section class="ai-hero" data-section="lecture">
        <div class="ai-hero__top">
          <span class="ai-hero__brand">
            <span class="ai-hero__logo"><AppIcon name="sparkles" :size="15" /></span>
            Lecture de l'IA
          </span>
          <span class="ai-hero__chips">
            <span class="cm-chip is-section">Avant le match</span>
            <span v-if="entry.analysedAt || entry.createdAt" class="cm-chip"><AppIcon name="clock" :size="11" />Analyse du {{ jour(entry.analysedAt ?? entry.createdAt) }}</span>
            <span v-if="entry.timing === 'coup-d-envoi'" class="cm-chip" :class="entry.lineupSnapshot ? 'is-accent' : 'is-warning'">
              <AppIcon name="users" :size="11" />{{ entry.lineupSnapshot ? "avant le coup d'envoi, avec les compositions" : "avant le coup d'envoi, sans composition publiée" }}
            </span>
          </span>
        </div>

        <p class="ai-hero__summary">{{ entry.analysis.summary }}</p>

        <div v-if="bilanAvis.total" class="ai-tally">
          <div class="ai-tally__bar" :title="`${bilanAvis.confirme} confirmé(s), ${bilanAvis.nuance} nuancé(s), ${bilanAvis.contredit} contredit(s)`">
            <span v-if="bilanAvis.confirme" class="is-confirme" :style="{ flexGrow: bilanAvis.confirme }" />
            <span v-if="bilanAvis.nuance" class="is-nuance" :style="{ flexGrow: bilanAvis.nuance }" />
            <span v-if="bilanAvis.contredit" class="is-contredit" :style="{ flexGrow: bilanAvis.contredit }" />
          </div>
          <div class="ai-tally__legend">
            <span class="is-confirme"><i />{{ bilanAvis.confirme }} confirmé{{ bilanAvis.confirme > 1 ? 's' : '' }}</span>
            <span class="is-nuance"><i />{{ bilanAvis.nuance }} nuancé{{ bilanAvis.nuance > 1 ? 's' : '' }}</span>
            <span class="is-contredit"><i />{{ bilanAvis.contredit }} contredit{{ bilanAvis.contredit > 1 ? 's' : '' }}</span>
            <span class="ai-tally__total">sur {{ bilanAvis.total }} pronostic{{ bilanAvis.total > 1 ? 's' : '' }} du moteur</span>
          </div>
        </div>
      </section>

      <section v-if="entry.analysis.keyFactors?.length" class="ai-section">
        <h4 class="ai-section__title">Les clés du match</h4>
        <div class="ai-factors cm-stagger">
          <article v-for="(f, i) in entry.analysis.keyFactors" :key="i" class="ai-factor" :class="`is-${themeDe(f.factor).ton}`">
            <span class="ai-factor__icon"><AppIcon :name="themeDe(f.factor).icone" :size="17" /></span>
            <div class="ai-factor__body">
              <span class="ai-factor__title">{{ f.factor }}</span>
              <p class="ai-factor__obs">{{ f.observation }}</p>
              <p v-if="f.evidence" class="ai-factor__evidence">{{ f.evidence }}</p>
            </div>
          </article>
        </div>
      </section>

      <section v-if="entry.analysis.lineupImpact || entry.lineupSnapshot" class="ai-section">
        <h4 class="ai-section__title">Les compositions</h4>
        <div class="ai-lineups">
          <span class="cm-icon-box is-info"><AppIcon name="users" :size="18" /></span>
          <div class="ai-lineups__body">
            <p v-if="entry.analysis.lineupImpact" class="ai-lineups__text"><strong>Ce que changent les compositions : </strong>{{ entry.analysis.lineupImpact }}</p>
            <details v-if="entry.lineupSnapshot" class="ai-lineups__details">
              <summary class="ai-link"><AppIcon name="chevronRight" :size="13" class="ai-link__chevron" />Voir les compositions utilisées</summary>
              <div class="ai-lineups__pitch"><AiLineupSnapshot :snapshot="entry.lineupSnapshot" /></div>
            </details>
          </div>
        </div>
      </section>
    </div>

    <!-- 2. LE PRONOSTIC DU MATCH PAR LE MOTEUR : le 1N2 en tuiles, les buts attendus, l'écart avec le marché. -->
    <section v-if="outcomes.length" class="ai-section" data-section="moteur">
      <h4 class="ai-section__title">
        Pronostic du match (moteur)
        <span class="ai-section__hint">ses probabilités 1N2, tirées de ses cotes justes</span>
      </h4>
      <div class="ai-outcomes">
        <article v-for="o in outcomes" :key="o.key" class="ai-outcome" :class="{ 'is-favori': o.key === favori?.key }">
          <span class="ai-outcome__label">
            <PickCrest :side="o.key" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :home-id="match.homeId ?? null" :away-id="match.awayId ?? null" :size="16" reserve /><span class="cm-truncate">{{ o.label }}</span>
          </span>
          <span class="ai-outcome__prob cm-numeric">{{ pct(o.prob) }}</span>
          <span class="cm-bar"><span class="cm-bar__fill" :style="{ width: `${Math.round(o.prob * 100)}%` }" /></span>
          <span class="ai-outcome__odds">cote juste {{ cote(o.fair) }} · bookmaker {{ cote(o.book) }}</span>
          <span v-if="o.key === favori?.key" class="ai-outcome__tag">Favori</span>
        </article>
      </div>
      <div v-if="engine?.expectedGoals || (engine?.edgePercent !== null && engine?.edgePercent !== undefined)" class="ai-facts">
        <p v-if="engine?.expectedGoals" class="ai-fact">
          <span class="cm-icon-box is-sm is-info"><AppIcon name="ball" :size="14" /></span>
          <span class="ai-fact__text">
            <span class="ai-fact__label">Buts attendus</span>
            <TeamCrest :name="match.homeName" :league="match.league ?? null" :team-id="match.homeId ?? null" :size="14" /> {{ match.homeName }}
            <strong class="cm-numeric">{{ nombre(engine.expectedGoals.home) }} - {{ nombre(engine.expectedGoals.away) }}</strong> {{ match.awayName }}
            <TeamCrest :name="match.awayName" :league="match.league ?? null" :team-id="match.awayId ?? null" :size="14" />
          </span>
        </p>
        <p v-if="engine?.edgePercent !== null && engine?.edgePercent !== undefined" class="ai-fact">
          <span class="cm-icon-box is-sm is-warning"><AppIcon name="bolt" :size="14" /></span>
          <span class="ai-fact__text">
            <span class="ai-fact__label">Écart avec le marché</span>
            <strong class="cm-numeric">{{ nombre(engine.edgePercent, 1) }} %</strong><span v-if="decision"> · {{ decision }}</span>
          </span>
        </p>
      </div>
    </section>

    <!-- 3. MARCHÉ PAR MARCHÉ : la carte de l'onglet d'avant-match, rangée dans les mêmes familles, avec l'issue, ce qui s'est passé et la leçon. -->
    <section v-if="familles.length" class="ai-section" data-section="marches">
      <h4 class="ai-section__title">
        Marché par marché
        <span class="ai-section__hint">le pronostic du moteur, l'avis de l'IA avant le match, puis l'issue et la leçon</span>
      </h4>
      <div v-for="fam in familles" :key="fam.cle" class="ai-family" :data-famille="fam.cle">
        <p class="ai-family__title">{{ fam.titre }}</p>
        <div class="ai-markets cm-stagger">
          <AiMarketCard
            v-for="l in fam.lignes"
            :key="`${fam.cle}-${l.market}`"
            :view="l.carte"
            :sans-avis="!l.vue"
            :probability="probaDe(l)"
            :prediction="l.source ?? null"
            :home="match.homeName"
            :away="match.awayName"
            :league="match.league ?? null"
            :home-id="match.homeId ?? null"
            :away-id="match.awayId ?? null"
            :revue="l.revue"
            :statut="l.status"
            :cote="coteDe(l)"
            :conseille="l.action === 'RECOMMENDED'"
          />
        </div>
      </div>
    </section>

    <!-- 4. FACE AU MOTEUR, LIMITES (avant-match). -->
    <div v-if="entry?.analysis" class="ai-group">
      <section class="ai-note is-engine">
        <span class="ai-note__icon"><AppIcon name="cpu" :size="18" /></span>
        <div>
          <p class="ai-note__title">Par rapport au moteur</p>
          <p class="ai-note__text">{{ entry.analysis.alignmentWithModel }}</p>
        </div>
      </section>
      <section v-if="entry.analysis.caveats" class="ai-note is-muted">
        <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="ai-note__title">Limites de l'analyse</p>
          <p class="ai-note__text">{{ entry.analysis.caveats }}</p>
        </div>
      </section>
    </div>

    <!-- 5. APRÈS LE MATCH : le score, le favori du moteur, le bilan de nos marchés. -->
    <section class="ai-hero is-post" data-section="apres">
      <div class="ai-hero__top">
        <span class="ai-hero__brand">
          <span class="ai-hero__logo"><AppIcon name="check" :size="15" /></span>
          Après le match
        </span>
        <span v-if="lignes.length" class="ai-hero__chips">
          <span class="ai-hero__chips-label">Nos marchés :</span>
          <span class="cm-chip is-accent">{{ bilanMarches.correct }} juste(s)</span>
          <span class="cm-chip is-danger">{{ bilanMarches.incorrect }} faux</span>
          <span v-if="bilanMarches.pending" class="cm-chip">{{ bilanMarches.pending }} en attente</span>
        </span>
      </div>

      <div class="ai-score">
        <div class="ai-score__team is-home">
          <TeamCrest :name="match.homeName" :league="match.league ?? null" :team-id="match.homeId ?? null" :size="34" />
          <span class="ai-score__name">{{ match.homeName }}</span>
        </div>
        <span class="cm-pill is-strong ai-score__board">{{ match.homeGoals }} - {{ match.awayGoals }}</span>
        <div class="ai-score__team is-away">
          <TeamCrest :name="match.awayName" :league="match.league ?? null" :team-id="match.awayId ?? null" :size="34" />
          <span class="ai-score__name">{{ match.awayName }}</span>
        </div>
      </div>

      <p v-if="favori && favoriJuste !== null" class="ai-favori">
        <span class="cm-icon-box is-sm" :class="favoriJuste ? 'is-accent' : 'is-danger'"><AppIcon name="target" :size="14" /></span>
        <span class="ai-favori__text">
          <span class="ai-favori__label">Favori du moteur :</span>
          <PickCrest :side="favori.key" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :home-id="match.homeId ?? null" :away-id="match.awayId ?? null" :size="14" />{{ favori.label }} ({{ pct(favori.prob) }}) —
          <span class="ai-favori__verdict" :class="favoriJuste ? 'cm-positive' : 'cm-negative'">{{ favoriJuste ? 'juste' : 'faux' }}</span>
        </span>
      </p>
    </section>

    <!-- 6. LE BILAN DE L'IA : validé en vert, à corriger en rouge, puis sa synthèse. -->
    <template v-if="review">
      <div class="ai-duo" data-section="bilan">
        <article class="ai-duo__card is-right">
          <span class="ai-duo__title"><AppIcon name="check" :size="14" />Validé : ce que l'IA avait vu juste</span>
          <p class="ai-duo__text">{{ review.whatWasRight }}</p>
          <ul v-if="leconsValidees.length" class="ai-duo__lessons">
            <li v-for="l in leconsValidees" :key="l.market">
              <strong><PickCrest :item="l.source ?? l.pick" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :home-id="match.homeId ?? null" :away-id="match.awayId ?? null" :size="14" />{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}
            </li>
          </ul>
        </article>
        <article class="ai-duo__card is-missed">
          <span class="ai-duo__title"><AppIcon name="x" :size="14" />À corriger : ce que l'IA a manqué</span>
          <p class="ai-duo__text">{{ review.whatWasMissed }}</p>
          <ul v-if="leconsACorriger.length" class="ai-duo__lessons">
            <li v-for="l in leconsACorriger" :key="l.market">
              <strong><PickCrest :item="l.source ?? l.pick" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :home-id="match.homeId ?? null" :away-id="match.awayId ?? null" :size="14" />{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}
            </li>
          </ul>
        </article>
      </div>

      <section class="ai-section" data-section="synthese">
        <h4 class="ai-section__title">
          Synthèse
          <span v-if="review.createdAt" class="ai-section__hint">du {{ jour(review.createdAt) }}</span>
        </h4>
        <p class="ai-summary">{{ review.summary }}</p>
        <div class="ai-note is-engine">
          <span class="ai-note__icon"><AppIcon name="cpu" :size="18" /></span>
          <div>
            <p class="ai-note__title">Le résultat face au moteur</p>
            <p class="ai-note__text">{{ review.outcomeVsEngine }}</p>
          </div>
        </div>
        <div v-if="review.caveats" class="ai-note is-muted">
          <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
          <div>
            <p class="ai-note__title">Limites</p>
            <p class="ai-note__text">{{ review.caveats }}</p>
          </div>
        </div>
      </section>
    </template>

    <div v-else-if="entry?.analysis" class="ai-note is-muted" data-section="bilan-a-faire">
      <span class="ai-note__icon"><AppIcon name="sparkles" :size="16" /></span>
      <div class="ai-pending">
        <p class="ai-note__title">Après-match</p>
        <p class="ai-note__text">L'analyse après-match n'a pas encore été faite.</p>
        <AppButton v-if="connected" variant="primary" size="sm" :loading="running" @click="$emit('run-post-match')">
          <template #icon><AppIcon name="bolt" :size="14" /></template>
          Lancer l'analyse après-match
        </AppButton>
        <p v-else class="ai-pending__hint">Claude Code n'est pas configuré sur ce poste : l'analyse après-match ne peut pas être lancée.</p>
      </div>
    </div>

    <div v-else class="ai-note is-muted" data-section="sans-analyse">
      <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
      <div>
        <p class="ai-note__title">Après-match</p>
        <p class="ai-note__text">Pas d'analyse IA avant ce match : rien à confronter au résultat.</p>
      </div>
    </div>

    <!-- 7. L'EXPÉRIENCE DE L'IA, PAR MARCHÉ (tous les matchs) : toujours les onze types, Σ et ⌀, d'où ça vient. -->
    <section class="ai-section" data-section="experience">
      <h4 class="ai-section__title">
        Expérience de l'IA, par marché
        <span class="ai-section__hint">tous les matchs</span>
      </h4>
      <p class="ai-hint">
        Pronostics à la cote minimale de 1,20 (depuis le 30/09) : se remplit à chaque analyse après-match, et redonnée à l'IA avant chaque nouveau match. Sur
        peu de matchs, ce n'est pas encore significatif.
      </p>
      <div class="cm-table-wrap">
        <table class="cm-table ai-xp" data-tableau="experience-ia">
          <thead>
            <tr>
              <th>Marché</th>
              <th>Moteur juste</th>
              <th title="Avis de l'IA tenus, au survol : selon la confiance annoncée">Avis IA tenus</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in xp.lignes" :key="t.cle" :class="{ 'ai-xp__vide': t.vide }" :data-marche="t.cle">
              <td class="is-strong">{{ t.libelle }}</td>
              <td class="cm-numeric">{{ t.moteur }}</td>
              <td class="cm-numeric" :title="t.parConfiance">{{ t.ia }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="ai-xp__total">
              <td class="is-strong">Σ Tous les marchés</td>
              <td class="cm-numeric is-strong">{{ xp.total.moteur }}</td>
              <td class="cm-numeric is-strong">{{ xp.total.ia }}</td>
            </tr>
            <tr class="ai-xp__moyenne">
              <td>⌀ Par marché<template v-if="xp.moyenne.marchesMoteur || xp.moyenne.marchesIA"> (chacun pèse autant)</template></td>
              <td class="cm-numeric">{{ xp.moyenne.moteur }}</td>
              <td class="cm-numeric">{{ xp.moyenne.ia }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="ai-xp__pied">
        <ProvenanceChip
          :source="PROVENANCE_DE_L_EXPERIENCE.source"
          :releve-le="lueLe"
          :action="PROVENANCE_DE_L_EXPERIENCE.action"
          :fichier="PROVENANCE_DE_L_EXPERIENCE.fichier"
          :detail="PROVENANCE_DE_L_EXPERIENCE.detail"
          :vieux-apres-heures="null"
          variante="ligne"
        />
        <RouterLink :to="LIEN_VERS_LA_FIABILITE.to" class="cm-link ai-xp__lien" data-lien="fiabilite"><AppIcon name="arrowRight" :size="13" />{{ LIEN_VERS_LA_FIABILITE.texte }}</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.match-ai-review {
  /* Se règle sur SA largeur : une page entière comme un panneau étroit. */
  container: aireview / inline-size;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* Un groupe conditionnel de blocs : ses enfants s'alignent dans la colonne
   comme s'ils y étaient directement. */
.ai-group {
  display: contents;
}

/* ---------------------------------------------------------- bandeaux */
/* La lecture de l'IA (couleur de section) et l'après-match (bleu information). */
.ai-hero {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid rgba(var(--cm-section-rgb) / 0.22);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-section-rgb) / 0.12), transparent 55%),
    radial-gradient(120% 140% at 100% 100%, var(--cm-section-glow-2), transparent 55%),
    var(--cm-surface-alt);
}

.ai-hero.is-post {
  border-color: rgba(var(--cm-info-rgb) / 0.25);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-info-rgb) / 0.12), transparent 55%),
    var(--cm-surface-alt);
}

.ai-hero__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.ai-hero__brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-primary);
}

.ai-hero__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.6));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

.ai-hero.is-post .ai-hero__logo {
  background: linear-gradient(135deg, var(--cm-info), rgba(var(--cm-info-rgb) / 0.6));
  color: var(--cm-bg);
  box-shadow: 0 4px 14px rgba(var(--cm-info-rgb) / 0.3);
}

.ai-hero__chips {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-hero__chips-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cm-text-muted);
}

.ai-hero__summary {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: var(--cm-text-primary);
}

/* Combien de pronostics l'IA avait confirmés, nuancés, contredits. */
.ai-tally {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-tally__bar {
  display: flex;
  gap: 3px;
  height: 8px;
}

.ai-tally__bar span {
  min-width: 6px;
  border-radius: 999px;
}

.is-confirme > i,
.ai-tally__bar .is-confirme {
  background: var(--cm-accent);
}

.is-nuance > i,
.ai-tally__bar .is-nuance {
  background: var(--cm-warning);
}

.is-contredit > i,
.ai-tally__bar .is-contredit {
  background: var(--cm-danger);
}

.ai-tally__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.ai-tally__legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ai-tally__legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.ai-tally__total {
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* Le score du match, comme sur une carte de rencontre. */
.ai-score {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}

.ai-score__team {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ai-score__team.is-home {
  flex-direction: row-reverse;
  text-align: right;
}

.ai-score__name {
  min-width: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--cm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-score__board {
  padding: 6px 16px;
  border-radius: 12px;
  font-size: 24px;
  letter-spacing: 0.02em;
}

.ai-favori {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 13px;
  color: var(--cm-text-primary);
}

.ai-favori__text {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 4px;
}

.ai-favori__label {
  margin-right: 2px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ai-favori__verdict {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

/* ---------------------------------------------------------- sections */
.ai-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-section__title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.ai-section__hint {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--cm-text-muted);
}

.ai-hint {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* ----------------------------------------------------- clés du match */
.ai-factors {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ai-factor {
  --ton: var(--cm-text-secondary);
  --ton-doux: var(--cm-surface-hover);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ai-factor.is-accent {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
}

.ai-factor.is-info {
  --ton: var(--cm-info);
  --ton-doux: var(--cm-info-soft);
}

.ai-factor.is-warning {
  --ton: var(--cm-warning);
  --ton-doux: var(--cm-warning-soft);
}

.ai-factor.is-danger {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}

.ai-factor.is-violet {
  --ton: var(--cm-violet);
  --ton-doux: var(--cm-violet-soft);
}

.ai-factor__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--ton-doux);
  color: var(--ton);
}

.ai-factor__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-factor__title {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ton);
}

.ai-factor__obs {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.ai-factor__evidence {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------ compositions */
.ai-lineups {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ai-lineups__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ai-lineups__text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.ai-lineups__text strong {
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.ai-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 0;
  border: 0;
  background: none;
  list-style: none;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
  cursor: pointer;
}

.ai-link::-webkit-details-marker {
  display: none;
}

.ai-link:hover {
  text-decoration: underline;
}

.ai-link__chevron {
  transition: transform var(--cm-transition);
}

.ai-lineups__details[open] .ai-link__chevron {
  transform: rotate(90deg);
}

.ai-lineups__pitch {
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
}

/* ------------------------------------------------ pronostic du moteur */
.ai-outcomes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ai-outcome {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* Le favori du moteur : liseré et chiffre en couleur de section. */
.ai-outcome.is-favori {
  border-color: rgba(var(--cm-section-rgb) / 0.3);
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.1), transparent), var(--cm-surface-alt);
}

.ai-outcome__label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.ai-outcome__prob {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--cm-text-primary);
}

.ai-outcome.is-favori .ai-outcome__prob {
  color: var(--cm-section);
}

/* De la place pour l'étiquette « Favori » posée en haut à droite. */
.ai-outcome.is-favori .ai-outcome__label {
  padding-right: 56px;
}

.ai-outcome .cm-bar__fill {
  background: var(--cm-text-muted);
}

.ai-outcome.is-favori .cm-bar__fill {
  background: var(--cm-section);
}

.ai-outcome__odds {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.ai-outcome__tag {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.ai-facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ai-fact {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 13px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.ai-fact__text {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  min-width: 0;
}

.ai-fact__label {
  margin-right: 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ai-fact strong {
  font-weight: 800;
}

/* ------------------------------------------------- marché par marché */
.ai-family {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-family__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ai-family__title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--cm-border-soft);
}

.ai-markets {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}

/* --------------------------------------------- face au moteur, limites */
.ai-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ai-note.is-engine {
  border-color: rgba(var(--cm-warning-rgb) / 0.25);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-warning-rgb) / 0.08), transparent 55%),
    var(--cm-surface-alt);
}

.ai-note__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}

.ai-note.is-engine .ai-note__icon {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.ai-note__title {
  margin: 0 0 3px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.ai-note.is-engine .ai-note__title {
  color: var(--cm-warning);
}

.ai-note__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.ai-note.is-muted .ai-note__text {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* L'après-match pas encore fait : le bouton sous la phrase. */
.ai-pending {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.ai-pending__hint {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------- après-match */
.ai-duo {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ai-duo__card {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  border-top: 3px solid var(--ton);
  background: var(--cm-surface-alt);
}

.ai-duo__card.is-missed {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}

.ai-duo__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ton);
}

.ai-duo__text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

/* Les leçons par marché, une par ligne, dans le ton de la carte. */
.ai-duo__lessons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.ai-duo__lessons li {
  padding: 8px 12px;
  border-left: 3px solid var(--ton);
  border-radius: 0 10px 10px 0;
  background: var(--ton-doux);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.ai-duo__lessons strong {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-summary {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

/* ------------------------------------------------- l'expérience de l'IA */
.ai-xp td {
  font-size: 12.5px;
}

.ai-xp__vide td {
  color: var(--cm-text-muted);
}

.ai-xp__total td {
  border-top: 1px solid var(--cm-border);
}

.ai-xp__moyenne td {
  color: var(--cm-text-secondary);
}

.ai-xp__pied {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.ai-xp__lien {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}

/* ------------------------------------------------- selon la largeur */
/* Assez de place : clés, bilan et faits sur deux colonnes. */
@container aireview (min-width: 760px) {
  .ai-factors,
  .ai-duo,
  .ai-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container aireview (min-width: 980px) {
  .ai-markets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : tout s'empile. */
@container aireview (max-width: 560px) {
  .ai-hero {
    padding: 14px;
  }

  .ai-hero__summary {
    font-size: 13.5px;
  }

  .ai-outcomes {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-score {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 10px;
  }

  .ai-score__team.is-home {
    flex-direction: row;
    text-align: left;
  }
}
</style>
