// Aucun flux de score en direct dans l'app (Odds API ne fournit que le
// pré-match, et le plan API-Football en cours ne couvre pas la saison en
// cours) — le statut d'un match est donc une estimation par l'heure du coup
// d'envoi : "en direct" jusqu'à 130 min après (90 min + mi-temps + marge
// d'arrêts de jeu), "terminé" au-delà, sans confirmation d'un score réel tant
// que l'utilisateur ne l'a pas saisi lui-même dans Historique moteur.
export const LIVE_WINDOW_MS = 130 * 60 * 1000;

/** @returns {'upcoming'|'live'|'finished'|null} null si l'heure du match est inconnue. */
export function computeMatchStatus(commenceTime, now) {
  if (!commenceTime) return null;
  const kickoff = new Date(commenceTime).getTime();
  if (Number.isNaN(kickoff)) return null;
  if (kickoff > now) return 'upcoming';
  if (now - kickoff < LIVE_WINDOW_MS) return 'live';
  return 'finished';
}
