/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-debuts-preuve.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA PREUVE APRÈS LANCEMENT DES DÉBUTS DE SAISON (étape 35, lot 1c, 14/11/2026), sur le MAGASIN FABRIQUÉ de
 * debutsNuitFabrique.mjs (forme réelle, aucune donnée réelle), réseau coupé, heure figée, base NEUVE de la copie, un registre
 * de la mesure d'ESSAI dans la copie (jamais le vrai). Phase :
 *   « nuits »  l'étape 35 lancée au registre d'essai le 10/08/2025 ; des fiches figées posées sur les matchs JOUÉS du magasin
 *              (rattachées, bras A et B des nouveaux venus et des promus), avec des pièges : une fiche écrite APRÈS le coup
 *              d'envoi, une fiche d'une autre note du banc, une fiche d'une autre version, deux fiches de matchs joués le jour
 *              du lancement et avant (jamais lus) ; puis TROIS NUITS dans le VRAI processus à part : la première avant
 *              l'horizon (des comptes seulement), la deuxième à l'horizon d'essai (le principal calculé à part, rangé par le
 *              serveur), la troisième (jamais rejugé) ; le registre d'essai relu après chaque nuit.
 * Sortie : une ligne JSON.
 */

import path from 'node:path';
import fs from 'node:fs';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesDebuts, ecrireLeCalendrierDesDebuts, NUIT_D_ESSAI, VEILLE, SECONDE_NUIT } from './debutsNuitFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const s = { ok: true, phase, pid: process.pid };
const FICHIER = process.env.MATCH_STATS_DB;

/** Le jour du lancement de l'étape 35 au registre d'essai. */
export const LANCEMENT_D_ESSAI = '2025-08-10';
const TROISIEME_NUIT = '2025-09-15T00:40:00.000Z';

const M = await imp('data/db/matchStatsDb.js');
const lignes = (db, sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r }));

if (phase === 'nuits') {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const N = await imp('data/debutsDeSaison/debutsNuit.js');
  const P = await imp('data/debutsDeSaison/preuveDesDebuts.js');
  const R = await imp('bench/trialsRegistry.js');
  for (const x of ['', '-wal', '-shm']) fs.rmSync(FICHIER + x, { force: true });
  const db = M.openDb({ file: FICHIER });
  fabriquerLeMagasinDesDebuts(db, { rebuildRegistries });
  ecrireLeCalendrierDesDebuts(path.join(serveur, 'data', 'runtime', 'season-calendar.json'));
  // Le registre d'ESSAI (dans la copie) : l'étape 35 notée au premier démarrage, le 10/08/2025.
  const REG = path.join(serveur, 'data', 'runtime', 'registre-essai-preuve-35.json');
  s.vraiRegistre = R.FICHIER_REGISTRE;
  s.registreDEssai = REG;
  R.enregistrerLancements({ fichier: REG, maintenant: Date.parse(`${LANCEMENT_D_ESSAI}T09:00:00Z`) });
  const registre = { fichier: REG };
  s.lancement = R.lancementDe('35', { ...registre, maintenant: Date.parse(NUIT_D_ESSAI) })?.le ?? null;
  // Les fiches figées des matchs joués (comme si les nuits d'avant les avaient écrites et rattachées).
  const joues = lignes(
    db,
    `SELECT d.match_key, d.date, d.league, d.home, d.away FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
     WHERE d.date <= ? AND t.attribue = 0 ORDER BY d.date, d.match_key`,
    VEILLE
  );
  const apres = joues.filter((m) => m.date > LANCEMENT_D_ESSAI);
  const leJour = joues.filter((m) => m.date === LANCEMENT_D_ESSAI);
  const avant = joues.filter((m) => m.date < LANCEMENT_D_ESSAI).slice(-1);
  const ins = db.prepare(
    `INSERT INTO debuts_fiches (date, home_id, away_id, league, match_id, kickoff, kickoff_connu, calcule_le, version, note, apres_coup_d_envoi, entrees, bras, match_key)
     VALUES (?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?, '{}', ?, ?)`
  );
  const brasDe = (i, { promus = false } = {}) => {
    const A = { lambda: 1.2 + (i % 5) * 0.1, mu: 1 + (i % 3) * 0.1 };
    const B = { lambda: A.lambda * (i % 2 ? 1.08 : 0.94), mu: A.mu * (i % 2 ? 0.95 : 1.06) };
    const familles = { nouveaux: { A, B } };
    if (promus) familles.promus = { A: { lambda: 1.3, mu: 1.2 }, B: { lambda: 1.1, mu: 1.4 } };
    return JSON.stringify({ note: '2026-11-09', candidate: A, familles });
  };
  const pieges = {};
  apres.forEach((m, i) => {
    let note = '2026-11-09';
    let version = 1;
    let apresCoup = 0;
    if (i === 0) {
      apresCoup = 1;
      pieges.apresCoupDEnvoi = m.match_key;
    } else if (i === 1) {
      note = '2026-01-01';
      pieges.autreNote = m.match_key;
    } else if (i === 2) {
      version = 2;
      pieges.autreVersion = m.match_key;
    }
    ins.run(m.date, m.home, m.away, m.league, `${m.date}T00:30:00.000Z`, version, note, apresCoup, brasDe(i, { promus: i % 4 === 3 }), m.match_key);
  });
  for (const m of [...leJour, ...avant]) ins.run(m.date, m.home, m.away, m.league, `${m.date}T00:30:00.000Z`, 1, '2026-11-09', 0, brasDe(7), m.match_key);
  s.pose = { apres: apres.length, leJour: leJour.length, avant: avant.length, pieges, promus: apres.filter((_, i) => i % 4 === 3).length };
  const lireRegistre = () => R.jugementsDe('35', { ...registre, maintenant: Date.parse(TROISIEME_NUIT) }).map((j) => ({ quoi: j.quoi, principal: j.principal, verdict: j.verdict, lancement: j.lancement, matchs: j.n?.matchs ?? null, ecartees: j.ecartees ?? null }));
  const etat = () => Object.fromEntries(['preuve', 'principal', 'surete', 'dementis'].map((k) => [k, N.lireLaValeur(db, k)]));
  // 1. AVANT L'HORIZON (un horizon d'essai inatteignable) : des comptes seulement, rien au registre.
  const loin = { matchs: { 'magasin-nouveaux-sans-cote': 100000 } };
  const r1 = await N.faireLesDebutsDeLaNuit({ maintenant: NUIT_D_ESSAI, database: db, chemin: FICHIER, registre, horizonDeLaPreuve: loin });
  s.nuit1 = { mode: r1.mode, erreur: r1.erreur ?? null, raison: r1.raison ?? null, preuve: r1.preuve ?? null, duree: r1.bilan?.durees?.preuve ?? null };
  s.resultat1 = N.resultatDeLEtape(r1, { updatedAt: NUIT_D_ESSAI });
  s.etat1 = etat();
  s.registre1 = lireRegistre();
  // 2. À L'HORIZON D'ESSAI (les matchs concernés de la première nuit) : le principal calculé à part, rangé par le serveur.
  const n = s.nuit1.preuve?.etat?.variantes?.[0]?.matchs ?? 1;
  const proche = { matchs: { 'magasin-nouveaux-sans-cote': n } };
  const r2 = await N.faireLesDebutsDeLaNuit({ maintenant: SECONDE_NUIT, database: db, chemin: FICHIER, registre, horizonDeLaPreuve: proche });
  s.nuit2 = { mode: r2.mode, erreur: r2.erreur ?? null, preuve: r2.preuve ?? null };
  s.resultat2 = N.resultatDeLEtape(r2, { updatedAt: SECONDE_NUIT });
  s.etat2 = etat();
  s.registre2 = lireRegistre();
  // 3. LA NUIT D'APRÈS : jamais rejugé (le registre garde un seul principal).
  const r3 = await N.faireLesDebutsDeLaNuit({ maintenant: TROISIEME_NUIT, database: db, chemin: FICHIER, registre, horizonDeLaPreuve: proche });
  s.nuit3 = { mode: r3.mode, erreur: r3.erreur ?? null, preuve: r3.preuve ?? null };
  s.resultat3 = N.resultatDeLEtape(r3, { updatedAt: TROISIEME_NUIT });
  s.registre3 = lireRegistre();
  s.etat3 = etat();
  // Les lignes de la preuve, recalculées ici depuis la base (le même module, base lue) : pour l'oracle du test.
  const lus = P.lireLesMatchsDeLaPreuve(db, { depuis: s.lancement, avant: '2025-09-08' });
  s.lus = { comptes: lus.comptes, cles: lus.matchs.map((m) => m.cle), familles: lus.matchs.map((m) => Object.keys(m.bras).sort().join('+')) };
  s.vraiRegistreTouche = fs.existsSync(R.FICHIER_REGISTRE);
  db.close();
}

process.stdout.write(`${JSON.stringify(s)}\n`);
process.exit(0);
