/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-sante-moteur.mjs <serveur de la copie> <phase>
 *
 * Étape 24 — « Santé du moteur » et la correction des 6 s de la calibration. Base = la copie de la base
 * d'essai (657 rencontres jouées en août, 439 en septembre 2026), heure figée au 30/09/2026 12 h UTC (le mois
 * en cours est septembre, août est écoulé). PLANTÉS ici par SQL : les 15 pronostics d'un vrai match du bac
 * (quinze marchés, trois révisions) sur chaque rencontre jouée de septembre (439 × 15 = 6 585 pronostics
 * réglés par lecture, le volume du 14/10 chez Pierre : 6 469) et sur 300 rencontres d'août. Le bilan de
 * septembre est celui qui prenait 1,7 s à chaud dans la requête (6 s à froid chez Pierre).
 *
 * Phases :
 *   volume   la route avant la préparation (rien n'est calculé : « pas encore mesuré », en quelques ms), l'étape
 *            de la nuit (gel d'août + préparation de septembre) avec son plus long blocage, un moniteur de la
 *            boucle d'événements en parallèle, la route après (lue, jamais calculée), le calcul d'une traite
 *            pour comparaison ; l'étape qui échoue à écrire (dite « warn », le gel d'août n'est pas touché)
 *   etats    tous les états du fichier préparé et ce que la route en dit (absent, coupé en deux, de forme inconnue,
 *            sans vues, d'un autre mois, d'hier, de la veille au soir UTC mais du MÊME jour à Paris, d'aujourd'hui,
 *            d'une autre version ou d'une autre forme), les mois finis (à figer, sans pronostic, figé), le gel
 *            d'un mois AVEC une préparation qui échoue, la page qui retombe sur le dernier mois figé
 *   page     les réponses de GET /api/engine-health avant et après la préparation (pour l'écran)
 */

import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const C = await imp('data/calibration.js');
const utils = await imp('utils/travailCooperatif.js');
const db = openDb();
const sortie = { phase };

/** mulberry32 : le même tirage à chaque passage. */
function mulberry(g) {
  let s = g >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const u = mulberry(24);
const tirer = (a, b) => Math.round((a + (b - a) * u()) * 10000) / 10000;
const plusHeures = (iso, h) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

// ------------------------------------------------------------ la plantation

/** Les 15 pronostics d'un vrai match du bac, relevés le 14/10/2026 (marché, paramètres, choix, libellé), les noms des clubs en {DOM} / {EXT}. */
const MODELE = [
  {"marketKey":"bothTeamsScore","marketId":"bothTeamsScore","market":"Les 2 équipes marquent","params":{"outcome":"no"},"choice":"no","label":"Non"},
  {"marketKey":"result","marketId":"result","market":"Résultat","params":{"outcome":"away"},"choice":"away","label":"{EXT} gagne"},
  {"marketKey":"resultAndTotal","marketId":"resultAndTotal","market":"Résultat + Total buts","params":{"key":"awayUnder","line":3.5},"choice":"awayUnder","label":"{EXT} & Moins de 3.5 buts"},
  {"marketKey":"teamCorners:away","marketId":"teamCorners","market":"Corners — {EXT}","params":{"line":2.5,"side":"over","team":"away"},"choice":"over","label":"{EXT} — Plus de 2.5 corners"},
  {"marketKey":"teamCorners:home","marketId":"teamCorners","market":"Corners — {DOM}","params":{"line":7.5,"side":"under","team":"home"},"choice":"under","label":"{DOM} — Moins de 7.5 corners"},
  {"marketKey":"teamGoals:away","marketId":"teamGoals","market":"Buts — {EXT}","params":{"line":1.5,"side":"under","team":"away"},"choice":"under","label":"{EXT} — Moins de 1.5 buts"},
  {"marketKey":"teamGoals:home","marketId":"teamGoals","market":"Buts — {DOM}","params":{"line":1.5,"side":"under","team":"home"},"choice":"under","label":"{DOM} — Moins de 1.5 buts"},
  {"marketKey":"teamShots:away","marketId":"teamShots","market":"Tirs — {EXT}","params":{"line":14.5,"side":"under","team":"away"},"choice":"under","label":"{EXT} — Moins de 14.5 tirs"},
  {"marketKey":"teamShots:home","marketId":"teamShots","market":"Tirs — {DOM}","params":{"line":8.5,"side":"over","team":"home"},"choice":"over","label":"{DOM} — Plus de 8.5 tirs"},
  {"marketKey":"teamShotsOnTarget:away","marketId":"teamShotsOnTarget","market":"Tirs cadrés — {EXT}","params":{"line":2.5,"side":"over","team":"away"},"choice":"over","label":"{EXT} — Plus de 2.5 tirs cadrés"},
  {"marketKey":"teamShotsOnTarget:home","marketId":"teamShotsOnTarget","market":"Tirs cadrés — {DOM}","params":{"line":6.5,"side":"under","team":"home"},"choice":"under","label":"{DOM} — Moins de 6.5 tirs cadrés"},
  {"marketKey":"totalCorners","marketId":"totalCorners","market":"Total corners","params":{"line":12.5,"side":"under"},"choice":"under","label":"Moins de 12.5 corners"},
  {"marketKey":"totalGoals","marketId":"totalGoals","market":"Total buts","params":{"line":0.5,"side":"over"},"choice":"over","label":"Plus de 0.5 buts"},
  {"marketKey":"totalShots","marketId":"totalShots","market":"Total tirs","params":{"line":28.5,"side":"under"},"choice":"under","label":"Moins de 28.5 tirs"},
  {"marketKey":"totalShotsOnTarget","marketId":"totalShotsOnTarget","market":"Total tirs cadrés","params":{"line":11.5,"side":"under"},"choice":"under","label":"Moins de 11.5 tirs cadrés"}
];
const COLONNES = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'engine_version'];
const inserer = db.prepare(`INSERT INTO engine_picks (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);
const noms = (texte, m) => texte.split('{DOM}').join(m.homeName).split('{EXT}').join(m.awayName);
const parametres = (p) => JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))));

function planterLeMois(debut, fin, { limite = Infinity } = {}) {
  const rencontres = db
    .prepare(
      `SELECT match_key AS matchKey, date, league, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, json_extract(meta, '$.kickoff') AS kickoff
       FROM matches WHERE date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL AND home_goals IS NOT NULL
         AND json_extract(meta, '$.kickoff') IS NOT NULL AND json_extract(meta, '$.reason') IS NULL ORDER BY date, match_key`
    )
    .all(debut, fin)
    .map((r) => ({ ...r }))
    .slice(0, limite);
  let lignes = 0;
  db.exec('BEGIN');
  for (const m of rencontres) {
    const fixtureKey = `fotmob:${m.homeId}|${m.awayId}|${m.date}`;
    for (const base of MODELE) {
      const p1 = tirer(0.2, 0.85);
      for (const [version, avantH] of [[1, 20], [2, 9], [3, 3]]) {
        inserer.run(
          fixtureKey,
          base.marketKey,
          version,
          plusHeures(m.kickoff, -avantH),
          'nuit',
          `sante-${m.matchKey}`,
          m.league,
          m.date,
          m.kickoff,
          m.homeName,
          m.awayName,
          m.homeId,
          m.awayId,
          base.marketId,
          noms(base.market, m),
          parametres(base.params),
          base.choice,
          noms(base.label, m),
          Math.min(0.95, Math.max(0.05, p1 + (version - 1) * 0.01 * (u() - 0.5))),
          null
        );
        lignes++;
      }
    }
  }
  db.exec('COMMIT');
  return { rencontres: rencontres.length, lignes };
}

// ------------------------------------------------------------ requêtes Express sans réseau

async function requete(app, methode, url) {
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

/** Une requête mesurée : sa durée (horloge du processus, pas la date figée) et ce qu'elle rend. */
async function mesuree(app, url) {
  const debut = performance.now();
  const r = await requete(app, 'GET', url);
  return { ms: Math.round((performance.now() - debut) * 10) / 10, code: r.code, corps: r.corps };
}

/** Le moniteur de la boucle d'événements : le plus long retard d'un minuteur de 5 ms (ce qu'un autre visiteur de l'appli attendrait). */
function moniteur() {
  let retardMax = 0;
  let dernier = performance.now();
  const minuteur = setInterval(() => {
    const maintenant = performance.now();
    retardMax = Math.max(retardMax, maintenant - dernier - 5);
    dernier = maintenant;
  }, 5);
  return {
    arreter() {
      clearInterval(minuteur);
      return Math.round(Math.max(retardMax, performance.now() - dernier - 5));
    }
  };
}

const { createApp } = await imp('app.js');
const app = createApp();
const job = await imp('jobs/matchStatsAutoRefresh.js');

// ------------------------------------------------------------ les phases

if (phase === 'volume') {
  sortie.plantes = { aout: planterLeMois('2026-08-01', '2026-08-31', { limite: 300 }), septembre: planterLeMois('2026-09-01', '2026-09-30') };
  sortie.fichier = C.FICHIER_DU_MOIS_EN_COURS.replace(/\\/g, '/').split('/data/runtime/').pop();

  // 1. Avant la nuit : rien n'est préparé. Les deux routes lisent et le disent, sans calculer.
  sortie.due = { avant: job.__testing.dueCalibrationMensuelle({}, {}) };
  const avantSante = await mesuree(app, '/api/engine-health');
  const avantCalibration = await mesuree(app, '/api/predictions/calibration');
  sortie.avant = {
    sante: { ms: avantSante.ms, code: avantSante.code, calibration: [avantSante.corps.blocs.calibration.etat, avantSante.corps.blocs.calibration.valeur], cloture: avantSante.corps.blocs.cloture.etat },
    calibration: { ms: avantCalibration.ms, code: avantCalibration.code, bilan: avantCalibration.corps.bilan, preparation: avantCalibration.corps.preparation, disponibles: avantCalibration.corps.disponibles.map((d) => [d.mois, d.etat]) },
    fichierPresent: fs.existsSync(C.FICHIER_DU_MOIS_EN_COURS)
  };

  // 2. L'étape de la nuit, avec le moniteur de la boucle d'événements en parallèle.
  const m1 = moniteur();
  const t0 = performance.now();
  const etape = await job.__testing.passeCalibrationMensuelle({});
  sortie.etape = {
    status: etape.status,
    summary: etape.summary,
    ms: Math.round(performance.now() - t0),
    retardMaxBoucleMs: m1.arreter(),
    gel: { blocMaxMs: etape.details.blocMaxMs, dureeMs: etape.details.dureeMs, figes: etape.details.figes.map((f) => [f.mois, f.ecrit]) },
    preparation: etape.details.preparation
  };
  sortie.due.apres = job.__testing.dueCalibrationMensuelle({}, {});
  sortie.due.auClic = job.__testing.dueCalibrationMensuelle({}, { manuel: true });
  // Une seconde passe tout de suite après : rien à figer, rien à préparer (déjà fait aujourd'hui), aucun nouveau calcul.
  const t2 = performance.now();
  const seconde = await job.__testing.passeCalibrationMensuelle({});
  sortie.seconde = { status: seconde.status, summary: seconde.summary, ms: Math.round(performance.now() - t2), preparation: seconde.details.preparation };
  // Un clic « Actualiser » (manuel) refait la préparation même si elle est du jour.
  const clic = await job.__testing.passeCalibrationMensuelle({ manuel: true });
  sortie.clic = { status: clic.status, summary: clic.summary, preparation: clic.details.preparation };
  sortie.fichierEcrit = { present: fs.existsSync(C.FICHIER_DU_MOIS_EN_COURS), octets: fs.existsSync(C.FICHIER_DU_MOIS_EN_COURS) ? fs.statSync(C.FICHIER_DU_MOIS_EN_COURS).size : 0 };

  // 3. Après la nuit : les routes LISENT. Cinq lectures chacune, la plus lente compte.
  const apresSante = [];
  const apresCalibration = [];
  for (let i = 0; i < 5; i++) {
    apresSante.push(await mesuree(app, '/api/engine-health'));
    apresCalibration.push(await mesuree(app, '/api/predictions/calibration'));
  }
  const plusLente = (liste) => Math.max(...liste.map((r) => r.ms));
  const derniereSante = apresSante.at(-1).corps;
  const derniereCalibration = apresCalibration.at(-1).corps;
  // Le résumé que lit la page : l'essentiel du bilan, pas le bilan (les tableaux par marché et par championnat restent à leur place).
  const resume = C.resumeDeLaCalibration({ database: db });
  sortie.resume = { octets: JSON.stringify(resume).length, clesDuBilan: Object.keys(resume.bilan), parMarche: 'parMarche' in (resume.bilan.premiere ?? {}), vues: 'vues' in resume.bilan };
  sortie.apres = {
    sante: { plusLenteMs: plusLente(apresSante), codes: apresSante.map((r) => r.code), calibration: derniereSante.blocs.calibration.etat, cloture: derniereSante.blocs.cloture.etat, mois: derniereSante.blocs.calibration.mois, geles: derniereSante.blocs.calibration.pronostics, global: derniereSante.blocs.calibration.global && { pronostics: derniereSante.blocs.calibration.global.pronostics, matchs: derniereSante.blocs.calibration.global.matchs, annonce: derniereSante.blocs.calibration.global.annonce, realise: derniereSante.blocs.calibration.global.realise }, evolution: derniereSante.blocs.note.evolution.map((m) => [m.mois, m.pronostics]), octets: JSON.stringify(derniereSante).length, lectures: derniereSante.lectures },
    calibration: {
      plusLenteMs: plusLente(apresCalibration),
      codes: apresCalibration.map((r) => r.code),
      preparation: derniereCalibration.preparation,
      global: derniereCalibration.bilan.vues.premiere.global && { pronostics: derniereCalibration.bilan.vues.premiere.global.pronostics, matchs: derniereCalibration.bilan.vues.premiere.global.matchs, annonce: derniereCalibration.bilan.vues.premiere.global.annonce, realise: derniereCalibration.bilan.vues.premiere.global.realise },
      geles: derniereCalibration.bilan.pronostics.geles,
      figes: derniereCalibration.figes.map((m) => [m.mois, m.fige, m.pronostics]),
      disponibles: derniereCalibration.disponibles.map((d) => [d.mois, d.etat]),
      octets: JSON.stringify(derniereCalibration).length
    },
    // Le mois figé (août) : la route le rend tel quel, sans le recalculer.
    aout: await mesuree(app, '/api/predictions/calibration?mois=2026-08').then((r) => ({ ms: r.ms, fige: r.corps.bilan.fige, etat: r.corps.preparation.etat })),
    // Un mois fini pas encore figé ou sans pronostic : « pas de bilan », la raison dite.
    juillet: await mesuree(app, '/api/predictions/calibration?mois=2026-07').then((r) => ({ ms: r.ms, bilan: r.corps.bilan, etat: r.corps.preparation.etat })),
    memeBilanQueLaPage: JSON.stringify(derniereCalibration.bilan.vues.premiere.global.tranches.map((t) => [t.pronostics, t.annonce, t.realise])) === JSON.stringify(derniereSante.blocs.calibration.global.tranches.map((t) => [t.pronostics, t.annonce, t.realise]))
  };

  // 4. Pour comparaison : le même calcul d'une traite (ce que bloquerait l'ancienne route si rien ne rendait la main).
  const t1 = performance.now();
  const bilan = C.calculerBilan('2026-09', { database: db });
  sortie.synchrone = { ms: Math.round(performance.now() - t1), reglees: bilan.vues.premiere.reglees, matchs: bilan.vues.premiere.matchs, geles: bilan.pronostics.geles };
  // Le calcul préparé est le même que celui d'une traite (la nuit ne change aucun chiffre).
  const prepare = C.lireLeMoisPrepare();
  const sansHeure = (b) => JSON.stringify({ ...b, calculeLe: null, dureeMs: null });
  sortie.memeCalcul = sansHeure(prepare.prepare.bilan) === sansHeure(bilan);

  // 5. Une préparation qui échoue à écrire : l'étape dit « warn », ne lève pas, et le gel d'août (déjà fait) n'est pas touché.
  const fichierImpossible = path.join(serveur, 'package.json', 'impossible.json');
  const echec = await job.__testing.passeCalibrationMensuelle({ manuel: true }, { fichierDuMois: fichierImpossible });
  sortie.echec = { status: echec.status, summary: echec.summary, preparation: echec.details.preparation, dueApres: job.__testing.dueCalibrationMensuelle({ fichierDuMois: fichierImpossible }, {}) };
  sortie.augGele = (db.prepare("SELECT count(*) n FROM calibration_monthly WHERE mois = '2026-08'").get().n);
}

if (phase === 'etats') {
  planterLeMois('2026-07-01', '2026-07-31', { limite: 40 });
  planterLeMois('2026-08-01', '2026-08-31', { limite: 40 });
  planterLeMois('2026-09-01', '2026-09-30', { limite: 60 });
  const fichier = C.FICHIER_DU_MOIS_EN_COURS;
  const impossible = path.join(serveur, 'package.json', 'impossible.json');
  const etat = async (mois = null) => {
    const r = (await requete(app, 'GET', `/api/predictions/calibration${mois ? `?mois=${mois}` : ''}`)).corps;
    return [r.bilan ? r.bilan.mois : null, r.preparation.etat];
  };
  const e = {};
  // 0. Jour de gel ET préparation impossible, au 15/08 : juillet est figé, le mois en cours (août) n'est pas préparé — l'étape le DIT.
  const gelEtEchec = await job.__testing.passeCalibrationMensuelle({}, { maintenant: Date.parse('2026-08-15T12:00:00.000Z'), fichierDuMois: impossible });
  e.gelEtEchec = { status: gelEtEchec.status, resume: gelEtEchec.summary, figes: gelEtEchec.details.figes.map((x) => [x.mois, x.ecrit]), preparation: gelEtEchec.details.preparation };
  // 1. Rien d'écrit (30/09) : le mois en cours « absente » ; août fini mais pas figé, juin sans pronostic, juillet figé.
  e.absent = { defaut: await etat(), aout: await etat('2026-08'), juin: await etat('2026-06'), juillet: await etat('2026-07'), afaire: C.preparationAFaire(), due: job.__testing.dueCalibrationMensuelle({}, {}) };
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  // 2. Un fichier coupé en deux (JSON illisible), d'une forme inconnue, un bilan sans vues.
  fs.writeFileSync(fichier, '{"format":1,"mois":"2026-09","bilan":');
  e.coupe = { defaut: await etat(), afaire: C.preparationAFaire() };
  fs.writeFileSync(fichier, JSON.stringify({ x: 1 }));
  e.formeInconnue = { defaut: await etat(), afaire: C.preparationAFaire() };
  fs.writeFileSync(fichier, JSON.stringify({ format: 1, version: 1, mois: '2026-09', calculeLe: '2026-09-30T08:00:00.000Z', bilan: {} }));
  e.sansVues = { defaut: await etat(), lu: C.lireLeMoisPrepare().etat };
  // 3. Préparé pour août (le mois d'avant) : « ancienne », à refaire.
  await C.preparerLeMoisEnCours({ database: db, maintenant: Date.parse('2026-08-31T12:00:00.000Z') });
  e.autreMois = { mois: JSON.parse(fs.readFileSync(fichier, 'utf8')).mois, defaut: await etat(), afaire: C.preparationAFaire() };
  // 4. Préparé hier (29/09) : lu tel quel, mais à refaire (un autre jour de Paris).
  await C.preparerLeMoisEnCours({ database: db, maintenant: Date.parse('2026-09-29T12:00:00.000Z') });
  e.hier = { defaut: await etat(), afaire: C.preparationAFaire() };
  // 5. Calculé le 29/09 à 22 h 30 UTC = le 30/09 à 0 h 30 à Paris : le MÊME jour de Paris que « maintenant » (30/09, 12 h UTC) — rien à refaire.
  await C.preparerLeMoisEnCours({ database: db, maintenant: Date.parse('2026-09-29T22:30:00.000Z') });
  e.memeJourDeParis = { afaire: C.preparationAFaire() };
  // 6. Préparé aujourd'hui : lu, rien à refaire — mais août attend son gel : l'étape reste due.
  await C.preparerLeMoisEnCours({ database: db, maintenant: Date.parse('2026-09-30T08:00:00.000Z') });
  e.aujourdhui = { defaut: await etat(), afaire: C.preparationAFaire(), due: job.__testing.dueCalibrationMensuelle({}, {}) };
  // 7. Une autre version du calcul, une autre forme de fichier : « ancienne », à refaire.
  const prepare = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fs.writeFileSync(fichier, JSON.stringify({ ...prepare, version: 99 }));
  e.autreVersion = { defaut: await etat(), afaire: C.preparationAFaire() };
  fs.writeFileSync(fichier, JSON.stringify({ ...prepare, format: 2 }));
  e.autreFormat = { defaut: await etat(), afaire: C.preparationAFaire() };
  fs.writeFileSync(fichier, JSON.stringify(prepare));
  // 8. Le gel d'août fait : plus rien à faire, sauf au clic ; la route rend le mois en cours préparé et août figé.
  await C.figerLesMoisEcoules({ database: db });
  e.apresGel = { due: job.__testing.dueCalibrationMensuelle({}, {}), auClic: job.__testing.dueCalibrationMensuelle({}, { manuel: true }), aout: await etat('2026-08'), defaut: await etat() };
  // 9. Sans fichier préparé, la page retombe sur le dernier mois figé (août) et le dit.
  fs.rmSync(fichier);
  const blocs = (await requete(app, 'GET', '/api/engine-health')).corps.blocs;
  e.repliSurLeDernierFige = { mois: blocs.calibration.mois, etatDuMois: blocs.calibration.etatDuMois, etat: blocs.calibration.etat, cloture: blocs.cloture.mois, action: blocs.calibration.action };
  sortie.etats = e;
}

if (phase === 'page') {
  planterLeMois('2026-08-01', '2026-08-31', { limite: 300 });
  planterLeMois('2026-09-01', '2026-09-30');
  const avant = (await requete(app, 'GET', '/api/engine-health')).corps;
  await job.__testing.passeCalibrationMensuelle({});
  const apres = (await requete(app, 'GET', '/api/engine-health')).corps;
  sortie.reponses = { avant, apres };
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
