// Partagé entre TeamSquadView.vue et TeamStatsModal.vue — même API, mêmes
// raisons de "compo indisponible" (cf. getLiveLineups côté serveur).
export const LINEUP_UNAVAILABLE_MESSAGES = {
  season_not_available:
    "Compo indisponible : le plan API-Football actuel ne couvre que les saisons 2022-2024, pas la saison en cours. Ça débloquera automatiquement dès le passage sur un plan sans cette limite.",
  not_published_yet: "Compo pas encore publiée par les clubs — généralement disponible dans l'heure précédant le coup d'envoi.",
  fixture_not_found: "Rencontre introuvable dans les données API-Football (nom d'équipe non reconnu ou match trop éloigné dans le temps).",
  team_not_found: 'Équipe introuvable dans les données API-Football.'
};

// Même raisons, mêmes limites (cf. getLiveMatchDetails côté serveur) —
// texte adapté au score/stats en direct plutôt qu'à la composition.
export const LIVE_MATCH_UNAVAILABLE_MESSAGES = {
  season_not_available:
    "Score et stats en direct indisponibles : le plan API-Football actuel ne couvre que les saisons 2022-2024, pas la saison en cours. Ça débloquera automatiquement dès le passage sur un plan sans cette limite.",
  fixture_not_found: "Rencontre introuvable dans les données API-Football (nom d'équipe non reconnu ou match trop éloigné dans le temps).",
  team_not_found: 'Équipe introuvable dans les données API-Football.'
};
