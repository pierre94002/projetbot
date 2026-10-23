/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiches-ecran.mjs <serveur de la copie> <phase>
 *
 * Étape 31 — « Fiches à l'écran » : les réponses du VRAI serveur que lisent le bloc « Indice de force » de la page
 * d'une équipe (étape 29), la fiche d'un joueur (étape 30) et le tableau « ce qui prédit / ce qui trompe » (étape 18).
 * Base = la copie de la base d'essai, la table du jour J construite ici ; heure figée au 05/10/2026 12 h UTC ; réseau
 * coupé. Phases (une ligne JSON) :
 *   vide   les trois routes AVANT tout calcul : la même forme, vide (« jamais calculé ») ;
 *   pret   le calcul de chaque étape (l'indice de force dans un processus à part comme chez Pierre, les fiches, la
 *          valeur des statistiques sur les périodes de la base d'essai) puis les routes : un club (avec son
 *          historique), un club sans ligne, un championnat, un joueur établi, un gardien, un joueur peu joué, un joueur
 *          inconnu, la valeur des statistiques ; les attendus que le test recompte à la main ; aucune écriture.
 */

import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
recopierScripts(serveur);
const T = await imp('data/db/dayTable.js');
const S = await imp('bench/statValue.js');
const P = await imp('data/db/playerRatings.js');
const F = await imp('data/db/teamStrength.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { createApp } = await imp('app.js');

const MAINTENANT = new Date().toISOString();
const db = openDb();
const sortie = { phase };

/** Les périodes de la base d'essai : calcul février → juillet 2026, jugement depuis août (comme script-valeur-stats.mjs). */
const PERIODES_ESSAI = {
  magasin: { calcul: { de: '2026-02-01', a: '2026-07-31', tranches: ['essai'] }, jugement: { de: '2026-08-01', a: null, tranches: ['essai'] } }
};
const OPTIONS_ESSAI = { sources: ['magasin'], periodes: PERIODES_ESSAI, tirages: 200, minBlocs: 20, seuils: { minutesMoitie: 180, minutesHistoire: 90, moitieEquipe: 4 } };

async function requeteExpress(app, methode, url) {
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
      let corps = null;
      try {
        corps = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps });
      return res;
    };
    app.handle(req, res, reject);
  });
}

const app = createApp();
const get = (url) => requeteExpress(app, 'GET', url);
const enc = encodeURIComponent;
const ecritures = () => db.prepare('SELECT total_changes() n').get().n;
const ctx = (derniere, manuel = false) => ({ manuel, derniere: (cle) => (cle === 'indiceForce' ? derniere : null) });

if (phase === 'vide') {
  sortie.equipe = await get('/api/match-stats/team-strength?club=fotmob-8456&historique=oui');
  sortie.joueur = await get('/api/match-stats/player-ratings?player=fotmob-1');
  sortie.valeur = await get('/api/bench/stat-value');
} else if (phase === 'pret') {
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
  // 1. L'indice de force, par l'étape de la passe (processus à part, base en lecture seule).
  const indice = await job.__testing.passeIndiceForce(ctx(null), { database: db, chemin: BASE });
  sortie.indice = { status: indice.status, summary: indice.summary };
  // 2. Les fiches des joueurs (en place : la copie est petite).
  const fiches = await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: () => MAINTENANT });
  sortie.fiches = { mode: fiches.mode, fiches: fiches.fiches, equipes: fiches.equipes };
  // 3. La valeur des statistiques, sur les périodes de la base d'essai.
  const id = S.ouvrirCalcul({ database: db, ou: 'essai', options: OPTIONS_ESSAI });
  const calcul = await S.calculerValeurDesStatistiques({ database: db, options: OPTIONS_ESSAI });
  S.finirCalcul({ database: db, id, bilan: calcul.bilan, lignes: calcul.lignes ?? [] });
  sortie.valeurLignes = calcul.lignes.length;

  // Les clubs et les joueurs lus.
  const ligue = db.prepare("SELECT league, COUNT(*) n FROM team_strength WHERE actuel = 1 AND lieu = 'tous' GROUP BY league ORDER BY n DESC LIMIT 1").get().league;
  const club = db.prepare("SELECT club FROM team_strength WHERE league = ? AND actuel = 0 AND lieu = 'tous' GROUP BY club ORDER BY COUNT(*) DESC, club LIMIT 1").get(ligue).club;
  const sansUneLigne = db.prepare("SELECT club FROM team_strength WHERE league = ? AND actuel = 1 AND lieu = 'tous' AND club <> ? ORDER BY club LIMIT 1").get(ligue, club).club;
  const joueur = db.prepare('SELECT joueur FROM player_ratings WHERE etablie = 1 AND poste IN (3, 4) AND courbe IS NOT NULL ORDER BY minutes DESC LIMIT 1').get().joueur;
  const gardien = db.prepare('SELECT joueur FROM player_ratings WHERE etablie = 1 AND poste = 1 ORDER BY minutes DESC LIMIT 1').get()?.joueur ?? null;
  const peuJoue = db.prepare('SELECT joueur FROM player_ratings WHERE etablie = 0 AND poste IS NOT NULL AND courbe IS NOT NULL ORDER BY minutes DESC LIMIT 1').get()?.joueur ?? null;
  sortie.cibles = { ligue, club, sansUneLigne, joueur, gardien, peuJoue };

  const e0 = ecritures();
  sortie.equipe = await get(`/api/match-stats/team-strength?club=fotmob-${club}&historique=oui`);
  sortie.equipeSansHistorique = await get(`/api/match-stats/team-strength?club=${club}`);
  sortie.equipeInconnue = await get('/api/match-stats/team-strength?club=fotmob-999999999&historique=oui');
  sortie.championnat = await get(`/api/match-stats/team-strength?league=${enc(ligue)}`);
  sortie.joueurEtabli = await get(`/api/match-stats/player-ratings?player=fotmob-${joueur}`);
  sortie.gardien = gardien ? await get(`/api/match-stats/player-ratings?player=fotmob-${gardien}`) : null;
  sortie.joueurPeuJoue = peuJoue ? await get(`/api/match-stats/player-ratings?player=fotmob-${peuJoue}`) : null;
  sortie.joueurInconnu = await get('/api/match-stats/player-ratings?player=fotmob-999999999');
  sortie.valeur = await get('/api/bench/stat-value');
  sortie.ecritures = ecritures() - e0;
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
