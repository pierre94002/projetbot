/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-indice-force.mjs <serveur de la copie> nuit
 *
 * Étape 29 — l'indice de force des équipes. Base = la copie de la base d'essai (sans table du jour J : elle
 * est CONSTRUITE ici d'abord) ; heure figée au 05/10/2026 12 h UTC. Phase « nuit » (une ligne JSON) :
 *   - l'ordre des étapes et `due` avant tout calcul ; la route « jamais calculé » ;
 *   - le premier calcul par l'étape de la passe (processus à part, comme chez Pierre) ; `due` ensuite ;
 *   - une passe sans rien de neuf : « rien », aucune écriture ;
 *   - une rencontre MODIFIÉE (xG d'un match d'EPL de septembre) puis la nuit de la table du jour J : seul son
 *     championnat est rejoué, à partir du 1er du mois ; les autres lignes identiques ; puis un calcul complet
 *     forcé : EXACTEMENT les mêmes lignes ;
 *   - une rencontre RETIRÉE du magasin : ses lignes du jour disparaissent ; = calcul complet ;
 *   - la table du jour J « en cours » : l'étape attend, rien d'écrit ; un calcul à part en échec : rien d'écrit ;
 *   - la route et la lecture (championnat, club, historique, avant un jour, refus) sans aucune écriture ;
 *   - deux clubs HOMONYMES (même nom, deux identifiants) ;
 *   - le banc sur la copie, ses variantes déclarées dans un registre d'ESSAI (jamais data/runtime).
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath, closeDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const F = await imp('data/db/teamStrength.js');
const B = await imp('data/db/teamStrengthBanc.js');
const { compteAuClassementXg } = await imp('data/db/expectedPoints.js');
const { invalidateRegistryCaches } = await imp('data/db/identityRegistry.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { createApp } = await imp('app.js');
const J = job.__testing;
const sortie = { phase, temps: {} };
let tMarque = performance.now();
const marque = (quoi) => {
  const t = performance.now();
  sortie.temps[quoi] = Math.round(t - tMarque);
  tMarque = t;
};

const ecritures = (db) => db.prepare('SELECT total_changes() n').get().n;
const instantane = (db, where = '1 = 1', ...args) => JSON.stringify(db.prepare(`SELECT * FROM team_strength WHERE ${where} ORDER BY club, jour, lieu`).all(...args));
const compte = (db) => db.prepare('SELECT COUNT(*) n FROM team_strength').get().n;
const aujourdhui = '2026-10-05T01:30:00.000Z';
const hier = '2026-10-04T10:00:00.000Z';
const ctx = (derniere, manuel = false) => ({ manuel, derniere: (cle) => (cle === 'indiceForce' ? derniere : null) });

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

if (phase !== 'nuit') throw new Error(`phase inconnue : ${phase}`);
const t0 = performance.now();
const db = openDb();
const app = createApp();
const get = (url) => requeteExpress(app, 'GET', url);
sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);

// La table du jour J de la copie (la base d'essai n'en a pas).
await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
marque('table du jour J');
const nuitDeLaTable = () => T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
sortie.dueAvant = { jamais: J.dueIndiceForce(ctx(null), { database: db }), aujourdhui: J.dueIndiceForce(ctx(aujourdhui), { database: db }) };
// Le chargement : une rencontre par rencontre de la table du jour J, rangées ; la possession des DEUX camps.
{
  const rencontres = executerSansPause(F.chargerLesRencontres(db));
  const nRegistre = db.prepare('SELECT COUNT(*) n FROM day_matches').get().n;
  const rangees = rencontres.every((x, k) => k === 0 || rencontres[k - 1].jour < x.jour || (rencontres[k - 1].jour === x.jour && rencontres[k - 1].cle < x.cle));
  const avecPossession = rencontres.find((x) => x.valeurs.possession);
  const camps = db.prepare('SELECT t.camp, t.possession_p FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE d.match_key = ? ORDER BY t.camp DESC').all(avecPossession.cle);
  sortie.chargement = { rencontres: rencontres.length, registre: nRegistre, rangees, possession: avecPossession.valeurs.possession, camps: camps.map((c) => c.possession_p) };
}
sortie.routeJamais = await get('/api/match-stats/team-strength');

// Le premier calcul, par l'étape de la passe (processus à part).
const p1 = await J.passeIndiceForce(ctx(null), { database: db, chemin: BASE });
sortie.premier = { status: p1.status, summary: p1.summary, details: p1.details, lignes: p1.details?.ecrites ?? null };
sortie.comptes = { premier: { lignes: compte(db) } };
marque('premier calcul');
sortie.due = { aujourdhui: J.dueIndiceForce(ctx(aujourdhui), { database: db }), hier: J.dueIndiceForce(ctx(hier), { database: db }), clic: J.dueIndiceForce(ctx(aujourdhui, true), { database: db }) };
const reglages = db.prepare("SELECT valeur FROM team_strength_state WHERE cle = 'reglages'").get().valeur;
db.prepare("UPDATE team_strength_state SET valeur = 'autres' WHERE cle = 'reglages'").run();
sortie.due.autresReglages = J.dueIndiceForce(ctx(aujourdhui), { database: db });
db.prepare("UPDATE team_strength_state SET valeur = ? WHERE cle = 'reglages'").run(reglages);
db.prepare("INSERT INTO team_strength_state (cle, valeur) VALUES ('en_cours', '2026-10-05T01:00:00.000Z')").run();
sortie.due.enCours = J.dueIndiceForce(ctx(aujourdhui), { database: db });
db.prepare("DELETE FROM team_strength_state WHERE cle = 'en_cours'").run();

// Rien de neuf : « rien », aucune écriture.
let e0 = ecritures(db);
const rien = await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE });
sortie.rien = { status: rien.status, summary: rien.summary, details: rien.details };
sortie.rienEcritures = ecritures(db) - e0;
marque('rien');

// Une rencontre modifiée : le dernier match d'EPL du magasin (ses xG), puis la nuit de la table du jour J.
const m = db.prepare("SELECT match_key, date FROM matches WHERE league = 'EPL' ORDER BY date DESC, match_key DESC LIMIT 1").get();
const mois = m.date.slice(0, 7);
const avantTout = instantane(db);
const avantAutres = instantane(db, 'league <> ?', 'EPL');
const avantMois = instantane(db, 'league = ? AND jour < ?', 'EPL', `${mois}-01`);
// Une ligne actuelle PÉRIMÉE d'un club qui n'est plus du championnat (descendu hors du magasin) : la nuit la retire.
db.prepare("INSERT INTO team_strength (club, jour, lieu, actuel, league, saison, n, n_xg) VALUES (999999999, '2026-09-21', 'tous', 1, 'EPL', 2026, 10, 10)").run();
db.prepare("UPDATE team_stats SET expected_goals = expected_goals + 1.5 WHERE match_key = ? AND side = 'home'").run(m.match_key);
db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:30:00.000Z' WHERE match_key = ?").run(m.match_key);
await nuitDeLaTable();
const modifiee = await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE });
const apresTout = instantane(db);
const lignesAvant = new Set(JSON.parse(avantTout).map((r) => JSON.stringify(r)));
sortie.modifiee = {
  status: modifiee.status,
  summary: modifiee.summary,
  details: modifiee.details,
  league: 'EPL',
  mois,
  lignesChangees: JSON.parse(apresTout).filter((r) => !lignesAvant.has(JSON.stringify(r))).length,
  autresChampionnatsIdentiques: instantane(db, 'league <> ?', 'EPL') === avantAutres,
  avantLeMoisIdentiques: instantane(db, 'league = ? AND jour < ?', 'EPL', `${mois}-01`) === avantMois,
  actuellePerimeeRetiree: db.prepare('SELECT COUNT(*) n FROM team_strength WHERE club = 999999999').get().n === 0
};
await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE, force: true, aPart: false });
sortie.nuitEgaleComplet = instantane(db) === apresTout;
marque('rencontre modifiée');

// Une rencontre retirée du magasin : un match de MLS dont les deux clubs ne jouent pas d'autre match ce jour-là.
const r = db
  .prepare(
    `SELECT m.match_key, m.date, m.home_id, m.away_id FROM matches m WHERE m.league = 'MLS'
     AND (SELECT COUNT(*) FROM matches x WHERE x.date = m.date AND (x.home_id IN (m.home_id, m.away_id) OR x.away_id IN (m.home_id, m.away_id))) = 1
     ORDER BY m.date DESC, m.match_key DESC LIMIT 1`
  )
  .get();
const numero = (id) => Number(String(id).replace('fotmob-', ''));
const lignesDuJour = () => db.prepare('SELECT COUNT(*) n FROM team_strength WHERE jour = ? AND club IN (?, ?) AND actuel = 0').get(r.date, numero(r.home_id), numero(r.away_id)).n;
const avantRetrait = lignesDuJour();
for (const t of ['players', 'team_stats', 'matches']) db.prepare(`DELETE FROM ${t} WHERE match_key = ?`).run(r.match_key);
await nuitDeLaTable();
const retiree = await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE });
sortie.retiree = { avant: avantRetrait, apres: lignesDuJour(), status: retiree.status, portee: retiree.details?.portee ?? null };
const apresRetrait = instantane(db);
await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE, force: true, aPart: false });
sortie.retireeEgaleComplet = instantane(db) === apresRetrait;
marque('rencontre retirée');

// La table du jour J « en cours » (une passe interrompue) : l'étape attend, rien d'écrit.
db.prepare("INSERT INTO day_state (cle, valeur) VALUES ('en_cours', '2026-10-05T01:00:00.000Z')").run();
e0 = ecritures(db);
const attente = await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: BASE });
sortie.tablePasAJour = { status: attente.status, summary: attente.summary };
sortie.tablePasAJourEcritures = ecritures(db) - e0;
db.prepare("DELETE FROM day_state WHERE cle = 'en_cours'").run();

// Un calcul à part en échec (une base qui n'existe pas) : rien d'écrit, l'indice précédent reste lu.
e0 = ecritures(db);
const echec = await J.passeIndiceForce(ctx(aujourdhui, true), { database: db, chemin: path.join(path.dirname(BASE), 'absente.db'), force: true });
sortie.echec = { status: echec.status, summary: echec.summary };
sortie.echecEcritures = ecritures(db) - e0;
sortie.apresEchecLu = F.lireIndiceDeForce({ database: db })?.championnats?.length > 0;
marque('attente et échec');

// La route et la lecture, sans aucune écriture.
const ligue = db.prepare("SELECT league, COUNT(*) n FROM team_strength WHERE actuel = 1 AND lieu = 'tous' GROUP BY league ORDER BY n DESC LIMIT 1").get().league;
const club = db.prepare("SELECT club FROM team_strength WHERE league = ? AND actuel = 0 AND lieu = 'tous' GROUP BY club ORDER BY COUNT(*) DESC, club LIMIT 1").get(ligue).club;
const jours = db.prepare("SELECT jour FROM team_strength WHERE club = ? AND actuel = 0 AND lieu = 'tous' ORDER BY jour").all(club).map((x) => x.jour);
const jourDeMatch = jours[Math.floor(jours.length / 2)];
// Un jour sans match du club, entre deux de ses jours de match.
let jourSansMatch = null;
for (let k = 1; k < jours.length && !jourSansMatch; k++) {
  const lendemain = new Date(Date.parse(`${jours[k - 1]}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (lendemain < jours[k]) jourSansMatch = lendemain;
}
sortie.jourDeMatch = jourDeMatch;
sortie.jourSansMatch = jourSansMatch;
e0 = ecritures(db);
const enc = encodeURIComponent;
sortie.routes = {
  etat: await get('/api/match-stats/team-strength'),
  ligue: await get(`/api/match-stats/team-strength?league=${enc(ligue)}`),
  club: await get(`/api/match-stats/team-strength?club=fotmob-${club}&historique=oui`),
  avantJour: await get(`/api/match-stats/team-strength?club=${club}&jour=${jourDeMatch}`),
  avantJourSansMatch: await get(`/api/match-stats/team-strength?club=${club}&jour=${jourSansMatch}`),
  refus: {
    nom: await get('/api/match-stats/team-strength?club=Nacional'),
    lieu: await get(`/api/match-stats/team-strength?league=${enc(ligue)}&lieu=partout`),
    jour: await get(`/api/match-stats/team-strength?club=${club}&jour=05/10/2026`)
  }
};
sortie.routesEcritures = ecritures(db) - e0;
marque('routes');

// Deux homonymes : deux clubs de deux championnats, renommés pareil dans l'annuaire — chacun garde SA ligne.
const deux = db.prepare("SELECT league, MIN(club) club FROM team_strength WHERE actuel = 1 AND lieu = 'tous' GROUP BY league ORDER BY league LIMIT 2").all();
for (const x of deux) db.prepare("UPDATE teams SET name = 'Nacional' WHERE team_id = ?").run(`fotmob-${x.club}`);
invalidateRegistryCaches();
const lu = deux.map((x) => F.lireIndiceDeForce({ database: db, club: x.club }));
sortie.homonymes = {
  nom1: lu[0].nom,
  nom2: lu[1].nom,
  club1: `fotmob-${deux[0].club}`,
  club2: `fotmob-${deux[1].club}`,
  championnat1: lu[0].lignes.tous.championnat,
  championnat2: lu[1].lignes.tous.championnat,
  lu1: lu[0].club,
  lu2: lu[1].club,
  attendus: deux.map((x) => x.league)
};

// Le banc sur la copie, ses variantes dans un registre d'ESSAI.
const fichier = path.join(process.env.CM_TEST_DOSSIER, 'registre-essai.json');
const mesure = executerSansPause(B.mesurerAuBanc({ database: db, tirages: 200, declarer: true, registre: { fichier } }));
const registre = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const { veille } = executerSansPause(B.classementsDeLaVeille(db));
const epl = db.prepare("SELECT match_key, date, home_id, away_id, meta FROM matches WHERE league = 'EPL' ORDER BY date, match_key").all();
const premier = veille.get(epl[0].match_key)?.reel;
const vus = new Map();
let veilleSansLeMatch = true;
for (const x of epl) {
  let meta = null;
  try {
    meta = JSON.parse(x.meta);
  } catch {
    meta = null;
  }
  if (!compteAuClassementXg(meta)) continue;
  // Les cumuls repartent à chaque saison (EPL : juillet).
  const saison = Number(x.date.slice(5, 7)) >= 7 ? Number(x.date.slice(0, 4)) : Number(x.date.slice(0, 4)) - 1;
  const h = `${saison}|${x.home_id}`;
  const e = `${saison}|${x.away_id}`;
  const v = veille.get(x.match_key)?.reel;
  if (!v || v.nDom !== (vus.get(h) ?? 0) || v.nExt !== (vus.get(e) ?? 0)) veilleSansLeMatch = false;
  vus.set(h, (vus.get(h) ?? 0) + 1);
  vus.set(e, (vus.get(e) ?? 0) + 1);
}
sortie.banc = {
  variantes: mesure.variantes,
  registre: { ids: (registre.etapes['29']?.variantes ?? []).map((v) => v.id), ou: (registre.etapes['29']?.variantes ?? []).map((v) => v.ou) },
  jugements: mesure.jugements.length,
  // Chaque jugement : ses matchs dans sa période (P3 : 2023-01-01 → 2024-06-30 ; P4b + P5 : depuis 2025-07-01).
  fenetresDansLaPeriode: mesure.jugements.every((j) => j.n === 0 || (j.periode === 'P3' ? j.fenetre.de >= '2023-01-01' && j.fenetre.a <= '2024-06-30' : j.fenetre.de >= '2025-07-01')),
  lignesJugees: mesure.jugements.map((j) => `${j.periode}:${j.id}:${j.n}`),
  principal: mesure.reponse?.verdict ?? mesure.jugements[0]?.verdict ?? null,
  premierMatch: premier ? { nDom: premier.nDom, nExt: premier.nExt } : null,
  veilleSansLeMatch
};
marque('banc');
sortie.totalMs = Math.round(performance.now() - t0);
closeDb();
process.stdout.write(`${JSON.stringify(sortie)}\n`);
