/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-pronostics.mjs <serveur de la copie> <manifeste de l'échantillon>
 *
 * Calcule, avec le code ACTUEL du moteur, le pronostic de chaque match
 * « cible » de la base d'essai, par le même chemin que les analyses
 * automatiques de l'appli (autoMatchAiTrigger.calculerEngineResult) :
 * enrichMatchWithRealAverages(…, { sansRepliPayant: true }) puis analyzeMatch
 * avec getEngineConfig('football') et getTiltState() — lus dans le
 * data/runtime VIDE de la copie, donc les valeurs par défaut du code.
 *
 * Le match passé est présenté au moteur comme un match du calendrier
 * (adaptSeasonCalendarMatch, l'adaptateur de l'appli) ; sa cote passée
 * (match_odds), quand il en a une, comme une cote gratuite de référence
 * (même forme que freeMarketOdds.js : une ligne referenceOnly, jamais jouable).
 *
 * Sortie : une ligne JSON { ok, maintenant, base, resultats: [...] }.
 *
 * Étape 27 (« la clé éteinte ne change rien ») : avec `--complet`, le résultat
 * ENTIER de analyzeMatch est rendu pour chaque cible, normalisé (sans
 * engineVersion ni comparateur.calculeLe), sous forme d'empreinte sha1 — et en
 * entier pour cinq cibles (les trois premières à cotes, les deux premières
 * sans) —, pour chaque VARIANTE d'entrée : `brut` (le chemin de l'appli),
 * `entreesButsNulle` et `entreesButsPosee` (la clé `entreesButs` du banc posée
 * sur le match), `cleNulle` (réglages avec `modeleDeButs: null`). Le moteur
 * sans la clé `modeleDeButs` doit rendre la même empreinte pour les quatre :
 * test/moteurCleEteinte.test.mjs. Sortie : { ok, maintenant, base, complets }.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [serveur, fichierManifeste, ...options] = process.argv.slice(2);
const complet = options.includes('--complet');
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
// La base que le code va ouvrir doit être la copie de travail.
const chemin = path.resolve(resolveDbPath());
if (chemin.toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) {
  throw new Error(`Base inattendue : ${chemin}`);
}
const db = openDb();

const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');

const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));
const lire = db.prepare(`SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, json_extract(m.meta, '$.round') AS round,
                                o.source AS osource, o.basis, o.home AS o1, o.draw AS ox, o.away AS o2
                         FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key WHERE m.match_key = ?`);

const cleDeCote = (source, basis) =>
  /^pinnacle/i.test(basis) ? 'pinnacle' : `${source}-${basis}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');

function matchAdapte(r) {
  const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league, round: r.round ?? null }, 10000);
  const coteComplete = [r.o1, r.ox, r.o2].every((x) => Number.isFinite(x) && x > 1);
  if (!coteComplete) return base;
  return {
    ...base,
    hasOdds: true,
    oddsSource: 'gratuit',
    marketOdds: {
      odds1: r.o1,
      oddsDraw: r.ox,
      odds2: r.o2,
      bookmakersCount: 1,
      byBookmaker: [{ key: cleDeCote(r.osource, r.basis), title: `${r.basis} · ${r.osource}`, odds1: r.o1, oddsDraw: r.ox, odds2: r.o2, referenceOnly: true, source: r.osource }],
      source: 'gratuit'
    }
  };
}

const a4 = (x) => (Number.isFinite(x) ? Number(x.toFixed(4)) : x ?? null);

function resumer(cible, r, coteDe) {
  const s = r.scorePrediction;
  return {
    cle: cible.cle,
    date: cible.date,
    league: cible.league,
    home: cible.home,
    away: cible.away,
    cotes: coteDe,
    resultat: {
      issue: r.prediction?.outcome ?? null,
      source: r.prediction?.source ?? null,
      p: r.prediction ? [r.prediction.probabilities.home, r.prediction.probabilities.draw, r.prediction.probabilities.away] : null,
      doubleChance: r.prediction?.doubleChance?.label ?? null
    },
    buts: { lambda: r.expectedGoals.home, mu: r.expectedGoals.away },
    coteJuste: {
      home: r.trueOdds.home,
      draw: r.trueOdds.draw,
      away: r.trueOdds.away,
      over15: r.trueOdds.over15,
      over25: r.trueOdds.over25,
      over35: r.trueOdds.over35,
      bothTeamsScore: r.trueOdds.bothTeamsScore
    },
    score: s
      ? {
          source: s.source,
          attendus: s.expectedGoals,
          plusProbable: s.mostLikely ? { score: `${s.mostLikely.home}-${s.mostLikely.away}`, p: a4(s.mostLikely.probability) } : null,
          dansIssue: s.inPredictedOutcome ? { score: `${s.inPredictedOutcome.home}-${s.inPredictedOutcome.away}`, p: a4(s.inPredictedOutcome.probability) } : null,
          issues: s.outcomes ? Object.fromEntries(Object.entries(s.outcomes).map(([k, v]) => [k, a4(typeof v === 'number' ? v : v?.probability)])) : null,
          effetForme: s.formEffect ?? null,
          ligue: s.form?.leagueSource ?? null
        }
      : null,
    stats: r.statExpectations ?? null,
    marches: (r.marketPredictions ?? []).map((p) => ({ id: p.marketId, params: p.params, issue: p.predictedOutcome, libelle: p.predictedLabel, cote: p.predictedOdds })),
    pari: { action: r.staking?.action ?? null, raison: r.staking?.reason ?? null }
  };
}

/** Le résultat entier, normalisé : sans le numéro de version (le code change) ni l'heure du comparateur. */
function normaliser(analyse) {
  const c = JSON.parse(JSON.stringify(analyse));
  delete c.engineVersion;
  if (c.comparateur) delete c.comparateur.calculeLe;
  return JSON.stringify(c);
}
const sha1 = (texte) => crypto.createHash('sha1').update(texte).digest('hex');
/** Des entrées du modèle de buts posées sur le match (forme de bench/entrees.js) : sans la clé, rien ne doit les lire. */
const ENTREES_BUTS_POSEES = Object.freeze({
  forces: {
    home: { sa: 7.2, wa: 6.5, sd: 5.1, wd: 6.5, sga: 7.9, wga: 6.5, sgd: 4.8, wgd: 6.5, n: 9, nx: 9, ligue: 'Championship' },
    away: null
  },
  ligue: { buts: { home: 1.41, away: 1.12 }, xg: { home: 1.38, away: 1.15 }, matchs: 120, source: 'saison' },
  plusMoins: { ligne: 2.5, pOver: 0.531, source: 'football-data (moyenne du marché)', releveAt: '2026-09-01T10:00:00.000Z' },
  origine: 'banc',
  manques: []
});

const resultats = [];
const complets = [];
let avecCotes = 0;
let sansCotes = 0;
for (const cible of manifeste.cibles) {
  const r = lire.get(cible.cle);
  if (!r) throw new Error(`Cible absente de la base d'essai : ${cible.cle}`);
  const match = matchAdapte(r);
  const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
  const analyse = await analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
  if (!complet) {
    resultats.push(resumer(cible, analyse, match.marketOdds ? r.basis : null));
    continue;
  }
  const brut = normaliser(analyse);
  const garder = match.marketOdds ? avecCotes++ < 3 : sansCotes++ < 2;
  const variantes = { brut: sha1(brut) };
  const config = getEngineConfig('football');
  for (const [nom, m, cfg] of [
    ['entreesButsNulle', { ...enrichi, entreesButs: null }, config],
    ['entreesButsPosee', { ...enrichi, entreesButs: JSON.parse(JSON.stringify(ENTREES_BUTS_POSEES)) }, config],
    ['cleNulle', enrichi, { ...config, modeleDeButs: null }]
  ]) {
    variantes[nom] = sha1(normaliser(await analyzeMatch(m, cfg, getTiltState(), getSport('football'))));
  }
  // Les distributions que le gel garde (markets.distributionDuMarche) : sans la clé, jamais de `provenance`.
  const gelAvecProvenance = (analyse.marketPredictions ?? []).some((p) => 'provenance' in (getSport('football').markets.distributionDuMarche(analyse, p) ?? {}));
  complets.push({ cle: cible.cle, avecCotes: Boolean(match.marketOdds), variantes, gelAvecProvenance, ...(garder ? { json: JSON.parse(brut) } : {}) });
}

console.log(JSON.stringify({ ok: true, maintenant: new Date().toISOString(), base: path.basename(chemin), ...(complet ? { complets } : { resultats }) }));
