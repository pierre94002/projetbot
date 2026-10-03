<script setup>
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Les constats d'une analyse IA : facteur, constat, preuve, suggestion.
 * Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) : le tableau commun
 * .cm-table, le facteur en puce, la suggestion en vert. Aucune colonne n'a
 * bougé.
 */
defineProps({
  findings: { type: Array, default: () => [] }
});
</script>

<template>
  <div class="cm-table-wrap findings">
    <table class="cm-table findings__table">
      <thead>
        <tr>
          <th>Facteur</th>
          <th class="is-left">Constat</th>
          <th class="is-left">Preuve</th>
          <th class="is-left">Suggestion</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(finding, index) in findings" :key="index">
          <td><span class="cm-chip is-section findings__factor">{{ finding.factor }}</span></td>
          <td class="is-left findings__observation">{{ finding.observation }}</td>
          <td class="is-left cm-text-muted findings__evidence">{{ finding.evidence }}</td>
          <td class="is-left findings__suggestion">
            <AppIcon name="arrowRight" :size="12" class="findings__suggestion-icon" />
            <span>{{ finding.suggestionText }}</span>
          </td>
        </tr>
        <tr v-if="!findings.length">
          <td colspan="4" class="is-left cm-text-muted findings__empty">Aucun constat dans cette analyse.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Des phrases, pas des chiffres : les cellules se replient sur plusieurs lignes. */
.findings__table {
  table-layout: fixed;
  min-width: 520px;
}

.findings__table th,
.findings__table td {
  white-space: normal;
  overflow-wrap: break-word;
  vertical-align: top;
  line-height: 1.5;
}

.findings__table th:nth-child(1),
.findings__table td:nth-child(1) {
  width: 15%;
}

.findings__table th:nth-child(3),
.findings__table td:nth-child(3) {
  width: 26%;
}

.findings__factor {
  white-space: normal;
  text-align: left;
  line-height: 1.3;
}

.findings__observation {
  color: var(--cm-text-primary);
}

.findings__evidence {
  font-size: 11.5px;
}

/* La suggestion : ce qu'il faudrait changer, en vert de la marque. */
.findings__suggestion {
  color: var(--cm-accent);
}

.findings__suggestion-icon {
  display: inline-block;
  margin-right: 5px;
  vertical-align: -1px;
}

.findings__empty {
  padding: 14px 12px;
  text-align: center;
}
</style>
