<script setup>
import { computed, reactive } from 'vue';
import { RouterLink } from 'vue-router';
import { aUneFiche, photoJoueur, logoEquipe, formatNote, classeNote } from '@/utils/playerVisuals.js';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Les deux compositions sur un terrain, face à face, à la façon de FotMob —
 * demande de Pierre le 01/10/2026, capture à l'appui : « affiche-moi les
 * compos comme ça, et change les schémas suivant les compositions des
 * équipes ».
 *
 * Chaque équipe est placée selon SA formation : la case FotMob de chaque
 * titulaire (`x` de son but vers le but adverse, `y` de son flanc gauche à
 * son flanc droit, de 0 à 1 — feuilles du magasin et compositions à venir)
 * quand on l'a, sinon les lignes de la formation (« 4-2-3-1 »), sinon les
 * postes. L'équipe qui reçoit attaque vers la droite, l'autre vers la
 * gauche : la seconde est tournée d'un demi-tour.
 *
 * Équipe attendue : { name, teamId, formation, rating, coach, starters: [{
 *   id, name, number, position, x, y, rating, warning }] } — `saison` : note
 * moyenne de la saison (match à venir), sinon note du match.
 *
 * Sur chaque joueur, la note seule (et ⚠ s'il est indisponible) : ni buts ni
 * cartons — consigne de Pierre le 01/10/2026, « il faut juste afficher les
 * notes ». Un clic ouvre sa fiche (/joueur/:id, cf. PlayerView.vue).
 *
 * Photos et logos : ceux que publie FotMob, par identifiant ; le numéro de
 * maillot quand l'image manque, sinon les initiales. Le drapeau de sa
 * nationalité en pastille sur la photo (01/10/2026) : le code pays quand la
 * composition le porte, sinon retrouvé d'après son identifiant.
 *
 * Sans `away` (page d'une équipe, 01/10/2026 : « il n'y ait que les joueurs
 * d'Arsenal »), l'équipe seule occupe tout le terrain, son but à gauche.
 *
 * Habillage refait le 02/10/2026 (refonte visuelle, cf. ui/DESIGN.md) : la
 * carte prend les surfaces de l'appli, la barre d'en-tête est teintée de la
 * couleur de section, le gazon est dérivé des jetons (aucune couleur en
 * dur) ; le placement et les pastilles ne changent pas.
 */
const props = defineProps({
  home: { type: Object, required: true },
  away: { type: Object, default: null },
  saison: { type: Boolean, default: false }
});

const equipes = computed(() => (props.away ? [props.home, props.away] : [props.home]));

const RANG = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3 };
const PARTICULES = new Set(['de', 'da', 'do', 'dos', 'das', 'di', 'del', 'della', 'dal', 'van', 'von', 'der', 'den', 'ter', 'ten', 'le', 'la', 'el', 'al', 'ben', 'bin', 'mac', 'st.', 'san']);

const logo = logoEquipe;
const note = formatNote;
// Images introuvables chez FotMob (403) : on n'insiste pas, le numéro les remplace.
const echecs = reactive(new Set());

/** « Kevin De Bruyne » → « De Bruyne », « Bukayo Saka » → « Saka ». */
function nomCourt(nom) {
  const mots = String(nom ?? '').trim().split(/\s+/);
  if (mots.length <= 1) return mots[0] ?? '';
  let i = mots.length - 1;
  while (i > 0 && PARTICULES.has(mots[i - 1].toLowerCase())) i--;
  return mots.slice(i).join(' ');
}

/** Les lignes de champ quand ni la formation ni les postes ne les donnent : un 4-4-2, ou ce qui s'en approche. */
function lignesParDefaut(n) {
  if (n <= 0) return [];
  const defense = Math.max(1, Math.round(n * 0.4));
  const attaque = n - defense > 1 ? Math.max(1, Math.round(n * 0.2)) : 0;
  return [defense, n - defense - attaque, attaque].filter((c) => c > 0);
}

/**
 * Profondeur (0 son but, 1 le but adverse) et largeur (0 flanc gauche,
 * 1 flanc droit) de chaque titulaire. Sans les cases FotMob — vieilles
 * feuilles, petites coupes —, un gardien (celui que la feuille désigne, sinon
 * le premier inscrit) puis des lignes : celles de la formation, sinon celles
 * des postes quand tous sont connus, sinon un 4-4-2 ; dans une ligne, l'ordre
 * de la feuille.
 */
function placer(titulaires, formation) {
  const valeur = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  if (titulaires.length && titulaires.every((j) => valeur(j.x) && valeur(j.y))) {
    return titulaires.map((j) => ({ ...j, profondeur: Number(j.x), largeur: Number(j.y) }));
  }
  if (!titulaires.length) return [];
  const iGardien = Math.max(0, titulaires.findIndex((j) => j.position === 'Goalkeeper'));
  const gardien = titulaires[iGardien];
  // Tri stable : à rang égal (ou poste inconnu), l'ordre de la feuille est conservé.
  const champ = titulaires.filter((_, i) => i !== iGardien).sort((a, b) => (RANG[a.position] ?? 2) - (RANG[b.position] ?? 2));

  const parFormation = String(formation ?? '')
    .split('-')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const postesConnus = champ.every((j) => RANG[j.position] > 0);
  const lignes =
    parFormation.length && parFormation.reduce((s, n) => s + n, 0) === champ.length
      ? parFormation
      : postesConnus
        ? [1, 2, 3].map((r) => champ.filter((j) => RANG[j.position] === r).length).filter((n) => n > 0)
        : lignesParDefaut(champ.length);

  const groupes = [[gardien]];
  let i = 0;
  for (const n of lignes) {
    groupes.push(champ.slice(i, i + n));
    i += n;
  }
  // Mêmes profondeurs que les cases FotMob : gardien à 0,1, lignes de 0,29 à 0,87.
  const nLignes = groupes.length - 1;
  const profondeur = (g) => (g === 0 ? 0.1 : nLignes === 1 ? 0.5 : 0.29 + (0.58 * (g - 1)) / (nLignes - 1));
  return groupes.flatMap((groupe, g) => groupe.map((j, k) => ({ ...j, profondeur: profondeur(g), largeur: (k + 1) / (groupe.length + 1) })));
}

/** Ce qu'on écrit dans le rond quand FotMob n'a pas de photo : le numéro, sinon les initiales. */
function sigle(j) {
  if (j.number != null && j.number !== '') return String(j.number);
  const mots = String(j.name ?? '')
    .replace(/\./g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return mots.length > 1 ? `${mots[0][0]}${mots.at(-1)[0]}`.toUpperCase() : (mots[0] ?? '?').slice(0, 2).toUpperCase();
}

// Homme du match : la meilleure note DU match (pas d'une moyenne de saison).
const meilleureNote = computed(() => {
  if (props.saison) return null;
  const notes = equipes.value
    .flatMap((e) => e.starters ?? [])
    .filter((j) => formatNote(j.rating) !== null)
    .map((j) => Number(j.rating));
  return notes.length ? Math.max(...notes) : null;
});

// Abscisse sur le terrain : deux moitiés (l'équipe à l'extérieur tournée d'un
// demi-tour), ou tout le terrain pour une équipe seule — gardien à 6 %,
// attaquants à 92 %.
function abscisse(cote, profondeur) {
  if (cote === 'seule') return 6 + ((profondeur - 0.1) * 86) / 0.77;
  return cote === 'home' ? profondeur * 50 : 100 - profondeur * 50;
}

const joueurs = computed(() =>
  (props.away
    ? [
        ['home', props.home],
        ['away', props.away]
      ]
    : [['seule', props.home]]
  ).flatMap(([cote, equipe]) =>
    placer(equipe.starters ?? [], equipe.formation).map((j, i) => ({
      ...j,
      cle: `${cote}-${j.id ?? j.name}-${i}`,
      left: abscisse(cote, j.profondeur),
      top: (cote === 'away' ? 1 - j.largeur : j.largeur) * 100,
      court: nomCourt(j.name),
      sigle: sigle(j),
      photo: photoJoueur(j.id),
      lien: aUneFiche(j.id) ? { to: `/joueur/${j.id}` } : null,
      note: note(j.rating),
      classe: classeNote(j.rating),
      homme: meilleureNote.value != null && Number(j.rating) === meilleureNote.value
    }))
  )
);

const titreNote = computed(() => (props.saison ? 'Note moyenne de la saison' : 'Note du match'));
</script>

<template>
  <div class="lp-wrap">
    <div class="lp">
      <!-- Barre d'en-tête : logo, nom, formation en puce, note d'équipe en pastille ; l'équipe à l'extérieur en miroir. -->
      <header class="lp__bar">
        <div v-for="(equipe, i) in equipes" :key="i" class="lp__team" :class="{ 'lp__team--away': i === 1 }">
          <img
            v-if="logo(equipe.teamId) && !echecs.has(`t-${equipe.teamId}`)"
            :src="logo(equipe.teamId)"
            class="lp__crest"
            alt=""
            @error="echecs.add(`t-${equipe.teamId}`)"
          />
          <span class="lp__team-name cm-truncate">{{ equipe.name }}</span>
          <span v-if="equipe.formation" class="cm-chip is-section lp__formation">{{ equipe.formation }}</span>
          <span v-if="note(equipe.rating)" class="lp__team-rating" :class="classeNote(equipe.rating)" title="Note de l'équipe">{{ note(equipe.rating) }}</span>
        </div>
      </header>

      <!-- Le terrain : rayures, vignette et marquages ; chaque titulaire sur sa case. -->
      <div class="lp__field">
        <div class="pitch">
          <span class="pitch__mark pitch__mark--outline" />
          <span class="pitch__mark pitch__mark--half" />
          <span class="pitch__mark pitch__mark--circle" />
          <span class="pitch__mark pitch__mark--spot" />
          <span class="pitch__mark pitch__mark--box pitch__mark--left" />
          <span class="pitch__mark pitch__mark--box pitch__mark--right" />
          <span class="pitch__mark pitch__mark--small pitch__mark--left" />
          <span class="pitch__mark pitch__mark--small pitch__mark--right" />

          <component
            :is="j.lien ? RouterLink : 'div'"
            v-for="j in joueurs"
            :key="j.cle"
            v-bind="j.lien ?? {}"
            class="pitch__player"
            :class="{ 'is-link': j.lien }"
            :title="`${j.lien ? 'Fiche de ' : ''}${j.name}${j.age !== null && j.age !== undefined ? ` · ${j.age} ans` : ''}`"
            :style="{ left: `${j.left}%`, top: `${j.top}%` }"
          >
            <div class="pitch__avatar" :class="{ 'has-warning': j.warning, 'is-homme': j.homme }">
              <img v-if="j.photo && !echecs.has(j.id)" :src="j.photo" alt="" loading="lazy" @error="echecs.add(j.id)" />
              <span v-else class="pitch__shirt">{{ j.sigle }}</span>

              <span v-if="j.note" class="pitch__rating" :class="j.classe" :title="titreNote">{{ j.note }}<template v-if="j.homme"> ★</template></span>
              <span v-if="j.warning" class="pitch__warning" :title="j.warning">⚠</span>
              <PlayerFlag class="pitch__flag" :code="j.countryCode ?? null" :name="j.countryName ?? null" :player-id="j.id ?? null" :size="16" />
            </div>
            <span class="pitch__name"><span v-if="j.number != null" class="pitch__num">{{ j.number }}</span>{{ j.court }}</span>
          </component>
        </div>
      </div>

      <!-- Les entraîneurs, en pied de carte. -->
      <footer v-if="away && (home.coach || away.coach)" class="lp__coaches">
        <span class="lp__coach cm-truncate">{{ home.coach ?? '' }}</span>
        <span class="lp__coaches-label"><AppIcon name="whistle" :size="12" />Entraîneur</span>
        <span class="lp__coach lp__coach--away cm-truncate">{{ away.coach ?? '' }}</span>
      </footer>
      <footer v-else-if="!away && home.coach" class="lp__coaches lp__coaches--seule">
        <span class="lp__coaches-label"><AppIcon name="whistle" :size="12" />Entraîneur</span>
        <span class="lp__coach cm-truncate">{{ home.coach }}</span>
      </footer>
    </div>

    <p class="lp__legend">
      <AppIcon name="info" :size="12" class="lp__legend-icon" />
      <span>
        <template v-if="saison">Notes : moyenne de la saison, toutes compétitions. ⚠ indisponible pour ce match selon FotMob.</template>
        <template v-else>Notes du match, ★ la meilleure.</template>
        Cliquez sur un joueur pour ouvrir sa fiche.
      </span>
    </p>
  </div>
</template>

<style scoped>
.lp-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-x: auto;
}

/* La carte. Le gazon est dérivé des jetons pour ne poser aucune couleur en
   dur : l'émeraude de la marque tirée vers le jaune (une herbe plutôt qu'une
   menthe), puis assombrie sur le fond de l'appli. --lp-shade : l'ombre portée
   sur le gazon (le fond de l'appli, translucide). */
.lp {
  --lp-grass: color-mix(in srgb, var(--cm-accent-strong) 68%, var(--cm-warning) 32%);
  --lp-pitch: color-mix(in srgb, var(--lp-grass) 60%, var(--cm-bg) 40%);
  --lp-pitch-light: color-mix(in srgb, var(--lp-grass) 65%, var(--cm-bg) 35%);
  --lp-line: rgb(var(--cm-glass-tint) / 0.35);
  --lp-shade: color-mix(in srgb, var(--cm-bg) 55%, transparent);
  min-width: 640px;
  border-radius: var(--cm-radius-lg);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  overflow: hidden;
}

/* ------------------------------------------------------ barre d'en-tête */
.lp__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
  background:
    radial-gradient(90% 180% at 0% 50%, rgba(var(--cm-section-rgb) / 0.12), transparent 60%),
    radial-gradient(90% 180% at 100% 50%, rgba(var(--cm-section-rgb) / 0.12), transparent 60%),
    var(--cm-surface-raised);
}

.lp__team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.lp__team--away {
  flex-direction: row-reverse;
  text-align: right;
}

.lp__crest {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 3px;
  border-radius: 50%;
  background: rgb(var(--cm-glass-tint) / 0.92);
  object-fit: contain;
  box-shadow: var(--cm-shadow-sm);
}

.lp__team-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.lp__formation {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.lp__team-rating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 40px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cm-bg);
}

/* ------------------------------------------------------------ terrain */
.lp__field {
  padding: 12px;
}

.pitch {
  position: relative;
  aspect-ratio: 1.72;
  border-radius: var(--cm-radius-md);
  /* De haut en bas : la vignette, une lumière qui tombe du haut, les rayures de tonte. */
  background:
    radial-gradient(110% 85% at 50% 50%, transparent 48%, var(--lp-shade) 100%),
    linear-gradient(180deg, rgb(var(--cm-glass-tint) / 0.07), transparent 28%, transparent 72%, color-mix(in srgb, var(--cm-bg) 22%, transparent)),
    repeating-linear-gradient(90deg, var(--lp-pitch-light) 0 7.142%, var(--lp-pitch) 7.142% 14.284%);
  box-shadow:
    inset 0 0 0 1px rgb(var(--cm-glass-tint) / 0.08),
    inset 0 12px 32px color-mix(in srgb, var(--cm-bg) 30%, transparent);
}

/* Marquages, en pourcentages du terrain (proportions d'un terrain de 105 × 68). */
.pitch__mark {
  position: absolute;
  border: 2px solid var(--lp-line);
  pointer-events: none;
}

.pitch__mark--outline {
  inset: 3% 2%;
}

.pitch__mark--half {
  top: 3%;
  bottom: 3%;
  left: 50%;
  border-width: 0 0 0 2px;
}

.pitch__mark--circle {
  left: 50%;
  top: 50%;
  width: 16%;
  aspect-ratio: 1;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.pitch__mark--spot {
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  border: 0;
  border-radius: 50%;
  background: var(--lp-line);
  transform: translate(-50%, -50%);
}

.pitch__mark--box {
  top: 21%;
  bottom: 21%;
  width: 15%;
}

.pitch__mark--small {
  top: 37%;
  bottom: 37%;
  width: 5%;
}

.pitch__mark--box.pitch__mark--left,
.pitch__mark--small.pitch__mark--left {
  left: 2%;
  border-left-width: 0;
}

.pitch__mark--box.pitch__mark--right,
.pitch__mark--small.pitch__mark--right {
  right: 2%;
  border-right-width: 0;
}

/* ------------------------------------------------------------ joueurs */
.pitch__player {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 104px;
  color: var(--cm-text-primary);
  text-decoration: none;
  /* Le centre de la photo (22 px sous le haut du bloc) sur la case du joueur. */
  transform: translate(-50%, -22px);
}

.pitch__player.is-link {
  cursor: pointer;
}

.pitch__avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--cm-text-primary);
  border: 2px solid rgb(var(--cm-glass-tint) / 0.92);
  box-shadow:
    0 4px 10px var(--lp-shade),
    0 1px 2px var(--lp-shade);
  transition: transform var(--cm-transition), box-shadow var(--cm-transition), border-color var(--cm-transition);
}

.pitch__player.is-link:hover .pitch__avatar {
  transform: scale(1.08);
  box-shadow:
    0 0 0 3px rgb(var(--cm-glass-tint) / 0.55),
    0 6px 14px var(--lp-shade);
}

.pitch__player.is-link:hover .pitch__name {
  text-decoration: underline;
}

/* Indisponible selon FotMob : liseré ambre ; homme du match : liseré or. */
.pitch__avatar.has-warning {
  border-color: var(--cm-warning);
}

.pitch__avatar.is-homme {
  border-color: var(--cm-gold);
  box-shadow:
    0 0 0 3px rgba(var(--cm-gold-rgb) / 0.35),
    0 4px 10px var(--lp-shade);
}

.pitch__avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.pitch__shirt {
  color: var(--lp-pitch);
  font-weight: 800;
  font-size: 15px;
}

/* La note, en pastille à la FotMob : bleu ≥ 9, vert foncé ≥ 8, vert ≥ 7, ambre ≥ 6, rouge en dessous. */
.pitch__rating {
  position: absolute;
  top: -7px;
  right: -20px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cm-bg);
  box-shadow: 0 1px 3px var(--lp-shade);
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

.pitch__warning {
  position: absolute;
  top: -8px;
  left: -10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--cm-warning);
  color: var(--cm-bg);
  font-size: 10px;
  line-height: 1;
  box-shadow: 0 1px 3px var(--lp-shade);
}

.pitch__flag {
  position: absolute;
  left: -7px;
  bottom: -3px;
}

.pitch__flag :deep(img) {
  box-shadow: 0 0 0 1.5px rgb(var(--cm-glass-tint) / 0.9);
}

/* Le nom dans une capsule sombre : lisible quelle que soit la rayure dessous. */
.pitch__name {
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--lp-shade);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pitch__num {
  margin-right: 4px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

/* --------------------------------------------------------- entraîneurs */
.lp__coaches {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-raised);
  font-size: 12.5px;
}

.lp__coaches--seule {
  grid-template-columns: auto minmax(0, 1fr);
}

.lp__coach {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.lp__coach--away {
  text-align: right;
}

.lp__coaches-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

/* ------------------------------------------------------------- légende */
.lp__legend {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.lp__legend-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>
