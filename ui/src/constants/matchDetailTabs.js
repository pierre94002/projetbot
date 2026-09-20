/**
 * matchDetailTabs.js
 * -----------------------------------------------------------------------
 * Structure de la page de match, calquée sur FotMob : quels groupes de
 * statistiques afficher, dans quel ordre, et sous quel intitulé.
 *
 * Séparé du composant pour que l'ordre et les libellés se modifient sans
 * toucher au rendu — et pour que le même référentiel serve aux deux camps.
 * -----------------------------------------------------------------------
 */

/** Groupes de l'onglet « Statistiques », dans l'ordre de FotMob. */
export const TEAM_STAT_GROUPS = [
  {
    title: 'Meilleures statistiques',
    rows: [
      { key: 'Ball Possession', label: 'Possession de balle', percent: true },
      { key: 'expected_goals', label: 'Buts attendus (xG)', decimals: 2 },
      { key: 'Total Shots', label: 'Nombre de tirs' },
      { key: 'Shots on Goal', label: 'Tirs cadrés' },
      { key: 'touches_opponent_box', label: 'Touches dans la surface adverse' },
      { key: 'big_chances', label: 'Occasions de buts' },
      { key: 'Passes accurate', label: 'Passes réussies' },
      { key: 'Yellow Cards', label: 'Cartons jaunes' },
      { key: 'Corner Kicks', label: 'Corners' }
    ]
  },
  {
    title: 'Buts attendus (xG)',
    rows: [
      { key: 'expected_goals', label: 'Buts attendus (xG)', decimals: 2 },
      { key: 'xgot', label: 'xG cadrés (xGOT)', decimals: 2 },
      { key: 'expected_assists', label: 'Passes décisives attendues (xA)', decimals: 2 },
      { key: 'goals_prevented', label: 'Buts évités', decimals: 2 }
    ]
  },
  {
    title: 'Tirs',
    rows: [
      { key: 'Total Shots', label: 'Nombre de tirs' },
      { key: 'Shots off Goal', label: 'Tirs hors cadre' },
      { key: 'Shots on Goal', label: 'Tirs cadrés' },
      { key: 'Blocked Shots', label: 'Tirs bloqués' },
      { key: 'woodwork', label: 'Tirs sur le cadre' },
      { key: 'Shots insidebox', label: 'Tirs dans la surface' },
      { key: 'Shots outsidebox', label: 'Tirs en dehors de la surface' }
    ]
  },
  {
    title: 'Passes',
    rows: [
      { key: 'Total passes', label: 'Passes' },
      { key: 'Passes accurate', label: 'Passes réussies' },
      { key: 'Passes %', label: 'Précision des passes', percent: true },
      { key: 'final_third_passes', label: 'Passes dans le dernier tiers' },
      { key: 'long_balls', label: 'Passes longues précises' },
      { key: 'crosses', label: 'Centres réussis' },
      { key: 'throw_ins', label: 'Touches' }
    ]
  },
  {
    title: 'Défense',
    rows: [
      { key: 'tackles', label: 'Tacles' },
      { key: 'interceptions', label: 'Interceptions' },
      { key: 'clearances', label: 'Dégagements' },
      { key: 'duels_won', label: 'Duels remportés' },
      { key: 'Goalkeeper Saves', label: 'Arrêts du gardien' }
    ]
  },
  {
    title: 'Discipline',
    rows: [
      { key: 'Yellow Cards', label: 'Cartons jaunes' },
      { key: 'Red Cards', label: 'Cartons rouges' },
      { key: 'Fouls', label: 'Fautes' },
      { key: 'Offsides', label: 'Hors-jeu' }
    ]
  }
];

/**
 * Onglets du tableau « Stats joueurs », repris de FotMob. Une colonne
 * `fraction` affiche « réussis / tentés » plutôt qu'un chiffre seul.
 */
export const PLAYER_STAT_TABS = [
  {
    id: 'top',
    label: 'Meilleures statistiques',
    columns: [
      { key: 'rating', label: 'Note', decimals: 2, highlight: true },
      { key: 'minutes', label: 'Minutes' },
      { key: 'goals', label: 'Buts' },
      { key: 'assists', label: 'Passes D.' },
      { key: 'xg', label: 'xG', decimals: 2 },
      { key: 'xa', label: 'xA', decimals: 2 },
      { key: 'touches', label: 'Touches' }
    ]
  },
  {
    id: 'attack',
    label: 'Attaque',
    columns: [
      { key: 'goals', label: 'Buts' },
      { key: 'xg', label: 'xG', decimals: 2 },
      { key: 'xgot', label: 'xGOT', decimals: 2 },
      { key: 'shots', label: 'Tirs' },
      { key: 'shotsOnTarget', label: 'Cadrés' },
      { key: 'touchesOppBox', label: 'Touches surface adv.' },
      { key: 'dribblesWon', label: 'Dribbles réussis' },
      { key: 'bigChancesMissed', label: 'Occasions manquées' }
    ]
  },
  {
    id: 'passes',
    label: 'Passes',
    columns: [
      { key: 'touches', label: 'Touches' },
      { key: 'passesAccurate', label: 'Passes réussies', fraction: 'passes' },
      { key: 'assists', label: 'Passes D.' },
      { key: 'xa', label: 'xA', decimals: 2 },
      { key: 'keyPasses', label: 'Occasions créées' },
      { key: 'finalThirdPasses', label: 'Dernier tiers' },
      { key: 'crossesAccurate', label: 'Centres réussis', fraction: 'crosses' },
      { key: 'longBallsAccurate', label: 'Longues précises', fraction: 'longBalls' }
    ]
  },
  {
    id: 'defense',
    label: 'Défense',
    columns: [
      { key: 'tackles', label: 'Tacles' },
      { key: 'interceptions', label: 'Interceptions' },
      { key: 'blocks', label: 'Blocages' },
      { key: 'recoveries', label: 'Récupérations' },
      { key: 'clearances', label: 'Dégagements' },
      { key: 'dribbledPast', label: 'Dribbles subis' }
    ]
  },
  {
    id: 'duels',
    label: 'Duels',
    columns: [
      { key: 'duelsWon', label: 'Duels remportés' },
      { key: 'groundDuelsWon', label: 'Au sol', fraction: 'groundDuelsTotal' },
      { key: 'aerialsWon', label: 'Aériens', fraction: 'aerialsTotal' },
      { key: 'foulsCommitted', label: 'Fautes' },
      { key: 'foulsSuffered', label: 'Fautes subies' },
      { key: 'dispossessed', label: 'Ballons perdus' }
    ]
  },
  {
    id: 'keeper',
    label: 'Gardien',
    keepersOnly: true,
    columns: [
      { key: 'saves', label: 'Arrêts' },
      { key: 'goalsConceded', label: 'Buts encaissés' },
      { key: 'xgotFaced', label: 'xGOT subis', decimals: 2 },
      { key: 'goalsPrevented', label: 'Buts évités', decimals: 2 },
      { key: 'passesAccurate', label: 'Passes réussies', fraction: 'passes' },
      { key: 'longBallsAccurate', label: 'Longues précises', fraction: 'longBalls' }
    ]
  }
];
