/**
 * Les réponses du serveur que les pages « Repérage » et « Chutes de cotes » reçoivent, FABRIQUÉES à la
 * main (étape 6 du plan) — ce n'est PAS un fichier de test. Servies à ces pages par un `fetch` remplacé :
 * ni réseau, ni base, ni data/runtime. Partagé par le test de rendu (langageParisEcran.test.mjs) et par les
 * captures d'écran de la mise au point : une seule fabrique, les mêmes cas.
 *
 * Le jour de référence est le 6 octobre 2026, 10 h, en heure LOCALE (le jour du calendrier — « demain »,
 * « dans 2 jours » — ne dépend alors pas du fuseau de la machine).
 */
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../../src/core/engine/engineConfig.js';

export const MAINTENANT = new Date(2026, 9, 6, 10, 0, 0).getTime();
const MIN = 60_000;
const H = 3_600_000;
const JOUR = 86_400_000;
export const iso = (decalageMs) => new Date(MAINTENANT + decalageMs).toISOString();

// ------------------------------------------------------------ le repérage

const CLES = ['home', 'draw', 'away', 'over25', 'under25'];
const marche = (key, extra = {}) => ({
  key,
  engineProb: null,
  marketProb: null,
  marketBookmakers: 0,
  marketExchangeOnly: false,
  gapPoints: null,
  bestOdds: null,
  bestBookmaker: null,
  edgePct: null,
  context: null,
  ...extra
});
const contexte = (taux = 0.44) => ({
  leagueRate: taux,
  leagueMatches: 84,
  home: { hits: 8, n: 12, rate: 8 / 12, shrunk: 0.52 },
  away: { hits: 3, n: 11, rate: 3 / 11, shrunk: 0.31 },
  combined: 0.415
});
/** Un match : ses cinq marchés, ceux de `marches` remplaçant les marchés vides. */
const match = (id, base, marches = {}) => ({
  matchId: id,
  homeId: null,
  awayId: null,
  exactKickoff: true,
  oddsSource: 'odds-api',
  expectedGoals: { home: 1.62, away: 1.18, source: 'fotmob' },
  ...base,
  markets: CLES.map((k) => marche(k, { context: contexte(), ...(marches[k] ?? {}) }))
});

/**
 * Six matchs, un par cas que l'écran doit savoir dire :
 *   Arsenal–Chelsea   une vraie value (+19,6 %) chez William Hill, à 2,30         → LE seul vert
 *   Lyon–Nice         +31 % : trop beau pour être vrai                            → ambre
 *   Real–Betis        +12 % mais à la cote 6,50 : au-delà de la cote maximale     → ambre
 *   Ajax–PSV          cotes gratuites seulement : aucune cote jouable             → rien de vert
 *   Porto–Benfica     calendrier FotMob seul : l'heure n'est pas connue           → « dans 2 jours »
 *   Milan–Inter       une cote jouable mais pas de probabilité du moteur          → valeur inconnue
 */
export function reperage() {
  const matches = [
    match(
      'odds-arsenal-chelsea',
      { league: 'Premier League - England', home: 'Arsenal', away: 'Chelsea', homeId: 'fotmob-9825', awayId: 'fotmob-8455', commenceTime: iso(3 * H + 20 * MIN) },
      {
        home: { engineProb: 0.52, marketProb: 0.47, marketBookmakers: 4, gapPoints: 5, bestOdds: 2.3, bestBookmaker: 'William Hill', edgePct: (0.52 * 2.3 - 1) * 100 },
        draw: { engineProb: 0.26, marketProb: 0.27, marketBookmakers: 4, gapPoints: -1, bestOdds: 3.9, bestBookmaker: 'Betsson', edgePct: (0.26 * 3.9 - 1) * 100 },
        away: { engineProb: 0.22, marketProb: 0.26, marketBookmakers: 4, gapPoints: -4, bestOdds: 4.4, bestBookmaker: 'Unibet', edgePct: (0.22 * 4.4 - 1) * 100 }
      }
    ),
    match(
      'odds-lyon-nice',
      { league: 'Ligue 1 - France', home: 'Lyon', away: 'Nice', homeId: 'fotmob-9748', awayId: 'fotmob-9831', commenceTime: iso(JOUR + 3 * H) },
      { home: { engineProb: 0.5, marketProb: 0.46, marketBookmakers: 3, gapPoints: 4, bestOdds: 2.62, bestBookmaker: 'Tipico', edgePct: (0.5 * 2.62 - 1) * 100 } }
    ),
    match(
      'odds-real-betis',
      { league: 'La Liga - Spain', home: 'Real Madrid', away: 'Betis', homeId: 'fotmob-8633', awayId: 'fotmob-8603', commenceTime: iso(2 * JOUR) },
      { home: { engineProb: 0.17, marketProb: 0.15, marketBookmakers: 3, gapPoints: 2, bestOdds: 6.5, bestBookmaker: 'Coolbet', edgePct: (0.17 * 6.5 - 1) * 100 } }
    ),
    match(
      'odds-ajax-psv',
      { league: 'Eredivisie - Netherlands', home: 'Ajax', away: 'PSV', homeId: 'fotmob-8593', awayId: 'fotmob-8640', commenceTime: iso(5 * H), oddsSource: 'gratuit' },
      { home: { engineProb: 0.33, marketProb: 0.3, marketBookmakers: 2, gapPoints: 3 } }
    ),
    match(
      'cal-porto-benfica',
      { league: 'Primeira Liga - Portugal', home: 'Porto', away: 'Benfica', homeId: 'fotmob-9773', awayId: 'fotmob-9772', commenceTime: '2026-10-08T12:00:00Z', exactKickoff: false, oddsSource: null },
      { home: { engineProb: 0.46, marketProb: null, marketBookmakers: 0 } }
    ),
    match(
      'odds-milan-inter',
      { league: 'Serie A - Italy', home: 'Milan', away: 'Inter', homeId: 'fotmob-8564', awayId: 'fotmob-8636', commenceTime: iso(JOUR + 2 * H) },
      { home: { engineProb: null, marketProb: 0.31, marketBookmakers: 3, bestOdds: 3.1, bestBookmaker: 'Betsson' } }
    )
  ];
  return {
    status: 'ready',
    progress: null,
    error: null,
    data: {
      generatedAt: iso(-25 * MIN),
      durationMs: 80_000,
      days: 7,
      priorMatches: 8,
      markets: [
        { key: 'home', group: 'Résultat', label: 'Victoire à domicile' },
        { key: 'draw', group: 'Résultat', label: 'Match nul' },
        { key: 'away', group: 'Résultat', label: 'Victoire à l’extérieur' },
        { key: 'over25', group: 'Buts', label: 'Plus de 2,5 buts' },
        { key: 'under25', group: 'Buts', label: 'Moins de 2,5 buts' }
      ],
      matches,
      failures: []
    }
  };
}

// ----------------------------------------------- les chutes de cotes

const livre = (extra) => ({ source: 'espn', sourceName: 'ESPN', bookmaker: 'DraftKings', exchange: false, volume: null, fromAt: iso(-26 * H), toAt: iso(-40 * MIN), ...extra });

export function chutes() {
  return {
    generatedAt: iso(-3 * MIN),
    days: 3,
    minDropPct: 5,
    coverage: { sources: ['ESPN', '365Scores', 'Kalshi'], upcomingWithQuotes: 6, withMovement: 3, singleReading: 1 },
    missing: ['Smarkets : aucune cote relevée pour les rencontres de la période.'],
    fixtures: [
      {
        matchId: 'odds-arsenal-chelsea',
        homeId: 'fotmob-9825',
        awayId: 'fotmob-8455',
        homeName: 'Arsenal',
        awayName: 'Chelsea',
        league: 'Premier League - England',
        date: '2026-10-06',
        kickoff: iso(3 * H + 20 * MIN),
        sources: ['ESPN', '365Scores', 'Kalshi'],
        drops: [
          {
            market: '1x2',
            line: 0,
            issue: 'home',
            label: 'Arsenal gagne',
            marketLabel: 'Résultat',
            fromProb: 0.44,
            toProb: 0.5,
            deltaPoints: 6,
            dropPct: 12,
            bookmakersCount: 3,
            agreeing: 3,
            exchangeOnly: false,
            fromAt: iso(-26 * H),
            toAt: iso(-40 * MIN),
            bookmakers: [
              livre({ bookmaker: 'DraftKings', fromOdds: 2.3, toOdds: 2.0, fromProb: 0.42, toProb: 0.48 }),
              livre({ source: '365scores', sourceName: '365Scores', bookmaker: 'Bet365', fromOdds: 2.25, toOdds: 2.05, fromProb: 0.43, toProb: 0.47, toAt: iso(-55 * MIN) }),
              livre({ source: 'kalshi', sourceName: 'Kalshi', bookmaker: 'Kalshi', exchange: true, fromOdds: null, toOdds: null, fromProb: 0.44, toProb: 0.51, volume: 15000, toAt: iso(-12 * MIN) })
            ]
          },
          {
            market: 'ou',
            line: 2.5,
            issue: 'over',
            label: 'Plus de 2,5 buts',
            marketLabel: 'Total de buts',
            fromProb: 0.5,
            toProb: 0.53,
            deltaPoints: 3,
            dropPct: 5.7,
            bookmakersCount: 2,
            agreeing: 1,
            exchangeOnly: false,
            fromAt: iso(-26 * H),
            toAt: iso(-40 * MIN),
            bookmakers: [
              livre({ bookmaker: 'DraftKings', fromOdds: 1.95, toOdds: 1.8, fromProb: 0.5, toProb: 0.55 }),
              livre({ source: '365scores', sourceName: '365Scores', bookmaker: 'Bet365', fromOdds: 1.9, toOdds: 1.95, fromProb: 0.51, toProb: 0.5 })
            ]
          }
        ]
      },
      {
        matchId: null,
        homeId: 'fotmob-9773',
        awayId: 'fotmob-9772',
        homeName: 'Porto',
        awayName: 'Benfica',
        league: 'Primeira Liga - Portugal',
        date: '2026-10-08',
        kickoff: null,
        sources: ['365Scores'],
        drops: [
          {
            market: '1x2',
            line: 0,
            issue: 'away',
            label: 'Benfica gagne',
            marketLabel: 'Résultat',
            fromProb: 0.25,
            toProb: 0.28,
            deltaPoints: 3,
            dropPct: 10.7,
            bookmakersCount: 1,
            agreeing: 1,
            exchangeOnly: false,
            fromAt: iso(-30 * H),
            toAt: iso(-30 * H),
            bookmakers: [livre({ source: '365scores', sourceName: '365Scores', bookmaker: 'Bet365', fromOdds: 4.0, toOdds: 3.57, fromProb: 0.25, toProb: 0.28, fromAt: iso(-30 * H), toAt: iso(-30 * H) })]
          }
        ]
      }
    ]
  };
}

// ----------------------------------- ce que lisent les pastilles de provenance

/** `/api/sources → origins` : le relevé payant est de 15 jours plus tôt, les cotes gratuites du matin. */
export function origines(variante = 'normal') {
  const gratuites =
    variante === 'sans-cotes-gratuites'
      ? []
      : [
          { source: 'espn', name: 'ESPN', lastSeenAt: iso(-20 * MIN), events: 140 },
          { source: 'footballdata', name: 'football-data.co.uk', lastSeenAt: iso(-3 * H), events: 90 },
          { source: 'kalshi', name: 'Kalshi', lastSeenAt: iso(-12 * MIN), events: 40 }
        ];
  return {
    sources: ['odds-api', 'sample'],
    fixtures: { oddsLastSyncedAt: new Date(2026, 8, 21, 18, 35).toISOString() },
    origins: {
      calendar: { provider: 'FotMob', file: 'C:\\Users\\PC\\CoteMaster\\bac-a-sable\\code\\server\\data\\runtime\\season-calendar.json', updatedAt: iso(-6 * H) },
      odds: { provider: 'The Odds API', file: 'C:\\Users\\PC\\CoteMaster\\bac-a-sable\\code\\server\\data\\fixtures\\odds\\odds-snapshot.json', updatedAt: new Date(2026, 8, 21, 18, 35).toISOString() },
      freeOdds: { provider: gratuites.map((s) => s.name).join(', ') || null, file: 'C:\\Users\\PC\\CoteMaster\\bac-a-sable\\base\\match-stats.db', sources: gratuites },
      store: { provider: 'FotMob', file: 'C:\\Users\\PC\\CoteMaster\\bac-a-sable\\base\\match-stats.db' },
      sample: { provider: null, file: null, updatedAt: null }
    }
  };
}

/** `/api/config` : les réglages par défaut du moteur (seuil 2 %, maximum 25 %, cote maximale 5). */
export const configurationMoteur = () => ({
  config: DEFAULT_ENGINE_CONFIG_BY_SPORT.football,
  defaults: DEFAULT_ENGINE_CONFIG_BY_SPORT.football
});

// ------------------------------------------------------- les compositions

const joueur = (id, name, position, extra = {}) => ({ id: `fotmob-${id}`, name, number: id % 40, position, x: null, y: null, countryCode: 'ENG', countryName: 'Angleterre', stats: { rating: 7.1 }, ...extra });
const equipe = (team, teamId, startXI, extra = {}) => ({
  team,
  teamId,
  formation: '4-3-3',
  coach: null,
  startXI,
  bench: [],
  usualStartersMissing: [],
  unavailable: [],
  ...extra
});
const XI = (prefixe) => [
  joueur(1, `${prefixe} Gardien`, 'Goalkeeper'),
  joueur(2, `${prefixe} Défenseur`, 'Defender'),
  joueur(3, `${prefixe} Milieu`, 'Midfielder'),
  joueur(4, `${prefixe} Attaquant`, 'Forward')
];

/** Une composition lue chez FotMob `minutes` minutes avant le coup d'envoi (négatif : après). */
export function compositionFotMob(minutes, { contradiction = false } = {}) {
  const coupDEnvoi = MAINTENANT + 3 * H;
  const home = equipe('Arsenal', 'fotmob-9825', XI('Ars'), contradiction ? { unavailable: [{ id: 'fotmob-2', name: 'Ars Défenseur', reason: 'Blessure', expectedReturn: null }] } : {});
  return {
    source: 'FotMob',
    fotmobMatchId: '4400001',
    fetchedAt: new Date(coupDEnvoi - minutes * MIN).toISOString(),
    minutesBeforeKickoff: minutes,
    home,
    away: equipe('Chelsea', 'fotmob-8455', XI('Che'))
  };
}

/** La dernière composition alignée de chaque équipe (magasin FotMob), faute de composition publiée. */
export function derniereComposition() {
  const dernier = (home, away, hg, ag) => ({ date: '2026-10-03', league: 'Premier League - England', home, away, homeGoals: hg, awayGoals: ag });
  return {
    source: 'magasin',
    home: { ...equipe('Arsenal', 'fotmob-9825', XI('Ars')), lastMatch: dernier('Arsenal', 'Everton', 2, 0) },
    away: { ...equipe('Chelsea', 'fotmob-8455', XI('Che')), lastMatch: dernier('Chelsea', 'Fulham', 1, 1) }
  };
}
