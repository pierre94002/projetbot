import { computed, unref } from 'vue';
import { liveNow } from '@/utils/liveClock.js';
import { computeMatchStatus } from '@/utils/matchStatus.js';

/** @param {import('vue').Ref<string|null>|(() => string|null)|string|null} commenceTime */
export function useMatchStatus(commenceTime) {
  return computed(() => {
    const value = typeof commenceTime === 'function' ? commenceTime() : unref(commenceTime);
    return computeMatchStatus(value, liveNow.value);
  });
}
