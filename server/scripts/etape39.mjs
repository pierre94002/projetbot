#!/usr/bin/env node
/**
 * etape39.mjs — LE BANC DE LA MISE (étape 39 « La mise juste », lot 1b, 09/11/2026), dans le BAC À SABLE (patron :
 * scripts/etape38.mjs). Le banc lit l'EXPORT de P2 (scripts/bench.mjs --periodes P2 --prix fd-avant-match --marches result
 * --lignes <fichier>) : un fichier, jamais une base ; il tourne DANS ce script, sans processus à part (555 paris).
 * -----------------------------------------------------------------------
 *   --comptes --paris <jsonl> --sha1-paris <sha1> --sortie <json>
 *       AVANT LE REGARD : les paris lus SANS leurs champs de résultat (issue, gain, clôture : retirés à la lecture), les
 *       comptes (parts, plafonds, mois, jours, blocs, placebo) et l'étalonnage des MISES (555 sur 555 à l'octet) — jamais une
 *       issue ni une clôture (T-B6).
 *   --banc --paris <jsonl> --sha1-paris <sha1> --regles <md> --sha1-regles <sha1> --k 3 --verrou <lock>
 *          --passe <refresh-status.json> --sortie <json> [--rejouer-apres-correction "<raison>"]
 *       LE PASSAGE UNIQUE : refusé si K n'est pas le nombre de variantes déclarées (VARIANTES_DE_L_ETAPE_39), si les règles
 *       ont changé depuis leur sha1, si elles ne citent pas l'export par son sha1, si elles ne citent pas la conception
 *       scellée (sha1 et date, antérieure au premier regard de la note de la 38 : T-B11), si un module scellé (« - <sha1>
 *       src/… ») a un autre sha1, si la sortie existe, entre 0 h 10 et 2 h 30 (heure de Paris : la passe de nuit) ; la
 *       passe de Pierre est attendue d'abord ; le VERROU est posé AVANT toute lecture d'une issue (heure, pid, sha1 des
 *       règles) et n'est jamais retiré ; un second --banc est REFUSÉ sans --rejouer-apres-correction "<raison>" (une
 *       faute de code, jamais un réglage ; les deux verdicts côte à côte). Un écart d'étalonnage arrête tout.
 *   --recopier <banc-etape39.json>
 *       ÉCRIT src/data/mise/noteDeLaMise.js (MISE_AU_BANC) PAR SCRIPT, et garde la sortie et les règles telles quelles dans
 *       test/fixtures (banc-etape39.json, banc-regles-etape39.md) : T-B7 refait la note à l'octet.
 *   --note-nulle
 *       ÉCRIT noteDeLaMise.js avec MISE_AU_BANC = null (avant le passage), PAR SCRIPT.
 *   --ombre
 *       L'ombre P5 de la mise : au lot 1c seulement (refusée ici).
 *
 * REFUS : sous OneDrive, hors du bac à sable (sauf une copie d'essai gardée par test/aides/garde.mjs), une sortie ou un
 * verrou sous OneDrive. Ne lit jamais le capital de Pierre ni ses paris. Sortie : le résumé sur stderr, une ligne JSON de
 * bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { modeBacASable } from '../src/config/bacASable.js';
import { VARIANTES_DE_L_ETAPE_39 } from '../src/bench/lancements.js';
import { COMBINAISON_AU_BANC } from '../src/data/combinaison/noteDeLaCombinaison.js';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import {
  VERSION_DU_BANC,
  JUGE,
  SCELLEMENT,
  CHAMPS_DU_RESULTAT,
  parisDeLExport,
  comptes,
  etalonnerLesMises,
  lireLesBandesDeLa38,
  passerLeBanc,
  aRecopier,
  texteDeLaNote
} from '../src/data/mise/bancDeLaMise.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTE = path.join(SERVEUR, 'src', 'data', 'mise', 'noteDeLaMise.js');
const FIXTURE_SORTIE = 'test/fixtures/banc-etape39.json';
const FIXTURE_REGLES = 'test/fixtures/banc-regles-etape39.md';

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
  dire(`[étape 39] REFUS : ${raison}`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}
/** Les modules SCELLÉS dans les règles : les lignes « - <sha1> src/<chemin>.js ». */
function modulesScellesDansLesRegles(texte) {
  return [...texte.matchAll(/^- ([0-9a-f]{40}) (src\/[A-Za-z0-9_/]+\.js)\s*$/gm)].map((m) => [m[2], m[1]]);
}
/** L'heure de Paris (heures × 60 + minutes) de l'horloge du processus. */
function minutesAParis(instant = new Date()) {
  const parties = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const v = (t) => Number(parties.find((x) => x.type === t)?.value ?? NaN);
  return v('hour') * 60 + v('minute');
}

// ------------------------------------------------------------ garde-fous
const modes = ['--comptes', '--banc', '--recopier', '--note-nulle', '--ombre'].filter(drapeau);
if (modes.length !== 1) refuser('un seul mode : --comptes, --banc, --recopier, --note-nulle ou --ombre.');
const MODE = modes[0];
if (MODE === '--ombre') refuser('l’ombre P5 de la mise vient au lot 1c (rejouée depuis l’archive, jamais la nuit) : rien lancé.');
if (sousOneDrive(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}).`);
const ESSAI = Boolean(process.env.CM_TEST_DOSSIER);
if (!modeBacASable() && !ESSAI) refuser('ce script sert au bac à sable (CM_BAC_A_SABLE=1) : le banc de la mise ne se passe jamais chez Pierre.');
const sortie = option('--sortie');
if (sortie && sousOneDrive(sortie)) refuser(`une sortie sous OneDrive est refusée (${sortie}).`);
// Copie d'essai SEULEMENT : l'étalonnage ignoré (paris fabriqués) et moins de tirages — jamais dans le bac ni chez Pierre.
const ESSAI_ETALONNAGE = process.env.CM_ESSAI_ETALONNAGE === 'ignorer';
const ESSAI_TIRAGES = process.env.CM_ESSAI_TIRAGES ? Number(process.env.CM_ESSAI_TIRAGES) : null;
if ((ESSAI_ETALONNAGE || ESSAI_TIRAGES) && !ESSAI) refuser('l’étalonnage ignoré et les tirages réduits ne valent que pour une copie d’essai.');

/** L'export de P2 : son sha1 vérifié AVANT toute lecture ; le fichier existe. */
function exportVerifie() {
  const fichier = option('--paris');
  const attendu = option('--sha1-paris');
  if (!fichier || !fs.existsSync(fichier) || !attendu) refuser('--paris <jsonl> et --sha1-paris <sha1> sont obligatoires (l’export de P2 par scripts/bench.mjs --lignes).');
  if (sha1(fichier) !== attendu) refuser(`l’export a changé depuis son sha1 (${sha1(fichier)} ≠ ${attendu}) : rien lu.`);
  return { fichier: path.resolve(fichier), sha1: attendu };
}

/**
 * Les lignes de l'export : l'en-tête, puis les lignes « pari » seulement. `sansResultat` : chaque pari lu SANS ses champs de
 * résultat (retirés par le lecteur JSON lui-même : les comptes ne les voient jamais).
 */
function lireLExport(fichier, { sansResultat }) {
  const texte = fs.readFileSync(fichier, 'utf8').split('\n');
  const lignes = [JSON.parse(texte[0])];
  const sansLeResultat = (cle, valeur) => (CHAMPS_DU_RESULTAT.includes(cle) ? undefined : valeur);
  for (let i = 1; i < texte.length; i++) {
    if (!texte[i].includes('"type":"pari"')) continue;
    lignes.push(sansResultat ? JSON.parse(texte[i], sansLeResultat) : JSON.parse(texte[i]));
  }
  return parisDeLExport(lignes, { sansIssue: sansResultat });
}

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
    dire(`[étape 39] la passe de Pierre tourne (${JSON.stringify(running).slice(0, 100)}) : j'attends`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
}

const ecrireJson = (fichier, objet) => {
  fs.mkdirSync(path.dirname(path.resolve(fichier)), { recursive: true });
  fs.writeFileSync(fichier, `${JSON.stringify(objet, null, 1)}\n`, { flag: 'wx' });
};

// ------------------------------------------------------------ --comptes
if (MODE === '--comptes') {
  if (!sortie) refuser('--sortie <json> est obligatoire.');
  if (fs.existsSync(sortie)) refuser(`la sortie existe déjà (${sortie}) : jamais écrasée.`);
  const exp = exportVerifie();
  const debut = new Date().toISOString();
  const { moteur, reglage, paris } = lireLExport(exp.fichier, { sansResultat: true });
  const mises = etalonnerLesMises(paris);
  const c = comptes(paris);
  ecrireJson(sortie, { format: VERSION_DU_BANC, mode: 'comptes', aucunResultatLu: true, champsRetires: CHAMPS_DU_RESULTAT, debut, fin: new Date().toISOString(), paris: { ...exp, n: paris.length }, moteur, reglage, etalonnageDesMises: { n: mises.n, egales: mises.egales, attendu: mises.attendu, ok: mises.ok, ecarts: mises.ecarts }, comptes: c });
  dire(`[étape 39] comptes écrits : ${sortie} (sha1 ${sha1(sortie)}) ; mises ${mises.egales} sur ${mises.n} à l’octet ; ${c.plafonnes} plafonnées ; placebo : ${Math.round(100 * c.placebo.partGardee)} % des mises gardées`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'comptes', sortie: path.resolve(sortie), sha1: sha1(sortie), mises: `${mises.egales}/${mises.n}`, etalonnageDesMises: mises.ok })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --banc
if (MODE === '--banc') {
  const K = Number(option('--k'));
  if (K !== VARIANTES_DE_L_ETAPE_39.length || K !== JUGE.K) refuser(`--k ${option('--k') ?? '(absent)'} : K doit valoir le nombre de variantes déclarées (${VARIANTES_DE_L_ETAPE_39.length}, VARIANTES_DE_L_ETAPE_39).`);
  const minutes = minutesAParis();
  if (minutes >= 10 && minutes < 150) refuser('jamais entre 0 h 10 et 2 h 30 (heure de Paris) : la passe de nuit de Pierre tourne.');
  const regles = option('--regles');
  const sha1Regles = option('--sha1-regles');
  if (!regles || !fs.existsSync(regles) || !sha1Regles) refuser('--regles <md> et --sha1-regles <sha1> sont obligatoires (les règles écrites AVANT le regard).');
  if (sha1(regles) !== sha1Regles) refuser(`les règles ont changé depuis leur sha1 (${sha1(regles)} ≠ ${sha1Regles}) : rien lu.`);
  const texteRegles = fs.readFileSync(regles, 'utf8');
  const exp = exportVerifie();
  if (!texteRegles.includes(exp.sha1)) refuser(`les règles ne citent pas l’export par son sha1 (${exp.sha1}) : rien lu.`);
  // T-B11 : les règles citent la conception scellée AVANT le premier regard de la note de la 38.
  const sc = SCELLEMENT.conception;
  if (!texteRegles.includes(sc.sha1) || !texteRegles.includes(sc.ecriteLe)) refuser(`les règles ne citent pas la conception scellée (${sc.sha1}, écrite le ${sc.ecriteLe}) : rien lu.`);
  const regard38 = COMBINAISON_AU_BANC?.premierRegard ?? null;
  if (regard38 && !(Date.parse(sc.ecriteLe) < Date.parse(regard38))) refuser(`la conception scellée (${sc.ecriteLe}) n’est pas antérieure au premier regard de la 38 (${regard38}) : rien lu.`);
  const scelles = modulesScellesDansLesRegles(texteRegles);
  if (!scelles.length) refuser('les règles ne scellent aucun module : rien lu.');
  for (const [f, attendu] of scelles) {
    const reel = fs.existsSync(path.join(SERVEUR, f)) ? sha1(path.join(SERVEUR, f)) : null;
    if (reel !== attendu) refuser(`${f} n’a plus le sha1 scellé dans les règles (${reel ?? 'absent'} ≠ ${attendu}) : rien lu.`);
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
    precedent = { verrou: v, verdicts: ancienne?.banc?.variantes?.map((x) => ({ id: x.id, verdict: x.verdict })) ?? null, decision: ancienne?.banc?.forme?.decision ?? null, etalonnage: ancienne?.etalonnage ?? null };
  } else if (raison) refuser('--rejouer-apres-correction sans passage précédent (aucun verrou) : rien à rejouer.');
  if (fs.existsSync(sortie)) refuser(`la sortie existe déjà (${sortie}) : jamais écrasée.`);
  const passe = attendreLaPasse(passeAvant);
  // LE VERROU, AVANT toute lecture d'une issue : heure, pid, sha1 des règles et de l'export. Jamais retiré.
  const pose = new Date().toISOString();
  const entree = { pose, pid: process.pid, regles: { fichier: path.resolve(regles), sha1: sha1Regles }, paris: exp, sortie: path.resolve(sortie), K };
  if (precedent) {
    const v = precedent.verrou;
    v.rejeux = [...(v.rejeux ?? []), { ...entree, raison }];
    fs.writeFileSync(verrou, `${JSON.stringify(v)}\n`);
  } else {
    fs.writeFileSync(verrou, `${JSON.stringify(entree)}\n`, { flag: 'wx' });
  }
  dire(`[étape 39] verrou posé (${verrou}) à ${pose} ; le passage commence (dans ce script, l’export en lecture).`);
  const { paris } = lireLExport(exp.fichier, { sansResultat: false });
  const bandesLues = lireLesBandesDeLa38(COMBINAISON_AU_BANC);
  const empreinte = empreinteDuCode({ rafraichir: true });
  const t0 = performance.now();
  const r = passerLeBanc({ paris, bandesLues, ...(ESSAI_TIRAGES ? { tirages: ESSAI_TIRAGES } : {}), ...(ESSAI_ETALONNAGE ? { ignorerEtalonnage: true } : {}) });
  const fin = new Date().toISOString();
  const resultat = {
    format: VERSION_DU_BANC,
    quoi: 'Banc de la mise (étape 39, lot 1b) : le passage unique.',
    ou: 'bac à sable',
    premierRegard: pose,
    fin,
    dureeS: Math.round((performance.now() - t0) / 100) / 10,
    paris: { fichier: exp.fichier, sha1: exp.sha1, n: paris.length },
    passeDePierre: passe,
    regles: { fichier: path.resolve(regles), sha1: sha1Regles, copie: FIXTURE_REGLES },
    scellement: { conception: SCELLEMENT.conception, premierRegardDeLa38: regard38 },
    verrou: { fichier: path.resolve(verrou), pose },
    modulesScelles: Object.fromEntries(scelles),
    empreinteDuMoteur: { sha1: empreinte.empreinte, fichiers: Object.keys(empreinte.fichiers ?? {}).length, candidate: empreinteDeLaCandidate(CANDIDATE_EN_ESSAI) },
    rejeu: precedent ? { raison, precedent: precedent.verdicts, decisionPrecedente: precedent.decision, etalonnagePrecedent: precedent.etalonnage } : null,
    etalonnage: r.etalonnage,
    arret: r.arret,
    banc: r.banc
  };
  ecrireJson(sortie, resultat);
  if (r.arret) {
    dire(`[étape 39] ÉTALONNAGE EN ÉCART — rien n’est jugé : ${r.etalonnage.ecarts.slice(0, 20).join(' ; ')}`);
    process.stdout.write(`${JSON.stringify({ ok: false, mode: 'banc', arret: 'etalonnage', sortie: path.resolve(sortie), sha1: sha1(sortie), ecarts: r.etalonnage.ecarts.slice(0, 50) })}\n`);
    process.exit(3);
  }
  dire(`[étape 39] étalonnage à l’octet ; K = ${r.banc.K}, z = ${r.banc.z.toFixed(4)} ; placebo : ${r.banc.placebos['placebo-forme']} ; forme : ${r.banc.forme.decision}`);
  for (const v of r.banc.variantes) dire(`  ${v.id.padEnd(16)} ${String(v.verdict).padEnd(20)}${v.j1 ? ` J1 ${v.j1.gain?.toExponential(3)} [${(v.j1.fourchette ?? []).map((x) => x.toExponential(2)).join(' ; ')}] ; J2 ${v.j2.verdict}` : ''}`);
  if (precedent?.verdicts) {
    dire('  côte à côte (passage précédent → celui-ci) :');
    for (const v of r.banc.variantes) dire(`    ${v.id.padEnd(16)} ${precedent.verdicts.find((x) => x.id === v.id)?.verdict ?? '?'} → ${v.verdict}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'banc', sortie: path.resolve(sortie), sha1: sha1(sortie), placebos: r.banc.placebos, decision: r.banc.forme.decision, verdicts: Object.fromEntries(r.banc.variantes.map((v) => [v.id, v.verdict])) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --recopier
if (MODE === '--recopier') {
  const fichier = option('--recopier');
  if (!fichier || !fs.existsSync(fichier)) refuser('--recopier <banc-etape39.json> : la sortie du passage du banc est obligatoire.');
  const json = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  if (json.format !== VERSION_DU_BANC || !json.banc) refuser('ce n’est pas une sortie du banc de l’étape 39 (ou le passage s’est arrêté à l’étalonnage).');
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
  dire(`[étape 39] note écrite PAR SCRIPT : ${NOTE} (${fs.statSync(NOTE).size} octets) ; sortie et règles gardées dans test/fixtures.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'recopier', note: NOTE, sha1Note: sha1(NOTE), sortie: cibleSortie, sha1Sortie: sha1(cibleSortie), regles: cibleRegles, sha1Regles: sha1(cibleRegles) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --note-nulle (avant le passage)
if (MODE === '--note-nulle') {
  if (fs.existsSync(NOTE) && !/MISE_AU_BANC = null;/.test(fs.readFileSync(NOTE, 'utf8'))) refuser('la note porte déjà un passage du banc : jamais remise à null.');
  fs.writeFileSync(NOTE, texteDeLaNote(null));
  dire(`[étape 39] note nulle écrite PAR SCRIPT : ${NOTE}`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'note-nulle', note: NOTE, sha1Note: sha1(NOTE) })}\n`);
  process.exit(0);
}
