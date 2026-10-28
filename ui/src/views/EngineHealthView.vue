<script setup>
import { computed, onMounted, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import CalibrationChart from '@/components/analysis/CalibrationChart.vue';
import HealthBlockCard from '@/components/analysis/HealthBlockCard.vue';
import CorrectionsBlock from '@/components/analysis/CorrectionsBlock.vue';
import { engineHealthApi } from '@/services/engineHealthApi.js';
import { correctionsApi } from '@/services/correctionsApi.js';
import { confirmationDuBanc, confirmationDeLEssai, confirmationDuRefus, confirmationDuRetrait, confirmationDeLaProposition, messageApresLAction } from '@/utils/corrections.js';
import { pointsDeLaCourbe, moisDit, clotureDesPronosticsDite, clotureDesParisDite } from '@/utils/calibration.js';
import {
  PAGE,
  structureParDefaut,
  bandeauDeLaPage,
  dualsFaceAuMarche,
  faceAuRepereDit,
  dernierRejeuDit,
  evolutionDite,
  evolutionVideDite,
  chiffresDeLaCalibration,
  jugeDeCloture,
  lignesAVerifier,
  resteAVerifierDit
} from '@/utils/santeMoteur.js';

/**
 * SANTÉ DU MOTEUR (étape 24 du plan, 14/10/2026) : le tableau de bord du moteur, une page qui RASSEMBLE ce que
 * les autres étapes ont préparé, sans rien recalculer. En tête, trois feux (les données, les sauvegardes, le
 * budget Claude) ; puis la note du moteur face au marché et son évolution, ce qu'il annonçait face à ce qui est
 * arrivé, la valeur de clôture, la liste « à vérifier », les versions du moteur, et les corrections à accepter ou
 * refuser de l'étape 26 (la boucle de correction : le résumé du mois, les écarts en court, les propositions et leurs
 * boutons, le journal — CorrectionsBlock, sur toute la largeur).
 *
 * UNE SEULE PLACE PAR INFORMATION : chaque bloc n'est qu'un résumé (un chiffre, un feu, une phrase) avec la
 * source réelle, l'heure de la mesure et le lien vers sa vraie place (Historique moteur, Banc d'essai, Réglages).
 * La courbe annoncé / réalisé est CalibrationChart (celle du banc d'essai), jamais redessinée ici.
 *
 * Une seule lecture : GET /api/engine-health (le serveur lit des résumés déjà écrits). Un bloc dont la donnée
 * manque reste affiché avec « pas encore mesuré » ; si le serveur ne répond pas, les neuf cadres restent, dits
 * « illisibles ». Les mots viennent de utils/santeMoteur.js (et des règles des vraies places).
 *
 * Les CLICS de l'étape 26 (mesurer au banc, mettre à l'essai, refuser, retirer, proposer) passent TOUS par une
 * confirmation (window.confirm) qui dit ce qui change, envoient l'état vu à l'écran (`vue` : un double clic n'agit pas
 * deux fois), puis la page se relit ; un refus du serveur est dit en mots.
 */

const etat = ref({ loading: true, error: null, data: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await engineHealthApi.overview() };
  } catch (error) {
    // Une lecture ratée garde la dernière page à l'écran, l'erreur au-dessus.
    etat.value = { loading: false, error: error.message, data: etat.value.data };
  }
}
onMounted(charger);

const reponse = computed(() => etat.value.data);
// Sans réponse, la structure reste : neuf cadres « illisibles » avec la raison.
const page = computed(() => reponse.value ?? structureParDefaut({ chargement: etat.value.loading, raison: etat.value.error }));
const feux = computed(() => page.value.feux);
const blocs = computed(() => page.value.blocs);
const bandeau = computed(() => bandeauDeLaPage(reponse.value));

// La note face au marché.
const duels = computed(() => dualsFaceAuMarche(blocs.value.note));
const faceAuRepere = computed(() => faceAuRepereDit(blocs.value.note));
const dernierRejeu = computed(() => dernierRejeuDit(blocs.value.note));
const evolution = computed(() => evolutionDite(blocs.value.note?.evolution));
const evolutionVide = computed(() => evolutionVideDite(blocs.value.note?.prochainGel));

// Annoncé face à réalisé : la courbe du banc d'essai, alimentée par la case « tous marchés » du bilan.
const calibration = computed(() => blocs.value.calibration);
const points = computed(() => pointsDeLaCourbe(calibration.value?.global));
const chiffres = computed(() => chiffresDeLaCalibration(calibration.value));
const titreCourbe = computed(() => (calibration.value?.mois ? `Tous les marchés · ${moisDit(calibration.value.mois)} · première valeur` : 'Tous les marchés'));

// La valeur de clôture : les mêmes mots que le bloc d'Historique moteur.
const cloturePronostics = computed(() => clotureDesPronosticsDite(blocs.value.cloture?.cloture));
const clotureParis = computed(() => clotureDesParisDite(blocs.value.cloture?.paris));
const jugeCloturePronostics = computed(() => jugeDeCloture(blocs.value.cloture?.cloture));
const jugeClotureParis = computed(() => jugeDeCloture(blocs.value.cloture?.paris));

// À vérifier.
const aVerifier = computed(() => lignesAVerifier(blocs.value.aVerifier));
const resteAVerifier = computed(() => resteAVerifierDit(blocs.value.aVerifier));

const ICONES_DES_FEUX = Object.freeze({ donnees: 'database', sauvegardes: 'shield', budget: 'cpu' });

// Étape 26 (partie E, 28/10/2026) : les clics du bloc des corrections. Chacun : la confirmation d'abord (rien ne part sans elle),
// la route avec l'état VU à l'écran, le message ou le refus en mots, puis la page se relit (la même lecture, une seule).
const actionCorrection = ref({ occupe: null, message: null, erreur: null, retrait: null });
async function agir(type, p, appel, texte) {
  if (!texte || !window.confirm(texte)) return;
  actionCorrection.value = { occupe: type === 'proposer' ? 'proposer' : p.id, message: null, erreur: null, retrait: null };
  try {
    const r = await appel();
    actionCorrection.value = { occupe: null, message: messageApresLAction(type, r), erreur: null, retrait: type === 'retirer' ? r : null };
  } catch (error) {
    actionCorrection.value = { occupe: null, message: null, erreur: error.message, retrait: null };
  }
  await charger();
}
const mesurerAuBanc = (p) => agir('banc', p, () => correctionsApi.mesurerAuBanc(p.id, p.etat), confirmationDuBanc(p));
const mettreALEssai = (p) => agir('accepter', p, () => correctionsApi.accepter(p.id, p.etat), confirmationDeLEssai(p, blocs.value.corrections?.place ?? null));
const refuserLaCorrection = (p) => agir('refuser', p, () => correctionsApi.refuser(p.id, p.etat), confirmationDuRefus(p));
const retirerLaCorrection = (p) => agir('retirer', p, () => correctionsApi.retirer(p.id, p.etat), confirmationDuRetrait(p));
const proposerUneCorrection = (corps) => agir('proposer', null, () => correctionsApi.proposer(corps), confirmationDeLaProposition(corps));
</script>

<template>
  <div class="sante cm-page" :aria-busy="etat.loading">
    <!-- 0. LE BANDEAU : ce que montre la page, en une phrase -->
    <section class="cm-hero" aria-labelledby="sante-titre">
      <div class="cm-hero__top">
        <h2 id="sante-titre" class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon :name="PAGE.icone" :size="18" /></span>
          {{ PAGE.titre }}
        </h2>
        <div class="cm-hero__chips">
          <span class="cm-chip"><AppIcon name="clock" :size="11" />{{ bandeau.lecture }}</span>
          <span v-if="bandeau.duree" class="cm-chip" title="Le temps que le serveur a mis pour lire tous les résumés : aucun calcul lourd n’est fait à l’ouverture.">lue en {{ bandeau.duree }}</span>
          <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Relire
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">
        Ce que les autres étapes ont préparé, en un coup d’œil : les données, les sauvegardes et le budget Claude en tête, puis la note du moteur face au marché, ce qu’il annonçait face à ce qui est arrivé, la valeur de clôture, ce qu’il faut vérifier et les corrections à décider. Rien n’est calculé ici : chaque bloc dit d’où vient son chiffre, quand il a été mesuré, et où se trouve le détail.
      </p>
    </section>

    <LoadingSpinner v-if="etat.loading && !reponse" label="Lecture des résumés…" />

    <div v-if="etat.error" class="cm-note is-danger" role="alert">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">{{ reponse ? 'Lecture impossible — dernière page affichée' : 'Santé du moteur indisponible' }}</p>
        <p class="cm-note__text">{{ etat.error }}</p>
      </div>
    </div>

    <!-- 1. LES TROIS FEUX : données, sauvegardes, budget Claude -->
    <div class="cm-grid-3 sante__feux">
      <HealthBlockCard v-for="f in feux" :key="f.cle" :bloc="f" :icone="ICONES_DES_FEUX[f.cle] ?? 'activity'" compact />
    </div>

    <div class="cm-grid-2 sante__blocs">
      <!-- 2. LA NOTE DU MOTEUR FACE AU MARCHÉ, et son évolution -->
      <HealthBlockCard :bloc="blocs.note" icone="barChart">
        <div class="cm-table-wrap">
          <table class="cm-table sante__duels">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th title="Matchs jugés (2019-2023, jamais vus par les réglages)">Matchs</th>
                <th title="Erreur de prévision du moteur (perte log) : plus bas, c’est mieux">Moteur</th>
                <th title="Erreur de prévision du marché (cotes d’avant-match)">Marché</th>
                <th title="Gain du moteur face au marché, en pour cent de perte log en moins">Écart</th>
                <th class="is-left">Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in duels" :key="d.cle">
                <td class="is-left is-strong">{{ d.libelle }}</td>
                <td class="cm-numeric">{{ d.matchs }}</td>
                <td class="cm-numeric">{{ d.moteur }}</td>
                <td class="cm-numeric">{{ d.marche }}</td>
                <td class="cm-numeric">{{ d.ecart }}</td>
                <td class="is-left"><span class="cm-chip" :class="d.verdict.ton"><AppIcon :name="d.verdict.icone" :size="11" />{{ d.verdict.texte }}</span></td>
              </tr>
              <tr v-if="!duels.length">
                <td class="is-left" colspan="6">Pas encore mesuré : la note de départ du banc d’essai n’est pas écrite dans le code.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="faceAuRepere" class="sante__petit cm-text-secondary">Face au championnat seul : {{ faceAuRepere }}. Par marché et par championnat, le détail est dans le banc d’essai. <HelpTip terme="note-de-depart" /></p>
        <h4 class="cm-group-title sante__titre">Évolution mois par mois</h4>
        <ul v-if="evolution.length" class="sante__evolution">
          <li v-for="m in evolution" :key="m.cle">
            <span class="cm-chip" :class="m.ton" :title="m.titre">{{ m.mois }} · {{ m.ecart }} · {{ m.juge }}</span>
          </li>
        </ul>
        <p v-else class="sante__petit cm-text-secondary">{{ evolutionVide }}</p>
        <p class="sante__petit cm-text-secondary">{{ dernierRejeu }}</p>
      </HealthBlockCard>

      <!-- 3. ANNONCÉ FACE À RÉALISÉ : la courbe du banc d'essai, la case « tous marchés » du mois -->
      <HealthBlockCard :bloc="blocs.calibration" icone="target">
        <div class="sante__courbe">
          <CalibrationChart :points="points" :titre="titreCourbe" />
          <div v-if="chiffres" class="cm-kpis sante__kpis">
            <div class="cm-kpi">
              <span class="cm-kpi__label">Annoncé</span>
              <span class="cm-kpi__value cm-numeric">{{ chiffres.annonce }}</span>
              <span class="cm-kpi__detail">{{ chiffres.pronostics }} pronostics · {{ chiffres.matchs }} matchs</span>
            </div>
            <div class="cm-kpi">
              <span class="cm-kpi__label">Réalisé</span>
              <span class="cm-kpi__value cm-numeric">{{ chiffres.realise }}</span>
            </div>
            <div class="cm-kpi" :title="chiffres.juge.detail">
              <span class="cm-kpi__label">Écart</span>
              <span class="cm-kpi__value cm-numeric">{{ chiffres.ecart }}</span>
              <span class="cm-chip" :class="chiffres.juge.ton">{{ chiffres.juge.texte }}</span>
            </div>
          </div>
        </div>
        <p class="sante__petit cm-text-secondary">Une seule courbe ici (tous marchés, première valeur de chaque pronostic) ; marché par marché et championnat par championnat, elles vivent dans Historique moteur. <HelpTip terme="calibration" /></p>
      </HealthBlockCard>

      <!-- 4. LA VALEUR DE CLÔTURE -->
      <HealthBlockCard :bloc="blocs.cloture" icone="trendUp">
        <div v-if="cloturePronostics || clotureParis" class="cm-kpis sante__kpis">
          <div v-if="cloturePronostics" class="cm-kpi">
            <span class="cm-kpi__label">Clôture des pronostics</span>
            <span class="cm-kpi__value cm-numeric">{{ cloturePronostics.valeur }}</span>
            <span class="cm-kpi__detail">{{ cloturePronostics.sur }}</span>
            <span class="cm-chip" :class="jugeCloturePronostics.ton">{{ jugeCloturePronostics.texte }}</span>
          </div>
          <div v-if="clotureParis" class="cm-kpi">
            <span class="cm-kpi__label">Clôture de vos paris</span>
            <span class="cm-kpi__value cm-numeric">{{ clotureParis.valeur }}</span>
            <span class="cm-kpi__detail">{{ clotureParis.sur }}</span>
            <span class="cm-chip" :class="jugeClotureParis.ton">{{ jugeClotureParis.texte }}</span>
          </div>
        </div>
        <p class="sante__petit cm-text-secondary">La cote juste a-t-elle baissé après le choix ? <HelpTip terme="valeur-de-cloture" /></p>
      </HealthBlockCard>

      <!-- 5. LA LISTE « À VÉRIFIER » -->
      <HealthBlockCard :bloc="blocs.aVerifier" icone="alert">
        <ul v-if="aVerifier.length" class="sante__verifier">
          <li v-for="c in aVerifier" :key="c.cle">
            <span class="cm-chip" :class="c.ton">{{ c.statut }}</span>
            <span class="sante__verifier-texte"><strong>{{ c.libelle }}</strong> — {{ c.constat }}</span>
          </li>
        </ul>
        <p v-if="resteAVerifier" class="sante__petit cm-text-secondary">{{ resteAVerifier }}</p>
      </HealthBlockCard>

      <!-- 6. LES VERSIONS DU MOTEUR : version en service, essai d'une candidate, dérive -->
      <HealthBlockCard :bloc="blocs.versions" icone="layers" />

      <!-- 7. LES CORRECTIONS À ACCEPTER OU REFUSER (étape 26) : toute la largeur ; le bloc émet les clics, la page confirme, appelle la route et relit -->
      <HealthBlockCard :bloc="blocs.corrections" icone="swap" class="sante__corrections">
        <CorrectionsBlock
          :bloc="blocs.corrections"
          :occupe="actionCorrection.occupe"
          :message="actionCorrection.message"
          :erreur="actionCorrection.erreur"
          :retrait="actionCorrection.retrait"
          @banc="mesurerAuBanc"
          @accepter="mettreALEssai"
          @refuser="refuserLaCorrection"
          @retirer="retirerLaCorrection"
          @proposer="proposerUneCorrection"
        />
      </HealthBlockCard>
    </div>
  </div>
</template>

<style scoped>
.sante__feux,
.sante__blocs {
  align-items: start;
}
.sante__titre {
  margin: 14px 0 8px;
}
.sante__petit {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
}
.sante__duels {
  min-width: 460px;
}
.sante__evolution,
.sante__verifier {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 8px;
}
.sante__evolution {
  flex-wrap: wrap;
}
.sante__verifier {
  flex-direction: column;
}
.sante__verifier li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.sante__verifier-texte {
  min-width: 0;
  overflow-wrap: anywhere;
}
.sante__courbe {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 14px;
  align-items: start;
}
.sante__kpis {
  margin: 0;
}
/* Étape 26 : le bloc des corrections prend toute la largeur de la grille (ses quatre parties, ses cartes et leurs boutons). */
.sante__corrections {
  grid-column: 1 / -1;
}
</style>
