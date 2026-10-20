/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-valeur-stats.mjs <serveur de la copie> <phase>
 *
 * Étape 18 — la valeur de chaque statistique. Base = la copie de la base d'essai (2 156 rencontres, de
 * février à septembre 2026 pour l'essentiel), la table du jour J construite ici ; périodes resserrées sur
 * ce que la base d'essai contient (calcul : février → juillet 2026 ; jugement : août → septembre),
 * seuils de preuve baissés (petite base). Réseau coupé, heure figée (05/10/2026). Sortie : une ligne JSON.
 *
 * Phases (« tout » les enchaîne dans la même copie : une seule table du jour J, un seul chargement de l'appli) :
 *   vide     GET /api/bench/stat-value avant tout calcul (la forme complète)
 *   calcul   le calcul complet (équipes et joueurs du magasin ; pas de football-data dans la base d'essai),
 *            son écriture (ouvrirCalcul, finirCalcul), sa relecture (dernierCalcul,
 *            lireParametresStatistique), une seconde fin refusée ; le contrôle de la fenêtre du moteur face
 *            aux colonnes f10 de la table du jour J
 *   route    POST sous un verrou tenu (409), POST (202), un second POST pendant le calcul (409), une passe
 *            d'actualisation reportée pendant le calcul, GET après (le calcul du serveur, ses lignes)
 */

import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const S = await imp('bench/statValue.js');

const sortie = { phase };
const db = openDb();

/** Les périodes de la base d'essai : calcul février → juillet 2026, jugement depuis août. */
const PERIODES_ESSAI = {
  magasin: { calcul: { de: '2026-02-01', a: '2026-07-31', tranches: ['essai'] }, jugement: { de: '2026-08-01', a: null, tranches: ['essai'] } }
};
const OPTIONS_ESSAI = { sources: ['magasin'], periodes: PERIODES_ESSAI, tirages: 200, minBlocs: 20, seuils: { minutesMoitie: 180, minutesHistoire: 90, moitieEquipe: 4 } };

async function requete(app, methode, url, corps) {
  return new Promise((resolve, reject) => {
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
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: rendu });
      return res;
    };
    res.on('error', reject);
    app.handle(req, res, reject);
  });
}

await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });

const avecApp = phase === 'route' || phase === 'vide' || phase === 'tout';
const app = avecApp ? (await imp('app.js')).createApp() : null;
if (phase === 'vide' || phase === 'tout') sortie.vide = (await requete(app, 'GET', '/api/bench/stat-value')).corps;

if (phase === 'calcul' || phase === 'tout') {
  const t = performance.now();
  const id = S.ouvrirCalcul({ database: db, ou: 'essai', options: OPTIONS_ESSAI });
  const ouvert = db.prepare('SELECT fini_le, bilan FROM stat_value_runs WHERE id = ?').get(id);
  let pauses = 0;
  const r = await S.calculerValeurDesStatistiques({ database: db, options: OPTIONS_ESSAI, rendreLaMain: (fin) => (pauses++, setImmediate(fin)) });
  sortie.dureeMs = Math.round(performance.now() - t);
  sortie.pauses = pauses;
  sortie.bilan = r.bilan;
  S.finirCalcul({ database: db, id, bilan: r.bilan, lignes: r.lignes ?? [] });
  let second = null;
  try {
    S.finirCalcul({ database: db, id, bilan: { encore: true }, lignes: r.lignes ?? [] });
  } catch (error) {
    second = error.constructor.name;
  }
  const d = S.dernierCalcul({ database: db });
  sortie.depot = {
    ouvert,
    second,
    lignesEnBase: db.prepare('SELECT COUNT(*) n FROM stat_value WHERE calcul = ?').get(id).n,
    dernierId: d?.calcul?.id ?? null,
    colonnes: db.prepare('SELECT statistique, echelle, source, cible, fiabilite, fiabilite_n, stabilisation, pouvoir, pouvoir_n, demi_vie, fenetre_actuelle, fenetre_conseillee, verdict_fenetre, verdict FROM stat_value WHERE calcul = ? ORDER BY echelle, statistique').all(id)
  };
  sortie.lignes = r.lignes;
  sortie.parametres = {
    xg: S.lireParametresStatistique({ statistique: 'xg_pour', echelle: 'equipe', database: db }),
    tirsJoueur: S.lireParametresStatistique({ statistique: 'tirs', echelle: 'joueur', database: db }),
    inconnue: S.lireParametresStatistique({ statistique: 'pas-une-statistique', echelle: 'equipe', database: db })
  };
}

if (phase === 'route' || phase === 'tout') {
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  let liberer;
  const tenu = withRefreshLock(() => new Promise((fin) => (liberer = fin)), { stamp: false });
  sortie.sousVerrou = await requete(app, 'POST', '/api/bench/stat-value/run', {});
  liberer();
  await tenu;
  const total0 = db.prepare('SELECT COUNT(*) n FROM stat_value_runs').get().n;
  const lance = await requete(app, 'POST', '/api/bench/stat-value/run', {});
  sortie.lance = { code: lance.code, enCours: Boolean(lance.corps?.enCours) };
  sortie.pendant = (await requete(app, 'POST', '/api/bench/stat-value/run', {})).code;
  sortie.passePendant = await withRefreshLock(async () => ({ bilan: 'de la passe' }), { stamp: false });
  let etat;
  for (let i = 0; i < 1200; i++) {
    etat = (await requete(app, 'GET', '/api/bench/stat-value')).corps;
    if (!etat.enCours) break;
    await new Promise((fin) => setTimeout(fin, 50));
  }
  sortie.apres = { enCours: etat.enCours, refus: etat.dernierRefus, dernier: etat.dernier && { id: etat.dernier.id, ou: etat.dernier.ou, fini: Boolean(etat.dernier.finiLe), erreur: etat.dernier.bilan?.erreur ?? null }, lignes: etat.lignes.length, calculs: etat.calculs.length, cles: Object.keys(etat), regles: Object.keys(etat.regles) };
  sortie.calculsAjoutes = db.prepare('SELECT COUNT(*) n FROM stat_value_runs').get().n - total0;
  // Le calcul à part qui ne répond pas à temps : l'enfant arrêté, la promesse rejetée, rien d'écrit.
  const { calculerAPart } = await imp('data/db/valeurStatsAPart.js');
  sortie.delai = await calculerAPart({ chemin: BASE, options: OPTIONS_ESSAI, delaiMs: 1 }).then(() => 'répondu', (e) => e.message);
  sortie.apresDelai = db.prepare('SELECT COUNT(*) n FROM stat_value_runs').get().n - total0;
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
