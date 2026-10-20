<script setup>
/**
 * Une étape du plan sur la feuille de route (étape 5 du plan) : son numéro et
 * son nom exact, sa pastille d'état (à faire / en cours / terminée / mise de
 * côté), son réglage, sa semaine prévue, sa date de fin, ce qui a changé, le
 * gain mesuré — « pas encore mesuré » tant qu'il ne l'est pas — et la note
 * libre de Pierre, modifiable et enregistrée sur le serveur.
 *
 * Tout vient de GET /api/roadmap (le plan et l'historique sont écrits dans le
 * code du serveur). Seule écriture : la note (PUT /api/roadmap/etapes/:id/note,
 * idempotent). Un texte en cours de saisie vit dans useBrouillonsNotes : replier
 * le lot ne le perd pas.
 * Règles de dessin (ui/DESIGN.md) : la structure est complète même sans mesure
 * (chaque case dit ce qui manque, jamais un simple tiret), couleurs
 * sémantiques (vert = terminée), jetons uniquement.
 *
 * Étape 16 (07/10/2026) : pour une étape qui touche aux chiffres, le bloc
 * « Preuve après lancement » — lancement, matchs jugés, gain et fourchette,
 * variantes essayées, verdict —, toujours ses cinq lignes, mises en forme par
 * utils/preuve.js à partir de `etape.mesure` (le juge du serveur a tout décidé).
 */
import { computed, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextarea from '@/components/common/AppTextarea.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { roadmapApi } from '@/services/roadmapApi.js';
import { useBrouillonsNotes } from '@/composables/useBrouillonsNotes.js';
import { formatDateTime } from '@/utils/format.js';
import { lignesPreuve } from '@/utils/preuve.js';

const props = defineProps({
  etape: { type: Object, required: true },
  /** Les réglages du plan (lettre, nom court, détail) : le même tableau pour toute la page. */
  reglages: { type: Array, default: () => [] },
  /** Taille maximale d'une note, donnée par le serveur. */
  longueurMax: { type: Number, default: 4000 },
  /** Faux quand le fichier des notes est illisible : la lecture reste, l'écriture est refusée. */
  notesEcrivables: { type: Boolean, default: true },
  /** La semaine du plan où l'on est (0 ou 13 et plus hors du plan). */
  semaineCourante: { type: Number, default: 0 }
});

const emit = defineEmits(['enregistre']);

// ------------------------------------------------------------ présentation
const ETATS = {
  'a-faire': { libelle: 'À faire', ton: '', icone: 'clock' },
  'en-cours': { libelle: 'En cours', ton: 'is-section', icone: 'play' },
  terminee: { libelle: 'Terminée', ton: 'is-accent', icone: 'check' },
  'mise-de-cote': { libelle: 'Mise de côté', ton: 'is-warning', icone: 'pause' }
};
const etat = computed(() => ETATS[props.etape.etat] ?? { libelle: props.etape.etat, ton: '', icone: 'info' });

const reglage = computed(() => props.reglages.find((r) => r.code === props.etape.reglage) ?? { code: props.etape.reglage, court: props.etape.reglage, detail: '' });

const jourCourt = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${j}T12:00:00`)) : '');
const jourComplet = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${j}T12:00:00`)) : '');

const semaine = computed(() => {
  const s = props.etape.semaine;
  return {
    libelle: s.fin ? `Semaines ${s.debut} à ${s.fin}` : `Semaine ${s.debut}`,
    depuis: `dès le ${jourCourt(s.du)}`
  };
});

/** Prévue cette semaine et à faire ou en cours (ni terminée ni mise de côté) : la pastille « cette semaine ». */
const cetteSemaine = computed(() => {
  const s = props.etape.semaine;
  return ['a-faire', 'en-cours'].includes(props.etape.etat) && props.semaineCourante >= s.debut && props.semaineCourante <= (s.fin ?? s.debut);
});

const dateFin = computed(() => {
  if (!props.etape.fin) return null;
  return `${jourComplet(props.etape.fin)}${props.etape.heureFin ? ` · ${props.etape.heureFin}` : ''}`;
});

const lignes = computed(() => props.etape.historique ?? []);
const mesures = computed(() => lignes.value.filter((l) => l.mesure));

/** La preuve après lancement (étape 16) : null pour une étape qui ne touche pas aux chiffres (pas de bloc). */
const preuve = computed(() => lignesPreuve(props.etape.mesure));

// ------------------------------------------------------------- la note
const brouillons = useBrouillonsNotes();
const enEdition = computed(() => brouillons[props.etape.id] !== undefined);
const envoi = ref({ loading: false, error: null });
const message = ref('');

const noteEnregistree = computed(() => props.etape.note?.texte ?? '');
const texteSaisi = computed({
  get: () => brouillons[props.etape.id] ?? '',
  set: (valeur) => {
    brouillons[props.etape.id] = valeur;
    message.value = '';
    envoi.value = { loading: false, error: null };
  }
});
/** Le texte tel que le serveur le range : fins de ligne unifiées, espaces de bord retirés. */
const texteRange = computed(() => texteSaisi.value.replace(/\r\n?/g, '\n').trim());
const modifiee = computed(() => texteRange.value !== noteEnregistree.value);
const tropLongue = computed(() => texteRange.value.length > props.longueurMax);
const compteur = computed(() => `${texteRange.value.length.toLocaleString('fr-FR')} / ${props.longueurMax.toLocaleString('fr-FR')} caractères`);

function ecrire() {
  brouillons[props.etape.id] = noteEnregistree.value;
  message.value = '';
  envoi.value = { loading: false, error: null };
}

function annuler() {
  delete brouillons[props.etape.id];
  envoi.value = { loading: false, error: null };
}

async function enregistrer() {
  envoi.value = { loading: true, error: null };
  const efface = texteRange.value === '';
  try {
    const data = await roadmapApi.saveNote(props.etape.id, texteSaisi.value);
    delete brouillons[props.etape.id];
    envoi.value = { loading: false, error: null };
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    message.value = data.enregistrement?.change ? `Note ${efface ? 'effacée' : 'enregistrée'} à ${heure}.` : 'Rien à changer : cette note est déjà enregistrée.';
    emit('enregistre', data);
  } catch (error) {
    envoi.value = { loading: false, error: error.message };
  }
}
</script>

<template>
  <article class="rstep cm-block" :class="`is-${etape.etat}`" :data-etape="etape.id">
    <header class="rstep__tete">
      <span class="rstep__num cm-numeric" :title="`Étape ${etape.id}`">{{ etape.id }}</span>
      <h4 class="rstep__nom">{{ etape.nom }}</h4>
      <span class="rstep__pastilles">
        <span v-if="cetteSemaine" class="cm-chip is-info" title="Cette étape est prévue pour la semaine du plan où l'on est">cette semaine</span>
        <span class="cm-chip" :class="etat.ton">
          <AppIcon :name="etat.icone" :size="11" />
          {{ etat.libelle }}
        </span>
      </span>
    </header>

    <dl class="rstep__faits">
      <div class="rstep__fait">
        <dt>Réglage</dt>
        <dd :title="reglage.detail">
          <span class="cm-pill is-section rstep__lettre">{{ reglage.code }}</span>
          {{ reglage.court }}
        </dd>
      </div>
      <div class="rstep__fait">
        <dt>Semaine prévue</dt>
        <dd>
          {{ semaine.libelle }}
          <small class="rstep__petit">{{ semaine.depuis }}</small>
        </dd>
      </div>
      <div class="rstep__fait">
        <dt>Durée prévue</dt>
        <dd>{{ etape.heures }}</dd>
      </div>
      <div class="rstep__fait">
        <dt>Date de fin</dt>
        <dd>
          <template v-if="dateFin">{{ dateFin }}</template>
          <span v-else class="rstep__manque">{{ etape.etat === 'mise-de-cote' ? 'mise de côté, pas terminée' : 'pas encore terminée' }}</span>
        </dd>
      </div>
    </dl>
    <p v-if="etape.semaine.precision" class="rstep__precision">
      <AppIcon name="info" :size="12" />
      <span>{{ etape.semaine.precision }}</span>
    </p>

    <div class="rstep__corps">
      <section class="rstep__bloc">
        <h5 class="cm-eyebrow">Ce qui a changé</h5>
        <ul v-if="lignes.length" class="rstep__lignes">
          <li v-for="(l, i) in lignes" :key="i">
            <span class="rstep__petit">{{ jourComplet(l.fin) }}<template v-if="l.heure"> · {{ l.heure }}</template></span>
            <strong v-if="l.titre" class="rstep__titre-ligne">{{ l.titre }}</strong>
            <span class="rstep__texte">{{ l.change }}</span>
          </li>
        </ul>
        <p v-else class="rstep__manque">Rien n’a encore changé : l’étape n’est pas terminée.</p>
      </section>
      <section class="rstep__bloc">
        <h5 class="cm-eyebrow">Gain mesuré</h5>
        <ul v-if="mesures.length" class="rstep__lignes">
          <li v-for="(l, i) in mesures" :key="i">
            <strong v-if="l.titre" class="rstep__titre-ligne">{{ l.titre }}</strong>
            <span class="rstep__texte">{{ l.mesure }}</span>
          </li>
        </ul>
        <p v-else class="rstep__manque">pas encore mesuré</p>
      </section>
    </div>

    <!-- La preuve après lancement (étape 16) : seulement quand l'étape a une mesure, et alors toujours ses cinq lignes. -->
    <section v-if="preuve" class="rstep__preuve">
      <h5 class="cm-eyebrow rstep__preuve-titre">
        Preuve après lancement
        <HelpTip terme="preuve-apres-lancement" />
      </h5>
      <dl class="rstep__preuve-lignes">
        <div class="rstep__preuve-ligne">
          <dt>Lancement</dt>
          <dd :class="{ rstep__manque: preuve.lancement.manque }">{{ preuve.lancement.texte }}</dd>
        </div>
        <div class="rstep__preuve-ligne">
          <dt>Matchs jugés</dt>
          <dd :class="{ rstep__manque: preuve.matchs.manque }">{{ preuve.matchs.texte }}</dd>
        </div>
        <div class="rstep__preuve-ligne">
          <dt>
            Gain et fourchette
            <HelpTip terme="fourchette-du-hasard" />
          </dt>
          <dd v-if="preuve.gain.valeur">
            <strong class="cm-numeric">{{ preuve.gain.valeur }}</strong>
            {{ preuve.gain.reste }}
          </dd>
          <dd v-else class="rstep__manque">{{ preuve.gain.texte }}</dd>
        </div>
        <div class="rstep__preuve-ligne">
          <dt>
            Variantes essayées
            <HelpTip terme="variantes-essayees" />
          </dt>
          <dd :class="{ rstep__manque: preuve.variantes.manque }">{{ preuve.variantes.texte }}</dd>
        </div>
        <div class="rstep__preuve-ligne rstep__preuve-verdict">
          <dt>Verdict</dt>
          <dd>
            <span class="cm-chip" :class="preuve.verdict.pastille.ton">
              <AppIcon :name="preuve.verdict.pastille.icone" :size="11" />
              {{ preuve.verdict.pastille.texte }}
            </span>
            <small v-if="preuve.verdict.raison" class="rstep__petit rstep__raison">{{ preuve.verdict.raison }}</small>
          </dd>
        </div>
      </dl>
    </section>

    <section class="rstep__note">
      <div class="rstep__note-tete">
        <h5 class="cm-eyebrow">Note de Pierre</h5>
        <span v-if="etape.note && !enEdition" class="rstep__petit">enregistrée le {{ formatDateTime(etape.note.le) }}</span>
      </div>

      <template v-if="enEdition">
        <AppTextarea v-model="texteSaisi" label="Votre note sur cette étape" placeholder="Ce que vous voulez vous rappeler, garder, ou changer sur cette étape…" :rows="4" />
        <div class="rstep__actions">
          <span class="rstep__petit" :class="{ 'is-danger': tropLongue }">{{ compteur }} · un texte vide efface la note</span>
          <span class="rstep__boutons">
            <AppButton variant="ghost" size="sm" @click="annuler">Annuler</AppButton>
            <AppButton variant="section" size="sm" :loading="envoi.loading" :disabled="!modifiee || tropLongue || !notesEcrivables" @click="enregistrer">
              <template #icon><AppIcon name="check" :size="13" /></template>
              Enregistrer
            </AppButton>
          </span>
        </div>
      </template>
      <template v-else>
        <p v-if="etape.note" class="rstep__note-texte">{{ etape.note.texte }}</p>
        <p v-else class="rstep__manque">Aucune note pour l’instant.</p>
        <div>
          <AppButton variant="ghost" size="sm" :disabled="!notesEcrivables" :title="notesEcrivables ? '' : 'Le fichier des notes est illisible : rien ne peut y être écrit pour l’instant.'" @click="ecrire">
            <template #icon><AppIcon name="edit" :size="13" /></template>
            {{ etape.note ? 'Modifier la note' : 'Écrire une note' }}
          </AppButton>
        </div>
      </template>

      <p v-if="message" class="rstep__petit rstep__ok" role="status">{{ message }}</p>
      <div v-if="envoi.error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
        <div>
          <p class="cm-note__title rstep__titre--danger">Note non enregistrée</p>
          <p class="cm-note__text rstep__texte">{{ envoi.error }}</p>
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.rstep {
  container: rstep / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rstep.is-terminee {
  border-color: rgba(var(--cm-accent-rgb) / 0.22);
}

.rstep.is-en-cours {
  border-color: rgba(var(--cm-section-rgb) / 0.4);
}

.rstep.is-mise-de-cote {
  border-color: rgba(var(--cm-warning-rgb) / 0.3);
}

.rstep__tete {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 10px;
}

/* Le numéro de l'étape (« 12 », « E »), teinté selon l'état. */
.rstep__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border-radius: 9px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 800;
}

.rstep.is-terminee .rstep__num {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.rstep.is-en-cours .rstep__num {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.rstep.is-mise-de-cote .rstep__num {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.rstep__nom {
  flex: 1 1 220px;
  min-width: 0;
  margin: 0;
  padding-top: 5px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.rstep__pastilles {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 3px;
}

.rstep__faits {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
  gap: 10px 16px;
  margin: 0;
}

.rstep__fait {
  min-width: 0;
}

.rstep__fait dt {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.rstep__fait dd {
  margin: 3px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.rstep__lettre {
  min-width: 26px;
  padding: 2px 7px;
  margin-right: 4px;
  font-size: 11.5px;
}

.rstep__petit {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.rstep__petit.is-danger {
  color: var(--cm-danger);
}

.rstep__manque {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.rstep__precision {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.rstep__precision :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--cm-info);
}

.rstep__corps {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

@container rstep (min-width: 640px) {
  .rstep__corps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
}

.rstep__bloc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.rstep__bloc h5,
.rstep__note h5 {
  margin: 0;
}

.rstep__lignes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rstep__lignes li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rstep__titre-ligne {
  font-size: 12.5px;
  color: var(--cm-text-primary);
}

.rstep__texte {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

/* La preuve après lancement (étape 16) : un bloc teinté, cinq lignes en grille (deux colonnes quand l'étape est large). */
.rstep__preuve {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
}

.rstep__preuve-titre {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.rstep__preuve-lignes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin: 0;
}

@container rstep (min-width: 640px) {
  .rstep__preuve-lignes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 18px;
  }
}

.rstep__preuve-ligne {
  min-width: 0;
}

.rstep__preuve-ligne dt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.rstep__preuve-ligne dd {
  margin: 3px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.rstep__preuve-ligne dd.rstep__manque {
  color: var(--cm-text-muted);
}

/* Le verdict prend toute la largeur : sa raison est une phrase. */
.rstep__preuve-verdict {
  grid-column: 1 / -1;
}

.rstep__raison {
  margin-top: 4px;
}

/* La note de Pierre : un bloc à part, discret, au pied de l'étape. */
.rstep__note {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.rstep__note-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 10px;
}

.rstep__note-texte {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-section-soft);
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rstep__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.rstep__boutons {
  display: inline-flex;
  gap: 8px;
}

.rstep__ok {
  color: var(--cm-accent);
}

.rstep__titre--danger {
  color: var(--cm-danger);
}
</style>
