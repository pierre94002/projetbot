export function formatOdds(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

export function formatPercent(value, { showSign = false } = {}) {
  if (value === null || value === undefined) return '—';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
}

export function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoString));
}

/** Heure seule si aujourd'hui, sinon jour + mois abrégés — pour les listes de matchs denses. */
export function formatKickoff(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();

  return isSameDay
    ? new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(date)
    : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}

/** Heure seule, toujours — pour une ligne déjà regroupée sous un en-tête de date. */
export function formatTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(isoString));
}

/** Jour complet ("lundi 7 septembre") — pour les en-têtes de regroupement par jour. */
export function formatDay(dayKey) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${dayKey}T00:00:00`));
}
