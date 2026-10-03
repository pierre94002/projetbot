<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import BackButton from '@/components/common/BackButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { rencontreVueParEquipe } from '@/utils/rencontres.js';
import { photoJoueur, formatNote, classeNote } from '@/utils/playerVisuals.js';

/**
 * Fiche d'un JOUEUR — demande de Pierre le 01/10/2026 : « si on clique sur
 * le joueur, qu'on puisse aller à ses statistiques individuelles ». Ouverte
 * au clic sur un joueur du terrain des compositions (LineupPitch.vue) ou du
 * classement des joueurs.
 *
 * Tout vient du magasin (FotMob), par identifiant : la saison toutes
 * compétitions, puis par compétition et match par match — chaque match ouvre
 * sa page. Gardien : arrêts, buts encaissés et clean sheets à la place des
 * chiffres offensifs.
 *
 * Dessin (refonte visuelle du 01/10/2026, cf. ui/DESIGN.md) : un bandeau
 * teinté de la couleur de la section (photo, nom, puces d'identité, club,
 * saison choisie, dernières notes), les chiffres de la saison en tuiles,
 * la ventilation par compétition dans le tableau commun, puis chaque match
 * dans la carte de rencontre commune avec ses chiffres à droite.
 */
const props = defineProps({
  playerId: { type: String, required: true },
  season: { type: String, default: null }
});

const router = useRouter();
const fiche = ref({ loading: false, error: null, data: null });
const photoEnErreur = ref(false);

async function charger() {
  fiche.value = { loading: true, error: null, data: fiche.value.data?.playerId === props.playerId ? fiche.value.data : null };
  photoEnErreur.value = false;
  try {
    const data = await matchStatsApi.player(props.playerId, { season: props.season });
    fiche.value = { loading: false, error: null, data };
  } catch (error) {
    fiche.value = { loading: false, error: error.message, data: null };
  }
}

// Même composant d'un joueur à l'autre (la clé de vue est le nom de route) : on recharge.
watch(() => [props.playerId, props.season], charger, { immediate: true });

function changerSaison(saison) {
  router.replace({ query: { saison } });
}

// Les saisons du joueur pour la liste de l'appli (valeurs en texte : la
// saison lue dans l'adresse est du texte).
const optionsSaisons = computed(() => (j.value?.seasons ?? []).map((s) => ({ value: String(s.season), label: s.label })));

const POSTES = { Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Forward: 'Attaquant' };
const j = computed(() => fiche.value.data);
const gardien = computed(() => j.value?.position === 'Goalkeeper');
const photo = computed(() => (photoEnErreur.value ? null : photoJoueur(j.value?.playerId)));
const lienEquipe = computed(() =>
  j.value?.team ? { name: 'team', params: { name: j.value.team }, query: j.value.league ? { league: j.value.league } : {} } : null
);

const nombre = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const jourComplet = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const jourCourt = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }) : '');

// Les chiffres de la saison, toutes compétitions : ce qui juge un joueur de
// champ (buts, passes, xG…) ou un gardien (arrêts, clean sheets…).
const tuiles = computed(() => {
  const t = j.value?.totals;
  if (!t) return [];
  const communes = [
    { label: 'Matchs joués', valeur: nombre(t.played), detail: `${nombre(t.starts)} titularisation${t.starts > 1 ? 's' : ''}` },
    { label: 'Minutes', valeur: nombre(t.minutes), detail: t.played ? `${nombre(t.minutes / t.played)} par match` : null },
    { label: 'Note moyenne', valeur: formatNote(t.rating) ?? '—', note: t.rating }
  ];
  if (gardien.value) {
    return [
      ...communes,
      { label: 'Clean sheets', valeur: nombre(t.cleanSheets) },
      { label: 'Arrêts', valeur: nombre(t.saves), detail: t.played ? `${nombre(t.saves / t.played, 1)} par match` : null },
      { label: 'Buts encaissés', valeur: nombre(t.goalsConceded), detail: t.played ? `${nombre(t.goalsConceded / t.played, 2)} par match` : null },
      { label: 'Buts évités', valeur: nombre(t.goalsPrevented, 2), detail: 'xGOT subis − buts encaissés' },
      { label: 'Passes réussies', valeur: t.passes ? `${nombre((100 * t.passesAccurate) / t.passes)} %` : '—', detail: `${nombre(t.passesAccurate)} / ${nombre(t.passes)}` },
      { label: 'Cartons', valeur: `${nombre(t.yellowCards)} J · ${nombre(t.redCards)} R` }
    ];
  }
  return [
    ...communes,
    { label: 'Buts', valeur: nombre(t.goals), detail: `xG ${nombre(t.xg, 2)}` },
    { label: 'Passes décisives', valeur: nombre(t.assists), detail: `xA ${nombre(t.xa, 2)}` },
    { label: 'Tirs', valeur: nombre(t.shots), detail: `${nombre(t.shotsOnTarget)} cadré${t.shotsOnTarget > 1 ? 's' : ''}` },
    { label: 'Passes clés', valeur: nombre(t.keyPasses), detail: `${nombre(t.bigChancesCreated)} grosse${t.bigChancesCreated > 1 ? 's' : ''} occasion${t.bigChancesCreated > 1 ? 's' : ''} créée${t.bigChancesCreated > 1 ? 's' : ''}` },
    { label: 'Passes réussies', valeur: t.passes ? `${nombre((100 * t.passesAccurate) / t.passes)} %` : '—', detail: `${nombre(t.passesAccurate)} / ${nombre(t.passes)}` },
    { label: 'Dribbles réussis', valeur: nombre(t.dribblesWon), detail: dribblesTentes(t) },
    { label: 'Tacles + interceptions', valeur: nombre(t.tackles + t.interceptions), detail: `duels gagnés ${nombre(t.duelsWon)} / ${nombre(t.duelsTotal)}` },
    { label: 'Cartons', valeur: `${nombre(t.yellowCards)} J · ${nombre(t.redCards)} R` }
  ];
});

// « sur 12 tentés (58 %) » ; tant que des feuilles lues avant le 01/10/2026
// (sans les tentés) comptent dans la saison, on dit sur combien de matchs.
function dribblesTentes(t) {
  if (!t.dribblesTracked) return 'tentés : pas encore relevés';
  const taux = t.dribblesAttempted ? ` (${nombre((100 * t.dribblesWonTracked) / t.dribblesAttempted)} %)` : '';
  if (t.dribblesTracked >= t.played) return `sur ${nombre(t.dribblesAttempted)} tenté${t.dribblesAttempted > 1 ? 's' : ''}${taux}`;
  return `${nombre(t.dribblesWonTracked)} sur ${nombre(t.dribblesAttempted)} tentés${taux} · ${t.dribblesTracked} match${t.dribblesTracked > 1 ? 's' : ''} relevé${t.dribblesTracked > 1 ? 's' : ''} sur ${t.played}`;
}

const formeRecente = computed(() => (j.value?.matches ?? []).filter((m) => formatNote(m.rating) !== null).slice(0, 5).reverse());
</script>

<template>
  <div class="player cm-page">
    <BackButton fallback="/matches" />

    <LoadingSpinner v-if="fiche.loading && !j" label="Chargement du joueur…" />
    <EmptyState
      v-else-if="fiche.error"
      icon="alert"
      :title="fiche.error.startsWith('Le serveur n\'est pas à jour') ? 'Serveur à relancer' : 'Joueur introuvable'"
      :description="fiche.error"
    />

    <template v-else-if="j">
      <!-- Le bandeau : la photo dans un anneau couleur de section, le nom, son
           identité en puces (nationalité, poste, numéro, âge), son club avec
           logo et compétition, la saison choisie, puis ses dernières notes. -->
      <section class="cm-hero player__hero">
        <div class="player__head">
          <div class="player__avatar">
            <img v-if="photo" :src="photo" alt="" @error="photoEnErreur = true" />
            <span v-else class="player__avatar-number">{{ j.number ?? '?' }}</span>
          </div>

          <div class="player__identity">
            <span class="cm-eyebrow player__eyebrow"><AppIcon name="users" :size="12" />Fiche joueur</span>
            <h2 class="cm-hero__title player__name">{{ j.name }}</h2>
            <div class="cm-hero__chips player__meta">
              <!-- Nationalité (01/10/2026) : drapeau et pays, d'après FotMob. -->
              <span v-if="j.countryCode" class="cm-chip player__flag"><PlayerFlag :code="j.countryCode" :name="j.countryName" label :size="16" /></span>
              <span v-if="j.position" class="cm-chip is-section"><AppIcon name="shield" :size="11" />{{ POSTES[j.position] ?? j.position }}</span>
              <span v-if="j.number != null" class="cm-chip">n° {{ j.number }}</span>
              <span v-if="j.age != null" class="cm-chip"><AppIcon name="calendar" :size="11" />{{ j.age }} ans</span>
              <span v-if="j.birthDate" class="cm-chip player__birth" title="Date de naissance">né le {{ jourComplet(j.birthDate) }}</span>
            </div>
            <p v-if="j.team" class="player__club">
              <TeamCrest :name="j.team" :league="j.league" :team-id="j.teamId ?? null" :size="24" />
              <RouterLink v-if="lienEquipe" :to="lienEquipe" class="player__club-link" title="Ouvrir la page du club">{{ j.team }}</RouterLink>
              <span v-if="j.league" class="cm-chip player__league"><LeagueBadge :league="j.league" /></span>
            </p>
          </div>

          <!-- La saison regardée : un sélecteur dessiné comme les champs de l'appli. -->
          <AppSelect
            :model-value="String(j.season)"
            label="Saison"
            :options="optionsSaisons"
            class="player__season"
            @update:model-value="changerSaison"
          />
        </div>

        <!-- Ses cinq dernières notes, de la plus ancienne à la plus récente. -->
        <div v-if="formeRecente.length" class="player__form">
          <span class="player__form-label"><AppIcon name="activity" :size="12" />Dernières notes</span>
          <span class="player__form-pills">
            <span v-for="m in formeRecente" :key="m.matchKey" class="player__rating" :class="classeNote(m.rating)" :title="`${m.opponent} · ${jourCourt(m.date)}`">
              {{ formatNote(m.rating) }}
            </span>
          </span>
        </div>
      </section>

      <!-- Les chiffres de la saison et, quand il y en a plusieurs, la ventilation
           par compétition : côte à côte dès que la page est assez large. -->
      <div class="player__grid">
        <AppCard icon="barChart" :title="`Saison ${j.seasonLabel}`" subtitle="Toutes compétitions" tone="section" class="player__season-card" :class="{ 'is-wide': j.byCompetition.length <= 1 }">
          <EmptyState v-if="!j.totals.onSheet" icon="trendUp" title="Aucun match cette saison" description="Le magasin n'a aucune feuille de match de ce joueur sur cette saison." />
          <div v-else class="cm-kpis player__tiles">
            <div v-for="t in tuiles" :key="t.label" class="cm-kpi player__tile">
              <span class="cm-kpi__label">{{ t.label }}</span>
              <span class="cm-kpi__value" :class="t.note != null ? ['player__rating', 'is-kpi', classeNote(t.note)] : null">{{ t.valeur }}</span>
              <span v-if="t.detail" class="cm-kpi__detail">{{ t.detail }}</span>
            </div>
          </div>
        </AppCard>

        <AppCard v-if="j.byCompetition.length > 1" icon="trophy" title="Par compétition" subtitle="La saison, compétition par compétition">
          <div class="cm-table-wrap">
            <table class="cm-table player__table">
              <thead>
                <tr>
                  <th>Compétition</th>
                  <th title="Matchs joués">Matchs</th>
                  <th title="Titularisations">Tit.</th>
                  <th title="Minutes jouées">Min.</th>
                  <th v-if="!gardien">Buts</th>
                  <th v-if="!gardien" title="Passes décisives">P.D.</th>
                  <th v-if="gardien">Clean sheets</th>
                  <th v-if="gardien" title="Buts encaissés">Encaissés</th>
                  <th title="Note moyenne FotMob">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in j.byCompetition" :key="c.league">
                  <td class="is-strong cm-truncate player__competition">{{ c.league }}</td>
                  <td class="cm-numeric">{{ c.played }}</td>
                  <td class="cm-numeric">{{ c.starts }}</td>
                  <td class="cm-numeric">{{ nombre(c.minutes) }}</td>
                  <td v-if="!gardien" class="cm-numeric is-strong">{{ c.goals }}</td>
                  <td v-if="!gardien" class="cm-numeric is-strong">{{ c.assists }}</td>
                  <td v-if="gardien" class="cm-numeric is-strong">{{ c.cleanSheets }}</td>
                  <td v-if="gardien" class="cm-numeric">{{ c.goalsConceded }}</td>
                  <td>
                    <span v-if="formatNote(c.rating)" class="player__rating" :class="classeNote(c.rating)">{{ formatNote(c.rating) }}</span>
                    <span v-else class="cm-text-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppCard>
      </div>

      <AppCard icon="matches" title="Match par match" :subtitle="`${j.matches.length} feuille${j.matches.length > 1 ? 's' : ''} de match cette saison`">
        <EmptyState v-if="!j.matches.length" icon="matches" title="Aucun match cette saison." description="Aucune feuille de match de ce joueur sur la saison choisie." />
        <div v-else class="player__cards cm-stagger">
          <MatchCard
            v-for="m in j.matches"
            :key="m.matchKey"
            :match="rencontreVueParEquipe(m, m.team)"
            :to="`/match/${m.matchKey}`"
            class="player__card"
          >
            <!-- Ses chiffres du match, à droite : minutes, note, buts et passes (ou arrêts). -->
            <template #aside>
              <span class="player__minutes" :class="{ 'cm-text-muted': !m.minutes }">
                <template v-if="m.minutes">{{ m.minutes }}'<span v-if="!m.starter" class="player__entree"> entré</span></template>
                <template v-else>banc</template>
              </span>
              <span v-if="!gardien && (m.goals || m.assists)" class="player__decisif">
                <template v-if="m.goals">{{ m.goals }} b.</template><template v-if="m.goals && m.assists"> · </template><template v-if="m.assists">{{ m.assists }} p.d.</template>
              </span>
              <span v-if="gardien && m.minutes" class="player__decisif">{{ m.saves ?? 0 }} arr. · {{ m.goalsConceded ?? 0 }} enc.</span>
              <span v-if="formatNote(m.rating)" class="player__rating" :class="classeNote(m.rating)">{{ formatNote(m.rating) }}</span>
            </template>
          </MatchCard>
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.player {
  /* La page se règle sur SA largeur : deux colonnes dès que la place existe. */
  container: player / inline-size;
}

/* ------------------------------------------------------------- bandeau */
.player__hero {
  gap: 16px;
}

.player__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
}

/* La photo (découpe FotMob) dans un rond : un fond teinté couleur de section
   derrière le buste, un anneau de la même couleur, un halo discret. */
.player__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 3px solid rgba(var(--cm-section-rgb) / 0.6);
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.3), var(--cm-surface-raised));
  box-shadow:
    0 0 0 4px rgba(var(--cm-section-rgb) / 0.14),
    var(--cm-shadow);
  overflow: hidden;
}

.player__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}

/* Sans photo : son numéro, en grand, couleur de section. */
.player__avatar-number {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--cm-section);
  font-variant-numeric: tabular-nums;
}

.player__identity {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.player__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.player__name {
  font-size: 26px;
  line-height: 1.1;
}

/* Le drapeau et la compétition dans une puce : moins de marge à gauche de l'image. */
.player__flag,
.player__league {
  padding-left: 5px;
}

.player__flag :deep(.flag__label) {
  font-size: 11px;
  font-weight: 600;
}

.player__league :deep(.league-badge__name) {
  font-size: 11px;
}

/* Son club : logo, nom (sa page au clic), compétition. */
.player__club {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
}

.player__club-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
  text-decoration: none;
  transition: color var(--cm-transition);
}

.player__club-link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

/* Le sélecteur de saison : la liste commune (AppSelect), en haut à droite. */
.player__season {
  align-self: flex-start;
  min-width: 150px;
}

/* Les dernières notes, sous un filet teinté. */
.player__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--cm-section-rgb) / 0.14);
}

.player__form-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.player__form-pills {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
}

/* ---------------------------------------------------- pastille de note */
/* La couleur d'une note, à la FotMob (cf. classeNote) : bleu à partir de 9,
   vert foncé à partir de 8, vert à partir de 7, ambre à partir de 6, rouge
   en dessous — sur les jetons sémantiques, le chiffre en sombre dessus. */
.player__rating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.5;
  color: var(--cm-bg);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.is-top {
  background: var(--cm-info);
}

.is-great {
  background: var(--cm-accent-strong);
}

.is-good {
  background: var(--cm-accent);
}

.is-mid {
  background: var(--cm-warning);
}

.is-low {
  background: var(--cm-danger);
}

/* ------------------------------------------------------------- saison */
.player__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* La note moyenne dans sa tuile : la pastille, en plus grand. */
.player__tile .player__rating.is-kpi {
  align-self: flex-start;
  padding: 3px 12px;
  font-size: 17px;
  line-height: 1.3;
}

.player__competition {
  max-width: 260px;
}

/* ------------------------------------------------------ match par match */
.player__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Minutes, chiffres et note à droite de la carte de rencontre. */
.player__card {
  --mcard-aside: 250px;
}

.player__minutes {
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.player__entree {
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* Ce qu'il a fait de décisif (ou, gardien, ses arrêts) : en vert, positif. */
.player__decisif {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

/* Assez de place : la saison et la ventilation par compétition côte à côte
   (la saison seule prend toute la largeur). */
@container player (min-width: 980px) {
  .player__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .player__grid > .is-wide {
    grid-column: 1 / -1;
  }
}

/* Carte de rencontre dans une page moyenne : moins de place aux chiffres. */
@container player (max-width: 720px) {
  .player__card {
    --mcard-aside: 170px;
  }
}

/* Panneau étroit : la photo au-dessus du nom, le sélecteur sur toute la largeur. */
@container player (max-width: 560px) {
  .player__head {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .player__name {
    font-size: 22px;
  }

  .player__season {
    align-self: stretch;
  }
}
</style>
