/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-mise.mjs <serveur de la copie> <phase> [options JSON]
 *
 * ÉTAPE 39 « La mise juste » (lot 1a) — fait répondre le VRAI serveur (routes Express appelées sans réseau, base d'essai
 * copiée, heure figée, data/runtime de la copie) ; ce script ne vérifie rien, il rend une ligne JSON :
 *   - phase « capital » : GET / PUT / DELETE /api/config/capital (idempotence, refus d'un mot de passe, d'un numéro de
 *     compte, d'un champ inconnu, d'une date future), le fichier capital.json écrit (sans fichier temporaire laissé),
 *     garde-fous.json lu avant / après (sha1) ;
 *   - phase « analyse » : un faux relevé The Odds API (comme script-page-match.mjs : Man City – Liverpool, William Hill
 *     au-dessus de Pinnacle = la value ; Betclic, un livre français) ; la liste des matchs et l'analyse du match, la
 *     requête portant TOUJOURS bankroll=10000, sans capital puis avec 2 000 € réglés ; le Repérage et les Opportunités ;
 *     puis un pari EN ATTENTE de 50 € sur ce match (la règle à blanc : la place est prise) ;
 *   - phase « mutation » : le résultat du moteur de ce match, GELÉ en profondeur (Object.freeze), passé au résumé gardé
 *     (matchAiAnalysisService : curateEngineSummary, avecLaVersion, pourIA) et aux fiches de l'IA (compactContext :
 *     ficheAvantMatch, ficheApresMatch) — une écriture lèverait ; le JSON d'avant / d'après est rendu.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase, brut] = process.argv.slice(2);
const options = JSON.parse(brut ?? '{}');
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const iso = (t) => new Date(t).toISOString();
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : null);
const runtime = path.join(serveur, 'data', 'runtime');

/** L'application Express, appelée sans réseau : une requête fabriquée, la réponse captée (patron de script-page-match.mjs). */
async function application() {
  const { createApp } = await imp('app.js');
  const app = createApp();
  return (methode, url, corps) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
      if (corps !== undefined) {
        req._body = true;
        req.body = corps;
      }
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        const texte = Buffer.concat(morceaux).toString('utf8');
        let rendu = null;
        try {
          rendu = JSON.parse(texte);
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu, texte });
        return res;
      };
      app.handle(req, res, reject);
    });
}

const sortie = { ok: true, phase, instant: iso(T0) };

if (phase === 'capital') {
  const fichierGardeFous = path.join(runtime, 'garde-fous.json');
  fs.writeFileSync(fichierGardeFous, JSON.stringify({ miseMaxParPari: 25, perteMaxParSemaine: null, majLe: '2026-10-01T10:00:00.000Z' }, null, 2));
  sortie.gardeFousAvant = sha1(fichierGardeFous);
  const appel = await application();
  const fichier = path.join(runtime, 'capital.json');
  sortie.etapes = [];
  const noter = async (nom, methode, corps) => {
    const r = await appel(methode, '/api/config/capital', corps);
    sortie.etapes.push({ nom, code: r.code, corps: r.corps, fichier: fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : null, sha1: sha1(fichier) });
  };
  await noter('lecture-vide', 'GET');
  await noter('put-montant', 'PUT', { montant: 2000 });
  await noter('put-meme', 'PUT', { montant: 2000 });
  await noter('put-suit-non', 'PUT', { suitLeCarnet: false });
  await noter('put-plancher', 'PUT', { plancher: 150 });
  await noter('put-plancher-vide', 'PUT', { plancher: null });
  await noter('refus-mot-de-passe', 'PUT', { montant: 1000, motDePasse: 'x' });
  await noter('refus-numero-de-compte', 'PUT', { montant: 1000, numeroDeCompte: 'FR76' });
  await noter('refus-inconnu', 'PUT', { montant: 1000, devise: 'USD' });
  await noter('refus-date-future', 'PUT', { montant: 1000, le: '2099-01-01' });
  await noter('refus-montant', 'PUT', { montant: '1000' });
  await noter('refus-vide', 'PUT', {});
  await noter('retrait', 'DELETE');
  await noter('retrait-meme', 'DELETE');
  await noter('lecture-apres', 'GET');
  sortie.temporaires = fs.readdirSync(runtime).filter((f) => f.endsWith('.tmp'));
  sortie.gardeFousApres = sha1(fichierGardeFous);
  sortie.fichiersRuntime = fs.readdirSync(runtime).sort();
  console.log(JSON.stringify(sortie));
  process.exit(0);
}

// ------------------------------------------------- le faux relevé payant (patron de script-page-match.mjs)
const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const fichierInstantane = getFixturePaths().odds;
if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);
const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const livre = (key, title, home, away, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h(home, away, cotes)] });
const match = (id, home, away, coupDEnvoi, livres) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: coupDEnvoi, home_team: home, away_team: away, bookmakers: livres.map(([key, title, cotes]) => livre(key, title, home, away, cotes)) });
const MATCHS = [
  match('essai-a', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [
    ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
    ['williamhill', 'William Hill', [2.3, 3.4, 3.3]],
    ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]
  ]),
  match('essai-e', 'Fulham', 'Brentford', '2026-10-05T20:00:00Z', [
    ['pinnacle', 'Pinnacle', [1.5, 4.5, 6.5]],
    ['williamhill', 'William Hill', [1.48, 4.4, 7.4]]
  ])
];
fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: MATCHS }]));
fs.utimesSync(fichierInstantane, new Date('2026-10-05T11:50:00.000Z'), new Date('2026-10-05T11:50:00.000Z'));
const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
const { vider } = await imp('data/enregistreurs/file.js');
archiverReleveSiNouveau({ maintenant: T0, database });
await vider({ maintenant: T0, database });

const appel = await application();
const analyse = async () => (await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000&includeCorners=false')).corps;

if (phase === 'analyse') {
  const { partDeMise } = await imp('data/mise/regleDeMise.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const c = getEngineConfig('football');
  sortie.reglage = { kellyFraction: c.kellyFraction, maxStakePercent: c.maxStakePercent };

  // 1. Sans capital : la requête porte bankroll=10000, la réponse n'a aucun euro.
  const listeSans = await appel('GET', '/api/matches?source=odds-api&bankroll=10000');
  sortie.listeSans = { code: listeSans.code, capital: listeSans.corps?.capital ?? null, n: listeSans.corps?.matches?.length ?? 0, texte: listeSans.texte };
  sortie.analyseSans = await analyse();
  const fiche = await appel('GET', '/api/matches/essai-a?source=odds-api&bankroll=10000');
  sortie.ficheSans = { code: fiche.code, texte: fiche.texte };

  // 2. Avec 2 000 € réglés : la même requête (bankroll=10000) — le capital vient du serveur.
  const put = await appel('PUT', '/api/config/capital', { montant: 2000 });
  sortie.put = { code: put.code, moment: put.corps?.moment ?? null };
  sortie.analyseAvec = await analyse();
  const listeAvec = await appel('GET', '/api/matches?source=odds-api&bankroll=10000');
  sortie.listeAvec = { code: listeAvec.code, capital: listeAvec.corps?.capital ?? null, texte: listeAvec.texte };
  const s = sortie.analyseAvec?.staking;
  sortie.partAttendue = s?.action === 'RECOMMENDED' ? partDeMise({ ev: s.ev, cote: s.odds, reglageMoteur: sortie.reglage }) : null;

  // 3. Le Repérage et les Opportunités (le calcul tourne en arrière-plan : attendu jusqu'à 60 s).
  let reperage = null;
  for (let i = 0; i < 240; i++) {
    reperage = (await appel('GET', '/api/screener')).corps;
    if (reperage?.status === 'ready' && reperage?.data?.matches) break;
    await new Promise((fin) => setTimeout(fin, 250));
  }
  sortie.reperage = reperage;
  sortie.opportunites = (await appel('GET', '/api/opportunities')).corps;
  sortie.vertes = (await appel('GET', '/api/opportunities/vertes')).corps;

  // 4. Sans capital, le Repérage et les Opportunités.
  await appel('DELETE', '/api/config/capital');
  sortie.reperageSans = (await appel('GET', '/api/screener')).corps;
  sortie.opportunitesSans = (await appel('GET', '/api/opportunities')).corps;

  // 5. Un pari EN ATTENTE de 50 € sur ce match, capital 1 000 € : la règle à blanc (la place est prise), le conseil inchangé.
  await appel('PUT', '/api/config/capital', { montant: 1000 });
  const pari = { id: 'essai-attente', createdAt: iso(T0 - 3_600_000), settledAt: null, status: 'pending', stake: 50, odds: 2.3, legs: [{ matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market: 'Résultat', pick: 'Man City', odds: 2.3, status: 'pending' }] };
  fs.writeFileSync(path.join(runtime, 'bets.json'), JSON.stringify([pari]));
  sortie.analyseAttente = await analyse();
  console.log(JSON.stringify(sortie));
  process.exit(0);
}

if (phase === 'mutation') {
  const { findAdaptedMatch } = await imp('data/matchSources.js');
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  const S = await imp('core/ai/matchAiAnalysisService.js');
  const C = await imp('core/ai/compactContext.js');
  const adapte = findAdaptedMatch('odds-api', 'essai-a', 10000);
  const enrichi = await enrichMatchWithRealAverages(adapte, { sansRepliPayant: true });
  const engineResult = await analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
  const gelerEnProfondeur = (v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const x of Object.values(v)) gelerEnProfondeur(x);
    }
    return v;
  };
  const avant = JSON.stringify(engineResult);
  gelerEnProfondeur(engineResult);
  sortie.action = engineResult.staking?.action ?? null;
  sortie.erreurs = [];
  const essayer = (nom, f) => {
    try {
      return f();
    } catch (error) {
      sortie.erreurs.push(`${nom} : ${error.message}`);
      return null;
    }
  };
  const resume = essayer('curateEngineSummary', () => S.__testing.curateEngineSummary(engineResult));
  const garde = essayer('avecLaVersion', () => S.__testing.avecLaVersion(resume, engineResult));
  const pourIA = essayer('pourIA', () => S.__testing.pourIA(garde));
  const ficheAvant = essayer('ficheAvantMatch', () => C.ficheAvantMatch({ home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: engineResult.commenceTime, timing: 'avance', engineSummary: pourIA }));
  const ficheApres = essayer('ficheApresMatch', () =>
    C.ficheApresMatch({ home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: engineResult.commenceTime, timing: 'avance', analysedAt: iso(T0), priorAnalysis: { marketViews: [] }, engineSummary: pourIA, result: { homeGoals: 2, awayGoals: 1 }, marketOutcomes: [] })
  );
  sortie.identique = JSON.stringify(engineResult) === avant;
  sortie.gele = Object.isFrozen(engineResult) && Object.isFrozen(engineResult.staking ?? {});
  const texte = (x) => (typeof x === 'string' ? x : JSON.stringify(x?.messages ?? x ?? null));
  sortie.ficheAvant = texte(ficheAvant);
  sortie.ficheApres = texte(ficheApres);
  sortie.stake = engineResult.staking?.stake ?? null;
  console.log(JSON.stringify(sortie));
  process.exit(0);
}

throw new Error(`Phase inconnue : ${phase}`);
