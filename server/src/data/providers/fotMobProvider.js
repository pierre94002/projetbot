/**
 * fotMobProvider.js
 * -----------------------------------------------------------------------
 * Complète les statistiques que l'API d'ESPN ne publie pas : expected
 * goals, xGOT, grosses occasions, duels, touches dans la surface, tirs
 * dedans/dehors, poteaux — et, côté joueurs, la note, les minutes, les
 * passes, les occasions créées et les duels.
 *
 * ESPN couvre 10 des 34 champs du référentiel à 100 % et 5 autres à 61 % ;
 * FotMob en apporte une vingtaine de plus, et un seul appel par rencontre
 * suffit (`showAllPlayerStats=true` renvoie équipe ET joueurs).
 *
 * Complémentaire, jamais substitut : ESPN reste la source des scores et des
 * feuilles de match, parce que sa liste d'événements permet de trancher les
 * incohérences (cf. espnMatchStatsProvider.js). FotMob ne sert qu'à REMPLIR
 * des cases vides.
 *
 * Source publique, sans clé ni authentification. C'est une API interne non
 * documentée : elle peut changer ou se fermer sans préavis, et l'import doit
 * donc tolérer qu'une rencontre ne réponde pas.
 * -----------------------------------------------------------------------
 */

/**
 * Revision de la lecture. A incrementer des que la table de correspondance
 * change : les entrees portant une revision anterieure sont alors reprises,
 * sans avoir a tout refaire avec --force.
 */
export const FOTMOB_REV = 2;

const BASE = 'https://www.fotmob.com/api/data';

/**
 * Identifiant stable d'un club ou d'un joueur chez FotMob, préfixé pour que
 * la source reste lisible dans le magasin.
 *
 * Le contrôle du signe n'est pas théorique : FotMob emploie des valeurs
 * négatives comme bouchons pour un joueur non identifié, et le magasin
 * contient six lignes marquées `fotmob--2` partagées par trois hommes
 * différents. Un bouchon accepté comme identité fusionnerait des inconnus.
 */
export const fotMobIdOf = (id) => (Number(id) > 0 ? `fotmob-${Number(id)}` : null);
const teamIdOf = fotMobIdOf;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Championnat CôteMaster -> compétition FotMob, identifiée par pays + nom.
 * Les identifiants numériques changent d'une saison à l'autre pour les
 * divisions inférieures (893033 puis 938218 pour la Championship) ; le
 * couple pays/nom, lui, reste stable.
 */
export const FOTMOB_LEAGUES = {
  EPL: 'ENG|Premier League',
  Championship: 'ENG|Championship',
  'League 1': 'ENG|League One',
  'League 2': 'ENG|League Two',
  'EFL Cup': 'ENG|EFL Cup',
  'La Liga - Spain': 'ESP|LaLiga',
  'La Liga 2 - Spain': 'ESP|LaLiga2',
  'Serie A - Italy': 'ITA|Serie A',
  'Serie B - Italy': 'ITA|Serie B',
  'Bundesliga - Germany': 'GER|Bundesliga',
  'Bundesliga 2 - Germany': 'GER|2. Bundesliga',
  'Ligue 1 - France': 'FRA|Ligue 1',
  'Ligue 2 - France': 'FRA|Ligue 2',
  'Premier League - Russia': 'RUS|Premier League',
  'Super League - China': 'CHN|Super League',
  // Ajoutés le 2026-09-21, relevés dans la réponse FotMob du jour. La
  // comparaison est une ÉGALITÉ stricte (cf. leagueKeyMatches), ce qui est
  // indispensable ici : "NED|Eredivisie Vrouwen" est le championnat féminin,
  // "GRE|Super League 2" et "TUR|1. Lig" des divisions inférieures.
  // Trois championnats se scindent en groupes apres la phase reguliere, et
  // FotMob publie alors sous un intitule derive. Ces rencontres appartiennent
  // bien a la competition : les ignorer amputait la saison de son tiers final.
  // L'ancrage `$` ou " Playoff " est indispensable — "SCO|Championship",
  // "GRE|Super League 2", "BEL|First Division B" et "BEL|Challenger Pro
  // League" sont d'autres divisions.
  'Premiership - Scotland': /^SCO\|Premiership($| Championship Group$| Relegation Group$)/,
  'Super League - Greece': /^GRE\|Super League($| Championship Group$| Relegation Group$| Conference League Group$)/,
  'Turkey Super League': 'TUR|Super Lig',
  'Primeira Liga - Portugal': 'POR|Liga Portugal',
  // FotMob a renomme le championnat belge en octobre 2025 : "First Division
  // A" auparavant, "Belgian Pro League" depuis. Les deux noms sont donc
  // acceptes, sans quoi toute la saison 2024-25 restait invisible.
  'Belgium First Div': /^BEL\|(Belgian Pro League|First Division A)($| Playoff .+$)/,
  'Dutch Eredivisie': 'NED|Eredivisie',
  // Ajouté le 2026-09-21. Égalité stricte, indispensable ici : FotMob publie
  // aussi "POL|I Liga" et "POL|II Liga", les deuxième et troisième divisions,
  // qu'un motif un peu lâche ramasserait. L'Ekstraklasa ne se scinde plus en
  // groupes depuis 2021 — vérifié sur les fins de saison 2024, 2025 et 2026,
  // où aucune variante d'intitulé n'apparaît.
  'Ekstraklasa - Poland': 'POL|Ekstraklasa',

  // ---------------------------------------------------------------------
  // Reste de l'Europe, ajouté le 2026-09-21. Les 55 fédérations UEFA ont été
  // passées en revue et chaque première division ÉCHANTILLONNÉE sur trois
  // rencontres : quinze publient des relevés complets — 25 à 30 statistiques
  // d'équipe, 38 à 45 joueurs notés — et dix-huit n'ont que le score.
  //
  // Seules les quinze premières figurent ici. Déclarer les autres aurait
  // rempli l'interface de championnats dont deux écrans sur quatre —
  // statistiques d'équipe et statistiques de joueurs — seraient restés
  // vides, sans que rien ne dise pourquoi.
  //
  // Presque toutes se scindent en groupes après la phase régulière, d'où les
  // motifs plutôt que des égalités. L'ancrage est indispensable dans les
  // deux sens : sans `^`, « SWE|Damallsvenskan » (féminin) contiendrait
  // « Allsvenskan » ; sans `$`, « SVK|1. Liga » ramasserait la 2. Liga.
  // ---------------------------------------------------------------------
  'Austrian Football Bundesliga': /^AUT\|Bundesliga($| (Championship|Relegation) Group$)/,
  'HNL - Croatia': 'CRO|HNL',
  // « FNL » est la deuxième division tchèque, et « Placement Matches » les
  // barrages de fin de saison, qui appartiennent bien au championnat.
  'First League - Czechia': /^CZE\|1\. Liga($| (Championship|Relegation) Group$| Placement Matches$)/,
  'Denmark Superliga': /^DEN\|Superligaen($| (Championship|Relegation) Group$)/,
  'Veikkausliiga - Finland': /^FIN\|Veikkausliiga($| (Championship|Relegation) Group$)/,
  // L'Islande publie ses phases finales sous deux formes selon la saison,
  // « Championship Group » et « - Championship Round ». Les deux sont
  // acceptées ; « Besta deildin kvenna », le championnat féminin, ne l'est
  // pas, l'ancrage de fin l'écartant.
  'Besta deildin - Iceland': /^ISL\|Besta deildin($| (Championship|Relegation) Group$| - (Championship|Relegation) Round$)/,
  // « Women's Premier Division » commence par un autre mot : l'ancrage suffit,
  // et le garde-fou masculin/senior le refuserait de toute façon.
  'League of Ireland': /^IRL\|Premier Division$/,
  // Trois orthographes chez la source — « Ligat Ha'al », « Ligat ha'Al »,
  // « Ligat HaAl » — dont une seule porte les phases finales. Insensible à la
  // casse et à l'apostrophe ; « Leumit League » est la deuxième division.
  "Ligat ha'Al - Israel": /^ISR\|Ligat ha'?al( (Championship|Relegation) Group)?$/i,
  'Virsliga - Latvia': /^LVA\|Virsliga($| Qualification$)/,
  // « Toppserien » est le championnat féminin norvégien : nom distinct, donc
  // aucun risque de recouvrement ici.
  'Eliteserien - Norway': /^NOR\|Eliteserien($| Qualification$)/,
  'Superliga - Romania': /^ROU\|Superliga($| (Championship|Relegation) Group$| Qualification$)/,
  'Super Liga - Serbia': /^SRB\|Super Liga($| (Championship|Relegation) Group$)/,
  'Swiss Superleague': /^SUI\|Super League($| (Championship|Relegation) Group$)/,
  // FotMob a renommé la première division slovaque « Super Liga » en cours de
  // route, comme il l'avait fait pour la Belgique : les deux intitulés sont
  // acceptés, sans quoi des saisons entières resteraient invisibles.
  'Nike Liga - Slovakia': /^SVK\|(1\. Liga|Super Liga)($| (Championship|Relegation) Group$| Qualification$)/,
  'Allsvenskan - Sweden': /^SWE\|Allsvenskan($| Qualification$)/,

  // ---------------------------------------------------------------------
  // Amériques, ajouté le 2026-09-21. Dix-huit pays passés en revue, chaque
  // première division échantillonnée sur trois à cinq rencontres : douze
  // publient des relevés complets, six n'ont que le score (Costa Rica,
  // Guatemala, Honduras, Panama, Salvador et — c'est la surprise —
  // l'Uruguay, vérifié sur cinq matchs).
  //
  // DIFFÉRENCE DE STRUCTURE avec l'Europe : la plupart de ces championnats
  // se jouent en deux tournois par an, Apertura et Clausura, que FotMob
  // publie sous des intitulés distincts. Les ignorer amputerait chaque
  // saison de sa moitié, d'où les motifs ci-dessous. Certains pays ajoutent
  // des phases finales, et l'Équateur découpe en First/Second Stage.
  //
  // Les accents varient d'une saison à l'autre chez la source — « Serie A »
  // et « Série A », « Primera Division » et « Primera División » — d'où les
  // classes de caractères. Ce n'est pas de la coquetterie : une saison
  // entière disparaissait sur cette seule différence.
  'Primera División - Argentina': /^ARG\|Liga Profesional($| (Apertura|Clausura)$)/,
  'Primera División - Bolivia': /^BOL\|Primera Divisi[oó]n($| - (Apertura|Clausura)$)/,
  // Serie B, C et D sont d'autres divisions : l'ancrage de fin est ce qui
  // les écarte.
  'Brazil Série A': /^BRA\|S[eé]rie A$/,
  // « Northern Super League » est le championnat féminin canadien.
  'Canadian Premier League': /^CAN\|Premier League$/,
  'Primera División - Chile': /^CHI\|Primera Divisi[oó]n($| (Apertura|Clausura)$)/,
  // « Final Stage » est la phase finale du tournoi, celle qui désigne le
  // champion : l'omettre amputait la Colombie de son dénouement.
  'Primera A - Colombia': /^COL\|Primera A($| (Apertura|Clausura)( Final Stage)?$)/,
  'Serie A - Ecuador': /^ECU\|Serie A($| - (First|Second) Stage$| - (Championship|Relegation) Round$| - Copa Sudamericana Play-off$)/,
  // « Liga MX Femenil » est le championnat féminin et « Liga de Expansion
  // MX » la deuxième division : les deux commencent autrement, ou se
  // poursuivent autrement, que ce que ce motif accepte.
  'Liga MX': /^MEX\|Liga MX($| (Apertura|Clausura)$)/,
  'División Profesional - Paraguay': /^PAR\|Division Profesional($| - (Apertura|Clausura)$)/,
  'Liga 1 - Peru': /^PER\|Liga 1($| (Apertura|Clausura)$)/,
  'MLS': /^USA\|Major League Soccer$/,
  // Le Venezuela découpe ses deux tournois en étapes, jusqu'à quatre
  // intitulés par saison, dont un avec une minuscule fautive (« First
  // stage »). Un motif large, borné au nom de la division ; le garde-fou
  // masculin/senior écarte le championnat féminin.
  'Primera División - Venezuela': /^VEN\|Primera Divisi[oó]n( - .+)?$/i,

  // ---------------------------------------------------------------------
  // COUPES, ajoutées le 2026-09-21. Une coupe est une compétition comme une
  // autre pour le magasin ; ce qui la distingue est le TOUR, que FotMob
  // publie dans `meta.round` — « 1 », « 2 », « 1/4 », « 1/2 », « final » —
  // et qui permet d'en dresser le tableau.
  //
  // PIÈGE MESURÉ : la couverture d'une coupe dépend du TOUR. Un premier
  // échantillon de Copa del Rey, pris sur un tour préliminaire opposant des
  // clubs amateurs, ne rendait aucune statistique ; un tour avancé en rend
  // trente et quarante-trois joueurs. Juger une coupe sur un seul match la
  // rejette à tort.
  //
  // FotMob suffixe l'intitulé par le tour à partir des phases finales
  // (« - Quarter-finals », « Final Stage »), d'où le suffixe optionnel.
  // Seules figurent ici les coupes dont la source publie réellement les
  // relevés ; celles qui n'ont que le score — Belgique, Écosse, Grèce,
  // Suisse, Autriche, Tchéquie, Pologne, Russie, Roumanie, Croatie,
  // Slovaquie, Norvège, Suède, Irlande, Finlande, Islande — en sont
  // écartées, faute de quoi l'onglet des buteurs resterait vide.
  'FA Cup - England': /^ENG\|FA Cup($| - .+$| Final Stage$)/,
  'Copa del Rey - Spain': /^ESP\|Copa del Rey($| - .+$| Final Stage$)/,
  'DFB Pokal - Germany': /^GER\|DFB Pokal($| - .+$| Final Stage$)/,
  'Coppa Italia - Italy': /^ITA\|Coppa Italia($| - .+$| Final Stage$)/,
  // « Coupe de France Féminine » se poursuit autrement que ce motif
  // n'accepte, et le garde-fou masculin/senior l'écarterait de toute façon.
  'Coupe de France': /^FRA\|Coupe de France($| - .+$| Final Stage$)/,
  'Taça de Portugal': /^POR\|Taca de Portugal($| - .+$| Final Stage$)/,
  'Taça da Liga - Portugal': /^POR\|League Cup($| - .+$| Final Stage$)/,
  'KNVB Cup - Netherlands': /^NED\|KNVB Cup($| - .+$| Final Stage$)/,
  // La coupe de Turquie passe par des groupes et des qualifications, qui en
  // font partie : le suffixe est donc large.
  'Türkiye Kupası': /^TUR\|Cup($| .+$| - .+$)/,
  'Copa do Brasil': /^BRA\|Copa do Brasil($| - .+$| Final Stage$)/,
  'Copa Argentina': /^ARG\|Copa Argentina($| - .+$| Final Stage$)/,
  'US Open Cup': /^USA\|US Open Cup($| - .+$| Final Stage$)/,
  'Copa Libertadores': /^INT\|Copa Libertadores($| - .+$| Final Stage$)/,
  'Copa Sudamericana': /^INT\|Copa Sudamericana($| - .+$| Final Stage$)/,
  'Leagues Cup': /^INT\|Leagues Cup($| - .+$| Final Stage$)/,
  // Les coupes d'Europe sont découpées par phase — « Champions League »,
  // « Champions League Grp. E », « Champions League Final Stage » — donc un
  // motif plutôt qu'un intitulé exact. L'ancrage en début de chaîne écarte
  // l'AFC Champions League, compétition asiatique sans rapport.
  'UEFA Champions League': /^INT\|Champions League(\s|$)/,
  'UEFA Europa League': /^INT\|Europa League(\s|$)/,
  'UEFA Europa Conference League': /^INT\|(Europa )?Conference League(\s|$)/
};

/** Une compétition FotMob correspond-elle à ce championnat ? */
/**
 * CôteMaster ne traite que le football masculin senior. FotMob publie sous
 * le même préfixe de pays les compétitions féminines et de jeunes —
 * "NED|Eredivisie Vrouwen", "INT|Champions League Women", "INT|Champions
 * League U19". Les trois motifs UEFA ci-dessus sont des expressions
 * régulières se terminant par `(\s|$)` : sans ce garde-fou, elles
 * capturaient ces compétitions et leurs statistiques seraient entrées dans
 * le magasin comme celles de l'épreuve masculine.
 *
 * Filtré ici plutôt que dans chaque motif : un seul point de passage protège
 * aussi les championnats ajoutés plus tard.
 */
const EXCLUDED_LEAGUE_KEY = /(\bwomen\b|\bwomens\b|\bwomen's\b|\bfeminin|\bfemenin|\bfrauen\b|\bdames\b|\bvrouwen\b|\bfemminile\b|\bu1\d\b|\bu2\d\b|\byouth\b|\bjunior|\bprimavera\b|\breserve|\bacademy\b)/i;

export function leagueKeyMatches(matcher, leagueKey) {
  if (!matcher || !leagueKey) return false;
  if (EXCLUDED_LEAGUE_KEY.test(leagueKey)) return false;
  return matcher instanceof RegExp ? matcher.test(leagueKey) : matcher === leagueKey;
}

/** Intitulé FotMob -> clé du référentiel (ui/src/constants/matchStatFields.js). */
const TEAM_STAT_MAP = {
  'Ball possession': 'Ball Possession',
  'Expected goals (xG)': 'expected_goals',
  'xG on target (xGOT)': 'xgot',
  'Total shots': 'Total Shots',
  'Shots on target': 'Shots on Goal',
  'Shots off target': 'Shots off Goal',
  'Blocked shots': 'Blocked Shots',
  'Shots inside box': 'Shots insidebox',
  'Shots outside box': 'Shots outsidebox',
  'Hit woodwork': 'woodwork',
  'Big chances': 'big_chances',
  'Touches in opposition box': 'touches_opponent_box',
  Corners: 'Corner Kicks',
  Offsides: 'Offsides',
  Passes: 'Total passes',
  'Accurate passes': 'Passes accurate',
  'Accurate long balls': 'long_balls',
  'Accurate crosses': 'crosses',
  Throws: 'throw_ins',
  Tackles: 'tackles',
  Interceptions: 'interceptions',
  Clearances: 'clearances',
  'Keeper saves': 'Goalkeeper Saves',
  'Duels won': 'duels_won',
  'Yellow cards': 'Yellow Cards',
  'Red cards': 'Red Cards',
  'Fouls committed': 'Fouls'
};

/** Clé de statistique joueur FotMob -> clé PLAYER_STAT_KEYS. */
const PLAYER_STAT_MAP = {
  rating_title: 'rating',
  minutes_played: 'minutes',
  goals: 'goals',
  assists: 'assists',
  chances_created: 'keyPasses',
  touches: 'touches',
  dribbles_succeeded: 'dribblesWon',
  Offsides: 'offsides',
  clearances: 'clearances',
  interceptions: 'interceptions',
  was_fouled: 'foulsSuffered',
  fouls: 'foulsCommitted',
  duel_won: 'duelsWon',
  saves: 'saves',
  goals_conceded: 'goalsConceded',
  // Détail des onglets Attaque / Passes / Défense / Duels / Gardien.
  expected_goals: 'xg',
  expected_goals_on_target: 'xgot',
  expected_assists: 'xa',
  xgot_faced: 'xgotFaced',
  goals_prevented: 'goalsPrevented',
  big_chance_missed_title: 'bigChancesMissed',
  touches_opp_box: 'touchesOppBox',
  shot_blocks: 'blocks',
  recoveries: 'recoveries',
  dribbled_past: 'dribbledPast',
  dispossessed: 'dispossessed',
  passes_into_final_third: 'finalThirdPasses',
  own_half_passes: 'ownHalfPasses',
  opp_half_passes: 'oppHalfPasses',
  own_goals: 'ownGoals',
  total_shots: 'shots',
  shots_on_target: 'shotsOnTarget',

  // FotMob publie plusieurs orthographes pour une même mesure, selon le
  // match et la version du relevé. Les ignorer revenait à perdre les tacles
  // sur 99 % des lignes et le xG sur les trois quarts.
  'matchstats.headers.tackles': 'tackles',
  ShotsOnTarget: 'shotsOnTarget',
  ShotsOffTarget: 'shotsOffTarget',
  blocked_shots: 'blocks',
  owngoal: 'ownGoals',
  expected_goals_on_target_variant: 'xgot',
  expected_goals_on_target_faced: 'xgotFaced',
  expected_goals_non_penalty: 'xgNonPenalty',

  // Mesures supplémentaires du relevé joueur.
  duel_lost: 'duelsLost',
  player_throws: 'throwIns',
  corners: 'cornersTaken',
  shots_woodwork: 'woodwork',
  defensive_actions: 'defensiveActions',
  big_chance_created_team_title: 'bigChancesCreated',
  headed_clearance: 'headedClearances',
  clearance_off_the_line: 'clearancesOffLine',
  last_man_tackle: 'lastManTackles',

  // Gardiens.
  keeper_diving_save: 'divingSaves',
  keeper_high_claim: 'highClaims',
  keeper_sweeper: 'sweeperActions',
  saves_inside_box: 'savesInsideBox',
  punches: 'punches'
};

/**
 * Statistiques fractionnaires : chacune alimente DEUX clés, la valeur
 * réussie et le total tenté.
 */
const PLAYER_FRACTION_MAP = {
  accurate_passes: ['passesAccurate', 'passes'],
  ground_duels_won: ['groundDuelsWon', 'groundDuelsTotal'],
  aerials_won: ['aerialsWon', 'aerialsTotal'],
  accurate_long_balls: ['longBallsAccurate', 'longBalls'],
  long_balls_accurate: ['longBallsAccurate', 'longBalls'],
  shot_accuracy: ['shotsOnTarget', 'shots'],
  accurate_crosses: ['crossesAccurate', 'crosses']
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, { retries = 2, timeoutMs = 25000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(600 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('échec inconnu');
}

/** Premier nombre d'une valeur FotMob : 76, "1.08" ou "215 (78%)". */
function firstNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const match = String(raw).match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Total d'une valeur fractionnaire "215 (78%)" -> null ; {value,total} -> total. */
function fractionTotal(raw) {
  if (raw && typeof raw === 'object' && Number.isFinite(raw.total)) return raw.total;
  return null;
}

/**
 * Toutes les rencontres d'une journée, toutes compétitions confondues — un
 * seul appel couvre les 18 championnats suivis, là où ESPN en demande un par
 * championnat.
 */
export async function fetchMatchesByDate(isoDate) {
  const payload = await fetchJson(`${BASE}/matches?date=${isoDate.replace(/-/g, '')}`);
  const out = [];
  for (const league of payload?.leagues ?? []) {
    const key = `${league.ccode}|${league.name}`;
    for (const match of league.matches ?? []) {
      const score = String(match.status?.scoreStr ?? '');
      const [homeGoals, awayGoals] = score.includes('-') ? score.split('-').map((s) => firstNumber(s)) : [null, null];
      out.push({
        matchId: String(match.id),
        leagueKey: key,
        leagueId: match.leagueId ?? league.id ?? null,
        date: isoDate,
        homeName: match.home?.name ?? null,
        awayName: match.away?.name ?? null,
        homeId: teamIdOf(match.home?.id),
        awayId: teamIdOf(match.away?.id),
        homeGoals,
        awayGoals,
        finished: Boolean(match.status?.finished)
      });
    }
  }
  return out;
}

function mapTeamStats(groups) {
  const home = {};
  const away = {};
  for (const group of groups ?? []) {
    for (const stat of group.stats ?? []) {
      const key = TEAM_STAT_MAP[stat.title];
      if (!key) continue;
      const [rawHome, rawAway] = stat.stats ?? [];
      const valueHome = firstNumber(rawHome);
      const valueAway = firstNumber(rawAway);
      // Un groupe porte une ligne d'en-tête à [null, null] : on l'ignore
      // plutôt que d'écraser la vraie ligne qui suit.
      if (valueHome === null && valueAway === null) continue;
      if (valueHome !== null && home[key] === undefined) home[key] = valueHome;
      if (valueAway !== null && away[key] === undefined) away[key] = valueAway;
    }
  }
  // Précision de passes recalculée depuis les deux comptes, comme pour ESPN.
  for (const side of [home, away]) {
    if (side['Passes accurate'] && side['Total passes']) {
      side['Passes %'] = Math.round((100 * side['Passes accurate']) / side['Total passes']);
    }
  }
  return { home, away };
}

function mapPlayer(entry) {
  const player = { name: String(entry.name ?? '').trim() };
  if (!player.name) return null;
  // Identifiant FotMob : la seule clé stable pour reconnaître un joueur d'un
  // passage à l'autre, les noms variant d'une source à l'autre.
  // L identifiant 0 est la valeur sentinelle de FotMob pour « joueur inconnu » :
  // plusieurs hommes d une meme feuille la partagent, la prendre pour une
  // identite les confondrait en une seule ligne.
  if (entry.id != null && Number(entry.id) > 0) player.playerId = `fotmob-${entry.id}`;
  if (entry.shirtNumber != null) player.number = firstNumber(entry.shirtNumber);
  // Le poste conditionne plusieurs lectures du magasin — les buts encaissés
  // n'y valent que pour un gardien. FotMob le donne par un drapeau dédié et
  // par la position habituelle du joueur.
  if (entry.isGoalkeeper) player.position = 'Goalkeeper';
  else {
    const usual = String(entry.usualPosition ?? '');
    if (/keeper|^gk$/i.test(usual)) player.position = 'Goalkeeper';
    else if (/defend|back/i.test(usual)) player.position = 'Defender';
    else if (/midfield/i.test(usual)) player.position = 'Midfielder';
    else if (/forward|strik|wing|attack/i.test(usual)) player.position = 'Forward';
  }

  for (const group of entry.stats ?? []) {
    for (const [, stat] of Object.entries(group.stats ?? {})) {
      const value = firstNumber(stat.stat?.value);

      // Valeurs fractionnaires ("6 sur 7") : la valeur est le nombre réussi,
      // le total le nombre tenté. Traitées avant la table de correspondance,
      // parce qu'elles alimentent DEUX clés chacune.
      const fraction = PLAYER_FRACTION_MAP[stat.key];
      if (fraction) {
        const [wonKey, totalKey] = fraction;
        if (value !== null) player[wonKey] = value;
        const total = fractionTotal(stat.stat);
        if (total !== null) player[totalKey] = total;
        if (stat.key === 'ground_duels_won' || stat.key === 'aerials_won') {
          if (total !== null) player.duelsTotal = (player.duelsTotal ?? 0) + total;
          if (value !== null) player.duelsWonParts = (player.duelsWonParts ?? 0) + value;
        }
        continue;
      }

      const key = PLAYER_STAT_MAP[stat.key];
      if (!key || value === null) continue;
      if (player[key] === undefined) player[key] = value;
    }
  }

  // `duel_won` manque sur certaines feuilles : la somme des duels au sol et
  // aériens gagnés mesure exactement la même chose.
  if (player.duelsWon === undefined && player.duelsWonParts !== undefined) player.duelsWon = player.duelsWonParts;
  delete player.duelsWonParts;

  return Object.keys(player).length > 1 ? player : null;
}

/**
 * Déroulé du match : buts avec passeur, remplacements, cartons.
 *
 * Le drapeau `ownGoal` est essentiel — un but contre son camp compte au score
 * de l'équipe adverse mais n'est attribué à aucun de ses joueurs, ce qui
 * explique les écarts entre la somme des buts d'une feuille et le score.
 */
function mapEvents(payload) {
  const raw = payload?.content?.matchFacts?.events?.events;
  if (!Array.isArray(raw)) return [];
  const homeId = payload?.general?.homeTeam?.id;
  const out = [];
  for (const event of raw) {
    const type = String(event.type ?? '');
    if (!['Goal', 'Card', 'Substitution'].includes(type)) continue;
    const entry = {
      type: type.toLowerCase(),
      minute: firstNumber(event.time),
      side: event.isHome === undefined ? (String(event.teamId ?? '') === String(homeId) ? 'home' : 'away') : event.isHome ? 'home' : 'away'
    };
    if (event.overloadTime != null) entry.addedTime = firstNumber(event.overloadTime);
    if (type === 'Goal') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      if (event.assistStr) entry.assist = String(event.assistStr).replace(/^.*?by\s+/i, '');
      if (event.ownGoal) entry.ownGoal = true;
      if (event.goalDescription) entry.detail = event.goalDescription;
    } else if (type === 'Card') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      entry.card = event.card ? String(event.card).toLowerCase() : 'yellow';
    } else if (type === 'Substitution' && Array.isArray(event.swap)) {
      entry.playerIn = event.swap[0]?.name ?? null;
      entry.playerOut = event.swap[1]?.name ?? null;
    }
    out.push(entry);
  }
  return out.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

/** Formation, entraîneur et note d'équipe, pour l'onglet Compositions. */
function mapLineups(payload) {
  const lineup = payload?.content?.lineup;
  if (!lineup) return null;
  const side = (team) => {
    if (!team) return null;
    const out = {};
    if (team.formation) out.formation = String(team.formation);
    if (team.rating != null) out.rating = firstNumber(team.rating);
    const coach = Array.isArray(team.coach) ? team.coach[0] : team.coach;
    if (coach?.name) out.coach = coach.name;
    return Object.keys(out).length ? out : null;
  };
  const home = side(lineup.homeTeam);
  const away = side(lineup.awayTeam);
  return home || away ? { ...(home ? { home } : {}), ...(away ? { away } : {}) } : null;
}

/**
 * Cadre de la rencontre : journée, coup d'envoi, stade, arbitre, affluence.
 * Ce sont les informations d'en-tête de la page de match.
 */
function mapMeta(payload) {
  const meta0 = { rev: FOTMOB_REV };
  const general = payload?.general ?? {};
  const facts = payload?.content?.matchFacts ?? {};
  const info = facts.infoBox ?? {};
  const meta = meta0;

  const round = general.leagueRoundName ?? info.Tournament?.roundName;
  if (round) meta.round = String(round);
  if (general.matchTimeUTCDate) meta.kickoff = general.matchTimeUTCDate;

  const stadium = info.Stadium ?? {};
  if (stadium.name) meta.stadium = stadium.name;
  if (stadium.city) meta.city = stadium.city;
  const capacity = firstNumber(stadium.capacity);
  if (capacity !== null) meta.capacity = capacity;
  if (stadium.surface) meta.surface = String(stadium.surface);

  const attendance = firstNumber(info.Attendance);
  if (attendance !== null) meta.attendance = attendance;

  // Météo du coup d'envoi : elle pèse sur le jeu (pluie, vent) et c'est un
  // des facteurs exogènes que le moteur sait prendre en compte.
  const weather = payload?.content?.weather;
  if (weather) {
    const temperature = firstNumber(weather.temperature);
    if (temperature !== null) meta.temperature = temperature;
    const wind = firstNumber(weather.windSpeed);
    if (wind !== null) meta.windSpeed = wind;
    const rain = firstNumber(weather.precipitation);
    if (rain !== null) meta.precipitation = rain;
    if (weather.description) meta.weather = String(weather.description);
  }

  // Arbitre, avec ses moyennes de la saison : elles disent s'il siffle plus
  // ou moins que la moyenne du championnat, ce qui intéresse directement les
  // marchés cartons et fautes.
  const referee = info.Referee;
  if (referee?.text) {
    meta.referee = { name: referee.text };
    if (referee.country) meta.referee.country = referee.country;
    if (referee.leagueName) meta.referee.league = referee.leagueName;
    for (const stat of referee.stats ?? []) {
      const value = firstNumber(stat.value);
      if (value === null) continue;
      if (stat.type === 'matches') meta.referee.matches = value;
      if (stat.type === 'redCards') meta.referee.redCards = value;
      if (stat.type === 'penalties') meta.referee.penalties = value;
      if (stat.type === 'yellowCards' && stat.valueType === 'perMatch') {
        meta.referee.yellowCardsPerMatch = value;
        const average = firstNumber(stat.average);
        if (average !== null) meta.referee.yellowCardsLeagueAverage = average;
      }
      if (stat.type === 'fouls' && stat.valueType === 'perMatch') {
        meta.referee.foulsPerMatch = value;
        const average = firstNumber(stat.average);
        if (average !== null) meta.referee.foulsLeagueAverage = average;
      }
    }
  }

  return Object.keys(meta).length ? meta : null;
}

/**
 * Carte des tirs : position, minute, joueur, xG, xGOT, type et situation.
 *
 * Volumineuse (une vingtaine de tirs par match) mais c'est elle qui porte le
 * détail des occasions — sans elle, on ne peut ni dessiner la carte ni
 * expliquer d'où vient le xG.
 */
function mapShotmap(payload) {
  const shots = payload?.content?.shotmap?.shots;
  if (!Array.isArray(shots) || !shots.length) return null;
  const homeId = payload?.general?.homeTeam?.id;
  return shots
    .map((shot) => {
      const out = {
        side: String(shot.teamId ?? '') === String(homeId) ? 'home' : 'away',
        minute: firstNumber(shot.min),
        player: shot.playerName ?? shot.fullName ?? null,
        x: firstNumber(shot.x),
        y: firstNumber(shot.y),
        result: String(shot.eventType ?? '').toLowerCase()
      };
      const xg = firstNumber(shot.expectedGoals);
      const xgot = firstNumber(shot.expectedGoalsOnTarget);
      if (xg !== null) out.xg = xg;
      if (xgot !== null) out.xgot = xgot;
      if (shot.shotType) out.shotType = String(shot.shotType).toLowerCase();
      if (shot.situation) out.situation = String(shot.situation).toLowerCase();
      if (shot.isOwnGoal) out.ownGoal = true;
      if (shot.isBlocked) out.blocked = true;
      if (shot.isOnTarget) out.onTarget = true;
      return out;
    })
    .filter((s) => s.player);
}

/**
 * Statistiques complètes d'une rencontre, au format attendu par
 * mergeMatchStats(). `null` si FotMob n'a pas de relevé pour ce match.
 */
export async function fetchMatchStats(matchId) {
  const payload = await fetchJson(`${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}&showAllPlayerStats=true`);
  const groups = payload?.content?.stats?.Periods?.All?.stats;
  if (!groups?.length) return null;

  const teamStats = mapTeamStats(groups);
  if (!Object.keys(teamStats.home).length && !Object.keys(teamStats.away).length) return null;

  const lineup = payload?.content?.lineup;
  const homeTeamId = payload?.general?.homeTeam?.id ?? lineup?.homeTeam?.id;
  const awayTeamId = payload?.general?.awayTeam?.id ?? lineup?.awayTeam?.id;
  /**
   * Le camp d un joueur se lit d abord dans la composition, qui sépare
   * explicitement homeTeam et awayTeam. `teamId` ne sert qu en secours :
   * FotMob publie parfois un second identifiant de club dans playerStats
   * (Reggiana vaut 6500 dans general, 959006 dans playerStats), et comparer
   * au seul identifiant « domicile » versait alors toute l équipe à
   * l extérieur — 31 feuilles de Serie B ainsi renversées.
   */
  const sideByPlayerId = new Map();
  for (const [sideName, team] of [['home', lineup?.homeTeam], ['away', lineup?.awayTeam]]) {
    for (const entry of [...(team?.starters ?? []), ...(team?.subs ?? [])]) {
      if (entry?.id != null) sideByPlayerId.set(String(entry.id), sideName);
    }
  }
  const sideOfEntry = (entry) => {
    const fromLineup = sideByPlayerId.get(String(entry?.id));
    if (fromLineup) return fromLineup;
    const teamId = String(entry?.teamId ?? '');
    if (homeTeamId != null && teamId === String(homeTeamId)) return 'home';
    if (awayTeamId != null && teamId === String(awayTeamId)) return 'away';
    return null;
  };

  const players = { home: [], away: [] };
  // Trois champs d'équipe du référentiel n'existent que par joueur chez
  // FotMob : on les totalise plutôt que de les laisser vides. Ce sont des
  // sommes, pas des estimations — chaque terme vient de la source.
  const derived = { home: {}, away: {} };
  for (const entry of Object.values(payload?.content?.playerStats ?? {})) {
    const side = sideOfEntry(entry);
    if (!side) continue;
    for (const group of entry.stats ?? []) {
      for (const [, stat] of Object.entries(group.stats ?? {})) {
        const value = firstNumber(stat.stat?.value);
        if (value === null) continue;
        if (stat.key === 'passes_into_final_third') derived[side].final_third_passes = (derived[side].final_third_passes ?? 0) + value;
        if (stat.key === 'goals_prevented') derived[side].goals_prevented = (derived[side].goals_prevented ?? 0) + value;
        if (stat.key === 'xgot_faced') derived[side].xgot_faced = (derived[side].xgot_faced ?? 0) + value;
      }
    }
    const mapped = mapPlayer(entry);
    if (mapped) players[side].push(mapped);
  }
  for (const side of ['home', 'away']) {
    for (const [key, value] of Object.entries(derived[side])) {
      if (teamStats[side][key] === undefined) teamStats[side][key] = Number(value.toFixed(2));
    }
  }

  // Placement sur le terrain et minute d'entrée ou de sortie : ce qui permet
  // de dessiner la composition plutôt que de la lister.
  const byId = new Map(players.home.concat(players.away).map((p) => [p.playerId, p]));
  for (const [sideName, team] of [['home', lineup?.homeTeam], ['away', lineup?.awayTeam]]) {
    for (const entry of [...(team?.starters ?? []), ...(team?.subs ?? [])]) {
      const target = byId.get(`fotmob-${entry.id}`);
      if (!target) continue;
      target.side = sideName;
      if (entry.horizontalLayout) {
        const x = firstNumber(entry.horizontalLayout.x);
        const y = firstNumber(entry.horizontalLayout.y);
        if (x !== null) target.x = x;
        if (y !== null) target.y = y;
      }
      for (const sub of entry.performance?.substitutionEvents ?? []) {
        const minute = firstNumber(sub.time);
        if (minute === null) continue;
        if (sub.type === 'subIn') target.subInMinute = minute;
        if (sub.type === 'subOut') target.subOutMinute = minute;
      }
    }
  }

  const shotmap = mapShotmap(payload);
  return {
    matchId: String(matchId),
    homeName: payload?.general?.homeTeam?.name ?? null,
    awayName: payload?.general?.awayTeam?.name ?? null,
    // L'identité des clubs, relevée en même temps que tout le reste. Elle
    // était lue ici depuis toujours — pour départager les camps, quelques
    // lignes plus haut — mais jetée aussitôt, ce qui obligeait à rapprocher
    // les rencontres par ressemblance de nom jusque dans l'interface.
    homeId: teamIdOf(payload?.general?.homeTeam?.id),
    awayId: teamIdOf(payload?.general?.awayTeam?.id),
    fotmobId: String(matchId),
    teamStats,
    players,
    events: mapEvents(payload),
    lineups: mapLineups(payload),
    meta: mapMeta(payload),
    ...(shotmap ? { shotmap } : {}),
    sources: [`${BASE}/matchDetails?matchId=${matchId}`]
  };
}

export const __testing = { firstNumber, mapTeamStats, mapPlayer, TEAM_STAT_MAP, PLAYER_STAT_MAP };
