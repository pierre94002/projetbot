/**
 * Prompts pour l'analyse IA PAR MATCH (avant/après), distincte de l'audit par
 * lot (aiAnalysisPrompt.js) : ici on commente UN match précis, jamais un
 * ensemble de pronostics. Même discipline de rôle consultatif : aucune cote,
 * aucune probabilité, aucune mise proposée par l'IA à aucun moment.
 */

export const SUBMIT_PRE_MATCH_ANALYSIS_TOOL = {
  name: 'submit_pre_match_analysis',
  description: "Soumets le commentaire qualitatif structuré sur un match à venir, en complément de la prédiction chiffrée déjà produite par le moteur CôteMaster.",
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Synthèse qualitative en 2-4 phrases du contexte du match (forme, classement, statistiques).' },
      keyFactors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            factor: { type: 'string', description: 'ex: "forme récente", "classement", "statistiques moyennes", "edge du modèle"' },
            observation: { type: 'string' },
            evidence: { type: 'string', description: 'Chiffres précis tirés UNIQUEMENT des données fournies (classement, forme V/N/D, moyennes).' }
          },
          required: ['factor', 'observation', 'evidence'],
          additionalProperties: false
        }
      },
      alignmentWithModel: {
        type: 'string',
        description: "Le contexte qualitatif va-t-il dans le même sens que l'edge chiffré du moteur, ou le nuance-t-il ? En mots uniquement — jamais de cote, probabilité ou mise alternative."
      },
      caveats: { type: 'string', description: 'Données indisponibles pour ce match (classement absent pour une coupe, forme non résolue, échantillon réduit...).' }
    },
    required: ['summary', 'keyFactors', 'alignmentWithModel'],
    additionalProperties: false
  }
};

export const SUBMIT_PRE_MATCH_ANALYSIS_TOOL_CHOICE = { type: 'tool', name: 'submit_pre_match_analysis' };

export function buildPreMatchAnalysisRequest({ home, away, league, engineSummary, context }) {
  const system = [
    `Tu es un commentateur qualitatif qui accompagne, pour un match à venir (${home} vs ${away}, ${league ?? 'compétition inconnue'}), la prédiction déjà chiffrée par le moteur CôteMaster (Poisson + Dixon-Coles).`,
    "Rôle strictement consultatif : ne propose JAMAIS de cote, de probabilité ou de mise alternative, et ne prétends jamais recalculer ou corriger le chiffrage du moteur — tu apportes un contexte qualitatif (forme récente, classement, statistiques moyennes) en COMPLÉMENT, jamais en remplacement.",
    "N'invente aucune donnée non fournie ci-dessous ; une donnée absente (classement indisponible, forme non trouvée...) va dans `caveats`, jamais devinée.",
    "Réponds exclusivement via l'outil submit_pre_match_analysis."
  ].join(' ');

  const user = `Prédiction chiffrée du moteur pour ce match :\n${JSON.stringify(engineSummary)}\n\nContexte qualitatif disponible :\n${JSON.stringify(context)}`;
  return { system, messages: [{ role: 'user', content: user }] };
}

export const SUBMIT_POST_MATCH_REVIEW_TOOL = {
  name: 'submit_post_match_review',
  description: "Soumets la confrontation structurée entre une analyse IA pré-match déjà soumise et le résultat réel du match, une fois celui-ci connu.",
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Synthèse en 2-4 phrases de la confrontation entre la lecture pré-match et le résultat réel.' },
      whatWasRight: { type: 'string', description: "Ce que l'analyse pré-match avait correctement anticipé, avec preuve tirée du résultat réel." },
      whatWasMissed: { type: 'string', description: "Ce que l'analyse pré-match avait manqué ou mal évalué, avec preuve tirée du résultat réel." },
      outcomeVsEngine: { type: 'string', description: "Le résultat réel va-t-il dans le sens du chiffrage du moteur (edge/probabilités) ou le contredit-il ? En mots uniquement." },
      caveats: { type: 'string', description: 'Limites de cette confrontation (échantillon d\'un seul match, résultat pouvant tenir à un facteur non modélisable...).' }
    },
    required: ['summary', 'whatWasRight', 'whatWasMissed', 'outcomeVsEngine'],
    additionalProperties: false
  }
};

export const SUBMIT_POST_MATCH_REVIEW_TOOL_CHOICE = { type: 'tool', name: 'submit_post_match_review' };

export function buildPostMatchReviewRequest({ home, away, league, priorAnalysis, engineSummary, result }) {
  const system = [
    `Tu as déjà analysé qualitativement, AVANT qu'il ne se joue, le match ${home} vs ${away} (${league ?? 'compétition inconnue'}) — le voici maintenant terminé, avec un résultat réel connu.`,
    "Confronte spécifiquement ta lecture d'avant-match au résultat réel : qu'avais-tu bien anticipé, qu'as-tu manqué ou mal évalué ? Le résultat va-t-il dans le sens du chiffrage du moteur (edge/probabilités) ou le contredit-il ?",
    "Rôle strictement consultatif comme avant le match : ne propose JAMAIS de nouvelle cote, probabilité ou mise — cette confrontation est un exercice d'auto-évaluation qualitative, pas un nouveau pronostic.",
    "N'invente aucune donnée non fournie ci-dessous ; signale plutôt une limite dans `caveats`.",
    "Réponds exclusivement via l'outil submit_post_match_review."
  ].join(' ');

  const user = `Ton analyse pré-match pour ce match :\n${JSON.stringify(priorAnalysis)}\n\nPrédiction chiffrée du moteur à ce moment-là :\n${JSON.stringify(engineSummary)}\n\nRésultat réel :\n${JSON.stringify(result)}`;
  return { system, messages: [{ role: 'user', content: user }] };
}
