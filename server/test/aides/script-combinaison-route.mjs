/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-combinaison-route.mjs <serveur de la copie> <phase> <options JSON>
 *
 * « AVANT DE PARIER — À BLANC » PAR LA VRAIE ROUTE (étape 38, lot 1b, 04/11/2026) : l'application Express de la copie, appelée
 * sans réseau (patron de script-mise.mjs), sur un faux relevé payant (Pinnacle, Betclic avec une value, Unibet) et la base
 * d'échantillon de la copie.
 *   phase « page »  : GET /api/analysis/match/essai-fr — la réponse porte le bloc `combinaison` APRÈS l'analyse et la mise
 *                     de l'étape 39 ; les appels faits par la route comptés (aucun réseau) ;
 *   phase « casse » : data/combinaison/ CASSÉ dans la copie (les modules lèvent au chargement) AVANT tout import : l'application
 *                     et l'actualisation se chargent quand même, la route répond (l'encadré dit « illisible »), l'étape de nuit
 *                     est en échec sans lever (T-X11).
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
const sortie = { ok: true, phase };

if (phase === 'casse') {
  // Le dossier de la 38 lève au chargement : aucun fichier qui se charge au démarrage ne doit en dépendre.
  for (const f of ['combinaisonNuit.js', 'combinaisonRead.js', 'nuitDeLaCombinaison.js']) {
    fs.writeFileSync(path.join(serveur, 'src', 'data', 'combinaison', f), "throw new Error('dossier de la combinaison cassé (essai)');\n");
  }
}

/** L'application Express, appelée sans réseau : une requête fabriquée, la réponse captée (patron de script-mise.mjs). */
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
        resolve({ code: res.statusCode, corps: rendu, texte });
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
fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
fs.writeFileSync(
  fichierInstantane,
  JSON.stringify([
    {
      data: [
        match('essai-fr', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [
          ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
          ['betclic_fr', 'Betclic', [2.25, 3.3, 3.5]],
          ['unibet_fr', 'Unibet', [1.95, 3.3, 3.6]]
        ])
      ]
    }
  ])
);
fs.utimesSync(fichierInstantane, new Date('2026-10-05T11:50:00.000Z'), new Date('2026-10-05T11:50:00.000Z'));
const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
const { vider } = await imp('data/enregistreurs/file.js');
archiverReleveSiNouveau({ maintenant: T0, database });
await vider({ maintenant: T0, database });

const appel = await application();
const r = await appel('GET', '/api/analysis/match/essai-fr?source=odds-api&includeCorners=false');
sortie.code = r.code;
sortie.combinaison = r.corps?.combinaison ?? null;
sortie.mise = r.corps?.mise ?? null;
sortie.staking = r.corps?.staking ? { action: r.corps.staking.action, bookmaker: r.corps.staking.bookmaker ?? null, bookmakerTitle: r.corps.staking.bookmakerTitle ?? null, reason: r.corps.staking.reason ?? null } : null;
sortie.cles = r.corps ? Object.keys(r.corps) : [];
sortie.prediction = r.corps?.prediction ? { home: r.corps.prediction.probabilities?.home ?? null } : null;
sortie.result = r.corps ? { mise: r.corps.mise ?? null, staking: sortie.staking } : null;

if (phase === 'casse') {
  const J = await imp('jobs/matchStatsAutoRefresh.js');
  sortie.etape = await J.__combinaisonPourLesTests.passeCombinaisonABlanc({}, { lireLeControle: async () => ({ etat: 'absent' }) });
  sortie.etapesChargees = J.__testing.ETAPES().map((e) => e.key).slice(-3);
}
console.log(JSON.stringify(sortie));
process.exit(0);
