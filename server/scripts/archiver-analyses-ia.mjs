#!/usr/bin/env node
/**
 * archiver-analyses-ia.mjs — les analyses IA rangées jour par jour, pour GitHub.
 * -----------------------------------------------------------------------
 * Le fichier des analyses de l'IA (data/runtime/match-ai-analyses.json)
 * grossit d'environ 3,5 Mo par jour, et GitHub refuse tout fichier de plus
 * de 100 Mo. Ce script le RECOPIE, sans jamais le modifier, dans
 * data/archives/analyses-ia/AAAA-MM-JJ.json : un fichier par jour de match
 * (date du coup d'envoi, heure de Paris ; à défaut, date de l'analyse), les
 * analyses triées par coup d'envoi puis par identifiant. C'est ce dossier
 * qui part sur GitHub ; le gros fichier n'y va plus (.gitignore). L'appli ne
 * lit jamais ces archives.
 *
 * Une archive ne perd rien : une analyse absente du fichier de l'appli reste
 * dans son jour (le fichier remplace seulement celles qu'il contient, par
 * identifiant de match), et un jour n'est jamais supprimé. Seuls les jours
 * qui ont changé sont réécrits.
 *
 *   node server/scripts/archiver-analyses-ia.mjs                (range, depuis le dépôt)
 *   node server/scripts/archiver-analyses-ia.mjs --verifier     (n'écrit rien : dit ce qui changerait)
 *   node server/scripts/archiver-analyses-ia.mjs --reconstituer <fichier>
 *        refait le fichier complet à partir des archives, dans <fichier>
 *        (jamais par-dessus le fichier de l'appli)
 *   (essais : --source <fichier> --dossier <dossier>)
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../src/utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PAR_DEFAUT = path.resolve(__dirname, '../data/runtime/match-ai-analyses.json');
const DOSSIER_PAR_DEFAUT = path.resolve(__dirname, '../data/archives/analyses-ia');
const SANS_DATE = 'sans-date';
const NOM_DU_JOUR = /^(\d{4}-\d{2}-\d{2}|sans-date)\.json$/;

const jourDeParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

function refuser(message) {
  console.error(`archiver-analyses-ia : ${message}`);
  process.exit(1);
}

function lireOptions(argv) {
  const options = { verifier: false, reconstituer: null, source: SOURCE_PAR_DEFAUT, dossier: DOSSIER_PAR_DEFAUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verifier') options.verifier = true;
    else if (a === '--reconstituer' || a === '--source' || a === '--dossier') {
      const valeur = argv[++i];
      if (!valeur || valeur.startsWith('--')) refuser(`${a} attend un chemin.`);
      if (a === '--reconstituer') options.reconstituer = path.resolve(valeur);
      else options[a.slice(2)] = path.resolve(valeur);
    } else refuser(`option inconnue : ${a}`);
  }
  return options;
}

/** Le jour de Paris d'une analyse : coup d'envoi, sinon date de l'analyse, sinon « sans-date ». */
export function jourDeLAnalyse(analyse) {
  for (const champ of ['commenceTime', 'analysedAt', 'createdAt']) {
    const instant = Date.parse(analyse?.[champ] ?? '');
    if (Number.isFinite(instant)) return jourDeParis.format(new Date(instant));
  }
  return SANS_DATE;
}

const cleDeTri = (a) => `${a?.commenceTime ?? ''}|${String(a?.matchId ?? '')}`;
const trier = (liste) => [...liste].sort((x, y) => (cleDeTri(x) < cleDeTri(y) ? -1 : cleDeTri(x) > cleDeTri(y) ? 1 : 0));
// Le même texte que writeJsonAtomic (indentation 2, sans saut de ligne final) : on compare avant d'écrire.
const texteDe = (liste) => JSON.stringify(liste, null, 2);

function lireLaSource(source) {
  if (!fs.existsSync(source)) refuser(`fichier des analyses absent : ${source}`);
  const analyses = readJsonFile(source, null);
  if (!Array.isArray(analyses)) refuser(`le fichier des analyses n'est pas une liste : ${source}`);
  const sansIdentifiant = analyses.filter((a) => a?.matchId === undefined || a?.matchId === null || a?.matchId === '');
  if (sansIdentifiant.length) refuser(`${sansIdentifiant.length} analyse(s) sans identifiant de match : rien n'est rangé.`);
  return analyses;
}

function lireUnJour(fichier) {
  const liste = readJsonFile(fichier, null);
  if (!Array.isArray(liste)) refuser(`archive illisible ou qui n'est pas une liste : ${fichier}`);
  return liste;
}

function joursArchives(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).filter((f) => NOM_DU_JOUR.test(f)).sort();
}

export function ranger({ source, dossier, verifier = false }) {
  const analyses = lireLaSource(source);
  const parJour = new Map();
  for (const a of analyses) {
    const jour = jourDeLAnalyse(a);
    if (!parJour.has(jour)) parJour.set(jour, []);
    parJour.get(jour).push(a);
  }
  const bilan = { analyses: analyses.length, jours: parJour.size, ecrits: [], inchanges: 0, gardees: 0 };
  for (const [jour, duFichier] of [...parJour].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const fichier = path.join(dossier, `${jour}.json`);
    const existant = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : null;
    const parIdentifiant = new Map();
    if (existant !== null) for (const a of lireUnJour(fichier)) parIdentifiant.set(String(a.matchId), a);
    const avant = parIdentifiant.size;
    for (const a of duFichier) parIdentifiant.set(String(a.matchId), a);
    const presentes = new Set(duFichier.map((a) => String(a.matchId)));
    bilan.gardees += [...parIdentifiant.keys()].filter((k) => !presentes.has(k)).length;
    const texte = texteDe(trier([...parIdentifiant.values()]));
    if (texte === existant) {
      bilan.inchanges += 1;
      continue;
    }
    bilan.ecrits.push({ jour, analyses: parIdentifiant.size, nouvelles: parIdentifiant.size - avant });
    if (!verifier) writeJsonAtomic(fichier, JSON.parse(texte));
  }
  return bilan;
}

export function reconstituer({ source, dossier, sortie }) {
  if (path.resolve(sortie).toLowerCase() === path.resolve(source).toLowerCase()) {
    refuser('--reconstituer ne réécrit jamais le fichier de l’appli : donnez un autre chemin.');
  }
  const jours = joursArchives(dossier);
  if (!jours.length) refuser(`aucune archive dans ${dossier}`);
  const parIdentifiant = new Map();
  for (const f of jours) for (const a of lireUnJour(path.join(dossier, f))) parIdentifiant.set(String(a.matchId), a);
  const liste = [...parIdentifiant.values()].sort((x, y) => {
    const a = `${x?.createdAt ?? ''}|${String(x?.matchId)}`;
    const b = `${y?.createdAt ?? ''}|${String(y?.matchId)}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  writeJsonAtomic(sortie, liste);
  return { jours: jours.length, analyses: liste.length };
}

function principal() {
  const options = lireOptions(process.argv.slice(2));
  if (options.reconstituer) {
    const r = reconstituer({ source: options.source, dossier: options.dossier, sortie: options.reconstituer });
    console.log(`Reconstitué : ${r.analyses} analyses tirées de ${r.jours} jours d'archive → ${options.reconstituer}`);
    return;
  }
  const b = ranger(options);
  const taille = joursArchives(options.dossier).reduce((s, f) => s + fs.statSync(path.join(options.dossier, f)).size, 0);
  console.log(`${options.verifier ? 'VÉRIFICATION (rien n’est écrit) — ' : ''}${b.analyses} analyses sur ${b.jours} jours de match ; `
    + `${b.ecrits.length} jour(s) ${options.verifier ? 'à réécrire' : 'écrit(s)'}, ${b.inchanges} inchangé(s) ; `
    + `${b.gardees} analyse(s) gardée(s) de l'archive sans être dans le fichier de l'appli.`);
  for (const e of b.ecrits) console.log(`  ${e.jour} : ${e.analyses} analyse(s)${e.nouvelles ? `, dont ${e.nouvelles} nouvelle(s)` : ''}`);
  console.log(`Archive : ${(taille / 1048576).toFixed(1).replace('.', ',')} Mo dans ${options.dossier}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
