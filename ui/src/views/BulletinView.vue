<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AiDossiersBoard from '@/components/analysis/AiDossiersBoard.vue';
import AiReliabilityTable from '@/components/analysis/AiReliabilityTable.vue';
import BulletinsPanel from '@/components/settings/BulletinsPanel.vue';
import ClaudeBudgetPanel from '@/components/settings/ClaudeBudgetPanel.vue';
import { bulletinsApi } from '@/services/bulletinsApi.js';
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import { AUCUN } from '@/utils/indexDesDossiers.js';
import { LIEN_DU_BUDGET, PAGE, REGLE_DE_LA_PAGE, SECTIONS, chiffresClesDeLaPage, piedDeLaPage } from '@/utils/pageBulletin.js';
import { jourEnLettres } from '@/utils/bulletins.js';

/**
 * BULLETIN (étape 45 du plan, 24/10/2026) : « l'IA à l'écran ». Une page du menu qui rassemble, à un seul endroit, tout ce que fait l'IA :
 *   1. le BUDGET CLAUDE du jour et de la semaine, en tête (ClaudeBudgetPanel, variante courte — le composant de la feuille de route et de
 *      Réglages, jamais une troisième version) ;
 *   2. le bulletin du jour et le bilan de la semaine (étape 42), avec la preuve que leurs chiffres sont ceux du code ;
 *   3. la fiabilité de l'IA, marché par marché et championnat par championnat (le carnet de l'étape 21, en résumé, avec le lien vers le carnet
 *      complet d'Historique moteur) ;
 *   4. la mémoire de l'IA : les dossiers et les leçons datées avec leur match d'origine (étape 44).
 *
 * Tout est LU, rien n'est calculé à l'ouverture, AUCUN appel à Claude ni à une API : la page lit trois routes de l'actualisation
 * (GET /match-ai-analysis/bulletins, /match-ai/scorecard, /match-ai-analysis/dossiers/resume) plus celle du budget, que le composant du budget
 * lit lui-même. Aucun bouton n'écrit un texte. La page reste TOUJOURS affichée, tableaux compris, même sans texte ni carnet : la raison est dite.
 * Le dossier ouvert (championnat, équipe) vit dans l'adresse (?championnat=…&equipe=fotmob-…) : un lien le partage. Les mots viennent de
 * utils/pageBulletin.js et utils/indexDesDossiers.js (purs, rejoués par server/test/bulletinPageEcran.test.mjs). Section « Historique moteur » :
 * l'IA et ses bilans, du côté du moteur (aucune couleur de plus).
 */
const route = useRoute();
const router = useRouter();
const dataVersion = useDataVersionStore();

const vierge = () => ({ loading: false, error: null, data: null });
const bulletins = ref(vierge());
const scorecard = ref(vierge());
const resume = ref(vierge());
const relectureLe = ref(null);
const derniers = { bulletins: 0, scorecard: 0, resume: 0 };

/** Lit une route dans `cible`. Une lecture ratée garde la dernière réponse à l'écran, l'erreur au-dessus ; une réponse tardive est ignorée. */
async function lire(cle, cible, appel) {
  const numero = ++derniers[cle];
  cible.value = { ...cible.value, loading: true, error: null };
  try {
    const data = await appel();
    if (numero === derniers[cle]) cible.value = { loading: false, error: null, data };
  } catch (error) {
    if (numero === derniers[cle]) cible.value = { loading: false, error: error.message, data: cible.value.data };
  }
}
const lireLesBulletins = () => lire('bulletins', bulletins, () => bulletinsApi.overview());
const lireLeCarnet = () => lire('scorecard', scorecard, () => matchAiAnalysisApi.scorecard());
const lireLIndex = () => lire('resume', resume, () => matchAiAnalysisApi.dossiersResume());
const toutLire = () => Promise.all([lireLesBulletins(), lireLeCarnet(), lireLIndex()]);

onMounted(toutLire);
/** « Tout relire » : les trois routes de la page, et le budget (il se relit quand ce repère change). */
function toutRelire() {
  relectureLe.value = new Date().toISOString();
  return toutLire();
}
// Les fichiers d'exécution ont changé (une passe de l'actualisation a écrit un texte, le carnet, les dossiers) : la page se relit seule.
watch(
  () => dataVersion.version,
  (apres, avant) => {
    if (avant && apres && apres !== avant) toutRelire();
  }
);

// ------------------------------------------------------------ présentation
const cles = computed(() => chiffresClesDeLaPage({ bulletins: bulletins.value, scorecard: scorecard.value, resume: resume.value }));
const pied = computed(() => piedDeLaPage({ bulletins: bulletins.value, scorecard: scorecard.value, resume: resume.value }));
const jour = computed(() => (bulletins.value.data?.jour ? jourEnLettres(bulletins.value.data.jour) : null));
const enLecture = computed(() => bulletins.value.loading || scorecard.value.loading || resume.value.loading);

// Le dossier ouvert vit dans l'adresse : un lien le partage (même geste que la page Bookmakers : on remplace, on n'empile pas l'historique).
const ligueDeLAdresse = typeof route.query.championnat === 'string' ? route.query.championnat : AUCUN;
const equipeDeLAdresse = typeof route.query.equipe === 'string' && /^fotmob-\d+$/.test(route.query.equipe) ? route.query.equipe : AUCUN;
function dossierChoisi({ ligue, equipe }) {
  const query = { ...route.query };
  if (ligue) query.championnat = ligue;
  else delete query.championnat;
  if (equipe) query.equipe = equipe;
  else delete query.equipe;
  if ((route.query.championnat ?? AUCUN) !== (query.championnat ?? AUCUN) || (route.query.equipe ?? AUCUN) !== (query.equipe ?? AUCUN)) router.replace({ query });
}
</script>

<template>
  <div class="bulletin cm-page" :aria-busy="enLecture" data-page="bulletin">
    <!-- 0. LE BANDEAU : ce que montre la page, et ses quatre chiffres clés -->
    <section class="cm-hero" aria-labelledby="bulletin-titre">
      <div class="cm-hero__top">
        <h2 id="bulletin-titre" class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon :name="PAGE.icone" :size="18" /></span>
          {{ PAGE.titre }}
        </h2>
        <div class="cm-hero__chips">
          <span v-if="jour" class="cm-chip is-section" data-jour><AppIcon name="calendar" :size="11" />{{ jour }}</span>
          <AppButton variant="secondary" size="sm" :loading="enLecture" data-action="tout-relire" @click="toutRelire">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Tout relire
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">{{ PAGE.intro }}</p>
      <div class="cm-kpis bulletin__kpis">
        <div v-for="k in cles" :key="k.cle" class="cm-kpi" :class="{ 'is-section': k.cle === 'bulletin' }" :data-kpi="k.cle">
          <span class="cm-kpi__label">{{ k.label }}</span>
          <span class="cm-kpi__value bulletin__kpi-texte" :class="k.ton">{{ k.valeur }}</span>
          <span class="cm-kpi__detail">{{ k.detail }}</span>
        </div>
      </div>
    </section>

    <!-- 1. LE BUDGET CLAUDE, en tête : le composant commun (feuille de route, Réglages), jamais une troisième version -->
    <AppCard :title="SECTIONS.budget.titre" :subtitle="SECTIONS.budget.sousTitre" :eyebrow="SECTIONS.budget.eyebrow" :icon="SECTIONS.budget.icone" data-bloc="budget-claude">
      <ClaudeBudgetPanel variante="compacte" :passe-terminee-le="relectureLe" />
      <RouterLink :to="LIEN_DU_BUDGET.to" class="cm-link bulletin__lien" data-lien="budget"><AppIcon name="arrowRight" :size="13" />{{ LIEN_DU_BUDGET.texte }}</RouterLink>
    </AppCard>

    <!-- 2. LE BULLETIN DU JOUR ET LE BILAN DE LA SEMAINE -->
    <AppCard :title="SECTIONS.textes.titre" :subtitle="SECTIONS.textes.sousTitre" :eyebrow="SECTIONS.textes.eyebrow" :icon="SECTIONS.textes.icone" data-bloc="textes-ia">
      <BulletinsPanel :lecture="bulletins" @relire="lireLesBulletins" />
    </AppCard>

    <!-- 3. LA FIABILITÉ DE L'IA : le carnet, marché par marché et championnat par championnat -->
    <AiReliabilityTable :reponse="scorecard.data" :chargement="scorecard.loading" :erreur="scorecard.error" @relire="lireLeCarnet" />

    <!-- 4. LES DOSSIERS ET LES LEÇONS -->
    <AiDossiersBoard
      :reponse="resume.data"
      :chargement="resume.loading"
      :erreur="resume.error"
      :ligue-initiale="ligueDeLAdresse"
      :equipe-initiale="equipeDeLAdresse"
      @relire="lireLIndex"
      @choisi="dossierChoisi"
    />

    <!-- 5. D'OÙ VIENNENT CES DONNÉES -->
    <div class="cm-note" data-bloc="provenance">
      <span class="cm-icon-box is-muted"><AppIcon name="database" :size="16" /></span>
      <div>
        <p class="cm-note__title">D’où viennent ces données</p>
        <ul class="bulletin__provenance">
          <li v-for="p in pied" :key="p.cle" :data-source="p.cle">
            <strong>{{ p.libelle }}</strong> : <code>{{ p.fichier }}</code> — {{ p.fournisseur }} ; {{ p.quand }}.
          </li>
        </ul>
        <p class="cm-note__text bulletin__regle">{{ REGLE_DE_LA_PAGE }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bulletin {
  /* Se règle sur SA largeur. */
  container: bulletin / inline-size;
}

.bulletin__kpis {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.bulletin__kpi-texte {
  font-size: 16px;
  line-height: 1.3;
}

/* L'état d'un texte : vert « fait » (comme les étapes terminées), ambre « à regarder » — jamais le vert d'une value. */
.bulletin__kpi-texte.is-accent {
  color: var(--cm-accent);
}

.bulletin__kpi-texte.is-warning {
  color: var(--cm-warning);
}

.bulletin__kpi-texte.is-danger {
  color: var(--cm-danger);
}

.bulletin__kpi-texte.is-info {
  color: var(--cm-info);
}

.bulletin__lien {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12.5px;
}

.bulletin__provenance {
  margin: 4px 0 8px;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cm-text-secondary);
}

.bulletin__provenance code {
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.bulletin__regle {
  font-size: 12px;
  color: var(--cm-text-secondary);
}
</style>
