/**
 * Prompts pour les repêchages via recherche web (outil serveur Anthropic
 * `web_search`) — utilisés uniquement quand API-Football ne peut pas
 * répondre pour la saison en cours (plan gratuit limité à 2022-2024, cf.
 * teamStatsService.js). Contrairement aux analyses IA (matchAiAnalysisPrompt.js),
 * il ne s'agit pas d'un avis qualitatif mais d'une recherche factuelle : la
 * consigne "n'invente rien" est donc encore plus stricte — une absence de
 * résultat fiable doit toujours ressortir en `available: false`, jamais un
 * onze ou un effectif deviné.
 */

export const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

export const SUBMIT_LINEUP_TOOL = {
  name: 'submit_lineup',
  description: "Soumets la composition trouvée pour ce match par recherche web, ou l'absence de résultat fiable.",
  input_schema: {
    type: 'object',
    properties: {
      available: { type: 'boolean', description: 'true seulement si une composition (officielle ou probable) a été trouvée sur une source fiable' },
      officialOrProbable: { type: 'string', enum: ['official', 'probable'], description: "'official' si publiée par les clubs, 'probable' si c'est une composition pressentie relayée par la presse sportive" },
      teams: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            teamName: { type: 'string' },
            formation: { type: 'string' },
            startXI: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' }, position: { type: 'string' } }, required: ['name'], additionalProperties: false }
            },
            substitutes: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' }, position: { type: 'string' } }, required: ['name'], additionalProperties: false }
            }
          },
          required: ['teamName', 'startXI'],
          additionalProperties: false
        }
      },
      sourceUrl: { type: 'string', description: "URL de la page où l'info a été trouvée" }
    },
    required: ['available'],
    additionalProperties: false
  }
};

// PAS de tool_choice forcé sur submit_lineup : forcer un outil précis pousse
// Claude à l'appeler dès le premier tour, SANS passer par web_search avant —
// confirmé le 2026-09-14 (content ne contenait alors qu'un seul bloc
// tool_use, jamais de recherche). "auto" laisse le modèle chercher d'abord,
// conformément à la consigne du system prompt ci-dessous.
export const SUBMIT_LINEUP_TOOL_CHOICE = { type: 'auto' };

export function buildLineupSearchRequest({ home, away, league, commenceTimeIso }) {
  const dateStr = commenceTimeIso ? commenceTimeIso.slice(0, 10) : 'date inconnue';
  const system = [
    `Tu cherches la composition d'équipe (titulaires et remplaçants) pour le match ${home} vs ${away}${league ? ` (${league})` : ''}, prévu le ${dateStr}.`,
    'Utilise l\'outil de recherche web. Cherche la composition OFFICIELLE si elle est déjà publiée (généralement disponible seulement dans l\'heure précédant le coup d\'envoi) ; sinon la composition PROBABLE la plus récente relayée par la presse sportive spécialisée.',
    "N'invente AUCUN joueur, AUCUN poste, AUCUNE formation : si tu ne trouves rien de fiable et suffisamment récent pour CE match précis, réponds available=false plutôt que de deviner.",
    'Réponds exclusivement via l\'outil submit_lineup, après avoir cherché.'
  ].join(' ');

  return { system, messages: [{ role: 'user', content: `Trouve la composition pour ce match : ${home} vs ${away}, le ${dateStr}.` }] };
}

export const SUBMIT_PLAYER_STATS_TOOL = {
  name: 'submit_player_stats',
  description: "Soumets l'effectif et les statistiques individuelles trouvés par recherche web pour cette équipe, ou l'absence de résultat fiable.",
  input_schema: {
    type: 'object',
    properties: {
      available: { type: 'boolean' },
      season: { type: 'string', description: 'ex. "2025-26" ou "2026"' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            position: { type: 'string' },
            appearances: { type: 'number' },
            goals: { type: 'number' },
            assists: { type: 'number' },
            yellowCards: { type: 'number' },
            redCards: { type: 'number' },
            rating: { type: 'number', description: 'note moyenne sur 10 si publiée par la source, jamais calculée toi-même' }
          },
          required: ['name'],
          additionalProperties: false
        }
      },
      sourceUrl: { type: 'string' }
    },
    required: ['available'],
    additionalProperties: false
  }
};

// Même correctif que SUBMIT_LINEUP_TOOL_CHOICE ci-dessus : "auto", pas forcé.
export const SUBMIT_PLAYER_STATS_TOOL_CHOICE = { type: 'auto' };

export function buildPlayerStatsSearchRequest({ teamName, league }) {
  const system = [
    `Tu cherches l'effectif actuel de l'équipe ${teamName}${league ? ` (${league})` : ''} pour la saison en cours, avec les statistiques individuelles disponibles (apparitions, buts, passes décisives, cartons, note moyenne si publiée).`,
    "Utilise l'outil de recherche web. N'invente AUCUN joueur ni AUCUNE statistique : un champ non trouvé sur ta source doit être omis, jamais deviné ou estimé.",
    'Réponds exclusivement via l\'outil submit_player_stats, après avoir cherché.'
  ].join(' ');

  return { system, messages: [{ role: 'user', content: `Effectif actuel et statistiques individuelles de : ${teamName}.` }] };
}

/**
 * Profil complet d'une équipe (effectif + forme + moyennes historiques) EN UN
 * SEUL appel — utilisé pour les équipes des coupes européennes (Ligue des
 * champions/Europa/Conference), qui viennent de ~55 championnats différents
 * et n'ont donc pas d'équivalent local (contrairement aux 16 championnats
 * couverts par historicalMatchesProvider.js). Combiner effectif + forme +
 * moyennes dans une seule recherche plutôt que deux appels séparés (un pour
 * submit_player_stats, un pour la forme) — sur ~100 équipes, ça divise par
 * deux le nombre d'appels Anthropic nécessaires pour peupler
 * team-profiles.json (cf. teamProfileRepository.js).
 */
export const SUBMIT_TEAM_PROFILE_TOOL = {
  name: 'submit_team_profile',
  description: "Soumets le profil trouvé par recherche web pour cette équipe (effectif, forme récente, moyennes historiques), ou l'absence de résultat fiable.",
  input_schema: {
    type: 'object',
    properties: {
      available: { type: 'boolean' },
      season: { type: 'string', description: 'ex. "2025-26" ou "2026"' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            position: { type: 'string' },
            appearances: { type: 'number' },
            goals: { type: 'number' },
            assists: { type: 'number' },
            yellowCards: { type: 'number' },
            redCards: { type: 'number' },
            rating: { type: 'number', description: 'note moyenne sur 10 si publiée par la source' }
          },
          required: ['name'],
          additionalProperties: false
        }
      },
      recentForm: {
        type: 'array',
        items: { type: 'string', enum: ['V', 'N', 'D'] },
        description: 'Les derniers résultats connus (toutes compétitions confondues), du plus récent au plus ancien : V=victoire, N=nul, D=défaite.'
      },
      historicalAverages: {
        type: 'object',
        description: 'Moyennes par match sur la saison en cours, uniquement les champs trouvés sur une source fiable — jamais estimés.',
        properties: {
          goalsFor: { type: 'number' },
          goalsAgainst: { type: 'number' },
          shots: { type: 'number' },
          shotsOnTarget: { type: 'number' },
          corners: { type: 'number' }
        }
      },
      sourceUrl: { type: 'string' }
    },
    required: ['available'],
    additionalProperties: false
  }
};

export function buildTeamProfileSearchRequest({ teamName, league }) {
  const system = [
    `Tu constitues un profil complet de l'équipe ${teamName}${league ? ` (${league})` : ''} pour la saison en cours : effectif avec statistiques individuelles, forme récente (5-10 derniers résultats toutes compétitions confondues), et moyennes d'équipe par match (buts marqués/encaissés, tirs, corners) si disponibles.`,
    "Utilise l'outil de recherche web (plusieurs recherches si besoin : une pour l'effectif, une pour la forme/les moyennes). N'invente AUCUNE donnée : un champ non trouvé sur une source fiable doit être omis, jamais deviné ou estimé.",
    'Réponds exclusivement via l\'outil submit_team_profile, après avoir cherché.'
  ].join(' ');

  return { system, messages: [{ role: 'user', content: `Profil complet (effectif, forme, moyennes) de : ${teamName}.` }] };
}
