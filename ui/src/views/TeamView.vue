<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { useLineupPolling, compositionAttendue } from '@/composables/useLineupPolling.js';
import { matchesApi } from '@/services/matchesApi.js';
import { seasonCalendarApi } from '@/services/seasonCalendarApi.js';
import AppCard from '@/components/common/AppCard.vue';
import BackButton from '@/components/common/BackButton.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import MatchupHeader from '@/components/matches/MatchupHeader.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { aUneFiche } from '@/utils/playerVisuals.js';
import MatchStatBars from '@/components/matches/MatchStatBars.vue';
import MatchResultBadge from '@/components/matches/MatchResultBadge.vue';
import AiLineupSnapshot from '@/components/analysis/AiLineupSnapshot.vue';
import FixtureCard from '@/components/matches/FixtureCard.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import { rencontreVueParEquipe } from '@/utils/rencontres.js';
import { TEAM_STAT_GROUPS } from '@/constants/matchDetailTabs.js';

/**
 * Page d'une ÉQUIPE, construite comme celle d'un match (en-tête, onglets,
 * barres de statistiques) — demande de Pierre le 01/10/2026 : « ça aussi,
 * affiche-le de la même façon, avec une page ». Remplace le panneau latéral
 * « Statistiques — équipe ».
 *
 * Tout est gratuit : matchs, statistiques et joueurs lus dans le magasin
 * (FotMob), calendrier à venir lu dans le calendrier de saison (FotMob),
 * composition du prochain match relue chez FotMob. Le panneau
 * d'avant appelait API-Football (payant) à chaque ouverture pour l'historique
 * et les joueurs ; plus ici.
 */
const props = defineProps({
  name: { type: String, required: true },
  league: { type: String, default: null },
  matchId: { type: String, default: null } // match d'où vient le clic : sa composition
});

const matchesStore = useMatchesStore();
// Favoris (03/10/2026) : le bouton à côté du nom met le club en favori, par
// son identifiant FotMob (porté par ses matchs) plutôt que par son nom.
const favoris = useFavoritesStore();
const idClub = computed(() => matchs.value.list.find((m) => m.teams?.[0]?.teamId)?.teams[0].teamId ?? undefined);

const tab = ref('resume');
const matchs = ref({ loading: false, error: null, teamName: null, list: [] });
const joueurs = ref({ loading: false, error: null, seasonLabel: null, list: [] });
const calendrier = ref({ loading: false, error: null, total: 0, list: [] });
const matchDuClic = ref(null);
const compo = ref({ loading: false, error: null, data: null });

const nom = computed(() => matchs.value.teamName ?? props.name);
const ligue = computed(() => props.league ?? matchs.value.list[0]?.league ?? null);

const TABS = [
  { id: 'resume', label: 'Résumé' },
  { id: 'calendar', label: 'Calendrier' },
  { id: 'lineup', label: 'Composition' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'matches', label: 'Matchs' },
  { id: 'players', label: 'Joueurs' }
];
const availableTabs = computed(() => TABS.filter((t) => t.id !== 'lineup' || matchCompo.value));

// Moyennes par match sur les 10 derniers matchs relevés : l'équipe (premier
// camp de chaque rencontre, cf. listTeamMatchStats) face à ses adversaires.
const POURCENTAGES = new Set(['Ball Possession', 'Passes %']);
function moyennes(index) {
  const sommes = {};
  const nombres = {};
  const releves = matchs.value.list.filter((m) => Object.keys(m.teams?.[0]?.stats ?? {}).length).slice(0, 10);
  for (const m of releves) {
    for (const [cle, brut] of Object.entries(m.teams?.[index]?.stats ?? {})) {
      const n = Number(String(brut).replace('%', '').replace(',', '.'));
      if (!Number.isFinite(n)) continue;
      sommes[cle] = (sommes[cle] ?? 0) + n;
      nombres[cle] = (nombres[cle] ?? 0) + 1;
    }
  }
  return {
    echantillon: releves.length,
    valeurs: Object.fromEntries(
      Object.keys(sommes).map((cle) => {
        const moyenne = sommes[cle] / nombres[cle];
        return [cle, POURCENTAGES.has(cle) ? `${moyenne.toFixed(1)}%` : Number(moyenne.toFixed(2))];
      })
    )
  };
}
const pour = computed(() => moyennes(0));
const contre = computed(() => moyennes(1));

const forme = computed(() => matchs.value.list.slice(0, 5));

const POSTES = { Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Forward: 'Attaquant' };
const poste = (p) => POSTES[p] ?? p ?? '—';
const meilleurs = computed(() =>
  [...joueurs.value.list].filter((j) => j.goals || j.assists).sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals).slice(0, 5)
);

const nombre = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
// Calendrier à venir (demande de Pierre le 01/10/2026 ; présentation refaite
// le même jour, « plus joli et plus facile à voir » : cf. FixtureCard.vue).
// Reporté sans nouvelle date : à part, il n'a plus de jour.
const aReprogrammer = computed(() => calendrier.value.list.filter((f) => f.status === 'postponed'));
const aVenir = computed(() => calendrier.value.list.filter((f) => f.status !== 'postponed'));
// Le prochain match en grand, en tête de l'onglet ; les suivants par mois.
const prochainDuCalendrier = computed(() => aVenir.value[0] ?? null);
const calendrierParMois = computed(() => {
  const mois = [];
  for (const f of aVenir.value.slice(1)) {
    const instant = f.commenceTime ? new Date(f.commenceTime) : new Date(`${f.date}T12:00:00Z`);
    const libelle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', ...(f.commenceTime ? {} : { timeZone: 'UTC' }) }).format(instant);
    if (mois.at(-1)?.libelle !== libelle) mois.push({ libelle, matchs: [] });
    mois.at(-1).matchs.push(f);
  }
  return mois;
});
const prochainsMatchs = computed(() => aVenir.value.slice(0, 5));

// Un match joué de l'équipe au format de la carte de rencontre commune
// (domicile à gauche, score au centre, son résultat V/N/D) — 01/10/2026.
const rencontreJouee = (m) => rencontreVueParEquipe(m, nom.value);
const cleMatch = (f) => `${f.date}-${f.homeName}-${f.awayName}`;

// Le bouton est en bas du résumé : on remonte à l'en-tête de l'onglet.
function voirCalendrier() {
  tab.value = 'calendar';
  document.querySelector('.team')?.scrollIntoView({ block: 'start' });
}

const versMatch = (f) => ({ matchId: f.pageMatchId, home: f.homeName, away: f.awayName, league: f.league, commenceTime: f.commenceTime ?? `${f.date}T12:00:00Z` });
// Le vrai prochain match de l'équipe (calendrier) pour l'en-tête ; la
// composition, elle, suit le match d'où vient le clic quand il y en a un.
const prochainMatch = computed(() => {
  const f = aVenir.value.find((x) => x.pageMatchId);
  return f ? versMatch(f) : matchDuClic.value;
});
const matchCompo = computed(() => matchDuClic.value ?? prochainMatch.value);

// Le camp de l'équipe dans ce match, pour n'afficher que SES joueurs (01/10/2026 :
// « il n'y ait que les joueurs d'Arsenal ») : celui que le serveur a reconnu
// par identifiant dans le calendrier, sinon par le nom.
const comparable = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const coteEquipe = computed(() => {
  const m = matchCompo.value;
  if (!m) return null;
  const fixture = calendrier.value.list.find((f) => f.pageMatchId === m.matchId);
  if (fixture?.side) return fixture.side;
  const equipe = comparable(props.name);
  const ressemble = (nom) => {
    const c = comparable(nom);
    return Boolean(c) && (c === equipe || c.includes(equipe) || equipe.includes(c));
  };
  if (ressemble(m.home)) return 'home';
  if (ressemble(m.away)) return 'away';
  return null;
});

const quandProchain = computed(() => {
  const m = prochainMatch.value;
  if (!m?.commenceTime) return null;
  // Un match du calendrier ne connaît que son jour (daté à midi UTC).
  if (String(m.matchId).startsWith('cal-')) {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(m.commenceTime));
  }
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(m.commenceTime));
});

async function chargerMatchs() {
  matchs.value = { loading: true, error: null, teamName: null, list: [] };
  try {
    const r = await matchStatsApi.listByTeam(props.name, 20, props.league);
    matchs.value = { loading: false, error: null, teamName: r.teamName ?? null, list: r.matches ?? [] };
  } catch (error) {
    matchs.value = { loading: false, error: error.message, teamName: null, list: [] };
  }
}

async function chargerJoueurs() {
  if (!ligue.value) {
    joueurs.value = { loading: false, error: null, seasonLabel: null, list: [] };
    return;
  }
  joueurs.value = { loading: true, error: null, seasonLabel: null, list: [] };
  try {
    const { seasons } = await matchStatsApi.seasons(ligue.value);
    const saison = seasons?.[0] ?? null;
    if (!saison) {
      joueurs.value = { loading: false, error: null, seasonLabel: null, list: [] };
      return;
    }
    const options = { season: saison.season, team: props.name, minMinutes: 1, limit: 80 };
    const [champ, gardiens] = await Promise.all([
      matchStatsApi.players(ligue.value, { ...options, role: 'field' }),
      matchStatsApi.players(ligue.value, { ...options, role: 'goalkeeper' })
    ]);
    const list = [...(gardiens.players ?? []), ...(champ.players ?? [])].sort((a, b) => b.minutes - a.minutes);
    joueurs.value = { loading: false, error: null, seasonLabel: saison.label ?? String(saison.season), list };
  } catch (error) {
    joueurs.value = { loading: false, error: error.message, seasonLabel: null, list: [] };
  }
}

async function chargerCompo() {
  const m = matchCompo.value;
  if (!m) return;
  compo.value = { ...compo.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.preview({ home: m.home, away: m.away, league: m.league, commenceTime: m.commenceTime });
    compo.value = { loading: false, error: null, data };
  } catch (error) {
    compo.value = { loading: false, error: error.message, data: null };
  }
}

async function chargerMatchDuClic() {
  matchDuClic.value = null;
  if (!props.matchId) return;
  if (!matchesStore.matches.length) await matchesStore.fetchMatches().catch(() => {});
  // Un match du calendrier hors de la prochaine journée n'est pas dans la
  // liste : le serveur le retrouve. Un match déjà joué n'en a plus.
  matchDuClic.value =
    matchesStore.matches.find((m) => m.matchId === props.matchId) ??
    (await matchesApi.getById(props.matchId, matchesStore.source, matchesStore.bankroll).catch(() => null));
}

async function chargerCalendrier() {
  calendrier.value = { loading: true, error: null, total: 0, list: [] };
  try {
    const r = await seasonCalendarApi.team(props.name, { league: ligue.value, limit: 60 });
    calendrier.value = { loading: false, error: null, total: r.total ?? r.count ?? 0, list: r.matches ?? [] };
  } catch (error) {
    calendrier.value = { loading: false, error: error.message, total: 0, list: [] };
  }
}

async function load() {
  tab.value = 'resume';
  compo.value = { loading: false, error: null, data: null };
  await chargerMatchs();
  chargerJoueurs();
  chargerMatchDuClic();
  chargerCalendrier();
}

// Composition lue chez FotMob à l'ouverture de l'onglet seulement, et relue
// si le match visé change (calendrier puis match du clic arrivent à part).
watch(tab, (t) => {
  if (t === 'lineup' && !compo.value.data && !compo.value.loading && !compo.value.error) chargerCompo();
});
watch(
  () => matchCompo.value?.matchId,
  (id, avant) => {
    if (id === avant) return;
    compo.value = { loading: false, error: null, data: null };
    if (tab.value === 'lineup' && id) chargerCompo();
  }
);
// Composition pas encore publiée et coup d'envoi proche : relue toutes les
// 5 min tant que l'onglet est ouvert, elle remplace la dernière alignée.
useLineupPolling(
  () =>
    tab.value === 'lineup' &&
    Boolean(compo.value.data) &&
    !compo.value.data.lineups &&
    compositionAttendue(compo.value.data.kickoff ?? matchCompo.value?.commenceTime),
  () => {
    if (!compo.value.loading) chargerCompo();
  }
);

// Même composant d'une équipe à l'autre (la clé de vue est le nom de route) : on recharge.
watch(() => [props.name, props.league, props.matchId], load, { immediate: true });
</script>

<template>
  <div class="team cm-page">
    <BackButton fallback="/matches" />

    <!-- Le bandeau : le club (logo, nom, compétition, saison), sa forme et son
         prochain match d'un coup d'œil, puis les onglets de la page. -->
    <section class="cm-hero team__hero">
      <div class="team__identity">
        <span class="team__crest"><TeamCrest :name="nom" :league="ligue" :size="72" /></span>
        <div class="team__titles">
          <div class="team__title-row">
            <h2 class="cm-hero__title team__name">{{ nom }}</h2>
            <FavoriteStar
              variant="pill"
              :active="favoris.isFavoriteTeam(nom, ligue, idClub)"
              :label="nom"
              :size="14"
              @toggle="favoris.toggleTeam({ name: nom, league: ligue, id: idClub })"
            />
          </div>
          <div class="cm-hero__chips">
            <span v-if="ligue" class="cm-chip team__league"><LeagueBadge :league="ligue" /></span>
            <span v-if="joueurs.seasonLabel" class="cm-chip"><AppIcon name="calendar" :size="11" />Saison {{ joueurs.seasonLabel }}</span>
          </div>
        </div>
      </div>

      <div v-if="forme.length || prochainMatch" class="team__facts">
        <div v-if="forme.length" class="team__fact">
          <span class="team__fact-label"><AppIcon name="activity" :size="12" />5 derniers matchs</span>
          <span class="team__form">
            <MatchResultBadge v-for="m in [...forme].reverse()" :key="m.matchId" :result="m.result" :title="`${m.opponent} ${m.score}`" />
          </span>
        </div>

        <div v-if="prochainMatch" class="team__fact">
          <span class="team__fact-label"><AppIcon name="clock" :size="12" />Prochain match</span>
          <span class="team__next">
            <RouterLink :to="`/match-a-venir/${prochainMatch.matchId}`" class="team__next-link" title="Ouvrir la page du match">
              <TeamCrest :name="prochainMatch.home" :league="prochainMatch.league" :size="20" />
              {{ prochainMatch.home }} - {{ prochainMatch.away }}
              <TeamCrest :name="prochainMatch.away" :league="prochainMatch.league" :size="20" />
            </RouterLink>
            <span v-if="quandProchain" class="cm-text-muted team__next-when"> · {{ quandProchain }}</span>
          </span>
        </div>
      </div>

      <!-- Barre d'onglets segmentée, l'actif en couleur de section (même dessin que TabbedView). -->
      <nav class="team__tabs" role="tablist">
        <button
          v-for="t in availableTabs"
          :key="t.id"
          type="button"
          role="tab"
          :class="{ 'is-active': tab === t.id }"
          :aria-selected="tab === t.id"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </nav>
    </section>

    <LoadingSpinner v-if="matchs.loading" label="Chargement de l'équipe…" />
    <EmptyState v-else-if="matchs.error" icon="alert" title="Équipe introuvable" :description="matchs.error" />

    <template v-else>
      <!-- RÉSUMÉ -->
      <template v-if="tab === 'resume'">
        <AppCard icon="barChart" eyebrow="Moyennes par match" title="Meilleures statistiques" tone="section">
          <p class="cm-text-muted team__hint">Moyenne par match sur les {{ pour.echantillon }} derniers matchs.</p>
          <MatchupHeader v-if="pour.echantillon" :home="nom" away="Ses adversaires" :away-is-team="false" :league="ligue" />
          <MatchStatBars v-if="pour.echantillon" :group="TEAM_STAT_GROUPS[0]" :home="pour.valeurs" :away="contre.valeurs" />
          <EmptyState v-else icon="trendUp" title="Aucune statistique" description="Aucune statistique importée pour cette équipe." />
        </AppCard>

        <div class="team__grid">
          <AppCard icon="history" title="Derniers matchs" subtitle="Les cinq derniers résultats, du plus récent au plus ancien">
            <EmptyState v-if="!forme.length" icon="matches" title="Aucun match importé" description="Aucun match importé pour cette équipe." />
            <div v-else class="team__fixtures cm-stagger">
              <MatchCard
                v-for="m in forme"
                :key="m.matchId"
                :match="rencontreJouee(m)"
                :to="`/match/${m.matchId}`"
                variant="compact"
                :show-competition="false"
              />
            </div>
          </AppCard>

          <AppCard icon="calendar" title="Prochains matchs" subtitle="Les cinq prochains du calendrier, toutes compétitions">
            <template v-if="calendrier.total > prochainsMatchs.length" #actions>
              <AppButton variant="ghost" size="sm" @click="voirCalendrier">
                Tout le calendrier ({{ calendrier.total }})
                <AppIcon name="chevronRight" :size="13" />
              </AppButton>
            </template>
            <LoadingSpinner v-if="calendrier.loading" label="Calendrier…" />
            <div v-else-if="calendrier.error" class="cm-note is-danger">
              <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
              <div>
                <p class="cm-note__title">Calendrier indisponible</p>
                <p class="cm-note__text">{{ calendrier.error }}</p>
              </div>
            </div>
            <EmptyState v-else-if="!prochainsMatchs.length" icon="calendar" title="Aucun match à venir" description="Aucun match à venir dans le calendrier." />
            <div v-else class="team__fixtures cm-stagger">
              <FixtureCard v-for="f in prochainsMatchs" :key="cleMatch(f)" :fixture="f" variant="compact" />
            </div>
          </AppCard>

          <AppCard icon="star" title="Joueurs décisifs" subtitle="Buts et passes décisives relevés cette saison" class="team__span">
            <LoadingSpinner v-if="joueurs.loading" label="Joueurs…" />
            <EmptyState v-else-if="!meilleurs.length" icon="users" title="Aucun joueur décisif" description="Aucun but ni passe décisive relevé cette saison." />
            <ul v-else class="team__list cm-stagger">
              <li v-for="j in meilleurs" :key="j.playerId" class="team__scorer">
                <span class="team__who">
                  <TeamCrest :name="nom" :league="ligue" :size="18" />
                  <PlayerFlag :code="j.countryCode ?? null" :name="j.countryName ?? null" :player-id="j.playerId ?? null" :size="14" />
                  <RouterLink v-if="aUneFiche(j.playerId)" :to="`/joueur/${j.playerId}`" class="team__player-link cm-truncate">{{ j.name }}</RouterLink>
                  <span v-else class="cm-truncate">{{ j.name }}</span>
                </span>
                <span class="cm-text-muted team__scorer-role">{{ poste(j.position) }}</span>
                <span class="cm-pill is-section">{{ j.goals }} b. · {{ j.assists }} p.d.</span>
              </li>
            </ul>
          </AppCard>
        </div>
      </template>

      <!-- CALENDRIER -->
      <AppCard
        v-else-if="tab === 'calendar'"
        icon="calendar"
        title="Calendrier à venir"
        :subtitle="calendrier.total ? `${calendrier.total} match${calendrier.total > 1 ? 's' : ''} · toutes compétitions suivies` : ''"
      >
        <LoadingSpinner v-if="calendrier.loading" label="Calendrier…" />
        <EmptyState v-else-if="calendrier.error" icon="alert" title="Calendrier indisponible" :description="calendrier.error" />
        <EmptyState v-else-if="!calendrier.list.length" icon="calendar" title="Aucun match à venir" description="Aucun match à venir dans le calendrier pour cette équipe." />
        <div v-else class="team__calendar">
          <FixtureCard v-if="prochainDuCalendrier" :fixture="prochainDuCalendrier" variant="hero" />
          <section v-for="mois in calendrierParMois" :key="mois.libelle" class="team__month">
            <h3 class="cm-group-title team__month-title">
              {{ mois.libelle }} <span class="team__month-count">{{ mois.matchs.length }} match{{ mois.matchs.length > 1 ? 's' : '' }}</span>
            </h3>
            <div class="team__fixtures cm-stagger">
              <FixtureCard v-for="f in mois.matchs" :key="cleMatch(f)" :fixture="f" />
            </div>
          </section>
          <section v-if="aReprogrammer.length" class="team__month">
            <h3 class="cm-group-title team__month-title is-warning">À reprogrammer <span class="team__month-count">nouvelle date à venir</span></h3>
            <div class="team__fixtures cm-stagger">
              <FixtureCard v-for="f in aReprogrammer" :key="cleMatch(f)" :fixture="f" />
            </div>
          </section>
          <p v-if="calendrier.total > calendrier.list.length" class="cm-text-muted team__hint is-foot">
            Les {{ calendrier.list.length }} premiers sur {{ calendrier.total }}.
          </p>
        </div>
      </AppCard>

      <!-- COMPOSITION -->
      <AppCard
        v-else-if="tab === 'lineup'"
        icon="users"
        :title="`Composition — ${coteEquipe ? matchCompo[coteEquipe] : nom}`"
        :subtitle="`Match : ${matchCompo.home} - ${matchCompo.away}`"
      >
        <template #actions>
          <AppButton variant="secondary" size="sm" :loading="compo.loading" @click="chargerCompo">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Relire chez FotMob
          </AppButton>
        </template>
        <LoadingSpinner v-if="compo.loading && !compo.data" label="Lecture de la composition…" />
        <EmptyState v-else-if="compo.error" icon="alert" title="Composition indisponible" :description="compo.error" />
        <AiLineupSnapshot v-else-if="compo.data?.lineups" :snapshot="compo.data.lineups" pitch :side="coteEquipe" />
        <AiLineupSnapshot v-else-if="compo.data?.lastLineups" :snapshot="compo.data.lastLineups" pitch :side="coteEquipe" />
        <EmptyState
          v-else-if="!compo.data?.available"
          icon="matches"
          title="Match introuvable chez FotMob"
          description="FotMob ne liste pas encore ce match : pas de composition pour l'instant."
        />
        <EmptyState
          v-else
          icon="matches"
          title="Composition pas encore publiée"
          description="FotMob publie les compositions officielles en général une heure avant le coup d'envoi (parfois une prévision la veille pour les grosses affiches)."
        />
      </AppCard>

      <!-- STATISTIQUES -->
      <template v-else-if="tab === 'stats'">
        <EmptyState v-if="!pour.echantillon" icon="trendUp" title="Aucune statistique" description="Aucune statistique importée pour cette équipe." />
        <template v-else>
          <h3 class="cm-section-title">
            Face à ses adversaires
            <span class="cm-section-title__hint">Moyenne par match sur les {{ pour.echantillon }} derniers matchs.</span>
          </h3>
          <div class="team__stats">
            <AppCard v-for="group in TEAM_STAT_GROUPS" :key="group.title" icon="barChart" :title="group.title">
              <MatchupHeader :home="nom" away="Ses adversaires" :away-is-team="false" :league="ligue" :size="22" />
              <MatchStatBars :group="group" :home="pour.valeurs" :away="contre.valeurs" />
            </AppCard>
          </div>
        </template>
      </template>

      <!-- MATCHS -->
      <AppCard v-else-if="tab === 'matches'" icon="matches" title="Matchs" subtitle="Les rencontres jouées relevées dans le magasin, de la plus récente à la plus ancienne">
        <template v-if="matchs.list.length" #actions>
          <span class="cm-chip is-section">{{ matchs.list.length }} match{{ matchs.list.length > 1 ? 's' : '' }}</span>
        </template>
        <EmptyState v-if="!matchs.list.length" icon="matches" title="Aucun match importé" description="Aucun match importé pour cette équipe." />
        <div v-else class="team__fixtures cm-stagger">
          <MatchCard v-for="m in matchs.list" :key="m.matchId" :match="rencontreJouee(m)" :to="`/match/${m.matchId}`" />
        </div>
      </AppCard>

      <!-- JOUEURS -->
      <AppCard
        v-else-if="tab === 'players'"
        icon="users"
        :title="joueurs.seasonLabel ? `Joueurs — saison ${joueurs.seasonLabel}${ligue ? ` (${ligue})` : ''}` : 'Joueurs'"
        subtitle="L'effectif relevé dans ce championnat, classé par minutes jouées"
      >
        <template v-if="joueurs.list.length" #actions>
          <span class="cm-chip is-section">{{ joueurs.list.length }} joueur{{ joueurs.list.length > 1 ? 's' : '' }}</span>
        </template>
        <LoadingSpinner v-if="joueurs.loading" label="Joueurs…" />
        <EmptyState v-else-if="joueurs.error" icon="alert" title="Joueurs indisponibles" :description="joueurs.error" />
        <EmptyState v-else-if="!joueurs.list.length" icon="users" title="Aucun joueur relevé" description="Aucun joueur relevé pour cette équipe dans ce championnat cette saison." />
        <div v-else class="cm-table-wrap">
          <table class="cm-table team__table">
            <thead>
              <tr>
                <th>Joueur</th>
                <th class="is-left">Poste</th>
                <th>Âge</th>
                <th title="Matchs joués">Matchs</th>
                <th title="Titularisations">Tit.</th>
                <th title="Minutes jouées">Min.</th>
                <th>Buts</th>
                <th title="Passes décisives">P.D.</th>
                <th title="Buts attendus">xG</th>
                <th title="Note moyenne FotMob">Note</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="j in joueurs.list" :key="j.playerId">
                <td class="team__player">
                  <span class="team__who">
                    <TeamCrest :name="nom" :league="ligue" :size="18" />
                    <PlayerFlag :code="j.countryCode ?? null" :name="j.countryName ?? null" :player-id="j.playerId ?? null" :size="14" />
                    <RouterLink v-if="aUneFiche(j.playerId)" :to="`/joueur/${j.playerId}`" class="team__player-link cm-truncate">{{ j.name }}</RouterLink>
                    <span v-else class="cm-truncate">{{ j.name }}</span>
                  </span>
                </td>
                <td class="is-left cm-text-muted">{{ poste(j.position) }}</td>
                <td class="cm-numeric cm-text-muted">{{ j.age ?? '—' }}</td>
                <td class="cm-numeric">{{ j.played ?? j.matches }}</td>
                <td class="cm-numeric">{{ j.starts }}</td>
                <td class="cm-numeric">{{ nombre(j.minutes) }}</td>
                <td class="cm-numeric is-strong">{{ j.goals }}</td>
                <td class="cm-numeric is-strong">{{ j.assists }}</td>
                <td class="cm-numeric">{{ j.xg == null ? '—' : nombre(j.xg, 2) }}</td>
                <td class="cm-numeric team__note">{{ j.rating == null ? '—' : nombre(j.rating, 2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.team {
  /* La page se règle sur SA largeur : deux colonnes dès que la place existe. */
  container: team / inline-size;
}

/* ------------------------------------------------------------- bandeau */
.team__identity {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

/* Le grand logo, dans un halo de la couleur de section. */
.team__crest {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow:
    0 0 0 4px rgba(var(--cm-section-rgb) / 0.18),
    var(--cm-shadow);
}

.team__titles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.team__name {
  font-size: 26px;
  line-height: 1.1;
}

/* Le nom du club et son bouton de favori sur la même ligne. */
.team__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-width: 0;
}

/* La compétition dans une puce : son drapeau et son nom (LeagueBadge). */
.team__league {
  padding: 3px 10px 3px 5px;
}

/* Forme et prochain match : deux faits côte à côte, séparés du titre par un filet teinté. */
.team__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 32px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--cm-section-rgb) / 0.14);
}

.team__fact {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.team__fact-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.team__form {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.team__next {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 12.5px;
}

.team__next-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px 4px 6px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-2));
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
  text-decoration: none;
  transition: border-color var(--cm-transition), color var(--cm-transition), background var(--cm-transition);
}

.team__next-link:hover {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.team__next-when {
  font-size: 12px;
}

/* Barre d'onglets segmentée (le dessin de TabbedView, dans le bandeau). */
.team__tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  align-self: flex-start;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-1));
}

.team__tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.team__tabs button:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-3));
}

.team__tabs button.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ------------------------------------------------------------- résumé */
.team__hint {
  margin: 0 0 12px;
  font-size: 12px;
}

.team__hint.is-foot {
  margin: 4px 0 0;
}

.team__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.team__fixtures {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Les joueurs décisifs : une ligne par joueur, ses buts et passes en pastille. */
.team__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.team__scorer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 13px;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.team__scorer:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

.team__scorer-role {
  font-size: 11.5px;
  white-space: nowrap;
}

/* Le drapeau de sa nationalité, puis le joueur (sa fiche au clic). */
.team__who {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 240px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.team__player-link {
  color: inherit;
  text-decoration: none;
  transition: color var(--cm-transition);
}

.team__player-link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

/* --------------------------------------------------------- calendrier */
.team__calendar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.team__month {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.team__month-title.is-warning {
  color: var(--cm-warning);
}

.team__month-count {
  font-size: 11px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--cm-text-muted);
}

/* -------------------------------------------------------- statistiques */
.team__stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* ------------------------------------------------------------ joueurs */
.team__player {
  font-weight: 600;
}

.team__note {
  font-weight: 700;
  color: var(--cm-section);
}

/* Assez de place : le résumé et les statistiques sur deux colonnes, les
   joueurs décisifs sur toute la largeur en deux rangées. */
@container team (min-width: 820px) {
  .team__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .team__grid > .team__span {
    grid-column: 1 / -1;
  }

  .team__list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container team (min-width: 980px) {
  .team__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : le logo au-dessus du nom, les onglets sur toute la largeur. */
@container team (max-width: 520px) {
  .team__identity {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .team__name {
    font-size: 22px;
  }

  .team__tabs {
    align-self: stretch;
  }

  .team__tabs button {
    flex: 1;
    justify-content: center;
    padding: 7px 10px;
  }
}
</style>
