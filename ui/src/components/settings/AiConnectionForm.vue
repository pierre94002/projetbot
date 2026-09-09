<script setup>
import { ref, watch } from 'vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  status: { type: Object, default: null }, // { connected, provider, model, workspaceId, connectedAt, source }
  connecting: { type: Boolean, default: false }
});

const emit = defineEmits(['connect', 'disconnect']);

const apiKey = ref('');
const model = ref('');
const workspaceId = ref('');

// Modèle et workspace se pré-remplissent avec la valeur actuellement
// connectée (ou le défaut renvoyé par le serveur) — jamais le champ clé, qui
// n'est jamais renvoyé par l'API une fois connecté.
watch(
  () => props.status?.model,
  (value) => {
    if (value && !model.value) model.value = value;
  },
  { immediate: true }
);
watch(
  () => props.status?.workspaceId,
  (value) => {
    if (value && !workspaceId.value) workspaceId.value = value;
  },
  { immediate: true }
);

function handleConnect() {
  if (!apiKey.value.trim()) return;
  emit('connect', apiKey.value.trim(), model.value.trim(), workspaceId.value.trim());
  apiKey.value = '';
}
</script>

<template>
  <div class="ai-connection">
    <div class="ai-connection__status-row">
      <div>
        <span>Anthropic (Claude)</span>
        <p v-if="status?.connectedAt" class="cm-text-muted ai-connection__timestamp">
          Connecté le {{ formatDateTime(status.connectedAt) }}
        </p>
        <p v-else-if="status?.source === 'env'" class="cm-text-muted ai-connection__timestamp">Connecté via server/.env</p>
      </div>
      <StatusBadge :status="status?.connected ? 'analyzed' : 'rejected'" />
    </div>

    <p v-if="status?.connected && status.source === 'env'" class="cm-text-muted ai-connection__hint">
      La déconnexion depuis l'interface n'aura pas d'effet tant que ANTHROPIC_API_KEY reste définie côté serveur.
    </p>

    <div class="ai-connection__form">
      <AppTextField v-model="apiKey" type="password" label="Clé API Anthropic" placeholder="sk-ant-…" />
      <AppTextField v-model="model" label="Modèle" placeholder="claude-sonnet-5" />
    </div>
    <AppTextField v-model="workspaceId" label="ID de workspace (si demandé)" placeholder="wrkspc_…" />
    <p class="cm-text-muted ai-connection__hint">
      Seulement requis pour certaines clés liées à un workspace précis — laissez vide, et remplissez uniquement si la
      connexion échoue avec "anthropic-workspace-id is required". Trouvable dans console.anthropic.com > Settings > Workspaces.
    </p>

    <div class="ai-connection__actions">
      <AppButton variant="primary" :loading="connecting" :disabled="!apiKey.trim()" @click="handleConnect">
        <template #icon><AppIcon name="bolt" :size="14" /></template>
        Connecter
      </AppButton>
      <AppButton v-if="status?.connected" variant="ghost" size="sm" @click="emit('disconnect')">Déconnecter</AppButton>
    </div>
  </div>
</template>

<style scoped>
.ai-connection {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-connection__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  gap: 12px;
}

.ai-connection__timestamp {
  font-size: 11px;
  margin-top: 2px;
}

.ai-connection__hint {
  font-size: 11.5px;
  margin: -4px 0 2px;
}

.ai-connection__form {
  display: flex;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-connection__form :deep(.field) {
  flex: 1;
}

.ai-connection__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
