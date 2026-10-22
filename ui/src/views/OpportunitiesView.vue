<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppToggle from '@/components/common/AppToggle.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ConfidenceGauge from '@/components/common/ConfidenceGauge.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import KickoffCountdown from '@/components/common/KickoffCountdown.vue';
import LineupStateBadge from '@/components/common/LineupStateBadge.vue';
import OddsMoveArrow from '@/components/common/OddsMoveArrow.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import ValueBadge from '@/components/common/ValueBadge.vue';
import AVerifierBadge from '@/components/common/AVerifierBadge.vue';
import BettingMapChip from '@/components/common/BettingMapChip.vue';
import BettingMapGrid from '@/components/analysis/BettingMapGrid.vue';
import { bettingMapApi } from '@/services/bettingMapApi.js';
import { moisDit } from '@/utils/carteOuParier.js';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PaidOddsAdvicePanel from '@/components/settings/PaidOddsAdvicePanel.vue';
import { opportunitiesApi } from '@/services/opportunitiesApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import { formatOdds } from '@/utils/format.js';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { liveNow } from '@/utils/liveClock.js';
import { etatVerdict, ilYA } from '@/utils/langageParis.js';
import { VALEURS_MINIMALES, PERIODES, dansLaPeriode, opportunitesAffichees, rangVivant } from '@/utils/opportunites.js';
import { etatNotifications, activerNotifications, desactiverNotifications, relireEtatNotifications } from '@/composables/useNotificationsOpportunites.js';

/**
 * La page « Opportunités du jour » (étape 8 du plan, 06/10/2026) — un onglet
 * de la page Matchs, à côté du Repérage et des Chutes de cotes qu'elle réunit.
 * Une ligne par pari possible : la probabilité du moteur et sa cote juste, la
 * cote de VOS bookmakers avec l'heure de son relevé, le VERDICT du moteur
 * (ValueBadge : vert seulement si findValueBet le recommande et que la cote est
 * fraîche — la même source que l'onglet « Value bets » de Mes paris), le
 * mouvement de la cote depuis l'ouverture, l'état de la composition, le compte
 * à rebours et la confiance (« pas encore mesurée » avant l'étape 38).
 *
 * Triée par value (la verte d'abord, à l'heure qu'il est), FAVORIS EN TÊTE
 * (favoritesFirst : leurs lignes d'abord, le tri gardé dans chaque bloc),
 * filtres championnat, marché, value minimale et période. Rien de lourd au
 * chargement : le serveur lit l'état préparé du Repérage (server/src/data/
 * opportunities.js) ; pendant son calcul, on suit l'avancement toutes les 3 s.
 * Les règles (filtres, tri, notifications) sont dans utils/opportunites.js.
 * Rien ne manque sans être dit (règle de Pierre du 04/10/2026).
 */
const favoris = useFavoritesStore();
const sources = useSourcesStore();
const dataVersion = useDataVersionStore();

// ------------------------------------------------------------- lecture
const reponse = ref(null);
const lecture = ref({ enCours: false, erreur: null });
let minuteur = null;
// Seule la réponse de la DERNIÈRE demande compte (un clic sur « Recalculer » pendant une lecture).
let numero = 0;
let ouverte = true;

async function lire({ force = false } = {}) {
  clearTimeout(minuteur);
  const n = ++numero;
  lecture.value = { enCours: true, erreur: null };
  let r;
  try {
    r = await opportunitiesApi.get({ force });
  } catch (error) {
    if (!ouverte || n !== numero) return;
    lecture.value = { enCours: false, erreur: error.message };
    return;
  }
  if (!ouverte || n !== numero) return;
  reponse.value = r;
  lecture.value = { enCours: false, erreur: null };
  if (r?.status === 'computing') minuteur = setTimeout(() => lire(), 3000);
}

const recalculer = () => lire({ force: true });

// Les promesses rendues ne servent qu'au rendu côté serveur des essais : en navigateur, elles sont ignorées.
onMounted(() => {
  relireEtatNotifications();
  return Promise.all([lire(), sources.origins ? null : sources.fetchSources().catch(() => {})]);
});
onBeforeUnmount(() => {
  ouverte = false;
  clearTimeout(minuteur);
});
// De nouvelles données côté serveur (un relevé The Odds API, une passe d'actualisation) : on relit.
watch(
  () => dataVersion.version,
  (nouvelle, ancienne) => {
    if (ancienne && nouvelle && nouvelle !== ancienne) lire();
  }
);

const donnees = computed(() => reponse.value?.data ?? null);
const enCalcul = computed(() => reponse.value?.status === 'computing' && !lecture.value.erreur);
const erreurCalcul = computed(() => (!enCalcul.value && donnees.value ? (reponse.value?.error ?? null) : null));
const toutes = computed(() => donnees.value?.lignes ?? []);
const resume = computed(() => donnees.value?.resume ?? null);

// ------------------------------------------------- la carte « où parier » (étape 23)
// Les couleurs arrivent sur chaque ligne (`carte`) ; la grille entière (~0,3 Mo) ne se lit qu'au clic.
const carteDuServeur = computed(() => donnees.value?.carte ?? null);
const grilleOuverte = ref(false);
const grille = ref({ reponse: null, erreur: null, chargement: false });
async function afficherLaCarte() {
  grilleOuverte.value = !grilleOuverte.value;
  if (!grilleOuverte.value || grille.value.reponse || grille.value.chargement) return;
  grille.value = { reponse: null, erreur: null, chargement: true };
  try {
    grille.value = { reponse: await bettingMapApi.get(), erreur: null, chargement: false };
  } catch (error) {
    grille.value = { reponse: null, erreur: String(error?.message ?? error), chargement: false };
  }
}
const resumeDeLaCarte = computed(() => {
  const c = carteDuServeur.value;
  if (!c) return 'Pas encore mesuré : la carte a besoin d’un premier rejeu du banc d’essai (Historique moteur › Banc d’essai › « Lancer le banc », 10 à 13 minutes) ; elle se calcule à l’actualisation qui suit.';
  const r = c.resume ?? {};
  const base = `Carte de ${moisDit(c.mois)} : ${r.vertes ?? 0} case${(r.vertes ?? 0) > 1 ? 's' : ''} verte${(r.vertes ?? 0) > 1 ? 's' : ''}, ${r.rouges ?? 0} rouge${(r.rouges ?? 0) > 1 ? 's' : ''}, ${r.grises ?? 0} grise${(r.grises ?? 0) > 1 ? 's' : ''}.`;
  const lignes = resume.value ? ` Dans cette liste : ${resume.value.enCaseVerte ?? 0} pari${(resume.value.enCaseVerte ?? 0) > 1 ? 's' : ''} en case verte (en tête), ${resume.value.enCaseRouge ?? 0} en case rouge (à la fin, avec l’avertissement).` : '';
  const suspendue = c.aJour ? '' : ' Les réglages du moteur ont changé depuis : couleurs suspendues jusqu’au prochain banc d’essai.';
  return `${base}${lignes}${suspendue}${r.vertes ? '' : ' Rien n’est prouvé gagnant : c’est une information, pas une panne.'}`;
});

// ------------------------------------------------------------ format
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, mot, pl = `${mot}s`) => `${nombre(n)} ${n > 1 ? pl : mot}`;
const pct = (p) => `${(Math.round(Number(p) * 1000) / 10).toLocaleString('fr-FR')} %`;
const unDecimal = (x) => Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (options) => new Intl.DateTimeFormat('fr-FR', options);
const HEURE = fmt({ hour: '2-digit', minute: '2-digit' });
const JOUR = fmt({ day: '2-digit', month: '2-digit' });
const JOUR_COURT = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' });
const JOUR_COURT_UTC = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const DATE_LONGUE = fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const DATE_LONGUE_UTC = fmt({ weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const absent = (texte, titre) => ({ absent: true, texte, titre });

function duree(ms) {
  const s = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return reste ? `${min} min ${String(reste).padStart(2, '0')} s` : `${min} min`;
}

// --------------------------------------------------------- avancement
const avancement = computed(() => {
  const p = reponse.value?.progress;
  if (!p?.total) return null;
  return { fait: p.done, total: p.total, pct: Math.min(100, Math.round((p.done / p.total) * 100)) };
});
const texteAvancement = computed(() => {
  const a = avancement.value;
  if (!a) return 'Préparation de la liste des matchs à venir…';
  return `${pluriel(a.fait, 'match')} sur ${nombre(a.total)} analysé${a.fait > 1 ? 's' : ''}`;
});
const calcul = computed(() => {
  const d = donnees.value;
  if (!d?.generatedAt) return null;
  const quand = new Date(d.generatedAt);
  const memeJour = quand.toDateString() === new Date(liveNow.value).toDateString();
  return {
    texte: `Calculé ${memeJour ? `à ${HEURE.format(quand)}` : `le ${JOUR.format(quand)} à ${HEURE.format(quand)}`} en ${duree(d.durationMs)}`,
    titre: `Le calcul du Repérage (le moteur sur chaque match à venir des ${d.days} prochains jours) date du ${DATE_LONGUE.format(quand)}. Le verdict de chaque pari, la fraîcheur des cotes et l'état des compositions sont repris à chaque lecture de la page.`
  };
});

// ------------------------------------------------------- provenance
const SOURCES_GRATUITES = ['ESPN', 'football-data.co.uk', '365Scores', 'Kalshi', 'Smarkets'];
const origines = computed(() => sources.origins);
const provenanceMouvements = computed(() => {
  const liste = origines.value?.freeOdds?.sources ?? [];
  return {
    vide: Boolean(origines.value) && !liste.length,
    source: liste.map((s) => s.name).join(', ') || SOURCES_GRATUITES.join(', '),
    releveLe: liste.map((s) => s.lastSeenAt).filter(Boolean).sort().at(-1) ?? null,
    fichier: origines.value?.freeOdds?.file ?? null
  };
});
const provenanceVosCotes = computed(() => ({
  releveLe: donnees.value?.releve?.releveAt ?? origines.value?.odds?.updatedAt ?? null,
  fichier: donnees.value?.releve?.fichier ?? origines.value?.odds?.file ?? null
}));

// ---------------------------------------------------- notifications
// L'interrupteur : un clic de Pierre (le navigateur peut alors demander sa permission, une seule fois).
const notifier = computed({
  get: () => etatNotifications.actif,
  set: (oui) => (oui ? activerNotifications() : desactiverNotifications())
});
const etatDesNotifications = computed(() => {
  const e = etatNotifications;
  if (e.permission === 'non-supporte') return { ton: 'warning', texte: "Ce navigateur ne sait pas afficher de notification : la page reste la seule façon de voir les nouvelles values." };
  if (e.permission === 'denied') return { ton: 'warning', texte: "Notifications bloquées par le navigateur pour CôteMaster : à réautoriser dans les réglages du site (icône à gauche de l'adresse), puis remettre l'interrupteur." };
  if (e.actif) {
    const quand = e.derniereVerification ? ` Dernière vérification ${ilYA(e.derniereVerification, liveNow.value)}.` : '';
    return { ton: 'info', texte: `Activé dans ce navigateur : une notification Windows, sans son, pour chaque NOUVELLE value verte (vérifié toutes les 2 minutes tant que CôteMaster est ouvert).${quand}${e.erreur ? ` Dernière vérification en échec : ${e.erreur}` : ''}` };
  }
  return { ton: 'neutre', texte: "Désactivé. En l'activant, le navigateur vous demandera une fois la permission ; rien ne quitte ce PC." };
});

// ------------------------------------------------------------ filtres
const competition = ref('');
const marche = ref('');
const valeurMin = ref('toutes');
const periode = ref('7');

const competitionOptions = computed(() => {
  const compte = new Map();
  for (const l of toutes.value) if (l.league) compte.set(l.league, (compte.get(l.league) ?? 0) + 1);
  const ligues = [...compte.keys()].sort((a, b) => formatLeagueOptionLabel(a).localeCompare(formatLeagueOptionLabel(b), 'fr'));
  const avecFavoris = favoris.leagues.length > 0;
  return [
    { value: '', label: 'Toutes les compétitions', icon: 'layers', hint: pluriel(toutes.value.length, 'pari') },
    ...favoris.favoritesFirst(ligues, { league: (l) => l }).map((l) => {
      const favorite = favoris.isFavoriteLeague(l);
      return { value: l, label: formatLeagueOptionLabel(l), league: l, favorite, group: avecFavoris ? (favorite ? 'Favoris' : 'Autres compétitions') : undefined, hint: pluriel(compte.get(l), 'pari') };
    })
  ];
});
watch(competitionOptions, (options) => {
  if (competition.value && !options.some((o) => o.value === competition.value)) competition.value = '';
});
const marcheOptions = computed(() => [
  { value: '', label: 'Tous les marchés', icon: 'layers' },
  ...(donnees.value?.markets ?? []).map((m) => ({ value: m.key, label: m.label, group: m.group, hint: pluriel(toutes.value.filter((l) => l.marche === m.key).length, 'pari') }))
]);
const valeurOptions = computed(() => VALEURS_MINIMALES.map((v) => ({ value: v.value, label: v.label, hint: v.hint })));
const periodeOptions = computed(() =>
  PERIODES.map((p) => ({ value: p.value, label: p.label, hint: pluriel(toutes.value.filter((l) => dansLaPeriode(l, p.value, liveNow.value)).length, 'pari') }))
);
const filtres = computed(() => ({ competition: competition.value, marche: marche.value, valeurMin: valeurMin.value, periode: periode.value }));

// -------------------------------------------------- les lignes affichées
function quandDuMatch(l) {
  const t = new Date(l.commenceTime);
  if (Number.isNaN(t.getTime())) return { jour: 'date inconnue', heure: null, titre: 'La liste des matchs ne donne pas de date pour cette rencontre.' };
  if (!l.exactKickoff) {
    return { jour: JOUR_COURT_UTC.format(t), heure: null, titre: `${DATE_LONGUE_UTC.format(t)} — heure du coup d'envoi à confirmer : le match n'est connu que par le calendrier FotMob.` };
  }
  return { jour: JOUR_COURT.format(t), heure: HEURE.format(t), titre: `Coup d'envoi : ${DATE_LONGUE.format(t)}` };
}

function celluleMoteur(l) {
  if (l.probabilite == null) return absent('non calculée', `Le moteur n'a pas rendu de probabilité pour « ${l.pari} » sur ce match.`);
  return {
    texte: pct(l.probabilite),
    sous: `cote juste ${formatOdds(l.coteJuste)}`,
    titre: `Le moteur donne ${pct(l.probabilite)} à « ${l.pari} », soit une cote juste de ${formatOdds(l.coteJuste)} (les mêmes chiffres que le Repérage).`
  };
}

/** La cote de vos bookmakers que le moteur a jugée, son bookmaker et l'heure de son relevé. */
function celluleCote(l) {
  const v = l.verdict;
  if (!l.avecOffre || !v || v.cote == null) {
    if (l.marche === 'home' || l.marche === 'draw' || l.marche === 'away') {
      return absent(
        'pas de cote chez vos bookmakers',
        "Aucun de vos bookmakers ne cote ce match dans le dernier relevé The Odds API (relevé payant, fait à la main) : seulement des cotes de référence gratuites, jamais jouables. Le relevé se lance dans Réglages › Données."
      );
    }
    return absent(
      'pas de cote chez vos bookmakers',
      "The Odds API ne relève que le 1 / N / 2 : pour ce marché, aucune cote de vos bookmakers. Vue chez l'un d'eux, une cote se saisit sur la page du match (saisie express), qui en donne aussitôt la value."
    );
  }
  const releve = v.releveAt ? `relevée ${ilYA(v.releveAt, liveNow.value)}` : 'heure du relevé inconnue';
  const juge = v.offreJuge ? `${v.offreJuge.bookmakerTitle} paie ${formatOdds(v.offreJuge.cote)}, écarté : juge et partie` : null;
  return {
    texte: formatOdds(v.cote),
    livre: v.bookmakerTitle ?? 'bookmaker sans nom',
    releve,
    juge,
    titre: `Cote de ${v.bookmakerTitle ?? 'votre bookmaker'} pour « ${l.pari} » : ${formatOdds(v.cote)}, ${releve} (relevé The Odds API${v.origineReleve === 'archive' ? ', heure lue dans les archives' : ''}). ${v.raison ?? ''}`
  };
}

function celluleMouvement(l) {
  const m = l.mouvement;
  if (!m) {
    return absent(
      l.probabiliteMarche == null ? 'aucune cote gratuite' : 'un seul relevé',
      l.probabiliteMarche == null
        ? 'Aucune cote relevée gratuitement pour ce marché (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) : pas de mouvement à mesurer.'
        : "Un seul relevé gratuit pour l'instant : un mouvement se mesure entre deux relevés (toutes les 5 minutes dans les 2 h avant le coup d'envoi, une fois par jour au-delà)."
    );
  }
  const sens = m.dropPct > 0 ? `a baissé de ${unDecimal(m.dropPct)} %` : m.dropPct < 0 ? `a monté de ${unDecimal(m.dropPct)} %` : "n'a pas bougé";
  return {
    pourcent: -m.dropPct,
    chute: Boolean(l.chute),
    accord: `${m.agreeing} sur ${m.bookmakersCount}`,
    titre: `La cote juste de « ${l.pari} » ${sens} depuis l'ouverture (${m.agreeing} bookmaker${m.agreeing > 1 ? 's' : ''} sur ${m.bookmakersCount} dans ce sens) — les mêmes chiffres que la page Chutes de cotes.${l.chute ? ' Une chute de 5 % ou plus : l\'issue est davantage jouée.' : ''}`
  };
}

/** Une ligne du tableau, toute prête pour le gabarit (présentation seulement). */
function vueDeLigne(l, rang) {
  const fav = {
    home: favoris.isFavoriteTeam(l.home, l.league, l.homeId ?? undefined),
    away: favoris.isFavoriteTeam(l.away, l.league, l.awayId ?? undefined),
    ligue: favoris.isFavoriteLeague(l.league)
  };
  return {
    cle: l.cle,
    rang,
    l,
    lien: `/match-a-venir/${encodeURIComponent(l.matchId)}`,
    quand: quandDuMatch(l),
    fav: { ...fav, ligne: fav.home || fav.away || fav.ligue },
    moteur: celluleMoteur(l),
    cote: celluleCote(l),
    mouvement: celluleMouvement(l),
    vivant: l.verdict ? etatVerdict(l.verdict, liveNow.value) : null
  };
}

const lignes = computed(() =>
  opportunitesAffichees(toutes.value, { filtres: filtres.value, maintenant: liveNow.value, favoritesFirst: favoris.favoritesFirst }).map((l, i) => vueDeLigne(l, i + 1))
);
const vertesVisibles = computed(() => lignes.value.filter((r) => r.vivant?.vert).length);
const vertesDuCalcul = computed(() => toutes.value.filter((l) => rangVivant(l, liveNow.value) === 0).length);

/** Le prochain coup d'envoi (heure exacte, à venir) parmi les lignes affichées. */
const prochainMatch = computed(() => {
  let prochain = null;
  for (const r of lignes.value) {
    const t = Date.parse(r.l.commenceTime);
    if (r.l.exactKickoff && Number.isFinite(t) && t > liveNow.value && (!prochain || t < prochain.t)) prochain = { l: r.l, t };
  }
  return prochain?.l ?? null;
});

const sousTitreTableau = computed(() => {
  const morceaux = [`${pluriel(lignes.value.length, 'pari')} · triés par value, la verte d'abord`];
  if (favoris.hasFavorites) morceaux.push('vos favoris en tête');
  return morceaux.join(' · ');
});

// ------------------------------------------------------- ce qui manque
const dernierReleve = computed(() => {
  const t = donnees.value?.releve?.releveAt;
  return t ? `le ${JOUR.format(new Date(t))} à ${HEURE.format(new Date(t))}` : null;
});
const sansVosCotes = computed(() => Boolean(resume.value) && resume.value.matchsAvecVosCotes === 0);
const phraseSansVosCotes = computed(() => {
  const quand = dernierReleve.value ? ` : le dernier relevé The Odds API date du ${dernierReleve.value.replace(/^le /, '')}` : '';
  return `pour les matchs des ${donnees.value?.days ?? 7} prochains jours${quand}. Sans relevé, aucune value ne peut se lire ; seules les chutes de cotes (relevés gratuits) restent dans la liste.`;
});
const descriptionVide = computed(() => {
  const pistes = [];
  if (periode.value !== '7') pistes.push('choisissez « 7 prochains jours »');
  if (competition.value) pistes.push('revenez à « Toutes les compétitions »');
  if (marche.value) pistes.push('revenez à « Tous les marchés »');
  if (valeurMin.value !== 'toutes') pistes.push('choisissez « Toutes les lignes » en value minimale');
  const debut = 'Aucun pari ne correspond à ces filtres.';
  return pistes.length ? `${debut} Pour en voir davantage : ${pistes.join(', ')}.` : debut;
});
</script>

<template>
  <div class="opps cm-page">
    <!-- Le bandeau : ce qu'on regarde, le calcul, la notification, les filtres. -->
    <section class="cm-hero opps__hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="bolt" :size="18" /></span>
          Opportunités du jour
        </h2>
        <div class="opps__hero-side">
          <span class="cm-hero__chips">
            <span v-if="donnees" class="cm-chip is-section" title="Paris de la liste, avec les filtres en cours">
              <AppIcon name="list" :size="11" />
              {{ pluriel(lignes.length, 'pari') }}
              <span v-if="lignes.length !== toutes.length" class="opps__of">sur {{ nombre(toutes.length) }}</span>
            </span>
            <!-- Le compte des values jouables : neutre — le vert reste celui de la pastille de chaque pari. -->
            <span v-if="donnees" class="cm-chip" :title="`Values que le moteur recommande, sur une cote encore fraîche, à cette minute (${nombre(vertesDuCalcul)} sans les filtres)`">
              <AppIcon name="check" :size="11" />{{ pluriel(vertesVisibles, 'value jouable', 'values jouables') }}
            </span>
            <span v-if="resume?.chutes" class="cm-chip" title="Paris dont la cote juste a baissé d'au moins 5 % depuis l'ouverture (règle de la page Chutes de cotes)">
              <AppIcon name="trendDown" :size="11" />{{ pluriel(resume.chutes, 'chute de cote', 'chutes de cote') }}
            </span>
            <span v-if="prochainMatch" class="cm-chip opps__next" :title="`Premier coup d'envoi parmi les paris affichés : ${prochainMatch.home} – ${prochainMatch.away}.`">
              Prochain match
              <span class="opps__next-names cm-truncate">{{ prochainMatch.home }} – {{ prochainMatch.away }}</span>
              <KickoffCountdown :coup-d-envoi="prochainMatch.commenceTime" :heure-sure="true" variante="texte" />
            </span>
            <span v-if="enCalcul" class="cm-chip is-info" :title="texteAvancement">
              <AppIcon name="cpu" :size="11" />Calcul en cours<template v-if="avancement"> · {{ avancement.pct }}&nbsp;%</template>
            </span>
          </span>
          <AppButton variant="secondary" size="sm" :loading="enCalcul || lecture.enCours" @click="recalculer">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            {{ enCalcul ? 'Calcul en cours…' : 'Recalculer' }}
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">
        Ce que montrent le Repérage, les Chutes de cotes et les value bets, en une liste : chaque pari possible chez vos bookmakers, triée par value.
      </p>

      <!-- D'où viennent les chiffres : le fournisseur réel et l'heure de son relevé. -->
      <div v-if="donnees" class="opps__sources">
        <span v-if="calcul" class="opps__source">
          <span class="opps__source-for">Moteur</span>
          <ProvenanceChip source="Moteur CôteMaster · magasin FotMob et cotes relevées" action="calculé" :releve-le="donnees.generatedAt" :vieux-apres-heures="1" :detail="calcul.titre">
            <template #quand="{ ancien, ilYA: depuis }">{{ calcul.texte }}<template v-if="ancien"> · {{ depuis }}</template></template>
          </ProvenanceChip>
        </span>
        <span class="opps__source">
          <span class="opps__source-for">Cotes de vos bookmakers</span>
          <ProvenanceChip source="The Odds API" :releve-le="provenanceVosCotes.releveLe" :fichier="provenanceVosCotes.fichier" payant />
        </span>
        <span class="opps__source">
          <span class="opps__source-for">Mouvements</span>
          <span v-if="provenanceMouvements.vide" class="cm-chip is-warning" title="La base locale ne garde encore aucune cote relevée gratuitement : aucun mouvement ne peut se mesurer.">
            <AppIcon name="alert" :size="11" />Aucune cote gratuite relevée sur ce PC
          </span>
          <ProvenanceChip v-else :source="provenanceMouvements.source" :releve-le="provenanceMouvements.releveLe" :fichier="provenanceMouvements.fichier" />
        </span>
      </div>

      <!-- La notification Windows d'une nouvelle value verte : réglable, permise une fois par le navigateur. -->
      <div class="opps__notify">
        <div class="opps__notify-toggle">
          <AppToggle v-model="notifier" label="Me prévenir d'une nouvelle value verte" description="Notification Windows, sans son, une par opportunité" />
        </div>
        <p class="opps__notify-state" :class="`is-${etatDesNotifications.ton}`">{{ etatDesNotifications.texte }}</p>
      </div>

      <div v-if="donnees" class="cm-toolbar opps__toolbar">
        <AppSelect v-model="competition" label="Compétition" :options="competitionOptions" class="opps__field-wide" />
        <AppSelect v-model="marche" label="Marché" :options="marcheOptions" :searchable="false" class="opps__field-wide" />
        <AppSelect v-model="valeurMin" label="Value minimale" :options="valeurOptions" :searchable="false" />
        <AppSelect v-model="periode" label="Période" :options="periodeOptions" :searchable="false" />
      </div>
    </section>

    <!-- Première lecture, serveur injoignable, calcul en échec sans liste. -->
    <LoadingSpinner v-if="!reponse && lecture.enCours" label="Lecture des opportunités…" />
    <EmptyState v-else-if="!donnees && lecture.erreur" icon="alert" title="Opportunités indisponibles" :description="`${lecture.erreur} Vérifiez que CôteMaster tourne, puis réessayez.`">
      <template #action>
        <AppButton variant="secondary" size="sm" @click="lire()">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Réessayer
        </AppButton>
      </template>
    </EmptyState>
    <EmptyState
      v-else-if="reponse?.status === 'error' && !donnees"
      icon="alert"
      title="Le calcul a échoué"
      :description="`${reponse.error ?? 'Erreur inconnue.'} Relancez le calcul ; si l'échec revient, relancez CôteMaster (demarrer-cotemaster.bat).`"
    >
      <template #action>
        <AppButton variant="secondary" size="sm" @click="recalculer">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Recalculer
        </AppButton>
      </template>
    </EmptyState>

    <AppCard
      v-else-if="enCalcul && !donnees"
      icon="cpu"
      eyebrow="Calcul en cours"
      title="Le moteur passe en revue les matchs de la semaine"
      subtitle="Le calcul du Repérage, sans repli payant (magasin FotMob seulement) : comptez une à deux minutes. La liste se met à jour toute seule."
    >
      <div class="opps__progress">
        <span class="cm-bar opps__bar"><span class="cm-bar__fill" :style="{ width: `${avancement?.pct ?? 0}%` }" /></span>
        <span class="opps__progress-text cm-numeric">{{ texteAvancement }}</span>
      </div>
    </AppCard>

    <template v-else-if="donnees">
      <div v-if="enCalcul" class="cm-note is-info">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="cpu" :size="14" /></span>
        <div class="opps__note-body">
          <p class="cm-note__title">Recalcul en cours</p>
          <p class="cm-note__text">{{ texteAvancement }}. La liste ci-dessous reste celle du calcul précédent jusqu'à la fin.</p>
          <span class="cm-bar opps__bar"><span class="cm-bar__fill" :style="{ width: `${avancement?.pct ?? 0}%` }" /></span>
        </div>
      </div>

      <div v-if="erreurCalcul" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="opps__note-body">
          <p class="cm-note__title">Le dernier calcul a échoué</p>
          <p class="cm-note__text">{{ erreurCalcul }} — la liste affichée est celle du calcul précédent.</p>
        </div>
      </div>

      <div v-if="lecture.erreur" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="opps__note-body">
          <p class="cm-note__title">Le serveur ne répond plus</p>
          <p class="cm-note__text">{{ lecture.erreur }} La liste affichée est la dernière reçue.</p>
        </div>
      </div>

      <!-- Le coupe-circuit de Réglages : aucun pari conseillé tant qu'il est enclenché (les cotes restent affichées). -->
      <div v-if="resume?.coupeCircuit" class="cm-note is-warning">
        <span class="cm-icon-box is-warning is-sm"><AppIcon name="pause" :size="14" /></span>
        <div class="opps__note-body">
          <p class="cm-note__title">Coupe-circuit enclenché</p>
          <p class="cm-note__text">Le coupe-circuit de Réglages est enclenché : le moteur ne conseille aucun pari tant qu'il l'est. Les cotes de vos bookmakers restent affichées, sans verdict de value.</p>
        </div>
      </div>

      <!-- Ce qui manque, dit en clair : jamais une absence tue. -->
      <div v-if="resume && (sansVosCotes || resume.matchsSansVosCotes)" class="cm-note is-warning">
        <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="opps__note-body">
          <p class="cm-note__title">Ce qui manque</p>
          <ul class="opps__gaps">
            <li v-if="sansVosCotes"><strong>Aucune cote de vos bookmakers</strong> {{ phraseSansVosCotes }}</li>
            <li v-else-if="resume.matchsSansVosCotes">
              <strong>{{ pluriel(resume.matchsSansVosCotes, 'match') }} sur {{ nombre(resume.matchs) }}</strong>
              {{ resume.matchsSansVosCotes > 1 ? "n'ont" : "n'a" }} aucune cote de vos bookmakers : ils n'apparaissent ici que par une chute de cote.
            </li>
            <li>Les cotes saisies à la main (page du match, saisie express) ne sont pas dans cette liste : leur value se lit sur la page du match.</li>
          </ul>
          <PaidOddsAdvicePanel v-if="sansVosCotes" variante="compacte" />
        </div>
      </div>

      <EmptyState v-if="!toutes.length" icon="target" title="Aucune opportunité pour l'instant" :description="`Aucun pari chez vos bookmakers et aucune chute de cote sur les ${donnees.days} prochains jours. La liste se remplit après un relevé The Odds API (Réglages › Données) ou les prochains relevés gratuits.`" />
      <EmptyState v-else-if="!lignes.length" icon="filter" title="Aucun pari avec ces filtres" :description="descriptionVide" />

      <!-- LA LISTE : un pari par ligne, la value verte d'abord, vos favoris en tête. -->
      <AppCard v-else icon="list" eyebrow="Opportunités du jour" title="Les paris possibles" :subtitle="sousTitreTableau">
        <div class="opps__body">
          <div class="cm-table-wrap opps__wrap">
            <table class="cm-table opps__table">
              <thead>
                <tr>
                  <th class="is-center opps__rank" title="Rang : la value verte d'abord, puis par value, vos favoris en tête">#</th>
                  <th class="is-left" title="Coup d'envoi, compétition et les deux clubs ; un clic ouvre la page du match">Match</th>
                  <th class="is-left" title="Le pari : l'issue et son marché">Pari</th>
                  <th title="Probabilité du moteur et sa cote juste (les chiffres du Repérage)">Moteur<HelpTip terme="cote-juste" /></th>
                  <th title="La cote de vos bookmakers que le moteur a jugée, son bookmaker et l'heure de son relevé">Cote</th>
                  <th title="Le verdict du moteur : vert seulement s'il recommande ce pari, sur une cote encore fraîche">Value<HelpTip terme="value" /></th>
                  <th title="Le mouvement de la cote juste depuis l'ouverture (relevés gratuits : les chiffres des Chutes de cotes)">Mouvement</th>
                  <th title="L'état de la composition : officielle, probable, dernière alignée ou pas encore publiée">Compo</th>
                  <th title="Le temps avant le coup d'envoi">Coup d'envoi</th>
                  <th title="La confiance du moteur dans ce pari : pas encore mesurée (étape 38 du plan)">Confiance<HelpTip terme="sur-fragile" /></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in lignes" :key="r.cle" :class="{ 'is-favorite': r.fav.ligne }">
                  <td class="is-center opps__rank cm-numeric">{{ r.rang }}</td>

                  <td class="is-left opps__match">
                    <div class="opps__when">
                      <span class="opps__day cm-numeric" :title="r.quand.titre">{{ r.quand.jour }}<template v-if="r.quand.heure"> · {{ r.quand.heure }}</template></span>
                      <span v-if="!r.quand.heure" class="opps__unsure" :title="r.quand.titre">heure à confirmer</span>
                      <span v-if="!competition" class="opps__league" :title="r.l.league"><LeagueBadge :league="r.l.league" /></span>
                      <FavoriteStar v-if="r.fav.ligue" active :interactive="false" kind="league" :label="r.l.league" :size="11" />
                    </div>
                    <RouterLink :to="r.lien" class="opps__teams" :title="`Ouvrir la page du match ${r.l.home} – ${r.l.away}`">
                      <span class="opps__team">
                        <TeamCrest :name="r.l.home" :league="r.l.league" :team-id="r.l.homeId ?? null" :size="18" />
                        <span class="cm-truncate">{{ r.l.home }}</span>
                        <FavoriteStar v-if="r.fav.home" active :interactive="false" :label="r.l.home" :size="11" />
                      </span>
                      <span class="opps__vs">–</span>
                      <span class="opps__team">
                        <TeamCrest :name="r.l.away" :league="r.l.league" :team-id="r.l.awayId ?? null" :size="18" />
                        <span class="cm-truncate">{{ r.l.away }}</span>
                        <FavoriteStar v-if="r.fav.away" active :interactive="false" :label="r.l.away" :size="11" />
                      </span>
                    </RouterLink>
                  </td>

                  <td class="is-left opps__bet">
                    <strong class="opps__pick">{{ r.l.pari }}</strong>
                    <small class="opps__sub">{{ r.l.groupe ?? r.l.libelleMarche }}</small>
                    <!-- Étape 23 : la case rouge de la carte « où parier » le dit en toutes lettres (la ligne reste, à la fin). -->
                    <small v-if="r.l.carte?.couleur === 'rouge'" class="opps__avert" role="note">{{ r.l.carte.phrase }}</small>
                  </td>

                  <td class="cm-numeric" :title="r.moteur.titre">
                    <span v-if="r.moteur.absent" class="opps__absent">{{ r.moteur.texte }}</span>
                    <template v-else>
                      <strong class="opps__prob">{{ r.moteur.texte }}</strong>
                      <small class="opps__sub">{{ r.moteur.sous }}</small>
                    </template>
                  </td>

                  <td class="cm-numeric" :title="r.cote.titre">
                    <span v-if="r.cote.absent" class="opps__absent">{{ r.cote.texte }}</span>
                    <template v-else>
                      <span class="opps__odds">{{ r.cote.texte }}</span>
                      <span class="opps__book">{{ r.cote.livre }}</span>
                      <small class="opps__sub">{{ r.cote.releve }}</small>
                      <small v-if="r.cote.juge" class="opps__sub opps__judge">{{ r.cote.juge }}</small>
                    </template>
                  </td>

                  <!-- Le verdict du moteur : vert seulement s'il recommande ce pari, sur une cote fraîche (ValueBadge). -->
                  <td class="cm-numeric opps__value">
                    <ValueBadge v-if="r.l.verdict" taille="sm" :verdict="r.l.verdict" :fraicheur="r.l.verdict.fraicheur ?? null" />
                    <span v-else class="opps__absent" title="Aucune cote de vos bookmakers pour ce pari : le moteur n'a pas de verdict de value à donner.">pas de verdict</span>
                    <!-- Étape 14 : « à vérifier » quand les données de ce match sont douteuses (contrôle quotidien) ; le verdict ne change pas. -->
                    <AVerifierBadge v-if="r.l.aVerifier" :a-verifier="r.l.aVerifier" :marche="r.l.marche" class="opps__averif" />
                    <!-- Étape 23 : la case de la carte « où parier » (verte « Prouvé », rouge, grise) ; le verdict ne change pas. -->
                    <BettingMapChip v-if="r.l.carte" :case-carte="r.l.carte" compacte class="opps__carte" />
                  </td>

                  <td class="cm-numeric" :title="r.mouvement.titre">
                    <span v-if="r.mouvement.absent" class="opps__absent">{{ r.mouvement.texte }}</span>
                    <template v-else>
                      <OddsMoveArrow :pourcent="r.mouvement.pourcent" sujet="Cote juste" taille="sm" :titre="r.mouvement.titre" />
                      <small class="opps__sub">{{ r.mouvement.chute ? 'chute · ' : '' }}{{ r.mouvement.accord }}</small>
                    </template>
                  </td>

                  <td>
                    <LineupStateBadge :snapshot="r.l.compo" taille="sm" />
                  </td>

                  <td>
                    <KickoffCountdown :coup-d-envoi="r.l.exactKickoff ? r.l.commenceTime : String(r.l.commenceTime ?? '').slice(0, 10)" :heure-sure="r.l.exactKickoff" variante="texte" />
                  </td>

                  <td>
                    <ConfidenceGauge :valeur="r.l.confiance" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Comment lire la liste. -->
          <div class="cm-note is-info">
            <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
            <div class="opps__note-body">
              <p class="cm-note__title">Lecture</p>
              <p class="cm-note__text opps__reading">
                Une ligne par pari possible : chaque issue 1 / N / 2 que l'un de vos bookmakers cote, et chaque issue dont la cote juste a chuté d'au moins 5 % depuis l'ouverture.
                Le vert est le verdict du moteur, le même que l'onglet « Value bets » de Mes paris : il ne recommande qu'un pari par match, jamais chez un bookmaker qui a fixé la cote juste (<HelpTip terme="juge-et-partie" />), et seulement sur une cote fraîche — une cote qui vieillit pendant que la page est ouverte passe « à rafraîchir ».
                La probabilité et la cote juste sont celles du Repérage ; le mouvement, celui des Chutes de cotes.
                La puce « Prouvé » / « Moins bien que le marché » / « Pas prouvé » est la case de la carte « où parier » (sa règle sous « Afficher la carte », plus bas) : les paris des cases vertes passent en tête, ceux des cases rouges à la fin, avec leur avertissement — rien n'est retiré.
                Survolez une case pour le détail ou la raison d'une absence.
              </p>
            </div>
          </div>
        </div>
      </AppCard>

      <!-- Étape 23 : la carte « où parier », championnat × marché (lue au clic). -->
      <AppCard icon="grid" eyebrow="Où parier" title="La carte du mois : championnat × marché" :subtitle="resumeDeLaCarte">
        <template #action>
          <AppButton variant="secondary" size="sm" :aria-expanded="grilleOuverte ? 'true' : 'false'" @click="afficherLaCarte">
            <template #icon><AppIcon name="grid" :size="13" /></template>
            {{ grilleOuverte ? 'Masquer la carte' : 'Afficher la carte' }}
          </AppButton>
        </template>
        <template v-if="grilleOuverte">
          <p v-if="grille.chargement" class="cm-note is-info opps__carte-note">Lecture de la carte…</p>
          <p v-else-if="grille.erreur" class="cm-note is-danger opps__carte-note">Carte illisible : {{ grille.erreur }}</p>
          <BettingMapGrid v-else-if="grille.reponse" :reponse="grille.reponse" />
        </template>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
/* Étape 23 : l'avertissement d'une case rouge de la carte « où parier », sous le pari. */
.opps__avert {
  display: block;
  margin-top: 3px;
  max-width: 340px;
  color: var(--cm-danger);
  font-size: 11px;
  font-weight: 600;
  white-space: normal;
}

.opps__carte {
  margin-top: 4px;
}

.opps__carte-note {
  margin: 0;
}

.opps {
  /* Se règle sur SA largeur : l'onglet vit dans la page Matchs. */
  container: opps / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.opps__hero {
  gap: 16px;
}

.opps__hero-side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.opps__of {
  font-weight: 500;
  opacity: 0.75;
}

.opps__next {
  max-width: 100%;
}

.opps__next-names {
  max-width: 220px;
  font-weight: 700;
}

.opps__sources {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 14px;
}

.opps__source {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
}

.opps__source-for {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* La notification : l'interrupteur et ce qu'il fait, en une ligne quand la place le permet. */
.opps__notify {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
  padding: 10px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.opps__notify-toggle {
  flex: 0 1 380px;
  min-width: 0;
}

.opps__notify-state {
  flex: 1 1 260px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.opps__notify-state.is-warning {
  color: var(--cm-warning);
}

.opps__notify-state.is-info {
  color: var(--cm-info);
}

.opps__toolbar > * {
  flex: 1 1 150px;
}

.opps__toolbar > .opps__field-wide {
  flex: 1.4 1 190px;
}

/* ----------------------------------------------------- avancement, notes */
.opps__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opps__bar {
  height: 8px;
}

.opps__progress-text {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.opps__note-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.opps__gaps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.opps__gaps strong {
  color: var(--cm-text-primary);
}

/* ------------------------------------------------------------ tableau */
.opps__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.opps__wrap {
  max-height: 72vh;
  overflow: auto;
}

.opps__table th,
.opps__table td {
  padding: 8px;
}

.opps__table th.opps__rank,
.opps__table td.opps__rank {
  width: 40px;
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* Un club ou une compétition favorite : la ligne légèrement dorée (les favoris sont aussi en tête). */
.opps__table tr.is-favorite > td {
  background-color: rgba(var(--cm-gold-rgb) / 0.07);
}

.opps__match {
  min-width: 220px;
}

.opps__when {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 260px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.opps__day {
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.opps__unsure {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border-strong);
  font-size: 10px;
  font-weight: 600;
  color: var(--cm-text-muted);
  white-space: nowrap;
  cursor: help;
}

.opps__league {
  display: inline-flex;
  min-width: 0;
  max-width: 160px;
}

.opps__teams {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 260px;
  margin-top: 5px;
  color: var(--cm-text-primary);
  font-weight: 700;
  text-decoration: none;
  transition: color var(--cm-transition);
}

.opps__teams:hover {
  color: var(--cm-section);
}

.opps__teams:hover .cm-truncate {
  text-decoration: underline;
}

.opps__team {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.opps__vs {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  font-weight: 500;
}

.opps__bet {
  min-width: 140px;
}

.opps__pick {
  display: block;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.opps__prob {
  font-size: 14px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

.opps__odds {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.opps__book {
  margin-left: 5px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.opps__sub {
  display: block;
  margin-top: 1px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

/* Le bookmaker « juge et partie » écarté : dit, en retrait. */
.opps__judge {
  font-style: italic;
}

.opps__value {
  min-width: 120px;
}

/* Étape 14 : le badge « à vérifier », sous la pastille du verdict (qu'il ne change pas). */
.opps__averif {
  display: flex;
  width: fit-content;
  margin: 4px 0 0 auto;
}

.opps__absent {
  display: inline-block;
  max-width: 130px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  white-space: normal;
  color: var(--cm-text-muted);
  text-decoration: underline dotted var(--cm-border-strong);
  text-underline-offset: 3px;
  cursor: help;
}

.opps__reading {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------ étroit */
@container opps (max-width: 760px) {
  .opps__hero {
    padding: 16px;
  }

  .opps__toolbar > *,
  .opps__toolbar > .opps__field-wide {
    flex: 1 1 calc(50% - 6px);
  }

  .opps__table th,
  .opps__table td {
    padding: 7px 8px;
  }

  .opps__match {
    min-width: 200px;
  }
}

@container opps (max-width: 480px) {
  .opps__toolbar > *,
  .opps__toolbar > .opps__field-wide {
    flex-basis: 100%;
  }
}
</style>
