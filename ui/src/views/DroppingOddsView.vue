<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppToggle from '@/components/common/AppToggle.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import KickoffCountdown from '@/components/common/KickoffCountdown.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import OddsMoveArrow from '@/components/common/OddsMoveArrow.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { formatOdds } from '@/utils/format.js';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { teamIdFor } from '@/utils/teamIds.js';
import { liveNow } from '@/utils/liveClock.js';

/**
 * L'onglet « Chutes de cotes » de la page Matchs (04/10/2026). Pierre avait
 * vu la page « Dropping odds » d'Oddspedia, qu'on n'a pas le droit de
 * recopier : les mêmes chutes se calculent sur NOS relevés gratuits (ESPN,
 * football-data.co.uk, 365Scores, Kalshi, Smarkets), pour les compétitions
 * que suit CôteMaster (cf. server/src/data/droppingOdds.js).
 *
 * Pour chaque issue, de combien la cote JUSTE (marge retirée) a baissé
 * entre l'ouverture et le dernier relevé d'avant-match, mesuré bookmaker
 * par bookmaker puis moyenné ; combien de bookmakers vont dans ce sens ; et
 * le détail de chacun, avec l'argent échangé des bourses.
 *
 * Une rencontre = la carte commune (MatchCard), ses chutes dessous. La
 * liste est rangée par la plus forte chute : c'est un classement, les
 * favoris n'y remontent pas, ils sont marqués (fond doré, étoile). Une
 * chute dit que l'issue est davantage jouée ; ce n'est jamais un pari en
 * soi — ces bookmakers ne sont pas jouables depuis la France.
 */
const favoris = useFavoritesStore();
const matchesStore = useMatchesStore();

// ---------------------------------------------------------- commandes
const PERIODES = [
  { value: 1, label: '24 heures', texte: 'les prochaines 24 heures' },
  { value: 3, label: '3 jours', texte: 'les 3 prochains jours' },
  { value: 7, label: '7 jours', texte: 'les 7 prochains jours' }
];
const CHUTES = [
  { value: 5, label: '5 %' },
  { value: 10, label: '10 %' },
  { value: 20, label: '20 %' }
];
const jours = ref(3);
const chuteMin = ref(5);
const competition = ref('');
const seulementAccord = ref(false);

// ------------------------------------------------------------- lecture
const etat = ref({ loading: false, error: null, data: null });
// Seule la réponse de la DERNIÈRE demande s'affiche : changer deux fois de
// période de suite ne laisse jamais la plus lente écraser la plus récente.
let numero = 0;

async function charger({ force = false } = {}) {
  const n = ++numero;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await oddsApi.dropping({ days: jours.value, minDrop: chuteMin.value, force });
    if (n !== numero) return;
    etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (n !== numero) return;
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(() => charger());
// La période et la chute minimale se calculent sur le serveur : on redemande.
watch([jours, chuteMin], () => charger());

const data = computed(() => etat.value.data);
const couverture = computed(() => data.value?.coverage ?? null);

// ------------------------------------------------------------- format
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, mot, pl = `${mot}s`) => `${nombre(n)} ${n > 1 ? pl : mot}`;
const pct = (p) => `${(Math.round(Number(p) * 1000) / 10).toLocaleString('fr-FR')} %`;
const unDecimal = (x) => Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const chute = (x) => `−${unDecimal(x)} %`;
const points = (x) => `${x >= 0 ? '+' : '−'}${unDecimal(x)} pt${Math.abs(x) >= 2 ? 's' : ''}`;
/** La cote juste d'une probabilité (1 / p). */
const coteJuste = (p) => (Number(p) > 0 ? formatOdds(1 / Number(p)) : null);

const fmt = (options) => new Intl.DateTimeFormat('fr-FR', options);
const JOUR = fmt({ day: '2-digit', month: '2-digit' });
const HEURE = fmt({ hour: '2-digit', minute: '2-digit' });
const LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const quand = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'date inconnue' : `${JOUR.format(d)} à ${HEURE.format(d)}`;
};
const quandLong = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'à une date inconnue' : `le ${LONG.format(d)}`;
};

// Smarkets compte en livres échangées, Kalshi en contrats d'un dollar (cf. FreeOddsPanel).
const UNITES = { Smarkets: '£', Kalshi: '$' };
const PRECISIONS_UNITE = { Smarkets: 'en livres sterling', Kalshi: "en contrats d'un dollar" };
const SOURCES_CONNUES = ['ESPN', 'football-data.co.uk', '365Scores', 'Kalshi', 'Smarkets'];

// ------------------------------------------------------- compétition
/**
 * Les compétitions qui ont au moins une chute, les favorites d'abord
 * (marquées d'une étoile). Le groupe des autres s'appelle « Autres
 * compétitions » : l'option du haut s'appelle déjà « Toutes les
 * compétitions » (même choix que le calendrier saison).
 */
const competitionOptions = computed(() => {
  const compte = new Map();
  for (const f of data.value?.fixtures ?? []) if (f.league) compte.set(f.league, (compte.get(f.league) ?? 0) + 1);
  const ligues = [...compte.keys()].sort((a, b) => formatLeagueOptionLabel(a).localeCompare(formatLeagueOptionLabel(b), 'fr'));
  const avecFavoris = favoris.leagues.length > 0;
  return [
    { value: '', label: 'Toutes les compétitions', icon: 'layers', hint: pluriel(data.value?.fixtures?.length ?? 0, 'rencontre') },
    ...favoris.favoritesFirst(ligues, { league: (l) => l }).map((l) => {
      const favorite = favoris.isFavoriteLeague(l);
      return {
        value: l,
        label: formatLeagueOptionLabel(l),
        league: l,
        favorite,
        group: avecFavoris ? (favorite ? 'Favoris' : 'Autres compétitions') : undefined,
        hint: pluriel(compte.get(l), 'rencontre')
      };
    })
  ];
});
// Une compétition sans chute dans la nouvelle réponse : retour à toutes.
watch(competitionOptions, (options) => {
  if (competition.value && !options.some((o) => o.value === competition.value)) competition.value = '';
});

// ------------------------------------------------- la page de chaque match
// Le serveur ne donne pas l'identifiant du match de la page Matchs : on le
// retrouve dans la liste déjà chargée par la page (même compétition, même
// jour à un près — les sources ne datent pas toutes un match du même jour),
// en comparant les identifiants FotMob des deux clubs, jamais leurs noms
// (« Leeds United » chez les bookmakers, « Leeds » chez FotMob). Sans
// correspondance sûre, pas de lien : les noms des clubs mènent quand même à
// leur page.
const matchsDeLaPage = computed(() => {
  const index = new Map();
  for (const m of matchesStore.matches) {
    const jour = String(m.commenceTime ?? '').slice(0, 10);
    if (!jour || !m.league || !m.matchId) continue;
    const cle = `${m.league}|${jour}`;
    if (!index.has(cle)) index.set(cle, []);
    index.get(cle).push(m);
  }
  return index;
});

function decalerJour(jour, n) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pageDuMatch(f) {
  const jour = String(f.kickoff ?? f.date ?? '').slice(0, 10);
  if (!f.homeId || !f.awayId || !f.league || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  for (const n of [0, -1, 1]) {
    for (const m of matchsDeLaPage.value.get(`${f.league}|${decalerJour(jour, n)}`) ?? []) {
      // Le club qui reçoit d'abord : l'identifiant de l'autre n'est demandé que s'il correspond.
      if (teamIdFor(m.home, m.league) === f.homeId && teamIdFor(m.away, m.league) === f.awayId) return m.matchId;
    }
  }
  return null;
}

// --------------------------------------------------------- les chutes
function periodeDe(d) {
  if (!d.fromAt || !d.toAt) return { texte: 'période inconnue', titre: "Les relevés de cette chute ne sont pas datés : impossible de dire quand la cote a bougé." };
  if (d.fromAt === d.toAt) {
    return {
      texte: `de l'ouverture au relevé du ${quand(d.toAt)}`,
      titre: `La source donne sa cote d'ouverture avec la cote du moment : les deux ont été lues au même relevé, ${quandLong(d.toAt)}. L'heure exacte de l'ouverture n'est pas connue.`
    };
  }
  return { texte: `du ${quand(d.fromAt)} au ${quand(d.toAt)}`, titre: `Première cote relevée ${quandLong(d.fromAt)}, dernière ${quandLong(d.toAt)}.` };
}

function vueDeLivre(b, d) {
  const general = d.toProb - d.fromProb;
  const sien = Number(b.toProb ?? 0) - Number(b.fromProb ?? 0);
  // Une bourse à côté de bookmakers : montrée, mais hors de la moyenne (cf. marketMovement.js).
  const horsMoyenne = Boolean(b.exchange) && !d.exchangeOnly;
  const sens = horsMoyenne ? null : Math.abs(sien) < 1e-6 ? 'stable' : Math.sign(sien) === Math.sign(general) ? 'avec' : 'contre';
  const avecCotes = Number(b.fromOdds) > 1 && Number(b.toOdds) > 1;
  const cotes = avecCotes ? `${formatOdds(b.fromOdds)} → ${formatOdds(b.toOdds)}` : `${pct(b.fromProb)} → ${pct(b.toProb)}`;
  const meme = b.bookmaker === b.sourceName;
  const prix = avecCotes ? `${formatOdds(b.fromOdds)} à l'ouverture (${quand(b.fromAt)}), ${formatOdds(b.toOdds)} au dernier relevé (${quand(b.toAt)})` : `prix d'échange ${pct(b.fromProb)} à l'ouverture, ${pct(b.toProb)} au dernier relevé (cote non publiée par la source)`;
  let volume = null;
  if (b.exchange) {
    const unite = UNITES[b.sourceName] ?? '';
    volume =
      Number(b.volume) > 0
        ? {
            texte: `${nombre(b.volume)}${unite ? ` ${unite}` : ''} échangés`,
            titre: `Argent échangé sur ce marché chez ${b.sourceName}, au dernier relevé${PRECISIONS_UNITE[b.sourceName] ? ` (${PRECISIONS_UNITE[b.sourceName]})` : ''}.`
          }
        : { texte: 'argent échangé non relevé', titre: `${b.sourceName} n'a pas donné l'argent échangé sur ce marché à ce relevé.`, absent: true };
  }
  return {
    cle: `${b.source}|${b.bookmaker}`,
    nom: b.bookmaker,
    source: meme ? null : b.sourceName,
    bourse: Boolean(b.exchange),
    // Les deux cotes du bookmaker, pour la flèche de sens (OddsMoveArrow) : absentes pour un prix d'échange sans cote publiée.
    ouverture: avecCotes ? Number(b.fromOdds) : null,
    derniere: avecCotes ? Number(b.toOdds) : null,
    cotes,
    titre: `${b.bookmaker}${meme ? '' : ` (relevé chez ${b.sourceName})`} : ${prix} — probabilité juste ${pct(b.fromProb)} → ${pct(b.toProb)}.`,
    sens,
    horsMoyenne,
    volume
  };
}

function vueDeChute(d) {
  const de = coteJuste(d.fromProb);
  const a = coteJuste(d.toProb);
  const [un, plusieurs] = d.exchangeOnly ? ['bourse', 'bourses'] : ['bookmaker', 'bookmakers'];
  const n = d.bookmakersCount ?? 0;
  const accord = `${d.agreeing} ${d.agreeing > 1 ? plusieurs : un} sur ${n} ${d.agreeing > 1 ? 'vont' : 'va'} dans ce sens`;
  let accordTitre;
  if (n < 2) accordTitre = `Un seul ${un} mesuré sur ce marché : la chute n'est confirmée par personne d'autre.`;
  else if (d.agreeing >= n) accordTitre = `Les ${n} ${plusieurs} mesurés vont tous dans le même sens : la chute est générale.`;
  else accordTitre = `${n - d.agreeing} ${n - d.agreeing > 1 ? plusieurs : un} sur ${n} ne ${n - d.agreeing > 1 ? 'vont' : 'va'} pas dans ce sens : la chute n'est pas générale.`;
  return {
    cle: `${d.market}|${d.line}|${d.issue}`,
    d,
    // L'issue nomme un club (« Vasco da Gama gagne ») : son logo devant.
    camp: d.market === '1x2' && (d.issue === 'home' || d.issue === 'away') ? d.issue : 'aucun',
    de: de ?? 'inconnue',
    a: a ?? 'inconnue',
    coteTitre: `Cote juste (marge retirée, moyenne des ${plusieurs} mesurés) : ${de ?? 'inconnue'} à l'ouverture, ${a ?? 'inconnue'} au dernier relevé — probabilité ${pct(d.fromProb)} → ${pct(d.toProb)} (${points(d.deltaPoints)}).`,
    chute: chute(d.dropPct),
    chuteTitre: `La cote juste de « ${d.label} » a baissé de ${unDecimal(d.dropPct)} % depuis l'ouverture : l'issue est davantage jouée.`,
    accord,
    accordTon: n >= 2 && d.agreeing >= n ? 'is-accent' : d.agreeing < n ? 'is-warning' : '',
    accordTitre,
    periode: periodeDe(d),
    livres: (d.bookmakers ?? []).map((b) => vueDeLivre(b, d))
  };
}

/** Une rencontre, toute prête pour le gabarit (présentation seulement). */
function vueDeRencontre(f, chutes) {
  // L'identifiant renvoyé par le serveur (calendrier) d'abord, la liste de la page sinon.
  const matchId = f.matchId ?? pageDuMatch(f);
  const fav = {
    home: favoris.isFavoriteTeam(f.homeName, f.league, f.homeId ?? undefined),
    away: favoris.isFavoriteTeam(f.awayName, f.league, f.awayId ?? undefined),
    ligue: favoris.isFavoriteLeague(f.league)
  };
  const plusForte = chutes.reduce((m, d) => (d.dropPct > m.dropPct ? d : m), chutes[0]);
  return {
    cle: `${f.homeId ?? f.homeName}|${f.awayId ?? f.awayName}|${f.date}`,
    f,
    // La carte commune d'une rencontre (MatchCard.vue).
    carte: {
      matchId,
      commenceTime: f.kickoff ?? null,
      date: f.date,
      league: f.league,
      homeName: f.homeName,
      awayName: f.awayName,
      homeId: f.homeId ?? null,
      awayId: f.awayId ?? null,
      status: 'scheduled'
    },
    lien: matchId ? `/match-a-venir/${encodeURIComponent(matchId)}` : null,
    favori: fav.home || fav.away || fav.ligue,
    ligueFavorite: fav.ligue,
    max: plusForte.dropPct,
    maxTexte: chute(plusForte.dropPct),
    maxTitre: `Plus forte chute de cette rencontre : « ${plusForte.label} » (${plusForte.marketLabel}), cote juste ${coteJuste(plusForte.fromProb) ?? 'inconnue'} → ${coteJuste(plusForte.toProb) ?? 'inconnue'}.`,
    sources: f.sources ?? [],
    // L'instant du dernier relevé de cette rencontre : le plus récent parmi ses chutes (pastille de provenance).
    dernierReleve: chutes.map((d) => d.toAt).filter(Boolean).sort().at(-1) ?? null,
    chutes: chutes.map(vueDeChute)
  };
}

// Le vert est réservé à une vraie value (ValueBadge) : « tous les bookmakers vont dans le même sens » est une confirmation, en bleu.
const accordSansVert = (ton) => (ton === 'is-accent' ? 'is-info' : ton);

const rencontres = computed(() => {
  const liste = [];
  for (const f of data.value?.fixtures ?? []) {
    if (competition.value && f.league !== competition.value) continue;
    const chutes = (f.drops ?? []).filter((d) => !seulementAccord.value || d.agreeing >= 2);
    if (!chutes.length) continue;
    liste.push(vueDeRencontre(f, chutes));
  }
  // Un classement par la plus forte chute (recalculée sur les chutes
  // affichées) : les favoris ne remontent pas, ils sont marqués.
  return liste.sort((a, b) => b.max - a.max);
});

// -------------------------------------------------------------- bandeau
const periodeChoisie = computed(() => PERIODES.find((p) => p.value === (data.value?.days ?? jours.value)) ?? null);
const calcul = computed(() => {
  const iso = data.value?.generatedAt;
  if (!iso) return null;
  const d = new Date(iso);
  const memeJour = d.toDateString() === new Date(liveNow.value).toDateString();
  return {
    texte: `Calculé ${memeJour ? `à ${HEURE.format(d)}` : `le ${JOUR.format(d)} à ${HEURE.format(d)}`}`,
    titre: `Calcul du ${LONG.format(d)}. Le serveur le garde deux minutes ; « Actualiser » le refait tout de suite, sur les derniers relevés.`
  };
});
const sourcesTexte = computed(() => (couverture.value?.sources?.length ? couverture.value.sources.join(', ') : 'aucune source'));

/** Les rencontres avec des cotes qui ne sont ni mesurées ni à un seul relevé : commencées, ou sans cote lisible. */
const autresRencontres = computed(() => {
  const c = couverture.value;
  if (!c) return 0;
  return Math.max(0, (c.upcomingWithQuotes ?? 0) - (c.withMovement ?? 0) - (c.singleReading ?? 0));
});

// ------------------------------------------------------- ce qui manque
// Les phrases du serveur, et les sources qui n'ont rien donné sur la période.
const sourcesAbsentes = computed(() => {
  const vues = couverture.value?.sources ?? [];
  if (!vues.length) return [];
  return SOURCES_CONNUES.filter((s) => !vues.includes(s));
});
const avecManques = computed(() => Boolean(data.value?.missing?.length || sourcesAbsentes.value.length));

const descriptionVide = computed(() => {
  const pistes = [];
  if (jours.value < 7) pistes.push('élargissez la période');
  if (chuteMin.value > 5) pistes.push('baissez la chute minimale');
  if (seulementAccord.value) pistes.push('désactivez « Seulement quand plusieurs bookmakers s’accordent »');
  if (competition.value) pistes.push('revenez à « Toutes les compétitions »');
  const debut = `Aucune issue n'a perdu ${chuteMin.value} % ou plus de sa cote juste sur ${periodeChoisie.value?.texte ?? 'la période'}.`;
  return pistes.length ? `${debut} Pour en voir davantage : ${pistes.join(', ')}.` : `${debut} Les cotes bougent surtout dans les heures qui précèdent le coup d'envoi : revenez plus tard.`;
});
</script>

<template>
  <div class="drops cm-page">
    <!-- Le bandeau : ce qu'on regarde, d'où viennent les cotes, et les commandes. -->
    <section class="cm-hero drops__hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="trendDown" :size="18" /></span>
          Chutes de cotes
        </h2>
        <div class="drops__hero-side">
          <span class="cm-hero__chips">
            <span v-if="data" class="cm-chip is-section" title="Rencontres affichées, avec les filtres en cours">
              <AppIcon name="matches" :size="11" />
              {{ pluriel(rencontres.length, 'rencontre') }}
              <span v-if="rencontres.length !== (data.fixtures?.length ?? 0)" class="drops__of">sur {{ nombre(data.fixtures?.length ?? 0) }}</span>
            </span>
            <span v-if="couverture" class="cm-chip" :title="`Sources des cotes relevées sur la période : ${sourcesTexte}. Relevées gratuitement par l'appli, gardées dans la base locale.`">
              <AppIcon name="database" :size="11" />{{ sourcesTexte }}
            </span>
            <span v-if="calcul" class="cm-chip" :title="calcul.titre"><AppIcon name="clock" :size="11" />{{ calcul.texte }}</span>
          </span>
          <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger({ force: true })">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Actualiser
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">Les issues dont la cote a le plus baissé depuis l'ouverture, sur nos relevés gratuits.</p>

      <div class="cm-toolbar drops__toolbar">
        <AppSelect v-model="jours" label="Période" :options="PERIODES" />
        <AppSelect v-model="chuteMin" label="Chute minimale" :options="CHUTES" />
        <AppSelect v-model="competition" label="Compétition" :options="competitionOptions" class="drops__field-league" />
        <div class="drops__toggle" title="Ne garder que les chutes confirmées par au moins deux bookmakers qui vont dans le même sens">
          <AppToggle v-model="seulementAccord" label="Seulement quand plusieurs bookmakers s'accordent" />
        </div>
      </div>
    </section>

    <LoadingSpinner v-if="etat.loading && !data" label="Lecture des relevés de cotes…" />
    <EmptyState
      v-else-if="etat.error && !data"
      icon="alert"
      title="Chutes de cotes indisponibles"
      :description="`${etat.error} Vérifiez que CôteMaster tourne, puis réessayez.`"
    >
      <template #action>
        <AppButton variant="secondary" size="sm" @click="charger()">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Réessayer
        </AppButton>
      </template>
    </EmptyState>

    <template v-else-if="data">
      <div v-if="etat.error" class="cm-note is-danger drops__note">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="drops__note-body">
          <p class="cm-note__title">Actualisation impossible</p>
          <p class="cm-note__text">{{ etat.error }} — la liste affichée est la précédente<template v-if="calcul"> ({{ calcul.texte.toLowerCase() }})</template>.</p>
        </div>
      </div>

      <!-- Les chiffres clés : ce qu'on a pu mesurer sur la période. -->
      <div v-if="couverture" class="cm-kpis drops__kpis">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Rencontres à venir avec des cotes</span>
          <span class="cm-kpi__value">{{ nombre(couverture.upcomingWithQuotes) }}</span>
          <span class="cm-kpi__detail">
            <template v-if="autresRencontres">dont {{ autresRencontres }} déjà commencée{{ autresRencontres > 1 ? 's' : '' }} ou sans cote lisible</template>
            <template v-else>sur {{ periodeChoisie?.texte ?? 'la période' }}</template>
          </span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Avec un mouvement mesuré</span>
          <span class="cm-kpi__value">{{ nombre(couverture.withMovement) }}</span>
          <span class="cm-kpi__detail">au moins deux relevés comparables</span>
        </div>
        <div class="cm-kpi" :class="{ 'is-warn': couverture.singleReading }">
          <span class="cm-kpi__label">Un seul relevé</span>
          <span class="cm-kpi__value">{{ nombre(couverture.singleReading) }}</span>
          <span class="cm-kpi__detail">pas encore mesurable</span>
        </div>
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Chute d'au moins {{ data.minDropPct }}&nbsp;%</span>
          <span class="cm-kpi__value">{{ nombre(data.fixtures?.length ?? 0) }}</span>
          <span class="cm-kpi__detail">{{ (data.fixtures?.length ?? 0) > 1 ? 'rencontres' : 'rencontre' }} sur {{ periodeChoisie?.texte ?? 'la période' }}</span>
        </div>
      </div>

      <!-- Ce qui manque, dit en clair. -->
      <div v-if="avecManques" class="cm-note is-warning drops__note">
        <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="drops__note-body">
          <p class="cm-note__title">Ce qui manque</p>
          <ul class="drops__gaps">
            <li v-for="(phrase, i) in data.missing ?? []" :key="i">{{ phrase }}</li>
            <li v-if="sourcesAbsentes.length">
              Aucune cote de <strong>{{ sourcesAbsentes.join(', ') }}</strong> parmi les rencontres à venir de la période : {{ sourcesAbsentes.length > 1 ? 'ces sources ne cotent' : 'cette source ne cote' }} aucune d'elles pour l'instant.
            </li>
          </ul>
        </div>
      </div>

      <EmptyState v-if="!rencontres.length" icon="trendDown" title="Aucune chute de cote avec ces réglages" :description="descriptionVide" />

      <!-- Les rencontres, de la plus forte chute à la plus faible. -->
      <AppCard
        v-else
        icon="trendDown"
        :eyebrow="`Chute d'au moins ${data.minDropPct} %`"
        title="Les plus fortes chutes"
        :subtitle="`Sur ${periodeChoisie?.texte ?? 'la période'}, rangées par la plus forte chute de chaque rencontre. Cote juste = marge retirée.`"
      >
        <template #actions>
          <span class="drops__guide">Cote juste<HelpTip terme="cote-juste" /></span>
        </template>
        <div class="drops__body">
          <div class="drops__list cm-stagger">
            <article v-for="r in rencontres" :key="r.cle" class="cm-block drops__fixture" :class="{ 'is-favorite': r.favori }">
              <MatchCard :match="r.carte" :to="r.lien" team-links class="drops__card">
                <template #info>
                  <span class="drops__league">
                    <span class="drops__league-name" :title="r.f.league"><LeagueBadge :league="r.f.league" /></span>
                    <FavoriteStar v-if="r.ligueFavorite" active :interactive="false" kind="league" :label="r.f.league" :size="11" />
                    <KickoffCountdown :coup-d-envoi="r.f.kickoff ?? r.f.date" :heure-sure="Boolean(r.f.kickoff)" variante="texte" />
                  </span>
                </template>
                <template #aside>
                  <span class="drops__aside">
                    <span v-if="!r.f.kickoff" class="drops__unsure" title="Aucune source ne donne l'heure exacte du coup d'envoi : seul le jour est connu">heure à confirmer</span>
                    <span class="drops__max cm-numeric">
                      <OddsMoveArrow :pourcent="-r.max" sujet="Cote juste" :titre="r.maxTitre">{{ r.maxTexte }}</OddsMoveArrow>
                    </span>
                  </span>
                </template>
              </MatchCard>

              <ul class="drops__drops">
                <li v-for="c in r.chutes" :key="c.cle" class="drop">
                  <div class="drop__main">
                    <div class="drop__what">
                      <PickCrest :side="c.camp" :home="r.f.homeName" :away="r.f.awayName" :home-id="r.f.homeId ?? null" :away-id="r.f.awayId ?? null" :league="r.f.league" :size="18" reserve />
                      <span class="drop__label">{{ c.d.label }}</span>
                      <span class="drop__market">{{ c.d.marketLabel }}</span>
                    </div>
                    <span class="drop__fair cm-numeric" :title="c.coteTitre">
                      <span class="drop__from">{{ c.de }}</span>
                      <AppIcon name="arrowRight" :size="12" class="drop__arrow" />
                      <strong>{{ c.a }}</strong>
                    </span>
                    <!-- La flèche de mouvement : direction et ampleur, lisibles sans la couleur (jamais le vert de la value). -->
                    <span class="drop__pct cm-numeric">
                      <OddsMoveArrow :pourcent="-c.d.dropPct" taille="lg" sujet="Cote juste" :titre="c.chuteTitre">{{ c.chute }}</OddsMoveArrow>
                    </span>
                  </div>

                  <div class="drop__meta">
                    <span class="cm-chip" :class="accordSansVert(c.accordTon)" :title="c.accordTitre">
                      <AppIcon name="users" :size="11" />{{ c.accord }}
                    </span>
                    <span class="drop__period" :title="c.periode.titre">
                      <AppIcon name="clock" :size="11" />{{ c.periode.texte }}
                    </span>
                  </div>

                  <!-- Bookmaker par bookmaker : son ouverture, sa dernière cote, et l'argent des bourses. -->
                  <ul class="drop__books">
                    <li v-for="b in c.livres" :key="b.cle" class="drop__book" :title="b.titre">
                      <span class="drop__book-who">
                        <span class="drop__book-name">{{ b.nom }}</span>
                        <span v-if="b.source" class="drop__book-source" :class="{ 'is-exchange': b.bourse }">· {{ b.source }}</span>
                        <span v-else-if="b.bourse" class="drop__book-source is-exchange">· bourse</span>
                      </span>
                      <span class="drop__book-odds cm-numeric">
                        <OddsMoveArrow v-if="b.ouverture && b.derniere" :de="b.ouverture" :vers="b.derniere" :ampleur="false" taille="sm" />{{ b.cotes }}
                      </span>
                      <span v-if="b.volume" class="drop__book-volume cm-numeric" :class="{ 'is-absent': b.volume.absent }" :title="b.volume.titre">{{ b.volume.texte }}</span>
                      <span v-if="b.horsMoyenne" class="drop__book-tag" title="Une bourse, à côté de bookmakers : montrée pour information, elle ne compte pas dans la moyenne de la chute">hors moyenne</span>
                      <span v-else-if="b.sens === 'contre'" class="drop__book-tag is-against" title="Ce bookmaker a bougé dans l'autre sens : chez lui, l'issue est moins jouée qu'à l'ouverture">sens inverse</span>
                      <span v-else-if="b.sens === 'stable'" class="drop__book-tag" title="Ce bookmaker n'a pas bougé sur cette issue depuis l'ouverture">stable</span>
                    </li>
                  </ul>
                </li>
              </ul>

              <!-- D'où viennent les cotes de cette rencontre, et le dernier relevé. -->
              <p v-if="r.sources.length" class="drops__sources">
                <ProvenanceChip :source="r.sources.join(', ')" action="dernier relevé" :releve-le="r.dernierReleve" variante="ligne">
                  <template #source>Cotes relevées chez {{ r.sources.join(', ') }}</template>
                </ProvenanceChip>
              </p>
            </article>
          </div>

          <!-- Comment lire une chute, et ce qu'elle ne dit pas. -->
          <div class="cm-note is-info drops__note">
            <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
            <div class="drops__note-body">
              <p class="cm-note__title">Lecture</p>
              <p class="cm-note__text drops__reading">
                Une chute veut dire que l'issue est davantage jouée qu'à l'ouverture : une information (composition, blessure) ou de l'argent bien informé.
                Elle se mesure sur la cote juste (marge retirée), bookmaker par bookmaker, puis se moyenne ; les bourses (Kalshi, Smarkets) ne comptent que si aucun bookmaker ne cote le marché.
                Ce n'est jamais un pari en soi : ces bookmakers ne sont pas jouables depuis la France, et la cote a déjà baissé.
              </p>
            </div>
          </div>
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.drops {
  /* Se règle sur SA largeur : l'onglet vit dans la page Matchs, large ou non. */
  container: drops / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.drops__hero {
  gap: 16px;
}

.drops__hero-side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

/* « 3 rencontres sur 12 » : le total en retrait dans la puce. */
.drops__of {
  font-weight: 500;
  opacity: 0.75;
}

.drops__toolbar > * {
  flex: 1 1 150px;
}

.drops__toolbar > .drops__field-league {
  flex: 1.5 1 200px;
}

.drops__toolbar > .drops__toggle {
  flex: 2 1 300px;
}

/* L'interrupteur, à la hauteur des champs voisins pour s'aligner sur eux. */
.drops__toggle {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 6px 12px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
}

.drops__toggle > * {
  flex: 1;
}

/* -------------------------------------------------------- chiffres clés */
.drops__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

/* --------------------------------------------------------------- notes */
.drops__note-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.drops__note-body .cm-note__title,
.drops__note-body .cm-note__text {
  margin: 0;
}

.drops__gaps {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.drops__gaps strong {
  color: var(--cm-text-primary);
}

.drops__reading {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------- la liste */
.drops__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drops__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Une rencontre : un cadre plus sombre, la carte commune en tête, ses
   chutes dessous (même construction que l'Historique moteur). */
.drops__fixture {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--cm-radius-lg);
  background: var(--cm-surface);
}

/* Un club ou une compétition favorite : le cadre légèrement doré, l'ordre ne change pas. */
.drops__fixture.is-favorite {
  border-color: rgba(var(--cm-gold-rgb) / 0.35);
  background: linear-gradient(135deg, rgba(var(--cm-gold-rgb) / 0.08), transparent 60%), var(--cm-surface);
}

.drops__card {
  --mcard-aside: 128px;
}

.drops__league {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Le nom de la compétition à sa largeur : l'étoile d'un favori le suit au
   lieu d'être rejetée au bout de la colonne. */
.drops__league-name {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
}

.drops__aside {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

/* La plus forte chute de la rencontre : la flèche de mouvement dans une pastille d'information (bleu), et non plus en couleur de section. */
.drops__max {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  font-size: 12.5px;
  font-weight: 800;
  white-space: nowrap;
}

.drops__unsure {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border-strong);
  font-size: 10px;
  font-weight: 600;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.drops__drops {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ----------------------------------------------------------- une chute */
.drop {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.drop__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px 18px;
}

.drop__what {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  min-width: 0;
}

.drop__label {
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.drop__market {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* Cote juste d'ouverture → dernière cote juste. */
.drop__fair {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--cm-text-muted);
  white-space: nowrap;
  cursor: help;
}

.drop__arrow {
  color: var(--cm-text-muted);
}

.drop__fair strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

/* La chute : le chiffre vedette, gros — dessiné par OddsMoveArrow (flèche, signe, ampleur ; bleu d'information, jamais le vert de la value). */
.drop__pct {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

/* La petite flèche de sens d'un bookmaker, devant ses deux cotes. */
.drop__book-odds :deep(.omove) {
  margin-right: 6px;
  vertical-align: -2px;
}

/* « Cote juste ? » dans l'en-tête de la carte : le mot et sa bulle d'aide. */
.drops__guide {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
}

.drop__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}

.drop__period {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  cursor: help;
}

.drop__books {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 8px 0 0;
  list-style: none;
  border-top: 1px solid var(--cm-border-soft);
}

.drop__book {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 12px;
  font-size: 12px;
}

.drop__book-who {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.drop__book-name {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.drop__book-source {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.drop__book-source.is-exchange {
  color: var(--cm-info);
}

.drop__book-odds {
  margin-left: auto;
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.drop__book-volume {
  font-size: 11.5px;
  color: var(--cm-info);
  white-space: nowrap;
}

.drop__book-volume.is-absent {
  color: var(--cm-text-muted);
  border-bottom: 1px dotted var(--cm-border-strong);
  cursor: help;
}

.drop__book-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 10px;
  font-weight: 700;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.drop__book-tag.is-against {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.drops__sources {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.drops__sources :deep(svg) {
  flex-shrink: 0;
}

/* ------------------------------------------------------------ étroit */
@container drops (max-width: 720px) {
  .drops__hero {
    padding: 16px;
  }

  .drops__toolbar > *,
  .drops__toolbar > .drops__field-league {
    flex: 1 1 calc(50% - 6px);
  }

  /* L'interrupteur sur toute la ligne : son libellé ne s'écrase pas sur trois lignes. */
  .drops__toolbar > .drops__toggle {
    flex: 1 1 100%;
  }

  /* La colonne de droite de la carte à sa largeur naturelle : la place va aux noms des clubs. */
  .drops__card {
    --mcard-aside: auto;
  }

  /* La cote juste passe sous l'issue, la chute reste à droite. */
  .drop__main {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .drop__fair {
    grid-column: 1;
    grid-row: 2;
  }

  .drop__pct {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}

@container drops (max-width: 480px) {
  .drops__toolbar > *,
  .drops__toolbar > .drops__field-league,
  .drops__toolbar > .drops__toggle {
    flex-basis: 100%;
  }

  .drop {
    padding: 10px;
  }

  .drop__book-odds {
    margin-left: 0;
  }
}
</style>
