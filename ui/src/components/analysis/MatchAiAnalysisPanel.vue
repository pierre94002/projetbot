<script setup>
import { computed, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AiLineupSnapshot from './AiLineupSnapshot.vue';
import AiMarketCard from './AiMarketCard.vue';
import PickCrest from '@/components/matches/PickCrest.vue';

/**
 * L'analyse de l'IA d'un match, avant puis après — refaite le 01/10/2026 à
 * la demande de Pierre : « c'est la partie la plus importante de
 * l'application, il faut que ça soit vraiment joli » et lisible.
 *
 * De haut en bas : la lecture du match (synthèse, moment de l'analyse,
 * composition lue, et d'un coup d'œil combien de pronostics l'IA confirme,
 * nuance ou contredit) ; les clés du match en cartes ; les compositions
 * (terrain à la demande) ; chaque marché en carte, par famille, avec la
 * probabilité du moteur en anneau, la phrase qui l'explique et l'avis de
 * l'IA ; puis face au moteur et les limites. L'après-match reprend le même
 * dessin : ce qui a été bien anticipé, ce qui a été manqué, marché par marché.
 */
const props = defineProps({
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  entry: { type: Object, default: null }, // { analysis, postMatchReview? } | null
  // false dans Historique moteur : le match est déjà joué, proposer de
  // lancer une analyse "avant-match" n'a plus de sens à ce stade.
  allowPreMatch: { type: Boolean, default: true },
  // false dans Historique moteur tant que le score n'est pas saisi : le
  // bouton "après-match" échouerait côté serveur (résultat requis), donc on
  // affiche un message d'attente à la place plutôt qu'un bouton voué à échouer.
  hasResult: { type: Boolean, default: true }
});

defineEmits(['run-pre-match', 'run-post-match']);

const analyse = computed(() => props.entry?.analysis ?? null);
const revue = computed(() => props.entry?.postMatchReview ?? null);
const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ----------------------------------------------------- lecture du match
const vues = computed(() => analyse.value?.marketViews ?? []);
const bilan = computed(() => {
  const b = { confirme: 0, nuance: 0, contredit: 0 };
  for (const v of vues.value) if (b[v.verdict] !== undefined) b[v.verdict]++;
  return { ...b, total: vues.value.length };
});

const moment = computed(() => (props.entry?.timing === 'coup-d-envoi' ? "Avant le coup d'envoi" : 'Avant-match'));
const compo = computed(() => {
  const s = props.entry?.lineupSnapshot;
  if (!s) return { libelle: 'Sans composition', ton: 'muted' };
  if (s.source === 'magasin') return { libelle: 'Dernières compositions alignées', ton: 'warning' };
  return { libelle: 'Compositions du match', ton: 'accent' };
});
const sourceCompo = computed(() => {
  const s = props.entry?.lineupSnapshot;
  if (!s) return "Aucune composition n'était connue au moment de l'analyse.";
  if (s.source === 'magasin') {
    return "FotMob n'avait pas encore publié la composition du match : l'IA a lu la dernière composition alignée par chaque équipe, avec les absents déjà annoncés.";
  }
  const minutes = Number(s.minutesBeforeKickoff);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes <= 60
      ? `Composition du match publiée par FotMob, relue ${minutes} min avant le coup d'envoi.`
      : `Composition publiée par FotMob ${Math.round(minutes / 60)} h avant le coup d'envoi : elle peut encore changer.`;
  }
  return 'Composition du match publiée par FotMob.';
});
const voirTerrain = ref(false);

// ------------------------------------------------------ clés du match
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
const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// --------------------------------------------------- marché par marché
const FAMILLES = [
  { cle: 'match', titre: 'Le match', ids: ['result', 'resultAndTotal', 'bothTeamsScore'] },
  { cle: 'buts', titre: 'Buts', ids: ['totalGoals', 'teamGoals'] },
  { cle: 'corners', titre: 'Corners', ids: ['totalCorners', 'teamCorners'] },
  { cle: 'tirs', titre: 'Tirs', ids: ['totalShots', 'teamShots'] },
  { cle: 'cadres', titre: 'Tirs cadrés', ids: ['totalShotsOnTarget', 'teamShotsOnTarget'] }
];
const cleMarche = (t) =>
  sansAccents(t)
    .replace(/[‐-―-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
const pronosticDe = (v) => (props.entry?.engineSnapshot?.marketPredictions ?? []).find((m) => cleMarche(m.market) === cleMarche(v?.market)) ?? null;

// Le pourcentage du moteur que l'IA explique : enregistré avec son avis
// (depuis le 01/10/2026), sinon celui du pronostic figé avec l'analyse.
function probaDe(v) {
  if (v?.probability !== null && v?.probability !== undefined && Number.isFinite(Number(v.probability))) return Number(v.probability);
  const p = pronosticDe(v);
  return Number(p?.predictedOdds) > 1 ? Math.round(100 / Number(p.predictedOdds)) : null;
}

const familles = computed(() => {
  const groupes = FAMILLES.map((f) => ({ ...f, lignes: [] }));
  const autres = { cle: 'autres', titre: 'Autres marchés', lignes: [] };
  for (const v of vues.value) {
    const p = pronosticDe(v);
    const groupe = groupes.find((f) => p && f.ids.includes(p.marketId)) ?? autres;
    groupe.lignes.push({ v, p, proba: probaDe(v) });
  }
  return [...groupes, autres].filter((g) => g.lignes.length);
});

// ------------------------------------------------------- après-match
const ISSUES = { juste: 'Pronostic juste', faux: 'Pronostic faux' };
const avisTenu = (r) => (r.aiWasRight === true ? 'Avis de l’IA tenu' : r.aiWasRight === false ? 'Avis de l’IA démenti' : null);
const bilanRevue = computed(() => {
  const liste = revue.value?.marketReviews ?? [];
  return { justes: liste.filter((r) => r.outcome === 'juste').length, faux: liste.filter((r) => r.outcome === 'faux').length, total: liste.length };
});
</script>

<template>
  <div class="match-ai">
    <!-- Une analyse déjà faite reste lisible même si Claude Code n'est plus connecté : seul le lancement en dépend. -->
    <template v-if="!analyse">
      <div class="ai-empty">
        <span class="ai-empty__logo"><AppIcon name="sparkles" :size="22" /></span>
        <template v-if="!connected">
          <p class="ai-empty__title">L'analyse de l'IA n'est pas disponible</p>
          <p class="ai-empty__text">
            Claude Code n'est pas configuré — il manque le jeton <code>CLAUDE_CODE_OAUTH_TOKEN</code> dans <code>server/.env</code> (obtenu une fois via
            <code>claude setup-token</code>). Inclus dans votre abonnement, sans coût supplémentaire.
          </p>
        </template>
        <template v-else-if="allowPreMatch">
          <p class="ai-empty__title">Pas encore d'analyse pour ce match</p>
          <p class="ai-empty__text">
            L'IA lit la forme des deux équipes, leurs statistiques et leurs moyennes, les compositions, puis explique chaque pourcentage du moteur, marché par
            marché.
          </p>
          <AppButton variant="primary" size="sm" :loading="running" @click="$emit('run-pre-match')">
            <template #icon><AppIcon name="sparkles" :size="14" /></template>
            Lancer l'analyse IA
          </AppButton>
        </template>
        <template v-else>
          <p class="ai-empty__title">Aucune analyse avant-match</p>
          <p class="ai-empty__text">L'analyse après-match demande une analyse avant-match préalable.</p>
        </template>
      </div>
    </template>

    <template v-else>
      <!-- 1. LA LECTURE DU MATCH -->
      <section class="ai-hero">
        <div class="ai-hero__top">
          <span class="ai-hero__brand">
            <span class="ai-hero__logo"><AppIcon name="sparkles" :size="15" /></span>
            Lecture de l'IA
          </span>
          <span class="ai-hero__chips">
            <span class="ai-chip"><AppIcon name="clock" :size="11" />{{ moment }}<template v-if="entry.analysedAt || entry.createdAt"> · {{ quand(entry.analysedAt ?? entry.createdAt) }}</template></span>
            <span class="ai-chip" :class="`is-${compo.ton}`"><AppIcon name="users" :size="11" />{{ compo.libelle }}</span>
          </span>
        </div>

        <p class="ai-hero__summary">{{ analyse.summary }}</p>

        <div v-if="bilan.total" class="ai-tally">
          <div class="ai-tally__bar" :title="`${bilan.confirme} confirmé(s), ${bilan.nuance} nuancé(s), ${bilan.contredit} contredit(s)`">
            <span v-if="bilan.confirme" class="is-confirme" :style="{ flexGrow: bilan.confirme }" />
            <span v-if="bilan.nuance" class="is-nuance" :style="{ flexGrow: bilan.nuance }" />
            <span v-if="bilan.contredit" class="is-contredit" :style="{ flexGrow: bilan.contredit }" />
          </div>
          <div class="ai-tally__legend">
            <span class="is-confirme"><i />{{ bilan.confirme }} confirmé{{ bilan.confirme > 1 ? 's' : '' }}</span>
            <span class="is-nuance"><i />{{ bilan.nuance }} nuancé{{ bilan.nuance > 1 ? 's' : '' }}</span>
            <span class="is-contredit"><i />{{ bilan.contredit }} contredit{{ bilan.contredit > 1 ? 's' : '' }}</span>
            <span class="ai-tally__total">sur {{ pluriel(bilan.total, 'pronostic') }} du moteur</span>
          </div>
        </div>

        <p v-if="entry.earlierAnalysis" class="ai-hero__note">
          Remplace l'analyse de la veille ({{ quand(entry.earlierAnalysis.analysedAt) }}), faite sans la composition du match.
        </p>
      </section>

      <!-- 2. LES CLÉS DU MATCH -->
      <section v-if="analyse.keyFactors?.length" class="ai-section">
        <h4 class="ai-section__title">Les clés du match</h4>
        <div class="ai-factors">
          <article v-for="(f, i) in analyse.keyFactors" :key="i" class="ai-factor" :class="`is-${themeDe(f.factor).ton}`">
            <span class="ai-factor__icon"><AppIcon :name="themeDe(f.factor).icone" :size="17" /></span>
            <div class="ai-factor__body">
              <span class="ai-factor__title">{{ capitaliser(f.factor) }}</span>
              <p class="ai-factor__obs">{{ f.observation }}</p>
              <p v-if="f.evidence" class="ai-factor__evidence">{{ f.evidence }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- 3. LES COMPOSITIONS -->
      <section v-if="analyse.lineupImpact || entry.lineupSnapshot" class="ai-section">
        <h4 class="ai-section__title">Les compositions</h4>
        <div class="ai-lineups">
          <span class="ai-lineups__icon"><AppIcon name="users" :size="18" /></span>
          <div class="ai-lineups__body">
            <p class="ai-lineups__source">{{ sourceCompo }}</p>
            <p v-if="analyse.lineupImpact" class="ai-lineups__text">{{ analyse.lineupImpact }}</p>
            <button v-if="entry.lineupSnapshot" type="button" class="ai-link" @click="voirTerrain = !voirTerrain">
              <AppIcon name="chevronRight" :size="13" class="ai-link__chevron" :class="{ 'is-open': voirTerrain }" />
              {{ voirTerrain ? 'Masquer le terrain' : 'Voir les compositions sur le terrain' }}
            </button>
          </div>
        </div>
        <div v-if="voirTerrain && entry.lineupSnapshot" class="ai-lineups__pitch">
          <AiLineupSnapshot :snapshot="entry.lineupSnapshot" pitch />
        </div>
      </section>

      <!-- 4. MARCHÉ PAR MARCHÉ -->
      <section v-if="familles.length" class="ai-section">
        <h4 class="ai-section__title">
          Marché par marché
          <span class="ai-section__hint">la probabilité du moteur, ce qui l'explique, l'avis de l'IA</span>
        </h4>
        <div v-for="fam in familles" :key="fam.cle" class="ai-family">
          <p class="ai-family__title">{{ fam.titre }}</p>
          <div class="ai-markets">
            <AiMarketCard
              v-for="(l, i) in fam.lignes"
              :key="`${fam.cle}-${i}-${l.v.market}`"
              :view="l.v"
              :probability="l.proba"
              :prediction="l.p"
              :home="entry.homeName"
              :away="entry.awayName"
              :league="entry.league ?? null"
            />
          </div>
        </div>
      </section>

      <!-- 5. FACE AU MOTEUR, LIMITES -->
      <section v-if="analyse.alignmentWithModel" class="ai-note is-engine">
        <span class="ai-note__icon"><AppIcon name="cpu" :size="18" /></span>
        <div>
          <p class="ai-note__title">Face au moteur</p>
          <p class="ai-note__text">{{ analyse.alignmentWithModel }}</p>
        </div>
      </section>
      <section v-if="analyse.caveats" class="ai-note is-muted">
        <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="ai-note__title">Limites de l'analyse</p>
          <p class="ai-note__text">{{ analyse.caveats }}</p>
        </div>
      </section>

      <!-- 6. APRÈS LE MATCH -->
      <template v-if="revue">
        <section class="ai-hero is-post">
          <div class="ai-hero__top">
            <span class="ai-hero__brand">
              <span class="ai-hero__logo"><AppIcon name="check" :size="15" /></span>
              Après le match
            </span>
            <span v-if="bilanRevue.total" class="ai-hero__chips">
              <span class="ai-chip is-accent">{{ bilanRevue.justes }} juste{{ bilanRevue.justes > 1 ? 's' : '' }}</span>
              <span class="ai-chip is-danger">{{ bilanRevue.faux }} faux</span>
              <span class="ai-chip">sur {{ pluriel(bilanRevue.total, 'marché') }}</span>
            </span>
          </div>
          <p class="ai-hero__summary">{{ revue.summary }}</p>
        </section>

        <div class="ai-duo">
          <article class="ai-duo__card is-right">
            <span class="ai-duo__title"><AppIcon name="check" :size="14" />Bien anticipé</span>
            <p class="ai-duo__text">{{ revue.whatWasRight }}</p>
          </article>
          <article class="ai-duo__card is-missed">
            <span class="ai-duo__title"><AppIcon name="x" :size="14" />Manqué</span>
            <p class="ai-duo__text">{{ revue.whatWasMissed }}</p>
          </article>
        </div>

        <section v-if="revue.marketReviews?.length" class="ai-section">
          <h4 class="ai-section__title">Bilan marché par marché</h4>
          <div class="ai-markets">
            <article
              v-for="(r, i) in revue.marketReviews"
              :key="`${i}-${r.market}`"
              class="ai-review"
              :class="r.outcome === 'juste' ? 'is-confirme' : r.outcome === 'faux' ? 'is-contredit' : ''"
            >
              <header class="ai-review__head">
                <div class="ai-review__what">
                  <span class="ai-review__market">{{ r.market }}</span>
                  <span class="ai-review__pick">
                    <PickCrest :item="r.pick" :home="entry.homeName" :away="entry.awayName" :league="entry.league ?? null" :size="16" />{{ r.pick }}
                  </span>
                </div>
                <div class="ai-review__badges">
                  <span v-if="ISSUES[r.outcome]" class="ai-review__badge is-outcome">{{ ISSUES[r.outcome] }}</span>
                  <span v-if="avisTenu(r)" class="ai-review__badge is-ai" :class="{ 'is-wrong': r.aiWasRight === false }">{{ avisTenu(r) }}</span>
                </div>
              </header>
              <p v-if="r.explanation" class="ai-review__text">{{ r.explanation }}</p>
              <blockquote v-if="r.lesson" class="ai-review__lesson">
                <span class="ai-review__lesson-label">Leçon</span>
                {{ r.lesson }}
              </blockquote>
            </article>
          </div>
        </section>

        <section v-if="revue.outcomeVsEngine" class="ai-note is-engine">
          <span class="ai-note__icon"><AppIcon name="cpu" :size="18" /></span>
          <div>
            <p class="ai-note__title">Le résultat face au moteur</p>
            <p class="ai-note__text">{{ revue.outcomeVsEngine }}</p>
          </div>
        </section>
        <section v-if="revue.caveats" class="ai-note is-muted">
          <span class="ai-note__icon"><AppIcon name="info" :size="16" /></span>
          <div>
            <p class="ai-note__title">Limites</p>
            <p class="ai-note__text">{{ revue.caveats }}</p>
          </div>
        </section>
      </template>

      <p v-else-if="!hasResult" class="ai-wait">L'analyse après-match sera disponible une fois le résultat de ce match saisi.</p>

      <div v-else-if="connected" class="ai-actions">
        <AppButton variant="secondary" size="sm" :loading="running" @click="$emit('run-post-match')">
          <template #icon><AppIcon name="sparkles" :size="14" /></template>
          Analyser l'après-match
        </AppButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.match-ai {
  /* Se règle sur SA largeur : une page entière comme un panneau étroit. */
  container: aipanel / inline-size;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ------------------------------------------------------------ vide */
.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  border-radius: 16px;
  border: 1px dashed var(--cm-border);
  text-align: center;
}

.ai-empty__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ai-empty__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-empty__text {
  margin: 0;
  max-width: 560px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------- lecture du match */
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
  border-color: rgba(96, 165, 250, 0.25);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(96, 165, 250, 0.12), transparent 55%),
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
  background: linear-gradient(135deg, var(--cm-info), #818cf8);
  color: #0b1530;
  box-shadow: 0 4px 14px rgba(96, 165, 250, 0.3);
}

.ai-hero__chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--cm-border-soft);
  font-size: 11px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.ai-chip.is-accent {
  background: var(--cm-accent-soft);
  border-color: transparent;
  color: var(--cm-accent);
}

.ai-chip.is-warning {
  background: var(--cm-warning-soft);
  border-color: transparent;
  color: var(--cm-warning);
}

.ai-chip.is-danger {
  background: var(--cm-danger-soft);
  border-color: transparent;
  color: var(--cm-danger);
}

.ai-hero__summary {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: var(--cm-text-primary);
}

.ai-hero__note {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* Combien de pronostics l'IA confirme, nuance, contredit. */
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

/* --------------------------------------------------------- sections */
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
  --ton: #a78bfa;
  --ton-doux: rgba(167, 139, 250, 0.14);
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

.ai-lineups__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

.ai-lineups__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ai-lineups__source {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.ai-lineups__text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.ai-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-accent);
  cursor: pointer;
}

.ai-link:hover {
  text-decoration: underline;
}

.ai-link__chevron {
  transition: transform var(--cm-transition);
}

.ai-link__chevron.is-open {
  transform: rotate(90deg);
}

.ai-lineups__pitch {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* ------------------------------------------------ marché par marché */
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
  gap: 10px;
}

/* -------------------------------------------- face au moteur, limites */
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
  border-color: rgba(251, 191, 36, 0.25);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(251, 191, 36, 0.08), transparent 55%),
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
  font-size: 12px;
  color: var(--cm-text-muted);
}

/* -------------------------------------------------------- après-match */
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

.ai-review {
  --ton: var(--cm-text-muted);
  --ton-doux: var(--cm-surface-hover);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ai-review.is-confirme {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
}

.ai-review.is-contredit {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}

.ai-review__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.ai-review__what {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ai-review__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ai-review__pick {
  display: inline-flex;
  align-items: center;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-review__badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-review__badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.ai-review__badge.is-outcome {
  background: var(--ton-doux);
  color: var(--ton);
}

.ai-review__badge.is-ai {
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

.ai-review__badge.is-ai.is-wrong {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ai-review__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.ai-review__lesson {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--cm-info);
  border-radius: 0 10px 10px 0;
  background: var(--cm-info-soft);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.ai-review__lesson-label {
  display: block;
  margin-bottom: 2px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-info);
}

.ai-wait {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.ai-actions {
  display: flex;
}

/* Assez de place : les clés du match et les marchés sur deux colonnes. */
@container aipanel (min-width: 760px) {
  .ai-factors,
  .ai-duo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container aipanel (min-width: 980px) {
  .ai-markets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container aipanel (max-width: 520px) {
  .ai-hero {
    padding: 14px;
  }

  .ai-hero__summary {
    font-size: 13.5px;
  }
}
</style>
