<script setup>
/**
 * Bulletin du jour et bilan de la semaine (étape 42 du plan, 22/10/2026) : deux textes écrits par l'IA, en attendant la page
 * « Bulletin » de l'étape 45. Chaque matin, ce qui vaut le coup aujourd'hui et pourquoi ; chaque semaine, ce qui a marché, ce qui a
 * perdu, où l'IA s'est trompée. Ce sont deux étapes de l'actualisation (« Bulletin du jour », « Bilan de la semaine » dans la liste
 * des étapes, juste au-dessus) : un seul appel à Claude Code par jour et par semaine, sur une fiche chiffrée que le code prépare.
 *
 * La carte LIT GET /api/match-ai-analysis/bulletins (une lecture à l'ouverture et à chaque fin de passe, « Relire ») et ne lance
 * rien : aucun bouton n'appelle Claude. Elle dit toujours les mêmes choses, dans les mêmes blocs, texte écrit ou non : l'état du
 * texte (écrit, rien à commenter, attend le matin, coupé, abandonné après trois essais…) et sa raison ; le texte lui-même avec sa
 * provenance réelle (Claude Code, le quota de l'abonnement, l'heure) et ses tokens ; la preuve que ses chiffres sont ceux du code
 * (la fiche envoyée à l'IA, dépliable) ; les essais ratés ; puis les derniers textes avec Σ et ⌀. Les mots viennent de
 * utils/bulletins.js (testés sans navigateur).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { bulletinsApi } from '@/services/bulletinsApi.js';
import { essaiDit, etatDuTexte, gardeDite, jourCourt, jourEnLettres, jourEtHeureDits, modeDit, nombreDit, pluriel, sectionsDuTexte, tableauDesTextes, tokensDits } from '@/utils/bulletins.js';

const props = defineProps({
  /**
   * Étape 45 : la lecture { loading, error, data } faite par la page « Bulletin », qui en a besoin pour son bandeau — la carte ne lit alors
   * rien elle-même (une seule lecture de la route pour les deux) et « Relire » demande à la page de relire (événement `relire`).
   * Sans elle (Réglages), la carte lit toute seule, comme avant.
   */
  lecture: { type: Object, default: null },
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const emit = defineEmits(['relire']);

const etat = ref({ loading: false, error: null, data: null });
let derniereDemande = 0;

async function charger() {
  if (props.lecture) return;
  const numero = ++derniereDemande;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await bulletinsApi.overview();
    if (numero === derniereDemande) etat.value = { loading: false, error: null, data };
  } catch (error) {
    // Une lecture ratée garde les derniers textes à l'écran, l'erreur au-dessus.
    if (numero === derniereDemande) etat.value = { loading: false, error: error.message, data: etat.value.data };
  }
}

// Étape 45 : quand la page donne sa lecture, la carte la montre telle quelle (même état, rien relu pour son compte).
watch(
  () => props.lecture,
  (lecture) => {
    if (lecture) etat.value = lecture;
  },
  { immediate: true, deep: true }
);

/** Le bouton « Relire » : la page relit pour tout le monde quand elle a donné la lecture, la carte sinon. */
const relire = () => (props.lecture ? emit('relire') : charger());

onMounted(charger);
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger();
  }
);

const d = computed(() => etat.value.data);

/** Les deux blocs, toujours là : le bulletin du jour, puis le bilan de la semaine. */
const blocs = computed(() => {
  const data = d.value;
  const bloc = (cle, titre, sousTitre, entree, dernier, situation, essais, icone) => {
    const affiche = entree ?? dernier ?? null;
    return {
      cle,
      titre,
      sousTitre,
      icone,
      etat: etatDuTexte({ entree, situation, essais }),
      // Le texte d'aujourd'hui n'est pas encore là : le dernier écrit reste lisible, dit pour ce qu'il est.
      entree: affiche,
      ancien: !entree && Boolean(dernier),
      essais
    };
  };
  return [
    bloc('bulletin', 'Bulletin du jour', data ? jourEnLettres(data.jour) : 'aujourd’hui', data?.bulletin ?? null, data?.dernierBulletin ?? null, data?.situation?.bulletin ?? null, data?.essais?.bulletin ?? [], 'sparkles'),
    bloc('bilan', 'Bilan de la semaine', data?.semaine?.enLettres ?? 'la semaine qui vient de finir', data?.bilan ?? null, data?.dernierBilan ?? null, data?.situation?.bilan ?? null, data?.essais?.bilan ?? [], 'barChart')
  ];
});

const textes = computed(() => tableauDesTextes(d.value?.historique));
const budget = computed(() => d.value?.budget ?? null);
const regles = computed(() => d.value?.regles ?? null);

/** Le jour ou la semaine d'un texte, pour dire de quand est celui qu'on lit. */
const deQuand = (b) => (b.cle === 'bulletin' ? jourCourt(b.entree?.jour) : `du ${jourCourt(b.entree?.semaine?.du)} au ${jourCourt(b.entree?.semaine?.au)}`);
const sections = (b) => sectionsDuTexte(b.entree);
</script>

<template>
  <div class="bulletins">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture du bulletin et du bilan…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title bulletins__titre-danger">{{ d ? 'Lecture impossible — derniers textes affichés' : 'Bulletin et bilan illisibles' }}</p>
        <p class="cm-note__text bulletins__texte-simple">{{ etat.error }} — les deux blocs ci-dessous restent affichés, sans texte.</p>
      </div>
    </div>

    <!-- 0. L'état en quelques puces, le mode du budget et « Relire ». -->
    <div class="cm-toolbar bulletins__barre">
      <span v-for="b in blocs" :key="`puce-${b.cle}`" class="cm-chip" :class="b.etat.ton" :data-puce="b.cle">
        <AppIcon :name="b.etat.icone" :size="11" />
        {{ b.titre }} : {{ b.etat.titre }}
      </span>
      <span class="cm-chip" :class="budget?.econome ? 'is-warning' : ''" data-puce="budget" :title="budget?.raison ?? 'Budget Claude non lu'">
        <AppIcon name="cpu" :size="11" />
        {{ budget ? `Budget Claude : ${modeDit(budget.mode)}` : 'Budget Claude : non lu' }}
      </span>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="relire">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <!-- 1 et 2. Le bulletin du jour, puis le bilan de la semaine : deux blocs, toujours. -->
    <section v-for="b in blocs" :key="b.cle" class="bulletins__bloc cm-block" :data-bloc="b.cle">
      <header class="bulletins__entete">
        <span class="cm-icon-box" :class="b.etat.ton || 'is-muted'"><AppIcon :name="b.icone" :size="17" /></span>
        <div class="bulletins__entete-texte">
          <p class="cm-eyebrow">{{ b.titre }}</p>
          <h3 class="bulletins__sous-titre">{{ b.sousTitre }}</h3>
        </div>
        <span class="cm-chip" :class="b.etat.ton"><AppIcon :name="b.etat.icone" :size="11" />{{ b.etat.titre }}</span>
      </header>
      <p class="bulletins__etat" data-etat>{{ b.etat.phrase }}</p>

      <ul v-if="b.essais.length" class="bulletins__essais" data-essais>
        <li v-for="(e, i) in b.essais" :key="`${e.at}-${i}`">Essai {{ i + 1 }} raté {{ essaiDit(e) }}</li>
      </ul>

      <template v-if="b.entree?.texte">
        <p v-if="b.ancien" class="bulletins__ancien cm-text-muted">Le dernier texte écrit, {{ deQuand(b) }} :</p>
        <h4 class="bulletins__texte-titre">{{ b.entree.texte.titre }}</h4>
        <p class="bulletins__resume">{{ b.entree.texte.resume }}</p>
        <div v-for="s in sections(b)" :key="s.cle" class="bulletins__section" :data-section="s.cle">
          <h5 class="bulletins__section-titre">{{ s.titre }}</h5>
          <p class="bulletins__section-texte">{{ s.texte }}</p>
        </div>
        <p v-if="b.entree.texte.aRetenir" class="bulletins__retenir"><AppIcon name="info" :size="12" /> {{ b.entree.texte.aRetenir }}</p>

        <div class="bulletins__pied">
          <ProvenanceChip
            source="Claude Sonnet, par Claude Code (quota de l’abonnement)"
            :releve-le="b.entree.ecritLe"
            action="écrit"
            :fichier="d?.fichier ?? null"
            detail="Un seul appel pour ce texte, à partir de la fiche chiffrée du code (dépliable ci-dessous)."
            :vieux-apres-heures="null"
          />
          <span class="cm-chip" data-tokens>{{ tokensDits(b.entree.usage?.total) }}</span>
          <span class="cm-chip">{{ modeDit(b.entree.mode) }}</span>
        </div>
        <p class="bulletins__garde"><AppIcon name="shield" :size="12" /> {{ gardeDite(b.entree) }}</p>
        <details class="bulletins__fiche" :data-fiche="b.cle">
          <summary>Voir la fiche chiffrée envoyée à l’IA</summary>
          <pre>{{ b.entree.fiche }}</pre>
        </details>
      </template>
      <p v-else class="bulletins__vide cm-text-muted" data-vide>
        {{ b.entree?.sansAppel ? 'Aucun texte : il n’y avait rien à commenter, donc aucun appel à Claude.' : 'Pas encore de texte.' }}
      </p>
    </section>

    <!-- 3. Les derniers textes, avec leur coût : Σ et ⌀. -->
    <div class="cm-table-wrap">
      <table class="cm-table bulletins__table" data-tableau="textes">
        <thead>
          <tr>
            <th class="is-left">Texte</th>
            <th class="is-left">Pour</th>
            <th class="is-left">Écrit le</th>
            <th class="is-left">Mode</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in textes.lignes" :key="`${t.genre}-${t.date}`">
            <td class="is-left is-strong">{{ t.libelle }}</td>
            <td class="is-left cm-numeric">{{ t.pour }}</td>
            <td class="is-left cm-numeric">{{ jourEtHeureDits(t.ecritLe) }}</td>
            <td class="is-left cm-text-muted">{{ t.sansAppel ? 'sans appel' : modeDit(t.mode) }}</td>
            <td class="cm-numeric">{{ t.sansAppel ? '0' : t.tokens === null || t.tokens === undefined ? 'inconnus' : nombreDit(t.tokens) }}</td>
          </tr>
          <tr v-if="!textes.lignes.length">
            <td class="is-left cm-text-muted" colspan="5">Aucun texte écrit pour l’instant : le premier bulletin s’écrit à la première passe d’actualisation d’une matinée.</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th class="is-left" colspan="4">Σ {{ pluriel(textes.total.textes, 'texte', 'textes') }}, dont {{ pluriel(textes.total.appels, 'appel', 'appels') }} à Claude</th>
            <th class="cm-numeric">{{ nombreDit(textes.total.tokens) }}</th>
          </tr>
          <tr>
            <th class="is-left" colspan="4">⌀ par texte écrit par Claude</th>
            <th class="cm-numeric">{{ textes.moyenne.tokens === null ? '–' : nombreDit(textes.moyenne.tokens) }}</th>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 4. Comment ça tourne. -->
    <div class="cm-note">
      <span class="cm-icon-box is-muted"><AppIcon name="clock" :size="16" /></span>
      <div>
        <p class="cm-note__title">Comment ça tourne</p>
        <p class="cm-note__text bulletins__texte-simple">
          Deux étapes de l’actualisation, juste après le carnet de l’IA : le bulletin une fois par jour, à la première passe à partir de
          {{ regles?.heureDuBulletin ?? 6 }} h (heure de Paris), le bilan une fois par semaine, pour la semaine écoulée (du lundi au dimanche).
          Chacun est <strong>un seul appel</strong> à Claude Code ; le code prépare d’abord une fiche chiffrée, sans token, et l’IA ne fait que la
          résumer et la commenter. <strong>Tout nombre de son texte doit être dans la fiche</strong> : sinon le texte est refusé et rien ne
          s’affiche (au plus {{ regles?.essaisMax ?? 3 }} essais par jour ou par semaine, puis l’abandon, dit ici). Les deux comptent dans le
          budget Claude et sur le plafond de 150 analyses du jour ; en mode économe la fiche est réduite, jamais supprimée. Un clic sur
          « Actualiser maintenant » ne force jamais un appel de plus.
          <template v-if="d?.fichier"> Textes rangés dans {{ d.fichier }}.</template>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bulletins {
  container: bulletins / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bulletins__titre-danger {
  color: var(--cm-danger);
}

.bulletins__texte-simple {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.bulletins__texte-simple strong {
  color: var(--cm-text-primary);
}

.bulletins__barre {
  flex-wrap: wrap;
  gap: 8px;
}

/* ------------------------------------------------------------------ un bloc */
.bulletins__bloc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bulletins__entete {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bulletins__entete-texte {
  flex: 1;
  min-width: 0;
}

.bulletins__sous-titre {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.bulletins__etat {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.bulletins__essais {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-warning);
}

.bulletins__ancien {
  margin: 4px 0 0;
  font-size: 12px;
}

.bulletins__texte-titre {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.bulletins__resume {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.bulletins__section {
  padding: 10px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.bulletins__section-titre {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--cm-section);
}

.bulletins__section-texte {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.bulletins__retenir {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.bulletins__pied {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.bulletins__garde {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.bulletins__fiche summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--cm-section);
}

.bulletins__fiche pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.bulletins__vide {
  margin: 0;
  font-size: 12.5px;
}

/* ---------------------------------------------------------------- tableau */
.bulletins__table th,
.bulletins__table td {
  font-size: 12px;
  white-space: normal;
}

@container bulletins (max-width: 520px) {
  .bulletins__entete {
    flex-wrap: wrap;
  }
}
</style>
