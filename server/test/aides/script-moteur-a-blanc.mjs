/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-moteur-a-blanc.mjs <serveur de la copie> <phase>
 *
 * Étape 25 du plan — LA VERSION CANDIDATE CALCULÉE À BLANC (data/enregistreurs/moteurABlanc.js), sur la
 * base d'essai, réseau coupé (FotMob SIMULÉ, vide), heure figée, aucun Claude. La candidate est FABRIQUÉE ici
 * (le code n'en déclare aucune à l'étape 25) ; le registre de la mesure (étape 16) est un fichier d'ESSAI de
 * la copie, jamais data/runtime. Phases :
 *   sans-candidate   l'étape de nuit sans candidate : rien — ni calcul, ni écriture en base, ni fichier ;
 *   avec-candidate   une candidate à blanc sur les matchs à venir de la page Matchs (un faux relevé The
 *                    Odds API) : ses chiffres dans leur table, seulement pour les marchés déclarés, comptée au
 *                    registre de la mesure ; puis, UN PAR UN, ce qui ne doit jamais la voir — l'analyse d'un
 *                    match (la route de Mes paris et de la page du match : pronostics, verdict, comparateur),
 *                    le Repérage et les opportunités, le message de l'IA, les journaux des paris, des
 *                    pronostics et des analyses, les pronostics gelés — identique avant et après la nuit ;
 *                    enfin les refus (registre de la mesure illisible, candidate fautive, passe d'un autre).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress, photo, photoDuDossier, ecrireInstantane, matchsDuCalendrier, MATCHS_COTES } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const DOSSIER_COPIE = path.resolve(serveur, '..', '..');

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
// FotMob simulé (journées vides) : le contexte de l'IA et les compositions ne sortent jamais.
installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]) } });
recopierScripts(serveur);

const { calculerABlanc, lignesDuMatch } = await imp('data/enregistreurs/moteurABlanc.js');
const { pronosticsABlanc } = await imp('data/enregistreurs/depot.js');
const V = await imp('core/engine/engineVersions.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { variantesDe } = await imp('bench/trialsRegistry.js');

const s = { ok: true, phase };
const ecritures = () => database.prepare('SELECT total_changes() AS n').get().n;
const lignesABlanc = () => database.prepare('SELECT COUNT(*) AS n FROM engine_candidate_picks').get().n;
const lignesGelees = () => database.prepare('SELECT * FROM engine_picks ORDER BY fixture_key, market_key, version').all().map((r) => ({ ...r }));
/** Les versions du moteur au registre (data/runtime/engine-versions.json de la copie) : numéros, empreintes, version en service, pile. */
const versionsDuRegistre = () => {
  const r = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'engine-versions.json'), 'utf8'));
  return { enService: r.enService, pile: r.pile, versions: r.versions.map((v) => [v.numero, v.empreinte]) };
};

/** La candidate d'essai : une autre corrélation de Dixon-Coles, qui ne déclare changer que deux familles de marchés. */
const CANDIDATE = Object.freeze({
  id: 'essai-rho-015',
  etape: '27',
  quoi: 'Corrélation Dixon-Coles à −0,15 (candidate d’essai)',
  modifications: { football: { defaultCorrelation: -0.15 } },
  marches: ['totalGoals', 'bothTeamsScore']
});
const REGISTRE_MESURE = path.join(DOSSIER_COPIE, 'registre-mesure-essai.json');

if (phase === 'sans-candidate') {
  const avant = { runtime: photoDuDossier(RUNTIME), ecritures: ecritures(), aBlanc: lignesABlanc(), mesure: fs.existsSync(REGISTRE_MESURE) };
  // Des « matchs » qu'on ne peut même pas lire : s'ils étaient touchés (calcul, enrichissement), l'étape le dirait en échec.
  const piege = new Proxy({}, { get: () => { throw new Error('match touché alors qu’il n’y a pas de candidate'); } });
  const r = await calculerABlanc({ dansLaPasse: true, matchs: [piege, piege], mesure: { fichier: REGISTRE_MESURE } });
  s.bilan = r;
  const etape = await job.__testing.passeMoteurABlanc({}, { matchs: [piege], mesure: { fichier: REGISTRE_MESURE } });
  s.etape = etape;
  s.apres = { runtimeIntact: JSON.stringify(photoDuDossier(RUNTIME)) === JSON.stringify(avant.runtime), ecritures: ecritures() - avant.ecritures, aBlanc: lignesABlanc(), mesure: fs.existsSync(REGISTRE_MESURE) };
  s.code = { candidateDuCode: V.CANDIDATE_EN_ESSAI, etapes: job.REFRESH_STEPS.map((e) => e.key) };
} else if (phase === 'avec-candidate') {
  await ecrireInstantane(imp);
  fs.writeFileSync(path.join(RUNTIME, 'bets.json'), '[]');
  fs.writeFileSync(path.join(RUNTIME, 'predictions.json'), '[]');
  V.demarrerVersions();
  const { createApp } = await imp('app.js');
  const app = createApp();
  const screener = await imp('data/screener.js');
  const { getOpportunities } = await imp('data/opportunities.js');
  const service = await imp('core/ai/matchAiAnalysisService.js');
  const gel = await imp('data/enregistreurs/gelPronostics.js');
  const calendrier = await matchsDuCalendrier(imp);

  async function attendreLeRepérage() {
    let lu = screener.getScreener();
    for (let i = 0; i < 1200 && lu.status === 'computing'; i++) {
      await new Promise((fin) => setTimeout(fin, 25));
      lu = screener.getScreener();
    }
    return lu;
  }
  /** Tout ce qu'une candidate ne doit JAMAIS changer, lu comme le lit l'appli. */
  async function cequiSeVoit() {
    const vu = { analyses: {}, ia: {} };
    for (const m of MATCHS_COTES) {
      const r = await requeteExpress(app, 'GET', `/api/analysis/match/${m.id}?source=odds-api&bankroll=10000`);
      vu.analyses[m.id] = { code: r.code, corps: r.corps };
      const ia = await service.preparerAnalyseAvantMatch({ matchId: m.id, home: m.home_team, away: m.away_team, league: 'EPL', engineResult: r.corps, sansRepliPayant: true });
      vu.ia[m.id] = { system: ia.system, message: ia.userMessage, marches: ia.marches };
    }
    screener.getScreener({ force: true });
    const reperage = await attendreLeRepérage();
    const { generatedAt, durationMs, ...donnees } = reperage.data ?? {};
    vu.reperage = { status: reperage.status, donnees };
    const page = getOpportunities({ maintenant: Date.now() });
    vu.opportunites = { status: page.status, lignes: page.data?.lignes ?? null, resume: page.data?.resume ?? null };
    const vertes = await requeteExpress(app, 'GET', '/api/opportunities/vertes');
    vu.vertes = vertes.corps;
    vu.journaux = { paris: photo(path.join(RUNTIME, 'bets.json')), pronostics: photo(path.join(RUNTIME, 'predictions.json')), analysesIA: photo(path.join(RUNTIME, 'match-ai-analyses.json')) };
    vu.routes = { paris: (await requeteExpress(app, 'GET', '/api/bets')).corps, pronostics: (await requeteExpress(app, 'GET', '/api/predictions')).corps };
    vu.gel = lignesGelees();
    return vu;
  }

  // La version en service gelée d'abord (comme la nuit : le gel, puis la candidate).
  s.gel = await gel.gelerLaNuit({ maintenant: Date.now(), matchs: calendrier, dansLaPasse: true, database });
  const avant = await cequiSeVoit();
  s.avant = { analyses: Object.fromEntries(Object.entries(avant.analyses).map(([k, v]) => [k, { code: v.code, version: v.corps?.engineVersion ?? null, marches: v.corps?.marketPredictions?.length ?? 0 }])), reperage: avant.reperage.status, matchsReperes: avant.reperage.donnees?.matches?.length ?? 0, opportunites: avant.opportunites.lignes?.length ?? null, gel: avant.gel.length };

  // LA NUIT À BLANC : la page Matchs (le faux relevé payant), sans autre option que la candidate et le registre d'essai.
  const versionsAvantLaNuit = versionsDuRegistre();
  const ecrituresAvant = ecritures();
  const nuit = await calculerABlanc({ dansLaPasse: true, candidate: CANDIDATE, mesure: { fichier: REGISTRE_MESURE } });
  s.nuit = nuit;
  s.ecrituresDeLaNuit = ecritures() - ecrituresAvant;
  const lignes = pronosticsABlanc(CANDIDATE.id, { database });
  s.lignes = lignes.map((l) => ({
    match: l.fixtureKey,
    marche: l.marketKey,
    revision: l.revision,
    versionEnService: l.serviceVersion,
    choix: l.choice,
    params: l.params,
    distribution: l.distribution ? JSON.parse(l.distribution) : null,
    choixEnService: l.serviceChoice,
    paramsEnService: l.serviceParams,
    distributionEnService: l.serviceDistribution ? JSON.parse(l.serviceDistribution) : null,
    empreinte: l.candidateHash
  }));
  s.variantes = variantesDe('27', { fichier: REGISTRE_MESURE });
  s.registreVersions = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'engine-versions.json'), 'utf8')).candidate;
  s.carte = V.etatDesVersions({ candidate: CANDIDATE }).candidate;
  // Une seconde nuit, sans rien de changé : rien de plus.
  const seconde = await calculerABlanc({ dansLaPasse: true, candidate: CANDIDATE, mesure: { fichier: REGISTRE_MESURE } });
  s.seconde = { ecrites: seconde.ecrites, lignes: seconde.lignes };

  // CE QUI NE DOIT JAMAIS LA VOIR : identique avant et après.
  const apres = await cequiSeVoit();
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  s.invisible = {
    analyses: egal(avant.analyses, apres.analyses),
    verdicts: egal(Object.values(avant.analyses).map((a) => [a.corps?.verdicts, a.corps?.staking, a.corps?.comparateur]), Object.values(apres.analyses).map((a) => [a.corps?.verdicts, a.corps?.staking, a.corps?.comparateur])),
    reperage: egal(avant.reperage, apres.reperage),
    opportunites: egal(avant.opportunites, apres.opportunites),
    vertes: egal(avant.vertes, apres.vertes),
    ia: egal(avant.ia, apres.ia),
    journaux: egal(avant.journaux, apres.journaux),
    routesDesJournaux: egal(avant.routes, apres.routes),
    gel: egal(avant.gel, apres.gel)
  };
  // Et ce qu'on montre n'est PAS ce que la candidate a calculé (sinon « invisible » ne prouverait rien) : pour
  // chaque ligne à blanc, la distribution du même marché dans l'analyse de la route (sur la même ligne) est
  // celle de la version en service, au chiffre près — et elle diffère de celle de la candidate quand la
  // candidate change ce marché.
  const parMatch = new Map(lignes.map((x) => [x.fixtureKey, x.matchId]));
  s.montre = s.lignes.map((l) => {
    const dto = apres.analyses[parMatch.get(l.match)]?.corps ?? null;
    const ligne = { marketId: l.marche.split(':')[0], params: JSON.parse(l.params ?? l.paramsEnService ?? '{}') };
    const montree = dto ? JSON.parse(gel.distributionGelee(dto, ligne) ?? 'null') : null;
    return {
      marche: l.marche,
      trouve: Boolean(dto),
      commeEnService: JSON.stringify(montree) === JSON.stringify(l.distributionEnService),
      commeLaCandidate: JSON.stringify(montree) === JSON.stringify(l.distribution),
      candidateDifferente: JSON.stringify(l.distribution) !== JSON.stringify(l.distributionEnService)
    };
  });
  s.ia = { candidateDansLeMessage: Object.values(apres.ia).some((x) => x.message.includes(CANDIDATE.id) || /candidate|à blanc/i.test(x.message)) };

  // L'étape de la passe, telle que la nuit la lance (le bilan qu'elle consigne).
  s.etape = await job.__testing.passeMoteurABlanc({}, { candidate: CANDIDATE, mesure: { fichier: REGISTRE_MESURE } });
  // Deux nuits et l’étape de la passe plus tard : la candidate n’est JAMAIS notée comme une version du moteur.
  s.versionsDuMoteur = { avant: versionsAvantLaNuit, apres: versionsDuRegistre() };

  // LES REFUS. Registre de la mesure illisible : la candidate n'est pas comptée, donc pas calculée.
  const illisible = path.join(DOSSIER_COPIE, 'registre-mesure-illisible.json');
  fs.writeFileSync(illisible, '{"version":1,"etapes":');
  const avantRefus = lignesABlanc();
  const refus = await calculerABlanc({ dansLaPasse: true, candidate: { ...CANDIDATE, id: 'essai-refusee' }, mesure: { fichier: illisible } });
  s.refusMesure = { erreur: refus.erreur, candidate: refus.candidate, lignes: lignesABlanc() - avantRefus, fichierIntact: fs.readFileSync(illisible, 'utf8') === '{"version":1,"etapes":' };
  // Une candidate fautive (un marché inconnu, une étape qui ne se juge pas) : refusée, rien calculé.
  const fautive = await calculerABlanc({ dansLaPasse: true, candidate: { ...CANDIDATE, marches: ['totalGoals', 'buteurs'] }, mesure: { fichier: REGISTRE_MESURE } });
  const horsEtape = await calculerABlanc({ dansLaPasse: true, candidate: { ...CANDIDATE, etape: '17' }, mesure: { fichier: REGISTRE_MESURE } });
  s.refusFautives = { marche: fautive.erreur, etape: horsEtape.erreur, lignes: lignesABlanc() - avantRefus };
  // Hors de sa passe, pendant qu'un autre processus tient le verrou : rien n'est écrit, l'écriture est reportée.
  const verrou = path.join(RUNTIME, 'espn-refresh.lock');
  const maintenant = new Date().toISOString();
  fs.writeFileSync(verrou, JSON.stringify({ pid: process.pid, token: 'essai-25', startedAt: maintenant, heartbeatAt: maintenant }));
  const autre = { ...CANDIDATE, id: 'essai-rho-012', modifications: { football: { defaultCorrelation: -0.12 } } };
  const pendant = await calculerABlanc({ dansLaPasse: false, candidate: autre, mesure: { fichier: REGISTRE_MESURE } });
  fs.rmSync(verrou, { force: true });
  s.horsPasse = { reporte: pendant.reporte, ecrites: pendant.ecrites, lignes: pronosticsABlanc(autre.id, { database }).length };
  // Les lignes d'un match, fonction pure : la ligne de comparaison est celle de la candidate.
  s.pur = lignesDuMatch({
    a: { marketPredictions: [{ marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, predictedOutcome: 'over', predictedOdds: 1.8 }], distributions: { totalGoals: { 2.5: { over: 0.55, under: 0.45 }, 3.5: { over: 0.3, under: 0.7 } } } },
    b: { marketPredictions: [{ marketId: 'totalGoals', params: { line: 3.5, side: 'under' }, predictedOutcome: 'under', predictedOdds: 1.4 }], distributions: { totalGoals: { 2.5: { over: 0.5, under: 0.5 }, 3.5: { over: 0.28, under: 0.72 } } } },
    candidate: { marches: ['totalGoals'] },
    commun: {}
  });
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(s));
