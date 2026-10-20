/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-suivi.mjs <serveur de la copie> <phase>
 *
 * Étape 11 du plan — le suivi des paris, les garde-fous, les fiches de comptes.
 * Ce script ne vérifie rien : il fait produire au VRAI serveur (routes Express
 * appelées sans réseau, moteur, base d'essai copiée, heure figée) ce que le test
 * lit. Le carnet (bets.json de la copie) est FABRIQUÉ par le test ; un relevé
 * The Odds API FABRIQUÉ (Man City – Liverpool, Pinnacle et William Hill) donne
 * au moteur une value chez William Hill, donc un conseil de mise.
 *   - phase « principale » (lundi 05/10/2026, 12 h UTC) : sans garde-fou, puis
 *     mise maximale, perte maximale (reste, atteinte), fiche d'un compte, « J'ai
 *     parié » au-delà de tout, le suivi, les refus (secrets, champs inconnus) ;
 *   - phase « lundi » (le lundi suivant, même copie) : la semaine a tourné ;
 *   - phase « illisible » (une autre copie, réglage des garde-fous illisible dès
 *     le démarrage) : prudence du coupe-circuit, « J'ai parié » enregistre quand même.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const runtime = path.join(serveur, 'data', 'runtime');
const fichier = (nom) => path.join(runtime, nom);
const lire = (nom) => (fs.existsSync(fichier(nom)) ? fs.readFileSync(fichier(nom), 'utf8') : null);
const mtime = (nom) => (fs.existsSync(fichier(nom)) ? fs.statSync(fichier(nom)).mtimeMs : null);

/** L'application Express, appelée sans réseau : une requête fabriquée, la réponse captée. */
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
        let rendu = null;
        try {
          rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
}

/** Le relevé The Odds API de 11 h 50 (fabriqué), archivé comme le font les Enregistreurs. */
async function releve() {
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const instantane = getFixturePaths().odds;
  if (!path.resolve(instantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${instantane}`);
  const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
  const livre = (key, title, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h('Man City', 'Liverpool', cotes)] });
  const data = [
    {
      id: 'essai-a',
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      commence_time: '2026-10-05T18:30:00Z',
      home_team: 'Man City',
      away_team: 'Liverpool',
      bookmakers: [livre('pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]), livre('williamhill', 'William Hill', [2.3, 3.4, 3.3])]
    }
  ];
  fs.mkdirSync(path.dirname(instantane), { recursive: true });
  fs.writeFileSync(instantane, JSON.stringify([{ data }]));
  const t = new Date('2026-10-05T11:50:00.000Z');
  fs.utimesSync(instantane, t, t);
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });
}

/** Ce qu'on garde d'une analyse : la décision de pari, les verdicts, le conseil du comparateur. */
const ANALYSE = '/api/analysis/match/essai-a?source=odds-api&bankroll=10000&includeCorners=false';
const decision = (r) => ({
  code: r.code,
  staking: r.corps?.staking ?? null,
  verdicts: r.corps?.verdicts ?? null,
  conseil: r.corps?.comparateur?.issues?.find((i) => i.conseil)?.conseil ?? null,
  cellules: (r.corps?.comparateur?.livres ?? []).map((l) => ({ cle: l.cle, etats: Object.fromEntries(Object.entries(l.cellules).map(([k, c]) => [k, { etat: c.etat, raison: c.raison, mise: c.mise }])) }))
});
const pari = (extra = {}) => ({
  stake: 100,
  legs: [
    {
      matchId: 'essai-a',
      homeName: 'Man City',
      awayName: 'Liverpool',
      league: 'EPL',
      commenceTime: '2026-10-05T18:30:00Z',
      market: 'Résultat',
      marketId: 'result',
      params: { outcome: 'home' },
      pick: 'Man City gagne',
      odds: 2.3,
      bookmaker: 'williamhill',
      bookmakerTitle: 'William Hill',
      probabiliteMoteur: 0.489,
      coteSource: 'au-pari',
      coteReleveeA: '2026-10-05T12:00:00.000Z'
    }
  ],
  origine: 'page-du-match',
  ...extra
});

const sortie = { ok: true, phase, instant: new Date(T0).toISOString() };

if (phase === 'principale') {
  await releve();
  const appel = await application();
  // 1. Sans aucun garde-fou (le réglage par défaut) : la décision d'avant, telle quelle.
  sortie.sans = { tilt: (await appel('GET', '/api/config/tilt')).corps, gardeFous: (await appel('GET', '/api/config/garde-fous')).corps, analyse: decision(await appel('GET', ANALYSE)) };
  sortie.fichierAvant = lire('garde-fous.json');
  // 2. La mise maximale par pari : 25 €.
  sortie.mise = { put: await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: 25 }), analyse: decision(await appel('GET', ANALYSE)) };
  sortie.mise.fichier = lire('garde-fous.json');
  // 3. Le même réglage renvoyé : rien d'écrit.
  const avant = mtime('garde-fous.json');
  sortie.idempotent = { put: await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: 25 }), avant, apres: mtime('garde-fous.json') };
  // 4. Une perte maximale de 100 € (60 € perdus cette semaine, 5 € en attente : il reste 35 €), puis sans mise maximale.
  sortie.reste = { put: await appel('PUT', '/api/config/garde-fous', { perteMaxParSemaine: 100 }), analyse: decision(await appel('GET', ANALYSE)) };
  sortie.resteSeul = { put: await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: null }), analyse: decision(await appel('GET', ANALYSE)) };
  // 5. La perte maximale ramenée à 50 € : atteinte (60 € perdus) — le coupe-circuit s'enclenche de lui-même.
  sortie.atteinte = {
    put: await appel('PUT', '/api/config/garde-fous', { perteMaxParSemaine: 50, miseMaxParPari: 25 }),
    tilt: (await appel('GET', '/api/config/tilt')).corps,
    analyse: decision(await appel('GET', ANALYSE)),
    refresh: (await appel('GET', '/api/refresh')).corps?.gardeFous ?? null
  };
  // 6. L'interrupteur manuel reste indépendant : le couper ne relâche pas un garde-fou.
  sortie.manuelCoupe = (await appel('PUT', '/api/config/tilt', { circuitBreakerActive: false })).corps;
  // 7. La fiche du compte William Hill : solde 40 €, mise acceptée 30 €, compte fermé.
  sortie.fiche = await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 40, miseMaxAcceptee: 30, limitation: 'ferme' });
  sortie.ficheFichier = lire('comptes-bookmakers.json');
  const avantFiche = mtime('comptes-bookmakers.json');
  sortie.ficheIdempotente = { put: await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 40, miseMaxAcceptee: 30, limitation: 'ferme' }), avant: avantFiche, apres: mtime('comptes-bookmakers.json') };
  // 8. « J'ai parié » à 100 € chez William Hill : au-delà de tout — enregistré quand même, avec ses alertes.
  const carnetAvant = JSON.parse(lire('bets.json'));
  sortie.jaiParie = await appel('POST', '/api/bets', pari());
  sortie.carnetAvant = carnetAvant;
  sortie.carnetApres = JSON.parse(lire('bets.json'));
  sortie.liste = (await appel('GET', '/api/bets')).corps;
  // 9. Le suivi ; la route de la valeur de clôture, elle, ne rend pas toutes les mesures (propriété réservée au suivi).
  sortie.suivi = await appel('GET', '/api/bets/suivi');
  sortie.clotureRoute = await appel('GET', '/api/odds/closing-value?scope=bets');
  // 10. Les refus : secrets, champs inconnus, bookmaker inconnu, réglages mal formés — rien d'écrit.
  const avantRefus = { fiche: lire('comptes-bookmakers.json'), gf: lire('garde-fous.json') };
  sortie.refus = {
    motDePasse: await appel('PUT', '/api/bookmaker-accounts/williamhill', { motDePasse: 'secret-123' }),
    identifiant: await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 10, identifiant: 'pierre.c' }),
    password: await appel('PUT', '/api/bookmaker-accounts/williamhill', { password: 'hunter2' }),
    noteLibre: await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 10, note: 'mon code 1234' }),
    limitationInconnue: await appel('PUT', '/api/bookmaker-accounts/williamhill', { limitation: 'suspendu' }),
    soldeNegatif: await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: -3 }),
    bookmakerInconnu: await appel('PUT', '/api/bookmaker-accounts/bet365', { soldeDeclare: 10 }),
    gfTexte: await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: '20' }),
    gfNegatif: await appel('PUT', '/api/config/garde-fous', { perteMaxParSemaine: -5 }),
    gfZero: await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: 0 }),
    gfInconnu: await appel('PUT', '/api/config/garde-fous', { capital: 1000 }),
    gfVide: await appel('PUT', '/api/config/garde-fous', {})
  };
  sortie.apresRefus = { fiche: lire('comptes-bookmakers.json'), gf: lire('garde-fous.json'), avant: avantRefus };
  // 11. Un champ inconnu ajouté à la main au fichier des fiches : jamais rendu, effacé à la prochaine écriture.
  const brut = JSON.parse(lire('comptes-bookmakers.json'));
  brut.comptes.williamhill.password = 'hunter2';
  fs.writeFileSync(fichier('comptes-bookmakers.json'), JSON.stringify(brut));
  sortie.mainLue = await appel('GET', '/api/bookmaker-accounts');
  sortie.mainReecrite = await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 40, miseMaxAcceptee: 30, limitation: 'ferme' });
  sortie.mainFichier = lire('comptes-bookmakers.json');
  // 12. Une fiche vidée est retirée.
  sortie.ficheVide = { put: await appel('PUT', '/api/bookmaker-accounts/unibet_nl', { soldeDeclare: 12 }), retrait: await appel('PUT', '/api/bookmaker-accounts/unibet_nl', { soldeDeclare: null, miseMaxAcceptee: null, limitation: 'aucune' }) };
  sortie.ficheVide.fichier = lire('comptes-bookmakers.json');
  // 13. Les fiches illisibles : jamais prises pour vides, jamais écrasées.
  fs.writeFileSync(fichier('comptes-bookmakers.json'), '{ "comptes": { "williamhill": ');
  sortie.fichesIllisibles = { get: await appel('GET', '/api/bookmaker-accounts'), put: await appel('PUT', '/api/bookmaker-accounts/williamhill', { soldeDeclare: 1 }), fichier: lire('comptes-bookmakers.json'), pari: await appel('POST', '/api/bets', pari({ stake: 2 })) };
} else if (phase === 'lundi') {
  const appel = await application();
  sortie.tilt = (await appel('GET', '/api/config/tilt')).corps;
  sortie.gardeFous = (await appel('GET', '/api/config/garde-fous')).corps;
  sortie.plusHaut = (await appel('PUT', '/api/config/garde-fous', { perteMaxParSemaine: 500 })).corps;
  sortie.tiltApres = (await appel('GET', '/api/config/tilt')).corps;
} else if (phase === 'illisible') {
  const appel = await application();
  sortie.tilt = (await appel('GET', '/api/config/tilt')).corps;
  sortie.gardeFous = await appel('GET', '/api/config/garde-fous');
  sortie.put = await appel('PUT', '/api/config/garde-fous', { miseMaxParPari: 10 });
  sortie.fichier = lire('garde-fous.json');
  sortie.pari = await appel('POST', '/api/bets', pari({ stake: 3 }));
  sortie.carnet = JSON.parse(lire('bets.json'));
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
