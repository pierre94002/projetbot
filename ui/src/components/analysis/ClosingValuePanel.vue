<script setup>
import { computed, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { formatOdds, formatPercent } from '@/utils/format.js';

/**
 * La valeur de clôture (04/10/2026, Pierre : « lance les 4 améliorations ») :
 * APRÈS un pronostic ou un pari, la cote du marché a-t-elle baissé — le
 * marché lui a donné raison — ou monté ? C'est la meilleure mesure connue de
 * la qualité de pronostics sur la durée : elle parle dès le coup d'envoi,
 * quand les résultats demandent des centaines de matchs pour sortir du
 * hasard (cf. server/src/data/closingValue.js).
 *
 *   - `predictions` (Historique moteur) : de combien la cote JUSTE (marge
 *     retirée) de l'issue choisie a baissé entre le pronostic et la clôture ;
 *   - `bets` (Performance paris) : la cote prise face à la probabilité juste
 *     de clôture (cote × probabilité − 1), l'espérance du pari vue avec
 *     l'information de la dernière minute ; le mouvement de la cote juste
 *     reste à côté, comme pour le moteur.
 *
 * Seuls trois marchés ont des cotes gratuites (1N2, plus/moins de buts, les
 * deux équipes marquent) : tout ce qui n'est pas mesuré est compté et dit,
 * raison par raison — règle de Pierre du 04/10/2026, pas de cote absente
 * sans le dire.
 */
const props = defineProps({
  // 'predictions' : les pronostics du moteur ; 'bets' : les paris, sélection par sélection.
  scope: { type: String, default: 'predictions', validator: (v) => v === 'predictions' || v === 'bets' }
});

// Le détail se lit d'un coup d'œil sur 30 lignes ; le reste à la demande.
const LIGNES = 30;

const etat = ref({ loading: false, error: null, data: null });
const toutVoir = ref(false);
// Dans Historique moteur, le détail (jusqu'à 30 lignes) repoussait la liste
// des rencontres où Pierre saisit les scores : replié par défaut, ouvert d'un
// clic. Côté paris (Performance paris), il reste ouvert.
const detailOuvert = ref(props.scope === 'bets');
// Une réponse arrivée après une demande plus récente ne doit pas l'écraser.
let derniereDemande = 0;

async function charger({ force = false } = {}) {
  const numero = ++derniereDemande;
  // Le rapport d'une autre portée ne reste pas affiché pendant le calcul de celle-ci.
  const garde = etat.value.data?.scope === props.scope ? etat.value.data : null;
  etat.value = { loading: true, error: null, data: garde };
  try {
    const data = await oddsApi.closingValue({ scope: props.scope, force });
    if (numero === derniereDemande) etat.value = { loading: false, error: null, data };
  } catch (error) {
    // Un recalcul raté garde le dernier rapport à l'écran, l'erreur au-dessus.
    if (numero === derniereDemande) etat.value = { loading: false, error: error.message, data: garde };
  }
}

watch(() => props.scope, () => charger(), { immediate: true });

// ------------------------------------------------------------ lecture
const estParis = computed(() => props.scope === 'bets');
const titre = computed(() => (estParis.value ? 'Tes paris ont-ils battu la cote de clôture ?' : 'Le marché a-t-il donné raison au moteur ?'));
const sousTitre = computed(() =>
  estParis.value
    ? "Pour chaque sélection, la cote prise face à la probabilité juste de la dernière minute avant le match (cote prise × probabilité de clôture − 1) : positive, le pari avait de la valeur, quel qu'en soit le résultat."
    : "Pour chaque pronostic, de combien la cote juste de l'issue choisie (marge retirée) a baissé entre le pronostic et la clôture : la meilleure mesure de la qualité des pronostics, bien avant que les résultats parlent."
);
const rapport = computed(() => etat.value.data);
const entrees = computed(() => rapport.value?.entries ?? []);
const lignes = computed(() => (toutVoir.value ? entrees.value : entrees.value.slice(0, LIGNES)));
const manques = computed(() => rapport.value?.missing ?? []);
const nonMesures = computed(() => manques.value.reduce((t, m) => t + (m.count ?? 0), 0));

// Un pronostic (masculin) côté moteur ; une sélection (féminin) côté paris :
// un combiné y compte une fois par sélection, comme le serveur le mesure.
const UNITES = {
  predictions: { un: 'pronostic', des: 'pronostics', e: '' },
  bets: { un: 'sélection', des: 'sélections', e: 'e' }
};
const unite = computed(() => UNITES[props.scope] ?? UNITES.predictions);

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const compte = (n) => `${nombre(n)} ${n > 1 ? unite.value.des : unite.value.un}`;
// Arrondi AVANT le signe et la couleur : un −0,004 % ne s'affiche ni « -0.00% » ni en rouge.
const arrondi = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const signe = (v) => formatPercent(arrondi(v), { showSign: true });
const couleur = (v) => {
  const r = arrondi(v);
  return r > 0 ? 'cm-positive' : r < 0 ? 'cm-negative' : '';
};
const pastille = (v) => {
  const r = arrondi(v);
  return r > 0 ? 'is-positive' : r < 0 ? 'is-negative' : '';
};
const part = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : '—');
const proba = (p) => `${(p * 100).toFixed(1)}%`;
const positifs = (g) => Math.round((g?.positiveShare ?? 0) * (g?.n ?? 0));
// Le libellé du serveur commence par une majuscule ; dans une phrase, il suit un tiret.
const minuscule = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');

// ------------------------------------------------------------- dates
const ANNEE = new Date().getFullYear();
/**
 * Le jour du match. Seule la date compte ici : les anciens pronostics n'ont
 * pas l'heure du coup d'envoi (le serveur retrouve la rencontre au jour près).
 */
function jourDe(e) {
  const iso = e.commenceTime ?? (e.matchDate ? `${e.matchDate}T12:00:00` : null);
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function jourCourt(e) {
  const d = jourDe(e);
  if (!d) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== ANNEE ? { year: 'numeric' } : {}) }).format(d);
}
const horodatage = (iso) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
function titreDate(e) {
  const d = jourDe(e);
  const morceaux = [];
  if (d) morceaux.push(`Match du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(d)}`);
  if (e.pickAt) morceaux.push(`${estParis.value ? 'pari enregistré' : 'pronostic enregistré'} le ${horodatage(e.pickAt)}`);
  return morceaux.join(' · ');
}

// ------------------------------------------------------------ provenance
// La vraie provenance de chaque prix (règle de Pierre, 03/10/2026) : les
// relevés gratuits, nommés comme dans Réglages › Cotes.
const NOMS = { espn: 'ESPN', 'football-data.co.uk': 'football-data.co.uk', '365scores': '365Scores', kalshi: 'Kalshi', smarkets: 'Smarkets' };
const nomSource = (s) => NOMS[s] ?? s;
const momentDuChoix = computed(() => (estParis.value ? 'du pari' : 'du pronostic'));

/** Qui fait la cote juste de clôture : la moyenne des bookmakers, sinon les bourses d'échange. */
function provenance(e) {
  const n = e.bookmakers ?? 0;
  return e.exchangeOnly ? `bourse${n > 1 ? 's' : ''} d'échange seule${n > 1 ? 's' : ''}` : `${n} bookmaker${n > 1 ? 's' : ''}`;
}
function titreCotes(e) {
  const debut = e.approx
    ? `Ouverture (aucun relevé daté au moment ${momentDuChoix.value}) : cote juste ${formatOdds(e.pickFairOdds)}, probabilité ${proba(e.pickProb)}`
    : `Au moment ${momentDuChoix.value} : cote juste ${formatOdds(e.pickFairOdds)}, probabilité ${proba(e.pickProb)}`;
  const fin = `À la clôture : cote juste ${formatOdds(e.closeFairOdds)}, probabilité ${proba(e.closeProb)}`;
  const qui = e.exchangeOnly
    ? e.bookmakers > 1
      ? `Aucun bookmaker : ${e.bookmakers} bourses d'échange, pondérées par l'argent échangé`
      : "Aucun bookmaker : une seule bourse d'échange"
    : `Moyenne de ${e.bookmakers} bookmaker${e.bookmakers > 1 ? 's' : ''}, marge retirée`;
  const sources = e.sources?.length ? `Sources qui cotent ce match : ${e.sources.map(nomSource).join(', ')}` : '';
  return [debut, fin, qui, sources].filter(Boolean).join('\n');
}

// Une mesure « à l'ouverture » : l'historique rattrapé n'a que l'ouverture et la
// clôture, pas de prix daté du moment du choix. Pour un pari, seule la variation
// en dépend : la valeur à la clôture part de la cote prise.
const titreOuverture = computed(() =>
  estParis.value
    ? "Aucun relevé daté au moment du pari : l'historique rattrapé n'a qu'une ouverture et une clôture. La variation de la cote juste se mesure donc de l'ouverture à la clôture ; la valeur à la clôture, elle, part de la cote prise et n'en dépend pas."
    : "Aucun relevé daté au moment du pronostic : l'historique rattrapé n'a qu'une ouverture et une clôture. Le prix du choix est donc celui de l'ouverture, et la variation se mesure de l'ouverture à la clôture."
);

function titreVariation(e) {
  const de = formatOdds(e.pickFairOdds);
  const a = formatOdds(e.closeFairOdds);
  const depart = e.approx ? "l'ouverture" : estParis.value ? 'le pari' : 'le pronostic';
  const r = arrondi(e.clvPct);
  if (r > 0) return `Cote juste passée de ${de} à ${a} entre ${depart} et la clôture : le marché a ensuite donné raison à ce choix.`;
  if (r < 0) return `Cote juste passée de ${de} à ${a} entre ${depart} et la clôture : le marché est allé contre ce choix.`;
  return `Cote juste inchangée (${de}) entre ${depart} et la clôture.`;
}
function titreValeur(e) {
  if (e.valueAtClosePct === null || e.valueAtClosePct === undefined) {
    return "Cette sélection n'a pas de cote dans le carnet : la valeur à la clôture ne se calcule pas.";
  }
  const r = arrondi(e.valueAtClosePct);
  const verdict =
    r > 0
      ? 'la cote prise payait plus que le prix juste de la dernière minute'
      : r < 0
        ? 'la cote prise payait moins que le prix juste de la dernière minute'
        : 'la cote prise valait exactement le prix juste de la dernière minute';
  return `Cote prise ${formatOdds(e.oddsTaken)} × probabilité juste de clôture ${proba(e.closeProb)} − 1 = ${signe(e.valueAtClosePct)} : ${verdict}.`;
}

// ------------------------------------------------------------ tableaux
// Par marché toujours ; par type (paris recommandés / pronostics simples)
// pour le moteur seulement, le serveur ne le calcule pas pour les paris.
const tableaux = computed(() => {
  const r = rapport.value;
  if (!r) return [];
  const liste = [{ cle: 'marche', titre: 'Par marché', colonne: 'Marché', total: 'Tous marchés', groupes: r.byMarket ?? [] }];
  if (!estParis.value && r.byAction?.length) {
    liste.push({ cle: 'type', titre: 'Par type de pronostic', colonne: 'Type', total: 'Tous les pronostics', groupes: r.byAction });
  }
  return liste.filter((t) => t.groupes.length);
});
const titreMoyenne = computed(() =>
  estParis.value
    ? 'Moyenne de la valeur à la clôture : cote prise × probabilité juste de clôture − 1'
    : 'Moyenne de la variation de la cote juste (marge retirée) entre le pronostic et la clôture'
);
const titrePositifs = computed(() =>
  estParis.value
    ? 'Part des sélections dont la cote prise payait plus que le prix juste de clôture.'
    : 'Part des pronostics dont la cote juste a baissé après le choix : le marché leur a ensuite donné raison.'
);

// ------------------------------------------------------- ce qui manque
const pasMesures = (n) => (n > 1 ? `ne sont pas mesuré${unite.value.e}s` : `n'est pas mesuré${unite.value.e}`);
// Le serveur parle de « pronostic » pour les deux portées : côté paris, c'est un pari.
const LIBELLES_PARIS = {
  apres: 'Pari enregistré après le coup d’envoi',
  sansDate: 'Ancien pari sans date de match, et rencontre introuvable au magasin'
};
const libelleManque = (m) => (estParis.value && LIBELLES_PARIS[m.reason]) || m.label || m.reason;
const titreVide = computed(() => (estParis.value ? "Aucune sélection mesurable pour l'instant" : "Aucun pronostic mesurable pour l'instant"));
/** Rien de mesuré : pourquoi, d'après la première raison du serveur (toutes suivent dans « Ce qui manque »). */
const pourquoiRien = computed(() => {
  const r = rapport.value;
  if (!r) return '';
  if (!r.totalEntries) {
    return estParis.value
      ? 'Le carnet ne contient encore aucun pari : chaque sélection placée depuis Mes paris sera comparée à la cote de clôture une fois le match commencé.'
      : "Le moteur n'a encore enregistré aucun pronostic : ils s'enregistrent à chaque scan lancé depuis Mes paris.";
  }
  const premiere = manques.value[0];
  const debut =
    r.totalEntries > 1
      ? `${estParis.value ? 'Aucune' : 'Aucun'} des ${compte(r.totalEntries)} n'a encore pu être comparé${unite.value.e} aux cotes relevées`
      : `${estParis.value ? 'La seule sélection' : 'Le seul pronostic'} n'a pas encore pu être comparé${unite.value.e} aux cotes relevées`;
  return premiere ? `${debut} — d'abord : ${minuscule(libelleManque(premiere))} (${nombre(premiere.count)}). Toutes les raisons sont détaillées ci-dessous.` : `${debut}.`;
});
</script>

<template>
  <AppCard icon="trendUp" eyebrow="Valeur de clôture" :title="titre" :subtitle="sousTitre">
    <template #actions>
      <HelpTip terme="valeur-de-cloture" />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger({ force: true })">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Recalculer
      </AppButton>
    </template>

    <div class="clv" :class="{ 'is-busy': etat.loading && rapport }" :aria-busy="etat.loading">
      <LoadingSpinner v-if="etat.loading && !rapport" label="Calcul de la valeur de clôture…" />

      <div v-if="etat.error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">{{ rapport ? 'Recalcul impossible — dernier calcul affiché' : 'Valeur de clôture indisponible' }}</p>
          <p class="cm-note__text">{{ etat.error }}</p>
        </div>
      </div>

      <template v-if="rapport">
        <!-- Rien de mesuré : on dit pourquoi, la liste complète suit dans « Ce qui manque ». -->
        <EmptyState v-if="!rapport.measured" icon="trendUp" :title="titreVide" :description="pourquoiRien" />

        <template v-else>
          <!-- 1. Les chiffres clés. -->
          <div class="cm-kpis">
            <div
              class="cm-kpi"
              title="Une mesure demande une cote au moment du choix (ou à l'ouverture) et une cote de clôture, sur l'un des trois marchés cotés gratuitement : résultat, plus/moins de buts, les deux équipes marquent."
            >
              <span class="cm-kpi__label">Mesuré{{ unite.e }}s</span>
              <span class="cm-kpi__value">{{ nombre(rapport.measured) }}</span>
              <span class="cm-kpi__detail">sur {{ compte(rapport.totalEntries) }}{{ estParis ? ' de paris' : '' }}</span>
            </div>
            <div class="cm-kpi is-section" :title="titreMoyenne">
              <span class="cm-kpi__label">{{ estParis ? 'Valeur à la clôture' : 'Valeur de clôture' }}</span>
              <span class="cm-kpi__value" :class="couleur(rapport.summary.avgPct)">{{ signe(rapport.summary.avgPct) }}</span>
              <span class="cm-kpi__detail">{{ estParis ? 'moyenne : cote prise × probabilité de clôture − 1' : 'moyenne : baisse de la cote juste après le choix' }}</span>
            </div>
            <div class="cm-kpi" :title="titrePositifs">
              <span class="cm-kpi__label">Au-dessus de zéro</span>
              <span class="cm-kpi__value">{{ part(rapport.summary.positiveShare) }}</span>
              <span class="cm-bar clv__kpi-bar"><span class="cm-bar__fill" :style="{ width: `${(rapport.summary.positiveShare ?? 0) * 100}%` }" /></span>
              <span class="cm-kpi__detail">{{ nombre(positifs(rapport.summary)) }} sur {{ nombre(rapport.summary.n) }} mesuré{{ unite.e }}{{ rapport.summary.n > 1 ? 's' : '' }}</span>
            </div>
            <div
              v-if="estParis"
              class="cm-kpi"
              title="Variation moyenne de la cote juste de la sélection entre le pari et la clôture, sans tenir compte de la cote prise. Positif : le marché a ensuite donné raison au pari."
            >
              <span class="cm-kpi__label">Mouvement moyen</span>
              <span class="cm-kpi__value" :class="couleur(rapport.movement.avgPct)">{{ signe(rapport.movement.avgPct) }}</span>
              <span class="cm-kpi__detail">cote juste en baisse pour {{ part(rapport.movement.positiveShare) }}</span>
            </div>
            <div class="cm-kpi" :title="titreOuverture">
              <span class="cm-kpi__label">Mesuré{{ unite.e }}s à l'ouverture</span>
              <span class="cm-kpi__value">{{ nombre(rapport.approxCount) }}</span>
              <span class="cm-kpi__detail">prix du choix = cote d'ouverture</span>
            </div>
          </div>

          <!-- 2. Par marché et, pour le moteur, par type de pronostic. -->
          <div v-if="tableaux.length" class="clv__breakdowns" :class="{ 'is-double': tableaux.length > 1 }">
            <section v-for="t in tableaux" :key="t.cle" class="clv__section">
              <h4 class="cm-group-title">{{ t.titre }}</h4>
              <div class="cm-table-wrap">
                <table class="cm-table">
                  <thead>
                    <tr>
                      <th>{{ t.colonne }}</th>
                      <th title="Mesures comparées aux cotes relevées">Mesuré{{ unite.e }}s</th>
                      <th :title="titreMoyenne">{{ estParis ? 'Valeur moy.' : 'Variation moy.' }}</th>
                      <th title="Part des mesures strictement positives">Au-dessus de 0</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="g in t.groupes" :key="g.key">
                      <td class="is-strong clv__label">{{ g.label }}</td>
                      <td class="cm-numeric">{{ nombre(g.n) }}</td>
                      <td class="cm-numeric">
                        <span class="cm-pill clv__pill" :class="pastille(g.avgPct)">{{ signe(g.avgPct) }}</span>
                      </td>
                      <td class="cm-numeric" :title="`${nombre(positifs(g))} sur ${nombre(g.n)}`">
                        <span class="clv__share">
                          <span class="cm-bar clv__share-bar"><span class="cm-bar__fill" :style="{ width: `${(g.positiveShare ?? 0) * 100}%` }" /></span>
                          <span>{{ part(g.positiveShare) }}</span>
                        </span>
                      </td>
                    </tr>
                    <tr class="is-total">
                      <td class="is-strong clv__label">{{ t.total }}</td>
                      <td class="cm-numeric">{{ nombre(rapport.summary.n) }}</td>
                      <td class="cm-numeric">
                        <span class="cm-pill clv__pill" :class="pastille(rapport.summary.avgPct)">{{ signe(rapport.summary.avgPct) }}</span>
                      </td>
                      <td class="cm-numeric" :title="`${nombre(positifs(rapport.summary))} sur ${nombre(rapport.summary.n)}`">
                        <span class="clv__share">
                          <span class="cm-bar clv__share-bar"><span class="cm-bar__fill" :style="{ width: `${(rapport.summary.positiveShare ?? 0) * 100}%` }" /></span>
                          <span>{{ part(rapport.summary.positiveShare) }}</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>

        <!-- 3. Ce qui manque, raison par raison : rien n'est écarté en silence. -->
        <div v-if="manques.length" class="cm-note is-warning">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
          <div>
            <p class="cm-note__title">Ce qui manque</p>
            <p class="cm-note__text">{{ compte(nonMesures) }} sur {{ nombre(rapport.totalEntries) }} {{ pasMesures(nonMesures) }} :</p>
            <ul class="clv__gaps">
              <li v-for="m in manques" :key="m.reason">
                <strong>{{ compte(m.count) }}</strong> — {{ minuscule(libelleManque(m)) }}.
              </li>
            </ul>
          </div>
        </div>

        <!-- 4. Le détail, du match le plus récent au plus ancien. -->
        <section v-if="rapport.measured && entrees.length" class="clv__section">
          <h4 class="cm-group-title">{{ estParis ? 'Sélection par sélection' : 'Pronostic par pronostic' }}</h4>
          <button v-if="!detailOuvert" type="button" class="cm-link clv__open" :aria-expanded="false" @click="detailOuvert = true">
            <AppIcon name="chevronDown" :size="13" class="clv__caret" />
            Voir le détail des {{ compte(entrees.length) }}
          </button>
          <template v-else>
          <div class="cm-table-wrap">
            <table class="cm-table clv__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th class="is-left">Match</th>
                  <th class="is-left">{{ estParis ? 'Sélection' : 'Pronostic' }}</th>
                  <th title="Cote sans la marge du bookmaker : au moment du choix (ou à l'ouverture), puis à la clôture">
                    Cote juste <span class="clv__th-hint">choix → clôture</span>
                  </th>
                  <th title="De combien la cote juste a baissé entre le choix et la clôture : positif = le marché a ensuite donné raison au choix">Variation</th>
                  <template v-if="estParis">
                    <th title="La cote à laquelle la sélection a été jouée">Cote prise</th>
                    <th title="Cote prise × probabilité juste de clôture − 1">Valeur <span class="clv__th-hint">à la clôture</span></th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in lignes" :key="e.id">
                  <td class="cm-numeric clv__date" :title="titreDate(e)">{{ jourCourt(e) }}</td>
                  <td class="is-left clv__wrap">
                    <span class="clv__match">
                      <TeamCrest :name="e.homeName" :league="e.league" :size="16" class="clv__crest" />{{ e.homeName }}
                      <span class="clv__vs">–</span>
                      {{ e.awayName }}<TeamCrest :name="e.awayName" :league="e.league" :size="16" class="clv__crest is-away" />
                    </span>
                    <span v-if="e.league" class="clv__sub">{{ e.league }}</span>
                  </td>
                  <td class="is-left clv__wrap">
                    <span class="clv__pick">
                      <PickCrest :item="e.label ?? ''" :home="e.homeName" :away="e.awayName" :league="e.league" :size="16" reserve />{{ e.label ?? e.marketLabel }}
                    </span>
                    <span class="clv__sub">{{ e.marketLabel }}<template v-if="e.legsCount > 1"> · combiné de {{ e.legsCount }}</template></span>
                  </td>
                  <td class="cm-numeric" :title="titreCotes(e)">
                    <span class="clv__odds">
                      <span v-if="e.approx" class="cm-chip is-warning clv__approx" :title="titreOuverture">ouverture</span>
                      <span class="clv__from">{{ formatOdds(e.pickFairOdds) }}</span>
                      <span class="clv__arrow">→</span>
                      <span class="clv__to">{{ formatOdds(e.closeFairOdds) }}</span>
                    </span>
                    <span class="clv__sub">{{ provenance(e) }}</span>
                  </td>
                  <td class="cm-numeric is-strong" :class="couleur(e.clvPct)" :title="titreVariation(e)">{{ signe(e.clvPct) }}</td>
                  <template v-if="estParis">
                    <td class="cm-numeric">
                      <span v-if="e.oddsTaken" class="cm-pill clv__taken">{{ formatOdds(e.oddsTaken) }}</span>
                      <span v-else class="cm-text-muted" title="Aucune cote notée pour cette sélection dans le carnet">non notée</span>
                    </td>
                    <td class="cm-numeric is-strong" :class="couleur(e.valueAtClosePct)" :title="titreValeur(e)">
                      <template v-if="e.valueAtClosePct !== null && e.valueAtClosePct !== undefined">{{ signe(e.valueAtClosePct) }}</template>
                      <span v-else class="cm-text-muted">sans cote prise</span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="entrees.length > LIGNES || rapport.measured > entrees.length" class="clv__foot">
            <button v-if="entrees.length > LIGNES" type="button" class="cm-link" :aria-expanded="toutVoir" @click="toutVoir = !toutVoir">
              <AppIcon name="chevronDown" :size="13" class="clv__caret" :class="{ 'is-open': toutVoir }" />
              {{ toutVoir ? `Seulement les ${LIGNES} plus récent${unite.e}s` : `Voir les ${nombre(entrees.length - LIGNES)} autres` }}
            </button>
            <!-- Le serveur ne renvoie que les mesures les plus récentes : le dire plutôt que laisser croire à une liste complète. -->
            <span v-if="rapport.measured > entrees.length" class="clv__cap">
              Le détail s'arrête aux {{ nombre(entrees.length) }} mesures les plus récentes ; les chiffres clés et les tableaux comptent les
              {{ nombre(rapport.measured) }}.
            </span>
          </div>
          </template>
        </section>

        <!-- 5. Comment lire, et d'où viennent les cotes. -->
        <div class="cm-note is-info">
          <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
          <div>
            <p class="cm-note__title">Comment lire</p>
            <p class="cm-note__text">
              <template v-if="estParis">
                Valeur positive : la cote prise payait plus que le prix juste de la dernière minute — le pari avait de la valeur, quel qu'en soit le résultat.
              </template>
              <template v-else>Variation positive : après le pronostic, la cote juste de l'issue choisie a baissé — le marché a ensuite donné raison au moteur.</template>
              Une moyenne positive sur beaucoup de {{ estParis ? 'paris' : 'pronostics' }} est le meilleur signe qu'on gagne à long terme. Les cotes viennent des
              relevés gratuits — ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets —, marge retirée.
            </p>
            <p v-if="rapport.generatedAt" class="clv__stamp">Calculé le {{ horodatage(rapport.generatedAt) }}.</p>
          </div>
        </div>
      </template>
    </div>
  </AppCard>
</template>

<style scoped>
/* Le panneau se règle sur SA largeur : page large comme colonne étroite. */
.clv {
  container: clv / inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: opacity var(--cm-transition);
}

/* Un recalcul en cours : le rapport précédent reste lisible, estompé. */
.clv.is-busy {
  opacity: 0.6;
}

/* ------------------------------------------------------- chiffres clés */
.clv__kpi-bar {
  margin: 4px 0 2px;
}

.clv__kpi-bar .cm-bar__fill,
.clv__share .cm-bar__fill {
  background: var(--cm-accent);
}

/* ------------------------------------------------------------ tableaux */
.clv__breakdowns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.clv__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* La ligne « Tous marchés » : un filet plus marqué et un fond à peine teinté. */
.cm-table tr.is-total td {
  border-top: 1px solid var(--cm-border);
  background: rgba(var(--cm-section-rgb) / 0.05);
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La moyenne en pastille, verte ou rouge selon le signe ; grise à zéro. */
.clv__pill {
  min-width: 64px;
  font-size: 12px;
}

.clv__pill.is-positive {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.clv__pill.is-negative {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* Le libellé passe à la ligne : côte à côte sur un écran de portable, une
   colonne de marché sans retour (« Les deux équipes marquent ») faisait
   déborder le tableau de sa moitié de carte. */
.cm-table td.clv__label {
  white-space: normal;
  min-width: 110px;
}

.clv__share {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.clv__share-bar {
  width: 44px;
}

/* ------------------------------------------------------ ce qui manque */
.clv__gaps {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.clv__gaps strong {
  color: var(--cm-text-primary);
  font-variant-numeric: tabular-nums;
}

/* ------------------------------------------------------------- détail */
/* La précision d'en-tête sous le libellé : sur une seule ligne, « Cote juste
   choix → clôture » était plus large que les cotes qu'elle annonce. */
.clv__th-hint {
  display: block;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

/* Les noms de clubs et les pronostics passent à la ligne plutôt que de
   pousser le tableau hors de la carte (cm-table interdit le retour à la ligne). */
.clv__table td.clv__wrap {
  white-space: normal;
  min-width: 170px;
}

.clv__date {
  color: var(--cm-text-secondary);
}

.clv__match,
.clv__pick {
  font-weight: 600;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.clv__crest {
  margin-right: 6px;
}

.clv__crest.is-away {
  margin-right: 0;
  margin-left: 6px;
}

.clv__vs {
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* La précision sous la valeur : compétition, marché, provenance. */
.clv__sub {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.clv__odds {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.clv__from {
  color: var(--cm-text-secondary);
}

.clv__arrow {
  color: var(--cm-text-muted);
}

.clv__to {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.clv__approx {
  padding: 1px 7px;
  font-size: 10px;
}

.clv__taken {
  min-width: 0;
  font-size: 12px;
}

.clv__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.clv__caret {
  transition: transform var(--cm-transition);
}

.clv__caret.is-open {
  transform: rotate(180deg);
}

.clv__cap {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.clv__stamp {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* -------------------------------------------------------- adaptation */
/* Les deux tableaux de synthèse côte à côte dès que la place existe. */
@container clv (min-width: 900px) {
  .clv__breakdowns.is-double {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Colonne étroite : les précisions d'en-tête passent dans l'info-bulle
   (le `title` garde la version longue), les colonnes de texte se resserrent. */
@container clv (max-width: 600px) {
  .clv__th-hint {
    display: none;
  }

  .clv__table td.clv__wrap {
    min-width: 130px;
  }

  .clv__share-bar {
    width: 36px;
  }
}

.clv__open {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
