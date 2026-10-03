<script setup>
import { ref, watch } from 'vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { formatDateTime } from '@/utils/format.js';

/**
 * La connexion à l'API Anthropic : l'état (fournisseur, date, modèle), la
 * clé masquée, le modèle, le workspace, et les deux boutons. Refonte
 * visuelle du 01/10/2026 (guide ui/DESIGN.md) : aucune donnée ni action n'a
 * bougé.
 */
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
    <!-- 1. L'état : le fournisseur, depuis quand, le modèle en puce. -->
    <div class="ai-connection__status">
      <span class="cm-icon-box" :class="status?.connected ? 'is-info' : 'is-muted'"><AppIcon name="sparkles" :size="18" /></span>
      <div class="ai-connection__who">
        <span class="ai-connection__name">Anthropic (Claude)</span>
        <p v-if="status?.connectedAt" class="ai-connection__timestamp">Connecté le {{ formatDateTime(status.connectedAt) }}</p>
        <p v-else-if="status?.source === 'env'" class="ai-connection__timestamp">Connecté via server/.env</p>
        <p v-else class="ai-connection__timestamp">Aucune clé enregistrée</p>
      </div>
      <div class="ai-connection__chips">
        <StatusBadge :status="status?.connected ? 'analyzed' : 'rejected'" />
        <span v-if="status?.model" class="cm-chip is-info" title="Modèle utilisé pour l'analyse">
          <AppIcon name="cpu" :size="11" />
          {{ status.model }}
        </span>
      </div>
    </div>

    <div v-if="status?.connected && status.source === 'env'" class="cm-note is-warning">
      <span class="cm-icon-box is-warning"><AppIcon name="lock" :size="16" /></span>
      <div>
        <p class="cm-note__title ai-connection__note-title--warning">Clé posée côté serveur</p>
        <p class="cm-note__text ai-connection__hint">
          La déconnexion depuis l'interface n'aura pas d'effet tant que ANTHROPIC_API_KEY reste définie côté serveur.
        </p>
      </div>
    </div>

    <!-- 2. Le formulaire : la clé masquée, le modèle, le workspace. -->
    <div class="ai-connection__form">
      <div class="ai-connection__grid">
        <AppTextField v-model="apiKey" type="password" label="Clé API Anthropic" placeholder="sk-ant-…">
          <template #icon><AppIcon name="lock" :size="14" /></template>
        </AppTextField>
        <AppTextField v-model="model" label="Modèle" placeholder="claude-sonnet-5">
          <template #icon><AppIcon name="cpu" :size="14" /></template>
        </AppTextField>
      </div>
      <AppTextField v-model="workspaceId" label="ID de workspace (si demandé)" placeholder="wrkspc_…">
        <template #icon><AppIcon name="layers" :size="14" /></template>
      </AppTextField>
      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="cm-note__title">Workspace</p>
          <p class="cm-note__text ai-connection__hint">
            Seulement requis pour certaines clés liées à un workspace précis — laissez vide, et remplissez uniquement si la
            connexion échoue avec "anthropic-workspace-id is required". Trouvable dans console.anthropic.com > Settings > Workspaces.
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Connecter, ou couper. -->
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
  /* Se règle sur SA largeur : demi-page ou page entière. */
  container: aiconn / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ------------------------------------------------------------------ état */
.ai-connection__status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px 12px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.ai-connection__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-connection__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.ai-connection__timestamp {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.ai-connection__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  grid-column: 2;
}

@container aiconn (min-width: 520px) {
  .ai-connection__status {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .ai-connection__chips {
    grid-column: auto;
    justify-content: flex-end;
  }
}

.ai-connection__note-title--warning {
  color: var(--cm-warning);
}

.ai-connection__hint {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------- formulaire */
.ai-connection__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.ai-connection__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

/* Assez de place : la clé et le modèle côte à côte. */
@container aiconn (min-width: 560px) {
  .ai-connection__grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  }
}

.ai-connection__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
