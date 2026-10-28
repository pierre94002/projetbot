/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-pari.mjs <serveur de la copie> <manifeste de l'échantillon>
 *
 * Étape 26 — T-PA1 : les RÉGLAGES DE PARI (regles.js, REGLAGES_DE_PARI) ne changent AUCUNE probabilité du moteur.
 * C'est ce qui permet à la boucle de correction de mettre dans une même lignée deux versions qui ne diffèrent que
 * par eux (les versions 4 et 5 de Pierre). Les matchs cibles de la base d'essai (12 avec cotes, 8 sans), présentés
 * au moteur comme dans script-pronostics.mjs ; pour chacun, analyzeMatch avec les réglages en service (les valeurs
 * par défaut de la copie) SANS puis AVEC le modèle de buts unique (la clé `modeleDeButs` de la candidate de
 * l'étape 27), puis avec CHACUNE des 7 clés changée : tout ce qui est une probabilité (distributions, attendus,
 * buts attendus, cotes justes, 1N2, pronostics de marché et leur distribution gelée, modèle de buts) doit rester
 * identique à l'octet. Témoin : un réglage qui change les probabilités (defaultCorrelation sans le modèle de buts,
 * rho avec) doit, lui, changer quelque chose. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [serveur, fichierManifeste] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
const chemin = path.resolve(resolveDbPath());
if (chemin.toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error(`Base inattendue : ${chemin}`);
const db = openDb();

const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { REGLAGES_DE_PARI } = await imp('data/correction/regles.js');
const { CANDIDATE_EN_ESSAI } = await imp('core/engine/engineVersions.js');

const MAINTENANT = Date.now(); // l'heure figée de la garde
const sport = getSport('football');
const tilt = getTiltState();
const copie = (x) => JSON.parse(JSON.stringify(x));
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

const lire = db.prepare(`SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, json_extract(m.meta, '$.round') AS round,
                                o.source AS osource, o.basis, o.home AS o1, o.draw AS ox, o.away AS o2
                         FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key WHERE m.match_key = ?`);
const cleDeCote = (source, basis) =>
  /^pinnacle/i.test(basis) ? 'pinnacle' : `${source}-${basis}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');
function matchAdapte(r) {
  const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league, round: r.round ?? null }, 10000);
  if (![r.o1, r.ox, r.o2].every((x) => Number.isFinite(x) && x > 1)) return base;
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

/** Tout ce qui est une PROBABILITÉ dans un résultat du moteur (jamais la mise, la value ou l'avantage). */
function probabilites(r) {
  return JSON.stringify({
    distributions: r.distributions ?? null,
    statExpectations: r.statExpectations ?? null,
    expectedGoals: r.expectedGoals ?? null,
    trueOdds: r.trueOdds ?? null,
    resultat: r.prediction ? { probabilites: r.prediction.probabilities, source: r.prediction.source ?? null } : null,
    marches: (r.marketPredictions ?? []).map((p) => ({ id: p.marketId, params: p.params, issue: p.predictedOutcome, cote: p.predictedOdds, distribution: sport.markets.distributionDuMarche(r, p) })),
    modeleDeButs: r.modeleDeButs ?? null,
    score: r.scorePrediction ? { attendus: r.scorePrediction.expectedGoals ?? null, issues: r.scorePrediction.outcomes ?? null } : null
  });
}

/** Une valeur changée pour chaque réglage de pari (valide, différente de celle en service). */
const CHANGEES = { edgeThresholdMin: 0.07, edgeThresholdMax: 0.6, valueBookmakers: ['pinnacle', 'unibet_fr'], maxValueOdds: 2.1, kellyFraction: 0.5, maxStakePercent: 0.1, maxExpectedRateGap: 0.05 };

const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));
const avecCotes = manifeste.cibles.filter((c) => c.cotes).slice(0, 12);
const sansCotes = manifeste.cibles.filter((c) => !c.cotes).slice(0, 8);
const service = copie(getEngineConfig('football'));
const REGIMES = {
  ancienModele: { reglages: service, temoin: { ...copie(service), defaultCorrelation: -0.2 } },
  modeleDeButs: {
    reglages: { ...copie(service), modeleDeButs: copie(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs) },
    temoin: { ...copie(service), modeleDeButs: { ...copie(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs), rho: 0.1 } }
  }
};
const sortie = { ok: true, cles: [...REGLAGES_DE_PARI], cibles: { avecCotes: avecCotes.length, sansCotes: sansCotes.length }, regimes: {} };
for (const [nom, regime] of Object.entries(REGIMES)) {
  const r = { analyses: 0, identiques: Object.fromEntries(REGLAGES_DE_PARI.map((k) => [k, 0])), differents: Object.fromEntries(REGLAGES_DE_PARI.map((k) => [k, []])), temoinChange: 0, pronostics: 0, avecProvenance: 0 };
  for (const cible of [...avecCotes, ...sansCotes]) {
    const ligne = lire.get(cible.cle);
    if (!ligne) throw new Error(`Cible absente : ${cible.cle}`);
    const enrichi = await enrichMatchWithRealAverages(matchAdapte(ligne), { sansRepliPayant: true });
    const ref = await analyzeMatch(enrichi, regime.reglages, tilt, sport, { maintenant: MAINTENANT });
    const avant = probabilites(ref);
    r.analyses++;
    r.pronostics += (ref.marketPredictions ?? []).length;
    if ((ref.marketPredictions ?? []).some((p) => sport.markets.distributionDuMarche(ref, p)?.provenance)) r.avecProvenance++;
    for (const cle of REGLAGES_DE_PARI) {
      const reglages = { ...copie(regime.reglages), [cle]: copie(CHANGEES[cle]) };
      const apres = probabilites(await analyzeMatch(enrichi, reglages, tilt, sport, { maintenant: MAINTENANT }));
      if (apres === avant) r.identiques[cle]++;
      else r.differents[cle].push({ cle: cible.cle, avant: sha1(avant).slice(0, 12), apres: sha1(apres).slice(0, 12) });
    }
    if (probabilites(await analyzeMatch(enrichi, regime.temoin, tilt, sport, { maintenant: MAINTENANT })) !== avant) r.temoinChange++;
  }
  sortie.regimes[nom] = r;
}
console.log(JSON.stringify(sortie));
