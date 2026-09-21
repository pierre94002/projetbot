/**
 * -----------------------------------------------------------------------
 * Vocabulaire fermé des statistiques.
 * -----------------------------------------------------------------------
 * La liste des clés qu'une source a le droit d'écrire. Tout le reste est
 * signalé et jeté plutôt que stocké en vrac.
 *
 * Extrait de merge-match-stats.mjs pour que la fusion JSON et le schéma
 * SQLite lisent la MÊME liste : les colonnes de la base en sont dérivées,
 * si bien qu'ajouter une statistique ici suffit à la faire exister des deux
 * côtés, et qu'aucune ne peut être connue d'un seul.
 */

export const TEAM_STAT_KEYS = [
  'expected_goals', 'xgot', 'Total Shots', 'Shots on Goal', 'Shots off Goal', 'Blocked Shots',
  'Shots insidebox', 'Shots outsidebox', 'woodwork',
  'big_chances', 'Corner Kicks', 'touches_opponent_box', 'touches_six_yard_box', 'through_balls', 'Offsides', 'free_kicks',
  'Ball Possession', 'Total passes', 'Passes accurate', 'Passes %', 'long_balls', 'final_third_passes', 'crosses', 'expected_assists',
  'throw_ins', 'Fouls', 'tackles', 'duels_won', 'clearances', 'interceptions', 'errors_leading_to_shot', 'errors_leading_to_goal',
  'Yellow Cards', 'Red Cards',
  'Goalkeeper Saves', 'xgot_faced', 'goals_prevented'
];

export const PLAYER_STAT_KEYS = [
  'minutes', 'rating', 'goals', 'assists', 'shots', 'shotsOnTarget', 'xg', 'xa', 'keyPasses',
  'passes', 'passesAccurate', 'crosses', 'dribblesWon', 'touches', 'tackles', 'interceptions',
  'clearances', 'duelsWon', 'duelsTotal', 'foulsCommitted', 'foulsSuffered', 'offsides',
  'yellowCards', 'redCards', 'saves', 'goalsConceded',
  // Détail supplémentaire publié par FotMob, nécessaire pour reproduire ses
  // onglets Attaque / Passes / Défense / Duels / Gardien.
  'xgot', 'xgotFaced', 'goalsPrevented', 'bigChancesMissed', 'touchesOppBox',
  'blocks', 'recoveries', 'dribbledPast', 'dispossessed',
  'groundDuelsWon', 'groundDuelsTotal', 'aerialsWon', 'aerialsTotal',
  'longBalls', 'longBallsAccurate', 'crossesAccurate', 'finalThirdPasses',
  'ownHalfPasses', 'oppHalfPasses', 'ownGoals',
  // Mesures supplementaires du releve joueur FotMob.
  'shotsOffTarget', 'xgNonPenalty', 'duelsLost', 'throwIns', 'cornersTaken', 'woodwork',
  'defensiveActions', 'bigChancesCreated', 'headedClearances', 'clearancesOffLine', 'lastManTackles',
  'divingSaves', 'highClaims', 'sweeperActions', 'savesInsideBox', 'punches'
];
