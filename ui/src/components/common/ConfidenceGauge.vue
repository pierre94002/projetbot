<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { etatConfiance } from '@/utils/langageParis.js';

/**
 * La jauge de CONFIANCE « sûr / fragile » (étape 6 du plan, 06/10/2026) — créée
 * ICI, une fois pour toutes : l'étape 40 (fiche du pronostic) la réutilise telle
 * quelle, elle ne la recrée pas.
 *
 * Le moteur ne mesure pas encore sa confiance (étape 38) : sans valeur, ou avec
 * une valeur qui n'est pas un nombre entre 0 et 1, elle s'affiche « pas encore
 * mesurée » (piste vide en pointillés) — jamais un faux niveau, jamais un
 * niveau par défaut. L'étiquette « sûr » ou « fragile » vient du serveur : on
 * n'en tire aucune du nombre. Ni vert (réservé à la value), ni rouge : sûr en
 * bleu, fragile en ambre, et chacun dit son mot.
 *
 * `valeur` : 0 = fragile … 1 = sûr. `etiquette` : 'sur' | 'fragile'.
 * `variante` : 'jauge' (piste et mot, à côté d'un pourcentage) | 'puce'
 * (« Confiance : … » en une puce, pour un bandeau ; la bulle d'aide HelpTip
 * « sur-fragile » se pose à côté et dit ce que « sûr » et « fragile » veulent dire).
 */
const props = defineProps({
  valeur: { type: Number, default: null },
  etiquette: { type: String, default: null },
  variante: { type: String, default: 'jauge' }
});

const lu = computed(() => etatConfiance({ valeur: props.valeur, etiquette: props.etiquette }));
const largeur = computed(() => (lu.value.valeur === null ? null : Math.round(lu.value.valeur * 100)));
const avecNiveau = computed(() => lu.value.etat === 'mesuree' && lu.value.valeur !== null);
const icone = computed(() => (lu.value.etiquette === 'sur' ? 'shield' : lu.value.etiquette === 'fragile' ? 'alert' : 'info'));
</script>

<template>
  <span
    class="cgauge"
    :class="[`is-${lu.etat}`, lu.etiquette ? `is-${lu.etiquette}` : '', `cgauge--${variante}`]"
    :role="avecNiveau ? 'meter' : 'img'"
    :aria-label="`Confiance : ${lu.libelle}`"
    :aria-valuemin="avecNiveau ? 0 : undefined"
    :aria-valuemax="avecNiveau ? 1 : undefined"
    :aria-valuenow="avecNiveau ? lu.valeur : undefined"
    :aria-valuetext="avecNiveau ? lu.libelle : undefined"
    :title="lu.titre"
  >
    <AppIcon :name="icone" :size="variante === 'puce' ? 11 : 13" class="cgauge__icon" />
    <span v-if="variante === 'puce'" class="cgauge__lead">Confiance :</span>
    <span class="cgauge__track" aria-hidden="true"><span v-if="largeur !== null" class="cgauge__fill" :style="{ width: `${largeur}%` }" /></span>
    <span class="cgauge__label">{{ lu.libelle }}</span>
  </span>
</template>

<style scoped>
.cgauge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  color: var(--cm-text-secondary);
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: help;
}

.cgauge__icon {
  flex-shrink: 0;
}

.cgauge__lead {
  font-weight: 600;
  color: var(--cm-text-muted);
}

/* La piste, de « fragile » à gauche à « sûr » à droite. */
.cgauge__track {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  width: 46px;
  height: 6px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  overflow: hidden;
}

.cgauge__fill {
  height: 100%;
  border-radius: 999px;
  background: currentColor;
  transition: width var(--cm-transition-slow);
}

.cgauge__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Sûr : du bleu d'information, jamais le vert de la value. */
.cgauge.is-sur {
  color: var(--cm-info);
}

/* Fragile : l'ambre de « à vérifier ». */
.cgauge.is-fragile {
  color: var(--cm-warning);
}

/* Pas encore mesurée : une piste vide en pointillés, du texte discret. */
.cgauge.is-non-mesuree {
  color: var(--cm-text-muted);
  font-weight: 600;
}

.cgauge.is-non-mesuree .cgauge__track {
  background: transparent;
  border: 1px dashed var(--cm-border-strong);
}

/* La puce d'un bandeau : un cadre arrondi comme .cm-chip. */
.cgauge--puce {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  font-size: 11px;
}

.cgauge--puce.is-sur {
  border-color: transparent;
  background: var(--cm-info-soft);
}

.cgauge--puce.is-fragile {
  border-color: transparent;
  background: var(--cm-warning-soft);
}

.cgauge--puce.is-non-mesuree {
  border-style: dashed;
  border-color: var(--cm-border-strong);
  background: transparent;
}
</style>
