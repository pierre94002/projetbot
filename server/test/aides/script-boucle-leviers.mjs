/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-leviers.mjs <serveur de la copie> <manifeste de l'échantillon>
 *
 * Étape 26, partie B — T-PR3 et T-PR4, par le VRAI moteur (analyzeMatch) :
 *   T-PR3  chaque levier du formulaire (une sous-clé du modèle de buts) ne change QUE les marchés que sa correction
 *          déclare (les 4 familles de buts) et son témoin (le score exact) — jamais le 1N2, les corners ni les tirs ;
 *          et il change bien quelque chose (sinon « rien d'autre ne bouge » ne prouverait rien) ;
 *   T-PR4  le SENS de ρ : la correction que la règle propose pour « les deux équipes marquent annoncé trop haut »
 *          fait baisser P(oui) sur chaque match ; pour « trop bas », la fait monter.
 * Les matchs cibles de la base d'essai (12 avec cotes 1N2, 8 sans), présentés au moteur comme dans
 * script-boucle-pari.mjs, avec les ENTRÉES DU MODÈLE DE BUTS posées sur le match (`entreesButs`, le chemin du banc :
 * des forces d'équipe, les moyennes du championnat, et un plus/moins 2,5 pour la moitié des matchs cotés) — pour que
 * chaque régime (cotes avec plus/moins, 1N2 seul, sans cote) et chaque réglage (démarrage à froid compris) joue.
 * Les réglages en service : ceux de la copie, avec le modèle de buts de la candidate de l'étape 27. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, fichierManifeste] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { CANDIDATE_EN_ESSAI, configDeLaCandidate } = await imp('core/engine/engineVersions.js');
const P = await imp('data/correction/propositions.js');
const R = await imp('data/correction/regles.js');

const MAINTENANT = Date.now();
const sport = getSport('football');
const tilt = getTiltState();
const copie = (x) => JSON.parse(JSON.stringify(x));
const service = { ...copie(getEngineConfig('football')), modeleDeButs: copie(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs) };

const lire = db.prepare(`SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, json_extract(m.meta, '$.round') AS round,
                                o.source AS osource, o.basis, o.home AS o1, o.draw AS ox, o.away AS o2
                         FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key WHERE m.match_key = ?`);
const cleDeCote = (source, basis) => (/^pinnacle/i.test(basis) ? 'pinnacle' : `${source}-${basis}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_'));
function matchAdapte(r) {
  const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league, round: r.round ?? null }, 10000);
  if (![r.o1, r.ox, r.o2].every((x) => Number.isFinite(x) && x > 1)) return base;
  return { ...base, hasOdds: true, oddsSource: 'gratuit', marketOdds: { odds1: r.o1, oddsDraw: r.ox, odds2: r.o2, bookmakersCount: 1, byBookmaker: [{ key: cleDeCote(r.osource, r.basis), title: `${r.basis} · ${r.osource}`, odds1: r.o1, oddsDraw: r.ox, odds2: r.o2, referenceOnly: true, source: r.osource }], source: 'gratuit' } };
}
/** Les entrées du modèle de buts posées sur le match : des forces (l'équipe qui se déplace peu connue : 5 matchs, le démarrage à froid joue), la ligue, un plus/moins pour la moitié des matchs cotés. */
const etat = (n, nx, k) => ({ n, nx, sa: n * (1.1 + 0.02 * k), wa: n, sd: n * (0.9 - 0.01 * k), wd: n, sga: n * (1.15 + 0.01 * k), wga: n, sgd: n * (0.92 - 0.01 * k), wgd: n });
const entrees = (k, avecPlusMoins) => ({
  forces: { home: etat(12, 10, k % 5), away: etat(5, 4, (k + 2) % 5) },
  ligue: { buts: { home: 1.5, away: 1.2 }, xg: { home: 1.45, away: 1.18 }, matchs: 120, matchsXg: 110, source: 'saison' },
  plusMoins: avecPlusMoins ? { ligne: 2.5, pOver: 0.5 + 0.01 * (k % 7), source: 'essai', releveAt: null } : null
});

const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));
const cibles = [...manifeste.cibles.filter((c) => c.cotes).slice(0, 12), ...manifeste.cibles.filter((c) => !c.cotes).slice(0, 8)];
const matchs = [];
for (const [k, cible] of cibles.entries()) {
  const ligne = lire.get(cible.cle);
  if (!ligne) throw new Error(`Cible absente : ${cible.cle}`);
  const enrichi = await enrichMatchWithRealAverages(matchAdapte(ligne), { sansRepliPayant: true });
  const avecCotes = Boolean(enrichi.marketOdds);
  matchs.push({ cle: cible.cle, avecCotes, avecPlusMoins: avecCotes && k % 2 === 0, enrichi: { ...enrichi, entreesButs: entrees(k, avecCotes && k % 2 === 0) } });
}

const FAMILLES = ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal'];
/** Les familles dont une probabilité change entre deux résultats du moteur (le score exact à part : le témoin). */
function changees(a, b) {
  const out = new Set();
  for (const f of FAMILLES) if (JSON.stringify(a.distributions?.[f] ?? null) !== JSON.stringify(b.distributions?.[f] ?? null)) out.add(f);
  for (const k of ['corners', 'shots', 'shotsOnTarget']) if (JSON.stringify(a.statExpectations?.[k] ?? null) !== JSON.stringify(b.statExpectations?.[k] ?? null)) out.add(`statistiques:${k}`);
  if (JSON.stringify(a.distributions?.scoreExact ?? a.scorePrediction ?? null) !== JSON.stringify(b.distributions?.scoreExact ?? b.scorePrediction ?? null)) out.add('scoreExact');
  return out;
}

const VALEURS = { 'modeleDeButs.rho': -0.1, 'modeleDeButs.prior': 14, 'modeleDeButs.poidsXg': 0.4, 'modeleDeButs.melange.avecPlusMoins.wT': 0.3, 'modeleDeButs.melange.avecPlusMoins.wS': 0.3, 'modeleDeButs.melange.sans.wT': 0.3, 'modeleDeButs.melange.sans.wS': 0.3, 'modeleDeButs.demarrageAFroid.matchs': 12 };
const sortie = { ok: true, matchs: { total: matchs.length, avecCotes: matchs.filter((m) => m.avecCotes).length, avecPlusMoins: matchs.filter((m) => m.avecPlusMoins).length }, leviers: {}, provenances: {} };
const references = [];
for (const m of matchs) {
  const r = await analyzeMatch(m.enrichi, service, tilt, sport, { maintenant: MAINTENANT });
  references.push(r);
  sortie.provenances[r.modeleDeButs?.provenance?.code ?? 'aucune'] = (sortie.provenances[r.modeleDeButs?.provenance?.code ?? 'aucune'] ?? 0) + 1;
}
for (const levier of Object.keys(R.LEVIERS)) {
  const declaration = P.declarationDe({ id: `c26-essai-${R.LEVIERS[levier].court}-1`, levier, apres: VALEURS[levier], reglagesEnService: service, quoi: 'essai', enMots: 'essai' });
  const config = configDeLaCandidate(service, declaration, 'football');
  const familles = new Set();
  let matchsChanges = 0;
  for (const [i, m] of matchs.entries()) {
    const c = changees(references[i], await analyzeMatch(m.enrichi, config, tilt, sport, { maintenant: MAINTENANT }));
    if (c.size) matchsChanges++;
    for (const f of c) familles.add(f);
  }
  sortie.leviers[levier] = { declares: declaration.marches, temoins: declaration.temoins, familles: [...familles].sort(), matchsChanges };
}

// T-PR4 : le sens de ρ — la correction que propose la RÈGLE (proposerPourLeTri) sur un tri fabriqué.
function laCorrection(ecart) {
  const c = { cas: 'bothTeamsScore|niveau', famille: 'bothTeamsScore', mesure: 'niveau', statut: 'vrai-defaut', sens: ecart < 0 ? 'trop-haut' : 'trop-bas', sensDit: 'essai', aRevoir: null, courant: { ecart }, fenetre: { mois: ['2027-01', '2027-02'], ecart, matchs: 2600 } };
  const tri = { mois: '2027-02', version: 1, lignee: { empreinte: 'essai', versionEnService: 1 }, cases: [{ ...c, levier: R.levierDeLaCase(c, { avecModeleDeButs: true }) }] };
  const r = P.proposerPourLeTri({ tri, reglagesEnService: service, propositions: [], place: null, base: 'essai', versionEnService: 1, maintenant: MAINTENANT });
  return r.aCreer[0]?.proposition ?? null;
}
sortie.sensDeRho = {};
for (const [nom, ecart] of [['tropHaut', -0.04], ['tropBas', 0.04]]) {
  const p = laCorrection(ecart);
  const config = configDeLaCandidate(service, p.declaration, 'football');
  const ecarts = [];
  for (const [i, m] of matchs.entries()) {
    const b = await analyzeMatch(m.enrichi, config, tilt, sport, { maintenant: MAINTENANT });
    ecarts.push(Number((b.distributions.bothTeamsScore.yes - references[i].distributions.bothTeamsScore.yes).toFixed(6)));
  }
  sortie.sensDeRho[nom] = { avant: p.avant, apres: p.apres, ecarts, baisses: ecarts.filter((x) => x < 0).length, hausses: ecarts.filter((x) => x > 0).length };
}
console.log(JSON.stringify(sortie));
