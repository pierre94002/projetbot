/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-controle-quotidien.mjs <serveur de la copie> <phase>
 *
 * Étape 14 — le contrôle quotidien des données, la santé des sources, le badge
 * « à vérifier ». Base = la copie de la base d'essai, réseau coupé, heure
 * figée au 05/10/2026 12 h UTC (fenêtre du contrôle : 05/09 → 05/10/2026).
 * Tout ce qui est examiné est PLANTÉ dans la copie (SQL direct, fichiers de
 * data/runtime) ; la base d'essai n'est jamais touchée. Sortie : une ligne JSON.
 *
 * Lancé dans un BAC SIMULÉ (aides/bacSimule.mjs, `executerDansLeBac`), où que
 * le test tourne : le code s'y reconnaît dans le bac — clés vidées, sources
 * « coupées par le bac », actualisation coupée — comme dans le vrai bac, où
 * ces essais ont été écrits. Les scénarios d'un serveur « réel » (clés
 * présentes) passent CONFIG_REELLE, jamais un emplacement. Le script refuse de
 * tourner s'il ne se reconnaît pas dans le bac.
 *
 * Phases :
 *   scores     la liste des écarts de l'étape 13 et l'historique football-data PLANTÉS : un écart non expliqué,
 *              quatre expliqués (prolongation, tirs au but, résultat attribué, prolongation lue dans le déroulé) ;
 *              une heure plus tard (toujours rouge), 26 h plus tard (rouges « connus », orange), puis corrigé
 *   faux-score la veille (anomalies de la base d'essai trouvées, puis « connues » : feu orange), puis un FAUX SCORE
 *              introduit dans le magasin (Leeds – Newcastle 4-1 → 4-3) : le feu passe au rouge
 *   argentine  les cartons jaunes de la Premier League mis à 0 des deux côtés, le déroulé en compte : le cas argentin
 *   reperes    des repères PLANTÉS (étape 15) : une saison à +6,7 écarts normaux de buts, un match à 35 corners
 *   sources    l'état de chaque source lu dans des notes PLANTÉES, avec un faux fetch qui compte (jamais appelé)
 *   fotmob     les réponses FotMob notées au passage (faux FotMob) : forme attendue, forme inattendue, accès refusé
 *   fotmob-relu  un autre processus relit le suivi enregistré (redémarrage)
 *   apifootball  le compteur noté à chaque vrai appel, jamais la clé ; un appel sans clé n'est pas un appel
 *   badge      « à vérifier » sur le journal des pronostics (route), les lignes des Opportunités, un match par ses noms
 *   joueurs    un écart de BUTEURS (façon Celtic – Ferencváros) et de GARDIENS planté dans la copie, puis un FAUX SCORE : le
 *              prochain match de leurs clubs, marché par marché (journal, Opportunités, analyse), et le compte de la carte
 *   duree      la passe sur la base d'essai : durée, main rendue au serveur
 *   etape      l'étape « controleQuotidien » telle que la passe la lance (verrou, rapport d'omissions, fichiers)
 *   route      GET /api/health/checks, /sources, PUT /jeton-claude, GET /api/refresh — base intacte
 *   ecran      les réponses du vrai serveur pour le rendu des cartes (jamais, prêt, sources)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const RUNTIME = path.join(serveur, 'data', 'runtime');
const MAINTENANT = Date.parse('2026-10-05T12:00:00.000Z');
const HEURE = 3_600_000;

// Le bac doit être SIMULÉ (aides/bacSimule.mjs) : sans lui, « les sources coupées par le bac » ne seraient vraies que dans le vrai bac.
const { modeBacASable } = await imp('config/bacASable.js');
if (!modeBacASable()) throw new Error("Ce script suppose le bac à sable : le lancer par aides/bacSimule.mjs (preparerCopieDeBac, executerDansLeBac), pas par executer.");

const { openDb, closeDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const D = await imp('data/db/dailyChecks.js');

const empreinte = () => crypto.createHash('sha1').update(fs.readFileSync(BASE)).digest('hex');
const ecrireRuntime = (nom, contenu) => {
  fs.mkdirSync(path.dirname(path.join(RUNTIME, nom)), { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
};
const lireRuntime = (nom) => (fs.existsSync(path.join(RUNTIME, nom)) ? JSON.parse(fs.readFileSync(path.join(RUNTIME, nom), 'utf8')) : null);
const etatRuntime = () => (fs.existsSync(RUNTIME) ? Object.fromEntries(fs.readdirSync(RUNTIME).sort().map((f) => [f, fs.statSync(path.join(RUNTIME, f)).mtimeMs])) : {});
/** Combien de lignes cette connexion a écrites depuis son ouverture. */
const ecrituresDe = (db) => db.prepare('SELECT total_changes() AS n').get().n;

/** La configuration d'un serveur « réel » (clés présentes) : dans le bac, les clés sont vidées. */
const CONFIG_REELLE = { actualisation: true, intervalleMinutes: 180, cotesGratuites: true, cleOddsApi: true, cleApiFootball: true, jetonClaude: true, bac: false };

async function requeteExpress(app, methode, url, corps = undefined) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
    if (corps !== undefined) {
      const texte = JSON.stringify(corps);
      req.headers['content-length'] = String(Buffer.byteLength(texte));
      req.push(texte);
    }
    req.push(null);
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let r = null;
      try {
        r = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: r });
      return res;
    };
    app.handle(req, res, reject);
  });
}

// ------------------------------------------------------------------ plantations

const parCle = (db, cle) => db.prepare('SELECT match_key, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta, events FROM matches WHERE match_key = ?').get(cle);

/** Des clubs football-data et des lignes d'historique (table fd_history, étape 13), rattachées à leur rencontre du magasin. */
function planterFd(db, lignes) {
  const club = (nom) => {
    db.prepare("INSERT OR IGNORE INTO fd_teams (pays, nom) VALUES ('ENG', ?)").run(nom);
    return db.prepare("SELECT id FROM fd_teams WHERE pays = 'ENG' AND nom = ?").get(nom).id;
  };
  const ins = db.prepare('INSERT INTO fd_history (code, saison, date, date_fichier, dom, ext, match_key, lien, bd, be) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const l of lignes) ins.run(l.code ?? 'E0', l.saison ?? '2026-27', l.date, l.date, club(l.dom), club(l.ext), l.matchKey, l.lien, l.bd, l.be);
  const fichier = db.prepare("INSERT OR REPLACE INTO fd_fichiers (fichier, code, saison, statut, lu_le, lignes, updated_at) VALUES (?, ?, ?, 'importe', '2026-10-04T10:00:00.000Z', ?, '2026-10-04T10:00:00.000Z')");
  for (const code of [...new Set(lignes.map((l) => l.code ?? 'E0'))]) fichier.run(`mmz4281/2627/${code}`, code, '2627', lignes.filter((l) => (l.code ?? 'E0') === code).length);
}

/** La liste des écarts que l'étape 13 garde (résumé de l'historique, odds_source_state 'fd-historique' / 'resume'). */
async function planterListeEtape13(db, ecarts) {
  const { writeSourceState } = await imp('data/db/oddsQuotesRepository.js');
  writeSourceState('fd-historique', 'resume', { detail: { calculeLe: '2026-10-04T10:00:00.000Z', totaux: { matchs: 1000, ecarts: ecarts.length }, ecarts: { total: ecarts.length, liste: ecarts } } }, { database: db });
}

const meta = (m) => JSON.parse(m.meta ?? '{}');
const majMatch = (db, cle, { home_goals, away_goals, meta: m, events } = {}) => {
  const avant = parCle(db, cle);
  db.prepare('UPDATE matches SET home_goals = ?, away_goals = ?, meta = ?, events = ? WHERE match_key = ?').run(
    home_goals ?? avant.home_goals,
    away_goals ?? avant.away_goals,
    m === undefined ? avant.meta : JSON.stringify(m),
    events === undefined ? avant.events : JSON.stringify(events),
    cle
  );
};
const buts = (liste) => liste.map(([side, minute], i) => ({ type: 'goal', minute, side, player: `Buteur ${i + 1}` }));

/**
 * Les écarts de score plantés : quatre EXPLIQUÉS et un NON EXPLIQUÉ, et des lignes football-data
 * « rattachées au même score » pour toutes les rencontres de la Premier League de la fenêtre.
 */
async function planterLesEcarts(db) {
  // Une rencontre de coupe de la fenêtre, sans motif ni lignes joueur : changer son score ne trouble pas l'audit des buteurs.
  const efl = db
    .prepare(
      `SELECT match_key FROM matches m WHERE league IN ('EFL Cup', 'Coppa Italia - Italy', 'US Open Cup') AND date >= '2026-09-05' AND json_extract(meta, '$.reason') IS NULL
       AND NOT EXISTS (SELECT 1 FROM players p WHERE p.match_key = m.match_key) ORDER BY date, match_key LIMIT 1`
    )
    .get().match_key;
  const cas = {
    tirsAuBut: '2026-09-15-peterborough-united-barnsley',
    prolongation: '2026-08-24-hallescher-fc-schalke-04',
    attribue: '2026-09-05-brentford-sunderland',
    deroule: efl,
    nonExplique: '2026-09-05-millwall-bolton'
  };
  // Résultat attribué : FotMob donne 3-0 (tapis vert), football-data le score du terrain (1-1).
  majMatch(db, cas.attribue, { home_goals: 3, away_goals: 0, meta: { ...meta(parCle(db, cas.attribue)), awarded: 1, reason: 'awarded_win' } });
  // Prolongation que FotMob ne dit pas : 2-1 avec un but à la 105e ; à 90 minutes, 1-1.
  majMatch(db, cas.deroule, { home_goals: 2, away_goals: 1, meta: { ...meta(parCle(db, cas.deroule)), reason: null }, events: buts([['home', 30], ['away', 60], ['home', 105]]) });
  // Non expliqué : FotMob 4-0, déroulé complet dans le temps réglementaire ; football-data 3-0.
  majMatch(db, cas.nonExplique, { home_goals: 4, away_goals: 0, events: buts([['home', 10], ['home', 20], ['home', 30], ['home', 40]]) });
  const fd = {
    tirsAuBut: [4, 3],
    prolongation: [2, 2],
    attribue: [1, 1],
    deroule: [1, 1],
    nonExplique: [3, 0]
  };
  const liste = [];
  for (const [quoi, cle] of Object.entries(cas)) {
    const m = parCle(db, cle);
    liste.push({ code: 'E0', league: m.league, saison: '2026-27', date: m.date, dom: `${m.home_name} (fd)`, ext: `${m.away_name} (fd)`, scoreFootballData: `${fd[quoi][0]}-${fd[quoi][1]}`, matchKey: cle });
  }
  await planterListeEtape13(db, liste);
  // L'historique de la fenêtre : la Premier League, rattachée au même score (lien = 1).
  const epl = db.prepare("SELECT match_key, date, home_name, away_name, home_goals, away_goals FROM matches WHERE league = 'EPL' AND date >= '2026-09-05' AND home_goals IS NOT NULL ORDER BY date, match_key").all();
  planterFd(
    db,
    epl.map((m) => ({ date: m.date, dom: m.home_name, ext: m.away_name, matchKey: m.match_key, lien: 1, bd: m.home_goals, be: m.away_goals }))
  );
  return { cas, fd, eplFenetre: epl.length };
}

/** Le cas argentin, en Premier League : jaunes publiés à 0 des deux côtés, rouges relevés, le déroulé compte deux jaunes. */
function planterJaunesAZero(db) {
  const cles = db
    .prepare("SELECT m.match_key FROM matches m WHERE m.league = 'EPL' AND m.date >= '2026-09-05' AND EXISTS (SELECT 1 FROM team_stats t WHERE t.match_key = m.match_key) ORDER BY m.date, m.match_key")
    .all()
    .map((r) => r.match_key);
  db.prepare(`UPDATE team_stats SET yellow_cards = 0 WHERE match_key IN (${cles.map(() => '?').join(',')})`).run(...cles);
  db.prepare("UPDATE team_stats SET red_cards = 1 WHERE side = 'home' AND match_key = ?").run(cles[0]);
  for (const cle of cles) {
    const m = parCle(db, cle);
    const ev = JSON.parse(m.events ?? '[]').filter((e) => !(e.type === 'card' && e.card === 'yellow'));
    ev.push({ type: 'card', minute: 20, side: 'home', player: 'Joueur A', card: 'yellow' }, { type: 'card', minute: 70, side: 'away', player: 'Joueur B', card: 'yellow' });
    db.prepare('UPDATE matches SET events = ? WHERE match_key = ?').run(JSON.stringify(ev), cle);
  }
  // Deux jaunes à 0 seulement en Serie A : sous le seuil (5 matchs et la moitié du championnat), jamais signalé.
  const italie = db.prepare("SELECT match_key FROM matches WHERE league = 'Serie A - Italy' AND date >= '2026-09-05' AND EXISTS (SELECT 1 FROM team_stats t WHERE t.match_key = matches.match_key) ORDER BY date, match_key LIMIT 2").all().map((r) => r.match_key);
  db.prepare(`UPDATE team_stats SET yellow_cards = 0 WHERE match_key IN (${italie.map(() => '?').join(',')})`).run(...italie);
  return { epl: cles.length, italie: italie.length };
}

/** Des repères (table league_benchmarks, étape 15) PLANTÉS : une Premier League 2026-27 à 4,2 buts par match, une Championship ordinaire. */
function planterReperes(db) {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO league_benchmarks (league, saison, repere, debut, valeur, matchs, ecart, source, detail, calcule_le) VALUES (?, ?, ?, ?, ?, ?, ?, 'fotmob', ?, '2026-10-05T03:00:00.000Z')`
  );
  const saisons = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
  const ligne = (league, saison, repere, valeur, matchs, ecart) => ins.run(league, saison, repere, Number(saison.slice(0, 4)), valeur, matchs, ecart, null);
  for (const s of saisons) {
    ligne('EPL', s, 'matchs', 380, 380, null);
    ligne('EPL', s, 'buts', 2.8, 380, 1.67);
    ligne('Championship', s, 'matchs', 552, 552, null);
    ligne('Championship', s, 'corners', 10.5, 552, 3.4);
    ligne('Serie A - Italy', s, 'matchs', 380, 380, null);
    ligne('Serie A - Italy', s, 'buts', 2.6, 380, 1.6);
  }
  ligne('EPL', '2026-27', 'matchs', 80, 80, null);
  ligne('EPL', '2026-27', 'buts', 4.2, 80, 1.9);
  ligne('Championship', '2026-27', 'matchs', 90, 90, null);
  ligne('Championship', '2026-27', 'corners', 10.6, 90, 3.3);
  // Très loin de l'attendu, mais sur 20 matchs seulement : pas assez pour dire « hors repères ».
  ligne('Serie A - Italy', '2026-27', 'matchs', 20, 20, null);
  ligne('Serie A - Italy', '2026-27', 'buts', 4.5, 20, 1.8);
  const general = db.prepare(
    `INSERT OR REPLACE INTO league_benchmarks (league, saison, repere, debut, valeur, matchs, ecart, source, detail, calcule_le) VALUES ('*', 'toutes', ?, NULL, ?, ?, ?, 'fotmob+football-data', ?, '2026-10-05T03:00:00.000Z')`
  );
  general.run('buts', 2.7, 10000, 1.65, JSON.stringify({ k: 500, variance: 2.75, tau2Saisons: 0.01, ligues: 3, parMatch: 2.75, tau2: 0.004 }));
  general.run('corners', 10.2, 10000, 3.4, JSON.stringify({ k: 400, variance: 11.5, tau2Saisons: 0.05, ligues: 3, parMatch: 11.5, tau2: 0.02 }));
  // Un match à 35 corners en Championship (20 + 15).
  const cle = '2026-09-05-portsmouth-cardiff';
  db.prepare("UPDATE team_stats SET corner_kicks = CASE side WHEN 'home' THEN 20 ELSE 15 END WHERE match_key = ?").run(cle);
  return { aberrant: cle };
}

/**
 * La base d'essai s'arrête au 21/09/2026 : vu du 05/10, le magasin n'a « rien reçu depuis » (raison générale de
 * « à vérifier »). Une rencontre de coupe reçue la veille (sans feuille, clubs d'essai) le remet à jour.
 */
function rafraichirLeMagasin(db) {
  db.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_goals, away_goals, updated_at, meta, home_id, away_id, fotmob_id)
     VALUES ('2026-10-04-essai-a-essai-b', 'essai', '2026-10-04', 'EFL Cup', 'Essai A', 'Essai B', 1, 0, '2026-10-05T10:00:00.000Z', '{"noSheet":1}', 'fotmob-990001', 'fotmob-990002', '990009')`
  ).run();
}

const sourcesDe = async (config = null) => {
  const { etatDesSources } = await imp('data/sourceHealth.js');
  return etatDesSources({ maintenant: MAINTENANT, config });
};
const resumer = (etat) => ({
  feu: etat.feu,
  compte: etat.compte,
  controles: Object.fromEntries(etat.controles.map((c) => [c.cle, { statut: c.statutLe, total: c.total, classe: c.classe, constats: (c.constats ?? []).map((x) => ({ id: x.id, classe: x.classe, texte: x.texte, detail: x.detail, sorte: x.sorte ?? null, matchKey: x.matchKey, clubs: x.clubs, familles: x.familles, aVerifier: x.aVerifier, trouveLe: x.trouveLe, raison: x.raison })) }])),
  aVerifier: etat.aVerifier,
  fenetre: etat.fenetre,
  dureeMs: etat.dureeMs,
  blocMaxMs: etat.blocMaxMs,
  pauses: etat.pauses,
  vus: etat.vus
});

const sortie = { phase };

// ====================================================================== phases

if (phase === 'scores') {
  const db = openDb();
  sortie.plante = await planterLesEcarts(db);
  const sources = await sourcesDe();
  // 1. Le contrôle sur les écarts plantés — sans rien écrire dans la base.
  const avant = ecrituresDe(db);
  const premier = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT, sources });
  sortie.ecrituresPendantLeControle = ecrituresDe(db) - avant;
  sortie.premier = resumer(premier);
  // 2. Une heure plus tard, rien de corrigé : le rouge, trouvé il y a moins de 24 h, reste rouge.
  const second = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT + HEURE, precedent: premier, sources });
  sortie.second = resumer(second);
  // 3. Vingt-six heures plus tard, rien de corrigé : les rouges sont « connus », orange, et restent listés.
  const troisieme = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT + 26 * HEURE, precedent: second, sources });
  sortie.troisieme = resumer(troisieme);
  // 4. Le même état lu au moment de la lecture (re-daté) : la règle de couleur est la même.
  sortie.relu25h = D.etatAuMoment(second, { maintenant: MAINTENANT + 26 * HEURE, sources }).feu;
  // 5. Corrigé (le magasin dit maintenant le score de football-data) : l'écart disparaît du contrôle suivant.
  db.prepare('UPDATE matches SET home_goals = 3 WHERE match_key = ?').run(sortie.plante.cas.nonExplique);
  const corrige = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT + 27 * HEURE, precedent: troisieme, sources });
  sortie.corrige = resumer(corrige);
  closeDb();
} else if (phase === 'faux-score') {
  const db = openDb();
  // L'historique football-data de la Premier League de la fenêtre, rattaché au même score que le magasin.
  const epl = db.prepare("SELECT match_key, date, home_name, away_name, home_goals, away_goals FROM matches WHERE league = 'EPL' AND date >= '2026-09-05' AND home_goals IS NOT NULL ORDER BY date, match_key").all();
  planterFd(db, epl.map((m) => ({ date: m.date, dom: m.home_name, ext: m.away_name, matchKey: m.match_key, lien: 1, bd: m.home_goals, be: m.away_goals })));
  const sources = await sourcesDe();
  // La veille : les anomalies de la base d'essai (classements) sont trouvées ; le lendemain, elles sont « connues », orange.
  const veille = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT - 25 * HEURE, sources });
  sortie.veille = { feu: veille.feu, compte: veille.compte };
  const avant = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT, precedent: veille, sources });
  sortie.avant = resumer(avant);
  // LE FAUX SCORE : Leeds – Newcastle, 4-1 au magasin et chez football-data, passe à 4-3 dans le magasin.
  const faux = '2026-09-14-leeds-newcastle';
  sortie.faux = { cle: faux, avant: [parCle(db, faux).home_goals, parCle(db, faux).away_goals], ids: [parCle(db, faux).home_id, parCle(db, faux).away_id] };
  db.prepare('UPDATE matches SET away_goals = 3 WHERE match_key = ?').run(faux);
  const apres = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT + HEURE, precedent: avant, sources });
  sortie.apres = resumer(apres);
  sortie.badge = D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-10', homeId: sortie.faux.ids[0], awayId: 'fotmob-1', famille: 'buts' });
  // Buteurs et gardiens (données de joueurs) ne marquent pas un marché de buts ; ils marquent un marché de joueur, et ne sont pas dans le résumé du match.
  sortie.badgeJoueur = D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-10', homeId: sortie.faux.ids[0], awayId: 'fotmob-1', famille: D.familleDuMarche('anytimeScorer') });
  sortie.badgeResume = D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-10', homeId: sortie.faux.ids[0], awayId: 'fotmob-1', famille: null });
  closeDb();
} else if (phase === 'argentine') {
  const db = openDb();
  const sources = await sourcesDe();
  const avant = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT, sources });
  sortie.avant = resumer(avant);
  sortie.plante = planterJaunesAZero(db);
  const apres = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT, precedent: avant, sources });
  sortie.apres = resumer(apres);
  sortie.badge = {
    cartons: D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-08', famille: 'cartons' }),
    buts: D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-08', famille: 'buts' }),
    toutes: D.aVerifierDuMatch(apres, { league: 'EPL', date: '2026-10-08', famille: null }),
    autreLigue: D.aVerifierDuMatch(apres, { league: 'Championship', date: '2026-10-08', famille: 'cartons' })
  };
  closeDb();
} else if (phase === 'reperes') {
  const db = openDb();
  sortie.plante = planterReperes(db);
  const { valeursAttendues } = await imp('data/db/leagueBenchmarks.js');
  sortie.attendus = { epl: valeursAttendues('EPL', '2026-27', { database: db }).reperes.buts, italie: valeursAttendues('Serie A - Italy', '2026-27', { database: db }).reperes.buts };
  const etat = await D.lancerControleQuotidien({ database: db, maintenant: MAINTENANT, sources: await sourcesDe() });
  sortie.etat = resumer(etat);
  closeDb();
} else if (phase === 'sources') {
  // Un faux fetch qui COMPTE : rien ici ne doit l'appeler (la garde coupe déjà le réseau).
  let appels = 0;
  globalThis.fetch = async (...a) => {
    appels++;
    throw new Error(`fetch interdit dans la lecture de la santé des sources (${a[0]})`);
  };
  const db = openDb();
  const { writeJsonAtomic } = await imp('utils/atomicJson.js');
  // --- les notes d'un serveur en bonne santé
  planterFd(db, [{ date: '2026-10-01', dom: 'A', ext: 'B', matchKey: null, lien: 0, bd: 1, be: 0 }]);
  const passe = (etapes, finishedAt = '2026-10-05T09:00:00.000Z') => ({ id: finishedAt, reason: 'périodique', startedAt: finishedAt, finishedAt, durationMs: 1000, outcome: 'ok', steps: etapes });
  const refreshBon = {
    version: 1,
    running: null,
    lastCompletedAt: '2026-10-05T09:00:00.000Z',
    stepsLastSuccess: { calendrier: '2026-10-05T09:00:00.000Z', nouvelles: '2026-10-05T09:00:00.000Z', feuilles: '2026-10-05T09:00:00.000Z', cotesPassees: '2026-10-05T03:00:00.000Z', cotesGratuites: '2026-10-05T09:00:00.000Z' },
    alerts: { contradictions: null, audit: null, cotes: null },
    history: [
      passe([
        { key: 'calendrier', label: 'Calendrier et résultats', status: 'ok', summary: 'ok' },
        { key: 'nouvelles', label: 'Nouvelles rencontres terminées', status: 'ok', summary: 'ok' },
        { key: 'cotesPassees', label: 'Cotes passées (football-data.co.uk)', status: 'ok', summary: '1 200 cotes rattachées sur 1 210 lignes.' },
        { key: 'cotesGratuites', label: 'Cotes gratuites', status: 'ok', summary: 'ok', details: { sources: [{ source: 'espn', nom: 'ESPN', written: 120 }, { source: 'kalshi', nom: 'Kalshi', written: 40 }] } }
      ])
    ]
  };
  writeJsonAtomic(path.join(RUNTIME, 'refresh-status.json'), refreshBon);
  ecrireRuntime('releve-payant.json', { version: 1, at: '2026-10-05T08:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl', 'soccer_france_ligue_one'], echecs: [], matchs: 120, quota: { restants: 412, utilises: 88 }, cout: 37, coutParCle: {}, matchsParCle: {} });
  ecrireRuntime('compteur-api-football.json', { version: 1, jours: { '2026-10-05': { appels: 3, echecs: 0, premier: '2026-10-05T07:00:00.000Z', dernier: '2026-10-05T07:30:00.000Z' } }, dernier: { le: '2026-10-05T07:30:00.000Z', jour: '2026-10-05', ok: true, statut: 200, chemin: '/fixtures', limiteJour: 100, restantJour: 97, erreur: null } });
  ecrireRuntime('jeton-claude.json', { version: 1, expireLe: '2027-09-30', majLe: '2026-10-01T10:00:00.000Z' });
  ecrireRuntime('journal-claude/2026-10-05.json', { version: 1, jour: '2026-10-05', canal: 'claude-code', majLe: '2026-10-05T08:00:00.000Z', totaux: null, appels: [{ id: 'a1', at: '2026-10-05T08:00:00.000Z', jour: '2026-10-05', canal: 'claude-code', type: 'avance', statut: 'ok', tokens: { total: 15000 } }] });
  const { __testing: R } = await imp('data/relevesDesSources.js');
  R.viderSuiviFotmob();
  sortie.bon = await sourcesDe(CONFIG_REELLE);
  // --- les mêmes notes, ce serveur sans clé (le bac) : coupées, jamais « en panne »
  sortie.bac = await sourcesDe();
  // --- les notes d'un serveur en difficulté
  ecrireRuntime('releve-payant.json', { version: 1, at: '2026-10-04T08:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl'], echecs: [], matchs: 40, quota: { restants: 20, utilises: 480 }, cout: 37, coutParCle: {}, matchsParCle: {} });
  ecrireRuntime('compteur-api-football.json', { version: 1, jours: { '2026-10-05': { appels: 95, echecs: 1, premier: '2026-10-05T07:00:00.000Z', dernier: '2026-10-05T11:30:00.000Z' } }, dernier: { le: '2026-10-05T11:30:00.000Z', jour: '2026-10-05', ok: true, statut: 200, chemin: '/fixtures', limiteJour: 100, restantJour: 5, erreur: null } });
  ecrireRuntime('jeton-claude.json', { version: 1, expireLe: '2026-10-01', majLe: '2026-09-01T10:00:00.000Z' });
  ecrireRuntime('sante-fotmob.json', { version: 1, enregistreLe: '2026-10-05T09:00:00.000Z', depuis: '2026-10-05T06:00:00.000Z', requetes: 40, reussites: 34, echecs: 6, erreursDeSuite: 6, derniereReussite: '2026-10-05T07:00:00.000Z', derniereErreur: { le: '2026-10-05T09:00:00.000Z', type: 'liste-du-jour', nature: 'acces-refuse', statut: 403, message: 'HTTP 403' }, parType: {} });
  db.prepare("INSERT OR REPLACE INTO fd_fichiers (fichier, code, saison, statut, lu_le, erreur, essais, updated_at) VALUES ('mmz4281/2627/E1', 'E1', '2627', 'echec', NULL, 'HTTP 503', 2, '2026-10-05T03:00:00.000Z')").run();
  writeJsonAtomic(path.join(RUNTIME, 'refresh-status.json'), { ...refreshBon, alerts: { ...refreshBon.alerts, cotes: { sources: [{ source: 'kalshi', name: 'Kalshi', error: 'HTTP 500' }], updatedAt: '2026-10-05T09:00:00.000Z' } } });
  sortie.pannes = await sourcesDe(CONFIG_REELLE);
  // --- l'étape 46 : l'état de FotMob, lu dans les notes enregistrées
  const { etatFotmob } = await imp('data/sourceHealth.js');
  sortie.etatFotmob = etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE });
  // --- un relevé payant d'un mois précédent, un jeton illisible, des crédits épuisés ce mois-ci
  ecrireRuntime('releve-payant.json', { version: 1, at: '2026-09-20T08:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl'], echecs: [], matchs: 40, quota: { restants: 10, utilises: 490 }, cout: 37, coutParCle: {}, matchsParCle: {} });
  ecrireRuntime('jeton-claude.json', '{ pas du json');
  sortie.moisPrecedent = (await sourcesDe(CONFIG_REELLE)).sources;
  ecrireRuntime('releve-payant.json', { version: 1, at: '2026-10-05T10:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl'], echecs: [], matchs: 40, quota: { restants: 0, utilises: 500 }, cout: 37, coutParCle: {}, matchsParCle: {} });
  sortie.epuise = (await sourcesDe(CONFIG_REELLE)).sources.find((s) => s.cle === 'odds-api');
  // --- la lecture complète (route, contrôle) n'appelle rien non plus
  const { createApp } = await imp('app.js');
  const app = createApp();
  sortie.route = await requeteExpress(app, 'GET', '/api/health/sources');
  sortie.checks = (await requeteExpress(app, 'GET', '/api/health/checks')).code;
  sortie.appelsFetch = appels;
  closeDb();
} else if (phase === 'fotmob') {
  const P = await imp('data/providers/fotMobProvider.js');
  const R = await imp('data/relevesDesSources.js');
  const { etatFotmob } = await imp('data/sourceHealth.js');
  R.__testing.viderSuiviFotmob();
  const reponses = { liste: null, statut: 200, brut: null };
  const appels = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith('https://www.fotmob.com/api/data/')) throw new Error(`Appel réseau interdit dans les tests (${u})`);
    appels.push(u);
    if (reponses.brut) return { status: 200, ok: true, json: async () => JSON.parse(reponses.brut) };
    return { status: reponses.statut, ok: reponses.statut < 400, json: async () => JSON.parse(JSON.stringify(reponses.liste ?? {})) };
  };
  const bonne = { leagues: [{ ccode: 'ENG', name: 'Premier League', id: 47, matches: [{ id: 101, leagueId: 47, home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' }, status: { utcTime: '2026-10-05T14:00:00Z', started: false, finished: false } }] }] };
  reponses.liste = bonne;
  sortie.liste = await P.fetchMatchesByDate('2026-10-05');
  sortie.apresBonne = { suivi: R.suiviFotmobEnMemoire(), etat: etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE }) };
  // Une forme inattendue : des matchs sans identifiant de club ni heure.
  reponses.liste = { leagues: [{ ccode: 'ENG', name: 'Premier League', id: 47, matches: [{ id: 102, status: { started: false } }] }] };
  sortie.listeInattendue = await P.fetchMatchesByDate('2026-10-06');
  sortie.apresInattendue = { suivi: R.suiviFotmobEnMemoire(), etat: etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE }) };
  // Une réponse illisible (une page HTML de contrôle à la place du JSON).
  reponses.brut = '<html>contrôle</html>';
  try {
    await P.fetchLiveDetail('555');
  } catch (error) {
    sortie.illisible = error.name;
  }
  reponses.brut = null;
  // L'accès refusé, cinq fois de suite : en panne.
  reponses.statut = 403;
  reponses.liste = {};
  for (let i = 0; i < 5; i++) {
    try {
      await P.fetchLiveDetail(String(900 + i));
    } catch (error) {
      sortie.refus = error.message;
    }
  }
  sortie.apresRefus = { suivi: R.suiviFotmobEnMemoire(), etat: etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE }) };
  sortie.enregistre = R.enregistrerSuiviFotmob({ maintenant: MAINTENANT });
  sortie.fichier = lireRuntime('sante-fotmob.json');
  sortie.appels = appels.length;
  sortie.partage = P.sharedDayListStats();
  // FotMob répond de nouveau : la série d'échecs s'arrête, il n'est plus en panne (le fichier enregistré, lui, reste celui d'avant).
  reponses.statut = 200;
  reponses.liste = bonne;
  await P.fetchMatchesByDate('2026-10-07');
  sortie.apresRetour = etatFotmob({ maintenant: MAINTENANT, config: CONFIG_REELLE });
} else if (phase === 'fotmob-relu') {
  const { etatFotmob } = await imp('data/sourceHealth.js');
  sortie.etat = etatFotmob({ maintenant: MAINTENANT + HEURE, config: CONFIG_REELLE });
} else if (phase === 'apifootball') {
  const R = await imp('data/relevesDesSources.js');
  const entetes = new Map([['x-ratelimit-requests-limit', '100'], ['x-ratelimit-requests-remaining', '97']]);
  const avecGet = { get: (n) => entetes.get(n) ?? null };
  for (let i = 0; i < 3; i++) R.noterAppelApiFootball({ chemin: '/fixtures?team=33&season=2024', ok: true, statut: 200, entetes: avecGet, maintenant: MAINTENANT + i * 60_000 });
  // Le dernier appel noté, celui des matchs d'un club : son chemin, jamais ses paramètres.
  sortie.brutApresTrois = fs.readFileSync(path.join(RUNTIME, 'compteur-api-football.json'), 'utf8');
  R.noterAppelApiFootball({ chemin: '/teams', ok: false, erreur: new Error('fetch failed pour la clé abcdefghijklmnopqrstuvwxyz0123456789'), maintenant: MAINTENANT + 5 * 60_000 });
  sortie.compteur = lireRuntime('compteur-api-football.json');
  sortie.brut = fs.readFileSync(path.join(RUNTIME, 'compteur-api-football.json'), 'utf8');
  // Quinze jours de notes : seuls les quatorze derniers restent.
  for (let j = 1; j <= 15; j++) R.noterAppelApiFootball({ chemin: '/teams', ok: true, statut: 200, entetes: avecGet, maintenant: MAINTENANT - j * 86_400_000 });
  sortie.jours = Object.keys(lireRuntime('compteur-api-football.json').jours).sort();
  // Le vrai client : sans clé (le bac la vide), aucun appel, rien de noté ; avec une clé (d'essai) et un faux fetch, l'appel est noté.
  fs.rmSync(path.join(RUNTIME, 'compteur-api-football.json'));
  const client = await imp('data/providers/apiFootballClient.js');
  const { env } = await imp('config/env.js');
  try {
    await client.searchTeamsRaw('Arsenal');
  } catch (error) {
    sortie.sansCle = error.message;
  }
  sortie.sansCleFichier = fs.existsSync(path.join(RUNTIME, 'compteur-api-football.json'));
  env.apiFootball.apiKey = 'cle-d-essai-qui-ne-doit-jamais-apparaitre';
  let vu = null;
  globalThis.fetch = async (url, options) => {
    vu = { url: String(url), entete: Boolean(options?.headers?.['x-apisports-key']) };
    return { status: 200, ok: true, headers: { get: (n) => entetes.get(n) ?? null }, json: async () => ({ response: [{ team: { id: 42, name: 'Arsenal' } }], errors: [] }) };
  };
  sortie.avecCle = await client.searchTeamsRaw('Arsenal');
  sortie.vu = vu;
  sortie.apresAppel = fs.readFileSync(path.join(RUNTIME, 'compteur-api-football.json'), 'utf8');
} else if (phase === 'badge') {
  const db = openDb();
  const plante = await planterLesEcarts(db);
  planterJaunesAZero(db);
  rafraichirLeMagasin(db);
  const { executerControleQuotidien, preparerAVerifier, preparerAVerifierParNoms } = await imp('data/controleQuotidien.js');
  const { etat } = await executerControleQuotidien({ database: db, maintenant: MAINTENANT });
  sortie.aVerifier = etat.aVerifier;
  const millwall = parCle(db, plante.cas.nonExplique);
  const arsenal = parCle(db, '2026-09-06-arsenal-chelsea');
  const stoke = parCle(db, '2026-09-05-stoke-charlton');
  sortie.noms = { millwall: millwall.home_name, bolton: millwall.away_name, arsenal: arsenal.home_name, chelsea: arsenal.away_name, stoke: stoke.home_name, charlton: stoke.away_name };
  const base = { action: 'PASS', edgePercent: 0, predictedOdds: 1.8, firstSeenAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-10-01T10:00:00.000Z', settledAt: null };
  const p = (id, x) => ({ id, day: '2026-10-01', ...base, ...x });
  ecrireRuntime('predictions.json', [
    p('a', { matchId: 'cal-a', homeName: millwall.home_name, awayName: 'Swansea', league: 'Championship', commenceTime: '2026-10-08T14:00:00Z', market: 'Total buts', marketId: 'totalGoals', predictedLabel: 'Plus de 2.5 buts', status: 'pending' }),
    p('b', { matchId: 'cal-b', homeName: stoke.home_name, awayName: stoke.away_name, league: 'Championship', commenceTime: '2026-10-08T14:00:00Z', market: 'Total buts', marketId: 'totalGoals', predictedLabel: 'Moins de 2.5 buts', status: 'pending' }),
    p('c1', { matchId: 'cal-c', homeName: arsenal.home_name, awayName: arsenal.away_name, league: 'EPL', commenceTime: '2026-10-09T14:00:00Z', market: 'Cartons', marketId: 'totalCards', predictedLabel: 'Plus de 3.5 cartons', status: 'pending' }),
    p('c2', { matchId: 'cal-c', homeName: arsenal.home_name, awayName: arsenal.away_name, league: 'EPL', commenceTime: '2026-10-09T14:00:00Z', market: 'Résultat', marketId: 'result', predictedLabel: `${arsenal.home_name} gagne`, status: 'pending' }),
    p('d', { matchId: 'cal-d', homeName: millwall.home_name, awayName: millwall.away_name, league: 'Championship', commenceTime: '2026-08-01T14:00:00Z', market: 'Total buts', marketId: 'totalGoals', predictedLabel: 'Plus de 1.5 buts', status: 'correct', settledAt: '2026-08-01T18:00:00.000Z' }),
    p('e', { matchId: 'cal-e', homeName: millwall.home_name, awayName: millwall.away_name, league: 'Championship', commenceTime: `${millwall.date}T14:00:00Z`, market: 'Total buts', marketId: 'totalGoals', predictedLabel: 'Plus de 2.5 buts', status: 'correct', settledAt: `${millwall.date}T18:00:00.000Z` })
  ]);
  const { createApp } = await imp('app.js');
  const app = createApp();
  const r = await requeteExpress(app, 'GET', '/api/predictions');
  sortie.predictions = Object.fromEntries((r.corps?.entries ?? []).map((e) => [e.id, e.aVerifier ?? null]));
  // Le champ n'existe que s'il y a une raison (jamais « aVerifier: null »).
  sortie.avecChamp = Object.fromEntries((r.corps?.entries ?? []).map((e) => [e.id, Object.hasOwn(e, 'aVerifier')]));
  sortie.predictionsCode = r.code;
  sortie.predictionsIntactes = JSON.stringify((r.corps?.entries ?? []).map(({ aVerifier, ...reste }) => reste).sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(lireRuntime('predictions.json').sort((a, b) => a.id.localeCompare(b.id)));
  // Les lignes de la page Opportunités : par identifiants, le verdict et le tri intacts.
  const { marquerAVerifier } = await imp('data/opportunities.js');
  const verdict = { etat: 'value', vert: true, pourcent: 4.2, cote: 2.1, bookmaker: 'William Hill' };
  const lignes = [
    { cle: 'x|home', league: 'Championship', commenceTime: '2026-10-08T14:00:00Z', homeId: millwall.home_id, awayId: 'fotmob-1', marche: 'home', verdict },
    { cle: 'y|over25', league: 'Championship', commenceTime: '2026-10-08T14:00:00Z', homeId: stoke.home_id, awayId: stoke.away_id, marche: 'over25', verdict }
  ];
  const marquees = marquerAVerifier(lignes, { maintenant: MAINTENANT });
  sortie.opportunites = marquees.map((l) => ({ cle: l.cle, aVerifier: l.aVerifier ?? null, verdictIdentique: JSON.stringify(l.verdict) === JSON.stringify(verdict), memeObjet: l === lignes.find((x) => x.cle === l.cle) }));
  // Un match par ses noms (journal, analyse) : les clubs par l'annuaire du magasin, puis par identifiant.
  const parNoms = preparerAVerifierParNoms({ maintenant: MAINTENANT });
  sortie.parNoms = {
    millwall: parNoms({ league: 'Championship', date: '2026-10-08', homeName: millwall.home_name, awayName: 'Club inconnu de l annuaire', famille: 'buts' }),
    inconnus: parNoms({ league: 'Championship', date: '2026-10-08', homeName: 'Club inconnu A', awayName: 'Club inconnu B', famille: 'buts' }),
    cartonsEpl: parNoms({ league: 'EPL', date: '2026-10-09', homeName: stoke.home_name, awayName: 'X', famille: 'cartons' }),
    // La même écriture à la casse près : le même club.
    casse: parNoms({ league: 'Championship', date: '2026-10-08', homeName: millwall.home_name.toUpperCase(), awayName: 'X', famille: 'buts' }),
    // Tous les mots de « Millwall » dans un autre nom : JAMAIS le même club (aucun rapprochement souple).
    motsInclus: parNoms({ league: 'Championship', date: '2026-10-08', homeName: `${millwall.home_name} Athletic Reserves`, awayName: 'X', famille: 'buts' })
  };
  const verifier = preparerAVerifier({ maintenant: MAINTENANT });
  sortie.sansGeneral = verifier({ league: 'Championship', date: millwall.date, homeId: millwall.home_id, awayId: millwall.away_id, famille: 'buts', global: false });
  closeDb();
} else if (phase === 'joueurs') {
  // Retouche du 07/10/2026 : un écart de BUTEURS ou de GARDIENS (données de joueurs) ne marque aucun pronostic d'aujourd'hui ;
  // un faux score, lui, les marque tous. Trois passes du contrôle sur la même copie : propre, écarts de joueurs, faux score.
  const db = openDb();
  rafraichirLeMagasin(db);
  // L'historique football-data de la Premier League de la fenêtre, rattaché au même score que le magasin (comme « faux-score »).
  const epl = db.prepare("SELECT match_key, date, home_name, away_name, home_goals, away_goals FROM matches WHERE league = 'EPL' AND date >= '2026-09-05' AND home_goals IS NOT NULL ORDER BY date, match_key").all();
  planterFd(db, epl.map((m) => ({ date: m.date, dom: m.home_name, ext: m.away_name, matchKey: m.match_key, lien: 1, bd: m.home_goals, be: m.away_goals })));
  const { executerControleQuotidien, preparerAVerifier, preparerAVerifierParNoms } = await imp('data/controleQuotidien.js');
  const { marquerAVerifier } = await imp('data/opportunities.js');
  const { MARCHES_SAISIE } = await imp('data/saisiesCotes.js');
  const { MARKET_LABELS } = await imp('sports/football/markets.js');
  const { createApp } = await imp('app.js');
  const app = createApp();
  // Trois rencontres de la Premier League dont les clubs n'ont aucun constat dans la base d'essai (le classement officiel n'en parle pas).
  const cles = { buteurs: '2026-09-12-bournemouth-brentford', gardiens: '2026-09-13-coventry-brighton', faux: '2026-09-14-leeds-newcastle' };
  const clubs = Object.fromEntries(
    Object.entries(cles).map(([quoi, cle]) => {
      const m = parCle(db, cle);
      return [quoi, { cle, dom: m.home_name, ext: m.away_name, domId: m.home_id, extId: m.away_id, score: [m.home_goals, m.away_goals] }];
    })
  );
  // Les marchés d'aujourd'hui : ceux du moteur et ceux qu'on peut saisir à la main, sauf le marché de joueur (« anytimeScorer »).
  const marchesDuMoteur = [...new Set([...Object.keys(MARKET_LABELS), ...MARCHES_SAISIE.filter((m) => !m.joueur).map((m) => m.id)])];
  const JOUR = '2026-10-10';
  const raisonsDe = (r) => (r ? r.raisons.map((x) => `${x.controle}`).sort() : null);

  /** Une passe du contrôle (l'état est gardé dans data/runtime comme l'étape de l'actualisation le fait), puis ce que voit Pierre. */
  const passe = async (decalageHeures, { corps = false } = {}) => {
    const maintenant = MAINTENANT + decalageHeures * HEURE;
    const { etat } = await executerControleQuotidien({ database: db, maintenant });
    const verifier = preparerAVerifier({ maintenant });
    const parNoms = preparerAVerifierParNoms({ maintenant, database: db });
    const gardeEnFichier = lireRuntime('controle-quotidien.json');
    const resume = (cle) => {
      const c = etat.controles.find((x) => x.cle === cle);
      return { statut: c.statutLe, total: c.total, parClasse: c.parClasse, constats: c.constats.map((x) => ({ texte: x.texte, raison: x.raison, familles: x.familles, aVerifier: x.aVerifier, clubs: x.clubs, classe: x.classe })) };
    };
    // Le prochain match d'un club (à domicile, puis à l'extérieur), marché par marché : quels contrôles le marquent.
    const prochain = (quoi) => {
      const k = clubs[quoi];
      const parMarche = (marche, id, domicile) =>
        raisonsDe(verifier({ league: 'EPL', date: JOUR, homeId: domicile ? id : 'fotmob-1', awayId: domicile ? 'fotmob-1' : id, famille: D.familleDuMarche(marche) }));
      const ids = { dom: k.domId, ext: k.extId };
      const sortieClub = {};
      for (const [camp, id] of Object.entries(ids)) {
        sortieClub[camp] = {
          aDomicile: Object.fromEntries([...marchesDuMoteur, 'anytimeScorer'].map((m) => [m, parMarche(m, id, true)])),
          alExterieur: { result: parMarche('result', id, false), totalCorners: parMarche('totalCorners', id, false), anytimeScorer: parMarche('anytimeScorer', id, false) }
        };
      }
      // Par les noms (le journal des pronostics et l'analyse d'un match) : le résumé d'un match (sans famille) = le bandeau.
      // Le résumé tel que l'analyse d'un match le joint (et que le bandeau le lit), puis ce qu'il dit.
      sortieClub.bandeau = parNoms({ league: 'EPL', date: JOUR, homeName: k.dom, awayName: 'Club inconnu', famille: null });
      sortieClub.analyse = raisonsDe(sortieClub.bandeau);
      sortieClub.badgeScorer = verifier({ league: 'EPL', date: JOUR, homeId: k.domId, awayId: 'fotmob-1', famille: D.familleDuMarche('anytimeScorer') });
      return sortieClub;
    };
    // Le compte de la carte (la route que la carte lit), et le même compte refait SANS la règle : combien de clubs ont, pour leur prochain match, un badge sur au moins un marché d'aujourd'hui.
    const route = await requeteExpress(app, 'GET', '/api/health/checks');
    const index = gardeEnFichier.aVerifier.clubs;
    const parBadge = Object.keys(index).filter((id) => ['buts', 'corners', 'tirs', 'cartons'].some((f) => D.aVerifierDuMatch(gardeEnFichier, { league: null, date: JOUR, homeId: id, famille: f }) !== null));
    const joueursSeuls = Object.keys(index).filter((id) => !parBadge.includes(id));
    return {
      feu: etat.feu,
      buteurs: resume('buteurs-score'),
      gardiens: resume('gardiens-score'),
      footballData: resume('score-football-data'),
      prochains: { buteurs: prochain('buteurs'), gardiens: prochain('gardiens'), faux: prochain('faux') },
      carte: { code: route.code, aVerifier: route.corps?.aVerifier ?? null, ...(corps ? { corps: route.corps } : {}) },
      index: { clubs: Object.keys(index).length, parBadge: parBadge.length, joueursSeuls: joueursSeuls.sort() },
      global: gardeEnFichier.aVerifier.global.length
    };
  };

  sortie.clubs = clubs;
  sortie.marchesDuMoteur = marchesDuMoteur;
  sortie.registres = {
    saisie: MARCHES_SAISIE.map((m) => ({ id: m.id, joueur: m.joueur, famille: D.familleDuMarche(m.id) })),
    moteur: Object.keys(MARKET_LABELS).map((id) => ({ id, famille: D.familleDuMarche(id) }))
  };
  // 1. La base d'essai telle quelle : aucun constat pour ces clubs.
  sortie.propre = await passe(0);
  // 2. Un écart de BUTEURS façon Celtic – Ferencváros (le score est bon, mais les buts crédités aux joueurs de l'équipe qui reçoit ne le font pas)
  //    et un écart de GARDIENS façon Antofagasta – Deportes Iquique (le gardien de l'équipe qui reçoit n'encaisse rien pour 5 buts adverses).
  db.prepare("UPDATE players SET goals = 0 WHERE match_key = ? AND side = 'home'").run(cles.buteurs);
  db.prepare("UPDATE players SET goals_conceded = 0 WHERE match_key = ? AND side = 'home' AND goals_conceded IS NOT NULL").run(cles.gardiens);
  sortie.ecartsDeJoueurs = await passe(1, { corps: true });
  // 3. Un FAUX SCORE (Leeds – Newcastle 4-1 → 4-3, football-data dit 4-1) : tous les marchés de ses deux clubs sont à vérifier.
  db.prepare('UPDATE matches SET away_goals = 3 WHERE match_key = ?').run(cles.faux);
  sortie.fauxScore = await passe(2);
  // 4. Ce que disent le journal des pronostics et la page Opportunités, avec un marché de buteur FABRIQUÉ (le moteur n'en calcule aucun).
  const base = { action: 'PASS', edgePercent: 0, predictedOdds: 1.8, firstSeenAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-10-01T10:00:00.000Z', settledAt: null, status: 'pending', league: 'EPL', commenceTime: `${JOUR}T14:00:00Z`, day: '2026-10-01' };
  const pronostic = (id, club, marche, marketId, label) => ({ id, ...base, matchId: `cal-${id}`, homeName: club.dom, awayName: 'Club inconnu', market: marche, marketId, predictedLabel: label });
  ecrireRuntime('predictions.json', [
    pronostic('b-resultat', clubs.buteurs, 'Résultat', 'result', `${clubs.buteurs.dom} gagne`),
    pronostic('b-corners', clubs.buteurs, 'Total corners', 'totalCorners', 'Plus de 9.5 corners'),
    pronostic('b-buteur', clubs.buteurs, 'Buteur (à tout moment)', 'anytimeScorer', 'Un joueur marque'),
    pronostic('b-ancien', clubs.buteurs, 'Buteur — Haaland', undefined, 'Haaland marque'),
    pronostic('f-resultat', clubs.faux, 'Résultat', 'result', `${clubs.faux.dom} gagne`),
    pronostic('f-buteur', clubs.faux, 'Buteur (à tout moment)', 'anytimeScorer', 'Un joueur marque')
  ]);
  const journal = await requeteExpress(app, 'GET', '/api/predictions');
  sortie.journal = { code: journal.code, parId: Object.fromEntries((journal.corps?.entries ?? []).map((e) => [e.id, e.aVerifier ? { controles: raisonsDe(e.aVerifier), texte: e.aVerifier.texte, brut: e.aVerifier } : null])) };
  const verdict = { etat: 'value', vert: true, pourcent: 4.2, cote: 2.1, bookmaker: 'William Hill' };
  const ligne = (cle, club, marche) => ({ cle, league: 'EPL', commenceTime: `${JOUR}T14:00:00Z`, homeId: club.domId, awayId: 'fotmob-1', marche, verdict });
  sortie.opportunites = marquerAVerifier([ligne('b|home', clubs.buteurs, 'home'), ligne('b|buteur', clubs.buteurs, 'anytimeScorer'), ligne('f|home', clubs.faux, 'home')], { maintenant: MAINTENANT + 3 * HEURE }).map((l) => ({ cle: l.cle, controles: raisonsDe(l.aVerifier ?? null) }));
  closeDb();
} else if (phase === 'duree') {
  const db = openDb();
  let pauses = 0;
  const debut = Date.now();
  const etat = await D.lancerControleQuotidien({
    database: db,
    maintenant: MAINTENANT,
    sources: await sourcesDe(),
    rendreLaMain: () => {
      pauses++;
      return new Promise((fin) => setImmediate(fin));
    }
  });
  sortie.mesure = { dureeMs: etat.dureeMs, blocMaxMs: etat.blocMaxMs, blocMaxOu: etat.blocMaxOu, pausesEtat: etat.pauses, pausesComptees: pauses, temps: etat.temps, controles: etat.controles.length, rencontres: etat.fenetre.rencontres, total: Date.now() - debut };
  closeDb();
} else if (phase === 'etape') {
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  let db = openDb();
  const plante = await planterLesEcarts(db);
  const millwall = parCle(db, plante.cas.nonExplique);
  const stoke = parCle(db, '2026-09-05-stoke-charlton');
  closeDb();
  const e0 = empreinte();
  const omissions = {
    leagues: 1,
    seasons: 1,
    played: 40,
    failed: [],
    missing: [{ league: 'Championship', season: '2026/2027', matchId: '990001', date: '2026-09-20', round: '7', homeId: millwall.home_id, awayId: stoke.home_id, homeName: millwall.home_name, awayName: stoke.home_name, homeGoals: 1, awayGoals: 0, finished: true, played: true }]
  };
  const runtimeAvant = etatRuntime();
  sortie.passe = await withRefreshLock(() => job.__testing.passeControleQuotidien({ omissions, manuel: false, derniere: () => null }), { stamp: false });
  closeDb();
  sortie.baseIntacte = empreinte() === e0;
  sortie.fichierControle = lireRuntime('controle-quotidien.json');
  sortie.fichierFotmob = lireRuntime('sante-fotmob.json');
  sortie.nouveauxFichiers = Object.keys(etatRuntime()).filter((f) => !(f in runtimeAvant));
  db = openDb();
  sortie.manquants = { millwall: millwall.home_id, stoke: stoke.home_id };
  closeDb();
} else if (phase === 'route' || phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const get = (url) => requeteExpress(app, 'GET', url);
  openDb();
  closeDb();
  const e0 = empreinte();
  const runtimeAvant = etatRuntime();
  sortie.jamais = await get('/api/health/checks');
  sortie.sourcesJamais = await get('/api/health/sources');
  sortie.refreshJamais = (await get('/api/refresh')).corps?.controleQuotidien ?? null;
  sortie.sante = await get('/api/health');
  closeDb();
  sortie.baseIntacteJamais = empreinte() === e0;
  sortie.runtimeIntactJamais = JSON.stringify(etatRuntime()) === JSON.stringify(runtimeAvant);
  // Une passe : écarts, cas argentin et repères plantés, puis l'étape du contrôle.
  const db = openDb();
  await planterLesEcarts(db);
  planterJaunesAZero(db);
  planterReperes(db);
  closeDb();
  const { executerControleQuotidien } = await imp('data/controleQuotidien.js');
  await executerControleQuotidien({ maintenant: MAINTENANT });
  closeDb();
  const e1 = empreinte();
  sortie.pret = await get('/api/health/checks');
  sortie.refreshPret = (await get('/api/refresh')).corps?.controleQuotidien ?? null;
  closeDb();
  sortie.baseIntactePret = empreinte() === e1;
  if (phase === 'route') {
    const put = (corps) => requeteExpress(app, 'PUT', '/api/health/jeton-claude', corps);
    const fichier = path.join(RUNTIME, 'jeton-claude.json');
    sortie.putMauvaiseDate = await put({ expireLe: '2027-02-30' });
    sortie.putChampEnPlus = await put({ expireLe: '2027-09-30', jeton: 'sk-ant-secret' });
    sortie.fichierApresRefus = fs.existsSync(fichier);
    sortie.putBon = await put({ expireLe: '2027-09-30' });
    const mtime = fs.statSync(fichier).mtimeMs;
    sortie.putIdentique = await put({ expireLe: '2027-09-30' });
    sortie.fichierInchange = fs.statSync(fichier).mtimeMs === mtime;
    sortie.putAutre = await put({ expireLe: '2027-10-15' });
    sortie.fichierJeton = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    fs.writeFileSync(fichier, '{ illisible');
    sortie.putIllisible = await put({ expireLe: '2027-10-16' });
    sortie.fichierIllisibleGarde = fs.readFileSync(fichier, 'utf8');
    sortie.inconnue = (await get('/api/health/inconnue')).code;
  } else {
    // Pour l'écran : la santé des sources d'un serveur réel (clés présentes), en bonne santé puis en difficulté.
    const { etatDesSources } = await imp('data/sourceHealth.js');
    sortie.sourcesBac = etatDesSources({ maintenant: MAINTENANT });
    ecrireRuntime('releve-payant.json', { version: 1, at: '2026-10-05T08:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl'], echecs: [], matchs: 120, quota: { restants: 20, utilises: 480 }, cout: 37, coutParCle: {}, matchsParCle: {} });
    ecrireRuntime('compteur-api-football.json', { version: 1, jours: { '2026-10-05': { appels: 4, echecs: 0 } }, dernier: { le: '2026-10-05T07:30:00.000Z', jour: '2026-10-05', ok: true, statut: 200, chemin: '/fixtures', limiteJour: 100, restantJour: 96, erreur: null } });
    ecrireRuntime('jeton-claude.json', { version: 1, expireLe: '2026-10-20', majLe: '2026-10-01T10:00:00.000Z' });
    ecrireRuntime('sante-fotmob.json', { version: 1, enregistreLe: '2026-10-05T09:00:00.000Z', depuis: '2026-10-05T06:00:00.000Z', requetes: 40, reussites: 34, echecs: 6, erreursDeSuite: 6, derniereReussite: '2026-10-05T07:00:00.000Z', derniereErreur: { le: '2026-10-05T09:00:00.000Z', type: 'liste-du-jour', nature: 'acces-refuse', statut: 403, message: 'HTTP 403' }, parType: {} });
    sortie.sourcesReelles = etatDesSources({ maintenant: MAINTENANT, config: CONFIG_REELLE });
  }
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
