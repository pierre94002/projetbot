#!/usr/bin/env node
/**
 * joueurs-a-blanc.mjs — LE BANC DES CHIFFRES DES JOUEURS (étape 34 du plan, lot 1a, partie B, 03/11/2026), dans le BAC
 * À SABLE (patron : scripts/cartons-corners.mjs de l'étape 33).
 * -----------------------------------------------------------------------
 * Le calcul tourne dans un PROCESSUS À PART (src/data/joueurs/joueursEnfant.js), base du bac EN LECTURE SEULE ; ce script
 * prépare ce qu'il lui faut, lit et écrit les fichiers (jamais la base, jamais sous OneDrive), et garde la règle du
 * REGARD UNIQUE :
 *
 *   --comptes --sortie <json> [--passe <refresh-status.json>]
 *       AVANT LE REGARD : couvertures et relevés (xG des joueurs, buteurs, tirs cadrés, cartons, passes), règle des
 *       penalties par année, rattachement par identifiant, compositions (dernière feuille, bancs listés), bases
 *       disponibles, faux joueurs, contrôles « définition cassée » — jamais une perte, un attendu ni une part de joueur.
 *   --banc --regles <md> --sha1-regles <sha1> --k <K> --verrou <lock> --passe <refresh-status.json> --sortie <json>
 *          [--rejouer-apres-correction "<raison>"]
 *       LE PASSAGE UNIQUE : refusé si K n'est pas le nombre de variantes déclarées (VARIANTES_DE_L_ETAPE_34), si les
 *       règles ont changé depuis leur sha1, si le code de data/cartons/ (33) n'a plus le sha1 scellé dans les règles
 *       (critique, constat 7), si la sortie existe ; la passe de Pierre est attendue d'abord ; le VERROU est
 *       posé AVANT toute lecture (heure, pid, sha1 des règles) et n'est jamais retiré ; un second --banc est REFUSÉ sans
 *       --rejouer-apres-correction "<raison>" (une faute technique, jamais un réglage ; les deux verdicts côte à côte).
 *   --recopier <banc-joueurs.json>
 *       ÉCRIT src/data/joueurs/noteDesJoueurs.js (JOUEURS_AU_BANC) PAR SCRIPT, et garde la sortie et les règles telles
 *       quelles dans test/fixtures (banc-joueurs-etape34.json, banc-regles-etape34.md) : le test T-B6 refait la note à
 *       l'octet.
 *   --note-nulle
 *       ÉCRIT noteDesJoueurs.js avec JOUEURS_AU_BANC = null (avant le passage), PAR SCRIPT.
 *
 * REFUS : sous OneDrive, hors du bac à sable (sauf une copie d'essai gardée par test/aides/garde.mjs), sur la vraie base,
 * une sortie sous OneDrive. Sortie : le résumé sur stderr, une ligne JSON de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { VARIANTES_DE_L_ETAPE_34 } from '../src/bench/lancements.js';
import { PERIODES_DU_BANC, DECISION_DE_PIERRE } from '../src/data/joueurs/reglagesJoueurs.js';
import { aRecopier, texteDeLaNote, VERSION_DU_BANC } from '../src/data/joueurs/bancDesJoueurs.js';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENFANT = path.join(SERVEUR, 'src', 'data', 'joueurs', 'joueursEnfant.js');
const NOTE = path.join(SERVEUR, 'src', 'data', 'joueurs', 'noteDesJoueurs.js');
const CARTONS = path.join(SERVEUR, 'src', 'data', 'cartons');
const FIXTURE_SORTIE = 'test/fixtures/banc-joueurs-etape34.json';
const FIXTURE_REGLES = 'test/fixtures/banc-regles-etape34.md';

const argv = process.argv.slice(2);
const option = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const drapeau = (nom) => argv.includes(nom);
const dire = (texte) => process.stderr.write(`${texte}\n`);
const sha1 = (fichier) => crypto.createHash('sha1').update(fs.readFileSync(fichier)).digest('hex');
const sousOneDrive = (p) => /[\\/]onedrive[^\\/]*([\\/]|$)/i.test(path.resolve(p));
function refuser(raison) {
  dire(`[joueurs à blanc] REFUS : ${raison}`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}
/** Les fichiers de data/cartons/ scellés dans les règles : les lignes « - <sha1> data/cartons/<fichier> » (critique, constat 7). */
function cartonsScellesDansLesRegles(texte) {
  return [...texte.matchAll(/^- ([0-9a-f]{40}) data\/cartons\/([A-Za-z]+\.js)\s*$/gm)].map((m) => [m[2], m[1]]);
}
const pct = (x, d = 3) => (Number.isFinite(x) ? `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '?');

// ------------------------------------------------------------ garde-fous
const modes = ['--comptes', '--banc', '--recopier', '--note-nulle'].filter(drapeau);
if (modes.length !== 1) refuser('un seul mode : --comptes, --banc, --recopier ou --note-nulle.');
const MODE = modes[0];
if (sousOneDrive(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}).`);
const ESSAI = Boolean(process.env.CM_TEST_DOSSIER);
if (!modeBacASable() && !ESSAI) refuser('ce script sert au bac à sable (CM_BAC_A_SABLE=1) : le banc ne se passe jamais sur la base de Pierre.');
const BASE = ESSAI && !modeBacASable() ? process.env.MATCH_STATS_DB : resolveDbPath();
if (!BASE) refuser('aucune base désignée.');
if (path.resolve(BASE).toLowerCase() === path.resolve(VRAIE_BASE).toLowerCase()) refuser("c'est la vraie base.");
if (modeBacASable()) {
  const v = verifierBaseDuBac(BASE);
  if (!v.ok) refuser(`base refusée : ${v.raison}`);
}
if (MODE !== '--recopier' && MODE !== '--note-nulle' && !fs.existsSync(BASE)) refuser(`la copie de la base n'existe pas (${BASE}).`);
const sortie = option('--sortie');
if (sortie && sousOneDrive(sortie)) refuser(`une sortie sous OneDrive est refusée (${sortie}).`);

/** La passe de Pierre (lecture seule) : attendue à null, au plus `minutes` ; une lecture ratée n'est jamais « null ». */
function attendreLaPasse(fichier, minutes = Number(option('--attente-minutes') ?? 90)) {
  if (!fichier) return { verifiee: false };
  const t0 = performance.now();
  for (;;) {
    let running;
    try {
      running = JSON.parse(fs.readFileSync(fichier, 'utf8')).running ?? null;
    } catch (error) {
      running = `illisible : ${error.message}`;
    }
    if (running === null) return { verifiee: true, attenduS: Math.round((performance.now() - t0) / 1000) };
    if (performance.now() - t0 >= minutes * 60_000) refuser(`la passe de Pierre tourne toujours (${JSON.stringify(running).slice(0, 120)}) : rien lancé.`);
    dire(`[joueurs à blanc] la passe de Pierre tourne (${JSON.stringify(running).slice(0, 100)}) : j'attends`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
}

/** Le calcul dans le processus à part : la base y est ouverte en lecture seule ; rend le résultat ou lève. */
function lancerLEnfant(message, { delaiMs = 3 * 3_600_000 } = {}) {
  return new Promise((resolve, reject) => {
    const enfant = fork(ENFANT, ['--enfant-joueurs'], { serialization: 'advanced', execArgv: [...process.execArgv, '--max-old-space-size=4096'] });
    let fini = false;
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      enfant.kill();
      reject(new Error(`délai dépassé (${Math.round(delaiMs / 60_000)} min) : processus à part arrêté, rien écrit`));
    }, delaiMs);
    enfant.on('message', (m) => {
      if (fini) return;
      if (m?.fin) {
        fini = true;
        clearTimeout(minuterie);
        resolve({ ...m.resultat, pidAPart: enfant.pid });
      } else if (m?.erreur) {
        fini = true;
        clearTimeout(minuterie);
        reject(new Error(m.erreur));
      }
    });
    enfant.on('exit', (code) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      reject(new Error(`le processus à part est sorti (code ${code}) sans réponse`));
    });
    enfant.send({ ...message, chemin: BASE });
  });
}

const ecrireJson = (fichier, objet, { nouveau = true } = {}) => {
  fs.mkdirSync(path.dirname(path.resolve(fichier)), { recursive: true });
  fs.writeFileSync(fichier, `${JSON.stringify(objet, null, 1)}\n`, { flag: nouveau ? 'wx' : 'w' });
};

// ------------------------------------------------------------ --comptes
if (MODE === '--comptes') {
  if (!sortie) refuser('--sortie <json> est obligatoire.');
  if (fs.existsSync(sortie)) refuser(`la sortie existe déjà (${sortie}) : jamais écrasée.`);
  const passe = attendreLaPasse(option('--passe'));
  const debut = new Date().toISOString();
  let r;
  try {
    r = await lancerLEnfant({ mode: 'comptes', periodes: PERIODES_DU_BANC });
  } catch (error) {
    refuser(`les comptes ont échoué : ${String(error.message).slice(0, 1500)}`);
  }
  ecrireJson(sortie, { format: 1, mode: 'comptes', aucunAttenduNiPerte: true, debut, fin: new Date().toISOString(), base: BASE, passeDePierre: passe, decisionDePierre: DECISION_DE_PIERRE, pidAPart: r.pidAPart, ...r });
  const casses = r.comptes.controles.filter((c) => c.casse);
  dire(`[joueurs à blanc] comptes écrits : ${sortie} (sha1 ${sha1(sortie)}) ; ${casses.length ? `DÉFINITION CASSÉE : ${casses.map((c) => `${c.pli} ${c.id}`).join(', ')}` : 'aucune définition cassée'}`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'comptes', sortie: path.resolve(sortie), sha1: sha1(sortie), casse: r.comptes.casse, casses })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --banc
if (MODE === '--banc') {
  const K = Number(option('--k'));
  if (K !== VARIANTES_DE_L_ETAPE_34.length) refuser(`--k ${option('--k') ?? '(absent)'} : K doit valoir le nombre de variantes déclarées (${VARIANTES_DE_L_ETAPE_34.length}, VARIANTES_DE_L_ETAPE_34).`);
  const regles = option('--regles');
  const sha1Regles = option('--sha1-regles');
  if (!regles || !fs.existsSync(regles) || !sha1Regles) refuser('--regles <md> et --sha1-regles <sha1> sont obligatoires (les règles écrites AVANT le regard).');
  if (sha1(regles) !== sha1Regles) refuser(`les règles ont changé depuis leur sha1 (${sha1(regles)} ≠ ${sha1Regles}) : rien lu.`);
  // Le code de l'étape 33 (data/cartons/) employé par le banc : son sha1 est SCELLÉ dans les règles (critique, constat 7).
  const scelles = cartonsScellesDansLesRegles(fs.readFileSync(regles, 'utf8'));
  if (!scelles.length) refuser('les règles ne scellent aucun fichier de data/cartons/ (critique, constat 7) : rien lu.');
  for (const [f, attendu] of scelles) {
    const reel = fs.existsSync(path.join(CARTONS, f)) ? sha1(path.join(CARTONS, f)) : null;
    if (reel !== attendu) refuser(`data/cartons/${f} n’a plus le sha1 scellé dans les règles (${reel ?? 'absent'} ≠ ${attendu}) : rien lu.`);
  }
  const verrou = option('--verrou');
  if (!verrou) refuser('--verrou <fichier> est obligatoire (un seul regard).');
  if (sousOneDrive(verrou)) refuser(`un verrou sous OneDrive est refusé (${verrou}).`);
  if (!sortie) refuser('--sortie <json> est obligatoire.');
  const raison = option('--rejouer-apres-correction');
  const passeAvant = option('--passe');
  if (!passeAvant) refuser('--passe <refresh-status.json> est obligatoire : la passe de Pierre est attendue avant le calcul.');
  let precedent = null;
  if (fs.existsSync(verrou)) {
    if (!raison || !raison.trim()) refuser(`le banc a DÉJÀ été passé (verrou ${verrou}) : un second passage est refusé sans --rejouer-apres-correction "<raison>".`);
    const v = JSON.parse(fs.readFileSync(verrou, 'utf8'));
    const ancienne = v.sortie && fs.existsSync(v.sortie) ? JSON.parse(fs.readFileSync(v.sortie, 'utf8')) : null;
    precedent = { verrou: v, verdicts: ancienne?.banc?.variantes?.map((x) => ({ id: x.id, verdict: x.verdict, gainRelatif: x.gainRelatif, fourchetteRelative: x.fourchetteRelative, utile: x.utile })) ?? null };
  } else if (raison) refuser('--rejouer-apres-correction sans passage précédent (aucun verrou) : rien à rejouer.');
  if (fs.existsSync(sortie)) refuser(`la sortie existe déjà (${sortie}) : jamais écrasée.`);
  const passe = attendreLaPasse(passeAvant);
  // LE VERROU, AVANT toute lecture d'un résultat : heure, pid, sha1 des règles. Jamais retiré.
  const pose = new Date().toISOString();
  const entree = { pose, pid: process.pid, regles: { fichier: path.resolve(regles), sha1: sha1Regles }, sortie: path.resolve(sortie), K };
  if (precedent) {
    const v = precedent.verrou;
    v.rejeux = [...(v.rejeux ?? []), { ...entree, raison }];
    fs.writeFileSync(verrou, `${JSON.stringify(v)}\n`);
  } else {
    fs.writeFileSync(verrou, `${JSON.stringify(entree)}\n`, { flag: 'wx' });
  }
  dire(`[joueurs à blanc] verrou posé (${verrou}) à ${pose} ; le passage commence (processus à part, base en lecture seule).`);
  const empreinte = empreinteDuCode({ rafraichir: true });
  let r;
  try {
    r = await lancerLEnfant({ mode: 'banc', periodes: PERIODES_DU_BANC, K });
  } catch (error) {
    refuser(`le passage a échoué : ${String(error.message).slice(0, 1500)}`);
  }
  const fin = new Date().toISOString();
  const resultat = {
    format: VERSION_DU_BANC,
    quoi: 'Banc des chiffres des joueurs (étape 34, lot 1a, partie B) : le passage unique.',
    ou: 'bac à sable',
    premierRegard: pose,
    fin,
    dureeS: Math.round((Date.parse(fin) - Date.parse(pose)) / 100) / 10,
    base: { fichier: BASE, lectureSeule: true },
    passeDePierre: passe,
    regles: { fichier: path.resolve(regles), sha1: sha1Regles, copie: FIXTURE_REGLES },
    verrou: { fichier: path.resolve(verrou), pose },
    decisionDePierre: DECISION_DE_PIERRE,
    cartons: { scelles: Object.fromEntries(scelles) },
    empreinteDuMoteur: { sha1: empreinte.empreinte, fichiers: Object.keys(empreinte.fichiers ?? {}).length, candidate: empreinteDeLaCandidate(CANDIDATE_EN_ESSAI) },
    rejeu: precedent ? { raison, precedent: precedent.verdicts } : null,
    comptes: r.comptesDuPassage,
    durees: r.durees,
    aPart: { ...r.aPart, pid: r.pidAPart },
    banc: r.banc,
    final: r.final,
    horizons: r.horizons
  };
  ecrireJson(sortie, resultat);
  dire(`[joueurs à blanc] K = ${r.banc.K}, z = ${r.banc.z.toFixed(4)} ; camps ${r.banc.camps.A} + ${r.banc.camps.B} ; banc faux : ${JSON.stringify(r.banc.bancFaux)} ; calibré : ${JSON.stringify(Object.fromEntries(Object.entries(r.banc.calibre).map(([k, v]) => [k, v?.calibre ?? null])))}`);
  for (const v of r.banc.variantes) dire(`  ${v.id.padEnd(22)} ${String(v.verdict).padEnd(20)} gain ${pct(v.gainRelatif)} [${pct(v.fourchetteRelative?.[0])} ; ${pct(v.fourchetteRelative?.[1])}] — ${v.matchsJuges} matchs — ampleur ${pct(v.ampleur.max, 2)} — ${v.utile ? 'UTILE' : 'pas utile'}`);
  if (precedent?.verdicts) {
    dire('  côte à côte (passage précédent → celui-ci) :');
    for (const v of r.banc.variantes) {
      const a = precedent.verdicts.find((x) => x.id === v.id);
      dire(`    ${v.id.padEnd(22)} ${a?.verdict ?? '?'} → ${v.verdict}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'banc', sortie: path.resolve(sortie), sha1: sha1(sortie), utiles: r.banc.utiles, bancFaux: r.banc.bancFaux, verdicts: Object.fromEntries(r.banc.variantes.map((v) => [v.id, v.verdict])) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --recopier
if (MODE === '--recopier') {
  const fichier = option('--recopier');
  if (!fichier || !fs.existsSync(fichier)) refuser('--recopier <banc-joueurs.json> : la sortie du passage du banc est obligatoire.');
  const json = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  if (json.format !== VERSION_DU_BANC || !json.banc) refuser('ce n’est pas une sortie du banc des joueurs.');
  const regles = json.regles?.fichier;
  if (!regles || !fs.existsSync(regles)) refuser(`les règles du passage sont introuvables (${regles ?? '?'}).`);
  if (sha1(regles) !== json.regles.sha1) refuser(`les règles ont changé depuis le passage (${sha1(regles)} ≠ ${json.regles.sha1}).`);
  const cibleSortie = path.join(SERVEUR, FIXTURE_SORTIE);
  const cibleRegles = path.join(SERVEUR, FIXTURE_REGLES);
  fs.mkdirSync(path.dirname(cibleSortie), { recursive: true });
  fs.copyFileSync(fichier, cibleSortie);
  fs.copyFileSync(regles, cibleRegles);
  if (sha1(cibleSortie) !== sha1(fichier) || sha1(cibleRegles) !== json.regles.sha1) refuser('la copie dans test/fixtures n’est pas identique à l’octet.');
  const note = aRecopier(json, { sortie: { fichier: FIXTURE_SORTIE, sha1: sha1(cibleSortie) } });
  fs.writeFileSync(NOTE, texteDeLaNote(note));
  dire(`[joueurs à blanc] note écrite PAR SCRIPT : ${NOTE} (${fs.statSync(NOTE).size} octets) ; sortie et règles gardées dans test/fixtures.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'recopier', note: NOTE, sha1Note: sha1(NOTE), sortie: cibleSortie, sha1Sortie: sha1(cibleSortie), regles: cibleRegles, sha1Regles: sha1(cibleRegles), statuts: note.statuts })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --note-nulle (avant le passage)
if (MODE === '--note-nulle') {
  if (fs.existsSync(NOTE) && !/JOUEURS_AU_BANC = null;/.test(fs.readFileSync(NOTE, 'utf8'))) refuser('la note porte déjà un passage du banc : jamais remise à null.');
  fs.writeFileSync(NOTE, texteDeLaNote(null));
  dire(`[joueurs à blanc] note nulle écrite PAR SCRIPT : ${NOTE}`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'note-nulle', note: NOTE, sha1Note: sha1(NOTE) })}\n`);
  process.exit(0);
}
