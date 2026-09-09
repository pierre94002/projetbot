function passesDisplay(stats) {
  const total = stats?.['Total passes'];
  const accurate = stats?.['Passes accurate'];
  const percent = stats?.['Passes %'];
  if (total == null || accurate == null) return null;
  return percent ? `${accurate}/${total} (${percent})` : `${accurate}/${total}`;
}

/**
 * Structure complète calquée sur un centre de stats de référence, utilisée
 * par MatchStatsPanel aussi bien pour comparer deux équipes sur un match
 * précis que pour comparer leurs moyennes de saison. Chaque champ non
 * fourni par l'API-Football (plan gratuit) reste dans la liste et s'affiche
 * "—" plutôt que d'être masqué : la mise en page se remplit automatiquement
 * dès qu'une source couvrant ces métriques est branchée, sans avoir à
 * retoucher les composants.
 */
export const MATCH_STAT_SECTIONS = [
  {
    title: 'Tirs',
    rows: [
      { key: 'expected_goals', label: 'Expected Goals (xG)' },
      { key: 'xgot', label: 'xG cadrés (xGOT)' },
      { key: 'Total Shots', label: 'Tirs totaux' },
      { key: 'Shots on Goal', label: 'Tirs cadrés' },
      { key: 'Shots off Goal', label: 'Tirs non cadrés' },
      { key: 'Blocked Shots', label: 'Tirs contrés' },
      { key: 'Shots insidebox', label: 'Tirs dans la surface' },
      { key: 'Shots outsidebox', label: 'Tirs en dehors de la surface' },
      { key: 'woodwork', label: 'Montant touché' }
    ]
  },
  {
    title: 'Attaque',
    rows: [
      { key: 'big_chances', label: 'Grosses occasions' },
      { key: 'Corner Kicks', label: 'Corners' },
      { key: 'touches_opponent_box', label: 'Touches dans la surface adverse' },
      { key: 'touches_six_yard_box', label: 'Touches dans les 6 mètres' },
      { key: 'through_balls', label: 'Passes entre les lignes réussies' },
      { key: 'Offsides', label: 'Hors-jeux' },
      { key: 'free_kicks', label: 'Coups francs' }
    ]
  },
  {
    title: 'Possession & passes',
    rows: [
      { key: 'Ball Possession', label: 'Possession de balle', percent: true },
      { render: passesDisplay, label: 'Passes' },
      { key: 'long_balls', label: 'Passes longues' },
      { key: 'final_third_passes', label: 'Passes dans le dernier tiers' },
      { key: 'crosses', label: 'Centres' },
      { key: 'expected_assists', label: 'Expected Assists (xA)' }
    ]
  },
  {
    title: 'Défense',
    rows: [
      { key: 'throw_ins', label: 'Touches (rentrées de touche)' },
      { key: 'Fouls', label: 'Fautes' },
      { key: 'tackles', label: 'Tacles' },
      { key: 'duels_won', label: 'Duels remportés' },
      { key: 'clearances', label: 'Dégagements' },
      { key: 'interceptions', label: 'Interceptions' },
      { key: 'errors_leading_to_shot', label: 'Erreurs menant à un tir' },
      { key: 'errors_leading_to_goal', label: 'Erreurs menant à un but' },
      { key: 'Yellow Cards', label: 'Cartons jaunes' },
      { key: 'Red Cards', label: 'Cartons rouges' }
    ]
  },
  {
    title: 'Gardien',
    rows: [
      { key: 'Goalkeeper Saves', label: 'Arrêts du gardien' },
      { key: 'xgot_faced', label: 'xGOT subis' },
      { key: 'goals_prevented', label: 'Buts évités' }
    ]
  }
];

export function matchStatValue(stats, row) {
  const raw = row.render ? row.render(stats) : stats?.[row.key];
  return raw === null || raw === undefined ? '—' : raw;
}

export function parseNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  const value = Number(String(raw).replace('%', ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * N'exige plus les DEUX côtés : une équipe manquante (ex. quota API épuisé
 * pour un seul des deux appels) ne doit pas effacer le chiffre déjà connu de
 * l'autre — Σ/⌀ se calculent alors sur les valeurs disponibles seulement,
 * plutôt que d'afficher "—" alors qu'un des deux nombres est bien là.
 */
function parseComparablePair(homeStats, awayStats, row) {
  if (row.render) return null;

  const home = parseNumeric(homeStats?.[row.key]);
  const away = parseNumeric(awayStats?.[row.key]);
  if (home === null && away === null) return null;

  return { values: [home, away].filter((v) => v !== null), isPercent: Boolean(row.percent) };
}

/**
 * Indique si un Σ/⌀ a un sens pour cette ligne, indépendamment des données
 * actuellement disponibles — sert à toujours afficher la cellule (avec "—"
 * en attendant les chiffres) plutôt que de la faire disparaître, sauf quand
 * elle n'aura jamais de valeur (champ composite ou pourcentage pour le Σ).
 */
export function isTotalApplicable(row) {
  return !row.render && !row.percent;
}

export function isAverageApplicable(row) {
  return !row.render;
}

/**
 * Total du match pour une statistique (domicile + extérieur) — ex. corners
 * ou tirs totaux attendus sur la rencontre, utile pour les marchés
 * over/under. Non calculé pour les champs composites (passes) ni les
 * pourcentages (possession, précision de passes…) : additionner deux
 * pourcentages ne représente rien de réel.
 */
export function matchStatTotal(homeStats, awayStats, row) {
  const pair = parseComparablePair(homeStats, awayStats, row);
  if (!pair || pair.isPercent) return null;
  const sum = pair.values.reduce((a, b) => a + b, 0);
  return Number(sum.toFixed(2));
}

/**
 * Moyenne du match pour une statistique — (domicile + extérieur) / 2,
 * représentative de l'intensité générale attendue sur la rencontre.
 * Contrairement au total, se calcule aussi pour les pourcentages (ex.
 * possession moyenne des deux équipes), qui restent interprétables.
 */
export function matchStatAverage(homeStats, awayStats, row) {
  const pair = parseComparablePair(homeStats, awayStats, row);
  if (!pair) return null;
  const mean = pair.values.reduce((a, b) => a + b, 0) / pair.values.length;
  return pair.isPercent ? `${mean.toFixed(1)}%` : Number(mean.toFixed(2));
}
