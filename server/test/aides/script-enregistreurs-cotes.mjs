/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-cotes.mjs <serveur de la copie>
 *
 * Étape E — l'ARCHIVE DES COTES PAYANTES (data/enregistreurs/cotesPayantes.js) :
 * un faux instantané The Odds API (odds-snapshot.json de la copie) archivé
 * dans odds_events/odds_quotes (source odds-api) avec l'heure du relevé ;
 * chaque cote de chaque relevé gardée, même inchangée ; rien de doublé au
 * redémarrage ; et les lectures des cotes GRATUITES (onglet Cotes, cotes de
 * référence du moteur, provenance, chutes de cotes, couverture) exactement
 * les mêmes avant et après. Aucun réseau, aucun crédit. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const oq = await imp('data/db/oddsQuotesRepository.js');
const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
const { droppingOdds } = await imp('data/droppingOdds.js');
const { coverageReport } = await imp('data/oddsGaps.js');
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const { archiverReleveSiNouveau, __oublierCotesPayantes } = await imp('data/enregistreurs/cotesPayantes.js');
const { vider } = await imp('data/enregistreurs/file.js');
const { lireComptesEtEtats } = await imp('data/enregistreurs/depot.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const fichier = getFixturePaths().odds;
if (!path.resolve(fichier).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichier}`);

const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', last_update: '2026-10-05T11:00:00Z', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const instantane = (prixWinamax) => [
  {
    data: [
      {
        id: 'oddsapi-m1',
        sport_key: 'soccer_epl',
        sport_title: 'EPL',
        commence_time: '2026-10-06T18:45:00Z',
        home_team: 'Aston Villa',
        away_team: "Nott'm Forest",
        bookmakers: [
          { key: 'winamax_fr', title: 'Winamax (FR)', last_update: '2026-10-05T11:00:00Z', markets: [h2h('Aston Villa', "Nott'm Forest", prixWinamax), { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.85, point: 2.5 }] }] },
          { key: 'unibet_fr', title: 'Unibet (FR)', last_update: '2026-10-05T11:00:00Z', markets: [h2h('Aston Villa', "Nott'm Forest", [2.05, 3.4, 3.5])] }
        ]
      },
      {
        id: 'oddsapi-m2',
        sport_key: 'soccer_italy_serie_a',
        sport_title: 'Serie A - Italy',
        commence_time: '2026-10-06T16:00:00Z',
        home_team: 'Inter',
        away_team: 'Udinese',
        bookmakers: [
          { key: 'winamax_fr', title: 'Winamax (FR)', markets: [h2h('Inter', 'Udinese', [1.3, 5.5, 9.5])] },
          { key: 'betclic_fr', title: 'Betclic (FR)', markets: [h2h('Inter', 'Udinese', [1.32, 5.25, 9.0]), { key: 'h2h_lay', outcomes: [{ name: 'Inter', price: 1.35 }] }] }
        ]
      },
      {
        id: 'oddsapi-m3',
        sport_key: 'soccer_epl',
        sport_title: 'EPL',
        commence_time: '2026-10-05T11:00:00Z',
        home_team: 'Chelsea',
        away_team: 'Hull City',
        bookmakers: [{ key: 'unibet_fr', title: 'Unibet (FR)', markets: [h2h('Chelsea', 'Hull City', [1.5, 4.0, 6.0])] }]
      }
    ]
  }
];
const ecrireInstantane = (contenu, mtimeIso) => {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(contenu));
  const t = new Date(mtimeIso);
  fs.utimesSync(fichier, t, t);
};

// Des cotes GRATUITES pour la même affiche (ESPN), écrites avant tout.
const homeId = clubDuMagasin('Aston Villa', 'EPL', database);
const awayId = clubDuMagasin("Nott'm Forest", 'EPL', database);
const gratuite = (selection, price, kind, releveAt) => ({
  source: 'espn', sourceEvent: 'espn-1', bookmaker: 'DraftKings', market: '1x2', selection, line: 0, price, kind, releveAt,
  date: '2026-10-06', kickoff: '2026-10-06T18:45:00Z', league: 'EPL', homeId, awayId, homeName: 'Aston Villa', awayName: "Nott'm Forest", provenance: 'ESPN · test'
});
oq.upsertQuotes(
  [
    gratuite('home', 2.3, 'open', '2026-10-04T08:00:00Z'), gratuite('draw', 3.3, 'open', '2026-10-04T08:00:00Z'), gratuite('away', 3.1, 'open', '2026-10-04T08:00:00Z'),
    gratuite('home', 2.0, 'close', '2026-10-05T10:00:00Z'), gratuite('draw', 3.4, 'close', '2026-10-05T10:00:00Z'), gratuite('away', 3.7, 'close', '2026-10-05T10:00:00Z')
  ],
  { database }
);

/** Ce que montrent les écrans des cotes GRATUITES (sans les heures de calcul). */
async function lecturesGratuites() {
  const sansHeure = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'generatedAt' ? undefined : v)));
  return {
    fixture: oq.quotesForFixture({ homeId, awayId, date: '2026-10-06' }, { database }),
    parNoms: oq.quotesForFixture({ homeName: 'Aston Villa', awayName: "Nott'm Forest", date: '2026-10-06', league: 'EPL' }, { database }),
    reference: Object.fromEntries(oq.latestPrematch1x2({ from: '2026-10-04', to: '2026-10-08', database })),
    resume: oq.quotesSummary({ database, withQuotes: true }),
    chutes: sansHeure(droppingOdds({ days: 3, force: true, database })),
    couverture: sansHeure(await coverageReport({ days: 7, force: true }))
  };
}
const avant = await lecturesGratuites();
const compteArchive = () =>
  database.prepare("SELECT COUNT(*) AS n FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id WHERE e.source = 'odds-api'").get().n;
const etatArchive = () => lireComptesEtEtats({ database }).etats.find((e) => e.recorder === 'cotes-payantes') ?? null;
const s = { homeId, awayId };

// 1. Premier relevé (11 h 30) : mis en file, rien d'écrit tant que la file n'est pas vidée.
ecrireInstantane(instantane([2.1, 3.3, 3.6]), '2026-10-05T11:30:00.000Z');
s.r1 = archiverReleveSiNouveau({ maintenant: T0, database });
s.avantVidage = compteArchive();
s.v1 = await vider({ maintenant: T0, database });
s.apresR1 = compteArchive();
s.etat1 = etatArchive();
s.evenements = database
  .prepare("SELECT source_event AS id, league, date, kickoff, home_id AS h, away_id AS a, provenance FROM odds_events WHERE source = 'odds-api' ORDER BY source_event")
  .all();
s.kinds = database.prepare("SELECT e.source_event AS id, q.kind, COUNT(*) AS n FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id WHERE e.source = 'odds-api' GROUP BY e.source_event, q.kind ORDER BY e.source_event").all();
s.rejoue = archiverReleveSiNouveau({ maintenant: T0 + 60_000, database });

// 2. Second relevé (11 h 50), une seule cote a bougé : TOUTES les cotes sont gardées, avec leur heure.
ecrireInstantane(instantane([2.2, 3.3, 3.5]), '2026-10-05T11:50:00.000Z');
s.r2 = archiverReleveSiNouveau({ maintenant: T0 + 120_000, database });
s.v2 = await vider({ maintenant: T0 + 120_000, database });
s.apresR2 = compteArchive();
s.serieWinamax = database
  .prepare("SELECT q.selection, q.seq, q.releve_at AS r, q.price FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id WHERE e.source = 'odds-api' AND e.source_event = 'oddsapi-m1' AND q.bookmaker = 'winamax_fr' AND q.market = '1x2' ORDER BY q.selection, q.seq")
  .all();

// 3. Redémarrage : rien n'est relu deux fois ; marqueur perdu (arrêt pendant l'écriture) : relu, rien de doublé.
__oublierCotesPayantes();
s.apresRedemarrage = archiverReleveSiNouveau({ maintenant: T0 + 180_000, database });
database.prepare("DELETE FROM recorder_state WHERE recorder = 'cotes-payantes'").run();
__oublierCotesPayantes();
s.r3 = archiverReleveSiNouveau({ maintenant: T0 + 240_000, database });
s.v3 = await vider({ maintenant: T0 + 240_000, database });
s.apresR3 = compteArchive();
s.etat3 = etatArchive();

// 4. Les écrans des cotes gratuites : identiques ; l'archive se lit en la demandant.
const apres = await lecturesGratuites();
s.gratuitesInchangees = Object.fromEntries(Object.keys(avant).map((k) => [k, JSON.stringify(avant[k]) === JSON.stringify(apres[k])]));
s.sourcesFixture = avant.fixture.sources.map((x) => x.source);
const avecPayantes = oq.quotesForFixture({ homeId, awayId, date: '2026-10-06' }, { database, avecPayantes: true });
s.avecPayantes = avecPayantes.sources.map((x) => ({ source: x.source, bookmakers: x.bookmakers.map((b) => b.bookmaker).sort() }));
s.resumeAvecPayantes = oq.quotesSummary({ database, withQuotes: true, avecPayantes: true }).sources.map((x) => ({ source: x.source, quotes: x.quotes }));

console.log(JSON.stringify({ ok: true, ...s }));
