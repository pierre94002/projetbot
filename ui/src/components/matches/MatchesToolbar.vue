<script setup>
import { ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import DataOriginMenu from './DataOriginMenu.vue';

/**
 * La barre de commande de la liste des matchs (03/10/2026, Pierre : « il
 * faut faire quelque chose de mieux que ça » devant l'ancienne carte de
 * commandes — trois champs à libellé et un bouton posés comme un
 * formulaire). Elle coiffe la carte de la liste, en deux rangées :
 * - la recherche (équipe, puis championnat) dans des champs-pilules à icône,
 *   la provenance des données (DataOriginMenu : « le vrai endroit des
 *   données », avec le choix du jeu de données) et le bouton Actualiser ;
 * - le filtre de dates (passé en contenu), et à droite le chargement des
 *   formes avec sa précision (magasin local, aucun appel facturé).
 * Mêmes données et mêmes actions qu'avant : la logique vit dans MatchesView,
 * cette barre ne fait que présenter et relayer.
 *
 * Deux conteneurs de requêtes : `toolbar` (la largeur de la carte) règle les
 * rangées ; `filterbar` (la largeur laissée aux dates) règle le filtre.
 */
defineProps({
  sources: { type: Array, required: true }, // [{ value, label }] : les jeux de données
  origins: { type: Object, default: null }, // d'où vient chaque donnée (/api/sources)
  fixtures: { type: Object, default: null }, // état des instantanés (/api/sources)
  matches: { type: Array, default: () => [] }, // les rencontres chargées, pour les comptes de provenance
  loading: { type: Boolean, default: false },
  loadingForm: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh', 'load-form']);

const search = defineModel('search', { type: String, default: '' });
const league = defineModel('league', { type: String, default: '' });
const source = defineModel('source', { required: true });

// La croix vide le champ et lui rend le focus : le bouton qu'on vient
// d'actionner disparaît (v-if), le focus serait sinon perdu. Échap fait de même.
const champEquipe = ref(null);
const champChampionnat = ref(null);

function viderEquipe() {
  search.value = '';
  champEquipe.value?.focus();
}

function viderChampionnat() {
  league.value = '';
  champChampionnat.value?.focus();
}
</script>

<template>
  <div class="toolbar">
    <!-- Rangée 1 : ce qu'on cherche, d'où viennent les données, actualiser. -->
    <div class="toolbar__row toolbar__row--commands">
      <label class="toolbar__field toolbar__field--team" :class="{ 'is-filled': search }" title="Recherche par équipe">
        <AppIcon name="search" :size="15" class="toolbar__field-icon" />
        <input
          ref="champEquipe"
          v-model="search"
          type="text"
          class="toolbar__input"
          placeholder="Rechercher une équipe…"
          aria-label="Recherche par équipe"
          @keydown.esc="viderEquipe"
        />
        <button v-if="search" type="button" class="toolbar__clear" title="Effacer la recherche" aria-label="Effacer la recherche" @click="viderEquipe">
          <AppIcon name="x" :size="12" />
        </button>
      </label>

      <label class="toolbar__field toolbar__field--league" :class="{ 'is-filled': league }" title="Recherche par championnat (ex. La Liga)">
        <AppIcon name="trophy" :size="15" class="toolbar__field-icon" />
        <input
          ref="champChampionnat"
          v-model="league"
          type="text"
          class="toolbar__input"
          placeholder="Championnat…"
          aria-label="Recherche par championnat"
          @keydown.esc="viderChampionnat"
        />
        <button v-if="league" type="button" class="toolbar__clear" title="Effacer le championnat" aria-label="Effacer le championnat" @click="viderChampionnat">
          <AppIcon name="x" :size="12" />
        </button>
      </label>

      <DataOriginMenu v-model="source" class="toolbar__origin" :options="sources" :origins="origins" :fixtures="fixtures" :matches="matches" />

      <!-- Pendant le chargement, la roue remplace l'icône : le bouton garde sa largeur. -->
      <AppButton variant="primary" class="toolbar__refresh" :loading="loading" @click="emit('refresh')">
        <template v-if="!loading" #icon><AppIcon name="refresh" :size="15" /></template>
        Actualiser
      </AppButton>
    </div>

    <!-- Rangée 2 : le filtre de dates, puis les formes en second plan. -->
    <div class="toolbar__row toolbar__row--filters">
      <div class="toolbar__dates"><slot /></div>
      <div class="toolbar__aside">
        <AppButton variant="secondary" size="sm" class="toolbar__forms" :loading="loadingForm" @click="emit('load-form')">
          <template v-if="!loadingForm" #icon><AppIcon name="trendUp" :size="14" /></template>
          Charger les formes
        </AppButton>
        <span class="toolbar__hint"><AppIcon name="database" :size="12" />Lu dans le magasin local (FotMob) — aucun appel facturé.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tête de la carte de la liste : un voile couleur de section qui s'éteint
   vers le bas, les coins hauts au rayon INTÉRIEUR de la carte (bord de 1 px).
   Au-dessus de la liste qui suit (z-index) : le panneau de provenance et la
   liste des jours passent par-dessus ses en-têtes collants. */
.toolbar {
  container: toolbar / inline-size;
  position: relative;
  z-index: 3;
  border-bottom: 1px solid var(--cm-border-soft);
  border-radius: calc(var(--cm-radius-lg) - 1px) calc(var(--cm-radius-lg) - 1px) 0 0;
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.075), rgba(var(--cm-section-rgb) / 0.02) 65%, transparent);
}

.toolbar__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
}

.toolbar__row--filters {
  gap: 10px 14px;
  padding: 11px 16px 12px;
  border-top: 1px solid var(--cm-border-soft);
}

/* ------------------------------------------------------- champs-pilules */
.toolbar__field {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  min-width: 0;
  padding: 0 8px 0 13px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  cursor: text;
  transition: border-color var(--cm-transition), background var(--cm-transition), box-shadow var(--cm-transition);
}

.toolbar__field:hover {
  border-color: var(--cm-border);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.toolbar__field:focus-within {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.16);
}

/* Un filtre en cours : le champ garde le liseré de section, comme la date choisie. */
.toolbar__field.is-filled {
  border-color: rgba(var(--cm-section-rgb) / 0.4);
}

.toolbar__field--team {
  flex: 2 1 210px;
}

.toolbar__field--league {
  flex: 1.4 1 180px;
}

/* La provenance : sa largeur naturelle, mais elle cède (texte tronqué) plutôt
   que de pousser le bouton sur une autre ligne. */
.toolbar__origin {
  flex: 0 1 auto;
}

.toolbar__field-icon {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transition: color var(--cm-transition);
}

.toolbar__field:focus-within .toolbar__field-icon,
.toolbar__field.is-filled .toolbar__field-icon {
  color: var(--cm-section);
}

.toolbar__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--cm-text-primary);
  outline: none;
}

.toolbar__input::placeholder {
  color: var(--cm-text-muted);
}

/* La croix qui vide le champ, visible dès qu'il y a du texte. */
.toolbar__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-3));
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.toolbar__clear:hover {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

/* --------------------------------------------------------------- boutons */
/* Les boutons prennent la forme pilule des champs qui les entourent. */
.toolbar .toolbar__refresh {
  flex-shrink: 0;
  height: 36px;
  margin-left: auto;
  padding: 0 18px;
  border-radius: 999px;
}

.toolbar .toolbar__forms {
  height: 32px;
  border-radius: 999px;
}

/* ---------------------------------------------------- rangée des filtres */
/* Le filtre de dates prend toute la place que les formes lui laissent (base
   0 : sa racine est un conteneur de taille, sans largeur propre) ; ses deux
   groupes (raccourcis, jour par jour) se suivent au lieu de s'écarter aux
   deux bords. */
.toolbar__dates {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
}

.toolbar__dates :deep(.filter-bar) {
  flex: 1;
  justify-content: flex-start;
}

/* Les formes, à droite : le bouton et, dessous, sa précision. */
.toolbar__aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 5px;
  margin-left: auto;
}

.toolbar__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

/* ---------------------------------------------------------- adaptations */
/* Large : les formes et leur précision sur une seule ligne, à droite
   (dates ≈ 526 px + formes ≈ 515 px + marges). */
@container toolbar (min-width: 1100px) {
  .toolbar__aside {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .toolbar__hint {
    font-size: 11.5px;
  }
}

/* Les dates n'ont plus la place à côté des formes (dates ≈ 526 px + formes
   en colonne ≈ 320 px + marges) : les formes passent dessous, sur toute la
   ligne, le bouton puis sa précision. */
@container toolbar (max-width: 900px) {
  .toolbar__dates {
    flex-basis: 100%;
  }

  .toolbar__aside {
    flex-basis: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin-left: 0;
  }
}

/* Moyen : les deux recherches sur la première ligne, la provenance (qui
   s'étire) et Actualiser ensemble sur la seconde — jamais le bouton seul. */
@container toolbar (max-width: 940px) {
  .toolbar__field--team,
  .toolbar__field--league {
    flex: 1 1 calc(50% - 5px);
  }

  .toolbar__origin {
    flex: 1 1 auto;
  }

  /* La provenance part du bord gauche : son panneau s'ouvre vers la droite. */
  .toolbar__origin :deep(.origin__panel) {
    left: 0;
    right: auto;
  }
}

/* Étroit : une commande par ligne, sur toute la largeur. */
@container toolbar (max-width: 540px) {
  .toolbar__field--team,
  .toolbar__field--league,
  .toolbar__origin {
    flex-basis: 100%;
  }

  .toolbar .toolbar__refresh {
    width: 100%;
    margin-left: 0;
  }

  .toolbar__hint {
    white-space: normal;
  }

  /* Le panneau de provenance sur toute la largeur de la pilule. */
  .toolbar__origin :deep(.origin__panel) {
    right: 0;
    width: auto;
  }
}
</style>
