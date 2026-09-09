/**
 * Calcule un consensus de marché 1N2 en moyennant les cotes proposées par
 * l'ensemble des bookmakers disponibles pour un match. C'est le signal le
 * plus fort du moteur (le marché agrège déjà énormément d'information).
 */
export function computeMarketConsensus(bookmakers, homeTeam, awayTeam, { minOdds = 1.01 } = {}) {
  if (!bookmakers || !Array.isArray(bookmakers)) return null;

  const homeOdds = [];
  const drawOdds = [];
  const awayOdds = [];
  const perBookmaker = [];

  for (const bookmaker of bookmakers) {
    const h2hMarket = bookmaker.markets?.find((market) => market.key === 'h2h');
    if (!h2hMarket?.outcomes) continue;

    const home = h2hMarket.outcomes.find((o) => o.name === homeTeam)?.price;
    const draw = h2hMarket.outcomes.find((o) => o.name === 'Draw')?.price;
    const away = h2hMarket.outcomes.find((o) => o.name === awayTeam)?.price;

    if (home >= minOdds && draw >= minOdds && away >= minOdds) {
      homeOdds.push(Number(home));
      drawOdds.push(Number(draw));
      awayOdds.push(Number(away));
      perBookmaker.push({
        key: bookmaker.key,
        title: bookmaker.title ?? bookmaker.key,
        odds1: Number(home),
        oddsDraw: Number(draw),
        odds2: Number(away)
      });
    }
  }

  if (homeOdds.length === 0) return null;

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    odds1: Number(average(homeOdds).toFixed(3)),
    oddsDraw: Number(average(drawOdds).toFixed(3)),
    odds2: Number(average(awayOdds).toFixed(3)),
    bookmakersCount: homeOdds.length,
    // Cotes réelles de chaque bookmaker (pas juste la moyenne) — triées du
    // meilleur au moins bon prix sur l'issue domicile, pour identifier chez
    // qui parier concrètement plutôt qu'à un consensus qui n'existe nulle
    // part en pratique.
    perBookmaker: perBookmaker.sort((a, b) => b.odds1 - a.odds1)
  };
}
