/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-memoire-ia.mjs <serveur de la copie> <phase>
 *
 * Étape 44 — LA MÉMOIRE DE L'IA. Base = la copie de la base d'essai (rencontres jusqu'au 21/09/2026), heure figée au
 * 05/10/2026 12 h UTC. AUCUN appel à Claude : les analyses de l'IA et leurs bilans d'après-match (avec leurs LEÇONS)
 * sont FABRIQUÉS dans le data/runtime de la copie ; la seule analyse « faite » passe par un Claude SIMULÉ
 * (claudeCodeClient.__testing.simulerClaude, refusé hors d'une copie d'essai).
 *
 * LES LEÇONS PLANTÉES (marché « Total corners », la ligne choisie d'après les corners RÉELS du magasin, pour que
 * l'issue soit connue d'avance) :
 *   - club C : une leçon au 1er de ses 5 matchs analysés (le moteur s'est trompé, 80 % annoncés), puis 4 matchs où le
 *     moteur se trompe encore à 80 % → CONFIRMÉE par le carnet ;
 *   - club D : une leçon au 1er de ses 4 matchs, puis 3 matchs où le pronostic passe à 70 % → DÉMENTIE, retirée ;
 *   - club E : une leçon, puis seulement 2 matchs → EN ATTENTE (jamais dans le dossier) ;
 *   - 40 rencontres « de volume », réglées à 80 % annoncés et 4 sur 5 passées : la part commune du type reste ~0.
 * Les valeurs attendues (z, écarts) sont recalculées par le test à la main.
 *
 * Phases :
 *   nuit       la première nuit (tout), une nuit sans match (rien), un club qui JOUE (lui et son adversaire refaits,
 *              les autres identiques à l'octet), une leçon démentie qui resterait confirmée ensuite (jamais revenue),
 *              le fichier par atomicJson (illisible : jamais écrasé), l'étape de la passe, la route.
 *   homonymes  le rattachement par IDENTIFIANT : les deux « Nacional », Porto / Portsmouth / Port Vale / Shanghai
 *              Port, Leeds United / DC United, deux sources contradictoires.
 *   fiche      le texte remis à l'IA À LA PLACE des trois dernières leçons, sans dossiers la fiche d'avant, une
 *              analyse enregistrée avec un Claude simulé (le message reçu, la mémoire gardée), la note de Pierre.
 *   ecran      les réponses de la route pour l'écran : jamais calculé, prêt, club sans dossier, autre forme, illisible.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
// L'actualisation importe un script du serveur (merge-match-stats.mjs) : recopié dans la copie seulement.
recopierScripts(serveur);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrireRuntime = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
const sortie = { phase, ok: true };

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const ecritures = () => db.prepare('SELECT total_changes() AS n').get().n;
const plusMinutes = (iso, n) => new Date(Date.parse(iso) + n * 60_000).toISOString();
const FICHIER = path.join(RUNTIME, 'ai-dossiers.json');
const lireFichier = () => JSON.parse(fs.readFileSync(FICHIER, 'utf8'));

/** Une requête à l'appli, sans port ni réseau (le routeur d'Express appelé directement). */
function requete(app, methode, url) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai' };
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let rendu = null;
      try {
        rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: rendu });
      return res;
    };
    app.handle(req, res, reject);
  });
}

// ============================================================ les rencontres de la base d'essai

const statsDe = db.prepare('SELECT side, corner_kicks AS corners FROM team_stats WHERE match_key = ?');
function cornersDe(m) {
  const l = statsDe.all(m.matchKey);
  const h = l.find((r) => r.side === 'home')?.corners;
  const a = l.find((r) => r.side === 'away')?.corners;
  return Number.isInteger(h) && Number.isInteger(a) && h + a > 0 ? h + a : null;
}

/** Les rencontres « ordinaires » de juillet à septembre 2026 : coup d'envoi connu, pas prolongées, corners relevés, affiche unique. */
function ordinaires() {
  const liste = db
    .prepare(
      `SELECT match_key AS matchKey, date, league, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, home_goals AS hg, away_goals AS ag,
              json_extract(meta, '$.kickoff') AS kickoff, json_extract(meta, '$.reason') AS reason, json_extract(meta, '$.awarded') AS awarded
       FROM matches WHERE date >= '2026-07-01' AND date <= '2026-09-30' AND home_id IS NOT NULL AND away_id IS NOT NULL AND home_goals IS NOT NULL ORDER BY date, match_key`
    )
    .all()
    .map((r) => ({ ...r }));
  const paires = new Map();
  for (const m of liste) paires.set(`${m.homeId}|${m.awayId}`, (paires.get(`${m.homeId}|${m.awayId}`) ?? 0) + 1);
  return liste
    .filter((m) => !m.reason && !m.awarded && m.kickoff && paires.get(`${m.homeId}|${m.awayId}`) === 1)
    .map((m) => ({ ...m, corners: cornersDe(m) }))
    .filter((m) => m.corners !== null);
}

/** Le pronostic « Total corners » qui passe (ligne sous les corners réels) ou qui échoue (ligne au-dessus), à la cote juste donnée. */
function pronostic(m, { passe, cote }) {
  const line = passe ? m.corners - 0.5 : m.corners + 0.5;
  return { marketId: 'totalCorners', params: { line, side: 'over' }, market: 'Total corners', predictedOutcome: 'over', predictedLabel: `Plus de ${line} corners`, predictedOdds: cote, probability: Math.round(100 / cote), minOdds: 1.2 };
}

/** Une analyse d'avant-match et son bilan d'après-match (une leçon écrite si `lecon`), identifiants par la composition. */
function analyse(id, m, p, { lecon = null, passe }) {
  const analysedAt = plusMinutes(m.kickoff, -180);
  return {
    matchId: id,
    homeName: m.homeName,
    awayName: m.awayName,
    league: m.league,
    commenceTime: m.kickoff,
    model: 'claude-code:sonnet',
    engineSnapshot: { label: `${m.homeName} vs ${m.awayName}`, marketPredictions: [p] },
    analysedAt,
    timing: 'avance',
    fiche: 'compacte',
    lineupSnapshot: { source: 'FotMob', home: { team: m.homeName, teamId: m.homeId }, away: { team: m.awayName, teamId: m.awayId } },
    analysis: { summary: 'essai', keyFactors: [], marketViews: [{ market: p.market, pick: p.predictedLabel, verdict: 'confirme', confidence: 'moyenne', explanation: 'essai', reasoning: 'essai' }] },
    createdAt: analysedAt,
    updatedAt: plusMinutes(m.kickoff, 24 * 60),
    postMatchReview: {
      createdAt: plusMinutes(m.kickoff, 24 * 60),
      marketReviews: [
        { market: p.market, marketId: p.marketId, pick: p.predictedLabel, minOdds: 1.2, outcome: passe ? 'juste' : 'faux', aiVerdict: 'confirme', aiConfidence: 'moyenne', aiWasRight: passe, explanation: 'essai', lesson: lecon }
      ]
    }
  };
}

/** Les clubs C (5 matchs), D (4) et E (3), sans rencontre commune, et 40 rencontres de volume. */
function choisir(ord) {
  const parClub = new Map();
  for (const m of ord) for (const c of [m.homeId, m.awayId]) parClub.set(c, [...(parClub.get(c) ?? []), m]);
  const pris = new Set();
  const prendre = (n, sauf = []) => {
    for (const [club, liste] of [...parClub].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      if (sauf.includes(club)) continue;
      const libres = liste.filter((m) => !pris.has(m.matchKey) && !sauf.some((s) => s === m.homeId || s === m.awayId));
      if (libres.length >= n) {
        const choisis = libres.slice(0, n);
        for (const m of choisis) pris.add(m.matchKey);
        return { club, matchs: choisis };
      }
    }
    throw new Error(`aucun club avec ${n} rencontres libres`);
  };
  const C = prendre(5);
  const D = prendre(4, [C.club]);
  const E = prendre(3, [C.club, D.club]);
  const volume = ord.filter((m) => !pris.has(m.matchKey)).slice(0, 40);
  if (volume.length < 40) throw new Error('trop peu de rencontres de volume');
  return { C, D, E, volume };
}

const LECONS = {
  C: 'Leçon C : sur les corners, le moteur surestime ce club ; se méfier du « plus » même à 80 %.',
  D: 'Leçon D : le total de corners de ce club déçoit, réduire la confiance.',
  E: 'Leçon E : à confirmer, trop tôt.',
  V: 'Leçon de volume : rien de particulier.'
};

function planter() {
  const ord = ordinaires();
  const { C, D, E, volume } = choisir(ord);
  const analyses = [];
  C.matchs.forEach((m, i) => analyses.push(analyse(`essai-C-${i}`, m, pronostic(m, { passe: false, cote: 1.25 }), { lecon: i === 0 ? LECONS.C : null, passe: false })));
  D.matchs.forEach((m, i) => analyses.push(analyse(`essai-D-${i}`, m, pronostic(m, { passe: i > 0, cote: i === 0 ? 1.25 : 1 / 0.7 }), { lecon: i === 0 ? LECONS.D : null, passe: i > 0 })));
  E.matchs.forEach((m, i) => analyses.push(analyse(`essai-E-${i}`, m, pronostic(m, { passe: i > 0, cote: 1.25 }), { lecon: i === 0 ? LECONS.E : null, passe: i > 0 })));
  volume.forEach((m, i) => {
    const passe = i % 5 !== 4;
    analyses.push(analyse(`essai-V-${i}`, m, pronostic(m, { passe, cote: 1.25 }), { lecon: i < 3 ? LECONS.V : null, passe }));
  });
  ecrireRuntime('match-ai-analyses.json', analyses);
  const resume = (x) => ({ club: x.club, matchs: x.matchs.map((m) => ({ matchKey: m.matchKey, date: m.date, league: m.league, homeId: m.homeId, awayId: m.awayId, homeName: m.homeName, awayName: m.awayName })) });
  return { C: resume(C), D: resume(D), E: resume(E), volume: volume.length, analyses: analyses.length };
}

/** Un club « joue » : une rencontre de plus au magasin, et l'annuaire refait comme après un import (dernier match, nombre). */
function jouer(club, adversaire, date, { league = 'Essai League' } = {}) {
  const cle = `${date}-essai-${club}-${adversaire}`;
  db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_goals, away_goals, updated_at, home_id, away_id, meta) VALUES (?, ?, ?, ?, 'Essai A', 'Essai B', 2, 1, ?, ?, ?, '{}')`).run(cle, cle, date, league, `${date}T20:00:00.000Z`, club, adversaire);
  for (const c of [club, adversaire]) db.prepare('UPDATE teams SET last_seen = ?, played = played + 1 WHERE team_id = ?').run(date, c);
  return cle;
}

// ============================================================ les phases

if (phase === 'nuit') {
  const P = planter();
  sortie.plantes = P;
  const D = await imp('data/aiDossiers.js');
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const avant = ecritures();
  // 1. La première nuit : l'étape de la passe (le carnet juste avant, ses cas repris).
  const ctx = { manuel: false, derniere: () => null };
  sortie.carnet = await job.__testing.passeCarnetIA(ctx);
  sortie.casRepris = Array.isArray(ctx.casDuCarnet) ? ctx.casDuCarnet.length : null;
  sortie.premiere = await job.__testing.passeDossiersIA(ctx);
  sortie.ecrituresBase = ecritures() - avant;
  const f1 = lireFichier();
  sortie.f1 = f1;
  sortie.tmpRestants = fs.readdirSync(RUNTIME).filter((n) => /\.tmp$/.test(n));
  // 2. Une nuit sans match : rien de refait, les dossiers identiques à l'octet.
  sortie.rien = await job.__testing.passeDossiersIA({ manuel: false, derniere: () => null });
  const f2 = lireFichier();
  sortie.rienIdentique = JSON.stringify(f2.equipes) === JSON.stringify(f1.equipes) && JSON.stringify(f2.championnats) === JSON.stringify(f1.championnats) && JSON.stringify(f2.lecons) === JSON.stringify(f1.lecons);
  // 3. Le club C joue (contre un club X qui n'a rien à voir avec les leçons) : C et X seuls refaits.
  const X = db.prepare("SELECT team_id AS id FROM teams WHERE last_seen >= '2025-10-05' AND team_id NOT IN (?, ?, ?) ORDER BY team_id LIMIT 1").get(P.C.club, P.D.club, P.E.club).id;
  jouer(P.C.club, X, '2026-09-29');
  sortie.joue = await job.__testing.passeDossiersIA({ manuel: false, derniere: () => null });
  const f3 = lireFichier();
  sortie.X = X;
  sortie.changes = Object.keys(f3.equipes).filter((id) => JSON.stringify(f3.equipes[id]) !== JSON.stringify(f1.equipes[id]));
  sortie.disparus = Object.keys(f1.equipes).filter((id) => !f3.equipes[id]);
  sortie.liguesChangees = Object.keys(f3.championnats).filter((l) => JSON.stringify(f3.championnats[l]) !== JSON.stringify(f1.championnats[l]));
  sortie.leconsChangees = Object.keys({ ...f1.lecons, ...f3.lecons }).filter((k) => JSON.stringify(f1.lecons[k]) !== JSON.stringify(f3.lecons[k]));
  sortie.cApres = { jusquAu: f3.equipes[P.C.club].jusquAu, dernier: f3.equipes[P.C.club].forme?.derniers?.[0] ?? null };
  // 4. Une leçon démentie ne revient JAMAIS : D joue, et ses matchs suivants diraient maintenant le contraire.
  const analyses = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'match-ai-analyses.json'), 'utf8'));
  const ord = ordinaires();
  for (const e of analyses.filter((x) => /^essai-D-[123]$/.test(x.matchId))) {
    const m = ord.find((o) => o.kickoff === e.commenceTime && o.homeName === e.homeName);
    const p = pronostic(m, { passe: false, cote: 1.25 });
    e.engineSnapshot.marketPredictions = [p];
    e.analysis.marketViews[0].pick = p.predictedLabel;
    e.postMatchReview.marketReviews[0] = { ...e.postMatchReview.marketReviews[0], pick: p.predictedLabel, outcome: 'faux', aiWasRight: false };
  }
  ecrireRuntime('match-ai-analyses.json', analyses);
  jouer(P.D.club, X, '2026-09-30');
  sortie.dementieRejouee = await job.__testing.passeDossiersIA({ manuel: false, derniere: () => null });
  const f4 = lireFichier();
  sortie.f4 = { d: f4.equipes[P.D.club], lecons: Object.fromEntries(Object.entries(f4.lecons).filter(([k]) => k.startsWith('essai-D-0|'))) };
  // Le même jugement, refait SANS l'état gardé : il confirmerait (la preuve que seul l'état gardé la retient).
  const M = await imp('core/ai/aiMemory.js');
  const S = await imp('data/aiScorecard.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { cas } = executerSansPause(S.casDesAnalyses(analyses, { database: db, avecCloture: false }));
  const { lecons } = M.leconsDesAnalyses(analyses, cas);
  const index = M.indexDesCas(cas);
  const lD = lecons.find((l) => l.matchId === 'essai-D-0');
  sortie.sansEtatGarde = M.jugerLaLecon(lD, M.casSuivants(index, lD, { cle: P.D.club, genre: 'equipe', club: P.D.club }), { genre: 'equipe', base: index.bases.get('totalCorners'), maintenant: Date.now() }).etat;
  // 5. atomicJson : un fichier illisible n'est jamais écrasé ; l'étape le dit.
  const sain = fs.readFileSync(FICHIER, 'utf8');
  fs.writeFileSync(FICHIER, '{ "version": 1, "equipes": { "fotmob-');
  const casse = fs.readFileSync(FICHIER);
  try {
    await job.__testing.passeDossiersIA({ manuel: false, derniere: () => null });
    sortie.illisible = { leve: false };
  } catch (error) {
    sortie.illisible = { leve: true, nom: error?.constructor?.name, message: error.message };
  }
  sortie.illisible.intact = Buffer.compare(casse, fs.readFileSync(FICHIER)) === 0;
  const R = await imp('data/repositories/aiDossiersRepository.js');
  sortie.illisible.lecture = R.lireLesDossiers().etat;
  sortie.illisible.pourUneAnalyse = R.dossiersPour({ homeId: P.C.club, league: 'EPL' });
  fs.writeFileSync(FICHIER, sain);
  // 6. L'étape dans la passe, et la route.
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  const etape = job.__testing.ETAPES().find((e) => e.key === 'dossiersIA');
  sortie.due = {
    jamais: etape.due({ manuel: false, derniere: () => null }),
    aujourdhui: etape.due({ manuel: false, derniere: () => new Date().toISOString() }),
    manuel: etape.due({ manuel: true, derniere: () => new Date().toISOString() })
  };
  const { createApp } = await imp('app.js');
  const app = createApp();
  sortie.route = {
    club: await requete(app, 'GET', `/api/match-ai-analysis/dossiers?club=${P.C.club}`),
    nom: await requete(app, 'GET', '/api/match-ai-analysis/dossiers?club=Nacional'),
    rien: await requete(app, 'GET', '/api/match-ai-analysis/dossiers'),
    inconnu: await requete(app, 'GET', '/api/match-ai-analysis/dossiers?club=fotmob-1')
  };
  sortie.route.club.corps = { etat: sortie.route.club.corps.etat, club: sortie.route.club.corps.club, dossier: Boolean(sortie.route.club.corps.dossier), league: sortie.route.club.corps.league, championnat: Boolean(sortie.route.club.corps.championnat), texteIA: sortie.route.club.corps.texteIA, phrases: sortie.route.club.corps.phrases };
  fs.writeFileSync(FICHIER, '{ "version": 1, "equi');
  sortie.route.illisible = await requete(app, 'GET', `/api/match-ai-analysis/dossiers?club=${P.C.club}`);
  fs.writeFileSync(FICHIER, sain);
}

if (phase === 'homonymes') {
  const D = await imp('data/aiDossiers.js');
  const ids = (home, away, league, extra = {}) => {
    const r = D.identifiantsPourLaMemoire({ home, away, league, database: db, ...extra });
    return [r.home.id, r.away.id, r.home.raison, r.away.raison];
  };
  const { teamNamesLikelyMatch } = await imp('utils/teamNameMatch.js');
  sortie.cas = {
    nacionalParaguay: ids('Nacional', 'Sportivo Ameliano', 'División Profesional - Paraguay'),
    nacionalPortugal: ids('Nacional', 'FC Porto', 'Primeira Liga - Portugal'),
    nacionalSansLigue: ids('Nacional', 'Sportivo Ameliano', null),
    porto: ids('Porto', 'Sporting CP', 'Primeira Liga - Portugal'),
    portsmouth: ids('Portsmouth', 'West Ham United', 'Championship'),
    portChine: ids('Shanghai Port', 'Beijing Guoan', 'Super League - China'),
    leeds: ids('Leeds United', 'Manchester United', 'EPL'),
    contradiction: ids('FC Porto', 'Sporting CP', 'Primeira Liga - Portugal', { compo: { home: { teamId: 'fotmob-8462' }, away: { teamId: 'fotmob-9768' } } }),
    memeClub: ids('FC Porto', 'Porto', 'Primeira Liga - Portugal')
  };
  // Le rapprocheur de noms souple, lui, confond (la preuve que le piège est réel dans cette base).
  sortie.souple = { leedsDc: teamNamesLikelyMatch('Leeds United', 'DC United'), portPorto: teamNamesLikelyMatch('Port', 'Porto') };
  // Les dossiers par identifiant : un dossier écrit pour chaque « Nacional », chacun le sien.
  const P = planter();
  await D.calculerEtEcrireLesDossiers({ database: db });
  const f = lireFichier();
  const nacionaux = ['fotmob-49689', 'fotmob-10214'].map((id) => ({ id, nom: f.equipes[id]?.nom ?? null, league: f.equipes[id]?.league ?? null, adversaires: (f.equipes[id]?.forme?.derniers ?? []).map((m) => m.adversaireId) }));
  sortie.nacionaux = nacionaux;
  const m = D.memoireDuMatch({ home: 'Nacional', away: 'Sportivo Ameliano', league: 'División Profesional - Paraguay', database: db });
  sortie.memoireParaguay = { home: m?.equipes.home, texte: m?.texte ?? null };
  sortie.plantes = { C: P.C.club };
}

if (phase === 'fiche') {
  const P = planter();
  installerFauxFetch({ listes: Object.fromEntries(['20261006', '20261007', '20261008'].map((j) => [j, listeDuJour([])])) });
  const service = await imp('core/ai/matchAiAnalysisService.js');
  const D = await imp('data/aiDossiers.js');
  const M = await imp('core/ai/aiMemory.js');
  const nom = (id) => db.prepare('SELECT name, league FROM teams WHERE team_id = ?').get(id);
  const C = nom(P.C.club);
  const adv = P.C.matchs[0].homeId === P.C.club ? P.C.matchs[0].awayId : P.C.matchs[0].homeId;
  const A = nom(adv);
  const league = P.C.matchs[0].league;
  const NOTE = 'NOTE-DE-PIERRE-7Q : le vestiaire est en crise.';
  ecrireRuntime('match-notes.json', [{ matchId: 'essai-fiche', homeName: C.name, awayName: A.name, league, text: NOTE, createdAt: '2026-10-04T18:00:00.000Z', updatedAt: '2026-10-04T18:00:00.000Z' }]);
  const p = (marketId, params, market, predictedOutcome, predictedLabel, predictedOdds) => ({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds, minOdds: 1.2 });
  const engineResult = {
    label: `${C.name} vs ${A.name}`,
    commenceTime: '2026-10-07T19:00:00.000Z',
    expectedGoals: { home: 1.4, away: 1.2, source: 'fotmob' },
    trueOdds: { home: 2.4, draw: 3.4, away: 3.0 },
    market: { odds1: 2.5, oddsDraw: 3.3, odds2: 2.9 },
    edgePercent: 1.2,
    staking: { action: 'PASS', stake: null, reason: 'pas_de_value', candidates: [], limits: { edgeThresholdMin: 0.02 } },
    statExpectations: null,
    marketPredictions: [p('result', { outcome: 'home' }, 'Résultat', 'home', `${C.name} gagne`, 2.4), p('totalCorners', { line: 9.5, side: 'over' }, 'Total corners', 'over', 'Plus de 9.5 corners', 1.6)]
  };
  const preparer = async () => {
    const d = await service.preparerAnalyseAvantMatch({ matchId: 'essai-fiche', home: C.name, away: A.name, league, engineResult, sansRepliPayant: true });
    return { user: d.userMessage, system: d.system, memoire: d.memoire, engineSummary: d.engineSummary };
  };
  // 1. Sans dossiers (le fichier n'existe pas) : la fiche d'avant, avec les trois dernières leçons de chaque type.
  sortie.sans = await preparer();
  // 2. Avec les dossiers de la nuit.
  await D.calculerEtEcrireLesDossiers({ database: db });
  sortie.avec = await preparer();
  sortie.memoireDirecte = D.memoireDuMatch({ matchId: 'essai-fiche', home: C.name, away: A.name, league, database: db });
  sortie.club = { C: P.C.club, adv, nomC: C.name, nomA: A.name, league };
  sortie.note = NOTE;
  sortie.fichierDossiers = fs.readFileSync(FICHIER, 'utf8');
  // 3. L'analyse ENREGISTRÉE, Claude simulé : le message reçu par « Claude », la mémoire gardée avec l'analyse.
  const { installerClaudeSimule } = await import('./claudeSimule.mjs');
  const simule = await installerClaudeSimule(serveur, { tokens: () => 12_000 });
  const cc = simule.cc;
  const recus = [];
  cc.__testing.simulerClaude(async ({ userMessage }) => {
    recus.push(userMessage);
    const lecon = /\[(\d{2}\/\d{2}), ([^\]]+?), Total corners/.exec(userMessage);
    return {
      is_error: false,
      structured_output: {
        summary: lecon ? `Je m’appuie sur la leçon du ${lecon[1]} (${lecon[2]}) : le moteur surestime les corners de ce club.` : 'Aucune leçon.',
        keyFactors: [],
        marketViews: [{ market: 'Total corners', pick: 'Plus de 9.5 corners', verdict: 'contredit', confidence: 'moyenne', explanation: 'essai', reasoning: 'leçon confirmée par le carnet' }],
        caveats: 'simulée'
      },
      usage: { input_tokens: 2, cache_creation_input_tokens: 7000, cache_read_input_tokens: 3000, output_tokens: 1998 },
      total_cost_usd: 0.01
    };
  });
  await service.runPreMatchAnalysis({ matchId: 'essai-fiche', home: C.name, away: A.name, league, engineResult, sansRepliPayant: true, appel: { type: 'manuel' } });
  simule.arreter();
  const enregistree = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'match-ai-analyses.json'), 'utf8')).find((e) => e.matchId === 'essai-fiche');
  sortie.simule = { recus: recus.length, message: recus[0] ?? null, memoire: enregistree?.memoire ?? null, resume: enregistree?.analysis?.summary ?? null, engineSnapshot: enregistree?.engineSnapshot ?? null };
  sortie.motsOutil = { lecons: M.compterMots('Leçon : [a] « b » — c.'), ponctuation: M.compterMots('· — | : 300 %') };
}

if (phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const R = await imp('data/repositories/aiDossiersRepository.js');
  const D = await imp('data/aiDossiers.js');
  const P = planter();
  const lire = async (club) => (await requete(app, 'GET', `/api/match-ai-analysis/dossiers?club=${club}`)).corps;
  sortie.reponses = { jamais: await lire(P.C.club) };
  await D.calculerEtEcrireLesDossiers({ database: db });
  R.__testing.oublier();
  sortie.reponses.pret = await lire(P.C.club);
  sortie.reponses.dementie = await lire(P.D.club);
  sortie.reponses.sansDossier = await lire('fotmob-1');
  const brut = lireFichier();
  ecrireRuntime('ai-dossiers.json', { ...brut, version: 99 });
  R.__testing.oublier();
  sortie.reponses.autreVersion = await lire(P.C.club);
  ecrireRuntime('ai-dossiers.json', '{ "version": 1, "equi');
  R.__testing.oublier();
  const illisible = await requete(app, 'GET', `/api/match-ai-analysis/dossiers?club=${P.C.club}`);
  sortie.reponses.illisible = illisible.corps;
  sortie.reponses.codeIllisible = illisible.code;
  sortie.plantes = { C: P.C.club, D: P.D.club };
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
