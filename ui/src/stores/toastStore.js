import { defineStore } from 'pinia';

let nextId = 1;

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: []
  }),
  actions: {
    push(message, variant = 'info', durationMs = 4000) {
      const id = nextId++;
      this.toasts.push({ id, message, variant });
      if (durationMs > 0) {
        setTimeout(() => this.dismiss(id), durationMs);
      }
      return id;
    },
    success(message) {
      return this.push(message, 'success');
    },
    error(message) {
      return this.push(message, 'error', 6000);
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    }
  }
});
