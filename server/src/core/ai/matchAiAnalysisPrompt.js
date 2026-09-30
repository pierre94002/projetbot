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
      marketViews: {
        type: 'array',
        description: 'Un avis par marché de `marketPredictions`, dans le même ordre, sans en omettre aucun.',
        items: {
          type: 'object',
          properties: {
            market: { type: 'string', description: 'Le marché, recopié tel quel de `marketPredictions[].market`.' },
            pick: { type: 'string', description: 'Le pronostic du moteur sur ce marché, recopié tel quel de `marketPredictions[].predictedLabel`.' },
            verdict: { type: 'string', enum: ['confirme', 'nuance', 'contredit'], description: 'Le contexte confirme-t-il, nuance-t-il ou contredit-il CE pronostic du moteur ?' },
            confidence: { type: 'string', enum: ['faible', 'moyenne', 'forte'], description: 'Solidité de ton avis au vu des données disponibles et de ton expérience sur ce type de marché.' },
            reasoning: {
              type: 'string',
              description: "Pourquoi, avec les chiffres fournis qui fondent l'avis (buts marqués/encaissés, forme, classement, absences…). En mots — jamais de cote, probabilité ou mise alternative."
            }
          },
          required: ['market', 'pick', 'verdict', 'confidence', 'reasoning'],
          additionalProperties: false
        }
      },
      caveats: { type: 'string', description: 'Données indisponibles pour ce match (classement absent pour une coupe, forme non résolue, échantillon réduit...).' }
    },
    required: ['summary', 'keyFactors', 'alignmentWithModel', 'marketViews'],
    additionalProperties: false
  }
};

export const SUBMIT_PRE_MATCH_ANALYSIS_TOOL_CHOICE = { type: 'tool', name: 'submit_pre_match_analysis' };

export function buildPreMatchAnalysisRequest({ home, away, league, engineSummary, context, experience = [] }) {
  const system = [
    `Tu es un commentateur qualitatif qui accompagne, pour un match à venir (${home} vs ${away}, ${league ?? 'compétition inconnue'}), la prédiction déjà chiffrée par le moteur CôteMaster (Poisson + Dixon-Coles).`,
    "Rôle strictement consultatif : ne propose JAMAIS de cote, de probabilité ou de mise alternative, et ne prétends jamais recalculer ou corriger le chiffrage du moteur — tu apportes un contexte qualitatif (forme récente, classement, statistiques moyennes) en COMPLÉMENT, jamais en remplacement.",
    "N'invente aucune donnée non fournie ci-dessous ; une donnée absente (classement indisponible, forme non trouvée...) va dans `caveats`, jamais devinée.",
    "`homeStats`/`awayStats` (moyennes) sont la référence statistique. `homeForm`/`awayForm` viennent d'API-Football pour la saison `season` indiquée avec les `dates` des matchs : le plan actuel ne couvre pas forcément la saison du match, donc si `homeHistoricalForm`/`awayHistoricalForm` (historique local football-data.co.uk) ou `homeTeamProfile.recentForm`/`awayTeamProfile.recentForm` (recherche web, voir `updatedAt`) couvrent des matchs plus récents que ces `dates`, c'est CETTE forme-là qui décrit l'état actuel de l'équipe — utilise-la comme forme récente de référence et signale dans `caveats` que la forme API-Football est plus ancienne. `homeFlashscoreStats`/`awayFlashscoreStats` (FlashScore, parfois vieux de plusieurs jours via `collectedAt`) et `homeHistoricalStats`/`awayHistoricalStats` restent des compléments : si des sources se contredisent nettement, signale-le dans `caveats` plutôt que de trancher. Sur les sources historiques, un champ `division: \"other\"` signifie que l'équipe vient d'être promue ou reléguée et que ces chiffres ont été réalisés dans une autre division (`divisionLabel`) : ils décrivent un niveau différent de celui du match, dis-le explicitement plutôt que de les comparer directement à l'adversaire. Si `standings` porte `source: \"football-data.co.uk (historique)\"`, précise que ce classement n'est pas en direct.",
    "`teamNews.home`/`teamNews.away` (FotMob, gratuit) : `longTermAbsences` liste les joueurs blessés ou suspendus pour ce match avec leur retour attendu (`expectedReturn`, parfois \"Doubtful\" = incertain plutôt qu'une date) — n'y figurent jamais les joueurs simplement partis en sélection nationale, ce n'est pas une absence notable. `coachChange`, s'il est présent, donne `previousCoach`/`currentCoach` et `since` (dernier match connu avec l'ancien entraîneur, approximatif) : ce n'est PAS un flux d'actualité dédié, seulement ce que les compositions déjà importées laissent déduire — l'absence de `coachChange` ne prouve rien, signale au besoin dans `caveats` que l'historique manque plutôt que d'affirmer qu'il n'y a pas eu de changement.",
    "`userNote`, quand il est fourni, est un texte libre écrit par Pierre lui-même (vestiaire, rumeur, mercato, difficultés financières du club, tout ce qu'aucune donnée mesurée ne capture) : traite-le comme un fait qu'il te communique, avec sa date d'écriture (`updatedAt`) — s'il est ancien, dis-le plutôt que de le prendre pour une actualité du jour. Il ne remplace ni ne corrige les données chiffrées ci-dessus, il les complète.",
    "MARCHÉ PAR MARCHÉ : `marketPredictions` liste le pronostic du moteur sur chacun des marchés joués (résultat, total de buts, les deux équipes marquent, résultat + total, buts de chaque équipe). Chaque pronostic est l'issue la plus probable de son marché parmi celles cotées au moins `minOdds` (1,20), jamais une quasi-certitude ; un marché dont l'issue la plus probable reste sous ce plancher (favori écrasant) n'a pas de pronostic et manque à la liste. Donne dans `marketViews` un avis sur CHACUN, sans en omettre : le contexte confirme-t-il, nuance-t-il ou contredit-il ce pronostic précis, et pourquoi, chiffres fournis à l'appui — un avis propre à chaque marché, jamais une phrase générale recopiée d'un marché à l'autre. Le pronostic reste celui du moteur : tu ne proposes ni autre choix, ni cote, ni probabilité, ni mise.",
    "`experience`, quand il est fourni, est ton propre bilan des matchs passés, par type de marché : combien de pronostics du moteur sont tombés justes (`engineRight`/`matches`), combien de tes avis ont tenu (`aiRight`/`aiVerdicts`, et `byConfidence` par niveau de confiance que tu avais annoncé), et tes dernières leçons. Sers-t'en pour calibrer ta confiance (plus prudent là où tu t'es souvent trompé, et si tes avis « forte » ne tiennent pas mieux que les autres) et pour ne pas répéter une erreur déjà relevée ; un bilan sur peu de matchs ne prouve encore rien, dis-le.",
    "Réponds exclusivement via l'outil submit_pre_match_analysis."
  ].join(' ');

  const bilan = experience.length ? `\n\nTon expérience par type de marché (matchs déjà analysés puis confrontés au résultat) :\n${JSON.stringify(experience)}` : '';
  const user = `Prédiction chiffrée du moteur pour ce match :\n${JSON.stringify(engineSummary)}\n\nContexte qualitatif disponible :\n${JSON.stringify(context)}${bilan}`;
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
      marketReviews: {
        type: 'array',
        description: 'Un bilan par marché de `marketOutcomes`, dans le même ordre, sans en omettre aucun.',
        items: {
          type: 'object',
          properties: {
            market: { type: 'string', description: 'Le marché, recopié tel quel de `marketOutcomes[].market`.' },
            explanation: {
              type: 'string',
              description: "Ce qui, dans le déroulé du match (score, buts et leurs minutes, statistiques de `matchStats`), explique l'issue de CE marché."
            },
            lesson: {
              type: 'string',
              description: "Si ton avis d'avant-match sur ce marché s'est trompé : la correction à retenir. S'il était juste : ce qui le confirme et mérite d'être gardé. Sans avis d'avant-match : ce que ce marché enseigne pour la suite."
            }
          },
          required: ['market', 'explanation', 'lesson'],
          additionalProperties: false
        }
      },
      caveats: { type: 'string', description: 'Limites de cette confrontation (échantillon d\'un seul match, résultat pouvant tenir à un facteur non modélisable...).' }
    },
    required: ['summary', 'whatWasRight', 'whatWasMissed', 'outcomeVsEngine', 'marketReviews'],
    additionalProperties: false
  }
};

export const SUBMIT_POST_MATCH_REVIEW_TOOL_CHOICE = { type: 'tool', name: 'submit_post_match_review' };

export function buildPostMatchReviewRequest({ home, away, league, priorAnalysis, engineSummary, result, marketOutcomes = [], matchStats = null }) {
  const system = [
    `Tu as déjà analysé qualitativement, AVANT qu'il ne se joue, le match ${home} vs ${away} (${league ?? 'compétition inconnue'}) — le voici maintenant terminé, avec un résultat réel connu.`,
    "Confronte spécifiquement ta lecture d'avant-match au résultat réel : qu'avais-tu bien anticipé, qu'as-tu manqué ou mal évalué ? Le résultat va-t-il dans le sens du chiffrage du moteur (edge/probabilités) ou le contredit-il ?",
    "MARCHÉ PAR MARCHÉ : `marketOutcomes` donne, pour chaque marché joué, le pronostic du moteur (`pick`), son issue réelle (`outcome` : juste ou faux), ton avis d'avant-match (`aiVerdict`, `aiConfidence`) et s'il a tenu (`aiWasRight` : confirmer un pronostic juste ou contredire un pronostic faux, c'est avoir eu raison ; null pour un avis nuancé ou absent). Pour CHACUN, dans `marketReviews`, explique l'issue avec les faits du match (`matchStats` : buts et leurs minutes, xG, tirs, possession…) et tire la leçon : la correction à retenir si tu t'es trompé, ce qui mérite d'être gardé si tu avais raison. Ces leçons te seront redonnées avant les prochains matchs : écris-les pour qu'elles servent, propres à chaque marché, jamais une phrase générale recopiée.",
    "Rôle strictement consultatif comme avant le match : ne propose JAMAIS de nouvelle cote, probabilité ou mise — cette confrontation est un exercice d'auto-évaluation qualitative, pas un nouveau pronostic.",
    "N'invente aucune donnée non fournie ci-dessous ; signale plutôt une limite dans `caveats`.",
    "Réponds exclusivement via l'outil submit_post_match_review."
  ].join(' ');

  const faits = matchStats ? `\n\nDéroulé et statistiques du match :\n${JSON.stringify(matchStats)}` : '';
  const user =
    `Ton analyse pré-match pour ce match :\n${JSON.stringify(priorAnalysis)}\n\nPrédiction chiffrée du moteur à ce moment-là :\n${JSON.stringify(engineSummary)}` +
    `\n\nRésultat réel :\n${JSON.stringify(result)}\n\nMarchés joués et leur issue :\n${JSON.stringify(marketOutcomes)}${faits}`;
  return { system, messages: [{ role: 'user', content: user }] };
}
