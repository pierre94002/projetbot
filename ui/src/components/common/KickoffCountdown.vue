<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { liveNow } from '@/utils/liveClock.js';
import { compteARebours } from '@/utils/langageParis.js';

/**
 * Le COMPTE À REBOURS avant un coup d'envoi (étape 6 du plan, 06/10/2026) :
 * « dans 2 h 15 », « dans 3 jours » — puis « en cours » et « terminé ». Il lit
 * l'horloge partagée de l'appli (liveClock.js, un tic toutes les 30 s : jamais
 * un minuteur par ligne) et la règle de statut des matchs (matchStatus.js) :
 * « en cours » et « terminé » sont une ESTIMATION d'après l'heure du coup
 * d'envoi, pas un flux en direct — la phrase complète au survol le dit.
 *
 * Un match du calendrier FotMob ne connaît que son jour : `heureSure` faux
 * (ou, sans avis de l'appelant, le midi UTC de repli), on ne compte pas les
 * heures — « aujourd'hui », « demain », « dans 4 jours » — et le survol dit que
 * l'heure est à confirmer. Pas de coup d'envoi du tout : « heure inconnue »,
 * dit, jamais un tiret.
 *
 * `coupDEnvoi` : un instant (ISO), ou « AAAA-MM-JJ » pour un jour seul.
 * `maintenant` : un instant fixe (essais) ; sinon l'horloge de l'appli.
 * `variante` : 'pastille' (fond teinté) | 'texte' (en ligne, sans fond).
 */
const props = defineProps({
  coupDEnvoi: { type: [String, Number, Date], default: null },
  heureSure: { type: Boolean, default: null },
  maintenant: { type: Number, default: null },
  variante: { type: String, default: 'pastille' }
});

const lu = computed(() => compteARebours({ coupDEnvoi: props.coupDEnvoi, heureSure: props.heureSure, maintenant: props.maintenant ?? liveNow.value }));
const ICONES = { avant: 'clock', jour: 'calendar', 'en-cours': null, termine: 'flag', inconnu: 'clock' };
</script>

<template>
  <span class="kcount" :class="[`is-${lu.etat}`, `kcount--${variante}`]" :title="lu.titre">
    <span v-if="lu.etat === 'en-cours'" class="cm-live-dot" aria-hidden="true" />
    <AppIcon v-else :name="ICONES[lu.etat]" :size="11" class="kcount__icon" />
    <span class="kcount__text">{{ lu.texte }}</span>
  </span>
</template>

<style scoped>
.kcount {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--cm-text-secondary);
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: help;
}

.kcount__icon {
  flex-shrink: 0;
}

.kcount--pastille {
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--cm-surface-hover);
}

/* En cours : le rouge de « direct », avec son point qui pulse. */
.kcount.is-en-cours {
  color: var(--cm-danger);
}

.kcount--pastille.is-en-cours {
  background: var(--cm-danger-soft);
}

/* Terminé : discret. */
.kcount.is-termine {
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* Seul le jour est connu, ou rien : pointillés, comme « heure à confirmer » ailleurs. */
.kcount--pastille.is-jour,
.kcount--pastille.is-inconnu {
  border-style: dashed;
  border-color: var(--cm-border-strong);
  background: transparent;
  color: var(--cm-text-muted);
}

.kcount--texte.is-jour,
.kcount--texte.is-inconnu {
  color: var(--cm-text-muted);
  font-weight: 600;
}
</style>
