<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import BenchSummaryTable from '@/components/analysis/BenchSummaryTable.vue';
import CalibrationChart from '@/components/analysis/CalibrationChart.vue';
import SimulatedBetsPanel from '@/components/analysis/SimulatedBetsPanel.vue';
import { benchApi } from '@/services/benchApi.js';
import {
  TRANCHES,
  tuilesDeLaNote,
  phraseDeLaNote,
  phraseDeLaReproduction,
  etatDuRejeu,
  CONFIRMATION_DU_LANCEMENT,
  tableauDuRejeu,
  tableauDeLaNote,
  jeuxDuRejeu,
  communsDuRejeu,
  caseDuRejeu,
  pointsDeLaCourbe,
  courbeDeLaNote,
  fiabiliteFaceAuBanc,
  parisDuRejeu,
  parisDeLaNote,
  carteDuRejeu,
  GROUPES_DE_LA_CARTE,
  ecarteesDuRejeu,
  CE_QUI_SE_PROUVE
} from '@/utils/banc.js';

/**
 * L'ONGLET « BANC D'ESSAI » d'Historique moteur (étape 19 du plan, 13/10/2026). Sept blocs, toujours la
 * structure complète (ui/DESIGN.md), en langage simple :
 *   1. la note de départ (écrite dans le code du serveur, d'après le rejeu du bac à sable) ;
 *   2. le rejeu sur cette appli (le dernier, celui en cours) et « Lancer le banc » ;
 *   3. le tableau « moteur, marché, repère » (BenchSummaryTable), par jeu de prix ;
 *   4. la courbe annoncé / réalisé (CalibrationChart) et la fiabilité affichée face au banc ;
 *   5. les paris simulés (SimulatedBetsPanel) ;
 *   6. la carte championnat × marché (P2 ou P3) ;
 *   7. la provenance et les rencontres écartées.
 * Une seule lecture : GET /api/bench (rien ne s'y calcule). Tant qu'aucun rejeu n'a tourné ici, les blocs 3 à 5
 * montrent la note de départ (P2 et 2025-26) ; la carte attend le premier rejeu.
 */

const etat = ref(null);
const chargement = ref(true);
const erreurDeLecture = ref('');
const envoi = ref(false);
const refusDuLancement = ref('');
let minuterie = null;

async function charger() {
  try {
    etat.value = await benchApi.etat();
    erreurDeLecture.value = '';
  } catch (error) {
    erreurDeLecture.value = error.message;
  } finally {
    chargement.value = false;
  }
  suivre();
}

// Pendant un rejeu, l'avancement se relit toutes les 5 secondes SANS le résumé du dernier rejeu (2 à 4 Mo que la
// page a déjà) ; à la fin, une lecture complète apporte le nouveau. Dans le navigateur seulement.
function suivre() {
  clearTimeout(minuterie);
  if (typeof window === 'undefined' || !etat.value?.enCours) return;
  minuterie = setTimeout(async () => {
    try {
      const leger = await benchApi.avancement();
      if (!leger.enCours) return charger();
      const garde = etat.value?.dernierRejeu;
      etat.value = { ...leger, dernierRejeu: garde && leger.dernierRejeu?.id === garde.id ? garde : leger.dernierRejeu };
      erreurDeLecture.value = '';
    } catch (error) {
      erreurDeLecture.value = error.message;
    }
    suivre();
  }, 5000);
}

async function lancer() {
  if (envoi.value || etat.value?.enCours) return;
  if (typeof window !== 'undefined' && !window.confirm(CONFIRMATION_DU_LANCEMENT)) return;
  envoi.value = true;
  refusDuLancement.value = '';
  try {
    await benchApi.lancer({});
  } catch (error) {
    refusDuLancement.value = error.message;
  } finally {
    envoi.value = false;
  }
  await charger();
}

onMounted(charger);
onBeforeUnmount(() => clearTimeout(minuterie));

// --------------------------------------------------------- 1. la note de départ
const note = computed(() => etat.value?.noteDeDepart ?? null);
const tuiles = computed(() => tuilesDeLaNote(note.value));
const titreNote = computed(() => phraseDeLaNote(note.value));
const reproductionNote = computed(() => phraseDeLaReproduction(note.value?.reproduction));

// --------------------------------------------------------- 2. le rejeu sur cette appli
const dernier = computed(() => etat.value?.dernierRejeu ?? null);
const resume = computed(() => dernier.value?.resume ?? null);
const etatRejeu = computed(() => etatDuRejeu({ enCours: etat.value?.enCours, dernierRejeu: dernier.value, dernierRefus: etat.value?.dernierRefus }));
const reproductionIci = computed(() => phraseDeLaReproduction(resume.value?.reproduction, { ici: true }));
const quand = (iso) => (typeof iso === 'string' ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'date inconnue');
const rejeux = computed(() =>
  (etat.value?.rejeux ?? []).map((r) => ({
    id: r.id,
    texte: `n° ${r.id} — ${quand(r.lanceLe)}, ${r.ou === 'bac' ? 'bac à sable' : 'cette appli'}`,
    statut: r.finiLe ? (r.bilan?.erreur ? 'arrêté' : 'fini') : etat.value?.enCours?.id === r.id ? 'en cours' : 'interrompu'
  }))
);

// --------------------------------------------------------- 3. le tableau
const prixChoisi = ref('fd-avant-match');
const sousTable = ref('tout');
const jeux = computed(() => etat.value?.jeux ?? {});
const optionsPrix = computed(() => (resume.value ? jeuxDuRejeu(resume.value, jeux.value) : [{ value: 'fd-avant-match', label: jeux.value['fd-avant-match']?.titre ?? 'football-data, avant-match' }]));
watch(optionsPrix, (opts) => {
  if (opts.length && !opts.some((o) => o.value === prixChoisi.value)) prixChoisi.value = opts[0].value;
});
const optionsSousTable = [
  { value: 'tout', label: 'Tous les matchs' },
  { value: 'coupes', label: 'Coupes seulement' },
  { value: 'horsHuisClos', label: 'P2 sans les huis clos (03/2020 → 05/2021)' }
];
const tableau = computed(() => (resume.value ? tableauDuRejeu(resume.value, { prix: prixChoisi.value, sousTable: sousTable.value }) : tableauDeLaNote(note.value)));
const variantes = computed(() => resume.value?.juge?.variantes ?? note.value?.rejeu?.variantes ?? null);
const titreDuJeu = computed(() => optionsPrix.value.find((o) => o.value === prixChoisi.value)?.label ?? prixChoisi.value);
const communs = computed(() => (resume.value ? communsDuRejeu(resume.value, jeux.value) : []));
const sourceDuTableau = computed(() =>
  resume.value
    ? `Rejeu n° ${dernier.value.id} de cette appli.`
    : 'Note de départ (bac à sable) : 2019-2023 et 2025-26 seulement, jusqu’au premier rejeu sur cette appli.'
);

// --------------------------------------------------------- 4. la courbe
const marcheCourbe = ref('result|-');
const trancheCourbe = ref('P2');
const optionsMarche = computed(() => tableau.value.lignes.map((l) => ({ value: l.cle, label: l.libelle })));
const optionsTrancheCourbe = computed(() => tableau.value.colonnes.map((c) => ({ value: c.id, label: c.titre })));
watch(optionsTrancheCourbe, (opts) => {
  if (opts.length && !opts.some((o) => o.value === trancheCourbe.value)) trancheCourbe.value = opts[0].value;
});
const courbe = computed(() => {
  const [marketKey, l] = marcheCourbe.value.split('|');
  const ligne = l === '-' || l === undefined ? null : Number(l);
  if (resume.value) {
    const cas = caseDuRejeu(resume.value, { tranche: trancheCourbe.value, prix: prixChoisi.value, marketKey, ligne, sousTable: sousTable.value });
    return { points: pointsDeLaCourbe(cas), calibration: cas?.calibration ?? null };
  }
  return courbeDeLaNote(note.value, { tranche: trancheCourbe.value, marketKey, ligne });
});
const titreCourbe = computed(() => {
  const m = optionsMarche.value.find((o) => o.value === marcheCourbe.value)?.label ?? '';
  const t = TRANCHES.find((x) => x.id === trancheCourbe.value)?.titre ?? trancheCourbe.value;
  return `${m} · ${t} · ${titreDuJeu.value}`;
});
const fiabilite = computed(() => fiabiliteFaceAuBanc(courbe.value.calibration, etat.value?.fiabilite ?? {}));

// --------------------------------------------------------- 5. les paris simulés
const regles = computed(() => (resume.value ? parisDuRejeu(resume.value, jeux.value) : parisDeLaNote(note.value, etat.value?.regles ?? {}, jeux.value)));
const phraseP5 = computed(() => etat.value?.decisions?.phraseParisP5 ?? '');

// --------------------------------------------------------- 6. la carte
const trancheCarte = ref('P2');
const groupeCarte = ref('buts');
const optionsTrancheCarte = [
  { value: 'P2', label: 'P2 · 2019-2023 (football-data)' },
  { value: 'P3', label: 'P3 · 2023-24 (magasin neuf)' }
];
const optionsGroupe = GROUPES_DE_LA_CARTE.map((g) => ({ value: g.id, label: g.titre }));
const carte = computed(() => (resume.value ? carteDuRejeu(resume.value, { tranche: trancheCarte.value, groupe: groupeCarte.value }) : null));

// --------------------------------------------------------- 7. provenance et écartées
const provenance = computed(() => etat.value?.provenance ?? {});
const ecartees = computed(() => ecarteesDuRejeu(dernier.value, jeux.value));
</script>

<template>
  <div class="bench cm-page">
    <p v-if="erreurDeLecture" class="cm-note is-danger">
      <span class="cm-note__title">Le banc ne se lit pas</span>
      <span class="cm-note__text">{{ erreurDeLecture }}</span>
    </p>

    <!-- 1. LA NOTE DE DÉPART -->
    <section class="cm-hero bench__note" aria-labelledby="bench-note-titre">
      <div class="cm-hero__top">
        <div class="bench__titres">
          <span class="cm-eyebrow">Note de départ <HelpTip terme="note-de-depart" /></span>
          <h2 id="bench-note-titre" class="cm-hero__title">{{ chargement ? 'Lecture du banc…' : titreNote.titre }}</h2>
          <p class="cm-hero__subtitle">{{ titreNote.detail }}</p>
        </div>
      </div>
      <div v-if="tuiles" class="cm-kpis bench__tuiles">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">{{ tuiles.resultat.titre }}</span>
          <span class="cm-kpi__value cm-numeric">{{ tuiles.resultat.valeur }}</span>
          <span class="cm-kpi__detail">{{ tuiles.resultat.detail }}</span>
          <span v-if="tuiles.resultat.verdict" class="cm-chip" :class="tuiles.resultat.verdict.ton"><AppIcon :name="tuiles.resultat.verdict.icone" :size="11" />{{ tuiles.resultat.verdict.texte }}</span>
          <span v-if="tuiles.resultat.aCote" class="cm-kpi__detail bench__vu">{{ tuiles.resultat.aCote }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">{{ tuiles.score.titre }}</span>
          <span class="cm-kpi__value cm-numeric">{{ tuiles.score.valeur }}</span>
          <span class="cm-kpi__detail">{{ tuiles.score.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">{{ tuiles.statistiques.titre }}</span>
          <span class="cm-kpi__value cm-numeric">{{ tuiles.statistiques.valeur }}</span>
          <span class="cm-kpi__detail">{{ tuiles.statistiques.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">{{ tuiles.paris.titre }}</span>
          <span class="cm-kpi__value cm-numeric">{{ tuiles.paris.valeur }}</span>
          <span class="cm-kpi__detail">{{ tuiles.paris.detail }}</span>
          <span v-if="tuiles.paris.verdict" class="cm-chip" :class="tuiles.paris.verdict.ton"><AppIcon :name="tuiles.paris.verdict.icone" :size="11" />valeur de clôture : {{ tuiles.paris.verdict.texte }}</span>
        </div>
      </div>
      <p v-else-if="!chargement" class="cm-note">
        <span class="cm-note__text">Pas encore de note de départ : elle s’écrit dans le code après le rejeu complet du bac à sable.</span>
      </p>
      <p v-if="reproductionNote" class="bench__repro">
        <AppIcon :name="reproductionNote.egal ? 'check' : 'alert'" :size="13" />
        <span>{{ reproductionNote.texte }}<template v-if="reproductionNote.moteur"> {{ reproductionNote.moteur }}</template></span>
      </p>
    </section>

    <!-- 2. LE REJEU SUR CETTE APPLI -->
    <AppCard title="Rejeu sur cette appli" eyebrow="Banc d’essai" icon="play">
      <template #actions>
        <AppButton :disabled="Boolean(etat?.enCours) || envoi || chargement" :loading="envoi" @click="lancer">
          <template #icon><AppIcon name="play" :size="14" /></template>
          Lancer le banc
        </AppButton>
      </template>
      <p class="cm-note" :class="etatRejeu.ton">
        <span class="cm-note__text">{{ etatRejeu.texte }}</span>
      </p>
      <p v-if="refusDuLancement" class="cm-note is-warning">
        <span class="cm-note__title">Pas lancé</span>
        <span class="cm-note__text">{{ refusDuLancement }}</span>
      </p>
      <p v-if="reproductionIci" class="bench__repro">
        <AppIcon :name="reproductionIci.egal ? 'check' : 'alert'" :size="13" />
        <span>{{ reproductionIci.texte }}</span>
      </p>
      <p class="bench__aide cm-text-secondary">
        Le banc rejoue le moteur d’aujourd’hui sur 2019-2026, jour après jour <HelpTip terme="banc-d-essai" /> : environ 10 à 13 minutes, sans
        toucher à vos chiffres, vos paris ni vos réglages. Pendant ce temps, aucune actualisation ne tourne.
      </p>
      <CollapsibleSection v-if="rejeux.length" class="bench__rejeux">
        <template #header><span class="bench__petit-titre">{{ rejeux.length > 1 ? `Les ${rejeux.length} derniers rejeux` : 'Le dernier rejeu' }}</span></template>
        <ul class="bench__liste">
          <li v-for="r in rejeux" :key="r.id">
            {{ r.texte }} · <span :class="{ 'cm-text-muted': r.statut === 'fini' }">{{ r.statut }}</span>
          </li>
        </ul>
      </CollapsibleSection>
    </AppCard>

    <!-- 3. LE TABLEAU MOTEUR, MARCHÉ, REPÈRE -->
    <AppCard title="Moteur, marché, repère" icon="barChart" :subtitle="sourceDuTableau">
      <div class="cm-toolbar bench__outils">
        <AppSelect v-model="prixChoisi" label="Jeu de prix" :options="optionsPrix" />
        <AppSelect v-if="resume" v-model="sousTable" label="Matchs" :options="optionsSousTable" />
      </div>
      <BenchSummaryTable :tableau="tableau" :variantes="variantes" :jeu="titreDuJeu" />
      <CollapsibleSection v-if="communs.length" class="bench__communs">
        <template #header><span class="bench__petit-titre">Jeux de prix face à face, sur les matchs communs</span></template>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left" scope="col">Période</th>
                <th class="is-left" scope="col">Face à face</th>
                <th class="is-left" scope="col">Marché</th>
                <th scope="col">Matchs</th>
                <th scope="col">Perte log (premier · second)</th>
                <th class="is-left" scope="col">Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in communs" :key="c.cle">
                <th scope="row" class="is-left">{{ c.titreTranche }}</th>
                <td class="is-left">{{ c.paire }}</td>
                <td class="is-left">{{ c.libelle }}</td>
                <td class="cm-numeric">{{ c.texteN }}</td>
                <td class="cm-numeric">{{ c.perteB }} · {{ c.perteA }}</td>
                <td class="is-left">
                  <template v-if="c.ecart">
                    <span class="cm-numeric">{{ c.ecart.texte }}</span>
                    <span class="cm-chip" :class="c.ecart.pastille.ton" :title="c.ecart.raison"><AppIcon :name="c.ecart.pastille.icone" :size="11" />{{ c.ecart.pastille.texte }}</span>
                  </template>
                  <small v-else class="cm-text-muted">pas jugé</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      <CollapsibleSection class="bench__preuves">
        <template #header><span class="bench__petit-titre">Ce que le banc peut prouver, et sur quelle période</span></template>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left" scope="col">Quoi</th>
                <th class="is-left" scope="col">Période</th>
                <th class="is-left" scope="col">Prix</th>
                <th class="is-left" scope="col">Preuve ?</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in CE_QUI_SE_PROUVE" :key="`${p.quoi}|${p.periode}`">
                <th scope="row" class="is-left">{{ p.quoi }}</th>
                <td class="is-left">{{ p.periode }}</td>
                <td class="is-left">{{ p.prix }}</td>
                <td class="is-left">{{ p.preuve }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </AppCard>

    <!-- 4. LA COURBE ANNONCÉ / RÉALISÉ -->
    <AppCard title="Ce qu’il annonçait, ce qui est arrivé" icon="target">
      <div class="cm-toolbar bench__outils">
        <AppSelect v-model="marcheCourbe" label="Marché" :options="optionsMarche" />
        <AppSelect v-model="trancheCourbe" label="Période" :options="optionsTrancheCourbe" />
      </div>
      <div class="bench__courbe">
        <CalibrationChart :points="courbe.points" :titre="titreCourbe" />
        <div class="bench__fiabilite">
          <h4 class="cm-section-title">Fiabilité affichée dans l’appli, face au banc</h4>
          <p v-if="fiabilite.sansReference" class="cm-text-muted bench__petit">
            L’appli n’affiche pas de fiabilité pour ce marché : le banc donne seulement sa courbe, par dixièmes.
          </p>
          <div v-if="fiabilite.lignes.length" class="cm-table-wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th class="is-left" scope="col">Annoncé</th>
                  <th scope="col">L’appli affiche (23/09, 2025-26)</th>
                  <th scope="col">Le banc mesure</th>
                  <th scope="col">Annoncé moyen</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in fiabilite.lignes" :key="t.cle">
                  <th scope="row" class="is-left">{{ t.tranche }}</th>
                  <td class="cm-numeric">{{ t.appli }}</td>
                  <td class="cm-numeric">{{ t.banc }}</td>
                  <td class="cm-numeric">{{ t.annonce }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="cm-text-muted bench__petit">Aucune tranche mesurée dans cette case.</p>
        </div>
      </div>
    </AppCard>

    <!-- 5. LES PARIS SIMULÉS -->
    <AppCard title="Paris simulés" icon="wallet" :subtitle="resume ? 'Mise fixe d’une unité, règle du moteur reprise sans retouche.' : 'Note de départ : la règle du moteur sur 2019-2023 (le détail vient avec le premier rejeu).'">
      <SimulatedBetsPanel :regles="regles" :phrase-p5="phraseP5" />
    </AppCard>

    <!-- 6. LA CARTE CHAMPIONNAT × MARCHÉ -->
    <AppCard title="Carte championnat × marché" icon="grid" subtitle="Vert seulement « retenu », rouge « moins bon », gris sinon : la grille brute que l’étape 23 reprendra.">
      <template v-if="carte">
        <div class="cm-toolbar bench__outils">
          <AppSelect v-model="trancheCarte" label="Période" :options="optionsTrancheCarte" />
          <AppSelect v-model="groupeCarte" label="Marchés" :options="optionsGroupe" />
        </div>
        <p v-if="!carte.lignes.length" class="cm-note">
          <span class="cm-note__text">Aucune case pour cette période : le rejeu ne l’a pas couverte.</span>
        </p>
        <div v-else class="cm-table-wrap">
          <table class="cm-table bench__carte">
            <thead>
              <tr>
                <th class="is-left" scope="col">Championnat</th>
                <th v-for="m in carte.marches" :key="m.cle" scope="col" class="bench__carte-tete">{{ m.libelle }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in carte.lignes" :key="l.league">
                <th scope="row" class="is-left">{{ l.league }}</th>
                <td v-for="(c, i) in l.cases" :key="carte.marches[i].cle" class="bench__carte-case">
                  <span v-if="c" class="cm-chip" :class="c.pastille.ton" :title="`${c.pastille.texte} : ${c.texte} sur ${c.n} matchs, face ${c.face === 'marche' ? 'au marché' : 'au repère'}${c.raison ? ` — ${c.raison}` : ''}`">
                    <AppIcon :name="c.pastille.icone" :size="10" />{{ c.pastille.ton === 'is-warning' ? 'pas assez de matchs' : c.texte.startsWith('pas ') ? 'non mesuré' : c.texte.split(' ').slice(0, 2).join(' ') }}
                  </span>
                  <small v-else class="cm-text-muted">aucun match</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CollapsibleSection v-if="carte.paris.length" class="bench__carte-paris">
          <template #header><span class="bench__petit-titre">Paris du 1N2 par championnat (valeur de clôture)</span></template>
          <div class="cm-table-wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th class="is-left" scope="col">Championnat</th>
                  <th class="is-left" scope="col">Fenêtre</th>
                  <th scope="col">Paris</th>
                  <th class="is-left" scope="col">Valeur de clôture</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in carte.paris" :key="`${p.zone}|${p.league}`">
                  <th scope="row" class="is-left">{{ p.league }}</th>
                  <td class="is-left">{{ p.zone }}<small v-if="p.indicatif" class="cm-text-muted"> (indicatif)</small></td>
                  <td class="cm-numeric">{{ p.n.toLocaleString('fr-FR') }}</td>
                  <td class="is-left">
                    <span class="cm-numeric">{{ p.texte }}</span>
                    <span class="cm-chip" :class="p.pastille.ton"><AppIcon :name="p.pastille.icone" :size="11" />{{ p.pastille.texte }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      </template>
      <p v-else class="cm-note">
        <span class="cm-note__text">La carte vient avec le premier rejeu sur cette appli : la note de départ ne la garde pas.</span>
      </p>
    </AppCard>

    <!-- 7. PROVENANCE ET RENCONTRES ÉCARTÉES -->
    <AppCard title="D’où viennent ces chiffres" icon="database">
      <ul class="bench__liste">
        <li v-if="provenance.magasin"><strong>Magasin</strong> : {{ provenance.magasin }}</li>
        <li v-if="provenance.footballData"><strong>football-data</strong> : {{ provenance.footballData }}</li>
        <li v-if="provenance.prix"><strong>Prix</strong> : {{ provenance.prix }}</li>
        <li v-if="provenance.note"><strong>Note de départ</strong> : {{ provenance.note }}</li>
      </ul>
      <h4 class="cm-section-title">Rencontres écartées</h4>
      <template v-if="ecartees">
        <ul class="bench__liste">
          <li v-for="e in ecartees.globales" :key="e.cle">{{ e.texte }}</li>
        </ul>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left" scope="col">Période</th>
                <th scope="col">Rencontres rejouées</th>
                <th class="is-left" scope="col">Écartées ou non réglées, et pourquoi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in ecartees.parTranche" :key="t.cle">
                <th scope="row" class="is-left">{{ t.titre }}</th>
                <td class="cm-numeric">{{ t.rencontres }}</td>
                <td class="is-left">
                  <small v-if="!t.raisons.length" class="cm-text-muted">aucune</small>
                  <small v-for="r in t.raisons" :key="r.cle" class="bench__raison">{{ r.texte }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <p v-else class="cm-text-muted bench__petit">Les comptes viennent avec le premier rejeu sur cette appli. Dans le bac à sable : 56 résultats attribués, aucune ligne lien 4.</p>
    </AppCard>
  </div>
</template>

<style scoped>
.bench {
  container: banc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.bench__titres {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bench__tuiles {
  margin-top: 12px;
}
.bench__vu {
  color: var(--cm-warning);
}
.bench__repro {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--cm-text-secondary);
}
.bench__aide {
  margin: 10px 0 0;
  font-size: 13px;
}
.bench__outils {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.bench__outils > * {
  min-width: 220px;
}
.bench__petit-titre {
  font-size: 13px;
  font-weight: 600;
}
.bench__petit {
  font-size: 12px;
  margin: 0;
}
.bench__communs,
.bench__preuves,
.bench__rejeux,
.bench__carte-paris {
  margin-top: 12px;
}
.bench__courbe {
  display: grid;
  grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.bench__fiabilite {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bench__carte-tete {
  font-size: 11px;
  white-space: normal;
  min-width: 70px;
}
.bench__carte-case {
  text-align: center;
}
.bench__carte-case .cm-chip {
  font-size: 10px;
  white-space: nowrap;
}
.bench__liste {
  margin: 0 0 12px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.bench__raison {
  display: block;
}
@container banc (max-width: 760px) {
  .bench__courbe {
    grid-template-columns: minmax(0, 1fr);
  }
  .bench__outils > * {
    min-width: 0;
    flex: 1 1 100%;
  }
}
</style>
