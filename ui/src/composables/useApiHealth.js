import { onMounted, onUnmounted, ref } from 'vue';
import { API_BASE_URL } from '@/services/httpClient.js';

const CHECK_INTERVAL_MS = 20000;

export function useApiHealth() {
  const isOnline = ref(null);
  let intervalId = null;

  async function check() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      isOnline.value = response.ok;
    } catch {
      isOnline.value = false;
    }
  }

  onMounted(() => {
    check();
    intervalId = setInterval(check, CHECK_INTERVAL_MS);
  });

  onUnmounted(() => clearInterval(intervalId));

  return { isOnline, check };
}
