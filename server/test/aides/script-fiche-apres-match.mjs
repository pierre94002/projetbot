/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiche-apres-match.mjs <serveur de la copie> <phase>
 *
 * Étape 40, lot 1b (17/11/2026) — LA FICHE D'APRÈS-MATCH par la VRAIE route GET /api/match-ai-analysis/fixture (`matchKey`), sur
 * la base d'essai de la copie (jamais la vraie) où ce script FABRIQUE deux rencontres et leurs pronostics gelés, et sur l'analyse
 * réelle Girona - Mallorca de test/fixtures/analyses-etape-45.json écrite dans le data/runtime de la copie. Aucun réseau, aucun
 * appel à Claude, heure figée au 05/10/2026.
 *
 * Phase « route » : la réponse sans `matchKey` (celle d'avant), avec `matchKey` (Girona - Mallorca réglé : 0-0, corners 5 + 6,
 * tirs 12 + 10, tirs cadrés 3 + 2), une rencontre du 16/11 (après le masque des buts : ses pronostics de buts cachés), une clé
 * inconnue ; le nombre d'écritures de la connexion avant et après (aucune).
 * Phase « panne » : le module de la fiche remplacé, DANS LA COPIE, par un module qui lève une erreur : la route répond quand même.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(process.env.CM_TEST_MODULES, 'test', 'fixtures', 'analyses-etape-45.json'), 'utf8'));
const ecrire = (nom, contenu) => {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu));
};

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

export const CLE_GIRONA = 'essai-40b-2026-10-04-girona-mallorca';
export const CLE_APRES_MASQUE = 'essai-40b-2026-11-16-aldora-brevik';

/** Les deux rencontres fabriquées et leurs pronostics gelés (le gel les écrit à la veille au soir, avant le coup d'envoi). */
function fabriquer(database) {
  const c = FIXTURE.complete;
  const home = c.lineupSnapshot.home.teamId;
  const away = c.lineupSnapshot.away.teamId;
  const ajouterMatch = (cle, date, league, hn, an, hid, aid, hg, ag, kickoff, stats) => {
    database.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(cle, cle, date, league, hn, an, hid, aid, hg, ag, JSON.stringify({ kickoff }));
    for (const [side, [corners, tirs, cadres]] of Object.entries(stats)) {
      database.prepare('INSERT INTO team_stats (match_key, side, corner_kicks, total_shots, shots_on_goal) VALUES (?, ?, ?, ?, ?)').run(cle, side, corners, tirs, cadres);
    }
  };
  ajouterMatch(CLE_GIRONA, '2026-10-04', c.league, c.homeName, c.awayName, home, away, 0, 0, '2026-10-04T19:00:00.000Z', { home: [5, 12, 3], away: [6, 10, 2] });
  ajouterMatch(CLE_APRES_MASQUE, '2026-11-16', 'Ligue Fabriquée', 'Aldora', 'Brevik', 'fotmob-990401', 'fotmob-990402', 2, 1, '2026-11-16T15:00:00.000Z', { home: [7, 14, 6], away: [4, 9, 3] });
  const gel = database.prepare(`INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, league, date, kickoff, home_name, away_name, home_id, away_id,
    market_id, market, params, choice, label, probability, engine_version) VALUES (?, ?, 1, ?, 'nuit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5)`);
  for (const m of c.engineSnapshot.marketPredictions) {
    gel.run(`fotmob:${home}|${away}|2026-10-04`, `${m.marketId}|${JSON.stringify(m.params)}`, '2026-10-03T22:00:00.000Z', c.league, '2026-10-04', '2026-10-04T19:00:00.000Z', c.homeName, c.awayName, home, away, m.marketId, m.market, JSON.stringify(m.params), m.predictedOutcome, m.predictedLabel, 0.6);
  }
  for (const [id, market, params, choice, label] of [
    ['result', 'Résultat', { outcome: 'home' }, 'home', 'Aldora gagne'],
    ['totalGoals', 'Total buts', { line: 2.5, side: 'over' }, 'over', 'Plus de 2.5 buts'],
    ['totalCorners', 'Total corners', { line: 9.5, side: 'over' }, 'over', 'Plus de 9.5 corners']
  ]) {
    gel.run('fotmob:fotmob-990401|fotmob-990402|2026-11-16', `${id}|${JSON.stringify(params)}`, '2026-11-15T22:00:00.000Z', 'Ligue Fabriquée', '2026-11-16', '2026-11-16T15:00:00.000Z', 'Aldora', 'Brevik', 'fotmob-990401', 'fotmob-990402', id, market, JSON.stringify(params), choice, label, 0.55);
  }
}

const sortie = { ok: true, phase };
const c = FIXTURE.complete;
const affiche = (cle) => `/api/match-ai-analysis/fixture?home=${encodeURIComponent(c.homeName)}&away=${encodeURIComponent(c.awayName)}&league=${encodeURIComponent(c.league)}&date=2026-10-04${cle ? `&matchKey=${encodeURIComponent(cle)}` : ''}`;

if (phase === 'route') {
  const { openDb } = await imp('data/db/matchStatsDb.js');
  const database = openDb();
  fabriquer(database);
  ecrire('match-ai-analyses.json', [FIXTURE.complete]);
  const { createApp } = await imp('app.js');
  const app = createApp();
  const ecritures = () => database.prepare('SELECT total_changes() AS n').get().n;
  const avant = ecritures();
  sortie.sans = await requete(app, 'GET', affiche(null));
  sortie.avec = await requete(app, 'GET', affiche(CLE_GIRONA));
  sortie.apresMasque = await requete(app, 'GET', `/api/match-ai-analysis/fixture?home=Aldora&away=Brevik&league=${encodeURIComponent('Ligue Fabriquée')}&date=2026-11-16&matchKey=${CLE_APRES_MASQUE}`);
  sortie.inconnue = await requete(app, 'GET', affiche('cle-qui-n-existe-pas'));
  sortie.ecritures = ecritures() - avant;
  sortie.fichiers = fs.readdirSync(RUNTIME).sort();
} else if (phase === 'panne') {
  fs.writeFileSync(path.join(serveur, 'src', 'data', 'fiche', 'ficheApresMatch.js'), "throw new Error('panne simulée du module');\n");
  ecrire('match-ai-analyses.json', [FIXTURE.complete]);
  const { createApp } = await imp('app.js');
  const app = createApp();
  sortie.avec = await requete(app, 'GET', affiche(CLE_GIRONA));
  sortie.sans = await requete(app, 'GET', affiche(null));
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
