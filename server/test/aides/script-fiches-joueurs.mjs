/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiches-joueurs.mjs <serveur de la copie> <phase>
 *
 * Étape 30 — LES FICHES DES JOUEURS (data/db/playerRatings.js, étape « fichesJoueurs » de l'actualisation) sur la
 * base d'essai, la table du jour J construite ici. Réseau coupé, heure figée. Phases :
 *   nuit     « maintenant » obligatoire ; le calcul À PART (l'enfant en lecture seule : la base n'a pas bougé) ;
 *            premier calcul = la reconstruction complète ; rien de changé → rien ; une feuille TARDIVE ; une FUSION
 *            d'identité (l'ancienne fiche retirée) ; un rangement INTERROMPU (la nuit suivante refait tout) ; aucune
 *            transaction ouverte à un point d'arrêt ; un autre calcul lourd → « reporté » ; l'étape de la passe
 *            (résumé, alerte, due, ordre) ; la table du jour J pas à jour → attente ; un échec n'écrit rien ;
 *   oracle   L'ORACLE DE LA COPIE TRONQUÉE : sur une copie où tout ce qui suit J est supprimé (la table du jour J
 *            refaite), la nuit range EXACTEMENT les fiches et les équipes habituelles que le rejeu donne avant J,
 *            et la force du onze lue (le lecteur de la page du match) = celle du rejeu ; un 9-0 planté le jour J ne
 *            change rien d'avant J ; le contrôle anti-fuite : 0 écart, puis une fuite plantée trouvée ;
 *   lecture  le lecteur de la page du match (avecForceDuOnze, forceDuOnzeDeLaComposition : inconnus, gardien
 *            habituel, < 50 ms, sans table → null) et la route GET /api/match-stats/player-ratings (200, 400, 404).
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

const { openDb, resolveDbPath, upsertMatches, backupTo } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const P = await imp('data/db/playerRatings.js');
const B = await imp('data/db/playerRatingsBanc.js');
const L = await imp('utils/calculLourd.js');
const { TEAM_COLUMNS, PLAYER_COLUMNS } = await imp('data/db/columns.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');

const MAINTENANT = new Date().toISOString();
const M = () => MAINTENANT;
const sortie = { ok: true, phase, maintenant: MAINTENANT };
const db = openDb();
const construireTable = (database = db) => T.construireTableJourJ({ database, rendreLaMain: null, controle: { lignes: 0 } });
const garder = (o, cles) => Object.fromEntries(cles.map((k) => [k, o?.[k] ?? null]));
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'absent');
const rangees = (database = db) => ({
  fiches: database.prepare(`SELECT ${P.COLONNES_FICHE.join(', ')} FROM player_ratings ORDER BY joueur`).all().map((x) => ({ ...x })),
  equipes: database.prepare(`SELECT ${P.COLONNES_EQUIPE.join(', ')} FROM player_ratings_teams ORDER BY club`).all().map((x) => ({ ...x }))
});

/** LA RECONSTRUCTION complète, ici : le rejeu sur toute la table du jour J, les lignes actuelles (sans rien ranger). */
function reconstruction(database = db) {
  const rencontres = executerSansPause(P.chargerLesRencontres(database));
  const rejeu = new P.RejeuDesFiches();
  executerSansPause(P.rejouer(rejeu, rencontres));
  return P.lignesActuelles(rejeu);
}
/** La table rangée face à la reconstruction : fiches et équipes, colonne par colonne, à l'octet. */
function faceALaReconstruction(database = db) {
  const enColonnes = (lignes, colonnes) => lignes.map((l) => Object.fromEntries(colonnes.map((k) => [k, l[k] ?? null])));
  const brut = reconstruction(database);
  const r = { fiches: enColonnes(brut.fiches, P.COLONNES_FICHE), equipes: enColonnes(brut.equipes, P.COLONNES_EQUIPE) };
  const t = rangees(database);
  const premierEcart = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return { i, attendu: a[i] ?? null, range: b[i] ?? null };
    return null;
  };
  const ef = premierEcart(r.fiches, t.fiches);
  const ee = premierEcart(r.equipes, t.equipes);
  return { fiches: t.fiches.length, equipes: t.equipes.length, identiques: !ef && !ee, ecartFiche: ef, ecartEquipe: ee };
}

/** L'entrée d'upsertMatches d'une rencontre existante, avec des changements (le patron de script-forces-buts.mjs). */
function entreeDe(matchKey, changements = {}, retoucherJoueurs = null) {
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(matchKey);
  const parse = (t) => (t ? JSON.parse(t) : null);
  const teamStats = {};
  for (const t of db.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(matchKey)) {
    teamStats[t.side] = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, t[c.column]]).filter(([, v]) => v !== null && v !== undefined));
  }
  const players = { home: [], away: [] };
  for (const p of db.prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord').all(matchKey)) {
    const j = Object.fromEntries(PLAYER_COLUMNS.map((c) => [c.key, p[c.column]]).filter(([, v]) => v !== null && v !== undefined));
    if (j.starter !== undefined) j.starter = j.starter === 1;
    if (j.subbedIn !== undefined) j.subbedIn = j.subbedIn === 1;
    players[p.side]?.push(j);
  }
  if (retoucherJoueurs) retoucherJoueurs(players);
  return { date: m.date, league: m.league, homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, fotmobId: m.fotmob_id, homeGoals: m.home_goals, awayGoals: m.away_goals, events: parse(m.events), lineups: parse(m.lineups), meta: parse(m.meta), shotmap: parse(m.shotmap), sources: ['essai'], teamStats, players, ...changements };
}

/** Les rencontres d'essai qui ont des titulaires identifiés des deux côtés (au moins 10), du plus récent au plus ancien. */
function rencontresAvecOnzes(database = db) {
  return database
    .prepare(`SELECT d.match_key, d.date, d.home, d.away, d.rencontre,
        (SELECT COUNT(*) FROM player_day p WHERE p.rencontre = d.rencontre AND p.camp = 1 AND p.titulaire = 1) th,
        (SELECT COUNT(*) FROM player_day p WHERE p.rencontre = d.rencontre AND p.camp = 0 AND p.titulaire = 1) ta
      FROM day_matches d ORDER BY d.date DESC, d.match_key`)
    .all()
    .filter((r) => r.th >= 10 && r.ta >= 10);
}

if (phase === 'nuit') {
  recopierScripts(serveur);
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const J = job.__testing;
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);

  // 0. Sans « maintenant » : refus ; la table du jour J pas à jour : l'étape attend, rien d'écrit.
  sortie.sansMaintenant = await P.fichesDesJoueurs({ database: db, aPart: false }).then(() => 'accepté', (e) => e.message);
  const attente = await J.passeFichesJoueurs({}, { etatDeLaTable: () => ({ aJour: false, absente: true }), database: db, aPart: false });
  sortie.attente = { status: attente.status, summary: attente.summary, mode: attente.details?.mode, etat: garder(P.etatDesFiches({ database: db }), ['absent', 'aJour']) };
  await construireTable();

  // 1. Le calcul À PART, réel : l'enfant ouvre la base en lecture seule — ni la base ni son journal ne bougent.
  const fichiers = () => ({ base: sha1(BASE), wal: sha1(`${BASE}-wal`) });
  const avantEnfant = fichiers();
  const calc = await P.calculerAPart({ chemin: BASE, precedente: null, force: true, graine: 20261005 });
  sortie.enfant = {
    autrePid: calc.bilan?.aPart?.pid !== process.pid && Number.isInteger(calc.bilan?.aPart?.pid),
    fiches: calc.fiches.ecrire.length,
    equipes: calc.equipes.ecrire.length,
    controle: calc.controle ? { lignes: calc.controle.lignes, ecarts: calc.controle.ecarts.length } : null,
    baseIntacte: JSON.stringify(avantEnfant) === JSON.stringify(fichiers()),
    rssMaxMo: Math.round((calc.bilan?.aPart?.rssMaxOctets ?? 0) / 1048576)
  };

  // 2. Le premier calcul (par l'étape, à part) = la reconstruction complète ; puis rien de changé → rien.
  const premier = await P.fichesDesJoueurs({ database: db, chemin: BASE, aPart: true, maintenant: M });
  sortie.premier = { ...garder(premier, ['mode', 'fiches', 'equipes', 'ecrites', 'retirees', 'jusqua', 'erreur']), controle: premier.controle ? { lignes: premier.controle.lignes, ecarts: premier.controle.ecarts.length } : null, face: faceALaReconstruction(), etat: garder(P.etatDesFiches({ database: db }), ['aJour', 'enCours', 'version']) };
  sortie.second = garder(await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: M }), ['mode', 'ecrites']);

  // 3. Une feuille TARDIVE : les xG d'un titulaire d'un match ancien corrigés après coup (la table du jour J les reprend).
  const cible = rencontresAvecOnzes().at(-1);
  const avant = rangees();
  upsertMatches([entreeDe(cible.match_key, {}, (players) => {
    const p = players.home.find((x) => x.starter && x.playerId);
    p.xgNonPenalty = (p.xgNonPenalty ?? 0) + 2.5;
    p.xg = (p.xg ?? 0) + 2.5;
    p.minutes = p.minutes ?? 90;
  })], { database: db });
  await construireTable();
  const tard = await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: M });
  const apres = rangees();
  const changees = apres.fiches.filter((f) => JSON.stringify(f) !== JSON.stringify(avant.fiches.find((x) => x.joueur === f.joueur))).length;
  sortie.tardive = { ...garder(tard, ['mode', 'ecrites', 'retirees']), changees, toutes: apres.fiches.length, face: faceALaReconstruction() };

  // 4. Une FUSION d'identité (le joueur A devient B dans la table du jour J, comme le fait la nuit de la table) : la
  // fiche de A est RETIRÉE, celle de B porte ses apparitions.
  const a = db
    .prepare('SELECT p.joueur, COUNT(*) n FROM player_day p JOIN team_day t ON t.rencontre = p.rencontre AND t.camp = 1 WHERE p.joue = 1 AND p.minutes > 0 AND t.attribue = 0 GROUP BY p.joueur ORDER BY n DESC, p.joueur LIMIT 1')
    .get();
  const b = 999000001;
  db.prepare('UPDATE player_day SET joueur = ? WHERE joueur = ?').run(b, a.joueur);
  db.prepare("INSERT OR REPLACE INTO day_state (cle, valeur) VALUES ('repere_merges', ?)").run('34|2026-10-05T11:00:00.000Z');
  const fusion = await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: M });
  sortie.fusion = {
    ...garder(fusion, ['mode', 'retirees']),
    ancienne: db.prepare('SELECT COUNT(*) n FROM player_ratings WHERE joueur = ?').get(a.joueur).n,
    nouvelle: db.prepare('SELECT apparitions FROM player_ratings WHERE joueur = ?').get(b)?.apparitions ?? null,
    apparitions: a.n,
    face: faceALaReconstruction().identiques
  };

  // 5. Un rangement INTERROMPU : « en cours » reste, l'état n'est pas à jour, l'étape est due ; la nuit suivante refait tout.
  db.prepare("INSERT OR REPLACE INTO day_state (cle, valeur) VALUES ('repere_merges', ?)").run('35|2026-10-05T11:30:00.000Z');
  const precedente = P.etatDesFiches({ database: db }).empreinte;
  const calcul = executerSansPause(P.calculerLesFiches({ database: db, precedente, graine: null }));
  db.prepare('DELETE FROM player_ratings WHERE joueur IN (SELECT joueur FROM player_ratings LIMIT 3)').run();
  const toutRefaire = executerSansPause(P.calculerLesFiches({ database: db, precedente: null, force: true, graine: null }));
  const rangement = P.rangerLesFiches({ database: db, calcul: toutRefaire, maintenant: M, tranche: 1 });
  let pas = 0;
  while (pas < 3 && !rangement.next().done) pas++;
  rangement.return();
  sortie.interrompu = {
    pas,
    calculAvant: calcul.rien === false,
    transactionOuverte: db.isTransaction,
    etat: garder(P.etatDesFiches({ database: db }), ['aJour', 'enCours']),
    due: J.dueFichesJoueurs({ manuel: false, derniere: () => MAINTENANT }, { database: db }),
    lecteur: P.forceDuOnzeDeLaComposition({ teamId: `fotmob-${cible.home}`, startXI: [{ id: 'fotmob-1', position: 'Defender' }] }, { database: db })?.aJour ?? null
  };
  const reprise = await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: M });
  sortie.reprise = { ...garder(reprise, ['mode', 'ecrites']), face: faceALaReconstruction().identiques, etat: garder(P.etatDesFiches({ database: db }), ['aJour', 'enCours']) };

  // 6. Aucune transaction ouverte à un point d'arrêt du rangement (tables vidées : tout est réécrit, tranches de 50).
  db.prepare('DELETE FROM player_ratings').run();
  db.prepare('DELETE FROM player_ratings_teams').run();
  const tout = executerSansPause(P.calculerLesFiches({ database: db, precedente: null, force: true, graine: null }));
  const g = P.rangerLesFiches({ database: db, calcul: tout, maintenant: M, tranche: 50 });
  let points = 0;
  let ouvertes = 0;
  for (let e = g.next(); !e.done; e = g.next()) {
    points++;
    if (db.isTransaction) ouvertes++;
  }
  sortie.transactions = { pointsDArret: points, ouvertes, face: faceALaReconstruction().identiques };

  // 7. UN CALCUL LOURD À LA FOIS : un banc tourne → les fiches sont reportées, l'étape le dit et reviendra.
  const finBanc = L.commencerCalculLourd('banc d’essai');
  const pendantBanc = await P.fichesDesJoueurs({ database: db, chemin: BASE, aPart: true, force: true, maintenant: M });
  const passeReportee = await J.passeFichesJoueurs({}, { etatDeLaTable: () => ({ aJour: true }), database: db, chemin: BASE, force: true });
  sortie.reporte = {
    fiches: garder(pendantBanc, ['mode', 'raison']),
    passe: { status: passeReportee.status, summary: passeReportee.summary, reporte: passeReportee.details?.reporte ?? null },
    due: J.dueFichesJoueurs({ manuel: false, derniere: () => MAINTENANT, derniersDetails: () => passeReportee.details }, { database: db })
  };
  finBanc();
  sortie.jetonRendu = L.calculLourdEnCours();

  // 8. Un échec du calcul n'écrit rien : l'état et les tables restent ceux d'avant.
  const avantEchec = { etat: P.etatDesFiches({ database: db }).calculeLe, n: rangees().fiches.length };
  const echec = await P.fichesDesJoueurs({ database: db, chemin: path.join(path.dirname(BASE), 'absente.db'), aPart: true, force: true, maintenant: M });
  sortie.echec = { mode: echec.mode, erreur: Boolean(echec.erreur), inchange: JSON.stringify(avantEchec) === JSON.stringify({ etat: P.etatDesFiches({ database: db }).calculeLe, n: rangees().fiches.length }) };

  // 9. L'étape de la passe, normale (après une autre feuille tardive) : résumé, alerte levée, rien de neuf, due.
  // Une AUTRE rencontre (l'horloge des essais est figée : une même rencontre réécrite garderait sa date de mise à jour).
  const autre = rencontresAvecOnzes().at(-2);
  upsertMatches([entreeDe(autre.match_key, { homeGoals: (db.prepare('SELECT home_goals g FROM matches WHERE match_key = ?').get(autre.match_key).g ?? 0) + 1 })], { database: db });
  await construireTable();
  const passe = await J.passeFichesJoueurs({}, { database: db, chemin: BASE });
  sortie.passe = { status: passe.status, summary: passe.summary, mode: passe.details?.mode ?? null, controle: passe.details?.controle ?? null, mesure: passe.details?.mesure ?? null, alerte: passe.alert ?? null, changed: passe.changed, face: faceALaReconstruction().identiques };
  const rienANeuf = await J.passeFichesJoueurs({}, { database: db, chemin: BASE });
  sortie.passeRienANeuf = { status: rienANeuf.status, summary: rienANeuf.summary, mode: rienANeuf.details?.mode ?? null };
  sortie.due = {
    faitAujourdhuiAJour: J.dueFichesJoueurs({ manuel: false, derniere: () => MAINTENANT }, { database: db }),
    jamaisFait: J.dueFichesJoueurs({ manuel: false, derniere: () => null }, { database: db }),
    clic: J.dueFichesJoueurs({ manuel: true, derniere: () => MAINTENANT }, { database: db })
  };
}

if (phase === 'oracle') {
  await construireTable();
  // Le jour J : la rencontre la plus récente qui a deux onzes identifiés (au moins 10) et des clubs déjà vus avant.
  const candidates = rencontresAvecOnzes();
  const avecHistoire = candidates.filter((r) => candidates.some((x) => x.date < r.date && (x.home === r.home || x.away === r.home)) && candidates.some((x) => x.date < r.date && (x.home === r.away || x.away === r.away)));
  const J = (avecHistoire[0] ?? candidates[0]).date;
  sortie.J = J;
  // 1. Le rejeu complet sur la base ENTIÈRE, arrêté au début de la journée J : fiches, équipes et force du onze d'avant J.
  const rencontres = executerSansPause(P.chargerLesRencontres(db));
  const duJour = rencontres.filter((m) => m.date === J && !m.attribue);
  let vuAvantJ = null;
  const rejeu = new P.RejeuDesFiches({
    avantJournee: (jour, r) => {
      if (P.jourIso(jour) !== J) return;
      const matchs = duJour.map((m) => ({ cle: m.matchKey, camps: B.ceQueDitLeOnze(m, r).map((c) => ({ club: c.club, force: c.force })) }));
      const joueurs = new Set();
      const clubs = new Set();
      for (const m of duJour) {
        clubs.add(m.home);
        clubs.add(m.away);
        for (const l of P.joueursDe(m)) joueurs.add(l.joueur);
        for (const c of [m.home, m.away]) for (const p of r.habituelle(c)?.parts ?? []) joueurs.add(p[0]);
      }
      vuAvantJ = {
        matchs,
        fiches: [...joueurs].sort((x, y) => x - y).map((j) => r.ficheEnLigne(j)).filter(Boolean),
        equipes: [...clubs].sort((x, y) => x - y).map((c) => r.habituelle(c)).filter(Boolean).map((h) => ({ club: h.club, parts: h.parts, gardien: h.gardien, moy: r.moyennesOffensives(h.league) }))
      };
    }
  });
  executerSansPause(P.rejouer(rejeu, rencontres));
  // 2. La COPIE TRONQUÉE : tout ce qui suit J supprimé (le jour J compris), la table du jour J refaite, puis la nuit.
  const fichierTronque = path.join(path.dirname(BASE), 'tronquee.db');
  backupTo(fichierTronque, { database: db });
  const db2 = new DatabaseSync(fichierTronque);
  db2.exec('PRAGMA foreign_keys = ON;');
  db2.prepare('DELETE FROM matches WHERE date >= ?').run(J);
  await construireTable(db2);
  const nuit = await P.fichesDesJoueurs({ database: db2, chemin: fichierTronque, aPart: false, maintenant: M, controle: true });
  // 3. La comparaison : fiches (colonnes de ligneDeFiche), équipes habituelles, force du onze lue par le lecteur.
  const cles = Object.keys(vuAvantJ.fiches[0] ?? {});
  const fichesTronquees = P.lireFiches(vuAvantJ.fiches.map((f) => f.joueur), { database: db2 });
  const ecartsFiches = vuAvantJ.fiches.filter((f) => {
    const t = fichesTronquees.get(f.joueur);
    return !t || cles.some((k) => (f[k] ?? null) !== (t[k] ?? null));
  });
  const ecartsEquipes = vuAvantJ.equipes.filter((h) => {
    const t = P.lireEquipeHabituelle(h.club, { database: db2 });
    return !t || JSON.stringify(t.parts) !== JSON.stringify(h.parts) || t.gardien !== h.gardien || JSON.stringify(t.moyennesOff) !== JSON.stringify(h.moy);
  });
  const ecartsForce = [];
  for (const m of duJour) {
    const lignes = P.joueursDe(m);
    for (const [camp, club] of [[1, m.home], [0, m.away]]) {
      const tit = lignes.filter((l) => (l.camp === 1 ? 1 : 0) === camp && l.titulaire === 1).map((l) => ({ joueur: l.joueur, ligne: P.ligneDuPoste(l.poste) }));
      const habituelle = P.lireEquipeHabituelle(club, { database: db2 });
      const fiches = P.lireFiches([...tit.map((t) => t.joueur), ...(habituelle?.parts ?? []).map((p) => p[0])], { database: db2 });
      const lue = P.forceDuOnze({ titulaires: tit, inconnus: Array.from({ length: Math.max(0, 11 - tit.length) }, () => ({ ligne: 3 })), fiches, habituelle, moyennesOff: habituelle?.moyennesOff ?? [0, 0, 0, 0] });
      const attendue = vuAvantJ.matchs.find((x) => x.cle === m.matchKey).camps.find((c) => c.club === club).force;
      if (JSON.stringify(lue) !== JSON.stringify(attendue)) ecartsForce.push({ match: m.matchKey, club, lue, attendue });
    }
  }
  sortie.oracle = {
    rencontresDuJour: duJour.length,
    fichesComparees: vuAvantJ.fiches.length,
    equipesComparees: vuAvantJ.equipes.length,
    forcesComparees: duJour.length * 2,
    ecartsFiches: ecartsFiches.length,
    exempleFiche: ecartsFiches[0] ? { attendu: ecartsFiches[0], lu: fichesTronquees.get(ecartsFiches[0].joueur) ?? null } : null,
    ecartsEquipes: ecartsEquipes.length,
    ecartsForce: ecartsForce.length,
    exempleForce: ecartsForce[0] ?? null,
    nuit: { mode: nuit.mode, jusqua: nuit.jusqua, controle: nuit.controle ? { lignes: nuit.controle.lignes, ecarts: nuit.controle.ecarts.length } : null },
    forceExemple: vuAvantJ.matchs[0]?.camps[0]?.force ?? null
  };
  db2.close();
  // 4. Un 9-0 planté le jour J (dans la base entière) ne change rien d'avant J : mêmes fiches, même force du onze.
  const m0 = duJour[0];
  const planter = db.prepare('UPDATE player_day SET xgnp = 9000, xa = 9000, tirs = 30, pc = 30, minutes = 90 WHERE rencontre = ?');
  planter.run(m0.rencontre);
  const rencontres2 = executerSansPause(P.chargerLesRencontres(db));
  let forceApres = null;
  const rejeu2 = new P.RejeuDesFiches({
    avantJournee: (jour, r) => {
      if (P.jourIso(jour) !== J) return;
      const m = rencontres2.find((x) => x.matchKey === m0.matchKey);
      forceApres = B.ceQueDitLeOnze(m, r).map((c) => c.force);
    }
  });
  executerSansPause(P.rejouer(rejeu2, rencontres2));
  sortie.neufZero = { identique: JSON.stringify(forceApres) === JSON.stringify(vuAvantJ.matchs.find((x) => x.cle === m0.matchKey).camps.map((c) => c.force)), lendemainChange: JSON.stringify(rejeu2.ficheEnLigne(P.joueursDe(m0)[0].joueur)) !== JSON.stringify(rejeu.ficheEnLigne(P.joueursDe(m0)[0].joueur)) };
  // 5. Le contrôle anti-fuite : des instantanés honnêtes → 0 écart ; un instantané pris APRÈS sa journée (une fuite) → trouvé.
  const parJ = new Map();
  const choisis = P.couplesDuControle(rencontres2, 20261005, 12);
  for (const c of choisis) {
    if (!parJ.has(c.jour)) parJ.set(c.jour, []);
    parJ.get(c.jour).push(c);
  }
  const honnetes = [];
  const fuites = [];
  const rejeu3 = new P.RejeuDesFiches({
    avantJournee: (jour, r) => {
      for (const c of parJ.get(jour) ?? []) honnetes.push({ ...c, sommes: r.sommes(c.joueur) });
    }
  });
  // La fuite : l'état du joueur relevé à la FIN de sa journée J (son match du jour J compté) et présenté comme « avant J ».
  let k = 0;
  let precedent = null;
  for (const m of rencontres2) {
    if (precedent !== null && m.jour !== precedent) {
      rejeu3.finDeJournee();
      for (const c of parJ.get(precedent) ?? []) fuites.push({ ...c, sommes: rejeu3.sommes(c.joueur) });
    }
    precedent = m.jour;
    rejeu3.ajouter(m);
    k++;
  }
  rejeu3.finDeJournee();
  for (const c of parJ.get(precedent) ?? []) fuites.push({ ...c, sommes: rejeu3.sommes(c.joueur) });
  const cHonnete = executerSansPause(P.controleDesInstantanes(db, honnetes, 1));
  const cFuite = executerSansPause(P.controleDesInstantanes(db, fuites.slice(0, 3), 1));
  sortie.controle = { honnetes: { lignes: cHonnete.lignes, ecarts: cHonnete.ecarts.length }, fuites: { lignes: cFuite.lignes, joueursTrouves: new Set(cFuite.ecarts.map((e) => e.joueur)).size } };
}

if (phase === 'lecture') {
  // Le contrôleur importe un script du serveur (fusion des statistiques) : recopié dans la copie.
  recopierScripts(serveur);
  await construireTable();
  const ctrl = await imp('api/controllers/matchStats.controller.js');
  const { avecForceDuOnze } = await imp('data/providers/lineupContext.js');
  const appeler = (query) => {
    const res = { code: 200, corps: null, json(o) { this.corps = o; return this; }, status(c) { this.code = c; return this; } };
    try {
      ctrl.getPlayerRatings({ query }, res);
      return { code: res.code, corps: res.corps };
    } catch (error) {
      return { code: error.status ?? error.statusCode ?? 500, erreur: error.message };
    }
  };
  // Avant tout calcul : la route dit « jamais », la page du match n'a pas de force du onze (null), rien ne casse.
  const cible = rencontresAvecOnzes()[0];
  const onzeDe = (camp) => db.prepare('SELECT player_id, position FROM players WHERE match_key = ? AND side = ? AND starter = 1 ORDER BY ord').all(cible.match_key, camp).map((p) => ({ id: p.player_id, position: p.position }));
  const compo = { source: 'FotMob', home: { teamId: `fotmob-${cible.home}`, startXI: onzeDe('home') }, away: { teamId: `fotmob-${cible.away}`, startXI: onzeDe('away') } };
  sortie.avant = { route: appeler({}), page: avecForceDuOnze(compo, db).home.forceDuOnze };
  await P.fichesDesJoueurs({ database: db, aPart: false, maintenant: M });
  // La page du match : la force du onze de chaque camp ; un titulaire sans identifiant (l'identifiant 0 de FotMob) = inconnu.
  const t0 = performance.now();
  const page = avecForceDuOnze(compo, db);
  const ms = performance.now() - t0;
  const avecInconnu = { ...compo.home, startXI: [...compo.home.startXI.slice(0, 10), { id: null, position: 'Forward' }] };
  const fInconnu = P.forceDuOnzeDeLaComposition(avecInconnu, { database: db });
  const sansGardien = { ...compo.home, startXI: compo.home.startXI.filter((j) => j.position !== 'Goalkeeper') };
  sortie.page = {
    ms,
    home: page.home.forceDuOnze,
    away: page.away.forceDuOnze ? garder(page.away.forceDuOnze, ['titulaires', 'inconnus', 'gardienHabituel', 'source', 'regle']) : null,
    autresChampsIntacts: JSON.stringify({ ...page.home, forceDuOnze: undefined }) === JSON.stringify({ ...compo.home, forceDuOnze: undefined }),
    inconnu: fInconnu ? garder(fInconnu, ['titulaires', 'inconnus']) : null,
    sansGardienHabituel: P.forceDuOnzeDeLaComposition(sansGardien, { database: db })?.gardienHabituel ?? 'absent',
    clubInconnu: P.forceDuOnzeDeLaComposition({ teamId: 'fotmob-424242424', startXI: compo.home.startXI }, { database: db }),
    lectureIds0: [...P.lireFiches(['fotmob-0', '0', null, 'nom:x'], { database: db }).keys()]
  };
  // La route.
  const unJoueur = db.prepare('SELECT joueur FROM player_ratings WHERE etablie = 1 ORDER BY minutes DESC LIMIT 1').get().joueur;
  const r1 = appeler({ player: `fotmob-${unJoueur}` });
  const r2 = appeler({ club: String(cible.home) });
  const ligue = db.prepare('SELECT league FROM player_ratings WHERE etablie = 1 AND league IS NOT NULL GROUP BY league ORDER BY COUNT(*) DESC LIMIT 1').get()?.league;
  const r3 = appeler({ league: ligue, poste: '4' });
  sortie.route = {
    etat: appeler({}).corps?.etat,
    joueur: { code: r1.code, joueur: r1.corps?.lecture?.fiche?.joueur ?? null, courbe: Array.isArray(r1.corps?.lecture?.fiche?.courbe), regle: r1.corps?.regle ?? null },
    club: { code: r2.code, fiches: r2.corps?.lecture?.fiches?.length ?? 0, habituelle: Boolean(r2.corps?.lecture?.habituelle) },
    ligue: { code: r3.code, postes: [...new Set((r3.corps?.lecture?.fiches ?? []).map((f) => f.poste))], tous: (r3.corps?.lecture?.fiches ?? []).every((f) => f.etablie === 1) },
    inconnu: appeler({ player: 'fotmob-424242424' }).code,
    mauvais: appeler({ player: 'nom:x' }).code,
    mauvaisPoste: appeler({ league: ligue, poste: '7' }).code
  };
  // Le piège FotMob de l'identifiant 0 (partagé par tous les joueurs que FotMob ne connaît pas) : même si une ligne 0
  // traînait dans la table, elle ne serait jamais lue — ni par la lecture, ni par la page du match (« fotmob-0 » = inconnu).
  db.prepare(`INSERT INTO player_ratings (${P.COLONNES_FICHE.join(', ')}) SELECT 0, ${P.COLONNES_FICHE.slice(1).join(', ')} FROM player_ratings WHERE etablie = 1 LIMIT 1`).run();
  const avecZero = { ...compo.home, startXI: [...compo.home.startXI.slice(0, 10), { id: 'fotmob-0', position: 'Forward' }] };
  sortie.zero = {
    plantee: db.prepare('SELECT COUNT(*) n FROM player_ratings WHERE joueur = 0').get().n,
    lecture: [...P.lireFiches(['fotmob-0', '0', 0, null, 'nom:x'], { database: db }).keys()],
    page: garder(P.forceDuOnzeDeLaComposition(avecZero, { database: db }), ['titulaires', 'inconnus']),
    route: appeler({ player: 'fotmob-0' }).code
  };
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
