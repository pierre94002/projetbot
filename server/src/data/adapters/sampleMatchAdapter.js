/**
 * Convertit un match du jeu de données de test (voir generateur.js /
 * data/fixtures/sample-matches.json) en contrat d'entrée du moteur.
 */
export function adaptSampleMatch(rawMatch, bankroll) {
  return {
    matchId: rawMatch.matchId,
    home: rawMatch.home,
    away: rawMatch.away,
    bankroll,
    homeAdvantage: rawMatch.facteursContextuels?.avantageTerrain,
    expectedGoals: {
      home: rawMatch.xgHomeBrut,
      away: rawMatch.xgAwayBrut,
      provider: rawMatch.providerSource
    },
    marketOdds: {
      odds1: rawMatch.cotesMarche?.cote1,
      oddsDraw: rawMatch.cotesMarche?.coteN,
      odds2: rawMatch.cotesMarche?.cote2
    },
    structural: {
      home: { restDays: 7, squadRotation: rawMatch.facteursContextuels?.fatigueHome },
      away: { restDays: 7, squadRotation: rawMatch.facteursContextuels?.fatigueAway }
    }
  };
}
