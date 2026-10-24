/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-bulletin-page.mjs <serveur de la copie> <phase>
 *
 * Étape 45 — « L'IA À L'ÉCRAN » : les deux routes de lecture ajoutées pour la page « Bulletin » et la page d'un match joué, et les
 * réponses du VRAI serveur dont les écrans ont besoin. Base = la copie de la base d'essai, heure figée au 05/10/2026 12 h UTC.
 * AUCUN appel à Claude (le seul « appel » passe par le faux Claude de decorBulletins.mjs, refusé hors d'une copie d'essai), aucun
 * réseau, aucune écriture hors de la copie.
 *
 * Phases :
 *   deroule    GET /api/match-stats/:matchId/deroule sur des matchs de la base d'essai (penalty, but contre son camp, rouge direct,
 *              deuxième jaune, sans événements, pas joué, inconnu) et sur deux matchs fabriqués dans la copie (lecture récente avec
 *              penalty manqué et blessé ; ancienne lecture avec penalty manqué dans la carte des tirs) : la réponse, les événements
 *              stockés (pour les recompter à la main) et le nombre d'écritures de la base (zéro).
 *   resume     GET /api/match-ai-analysis/dossiers/resume : pas encore calculé, calculé (extrait réel de 3 championnats et 7 clubs,
 *              test/fixtures/dossiers-etape-45.json), d'une autre forme, illisible (503), POST refusé ; et, pour chaque leçon, la
 *              réponse des routes d'une équipe / d'un championnat (la preuve en mots doit être la même).
 *   budget     GET /api/claude-budget dans quatre états (rien d'appelé, un bulletin écrit, économe choisi, budget dépassé).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { importeur, entreesDuJour, entreesDeLaSemaine, installerFauxClaude } from './decorBulletins.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FIXTURE_DOSSIERS = path.join(process.env.CM_TEST_MODULES, 'test', 'fixtures', 'dossiers-etape-45.json');
const sortie = { ok: true, phase };

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const ecritures = () => db.prepare('SELECT total_changes() AS n').get().n;
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : null);

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

const { createApp } = await imp('app.js');
const app = createApp();

// ======================================================================================================== deroule
if (phase === 'deroule') {
  const lignes = db.prepare('SELECT match_key AS cle, events, shotmap, meta, home_goals AS hg, away_goals AS ag FROM matches').all();
  const evenements = (l) => {
    try {
      const e = JSON.parse(l.events ?? 'null');
      return Array.isArray(e) ? e : null;
    } catch {
      return null;
    }
  };
  const buts = (e) => e.filter((x) => x.type === 'goal');
  const trouver = (filtre) => lignes.find((l) => l.hg !== null && l.ag !== null && !JSON.parse(l.meta ?? '{}').reason && !JSON.parse(l.meta ?? '{}').awarded && evenements(l) && filtre(evenements(l)));
  const choix = {
    penalty: trouver((e) => buts(e).some((x) => x.penalty === true || /^penalty$/i.test(x.detail ?? '')) && !e.some((x) => x.type === 'card' && x.card === 'red')),
    contreSonCamp: trouver((e) => buts(e).some((x) => x.ownGoal)),
    rougeDirect: trouver((e) => e.some((x) => x.type === 'card' && x.card === 'red')),
    deuxiemeJaune: trouver((e) => e.some((x) => x.type === 'card' && x.card === 'yellowred')),
    ordinaire: trouver((e) => buts(e).length >= 2 && !buts(e).some((x) => x.ownGoal || x.penalty === true || /^penalty$/i.test(x.detail ?? '')) && !e.some((x) => x.type === 'card' && /red/.test(x.card ?? '')))
  };
  const sansEvenements = lignes.find((l) => l.hg !== null && l.ag !== null && l.events === null);
  choix.sansEvenements = sansEvenements;

  // Deux matchs FABRIQUÉS dans la copie (jamais dans la base d'essai du dépôt) : on prend deux matchs ordinaires et on réécrit leurs
  // événements. Le premier est « de lecture récente » (penalty manqué, blessé, raison de carton, langues du texte minute par minute) ;
  // le second est d'AVANT l'étape 43 (aucun événement « penalty manqué » : il n'existe que dans la carte des tirs).
  const [a, b, c, d, e] = lignes.filter((l) => l.hg !== null && l.ag !== null && !JSON.parse(l.meta ?? '{}').reason && !JSON.parse(l.meta ?? '{}').awarded && l.cle !== choix.ordinaire?.cle && l.cle !== choix.penalty?.cle && l.cle !== sansEvenements?.cle).slice(0, 5);
  const maj = db.prepare('UPDATE matches SET events = ?, shotmap = ?, meta = ?, home_goals = ?, away_goals = ? WHERE match_key = ?');
  const metaDe = (l) => JSON.parse(l.meta ?? '{}');
  maj.run(
    JSON.stringify([
      { type: 'goal', minute: 12, side: 'home', player: 'Premier But', playerId: 'fotmob-1' },
      { type: 'missedpenalty', minute: 30, side: 'away', player: 'Tireur Manqué' },
      { type: 'card', minute: 44, side: 'away', player: 'Rouge Direct', card: 'red', reason: 'serious_foul_play' },
      { type: 'goal', minute: 58, side: 'home', player: 'Sur Penalty', penalty: true, detail: 'Penalty' },
      { type: 'substitution', minute: 62, side: 'away', playerIn: 'Entrant', playerOut: 'Blessé', injured: true },
      { type: 'card', minute: 70, side: 'home', player: 'Deuxième Jaune', card: 'yellowred', reason: 'foul' },
      { type: 'goal', minute: 88, side: 'away', player: 'Défenseur Maladroit', ownGoal: true, detail: 'Own goal' }
    ]),
    null,
    JSON.stringify({ ...metaDe(a), tickerLangs: 'de,en_gen,fr_gen' }),
    2,
    1,
    a.cle
  );
  maj.run(
    JSON.stringify([
      { type: 'goal', minute: 20, side: 'away', player: 'Seul But', playerId: 'fotmob-2' },
      { type: 'substitution', minute: 65, side: 'home', playerIn: 'Un', playerOut: 'Deux' }
    ]),
    JSON.stringify([
      { situation: 'penalty', minute: 55, side: 'home', result: 'AttemptSaved', player: 'Tireur Arrêté' },
      { situation: 'regular', minute: 40, side: 'away', result: 'Goal', player: 'Seul But' }
    ]),
    JSON.stringify(metaDe(b)),
    0,
    1,
    b.cle
  );
  // Le quatrième est un 0-0 sans moment marquant (un remplacement, un jaune) ; le cinquième, un 0-0 dont FotMob n'a publié AUCUN fait (une liste vide).
  maj.run(
    JSON.stringify([
      { type: 'substitution', minute: 60, side: 'home', playerIn: 'Entrant Un', playerOut: 'Sortant Un' },
      { type: 'card', minute: 70, side: 'away', player: 'Jaune Seul', card: 'yellow' }
    ]),
    null,
    d.meta,
    0,
    0,
    d.cle
  );
  maj.run('[]', null, e.meta, 0, 0, e.cle);
  choix.sansMoment = { cle: d.cle };
  choix.videPublie = { cle: e.cle };
  // Le troisième n'est pas encore joué : ni score ni événements (un match du calendrier).
  maj.run(null, null, c.meta, null, null, c.cle);
  choix.pasJoue = { cle: c.cle };
  choix.recent = { cle: a.cle };
  choix.ancien = { cle: b.cle };

  const avant = ecritures();
  const reponses = {};
  for (const [nom, l] of Object.entries(choix)) {
    const r = await requete(app, 'GET', `/api/match-stats/${encodeURIComponent(l.cle)}/deroule`);
    const brut = db.prepare('SELECT events, shotmap, meta, home_goals AS hg, away_goals AS ag FROM matches WHERE match_key = ?').get(l.cle);
    reponses[nom] = { cle: l.cle, code: r.code, corps: r.corps, stocke: { events: brut.events === null ? null : JSON.parse(brut.events), shotmap: brut.shotmap === null ? null : JSON.parse(brut.shotmap), meta: brut.meta === null ? null : JSON.parse(brut.meta), hg: brut.hg, ag: brut.ag } };
  }
  sortie.reponses = reponses;
  const inconnu = await requete(app, 'GET', '/api/match-stats/ce-match-nexiste-pas/deroule');
  sortie.inconnu = inconnu;
  const post = await requete(app, 'POST', `/api/match-stats/${encodeURIComponent(choix.penalty.cle)}/deroule`);
  sortie.post = { code: post.code };
  // La route d'un match (une seule étape) répond toujours comme avant, et celle du déroulé ne lui ressemble pas.
  const entree = await requete(app, 'GET', `/api/match-stats/${encodeURIComponent(choix.penalty.cle)}`);
  sortie.entree = { code: entree.code, aDeroule: Boolean(entree.corps?.deroule), cles: Object.keys(entree.corps ?? {}).sort() };
  sortie.ecritures = { avant, apres: ecritures() };
}

// ======================================================================================================== resume
else if (phase === 'resume') {
  const R = await imp('data/repositories/aiDossiersRepository.js');
  const FICHIER = path.join(RUNTIME, 'ai-dossiers.json');
  const reponses = {};
  const lire = async (url) => requete(app, 'GET', url);
  fs.mkdirSync(RUNTIME, { recursive: true });

  // 1. Pas encore calculé : aucun fichier.
  reponses.absent = (await lire('/api/match-ai-analysis/dossiers/resume')).corps;
  sortie.fichierCree = fs.existsSync(FICHIER);

  // 2. Calculé : l'extrait réel.
  fs.copyFileSync(FIXTURE_DOSSIERS, FICHIER);
  R.__testing.oublier();
  const avantSha = sha1(FICHIER);
  const avantEcritures = ecritures();
  const calcule = await lire('/api/match-ai-analysis/dossiers/resume');
  reponses.calcule = calcule.corps;
  sortie.codeCalcule = calcule.code;
  // La preuve en mots de chaque leçon : celle des routes d'une équipe et d'un championnat (mêmes mots partout).
  const preuves = [];
  for (const genre of ['confirmees', 'retirees']) {
    for (const l of calcule.corps.lecons[genre]) {
      const url = l.portee.genre === 'equipe' ? `/api/match-ai-analysis/dossiers?club=${l.portee.id}` : `/api/match-ai-analysis/dossiers?league=${encodeURIComponent(l.portee.league)}`;
      const r = (await lire(url)).corps;
      const phrases = l.portee.genre === 'equipe' ? r.phrases : r.phrasesChampionnat;
      preuves.push({ genre, cle: l.cle, id: l.id, preuveDite: l.preuveDite, preuveRoute: phrases?.preuves?.[l.id] ?? null });
    }
  }
  reponses.preuves = preuves;
  // Un dossier d'équipe (celui de São Paulo, qui a une leçon confirmée) tel que l'écran de l'équipe le lit.
  reponses.equipe = (await lire('/api/match-ai-analysis/dossiers?club=fotmob-10277')).corps;
  reponses.ligue = (await lire(`/api/match-ai-analysis/dossiers?league=${encodeURIComponent('Brazil Série A')}`)).corps;
  sortie.lectureSeule = { sha1Avant: avantSha, sha1Apres: sha1(FICHIER), ecrituresBase: ecritures() - avantEcritures };
  const post = await requete(app, 'POST', '/api/match-ai-analysis/dossiers/resume');
  sortie.post = { code: post.code };

  // 3. D'une autre forme : lu pour l'écran, jamais remis à l'IA.
  const brut = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  fs.writeFileSync(FICHIER, JSON.stringify({ ...brut, version: 99 }));
  R.__testing.oublier();
  reponses.autreVersion = (await lire('/api/match-ai-analysis/dossiers/resume')).corps;

  // 4. Illisible : 503, jamais pris pour vide.
  fs.writeFileSync(FICHIER, '{ "version": 1, "equi');
  R.__testing.oublier();
  const illisible = await lire('/api/match-ai-analysis/dossiers/resume');
  reponses.illisible = illisible.corps;
  sortie.codeIllisible = illisible.code;
  sortie.intactApresIllisible = fs.readFileSync(FICHIER, 'utf8') === '{ "version": 1, "equi';
  sortie.reponses = reponses;
}

// ======================================================================================================== budget
else if (phase === 'budget') {
  const claudeBudget = await imp('data/repositories/claudeBudgetRepository.js');
  const S = await imp('core/ai/bulletinService.js');
  const { env } = await imp('config/env.js');
  const lire = async () => (await requete(app, 'GET', '/api/claude-budget?force=1')).corps;
  const reponses = {};
  // 1. Rien n'a été appelé : le journal est vide, le budget provisoire. Les analyses automatiques sont COUPÉES pour ce relevé : dans le bac le
  // garde-fou les coupe, ailleurs (une copie, le dépôt) elles suivent AUTO_AI_ANALYSIS — le test ne doit pas dépendre de l'endroit où il tourne.
  env.autoAiAnalysis.enabled = false;
  reponses.vide = await lire();
  // 2. Un bulletin écrit avec le faux Claude (4 000 tokens) : le journal compte, le mode reste normal.
  env.autoAiAnalysis.enabled = true;
  // Premier appel (le bulletin) : 4 000 tokens ; le suivant (le bilan) : 7 000.
  const faux = await installerFauxClaude(serveur, { tokens: (appel, i) => (i === 0 ? 4_000 : 7_000) });
  const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
  const t = Date.parse('2026-10-05T04:10:00Z');
  await S.produireLeBulletin({ maintenant: t, options: { entrees: entreesDuJour({ maintenant: t, jour: '2026-10-05' }) } });
  reponses.normal = await lire();
  // 3. Le mode économe choisi (tout le temps) sous le seuil.
  claudeBudget.enregistrerReglageBudget({ tokensParJour: 1_000_000, tokensParSemaine: 6_000_000, mode: 'econome' });
  reponses.economeChoisi = await lire();
  // 4. Un budget du jour si petit que le bulletin le dépasse : économe tout seul, jauge pleine.
  claudeBudget.enregistrerReglageBudget({ tokensParJour: 10_000, tokensParSemaine: 12_000, mode: 'auto' });
  await S.produireLeBilan({ maintenant: T0, options: { entrees: entreesDeLaSemaine({ maintenant: T0 }) } });
  reponses.depasse = await lire();
  faux.arreter();
  sortie.reponses = reponses;
  sortie.appelsDeClaude = faux.appels.length;
}

else {
  throw new Error(`Phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
