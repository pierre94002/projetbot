/**
 * fotMobProvider.js
 * -----------------------------------------------------------------------
 * LA source du magasin : rencontres, scores, statistiques d'équipe et de
 * joueurs, déroulé, compositions, cadre de la rencontre, et — depuis le
 * 2026-09-22 — les CLASSEMENTS OFFICIELS, saison par saison.
 *
 * Ce module a d'abord complété ESPN, qui restait la source des scores et
 * des feuilles de match. Ce n'est plus le cas : hors cotes, tout vient
 * d'ici, sur décision de l'utilisateur. Un seul appel par rencontre suffit
 * (`showAllPlayerStats=true` renvoie équipe ET joueurs), et un seul appel
 * par journée couvre toutes les compétitions.
 *
 * Source publique, sans clé ni authentification. C'est une API interne non
 * documentée : elle peut changer ou se fermer sans préavis, et l'import doit
 * donc tolérer qu'une rencontre ne réponde pas.
 *
 * NIVEAU DE COUVERTURE. Chaque feuille porte `general.coverageLevel` —
 * « xG », « ratings », « lower ». En couverture « lower » (Lettonie,
 * Venezuela), FotMob publie des lignes de joueurs sans note et des
 * gardiens à « 0 but encaissé » quel que soit le score : ce zéro n'est pas
 * une mesure, c'est une case jamais remplie. Voir reconcileGoalsConceded.
 * -----------------------------------------------------------------------
 */

/**
 * Revision de la lecture. A incrementer des que la table de correspondance
 * change : les entrees portant une revision anterieure sont alors reprises,
 * sans avoir a tout refaire avec --force.
 */
export const FOTMOB_REV = 6;

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
/**
 * Un même club sous DEUX identifiants chez FotMob : la Reggiana a joué la
 * première moitié de la Serie B 2023-24 (et sa Coppa Italia) sous 959006,
 * puis sous 6500, l'identifiant de la table officielle — deux lignes au
 * classement calculé, deux fiches à l'annuaire. L'équivalence s'applique à
 * l'entrée, partout où un identifiant de club est lu : liste du jour,
 * feuille de match, table officielle, calendrier.
 */
const TEAM_ID_MERGES = { 959006: 6500 };
const teamIdOf = (id) => fotMobIdOf(TEAM_ID_MERGES[Number(id)] ?? id);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Championnat CôteMaster -> compétition FotMob, identifiée par pays + nom.
 * Les identifiants numériques changent d'une saison à l'autre pour les
 * divisions inférieures (893033 puis 938218 pour la Championship) ; le
 * couple pays/nom, lui, reste stable.
 */
/**
 * PHASES, relevées le 2026-09-22 sur l'INVENTAIRE COMPLET des intitulés
 * FotMob — 1 656 intitulés distincts sur 1 361 journées, du 2023-01-01 à
 * aujourd'hui. Juger un championnat sur les intitulés d'une semaine ne
 * suffit pas : la plupart des phases finales ne durent que quelques jours et
 * portent un intitulé dérivé, publié nulle part ailleurs.
 *
 * Ce que l'inventaire a montré absent du magasin, et que les motifs
 * acceptent désormais :
 *   - « Playoff » : les playoffs de promotion anglais et espagnols (les
 *     36 matchs qui ne tenaient que par ESPN), la Liguilla mexicaine, les
 *     cuadrangulares colombiens (« Playoff Grp. A/B »), les playoffs de
 *     la MLS, de l'Argentine et du Canada (« Final Stage ») ;
 *   - « Championship Playoff » : le TOUR FINAL danois, 120 rencontres sur
 *     trois saisons, que le motif « Championship Group » ne voyait pas ;
 *   - « Qualification » : les barrages de maintien (Allemagne, France,
 *     Russie, Suisse, Serbie, Écosse, Portugal, Irlande, Pays-Bas) ;
 *   - « ECL Playoff » : le barrage pour la Conference League joué en fin
 *     de saison dans une dizaine de championnats ;
 *   - la Copa de la Liga Profesional argentine, tournoi officiel du premier
 *     semestre 2023 et 2024, 394 rencontres ;
 *   - les phases de groupes et de qualification de la Libertadores et de
 *     la Sudamericana, dont seul le « Final Stage » entrait.
 *
 * Volontairement dehors : « FA Cup Qualification » (FotMob n'en publie
 * qu'une fraction des rencontres, un tableau partiel serait faux), les
 * Supercoupes (une rencontre par an) et l'EFL Trophy (équipes U21).
 */
export const FOTMOB_LEAGUES = {
  EPL: 'ENG|Premier League',
  Championship: /^ENG\|Championship($| Playoff$)/,
  'League 1': /^ENG\|League One($| Playoff$)/,
  'League 2': /^ENG\|League Two($| Playoff$)/,
  'EFL Cup': /^ENG\|EFL Cup($| Qualification$)/,
  'La Liga - Spain': 'ESP|LaLiga',
  'La Liga 2 - Spain': /^ESP\|LaLiga2($| Playoff$)/,
  'Serie A - Italy': /^ITA\|Serie A($| Relegation Playoff$)/,
  'Serie B - Italy': /^ITA\|Serie B($| (Promotion|Relegation) Playoff$)/,
  'Bundesliga - Germany': /^GER\|(1\. )?Bundesliga($| Qualification$)/,
  'Bundesliga 2 - Germany': /^GER\|2\. Bundesliga($| Qualification$)/,
  'Ligue 1 - France': /^FRA\|Ligue 1($| Qualification$)/,
  'Ligue 2 - France': /^FRA\|Ligue 2($| Qualification$)/,
  'Premier League - Russia': /^RUS\|Premier League($| Qualification$)/,
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
  'Premiership - Scotland': /^SCO\|Premiership($| Championship Group$| Relegation Group$| Qualification$)/,
  'Super League - Greece': /^GRE\|Super League($| Championship Group$| Relegation Group$| Conference League Group$)/,
  'Turkey Super League': 'TUR|Super Lig',
  'Primeira Liga - Portugal': /^POR\|Liga Portugal($| Qualification$)/,
  // FotMob a renomme le championnat belge en octobre 2025 : "First Division
  // A" auparavant, "Belgian Pro League" depuis. Les deux noms sont donc
  // acceptes, sans quoi toute la saison 2024-25 restait invisible.
  'Belgium First Div': /^BEL\|(Belgian Pro League|First Division A)($| Playoff .+$| ECL Playoff$| Qualification$)/,
  'Dutch Eredivisie': /^NED\|Eredivisie($| Qualification$| ECL Playoff$)/,
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
  'Austrian Football Bundesliga': /^AUT\|Bundesliga($| (Championship|Relegation) Group$| ECL Playoff$)/,
  'HNL - Croatia': 'CRO|HNL',
  // « FNL » est la deuxième division tchèque, et « Placement Matches » les
  // barrages de fin de saison, qui appartiennent bien au championnat.
  'First League - Czechia': /^CZE\|1\. Liga($| (Championship|Relegation) Group$| Placement Matches$| Qualification$)/,
  'Denmark Superliga': /^DEN\|Superligaen($| (Championship|Relegation) Group$| Championship Playoff$| ECL Playoff$)/,
  'Veikkausliiga - Finland': /^FIN\|Veikkausliiga($| (Championship|Relegation) Group$| ECL Playoff$| Qualification$)/,
  // L'Islande publie ses phases finales sous deux formes selon la saison,
  // « Championship Group » et « - Championship Round ». Les deux sont
  // acceptées ; « Besta deildin kvenna », le championnat féminin, ne l'est
  // pas, l'ancrage de fin l'écartant.
  'Besta deildin - Iceland': /^ISL\|Besta deildin($| (Championship|Relegation) Group$| - (Championship|Relegation) Round$)/,
  // « Women's Premier Division » commence par un autre mot : l'ancrage suffit,
  // et le garde-fou masculin/senior le refuserait de toute façon.
  'League of Ireland': /^IRL\|Premier Division($| Qualification$)/,
  // Trois orthographes chez la source — « Ligat Ha'al », « Ligat ha'Al »,
  // « Ligat HaAl » — dont une seule porte les phases finales. Insensible à la
  // casse et à l'apostrophe ; « Leumit League » est la deuxième division.
  "Ligat ha'Al - Israel": /^ISR\|Ligat ha'?al( (Championship|Relegation) Group)?$/i,
  'Virsliga - Latvia': /^LVA\|Virsliga($| Qualification$)/,
  // « Toppserien » est le championnat féminin norvégien : nom distinct, donc
  // aucun risque de recouvrement ici.
  'Eliteserien - Norway': /^NOR\|Eliteserien($| Qualification$)/,
  'Superliga - Romania': /^ROU\|Superliga($| (Championship|Relegation) Group$| Qualification$| ECL Playoff$)/,
  'Super Liga - Serbia': /^SRB\|Super Liga($| (Championship|Relegation) Group$| Qualification$)/,
  'Swiss Superleague': /^SUI\|Super League($| (Championship|Relegation) Group$| Qualification$)/,
  // FotMob a renommé la première division slovaque « Super Liga » en cours de
  // route, comme il l'avait fait pour la Belgique : les deux intitulés sont
  // acceptés, sans quoi des saisons entières resteraient invisibles.
  'Nike Liga - Slovakia': /^SVK\|(1\. Liga|Super Liga)($| (Championship|Relegation) Group$| Qualification$| ECL Playoff$)/,
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
  'Primera División - Argentina': /^ARG\|(Liga Profesional|Copa de la Liga Profesional)($| (Apertura|Clausura)$| (Apertura |Clausura )?Playoff$| Relegation Playoff$)/,
  'Primera División - Bolivia': /^BOL\|Primera Divisi[oó]n($| - (Apertura|Clausura)( Final Stage)?$| Qualification$| Championship Playoff$)/,
  // Serie B, C et D sont d'autres divisions : l'ancrage de fin est ce qui
  // les écarte.
  'Brazil Série A': /^BRA\|S[eé]rie A$/,
  // « Northern Super League » est le championnat féminin canadien.
  'Canadian Premier League': /^CAN\|Premier League($| Final Stage$)/,
  'Primera División - Chile': /^CHI\|Primera Divisi[oó]n($| (Apertura|Clausura)$)/,
  // « Final Stage » est la phase finale du tournoi, celle qui désigne le
  // champion : l'omettre amputait la Colombie de son dénouement.
  'Primera A - Colombia': /^COL\|Primera A($| (Apertura|Clausura)( Final Stage| Playoff Grp\. [A-Z])?$)/,
  'Serie A - Ecuador': /^ECU\|Serie A($| Final Stage$| - (First|Second) Stage$| - (Championship|Relegation) Round$| - Copa Sudamericana Play-off$)/,
  // « Liga MX Femenil » est le championnat féminin et « Liga de Expansion
  // MX » la deuxième division : les deux commencent autrement, ou se
  // poursuivent autrement, que ce que ce motif accepte.
  'Liga MX': /^MEX\|Liga MX($| (Apertura|Clausura)( Playoff| Play-In Stage)?$)/,
  'División Profesional - Paraguay': /^PAR\|Division Profesional($| - (Apertura|Clausura)$)/,
  'Liga 1 - Peru': /^PER\|Liga 1($| (Apertura|Clausura)$| Final Stage$| Placement Playoff$)/,
  'MLS': /^USA\|Major League Soccer($| Playoff$)/,
  // Le Venezuela découpe ses deux tournois en étapes, jusqu'à quatre
  // intitulés par saison, dont un avec une minuscule fautive (« First
  // stage »). Un motif large, borné au nom de la division ; le garde-fou
  // masculin/senior écarte le championnat féminin.
  'Primera División - Venezuela': /^VEN\|Primera Divisi[oó]n($| - .+$| Fase Final .+$| Final Stage$| Super Final$)/i,

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
  'Taça da Liga - Portugal': /^POR\|League Cup($| - .+$| Final Stage$| Grp\. [A-Z]$)/,
  'KNVB Cup - Netherlands': /^NED\|KNVB Cup($| - .+$| Final Stage$)/,
  // La coupe de Turquie passe par des groupes et des qualifications, qui en
  // font partie : le suffixe est donc large.
  'Türkiye Kupası': /^TUR\|Cup($| .+$| - .+$)/,
  // FotMob publie ces deux coupes tantôt sous leur nom, tantôt sous le seul
  // « Cup » — et le second domine largement. Ne retenir que le nom complet
  // amputait la Copa do Brasil de trois saisons sur quatre. Les coupes
  // régionales brésiliennes (Copa do Nordeste, Recopa Gaúcha) portent un
  // autre nom et restent donc dehors.
  'Copa do Brasil': /^BRA\|(Copa do Brasil|Cup)($| - .+$| Final Stage$)/,
  'Copa Argentina': /^ARG\|(Copa Argentina|Cup)($| - .+$| Final Stage$)/,
  'US Open Cup': /^USA\|US Open Cup($| - .+$| Final Stage$)/,
  'Copa Libertadores': /^INT\|Copa Libertadores($| .+$)/,
  'Copa Sudamericana': /^INT\|Copa Sudamericana($| .+$)/,
  'Leagues Cup': /^INT\|Leagues Cup($| .+$)/,
  // Les coupes d'Europe sont découpées par phase — « Champions League »,
  // « Champions League Grp. E », « Champions League Final Stage » — donc un
  // motif plutôt qu'un intitulé exact. L'ancrage en début de chaîne écarte
  // l'AFC Champions League, compétition asiatique sans rapport.
  'UEFA Champions League': /^INT\|Champions League(\s|$)/,
  'UEFA Europa League': /^INT\|Europa League(\s|$)/,
  'UEFA Europa Conference League': /^INT\|(Europa )?Conference League(\s|$)/,

  // ---------------------------------------------------------------------
  // Coupes nationales ajoutées le 2026-09-22 après une MESURE CONTRADICTOIRE :
  // vingt-six coupes non suivies, chacune échantillonnée par deux agents
  // indépendants sur six rencontres au moins, tours avancés et préliminaires,
  // plusieurs saisons. Deux sont complètes sur tout l'historique — la Copa
  // Chile et le Championnat canadien (27 statistiques d'équipe, 36 à 46
  // joueurs notés, sur chaque rencontre sondée). Trois le sont depuis la fin
  // 2025 seulement, FotMob ayant relevé sa couverture entre-temps : Grèce
  // (demi-finales de février 2026 et phase de groupes 2026-27), Belgique
  // (quarts et demies de janvier-février 2026), Chine (finale 2025, quarts
  // 2026). Leur historique antérieur n'a que le score : le tableau s'affiche,
  // les buteurs commencent en 2026.
  //
  // Les vingt et une autres n'ont que le score, finales comprises — la
  // Suisse, jugée « partielle » sur sa seule finale 2026, a été réfutée sur
  // ses quarts de finale. Elles ne sont pas déclarées.
  'Copa Chile': /^CHI\|Cup($| Grp\. [A-Z]$| - .+$| Final Stage$)/,
  'Canadian Championship': /^CAN\|Canadian Championship($| - .+$| Final Stage$)/,
  'Coupe de Grèce': /^GRE\|Cup($| Preliminary Round$| Group Stage$| Final Stage$| - .+$)/,
  'Coupe de Belgique': /^BEL\|Cup($| - .+$| Final Stage$)/,
  'Coupe de Chine': /^CHN\|Cup($| - .+$| Final Stage$)/
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

/** Score « 2 - 1 » -> [2, 1] ; tout le reste -> [null, null]. */
function scoreOf(raw) {
  const m = String(raw ?? '').match(/(\d+)\s*-\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}

/**
 * Poste d'un joueur.
 *
 * FotMob le code en NOMBRE — `usualPosition` et `usualPlayingPositionId`
 * valent 0 (gardien), 1 (défenseur), 2 (milieu) ou 3 (attaquant). Ce module
 * attendait un libellé (« Goalkeeper », « Defender »…) : la comparaison ne
 * trouvait jamais rien, seul le drapeau `isGoalkeeper` passait, et 74 % des
 * lignes du magasin sont entrées SANS poste. Un classement de défenseurs
 * ou de milieux n'y trouvait donc personne pour les championnats que seul
 * FotMob alimente.
 */
const ROLE_BY_CODE = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
function roleOfUsualPosition(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (Number.isInteger(n)) return ROLE_BY_CODE[n] ?? null;
  const texte = String(raw);
  if (/keeper|^gk$/i.test(texte)) return 'Goalkeeper';
  if (/defend|back/i.test(texte)) return 'Defender';
  if (/midfield/i.test(texte)) return 'Midfielder';
  if (/forward|strik|wing|attack/i.test(texte)) return 'Forward';
  return null;
}

/**
 * Poste TENU dans la rencontre, lu sur la grille de composition. FotMob
 * numérote les cases par ligne, du gardien vers l'attaque : 11 le gardien,
 * 31 à 39 la défense, 41 à 89 les lignes de milieu, 91 et au-delà
 * l'attaque. Relevé sur une composition en 4-3-3 : 11 / 32-34-36-38 /
 * 73-75-77 / 103-105-107. Un latéral aligné au milieu est donc « milieu »
 * ce jour-là, ce qui est exactement ce qu'une statistique de match veut.
 */
function roleOfGridPosition(positionId) {
  const n = Number(positionId);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (n < 20) return 'Goalkeeper';
  if (n < 40) return 'Defender';
  if (n < 90) return 'Midfielder';
  return 'Forward';
}

/**
 * Nom réduit à ses mots, sans diacritiques ni ordre : « Zhang Hui » et
 * « Hui Zhang », « Álvaro Vallés » et « Alvaro Valles » désignent le même
 * homme d'une écriture à l'autre de la même source.
 */
function nomNormalise(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Deux formats de composition chez FotMob. Le format GRILLE numérote les
 * cases (11 le gardien, 3x la défense…). Le format CODE DE RÔLE — coupes
 * d'Amérique du Sud, Islande 2023, une feuille de Serie B — écrit 0 gardien,
 * 1 défenseur, 2 milieu, 3 attaquant, 4 remplaçant. Lus comme des cases de
 * grille, où tout ce qui est inférieur à 20 est « gardien », les codes 1 à 4
 * faisaient une équipe ENTIÈRE de gardiens, et chacun recevait le score
 * adverse en buts encaissés : 226 camps à onze gardiens ou plus. Le format
 * se reconnaît sur le onze de départ : tous ses codes sont inférieurs ou
 * égaux à 4.
 */
function lineupUsesRoleCodes(starters) {
  const codes = (starters ?? []).map((e) => Number(e?.positionId)).filter(Number.isInteger);
  return codes.length >= 5 && codes.every((n) => n <= 4);
}

function roleOfLineupEntry(entry, { starter, roleCodes, gardiensCode0 }) {
  if (!roleCodes) return roleOfGridPosition(entry?.positionId);
  const code = Number(entry?.positionId);
  // Le code 0 vaut aussi « inconnu » (Copa Chile 2023 : -1 et 0 partout) :
  // il ne désigne le gardien que s'il est SEUL dans le onze de départ.
  if (code === 0) return starter && gardiensCode0 === 1 ? 'Goalkeeper' : null;
  return code >= 1 && code <= 3 ? ROLE_BY_CODE[code] : null;
}

/** Durée réglementaire : 120 minutes dès qu'un événement dépasse la 90e. */
function matchDuration(events) {
  return events.some((e) => (e.minute ?? 0) > 90) ? 120 : 90;
}

/**
 * Le même homme écrit plus ou moins long : « Arnar Ólafsson » dans playerStats,
 * « Arnar Freyr Olafsson » dans la composition. Les mots de l'un sont tous dans
 * l'autre, et ils en partagent au moins deux — sans quoi « Pedro Alves » et
 * « Pedro Silva » se confondraient.
 */
function memeHommeInclus(a, b) {
  const ta = nomNormalise(a).split(' ').filter(Boolean);
  const tb = nomNormalise(b).split(' ').filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return false;
  const [court, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Chaque mot du nom court est un mot du long, ou en est le début sur trois
  // lettres au moins : « Zac Ashworth » et « Zachary Ashworth ».
  return court.every((t) => long.includes(t) || (t.length >= 3 && long.some((u) => u.startsWith(t))));
}

/** Un mot de trois lettres au moins en commun : ce qui corrobore un numéro de maillot. */
function partagentUnMot(a, b) {
  const ta = new Set(nomNormalise(a).split(' ').filter((t) => t.length >= 3));
  return nomNormalise(b).split(' ').some((t) => t.length >= 3 && ta.has(t));
}

/**
 * Buts encaissés des gardiens, confrontés au score.
 *
 * Le contrôle de cohérence du magasin (audit-score-consistency.mjs) repose
 * sur une identité simple : les buts encaissés par les gardiens d'une
 * équipe égalent le score de l'adversaire. Or FotMob la viole lui-même
 * dans les championnats à couverture réduite — 493 feuilles lettones et
 * 271 vénézuéliennes où le gardien a joué 90 minutes, « 0 but encaissé »,
 * et l'adversaire a marqué. Ce zéro entrait tel quel, puis comptait comme
 * un clean sheet au classement des gardiens.
 *
 * Le score, lui, est toujours renseigné, et c'est la donnée officielle. Un
 * gardien qui joue le match entier a encaissé exactement le score adverse ;
 * un gardien remplacé, les buts adverses marqués pendant qu'il était sur le
 * terrain, que le déroulé permet de compter dès qu'il est complet. Dans les
 * deux cas, la valeur publiée est remplacée si elle diverge : la déduction
 * vient de deux données officielles, la valeur publiée d'une case que la
 * source n'a pas remplie.
 */
function reconcileGoalsConceded(players, events, [homeGoals, awayGoals]) {
  if (homeGoals === null || awayGoals === null) return;
  const buts = events.filter((e) => e.type === 'goal' && e.minute !== null);
  const derouleComplet = buts.length === homeGoals + awayGoals;
  const duree = matchDuration(events);
  const rouges = events.filter((e) => e.type === 'card' && /red/.test(e.card ?? ''));
  const memeHomme = (a, b) => nomNormalise(a) === nomNormalise(b);
  for (const side of ['home', 'away']) {
    const adverse = side === 'home' ? awayGoals : homeGoals;
    const gardiens = players[side].filter(
      (p) => p.position === 'Goalkeeper' && (p.starter === true || p.subInMinute != null || (p.minutes ?? 0) > 0)
    );
    if (!gardiens.length) continue;
    const rougeDe = (p) => rouges.find((r) => r.side === side && memeHomme(r.player, p.name));
    // Un gardien resté SEUL sur le terrain a encaissé le score adverse, quoi
    // que dise la case publiée.
    if (gardiens.length === 1 && gardiens[0].subInMinute == null && gardiens[0].subOutMinute == null && !rougeDe(gardiens[0])) {
      const seul = gardiens[0];
      // Sorti avant la fin sans changement enregistré (blessé, un joueur de
      // champ dans les buts) : ses minutes bornent ce qu'il a encaissé, dès
      // que le déroulé est complet.
      const sortiAvant = derouleComplet && seul.minutes != null && seul.minutes < duree;
      seul.goalsConceded = sortiAvant ? buts.filter((g) => g.side !== side && g.minute <= seul.minutes).length : adverse;
      continue;
    }
    if (!derouleComplet) continue;
    // Intervalle de présence de chaque gardien. Un gardien EXCLU n'a pas de
    // minute de sortie : son carton la donne (Paes, St. Louis - Dallas :
    // exclu à la 12e, et les deux buts de Maurer comptés deux fois). Un
    // gardien blessé remplacé par un joueur de champ non plus : l'entrée du
    // relayeur la donne. Et quand la feuille ne porte aucun changement mais
    // deux gardiens avec leurs minutes (Sutton - Cambridge, 45 et 45), ce
    // sont les minutes qui découpent le match.
    const plusDeMinutes = Math.max(...gardiens.map((q) => q.minutes ?? 0));
    const premierAuxMinutes = gardiens.find((q) => (q.minutes ?? 0) > 0 && q.minutes === plusDeMinutes) ?? null;
    const titulaire = (p) => p.starter === true || (p.starter == null && p === premierAuxMinutes);
    const relayeur = gardiens.find((p) => p.subInMinute != null);
    // Deux titulaires sans relayeur : la feuille se contredit, on ne tranche pas.
    if (gardiens.filter(titulaire).length !== 1 && !relayeur) continue;
    const bornes = gardiens.map((p) => {
      let de = p.subInMinute ?? null;
      let a = p.subOutMinute ?? null;
      const rouge = rougeDe(p);
      if (a == null && rouge?.minute != null) a = rouge.minute;
      if (a == null && de == null && titulaire(p) && relayeur && relayeur !== p) a = relayeur.subInMinute;
      if (de == null && !titulaire(p) && (p.minutes ?? 0) > 0) de = duree - p.minutes;
      if (a == null && titulaire(p) && !relayeur) {
        const autre = gardiens.find((q) => q !== p && (q.minutes ?? 0) > 0);
        if (autre) a = duree - autre.minutes;
      }
      return { p, de, a };
    });
    for (const { p, de, a } of bornes) {
      // Un but à la minute même du changement va au gardien qui SORT — il
      // était sur le terrain quand la minute a commencé — et jamais aux deux :
      // l'intervalle est fermé en sortie, ouvert en entrée. Midtjylland 5-1
      // Viborg, changement à la 45e et but à la 45e : 7 encaissés pour 5.
      const attendu = buts.filter((g) => g.side !== side && (de == null || g.minute > de) && (a == null || g.minute <= a)).length;
      if (p.goalsConceded !== attendu) p.goalsConceded = attendu;
    }
  }
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
        // « finished » ne suffit pas : un match ABANDONNÉ est publié
        // `finished: true` ET `cancelled: true`, motif « Abandoned », avec le
        // score au moment de l'arrêt. Sans `cancelled`, Fiorentina - Inter
        // entrait à 0-0 (arrêt du 1er décembre) en plus du 3-0 de la reprise,
        // et l'Inter gagnait au classement un point qui n'existe pas. Une
        // rencontre n'est JOUÉE que si elle est terminée sans être annulée.
        finished: Boolean(match.status?.finished),
        cancelled: Boolean(match.status?.cancelled),
        awarded: Boolean(match.status?.awarded),
        reason: match.status?.reason?.short ?? null,
        played: Boolean(match.status?.finished) && !match.status?.cancelled,
        // Coup d'envoi exact (ISO) et démarré ou non : sert au pré-chargement
        // des compositions avant le coup d'envoi (cf. lineupPrefetch.js). La
        // liste du jour le publie déjà ; il ne manquait qu'à le lire.
        kickoff: match.status?.utcTime ?? null,
        started: Boolean(match.status?.started)
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
  // par le poste habituel du joueur, codé en nombre (cf. roleOfUsualPosition).
  // Le poste tenu DANS la rencontre, lu sur la composition, prend le dessus
  // plus bas quand il est connu.
  // Gardien SEULEMENT par le drapeau : `usualPosition` vaut aussi 0 pour un
  // joueur dont FotMob ignore le poste, et le code 0 lu comme « gardien »
  // faisait vingt et un gardiens sur une feuille de coupe américaine.
  if (entry.isGoalkeeper) player.position = 'Goalkeeper';
  else {
    const usuel = roleOfUsualPosition(entry.usualPosition ?? entry.usualPlayingPositionId);
    if (usuel && usuel !== 'Goalkeeper') player.position = usuel;
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
      const acteur = fotMobIdOf(event.player?.id ?? event.playerId);
      if (acteur) entry.playerId = acteur;
      if (event.assistStr) entry.assist = String(event.assistStr).replace(/^.*?by\s+/i, '');
      if (event.ownGoal) entry.ownGoal = true;
      if (event.goalDescription) entry.detail = event.goalDescription;
    } else if (type === 'Card') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      const acteur = fotMobIdOf(event.player?.id ?? event.playerId);
      if (acteur) entry.playerId = acteur;
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
  // La phase (identifiant de saison chez FotMob), la compétition mère et le
  // niveau de couverture : ce qui dit d'où vient une feuille et ce qu'on
  // peut en attendre. `leagueKey`, l'intitulé pays|nom de la phase, est
  // ajouté par l'appelant qui l'a lu dans la liste du jour.
  if (general.leagueId != null) meta.leagueId = Number(general.leagueId);
  if (general.parentLeagueId != null) meta.parentLeagueId = Number(general.parentLeagueId);
  if (general.coverageLevel) meta.coverage = String(general.coverageLevel);
  // Résultat décidé hors du terrain (« Awarded win ») : le score de
  // l'en-tête est celui de la fédération, pas celui du jeu, et la feuille —
  // quand elle existe — décrit un autre match (Union Berlin - Bochum, joué
  // 1-1, attribué 0-2). Conservé pour que les contrôles sachent ne pas
  // confronter l'un à l'autre.
  const statut = payload?.header?.status ?? {};
  if (statut.awarded) meta.awarded = true;
  const motif = statut.reason?.longKey;
  if (motif && motif !== 'finished') meta.reason = String(motif);

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
 * Composition connue d'un match, AVANT même sa feuille de statistiques —
 * même endpoint que fetchMatchStats, mais sans rien de ce qui suppose un
 * match joué (fusion aux statistiques individuelles, buts encaissés…).
 * Sert au pré-chargement des compositions avant le coup d'envoi
 * (cf. lineupPrefetch.js) et au dépannage à la demande dans matchEnrichment.js.
 *
 * FotMob ne dit pas si la composition qu'il publie est officielle ou encore
 * une prévision — aucun champ du genre « confirmed » dans la réponse. Elle
 * peut apparaître près d'un jour à l'avance pour une affiche importante, ou
 * seulement dans l'heure qui précède un match de division inférieure ; elle
 * peut aussi changer d'un appel à l'autre tant que le coup d'envoi n'est pas
 * donné. C'est pour ça que le pré-chargement continue de vérifier à
 * l'approche du coup d'envoi plutôt que de s'arrêter au premier succès.
 *
 * Réutilise le décodage des postes de fetchMatchStats (roleOfLineupEntry,
 * roleOfUsualPosition) : FotMob les code en NOMBRE, sous deux formats
 * différents selon la compétition (cf. lineupUsesRoleCodes) — mêmes pièges,
 * même code, pas une seconde version à tenir synchronisée.
 *
 * `home`/`away` portent aussi `coach` et `unavailable` (blessures,
 * suspensions, sélection nationale) même quand le onze n'est PAS encore
 * publié : c'est une donnée de effectif, pas de match — FotMob la montre
 * dès trois jours avant le coup d'envoi, vérifié le 24/09/2026 (cf.
 * teamNewsResolver.js, qui s'en sert). `available` ne porte que sur le onze.
 *
 * @returns {{available:false, reason:string} | {available:boolean, source:'fotmob', fixtureId:string, home:object|null, away:object|null, teams:object[]}}
 */
export async function fetchProbableLineup(matchId) {
  const payload = await fetchJson(`${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}`);
  const lineup = payload?.content?.lineup;
  if (!lineup?.homeTeam && !lineup?.awayTeam) return { available: false, reason: 'not_published_yet' };

  const absence = (entry) => {
    const u = entry?.unavailability ?? {};
    return {
      id: fotMobIdOf(entry?.id),
      name: String(entry?.name ?? '').trim(),
      // 'injury' | 'suspension' | 'internationalDuty' | autre — passé tel
      // quel, traduit et filtré par le consommateur (teamNewsResolver.js) :
      // une sélection nationale n'est pas une actualité, une blessure l'est.
      type: u.type ?? null,
      expectedReturn: u.expectedReturn ?? null,
      expectedReturnDate: u.expectedReturnDate ?? null
    };
  };

  const side = (team) => {
    if (!team) return null;
    const titulaires = team.starters ?? [];
    // Même calcul que dans fetchMatchStats : le format se reconnaît sur le
    // onze de départ, et le code 0 n'est un gardien que s'il y en a un seul.
    const roleCodes = lineupUsesRoleCodes(titulaires);
    const gardiensCode0 = roleCodes ? titulaires.filter((e) => Number(e?.positionId) === 0).length : 0;
    const joueur = (entry, starter) => {
      const tenu = roleOfLineupEntry(entry, { starter, roleCodes, gardiensCode0 });
      return {
        id: fotMobIdOf(entry?.id),
        name: String(entry?.name ?? '').trim(),
        number: entry?.shirtNumber != null ? firstNumber(entry.shirtNumber) : null,
        // Le banc n'a pas de positionId (pas de case sur la grille) : son
        // poste habituel, codé pareil (0 gardien à 3 attaquant), en tient lieu.
        position: tenu ?? roleOfUsualPosition(entry?.usualPlayingPositionId) ?? null
      };
    };
    return {
      teamId: fotMobIdOf(team.id),
      teamName: team.name ?? null,
      formation: team.formation ? String(team.formation) : null,
      coach: (Array.isArray(team.coach) ? team.coach[0] : team.coach)?.name ?? null,
      startXI: titulaires.map((e) => joueur(e, true)),
      substitutes: (team.subs ?? []).map((e) => joueur(e, false)),
      unavailable: (team.unavailable ?? []).map(absence)
    };
  };

  const home = side(lineup.homeTeam);
  const away = side(lineup.awayTeam);
  const auMoinsUnOnze = Boolean(home?.startXI?.length || away?.startXI?.length);
  return {
    available: auMoinsUnOnze,
    reason: auMoinsUnOnze ? undefined : 'not_published_yet',
    source: 'fotmob',
    fixtureId: String(matchId),
    home,
    away,
    teams: [home, away].filter(Boolean)
  };
}

/**
 * Statistiques complètes d'une rencontre, au format attendu par
 * mergeMatchStats(). `noSheet: true` si FotMob n'a pas de relevé pour ce
 * match — la page dit encore le score, la journée, la composition et les
 * buteurs — et `null` si la page n'existe pas.
 */
export async function fetchMatchStats(matchId) {
  const payload = await fetchJson(`${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}&showAllPlayerStats=true`);
  // Sans page, rien à dire. Sans RELEVÉ (statistiques d'équipe), la page dit
  // encore l'essentiel — score, clubs, journée, phase, statut, composition,
  // buteurs — et la rencontre entre avec, marquée `noSheet` : 5 462 étaient
  // entrées nues, sans journée ni buteur (Serbie, Israël, Bolivie, coupes).
  if (!payload?.general?.homeTeam?.id || !payload?.general?.awayTeam?.id) return null;
  const groups = payload?.content?.stats?.Periods?.All?.stats ?? [];
  const teamStats = mapTeamStats(groups);
  const noSheet = !Object.keys(teamStats.home).length && !Object.keys(teamStats.away).length;
  const statut = payload?.header?.status ?? {};
  const awarded = Boolean(statut.awarded);

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
      // Jamais l'identifiant 0 : partagé par tous les inconnus d'une feuille,
      // il rangeait chacun d'eux dans le DERNIER camp lu — buteurs « du
      // mauvais camp », deux gardiens à 90 minutes à l'extérieur. Pour eux,
      // `teamId` fait foi (juste dans tous les échantillons relus).
      if (Number(entry?.id) > 0) sideByPlayerId.set(String(entry.id), sideName);
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

  // Placement sur le terrain, titularisation, poste tenu et minute d'entrée
  // ou de sortie : ce qui permet de dessiner la composition plutôt que de la
  // lister. La composition sépare explicitement titulaires et remplaçants.
  //
  // Un joueur de playerStats se retrouve par identifiant ; SANS identifiant
  // (id 0 chez FotMob : clubs amateurs, divisions inférieures), par camp et
  // nom normalisé — auparavant ces lignes n'étaient jamais rapprochées de la
  // composition : ni titularisation ni minute de changement, et deux
  // gardiens à 90 minutes sur le même camp.
  //
  // Un joueur de la composition ABSENT de playerStats reçoit sa ligne : six
  // feuilles vénézuéliennes de 2026 n'avaient aucun playerStats (buts et
  // passes de Miku, Pollero, Cañete perdus), Thiago Borbas manquait des 45
  // entrées de Bragantino - Criciúma avec deux buts au déroulé. Pas pour un
  // match ATTRIBUÉ : la composition y est celle d'un match qui n'a pas
  // compté.
  const events = mapEvents(payload);
  const duree = matchDuration(events);
  const byId = new Map(players.home.concat(players.away).filter((p) => p.playerId).map((p) => [p.playerId, p]));
  const byName = new Map();
  const byNumber = new Map();
  for (const side of ['home', 'away']) {
    for (const p of players[side]) {
      if (p.playerId) continue;
      byName.set(`${side}|${nomNormalise(p.name)}`, p);
      if (p.number != null) byNumber.set(`${side}|${p.number}`, p);
    }
  }
  // Tous les numéros, identifiés ou non : FotMob publie parfois le même
  // homme sous DEUX identifiants, l'un dans playerStats, l'autre dans la
  // composition (« Daniel Lafferty » 193501 et « Danny Lafferty » 1086943,
  // Sligo Rovers). Un numéro de maillot est unique dans un camp : avec un
  // mot du nom en commun, c'est le même joueur, pas une ligne de plus.
  const byNumberAll = new Map();
  for (const side of ['home', 'away']) for (const p of players[side]) if (p.number != null) byNumberAll.set(`${side}|${p.number}`, p);
  const dejaPris = new Set();
  const gardiensConfirmes = new Set();
  const depuisComposition = new Set();
  for (const [sideName, team] of [['home', lineup?.homeTeam], ['away', lineup?.awayTeam]]) {
    const titulaires = team?.starters ?? [];
    const roleCodes = lineupUsesRoleCodes(titulaires);
    const gardiensCode0 = roleCodes ? titulaires.filter((e) => Number(e?.positionId) === 0).length : 0;
    for (const [index, entry] of [...titulaires, ...(team?.subs ?? [])].entries()) {
      const starter = index < titulaires.length;
      let target = Number(entry?.id) > 0 ? byId.get(`fotmob-${entry.id}`) : null;
      // Sans identifiant commun : le nom exact, puis le numéro de maillot
      // corroboré par un mot du nom, puis un nom inclus dans l'autre.
      const libre = (p) => (p && !dejaPris.has(p) ? p : null);
      if (!target && entry?.name) target = libre(byName.get(`${sideName}|${nomNormalise(entry.name)}`));
      if (!target && entry?.name && entry.shirtNumber != null) {
        const parNumero = libre(byNumber.get(`${sideName}|${firstNumber(entry.shirtNumber)}`));
        if (parNumero && partagentUnMot(parNumero.name, entry.name)) target = parNumero;
      }
      if (!target && entry?.name) target = players[sideName].find((p) => !p.playerId && !dejaPris.has(p) && memeHommeInclus(p.name, entry.name)) ?? null;
      if (!target && entry?.name && entry.shirtNumber != null) {
        const memeNumero = libre(byNumberAll.get(`${sideName}|${firstNumber(entry.shirtNumber)}`));
        // Un joueur SANS identifiant dans playerStats (id 0) s'appelle souvent
        // par son surnom (« Josema », « Deco ») là où la composition écrit
        // le nom complet : le numéro seul suffit alors. Entre deux hommes
        // identifiés, il faut aussi un mot en commun.
        if (memeNumero && (!memeNumero.playerId || partagentUnMot(memeNumero.name, entry.name))) target = memeNumero;
      }
      if (target) {
        dejaPris.add(target);
        // L'identité que la composition connaît et que playerStats ignorait.
        if (!target.playerId && Number(entry?.id) > 0) target.playerId = `fotmob-${entry.id}`;
      }
      if (!target) {
        // Seulement pour qui a JOUÉ : un remplaçant resté sur le banc, absent
        // de playerStats, n'a ni statistique ni poste tenu — sa ligne vide
        // (11 072 gardiens de banc sans poste) faisait basculer le poste
        // dominant d'un gardien remplaçant dans l'annuaire.
        const entre = (entry?.performance?.substitutionEvents ?? []).some((sub) => sub.type === 'subIn');
        if (!entry?.name || awarded || (!starter && !entre)) continue;
        target = { name: String(entry.name).trim() };
        if (Number(entry.id) > 0) target.playerId = `fotmob-${entry.id}`;
        if (entry.shirtNumber != null) target.number = firstNumber(entry.shirtNumber);
        players[sideName].push(target);
        depuisComposition.add(target);
      }
      target.side = sideName;
      target.starter = starter;
      const tenu = roleOfLineupEntry(entry, { starter, roleCodes, gardiensCode0 });
      if (tenu) target.position = tenu;
      else if (!target.position) {
        // Même réserve que dans mapPlayer : le code 0 ne prouve pas un gardien.
        const usuel = roleOfUsualPosition(entry.usualPlayingPositionId);
        if (usuel && usuel !== 'Goalkeeper') target.position = usuel;
      }
      if (tenu === 'Goalkeeper') gardiensConfirmes.add(target);
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
      if (!target.starter) target.subbedIn = target.subInMinute != null;
    }
  }

  // Le drapeau isGoalkeeper posé sur toute une équipe — seize « gardiens »
  // sur Cobresal - Copiapó, Copa Chile 2023 : au-delà de deux gardiens dans
  // un camp, ne le restent que ceux que la composition ou une statistique
  // d'arrêts confirme.
  for (const side of ['home', 'away']) {
    // Seuls les gardiens qui ont JOUÉ entrent dans ce compte : un banc à
    // deux gardiens — trois par camp avec le titulaire — est la règle des
    // grands championnats (Utrecht - PSV, Cittadella - Palermo), pas un
    // drapeau posé sur toute l'équipe.
    const aJoue = (p) => p.starter === true || p.subInMinute != null || (p.minutes ?? 0) > 0;
    const gardiens = players[side].filter((p) => p.position === 'Goalkeeper' && aJoue(p));
    if (gardiens.length <= 2) continue;
    const confirmes = gardiens.filter((p) => gardiensConfirmes.has(p) || p.saves !== undefined);
    for (const p of gardiens) if (!confirmes.includes(p) || confirmes.length > 2) p.position = null;
  }

  // Le relayeur d'un gardien sorti, quand la composition ne dit pas son
  // poste (Munera, Bucaramanga - América : entré à la 12e à la place de
  // Quintero, absent de playerStats) : celui qui entre à la minute même où
  // le gardien sort prend les buts.
  for (const side of ['home', 'away']) {
    const sorties = players[side].filter((p) => p.position === 'Goalkeeper' && p.subOutMinute != null).map((p) => p.subOutMinute);
    for (const p of players[side]) {
      if (p.position || p.subInMinute == null || !sorties.includes(p.subInMinute)) continue;
      if (players[side].some((q) => q !== p && q.position === 'Goalkeeper' && q.subInMinute === p.subInMinute)) continue;
      p.position = 'Goalkeeper';
    }
  }

  // Minutes des lignes venues de la composition, déduites du déroulé ; buts,
  // passes et csc lus au déroulé pour toute ligne dont la case manque —
  // Vorlicky, Slavia - Karviná : présent dans playerStats sans « buts »,
  // deux buts au déroulé. Une case renseignée, même à zéro, n'est jamais
  // contredite.
  const joue = Boolean(statut.finished) && !awarded;
  for (const side of ['home', 'away']) {
    for (const p of players[side]) {
      if (depuisComposition.has(p) && joue) {
        if (p.starter) p.minutes = p.subOutMinute ?? duree;
        else if (p.subInMinute != null) p.minutes = Math.max(0, duree - p.subInMinute);
      }
      const lui = (g) => (p.playerId && g.playerId ? g.playerId === p.playerId : nomNormalise(g.player) === nomNormalise(p.name));
      const butsDe = events.filter((g) => g.type === 'goal' && g.side === side && !g.ownGoal && lui(g)).length;
      const cscDe = events.filter((g) => g.type === 'goal' && g.side !== side && g.ownGoal && lui(g)).length;
      const passesDe = events.filter((g) => g.type === 'goal' && g.side === side && g.assist && nomNormalise(g.assist) === nomNormalise(p.name)).length;
      if (p.goals === undefined && butsDe) p.goals = butsDe;
      if (p.assists === undefined && passesDe) p.assists = passesDe;
      if (p.ownGoals === undefined && cscDe) p.ownGoals = cscDe;
    }
  }

  // Les buts encaissés ne valent que pour un gardien — c'est une contrainte
  // du magasin. FotMob publie pourtant « goals conceded » sur des joueurs de
  // champ dans certaines feuilles à couverture réduite ; laissé tel quel, le
  // lot entier était refusé à l'écriture (283 feuilles bloquées le
  // 2026-09-22 sur cette seule ligne).
  for (const side of ['home', 'away']) {
    for (const p of players[side]) if (p.position !== 'Goalkeeper') delete p.goalsConceded;
  }

  // Un match attribué porte le score de la fédération : le confronter aux
  // gardiens d'un match qui n'a pas compté n'aurait pas de sens.
  const score = scoreOf(statut.scoreStr);
  if (statut.finished && !awarded) reconcileGoalsConceded(players, events, score);

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
    finished: Boolean(statut.finished),
    cancelled: Boolean(statut.cancelled),
    awarded,
    noSheet,
    // Le score de la source elle-même, pour que l'appelant puisse le
    // confronter à celui qu'il tient d'ailleurs.
    homeGoals: score[0],
    awayGoals: score[1],
    teamStats,
    players,
    events,
    lineups: mapLineups(payload),
    meta: mapMeta(payload),
    ...(shotmap ? { shotmap } : {}),
    sources: [`${BASE}/matchDetails?matchId=${matchId}`]
  };
}

/**
 * Classement(s) OFFICIEL(S) d'une compétition, tels que FotMob les publie.
 *
 * `leagueId` est l'identifiant STABLE de la compétition (cf.
 * fotMobLeagueIds.js), `season` un libellé de `allAvailableSeasons` —
 * « 2025/2026 », « 2025 », « 2025 - Clausura », « 2025/2026 - Apertura ».
 * Sans saison, FotMob rend la saison en cours.
 *
 * Pourquoi lire le classement chez la source plutôt que le recalculer sur
 * les résultats du magasin : le calcul ignore les pénalités de points, les
 * départages propres à chaque fédération, les points conservés ou divisés
 * par deux à l'entrée des playoffs (Danemark, Belgique), et les
 * conférences. Le calcul reste utile comme contrôle et comme repli.
 *
 * Une compétition peut publier PLUSIEURS tables pour une même saison — les
 * conférences de la MLS, l'Apertura et la Clausura colombiennes, les zones
 * argentines. Toutes sont rendues, dans l'ordre de la source.
 */
export async function fetchLeagueTables(leagueId, season = null) {
  const url = `${BASE}/leagues?id=${encodeURIComponent(leagueId)}${season ? `&season=${encodeURIComponent(season)}` : ''}`;
  const payload = await fetchJson(url);
  const details = payload?.details ?? {};
  const tables = [];
  for (const bloc of payload?.table ?? []) {
    const data = bloc?.data;
    if (!data) continue;
    const legende = data.legend ?? [];
    if (Array.isArray(data.tables)) {
      for (const t of data.tables) if (t?.table) tables.push(mapTable(t.leagueName ?? details.name, t.table, t.legend ?? legende));
    } else if (data.table) {
      tables.push(mapTable(data.leagueName ?? details.name, data.table, legende));
    }
  }
  return {
    leagueId: Number(leagueId),
    name: details.name ?? null,
    country: details.country ?? null,
    selectedSeason: details.selectedSeason ?? null,
    seasons: Array.isArray(payload?.allAvailableSeasons) ? payload.allAvailableSeasons.map(String) : [],
    tables
  };
}

/**
 * Calendrier COMPLET d'une compétition pour une saison, tel que sa page le
 * publie (`fixtures.allMatches`). C'est le contrôle de complétude qui
 * manquait : la liste du jour omet parfois des rencontres entières — trois
 * journées d'Amérique du Sud les 18-20 juillet 2025, trois matchs brésiliens
 * de mars 2026, huit rencontres canadiennes — que cette page, elle, connaît.
 * Même paramètre `season` que fetchLeagueTables.
 */
export async function fetchLeagueFixtures(leagueId, season = null) {
  const url = `${BASE}/leagues?id=${encodeURIComponent(leagueId)}${season ? `&season=${encodeURIComponent(season)}` : ''}`;
  const payload = await fetchJson(url);
  const fixtures = (payload?.fixtures?.allMatches ?? []).map((m) => {
    const [homeGoals, awayGoals] = scoreOf(m.status?.scoreStr);
    return {
      matchId: String(m.id),
      // La date du magasin est celle du coup d'envoi en UTC.
      date: m.status?.utcTime ? String(m.status.utcTime).slice(0, 10) : null,
      round: m.round != null ? String(m.round) : null,
      homeId: teamIdOf(m.home?.id),
      awayId: teamIdOf(m.away?.id),
      homeName: m.home?.name ?? null,
      awayName: m.away?.name ?? null,
      homeGoals,
      awayGoals,
      finished: Boolean(m.status?.finished),
      cancelled: Boolean(m.status?.cancelled),
      awarded: Boolean(m.status?.awarded),
      reason: m.status?.reason?.short ?? null,
      played: Boolean(m.status?.finished) && !m.status?.cancelled
    };
  });
  return {
    leagueId: Number(leagueId),
    selectedSeason: payload?.details?.selectedSeason ?? null,
    seasons: Array.isArray(payload?.allAvailableSeasons) ? payload.allAvailableSeasons.map(String) : [],
    fixtures
  };
}

function mapTable(name, table, legende) {
  // La zone (Ligue des champions, relégation…) se lit par la couleur de la
  // ligne, que la légende nomme ; à défaut par l'index de ligne qu'elle
  // liste.
  const zone = (row) =>
    legende.find((l) => l.color && row.qualColor && l.color === row.qualColor)?.title ??
    legende.find((l) => Array.isArray(l.indices) && l.indices.includes(Number(row.idx) - 1))?.title ??
    null;
  const parId = (rows) => new Map((rows ?? []).map((r) => [String(r.id), r]));
  const domicile = parId(table.home);
  const exterieur = parId(table.away);
  const camp = (r) => {
    if (!r) return null;
    const [pour, contre] = scoreOf(r.scoresStr);
    return { played: r.played ?? 0, won: r.wins ?? 0, drawn: r.draws ?? 0, lost: r.losses ?? 0, goalsFor: pour ?? 0, goalsAgainst: contre ?? 0 };
  };
  const rows = (table.all ?? []).map((r) => {
    const [pour, contre] = scoreOf(r.scoresStr);
    return {
      rank: Number(r.idx),
      teamId: teamIdOf(r.id),
      teamName: r.name,
      shortName: r.shortName ?? null,
      teamLogo: null,
      played: r.played ?? 0,
      won: r.wins ?? 0,
      drawn: r.draws ?? 0,
      lost: r.losses ?? 0,
      goalsFor: pour ?? 0,
      goalsAgainst: contre ?? 0,
      goalDiff: Number.isFinite(r.goalConDiff) ? r.goalConDiff : (pour ?? 0) - (contre ?? 0),
      points: r.pts ?? 0,
      deduction: r.deduction ?? null,
      description: zone(r),
      home: camp(domicile.get(String(r.id))),
      away: camp(exterieur.get(String(r.id)))
    };
  });
  return { name: String(name ?? ''), rows };
}

export const __testing = { firstNumber, mapTeamStats, mapPlayer, TEAM_STAT_MAP, PLAYER_STAT_MAP, roleOfGridPosition, roleOfUsualPosition, roleOfLineupEntry, lineupUsesRoleCodes, nomNormalise, reconcileGoalsConceded, scoreOf };
