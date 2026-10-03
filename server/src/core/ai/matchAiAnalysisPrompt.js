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
      summary: {
        type: 'string',
        description: 'Synthèse qualitative en 2-4 phrases : la forme des deux équipes, leurs statistiques et moyennes, et ce que disent les compositions (qui joue, qui manque).'
      },
      keyFactors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            factor: { type: 'string', description: 'ex: "forme récente", "statistiques et moyennes", "compositions", "absences", "classement", "edge du modèle"' },
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
            explanation: {
              type: 'string',
              description:
                "UNE phrase (30 mots au plus) qui explique le pourcentage du moteur pour CE pronostic (`marketPredictions[].probability`), avec le ou les chiffres qui le fondent : forme récente, moyennes produites et concédées, nombres attendus (`statExpectations`), joueurs alignés ou absents. Ex. : « 76 % : Arsenal n'a marqué plus de 3 buts qu'une fois en 10 matchs et Leeds n'en encaisse que 1,1 par match à l'extérieur. » Tu expliques le chiffre du moteur, tu n'en proposes jamais un autre."
            },
            reasoning: {
              type: 'string',
              description:
                "Ton avis en 1 à 2 phrases : pourquoi le contexte confirme, nuance ou contredit ce pronostic, chiffres fournis à l'appui (forme, moyennes, composition, absences…). En mots — jamais de cote, probabilité ou mise alternative."
            }
          },
          required: ['market', 'pick', 'verdict', 'confidence', 'explanation', 'reasoning'],
          additionalProperties: false
        }
      },
      lineupImpact: {
        type: 'string',
        description:
          "Dès que `lineups` est fourni : ce que les compositions changent à la lecture du match et des marchés — titulaires habituels absents ou remplaçants, joueurs décisifs présents, choix de l'entraîneur (rotation, système), avec les chiffres des joueurs concernés. Avec `lineups.source: \"magasin\"`, dis que c'est la dernière composition alignée, pas celle du match."
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
    "Rôle strictement consultatif : ne propose JAMAIS de cote, de probabilité ou de mise alternative, et ne prétends jamais recalculer ou corriger le chiffrage du moteur — tu apportes un contexte qualitatif (forme, statistiques et moyennes, compositions, classement) en COMPLÉMENT, jamais en remplacement. Tu peux citer les pourcentages du moteur pour les expliquer, jamais en proposer d'autres.",
    "N'invente aucune donnée non fournie ci-dessous ; une donnée absente (classement indisponible, forme non trouvée...) va dans `caveats`, jamais devinée.",
    "Analyse d'abord, pour chaque équipe, sa FORME, ses STATISTIQUES et MOYENNES, puis sa COMPOSITION. Forme : `homeForm`/`awayForm` (`source: \"FotMob (magasin)\"`), ses derniers matchs de la saison en cours avec date, adversaire, lieu (`venue`), score et résultat — la forme de référence. Statistiques : `homeStats`/`awayStats` (`source: \"FotMob (magasin)\"`, du `from` au `to`) sur ses 10 derniers matchs toutes compétitions (`last10`) puis sur ceux joués au lieu de CE match (`atHome` pour l'équipe qui reçoit, `away` pour l'autre) : `results` (V/N/D, du plus récent au plus ancien), buts marqués et encaissés par match (`goalsFor`/`goalsAgainst`), et par match pour l'équipe (`for`) comme pour ses adversaires (`against`) : xG, tirs, tirs cadrés, grosses occasions, corners, possession, cartons jaunes — ce qu'elle produit ET ce qu'elle concède. Une équipe que le magasin ne connaît pas peut n'avoir que des sources plus anciennes ou partielles, à signaler dans `caveats` : `homeForm.source: \"API-Football\"` (saison `season` du plan, souvent dépassée), `homeStats.source: \"API-Football\"`, `homeFlashscoreStats` (FlashScore, `collectedAt`), `homeHistoricalStats`/`homeHistoricalForm` (football-data.co.uk, 5 saisons ; `division: \"other\"` = chiffres réalisés dans une autre division `divisionLabel`, à ne pas comparer directement à l'adversaire), `homeTeamProfile` (recherche web, `updatedAt`). Si `standings` porte `source: \"football-data.co.uk (historique)\"`, précise que ce classement n'est pas en direct.",
    "`teamNews.home`/`teamNews.away` (FotMob, gratuit) : `longTermAbsences` liste les joueurs blessés ou suspendus pour ce match avec leur retour attendu (`expectedReturn`, parfois \"Doubtful\" = incertain plutôt qu'une date) — n'y figurent jamais les joueurs simplement partis en sélection nationale, ce n'est pas une absence notable. `coachChange`, s'il est présent, donne `previousCoach`/`currentCoach` et `since` (dernier match connu avec l'ancien entraîneur, approximatif) : ce n'est PAS un flux d'actualité dédié, seulement ce que les compositions déjà importées laissent déduire — l'absence de `coachChange` ne prouve rien, signale au besoin dans `caveats` que l'historique manque plutôt que d'affirmer qu'il n'y a pas eu de changement.",
    "`lineups` est la composition à analyser joueur par joueur. `source: \"FotMob\"` : la composition de CE match relue chez FotMob (`minutesBeforeKickoff` avant le coup d'envoi ; relevée moins d'une heure avant, elle est presque toujours officielle — plus tôt, dis que ce peut être une prévision). `source: \"magasin\"` : FotMob n'a encore rien publié, c'est la DERNIÈRE composition alignée par chaque équipe, lors du match `lastMatch` — pas celle de ce match : présente-la comme le onze probable, jamais comme officiel ; un joueur de ce onze que FotMob annonce indisponible pour CE match (`unavailable`) ne jouera pas. Pour chaque équipe : la formation, l'entraîneur, le onze de départ (`startXI`), les remplaçants qui ont compté cette saison (`bench` : au moins 3 titularisations, ou un but ou une passe décisive), les absents avec leur motif (`unavailable`), et pour chaque joueur ses chiffres depuis `statsSince`, toutes compétitions (`apps` matchs joués, `starts` titularisations, `goals`, `assists`, `xg`, `rating` note moyenne ; `stats` null = joueur inconnu du magasin, souvent une recrue ou un jeune). `usualStartersMissing` liste les titulaires habituels (au moins la moitié des `teamMatches` de l'équipe) qui ne sont PAS dans le onze, avec leur statut (remplaçant, blessé, suspendu, absent de la feuille). Appuie chaque avis de marché sur QUI joue (buteur ou gardien titulaire absent, défense remaniée, rotation avant une coupe, retour d'un cadre) et résume-le dans `lineupImpact`. `lineups.matchInfo`, quand il est là, donne le cadre publié par FotMob : stade et pelouse (`surface`), météo (`weather`, `temperature`, `windSpeed` en km/h, `precipitation`), arbitre (`referee` : matchs dirigés, cartons jaunes et fautes par match face à la moyenne du championnat, rouges, penalties) — cite-le seulement s'il pèse sur un marché (pluie ou vent forts, terrain synthétique, arbitre nettement plus sévère que la moyenne).",
    "`userNote`, quand il est fourni, est un texte libre écrit par Pierre lui-même (vestiaire, rumeur, mercato, difficultés financières du club, tout ce qu'aucune donnée mesurée ne capture) : traite-le comme un fait qu'il te communique, avec sa date d'écriture (`updatedAt`) — s'il est ancien, dis-le plutôt que de le prendre pour une actualité du jour. Il ne remplace ni ne corrige les données chiffrées ci-dessus, il les complète.",
    "MARCHÉ PAR MARCHÉ : `marketPredictions` liste le pronostic du moteur sur chacun des marchés joués (résultat, total de buts, les deux équipes marquent, résultat + total, buts de chaque équipe, et — quand le magasin a assez de relevés — corners, tirs et tirs cadrés, au total et par équipe ; `statExpectations` donne le nombre attendu de chacun pour chaque équipe, d'après ce qu'elle produit et ce que l'adversaire concède sur leurs 10 derniers matchs). Chaque pronostic est l'issue la plus probable de son marché parmi celles cotées au moins `minOdds` (1,20), jamais une quasi-certitude ; un marché dont l'issue la plus probable reste sous ce plancher (favori écrasant) n'a pas de pronostic et manque à la liste. Chacun porte `probability`, le pourcentage du moteur pour cette issue (1 / cote juste), celui qu'affiche l'appli à côté du pronostic. Donne dans `marketViews` une entrée pour CHACUN, sans en omettre : `explanation`, UNE phrase qui explique ce pourcentage avec les chiffres qui le fondent (forme, moyennes produites et concédées, `statExpectations` pour les corners et les tirs, joueurs alignés ou absents — par exemple pourquoi 76 % et pas davantage) ; puis `verdict` et `reasoning` : le contexte confirme-t-il, nuance-t-il ou contredit-il ce pronostic précis, et pourquoi. Une explication et un avis propres à chaque marché, jamais une phrase générale recopiée d'un marché à l'autre. Le pronostic et son pourcentage restent ceux du moteur : tu ne proposes ni autre choix, ni cote, ni probabilité, ni mise.",
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
