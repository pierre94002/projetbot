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
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import ValueBadge from '@/components/common/ValueBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { configApi } from '@/services/configApi.js';
import { screenerApi } from '@/services/screenerApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { formatOdds } from '@/utils/format.js';
import { formatLeagueOptionLabel, parseLeagueLabel } from '@/utils/leagueDisplay.js';
import { liveNow } from '@/utils/liveClock.js';

/**
 * L'onglet « Repérage » de la page Matchs (04/10/2026, Pierre : « lance les
 * 4 améliorations ») : l'idée de Datafoot — classer les matchs à venir par
 * marché — faite comme il faut (cf. server/src/data/screener.js). On classe
 * par la PROBABILITÉ DU MOTEUR ; à côté, la probabilité juste du marché et
 * l'écart entre les deux, la meilleure cote jouable en 1 / N / 2, et ce
 * qu'un parieur vérifie à la main : la fréquence du championnat, celle de
 * chaque équipe à domicile ou à l'extérieur AVEC son nombre de matchs, et
 * une estimation ramenée vers la moyenne (un 5 sur 5 ne passe plus devant
 * un 30 sur 38).
 *
 * Le serveur calcule en arrière-plan (une à deux minutes pour les matchs de
 * la semaine) et garde le résultat 30 minutes : tant que le calcul tourne,
 * on redemande toutes les 3 s pour suivre l'avancement, et le tableau
 * précédent reste affiché s'il existe.
 *
 * C'est un CLASSEMENT : les favoris ne remontent pas, leur ligne est
 * marquée (fond doré léger, étoile), comme dans StandingsTable. Et rien ne
 * manque sans être dit (règle de Pierre du 04/10/2026) : une cote, un
 * marché ou un contexte absent s'affiche avec sa raison.
 */
const favoris = useFavoritesStore();

// ------------------------------------------------------------- lecture
// La réponse du serveur telle quelle : { status: computing|ready|error,
// progress: { done, total } | null, error, data }.
const reponse = ref(null);
// La requête elle-même : en route, ou en échec (serveur injoignable).
const lecture = ref({ enCours: false, erreur: null });
let minuteur = null;
// Seule la réponse de la DERNIÈRE demande compte : une demande plus
// ancienne, revenue après un clic sur « Recalculer », n'écrase rien et ne
// relance pas un second suivi en parallèle.
let numero = 0;
let ouverte = true;

async function lire({ force = false } = {}) {
  clearTimeout(minuteur);
  const n = ++numero;
  lecture.value = { enCours: true, erreur: null };
  let r;
  try {
    r = await screenerApi.get({ force });
  } catch (error) {
    if (!ouverte || n !== numero) return;
    // Serveur injoignable ou pas à jour : on s'arrête et on le dit (bouton
    // « Réessayer »), plutôt que de redemander dans le vide toutes les 3 s.
    lecture.value = { enCours: false, erreur: error.message };
    return;
  }
  if (!ouverte || n !== numero) return;
  reponse.value = r;
  lecture.value = { enCours: false, erreur: null };
  // Calcul en cours : une demande toutes les 3 s pour suivre l'avancement.
  if (r?.status === 'computing') minuteur = setTimeout(() => lire(), 3000);
}

const recalculer = () => lire({ force: true });

onMounted(() => lire());
onBeforeUnmount(() => {
  ouverte = false;
  clearTimeout(minuteur);
});

const donnees = computed(() => reponse.value?.data ?? null);
// Serveur injoignable : le « calcul en cours » de la dernière réponse n'est
// plus une information sûre, on ne l'affiche plus (le bouton redevient actif).
const enCalcul = computed(() => reponse.value?.status === 'computing' && !lecture.value.erreur);
// Le dernier calcul a échoué alors qu'un tableau plus ancien existe : le
// serveur répond « ready » avec l'ancien tableau et l'erreur à côté.
const erreurCalcul = computed(() => (!enCalcul.value && donnees.value ? (reponse.value?.error ?? null) : null));

// ------------------------------------------- le langage visuel des paris
// (étape 6 du plan, 06/10/2026) Le vert n'est jamais décoratif : une cote n'est
// « value » que chez l'un de VOS bookmakers (la règle estJouable, déjà appliquée
// par le serveur à `bestOdds`) ET au-dessus du seuil du moteur (Réglages), cf.
// ValueBadge et utils/langageParis.js. Les seuils se lisent sur /api/config ;
// tant qu'ils manquent, la pastille dit « seuil inconnu » et reste neutre.
const sources = useSourcesStore();
const regleValue = ref(null);
const enPourcent = (x) => Number((Number(x) * 100).toFixed(6));

async function lireRegle() {
  try {
    const { config } = await configApi.get();
    const regle = { min: enPourcent(config?.edgeThresholdMin), max: enPourcent(config?.edgeThresholdMax), coteMax: Number(config?.maxValueOdds) };
    regleValue.value = Object.values(regle).every(Number.isFinite) ? regle : null;
  } catch {
    regleValue.value = null;
  }
}

// Les promesses rendues ne servent qu'au rendu côté serveur des essais : en navigateur, elles sont ignorées.
onMounted(() => Promise.all([lireRegle(), sources.origins ? null : sources.fetchSources().catch(() => {})]));
// Un NOUVEAU calcul (pas le premier, qui a déjà lu les seuils à l'ouverture) : ceux de Réglages ont pu changer depuis.
watch(
  () => reponse.value?.data?.generatedAt,
  (nouveau, ancien) => {
    if (ancien) lireRegle();
  }
);

// D'où vient chaque colonne (règle de Pierre du 03/10/2026 : le vrai endroit des
// données) : le fournisseur réel et l'heure de son relevé, lus sur /api/sources.
const SOURCES_GRATUITES = ['ESPN', 'football-data.co.uk', '365Scores', 'Kalshi', 'Smarkets'];
const origines = computed(() => sources.origins);
const provenanceMarche = computed(() => {
  const liste = origines.value?.freeOdds?.sources ?? [];
  return {
    // Origines chargées mais aucune cote gratuite en base : on le dit au lieu d'une pastille vide.
    vide: Boolean(origines.value) && !liste.length,
    source: liste.map((s) => s.name).join(', ') || SOURCES_GRATUITES.join(', '),
    releveLe: liste.map((s) => s.lastSeenAt).filter(Boolean).sort().at(-1) ?? null,
    fichier: origines.value?.freeOdds?.file ?? null
  };
});
const provenanceJouable = computed(() => ({
  releveLe: origines.value?.odds?.updatedAt ?? sources.fixtures?.oddsLastSyncedAt ?? null,
  fichier: origines.value?.odds?.file ?? null
}));
const provenanceMoteur = computed(() => ({ fichier: origines.value?.store?.file ?? null }));

/**
 * Le prochain coup d'envoi parmi les matchs affichés (le compte à rebours du bandeau) : un match dont
 * l'heure est EXACTE et à venir — celle d'un match du calendrier FotMob n'est qu'un jour, on ne la compte pas.
 */
const prochainMatch = computed(() => {
  let prochain = null;
  for (const m of matchsVisibles.value) {
    const t = Date.parse(m.commenceTime);
    if (m.exactKickoff && Number.isFinite(t) && t > liveNow.value && (!prochain || t < prochain.t)) prochain = { m, t };
  }
  return prochain?.m ?? null;
});

/** Le sens d'un écart moteur – marché : une direction à lire (signe, gras), jamais le vert ni le rouge. */
const sensDeLEcart = (classe) => (classe === 'cm-positive' ? 'is-up' : classe === 'cm-negative' ? 'is-down' : '');

// ------------------------------------------------------------ format
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, mot, pl = `${mot}s`) => `${nombre(n)} ${n > 1 ? pl : mot}`;
/** Une probabilité en pour cent, une décimale au plus : « 71,9 % », « 36 % ». */
const pct = (p) => `${(Math.round(Number(p) * 1000) / 10).toLocaleString('fr-FR')} %`;
const unDecimal = (x) => Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Le signe d'une valeur arrondie au dixième : « 0,0 » n'en porte pas. */
const signe = (x) => {
  const r = Math.round(x * 10) / 10;
  return r > 0 ? '+' : r < 0 ? '−' : '';
};
const points = (x) => `${signe(x)}${unDecimal(x)} pt${Math.abs(x) >= 2 ? 's' : ''}`;
const pourcentSigne = (x) => `${signe(x)}${unDecimal(x)} %`;
/** La cote juste d'une probabilité (1 / p) ; une probabilité nulle n'en a pas. */
const coteJuste = (p) => (Number(p) > 0 ? formatOdds(1 / Number(p)) : 'non définie');
const deuxDecimales = (x) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tonDe = (x) => {
  const r = Math.round(x * 10) / 10;
  return r > 0 ? 'cm-positive' : r < 0 ? 'cm-negative' : '';
};

const fmt = (options) => new Intl.DateTimeFormat('fr-FR', options);
const HEURE = fmt({ hour: '2-digit', minute: '2-digit' });
const JOUR = fmt({ day: '2-digit', month: '2-digit' });
const JOUR_COURT = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' });
// Un match du calendrier n'a que son jour (heure de repli : midi UTC) : on
// le lit en UTC pour ne jamais le décaler d'un jour.
const JOUR_COURT_UTC = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const DATE_LONGUE = fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const DATE_LONGUE_UTC = fmt({ weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function duree(ms) {
  const s = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return reste ? `${min} min ${String(reste).padStart(2, '0')} s` : `${min} min`;
}

/** Une absence dite en clair : un texte court dans la case, la raison complète au survol. */
const absent = (texte, titre) => ({ absent: true, texte, titre });

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

/** L'heure et la durée du calcul affiché. */
const calcul = computed(() => {
  const d = donnees.value;
  if (!d?.generatedAt) return null;
  const quand = new Date(d.generatedAt);
  const memeJour = quand.toDateString() === new Date(liveNow.value).toDateString();
  return {
    texte: `Calculé ${memeJour ? `à ${HEURE.format(quand)}` : `le ${JOUR.format(quand)} à ${HEURE.format(quand)}`} en ${duree(d.durationMs)}`,
    titre: `Calcul du ${DATE_LONGUE.format(quand)}, en ${duree(d.durationMs)}, sur les matchs à venir des ${d.days} prochains jours. Le résultat est gardé 30 minutes ; au-delà, il se recalcule à la prochaine ouverture de l'onglet.`
  };
});

// ------------------------------------------------------------ marché
const CLES_1N2 = new Set(['home', 'draw', 'away']);
const marche = ref('home');
const marches = computed(() => donnees.value?.markets ?? []);
const marcheOptions = computed(() => marches.value.map((x) => ({ value: x.key, label: x.label, group: x.group })));
const libelleMarche = computed(() => marches.value.find((x) => x.key === marche.value)?.label ?? marche.value);
const en1N2 = computed(() => CLES_1N2.has(marche.value));
watch(marches, (liste) => {
  if (liste.length && !liste.some((x) => x.key === marche.value)) marche.value = liste[0].key;
});

// ------------------------------------------------------- compétition
const competition = ref('');
const tousLesMatchs = computed(() => donnees.value?.matches ?? []);

/**
 * Les compétitions du calcul, les favorites d'abord (marquées d'une étoile).
 * Le groupe des autres s'appelle « Autres compétitions » : l'option du haut
 * s'appelle déjà « Toutes les compétitions » (même choix que le calendrier
 * saison).
 */
const competitionOptions = computed(() => {
  const compte = new Map();
  for (const m of tousLesMatchs.value) if (m.league) compte.set(m.league, (compte.get(m.league) ?? 0) + 1);
  const ligues = [...compte.keys()].sort((a, b) => formatLeagueOptionLabel(a).localeCompare(formatLeagueOptionLabel(b), 'fr'));
  const avecFavoris = favoris.leagues.length > 0;
  return [
    { value: '', label: 'Toutes les compétitions', icon: 'layers', hint: pluriel(tousLesMatchs.value.length, 'match') },
    ...favoris.favoritesFirst(ligues, { league: (l) => l }).map((l) => {
      const favorite = favoris.isFavoriteLeague(l);
      return {
        value: l,
        label: formatLeagueOptionLabel(l),
        league: l,
        favorite,
        group: avecFavoris ? (favorite ? 'Favoris' : 'Autres compétitions') : undefined,
        hint: pluriel(compte.get(l), 'match')
      };
    })
  ];
});
// Une compétition qui n'a plus de match après un recalcul : retour à toutes.
watch(competitionOptions, (options) => {
  if (competition.value && !options.some((o) => o.value === competition.value)) competition.value = '';
});

// ------------------------------------------------------------ période
const PERIODES = [
  { value: 'today', label: "Aujourd'hui", jusqua: 0 },
  { value: '3', label: '3 prochains jours', jusqua: 2 },
  // Le calcul couvre lui-même les 7 prochains jours : pas de filtre.
  { value: '7', label: '7 prochains jours', jusqua: Infinity }
];
const periode = ref('7');

const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Le jour du match : celui de l'heure locale quand le coup d'envoi est connu, celui du calendrier sinon. */
const jourDuMatch = (m) => (m.exactKickoff ? jourLocal(new Date(m.commenceTime)) : String(m.commenceTime ?? '').slice(0, 10));
const ecartJours = (jour, aujourdhui) => Math.round((Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);

function dansLaPeriode(m, valeur, aujourdhui) {
  const p = PERIODES.find((x) => x.value === valeur);
  if (!p || p.jusqua === Infinity) return true;
  // Un match commencé il y a moins de deux heures (gardé par le serveur) compte pour aujourd'hui.
  return ecartJours(jourDuMatch(m), aujourdhui) <= p.jusqua;
}

const matchsDeLaCompetition = computed(() => (competition.value ? tousLesMatchs.value.filter((m) => m.league === competition.value) : tousLesMatchs.value));
const periodeOptions = computed(() => {
  const aujourdhui = jourLocal(new Date(liveNow.value));
  return PERIODES.map((p) => ({
    value: p.value,
    label: p.label,
    hint: pluriel(matchsDeLaCompetition.value.filter((m) => dansLaPeriode(m, p.value, aujourdhui)).length, 'match')
  }));
});
const matchsVisibles = computed(() => {
  const aujourdhui = jourLocal(new Date(liveNow.value));
  return matchsDeLaCompetition.value.filter((m) => dansLaPeriode(m, periode.value, aujourdhui));
});

// --------------------------------------------------------------- tri
const TRIS = { engine: 'Probabilité du moteur', gap: 'Écart moteur – marché', edge: 'Valeur chez vos bookmakers' };
const tri = ref('engine');
// La valeur chez un bookmaker n'existe qu'en 1 / N / 2 : seul marché du
// relevé The Odds API, le seul à donner des cotes jouables.
const triOptions = computed(() => [
  { value: 'engine', label: TRIS.engine },
  { value: 'gap', label: TRIS.gap },
  ...(en1N2.value ? [{ value: 'edge', label: TRIS.edge, hint: '1 / N / 2' }] : [])
]);
watch(en1N2, (oui) => {
  if (!oui && tri.value === 'edge') tri.value = 'engine';
});
function trierPar(cle) {
  if (cle === 'edge' && !en1N2.value) return;
  tri.value = cle;
}

const seulementAvecMarche = ref(false);

/** Du plus grand au plus petit, les valeurs absentes en dernier. */
const decroissant = (x, y) => (x == null ? (y == null ? 0 : 1) : y == null ? -1 : y - x);

// ------------------------------------------------------ cases du tableau
function quandDuMatch(m) {
  const t = new Date(m.commenceTime);
  if (Number.isNaN(t.getTime())) return { jour: 'date inconnue', heure: null, titre: 'La liste des matchs ne donne pas de date pour cette rencontre.' };
  if (!m.exactKickoff) {
    return {
      jour: JOUR_COURT_UTC.format(t),
      heure: null,
      titre: `${DATE_LONGUE_UTC.format(t)} — heure du coup d'envoi à confirmer : le match n'est connu que par le calendrier FotMob, qui donne le jour sans l'heure ; elle arrivera avec ses cotes.`
    };
  }
  return { jour: JOUR_COURT.format(t), heure: HEURE.format(t), titre: `Coup d'envoi : ${DATE_LONGUE.format(t)}` };
}

function celluleMoteur(m, k, libelle) {
  if (k.engineProb == null) return absent('non calculée', `Le moteur n'a pas rendu de probabilité pour « ${libelle} » sur ce match.`);
  const xg = m.expectedGoals;
  const buts =
    xg && Number.isFinite(xg.home) && Number.isFinite(xg.away)
      ? ` Buts attendus par le moteur : ${m.home} ${deuxDecimales(xg.home)}, ${m.away} ${deuxDecimales(xg.away)}${xg.source === 'fotmob' ? ' (moyennes de buts du magasin FotMob)' : xg.source ? ` (source : ${xg.source})` : ''}.`
      : '';
  return {
    texte: pct(k.engineProb),
    sous: `cote juste ${coteJuste(k.engineProb)}`,
    titre: `Le moteur donne ${pct(k.engineProb)} à « ${libelle} », soit une cote juste de ${coteJuste(k.engineProb)}.${buts}`
  };
}

function raisonSansMarche(m, libelle) {
  const inconnus = [!m.homeId ? m.home : null, !m.awayId ? m.away : null].filter(Boolean);
  if (inconnus.length) {
    return absent(
      'club non reconnu',
      `${inconnus.join(' et ')} ${inconnus.length > 1 ? 'ne sont pas reconnus' : "n'est pas reconnu"} dans le magasin FotMob : les cotes relevées gratuitement ne peuvent pas être rattachées à ce match.`
    );
  }
  if ((m.markets ?? []).every((x) => x.marketProb == null)) {
    return absent(
      'aucune cote relevée',
      `Aucune cote complète relevée pour ce match par nos sources gratuites (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) : la compétition n'est pas couverte, ou les cotes ne sont pas encore publiées — les petits championnats ne sont souvent cotés que la veille ou le jour du match.`
    );
  }
  return absent('marché non coté', `Des cotes sont relevées pour ce match, mais aucune de nos sources gratuites ne cote « ${libelle} ».`);
}

function celluleMarche(m, k, libelle) {
  if (k.marketProb == null) return raisonSansMarche(m, libelle);
  const n = k.marketBookmakers ?? 0;
  if (k.marketExchangeOnly) {
    return {
      texte: pct(k.marketProb),
      sous: pluriel(n, 'bourse'),
      bourses: true,
      titre: `Aucun bookmaker ne cote « ${libelle} » pour ce match : ${pct(k.marketProb)} vient des bourses (Kalshi, Smarkets), pondérées par l'argent échangé — cote juste ${coteJuste(k.marketProb)}. Référence seulement : aucune n'est jouable depuis la France.`
    };
  }
  return {
    texte: pct(k.marketProb),
    sous: pluriel(n, 'bookmaker'),
    bourses: false,
    titre: `Probabilité juste du marché pour « ${libelle} », marge retirée : moyenne de ${pluriel(n, 'bookmaker')} relevé${n > 1 ? 's' : ''} gratuitement — cote juste ${coteJuste(k.marketProb)}. Référence seulement : ces bookmakers ne sont pas jouables depuis la France.`
  };
}

function celluleEcart(k) {
  if (k.gapPoints == null) {
    if (k.engineProb == null) return absent('sans moteur', "Pas d'écart : le moteur n'a pas de probabilité pour ce marché.");
    return absent('sans marché', "Pas d'écart : il manque la probabilité du marché (la raison est dans la colonne Marché).");
  }
  const sens = tonDe(k.gapPoints) === 'cm-positive' ? 'le moteur croit davantage à cette issue que le marché' : tonDe(k.gapPoints) === 'cm-negative' ? 'le moteur y croit moins que le marché' : 'le moteur et le marché sont d’accord';
  return {
    texte: points(k.gapPoints),
    classe: tonDe(k.gapPoints),
    titre: `Moteur ${pct(k.engineProb)}, marché ${pct(k.marketProb)} : ${sens} (${points(k.gapPoints)} de probabilité).`
  };
}

// Étape 8 du plan : les états d'un verdict du moteur qui portent une cote de vos bookmakers (verdictPari.js).
const VERDICTS_AVEC_OFFRE = new Set(['value', 'value-secondaire', 'a-rafraichir', 'sous-seuil', 'sans-value', 'trop-beau', 'cote-haute', 'juge']);

/**
 * La cote que le MOTEUR a jugée (étape 8) : celle de son verdict — la meilleure
 * de vos bookmakers qui n'ont pas fixé la cote juste du match — et non plus la
 * meilleure de tous ; un bookmaker « juge et partie » qui paie davantage est dit
 * à côté. null sans verdict (serveur d'avant l'étape 8) : la lecture d'avant.
 */
function celluleDuVerdict(k, libelle) {
  const v = k.verdict;
  if (!v || !VERDICTS_AVEC_OFFRE.has(v.etat) || v.cote == null) return null;
  const valeur = Number.isFinite(v.pourcent) ? pourcentSigne(v.pourcent) : null;
  const juge = v.offreJuge ? ` ${v.offreJuge.bookmakerTitle} paie ${formatOdds(v.offreJuge.cote)} mais a fixé la cote juste : écarté.` : '';
  return {
    texte: formatOdds(v.cote),
    livre: v.bookmakerTitle ?? 'bookmaker sans nom',
    valeur: valeur ? `valeur ${valeur}` : 'valeur : moteur absent',
    juge: v.offreJuge ? `${v.offreJuge.bookmakerTitle} ${formatOdds(v.offreJuge.cote)} écarté (juge et partie)` : null,
    classe: '',
    titre: `La cote de vos bookmakers que le moteur juge pour « ${libelle} » : ${formatOdds(v.cote)} chez ${v.bookmakerTitle ?? 'un bookmaker sans nom'}.${juge} ${v.raison ?? ''}`
  };
}

function celluleCote(m, k, libelle) {
  const parLeMoteur = celluleDuVerdict(k, libelle);
  if (parLeMoteur) return parLeMoteur;
  if (!CLES_1N2.has(k.key)) {
    return absent(
      'pas de cote française',
      `Aucune cote française dans nos sources pour « ${libelle} » : le relevé The Odds API ne donne que le 1 / N / 2, et les cotes gratuites (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) ne sont pas jouables depuis la France.`
    );
  }
  if (k.bestOdds == null) {
    if (m.oddsSource === 'odds-api') return absent('issue non cotée', `Le relevé The Odds API couvre ce match, mais aucun bookmaker n'y cote « ${libelle} ».`);
    if (m.oddsSource === 'gratuit') {
      return absent(
        'pas de relevé The Odds API',
        "Pas de relevé The Odds API pour ce match : il n'a que des cotes gratuites de référence (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets), qui ne sont pas jouables depuis la France."
      );
    }
    return absent('pas de relevé The Odds API', "Pas de relevé The Odds API pour ce match (relevé fait à la main, sur quota payant) : aucune cote de bookmaker jouable à comparer au moteur.");
  }
  const livre = k.bestBookmaker ?? 'bookmaker sans nom';
  const valeur = k.edgePct == null ? null : pourcentSigne(k.edgePct);
  return {
    texte: formatOdds(k.bestOdds),
    livre,
    valeur: valeur ? `valeur ${valeur}` : 'valeur : moteur absent',
    classe: k.edgePct == null ? '' : tonDe(k.edgePct),
    titre: `Meilleure cote du relevé The Odds API pour « ${libelle} » : ${formatOdds(k.bestOdds)} chez ${livre}.${
      valeur ? ` Valeur pour le moteur : ${pct(k.engineProb)} × ${formatOdds(k.bestOdds)} − 1 = ${valeur}.` : " Pas de valeur : le moteur n'a pas de probabilité pour cette issue."
    }`
  };
}

function celluleContexte(m, k, libelle, prior) {
  const c = k.context;
  const nomLigue = parseLeagueLabel(m.league).name || m.league || 'ce championnat';
  if (!c) {
    return absent(
      'saison absente du magasin',
      `Aucune rencontre jouée de la saison en cours de ${nomLigue} dans le magasin : ni moyenne du championnat, ni fréquence des équipes, ni estimation pour ce match.`
    );
  }
  const equipe = (nom, id, f, lieu) => {
    if (!f?.n) {
      if (!id) return absent('club non reconnu', `${nom} n'est pas reconnu dans le magasin FotMob : pas de fréquence pour lui, l'estimation prend la moyenne du championnat (${pct(c.leagueRate)}).`);
      return absent('aucun match', `${nom} n'a joué aucun match ${lieu} cette saison dans le magasin : l'estimation prend pour lui la moyenne du championnat (${pct(c.leagueRate)}).`);
    }
    return {
      texte: `${f.hits}/${f.n}`,
      titre: `${nom} ${lieu} cette saison : ${pluriel(f.hits, 'match')} sur ${f.n} avec « ${libelle} » (${pct(f.rate)}). Ramené vers la moyenne du championnat : ${pct(f.shrunk)}.`
    };
  };
  const detail = (nom, f, lieu) => (f?.n ? `${nom} ${lieu} : ${f.hits}/${f.n} → ${pct(f.shrunk)}` : `${nom} ${lieu} : aucun match, donc la moyenne (${pct(f?.shrunk ?? c.leagueRate)})`);
  return {
    ligue: {
      texte: pct(c.leagueRate),
      titre: `« ${libelle} » dans ${nomLigue} cette saison : ${pct(c.leagueRate)} sur ${pluriel(c.leagueMatches, 'match')} joué${c.leagueMatches > 1 ? 's' : ''}.`
    },
    dom: equipe(m.home, m.homeId, c.home, 'à domicile'),
    ext: equipe(m.away, m.awayId, c.away, "à l'extérieur"),
    estimation: {
      texte: pct(c.combined),
      titre: `Estimation : la moyenne des deux équipes, chacune ramenée vers la moyenne du championnat (${pct(c.leagueRate)}) — chaque équipe compte comme si elle avait joué ${prior ?? 'quelques'} matchs de plus à cette moyenne, si bien qu'un 5 sur 5 ne passe plus devant un 30 sur 38. ${detail(m.home, c.home, 'à domicile')} ; ${detail(m.away, c.away, "à l'extérieur")}.`
    }
  };
}

/** Une ligne du tableau, toute prête pour le gabarit (présentation seulement). */
function vueDeLigne(m, k, rang, libelle, prior) {
  const fav = {
    home: favoris.isFavoriteTeam(m.home, m.league, m.homeId ?? undefined),
    away: favoris.isFavoriteTeam(m.away, m.league, m.awayId ?? undefined),
    ligue: favoris.isFavoriteLeague(m.league)
  };
  return {
    cle: m.matchId ?? `${m.home}|${m.away}|${m.commenceTime}`,
    rang,
    m,
    lien: `/match-a-venir/${encodeURIComponent(m.matchId)}`,
    quand: quandDuMatch(m),
    fav: { ...fav, ligne: fav.home || fav.away || fav.ligue },
    moteur: celluleMoteur(m, k, libelle),
    marche: celluleMarche(m, k, libelle),
    ecart: celluleEcart(k),
    cote: celluleCote(m, k, libelle),
    // Ce que ValueBadge lit (la couleur d'avant, `cote.classe`, n'est plus lue : c'est la pastille qui décide du vert).
    // `bestOdds` n'existe que si le serveur a trouvé une cote chez UN DE VOS bookmakers (estJouable, valueFinder.js).
    valeurBrute: { pourcent: k.edgePct ?? null, cote: k.bestOdds ?? null, jouable: k.bestOdds != null },
    // Étape 7 : l'heure de cette cote (archives des relevés The Odds API) et sa fraîcheur jugée par le serveur ;
    // la pastille la réévalue à l'horloge (une cote trop vieille n'est plus verte : « à rafraîchir »).
    fraicheur: k.bestOdds != null ? (k.freshness ?? null) : null,
    // Étape 8 : le verdict du moteur sur cette issue (findValueBet, « juge et partie » compris) — il décide seul du vert.
    verdict: k.verdict ?? null,
    contexte: celluleContexte(m, k, libelle, prior)
  };
}

const lignes = computed(() => {
  const cle = marche.value;
  const rangees = [];
  for (const m of matchsVisibles.value) {
    const k = (m.markets ?? []).find((x) => x.key === cle);
    if (!k) continue;
    if (seulementAvecMarche.value && k.marketProb == null) continue;
    rangees.push({ m, k });
  }
  const valeur = { engine: (r) => r.k.engineProb, gap: (r) => r.k.gapPoints, edge: (r) => r.k.edgePct }[tri.value] ?? ((r) => r.k.engineProb);
  rangees.sort(
    (a, b) => decroissant(valeur(a), valeur(b)) || decroissant(a.k.engineProb, b.k.engineProb) || String(a.m.commenceTime).localeCompare(String(b.m.commenceTime))
  );
  const libelle = libelleMarche.value;
  const prior = donnees.value?.priorMatches ?? null;
  return rangees.map(({ m, k }, i) => vueDeLigne(m, k, i + 1, libelle, prior));
});

/** Les lignes que le filtre « Seulement avec une cote du marché » cache. */
const masquees = computed(() => (seulementAvecMarche.value ? matchsVisibles.value.filter((m) => (m.markets ?? []).find((x) => x.key === marche.value)?.marketProb == null).length : 0));

const sousTitreTableau = computed(() => {
  const morceaux = [`${pluriel(lignes.value.length, 'match')} · trié par ${TRIS[tri.value]?.toLowerCase() ?? tri.value}`];
  if (masquees.value) morceaux.push(`${pluriel(masquees.value, 'match')} sans cote du marché ${masquees.value > 1 ? 'masqués' : 'masqué'}`);
  return morceaux.join(' · ');
});

const entetes = computed(() => {
  const l = libelleMarche.value;
  const prior = donnees.value?.priorMatches;
  return {
    moteur: `Probabilité du moteur CôteMaster pour « ${l} » : modèle de buts nourri par le magasin FotMob, sans repli payant. Cliquer pour trier.`,
    marche: "Probabilité juste des cotes relevées gratuitement (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets), marge retirée par la méthode puissance : la moyenne des bookmakers, à défaut les bourses pondérées par l'argent échangé. Référence seulement.",
    ecart: `Moteur moins marché, en points de probabilité : en vert, le moteur croit davantage à « ${l} » que le marché ; en rouge, moins. Cliquer pour trier.`,
    cote: `1 / N / 2 seulement : la meilleure cote du relevé The Odds API (hors cotes gratuites de référence) et la valeur que le moteur y voit (probabilité × cote − 1).${en1N2.value ? ' Cliquer pour trier.' : ''}`,
    ligue: `Fréquence de « ${l} » sur les matchs joués de la saison en cours, dans ce championnat.`,
    dom: `L'équipe qui reçoit, à domicile cette saison : ses matchs avec « ${l} » sur ses matchs à domicile.`,
    ext: `L'équipe qui se déplace, à l'extérieur cette saison : ses matchs avec « ${l} » sur ses matchs à l'extérieur.`,
    estimation: `Les deux équipes ensemble, chacune ramenée vers la moyenne du championnat : chaque équipe compte comme si elle avait joué ${prior ?? 'quelques'} matchs de plus à cette moyenne.`
  };
});

// ------------------------------------------------------- ce qui manque
// Compté sur les matchs retenus par la compétition et la période (avant le
// filtre « Seulement avec une cote du marché », qui en cache justement).
const manques = computed(() => {
  const liste = matchsVisibles.value;
  const cle = marche.value;
  const duMarche = (m) => (m.markets ?? []).find((x) => x.key === cle) ?? null;
  const sansAucuneCote = liste.filter((m) => (m.markets ?? []).every((x) => x.marketProb == null));
  const clubs = new Map();
  for (const m of sansAucuneCote) {
    if (!m.homeId) clubs.set(`${m.league}|${m.home}`, { nom: m.home, league: m.league });
    if (!m.awayId) clubs.set(`${m.league}|${m.away}`, { nom: m.away, league: m.league });
  }
  const sansContexte = liste.filter((m) => !duMarche(m)?.context);
  return {
    total: liste.length,
    sansAucuneCote: sansAucuneCote.length,
    avecClubInconnu: sansAucuneCote.filter((m) => !m.homeId || !m.awayId).length,
    clubsInconnus: [...clubs.values()],
    sansCeMarche: liste.filter((m) => !(m.markets ?? []).every((x) => x.marketProb == null) && duMarche(m)?.marketProb == null).length,
    sansMoteur: liste.filter((m) => duMarche(m)?.engineProb == null).length,
    sansContexte: sansContexte.length,
    liguesSansContexte: [...new Set(sansContexte.map((m) => m.league).filter(Boolean))]
  };
});
const echecs = computed(() => donnees.value?.failures ?? []);
const echecsOuverts = ref(false);
const CLUBS_AFFICHES = 8;
const avecManques = computed(() => {
  const g = manques.value;
  return Boolean(g.sansAucuneCote || g.sansCeMarche || g.sansMoteur || g.sansContexte || echecs.value.length);
});
/** Les deux clubs d'un échec (« Arsenal – Leeds United »), pour leurs logos. */
const clubsDe = (label) => String(label ?? '').split(' – ');

const descriptionVide = computed(() => {
  const pistes = [];
  if (periode.value !== '7') pistes.push('choisissez « 7 prochains jours »');
  if (competition.value) pistes.push('revenez à « Toutes les compétitions »');
  if (seulementAvecMarche.value) pistes.push('désactivez « Seulement avec une cote du marché »');
  const debut = `Aucun match à venir ne correspond à ces filtres pour « ${libelleMarche.value} ».`;
  return pistes.length ? `${debut} Pour en voir davantage : ${pistes.join(', ')}.` : debut;
});
</script>

<template>
  <div class="screener cm-page">
    <!-- Le bandeau : ce qu'on regarde, le calcul affiché, et les commandes. -->
    <section class="cm-hero screener__hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="target" :size="18" /></span>
          Repérage
        </h2>
        <div class="screener__hero-side">
          <span class="cm-hero__chips">
            <span v-if="donnees" class="cm-chip is-section" title="Matchs du tableau, avec les filtres en cours">
              <AppIcon name="matches" :size="11" />
              {{ pluriel(lignes.length, 'match') }}
              <span v-if="lignes.length !== tousLesMatchs.length" class="screener__of">sur {{ nombre(tousLesMatchs.length) }}</span>
            </span>
            <span v-if="donnees" class="cm-chip" title="Le calcul couvre les matchs à venir de la page Matchs sur cette durée">
              <AppIcon name="calendar" :size="11" />{{ donnees.days }} prochains jours
            </span>
            <!-- Le prochain coup d'envoi de la liste : le compte à rebours du bandeau (le tableau, lui, garde la date et l'heure de chaque match). -->
            <span v-if="prochainMatch" class="cm-chip screener__next" :title="`Premier coup d'envoi parmi les matchs affichés : ${prochainMatch.home} – ${prochainMatch.away}.`">
              Prochain match
              <span class="screener__next-names cm-truncate">{{ prochainMatch.home }} – {{ prochainMatch.away }}</span>
              <KickoffCountdown :coup-d-envoi="prochainMatch.commenceTime" :heure-sure="true" variante="texte" />
            </span>
            <!-- La confiance « sûr / fragile » : le moteur ne la mesure pas encore, la puce le dit (étape 38 du plan). -->
            <span v-if="donnees" class="screener__confidence">
              <ConfidenceGauge variante="puce" :valeur="null" />
              <HelpTip terme="sur-fragile" />
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
        Les matchs à venir classés par marché : la probabilité du moteur, la cote du marché et ce que dit la saison.
      </p>

      <!-- D'où viennent les chiffres de chaque colonne : le fournisseur réel et l'heure de son relevé. -->
      <div v-if="donnees" class="screener__sources">
        <span v-if="calcul" class="screener__source">
          <span class="screener__source-for">Moteur et saison</span>
          <ProvenanceChip
            source="Moteur CôteMaster · magasin FotMob et cotes relevées"
            action="calculé"
            :releve-le="donnees.generatedAt"
            :fichier="provenanceMoteur.fichier"
            :vieux-apres-heures="1"
            :detail="calcul.titre"
          >
            <template #quand="{ ancien, ilYA }">{{ calcul.texte }}<template v-if="ancien"> · {{ ilYA }}</template></template>
          </ProvenanceChip>
        </span>
        <span class="screener__source">
          <span class="screener__source-for">Marché</span>
          <span v-if="provenanceMarche.vide" class="cm-chip is-warning" title="La base locale ne garde encore aucune cote relevée gratuitement : la colonne Marché est vide tant que l'actualisation automatique n'en a pas relevé.">
            <AppIcon name="alert" :size="11" />Aucune cote gratuite relevée sur ce PC
          </span>
          <ProvenanceChip v-else :source="provenanceMarche.source" :releve-le="provenanceMarche.releveLe" :fichier="provenanceMarche.fichier" />
        </span>
        <span class="screener__source">
          <span class="screener__source-for">Cote jouable</span>
          <ProvenanceChip source="The Odds API" :releve-le="provenanceJouable.releveLe" :fichier="provenanceJouable.fichier" payant />
        </span>
      </div>

      <div v-if="donnees" class="cm-toolbar screener__toolbar">
        <AppSelect v-model="marche" label="Marché" :options="marcheOptions" :searchable="false" class="screener__field-market" />
        <AppSelect v-model="competition" label="Compétition" :options="competitionOptions" class="screener__field-league" />
        <AppSelect v-model="periode" label="Période" :options="periodeOptions" />
        <AppSelect v-model="tri" label="Trier par" :options="triOptions" class="screener__field-sort" />
        <div class="screener__toggle" title="Cache les matchs sans probabilité du marché pour le marché choisi (leur nombre reste dit dans « Ce qui manque »)">
          <AppToggle v-model="seulementAvecMarche" label="Seulement avec une cote du marché" />
        </div>
      </div>
    </section>

    <!-- Première lecture, serveur injoignable, calcul en échec sans tableau. -->
    <LoadingSpinner v-if="!reponse && lecture.enCours" label="Lecture du repérage…" />
    <EmptyState
      v-else-if="!donnees && lecture.erreur"
      icon="alert"
      title="Repérage indisponible"
      :description="`${lecture.erreur} Vérifiez que CôteMaster tourne, puis réessayez.`"
    >
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
      title="Le calcul du repérage a échoué"
      :description="`${reponse.error ?? 'Erreur inconnue.'} Relancez le calcul ; si l'échec revient, relancez CôteMaster (demarrer-cotemaster.bat).`"
    >
      <template #action>
        <AppButton variant="secondary" size="sm" @click="recalculer">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Recalculer
        </AppButton>
      </template>
    </EmptyState>

    <!-- Premier calcul : rien à montrer encore, seulement l'avancement. -->
    <AppCard
      v-else-if="enCalcul && !donnees"
      icon="cpu"
      eyebrow="Calcul en cours"
      title="Le moteur passe en revue les matchs de la semaine"
      subtitle="Chaque match à venir des 7 prochains jours, sans repli payant (magasin FotMob seulement) : comptez une à deux minutes. L'écran se met à jour tout seul."
    >
      <div class="screener__progress">
        <span class="cm-bar screener__bar"><span class="cm-bar__fill" :style="{ width: `${avancement?.pct ?? 0}%` }" /></span>
        <span class="screener__progress-text cm-numeric">{{ texteAvancement }}</span>
      </div>
    </AppCard>

    <template v-else-if="donnees">
      <!-- Recalcul en cours : le tableau précédent reste affiché. -->
      <div v-if="enCalcul" class="cm-note is-info screener__note">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="cpu" :size="14" /></span>
        <div class="screener__note-body">
          <p class="cm-note__title">Recalcul en cours</p>
          <p class="cm-note__text">
            {{ texteAvancement }}. Le tableau ci-dessous reste celui du calcul précédent<template v-if="calcul"> ({{ calcul.texte.toLowerCase() }})</template> jusqu'à la fin.
          </p>
          <span class="cm-bar screener__bar"><span class="cm-bar__fill" :style="{ width: `${avancement?.pct ?? 0}%` }" /></span>
        </div>
      </div>

      <div v-if="erreurCalcul" class="cm-note is-danger screener__note">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="screener__note-body">
          <p class="cm-note__title">Le dernier calcul a échoué</p>
          <p class="cm-note__text">{{ erreurCalcul }} — le tableau affiché est celui du calcul précédent<template v-if="calcul"> ({{ calcul.texte.toLowerCase() }})</template>.</p>
        </div>
      </div>

      <div v-if="lecture.erreur" class="cm-note is-danger screener__note">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div class="screener__note-body">
          <p class="cm-note__title">Le serveur ne répond plus</p>
          <p class="cm-note__text">{{ lecture.erreur }} Le tableau affiché est le dernier reçu.</p>
          <AppButton variant="secondary" size="sm" class="screener__retry" @click="lire()">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Réessayer
          </AppButton>
        </div>
      </div>

      <EmptyState
        v-if="!tousLesMatchs.length"
        icon="matches"
        title="Aucun match à venir à classer"
        :description="`Le repérage part des matchs de la page Matchs des ${donnees.days} prochains jours (relevé The Odds API et calendrier FotMob) : il n'y en a aucun pour l'instant. Recalculez après la prochaine actualisation du calendrier ou un nouveau relevé de cotes.`"
      >
        <template #action>
          <AppButton variant="secondary" size="sm" :loading="enCalcul" @click="recalculer">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Recalculer
          </AppButton>
        </template>
      </EmptyState>

      <template v-else>
        <!-- Ce qui manque, dit en clair : jamais une absence tue. -->
        <div v-if="avecManques" class="cm-note is-warning screener__note">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
          <div class="screener__note-body">
            <p class="cm-note__title">Ce qui manque</p>
            <ul class="screener__gaps">
              <li v-if="manques.sansAucuneCote">
                <strong>{{ pluriel(manques.sansAucuneCote, 'match') }} sur {{ nombre(manques.total) }}</strong>
                {{ manques.sansAucuneCote > 1 ? "n'ont" : "n'a" }} aucune cote du marché : aucune source gratuite ne les couvre encore, ou leurs cotes ne sont pas publiées (les petits championnats ne sont souvent cotés que la veille ou le jour du match).
                <template v-if="seulementAvecMarche">Ils sont masqués par « Seulement avec une cote du marché ».</template>
                <span v-if="manques.avecClubInconnu" class="screener__gaps-detail">
                  Pour {{ manques.avecClubInconnu }} d'entre eux, un club n'est pas reconnu dans le magasin FotMob, et leurs cotes ne peuvent pas être rattachées :
                  <span v-for="club in manques.clubsInconnus.slice(0, CLUBS_AFFICHES)" :key="`${club.league}|${club.nom}`" class="screener__club">
                    <TeamCrest :name="club.nom" :league="club.league" :size="14" />{{ club.nom }}
                  </span>
                  <template v-if="manques.clubsInconnus.length > CLUBS_AFFICHES"> et {{ manques.clubsInconnus.length - CLUBS_AFFICHES }} autre(s).</template>
                </span>
              </li>
              <li v-if="manques.sansCeMarche">
                <strong>{{ pluriel(manques.sansCeMarche, 'autre match', 'autres matchs') }}</strong>
                {{ manques.sansCeMarche > 1 ? 'ont' : 'a' }} des cotes, mais aucune de nos sources ne cote « {{ libelleMarche }} ».
              </li>
              <li v-if="manques.sansMoteur">
                <strong>{{ pluriel(manques.sansMoteur, 'match') }}</strong> sans probabilité du moteur pour « {{ libelleMarche }} ».
              </li>
              <li v-if="manques.sansContexte">
                <strong>{{ pluriel(manques.sansContexte, 'match') }}</strong> sans contexte de saison : aucune rencontre jouée de la saison en cours au magasin pour
                <span v-for="ligue in manques.liguesSansContexte" :key="ligue" class="screener__league-chip"><LeagueBadge :league="ligue" /></span>
              </li>
              <li v-if="echecs.length">
                <strong>{{ pluriel(echecs.length, 'match') }}</strong> que le moteur n'a pas pu calculer : {{ echecs.length > 1 ? 'ils sont absents' : 'il est absent' }} du tableau.
                <button type="button" class="cm-link screener__failures-toggle" :aria-expanded="echecsOuverts" @click="echecsOuverts = !echecsOuverts">
                  {{ echecsOuverts ? 'Masquer le détail' : 'Voir le détail' }}
                  <AppIcon name="chevronDown" :size="12" class="screener__caret" :class="{ 'is-open': echecsOuverts }" />
                </button>
                <ul v-if="echecsOuverts" class="screener__failures">
                  <li v-for="e in echecs" :key="e.matchId ?? e.label">
                    <span class="screener__failure-match">
                      <template v-for="(club, i) in clubsDe(e.label)" :key="i">
                        <span v-if="i" class="cm-text-muted">–</span>
                        <TeamCrest :name="club" :size="14" />{{ club }}
                      </template>
                    </span>
                    <span class="cm-text-muted">{{ e.error }}</span>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>

        <EmptyState v-if="!lignes.length" icon="filter" title="Aucun match avec ces filtres" :description="descriptionVide" />

        <!-- LE CLASSEMENT : un match par ligne, le marché choisi en colonnes. -->
        <AppCard v-else icon="list" :eyebrow="libelleMarche" title="Classement des matchs" :subtitle="sousTitreTableau">
          <template #actions>
            <span class="cm-chip is-section" :title="`Trié par ${TRIS[tri]}`"><AppIcon name="chevronDown" :size="11" />Tri : {{ TRIS[tri] }}</span>
          </template>

          <div class="screener__body">
            <div class="cm-table-wrap screener__wrap">
              <table class="cm-table screener__table">
                <thead>
                  <tr>
                    <th class="is-center screener__rank" title="Rang dans le tri choisi">#</th>
                    <th class="is-left" title="Coup d'envoi, compétition et les deux clubs ; un clic ouvre la page du match">Match</th>
                    <th class="screener__sortable" :class="{ 'is-sorted': tri === 'engine' }" :title="entetes.moteur" @click="trierPar('engine')">Moteur<HelpTip terme="cote-juste" /></th>
                    <th :title="entetes.marche">Marché</th>
                    <th class="screener__sortable" :class="{ 'is-sorted': tri === 'gap' }" :title="entetes.ecart" @click="trierPar('gap')">Écart</th>
                    <th :class="{ 'screener__sortable': en1N2, 'is-sorted': tri === 'edge' }" :title="entetes.cote" @click="trierPar('edge')">Cote jouable<HelpTip terme="value" /></th>
                    <th :title="entetes.ligue">Championnat</th>
                    <th :title="entetes.dom">Domicile</th>
                    <th :title="entetes.ext">Extérieur</th>
                    <th :title="entetes.estimation">Estimation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in lignes" :key="r.cle" :class="{ 'is-favorite': r.fav.ligne }">
                    <td class="is-center screener__rank cm-numeric">{{ r.rang }}</td>

                    <!-- Le match : quand, où, et les deux clubs (lien vers sa page). -->
                    <td class="is-left screener__match">
                      <div class="screener__when">
                        <span class="screener__day cm-numeric" :title="r.quand.titre">
                          {{ r.quand.jour }}<template v-if="r.quand.heure"> · {{ r.quand.heure }}</template>
                        </span>
                        <span v-if="!r.quand.heure" class="screener__unsure" :title="r.quand.titre">heure à confirmer</span>
                        <span v-if="!competition" class="screener__league" :title="r.m.league"><LeagueBadge :league="r.m.league" /></span>
                        <FavoriteStar v-if="r.fav.ligue" active :interactive="false" kind="league" :label="r.m.league" :size="11" />
                      </div>
                      <RouterLink :to="r.lien" class="screener__teams" :title="`Ouvrir la page du match ${r.m.home} – ${r.m.away}`">
                        <span class="screener__team">
                          <TeamCrest :name="r.m.home" :league="r.m.league" :team-id="r.m.homeId ?? null" :size="20" />
                          <span class="cm-truncate">{{ r.m.home }}</span>
                          <FavoriteStar v-if="r.fav.home" active :interactive="false" :label="r.m.home" :size="11" />
                        </span>
                        <span class="screener__vs">–</span>
                        <span class="screener__team">
                          <TeamCrest :name="r.m.away" :league="r.m.league" :team-id="r.m.awayId ?? null" :size="20" />
                          <span class="cm-truncate">{{ r.m.away }}</span>
                          <FavoriteStar v-if="r.fav.away" active :interactive="false" :label="r.m.away" :size="11" />
                        </span>
                      </RouterLink>
                    </td>

                    <td class="cm-numeric" :class="{ 'is-sorted': tri === 'engine' }" :title="r.moteur.titre">
                      <span v-if="r.moteur.absent" class="screener__absent">{{ r.moteur.texte }}</span>
                      <template v-else>
                        <strong class="screener__prob">{{ r.moteur.texte }}</strong>
                        <small class="screener__sub">{{ r.moteur.sous }}</small>
                      </template>
                    </td>

                    <td class="cm-numeric" :title="r.marche.titre">
                      <span v-if="r.marche.absent" class="screener__absent">{{ r.marche.texte }}</span>
                      <template v-else>
                        <span class="screener__value">{{ r.marche.texte }}</span>
                        <small class="screener__sub is-wrap">
                          <span v-if="r.marche.bourses" class="cm-chip is-info screener__chip">bourses seulement</span>
                          {{ r.marche.sous }}
                        </small>
                      </template>
                    </td>

                    <!-- L'écart moteur – marché : un signe et un gras, jamais le vert (réservé à une vraie value). -->
                    <td class="cm-numeric" :class="[r.ecart.absent ? '' : sensDeLEcart(r.ecart.classe), { 'is-sorted': tri === 'gap' }]" :title="r.ecart.titre">
                      <span v-if="r.ecart.absent" class="screener__absent">{{ r.ecart.texte }}</span>
                      <strong v-else>{{ r.ecart.texte }}</strong>
                    </td>

                    <td class="cm-numeric" :class="{ 'is-sorted': tri === 'edge' }" :title="r.cote.titre">
                      <span v-if="r.cote.absent" class="screener__absent">{{ r.cote.texte }}</span>
                      <template v-else>
                        <span class="screener__odds">{{ r.cote.texte }}</span>
                        <span class="screener__book">{{ r.cote.livre }}</span>
                        <!-- Verte seulement pour une vraie value chez l'un de vos bookmakers (ValueBadge). -->
                        <span class="screener__badge">
                          <ValueBadge
                            taille="sm"
                            :pourcent="r.valeurBrute.pourcent"
                            :cote="r.valeurBrute.cote"
                            :jouable="r.valeurBrute.jouable"
                            :regle="regleValue"
                            :fraicheur="r.fraicheur"
                            :verdict="r.verdict"
                            :bookmaker="r.cote.livre"
                            precision="Le Repérage ne voit pas si ce bookmaker a lui-même fixé la cote juste du match (le moteur l'écarte alors) : la page du match le vérifie."
                          >{{ r.cote.valeur }}</ValueBadge>
                        </span>
                        <!-- Étape 8 : un bookmaker « juge et partie » qui paie davantage, écarté par le moteur — dit. -->
                        <small v-if="r.cote.juge" class="screener__sub screener__judge">{{ r.cote.juge }}</small>
                      </template>
                    </td>

                    <!-- Ce que dit la saison ; sans saison au magasin, une seule case qui le dit. -->
                    <td v-if="r.contexte.absent" colspan="4" class="is-center" :title="r.contexte.titre">
                      <span class="screener__absent is-wide">{{ r.contexte.texte }}</span>
                    </td>
                    <template v-else>
                      <td class="cm-numeric screener__context" :title="r.contexte.ligue.titre">{{ r.contexte.ligue.texte }}</td>
                      <td class="cm-numeric screener__context" :title="r.contexte.dom.titre">
                        <span v-if="r.contexte.dom.absent" class="screener__absent">{{ r.contexte.dom.texte }}</span>
                        <template v-else>{{ r.contexte.dom.texte }}</template>
                      </td>
                      <td class="cm-numeric screener__context" :title="r.contexte.ext.titre">
                        <span v-if="r.contexte.ext.absent" class="screener__absent">{{ r.contexte.ext.texte }}</span>
                        <template v-else>{{ r.contexte.ext.texte }}</template>
                      </td>
                      <td class="cm-numeric screener__estimate" :title="r.contexte.estimation.titre">{{ r.contexte.estimation.texte }}</td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Comment lire l'écran. -->
            <div class="cm-note is-info screener__note">
              <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
              <div class="screener__note-body">
                <p class="cm-note__title">Lecture</p>
                <p class="cm-note__text screener__reading">
                  Chaque ligne est un match à venir, classé par la probabilité que le moteur donne à « {{ libelleMarche }} » ; à côté, la probabilité juste du marché (marge retirée) et l'écart entre les deux.
                  À droite, ce que dit la saison : la fréquence du championnat, celle de chaque équipe à domicile ou à l'extérieur avec son nombre de matchs, et une estimation ramenée vers la moyenne ({{ donnees.priorMatches }} matchs fictifs à la moyenne du championnat par équipe).
                  Les cotes du marché viennent de sources gratuites (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) et ne sont qu'une référence : seuls les bookmakers français sont jouables depuis la France.
                  Le vert n'apparaît que pour une vraie value : une cote de l'un de vos bookmakers au-dessus du seuil du moteur (Réglages) ; tout le reste reste neutre.
                  Survolez une case pour le détail ou la raison d'une absence.
                </p>
              </div>
            </div>
          </div>
        </AppCard>
      </template>
    </template>
  </div>
</template>

<style scoped>
.screener {
  /* Se règle sur SA largeur : l'onglet vit dans la page Matchs, large ou non. */
  container: screener / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.screener__hero {
  gap: 16px;
}

.screener__hero-side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

/* « 40 matchs sur 361 » : le total en retrait dans la puce. */
.screener__of {
  font-weight: 500;
  opacity: 0.75;
}

/* D'où viennent les chiffres : une pastille de provenance par colonne, avec son étiquette. */
.screener__sources {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 14px;
}

.screener__source {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
}

.screener__source-for {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* La puce « confiance » et sa bulle d'aide restent ensemble sur la même ligne. */
.screener__confidence {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.screener__confidence > :first-child {
  min-width: 0;
}

/* Le prochain match : les deux clubs (tronqués s'ils sont longs, entiers au survol) puis le compte à rebours. */
.screener__next {
  max-width: 100%;
}

.screener__next-names {
  min-width: 0;
  max-width: 260px;
  color: var(--cm-text-primary);
  font-weight: 700;
}

/* La pastille de value sous la cote, sur sa propre ligne. */
.screener__badge {
  display: block;
  margin-top: 3px;
}

/* Les commandes se partagent la largeur ; le marché et la compétition un peu plus. */
.screener__toolbar > * {
  flex: 1 1 160px;
}

.screener__toolbar > .screener__field-market,
.screener__toolbar > .screener__field-league,
.screener__toolbar > .screener__field-sort {
  flex: 1.3 1 190px;
}

/* Assez large pour garder son libellé sur une ligne. */
.screener__toolbar > .screener__toggle {
  flex: 1.6 1 330px;
}

/* L'interrupteur, à la hauteur des champs voisins pour s'aligner sur eux. */
.screener__toggle {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 6px 12px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
}

.screener__toggle > * {
  flex: 1;
}

/* ----------------------------------------------------- avancement, notes */
.screener__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.screener__bar {
  height: 6px;
}

.screener__progress-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.screener__note-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.screener__note-body .cm-note__title,
.screener__note-body .cm-note__text {
  margin: 0;
}

.screener__retry {
  align-self: flex-start;
}

.screener__gaps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.screener__gaps strong {
  color: var(--cm-text-primary);
}

.screener__gaps-detail {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.screener__club {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 8px 0 2px;
  color: var(--cm-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.screener__league-chip {
  display: inline-flex;
  max-width: 220px;
  margin: 2px 6px 0 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-hover);
  vertical-align: middle;
}

.screener__failures-toggle {
  margin-left: 6px;
}

.screener__caret {
  transition: transform var(--cm-transition);
}

.screener__caret.is-open {
  transform: rotate(180deg);
}

.screener__failures {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0 0 0 4px;
  list-style: none;
  font-size: 12px;
}

.screener__failures li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
}

.screener__failure-match {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

/* ------------------------------------------------------------ tableau */
.screener__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* L'en-tête reste visible sur des centaines de lignes. */
.screener__wrap {
  max-height: 72vh;
  overflow: auto;
}

.screener__table th,
.screener__table td {
  padding: 8px;
}

/* Le rang : gris, centré (la règle commune aligne la première colonne à gauche). */
.screener__table th.screener__rank,
.screener__table td.screener__rank {
  width: 40px;
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* En-tête de tri : cliquable, la colonne choisie en couleur de section avec son filet. */
.screener__sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--cm-transition), background var(--cm-transition);
}

.screener__sortable:hover {
  color: var(--cm-text-primary);
  background: var(--cm-surface-hover);
}

.screener__table th.is-sorted {
  color: var(--cm-section);
  box-shadow: inset 0 -2px 0 var(--cm-section);
}

/* La colonne de tri se lit d'un coup d'œil ; en image de fond, pour se
   superposer au fond doré d'une ligne favorite au lieu de le remplacer. */
.screener__table td.is-sorted {
  background-image: linear-gradient(rgba(var(--cm-section-rgb) / 0.06), rgba(var(--cm-section-rgb) / 0.06));
}

/* La probabilité du moteur reste en texte plein, même triée (elle était en couleur de section) : dans Matchs cette
   couleur est un émeraude proche du vert de la value, et un pourcentage n'est pas une value. La colonne triée se lit
   à son fond et à son en-tête. */
/* Un club ou une compétition favorite (03/10/2026) : la ligne légèrement
   dorée, l'ordre du classement ne change pas. */
.screener__table tr.is-favorite > td {
  background-color: rgba(var(--cm-gold-rgb) / 0.07);
}

.screener__match {
  min-width: 240px;
}

/* 268 px au plus : à 1 440 px d'écran, le tableau tient alors dans sa carte
   et la colonne Estimation reste visible sans défiler (mesuré le 04/10/2026 :
   1 171 px pour 1 084 avec 360 px). Les noms longs se tronquent, en entier
   au survol. */
.screener__when {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 268px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.screener__day {
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.screener__unsure {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border-strong);
  font-size: 10px;
  font-weight: 600;
  color: var(--cm-text-muted);
  white-space: nowrap;
  cursor: help;
}

.screener__league {
  display: inline-flex;
  min-width: 0;
  max-width: 170px;
}

.screener__teams {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 268px;
  margin-top: 5px;
  color: var(--cm-text-primary);
  font-weight: 700;
  text-decoration: none;
  transition: color var(--cm-transition);
}

.screener__teams:hover {
  color: var(--cm-section);
}

.screener__teams:hover .cm-truncate {
  text-decoration: underline;
}

.screener__team {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.screener__vs {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  font-weight: 500;
}

.screener__prob {
  font-size: 14px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

.screener__value,
.screener__odds {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.screener__book {
  margin-left: 5px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

/* La précision sous un chiffre : cote juste, nombre de bookmakers, valeur. */
.screener__sub {
  display: block;
  margin-top: 1px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* L'écart moteur – marché : une direction, pas un verdict. Le signe la dit ; le vert
   et le rouge sont réservés (value réelle, résultat), ils ne colorent plus cette colonne. */
.screener__table td.is-up strong {
  color: var(--cm-text-primary);
}

.screener__table td.is-down strong {
  color: var(--cm-text-secondary);
}

.screener__sub.is-wrap {
  white-space: normal;
}

/* Étape 8 : le bookmaker « juge et partie » écarté par le moteur, en retrait sous la pastille. */
.screener__judge {
  font-style: italic;
  white-space: normal;
}

.screener__chip {
  padding: 0 6px;
  font-size: 10px;
}

.screener__context {
  color: var(--cm-text-secondary);
}

.screener__estimate {
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Une absence : dite en clair, la raison au survol (souligné pointillé).
   Elle passe à la ligne au besoin : sans cela, les raisons les plus longues
   (« pas de relevé The Odds API ») poussaient la colonne Estimation hors du
   cadre dès 1 440 px d'écran. */
.screener__absent {
  display: inline-block;
  max-width: 112px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  white-space: normal;
  color: var(--cm-text-muted);
  text-decoration: underline dotted var(--cm-border-strong);
  text-underline-offset: 3px;
  cursor: help;
}

.screener__absent.is-wide {
  max-width: none;
}

.screener__reading {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------ étroit */
@container screener (max-width: 760px) {
  .screener__hero {
    padding: 16px;
  }

  .screener__toolbar > *,
  .screener__toolbar > .screener__field-market,
  .screener__toolbar > .screener__field-league,
  .screener__toolbar > .screener__field-sort,
  .screener__toolbar > .screener__toggle {
    flex: 1 1 calc(50% - 6px);
  }

  .screener__table th,
  .screener__table td {
    padding: 7px 8px;
  }

  .screener__match {
    min-width: 210px;
  }
}

@container screener (max-width: 480px) {
  .screener__toolbar > *,
  .screener__toolbar > .screener__field-market,
  .screener__toolbar > .screener__field-league,
  .screener__toolbar > .screener__field-sort,
  .screener__toolbar > .screener__toggle {
    flex-basis: 100%;
  }
}
</style>
