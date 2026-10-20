<script setup>
/**
 * Feuille de route (étape 5 du plan) — section rose. Le plan CôteMaster en 9 lots
 * et 49 entrées (0, 1 à 5, E, 6 à 47) : pour chaque étape sa pastille d'état,
 * son réglage, sa semaine prévue, sa date de fin, ce qui a changé, le gain
 * mesuré et la note libre de Pierre ; en tête, l'état des sauvegardes et le
 * budget Claude (les composants existants, en variante compacte), une barre
 * d'avancement générale et la ligne « Tests ».
 *
 * Tout est LU (GET /api/roadmap) : le plan et l'historique des étapes terminées
 * sont écrits dans le code du serveur, ni la base, ni le réseau, ni Claude ne sont
 * appelés. Seule écriture : la note de Pierre sur une étape (RoadmapStep).
 * Règles de dessin (ui/DESIGN.md) : bandeau d'ouverture, lots dépliables dans des
 * cartes, structure complète même sans mesure, provenance réelle (fichiers du
 * plan, de l'historique et des notes), jetons uniquement.
 */
import { computed, onMounted, ref } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import BackupStatusPanel from '@/components/settings/BackupStatusPanel.vue';
import ClaudeBudgetPanel from '@/components/settings/ClaudeBudgetPanel.vue';
import RoadmapLot from '@/components/roadmap/RoadmapLot.vue';
import { roadmapApi } from '@/services/roadmapApi.js';
import { formatDateTime } from '@/utils/format.js';
import { phraseDeLAlerteDerive } from '@/utils/versionsMoteur.js';

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await roadmapApi.overview() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}
onMounted(charger);

/** Une note enregistrée : la réponse porte l'état complet, à jour. */
function majDepuis(data) {
  etat.value = { loading: false, error: null, data };
}

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const avancement = computed(() => d.value?.avancement ?? null);
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const jourCourt = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${j}T12:00:00`)) : '');
const jourComplet = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${j}T12:00:00`)) : '');

const pourcent = computed(() => `${(Math.round((avancement.value?.part ?? 0) * 1000) / 10).toLocaleString('fr-FR')} %`);
const largeur = computed(() => `${Math.round((avancement.value?.part ?? 0) * 1000) / 10}%`);

/** La semaine du plan où l'on est, ou pourquoi on n'y est pas. */
const puceSemaine = computed(() => {
  const s = d.value?.plan?.semaineCourante;
  if (!s) return { libelle: 'Semaine du plan non lue', ton: '' };
  if (!s.horsPlan) return { libelle: `Semaine ${s.numero} sur ${d.value.plan.semaines} · ${jourCourt(s.du)} → ${jourCourt(s.au)}`, ton: 'is-info' };
  return s.numero < 1
    ? { libelle: `Le plan commence le ${jourCourt(d.value.plan.debut)}`, ton: '' }
    : { libelle: `Les ${d.value.plan.semaines} semaines du plan sont passées`, ton: 'is-warning' };
});

/** Les quatre états, toujours affichés ; une pastille à zéro reste neutre, la couleur dit qu'il y en a. */
const legende = computed(() => {
  const a = avancement.value;
  const ligne = (cle, singulier, pluriel, ton, icone, n) => ({ cle, libelle: n === 1 ? singulier : pluriel, ton: n ? ton : '', icone, n });
  return [
    ligne('terminee', 'terminée', 'terminées', 'is-accent', 'check', a?.terminees),
    ligne('en-cours', 'en cours', 'en cours', 'is-section', 'play', a?.enCours),
    ligne('mise-de-cote', 'mise de côté', 'mises de côté', 'is-warning', 'pause', a?.miseDeCote),
    ligne('a-faire', 'à faire', 'à faire', '', 'clock', a?.aFaire)
  ];
});

/** La ligne « Tests » : la dernière de l'historique du code ; rouge si un test a cassé. */
const ligneTests = computed(() => {
  if (!d.value) return { ton: '', icone: 'info', texte: 'Tests : état non lu.' };
  const t = d.value.tests;
  if (!t) return { ton: '', icone: 'info', texte: 'Tests : aucun passage noté dans l’historique.' };
  const constats = t.todo ? ` + ${nombre(t.todo)} constat${t.todo > 1 ? 's' : ''} à suivre (non bloquant${t.todo > 1 ? 's' : ''})` : '';
  const echecs = t.echecs ? `, ${nombre(t.echecs)} en échec` : ', aucun échec';
  const quand = ` — dernier passage le ${jourComplet(t.le)}${t.etape ? `, à la fin de l’étape ${t.etape}` : ''}${t.duree ? ` (${t.duree})` : ''}`;
  return {
    ton: t.echecs ? 'is-danger' : 'is-accent',
    icone: t.echecs ? 'alert' : 'check',
    texte: `Tests : ${nombre(t.reussis)} réussis${constats}${echecs}${quand}`
  };
});

const semaineCourante = computed(() => d.value?.plan?.semaineCourante?.numero ?? 0);

/**
 * Les lots ouverts au premier affichage : ceux où une étape est en cours ou
 * prévue cette semaine (faite ou non : on y voit où l'on en est) ; hors du plan,
 * ou si aucun lot ne l'est, le premier lot pas fini.
 */
const lotsOuverts = computed(() => {
  const lots = d.value?.lots ?? [];
  const ouverts = lots.filter((l) =>
    l.etapes.some((e) => e.etat === 'en-cours' || (semaineCourante.value >= e.semaine.debut && semaineCourante.value <= (e.semaine.fin ?? e.semaine.debut)))
  );
  if (ouverts.length) return new Set(ouverts.map((l) => l.numero));
  const premier = lots.find((l) => !l.termine);
  return new Set(premier ? [premier.numero] : []);
});

const notes = computed(() => d.value?.notes ?? null);
const notesEcrivables = computed(() => notes.value?.source !== 'illisible');
const orphelines = computed(() => d.value?.notesOrphelines ?? []);
// Étape 25 (seconde moitié) : l'alerte de dérive du moteur, durable (posée par la calibration du mois), dite en une phrase.
const alerteDerive = computed(() => phraseDeLAlerteDerive(d.value?.alerteDerive));
</script>

<template>
  <div class="roadmap cm-page">
    <!-- Le bandeau : ce que montre la page, l'avancement général et la ligne « Tests ». -->
    <section class="cm-hero roadmap-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="roadmap-hero__logo"><AppIcon name="flag" :size="16" /></span>
          Feuille de route
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip" :class="puceSemaine.ton" title="Le calendrier du plan compte 12 semaines ; la semaine 1 commence le lundi 05/10/2026">
            <AppIcon name="calendar" :size="11" />
            {{ puceSemaine.libelle }}
          </span>
          <span class="cm-chip is-section">
            <AppIcon name="check" :size="11" />
            {{ avancement ? `${nombre(avancement.terminees)} / ${nombre(avancement.total)} étapes terminées` : 'avancement non lu' }}
          </span>
        </span>
      </div>
      <p class="cm-hero__subtitle">
        Le plan CôteMaster en 9 lots et 49 entrées (0, 1 à 5, E, 6 à 47) : où l’on en est, ce qui a changé, ce qui a été mesuré — et vos notes. Rien ici n’appelle la base, Claude
        ni le réseau : le plan et l’historique des étapes terminées sont écrits dans le code, seules vos notes sont enregistrées.
      </p>

      <div class="roadmap-hero__avance">
        <div class="roadmap-hero__ligne">
          <strong>Avancement général</strong>
          <span class="roadmap-hero__chiffre cm-numeric">
            {{ avancement ? `${nombre(avancement.terminees)} étape${avancement.terminees > 1 ? 's' : ''} sur ${nombre(avancement.total)} terminée${avancement.terminees > 1 ? 's' : ''} (${pourcent})` : 'non lu' }}
          </span>
        </div>
        <div class="cm-bar roadmap-hero__barre" role="progressbar" :aria-valuenow="avancement ? avancement.terminees : 0" aria-valuemin="0" :aria-valuemax="avancement ? avancement.total : 49">
          <div class="cm-bar__fill roadmap-hero__remplissage" :style="{ width: avancement ? largeur : '0%' }" />
        </div>
        <div class="roadmap-hero__legende">
          <span v-for="l in legende" :key="l.cle" class="cm-chip" :class="l.ton">
            <AppIcon :name="l.icone" :size="11" />
            {{ avancement ? nombre(l.n) : '—' }} {{ l.libelle }}
          </span>
        </div>
      </div>

      <p class="roadmap-hero__tests" :class="ligneTests.ton">
        <AppIcon :name="ligneTests.icone" :size="14" />
        <span>{{ ligneTests.texte }}</span>
      </p>
    </section>

    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de la feuille de route…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title roadmap__titre--danger">Feuille de route illisible</p>
        <p class="cm-note__text roadmap__texte">{{ etat.error }} — le plan est lu sur le serveur : sans lui, ni les lots ni les étapes ne peuvent s’afficher.</p>
      </div>
    </div>

    <!-- En tête : l'état des sauvegardes (étape 1) et le budget Claude (étape 4), en version courte. -->
    <AppCard
      title="Sauvegardes"
      subtitle="Dernière sauvegarde de la nuit, restauration d'essai, copie hors du disque, place restante — le détail est dans Réglages"
      eyebrow="Sécurité des données"
      icon="shield"
    >
      <BackupStatusPanel variante="compacte" />
    </AppCard>

    <AppCard
      title="Budget Claude"
      subtitle="Les tokens de l'appli, aujourd'hui et cette semaine, face au budget — le détail et le réglage sont dans Réglages"
      eyebrow="Intelligence artificielle"
      icon="cpu"
    >
      <ClaudeBudgetPanel variante="compacte" />
    </AppCard>

    <template v-if="d">
      <div v-if="notes && notes.source === 'illisible'" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
        <div>
          <p class="cm-note__title">Vos notes ne peuvent pas être lues</p>
          <p class="cm-note__text roadmap__texte">
            Le fichier {{ notes.fichier }} est illisible : {{ notes.probleme }}. Vos notes ne sont pas perdues et rien n’y est écrit tant qu’il est illisible : les boutons d’écriture sont
            désactivés. S’il est ouvert ailleurs ou encore envoyé par OneDrive, rechargez la page dans un instant ; sinon renommez-le, puis écrivez une nouvelle note.
          </p>
        </div>
      </div>

      <div v-if="alerteDerive" class="cm-note is-danger">
        <span class="cm-icon-box is-danger"><AppIcon name="activity" :size="16" /></span>
        <div>
          <p class="cm-note__title roadmap__titre--danger">Dérive du moteur</p>
          <p class="cm-note__text roadmap__texte">{{ alerteDerive }} Le détail et la règle sont dans Réglages › Versions du moteur.</p>
        </div>
      </div>

      <h3 class="cm-section-title roadmap__titre-lots">
        Les 9 lots
        <span class="cm-section-title__hint">cliquez sur un lot pour le déplier : ses étapes, ce qui a changé, ce qui a été mesuré, vos notes</span>
      </h3>

      <div class="roadmap__lots">
        <RoadmapLot
          v-for="lot in d.lots"
          :key="lot.numero"
          :lot="lot"
          :reglages="d.reglages"
          :longueur-max="d.notes.longueurMax"
          :notes-ecrivables="notesEcrivables"
          :semaine-courante="semaineCourante"
          :ouvert="lotsOuverts.has(lot.numero)"
          @enregistre="majDepuis"
        />
      </div>

      <div v-if="orphelines.length" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
        <div>
          <p class="cm-note__title">Notes rangées sous une étape qui n’est plus dans le plan</p>
          <ul class="roadmap__orphelines">
            <li v-for="o in orphelines" :key="o.id">
              <strong>Étape « {{ o.id }} »</strong><template v-if="o.note"> : {{ o.note }}</template
              ><template v-else> : mise de côté, sans note</template>
            </li>
          </ul>
          <p class="cm-note__text roadmap__texte">Elles restent dans {{ notes?.fichier }} : le plan a changé de numérotation depuis, rien n’est effacé.</p>
        </div>
      </div>

      <!-- La provenance réelle : où vivent le plan, l'historique et les notes. -->
      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="database" :size="16" /></span>
        <div>
          <p class="cm-note__title">D’où viennent ces données</p>
          <ul class="roadmap__provenance">
            <li>
              <strong>Plan</strong> (9 lots, 49 entrées, réglages, semaines prévues) : <code>{{ d.provenance.plan }}</code>
            </li>
            <li>
              <strong>Étapes terminées</strong> (date, ce qui a changé, mesures, ligne « Tests ») : <code>{{ d.provenance.historique }}</code>
            </li>
            <li>
              <strong>Vos notes</strong> : <code>{{ d.provenance.notes }}</code> —
              <template v-if="notes.source === 'absent'">pas encore de fichier : il sera créé avec la première note.</template>
              <template v-else-if="notes.source === 'illisible'">illisible pour l’instant.</template>
              <template v-else>{{ nombre(notes.nombre) }} note{{ notes.nombre > 1 ? 's' : '' }}, dernier enregistrement le {{ formatDateTime(notes.majLe) }}.</template>
            </li>
            <!-- Étape 16 : le registre du garde-fou de la mesure. Absent d'un serveur pas encore relancé après la recopie : pas de ligne plutôt qu'une page cassée. -->
            <li v-if="d.mesureRegistre">
              <strong>Preuve après lancement</strong> (dates de lancement, variantes essayées, jugements) : <code>{{ d.provenance.registre }}</code> —
              <template v-if="d.mesureRegistre.source === 'absent'">pas encore de fichier : il sera créé au premier démarrage de l’appli avec une version déclarée.</template>
              <template v-else-if="d.mesureRegistre.source === 'illisible'">illisible pour l’instant.</template>
              <template v-else>{{ nombre(d.mesureRegistre.nombre) }} jugement{{ d.mesureRegistre.nombre > 1 ? 's' : '' }}, dernier enregistrement le {{ formatDateTime(d.mesureRegistre.majLe) }}.</template>
            </li>
            <li><strong>Sauvegardes</strong> : <code>/api/backups</code> · <strong>Budget Claude</strong> : <code>/api/claude-budget</code></li>
          </ul>
          <p class="roadmap__pied">État lu le {{ formatDateTime(d.genereLe) }}. Le plan et l’historique voyagent avec le code ; les notes et le registre de la mesure restent sur ce PC, dans les données de l’appli.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.roadmap {
  container: roadmap / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.roadmap-hero__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.6));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

.roadmap-hero__avance {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.roadmap-hero__ligne {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--cm-text-primary);
}

.roadmap-hero__chiffre {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.roadmap-hero__barre {
  height: 10px;
}

.roadmap-hero__remplissage {
  background: var(--cm-accent);
}

.roadmap-hero__legende {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* La ligne « Tests » : verte tant que rien n'est cassé, rouge sinon. */
.roadmap-hero__tests {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.roadmap-hero__tests :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.roadmap-hero__tests.is-accent {
  color: var(--cm-accent);
}

.roadmap-hero__tests.is-danger {
  color: var(--cm-danger);
}

/* ------------------------------------------------------------- le reste */
.roadmap__titre--danger {
  color: var(--cm-danger);
}

.roadmap__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.roadmap__titre-lots {
  margin-top: 4px;
}

.roadmap__lots {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.roadmap__orphelines,
.roadmap__provenance {
  margin: 2px 0 6px;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.roadmap__provenance code {
  font-family: var(--cm-font-mono);
  font-size: 11.5px;
  color: var(--cm-text-primary);
}

.roadmap__pied {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}
</style>
