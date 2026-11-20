/**
 * recetteFeuilleDeRoute.test.mjs — LA CARTE « ESSAI GÉNÉRAL » DE L'ÉTAPE 47 SUR LA FEUILLE DE ROUTE (étape 47, lot 1,
 * passe P4a, 17/11/2026). T-F1 à T-F9 (conception § 7.4, corrigée par CR-3, CR-10, CR-27, CR-29, CR-30, CR-53, R-S9),
 * plus :
 *   - CR-10 : avec la note du bilan, la carte et le bloc « Preuve après lancement » de la 47 disent le même verdict, le
 *     même nombre de matchs et les mêmes dates ; « rien à mesurer » a sa phrase ;
 *   - § 2.3 P3-P4 [R-S10] : la fermeture des imports d'etatDeLaRecette.js et de blocRecette.js n'atteint ni
 *     refreshStatusRepository.js, ni matchStatsDb.js, ni env.js, ni le journal ; aucun import() à chemin variable.
 * Aucun réseau, aucune base, aucun serveur ; les fichiers du journal sont écrits dans un dossier temporaire (mkdtemp sous
 * os.tmpdir()), jamais dans C:\Users\PC\CoteMaster\recette.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';
import { blocDuBancEtape27 } from '../src/data/roadmap/bancEtape27.js';
import { ETAPES } from '../src/data/roadmap/plan.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';
import * as B from '../src/data/roadmap/blocRecette.js';
import * as E from '../src/data/recette/etatDeLaRecette.js';
import { cheminsDeLaRecette } from '../src/data/recette/cheminsDeLaRecette.js';
import { resumeVide } from '../src/data/recette/journalDeLaRecette.js';

// P4b-1 (RC-11) : lancé par `node` seul (sans node --test), aucun chemin par défaut ne doit mener chez Pierre. Les chemins
// par défaut sont refusés dès que CM_TEST_DOSSIER est posé ; il l'est ici, avant tout appel (lu à l'appel, jamais à l'import).
if (!process.env.NODE_TEST_CONTEXT && !process.env.CM_TEST_DOSSIER) process.env.CM_TEST_DOSSIER = '1';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SERVEUR = path.resolve(ICI, '..');
const UI = path.resolve(SERVEUR, '..', 'ui');
const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'recette.js')).href);
const P = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'preuve.js')).href);

const PIERRE_VIDE = { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} };
const MESURE_VIDE = { source: 'absent', fichier: 'C:\\essai\\registre.json', probleme: null, majLe: null, nombre: 0, etapes: {} };
const RECETTE = (o = {}) => Object.freeze({ rodageDepuis: null, debut: null, jours: 14, relances: [], empreinteDesCauses: null, debutDeLaFenetre: null, ...o });
const R0 = RECETTE({ rodageDepuis: '2026-11-18', debut: '2026-11-20' });
const toutes = (e) => e.lots.flatMap((l) => l.etapes);
const la47 = (e) => toutes(e).find((x) => x.id === '47');

/** Un dossier du journal factice : battement, dernier état, decisions.json, fichiers du jour. */
function dossierJournal() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-carte-'));
  const chemins = cheminsDeLaRecette({ racineHorsOneDrive: path.join(dossier, 'recette'), dossierRuntime: path.join(dossier, 'journal') });
  fs.mkdirSync(chemins.racine, { recursive: true });
  fs.mkdirSync(chemins.dossierDuJournal, { recursive: true });
  const ecrire = (f, v) => fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v));
  return {
    chemins,
    ecrire,
    jour: (jour, o = {}, phase = 'recette') => ecrire(chemins.fichierDuJour(jour), { ...resumeVide(jour, phase), ...o }),
    lire: (maintenant, recette = R0) => E.etatDeLaRecette({ maintenant, recette, chemins, lire: E.creerLecteurTolerant() }),
    nettoyer: () => fs.rmSync(dossier, { recursive: true, force: true })
  };
}

const ev = (id, le, classe, o = {}) => ({ id, le, type: 'etape-en-alerte', cle: 'x', texte: `texte ${id}`, classe, cause: null, rodage: false, ...o });
const passes = (total, partielles = 0, enEchec = 0) => ({ total, ok: total - partielles - enEchec, partielles, enEchec, nuit: null, rattrapages: [], liste: [] });

// --- T-F1 -----------------------------------------------------------------------------------------------------------

test('T-F1 avant le rodage : structure complète (14 lignes vides « — », Σ et ⌀, six critères « à faire »), phrase PH-1', () => {
  const d = dossierJournal();
  try {
    const bloc = B.blocDeLaRecette({ etat: d.lire(Date.parse('2026-11-17T12:00:00Z'), RECETTE()), maintenant: Date.parse('2026-11-17T12:00:00Z'), recette: RECETTE() });
    assert.equal(bloc.moment, 'avant');
    assert.equal(bloc.indisponible, false);
    assert.equal(bloc.jours.length, 14);
    assert.ok(bloc.jours.every((l) => l.etat === 'a-venir'));
    assert.deepEqual(bloc.criteres.map((c) => c.mot), Array(6).fill('à faire'));
    const c = U.carteDeLaRecette(bloc);
    assert.match(c.tete, /^L’essai général n’a pas commencé\./);
    assert.equal(c.colonnes.length, 10);
    assert.equal(c.lignes.length, 14);
    for (const l of c.lignes) assert.deepEqual(l.cellules, Array(9).fill('—'));
    assert.equal(c.somme.cellules.length, 9);
    assert.equal(c.moyenne.cellules.length, 9);
    assert.equal(c.criteres.length, 6);
    assert.ok(c.criteres.every((x) => x.mot === 'à faire'));
    assert.equal(c.vie, null);
    assert.ok(c.nonSurveille.includes('non compté : aucune heure de coup d’envoi lisible sans la base'));
    assert.match(c.liste.titre, /^Ce qui est compté comme connu \(\d+\)$/);
    assert.equal(c.liste.etat, 'liste pas encore scellée (elle le sera au début de l’essai)');
  } finally {
    d.nettoyer();
  }
});

// --- T-F2 -----------------------------------------------------------------------------------------------------------

test('T-F2 pendant : jour N, comptes du jour, jour passé sans fichier « non observé », lignes futures « — », Σ et ⌀ justes, jamais de Σ d’un pourcentage', () => {
  const d = dossierJournal();
  try {
    d.ecrire(d.chemins.battement, { pid: 1, dernierTour: '2026-11-24T11:50:00Z' });
    d.ecrire(d.chemins.decisions, { version: 1, decisions: [{ evenement: 'e3', sorte: 'rattachement', cause: 'veille-du-pc', raison: 'vu au journal Windows', le: '2026-11-23T10:00:00Z' }] });
    d.jour('2026-11-21', { passes: passes(30, 14), couverture: { minutesObservees: 1300, minutesDeVeille: 120, minutesArret: 20, minutesEnErreur: 0 }, sauvegarde: { ok: true }, ia: { appels: 100, tokens: 1_600_000 }, evenements: [ev('e1', '2026-11-21T10:00:00Z', 'connue', { cause: 'veille-du-pc' }), ev('e2', '2026-11-21T11:00:00Z', 'info')] });
    d.jour('2026-11-22', { passes: passes(28, 10, 1), couverture: { minutesObservees: 1200, minutesDeVeille: 200, minutesArret: 40, minutesEnErreur: 0 }, sauvegarde: { ok: true }, ia: { appels: 80, tokens: 1_200_000 }, direct: { suspensions: 1, minutesSuspendu: 30 }, evenements: [ev('e3', '2026-11-22T03:00:00Z', 'a-expliquer'), ev('e4', '2026-11-22T09:00:00Z', 'a-expliquer')] });
    // 23/11 : pas de fichier (CôteMaster ne tournait pas) ; 24/11 : aujourd'hui, lu dans le dernier état vu.
    d.ecrire(d.chemins.dernierEtat, { jour: '2026-11-24', ecritLe: '2026-11-24T11:50:00Z', vus: { premierJour: '2026-11-18' }, resume: { ...resumeVide('2026-11-24', 'recette'), passes: passes(10, 2) } });
    const maintenant = Date.parse('2026-11-24T12:00:00Z');
    const bloc = B.blocDeLaRecette({ etat: d.lire(maintenant), maintenant, recette: R0 });
    assert.equal(bloc.moment, 'recette');
    assert.equal(bloc.calendrier.numero, 4);
    assert.deepEqual(bloc.jours.slice(0, 5).map((l) => [l.jour, l.numero, l.etat]), [['2026-11-21', 1, 'observe'], ['2026-11-22', 2, 'observe'], ['2026-11-23', 3, 'non-observe'], ['2026-11-24', 4, 'observe'], ['2026-11-25', 5, 'a-venir']]);
    assert.equal(bloc.jours.length, 14);
    // Le rattachement à la main (CR-27) : e3 compte dans les connues (rattachées), pas dans les « à expliquer ».
    assert.deepEqual([bloc.jours[1].connues, bloc.jours[1].aExpliquer], [1, 1]);
    assert.deepEqual(bloc.episodes.rattachees.map((x) => x.id), ['e3']);
    assert.deepEqual(bloc.episodes.reconnues.map((x) => [x.cause, x.evenements]), [['veille-du-pc', 1]]);
    assert.deepEqual(bloc.aExpliquer.map((x) => x.id), ['e4']);
    assert.match(bloc.aExpliquer[0].age, /en retard/);
    const t = bloc.totaux;
    assert.deepEqual([t.joursObserves, t.passesFaites, t.passesARegarder, t.veilleMin, t.arretMin, t.connues, t.aExpliquer, t.sauvegardesFaites, t.appelsIa, t.tokensIa], [3, 68, 27, 320, 60, 2, 1, 2, 180, 2_800_000]);
    const c = U.carteDeLaRecette(bloc);
    assert.equal(c.tete, 'Essai général : jour 4 sur 14 (du 21/11 au 04/12).');
    assert.equal(c.vie, null, 'le journal tourne (10 min)');
    assert.deepEqual(c.lignes[0].cellules, ['30 / 14', '2 h', '20 min', '0 min', '1', '0', '0', 'faite', '100']);
    assert.equal(c.lignes[2].large, U.NON_OBSERVE);
    assert.equal(c.lignes[2].jour, 'J3 · 23/11');
    assert.deepEqual(c.lignes[5].cellules, Array(9).fill('—'));
    // RC-12 : aujourd'hui (24/11, 13 h à Paris) n'a encore aucune minute écrite : 13 h « non observées », en ambre.
    assert.deepEqual(c.somme.cellules, ['68 / 27', '5 h 20', '1 h', '13 h', '2', '0', '1', '2 sur 2', '180']);
    assert.equal(c.lignes[3].cellules[3], '13 h');
    assert.equal(c.lignes[3].ambre[3], true);
    assert.equal(c.moyenne.cellules[0], `${(68 / 3).toFixed(1).replace('.', ',')} / 9`);
    assert.equal(c.moyenne.cellules[8], (90).toLocaleString('fr-FR'), '⌀ des appels sur les jours qui en ont');
    for (const x of [...c.somme.cellules, ...c.moyenne.cellules]) assert.ok(!x.includes('%'), `Σ ou ⌀ d’un pourcentage : ${x}`);
    assert.ok(c.phrases.includes('Aucune panne nouvelle.'));
    // RC-17 : des causes, pas des événements ; le titre en minuscule au milieu de la phrase.
    assert.ok(c.phrases.some((p) => /^1 cause connue vue, connue au départ : le PC se met en veille \(2 jours\) ; dont 1 événement rattaché à la main\.$/.test(p)), c.phrases.join(' | '));
    // RC-23 : l'âge en texte court.
    assert.ok(c.phrases.some((p) => /^1 événement à expliquer \(le plus ancien depuis 2 jours\)\.$/.test(p)), c.phrases.join(' | '));
    // RC-25 : « sur N jours observés (k jours non observés) ».
    assert.ok(c.phrases.includes('Sauvegardes : 2 sur 2 jours observés (1 jour non observé). Restaurations d’essai : aucune pour l’instant.'), c.phrases.join(' | '));
    assert.equal(c.decompte, null, 'RC-23 : « en cours » ne double pas la tête');
    assert.ok(c.phrases.some((p) => /^Appels à l’IA : 180 appels, 2,8 millions de tokens \(⌀ 1,4 million par jour\)\.$/.test(p)), c.phrases.join(' | '));
    assert.ok(c.phrases.includes('Direct : suspendu une fois (30 min en tout).'));
  } finally {
    d.nettoyer();
  }
});

test('T-F2 PH-23, PH-3b, PH-4b, PH-4c : le journal arrêté depuis plus de 25 min, le second essai, la première puis la seconde panne nouvelle', () => {
  const d = dossierJournal();
  try {
    d.ecrire(d.chemins.battement, { pid: 1, dernierTour: '2026-11-24T09:00:00Z' });
    d.jour('2026-11-21', { passes: passes(5), evenements: [ev('n1', '2026-11-21T13:05:00Z', 'nouvelle', { type: 'arret-sur-erreur', cle: 'k' })] });
    const maintenant = Date.parse('2026-11-24T12:00:00Z');
    const bloc = B.blocDeLaRecette({ etat: d.lire(maintenant), maintenant, recette: R0 });
    const c = U.carteDeLaRecette(bloc);
    assert.equal(bloc.vie.tourne, false);
    assert.equal(c.vie, 'Le journal de l’essai ne tourne plus depuis le 24/11 à 10 h 00 : rien n’est noté.');
    assert.ok(c.phrases.includes('Une panne nouvelle : le 21/11 à 14 h 05, « texte n1 ». Les deux semaines repartiront après sa correction (une seule fois) ; si la correction touche le moteur, on en décide d’abord avec vous.'), c.phrases.join(' | '));
    assert.equal(c.decompte, null, 'RC-23 : « pas tenue » ne double pas PH-4');
    // Après une relance : « Second essai », et une seconde panne nouvelle → « à décider avec vous ».
    const R1 = RECETTE({ rodageDepuis: '2026-11-18', debut: '2026-11-20', relances: [{ le: '2026-11-22', apres: 'correction' }] });
    d.jour('2026-11-23', { passes: passes(5), evenements: [ev('n2', '2026-11-23T10:00:00Z', 'nouvelle', { type: 'arret-sur-erreur', cle: 'k2' })] });
    const b2 = B.blocDeLaRecette({ etat: d.lire(maintenant, R1), maintenant, recette: R1 });
    const c2 = U.carteDeLaRecette(b2);
    assert.equal(c2.tete, 'Second essai : jour 2 sur 14 (du 23/11 au 06/12).');
    assert.ok(c2.phrases.includes('Une panne nouvelle pendant le second essai : à décider avec vous.'), c2.phrases.join(' | '));
    // Rodage (J0 non écrit) : PH-2, rien n'est compté.
    const rodage = U.carteDeLaRecette(B.blocDeLaRecette({ etat: d.lire(maintenant, RECETTE({ rodageDepuis: '2026-11-18' })), maintenant, recette: RECETTE({ rodageDepuis: '2026-11-18' }) }));
    assert.equal(rodage.tete, 'Le journal de l’essai tourne déjà, en rodage depuis le 18/11 : rien n’est encore compté.');
  } finally {
    d.nettoyer();
  }
});

// --- T-F3 -----------------------------------------------------------------------------------------------------------

test('T-F3 après J14 sans note : PH-10', () => {
  const d = dossierJournal();
  try {
    const maintenant = Date.parse('2026-12-06T12:00:00Z');
    const bloc = B.blocDeLaRecette({ etat: d.lire(maintenant), maintenant, recette: R0 });
    assert.equal(bloc.moment, 'apres');
    assert.equal(bloc.replie, false);
    // RC-25 (T15) : PH-10 suit le cas B.
    assert.equal(U.carteDeLaRecette(bloc).tete, 'Les deux semaines sont finies (04/12) : aucune panne nouvelle. Le moteur n’a pas changé pendant l’essai : le bilan dira « rien à mesurer » pour le gain, puis chaque critère sera vérifié.');
  } finally {
    d.nettoyer();
  }
});

// --- T-F4 -----------------------------------------------------------------------------------------------------------

const NOTE = Object.freeze({
  mesure: { le: '2026-12-08T10:00:00Z', verdict: 'rien-a-mesurer', raison: 'Le moteur n’a pas changé pendant l’essai.', matchs: 1034, fenetre: { de: '2026-11-21', a: '2026-12-04' }, gain: null, fourchette: null, quoi: '', variantes: 517, version: 'v5' },
  criteres: { 'sans-panne': { mot: 'tenu', preuve: 'aucune panne nouvelle' } }
});

test('T-F4 une note partielle (chaque champ null tour à tour) : jamais d’exception ; un critère sans mot dit « à faire »', () => {
  const maintenant = Date.parse('2026-12-08T12:00:00Z');
  const etat = E.etatDeLaRecette({ maintenant, recette: R0, chemins: cheminsDeLaRecette({ racineHorsOneDrive: path.join(os.tmpdir(), `recette47-absent-${process.pid}`), dossierRuntime: path.join(os.tmpdir(), `recette47-absent-${process.pid}-j`) }) });
  const notes = [null, undefined, {}, { mesure: null }, { criteres: null }, { mesure: {} }, 'texte', 42, []];
  for (const k of Object.keys(NOTE.mesure)) notes.push({ ...NOTE, mesure: { ...NOTE.mesure, [k]: null } });
  notes.push({ ...NOTE, criteres: { 'sans-panne': null } }, { ...NOTE, mesure: { ...NOTE.mesure, fenetre: { de: null, a: null } } });
  for (const note of notes) {
    const bloc = B.blocDeLaRecette({ etat, note, maintenant, recette: R0 });
    assert.equal(bloc.criteres.length, 6, JSON.stringify(note));
    const carte = U.carteDeLaRecette(bloc);
    assert.equal(carte.criteres.length, 6);
    assert.doesNotThrow(() => B.mesureAvecLaNote(null, note));
    assert.doesNotThrow(() => P.lignesPreuve(B.mesureAvecLaNote(null, note)));
    if (!note?.criteres?.['sans-panne']) assert.ok(bloc.criteres.every((c) => c.mot === 'à faire'), JSON.stringify(note));
  }
  const avec = B.blocDeLaRecette({ etat, note: NOTE, maintenant, recette: R0 });
  assert.deepEqual(avec.criteres.map((c) => c.mot), ['tenu', 'à faire', 'à faire', 'à faire', 'à faire', 'à faire']);
  assert.equal(avec.replie, true);
  // Le bloc ne lève pas non plus sans état du tout.
  for (const etatBizarre of [null, undefined, {}, { jours: 'x' }, { jours: [null, 3, { jour: 'pas un jour' }] }, { lisible: false }]) assert.doesNotThrow(() => U.carteDeLaRecette(B.blocDeLaRecette({ etat: etatBizarre, maintenant, recette: R0 })));
});

// --- T-F5 -----------------------------------------------------------------------------------------------------------

test('T-F5 l’étape 47 reste « en cours » jusqu’à la ligne finale d’HISTORIQUE (une ligne partielle ne la finit pas)', () => {
  const base = { maintenant: Date.parse('2026-11-24T12:00:00Z'), pierre: PIERRE_VIDE, mesure: MESURE_VIDE, lireRecette: () => ({ lisible: true, jours: [] }) };
  assert.equal(la47(etatFeuilleDeRoute({ ...base, mesure: base.mesure, enCours: ['47'] })).etat, 'en-cours');
  const partielle = { etape: '47', fin: '2026-11-25', change: 'lot 1 en service', partielle: 'essai général en cours' };
  assert.equal(la47(etatFeuilleDeRoute({ ...base, mesure: base.mesure, historique: [...HISTORIQUE, partielle] })).etat, 'en-cours');
  const finale = { etape: '47', fin: '2026-12-23', change: 'recette générale finie' };
  const fini = la47(etatFeuilleDeRoute({ ...base, mesure: base.mesure, historique: [...HISTORIQUE, partielle, finale], enCours: ['47'] }));
  assert.deepEqual([fini.etat, fini.fin], ['terminee', '2026-12-23']);
});

// --- T-F6 -----------------------------------------------------------------------------------------------------------

test('T-F6 la section régime est dans l’état dès le lot 1', { skip: 'P7 : regimeDeCroisiere.js est un fichier de la passe P7 (la feuille de route l’ajoutera alors)' }, () => {});

// --- T-F7 -----------------------------------------------------------------------------------------------------------

test('T-F7 la carte n’apparaît que pour la 47 ; le bloc de la 27 est inchangé', () => {
  const e = etatFeuilleDeRoute({ maintenant: Date.parse('2026-11-24T12:00:00Z'), pierre: PIERRE_VIDE, mesure: MESURE_VIDE, lireRecette: () => ({ lisible: true, jours: [] }) });
  assert.deepEqual(toutes(e).filter((x) => 'recette' in x).map((x) => x.id), ['47']);
  assert.deepEqual(toutes(e).find((x) => x.id === '27').bancAvantApres, blocDuBancEtape27());
  assert.deepEqual(toutes(e).filter((x) => 'bancAvantApres' in x).map((x) => x.id), ['27']);
});

// --- T-F8 -----------------------------------------------------------------------------------------------------------

test('T-F8 le lecteur du journal ne lève jamais et ne garde pas une lecture ratée (cache par date et taille, CR-46)', () => {
  let contenu = '{ pas du json';
  let lectures = 0;
  const st = { mtimeMs: 1000, size: 50 };
  const fsx = {
    statSync: (f) => {
      if (f === 'absent') throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      if (f === 'refuse') throw Object.assign(new Error('EPERM refusé'), { code: 'EPERM' });
      return st;
    },
    readFileSync: () => {
      lectures += 1;
      return contenu;
    }
  };
  const lire = E.creerLecteurTolerant({ fsx });
  assert.equal(lire('f').etat, 'illisible');
  contenu = '{"a":1}';
  assert.deepEqual(lire('f'), { etat: 'lu', valeur: { a: 1 } }, 'même date, même taille : la lecture ratée n’est pas gardée');
  assert.equal(lectures, 2);
  assert.deepEqual(lire('f'), { etat: 'lu', valeur: { a: 1 } });
  assert.equal(lectures, 2, 'une lecture réussie est gardée tant que date et taille ne changent pas');
  st.mtimeMs = 2000;
  contenu = '[1,2]';
  assert.equal(lire('f').etat, 'illisible', 'forme inattendue (un tableau)');
  assert.equal(lire('absent').etat, 'absent');
  assert.equal(lire('refuse').etat, 'illisible');
  // Un lecteur qui lève, ou un fs qui lève n'importe quoi : etatDeLaRecette ne lève jamais.
  const chemins = cheminsDeLaRecette({ racineHorsOneDrive: 'C:/n-existe-pas/r', dossierRuntime: 'C:/n-existe-pas/j' });
  const r = E.etatDeLaRecette({ maintenant: Date.parse('2026-11-24T12:00:00Z'), recette: R0, chemins, lire: () => { throw new Error('boum'); } });
  assert.equal(r.lisible, false);
  assert.match(r.probleme, /boum/);
  const casse = E.creerLecteurTolerant({ fsx: { statSync: () => null, readFileSync: () => { throw new Error('x'); } } });
  assert.doesNotThrow(() => casse('f'));
  // Les chemins par défaut sont refusés sous un essai : « lisible: false », jamais une lecture chez Pierre.
  const defaut = E.etatDeLaRecette({ maintenant: Date.now() });
  assert.equal(defaut.lisible, false);
  assert.match(defaut.probleme, /chemins du journal refusés/);
});

// --- T-F9 [R-S9] ----------------------------------------------------------------------------------------------------

test('T-F9 un lecteur qui lève, puis un decisions.json lisible mais de forme inattendue (un tableau) : la feuille de route répond, 49 entrées, la 47 porte « recette.indisponible »', () => {
  const base = { maintenant: Date.parse('2026-11-24T12:00:00Z'), pierre: PIERRE_VIDE, mesure: MESURE_VIDE };
  const leve = etatFeuilleDeRoute({ ...base, mesure: base.mesure, lireRecette: () => { throw new Error('lecteur en panne'); } });
  assert.equal(toutes(leve).length, ETAPES.length);
  assert.equal(ETAPES.length, 49);
  assert.equal(la47(leve).recette.indisponible, true);
  assert.match(la47(leve).recette.probleme, /journal illisible pour l’instant/);
  assert.equal(U.carteDeLaRecette(la47(leve).recette).tete, 'journal illisible pour l’instant');
  assert.equal(U.carteDeLaRecette(la47(leve).recette).lignes.length, 14, 'la structure reste');
  // RC-20 point 3 et 4 : Σ « non lu » (jamais « 0 / 0 ») ; le repli garde la liste des causes et « Non surveillé ».
  const repli = U.carteDeLaRecette(la47(leve).recette);
  assert.equal(repli.somme.jour, 'Σ : non lu');
  assert.ok(repli.somme.cellules.every((x) => x === '—'), repli.somme.cellules.join(' | '));
  assert.doesNotMatch(repli.liste.titre, /\(0\)$/);
  assert.ok(repli.nonSurveille.includes('Non surveillé'));
  const d = dossierJournal();
  try {
    d.ecrire(d.chemins.decisions, [{ evenement: 'x' }]);
    const tableau = etatFeuilleDeRoute({ ...base, mesure: base.mesure, lireRecette: ({ maintenant }) => d.lire(maintenant) });
    assert.equal(toutes(tableau).length, 49);
    assert.equal(la47(tableau).recette.indisponible, true);
    assert.match(la47(tableau).recette.probleme, /decisions\.json \(forme inattendue/);
    // RC-20 point 1 : la tête reste (le moment est connu) ; le problème est dit dans sa ligne ambre.
    assert.equal(U.carteDeLaRecette(la47(tableau).recette).tete, 'Essai général : jour 4 sur 14 (du 21/11 au 04/12).');
    assert.match(U.carteDeLaRecette(la47(tableau).recette).probleme, /decisions.json/);
  } finally {
    d.nettoyer();
  }
});

// --- CR-10 ------------------------------------------------------------------------------------------------------------

test('CR-10 avec la note du bilan : la carte et la preuve de la 47 disent le même verdict, le même nombre de matchs et les mêmes dates ; « rien à mesurer » a sa phrase', () => {
  const base = { maintenant: Date.parse('2026-12-08T12:00:00Z'), pierre: PIERRE_VIDE, mesure: MESURE_VIDE, lireRecette: () => ({ lisible: true, jours: [] }) };
  const sans = la47(etatFeuilleDeRoute({ ...base, mesure: base.mesure }));
  assert.equal(sans.mesure, null, 'sans note ni registre : pas de bloc de preuve');
  assert.equal(sans.recette.bilan, null);
  const e = la47(etatFeuilleDeRoute({ ...base, mesure: base.mesure, noteDeLaRecette: NOTE }));
  assert.equal(e.recette.bilan.verdict, 'rien-a-mesurer');
  assert.equal(e.mesure.jugement.verdict, e.recette.bilan.verdict);
  assert.equal(e.mesure.jugement.n.matchs, e.recette.bilan.matchs);
  assert.deepEqual(e.mesure.jugement.fenetre, e.recette.bilan.fenetre);
  const preuve = P.lignesPreuve(e.mesure);
  assert.equal(preuve.verdict.pastille.texte, 'rien à mesurer');
  assert.notEqual(preuve.verdict.pastille.texte, 'pas encore jugée');
  assert.equal(preuve.matchs.texte, `${(1034).toLocaleString('fr-FR')} matchs, du 21/11 au 04/12 (jugé le 08/12/2026)`);
  assert.equal(preuve.gain.texte, 'rien à mesurer : aucun pourcentage du moteur n’a changé');
  // Un registre qui a déjà une mesure de la 47 : la note la complète (même verdict), sans perdre son lancement.
  const registre = { ...MESURE_VIDE, etapes: { 47: { aJuger: true, registre: 'ok', lancement: { le: '2026-11-20', version: 'v5' }, variantes: 517, jugement: null } } };
  const r = la47(etatFeuilleDeRoute({ ...base, mesure: registre, noteDeLaRecette: { ...NOTE, mesure: { ...NOTE.mesure, verdict: 'pas-prouve', gain: 0.4, fourchette: [-1.5, 2.3], quoi: 'd’erreur en moins' } } }));
  assert.deepEqual(r.mesure.lancement, { le: '2026-11-20', version: 'v5' });
  assert.equal(P.lignesPreuve(r.mesure).verdict.pastille.texte, 'pas prouvé');
  assert.equal(r.recette.bilan.verdict, 'pas-prouve');
  assert.equal(P.lignesPreuve(r.mesure).gain.valeur, '+0,4 %');
  // Un registre illisible ne cache pas la note.
  const illisible = la47(etatFeuilleDeRoute({ ...base, mesure: { ...MESURE_VIDE, etapes: { 47: { registre: 'illisible' } } }, noteDeLaRecette: NOTE }));
  assert.equal(P.lignesPreuve(illisible.mesure).verdict.pastille.texte, 'rien à mesurer');
  // Une autre étape garde la preuve « pas de gain calculé : pas assez de matchs ».
  assert.equal(P.lignesPreuve({ aJuger: true, registre: 'ok', lancement: null, variantes: 1, jugement: { verdict: 'pas-assez-de-matchs', n: { matchs: 10 }, enPourcent: null } }).gain.texte, 'pas de gain calculé : pas assez de matchs');
  assert.deepEqual(P.VERDICTS['rien-a-mesurer'], { texte: 'rien à mesurer', ton: '', icone: 'info' });
});

// --- § 2.3 P3-P4 [R-S10] : la fermeture des imports -------------------------------------------------------------------

/** La fermeture (imports statiques, `export … from`, import() littéraux) d'un fichier, en chemins relatifs à server/. */
function fermeture(depart) {
  const vus = new Set();
  const nonLitteraux = [];
  const pile = [depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specs = [...code.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm), ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm), ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    if (/\bimport\(\s*[^'"\s)]/.test(code)) nonLitteraux.push(f);
    for (const s of specs) if (s.startsWith('.')) pile.push(path.resolve(path.dirname(f), s));
  }
  return { fichiers: [...vus].map((f) => path.relative(SERVEUR, f).split(path.sep).join('/')).sort(), nonLitteraux };
}

test('§ 2.3 P3-P4 : la fermeture des imports d’etatDeLaRecette.js et de blocRecette.js n’atteint ni refreshStatusRepository.js, ni matchStatsDb.js, ni env.js, ni le journal', () => {
  const attendu = {
    'src/data/recette/etatDeLaRecette.js': ['src/config/bacASable.js', 'src/data/recette/calendrierDeLaRecette.js', 'src/data/recette/cheminsDeLaRecette.js', 'src/data/recette/etatDeLaRecette.js'],
    'src/data/roadmap/blocRecette.js': ['src/data/recette/calendrierDeLaRecette.js', 'src/data/recette/causesConnues.js', 'src/data/recette/classerLesEvenements.js', 'src/data/roadmap/blocRecette.js']
  };
  for (const [depart, liste] of Object.entries(attendu)) {
    const { fichiers, nonLitteraux } = fermeture(path.join(SERVEUR, depart));
    assert.deepEqual(nonLitteraux, [], `${depart} : import() à chemin variable`);
    for (const interdit of ['src/data/repositories/refreshStatusRepository.js', 'src/data/db/matchStatsDb.js', 'src/config/env.js', 'src/data/recette/journalDeLaRecette.js', 'src/jobs/liveWatch.js', 'src/utils/atomicJson.js']) assert.ok(!fichiers.includes(interdit), `${interdit} atteint par ${depart}`);
    assert.deepEqual(fichiers, liste.sort(), `${depart} : la fermeture est exactement celle-ci`);
  }
  // Le bloc est pur ; le lecteur ne fait que lire (aucune écriture, aucun processus).
  const bloc = fs.readFileSync(path.join(SERVEUR, 'src/data/roadmap/blocRecette.js'), 'utf8');
  assert.ok(!/from 'node:/.test(bloc), 'blocRecette.js importe un module de node');
  const lecteur = fs.readFileSync(path.join(SERVEUR, 'src/data/recette/etatDeLaRecette.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const nom of ['writeFile', 'appendFile', 'mkdir', 'rmSync', 'unlink', 'renameSync', 'child_process', 'readJsonFile', 'readRefreshStatus', 'openDb']) assert.ok(!lecteur.includes(nom), `etatDeLaRecette.js contient « ${nom} »`);
});

// --- P4b-1 (17/11/2026) : la carte, corrections de la relecture de la première écriture (RC-12, RC-17 à RC-25) -------

const RJ0 = RECETTE({ rodageDepuis: '2026-11-17', debut: '2026-11-20' });
const RRODAGE = RECETTE();
const resumeAvec = (jour, evenements, cv = {}) => ({ jour, phase: 'recette', passes: passes(8), couverture: { minutesObservees: 700, minutesDeVeille: 0, minutesArret: 0, minutesEnErreur: 720, minutesNonObservees: 20, ...cv }, evenements });
const evConnu = (i, cause = 'audit-buteurs-gardiens') => ({ id: `2026-11-22|etape-en-alerte|controle|10:${String(i).padStart(2, '0')}:00`, le: `2026-11-22T10:${String(i).padStart(2, '0')}:00Z`, type: 'etape-en-alerte', cle: 'controle', texte: 'audit', classe: 'connue', cause, rodage: false });

test('P4b-1 RC-12 et RC-17 : « Non observé (durée) » = non observé + en erreur, ambre au-delà de 25 min, détail en titre ; 1 cause et 30 événements → « 1 cause connue vue »', () => {
  const evs = Array.from({ length: 30 }, (_, i) => evConnu(i));
  const etat = { lisible: true, recette: RJ0, battement: { dernierTour: '2026-11-23T09:50:00Z' }, decisions: [], jours: [{ jour: '2026-11-21', etat: 'lu', resume: resumeAvec('2026-11-21', [], { minutesEnErreur: 0, minutesObservees: 1420 }) }, { jour: '2026-11-22', etat: 'lu', resume: resumeAvec('2026-11-22', evs) }, { jour: '2026-11-23', etat: 'absent', resume: null }] };
  const bloc = B.blocDeLaRecette({ etat, maintenant: Date.parse('2026-11-23T10:00:00Z'), recette: RJ0 });
  const c = U.carteDeLaRecette(bloc);
  assert.equal(c.colonnes[4], 'Non observé (durée)');
  assert.equal(c.colonnes[5], 'Événements connus');
  const l22 = c.lignes.find((x) => /22\/11/.test(x.jour));
  assert.equal(l22.cellules[3], '12 h 20', JSON.stringify(l22.cellules));
  assert.equal(l22.ambre[3], true);
  assert.match(l22.titres[3], /en erreur 12 h/);
  const l21 = c.lignes.find((x) => /21\/11/.test(x.jour));
  assert.deepEqual([l21.cellules[3], l21.ambre[3]], ['20 min', false]);
  assert.equal(c.somme.cellules[3], '12 h 40');
  const p = c.phrases.find((x) => /connue/.test(x));
  assert.match(p, /^1 cause connue vue, connue au départ : buteurs/i);
  assert.doesNotMatch(p, /30 pannes connues/);
  assert.match(l22.evenements[0].heure, /^\d{1,2} h \d{2}$/, 'RC-25 : « 11 h 00 »');
});

test('P4b-1 RC-18 : au rodage, aucune phrase compte (ni « Aucune panne connue ») ; une ligne dit que rien n’est compté ; Σ « du rodage (non compté) »', () => {
  const ev = { id: '2026-11-18|trou|1|02:00:00', le: '2026-11-18T02:00:00Z', type: 'trou', cle: '1', classe: 'connue', cause: 'veille-du-pc', rodage: true };
  const etat = { lisible: true, recette: RRODAGE, premierJour: '2026-11-17', battement: { dernierTour: '2026-11-18T09:50:00Z' }, decisions: [], jours: [{ jour: '2026-11-17', etat: 'lu', resume: { ...resumeAvec('2026-11-17', [ev]), phase: 'rodage' } }, { jour: '2026-11-18', etat: 'lu', resume: { ...resumeAvec('2026-11-18', [ev]), phase: 'rodage' } }] };
  const c = U.carteDeLaRecette(B.blocDeLaRecette({ etat, maintenant: Date.parse('2026-11-18T10:00:00Z'), recette: RRODAGE }));
  assert.deepEqual(c.phrases, []);
  assert.equal(c.rodage, 'Rodage : ce qui suit est noté pour régler la liste, rien n’est compté.');
  assert.match(c.somme.jour, /^Σ du rodage \(non compté/);
});

test('P4b-1 RC-19 : la liste des causes montrée à Pierre est en mots simples (aucun jargon), statut « en cours »', () => {
  const l = B.listeDesCauses();
  const jargon = /\.js|:\d|CR-\d|T-[A-Z]\d|commit|\bgit\b|Worker|lot 1b|[a-z][A-Z]/;
  const sansNomsPropres = (s) => String(s ?? '').replace(/CôteMaster|FotMob/g, '');
  const fautives = l.causes.filter((c) => jargon.test(sansNomsPropres(c.phrase)) || jargon.test(sansNomsPropres(c.borne))).map((c) => `${c.id} : ${c.phrase} / ${c.borne}`);
  assert.deepEqual(fautives, []);
  assert.ok(l.causes.every((c) => typeof c.phrase === 'string' && c.phrase.length > 10));
  const carte = U.carteDeLaRecette(B.blocDeLaRecette({ etat: { lisible: true, recette: RRODAGE, jours: [] }, maintenant: Date.parse('2026-11-18T10:00:00Z') }));
  assert.ok(carte.liste.causes.every((c) => c.statut !== 'active'));
  assert.ok(carte.liste.causes.some((c) => c.statut === 'en cours'));
  const audit = l.causes.find((c) => c.id === 'audit-buteurs-gardiens');
  assert.match(audit.borne, /nombre d’anomalies : borne fixée au début de l’essai/);
});

test('P4b-1 RC-20 : un fichier illisible parmi d’autres garde la tête, PH-23 et les phrases ; il est nommé ; une date de tour illisible ne fait jamais lever', () => {
  const jours = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map((jour) => (jour === '2026-11-23' ? { jour, etat: 'illisible', resume: null } : { jour, etat: 'lu', resume: resumeAvec(jour, []) }));
  const etat = { lisible: false, probleme: '2026-11-23.json : forme inattendue', illisibles: [{ nom: '2026-11-23.json', probleme: 'forme inattendue' }], recette: RJ0, battement: { dernierTour: '2026-11-26T09:10:00Z' }, decisions: [], jours };
  const bloc = B.blocDeLaRecette({ etat, maintenant: Date.parse('2026-11-26T10:00:00Z'), recette: RJ0 });
  assert.equal(bloc.indisponible, false);
  const c = U.carteDeLaRecette(bloc);
  assert.match(c.tete, /jour 6 sur 14/);
  assert.ok(c.vie, 'PH-23 reste');
  assert.ok(c.phrases.length >= 4, c.phrases.join(' | '));
  assert.match(c.probleme, /2026-11-23\.json \(forme inattendue\) ; rien n’est perdu/);
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'roadmap', 'RecetteCarte.vue'), 'utf8');
  assert.match(vue, /carte\.probleme/);
  // decisions.json illisible : PH-4, PH-5, PH-6 tombent, le reste demeure.
  const sansDecisions = U.carteDeLaRecette({ ...bloc, decisionsIllisibles: true });
  assert.ok(!sansDecisions.phrases.some((p) => /panne nouvelle|cause connue|à expliquer/.test(p)), sansDecisions.phrases.join(' | '));
  assert.ok(sansDecisions.phrases.some((p) => /^Sauvegardes/.test(p)));
  // T17 : un dernier tour mal écrit ne fait plus lever la carte.
  const b = B.blocDeLaRecette({ etat: { lisible: true, recette: RJ0, battement: { dernierTour: 'x' }, decisions: [], jours: [] }, maintenant: Date.parse('2026-11-23T10:00:00Z'), recette: RJ0 });
  let carte;
  assert.doesNotThrow(() => (carte = U.carteDeLaRecette(b)));
  assert.match(carte.vie ?? '', /date du dernier tour illisible/);
  assert.match(carte.provenance.texte, /date illisible/);
});

test('P4b-1 RC-21 : la carte dit où elle lit ses chiffres et l’heure du dernier tour (ambre au-delà de 25 min)', () => {
  const etat = { lisible: true, recette: RJ0, chemins: { journal: 'C:\\x\\server\\data\\runtime\\journal-recette', racine: 'C:\\Users\\PC\\CoteMaster\\recette' }, battement: { dernierTour: '2026-11-24T10:50:00Z' }, decisions: [], jours: [] };
  const c = U.carteDeLaRecette(B.blocDeLaRecette({ etat, maintenant: Date.parse('2026-11-24T11:00:00Z'), recette: RJ0 }));
  assert.match(c.provenance.texte, /^Lu dans : les fichiers du journal de l’essai sur ce PC \(.*journal-recette, et .*CoteMaster\\recette pour le battement\) ; dernier tour : aujourd’hui à 11 h 50\.$/);
  assert.equal(c.provenance.ambre, false);
  const vieux = U.carteDeLaRecette(B.blocDeLaRecette({ etat, maintenant: Date.parse('2026-11-24T12:00:00Z'), recette: RJ0 }));
  assert.equal(vieux.provenance.ambre, true);
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'roadmap', 'RecetteCarte.vue'), 'utf8');
  assert.match(vue, /carte\.provenance\.texte/);
  // Les vrais chemins sont lus par etatDeLaRecette (jamais écrits ailleurs).
  const d = dossierJournal();
  try {
    const e = d.lire(Date.parse('2026-11-24T12:00:00Z'));
    assert.deepEqual(e.chemins, { journal: d.chemins.dossierDuJournal, racine: d.chemins.racine });
  } finally {
    d.nettoyer();
  }
});

test('P4b-1 RC-22 : « rien à mesurer » n’a ni gain ni fourchette (jamais « +0,0 % »)', () => {
  const note = { mesure: { le: '2026-12-08T10:00:00Z', verdict: 'rien-a-mesurer', raison: 'rien', matchs: 10, fenetre: { de: '2026-11-21', a: '2026-12-04' }, gain: 0, fourchette: [0, 0], quoi: '' } };
  const j = B.jugementDeLaNote(note);
  assert.deepEqual([j.enPourcent.gain, j.enPourcent.fourchette], [null, null]);
  const l = P.lignesPreuve(B.mesureAvecLaNote(null, note));
  assert.doesNotMatch(String(l.gain?.valeur ?? ''), /0,0/);
  assert.equal(B.jugementDeLaNote({ mesure: { ...note.mesure, verdict: 'pas-prouve', gain: 0.4 } }).enPourcent.gain, 0.4, 'les autres verdicts gardent leur gain');
});

test('P4b-1 RC-23 et RC-25 : textes — PH-4b, jour 0, millions accordés, « date illisible », aucune tournure interdite', async () => {
  const j0 = U.carteDeLaRecette(B.blocDeLaRecette({ etat: { lisible: true, recette: RJ0, battement: { dernierTour: '2026-11-20T18:50:00Z' }, decisions: [], jours: [] }, maintenant: Date.parse('2026-11-20T19:00:00Z'), recette: RJ0 }));
  assert.equal(j0.tete, 'L’essai général commence demain (21/11) : 14 jours, jusqu’au 04/12. Le rodage est fini.');
  assert.equal(U.millions(1_960_000), '2,0 millions');
  assert.equal(U.millions(1_400_000), '1,4 million');
  assert.equal(U.millions(40_000), 'moins de 0,1 million');
  assert.equal(U.NON_OBSERVE, 'non observé : aucun fichier du journal ce jour-là (CôteMaster arrêté, PC éteint ou journal en panne)');
  const interdit = /panne\(s\)|J14 \+ 48 h|J0 non écrit|continuer en janvier|le plus ancien : à expliquer|Recette en cours/;
  const K = await import('../src/data/recette/classerLesEvenements.js');
  const ae = { id: '2026-11-25|constat-nouveau|x|10:00:00', le: '2026-11-25T10:00:00Z', type: 'constat-nouveau', cle: 'x', classe: 'a-expliquer' };
  const quatorze = (evs) => Array.from({ length: 14 }, (_, i) => { const jour = new Date(Date.parse('2026-11-21T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10); return { jour, evenements: jour === '2026-11-25' ? evs : [] }; });
  const phrasesDuDecompte = [K.decompte({ jours: [], decisions: [], recette: RRODAGE, aujourdhui: '2026-11-18' }), K.decompte({ jours: quatorze([]).slice(0, 2), decisions: [], recette: RJ0, aujourdhui: '2026-11-23' }), K.decompte({ jours: quatorze([ae]), decisions: [], recette: RJ0, aujourdhui: '2026-12-05' }), K.decompte({ jours: quatorze([ae]), decisions: [], recette: RJ0, aujourdhui: '2026-12-08' }), K.decompte({ jours: quatorze([]), decisions: [], recette: RJ0, aujourdhui: '2026-12-08' }), K.decompte({ jours: quatorze([]).slice(0, 10), decisions: [], recette: RJ0, aujourdhui: '2026-12-08' })].map((d) => d.phrase);
  assert.equal(new Set(phrasesDuDecompte).size, 6, phrasesDuDecompte.join(' | '));
  const textes = [j0.tete, ...j0.phrases, j0.decompte ?? '', ...phrasesDuDecompte];
  for (const x of textes) assert.doesNotMatch(x, interdit, x);
  assert.equal(U.titreEnPhrase('Le PC se met en veille'), 'le PC se met en veille');
  assert.equal(U.titreEnPhrase('FotMob en panne'), 'FotMob en panne');
});
