/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-bilan-apres-match.mjs <serveur de la copie> <phase>
 *
 * Étape 45 — LE BILAN D'APRÈS-MATCH de la page d'un match joué (l'onglet « Analyse IA »). Les réponses du VRAI serveur à
 * GET /api/match-ai-analysis/fixture (l'analyse de l'IA, les pronostics du journal, l'expérience de l'IA par marché) sur un extrait RÉEL
 * des analyses et du journal du bac (test/fixtures/analyses-etape-45.json) écrit dans le data/runtime de la copie. AUCUN appel à Claude,
 * aucun réseau, heure figée au 05/10/2026.
 *
 * Phase « ecran » : cinq affiches —
 *   complete        Girona - Mallorca : l'analyse d'avant-match, le bilan d'après-match, quinze marchés, leurs leçons, la composition ;
 *   avantSeul       Recoleta - Libertad : l'analyse d'avant-match sans bilan ;
 *   pronosticsSeuls Sevilla - Valencia : aucun avis de l'IA, seulement les pronostics du journal (réglés) ;
 *   inconnue        une affiche que ni l'IA ni le journal ne connaissent ;
 *   sansExperience  la même affiche « complete » quand aucun bilan n'a encore été écrit ailleurs (expérience vide).
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

const sortie = { ok: true, phase };

if (phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const { c: complete, a: avantSeul, p: pronostics } = { c: FIXTURE.complete, a: FIXTURE.avantSeul, p: FIXTURE.pronostics };
  const affiche = (e, date) => `/api/match-ai-analysis/fixture?home=${encodeURIComponent(e.homeName)}&away=${encodeURIComponent(e.awayName)}&league=${encodeURIComponent(e.league)}&date=${date}`;
  const lire = async (url) => (await requete(app, 'GET', url)).corps;

  // 1. Tout est écrit : deux analyses, 26 bilans, le journal d'un match sans analyse.
  ecrire('match-ai-analyses.json', [FIXTURE.complete, FIXTURE.avantSeul, ...FIXTURE.volume]);
  ecrire('predictions.json', FIXTURE.pronostics);
  sortie.reponses = {
    complete: await lire(affiche(complete, '2026-10-04')),
    avantSeul: await lire(affiche(avantSeul, '2026-10-03')),
    pronosticsSeuls: await lire(affiche(pronostics[0], pronostics[0].day)),
    inconnue: await lire('/api/match-ai-analysis/fixture?home=Nulle%20Part&away=Ailleurs&league=Aucune&date=2026-09-04')
  };
  sortie.affiches = {
    complete: { home: complete.homeName, away: complete.awayName, league: complete.league, date: '2026-10-04', matchId: complete.matchId, homeId: complete.lineupSnapshot?.home?.teamId ?? null, awayId: complete.lineupSnapshot?.away?.teamId ?? null },
    avantSeul: { home: avantSeul.homeName, away: avantSeul.awayName, league: avantSeul.league, date: '2026-10-03', matchId: avantSeul.matchId, homeId: avantSeul.lineupSnapshot?.home?.teamId ?? null, awayId: avantSeul.lineupSnapshot?.away?.teamId ?? null },
    pronosticsSeuls: { home: pronostics[0].homeName, away: pronostics[0].awayName, league: pronostics[0].league, date: pronostics[0].day }
  };

  // 2. Aucun bilan nulle part : l'expérience est vide, l'analyse « complete » (sans son bilan) reste.
  const sansBilan = JSON.parse(JSON.stringify(FIXTURE.complete));
  delete sansBilan.postMatchReview;
  ecrire('match-ai-analyses.json', [sansBilan]);
  sortie.reponses.sansExperience = await lire(affiche(complete, '2026-10-04'));
  // 3. Lecture seule : la route ne crée ni ne réécrit aucun fichier.
  sortie.fichiers = fs.readdirSync(RUNTIME).sort();
}

else {
  throw new Error(`Phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
