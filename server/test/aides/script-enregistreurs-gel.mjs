/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-gel.mjs <serveur de la copie>
 *
 * Étape E — le GEL DES PRONOSTICS du moteur (data/enregistreurs/gelPronostics.js)
 * sur la base d'essai : trois matchs à venir (le 06/10/2026, dont un avec des
 * cotes gratuites), gelés une première fois, puis regelés sans changement,
 * puis avec une cote qui bouge, puis par une analyse qui a lu la composition ;
 * enfin un marché qui n'a plus de pronostic. La PREMIÈRE valeur de chaque
 * pronostic ne doit jamais changer. Sans réseau, sans Claude, sans repli
 * payant. Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const gel = await imp('data/enregistreurs/gelPronostics.js');
const { ecrirePronostics, pronosticsGeles } = await imp('data/enregistreurs/depot.js');
const { vider } = await imp('data/enregistreurs/file.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const HEURE = 3_600_000;
const avecCotes = (match, [o1, ox, o2], releveAt) => ({
  ...match,
  hasOdds: true,
  oddsSource: 'gratuit',
  marketOdds: {
    odds1: o1,
    oddsDraw: ox,
    odds2: o2,
    bookmakersCount: 1,
    byBookmaker: [{ key: 'espn_draftkings', title: 'DraftKings · ESPN', odds1: o1, oddsDraw: ox, odds2: o2, referenceOnly: true, source: 'espn', releveAt }],
    source: 'gratuit',
    sources: ['espn'],
    releveAt,
    kickoff: null
  }
});
const cal = (league, homeName, awayName) => adaptSeasonCalendarMatch({ league, homeName, awayName, date: '2026-10-06' }, 10000);
const M1 = cal('EPL', 'Aston Villa', "Nott'm Forest");
const M2 = avecCotes(cal('Championship', 'Charlton', 'Portsmouth'), [2.1, 3.3, 3.6], '2026-10-05T09:00:00.000Z');
const M3 = cal('Serie A - Italy', 'Inter', 'Udinese');

const toutes = () =>
  database
    .prepare('SELECT * FROM engine_picks ORDER BY fixture_key, market_key, version')
    .all()
    .map((r) => ({ ...r }));
const premieres = () => toutes().filter((r) => r.version === 1);
const s = {};

// 1. Premier gel : la première valeur de chaque pronostic.
s.g1 = await gel.gelerLaNuit({ maintenant: T0, matchs: [M1, M2, M3], dansLaPasse: true, database });
const v1 = premieres();
s.v1 = { lignes: v1.length, cles: [...new Set(v1.map((r) => r.fixture_key))], origines: [...new Set(v1.map((r) => r.origin))], exemple: v1.find((r) => r.market_id === 'result' && r.fixture_key.includes('|2026-10-06')) ?? null };
s.v1.sources = Object.fromEntries(v1.map((r) => [r.fixture_key, r.odds_source]));
s.v1.compos = [...new Set(v1.map((r) => r.lineup_state))];

// 2. Regelé sans changement : rien n'est ajouté.
s.g2 = await gel.gelerLaNuit({ maintenant: T0 + HEURE, matchs: [M1, M2, M3], dansLaPasse: true, database });
s.apresG2 = toutes().length;

// 3. La cote de M2 bouge : des versions datées, pour M2 seulement.
const M2b = avecCotes(M2, [2.9, 3.2, 2.5], '2026-10-05T13:00:00.000Z');
s.g3 = await gel.gelerLaNuit({ maintenant: T0 + 2 * HEURE, matchs: [M1, M2b, M3], dansLaPasse: true, database });
const apresG3 = toutes();
s.g3lignes = apresG3.filter((r) => r.version > 1).map((r) => ({ cle: r.fixture_key, marche: r.market_key, version: r.version, quand: r.recorded_at, origine: r.origin, source: r.odds_source, a: r.odds_at }));

// 4. Une analyse d'avant coup d'envoi, qui a lu la composition publiée : gelée en file, écrite au vidage.
const enrichi = await enrichMatchWithRealAverages(M3, { sansRepliPayant: true });
const resultat = await analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
s.analyseEnFile = gel.gelerAnalyse({ match: M3, engineResult: resultat, lineups: { source: 'FotMob', fetchedAt: '2026-10-06T17:05:00.000Z' }, origine: gel.ORIGINES.coupDEnvoi, database, maintenant: T0 + 3 * HEURE });
s.avantVidage = toutes().length;
s.vidage = await vider({ maintenant: T0 + 3 * HEURE, database });
const apresAnalyse = toutes();
s.analyse = apresAnalyse.filter((r) => r.origin === 'analyse-coup-d-envoi').map((r) => ({ marche: r.market_key, version: r.version, compo: r.lineup_state, compoA: r.lineup_at }));

// 5. Un marché qui n'a plus de pronostic : une version « plus de pronostic », une seule fois.
const cleM1 = v1.find((r) => r.home_name === 'Aston Villa')?.fixture_key;
const dernieres = new Map();
for (const r of pronosticsGeles(cleM1, { database })) dernieres.set(r.marketKey, r);
const retire = [...dernieres.keys()].find((k) => k === 'bothTeamsScore') ?? [...dernieres.keys()][0];
const garder = [...dernieres.values()].filter((r) => r.marketKey !== retire);
const element = (quand) => ({
  fixture: { fixtureKey: cleM1, matchId: M1.matchId, league: M1.league, date: '2026-10-06', kickoff: null, homeName: M1.home, awayName: M1.away, homeId: garder[0].homeId, awayId: garder[0].awayId },
  origine: 'nuit',
  recordedAt: new Date(quand).toISOString(),
  engineHash: garder[0].engineHash,
  complet: true,
  oddsSource: garder[0].oddsSource,
  oddsAt: null,
  lineupState: garder[0].lineupState,
  lineupAt: null,
  pronostics: garder.map((r) => ({ ...r, marketKey: r.marketKey, choice: r.choice, params: r.params }))
});
s.retrait1 = ecrirePronostics([element(T0 + 4 * HEURE)], { database });
s.retrait2 = ecrirePronostics([element(T0 + 5 * HEURE)], { database });
s.retire = { marche: retire, versions: pronosticsGeles(cleM1, { database }).filter((r) => r.marketKey === retire).map((r) => ({ version: r.version, choice: r.choice, label: r.label })) };

// 6. Les premières valeurs, à la fin : identiques à celles du premier gel, colonne par colonne.
s.premieresIntactes = JSON.stringify(premieres()) === JSON.stringify(v1);
s.total = toutes().length;
s.empreinte = gel.empreinteMoteur();

console.log(JSON.stringify({ ok: true, ...s }));
