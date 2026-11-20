<script setup>
/**
 * La carte « Essai général » de l'étape 47 sur la feuille de route (étape 47 du plan, lot 1, passe P4a, 17/11/2026),
 * dans son état « essai » : où en sont les deux semaines, les pannes (nouvelles, connues, à expliquer), les
 * sauvegardes, les appels à l'IA, le direct, puis le tableau des 14 jours (toujours ses 14 lignes, Σ et ⌀), la liste
 * de ce qui est compté comme connu (dépliable), ce que l'essai ne surveille pas et les six critères du bilan.
 *
 * Tout vient de GET /api/roadmap (`etape.recette`, lu par le serveur dans les fichiers du journal de la recette,
 * jamais dans la base) ; les mots viennent de utils/recette.js. Un journal illisible ne cache rien : la carte le dit
 * (une ligne ambre qui nomme le fichier) et garde sa structure, sa tête et PH-23. En pied, d'où viennent les chiffres
 * (P4b-1, RC-21). Règles de dessin (ui/DESIGN.md) : utilitaires cm-*, jetons uniquement, ambre pour « à regarder »
 * (dont la case « Non observé » au-delà de 25 min, RC-12), rouge pour une panne nouvelle, jamais le vert des paris.
 */
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { carteDeLaRecette } from '@/utils/recette.js';

const props = defineProps({
  recette: { type: Object, required: true }
});

const carte = computed(() => carteDeLaRecette(props.recette));
</script>

<template>
  <section v-if="carte" class="recette" data-essai-general>
    <h5 class="cm-eyebrow recette__titre">
      <AppIcon name="calendar" :size="12" />
      {{ carte.titre }}
      <HelpTip
        titre="Essai général"
        texte="Deux semaines où tout tourne comme en vrai, sans rien changer au moteur. Un journal note chaque passe, chaque veille du PC, chaque sauvegarde, et classe ce qui n’est pas vert : connu au départ, à expliquer, ou nouveau."
      />
    </h5>

    <p class="recette__tete" :class="{ recette__manque: carte.indisponible }">{{ carte.tete }}</p>
    <p v-if="carte.vie" class="recette__alerte">
      <AppIcon name="alert" :size="12" />
      {{ carte.vie }}
    </p>
    <p v-if="carte.probleme" class="recette__alerte" data-probleme>
      <AppIcon name="alert" :size="12" />
      {{ carte.probleme }}
    </p>
    <p v-if="carte.rodage" class="recette__petit" data-rodage>{{ carte.rodage }}</p>
    <ul v-if="carte.phrases.length" class="recette__phrases">
      <li v-for="(p, i) in carte.phrases" :key="i">{{ p }}</li>
    </ul>
    <p v-if="carte.decompte && !carte.indisponible" class="recette__petit">{{ carte.decompte }}</p>

    <div v-if="carte.aExpliquer.length" class="recette__aexpliquer">
      <h6 class="recette__soustitre">À expliquer</h6>
      <ul>
        <li v-for="a in carte.aExpliquer" :key="a.id">
          <span class="cm-chip is-warning">
            <AppIcon name="clock" :size="11" />
            {{ a.age }}
          </span>
          <span class="recette__petit">{{ a.quand }}</span>
          {{ a.texte }}
        </li>
      </ul>
    </div>

    <div v-if="carte.aPart.length" class="recette__aexpliquer" data-a-part>
      <h6 class="recette__soustitre">Compté à part (expliqué par une note)</h6>
      <ul>
        <li v-for="a in carte.aPart" :key="a.id">
          <span class="recette__petit">{{ a.quand }}</span>
          {{ a.texte }}
          <small class="recette__petit">(note{{ a.auteur ? ` de ${a.auteur}` : '' }} : {{ a.raison }})</small>
        </li>
      </ul>
    </div>

    <div class="cm-table-wrap">
      <table class="cm-table recette__table">
        <thead>
          <tr>
            <th v-for="(c, i) in carte.colonnes" :key="i" :class="{ 'is-left': i === 0 }">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(l, i) in carte.lignes" :key="i">
            <tr :class="{ 'recette__a-venir': l.etat === 'a-venir' }">
              <td class="is-left recette__jour">{{ l.jour }}</td>
              <td v-if="l.large" class="is-left recette__manque" :class="{ recette__ambre: l.etat === 'illisible' }" :colspan="carte.largeur">{{ l.large }}</td>
              <template v-else>
                <td v-for="(v, j) in l.cellules ?? []" :key="j" class="cm-numeric" :class="{ recette__ambre: l.ambre?.[j] }" :title="l.titres?.[j] || null">{{ v }}</td>
              </template>
            </tr>
            <tr v-if="l.evenements && l.evenements.length" class="recette__evenements">
              <td :colspan="carte.largeur + 1" class="is-left">
                <details>
                  <summary>Ce qui a été noté ce jour-là ({{ l.evenements.length }})</summary>
                  <ul>
                    <li v-for="e in l.evenements" :key="e.id">
                      <span class="cm-chip" :class="{ 'is-danger': e.classe === 'nouvelle', 'is-warning': e.classe === 'a-expliquer' }">
                        {{ e.classe === 'connue' ? 'connue' : e.classe === 'nouvelle' ? 'nouvelle' : e.classe === 'a-part' ? 'à part' : 'à expliquer' }}
                      </span>
                      <span class="recette__petit">{{ e.heure }}</span>
                      {{ e.causeTitre ? `${e.causeTitre} : ` : '' }}{{ e.texte }}
                      <small v-if="e.decision" class="recette__petit">({{ e.decision.sorte === 'note' ? 'expliqué par une note' : 'rattachée à la main' }} : {{ e.decision.raison }})</small>
                      <small v-else-if="e.raison" class="recette__petit">({{ e.raison }})</small>
                    </li>
                  </ul>
                </details>
              </td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">{{ carte.somme.jour }}</td>
            <td v-for="(v, j) in carte.somme.cellules" :key="j" class="cm-numeric is-strong" :class="{ recette__ambre: carte.somme.ambre?.[j] }">{{ v }}</td>
          </tr>
          <tr>
            <td class="is-left">{{ carte.moyenne.jour }}</td>
            <td v-for="(v, j) in carte.moyenne.cellules" :key="j" class="cm-numeric">{{ v }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <details class="recette__liste">
      <summary>
        <AppIcon name="list" :size="12" />
        {{ carte.liste.titre }} — {{ carte.liste.etat }}
      </summary>
      <ul>
        <li v-for="c in carte.liste.causes" :key="c.id">
          <strong>{{ c.titre }}</strong>
          <span class="recette__petit">({{ c.statut }}, {{ c.mode }} ; {{ c.borne }})</span>
          — {{ c.phrase }}
        </li>
      </ul>
    </details>

    <p class="recette__petit recette__non-surveille">{{ carte.nonSurveille }}</p>
    <p v-if="carte.provenance" class="recette__petit recette__non-surveille" :class="{ recette__ambre: carte.provenance.ambre }" data-provenance>
      {{ carte.provenance.texte }}
    </p>

    <div class="recette__criteres">
      <h6 class="recette__soustitre">Le bilan, critère par critère</h6>
      <dl>
        <div v-for="c in carte.criteres" :key="c.titre" class="recette__critere">
          <dt>{{ c.titre }}</dt>
          <dd :class="{ recette__manque: c.mot === 'à faire' }">
            {{ c.mot }}<template v-if="c.preuve"> — {{ c.preuve }}</template>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.recette {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
}

.recette p,
.recette ul,
.recette dl {
  margin: 0;
}

.recette__titre {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.recette__soustitre {
  margin: 4px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.recette__tete {
  font-weight: 600;
  line-height: 1.5;
}

.recette__phrases {
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.55;
}

/* PH-23 : le journal ne tourne plus — l'ambre (à regarder), lisible sans la couleur. */
.recette__alerte {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  border: 1px dashed rgba(var(--cm-warning-rgb) / 0.4);
  font-size: 12px;
  color: var(--cm-warning);
}

.recette__petit {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.recette__manque {
  color: var(--cm-text-secondary);
  font-style: italic;
}

/* RC-12, RC-20, RC-21 : à regarder (non observé au-delà de 25 min, fichier illisible, dernier tour ancien). */
.recette__ambre {
  color: var(--cm-warning);
}

.recette__table td {
  font-size: 12px;
}

.recette__jour {
  white-space: nowrap;
  font-weight: 600;
}

.recette__a-venir td {
  color: var(--cm-text-secondary);
}

.recette__evenements ul,
.recette__aexpliquer ul,
.recette__liste ul {
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}

.recette__evenements summary,
.recette__liste summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.recette__liste summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.recette__non-surveille {
  overflow-wrap: anywhere;
}

.recette__criteres dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}

.recette__critere dt {
  font-size: 12px;
  font-weight: 600;
}

.recette__critere dd {
  margin: 0;
  font-size: 12px;
}
</style>
