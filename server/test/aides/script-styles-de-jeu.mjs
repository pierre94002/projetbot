/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-styles-de-jeu.mjs <serveur de la copie> <phase>
 *
 * Étape 37 — LES STYLES DE JEU (data/db/teamStyle.js, étape « stylesDeJeu » de l'actualisation) sur la base d'essai,
 * où une carte des tirs et des entraîneurs FABRIQUÉS sont plantés (la base d'essai n'en a presque pas) : des clubs à
 * contre-attaque, d'autres à coups de pied arrêtés, un changement d'entraîneur, un homonyme découvert APRÈS le jour de
 * l'oracle, un identifiant d'entraîneur. Réseau coupé, heure figée. Phases :
 *   nuit     « maintenant » obligatoire ; l'enfant en LECTURE SEULE (la base n'a pas bougé) ; premier calcul = la
 *            reconstruction ; rien de changé → rien ; une rencontre changée → seule elle est RELUE (incrémental) ; une
 *            rencontre disparue → retirée ; un rangement interrompu → tout est relu ; aucune transaction ouverte à un
 *            point d'arrêt ; un autre calcul lourd → reporté ; un échec n'écrit rien ; l'étape de la passe (résumé,
 *            alerte, due, ordre) ;
 *   oracle   L'ORACLE DE LA COPIE TRONQUÉE : une copie où tout ce qui suit J est supprimé range EXACTEMENT les mêmes
 *            styles mensuels jusqu'à J que la copie entière (cran, références, entraîneur et homonyme compris) ; une
 *            rencontre folle plantée le jour J ne change rien d'avant J ; le contrôle anti-fuite : 0 écart, puis un
 *            cache faussé est trouvé ;
 *   lecture  les routes GET /api/match-stats/team-style et /style-duel (200, 400, 404, jamais calculé), le duel mesuré
 *            (une case « retenu » fabriquée) et des réglages différents (rien n'est dit « mesuré ») ;
 *   ecran    les réponses du vrai serveur pour les tests d'écran (avant et après le calcul).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath, backupTo } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const S = await imp('data/db/teamStyle.js');
const L = await imp('utils/calculLourd.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');

const MAINTENANT = new Date().toISOString();
const M = () => MAINTENANT;
const sortie = { ok: true, phase, maintenant: MAINTENANT };
const db = openDb();
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'absent');

// ------------------------------------------------------------ la base plantée

/** Le profil fabriqué d'un club (par son numéro) : sa part de contres et de coups de pied arrêtés. */
const profil = (club) => (club % 5 === 0 ? 'contre' : club % 5 === 1 ? 'cpa' : 'neutre');
const LIGUES = ['EPL', 'Championship', 'MLS'];
const HOMONYME = 'Diego Martinez';

/**
 * Plante, sur les rencontres de LIGUES depuis le 2026-03-01, une carte des tirs (12 tirs par camp, dont penalties, buts
 * contre son camp et une situation inconnue) et des entraîneurs : « Coach <club> », un changement d'entraîneur au
 * premier club d'EPL le 2026-08-15 (avec un identifiant FotMob), et un HOMONYME : « Diego Martinez » au club A avant
 * J, au club B le jour de son premier match après J (dB), puis de nouveau au club A après dB (« Coach A » entre J et
 * dB) : l'alternance A, B, A n'est VUE qu'après J. Rend { clubA, clubB, J, dB }.
 */
function planter(database = db) {
  const rencontres = database
    .prepare(`SELECT match_key, date, league, home_id, away_id FROM matches WHERE league IN (${LIGUES.map(() => '?').join(', ')}) AND date >= '2026-03-01' AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY date, match_key`)
    .all(...LIGUES);
  const num = (id) => Number(String(id).replace('fotmob-', ''));
  const epl = rencontres.filter((m) => m.league === 'EPL');
  const premierClubEpl = num(epl[0].home_id);
  // Le club A (EPL) et le club B (Championship) de l'homonyme : les plus fournis.
  const compter = (liste) => {
    const n = new Map();
    for (const m of liste) for (const id of [m.home_id, m.away_id]) n.set(num(id), (n.get(num(id)) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map((x) => x[0]);
  };
  const clubA = compter(epl).find((c) => c !== premierClubEpl);
  const clubB = compter(rencontres.filter((m) => m.league === 'Championship'))[0];
  const tirs = (camp, club, k) => {
    const p = profil(club);
    const out = [];
    for (let i = 0; i < 12; i++) {
      const situation =
        i === 0 ? 'penalty' : i === 1 && k % 3 === 0 ? 'OwnGoalX' : p === 'contre' && i < 6 ? 'fastbreak' : p === 'cpa' && i < 5 ? (i % 2 ? 'fromcorner' : 'setpiece') : i === 11 ? 'throwinsetpiece' : i === 10 ? 'freekick' : 'regularplay';
      out.push({ side: camp, minute: 5 * i + 1, player: `Joueur ${club}-${i}`, x: 90, y: 34, result: 'miss', xg: 0.1, ...(situation === 'OwnGoalX' ? { ownGoal: true, situation: 'regularplay' } : { situation }) });
    }
    // Une situation inconnue de FotMob : comptée comme un tir, dans aucune catégorie.
    if (k % 7 === 0) out.push({ side: camp, minute: 88, player: `Joueur ${club}-x`, x: 80, y: 30, result: 'miss', situation: 'Nouvelle' });
    return out;
  };
  const J = '2026-09-01';
  const datesDe = (club) => rencontres.filter((m) => num(m.home_id) === club || num(m.away_id) === club).map((m) => m.date);
  const datesA = new Set(datesDe(clubA));
  const dB = datesDe(clubB).find((d) => d >= J && !datesA.has(d) && datesDe(clubA).some((x) => x > d)) ?? null;
  const coachDe = (club, date) => {
    if (club === premierClubEpl && date >= '2026-08-15') return { coach: 'Nouveau Coach', coachId: 777001 };
    if (club === clubA && (date < J || (dB && date > dB))) return { coach: HOMONYME };
    if (club === clubB && date === dB) return { coach: HOMONYME };
    return { coach: `Coach ${club}` };
  };
  const maj = database.prepare('UPDATE matches SET shotmap = ?, lineups = ? WHERE match_key = ?');
  database.exec('BEGIN');
  rencontres.forEach((m, k) => {
    const h = num(m.home_id);
    const a = num(m.away_id);
    maj.run(JSON.stringify([...tirs('home', h, k), ...tirs('away', a, k)]), JSON.stringify({ home: { formation: '4-3-3', ...coachDe(h, m.date) }, away: { formation: '4-4-2', ...coachDe(a, m.date) } }), m.match_key);
  });
  database.exec('COMMIT');
  return { clubA, clubB, premierClubEpl, rencontres: rencontres.length, J, dB };
}

/** Les lignes rangées des trois tables (sans `reglages`), triées. */
function rangees(database = db) {
  const lire = (table, cols, ordre) => database.prepare(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${ordre}`).all().map((x) => ({ ...x }));
  return {
    styles: lire('team_style', S.COLONNES_STYLE, 'club, jour'),
    entraineurs: lire('coach_style', S.COLONNES_ENTRAINEUR, 'entraineur, jour'),
    ingredients: lire('team_style_matches', S.COLONNES_INGREDIENTS, 'match_key, camp')
  };
}
/** LA RECONSTRUCTION complète, ici : toutes les rencontres relues, le calcul, les lignes (sans rien ranger). */
function reconstruction(database = db) {
  const lignes = executerSansPause(S.lireToutesLesRencontres(database));
  const calcul = new S.CalculDesStyles(lignes);
  const { styles, entraineurs } = S.lignesDuCalcul(calcul);
  const tri = (a, cles) => [...a].sort((x, y) => cles.map((k) => (x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0)).find((v) => v !== 0) ?? 0);
  return { styles: tri(styles, ['club', 'jour']), entraineurs: tri(entraineurs, ['entraineur', 'jour']), ingredients: tri(lignes, ['match_key', 'camp']), calcul };
}
const enColonnes = (lignes, colonnes) => lignes.map((l) => Object.fromEntries(colonnes.map((k) => [k, l[k] ?? null])));
function faceALaReconstruction(database = db) {
  const r = reconstruction(database);
  const t = rangees(database);
  const premierEcart = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return { i, attendu: a[i] ?? null, range: b[i] ?? null };
    return null;
  };
  const es = premierEcart(enColonnes(r.styles, S.COLONNES_STYLE), t.styles);
  const ee = premierEcart(enColonnes(r.entraineurs, S.COLONNES_ENTRAINEUR), t.entraineurs);
  const ei = premierEcart(enColonnes(r.ingredients, S.COLONNES_INGREDIENTS), t.ingredients);
  return { styles: t.styles.length, entraineurs: t.entraineurs.length, ingredients: t.ingredients.length, identiques: !es && !ee && !ei, ecartStyle: es, ecartEntraineur: ee, ecartIngredient: ei };
}
const etatCourt = (database = db) => {
  const e = S.etatDesStyles({ database });
  return { absent: e.absent, aJour: e.aJour, jourActuel: e.jourActuel, jusqua: e.jusqua, calculeLe: e.calculeLe, enCours: e.enCours };
};

if (phase === 'nuit') {
  recopierScripts(serveur);
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const J = job.__testing;
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  sortie.plante = planter();

  // 0. Sans « maintenant » : refus.
  sortie.sansMaintenant = await S.stylesDeJeu({ database: db, aPart: false }).then(() => 'accepté', (e) => e.message);

  // 1. Le calcul À PART, réel : l'enfant ouvre la base en lecture seule — ni la base ni son journal ne bougent.
  const fichiers = () => ({ base: sha1(BASE), wal: sha1(`${BASE}-wal`) });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const avantEnfant = fichiers();
  const calc = await S.calculerAPart({ chemin: BASE, precedente: null, force: true, graine: 20261005 });
  sortie.enfant = {
    autrePid: calc.bilan?.aPart?.pid !== process.pid && Number.isInteger(calc.bilan?.aPart?.pid),
    styles: calc.styles.ecrire.length,
    ingredients: calc.ingredients.ecrire.length,
    controle: calc.controle ? { lignes: calc.controle.lignes, ecarts: calc.controle.ecarts.length } : null,
    baseIntacte: JSON.stringify(avantEnfant) === JSON.stringify(fichiers()),
    rssMaxMo: Math.round((calc.bilan?.aPart?.rssMaxOctets ?? 0) / 1048576)
  };

  // 2. Le premier calcul (à part, par la passe de nuit) = la reconstruction ; rien de changé → rien.
  const r1 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: true, maintenant: M });
  sortie.premier = { mode: r1.mode, actuels: r1.actuels, entraineurs: r1.entraineurs, relues: r1.bilanDuCalcul?.relues, controle: r1.controle ? { lignes: r1.controle.lignes, ecarts: r1.controle.ecarts.length } : null, repartition: r1.bilanDuCalcul?.repartition, homonymes: r1.bilanDuCalcul?.homonymes, face: faceALaReconstruction(), etat: etatCourt() };
  const r2 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: true, maintenant: M });
  sortie.rien = { mode: r2.mode };

  // 3. Une rencontre CHANGÉE (nouvelle possession, nouvelle signature) : seule elle est relue.
  const cible = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' AND date >= '2026-08-01' ORDER BY date DESC, match_key LIMIT 1").get().match_key;
  db.prepare("UPDATE team_stats SET ball_possession = CASE side WHEN 'home' THEN 71 ELSE 29 END WHERE match_key = ?").run(cible);
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:00:00.000Z' WHERE match_key = ?").run(cible);
  const r3 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: true, maintenant: M });
  const lue = db.prepare('SELECT poss FROM team_style_matches WHERE match_key = ? ORDER BY camp DESC').all(cible).map((x) => x.poss);
  sortie.incremental = { mode: r3.mode, relues: r3.bilanDuCalcul?.relues, changees: r3.bilanDuCalcul?.changees, possLue: lue, face: faceALaReconstruction() };

  // 4. Une rencontre DISPARUE (fusion, suppression) : ses lignes retirées.
  const partie = db.prepare("SELECT match_key FROM matches WHERE league = 'Championship' AND date >= '2026-08-01' ORDER BY date, match_key LIMIT 1").get().match_key;
  db.prepare('DELETE FROM team_stats WHERE match_key = ?').run(partie);
  db.prepare('DELETE FROM players WHERE match_key = ?').run(partie);
  db.prepare('DELETE FROM matches WHERE match_key = ?').run(partie);
  const r4 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: false, maintenant: M });
  sortie.disparue = { mode: r4.mode, disparues: r4.bilanDuCalcul?.disparues, restantes: db.prepare('SELECT COUNT(*) n FROM team_style_matches WHERE match_key = ?').get(partie).n, face: faceALaReconstruction() };

  // 5. Un rangement INTERROMPU (en_cours posé) : la nuit suivante relit tout et retrouve la reconstruction.
  db.prepare("INSERT OR REPLACE INTO team_style_state (cle, valeur) VALUES ('en_cours', ?)").run(MAINTENANT);
  db.prepare('DELETE FROM team_style WHERE club = (SELECT MIN(club) FROM team_style)').run();
  const interrompu = etatCourt();
  const r5 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: false, maintenant: M });
  sortie.interrompu = { avant: interrompu, mode: r5.mode, toutRelu: r5.bilanDuCalcul?.relues === db.prepare('SELECT COUNT(*) n FROM matches').get().n, face: faceALaReconstruction(), etat: etatCourt() };

  // 6. Aucune transaction ouverte à un point d'arrêt du rangement (les tables vidées : tout est à réécrire).
  db.exec('DELETE FROM team_style; DELETE FROM coach_style;');
  const calcul = executerSansPause(S.calculerLesStyles({ database: db, precedente: null, force: true, graine: null }));
  const ouvertes = [];
  const rangement = S.rangerLesStyles({ database: db, calcul, maintenant: M, tranche: 7 });
  let pas = rangement.next();
  let points = 0;
  while (!pas.done) {
    points++;
    if (db.isTransaction) ouvertes.push(pas.value);
    pas = rangement.next();
  }
  sortie.transactions = { points, ouvertes };

  // 7. Un autre calcul lourd en cours : reporté, rien d'écrit ; un échec (base introuvable pour l'enfant) : rien d'écrit.
  const avantReport = etatCourt().calculeLe;
  const rendre = L.commencerCalculLourd('banc d’essai');
  const r6 = await S.stylesDeJeu({ database: db, chemin: BASE, aPart: true, force: true, maintenant: M });
  rendre();
  const r7 = await S.stylesDeJeu({ database: db, chemin: path.join(path.dirname(BASE), 'absente', 'x.db'), aPart: true, force: true, maintenant: () => '2026-10-05T13:00:00.000Z' });
  sortie.reporte = { mode: r6.mode, raison: r6.raison, inchange: etatCourt().calculeLe === avantReport };
  sortie.echec = { mode: r7.mode, erreur: r7.erreur, inchange: etatCourt().calculeLe === avantReport };

  // 8. L'étape de la passe : résumé, alerte durable, due ; l'ordre des étapes.
  const passe = await J.passeStylesDeJeu({}, { database: db, chemin: BASE, aPart: false, force: true });
  const ctx = (derniere, details = {}) => ({ manuel: false, derniere: () => derniere, derniersDetails: () => details });
  sortie.passe = { status: passe.status, summary: passe.summary, alerte: passe.alert ?? null, changed: passe.changed };
  sortie.due = {
    jamais: J.dueStylesDeJeu(ctx(null), { database: db }),
    aujourdhui: J.dueStylesDeJeu(ctx(MAINTENANT), { database: db }),
    reporte: J.dueStylesDeJeu(ctx(MAINTENANT, { reporte: true }), { database: db }),
    manuel: J.dueStylesDeJeu({ ...ctx(MAINTENANT), manuel: true }, { database: db })
  };
}

if (phase === 'oracle') {
  const p = planter();
  sortie.plante = p;
  const J = p.J;
  // La copie TRONQUÉE : tout ce qui suit J supprimé (dans la copie de travail, jamais ailleurs).
  const fichierTronque = path.join(path.dirname(BASE), 'tronquee.db');
  backupTo(fichierTronque, { database: db });
  const dbT = new DatabaseSync(fichierTronque);
  dbT.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  for (const t of ['team_stats', 'players']) dbT.prepare(`DELETE FROM ${t} WHERE match_key IN (SELECT match_key FROM matches WHERE date >= ?)`).run(J);
  dbT.prepare('DELETE FROM matches WHERE date >= ?').run(J);
  // Le schéma des styles dans la copie tronquée (openDb ne l'ouvre pas : les tables existent déjà, VACUUM INTO les a gardées).
  await S.stylesDeJeu({ database: db, chemin: BASE, aPart: false, maintenant: M });
  await S.stylesDeJeu({ database: dbT, chemin: fichierTronque, aPart: false, maintenant: M });
  const mensuels = (database) => database.prepare(`SELECT ${S.COLONNES_STYLE.join(', ')} FROM team_style WHERE jour <= ? AND jour LIKE '%-01' ORDER BY club, jour`).all(J).map((x) => ({ ...x, actuel: undefined }));
  const a = mensuels(db);
  const b = mensuels(dbT);
  const premier = (x, y) => {
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) return { i, entiere: x[i] ?? null, tronquee: y[i] ?? null };
    return null;
  };
  // L'homonyme découvert APRÈS J : la copie entière ne le sépare pas avant J (le même entraîneur que la copie tronquée).
  const cleA = (database) => database.prepare('SELECT entraineur FROM team_style WHERE club = ? AND jour = ?').get(p.clubA, J)?.entraineur ?? null;
  const actuelA = db.prepare('SELECT entraineur FROM team_style WHERE club = ? AND actuel = 1').get(p.clubA)?.entraineur ?? null;
  sortie.oracle = {
    J,
    lignes: a.length,
    clubs: new Set(a.map((x) => x.club)).size,
    moisDeJ: a.filter((x) => x.jour === J).length,
    identiques: !premier(a, b),
    ecart: premier(a, b),
    homonyme: { auJourJ: { entiere: cleA(db), tronquee: cleA(dbT) }, actuelEntiere: actuelA },
    tronqueeJusqua: S.etatDesStyles({ database: dbT }).jusqua,
    entiereJusqua: S.etatDesStyles({ database: db }).jusqua
  };
  // Une rencontre FOLLE plantée le jour J (possession 95/5, 40 contres) : rien d'avant J ne bouge.
  const folle = db.prepare("SELECT match_key, home_id FROM matches WHERE league = 'EPL' AND date >= ? ORDER BY date, match_key LIMIT 1").get(J);
  db.prepare("UPDATE team_stats SET ball_possession = CASE side WHEN 'home' THEN 95 ELSE 5 END, long_balls = 400 WHERE match_key = ?").run(folle.match_key);
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:59:00.000Z', shotmap = ? WHERE match_key = ?").run(JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ side: 'home', minute: i + 1, player: 'Fou', situation: 'fastbreak' }))), folle.match_key);
  await S.stylesDeJeu({ database: db, chemin: BASE, aPart: false, maintenant: M });
  const apres = mensuels(db);
  sortie.folle = { identiques: !premier(a, apres), changeApres: db.prepare("SELECT COUNT(*) n FROM team_style WHERE jour > ? AND club = ?").get(J, Number(String(folle.home_id).replace('fotmob-', ''))).n };
  // Le contrôle anti-fuite : honnête = 0 écart ; un cache FAUSSÉ (une possession réécrite à la main) : trouvé.
  // Le contrôle lit le CACHE (ce que la nuit calcule) face au second chemin (les tables sources).
  const controler = () => {
    const cache = executerSansPause(S.lireLeCache(db));
    const calc = new S.CalculDesStyles(cache);
    const couples = S.couplesDuControle(S.lignesDuCalcul(calc).styles.filter((l) => l.jour <= J || l.actuel), 20261005);
    return executerSansPause(S.controleDesInstantanes(db, calc, couples));
  };
  const honnete = controler();
  db.exec("UPDATE team_style_matches SET poss = poss + 7 WHERE poss IS NOT NULL AND poss < 80");
  const fausse = controler();
  // La passe de nuit, elle, voit-elle la fuite ? Sa propre graine du jour, sur le cache faussé.
  const nuitFausse = executerSansPause(S.calculerLesStyles({ database: db, precedente: { reglages: S.empreinteDesReglages(), jourActuel: '1999-01-01' }, force: false, graine: 20261005 }));
  sortie.controle = {
    honnetes: { lignes: honnete.lignes, ecarts: honnete.ecarts.length },
    fausse: { lignes: fausse.lignes, ecarts: fausse.ecarts.length, colonnes: [...new Set(fausse.ecarts.map((e) => e.colonne))], exemple: fausse.ecarts[0] ?? null },
    nuit: { lignes: nuitFausse.controle?.lignes ?? null, ecarts: nuitFausse.controle?.ecarts.length ?? null }
  };
  dbT.close();
}

if (phase === 'lecture' || phase === 'ecran') {
  recopierScripts(serveur);
  const ctrl = await imp('api/controllers/matchStats.controller.js');
  const appeler = (fn, query) => {
    const res = { code: 200, corps: null, json(o) { this.corps = o; return this; }, status(c) { this.code = c; return this; } };
    try {
      ctrl[fn]({ query }, res);
      return { code: res.code, corps: res.corps };
    } catch (error) {
      return { code: error.status ?? error.statusCode ?? 500, corps: { error: error.message } };
    }
  };
  const p = planter();
  const club = `fotmob-${p.clubA}`;
  const avant = { equipe: appeler('getTeamStyle', { club }), duel: appeler('getStyleDuel', { home: club, away: `fotmob-${p.clubB}` }) };
  await S.stylesDeJeu({ database: db, chemin: BASE, aPart: false, maintenant: M });
  // Les clubs d'un même championnat (EPL), l'un et l'autre avec un style : le duel.
  const deux = db.prepare("SELECT club FROM team_style WHERE actuel = 1 AND league = 'EPL' ORDER BY n DESC, club LIMIT 2").all().map((x) => `fotmob-${x.club}`);
  const nom = (id) => db.prepare('SELECT name FROM teams WHERE team_id = ?').get(id)?.name ?? null;
  const pret = {
    equipe: appeler('getTeamStyle', { club }),
    equipeDuel: appeler('getTeamStyle', { club: deux[0] }),
    sansCarte: appeler('getTeamStyle', { club: `fotmob-${db.prepare("SELECT club FROM team_style WHERE actuel = 1 AND contre IS NULL ORDER BY n DESC, club LIMIT 1").get()?.club}` }),
    duel: appeler('getStyleDuel', { home: deux[0], away: deux[1] }),
    duelParNoms: appeler('getStyleDuel', { homeName: nom(deux[0]), awayName: nom(deux[1]), league: 'EPL' }),
    nomInconnu: appeler('getStyleDuel', { homeName: 'Club Qui N’existe Pas', awayName: nom(deux[1]), league: 'EPL' }),
    sansClub: appeler('getStyleDuel', { home: deux[0] }),
    mauvais: appeler('getTeamStyle', { club: 'nom:x' }),
    zero: appeler('getTeamStyle', { club: 'fotmob-0' }),
    inconnu: appeler('getTeamStyle', { club: 'fotmob-424242424' })
  };
  // Le duel « mesuré » : une case retenue fabriquée, avec les réglages en service ; puis d'autres réglages.
  const h = S.lireStyleActuel(deux[0], { database: db });
  const a = S.lireStyleActuel(deux[1], { database: db });
  const bancFaux = { le: '2026-10-22', reglages: S.empreinteDesReglages(), K: 53, global: {}, casesJugees: 29, casesTropPetites: 21, cases: [{ dom: h.style, ext: a.style, marche: 'un2', verdict: 'retenu', matchs: 412, gain: 0.004, fourchette: [0.001, 0.007], effet: 0.031, decalage: 0.12 }] };
  const mesure = S.lireLeDuelDeStyles(deux[0], deux[1], { database: db, banc: bancFaux });
  const autresReglages = S.lireLeDuelDeStyles(deux[0], deux[1], { database: db, banc: { ...bancFaux, reglages: 'v0-autre' } });
  if (phase === 'lecture') {
    sortie.avant = { equipe: { code: avant.equipe.code, absent: avant.equipe.corps?.etat?.absent, style: avant.equipe.corps?.style ?? null }, duel: { code: avant.duel.code, duel: avant.duel.corps?.duel ?? null } };
    sortie.route = {
      equipe: { code: pret.equipe.code, style: pret.equipe.corps?.style?.style, historique: pret.equipe.corps?.historique?.length, entraineur: pret.equipe.corps?.entraineur?.nom ?? pret.equipe.corps?.entraineurSansStyle?.nom ?? null, source: pret.equipe.corps?.source, regle: pret.equipe.corps?.regle, base: pret.equipe.corps?.base },
      duel: { code: pret.duel.code, duel: pret.duel.corps?.duel, homeId: pret.duel.corps?.homeId, awayId: pret.duel.corps?.awayId, banc: pret.duel.corps?.banc },
      duelParNoms: { code: pret.duelParNoms.code, homeId: pret.duelParNoms.corps?.homeId, awayId: pret.duelParNoms.corps?.awayId },
      nomInconnu: pret.nomInconnu.code,
      sansClub: pret.sansClub.code,
      mauvais: pret.mauvais.code,
      zero: pret.zero.code,
      inconnu: { code: pret.inconnu.code, style: pret.inconnu.corps?.style ?? null }
    };
    sortie.mesure = { duel: mesure.duel, autresReglages: autresReglages.duel, bancValable: mesure.banc.valable, bancAutre: autresReglages.banc.valable };
    // Le temps de lecture (la page d'une équipe, la page d'un match) : quelques millisecondes.
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) S.lireLeStyleDuClub(club, { database: db });
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) S.lireLeDuelDeStyles(deux[0], deux[1], { database: db });
    sortie.lectureMs = { equipe: (t1 - t0) / 20, duel: (performance.now() - t1) / 20 };
  } else {
    sortie.reponses = { avant, pret: { ...pret, mesure: { code: 200, corps: { ...pret.duel.corps, duel: mesure.duel, banc: mesure.banc } } }, cibles: { club, deux, nomA: nom(club), noms: deux.map(nom) } };
  }
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
