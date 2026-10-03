<script setup>
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import AiLineupSnapshot from './AiLineupSnapshot.vue';
import ProbabilityRing from './ProbabilityRing.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';

/**
 * Onglet « Analyse IA » de la page de match : ce qui était prédit AVANT
 * (pronostic du moteur, avis de l'IA sur CHAQUE marché, commentaire général)
 * face à ce que le match a donné APRÈS (issue de chaque marché, avis de l'IA
 * validé ou à corriger, leçons), et l'expérience de l'IA par type de marché.
 *
 * Dessin refait le 02/10/2026 sur le modèle de l'onglet Analyse IA d'avant
 * match (MatchAiAnalysisPanel) : la lecture de l'IA en bandeau, les clés du
 * match en cartes à icône, le 1N2 du moteur en tuiles, chaque marché en carte
 * dépliable (anneau de probabilité, pronostic, avis, issue, leçon), puis
 * l'après-match : score, « validé » en vert / « à corriger » en rouge,
 * synthèse, et l'expérience de l'IA en tableau. Mêmes données qu'avant.
 */
const props = defineProps({
  match: { type: Object, required: true }, // { homeName, awayName, homeGoals, awayGoals }
  entry: { type: Object, default: null }, // analyse IA : { matchId, analysis, postMatchReview?, engineSnapshot, createdAt }
  predictions: { type: Array, default: () => [] }, // pronostics du moteur sur nos marchés
  experience: { type: Array, default: () => [] }, // bilan de l'IA par type de marché (cf. aiMarketExperience)
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

// Les cinq types de marché, toujours affichés : « — » tant qu'aucun match du
// type n'a été réglé sous la règle actuelle (cote minimale, cf. markets.js).
const TYPES_DE_MARCHE = [
  ['result', 'Résultat'],
  ['totalGoals', 'Total buts'],
  ['bothTeamsScore', 'Les 2 équipes marquent'],
  ['resultAndTotal', 'Résultat + Total buts'],
  ['teamGoals', "Buts d'une équipe"],
  ['totalCorners', 'Total corners'],
  ['teamCorners', "Corners d'une équipe"],
  ['totalShots', 'Total tirs'],
  ['teamShots', "Tirs d'une équipe"],
  ['totalShotsOnTarget', 'Total tirs cadrés'],
  ['teamShotsOnTarget', "Tirs cadrés d'une équipe"]
];
const experienceComplete = computed(() =>
  TYPES_DE_MARCHE.map(
    ([marketType, label]) =>
      props.experience.find((t) => t.marketType === marketType) ?? { marketType, label, matches: 0, engineRight: 0, aiVerdicts: 0, aiRight: 0, byConfidence: {} }
  )
);

const VERDICTS = { confirme: 'Confirme', nuance: 'Nuance', contredit: 'Contredit' };
const avisTenu = (r) => (r?.aiWasRight === true ? 'IA juste' : r?.aiWasRight === false ? 'IA fausse' : null);
const ratio = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '—');
// Au survol : les avis tenus selon la confiance que l'IA avait annoncée.
const parConfiance = (t) =>
  ['forte', 'moyenne', 'faible']
    .filter((c) => t.byConfidence?.[c]?.verdicts)
    .map((c) => `Confiance ${c} : ${t.byConfidence[c].right}/${t.byConfidence[c].verdicts}`)
    .join(' · ') || null;

const statut = (s) => (s === 'correct' ? 'Juste' : s === 'incorrect' ? 'Faux' : 'En attente');
const pct = (x) => `${Math.round(x * 100)} %`;
// 1,00 ou moins : pas de vraie cote relevée pour ce marché (buts par équipe).
const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? Number(x).toFixed(2) : '—');
const nombre = (x, d = 2) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '');

const decision = computed(() => {
  const s = engine.value?.staking;
  if (!s) return null;
  return s.action === 'RECOMMENDED' ? `mise recommandée${s.stake ? ` : ${s.stake}` : ''}` : 'pas de mise';
});

// ---- présentation (refonte du 02/10/2026) ---------------------------------
// La probabilité du moteur montrée en anneau sur chaque marché : celle que
// l'IA a expliquée (enregistrée avec son avis), sinon 1 / cote du pronostic.
const probaDe = (l) => {
  const p = l.vue?.probability;
  if (p !== null && p !== undefined && Number.isFinite(Number(p))) return Number(p);
  return Number(l.odds) > 1 ? Math.round(100 / Number(l.odds)) : null;
};

// D'un coup d'œil : combien de pronostics du moteur l'IA avait confirmés,
// nuancés, contredits (barre du bandeau, comme dans l'onglet d'avant-match).
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
// l'onglet Analyse IA d'avant-match).
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

// Le ton d'une leçon : vert si l'avis de l'IA a tenu, rouge s'il a été
// démenti, bleu (information) quand elle n'avait pas donné d'avis.
const tonLecon = (r) => (r?.aiWasRight === true ? 'is-ok' : r?.aiWasRight === false ? 'is-ko' : '');
</script>

<template>
  <EmptyState
    v-if="!entry && !predictions.length"
    icon="bolt"
    title="Aucune analyse IA pour ce match"
    description="L'IA analyse les matchs dans les 48 heures qui précèdent le coup d'envoi ; celui-ci n'a pas été analysé avant d'être joué."
  />

  <div v-else class="match-ai-review">
    <!-- 1. LA LECTURE DE L'IA AVANT LE MATCH : synthèse, moment, clés, compositions. -->
    <div v-if="entry?.analysis" class="ai-group">
      <section class="ai-hero">
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
        <h4 class="cm-section-title">Les clés du match</h4>
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
        <h4 class="cm-section-title">Les compositions</h4>
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
    <section v-if="outcomes.length" class="ai-section">
      <h4 class="cm-section-title">
        Pronostic du match (moteur)
        <span class="cm-section-title__hint">ses probabilités 1N2, tirées de ses cotes justes</span>
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

    <!-- 3. NOS MARCHÉS, UN PAR UN : pronostic, avis de l'IA, issue ; le détail se déplie. -->
    <section v-if="lignes.length" class="ai-section">
      <h4 class="cm-section-title">
        Nos marchés, un par un
        <span class="cm-section-title__hint">Pronostic du moteur, avis de l'IA avant le match, puis issue. Cliquez un marché pour le détail.</span>
      </h4>
      <div class="ai-markets cm-stagger">
        <details
          v-for="l in lignes"
          :key="l.market"
          class="ai-mk"
          :class="[`is-${l.status === 'correct' || l.status === 'incorrect' ? l.status : 'pending'}`, { 'is-static': !l.vue && !l.revue }]"
        >
          <summary class="ai-mk__head">
            <ProbabilityRing :value="probaDe(l)" :size="50" />
            <span class="ai-mk__what">
              <span class="ai-mk__market">{{ l.market }}</span>
              <span class="ai-mk__pick">
                <PickCrest :item="l.source ?? l.pick" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :home-id="match.homeId ?? null" :away-id="match.awayId ?? null" :size="18" />{{ l.pick }}
              </span>
              <span class="ai-mk__meta">
                <span class="cm-pill ai-mk__odds cm-numeric" title="Cote du pronostic">{{ cote(l.odds) }}</span>
                <span v-if="l.action === 'RECOMMENDED'" class="cm-chip is-info ai-mk__advised" title="Mise recommandée par le moteur">conseillé</span>
              </span>
            </span>
            <span class="ai-mk__badges">
              <span class="ai-mk__status">
                <AppIcon v-if="l.status === 'correct'" name="check" :size="11" />
                <AppIcon v-else-if="l.status === 'incorrect'" name="x" :size="11" />
                {{ statut(l.status) }}
              </span>
              <span class="ai-mk__verdict" :class="l.vue ? `is-${l.vue.verdict}` : ''" :title="l.vue ? `Confiance ${l.vue.confidence}` : 'Pas d\'avis de l\'IA sur ce marché'">
                <AppIcon name="sparkles" :size="10" />{{ l.vue ? VERDICTS[l.vue.verdict] ?? l.vue.verdict : '—' }}
              </span>
            </span>
            <span class="ai-mk__chevron"><AppIcon name="chevronDown" :size="14" /></span>
          </summary>

          <div v-if="l.vue || l.revue" class="ai-mk__body">
            <p v-if="l.vue?.explanation" class="ai-mk__text">
              <strong>Pourquoi {{ l.vue.probability ?? '' }}{{ l.vue.probability != null ? ' %' : 'ce pourcentage' }} : </strong>{{ l.vue.explanation }}
            </p>
            <blockquote v-if="l.vue" class="ai-mk__quote" :class="`is-${l.vue.verdict}`">
              <span class="ai-mk__quote-label">Avant le match ({{ (VERDICTS[l.vue.verdict] ?? l.vue.verdict).toLowerCase() }}, confiance {{ l.vue.confidence }})</span>
              {{ l.vue.reasoning }}
            </blockquote>
            <p v-if="l.revue?.explanation" class="ai-mk__text"><strong>Ce qui s'est passé : </strong>{{ l.revue.explanation }}</p>
            <blockquote v-if="l.revue?.lesson" class="ai-mk__quote is-lesson" :class="tonLecon(l.revue)">
              <span class="ai-mk__quote-label">{{ avisTenu(l.revue) ? `${avisTenu(l.revue)} — leçon` : 'Leçon' }}</span>
              {{ l.revue.lesson }}
            </blockquote>
          </div>
        </details>
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
    <section class="ai-hero is-post">
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
      <div class="ai-duo">
        <article class="ai-duo__card is-right">
          <span class="ai-duo__title"><AppIcon name="check" :size="14" />Validé : ce que l'IA avait vu juste</span>
          <p class="ai-duo__text">{{ review.whatWasRight }}</p>
          <ul v-if="leconsValidees.length" class="ai-duo__lessons">
            <li v-for="l in leconsValidees" :key="l.market">
              <strong><PickCrest :item="l.source ?? l.pick" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :size="14" />{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}
            </li>
          </ul>
        </article>
        <article class="ai-duo__card is-missed">
          <span class="ai-duo__title"><AppIcon name="x" :size="14" />À corriger : ce que l'IA a manqué</span>
          <p class="ai-duo__text">{{ review.whatWasMissed }}</p>
          <ul v-if="leconsACorriger.length" class="ai-duo__lessons">
            <li v-for="l in leconsACorriger" :key="l.market">
              <strong><PickCrest :item="l.source ?? l.pick" :home="match.homeName" :away="match.awayName" :league="match.league ?? null" :size="14" />{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}
            </li>
          </ul>
        </article>
      </div>

      <section class="ai-section">
        <h4 class="cm-section-title">
          Synthèse
          <span v-if="review.createdAt" class="cm-section-title__hint">du {{ jour(review.createdAt) }}</span>
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

    <div v-else-if="entry?.analysis" class="ai-note is-muted">
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

    <div v-else class="ai-note is-muted">
      <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
      <div>
        <p class="ai-note__title">Après-match</p>
        <p class="ai-note__text">Pas d'analyse IA avant ce match : rien à confronter au résultat.</p>
      </div>
    </div>

    <!-- 7. L'EXPÉRIENCE DE L'IA, PAR MARCHÉ (tous les matchs). -->
    <section class="ai-section">
      <h4 class="cm-section-title">
        Expérience de l'IA, par marché
        <span class="cm-section-title__hint">tous les matchs</span>
      </h4>
      <p class="ai-hint">
        Pronostics à la cote minimale de 1,20 (depuis le 30/09) : se remplit à chaque analyse après-match, et redonnée à l'IA avant chaque nouveau match. Sur
        peu de matchs, ce n'est pas encore significatif.
      </p>
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead>
            <tr>
              <th>Marché</th>
              <th>Moteur juste</th>
              <th title="Avis de l'IA tenus, au survol : selon la confiance annoncée">Avis IA tenus</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="t in experienceComplete" :key="t.marketType">
              <tr>
                <td class="is-strong">{{ t.label }}</td>
                <td class="cm-numeric">{{ ratio(t.engineRight, t.matches) }}</td>
                <td class="cm-numeric" :title="parConfiance(t)">{{ ratio(t.aiRight, t.aiVerdicts) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
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
  font-size: 9.5px;
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
.ai-markets {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}

/* Une carte par marché, dépliable : même dessin que les cartes de l'onglet
   d'avant-match (anneau, pronostic, verdict), plus l'issue et la leçon. */
.ai-mk {
  --ton: var(--cm-text-muted);
  --ton-doux: var(--cm-surface-hover);
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: linear-gradient(180deg, rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1)), transparent), var(--cm-surface-alt);
  transition: border-color var(--cm-transition);
}

.ai-mk:hover {
  border-color: var(--cm-border);
}

/* Le liseré de gauche dit l'issue : vert juste, rouge faux. */
.ai-mk.is-correct {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
  box-shadow: inset 3px 0 0 var(--cm-accent);
}

.ai-mk.is-incorrect {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
  box-shadow: inset 3px 0 0 var(--cm-danger);
}

.ai-mk__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  list-style: none;
  cursor: pointer;
}

.ai-mk__head::-webkit-details-marker {
  display: none;
}

.ai-mk.is-static .ai-mk__head {
  cursor: default;
}

.ai-mk.is-static .ai-mk__chevron {
  visibility: hidden;
}

.ai-mk__what {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-mk__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ai-mk__pick {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cm-text-primary);
}

.ai-mk__meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-mk__odds {
  min-width: 0;
  padding: 2px 8px;
  font-size: 11.5px;
}

.ai-mk__advised {
  padding: 1px 8px;
  font-size: 10px;
}

.ai-mk__badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.ai-mk__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--ton-doux);
  color: var(--ton);
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}

.ai-mk__verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.ai-mk__verdict.is-confirme {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ai-mk__verdict.is-nuance {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.ai-mk__verdict.is-contredit {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ai-mk__chevron {
  display: inline-flex;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition);
}

.ai-mk[open] .ai-mk__chevron {
  transform: rotate(180deg);
}

.ai-mk__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 16px;
  padding: 12px 0 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-mk__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.ai-mk__text strong {
  font-weight: 700;
  color: var(--cm-text-secondary);
}

/* L'avis d'avant-match (ton du verdict) et la leçon (tenue : vert, démentie :
   rouge, sans avis : bleu). */
.ai-mk__quote {
  --quote: var(--cm-info);
  --quote-doux: var(--cm-info-soft);
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--quote);
  border-radius: 0 10px 10px 0;
  background: var(--quote-doux);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.ai-mk__quote.is-confirme,
.ai-mk__quote.is-ok {
  --quote: var(--cm-accent);
  --quote-doux: var(--cm-accent-soft);
}

.ai-mk__quote.is-nuance {
  --quote: var(--cm-warning);
  --quote-doux: var(--cm-warning-soft);
}

.ai-mk__quote.is-contredit,
.ai-mk__quote.is-ko {
  --quote: var(--cm-danger);
  --quote-doux: var(--cm-danger-soft);
}

.ai-mk__quote-label {
  display: block;
  margin-bottom: 2px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--quote);
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

/* Panneau étroit : tout s'empile, les badges d'un marché passent sous son pronostic. */
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

  .ai-mk__head {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px 12px;
  }

  .ai-mk__chevron {
    grid-area: 1 / 3;
  }

  .ai-mk__badges {
    grid-column: 2 / -1;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
}
</style>
