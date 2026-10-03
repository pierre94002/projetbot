<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import { liveNow } from '@/utils/liveClock.js';

/**
 * D'où viennent VRAIMENT les rencontres de la liste (03/10/2026, Pierre :
 * « il faut que tu me mettes le vrai endroit des données » devant la pilule
 * « Source : Cotes marché (Odds API) »).
 *
 * La source « odds-api » n'appelle aucune API : elle lit sur ce PC le
 * calendrier FotMob (la plupart des rencontres, sans cotes) et le dernier
 * relevé de cotes The Odds API, fait à la main parce qu'il est payant. La
 * pilule le dit, avec la date de ce relevé (en ambre passé un jour) ; un clic
 * ouvre le détail : chaque donnée, son fournisseur, son fichier exact, sa
 * date, le nombre de rencontres de la liste qu'elle fournit — et le choix du
 * jeu de données (réel ou test), qu'assurait la liste déroulante d'avant.
 *
 * Sans `origins` (serveur pas encore relancé avec cette version), la pilule
 * et les comptes restent justes ; seuls les chemins et la date du calendrier
 * manquent. L'alignement du panneau (à droite, à gauche, pleine largeur) est
 * réglé par la barre qui accueille le composant, selon sa mise en page.
 */
const props = defineProps({
  options: { type: Array, required: true }, // [{ value, label }] : les jeux de données
  origins: { type: Object, default: null }, // /api/sources → origins
  fixtures: { type: Object, default: null }, // /api/sources → fixtures (date du relevé de cotes, en repli)
  matches: { type: Array, default: () => [] } // les rencontres chargées
});

const source = defineModel({ required: true });

const ouvert = ref(false);
const racine = ref(null);
const bouton = ref(null);
const panneauId = useId();

const JOUR_MS = 86_400_000;
const LIBELLES_COURTS = { 'odds-api': 'Données réelles', sample: 'Jeu de test' };

const reel = computed(() => source.value === 'odds-api');
const libelle = computed(() => props.options.find((o) => o.value === source.value)?.label ?? source.value);
const court = (option) => LIBELLES_COURTS[option.value] ?? option.label;

// ------------------------------------------------------------ comptes
const total = computed(() => props.matches.length);
const avecCotes = computed(() => props.matches.filter((m) => m.hasOdds !== false));
const sansCotes = computed(() => props.matches.filter((m) => m.hasOdds === false).length);
const coteesAVenir = computed(() => avecCotes.value.filter((m) => Date.parse(m.commenceTime) > liveNow.value).length);

// ------------------------------------------------------------- dates
const releve = computed(() => props.origins?.odds?.updatedAt ?? props.fixtures?.oddsLastSyncedAt ?? null);
const cotesVieilles = computed(() => Boolean(releve.value) && liveNow.value - Date.parse(releve.value) >= JOUR_MS);

const format = (iso, options) => new Intl.DateTimeFormat('fr-FR', options).format(new Date(iso));

/** « 21/09 » (avec l'année si ce n'est pas celle d'aujourd'hui). */
function jourMois(iso) {
  const autreAnnee = new Date(iso).getFullYear() !== new Date(liveNow.value).getFullYear();
  return format(iso, { day: '2-digit', month: '2-digit', ...(autreAnnee ? { year: 'numeric' } : {}) });
}

/** « le 21/09 à 18:35 ». */
const quand = (iso) => `le ${jourMois(iso)} à ${format(iso, { hour: '2-digit', minute: '2-digit' })}`;

/** « aujourd'hui », « hier », « il y a 12 jours » — en jours du calendrier. */
function ilYA(iso) {
  const minuit = (t) => new Date(t).setHours(0, 0, 0, 0);
  const jours = Math.round((minuit(liveNow.value) - minuit(Date.parse(iso))) / JOUR_MS);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

// ------------------------------------------------------------ chemins
/** Les dossiers d'un chemin, chacun avec son séparateur : la ligne se coupe entre deux. */
const morceaux = (chemin) => chemin.match(/[^\\/]*[\\/]/g) ?? [];
const nomDeFichier = (chemin) => chemin.split(/[\\/]/).pop();

// ------------------------------------------------- les lignes du détail
/**
 * Une ligne par donnée : icône, nom, fournisseur, ce qu'elle apporte, sa
 * date, son fichier, et combien de rencontres de la liste elle fournit.
 */
const lignes = computed(() => {
  const o = props.origins ?? {};
  if (!reel.value) {
    return [
      {
        cle: 'sample',
        icone: 'file',
        ton: 'is-muted',
        nom: 'Jeu de test',
        fournisseur: 'généré sur ce PC',
        texte: `Rencontres et cotes fictives, à régénérer dans Réglages › Données.${o.sample?.updatedAt ? ` Généré ${quand(o.sample.updatedAt)}.` : ''}`,
        fichier: o.sample?.file ?? null,
        compte: total.value
      }
    ];
  }
  return [
    {
      cle: 'calendar',
      icone: 'calendar',
      ton: 'is-accent',
      nom: 'Calendrier et résultats',
      fournisseur: 'FotMob',
      texte: `Les rencontres sans cotes, et les reports.${o.calendar?.updatedAt ? ` Fichier mis à jour ${quand(o.calendar.updatedAt)}.` : ''}`,
      fichier: o.calendar?.file ?? null,
      compte: sansCotes.value
    },
    {
      cle: 'odds',
      icone: 'percent',
      ton: cotesVieilles.value ? 'is-warning' : 'is-info',
      nom: 'Cotes 1 / N / 2',
      fournisseur: 'The Odds API',
      payant: true,
      vieux: cotesVieilles.value,
      texte: releve.value ? 'Relevées à la main' : 'Aucun relevé de cotes sur ce PC.',
      accent: releve.value ? `${quand(releve.value)}, ${ilYA(releve.value)}` : null,
      // « ; 150 encore à venir » seulement si certaines ont déjà commencé.
      suite: releve.value ? (coteesAVenir.value < avecCotes.value.length ? ` ; ${coteesAVenir.value} encore à venir.` : '.') : '',
      fichier: o.odds?.file ?? null,
      compte: avecCotes.value.length,
      lien: true
    },
    {
      cle: 'store',
      icone: 'database',
      ton: 'is-violet',
      nom: 'Formes, statistiques, classements, compositions',
      fournisseur: 'FotMob',
      texte: "Le magasin local, une base SQLite tenue à jour par l'actualisation automatique.",
      fichier: o.store?.file ?? null,
      compte: null
    }
  ];
});

const titrePilule = computed(() => {
  const base = `Source de données : ${libelle.value}.`;
  if (!reel.value || !releve.value) return `${base} Cliquer pour voir d'où vient chaque donnée.`;
  return `${base} Cotes relevées ${quand(releve.value)} (${ilYA(releve.value)}). Cliquer pour voir d'où vient chaque donnée.`;
});

// -------------------------------------------------- ouverture, fermeture
// Écouteurs sur le document plutôt qu'un voile `position: fixed` : dans une
// carte au fond flouté (backdrop-filter), un tel voile ne couvre que la
// carte, et un clic sur le bandeau ou la barre latérale ne fermait rien.
function fermer({ rendreLeFocus = false } = {}) {
  ouvert.value = false;
  if (rendreLeFocus) bouton.value?.focus();
}

function auClicDehors(event) {
  if (!racine.value?.contains(event.target)) fermer();
}

function auClavier(event) {
  if (event.key === 'Escape') fermer({ rendreLeFocus: true });
}

function ecouter(oui) {
  const methode = oui ? 'addEventListener' : 'removeEventListener';
  document[methode]('pointerdown', auClicDehors, true);
  document[methode]('keydown', auClavier);
}

watch(ouvert, ecouter);
onBeforeUnmount(() => ecouter(false));
</script>

<template>
  <div ref="racine" class="origin" :class="{ 'is-open': ouvert }">
    <button
      ref="bouton"
      type="button"
      class="origin__pill"
      aria-haspopup="dialog"
      :aria-expanded="ouvert"
      :aria-controls="panneauId"
      :title="titrePilule"
      @click="ouvert = !ouvert"
    >
      <AppIcon name="database" :size="15" class="origin__pill-icon" />
      <span class="origin__pill-text">{{ libelle }}</span>
      <span v-if="reel && releve" class="origin__pill-date" :class="{ 'is-old': cotesVieilles }">
        <AppIcon name="clock" :size="11" />{{ jourMois(releve) }}
      </span>
      <AppIcon name="chevronDown" :size="13" class="origin__caret" />
    </button>

    <Transition name="origin-pop">
      <div v-if="ouvert" :id="panneauId" class="origin__panel" role="dialog" aria-label="Source de données">
        <header class="origin__head">
          <span class="origin__eyebrow">Source de données</span>
          <p class="origin__title">
            <template v-if="total">D'où viennent les {{ total }} rencontre{{ total > 1 ? 's' : '' }} de la liste</template>
            <template v-else>D'où viennent les rencontres de la liste</template>
          </p>
          <p v-if="reel" class="origin__lead">Tout est lu sur ce PC : « Actualiser » relit ces fichiers, sans aucun appel payant.</p>
          <p v-else class="origin__lead">Des rencontres fictives, générées sur ce PC pour essayer le moteur.</p>
        </header>

        <ul class="origin__list">
          <li v-for="ligne in lignes" :key="ligne.cle" class="origin__item" :class="{ 'is-old': ligne.vieux }">
            <span class="cm-icon-box is-sm" :class="ligne.ton"><AppIcon :name="ligne.icone" :size="14" /></span>
            <div class="origin__body">
              <p class="origin__name">
                {{ ligne.nom }}
                <span class="origin__provider">{{ ligne.fournisseur }}</span>
                <span v-if="ligne.payant" class="origin__paid">payant</span>
              </p>
              <p class="origin__meta">
                {{ ligne.texte }}<template v-if="ligne.accent">{{ ' ' }}<span class="origin__when">{{ ligne.accent }}</span>{{ ligne.suite }}</template>
              </p>
              <!-- Le vrai endroit : le chemin complet ; un clic le sélectionne en entier. -->
              <p v-if="ligne.fichier" class="origin__path" :title="`${ligne.fichier} — un clic sélectionne le chemin`">
                <AppIcon name="folder" :size="11" />
                <span class="origin__path-text"><template v-for="(morceau, i) in morceaux(ligne.fichier)" :key="i">{{ morceau }}<wbr /></template><b>{{ nomDeFichier(ligne.fichier) }}</b></span>
              </p>
              <RouterLink v-if="ligne.lien" :to="{ name: 'settings' }" class="origin__link" @click="fermer()">
                Relever les cotes : Réglages › Données <AppIcon name="arrowRight" :size="11" />
              </RouterLink>
            </div>
            <span v-if="ligne.compte !== null" class="origin__count">
              <strong>{{ ligne.compte }}</strong><small>rencontre{{ ligne.compte > 1 ? 's' : '' }}</small>
            </span>
          </li>
        </ul>

        <!-- Le choix du jeu de données (l'ancienne liste déroulante « Source de données »). -->
        <footer v-if="options.length > 1" class="origin__foot">
          <span class="origin__foot-label">Jeu de données</span>
          <div class="origin__switch" role="radiogroup" aria-label="Source de données">
            <button
              v-for="option in options"
              :key="option.value"
              type="button"
              role="radio"
              class="origin__switch-btn"
              :class="{ 'is-active': option.value === source }"
              :aria-checked="option.value === source"
              :title="option.label"
              @click="source = option.value"
            >
              {{ court(option) }}
            </button>
          </div>
        </footer>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.origin {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

/* ------------------------------------------------------------- la pilule */
/* Même gabarit que les champs-pilules de la barre (36 px, bord fin, verre). */
.origin__pill {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 12px 0 13px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--cm-transition), background var(--cm-transition), box-shadow var(--cm-transition);
}

.origin__pill:hover {
  border-color: var(--cm-border);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.origin__pill:focus-visible,
.origin.is-open .origin__pill {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.16);
  outline: none;
}

.origin__pill-icon {
  flex-shrink: 0;
  color: var(--cm-section);
}

.origin__pill-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* La date du relevé de cotes : neutre le jour même, ambre ensuite. */
.origin__pill-date {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.origin__pill-date.is-old {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.origin__caret {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.origin.is-open .origin__caret {
  transform: rotate(180deg);
  color: var(--cm-section);
}

/* ------------------------------------------------------------- le panneau */
.origin__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  width: 460px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border);
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(var(--cm-section-rgb) / 0.07), transparent 60%),
    var(--cm-surface-raised);
  box-shadow: var(--cm-shadow-lg);
  cursor: auto;
}

.origin-pop-enter-active,
.origin-pop-leave-active {
  transition: opacity 160ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.origin-pop-enter-from,
.origin-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.origin__head {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 2px 12px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.origin__eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--cm-section);
}

.origin__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.origin__lead {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------- les lignes */
.origin__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.origin__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--cm-radius);
  transition: background var(--cm-transition);
}

.origin__item:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.origin__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.origin__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.origin__provider,
.origin__paid {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.origin__provider {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.origin__paid {
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
}

.origin__meta {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.origin__item.is-old .origin__when {
  color: var(--cm-warning);
  font-weight: 600;
}

/* Le chemin complet, le nom du fichier en clair ; coupé entre deux dossiers,
   et sélectionné en entier d'un clic, prêt à coller dans l'Explorateur. */
.origin__path {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 3px 0 0;
  padding: 6px 8px;
  border-radius: var(--cm-radius-xs);
  background: var(--cm-surface);
  font-family: var(--cm-font-mono);
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.origin__path :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.origin__path-text {
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: all;
  cursor: text;
}

.origin__path-text b {
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.origin__link {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-section);
  text-decoration: none;
}

.origin__link:hover {
  text-decoration: underline;
}

/* Combien de rencontres de la liste cette donnée fournit. */
.origin__count {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 56px;
}

.origin__count strong {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.origin__count small {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* ------------------------------------------- le choix du jeu de données */
.origin__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
  padding: 12px 2px 0;
  border-top: 1px solid var(--cm-border-soft);
}

.origin__foot-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* Barre segmentée, même dessin que les raccourcis de dates. */
.origin__switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.origin__switch-btn {
  height: 26px;
  padding: 0 12px;
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

.origin__switch-btn:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.origin__switch-btn.is-active,
.origin__switch-btn.is-active:hover {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}
</style>
