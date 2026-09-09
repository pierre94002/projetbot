/**
 * Force une réponse structurée (jamais de parsing de prose) : Claude doit
 * appeler cet outil plutôt que répondre en texte libre, cf. tool_choice
 * dans aiAnalysisService.js.
 */
export const SUBMIT_ANALYSIS_TOOL = {
  name: 'submit_analysis',
  description: "Soumets l'analyse structurée des pronostics passés du moteur CôteMaster.",
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Synthèse en 2-4 phrases des tendances observées.' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            factor: { type: 'string', description: 'ex: "venue", "competition_type", "season_phase", "market", "other"' },
            observation: { type: 'string' },
            evidence: { type: 'string', description: 'Chiffres/exemples précis tirés du dataset fourni.' },
            suggestionText: { type: 'string', description: 'Suggestion textuelle uniquement — jamais une valeur à appliquer automatiquement.' }
          },
          required: ['factor', 'observation', 'evidence', 'suggestionText'],
          additionalProperties: false
        }
      },
      sampleSizeAnalyzed: { type: 'integer' },
      caveats: { type: 'string', description: 'Limites du dataset (échantillon réduit, peu de matchs de coupe, enrichissement partiel...).' }
    },
    required: ['summary', 'findings', 'sampleSizeAnalyzed'],
    additionalProperties: false
  }
};

export const SUBMIT_ANALYSIS_TOOL_CHOICE = { type: 'tool', name: 'submit_analysis' };

const ENGINE_LEVERS =
  'edgeThresholdMin/Max, defaultCorrelation (Dixon-Coles), kellyFraction, maxStakePercent, homeAdvantage, cornersAdjustmentMax, weights.market/structural/exogenous';

export function buildAnalysisRequest(datasetRecords, engineConfigSnapshot) {
  const system = [
    "Tu es un analyste quantitatif qui audite a posteriori les pronostics d'un moteur de paris sportifs (CôteMaster, Poisson + Dixon-Coles).",
    'Rôle strictement consultatif : ne recommande AUCUNE valeur numérique à appliquer automatiquement, ne prétends jamais modifier la configuration toi-même — formule des observations et suggestions textuelles que l\'utilisateur lira et appliquera lui-même s\'il le souhaite.',
    "Corrèle la justesse des pronostics (champ outcome: correct/incorrect) avec les facteurs disponibles : lieu (enrichment.venue), type de compétition (enrichment.competitionType: league/cup/unknown), phase de saison (enrichment.seasonPhase: early/mid/late/unknown), marché parié (market), et edge/cote. N'invente jamais de facteur non présent dans les données fournies ; signale plutôt dans `caveats` quand l'échantillon ou l'enrichissement est trop limité pour conclure sur un facteur donné (ex. beaucoup de enrichment.matched:false).",
    `Leviers réglables existants du moteur, pour contextualiser des suggestions actionnables sans les appliquer toi-même : ${ENGINE_LEVERS}.`,
    'Réponds exclusivement via l\'outil submit_analysis.'
  ].join(' ');

  const user = `${datasetRecords.length} pronostics réglés (corrects/incorrects), avec enrichissement best-effort :\n${JSON.stringify(datasetRecords)}\n\nConfiguration actuelle du moteur :\n${JSON.stringify(engineConfigSnapshot)}`;

  return { system, messages: [{ role: 'user', content: user }] };
}
