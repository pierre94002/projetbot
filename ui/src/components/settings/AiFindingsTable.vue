<script setup>
defineProps({
  findings: { type: Array, default: () => [] }
});
</script>

<template>
  <div class="ai-findings-table-wrap">
    <table class="ai-findings-table">
      <thead>
        <tr>
          <th>Facteur</th>
          <th>Constat</th>
          <th>Preuve</th>
          <th>Suggestion</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(finding, index) in findings" :key="index">
          <td><span class="ai-findings-table__factor">{{ finding.factor }}</span></td>
          <td>{{ finding.observation }}</td>
          <td class="cm-text-muted">{{ finding.evidence }}</td>
          <td class="ai-findings-table__suggestion">{{ finding.suggestionText }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ai-findings-table-wrap {
  overflow-x: auto;
}

.ai-findings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

.ai-findings-table th,
.ai-findings-table td {
  padding: 7px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: normal;
  overflow-wrap: break-word;
}

.ai-findings-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.ai-findings-table th:nth-child(1),
.ai-findings-table td:nth-child(1) {
  width: 11%;
}

.ai-findings-table th:nth-child(3),
.ai-findings-table td:nth-child(3) {
  width: 28%;
  font-size: 11px;
}

.ai-findings-table tbody tr:last-child td {
  border-bottom: none;
}

.ai-findings-table__factor {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.ai-findings-table__suggestion {
  color: var(--cm-accent);
}
</style>
