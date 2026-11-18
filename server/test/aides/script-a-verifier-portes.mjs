/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-a-verifier-portes.mjs <serveur de la copie>
 *
 * Étape 38, LOT 2a (16/11/2026) — AUCUN CONSEIL SUR UN MATCH « À VÉRIFIER », PAR LES VRAIES PORTES. Le VRAI serveur (routes
 * Express appelées sans réseau, base d'essai copiée, heure figée, data/runtime de la copie) et un faux relevé The Odds API
 * (le patron de script-mise.mjs : Man City – Liverpool, William Hill au-dessus de Pinnacle = la value). Puis l'état du
 * contrôle quotidien de la copie est FABRIQUÉ (data/runtime/controle-quotidien.json) et relu par le serveur lui-même — rien
 * n'est injecté dans le code :
 *   1. aucun contrôle : le conseil d'avant, partout ;
 *   2. un score douteux sur une rencontre récente de Man City (famille « tout ») : plus de conseil — la page du match
 *      (/api/analysis), le Repérage (/api/screener), les Opportunités (/api/opportunities, /vertes), le gel de la nuit ;
 *   3. des corners douteux seulement (familles « corners », « tirs ») : le bandeau du match reste, le conseil revient ;
 *   4. le magasin pas à jour (raison générale) : plus de conseil ;
 *   5. le contrôle retiré : le conseil d'avant.
 * Depuis le 17/11/2026 (corrections après la vérification des lots d'argent) : un second match, « Brighton and Hove Albion »
 * (l'annuaire dit « Brighton & Hove Albion »), lu par la page dans chaque état ; et son gel de la nuit pendant que ses
 * corners sont douteux (chaque ligne par la famille de son marché).
 * Ce script ne vérifie rien ; il rend une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const runtime = path.join(serveur, 'data', 'runtime');

/** L'application Express, appelée sans réseau (patron de script-mise.mjs). */
async function application() {
  const { createApp } = await imp('app.js');
  const app = createApp();
  return (methode, url) =>
    new Promise((resolve, reject) => {
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
        const texte = Buffer.concat(morceaux).toString('utf8');
        let rendu = null;
        try {
          rendu = JSON.parse(texte);
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
}

// ------------------------------------------------- le faux relevé payant (patron de script-mise.mjs)
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
  // Correction du 17/11/2026 (« à vérifier » C1) : un club écrit par The Odds API AUTREMENT que dans l'annuaire (FotMob :
  // « Brighton & Hove Albion ») — la page du match doit le reconnaître comme le Repérage (clubDuMagasin).
  match('essai-b', 'Brighton and Hove Albion', 'Everton', '2026-10-05T18:30:00Z', [
    ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
    ['williamhill', 'William Hill', [2.3, 3.4, 3.3]],
    ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]
  ])
];
fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: MATCHS }]));
fs.utimesSync(fichierInstantane, new Date('2026-10-05T11:50:00.000Z'), new Date('2026-10-05T11:50:00.000Z'));
const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
const { vider } = await imp('data/enregistreurs/file.js');
archiverReleveSiNouveau({ maintenant: T0, database });
await vider({ maintenant: T0, database });

const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
const manCity = clubDuMagasin('Man City', 'EPL', database);
const liverpool = clubDuMagasin('Liverpool', 'EPL', database);
const brighton = clubDuMagasin('Brighton and Hove Albion', 'EPL', database);

// ------------------------------------------------- l'état fabriqué du contrôle quotidien de la copie
const FICHIER_CONTROLE = path.join(runtime, 'controle-quotidien.json');
let tour = 0;
function poserLeControle(aVerifier) {
  if (aVerifier === null) {
    fs.rmSync(FICHIER_CONTROLE, { force: true });
    return;
  }
  fs.writeFileSync(FICHIER_CONTROLE, JSON.stringify({ version: 1, le: '2026-10-05T03:10:00.000Z', dureeMs: 1200, controles: [], vus: {}, aVerifier, historique: [] }));
  // Le serveur garde l'état tant que la date et la taille du fichier ne changent pas : une date différente à chaque pose.
  tour++;
  const t = new Date(Date.parse('2026-10-05T03:10:00.000Z') + tour * 60_000);
  fs.utimesSync(FICHIER_CONTROLE, t, t);
}
const RAISONS = {
  score: { id: 'essai-score', controle: 'score-football-data', texte: 'Man City – Everton du 20/09 (2-1) : score différent chez football-data (fabriqué)', date: '2026-09-20', familles: ['tout'] },
  corners: { id: 'essai-corners', controle: 'chiffres-equipe', texte: 'Statistiques impossibles : Man City – Everton du 20/09 (fabriqué)', date: '2026-09-20', familles: ['corners', 'tirs'] },
  magasin: { id: 'essai-magasin', controle: 'magasin-a-jour', texte: 'Le magasin n’est pas à jour (fabriqué)', date: null, familles: ['tout'] }
};
const RAISONS_BRIGHTON = {
  score: { id: 'essai-score-b', controle: 'score-football-data', texte: 'Brighton & Hove Albion – Everton du 20/09 (1-1) : score différent chez football-data (fabriqué)', date: '2026-09-20', familles: ['tout'] },
  corners: { id: 'essai-corners-b', controle: 'chiffres-equipe', texte: 'Statistiques impossibles : Brighton & Hove Albion – Everton du 20/09 (fabriqué)', date: '2026-09-20', familles: ['corners', 'tirs'] }
};
const ETATS = {
  sansControle: null,
  scoreDouteux: { clubs: { [manCity]: [RAISONS.score], [brighton]: [RAISONS_BRIGHTON.score] }, ligues: {}, global: [] },
  cornersDouteux: { clubs: { [manCity]: [RAISONS.corners], [brighton]: [RAISONS_BRIGHTON.corners] }, ligues: {}, global: [] },
  magasinPasAJour: { clubs: {}, ligues: {}, global: [RAISONS.magasin] },
  controleRetire: null
};

const appel = await application();
const gel = await imp('data/enregistreurs/gelPronostics.js');
const { findAdaptedMatch } = await imp('data/matchSources.js');

/** Le Repérage, attendu jusqu'à 60 s la première fois (le calcul tourne en arrière-plan) ; ensuite l'état préparé est relu. */
async function reperage() {
  let r = null;
  for (let i = 0; i < 240; i++) {
    r = (await appel('GET', '/api/screener')).corps;
    if (r?.status === 'ready' && r?.data?.matches) break;
    await new Promise((fin) => setTimeout(fin, 250));
  }
  const m = (r?.data?.matches ?? []).find((x) => x.matchId === 'essai-a') ?? null;
  return m ? { action: m.pari?.action ?? null, raison: m.pari?.raison ?? null, conseil: Boolean(m.pari?.conseil), verts: (m.markets ?? []).filter((k) => k.verdict?.vert).length } : null;
}

/** Ce que la page d’un match montre du conseil (le même résumé pour les deux matchs). */
const laPage = (a) => ({
  action: a?.staking?.action ?? null,
  raison: a?.staking?.reason ?? null,
  mise: a?.staking?.stake ?? null,
  texteDuRefus: a?.staking?.aVerifier?.texte ?? null,
  conseilRefuse: a?.staking?.conseilRefuse?.outcome ?? null,
  verts: Object.values(a?.verdicts ?? {}).filter((v) => v?.vert).length,
  etatDomicile: a?.verdicts?.home?.etat ?? null,
  raisonDomicile: a?.verdicts?.home?.raison ?? null,
  bandeau: a?.aVerifier ? (a.aVerifier.raisons ?? []).map((r) => r.id) : null,
  probabilites: JSON.stringify({ trueOdds: a?.trueOdds ?? null, prediction: a?.prediction ?? null, expectedGoals: a?.expectedGoals ?? null })
});

const { familleDuMarche } = await imp('data/aVerifierPourLeMoteur.js');
const sortie = { ok: true, manCity, liverpool, brighton, etats: {} };
let instant = T0;
for (const [nom, aVerifier] of Object.entries(ETATS)) {
  poserLeControle(aVerifier);
  const a = (await appel('GET', '/api/analysis/match/essai-a?source=odds-api&includeCorners=false')).corps;
  const b = (await appel('GET', '/api/analysis/match/essai-b?source=odds-api&includeCorners=false')).corps;
  // Le Repérage d'abord (il est attendu la première fois) : les Opportunités lisent son état préparé.
  const leReperage = await reperage();
  const opportunites = (await appel('GET', '/api/opportunities')).corps;
  const vertes = (await appel('GET', '/api/opportunities/vertes')).corps;
  const lignesDuMatch = (opportunites?.lignes ?? opportunites?.data?.lignes ?? []).filter((l) => l.matchId === 'essai-a');
  // Le gel de la nuit, par la vraie fonction et SANS rien lui injecter (elle lit le contrôle de la copie elle-même) — une seule
  // fois, pendant que le score est douteux : une trace n'est écrite qu'avec la ligne du pronostic, jamais après coup.
  let nuit = null;
  let derniere = null;
  if (nom === 'scoreDouteux') {
    instant += 3_600_000;
    nuit = await gel.gelerLaNuit({ maintenant: instant, database, dansLaPasse: true, matchs: [findAdaptedMatch('odds-api', 'essai-a', 1000)] });
    derniere = database.prepare("SELECT classe_seuil AS classe, palier, seuil_applique AS seuil, version FROM engine_picks WHERE home_name = 'Man City' AND market_id = 'result' ORDER BY version DESC LIMIT 1").get();
  }
  // Correction du 17/11/2026 (« à vérifier » C3) : le gel de la nuit d'essai-b pendant que ses CORNERS sont douteux, sans rien
  // lui injecter : chaque ligne est jugée par la famille de SON marché.
  let gelB = null;
  if (nom === 'cornersDouteux') {
    instant += 3_600_000;
    const n = await gel.gelerLaNuit({ maintenant: instant, database, dansLaPasse: true, matchs: [findAdaptedMatch('odds-api', 'essai-b', 1000)] });
    const lignes = database.prepare("SELECT market_id, classe_seuil, palier, seuil_applique FROM engine_picks WHERE home_name = 'Brighton and Hove Albion'").all();
    const classes = (f) => [...new Set(lignes.filter((l) => familleDuMarche(l.market_id) === f).map((l) => l.classe_seuil))].sort();
    gelB = { echecs: n.echecs, calcules: n.calcules, ecrits: n.ecrits, erreur: n.erreur ?? null, lignes: lignes.length, corners: classes('corners'), tirs: classes('tirs'), buts: classes('buts'), resultat: lignes.filter((l) => l.market_id === 'result').map((l) => ({ classe: l.classe_seuil, palier: l.palier, seuil: l.seuil_applique })) };
  }
  sortie.etats[nom] = {
    page: laPage(a),
    brighton: laPage(b),
    reperage: leReperage,
    opportunites: { lignes: lignesDuMatch.length, vertes: lignesDuMatch.filter((l) => l.verdict?.vert).length, etats: [...new Set(lignesDuMatch.filter((l) => l.verdict).map((l) => l.verdict.etat))].sort() },
    vertes: (vertes?.vertes ?? []).filter((l) => l.matchId === 'essai-a').length,
    gel: nuit ? { echecs: nuit.echecs, calcules: nuit.calcules, ecrits: nuit.ecrits, erreur: nuit.erreur ?? null, derniere: derniere ? { ...derniere } : null } : null,
    gelBrighton: gelB
  };
}
console.log(JSON.stringify(sortie));
process.exit(0);
