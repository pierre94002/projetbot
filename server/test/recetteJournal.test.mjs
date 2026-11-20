/**
 * Le journal de la recette (étape 47 du plan, lot 1).
 *   node --test test/recetteJournal.test.mjs        (depuis server/)
 *
 * Passe P1 (17/11/2026) : le journal Windows (data/recette/journalWindows.js) et le squelette du calendrier
 * (data/recette/calendrierDeLaRecette.js). Tout est PUR ou injecté : aucun vrai wevtutil n'est lancé, aucun fichier
 * n'est lu ni écrit, aucune base, aucun réseau.
 *
 * Passe P2 (17/11/2026) : le journal lui-même (data/recette/journalDeLaRecette.js) et son lancement par server.js. Tout
 * se passe dans un dossier temporaire (os.tmpdir) ; horloge, journal Windows, git et direct injectés ; aucun vrai git,
 * aucun wevtutil, aucune base, aucun serveur.
 *  T-J1 à T-J9, T-J11 à T-J17 (conception l. 776-799, corrigés par la critique), T-J9 étendu (P2-b), T-J16 étendu
 *  (CR-17), T-J18 (CR-14), la garde du second serveur (CR-55), la mise en service annoncée (CR-2), les formes de git
 *  (§ 7 règle 14 (b)), la liste fermée des imports directs du journal (P2-a, CR-16 point 4).
 *
 *  T-J10  le journal Windows : le parseur sur une sortie XML réelle (apostrophes, pas de racine unique, sept décimales,
 *         leurres des trois fournisseurs au même numéro) ; la requête BORNÉE (CR-15) ; une commande en échec, trop lente,
 *         trop bavarde, absente ou muette → « illisible », jamais d'exception ; un journal illisible n'explique JAMAIS
 *         un trou (« à expliquer », jamais « connue ») ; la veille qui couvre un trou à 12 min près l'explique ;
 *         une lecture du code (qe seulement, chemin absolu, pas de shell, attente sur « close »).
 *  T-J0   le squelette du calendrier : début et début de la fenêtre à null, aucune mesure possible tant qu'ils le sont,
 *         les phases (rodage, J1-J14, croisière) et les jours de Paris.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from '../src/data/recette/journalWindows.js';
import * as C from '../src/data/recette/calendrierDeLaRecette.js';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import * as J from '../src/data/recette/journalDeLaRecette.js';

// P4b-1 (RC-11) : lancé par `node` seul (sans node --test), aucun chemin par défaut ne doit mener chez Pierre. Les chemins
// par défaut sont refusés dès que CM_TEST_DOSSIER est posé ; il l'est ici, avant tout appel (lu à l'appel, jamais à l'import).
if (!process.env.NODE_TEST_CONTEXT && !process.env.CM_TEST_DOSSIER) process.env.CM_TEST_DOSSIER = '1';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_W = fs.readFileSync(path.join(ICI, '../src/data/recette/journalWindows.js'), 'utf8');

// Une sortie de « wevtutil qe System /f:xml /rd:true » : des <Event> à la suite, SANS racine, du plus récent au plus
// ancien, attributs entre apostrophes, sept décimales. Trois leurres au même numéro qu'un événement retenu.
const NS = "xmlns='http://schemas.microsoft.com/win/2004/08/events/event'";
const ev = (fournisseur, id, quand, data = '', qualif = '') =>
  `<Event ${NS}><System><Provider Name='${fournisseur}' Guid='{331c3b3a-2005-44c2-ac5e-77220c37d6b4}'/><EventID${qualif}>${id}</EventID><Version>0</Version><Level>4</Level><TimeCreated SystemTime='${quand}'/><EventRecordID>1</EventRecordID><Channel>System</Channel><Computer>PC</Computer><Security/></System>${data ? `<EventData>${data}</EventData>` : ''}</Event>`;
const XML = [
  ev('Microsoft-Windows-Kernel-General', 1, '2026-11-12T08:01:00.1234567Z', "<Data Name='OldTime'>x</Data>"),
  ev('Microsoft-Windows-Kernel-Power', 107, '2026-11-12T07:58:02.0000001Z'),
  ev('Microsoft-Windows-Power-Troubleshooter', 1, '2026-11-12T07:58:05.5059311Z', "<Data Name='SleepTime'>2026-11-12T00:41:08.1234567Z</Data><Data Name='WakeTime'>2026-11-12T07:58:01.9876543Z</Data>"),
  ev('FilterManager', 1, '2026-11-12T07:58:03.0000000Z'),
  ev('Microsoft-Windows-UserModePowerService', 12, '2026-11-12T03:00:00.0000000Z'),
  ev('Microsoft-Windows-Kernel-Power', 42, '2026-11-12T00:41:07.5059311Z', "<Data Name='TargetState'>4</Data><Data Name='Reason'>7</Data>"),
  ev('EventLog', 6008, '2026-11-10T09:00:00.0000000Z', '', " Qualifiers='32768'"),
  ev('EventLog', 6005, '2026-11-10T09:00:01.0000000Z', '', " Qualifiers='32768'"),
  ev('Microsoft-Windows-Kernel-Power', 41, '2026-11-10T09:00:02.0000000Z'),
  ev('Microsoft-Windows-Kernel-General', 12, '2026-11-10T08:59:58.0000000Z'),
  ev('EventLog', 6006, '2026-11-09T23:00:00.0000000Z', '', " Qualifiers='32768'"),
  ev('Microsoft-Windows-Kernel-General', 13, '2026-11-09T23:00:01.0000000Z')
].join('\r\n');

test('T-J10 parseur : les seuls événements retenus, du plus ancien au plus récent, leurres écartés', () => {
  const evs = W.parserEvenementsWindows(XML);
  assert.deepEqual(
    evs.map((e) => `${e.fournisseur.replace('Microsoft-Windows-', '')} ${e.numero} ${e.type}`),
    [
      'EventLog 6006 arret-propre',
      'Kernel-General 13 arret-du-systeme',
      'Kernel-General 12 demarrage-du-systeme',
      'EventLog 6008 arret-inattendu',
      'EventLog 6005 demarrage-du-journal',
      'Kernel-Power 41 arret-brutal',
      'Kernel-Power 42 mise-en-veille',
      'Kernel-Power 107 reprise',
      'Power-Troubleshooter 1 retour-de-veille'
    ]
  );
  const veille = evs.find((e) => e.numero === 42);
  assert.equal(veille.le, '2026-11-12T00:41:07.505Z');
  const retour = evs.find((e) => e.type === 'retour-de-veille');
  assert.equal(retour.sommeil, '2026-11-12T00:41:08.123Z');
  assert.equal(retour.reveil, '2026-11-12T07:58:01.987Z');
  // Les leurres (même numéro, autre fournisseur) ne sont jamais pris.
  assert.ok(!evs.some((e) => /FilterManager|UserModePowerService/.test(e.fournisseur)));
  assert.ok(!evs.some((e) => e.fournisseur === 'Microsoft-Windows-Kernel-General' && e.numero === 1));
});

test('T-J10 parseur : 42 = mise en veille, 107 = reprise (jamais l’inverse)', () => {
  assert.equal(W.EVENEMENTS_RETENUS['Microsoft-Windows-Kernel-Power'][42], 'mise-en-veille');
  assert.equal(W.EVENEMENTS_RETENUS['Microsoft-Windows-Kernel-Power'][107], 'reprise');
  const seul = W.parserEvenementsWindows(
    ev('Microsoft-Windows-Kernel-Power', 107, '2026-11-05T06:00:00.0000000Z') + ev('Microsoft-Windows-Kernel-Power', 42, '2026-11-05T01:00:00.0000000Z')
  );
  assert.deepEqual(seul.map((e) => [e.numero, e.type]), [[42, 'mise-en-veille'], [107, 'reprise']]);
  assert.deepEqual(W.veillesDuPC(seul), [[Date.parse('2026-11-05T01:00:00Z'), Date.parse('2026-11-05T06:00:00Z')]]);
});

test('T-J10 parseur : entrée vide, tronquée ou étrangère → liste vide, jamais d’exception', () => {
  for (const x of [undefined, null, '', 42, {}, 'pas du XML', '<Event><System><Provider Name=', ev('Microsoft-Windows-Kernel-Power', 42, 'pas-une-date')]) {
    assert.deepEqual(W.parserEvenementsWindows(x), []);
  }
  // Guillemets au lieu d'apostrophes : lu aussi.
  const g = ev('Microsoft-Windows-Kernel-Power', 42, '2026-11-06T01:00:00.0000000Z').replace(/'/g, '"');
  assert.equal(W.parserEvenementsWindows(g).length, 1);
});

test('T-J10 la requête est bornée par la date et par fournisseur (CR-15 point 1)', () => {
  const borne = W.borneDeLaRequete({ debutDuTrou: '2026-11-12T00:30:00Z', maintenant: Date.parse('2026-11-12T08:10:00Z') });
  assert.equal(borne, (7 * 60 + 40) * 60_000 + 3_600_000);
  assert.equal(W.borneDeLaRequete({ debutDuTrou: 'n’importe quoi', maintenant: 0 }), null);
  assert.equal(W.borneDeLaRequete({ debutDuTrou: 10, maintenant: 5 }), null);
  const q = W.requeteXPath(borne);
  assert.ok(q.startsWith(`*[System[TimeCreated[timediff(@SystemTime) <= ${borne}] and (`));
  assert.ok(q.includes("(Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=41 or EventID=42 or EventID=107))"));
  assert.ok(q.includes("(Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1)"));
  assert.ok(q.includes("(Provider[@Name='EventLog'] and (EventID=6005 or EventID=6006 or EventID=6008))"));
  assert.ok(q.includes("(Provider[@Name='Microsoft-Windows-Kernel-General'] and (EventID=12 or EventID=13))"));
  assert.throws(() => W.requeteXPath(0), RangeError);
  const a = W.argumentsDeWevtutil(borne);
  assert.deepEqual([a[0], a[1], a[3], a[4], a[5]], ['qe', 'System', '/f:xml', '/rd:true', '/c:400']);
  assert.equal(a[2], `/q:${q}`);
});

/** Un faux execFile : enregistre l'appel et répond (en différé, comme un vrai processus) ce qu'on lui dit. */
function fauxExecuter(reponse) {
  const appels = [];
  const executer = (fichier, args, options, rappel) => {
    appels.push({ fichier, args, options });
    if (reponse === 'jamais') return {};
    if (reponse instanceof Error && reponse.synchrone) throw reponse;
    setImmediate(() => (reponse instanceof Error ? rappel(reponse, '', '') : rappel(null, reponse, '')));
    return {};
  };
  return { executer, appels };
}
const erreur = (props) => Object.assign(new Error(props.message ?? 'échec'), props);

test('T-J10 lecture : la commande appelée (chemin absolu, qe, fenêtre cachée, 10 s, 4 Mo)', async () => {
  const f = fauxExecuter(XML);
  const r = await W.lireJournalWindows({ fenetreMs: 3_600_000, executer: f.executer, plateforme: 'win32', environnement: { SystemRoot: 'C:/Windows' } });
  assert.equal(r.lisible, true);
  assert.equal(r.evenements.length, 9);
  assert.equal(f.appels.length, 1);
  assert.equal(f.appels[0].fichier, ['C:', 'Windows', 'System32', 'wevtutil.exe'].join(path.win32.sep));
  assert.equal(f.appels[0].args[0], 'qe');
  assert.equal(f.appels[0].options.windowsHide, true);
  assert.equal(f.appels[0].options.timeout, 10_000);
  assert.equal(f.appels[0].options.maxBuffer, 4 * 1024 * 1024);
  assert.equal(f.appels[0].options.shell, undefined);
  // Sortie vide (aucun événement dans la fenêtre) : lisible, liste vide.
  const vide = await W.lireJournalWindows({ fenetreMs: 60_000, executer: fauxExecuter('').executer, plateforme: 'win32' });
  assert.deepEqual([vide.lisible, vide.evenements], [true, []]);
});

test('T-J10 lecture : échec, lenteur, sortie trop grosse, absence, sortie étrangère, pas Windows → « illisible », jamais d’exception', async () => {
  const cas = [
    [erreur({ code: 'ENOENT' }), /introuvable/],
    [erreur({ killed: true, signal: 'SIGTERM' }), /trop lente/],
    [erreur({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), /4 Mo/],
    [erreur({ code: 15007, message: 'canal introuvable' }), /en échec/],
    [Object.assign(erreur({ message: 'levée tout de suite' }), { synchrone: true }), /lecture impossible/],
    ['Accès refusé.', /sans événement XML/]
  ];
  for (const [reponse, motif] of cas) {
    const r = await W.lireJournalWindows({ fenetreMs: 60_000, executer: fauxExecuter(reponse).executer, plateforme: 'win32' });
    assert.equal(r.lisible, false);
    assert.match(r.probleme, motif);
  }
  const pasWindows = await W.lireJournalWindows({ fenetreMs: 60_000, executer: () => assert.fail('jamais lancé hors de Windows'), plateforme: 'linux' });
  assert.deepEqual([pasWindows.lisible, pasWindows.probleme], [false, 'pas Windows (linux)']);
  const mauvaiseFenetre = await W.lireJournalWindows({ fenetreMs: -1, executer: () => assert.fail('jamais lancé'), plateforme: 'win32' });
  assert.equal(mauvaiseFenetre.lisible, false);
});

test('T-J10 lecture : un rappel qui ne vient jamais → « illisible » après le délai (filet), sans exception', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const promesse = W.lireJournalWindows({ fenetreMs: 60_000, executer: fauxExecuter('jamais').executer, plateforme: 'win32' });
    mock.timers.tick(W.DELAI_MS + 5_000);
    const r = await promesse;
    assert.deepEqual([r.lisible, r.probleme], [false, 'aucune réponse de wevtutil']);
  } finally {
    mock.timers.reset();
  }
});

test('T-J10 un trou : illisible → « à expliquer » (jamais « connue ») ; veille qui couvre → « connue » ; sinon « à expliquer » avec les deux pistes', () => {
  const lecture = { lisible: true, evenements: W.parserEvenementsWindows(XML) };
  // Trou de 00:31 à 07:59 : 437 min de veille, 11 min hors veille → expliqué.
  const couvert = W.expliquerLeTrou({ de: '2026-11-12T00:31:00Z', a: '2026-11-12T07:59:00Z', lecture });
  assert.equal(couvert.classe, 'connue');
  assert.equal(couvert.cause, 'veille-du-pc');
  assert.equal(couvert.minutesDeVeille, 437);
  // Trou de 00:00 à 08:00 : 43 min hors veille → pas expliqué, avec les deux pistes de CR-15 point 6.
  const long = W.expliquerLeTrou({ de: '2026-11-12T00:00:00Z', a: '2026-11-12T08:00:00Z', lecture });
  assert.equal(long.classe, 'a-expliquer');
  assert.equal(long.cause, null);
  assert.deepEqual(long.pistes, ['fenêtre du serveur figée ?', 'fil du serveur bloqué par un calcul ?']);
  assert.match(long.raison, /trop courte/);
  // Trou sans aucune veille.
  const sans = W.expliquerLeTrou({ de: '2026-11-11T10:00:00Z', a: '2026-11-11T10:40:00Z', lecture });
  assert.deepEqual([sans.classe, sans.minutesDeVeille], ['a-expliquer', 0]);
  // Journal Windows illisible : JAMAIS « connue », et relu au tour suivant.
  for (const illisible of [{ lisible: false, probleme: 'commande trop lente (arrêtée après 10 s)' }, null, undefined, { lisible: true }]) {
    const r = W.expliquerLeTrou({ de: '2026-11-12T00:31:00Z', a: '2026-11-12T07:59:00Z', lecture: illisible });
    assert.equal(r.classe, 'a-expliquer');
    assert.equal(r.cause, null);
    assert.equal(r.relire, true);
    assert.match(r.raison, /^journal Windows illisible/);
  }
  // Seulement 42 puis 107 (sans Power-Troubleshooter) : la paire suffit.
  const paire = { lisible: true, evenements: W.parserEvenementsWindows(ev('Microsoft-Windows-Kernel-Power', 42, '2026-11-05T01:00:00.0000000Z') + ev('Microsoft-Windows-Kernel-Power', 107, '2026-11-05T06:00:00.0000000Z')) };
  assert.equal(W.expliquerLeTrou({ de: '2026-11-05T00:55:00Z', a: '2026-11-05T06:05:00Z', lecture: paire }).classe, 'connue');
  // Un trou mal daté.
  assert.equal(W.expliquerLeTrou({ de: 'x', a: 'y', lecture }).classe, 'a-expliquer');
  assert.equal(W.expliquerLeTrou().classe, 'a-expliquer');
});

test('T-J10 arrêts et démarrages du PC dans une fenêtre (propres, brutaux, démarrages)', () => {
  const evs = W.parserEvenementsWindows(XML);
  const r = W.arretsEtDemarrages(evs, { de: '2026-11-09T22:00:00Z', a: '2026-11-10T10:00:00Z' });
  assert.deepEqual(r.arretsPropres, ['2026-11-09T23:00:00.000Z', '2026-11-09T23:00:01.000Z']);
  assert.deepEqual(r.arretsBrutaux, ['2026-11-10T09:00:00.000Z', '2026-11-10T09:00:02.000Z']);
  assert.deepEqual(r.demarrages, ['2026-11-10T08:59:58.000Z', '2026-11-10T09:00:01.000Z']);
  assert.deepEqual(W.arretsEtDemarrages(null, { de: 0, a: 1 }), { demarrages: [], arretsPropres: [], arretsBrutaux: [] });
});

test('T-J10 lecture du code de journalWindows.js : « qe » seulement, chemin absolu, pas de shell, attente sur « close »', () => {
  const code = SOURCE_W.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Aucune autre sous-commande de wevtutil, ni powercfg (CR-15 point 2).
  for (const interdit of ['cl', 'sl', 'im', 'um', 'epl', 'gl', 'el', 'gli']) assert.ok(!new RegExp(`['"\`]${interdit}['"\`]`).test(code), `sous-commande « ${interdit} »`);
  assert.ok(!/powercfg/i.test(code));
  assert.ok(/\['qe', 'System'/.test(code));
  // execFile seulement : ni exec, ni spawn, ni fork, ni shell ; aucun écouteur « exit ».
  assert.deepEqual([...code.matchAll(/import\s[^;]*?from\s*'([^']+)'/g)].map((m) => m[1]).sort(), ['node:child_process', 'node:path']);
  assert.ok(/import \{ execFile \} from 'node:child_process'/.test(code));
  assert.ok(!/\b(execSync|execFileSync|spawn|spawnSync|fork)\b/.test(code));
  assert.ok(!/\bexec\s*\(/.test(code));
  assert.ok(!/shell\s*:/.test(code));
  assert.ok(!/['"]exit['"]/.test(code));
  // Le chemin absolu sous System32, jamais le seul nom cherché dans le PATH.
  assert.ok(/'System32', 'wevtutil\.exe'/.test(code));
  assert.ok(!/executer\(\s*'wevtutil/.test(code));
  // Aucune écriture, aucune base.
  assert.ok(!/writeFile|appendFile|writeJsonAtomic|openDb|readRefreshStatus/.test(code));
});

test('T-J0 squelette du calendrier : J0 et le début de la fenêtre à null jusqu’au lot 1b ; aucune mesure tant qu’ils le sont', () => {
  assert.equal(C.RECETTE.debut, null);
  assert.equal(C.RECETTE.debutDeLaFenetre, null);
  assert.equal(C.RECETTE.empreinteDesCauses, null);
  assert.equal(C.RECETTE.jours, 14);
  assert.deepEqual(C.RECETTE.relances, []);
  assert.ok(Object.isFrozen(C.RECETTE) && Object.isFrozen(C.RECETTE.relances));
  assert.deepEqual(C.problemesDuCalendrier(), []);
  assert.deepEqual(C.fenetreDeMesure(), { fixee: false, raison: 'début de la fenêtre non fixé' });
  assert.equal(C.jourZero(), null);
  assert.deepEqual(C.phaseDuJour('2026-11-20'), { phase: 'rodage', numero: null });
});

test('T-J0 phases : rodage jusqu’à J0, J1-J14, croisière ; une relance déplace J0, jamais le début de la fenêtre', () => {
  const r = { rodageDepuis: '2026-11-19', debut: '2026-11-27', jours: 14, relances: [], empreinteDesCauses: 'a'.repeat(40), debutDeLaFenetre: '2026-11-18' };
  assert.deepEqual(C.problemesDuCalendrier(r), []);
  assert.equal(C.phaseDuJour('2026-11-18', r).phase, 'avant');
  assert.equal(C.phaseDuJour('2026-11-27', r).phase, 'rodage');
  assert.deepEqual(C.phaseDuJour('2026-11-28', r), { phase: 'recette', numero: 1 });
  assert.deepEqual(C.phaseDuJour('2026-12-11', r), { phase: 'recette', numero: 14 });
  assert.equal(C.phaseDuJour('2026-12-12', r).phase, 'croisiere');
  assert.deepEqual(C.fenetreDeMesure(r), { fixee: true, debut: '2026-11-18', fin: '2026-12-11' });
  const relance = { ...r, relances: [{ le: '2026-12-03', apres: 'panne-x' }] };
  assert.equal(C.jourZero(relance), '2026-12-03');
  assert.deepEqual(C.phaseDuJour('2026-12-04', relance), { phase: 'recette', numero: 1 });
  assert.deepEqual(C.fenetreDeMesure(relance), { fixee: true, debut: '2026-11-18', fin: '2026-12-17' });
  // Ce qui est refusé.
  assert.ok(C.problemesDuCalendrier({ ...r, debut: '2026-02-30' }).length);
  assert.ok(C.problemesDuCalendrier({ ...r, relances: [{ le: '2026-11-20', apres: 'x' }] }).length);
  assert.ok(C.problemesDuCalendrier({ ...r, debutDeLaFenetre: '2026-11-28' }).length);
  assert.ok(C.problemesDuCalendrier({ ...r, debut: null }).length);
  assert.ok(C.problemesDuCalendrier({ ...r, empreinteDesCauses: 'abc' }).length);
  assert.deepEqual(C.fenetreDeMesure({ ...r, debutDeLaFenetre: null }), { fixee: false, raison: C.DEBUT_NON_FIXE });
});

test('T-J0 jours de Paris : 22:59:59Z et 23:00:00Z en décembre tombent sur deux jours ; 21:59:59Z et 22:00:00Z en juillet aussi', () => {
  assert.equal(C.jourDeParis('2026-12-10T22:59:59Z'), '2026-12-10');
  assert.equal(C.jourDeParis('2026-12-10T23:00:00Z'), '2026-12-11');
  assert.equal(C.jourDeParis('2027-07-10T21:59:59Z'), '2027-07-10');
  assert.equal(C.jourDeParis('2027-07-10T22:00:00Z'), '2027-07-11');
  assert.equal(C.jourDeParis('pas une date'), null);
  assert.equal(C.ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(C.joursEntre('2026-11-27', '2026-12-11'), 14);
});

// =====================================================================================================================
// Passe P2 (17/11/2026) : le journal lui-même (data/recette/journalDeLaRecette.js) et son lancement par server.js.
// Tout se passe dans un dossier TEMPORAIRE (os.tmpdir) : chemins, fichiers lus, battement ; horloge, journal Windows,
// git et état du direct sont injectés. Aucun vrai git, aucun wevtutil, aucune base, aucun serveur.
// =====================================================================================================================

const SOURCE_J = fs.readFileSync(path.join(ICI, '../src/data/recette/journalDeLaRecette.js'), 'utf8');
/** Le code sans ses commentaires (les commentaires nomment ce qui est interdit, pour l'expliquer). */
const CODE_J = SOURCE_J.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SOURCE_SERVEUR = fs.readFileSync(path.join(ICI, '../src/server.js'), 'utf8');
// P3 : les chemins par défaut vivent dans cheminsDeLaRecette.js (recette.mjs ne peut pas importer le journal).
const SOURCE_CH = fs.readFileSync(path.join(ICI, '../src/data/recette/cheminsDeLaRecette.js'), 'utf8');
const MIN = 60_000;
const RECETTE_RODAGE = Object.freeze({ rodageDepuis: null, debut: null, jours: 14, relances: [], empreinteDesCauses: null, debutDeLaFenetre: null });
const RECETTE_J0 = (debut) => Object.freeze({ ...RECETTE_RODAGE, debut });
const JW_MUET = async () => ({ lisible: true, evenements: [] });

/** Un banc d'essai : un dossier temporaire, des fichiers d'exécution factices, une horloge réglable. */
function banc({ debut = '2026-11-18T09:00:00Z', recette = RECETTE_RODAGE, battementAvant = null, marque = null, ...autres } = {}) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-'));
  const sources = { runtime: path.join(dossier, 'runtime'), sauvegardes: path.join(dossier, 'sauvegardes') };
  fs.mkdirSync(path.join(sources.runtime, 'journal-claude'), { recursive: true });
  fs.mkdirSync(sources.sauvegardes, { recursive: true });
  const chemins = J.cheminsDeLaRecette({ racineHorsOneDrive: path.join(dossier, 'recette'), dossierRuntime: path.join(dossier, 'journal') });
  const h = { t: Date.parse(debut) };
  const ecrire = (rel, v) => fs.writeFileSync(path.join(dossier, rel), typeof v === 'string' ? v : JSON.stringify(v));
  const creer = (options = {}) =>
    J.creerJournal({ chemins, sources, horloge: () => h.t, pid: 4242, demarreLe: h.t, recette, lireJW: JW_MUET, racineDuDepot: dossier, journal: { warn() {}, log() {} }, avantDemarrage: { battement: battementAvant, marque }, ...autres, ...options });
  const lireJour = (jour) => JSON.parse(fs.readFileSync(chemins.fichierDuJour(jour), 'utf8'));
  const battement = () => JSON.parse(fs.readFileSync(chemins.battement, 'utf8'));
  const avancer = (minutes) => {
    h.t += minutes * MIN;
  };
  const nettoyer = () => fs.rmSync(dossier, { recursive: true, force: true });
  return { dossier, sources, chemins, h, ecrire, creer, lireJour, battement, avancer, nettoyer };
}

const passe = (id, { fin = id, outcome = 'ok', steps = [], dureeMs = 60_000 } = {}) => ({ id, reason: 'périodique', startedAt: new Date(Date.parse(fin) - dureeMs).toISOString(), finishedAt: fin, durationMs: dureeMs, outcome, steps });
const refresh = (history = [], alerts = {}, running = null) => ({ version: 1, running, history, alerts });
const types = (r) => r.evenements.map((e) => e.type);

test('T-J1 une passe vue pour la première fois est notée une fois (par son id) ; relire le même fichier n’ajoute rien, même après un redémarrage', async () => {
  const b = banc();
  try {
    b.ecrire('runtime/refresh-status.json', refresh([passe('2026-11-18T08:50:00.000Z', { outcome: 'partial', steps: [{ key: 'audit', status: 'warn', summary: '21 anomalies' }, { key: 'feuilles', status: 'ok' }] })]));
    const j = b.creer();
    await j.tour();
    b.avancer(10);
    await j.tour();
    let r = b.lireJour('2026-11-18');
    assert.equal(r.passes.liste.length, 1);
    assert.equal(r.passes.total, 1);
    assert.equal(r.passes.partielles, 1);
    assert.deepEqual(r.passes.liste[0].etapes.map((e) => e.cle), ['audit']);
    assert.equal(types(r).filter((t) => t === 'etape-en-alerte').length, 1);
    // Redémarrage le même jour : le dernier état vu est relu, la passe n'est pas notée une seconde fois.
    b.avancer(3);
    const j2 = b.creer({ pid: 4343, demarreLe: b.h.t, avantDemarrage: { battement: b.battement(), marque: null } });
    await j2.tour();
    r = b.lireJour('2026-11-18');
    assert.equal(r.passes.liste.length, 1);
    assert.equal(types(r).filter((t) => t === 'etape-en-alerte').length, 1);
  } finally {
    b.nettoyer();
  }
});

test('T-J1 (CR-47) dernier état perdu : rebâti depuis le fichier du jour et celui de la veille, à minuit compris — ni doublon ni perte', async () => {
  const b = banc({ debut: '2026-11-18T22:50:00Z' }); // 23 h 50 à Paris
  try {
    const p1 = passe('2026-11-18T22:40:00.000Z', { outcome: 'error', steps: [{ key: 'feuilles', status: 'error', summary: 'x' }] });
    b.ecrire('runtime/refresh-status.json', refresh([p1]));
    const j = b.creer();
    await j.tour();
    // Arrêt, le dernier état vu est effacé ; redémarrage après minuit (Paris).
    fs.rmSync(b.chemins.dernierEtat);
    b.avancer(20);
    const p2 = passe('2026-11-18T23:05:00.000Z', { outcome: 'error', steps: [{ key: 'feuilles', status: 'error', summary: 'y' }] });
    b.ecrire('runtime/refresh-status.json', refresh([p2, p1]));
    const j2 = b.creer({ pid: 4343, demarreLe: b.h.t, avantDemarrage: { battement: b.battement(), marque: null } });
    await j2.tour();
    const hier = b.lireJour('2026-11-18');
    const aujourdhui = b.lireJour('2026-11-19');
    assert.deepEqual(hier.passes.liste.map((p) => p.id), [p1.id]);
    assert.deepEqual(aujourdhui.passes.liste.map((p) => p.id), [p2.id], 'p1 n’est pas notée une seconde fois, p2 n’est pas perdue');
  } finally {
    b.nettoyer();
  }
});

test('T-J2 une passe en cours n’est notée qu’à sa fin ; une passe de plus de 2 h qui recouvre un trou est « figée par la veille »', async () => {
  const b = banc();
  try {
    const t0 = b.h.t;
    b.ecrire('runtime/refresh-status.json', refresh([], {}, { pid: 1, reason: 'périodique', startedAt: new Date(t0).toISOString() }));
    const veille = async () => ({ lisible: true, evenements: [{ type: 'mise-en-veille', ms: t0 + 5 * MIN, le: '' }, { type: 'reprise', ms: t0 + 175 * MIN, le: '' }] });
    const j = b.creer({ lireJW: veille });
    await j.tour();
    assert.equal(j.etat.resume.passes.total, 0, 'une passe en cours n’est pas notée');
    b.avancer(180);
    await j.tour(); // trou de 180 min couvert par la veille
    assert.equal(j.etat.resume.evenements.find((e) => e.type === 'trou').classe, 'connue');
    b.avancer(10);
    const fin = new Date(b.h.t - MIN).toISOString();
    b.ecrire('runtime/refresh-status.json', refresh([passe(new Date(t0 + MIN).toISOString(), { fin, dureeMs: b.h.t - MIN - (t0 + MIN) })]));
    await j.tour();
    const r = b.lireJour('2026-11-18');
    assert.equal(r.passes.total, 1);
    assert.equal(r.passes.liste[0].figeeParLaVeille, true);
    assert.equal(r.passes.rattrapages.length, 1, 'la première passe finie après un trou est un rattrapage (CR-21 point 1)');
  } finally {
    b.nettoyer();
  }
});

test('T-J3 une alerte posée, levée, reposée : trois événements ; un problème ajouté change la signature, une date seule non (CR-18)', async () => {
  const b = banc();
  try {
    const j = b.creer();
    const tourAvec = async (alerts) => {
      b.ecrire('runtime/refresh-status.json', refresh([], alerts));
      b.avancer(10);
      await j.tour();
    };
    await tourAvec({ audit: null });
    await tourAvec({ audit: { anomalies: 21, parType: { buteurs: 18 }, updatedAt: 'a' } });
    await tourAvec({ audit: { anomalies: 21, parType: { buteurs: 18 }, updatedAt: 'b' } }); // date seule : rien
    await tourAvec({ audit: null });
    await tourAvec({ audit: { anomalies: 22, parType: { buteurs: 19 }, updatedAt: 'c' } });
    await tourAvec({ audit: { anomalies: 22, parType: { buteurs: 19, gardiens: 3 }, updatedAt: 'd' } }); // un type ajouté
    const r = b.lireJour('2026-11-18');
    assert.deepEqual(types(r).filter((t) => t.startsWith('alerte')), ['alerte-posee', 'alerte-levee', 'alerte-posee', 'alerte-changee']);
    const posee = r.evenements.find((e) => e.type === 'alerte-posee');
    assert.equal(posee.details.nombres.anomalies, 21);
  } finally {
    b.nettoyer();
  }
});

test('T-J4 contrôle du jour : un contrôle qui change de couleur → événement ; un constat trouvé après J0 → nouveau ; avant J0 → présent au départ', async () => {
  const b = banc({ debut: '2026-11-25T09:00:00Z', recette: RECETTE_J0('2026-11-20') });
  try {
    const controle = (couleur, constats) => ({ le: 'x', controles: [{ cle: 'classement-officiel', classe: 'rouge', statutLe: couleur, constats }, { cle: 'info-seule', classe: 'info', statutLe: 'rouge', constats: [{ id: 'i1', classe: 'info', trouveLe: '2026-11-24T10:00:00Z' }] }] });
    b.ecrire('runtime/controle-quotidien.json', controle('vert', [{ id: 'k-avant', classe: 'rouge', trouveLe: '2026-11-19T10:00:00Z' }, { id: 'k-jour0', classe: 'rouge', trouveLe: '2026-11-20T21:00:00Z' }]));
    const j = b.creer();
    await j.tour();
    b.avancer(10);
    b.ecrire('runtime/controle-quotidien.json', controle('rouge', [{ id: 'k-avant', classe: 'rouge', trouveLe: '2026-11-19T10:00:00Z' }, { id: 'k-jour0', classe: 'rouge', trouveLe: '2026-11-20T21:00:00Z' }, { id: 'k-apres', classe: 'orange', trouveLe: '2026-11-21T00:30:00Z' }]));
    await j.tour();
    const r = b.lireJour('2026-11-25');
    const couleurs = r.evenements.filter((e) => e.type === 'controle-couleur');
    assert.equal(couleurs.length, 1);
    assert.deepEqual([couleurs[0].details.de, couleurs[0].details.vers], ['vert', 'rouge']);
    assert.deepEqual(r.evenements.filter((e) => e.type === 'constat-nouveau').map((e) => e.cle), ['k-apres']);
    assert.equal(r.controleDuJour.presentsAuDepart, 2, 'k-avant et k-jour0 (trouvé le jour de J0, heure de Paris) sont présents au départ');
    assert.deepEqual(r.controleDuJour.rouges, ['classement-officiel']);
    assert.ok(!r.evenements.some((e) => e.cle === 'info-seule' || e.cle === 'i1'), 'la classe « info » est ignorée (CR-18 point 4)');
  } finally {
    b.nettoyer();
  }
});

test('T-J4 pendant le rodage (J0 pas écrit) : la référence des constats est le premier jour du journal', async () => {
  const b = banc({ debut: '2026-11-18T09:00:00Z' });
  try {
    const controle = (constats) => ({ le: 'x', controles: [{ cle: 'doublons', classe: 'orange', statutLe: 'vert', constats }] });
    b.ecrire('runtime/controle-quotidien.json', controle([{ id: 'k-veille', classe: 'orange', trouveLe: '2026-11-17T10:00:00Z' }]));
    const j = b.creer();
    await j.tour();
    b.h.t = Date.parse('2026-11-19T09:00:00Z');
    b.ecrire('runtime/controle-quotidien.json', controle([{ id: 'k-veille', classe: 'orange', trouveLe: '2026-11-17T10:00:00Z' }, { id: 'k-neuf', classe: 'orange', trouveLe: '2026-11-19T08:00:00Z' }]));
    await j.tour();
    const e = j.etat.resume.evenements.filter((x) => x.type === 'constat-nouveau');
    assert.deepEqual(e.map((x) => x.cle), ['k-neuf']);
    assert.equal(e[0].rodage, true);
  } finally {
    b.nettoyer();
  }
});

test('T-J5 FotMob : bon → à surveiller → en panne → bon, quatre transitions avec leurs heures', async () => {
  const b = banc();
  try {
    const j = b.creer();
    const sante = (erreursDeSuite) => ({ erreursDeSuite, derniereReussite: '2026-11-18T08:00:00Z', parType: {} });
    for (const n of [0, 2, 5, 0]) {
      b.ecrire('runtime/sante-fotmob.json', sante(n));
      b.avancer(10);
      await j.tour();
    }
    const r = b.lireJour('2026-11-18');
    assert.deepEqual(r.fotmob.transitions.map((x) => [x.de, x.vers]), [[null, 'ok'], ['ok', 'a-surveiller'], ['a-surveiller', 'en-panne'], ['en-panne', 'ok']]);
    assert.equal(new Set(r.fotmob.transitions.map((x) => x.le)).size, 4);
    assert.equal(r.evenements.filter((e) => e.type === 'fotmob' && e.classe !== 'info').length, 2);
  } finally {
    b.nettoyer();
  }
});

test('T-J6 sauvegarde nouvelle → événement ; aucune depuis 36 h de temps ÉVEILLÉ → un seul événement (CR-21)', async () => {
  const b = banc();
  try {
    b.ecrire('sauvegardes/etat-sauvegarde.json', { derniere: { fin: '2026-11-18T01:00:00Z', rencontres: 60000, derniereDate: '2026-11-17', octets: 1 } });
    const j = b.creer();
    await j.tour();
    assert.equal(j.etat.resume.sauvegarde.rencontres, 60000);
    assert.equal(j.etat.resume.evenements.filter((e) => e.type === 'sauvegarde').length, 1);
    const tous = () => [...j.etat.resume.evenements, ...fs.readdirSync(b.chemins.dossierDuJournal).flatMap((f) => (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) ? b.lireJour(f.slice(0, 10)).evenements : []))];
    // 35 h éveillées : rien ; au-delà de 36 h : un seul événement « sans-sauvegarde ».
    for (let i = 0; i < 6 * 35; i++) {
      b.avancer(10);
      await j.tour();
    }
    assert.ok(!tous().some((e) => e.type === 'sans-sauvegarde'));
    for (let i = 0; i < 6 * 2; i++) {
      b.avancer(10);
      await j.tour();
    }
    assert.equal(new Set(tous().filter((e) => e.type === 'sans-sauvegarde').map((e) => e.id)).size, 1);
  } finally {
    b.nettoyer();
  }
});

test('T-J7 restauration nouvelle → événement avec saine, contrôle, rencontres/attendues, dernière date/attendue ; pas saine → événement', async () => {
  const b = banc();
  try {
    const rapport = (fin, saine) => ({ derniere: { fin, saine, controle: 'quick_check', rencontres: 100, attendues: saine ? 100 : 120, derniereDate: '2026-11-17', derniereDateAttendue: '2026-11-17', durees: { totalMs: 900 }, problemes: saine ? [] : ['100 rencontres au lieu des 120'] } });
    b.ecrire('sauvegardes/etat-restauration.json', rapport('2026-11-18T02:00:00Z', true));
    const j = b.creer();
    await j.tour();
    assert.deepEqual(j.etat.resume.restauration, { le: '2026-11-18T02:00:00Z', saine: true, controle: 'quick_check', rencontres: 100, attendues: 100, derniereDate: '2026-11-17', derniereDateAttendue: '2026-11-17', dureeMs: 900 });
    b.ecrire('sauvegardes/etat-restauration.json', rapport('2026-11-18T09:05:00Z', false));
    b.avancer(10);
    await j.tour();
    const r = b.lireJour('2026-11-18');
    assert.deepEqual(types(r).filter((t) => t.startsWith('restauration')), ['restauration', 'restauration-pas-saine']);
    assert.equal(r.restauration.attendues, 120);
  } finally {
    b.nettoyer();
  }
});

test('T-J8 IA : les totaux du jour recopiés ; fichier absent → ia: null, jamais 0 ; 5 échecs de suite → un événement', async () => {
  const b = banc();
  try {
    const j = b.creer();
    await j.tour();
    assert.equal(j.etat.resume.ia, null);
    const appels = [...Array(6)].map((_, i) => ({ at: `2026-11-18T08:0${i}:00Z`, statut: i === 0 ? 'ok' : 'erreur' }));
    b.ecrire('runtime/journal-claude/2026-11-18.json', { totaux: { appels: 6, ok: 1, echecs: 5, tokens: { total: 1234 } }, appels });
    b.avancer(10);
    await j.tour();
    assert.deepEqual(j.etat.resume.ia, { appels: 6, ok: 1, echecs: 5, tokens: 1234 });
    // CR-26 point 4 (P3) : la part de 5 % ne vaut qu'à partir de 20 appels ; 5 échecs de suite sonnent toujours.
    assert.deepEqual(types(b.lireJour('2026-11-18')).filter((t) => t.startsWith('ia-')), ['ia-echecs-de-suite']);
    const vingt = [...Array(20)].map((_, i) => ({ at: `2026-11-18T09:${String(i).padStart(2, '0')}:00Z`, statut: i % 10 === 0 ? 'erreur' : 'ok', erreur: i % 10 === 0 ? 'You’ve hit your session limit · resets 3:50am' : undefined }));
    b.ecrire('runtime/journal-claude/2026-11-18.json', { totaux: { appels: 26, ok: 19, echecs: 7, tokens: { total: 2000 } }, appels: [...appels, ...vingt] });
    b.avancer(10);
    await j.tour();
    const r = b.lireJour('2026-11-18');
    assert.deepEqual(types(r).filter((t) => t.startsWith('ia-')), ['ia-echecs-de-suite', 'ia-part-echecs']);
    assert.ok(r.evenements.find((e) => e.type === 'ia-part-echecs').details.messagesDEchec.some((m) => /hit your session limit/.test(m)), 'les messages d’échec sont gardés (CR-26 point 3)');
  } finally {
    b.nettoyer();
  }
});

test('T-J9 battement : même pid et 26 min sans tour → trou ; nouveau pid → démarrage ; 3 min entre deux processus → redémarrage rapide', async () => {
  const b = banc();
  try {
    const j = b.creer();
    await j.tour();
    b.avancer(26);
    await j.tour();
    let r = b.lireJour('2026-11-18');
    assert.equal(r.serveur.trous.length, 1);
    assert.equal(r.evenements.find((e) => e.type === 'trou').classe, 'a-expliquer', 'aucune veille au journal Windows');
    const avant = b.battement();
    assert.equal(avant.pid, 4242);
    b.avancer(3);
    const j2 = b.creer({ pid: 5555, demarreLe: b.h.t, avantDemarrage: { battement: avant, marque: null } });
    await j2.tour();
    r = b.lireJour('2026-11-18');
    const d = r.evenements.filter((e) => e.signal === 'S11').at(-1);
    assert.equal(d.type, 'redemarrage-rapide');
    assert.equal(d.classe, 'a-expliquer');
    assert.equal(d.details.pidAvant, 4242);
    b.avancer(60);
    const j3 = b.creer({ pid: 6666, demarreLe: b.h.t, avantDemarrage: { battement: b.battement(), marque: null } });
    await j3.tour();
    assert.equal(b.lireJour('2026-11-18').evenements.filter((e) => e.signal === 'S11').at(-1).type, 'arret-du-serveur');
  } finally {
    b.nettoyer();
  }
});

test('T-J9 étendu (P2-b) : premier démarrage du journal « connu » et rodage SEULEMENT tant que J0 n’est pas écrit ; après J0, battement effacé → « à expliquer »', async () => {
  for (const [recette, classe, rodage] of [[RECETTE_RODAGE, 'connue', true], [RECETTE_J0('2026-11-10'), 'a-expliquer', false]]) {
    const b = banc({ recette });
    try {
      const j = b.creer();
      await j.tour();
      const e = b.lireJour('2026-11-18').evenements.find((x) => x.type === 'premier-demarrage-du-journal');
      assert.ok(e, 'un événement « premier démarrage du journal »');
      assert.equal(e.classe, classe);
      assert.equal(e.rodage, rodage);
    } finally {
      b.nettoyer();
    }
  }
  assert.equal(J.classerLeDemarrage({ premier: true, debutDeLaRecette: '2026-11-20' }).classe, 'a-expliquer');
});

test('CR-3 la couverture de chaque jour : minutes observées, de veille, d’arrêt, en erreur ; à la fin du jour, le reste est « non observé »', async () => {
  const b = banc({ debut: '2026-11-18T20:00:00Z' }); // 21 h à Paris
  try {
    const t0 = b.h.t;
    const veille = async () => ({ lisible: true, evenements: [{ type: 'mise-en-veille', ms: t0 + 32 * MIN, le: '' }, { type: 'reprise', ms: t0 + 88 * MIN, le: '' }] });
    const j = b.creer({ lireJW: veille });
    await j.tour(); // 0 min (premier tour au démarrage de l'essai)
    for (let i = 0; i < 3; i++) {
      b.avancer(10);
      await j.tour(); // 30 min observées
    }
    b.avancer(60);
    await j.tour(); // un trou de 60 min, dont 56 de veille
    b.ecrire('runtime/refresh-status.json', '{ illisible');
    b.avancer(10);
    await j.tour(); // 10 min « en erreur »
    let cv = j.etat.resume.couverture;
    assert.equal(cv.minutesObservees, 30);
    assert.equal(cv.minutesDeVeille, 56);
    assert.equal(cv.minutesEnErreur, 10);
    assert.equal(cv.toursReussis, cv.tours - 1);
    // Arrêt de 20 min puis un nouveau processus : minutes d'arrêt.
    b.ecrire('runtime/refresh-status.json', refresh([]));
    b.avancer(20);
    const j2 = b.creer({ pid: 9, demarreLe: b.h.t, lireJW: JW_MUET, avantDemarrage: { battement: b.battement(), marque: null } });
    await j2.tour();
    assert.equal(j2.etat.resume.couverture.minutesArret, 20);
    assert.equal(j2.etat.resume.couverture.minutesObservees, 30, 'la couverture du jour est reprise du battement');
    // Le jour suivant (Paris) : le jour fini est écrit avec ses minutes « non observées ».
    b.h.t = Date.parse('2026-11-18T23:05:00Z');
    await j2.tour();
    cv = b.lireJour('2026-11-18').couverture;
    assert.equal(cv.minutesNonObservees, 1440 - cv.minutesObservees - cv.minutesDeVeille - cv.minutesArret - cv.minutesEnErreur);
  } finally {
    b.nettoyer();
  }
});

test('CR-3 l’écriture « de minuit » qui rate est refaite au tour suivant (le jour fini n’est pas perdu)', async () => {
  const b = banc({ debut: '2026-11-18T22:50:00Z' });
  try {
    let echecs = 1;
    const ecrireJson = (fichier, v) => {
      if (fichier.endsWith('2026-11-18.json') && v.couverture?.minutesNonObservees !== undefined && echecs-- > 0) throw new Error('EBUSY');
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      fs.writeFileSync(fichier, JSON.stringify(v));
    };
    const j = b.creer({ ecrireJson });
    await j.tour();
    b.avancer(20); // minuit à Paris passé
    await j.tour();
    assert.equal(b.lireJour('2026-11-18').couverture.minutesNonObservees, undefined, 'l’écriture de minuit a raté');
    b.avancer(10);
    await j.tour();
    assert.ok(Number.isFinite(b.lireJour('2026-11-18').couverture.minutesNonObservees));
  } finally {
    b.nettoyer();
  }
});

test('S6 (CR-21) : aucune passe depuis 7 h de temps ÉVEILLÉ → un seul événement ; la veille ne compte pas', async () => {
  const b = banc();
  try {
    const t0 = b.h.t;
    const veille = async () => ({ lisible: true, evenements: [{ type: 'mise-en-veille', ms: t0 + 61 * MIN, le: '' }, { type: 'reprise', ms: t0 + 659 * MIN, le: '' }] });
    const j = b.creer({ lireJW: veille });
    await j.tour();
    for (let i = 0; i < 6; i++) {
      b.avancer(10);
      await j.tour(); // 1 h éveillée
    }
    b.avancer(600);
    await j.tour(); // 10 h de veille : pas du temps éveillé
    assert.ok(!j.etat.resume.evenements.some((e) => e.type === 'sans-passe'));
    for (let i = 0; i < 6 * 6 + 1; i++) {
      b.avancer(10);
      await j.tour(); // 6 h 10 éveillées de plus : 7 h 10 en tout
    }
    assert.equal(j.etat.resume.evenements.filter((e) => e.type === 'sans-passe').length, 1);
  } finally {
    b.nettoyer();
  }
});

test('S8 le direct suspendu (état en mémoire, injecté) : suspendu → repris, deux événements, une suspension et ses minutes', async () => {
  const b = banc();
  try {
    const etats = [{ suspendu: false }, { suspendu: true, suspenduJusqua: '2026-11-18T10:00:00Z', erreur: '5 erreurs FotMob' }, { suspendu: true }, { suspendu: false }];
    let i = 0;
    const j = b.creer({ lireDirect: async () => etats[i++] });
    for (let k = 0; k < etats.length; k++) {
      await j.tour();
      b.avancer(10);
    }
    const r = j.etat.resume;
    assert.deepEqual(types(r).filter((t) => t.startsWith('direct')), ['direct-suspendu', 'direct-repris']);
    assert.equal(r.direct.suspensions, 1);
    assert.equal(r.direct.minutesSuspendu, 10);
    const lanceur = await J.creerJournal({ chemins: b.chemins, sources: b.sources, horloge: () => b.h.t, lireJW: JW_MUET, racineDuDepot: b.dossier, lireDirect: async () => { throw new Error('liveWatch absent'); } }).tour();
    assert.deepEqual(lanceur, { reussi: false }, 'un lecteur du direct qui lève : tour « pas réussi », sans exception');
  } finally {
    b.nettoyer();
  }
});

test('CR-15 point 4 : un trou dont le journal Windows est illisible est « à expliquer », puis relu aux tours suivants (trou-relu)', async () => {
  const b = banc();
  try {
    const t0 = b.h.t;
    let lisible = false;
    const lireJW = async () => (lisible ? { lisible: true, evenements: [{ type: 'mise-en-veille', ms: t0 + 1 * MIN, le: '' }, { type: 'reprise', ms: t0 + 59 * MIN, le: '' }] } : { lisible: false, probleme: 'trop lente' });
    const j = b.creer({ lireJW });
    await j.tour();
    b.avancer(60);
    await j.tour();
    const trou = j.etat.resume.evenements.find((e) => e.type === 'trou');
    assert.equal(trou.classe, 'a-expliquer');
    assert.equal(j.etat.trousARelire.length, 1);
    lisible = true;
    b.avancer(10);
    await j.tour();
    const relu = j.etat.resume.evenements.find((e) => e.type === 'trou-relu');
    assert.equal(relu.classe, 'connue');
    assert.equal(relu.details.trou, trou.id);
    assert.equal(j.etat.trousARelire.length, 0);
  } finally {
    b.nettoyer();
  }
});

test('T-J11 commit : HEAD → référence → fichier ou packed-refs ; HEAD détaché ; pas de .git → null', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-git-'));
  try {
    const a = 'a'.repeat(40);
    const c = 'c'.repeat(40);
    assert.equal(await J.lireLeCommit(d), null);
    fs.mkdirSync(path.join(d, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'ref: refs/heads/master\n');
    fs.writeFileSync(path.join(d, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${c} refs/heads/master\n`);
    assert.equal(await J.lireLeCommit(d), c, 'packed-refs quand le fichier de la référence manque');
    fs.writeFileSync(path.join(d, '.git', 'refs', 'heads', 'master'), `${a}\n`);
    assert.equal(await J.lireLeCommit(d), a, 'le fichier de la référence d’abord');
    fs.writeFileSync(path.join(d, '.git', 'HEAD'), `${c}\n`);
    assert.equal(await J.lireLeCommit(d), c, 'HEAD détaché');
    fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'ref: ../../etc\n');
    assert.equal(await J.lireLeCommit(d), null);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('T-J12 jour de Paris : 22:59:59Z et 23:00:00Z en décembre tombent dans deux fichiers différents', async () => {
  const b = banc({ debut: '2026-12-14T22:59:59Z' });
  try {
    b.ecrire('runtime/sante-fotmob.json', { erreursDeSuite: 0, derniereReussite: 'x', parType: {} });
    const j = b.creer();
    await j.tour();
    b.h.t = Date.parse('2026-12-14T23:00:00Z');
    b.ecrire('runtime/sante-fotmob.json', { erreursDeSuite: 2, derniereReussite: 'x', parType: {} });
    await j.tour();
    assert.ok(fs.existsSync(b.chemins.fichierDuJour('2026-12-14')));
    assert.ok(fs.existsSync(b.chemins.fichierDuJour('2026-12-15')));
    assert.deepEqual(b.lireJour('2026-12-15').fotmob.transitions.map((x) => x.vers), ['a-surveiller']);
    assert.equal(J.idDEvenement({ type: 't', cle: 'k', le: '2026-12-14T23:00:00Z' }), '2026-12-15|t|k|23:00:00');
  } finally {
    b.nettoyer();
  }
});

test('T-J13 verrou de OneDrive : lecture tenue (EBUSY) relue au tour suivant, jamais gardée en cache ; écriture EBUSY puis réussie', async () => {
  // Le lecteur : même date, même taille, la lecture échoue une fois (fichier tenu) puis réussit.
  let lectures = 0;
  const fsp = { stat: async () => ({ mtimeMs: 1, size: 10 }), readFile: async () => (++lectures === 1 ? Promise.reject(Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })) : '{"a":1}') };
  const lire = J.creerLecteur({ fsp });
  assert.equal((await lire('f')).etat, 'illisible');
  const r = await lire('f');
  assert.equal(r.etat, 'lu');
  assert.deepEqual(r.valeur, { a: 1 });
  assert.equal((await lire('f')).etat, 'inchange', 'une lecture réussie, elle, est gardée tant que le fichier ne change pas');
  // L'écriture du jour : EBUSY au premier tour (notée), refaite au tour suivant.
  const b = banc();
  try {
    let echecs = 1;
    const ecrireJson = (fichier, v) => {
      if (fichier.endsWith('2026-11-18.json') && echecs-- > 0) throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      fs.writeFileSync(fichier, JSON.stringify(v));
    };
    const j = b.creer({ ecrireJson });
    await j.tour();
    assert.equal(fs.existsSync(b.chemins.fichierDuJour('2026-11-18')), false);
    assert.match(b.battement().derniereErreur.message, /EBUSY/);
    b.avancer(10);
    await j.tour();
    assert.ok(b.lireJour('2026-11-18').evenements.some((e) => e.type === 'premier-demarrage-du-journal'));
  } finally {
    b.nettoyer();
  }
});

test('T-J14 les chemins : une fonction pure ; défauts refusés sous essai et sous le dossier temporaire ; dans le bac, sous <bac>\\recette', () => {
  const c = J.cheminsDeLaRecette({ racineHorsOneDrive: 'C:/x/recette', dossierRuntime: 'C:/y/journal' });
  assert.equal(c.battement, path.resolve('C:/x/recette/battement.json'));
  assert.equal(c.dernierArret, path.resolve('C:/x/recette/dernier-arret.json'));
  assert.equal(c.miseEnService, path.resolve('C:/x/recette/mise-en-service.json'));
  assert.equal(c.dernierEtat, path.resolve('C:/x/recette/dernier-etat.json'));
  assert.equal(c.decisions, path.resolve('C:/y/journal/decisions.json'));
  assert.equal(c.fichierDuJour('2026-11-18'), path.resolve('C:/y/journal/2026-11-18.json'));
  const accueil = 'C:/Users/essai';
  const ici = 'C:/depot/server/src/data/recette';
  const tmpdir = 'C:/Temp';
  assert.equal(J.cheminsParDefaut({ environnement: { NODE_TEST_CONTEXT: 'child' }, ici, tmpdir, bac: null, accueil }).ok, false);
  assert.equal(J.cheminsParDefaut({ environnement: { CM_TEST_DOSSIER: 'x' }, ici, tmpdir, bac: null, accueil }).ok, false);
  assert.equal(J.cheminsParDefaut({ environnement: {}, ici: 'C:/Temp/copie/server/src/data/recette', tmpdir, bac: null, accueil }).ok, false);
  const bac = J.cheminsParDefaut({ environnement: {}, ici: 'C:/Users/essai/CoteMaster/bac-a-sable/code/server/src/data/recette', tmpdir, bac: 'C:/Users/essai/CoteMaster/bac-a-sable', accueil });
  assert.equal(bac.ok, true);
  assert.equal(bac.chemins.racine, path.resolve('C:/Users/essai/CoteMaster/bac-a-sable/recette'));
  assert.equal(bac.chemins.dossierDuJournal, path.resolve('C:/Users/essai/CoteMaster/bac-a-sable/recette/journal'));
  assert.equal(bac.sources.sauvegardes, path.resolve('C:/Users/essai/CoteMaster/bac-a-sable/sauvegardes'));
  const appli = J.cheminsParDefaut({ environnement: {}, ici, tmpdir, bac: null, accueil });
  assert.equal(appli.chemins.racine, path.resolve('C:/Users/essai/CoteMaster/recette'));
  assert.equal(appli.chemins.dossierDuJournal, path.resolve('C:/depot/server/data/runtime/journal-recette'));
  assert.equal(appli.sources.runtime, path.resolve('C:/depot/server/data/runtime'));
  assert.equal(appli.sources.sauvegardes, path.resolve('C:/Users/essai/CoteMaster/sauvegardes'));
  // Sous ce node --test, les défauts sont refusés pour de vrai.
  assert.equal(J.cheminsParDefaut().ok, false);
});

test('T-J14 lecture du code : les chemins par défaut ne sont construits QUE dans cheminsParDefaut (journal, autres modules du lot, recette.mjs)', () => {
  const corps = /export function cheminsParDefaut\([\s\S]*?\n}\n/.exec(SOURCE_CH)?.[0];
  assert.ok(corps, 'cheminsParDefaut trouvée');
  const motifs = [/'journal-recette'/g, /'CoteMaster',\s*'recette'/g, /homedir\(\)/g];
  for (const m of motifs) {
    assert.ok((corps.match(m) ?? []).length > 0, `${m} dans cheminsParDefaut`);
    assert.equal((SOURCE_CH.match(m) ?? []).length, (corps.match(m) ?? []).length, `${m} hors de cheminsParDefaut`);
    assert.equal((SOURCE_J.match(m) ?? []).length, 0, `${m} dans le journal (P3 : seulement cheminsDeLaRecette.js)`);
  }
  const dossier = path.join(ICI, '../src/data/recette');
  const autres = fs.readdirSync(dossier).filter((f) => f.endsWith('.js') && f !== 'cheminsDeLaRecette.js').map((f) => path.join(dossier, f));
  const recetteMjs = path.join(ICI, '../scripts/recette.mjs');
  if (fs.existsSync(recetteMjs)) autres.push(recetteMjs);
  for (const f of autres) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of motifs.slice(0, 2)) assert.equal((t.match(m) ?? []).length, 0, `${path.basename(f)} construit un chemin par défaut (${m})`);
  }
});

test('T-J15 phases : rodage marqué ; J1-J14 non marqué ; après J14 un résumé seul, sans événement', async () => {
  const cas = [['2026-11-18T09:00:00Z', RECETTE_RODAGE, true], ['2026-11-25T09:00:00Z', RECETTE_J0('2026-11-20'), false], ['2026-12-10T09:00:00Z', RECETTE_J0('2026-11-20'), null]];
  for (const [debut, recette, rodage] of cas) {
    const b = banc({ debut, recette });
    try {
      b.ecrire('runtime/refresh-status.json', refresh([passe(new Date(Date.parse(debut) - 5 * MIN).toISOString(), { outcome: 'error', steps: [{ key: 'feuilles', status: 'error', summary: 'x' }] })]));
      const j = b.creer();
      await j.tour();
      b.avancer(10);
      await j.tour();
      const r = j.etat.resume;
      assert.equal(r.jour, debut.slice(0, 10));
      assert.equal(r.passes.enEchec, 1);
      if (rodage === null) {
        assert.equal(r.phase, 'croisiere');
        assert.equal(r.evenements.length, 0, 'croisière : un résumé seul');
      } else {
        const e = r.evenements.find((x) => x.type === 'etape-en-echec');
        assert.equal(e.rodage, rodage);
        assert.equal(r.phase, rodage ? 'rodage' : 'recette');
      }
    } finally {
      b.nettoyer();
    }
  }
});

test('T-J16 la boucle ne lève jamais (JSON illisible, fichier absent, lecteur qui lève, journal Windows qui rejette) ; un fichier inchangé n’est pas relu', async () => {
  const b = banc();
  try {
    b.ecrire('runtime/refresh-status.json', '{ pas du json');
    const j = b.creer({ lireJW: async () => Promise.reject(new Error('wevtutil a explosé')) });
    assert.deepEqual(await j.tour(), { reussi: false });
    assert.match(b.battement().derniereErreur.message, /refresh-status\.json/);
    b.avancer(30); // un trou : le journal Windows rejette
    await j.tour();
    assert.match(b.battement().derniereErreur.message, /wevtutil a explosé/);
    // Lecteur qui lève : le tour rend « pas réussi », sans exception.
    const j2 = b.creer({ lecteur: () => { throw new Error('lecteur cassé'); } });
    assert.deepEqual(await j2.tour(), { reussi: false });
    // Un fichier inchangé n'est pas relu.
    let lectures = 0;
    // P4b-1 (RC-14) : le battement, réécrit par ce journal à chaque tour, est relu au début de chaque tour (hors du compte).
    const fsp = { stat: fs.promises.stat, readFile: async (...a) => { if (path.basename(String(a[0])) !== 'battement.json') lectures++; return fs.promises.readFile(...a); } };
    b.ecrire('runtime/refresh-status.json', refresh([]));
    const j3 = b.creer({ lecteur: J.creerLecteur({ fsp }) });
    await j3.tour();
    const apresPremier = lectures;
    b.avancer(10);
    await j3.tour();
    assert.equal(lectures, apresPremier, 'aucune relecture d’un fichier dont la date et la taille n’ont pas changé');
  } finally {
    b.nettoyer();
  }
});

test('T-J16 étendu (CR-17) : un tour qui rejette (battement qui lève) passe par noterSansLever ; aucun rejet non rattrapé', async () => {
  const b = banc();
  const rejets = [];
  const ecoute = (e) => rejets.push(e);
  process.on('unhandledRejection', ecoute);
  try {
    const avertis = [];
    const j = b.creer({ ecrireJson: () => { throw new Error('disque plein'); }, journal: { warn: (m) => avertis.push(m), log() {} } });
    await assert.rejects(j.tour(), /disque plein/, 'sans tic, le tour rejette bien : le .catch de tic est nécessaire');
    j.tic();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rejets.length, 0);
    assert.equal(avertis.length, 1);
    assert.match(j.etat.derniereErreur.message, /disque plein/);
  } finally {
    process.removeListener('unhandledRejection', ecoute);
    b.nettoyer();
  }
});

test('T-J16 lecture du code : async function tour, tic par Promise.resolve().then(tour).catch(noterSansLever), noterSansLever sous try/catch', () => {
  assert.match(SOURCE_J, /\n {2}async function tour\(\) \{/);
  assert.match(SOURCE_J, /const tic = \(\) => \{\n {4}Promise\.resolve\(\)\.then\(tour\)\.catch\(noterSansLever\);\n {2}\};/);
  assert.match(SOURCE_J, /function noterSansLever\(e\) \{\n {4}try \{/);
  assert.equal((CODE_J.match(/\btour\(\)/g) ?? []).length, 1, 'tour n’est appelée nulle part directement (seulement par tic)');
  assert.match(SOURCE_J, /minuteries\.setTimeout\(\(\) => \{\n {6}j\.tic\(\);\n {6}intervalle = minuteries\.setInterval\(j\.tic, INTERVALLE_MS\);/);
});

test('T-J17 server.js : les trois lignes de la conception, après enregistrerLancements, .then avant .catch, rien d’autre ; aucun process.on', () => {
  const lignes = SOURCE_SERVEUR.split(/\r?\n/);
  const i = lignes.findIndex((l) => l.includes("import('./data/recette/journalDeLaRecette.js')"));
  assert.ok(i > 0);
  assert.equal(lignes[i].trim(), "import('./data/recette/journalDeLaRecette.js')");
  assert.equal(lignes[i + 1].trim(), '.then((m) => m.demarrerJournalDeLaRecette())');
  assert.equal(lignes[i + 2].trim(), ".catch((e) => console.warn(`[recette] journal non démarré (le serveur tourne quand même) : ${e?.message ?? e}`));");
  assert.equal(lignes[i + 3].trim(), '});', 'rien après, dans le rappel d’app.listen');
  assert.ok(lignes.findIndex((l) => l.includes('enregistrerLancements();')) < i);
  assert.ok(!/process\.on\(/.test(SOURCE_SERVEUR));
  assert.equal(lignes.filter((l) => !l.trim().startsWith('//') && l.includes('journalDeLaRecette')).length, 1, 'un seul import du journal, dynamique');
});

test('T-J17 le lanceur de server.js, joué avec un importeur injecté : import raté ou démarrage qui lève → une ligne, aucun rejet non rattrapé', async () => {
  const lignes = SOURCE_SERVEUR.split(/\r?\n/);
  const i = lignes.findIndex((l) => l.includes("import('./data/recette/journalDeLaRecette.js')"));
  const expression = lignes.slice(i, i + 3).join('\n').replace("import('./data/recette/journalDeLaRecette.js')", 'importer()').trim().replace(/;$/, '');
  const lancer = new Function('importer', 'console', `return ${expression};`);
  const rejets = [];
  const ecoute = (e) => rejets.push(e);
  process.on('unhandledRejection', ecoute);
  try {
    for (const importer of [() => Promise.reject(new Error('module introuvable')), () => Promise.resolve({ demarrerJournalDeLaRecette: () => { throw new Error('démarrage cassé'); } })]) {
      const avertis = [];
      await lancer(importer, { warn: (m) => avertis.push(m) });
      assert.equal(avertis.length, 1);
      assert.match(avertis[0], /journal non démarré \(le serveur tourne quand même\)/);
    }
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(rejets.length, 0);
  } finally {
    process.removeListener('unhandledRejection', ecoute);
  }
});

test('T-J18 la marque d’arrêt (CR-14) : erreur → NOUVELLE d’office avec le message ; pas de marque → « à expliquer » ; marque d’un autre pid ignorée', async () => {
  const cas = [[{ pid: 4242, type: 'erreur', message: 'TypeError: x is not a function' }, 'arret-sur-erreur', 'nouvelle'], [null, 'arret-du-serveur', 'a-expliquer'], [{ pid: 1, type: 'erreur', message: 'vieille' }, 'arret-du-serveur', 'a-expliquer']];
  for (const [marque, type, classe] of cas) {
    const b = banc();
    try {
      const battement = { pid: 4242, demarreLe: '2026-11-18T07:00:00Z', dernierTour: '2026-11-18T08:00:00Z', commit: null };
      const j = b.creer({ pid: 5000, avantDemarrage: { battement, marque } });
      await j.tour();
      const e = b.lireJour('2026-11-18').evenements.find((x) => x.signal === 'S11');
      assert.equal(e.type, type);
      assert.equal(e.classe, classe);
      if (classe === 'nouvelle') assert.match(e.texte, /x is not a function/);
    } finally {
      b.nettoyer();
    }
  }
});

test('T-J18 les deux écouteurs (uncaughtExceptionMonitor et exit, rien d’autre) écrivent la marque en synchrone ; démarrage sans execFile ni lecture avant le premier tour', () => {
  const b = banc();
  try {
    const processus = new EventEmitter();
    processus.pid = 777;
    const appels = [];
    const minuteries = { setTimeout: (f, ms) => { appels.push(['setTimeout', ms]); return { unref() { appels.push(['unref']); } }; }, setInterval() {}, clearTimeout() {}, clearInterval() {} };
    const espion = () => { throw new Error('rien avant le premier tour'); };
    const d = J.demarrerJournalDeLaRecette({ chemins: b.chemins, sources: b.sources, processus, minuteries, lireJW: espion, git: espion, lireDirect: null, journal: { log() {}, warn() {} } });
    assert.equal(d.demarre, true);
    assert.deepEqual(appels, [['setTimeout', 4 * MIN], ['unref']]);
    assert.deepEqual(processus.eventNames().sort(), ['exit', 'uncaughtExceptionMonitor']);
    processus.emit('uncaughtExceptionMonitor', new Error('boum'), 'uncaughtException');
    let m = JSON.parse(fs.readFileSync(b.chemins.dernierArret, 'utf8'));
    assert.equal(m.type, 'erreur');
    assert.equal(m.pid, 777);
    assert.match(m.message, /boum/);
    processus.emit('exit', 1);
    m = JSON.parse(fs.readFileSync(b.chemins.dernierArret, 'utf8'));
    assert.equal(m.type, 'erreur');
    assert.equal(m.code, 1);
    d.arreter();
    assert.deepEqual(processus.eventNames(), []);
    for (const interdit of ["'uncaughtException'", "'unhandledRejection'", "'SIGINT'", "'SIGTERM'", "'SIGBREAK'"]) assert.ok(!SOURCE_J.includes(`on(${interdit}`), interdit);
    // P4b-1 (RC-13) : l'écoute du processus s'écrit `processus.on('exit'` ; T-CF1 la connaît par ECOUTE_DU_PROCESSUS, sans
    // écriture détournée ; aucune déstructuration ne renomme une option en `process`.
    const ecoutes = [...CODE_J.matchAll(/([A-Za-z_$][\w$]*)\s*\??\.\s*(on|once|addListener|prependListener|prependOnceListener)\(\s*(['"`])(exit|close)\3/g)].map((x) => `${x[1]}:${x[4]}`);
    assert.deepEqual(ecoutes, ['processus:exit']);
    assert.doesNotMatch(CODE_J, /\w+\s*:\s*process\s*(=|,|\})/, 'aucune déstructuration ne renomme en « process »');
  } finally {
    b.nettoyer();
  }
});

test('CR-55 la garde du second serveur ; sous node --test, jamais de chemins par défaut', () => {
  const b = banc();
  try {
    fs.mkdirSync(b.chemins.racine, { recursive: true });
    fs.writeFileSync(b.chemins.battement, JSON.stringify({ pid: 999, dernierTour: new Date(Date.parse('2026-11-18T09:00:00Z') - 10 * MIN).toISOString() }));
    const options = { chemins: b.chemins, sources: b.sources, processus: new EventEmitter(), horloge: () => Date.parse('2026-11-18T09:00:00Z'), minuteries: { setTimeout: () => null, setInterval() {}, clearTimeout() {}, clearInterval() {} }, journal: { log() {}, warn() {} }, lireDirect: null };
    assert.equal(J.demarrerJournalDeLaRecette({ ...options, estVivant: () => true }).demarre, false);
    assert.equal(J.demarrerJournalDeLaRecette({ ...options, estVivant: () => false }).demarre, true);
    // RC-11 : même sans chemins, jamais le vrai processus ni de vraies minuteries.
    assert.equal(J.demarrerJournalDeLaRecette({ processus: new EventEmitter(), minuteries: options.minuteries, journal: { log() {}, warn() {} } }).demarre, false);
  } finally {
    b.nettoyer();
  }
});

test('CR-2 mise en service : annonce valable ET code changé → connue (message du commit) ; sinon « à expliquer » ; git en lecture, deux formes, sha contrôlés', async () => {
  const A = '1'.repeat(40);
  const B = '2'.repeat(40);
  const cas = [
    ['annonce + changé', { le: '2026-11-18T08:50:00Z', quoi: 'lot 1' }, 1, 'mise-en-service', 'connue'],
    ['annonce + inchangé', { le: '2026-11-18T08:50:00Z', quoi: 'lot 1' }, 0, 'arret-du-serveur', 'a-expliquer'],
    ['changé sans annonce', null, 1, 'arret-du-serveur', 'a-expliquer'],
    ['annonce périmée', { le: '2026-11-18T07:00:00Z', quoi: 'lot 1' }, 1, 'arret-du-serveur', 'a-expliquer'],
    ['git inconnu', { le: '2026-11-18T08:50:00Z', quoi: 'lot 1' }, 128, 'arret-du-serveur', 'a-expliquer']
  ];
  for (const [nom, annonce, codeDiff, type, classe] of cas) {
    const b = banc();
    try {
      fs.mkdirSync(path.join(b.dossier, '.git'), { recursive: true });
      fs.writeFileSync(path.join(b.dossier, '.git', 'HEAD'), `${B}\n`);
      if (annonce) {
        fs.mkdirSync(b.chemins.racine, { recursive: true });
        fs.writeFileSync(b.chemins.miseEnService, JSON.stringify(annonce));
      }
      const appels = [];
      const git = async (args, { cwd }) => {
        appels.push(args);
        assert.equal(cwd, b.dossier);
        return args[1] === 'diff' ? { code: codeDiff } : { code: 0, sortie: 'Lot 1 de la 47\n' };
      };
      const battement = { pid: 1, dernierTour: '2026-11-18T08:45:00Z', commit: A };
      const j = b.creer({ pid: 2, git, avantDemarrage: { battement, marque: null } });
      await j.tour();
      const e = b.lireJour('2026-11-18').evenements.find((x) => x.signal === 'S11');
      assert.equal(e.type, type, nom);
      assert.equal(e.classe, classe, nom);
      assert.deepEqual(appels[0], ['--no-optional-locks', 'diff', '--quiet', A, B, '--', 'server/src', 'server/scripts', 'server/package.json', 'ui/src'], nom);
      if (type === 'mise-en-service') {
        assert.deepEqual(appels[1], ['--no-optional-locks', 'log', '-1', '--format=%s', B]);
        assert.equal(e.details.message, 'Lot 1 de la 47');
      }
    } finally {
      b.nettoyer();
    }
  }
  // Sha mal formé, bac : aucun appel, « inconnu ».
  const jamais = async () => assert.fail('git ne doit pas être lancé');
  assert.equal(await J.codeChange({ avant: 'HEAD', apres: B, git: jamais, racine: os.tmpdir() }), 'inconnu');
  assert.equal(await J.codeChange({ avant: A, apres: B, git: jamais, racine: os.tmpdir(), bac: true }), 'inconnu');
  assert.equal(await J.codeChange({ avant: A, apres: `${B};rm`, git: jamais, racine: os.tmpdir() }), 'inconnu');
  assert.equal(J.classerLeDemarrage({ demarreLe: '2026-11-18T09:00:00Z', code: 'change', annonce: null }).classe, 'a-expliquer', 'code changé sans annonce');
});

test('§ 7 règle 14 (b) : dans server/src et server/scripts, git seulement en lecture (diff, log, cat-file, archive), jamais par exec ni shell: true', () => {
  const fichiers = [];
  const parcourir = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      if (n.name === 'node_modules') continue;
      const p = path.join(d, n.name);
      if (n.isDirectory()) parcourir(p);
      else if (/\.(m?js|cjs)$/.test(n.name)) fichiers.push(p);
    }
  };
  parcourir(path.join(ICI, '../src'));
  parcourir(path.join(ICI, '../scripts'));
  const PERMISES = new Set(['diff', 'log', 'cat-file', 'archive']);
  let formes = 0;
  for (const f of fichiers) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/\b(?:exec|execSync)\(\s*['"`]git\b/.test(t), `${f} : git par exec`);
    const lance = /\b(?:execFile|execFileSync|spawn|spawnSync)\(\s*['"`]git(?:\.exe)?['"`]/.test(t);
    if (!lance) continue;
    assert.ok(!/shell:\s*true/.test(t), `${f} : git avec shell: true`);
    const sous = [...t.matchAll(/['"]--no-optional-locks['"]\s*,\s*['"]([a-z-]+)['"]/g)].map((m) => m[1]);
    assert.ok(sous.length > 0, `${f} : git lancé sans --no-optional-locks`);
    for (const s of sous) assert.ok(PERMISES.has(s), `${f} : sous-commande git « ${s} » refusée`);
    formes += sous.length;
  }
  assert.ok(formes >= 2, 'les deux formes du journal sont bien vues par cet essai');
});

test('P2-a / CR-16 : la liste FERMÉE des imports directs du journal ; ni lecteur à renommage, ni lecteur à reprises, ni base, ni état des enregistreurs', () => {
  const imports = [...SOURCE_J.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm), ...SOURCE_J.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  const PERMIS = new Set(['node:fs', 'node:os', 'node:path', 'node:child_process', 'node:url', '../../utils/atomicJson.js', '../../config/bacASable.js', './calendrierDeLaRecette.js', './journalWindows.js', '../../jobs/liveWatch.js', './cheminsDeLaRecette.js', './causesConnues.js', './classerLesEvenements.js']);
  assert.ok(imports.length >= 9);
  for (const i of imports) assert.ok(PERMIS.has(i), `import non permis : ${i}`);
  assert.equal((CODE_J.match(/\bimport\(/g) ?? []).length, 1, 'un seul import() dynamique, littéral (liveWatch.js)');
  assert.match(SOURCE_J, /import \{ writeJsonAtomic \} from '\.\.\/\.\.\/utils\/atomicJson\.js';/);
  assert.match(SOURCE_J, /const \{ getLiveWatchStatus \} = await import\('\.\.\/\.\.\/jobs\/liveWatch\.js'\);/);
  for (const interdit of ['readRefreshStatus', 'readJsonFile', 'openDb', 'etatEnregistreurs']) assert.ok(!SOURCE_J.includes(interdit), `le journal contient « ${interdit} »`);
});

test('signatureDeLAlerte et etatFotmobLu : pures, sans champ volatil, sans lecture', () => {
  assert.equal(J.signatureDeLAlerte(null), null);
  assert.equal(J.signatureDeLAlerte({ anomalies: 21, parType: { a: 1 }, updatedAt: 'x' }), J.signatureDeLAlerte({ anomalies: 99, parType: { a: 7 }, updatedAt: 'y' }));
  assert.notEqual(J.signatureDeLAlerte({ releves: [{ cle: 'a' }] }), J.signatureDeLAlerte({ releves: [{ cle: 'a' }, { cle: 'b' }] }));
  assert.equal(J.etatFotmobLu({ sante: { erreursDeSuite: 5 }, refresh: null, maintenant: 0 }).etat, 'en-panne');
  assert.equal(J.etatFotmobLu({ sante: null, refresh: { history: [{ steps: [{ key: 'feuilles', status: 'error' }, { key: 'calendrier', status: 'error' }] }] }, maintenant: 0 }).etat, 'en-panne');
  assert.equal(J.etatFotmobLu({ sante: { erreursDeSuite: 0, parType: { equipe: { derniereForme: { attendue: false } } } }, refresh: null, maintenant: 0 }).etat, 'a-surveiller');
  assert.equal(J.etatFotmobLu({ sante: { erreursDeSuite: 0, derniereReussite: 'x', parType: {} }, refresh: null, maintenant: 0 }).etat, 'ok');
  assert.ok(J.NON_SURVEILLE.includes('compositions') && J.NON_SURVEILLE.includes('cotes gratuites'));
});

// --- P4b-1 (17/11/2026) : les corrections de la relecture de la première écriture (RC-9 à RC-14) -------------------

test('P4b-1 RC-9 : un fichier du jour illisible n’est jamais réécrit ; ce processus écrit à côté, puis réunit tout dès qu’il se relit', async () => {
  const b = banc({ debut: '2026-11-18T14:00:00Z', battementAvant: { pid: 1111, demarreLe: '2026-11-18T06:00:00Z', dernierTour: '2026-11-18T13:50:00Z', commit: null } });
  try {
    fs.mkdirSync(b.chemins.dossierDuJournal, { recursive: true });
    fs.writeFileSync(b.chemins.fichierDuJour('2026-11-18'), '{ illisible');
    const j = b.creer();
    await j.tour();
    assert.equal(fs.readFileSync(b.chemins.fichierDuJour('2026-11-18'), 'utf8'), '{ illisible', 'jamais réécrit par-dessus');
    const reprise = JSON.parse(fs.readFileSync(b.chemins.repriseDuJour('2026-11-18', 4242), 'utf8'));
    assert.equal(reprise.reprise, true);
    assert.ok(reprise.evenements.some((e) => e.type === 'fichier-du-jour-illisible'), JSON.stringify(reprise.evenements.map((e) => e.type)));
    assert.match(b.battement().derniereErreur?.message ?? '', /illisible|Expected|JSON/);
    // Le fichier redevient lisible (OneDrive a fini) : ses événements et les nôtres sont réunis, rien n'est perdu.
    const ancien = { id: '2026-11-18|etape-en-alerte|audit|08:00:00', le: '2026-11-18T08:00:00Z', type: 'etape-en-alerte', cle: 'audit', texte: 'du matin', classe: 'connue', cause: 'audit-buteurs-gardiens' };
    fs.writeFileSync(b.chemins.fichierDuJour('2026-11-18'), JSON.stringify({ ...J.resumeVide('2026-11-18', 'rodage'), evenements: [ancien], couverture: { ...J.resumeVide('2026-11-18', 'rodage').couverture, minutesObservees: 400, tours: 40, toursReussis: 40 } }));
    b.avancer(10);
    await j.tour();
    const r = b.lireJour('2026-11-18');
    assert.ok(r.evenements.some((e) => e.id === ancien.id), 'l’événement du matin est gardé');
    assert.ok(r.evenements.some((e) => e.type === 'fichier-du-jour-illisible'), 'les nôtres aussi');
    assert.ok(r.couverture.minutesObservees >= 400, JSON.stringify(r.couverture));
    assert.equal(j.etat.jourIllisible, null);
  } finally {
    b.nettoyer();
  }
});

test('P4b-1 RC-12 : une veille de 22 h à 7 h (Paris) est coupée à minuit ; un arrêt qui passe minuit aussi ; chaque jour ≤ 1 440 min', async () => {
  const sommeil = Date.parse('2026-11-18T21:01:00Z');
  const reveil = Date.parse('2026-11-19T06:00:00Z');
  const lireJW = async () => ({ lisible: true, evenements: [{ type: 'mise-en-veille', ms: sommeil, le: new Date(sommeil).toISOString() }, { type: 'reprise', ms: reveil, le: new Date(reveil).toISOString() }] });
  const b = banc({ debut: '2026-11-18T20:00:00Z', lireJW });
  try {
    const j = b.creer();
    for (let i = 0; i <= 6; i += 1) {
      await j.tour();
      b.avancer(10);
    }
    b.h.t = reveil + 2 * MIN;
    await j.tour();
    const d = b.lireJour('2026-11-18').couverture;
    const d1 = j.etat.resume.couverture;
    // Jour D : la veille de 22 h 01 à minuit (≈ 119 min) ; jour D+1 : de minuit à 7 h (≈ 420 min), jamais le tout.
    assert.ok(Math.abs(d.minutesDeVeille - 119) <= 2, JSON.stringify(d));
    assert.ok(Math.abs(d1.minutesDeVeille - 420) <= 2, JSON.stringify(d1));
    const total = (c) => c.minutesObservees + c.minutesDeVeille + c.minutesArret + c.minutesEnErreur + (c.minutesNonObservees ?? 0);
    assert.equal(total(d), 1440, JSON.stringify(d));
    assert.ok(total(d1) <= 1440, JSON.stringify(d1));
  } finally {
    b.nettoyer();
  }
  // L'arrêt : dernier tour à 23 h 40 (Paris) le 18, démarrage à 7 h le 19 : 20 min au 18, 420 min au 19.
  const b2 = banc({ debut: '2026-11-18T22:00:00Z' });
  try {
    const j = b2.creer();
    for (let i = 0; i < 4; i += 1) {
      await j.tour();
      b2.avancer(10);
    }
    await j.tour();
    const avant = b2.battement();
    b2.h.t = Date.parse('2026-11-19T06:00:00Z');
    const j2 = b2.creer({ pid: 4343, demarreLe: b2.h.t, avantDemarrage: { battement: avant, marque: { pid: 4242, type: 'exit', code: 0 } } });
    await j2.tour();
    const d = b2.lireJour('2026-11-18').couverture;
    assert.equal(d.minutesArret, 20, JSON.stringify(d));
    assert.ok(d.minutesObservees >= 30, 'la couverture du processus d’avant, lue au battement : ' + JSON.stringify(d));
    assert.equal(d.minutesObservees + d.minutesDeVeille + d.minutesArret + d.minutesEnErreur + d.minutesNonObservees, 1440, JSON.stringify(d));
    assert.equal(j2.etat.resume.couverture.minutesArret, 420, JSON.stringify(j2.etat.resume.couverture));
  } finally {
    b2.nettoyer();
  }
});

test('P4b-1 RC-14 : deux journaux sur les mêmes fichiers : le premier qui voit un tour plus récent d’un autre pid s’arrête ; seconde tentative 25 min plus tard', async () => {
  const b = banc({ debut: '2026-11-18T09:00:00Z' });
  try {
    let arrete = 0;
    const a = b.creer({ pid: 1, surArret: () => (arrete += 1) });
    await a.tour();
    b.avancer(2);
    const c = b.creer({ pid: 2, demarreLe: b.h.t, avantDemarrage: { battement: b.battement(), marque: null } });
    await c.tour();
    b.avancer(8);
    assert.deepEqual(await a.tour(), { reussi: false, arrete: true });
    assert.equal(arrete, 1);
    assert.equal(b.battement().pid, 2, 'le journal arrêté n’écrit plus le battement');
    assert.match(a.etat.derniereErreur.message, /un autre journal \(pid 2\)/);
    assert.equal((await c.tour()).reussi !== undefined, true, 'l’autre continue');
    assert.deepEqual(await a.tour(), { reussi: false, arrete: true }, 'arrêté pour de bon');
  } finally {
    b.nettoyer();
  }
  // Le démarrage : un pid « vivant » dans le battement (peut-être réutilisé) → refus, puis seconde tentative à +25 min.
  const b2 = banc();
  try {
    fs.mkdirSync(b2.chemins.racine, { recursive: true });
    fs.writeFileSync(b2.chemins.battement, JSON.stringify({ pid: 999, dernierTour: '2026-11-18T08:55:00Z' }));
    const h = { t: Date.parse('2026-11-18T09:00:00Z') };
    const minuteurs = [];
    const options = { chemins: b2.chemins, sources: b2.sources, processus: new EventEmitter(), horloge: () => h.t, minuteries: { setTimeout: (f, ms) => (minuteurs.push({ f, ms }), minuteurs.length), setInterval() {}, clearTimeout() {}, clearInterval() {} }, journal: { log() {}, warn() {} }, lireDirect: null, estVivant: () => true, pid: 1234 };
    const d = J.demarrerJournalDeLaRecette(options);
    assert.equal(d.demarre, false);
    assert.equal(d.secondeTentativeDans, 25 * MIN);
    assert.equal(minuteurs.at(-1).ms, 25 * MIN);
    h.t += 25 * MIN;
    minuteurs.at(-1).f();
    assert.equal(d.suite()?.demarre, true, 'battement immobile : ce pid ne tient aucun journal');
    // Le battement a avancé pendant l'attente : pas de démarrage.
    const d2 = J.demarrerJournalDeLaRecette({ ...options, horloge: () => Date.parse('2026-11-18T09:00:00Z') });
    fs.writeFileSync(b2.chemins.battement, JSON.stringify({ pid: 999, dernierTour: '2026-11-18T09:05:00Z' }));
    minuteurs.at(-1).f();
    assert.equal(d2.suite(), null);
  } finally {
    b2.nettoyer();
  }
});

test('P4b-1 RC-10 et RC-11 (lecture) : journal-recette hors de l’empreinte des données ; aucun démarrage du journal sans processus factice ; la garde de tête des trois essais', () => {
  const dv = fs.readFileSync(path.join(ICI, '../src/data/repositories/dataVersionRepository.js'), 'utf8');
  assert.match(dv, /const DOSSIERS_HORS_EMPREINTE = new Set\(\['journal-claude', 'journal-recette'\]\);/);
  for (const nom of ['recetteJournal.test.mjs', 'recetteCauses.test.mjs', 'recetteFeuilleDeRoute.test.mjs']) {
    const src = fs.readFileSync(path.join(ICI, nom), 'utf8');
    assert.ok(src.split('\n').includes("if (!process.env.NODE_TEST_CONTEXT && !process.env.CM_TEST_DOSSIER) process.env.CM_TEST_DOSSIER = '1';"), nom + ' : garde de tête (une ligne à elle seule)');
    for (const l of src.split('\n').filter((x) => /demarrerJournalDeLaRecette\(\{/.test(x) && !/assert\.ok\(src|lignes\[i/.test(x))) assert.ok(/processus|\.\.\.options/.test(l), `${nom} : ${l.trim().slice(0, 120)}`);
  }
});
