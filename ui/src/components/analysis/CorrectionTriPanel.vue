<script setup>
/**
 * « ÉCARTS DU MOIS : MALCHANCE OU VRAI DÉFAUT » (étape 26 du plan, partie E, 28/10/2026) — dans l'onglet « Historique
 * moteur », juste après la calibration du mois (CalibrationPanel). C'est LA place du détail du tri de la boucle de
 * correction : Santé du moteur n'en montre qu'un résumé et un lien (ui/DESIGN.md, une seule place par information).
 *
 * Il LIT trois routes déjà préparées, sans rien calculer à l'ouverture : GET /api/corrections (les mois triés, les
 * règles, les corrections essayées), GET /api/corrections/tri?mois= (le tri figé du mois choisi : ses 22 cases, le détail
 * par régime, les pronostics écartés) et GET /api/corrections/journal (tout le journal, par pages de 50, « Plus ancien »).
 * Il montre TOUJOURS ses parties, même sans tri ou en panne : le choix du mois, quatre chiffres clés, le tableau des 22
 * cases (22 lignes, toujours ; Σ des issues et des matchs, ⌀ de l'écart absolu au pied — jamais une somme de
 * pourcentages), « par régime » (pour comprendre, jamais jugé), les écartés, le journal, la provenance réelle. Jamais
 * de vert : un écart n'est pas un gain. Les mots viennent de utils/corrections.js (pur, rejoué par
 * server/test/boucleCorrectionEcran.test.mjs).
 */
import { computed, onMounted, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { correctionsApi } from '@/services/correctionsApi.js';
import { moisTries, lignesDuTri, piedDuTri, kpisDuTri, regimesDuTri, ecarteesDuTri, provenanceDuTri, journalDit, deMois } from '@/utils/corrections.js';

const etat = ref({ loading: true, error: null, data: null });
const choix = ref(null);
const tri = ref({ loading: false, error: null, data: null });
const journal = ref({ loading: false, error: null, entrees: [], suivant: null });

async function chargerLeTri(mois) {
  if (!mois) {
    tri.value = { loading: false, error: null, data: null };
    return;
  }
  tri.value = { ...tri.value, loading: true, error: null };
  try {
    tri.value = { loading: false, error: null, data: await correctionsApi.tri(mois) };
  } catch (error) {
    tri.value = { loading: false, error: error.message, data: null };
  }
}

async function chargerLeJournal(avant = null) {
  journal.value = { ...journal.value, loading: true, error: null };
  try {
    const r = await correctionsApi.journal(avant, 50);
    journal.value = { loading: false, error: null, entrees: avant ? [...journal.value.entrees, ...(r.entrees ?? [])] : r.entrees ?? [], suivant: r.suivant ?? null };
  } catch (error) {
    journal.value = { ...journal.value, loading: false, error: error.message };
  }
}

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const d = await correctionsApi.etat();
    etat.value = { loading: false, error: null, data: d };
    if (!choix.value) choix.value = moisTries(d)[0]?.mois ?? null;
    await Promise.all([chargerLeTri(choix.value), chargerLeJournal()]);
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}
onMounted(charger);

function choisir(mois) {
  choix.value = mois;
  chargerLeTri(mois);
}

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const illisible = computed(() => (d.value && d.value.disponible === false ? d.value.raison ?? 'les tables de la boucle ne se lisent pas' : null));
const mois = computed(() => moisTries(d.value));
const leTri = computed(() => tri.value.data?.tri ?? null);
const manque = computed(() => (etat.value.error || illisible.value || tri.value.error ? 'illisible' : 'pas encore mesuré'));
const lignes = computed(() => lignesDuTri(leTri.value, { manque: manque.value }));
const pied = computed(() => piedDuTri(leTri.value));
const kpis = computed(() => kpisDuTri(leTri.value, d.value?.regles ?? null));
const regimes = computed(() => regimesDuTri(leTri.value));
const ecartees = computed(() => ecarteesDuTri(leTri.value));
const provenance = computed(() => provenanceDuTri(leTri.value));
const entrees = computed(() => journalDit(journal.value.entrees));
const raisonSansTri = computed(() => {
  if (illisible.value) return `Illisible pour l’instant : ${illisible.value}.`;
  if (tri.value.data && !leTri.value) return tri.value.data.raison ?? 'Ce mois n’est pas encore trié.';
  if (!mois.value.length && d.value) return 'Aucun mois trié pour l’instant : le premier tri se fait le 1er du mois à partir de 6 h, après le gel de la calibration.';
  return null;
});
const PHRASE_DES_ESSAIS = 'Plus on essaie de corrections avant d’en garder une, plus il est facile de tomber sur un bon score par chance : le juge élargit sa marge d’autant, il faut plus de matchs pour prouver.';
</script>

<template>
  <AppCard
    class="ctri"
    icon="swap"
    eyebrow="Boucle de correction"
    title="Écarts du mois : malchance ou vrai défaut (étape 26)"
    subtitle="Chaque mois, pour chaque marché, l’issue de référence (niveau) et l’issue favorite (confiance) des pronostics gelés de la version du moteur en service (pour le 1N2 : la victoire à domicile et le favori). Un écart qui peut venir du hasard est de la malchance ; un vrai défaut dure, dépasse 2 points et dépasse le hasard même en comptant toute l’année."
    data-bloc="corrections-tri"
  >
    <template #actions>
      <HelpTip terme="calibration" />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="ctri__corps">
      <div v-if="etat.error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">Écarts du mois indisponibles</p>
          <p class="cm-note__text">{{ etat.error }} — le tableau garde ses 22 lignes, sans valeurs.</p>
        </div>
      </div>
      <p v-if="raisonSansTri" class="cm-note is-info ctri__note" data-raison-sans-tri>
        <span class="cm-note__text">{{ raisonSansTri }}</span>
      </p>

      <!-- 0. Le choix du mois : les mois triés, le plus récent d'abord. -->
      <div class="ctri__mois" role="group" aria-label="Mois triés">
        <button v-for="m in mois" :key="m.mois" type="button" class="cm-chip ctri__pastille" :class="{ 'is-section': m.mois === choix }" :aria-pressed="m.mois === choix" @click="choisir(m.mois)">{{ m.texte }}</button>
        <span v-if="!mois.length" class="ctri__petit">aucun mois trié</span>
      </div>

      <!-- 1. Les quatre chiffres clés. -->
      <div class="cm-kpis ctri__kpis">
        <div v-for="k in kpis" :key="k.cle" class="cm-kpi">
          <span class="cm-kpi__label">{{ k.label }}</span>
          <span class="cm-kpi__value">{{ k.valeur }}</span>
          <span class="cm-kpi__detail">{{ k.detail }}</span>
        </div>
      </div>

      <!-- 2. Le tableau des 22 cases : toujours là, même vide ou en erreur. -->
      <div class="cm-table-wrap ctri__wrap">
        <table class="cm-table ctri__table" data-tableau="cases-du-tri">
          <thead>
            <tr>
              <th class="is-left">Famille</th>
              <th class="is-left" title="Niveau : l’issue de référence arrive-t-elle aussi souvent qu’annoncé ? Confiance : le favori de chaque pronostic arrive-t-il aussi souvent qu’annoncé ?">Mesure</th>
              <th title="Réalisé − annoncé sur le mois, en points (négatif : le moteur annonçait trop haut)">Écart du mois</th>
              <th class="is-left" title="Les mois comptés pour la case (2 ou 3), et l’écart de chacun">Mois comptés</th>
              <th title="Réalisé − annoncé sur les mois comptés, en points">Écart sur les mois comptés</th>
              <th title="La marge du hasard autour de l’écart, en points ; si elle ne contient pas zéro, l’écart dépasse le hasard">Fourchette</th>
              <th title="Matchs du mois pour la case">Matchs</th>
              <th class="is-left">Statut</th>
              <th class="is-left">Ce qui est proposé</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.cas" :class="{ 'ctri__ligne-vide': l.vide }" :data-cas="l.cas">
              <td class="is-left is-strong">{{ l.famille }}</td>
              <td class="is-left">{{ l.mesure }}</td>
              <td class="cm-numeric">{{ l.ecartMois }}</td>
              <td class="is-left ctri__fenetre">
                <span v-for="m in l.moisComptes" :key="m.mois" class="ctri__mois-compte">{{ m.mois }} : {{ m.ecart }}<template v-if="m.partiel"> (partiel)</template></span>
                <template v-if="!l.moisComptes.length">–</template>
              </td>
              <td class="cm-numeric">{{ l.ecartFenetre }}</td>
              <td class="cm-numeric">{{ l.fourchette }}</td>
              <td class="cm-numeric">{{ l.matchs }}</td>
              <td class="is-left"><span class="cm-chip ctri__statut" :class="l.statut.ton" :title="l.sens ?? ''">{{ l.statut.texte }}</span></td>
              <td class="is-left ctri__propose">{{ l.propose }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="2">Σ {{ pied.lignes }} issues mesurées</td>
              <td class="cm-numeric" title="Moyenne de l’écart absolu du mois sur les cases mesurées (jamais une somme de pourcentages)">⌀ {{ pied.ecartMoyen }}</td>
              <td class="is-left" colspan="3">Σ {{ pied.matchs }} matchs du mois</td>
              <td class="cm-numeric">{{ pied.casesMesurees }}</td>
              <td class="is-left" colspan="2">cases mesurées sur 22</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="ctri__petit">22 cases × 12 mois : la marge du hasard en tient compte. Un « vrai défaut » dure (les deux derniers mois comptés vont dans le même sens), fait au moins 2 points et dépasse la marge du hasard ; sinon, c’est de la malchance ou un petit écart. <HelpTip terme="fourchette-du-hasard" /></p>

      <!-- 3. Par régime : pour comprendre, jamais jugé. -->
      <h4 class="cm-group-title ctri__titre">Par régime (pour comprendre, jamais jugé)</h4>
      <div class="cm-table-wrap ctri__wrap">
        <table class="cm-table" data-tableau="regimes-du-tri">
          <thead>
            <tr>
              <th class="is-left">Famille</th>
              <th class="is-left">Régime de calcul</th>
              <th>Issues</th>
              <th>Matchs</th>
              <th title="Réalisé − annoncé de l’issue de référence, en points">Écart (niveau)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in regimes" :key="i">
              <td class="is-left">{{ r.famille }}</td>
              <td class="is-left">{{ r.regime }}</td>
              <td class="cm-numeric">{{ r.lignes }}</td>
              <td class="cm-numeric">{{ r.matchs }}</td>
              <td class="cm-numeric">{{ r.ecart }}</td>
            </tr>
            <tr v-if="!regimes.length">
              <td class="is-left" colspan="5">{{ leTri ? 'Aucun régime relevé pour ce mois.' : manque === 'illisible' ? 'Illisible pour l’instant.' : 'Pas encore mesuré.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 4. Les pronostics qui n'entrent pas dans le tri, raison par raison. -->
      <h4 class="cm-group-title ctri__titre">Pronostics gelés qui n’entrent pas dans le tri</h4>
      <ul class="ctri__ecartees">
        <li v-for="(e, i) in ecartees" :key="i"><span class="cm-numeric is-strong">{{ e.n }}</span> — {{ e.libelle }}</li>
        <li v-if="!ecartees.length" class="ctri__petit">{{ leTri ? 'Aucun : tous les pronostics gelés du mois sont comptés.' : 'Pas encore mesuré.' }}</li>
      </ul>

      <!-- 5. Tout le journal de la boucle, par pages de 50. -->
      <h4 class="cm-group-title ctri__titre">Le journal de la boucle de correction</h4>
      <div class="cm-table-wrap ctri__wrap">
        <table class="cm-table" data-tableau="journal">
          <thead>
            <tr>
              <th class="is-left">Quand (heure de Paris)</th>
              <th class="is-left">Événement</th>
              <th class="is-left">Ce qui s’est passé</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entrees" :key="e.n">
              <td class="is-left cm-numeric ctri__quand">{{ e.quand }}</td>
              <td class="is-left"><span class="cm-chip ctri__statut" :class="e.ton">{{ e.dit }}</span></td>
              <td class="is-left ctri__phrase">{{ e.phrase }}</td>
            </tr>
            <tr v-if="!entrees.length">
              <td class="is-left" colspan="3">{{ journal.error ? `Journal illisible pour l’instant : ${journal.error}` : 'Rien au journal pour l’instant.' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="3">Σ {{ entrees.length }} entrée{{ entrees.length > 1 ? 's' : '' }} affichée{{ entrees.length > 1 ? 's' : '' }}{{ journal.suivant ? ' — il y en a de plus anciennes' : '' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-if="journal.suivant" class="cm-toolbar">
        <AppButton variant="secondary" size="sm" :loading="journal.loading" @click="chargerLeJournal(journal.suivant)">
          <template #icon><AppIcon name="chevronDown" :size="13" /></template>
          Plus ancien
        </AppButton>
      </div>

      <!-- 6. La provenance réelle, et les corrections déjà essayées. -->
      <div class="ctri__pied">
        <ProvenanceChip :source="provenance.source" :releve-le="provenance.releveLe" :action="provenance.action" :fichier="provenance.fichier" :vieux-apres-heures="null" variante="ligne" />
        <p v-if="d?.essais?.phrase" class="ctri__petit">
          {{ d.essais.phrase }}
          <HelpTip titre="Corrections déjà essayées" :texte="PHRASE_DES_ESSAIS" />
        </p>
        <p v-if="leTri" class="ctri__petit">Tri {{ deMois(leTri.mois) }} figé : il ne sera jamais recalculé.</p>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.ctri__corps {
  container: ctri / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ctri__note {
  margin: 0;
}

.ctri__mois {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.ctri__pastille {
  cursor: pointer;
}

/* Le mois choisi : la couleur de la section, en teinte légère (jamais --cm-section-soft, émeraude ici : ui/DESIGN.md § 2). */
.ctri__pastille.is-section {
  background: rgba(var(--cm-section-rgb) / 0.12);
}

.ctri__kpis {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin: 0;
}

.ctri__wrap {
  max-height: 560px;
}

.ctri__table td {
  vertical-align: top;
  font-size: 12.5px;
}

.ctri__ligne-vide td {
  color: var(--cm-text-muted);
}

.ctri__fenetre {
  min-width: 150px;
}

.ctri__mois-compte {
  display: block;
  white-space: nowrap;
}

.ctri__statut {
  white-space: normal;
  line-height: 1.35;
}

/* « adoptée » au journal (vérification finale, constat 6) : la même teinte légère que le mois choisi — jamais
   --cm-section-soft, émeraude dans Historique moteur (ui/DESIGN.md § 2) ; une correction n'est pas un gain. */
.ctri__statut.is-section {
  background: rgba(var(--cm-section-rgb) / 0.12);
}

/* « À surveiller » : l'ambre en tirets, pour le distinguer du vrai défaut sans une couleur de plus. */
.cm-chip.is-tirets {
  border-style: dashed;
}

.ctri__propose,
.ctri__phrase {
  min-width: 200px;
  white-space: normal;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ctri__quand {
  white-space: nowrap;
}

.ctri__titre {
  margin: 6px 0 0;
}

.ctri__petit {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--cm-text-muted);
}

.ctri__ecartees {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.ctri__pied {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@container ctri (max-width: 560px) {
  .ctri__propose,
  .ctri__phrase,
  .ctri__fenetre {
    min-width: 0;
  }
}
</style>
