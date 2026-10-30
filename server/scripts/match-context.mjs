#!/usr/bin/env node
/**
 * match-context.mjs — LE BANC DU CONTEXTE DU MATCH (étape 32 du plan, partie B, 29/10/2026), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * Le calcul tourne dans un PROCESSUS À PART (src/data/contexte/contexteBancEnfant.js), base du bac EN LECTURE SEULE ; ce
 * script prépare ce qu'il lui faut, lit et écrit les fichiers (jamais la base, jamais sous OneDrive), et garde la règle du
 * REGARD UNIQUE :
 *
 *   --comptes --export <dossier> --sortie <json> --pelouses <json> [--passe <refresh-status.json>]
 *       AUCUN RÉSULTAT LU : couvertures de chaque facteur sur chaque fenêtre ; la liste des clubs dont la pelouse a pu
 *       changer (la base, l'export gelé du 22/09 <dossier> — seulement date, club qui reçoit, pelouse — et venues.json).
 *   --diagnostic-meteo --analyses <match-ai-analyses.json> --sortie <json> [--passe …]
 *       AUCUN RÉSULTAT LU : la météo PRÉVUE des instantanés d'avant-match des analyses IA (seulement l'instantané) face à
 *       la météo RANGÉE au magasin.
 *   --banc --regles <md> --sha1-regles <sha1> --pelouses <json> --sha1-pelouses <sha1> --k <K> --verrou <lock>
 *          --passe <refresh-status.json> --sortie <json> [--rejouer-apres-correction "<raison>"]
 *       LE PASSAGE UNIQUE : refusé si K n'est pas le nombre de variantes déclarées (VARIANTES_DE_L_ETAPE_32), si les
 *       règles ou la liste des pelouses ont changé depuis leur sha1, si la passe de Pierre tourne (attendue d'abord) ; le
 *       VERROU est posé AVANT toute lecture (heure, pid, sha1 des règles) ; un second --banc est REFUSÉ sans
 *       --rejouer-apres-correction "<raison>" (il rapporte alors les deux verdicts côte à côte). Écrit <sortie> avec
 *       `premierRegard`.
 *   --recopier <banc-contexte.json>
 *       ÉCRIT src/data/contexte/noteDuContexte.js (CONTEXTE_AU_BANC) PAR SCRIPT, et garde la sortie et les règles telles
 *       quelles dans test/fixtures (banc-contexte-etape32.json, banc-regles-etape32.md) : le test T-B7 refait la note à
 *       l'octet.
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
import { VARIANTES_DE_L_ETAPE_32 } from '../src/bench/lancements.js';
import { PERIODES_DU_BANC } from '../src/data/contexte/reglagesContexte.js';
import { pelouseDe } from '../src/data/contexte/formulesDuContexte.js';
import { aRecopier, texteDeLaNote, VERSION_DU_BANC } from '../src/data/contexte/bancDuContexte.js';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENFANT = path.join(SERVEUR, 'src', 'data', 'contexte', 'contexteBancEnfant.js');
/** Le diagnostic de la météo a son propre processus à part, hors de data/contexte/ (rien du contexte ne lit la météo). */
const ENFANT_METEO = path.join(SERVEUR, 'src', 'data', 'db', 'diagnosticMeteoEnfant.js');
const NOTE = path.join(SERVEUR, 'src', 'data', 'contexte', 'noteDuContexte.js');
const FIXTURE_SORTIE = 'test/fixtures/banc-contexte-etape32.json';
const FIXTURE_REGLES = 'test/fixtures/banc-regles-etape32.md';

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
  dire(`[contexte du match] REFUS : ${raison}`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}
const pct = (x, d = 2) => (Number.isFinite(x) ? `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '?');

// ------------------------------------------------------------ garde-fous
const modes = ['--comptes', '--diagnostic-meteo', '--banc', '--recopier'].filter(drapeau);
if (modes.length !== 1) refuser('un seul mode : --comptes, --diagnostic-meteo, --banc ou --recopier.');
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
if (MODE !== '--recopier' && !fs.existsSync(BASE)) refuser(`la copie de la base n'existe pas (${BASE}).`);
const sortie = option('--sortie');
if (sortie && sousOneDrive(sortie)) refuser(`une sortie sous OneDrive est refusée (${sortie}).`);

/** La passe de Pierre (lecture seule) : attendue à null, au plus `minutes` ; une lecture ratée n'est jamais « null ». */
function attendreLaPasse(fichier, minutes = Number(option('--attente-minutes') ?? 90)) {
  if (!fichier) return { verifiee: false };
  // Le temps écoulé se mesure sans l'horloge du jour (figée dans les essais) : performance.now().
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
    dire(`[contexte du match] la passe de Pierre tourne (${JSON.stringify(running).slice(0, 100)}) : j'attends`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
}

/** Le calcul dans le processus à part : la base y est ouverte en lecture seule ; rend le résultat ou lève. */
function lancerLEnfant(message, { delaiMs = 3 * 3_600_000, fichier = ENFANT, argument = '--enfant-contexte-banc' } = {}) {
  return new Promise((resolve, reject) => {
    const enfant = fork(fichier, [argument], { serialization: 'advanced', execArgv: [...process.execArgv, '--max-old-space-size=4096'] });
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
  const dossier = option('--export');
  const pelouses = option('--pelouses');
  if (!dossier || !fs.existsSync(dossier)) refuser('--export <dossier de l’export gelé du 22/09> est obligatoire.');
  if (!sortie || !pelouses) refuser('--sortie <json> et --pelouses <json> sont obligatoires.');
  if (sousOneDrive(pelouses)) refuser(`une sortie sous OneDrive est refusée (${pelouses}).`);
  const passe = attendreLaPasse(option('--passe'));
  // L'export gelé : pour chaque rencontre, sa clé et sa pelouse — rien d'autre n'est gardé (aucun score). L'export n'a
  // pas l'identifiant du club (seulement les noms) : le club qui reçoit est rattaché dans le processus à part, par la clé
  // de la même rencontre au magasin — jamais par un nom (corrigé le 29/10 à 13 h 31, avant le regard : sans cela, aucun
  // club de l'export n'était reconnu).
  const t0 = Date.now();
  const exportParRencontre = [];
  const fin = PERIODES_DU_BANC.dernierJourLu;
  let lus = 0;
  const mois = fs.readdirSync(dossier).filter((f) => /^\d{4}-\d{2}\.json$/.test(f) && f.slice(0, 7) <= fin.slice(0, 7)).sort();
  for (const f of mois) {
    const liste = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
    for (const m of Array.isArray(liste) ? liste : []) {
      const jour = String(m?.date ?? '').slice(0, 10);
      if (!jour || jour > fin) continue;
      lus += 1;
      const p = pelouseDe(m?.meta?.surface);
      const cle = typeof m?.matchKey === 'string' && m.matchKey ? m.matchKey : null;
      if (!cle || !p) continue;
      exportParRencontre.push([cle, p === 'hybride' ? 'naturelle' : p]);
    }
  }
  dire(`[contexte du match] export gelé : ${mois.length} mois, ${lus.toLocaleString('fr-FR')} rencontres, ${exportParRencontre.length.toLocaleString('fr-FR')} avec une pelouse (${Math.round((Date.now() - t0) / 1000)} s)`);
  const debut = new Date().toISOString();
  const r = await lancerLEnfant({ mode: 'comptes', periodes: PERIODES_DU_BANC, exportParRencontre });
  const liste = { format: 1, regle: r.pelouse.regle, dernierJourLu: fin, sources: { base: BASE, export: path.resolve(dossier), mois: mois.length, venues: 'src/data/reference/venues.json' }, clubs: r.pelouse.clubs.map((c) => c.club), details: r.pelouse.clubs };
  ecrireJson(pelouses, liste);
  ecrireJson(sortie, { format: 1, mode: 'comptes', aucunResultatLu: true, debut, fin: new Date().toISOString(), base: BASE, passeDePierre: passe, exportGele: { mois: mois.length, rencontres: lus, avecPelouse: exportParRencontre.length }, pelouses: { fichier: path.resolve(pelouses), sha1: sha1(pelouses), clubs: liste.clubs.length }, pidAPart: r.pidAPart, ...r });
  dire(`[contexte du match] comptes écrits : ${sortie} ; ${liste.clubs.length} clubs écartés pour la pelouse (${pelouses}, sha1 ${sha1(pelouses)})`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'comptes', sortie: path.resolve(sortie), pelouses: path.resolve(pelouses), sha1Pelouses: sha1(pelouses), clubsEcartes: liste.clubs.length })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --diagnostic-meteo
if (MODE === '--diagnostic-meteo') {
  const fichier = option('--analyses');
  if (!fichier || !fs.existsSync(fichier)) refuser('--analyses <match-ai-analyses.json> est obligatoire.');
  if (!sortie) refuser('--sortie <json> est obligatoire.');
  const passe = attendreLaPasse(option('--passe'));
  // Seulement l'instantané d'avant-match de chaque analyse (identifiant FotMob, heure du relevé, météo prévue) : ni
  // l'analyse, ni le bilan d'après match.
  const analyses = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const parMatch = new Map();
  for (const a of Array.isArray(analyses) ? analyses : []) {
    const s = a?.lineupSnapshot;
    const mi = s?.matchInfo;
    if (!s?.fotmobMatchId || !mi) continue;
    const i = { fotmobMatchId: String(s.fotmobMatchId), fetchedAt: s.fetchedAt ?? null, commenceTime: a.commenceTime ?? null, prevu: { temperature: mi.temperature ?? null, windSpeed: mi.windSpeed ?? null, weather: mi.weather ?? null, precipitation: mi.precipitation ?? null } };
    // Par rencontre : le dernier instantané relevé AVANT le coup d'envoi annoncé, sinon le dernier tout court (écarté ensuite).
    const avant = (x) => Date.parse(x.fetchedAt ?? '') < Date.parse(x.commenceTime ?? '');
    const deja = parMatch.get(i.fotmobMatchId);
    if (!deja || (avant(i) && !avant(deja)) || (avant(i) === avant(deja) && String(i.fetchedAt ?? '') > String(deja.fetchedAt ?? ''))) parMatch.set(i.fotmobMatchId, i);
  }
  const instantanes = [...parMatch.values()].sort((a, b) => (a.fotmobMatchId < b.fotmobMatchId ? -1 : 1));
  const debut = new Date().toISOString();
  const r = await lancerLEnfant({ mode: 'diagnostic-meteo', instantanes }, { fichier: ENFANT_METEO, argument: '--enfant-diagnostic-meteo' });
  ecrireJson(sortie, { format: 1, mode: 'diagnostic-meteo', aucunResultatLu: true, debut, fin: new Date().toISOString(), base: BASE, analyses: path.resolve(fichier), passeDePierre: passe, instantanesAvecIdentifiant: instantanes.length, pidAPart: r.pidAPart, ...r });
  dire(`[contexte du match] diagnostic de la météo écrit : ${sortie}`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'diagnostic-meteo', sortie: path.resolve(sortie), compares: r.compte.compares })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --banc
if (MODE === '--banc') {
  const K = Number(option('--k'));
  if (K !== VARIANTES_DE_L_ETAPE_32.length) refuser(`--k ${option('--k') ?? '(absent)'} : K doit valoir le nombre de variantes déclarées (${VARIANTES_DE_L_ETAPE_32.length}, VARIANTES_DE_L_ETAPE_32).`);
  const regles = option('--regles');
  const sha1Regles = option('--sha1-regles');
  if (!regles || !fs.existsSync(regles) || !sha1Regles) refuser('--regles <md> et --sha1-regles <sha1> sont obligatoires (les règles écrites AVANT le regard).');
  if (sha1(regles) !== sha1Regles) refuser(`les règles ont changé depuis leur sha1 (${sha1(regles)} ≠ ${sha1Regles}) : rien lu.`);
  const pelouses = option('--pelouses');
  const sha1Pelouses = option('--sha1-pelouses');
  if (!pelouses || !fs.existsSync(pelouses) || !sha1Pelouses) refuser('--pelouses <json> et --sha1-pelouses <sha1> sont obligatoires (la liste figée par --comptes).');
  if (sha1(pelouses) !== sha1Pelouses) refuser(`la liste des pelouses a changé depuis son sha1 (${sha1(pelouses)} ≠ ${sha1Pelouses}) : rien lu.`);
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
  const liste = JSON.parse(fs.readFileSync(pelouses, 'utf8'));
  const passe = attendreLaPasse(passeAvant);
  // LE VERROU, AVANT toute lecture d'un résultat : heure, pid, sha1 des règles. Jamais retiré.
  const pose = new Date().toISOString();
  const entree = { pose, pid: process.pid, regles: { fichier: path.resolve(regles), sha1: sha1Regles }, pelouses: { fichier: path.resolve(pelouses), sha1: sha1Pelouses }, sortie: path.resolve(sortie), K };
  if (precedent) {
    const v = precedent.verrou;
    v.rejeux = [...(v.rejeux ?? []), { ...entree, raison }];
    fs.writeFileSync(verrou, `${JSON.stringify(v)}\n`);
  } else {
    fs.writeFileSync(verrou, `${JSON.stringify(entree)}\n`, { flag: 'wx' });
  }
  dire(`[contexte du match] verrou posé (${verrou}) à ${pose} ; le passage commence (processus à part, base en lecture seule).`);
  const premierRegard = pose;
  const empreinte = empreinteDuCode({ rafraichir: true });
  let r;
  try {
    r = await lancerLEnfant({ mode: 'banc', periodes: PERIODES_DU_BANC, pelousesEcartees: liste.clubs ?? [], K });
  } catch (error) {
    refuser(`le passage a échoué : ${String(error.message).slice(0, 1500)}`);
  }
  const fin = new Date().toISOString();
  const resultat = {
    format: VERSION_DU_BANC,
    quoi: 'Banc du contexte du match (étape 32, partie B) : le passage unique.',
    ou: 'bac à sable',
    premierRegard,
    fin,
    dureeS: Math.round((Date.parse(fin) - Date.parse(premierRegard)) / 100) / 10,
    base: { fichier: BASE, lectureSeule: true },
    passeDePierre: passe,
    regles: { fichier: path.resolve(regles), sha1: sha1Regles, copie: FIXTURE_REGLES },
    pelouses: { fichier: path.resolve(pelouses), sha1: sha1Pelouses, clubsEcartes: (liste.clubs ?? []).length },
    verrou: { fichier: path.resolve(verrou), pose },
    empreinteDuMoteur: { sha1: empreinte.empreinte, fichiers: Object.keys(empreinte.fichiers ?? {}).length, candidate: empreinteDeLaCandidate(CANDIDATE_EN_ESSAI) },
    rejeu: precedent ? { raison, precedent: precedent.verdicts } : null,
    comptes: r.comptes,
    durees: r.durees,
    aPart: { ...r.aPart, pid: r.pidAPart },
    banc: r.banc
  };
  ecrireJson(sortie, resultat);
  dire(`[contexte du match] K = ${r.banc.K}, z = ${r.banc.z.toFixed(3)} ; ${r.banc.matchs.utilisables.toLocaleString('fr-FR')} rencontres jugeables ; banc ${r.banc.bancFaux ? 'FAUX (le faux facteur est retenu)' : 'juste (le faux facteur n’est pas retenu)'}`);
  for (const v of r.banc.variantes) dire(`  ${v.id.padEnd(22)} ${String(v.verdict).padEnd(20)} gain ${pct(v.gainRelatif)} [${pct(v.fourchetteRelative?.[0])} ; ${pct(v.fourchetteRelative?.[1])}] — ${v.matchsConcernes} matchs concernés — ampleur ${pct(v.ampleur.max)} (${v.ampleur.marche}) — ${v.utile ? 'UTILE' : 'pas utile'}`);
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
  if (!fichier || !fs.existsSync(fichier)) refuser('--recopier <banc-contexte.json> : la sortie du passage du banc est obligatoire.');
  const json = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  if (json.format !== VERSION_DU_BANC || !json.banc) refuser('ce n’est pas une sortie du banc du contexte.');
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
  dire(`[contexte du match] note écrite PAR SCRIPT : ${NOTE} (${fs.statSync(NOTE).size} octets) ; sortie et règles gardées dans test/fixtures.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'recopier', note: NOTE, sha1Note: sha1(NOTE), sortie: cibleSortie, sha1Sortie: sha1(cibleSortie), regles: cibleRegles, sha1Regles: sha1(cibleRegles), facteurs: note.facteurs })}\n`);
  process.exit(0);
}
