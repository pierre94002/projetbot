<script setup>
/**
 * Repères du championnat (étape 15 du plan, 07/10/2026) — le bloc de l'onglet
 * « Statistiques ligue » : ce qu'est un match « normal » dans ce championnat,
 * saison par saison, depuis 2000 quand football-data.co.uk le publie.
 *
 * Tout est LU (GET /api/match-stats/benchmarks, une table calculée chaque nuit
 * par l'étape « Repères de chaque championnat » de l'actualisation,
 * server/src/data/db/leagueBenchmarks.js) : le bloc ne calcule rien qui ne le
 * soit au serveur. Il montre :
 *   - les chiffres clés et la VRAIE provenance (FotMob, football-data.co.uk,
 *     date du calcul, nombre de matchs) ;
 *   - une petite courbe d'évolution, saison par saison ou mois par mois ;
 *   - le tableau saison par saison, la source de CHAQUE saison écrite sur sa
 *     ligne, puis la moyenne de toutes les saisons (pondérée par les matchs :
 *     jamais une somme ni une moyenne de pourcentages — règle de
 *     utils/reperes.js, qui retombe sur celle du serveur), la valeur retenue
 *     (petits championnats ramenés vers la moyenne générale) et la moyenne des
 *     championnats ;
 *   - la dispersion et le facteur de terrain des corners, tirs et tirs cadrés,
 *     mesurés face aux valeurs du moteur — MESURÉS SEULEMENT, le moteur ne les
 *     emploie pas (étape 33, après le banc d'essai) ;
 *   - le recoupement des deux sources sur les saisons qu'elles ont toutes deux.
 * Règles de Pierre : toute la structure des tableaux, même en erreur ; « non
 * relevé » plutôt qu'un tiret ; un langage simple.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { formatDateTime } from '@/utils/format.js';
import {
  COLONNES,
  COURBES,
  DEFINITIONS,
  CLES_DU_TABLEAU,
  nombre,
  valeurTexte,
  texteCase,
  libelleSource,
  toutesLesSaisons,
  scoresTexte,
  texteSaisons,
  etatDuBloc,
  notesDeSaison,
  courbeDesSaisons,
  courbeDesMois,
  lignesDeDispersion,
  lignesDuRecoupement
} from '@/utils/reperes.js';

const props = defineProps({
  /** Le championnat choisi dans l'onglet (libellé du magasin). */
  league: { type: String, default: '' }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const ligue = props.league;
  if (!ligue) return;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.benchmarks(ligue);
    if (props.league === ligue) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.league === ligue) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(
  () => props.league,
  (apres, avant) => {
    if (apres === avant) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => (etat.value.data?.league === props.league ? etat.value.data : null));
const lu = computed(() => etatDuBloc(d.value, etat.value.error));
const saisons = computed(() => d.value?.saisons ?? []);
const toutes = computed(() => d.value?.toutes ?? null);
const general = computed(() => d.value?.general ?? null);
const definitionsServeur = computed(() => Object.fromEntries((d.value?.definitions ?? []).map((x) => [x.cle, x])));
const libelleDe = (cle) => definitionsServeur.value[cle]?.libelle ?? COLONNES.find((c) => c.cle === cle)?.aide ?? cle;

/** La ligne « toutes les saisons » des saisons affichées (règle de l'écran = celle du serveur). */
const pied = computed(() => toutesLesSaisons(saisons.value, CLES_DU_TABLEAU.map((cle) => DEFINITIONS[cle])));
const sources = computed(() => ({
  fotmob: saisons.value.filter((s) => s.source === 'fotmob'),
  footballData: saisons.value.filter((s) => s.source === 'football-data')
}));
const provenance = computed(() => {
  const morceaux = [];
  if (sources.value.footballData.length) morceaux.push('football-data.co.uk (fd_history)');
  if (sources.value.fotmob.length) morceaux.push('FotMob (magasin)');
  return morceaux.length ? morceaux.join(' · ') : 'FotMob (magasin) et football-data.co.uk';
});
const detailProvenance = computed(() => {
  if (!d.value || d.value.etat !== 'pret') return 'Les repères sont calculés chaque nuit par l’actualisation.';
  const fd = sources.value.footballData;
  const fm = sources.value.fotmob;
  const morceaux = [];
  if (fd.length) morceaux.push(`${fd.length} saison(s) de football-data.co.uk (${texteSaisons(fd.at(-1).saison, fd[0].saison)}, ${nombre(fd.reduce((t, s) => t + s.matchs, 0))} matchs)`);
  if (fm.length) morceaux.push(`${fm.length} saison(s) FotMob (${texteSaisons(fm.at(-1).saison, fm[0].saison)}, ${nombre(fm.reduce((t, s) => t + s.matchs, 0))} matchs)`);
  return `${morceaux.join(' ; ')}. Calcul du ${formatDateTime(d.value.calculeLe)}.`;
});

const kpiButs = computed(() => {
  const t = toutes.value?.reperes?.buts;
  return {
    valeur: t?.matchs ? valeurTexte(t.valeur) : 'non lu',
    detail: t?.matchs
      ? `retenue ${valeurTexte(t.retenue)} ; moyenne des ${nombre(general.value?.ligues ?? 0)} championnats ${valeurTexte(general.value?.reperes?.buts?.valeur) ?? 'non lue'}`
      : 'repères indisponibles'
  };
});
const kpiTerrain = computed(() => {
  const r = toutes.value?.reperes;
  return r?.avantage_terrain?.matchs
    ? {
        valeur: `${valeurTexte(r.avantage_terrain.valeur, 'moyenne', { signe: true })} but`,
        detail: `victoires à domicile ${valeurTexte(r.victoires_dom.valeur, 'part')} · nuls ${valeurTexte(r.nuls.valeur, 'part')} · à l’extérieur ${valeurTexte(r.victoires_ext.valeur, 'part')}`
      }
    : { valeur: 'non lu', detail: 'repères indisponibles' };
});

// La petite courbe : un repère, saison par saison ou mois par mois.
const repereCourbe = ref('buts');
const mode = ref('saisons');
const MODES = [
  { value: 'saisons', label: 'Saison par saison', icone: 'trendUp' },
  { value: 'mois', label: 'Mois par mois', icone: 'calendar' }
];
const LARGEUR = 600;
const HAUTEUR = 130;
const defCourbe = computed(() => DEFINITIONS[repereCourbe.value]);
const courbe = computed(() => courbeDesSaisons(saisons.value, repereCourbe.value, { largeur: LARGEUR, hauteur: HAUTEUR, moyenne: pied.value.reperes[repereCourbe.value]?.valeur ?? null }));
const saisonDuMois = computed(() => saisons.value.find((s) => s.mois?.[repereCourbe.value]?.length) ?? null);
const courbeMois = computed(() =>
  courbeDesMois({ toutes: toutes.value?.mois?.[repereCourbe.value] ?? [], saison: saisonDuMois.value?.mois?.[repereCourbe.value] ?? [] }, saisonDuMois.value?.saison ?? saisons.value[0]?.saison, {
    largeur: LARGEUR,
    hauteur: HAUTEUR
  })
);
const texteCourbe = (v) => valeurTexte(v, defCourbe.value?.type) ?? 'non relevé';
const descriptionCourbe = computed(() => {
  const nom = COURBES.find((c) => c.cle === repereCourbe.value)?.libelle ?? repereCourbe.value;
  if (mode.value === 'mois') {
    return courbeMois.value.vide
      ? `${nom} : pas assez de matchs mois par mois.`
      : `${nom}, mois par mois : ${courbeMois.value.pointsToutes.map((p) => `${p.nom} ${texteCourbe(p.valeur)}`).join(', ')} (toutes les saisons réunies).`;
  }
  return courbe.value.vide
    ? `${nom} : il faut au moins deux saisons relevées pour une courbe.`
    : `${nom}, saison par saison, de ${courbe.value.premiere} à ${courbe.value.derniere} : de ${texteCourbe(courbe.value.min)} à ${texteCourbe(courbe.value.max)}.`;
});

const lignesDispersion = computed(() => lignesDeDispersion(d.value?.dispersion));
const recoupement = computed(() => toutes.value?.recoupement ?? null);
const lignesRecoupement = computed(() =>
  lignesDuRecoupement(
    recoupement.value,
    ['buts', 'nuls', 'plus_2_5', 'deux_marquent', 'buts_1re_mt', 'corners', 'tirs', 'tirs_cadres', 'cartons_jaunes', 'cartons_rouges'].map((cle) => ({ ...DEFINITIONS[cle], libelle: libelleDe(cle) }))
  )
);
const titreCase = (s, cle) => {
  const c = s.reperes?.[cle];
  return c?.matchs ? `${libelleDe(cle)} : ${nombre(c.matchs)} match(s) relevé(s) sur ${nombre(s.matchs)}` : `${libelleDe(cle)} : ${c?.nonReleve ?? 'non relevé'}`;
};
</script>

<template>
  <div class="lbp">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture des repères du championnat…" />

    <div v-if="lu.texte && !(etat.loading && !d)" class="cm-note" :class="lu.ton">
      <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="lu.cle === 'coupe' ? 'trophy' : lu.cle === 'erreur' ? 'x' : 'info'" :size="16" /></span>
      <div>
        <p class="cm-note__title">{{ lu.cle === 'erreur' ? 'Repères du championnat illisibles' : lu.cle === 'coupe' ? 'Une coupe' : 'Repères du championnat' }}</p>
        <p class="cm-note__text lbp__texte">{{ lu.texte }} — les tableaux ci-dessous restent affichés, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis lbp__kpis">
      <div class="cm-kpi is-section">
        <span class="cm-kpi__label">Saisons</span>
        <span class="cm-kpi__value">{{ toutes ? `${nombre(toutes.saisons)} saisons` : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ toutes ? `${texteSaisons(toutes.premiere, toutes.derniere)} ; ${nombre(sources.footballData.length)} football-data.co.uk, ${nombre(sources.fotmob.length)} FotMob` : 'repères indisponibles' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Matchs</span>
        <span class="cm-kpi__value">{{ toutes ? nombre(toutes.matchs) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ toutes ? 'matchs de championnat (barrages, résultats attribués et prolongations écartés)' : 'repères indisponibles' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Buts par match</span>
        <span class="cm-kpi__value">{{ kpiButs.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiButs.detail }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Avantage du terrain</span>
        <span class="cm-kpi__value lbp__kpi-texte">{{ kpiTerrain.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiTerrain.detail }}</span>
      </div>
    </div>

    <!-- 2. D'où ça vient. -->
    <div class="lbp__entete">
      <ProvenanceChip :source="provenance" :releve-le="d?.calculeLe ?? null" action="calculé" :fichier="d?.base ?? null" :detail="detailProvenance" :vieux-apres-heures="48" />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="!league" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>
    <div class="cm-note is-info">
      <span class="cm-icon-box is-info"><AppIcon name="info" :size="16" /></span>
      <div>
        <p class="cm-note__title">Une saison, une seule source</p>
        <p class="cm-note__text lbp__texte">
          FotMob quand la saison est entière au magasin (depuis 2023), sinon football-data.co.uk : la source est écrite sur chaque ligne. football-data ne
          relève ni la minute des buts ni les penalties (« non relevé ») ; ses buts par mi-temps viennent du score à la mi-temps, et ses fichiers par pays n’ont
          que le score final. Seuls les matchs de championnat comptent : barrages, résultats attribués sur tapis vert et matchs prolongés sont écartés ; les
          coupes sont tenues à part.
        </p>
      </div>
    </div>

    <!-- 3. La petite courbe d'évolution. -->
    <h4 class="cm-group-title lbp__groupe">
      Évolution
      <HelpTip
        titre="Lire la courbe"
        texte="Saison par saison : un point par saison, de la plus ancienne à la plus récente ; un point plein vient de FotMob, un point creux de football-data.co.uk, la saison en cours est cerclée ; les tirets marquent la moyenne de toutes les saisons. Mois par mois : la forme d’une saison, toutes les saisons réunies (trait plein, mois d’au moins 10 matchs), et la saison la plus récente (tirets)."
      />
    </h4>
    <div class="lbp__commandes">
      <div class="lbp__choix" role="radiogroup" aria-label="Repère de la courbe">
        <button
          v-for="c in COURBES"
          :key="c.cle"
          type="button"
          role="radio"
          class="lbp__choix-btn"
          :class="{ 'is-active': repereCourbe === c.cle }"
          :aria-checked="repereCourbe === c.cle"
          @click="repereCourbe = c.cle"
        >
          {{ c.libelle }}
        </button>
      </div>
      <div class="lbp__choix" role="radiogroup" aria-label="Évolution montrée">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          role="radio"
          class="lbp__choix-btn"
          :class="{ 'is-active': mode === m.value }"
          :aria-checked="mode === m.value"
          @click="mode = m.value"
        >
          <AppIcon :name="m.icone" :size="13" />
          {{ m.label }}
        </button>
      </div>
    </div>
    <figure class="lbp__courbe">
      <template v-if="mode === 'saisons'">
        <p v-if="courbe.vide" class="lbp__texte">{{ descriptionCourbe }}</p>
        <div v-else class="lbp__trace">
          <svg class="lbp__svg" :viewBox="`0 0 ${LARGEUR} ${HAUTEUR}`" preserveAspectRatio="none" role="img" :aria-label="descriptionCourbe">
            <line v-if="courbe.moyenneY !== null" class="lbp__moyenne" x1="0" :x2="LARGEUR" :y1="courbe.moyenneY" :y2="courbe.moyenneY" />
            <path class="lbp__ligne" :d="courbe.chemin" />
          </svg>
          <span
            v-for="p in courbe.points"
            :key="p.saison"
            class="lbp__point"
            :class="[p.source === 'fotmob' ? 'is-fotmob' : 'is-fd', { 'is-en-cours': p.enCours }]"
            :style="{ left: `${(100 * p.x) / LARGEUR}%`, top: `${(100 * p.y) / HAUTEUR}%` }"
            :title="`${p.saison} (${libelleSource(p.source)}) : ${texteCourbe(p.valeur)} sur ${nombre(p.matchs)} matchs`"
          />
          <span class="lbp__repere is-haut cm-numeric">{{ texteCourbe(courbe.max) }}</span>
          <span class="lbp__repere is-bas cm-numeric">{{ texteCourbe(courbe.min) }}</span>
        </div>
        <figcaption v-if="!courbe.vide" class="lbp__legende">
          <span class="cm-numeric">{{ courbe.premiere }}</span>
          <span class="lbp__legende-milieu"><i class="lbp__pastille is-fd" /> football-data.co.uk <i class="lbp__pastille is-fotmob" /> FotMob <i class="lbp__tiret" /> moyenne de toutes les saisons</span>
          <span class="cm-numeric">{{ courbe.derniere }}</span>
        </figcaption>
      </template>
      <template v-else>
        <p v-if="courbeMois.vide" class="lbp__texte">{{ descriptionCourbe }}</p>
        <div v-else class="lbp__trace">
          <svg class="lbp__svg" :viewBox="`0 0 ${LARGEUR} ${HAUTEUR}`" preserveAspectRatio="none" role="img" :aria-label="descriptionCourbe">
            <path class="lbp__ligne" :d="courbeMois.toutes" />
            <path v-if="courbeMois.saison" class="lbp__ligne is-saison" :d="courbeMois.saison" />
          </svg>
          <span class="lbp__repere is-haut cm-numeric">{{ texteCourbe(courbeMois.max) }}</span>
          <span class="lbp__repere is-bas cm-numeric">{{ texteCourbe(courbeMois.min) }}</span>
        </div>
        <figcaption v-if="!courbeMois.vide" class="lbp__legende">
          <span class="cm-numeric">{{ courbeMois.mois[0].nom }}</span>
          <span class="lbp__legende-milieu"><i class="lbp__trait" /> toutes les saisons <i class="lbp__tiret is-saison" /> {{ saisonDuMois?.saison ?? 'saison récente' }}</span>
          <span class="cm-numeric">{{ courbeMois.mois.at(-1).nom }}</span>
        </figcaption>
      </template>
    </figure>

    <!-- 4. Saison par saison. -->
    <h4 class="cm-group-title lbp__groupe">
      Saison par saison
      <HelpTip
        titre="Comment lire ce tableau"
        texte="Une ligne par saison, la plus récente d’abord, avec sa source et ses matchs. Chaque case porte sur les matchs où le repère est relevé (survolez-la pour le nombre). Au pied : la moyenne de toutes les saisons (chaque saison pèse ses matchs), la valeur retenue (un petit championnat est ramené vers la moyenne des championnats d’autant plus qu’il a peu de matchs) et la moyenne des championnats (chacun compte pour un)."
      />
    </h4>
    <div class="cm-table-wrap lbp__wrap">
      <table class="cm-table lbp__table">
        <thead>
          <tr>
            <th class="is-left">Saison</th>
            <th v-for="c in COLONNES" :key="c.cle" :title="c.aide">{{ c.titre }}</th>
            <th class="is-left" title="Les trois scores les plus fréquents de la saison, et leur part des matchs">Scores fréquents</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in saisons" :key="s.saison" :class="{ 'is-en-cours': s.enCours }">
            <td class="is-left lbp__saison">
              <strong class="cm-numeric">{{ s.saison }}</strong>
              <span class="cm-chip lbp__source" :class="s.source === 'fotmob' ? 'is-info' : 'is-violet'">{{ libelleSource(s.source) }}</span>
              <small class="lbp__petit">{{ nombre(s.matchs) }} matchs</small>
              <small v-for="(n, i) in notesDeSaison(s)" :key="i" class="lbp__petit">{{ n }}</small>
            </td>
            <td v-for="c in COLONNES" :key="c.cle" class="cm-numeric lbp__case" :class="{ 'is-vide': !s.reperes?.[c.cle]?.matchs }" :title="titreCase(s, c.cle)">
              {{ texteCase(s.reperes?.[c.cle], DEFINITIONS[c.cle]) }}
              <small v-if="c.sous" class="lbp__petit" :title="titreCase(s, c.sous)">{{ texteCase(s.reperes?.[c.sous], DEFINITIONS[c.sous]) }}</small>
            </td>
            <td class="is-left lbp__scores">{{ scoresTexte(s.scores, s.matchs) }}</td>
          </tr>
          <tr v-if="!saisons.length">
            <td class="is-left lbp__vide" :colspan="COLONNES.length + 2">
              {{ etat.loading ? 'Lecture des repères…' : lu.texte ?? 'Aucune saison pour ce championnat.' }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Toutes les saisons<small class="lbp__petit">Σ {{ nombre(pied.matchs) }} matchs, {{ nombre(pied.saisons) }} saison(s)</small></td>
            <td v-for="c in COLONNES" :key="c.cle" class="cm-numeric is-strong" :title="`${libelleDe(c.cle)} : ${nombre(pied.reperes[c.cle]?.matchs ?? 0)} match(s), toutes saisons réunies`">
              {{ pied.reperes[c.cle]?.matchs ? valeurTexte(pied.reperes[c.cle].valeur, DEFINITIONS[c.cle].type, { signe: DEFINITIONS[c.cle].signe }) : 'non relevé' }}
              <small v-if="c.sous" class="lbp__petit">{{ pied.reperes[c.sous]?.matchs ? valeurTexte(pied.reperes[c.sous].valeur, DEFINITIONS[c.sous].type) : 'non relevé' }}</small>
            </td>
            <td class="is-left lbp__scores">{{ toutes ? scoresTexte(toutes.scores, toutes.matchs) : '' }}</td>
          </tr>
          <tr>
            <td class="is-left lbp__moyenne">Valeur retenue<small class="lbp__petit">ramenée vers la moyenne des championnats selon ses matchs</small></td>
            <td v-for="c in COLONNES" :key="c.cle" class="cm-numeric lbp__moyenne" :title="toutes?.reperes?.[c.cle]?.k ? `La moyenne des championnats pèse comme ${nombre(Math.round(toutes.reperes[c.cle].k))} matchs ; ce championnat, ${nombre(toutes.reperes[c.cle].matchs)}.` : ''">
              {{ toutes?.reperes?.[c.cle]?.retenue !== null && toutes?.reperes?.[c.cle]?.retenue !== undefined ? valeurTexte(toutes.reperes[c.cle].retenue, DEFINITIONS[c.cle].type, { signe: DEFINITIONS[c.cle].signe }) : 'non relevé' }}
            </td>
            <td class="is-left lbp__moyenne"></td>
          </tr>
          <tr>
            <td class="is-left lbp__moyenne">Moyenne des {{ nombre(general?.ligues ?? 0) }} championnats<small class="lbp__petit">chacun compte pour un</small></td>
            <td v-for="c in COLONNES" :key="c.cle" class="cm-numeric lbp__moyenne">
              {{ general?.reperes?.[c.cle] ? valeurTexte(general.reperes[c.cle].valeur, DEFINITIONS[c.cle].type, { signe: DEFINITIONS[c.cle].signe }) ?? 'non relevé' : 'non lu' }}
            </td>
            <td class="is-left lbp__moyenne"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 5. Dispersion et facteur de terrain, mesurés. -->
    <h4 class="cm-group-title lbp__groupe">
      Dispersion et facteur de terrain, mesurés
      <HelpTip
        titre="Ce qui est mesuré"
        texte="Pour les corners, les tirs et les tirs cadrés, le moteur attend pour chaque équipe la moyenne de ce qu’elle produit sur ses 10 derniers matchs et de ce que l’adversaire concède, multipliée par 1,10 à domicile et 0,90 à l’extérieur ; puis il tire ses probabilités d’une binomiale négative dont la dispersion (1/k) est fixe. Ici, chaque match est comparé à cet attendu calculé avec les seuls matchs d’avant : le facteur de terrain mesuré, la dispersion mesurée autour de l’attendu (la dispersion brute, autour de la seule moyenne du championnat, mêle l’écart entre équipes au hasard et sort toujours plus forte), leur intervalle à 95 %, et la valeur retenue (ramenée vers tous les championnats). Mesuré seulement : le moteur garde ses valeurs (étape 33 du plan, après le banc d’essai)."
      />
    </h4>
    <div class="cm-table-wrap lbp__wrap lbp__wrap--court">
      <table class="cm-table lbp__table">
        <thead>
          <tr>
            <th class="is-left">Statistique</th>
            <th>Matchs</th>
            <th title="Ce qu'une équipe qui reçoit fait de plus que son attendu neutre (moteur : 1,10)">Facteur domicile</th>
            <th title="Ce qu'une équipe qui se déplace fait de son attendu neutre (moteur : 0,90)">Facteur extérieur</th>
            <th title="1/k de la binomiale négative pour une équipe, autour de son attendu">Dispersion par équipe</th>
            <th title="1/k pour le total du match">Dispersion du total</th>
            <th title="1/k autour de la seule moyenne du championnat, sans l'attendu de chaque équipe">Dispersion brute</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lignesDispersion" :key="l.cle" :class="{ 'lbp__tous': l.portee === 'Tous les championnats' }">
            <td class="is-left is-strong">{{ l.statistique }}<small class="lbp__petit">{{ l.portee }}</small></td>
            <td class="cm-numeric">{{ nombre(l.matchs) }}</td>
            <td v-for="q in ['dom', 'ext', 'equipe', 'total']" :key="q" class="cm-numeric lbp__mesure" :class="{ 'is-hors': l[q].horsIntervalle }">
              {{ l[q].texte }}
              <small v-if="l[q].ic" class="lbp__petit">95 % : {{ l[q].ic }}</small>
              <small v-if="l[q].retenue" class="lbp__petit">retenue {{ l[q].retenue }}</small>
              <small v-if="l[q].moteur" class="lbp__petit">moteur {{ l[q].moteur }}{{ l[q].horsIntervalle ? ' · hors de l’intervalle' : '' }}</small>
            </td>
            <td class="cm-numeric lbp__moyenne">{{ l.equipe.brute ?? 'non mesurée' }}</td>
          </tr>
          <tr v-if="!lignesDispersion.length">
            <td class="is-left lbp__vide" colspan="7">{{ etat.loading ? 'Lecture des repères…' : 'Mesure indisponible : rien à afficher.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="lbp__pied">
      <AppIcon name="shield" :size="12" />
      <span>Mesuré seulement : le moteur garde 1,10 / 0,90 et ses dispersions fixes. Une valeur du moteur hors de l’intervalle à 95 % est signalée en ambre ; elle ne change rien tant que le banc d’essai (étape 19) n’a pas tranché.</span>
    </p>

    <!-- 6. Les deux sources face à face. -->
    <h4 class="cm-group-title lbp__groupe">
      FotMob et football-data.co.uk sur les mêmes saisons
      <HelpTip
        titre="Pourquoi ce recoupement"
        texte="Les saisons que les deux sources publient (depuis 2023) viennent de FotMob ; football-data les a aussi. Les mêmes repères calculés des deux côtés disent si les vingt saisons d’avant, venues de football-data, se lisent comme celles de FotMob. Un écart sur le nombre de matchs vient d’un fichier par pays qui compte aussi les playoffs ou une autre phase."
      />
    </h4>
    <p class="lbp__texte">
      {{ recoupement ? `Saisons ${recoupement.saisons.join(', ')} : chaque repère calculé chez FotMob et chez football-data.co.uk.` : 'Pas de saison commune aux deux sources pour ce championnat (football-data.co.uk ne le publie pas, ou pas encore de saison finie depuis 2023).' }}
    </p>
    <div class="cm-table-wrap lbp__wrap lbp__wrap--court">
      <table class="cm-table lbp__table">
        <thead>
          <tr>
            <th class="is-left">Repère</th>
            <th>FotMob</th>
            <th>football-data.co.uk</th>
            <th>Écart</th>
            <th>Matchs (FotMob / football-data)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lignesRecoupement" :key="l.cle">
            <td class="is-left">{{ l.libelle }}</td>
            <td class="cm-numeric">{{ l.fotmob }}</td>
            <td class="cm-numeric">{{ l.footballData }}</td>
            <td class="cm-numeric is-strong">{{ l.ecart }}</td>
            <td class="cm-numeric">{{ l.matchs }}</td>
          </tr>
          <tr v-if="!lignesRecoupement.length">
            <td class="is-left lbp__vide" colspan="5">{{ recoupement ? 'Aucun repère relevé des deux côtés.' : 'Rien à recouper.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.lbp {
  container: lbp / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lbp__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.lbp__kpi-texte {
  font-size: 19px;
  line-height: 1.3;
}

.lbp__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.lbp__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.lbp__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.lbp__commandes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

/* Les choix de la courbe : barres segmentées, même dessin que TabbedView. */
.lbp__choix {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.lbp__choix-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.lbp__choix-btn:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.lbp__choix-btn.is-active,
.lbp__choix-btn.is-active:hover {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* La petite courbe : jamais le vert ni le rouge (une tendance n'est ni bonne ni mauvaise). */
.lbp__courbe {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 14px 16px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.lbp__trace {
  position: relative;
  height: 130px;
  margin-left: 52px;
}

.lbp__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.lbp__ligne {
  fill: none;
  stroke: var(--cm-info);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.lbp__ligne.is-saison {
  stroke: var(--cm-violet);
  stroke-dasharray: 6 4;
}

.lbp__moyenne {
  stroke: var(--cm-border-strong);
  stroke-width: 1;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}

.lbp__point {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.lbp__point.is-fotmob {
  background: var(--cm-info);
}

.lbp__point.is-fd {
  background: var(--cm-surface-alt);
  border: 2px solid var(--cm-violet);
}

.lbp__point.is-en-cours {
  box-shadow: 0 0 0 3px rgba(var(--cm-info-rgb) / 0.35);
}

.lbp__repere {
  position: absolute;
  left: -52px;
  width: 46px;
  font-size: 10.5px;
  text-align: right;
  color: var(--cm-text-muted);
  transform: translateY(-50%);
}

.lbp__repere.is-haut {
  top: 8%;
}

.lbp__repere.is-bas {
  top: 92%;
}

.lbp__legende {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: 52px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.lbp__legende-milieu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.lbp__pastille {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.lbp__pastille.is-fotmob {
  background: var(--cm-info);
}

.lbp__pastille.is-fd {
  border: 2px solid var(--cm-violet);
}

.lbp__tiret,
.lbp__trait {
  display: inline-block;
  width: 18px;
  height: 0;
  border-top: 1px dashed var(--cm-border-strong);
}

.lbp__trait {
  border-top: 2px solid var(--cm-info);
}

.lbp__tiret.is-saison {
  border-top: 2px dashed var(--cm-violet);
}

.lbp__wrap {
  max-height: 560px;
}

.lbp__wrap--court {
  max-height: 420px;
}

.lbp__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.lbp__saison {
  min-width: 150px;
  white-space: normal;
}

.lbp__source {
  margin-left: 6px;
}

.lbp__case.is-vide {
  color: var(--cm-text-muted);
  font-size: 11px;
  white-space: normal;
  min-width: 96px;
}

.lbp__scores {
  min-width: 190px;
  white-space: normal;
  color: var(--cm-text-secondary);
}

.lbp__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.lbp__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.lbp__moyenne {
  color: var(--cm-text-muted);
}

.lbp__mesure {
  min-width: 128px;
  white-space: normal;
}

/* Le moteur hors de l'intervalle mesuré : à regarder (ambre), jamais vert ni rouge. */
.lbp__mesure.is-hors .lbp__petit:last-child {
  color: var(--cm-warning);
  font-weight: 600;
}

.lbp__tous td {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.lbp__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.lbp__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container lbp (max-width: 560px) {
  .lbp__trace,
  .lbp__legende {
    margin-left: 40px;
  }

  .lbp__repere {
    left: -40px;
    width: 36px;
  }
}
</style>
