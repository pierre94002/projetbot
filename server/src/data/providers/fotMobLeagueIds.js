/**
 * -----------------------------------------------------------------------
 * Identifiant FotMob de chaque compétition suivie.
 * -----------------------------------------------------------------------
 * Le magasin retrouve les RENCONTRES par le couple pays|nom (cf.
 * FOTMOB_LEAGUES), parce que l'identifiant d'une phase change chaque saison.
 * Mais la compétition elle-même — celle dont FotMob publie le CLASSEMENT
 * OFFICIEL, saison par saison — a un identifiant stable, celui que
 * `general.parentLeagueId` rapporte sur chaque feuille de match.
 *
 * Relevés le 2026-09-22 en interrogeant une feuille de match récente de
 * chacune des 67 compétitions, puis `leagues?id=` pour confirmer le nom.
 * Table tenue à la main : un identifiant ne se devine pas, et une erreur ici
 * afficherait le classement d'une autre compétition sans que rien ne le
 * signale — c'est pourquoi le nom relevé chez FotMob est noté en regard.
 */
export const FOTMOB_LEAGUE_IDS = {
  // Angleterre
  EPL: 47, // Premier League
  Championship: 48,
  'League 1': 108, // League One
  'League 2': 109, // League Two
  'EFL Cup': 133,
  'FA Cup - England': 132,
  // Espagne
  'La Liga - Spain': 87, // LaLiga
  'La Liga 2 - Spain': 140, // LaLiga2
  'Copa del Rey - Spain': 138,
  // Italie
  'Serie A - Italy': 55,
  'Serie B - Italy': 86,
  'Coppa Italia - Italy': 141,
  // Allemagne
  'Bundesliga - Germany': 54,
  'Bundesliga 2 - Germany': 146, // 2. Bundesliga
  'DFB Pokal - Germany': 209,
  // France
  'Ligue 1 - France': 53,
  'Ligue 2 - France': 110,
  'Coupe de France': 134,
  // Reste de l'Europe
  'Premier League - Russia': 63,
  'Premiership - Scotland': 64,
  'Super League - Greece': 135, // Super League 1
  'Turkey Super League': 71, // Super Lig
  'Türkiye Kupası': 151, // Turkish Cup
  'Primeira Liga - Portugal': 61, // Liga Portugal
  'Taça de Portugal': 186,
  'Taça da Liga - Portugal': 187, // League Cup
  'Belgium First Div': 40, // First Division A
  'Dutch Eredivisie': 57,
  'KNVB Cup - Netherlands': 235,
  'Ekstraklasa - Poland': 196,
  'Austrian Football Bundesliga': 38,
  'HNL - Croatia': 252,
  'First League - Czechia': 122, // 1. Liga
  'Denmark Superliga': 46, // Superligaen
  'Veikkausliiga - Finland': 51,
  'Besta deildin - Iceland': 215,
  'League of Ireland': 126, // Premier Division
  "Ligat ha'Al - Israel": 127,
  'Virsliga - Latvia': 226,
  'Eliteserien - Norway': 59,
  'Superliga - Romania': 189, // Liga I
  'Super Liga - Serbia': 182,
  'Swiss Superleague': 69, // Super League
  'Nike Liga - Slovakia': 176, // 1. liga
  'Allsvenskan - Sweden': 67,
  // Coupes d'Europe
  'UEFA Champions League': 42,
  'UEFA Europa League': 73,
  // La feuille de match d'un tour de QUALIFICATION rapporte 10615, qui est
  // une compétition à part chez FotMob ; la phase de ligue et les tours
  // finals vivent sous 10216.
  'UEFA Europa Conference League': 10216,
  // Amériques
  'Brazil Série A': 268, // Série A
  'Copa do Brasil': 9067,
  'Primera División - Argentina': 112, // Liga Profesional
  'Copa Argentina': 9305,
  'Primera División - Chile': 273, // Liga de Primera
  'Primera A - Colombia': 274,
  'Serie A - Ecuador': 246,
  'Primera División - Bolivia': 144, // Primera Division
  'División Profesional - Paraguay': 199, // Division Profesional
  'Liga 1 - Peru': 131,
  'Primera División - Venezuela': 339, // Primera Division
  'Liga MX': 230,
  MLS: 130,
  'US Open Cup': 9441, // Open Cup
  'Leagues Cup': 10043,
  'Canadian Premier League': 9986, // Premier League (CAN)
  'Copa Libertadores': 45,
  'Copa Sudamericana': 299,
  // Asie
  'Super League - China': 120
};

export function fotmobLeagueId(league) {
  return FOTMOB_LEAGUE_IDS[league] ?? null;
}
