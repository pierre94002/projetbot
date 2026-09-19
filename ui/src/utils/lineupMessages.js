// Partagé entre TeamSquadView.vue et TeamStatsModal.vue — même API, mêmes
// raisons de "compo indisponible" (cf. getLiveLineups côté serveur).
export const LINEUP_UNAVAILABLE_MESSAGES = {
  not_published_yet: "Compo pas encore publiée par les clubs — généralement disponible dans l'heure précédant le coup d'envoi.",
  fixture_not_found: "Rencontre introuvable dans les données API-Football (nom d'équipe non reconnu ou match trop éloigné dans le temps).",
  team_not_found: 'Équipe introuvable dans les données API-Football.',
  season_not_available:
    "Compo indisponible : le plan API-Football actuel ne couvre pas la saison en cours et la recherche web de secours n'a pas pu être lancée pour ce match.",
  // La saison en cours (hors plan gratuit API-Football) passe automatiquement
  // par une recherche web (cf. webLookupService.js) — ces raisons ne
  // s'affichent donc que si ce repli lui-même n'a rien trouvé ou n'est pas
  // disponible, pas pour la simple limite de saison.
  ai_not_connected:
    "Compo indisponible pour la saison en cours : connecte une clé API Anthropic (Réglages > Connexion IA) pour activer la recherche web de secours.",
  not_found_via_web: "Compo introuvable, y compris via recherche web — probablement pas encore publiée ou match trop incertain.",
  web_lookup_failed: 'La recherche web de la composition a échoué — réessaie dans un instant.'
};

// Message complet pour une compo indisponible : la raison traduite, plus le
// détail renvoyé par le serveur quand il y en a un (ex. crédits IA épuisés).
export function describeLineupUnavailable(result) {
  const base = LINEUP_UNAVAILABLE_MESSAGES[result?.reason] ?? 'Composition introuvable pour ce match.';
  return result?.message ? `${base} (${result.message})` : base;
}

// Même raisons, mêmes limites (cf. getLiveMatchDetails côté serveur) —
// texte adapté au score/stats en direct plutôt qu'à la composition.
export const LIVE_MATCH_UNAVAILABLE_MESSAGES = {
  season_not_available:
    "Score et stats en direct indisponibles : le plan API-Football actuel ne couvre que les saisons 2022-2024, pas la saison en cours. Ça débloquera automatiquement dès le passage sur un plan sans cette limite.",
  fixture_not_found: "Rencontre introuvable dans les données API-Football (nom d'équipe non reconnu ou match trop éloigné dans le temps).",
  team_not_found: 'Équipe introuvable dans les données API-Football.'
};
