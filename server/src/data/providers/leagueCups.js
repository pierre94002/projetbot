/**
 * -----------------------------------------------------------------------
 * Quelle coupe appartient à quel championnat.
 * -----------------------------------------------------------------------
 * Le magasin ne fait aucune différence entre un championnat et une coupe :
 * ce sont deux compétitions, avec des rencontres, des équipes et des
 * joueurs. La différence est ailleurs — une coupe n'a pas de classement, et
 * elle se lit par TOURS, d'où l'onglet séparé dans l'interface.
 *
 * Ce lien ne se déduit d'aucune donnée : rien dans une rencontre de Coupe de
 * France ne dit qu'elle intéresse le spectateur de Ligue 1. C'est donc une
 * table, tenue à la main, et c'est la seule façon honnête de la tenir.
 *
 * Un championnat peut en avoir plusieurs — l'Angleterre a la FA Cup et
 * l'EFL Cup, le Portugal la Taça et la Taça da Liga — et une même coupe peut
 * servir plusieurs championnats : la Copa Libertadores concerne autant le
 * Brésil que l'Argentine ou la Colombie, et les compétitions européennes
 * valent pour les championnats qui y qualifient.
 */

/** Coupes continentales, communes à tout un ensemble de championnats. */
const EUROPE = ['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League'];
const SUD_AMERIQUE = ['Copa Libertadores', 'Copa Sudamericana'];

export const CUPS_BY_LEAGUE = {
  EPL: ['FA Cup - England', 'EFL Cup', ...EUROPE],
  Championship: ['FA Cup - England', 'EFL Cup'],
  'League 1': ['FA Cup - England', 'EFL Cup'],
  'League 2': ['FA Cup - England', 'EFL Cup'],
  'La Liga - Spain': ['Copa del Rey - Spain', ...EUROPE],
  'La Liga 2 - Spain': ['Copa del Rey - Spain'],
  'Bundesliga - Germany': ['DFB Pokal - Germany', ...EUROPE],
  'Bundesliga 2 - Germany': ['DFB Pokal - Germany'],
  'Serie A - Italy': ['Coppa Italia - Italy', ...EUROPE],
  'Serie B - Italy': ['Coppa Italia - Italy'],
  'Ligue 1 - France': ['Coupe de France', ...EUROPE],
  'Ligue 2 - France': ['Coupe de France'],
  'Primeira Liga - Portugal': ['Taça de Portugal', 'Taça da Liga - Portugal', ...EUROPE],
  'Dutch Eredivisie': ['KNVB Cup - Netherlands', ...EUROPE],
  'Turkey Super League': ['Türkiye Kupası', ...EUROPE],

  // Championnats européens sans coupe nationale exploitable : FotMob n'en
  // publie que les scores. Ils gardent les compétitions continentales, qui
  // sont celles où leurs clubs jouent avec des relevés complets.
  'Belgium First Div': EUROPE,
  'Premiership - Scotland': EUROPE,
  'Super League - Greece': EUROPE,
  'Swiss Superleague': EUROPE,
  'Austrian Football Bundesliga': EUROPE,
  'First League - Czechia': EUROPE,
  'Ekstraklasa - Poland': EUROPE,
  'Superliga - Romania': EUROPE,
  'HNL - Croatia': EUROPE,
  'Nike Liga - Slovakia': EUROPE,
  'Eliteserien - Norway': EUROPE,
  'Allsvenskan - Sweden': EUROPE,
  'Denmark Superliga': EUROPE,
  'Veikkausliiga - Finland': EUROPE,
  'Besta deildin - Iceland': EUROPE,
  'League of Ireland': EUROPE,
  "Ligat ha'Al - Israel": EUROPE,
  'Virsliga - Latvia': EUROPE,
  'Super Liga - Serbia': EUROPE,
  'Premier League - Russia': [],

  // Amériques.
  'Brazil Série A': ['Copa do Brasil', ...SUD_AMERIQUE],
  'Primera División - Argentina': ['Copa Argentina', ...SUD_AMERIQUE],
  'Primera División - Chile': SUD_AMERIQUE,
  'Primera A - Colombia': SUD_AMERIQUE,
  'Serie A - Ecuador': SUD_AMERIQUE,
  'Primera División - Bolivia': SUD_AMERIQUE,
  'División Profesional - Paraguay': SUD_AMERIQUE,
  'Liga 1 - Peru': SUD_AMERIQUE,
  'Primera División - Venezuela': SUD_AMERIQUE,
  MLS: ['US Open Cup', 'Leagues Cup'],
  'Liga MX': ['Leagues Cup'],
  'Canadian Premier League': [],

  // La Chine n'a pas de coupe publiée avec des relevés chez FotMob.
  'Super League - China': []
};

/** Coupes rattachées à un championnat, liste vide s'il n'en a aucune. */
export function cupsForLeague(league) {
  return CUPS_BY_LEAGUE[league] ?? [];
}

/** Une compétition est-elle une coupe ? Sert à masquer le classement. */
const TOUTES_LES_COUPES = new Set(Object.values(CUPS_BY_LEAGUE).flat());
export function isCup(league) {
  return TOUTES_LES_COUPES.has(league);
}
