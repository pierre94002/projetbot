/**
 * ÉTAPE 46, § 2.7 DE LA VÉRIFICATION (18/11/2026) — LA RECONDUCTION DU JUGEMENT DU DIRECT (PROJET § 1 point 7 ; contrat lu par
 * le second sceau : conception du second sceau, § 6.1, § 6.2, § 9.3). Corrigé le 18/11 au matin (décision O15).
 *   T-R1  le module des reconductions est une donnée pure (aucun import), ses balises une seule fois ; chacune de ses
 *         inscriptions passe le contrôle COMPLET de --verifier (sceau, registre des versions du code, preuve à son sha1, jour)
 *         et ses modules du direct sont ceux du disque ; le sceau relu comme texte = SCELLEMENT ;
 *   T-R2  controlerUneInscription : une inscription bonne passe ; chaque défaut est refusé et nommé (rencontres, identités,
 *         registre en service, preuve retouchée ou écrite à la main, modules vides…) ;
 *   T-R2b controlerUnePreuve et raisonsDeNePasInscrire : la forme exacte, « identique » recalculé, les versions lues, les seuils ;
 *   T-R2c nuitsDeLaPreuve : instants distincts, dates différentes, dans le passé ;
 *   T-R2d comparerLesNuits : rencontres DISTINCTES, lignes à part, et un écart de λ, μ, ρ, fair, grille, lectures, une ligne
 *         d'un seul côté (chaque sens), une liste vide, un « reporté » — chacun vu ;
 *   T-R3  reconductionPour (l'écran) : l'unique inscription de la version, avec sceau, registre et sha1 exigés ; numéros stricts ;
 *   T-R4  l'écran (ui/src/utils/direct.js) : la phrase de la reconduction, seulement quand les chiffres sont montrés ;
 *   T-R5  le script --inscrire / --verifier dans une copie (faux bac) : cible explicite dans le bac, ajout pur par renommage,
 *         preuve au texte exact de ce script, N′ = le code où l'on inscrit, registre et note exigés, refus nommés ;
 *   T-R6  le script --preuve : nuits, réglages, registre et données exigés ; le même code des deux côtés → « identique », les
 *         identités lues (code + réglages) et les numéros du registre ; un λ décalé de 0,001 → refusé, l'écart et le module
 *         nommés, les lectures du direct comparées ; la sortie jamais réécrite ; la vraie base et un lien physique refusés.
 * (La lecture du direct avec une reconduction : directLecture.test.mjs, T-L11 bis.) Données FABRIQUÉES seulement.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SERVEUR, RACINE_ESSAIS, ECHANTILLON, nettoyer } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import { sha1, IDENTITE_5, IDENTITE_6, modulesDuSceau, preuveFabriquee, inscriptionDe, registreFabrique, optionsCompletes } from './aides/reconductionFabriquee.mjs';
import * as bac from '../src/config/bacASable.js';
import * as R from '../src/data/direct/reconductionDuDirect.js';
import { SCELLEMENT } from '../src/data/direct/bancDuDirect.js';
import { empreinteDuCode, empreinteDesReglages, FICHIER_VERSIONS } from '../src/core/engine/engineVersions.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const FICHIER = path.join(SERVEUR, 'src', 'data', 'direct', 'reconductionDuDirect.js');
const SCRIPT = path.join(SERVEUR, 'scripts', 'reconduction46.mjs');
const CALCUL = path.join(SERVEUR, 'scripts', 'reconduction46-calcul.mjs');
const UI_DIRECT = path.resolve(SERVEUR, '..', 'ui', 'src', 'utils', 'direct.js');
const sha1Fichier = (f) => sha1(fs.readFileSync(f));
const nettoyages = [];
after(() => {
  for (const f of nettoyages) f();
});

const bonne = (plus = {}) => inscriptionDe(preuveFabriquee(), plus);
const controle = (i, extra = {}) => R.controlerUneInscription(i, optionsCompletes({ toutes: [i], ...extra }));
/** Une inscription dont la preuve est REFAITE (sha1 recalculé) avec `plusPreuve`, et l'inscription la redisant. */
const avecPreuve = (plusPreuve, plusInscription = {}) => inscriptionDe(preuveFabriquee(plusPreuve), plusInscription);

// ------------------------------------------------------------ T-R1

test('T-R1 — reconductionDuDirect.js : une donnée pure (aucun import, ni horloge, ni fichier), ses balises une seule fois, RECONDUCTIONS gelée ; chaque inscription passe le contrôle complet de --verifier (sceau, registre du code, preuve à son sha1, jour) et ses modules sont ceux du disque', () => {
  const texte = fs.readFileSync(FICHIER, 'utf8');
  const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(texte, /^\s*import\b/m, 'aucune ligne import (conception du second sceau, § 9.3)');
  for (const interdit of [/\bimport\s*\(/, /\brequire\s*\(/, /\bprocess\./, /Date\.now/, /new Date\(\s*\)/, /\bfs\./, /\bfetch\s*\(/]) assert.doesNotMatch(code, interdit, String(interdit));
  const ouvre = '// <RECONDUCTIONS inscrites par script (node scripts/reconduction46.mjs --inscrire) — ne pas modifier à la main>';
  const ferme = '// </RECONDUCTIONS>';
  assert.equal(texte.split(ouvre).length, 2, 'balise ouvrante une fois');
  assert.equal(texte.split(ferme).length, 2, 'balise fermante une fois');
  const bloc = texte.slice(texte.indexOf(ouvre) + ouvre.length, texte.indexOf(ferme)).split('\n').filter(Boolean);
  assert.equal(bloc[0], 'export const RECONDUCTIONS = Object.freeze([');
  assert.equal(bloc.at(-1), ']);');
  for (const l of bloc.slice(1, -1)) assert.match(l, /^ {2}geler\(\{.*\}\),$/, `une inscription par ligne, écrite par script : ${l.slice(0, 80)}`);
  assert.ok(Object.isFrozen(R.RECONDUCTIONS));
  // Le contenu de --verifier, pour chaque inscription : le registre des versions DE CE CODE, le sceau, la preuve à son sha1,
  // le jour, et les 19 modules relus sur le disque.
  if (R.RECONDUCTIONS.length) {
    const identites = R.identitesDuRegistre(JSON.parse(fs.readFileSync(FICHIER_VERSIONS, 'utf8')));
    assert.ok(identites, 'le registre des versions de ce code se lit');
    const aujourdhui = R.jourDeParis(new Date().toISOString());
    for (const i of R.RECONDUCTIONS) {
      assert.ok(Object.isFrozen(i));
      const c = R.controlerUneInscription(i, { scellement: SCELLEMENT, toutes: R.RECONDUCTIONS, identiteDe: (n) => identites[n] ?? null, sha1, aujourdhui });
      assert.ok(c.ok, c.raisons.join(' ; '));
      for (const [f, s] of Object.entries(i.modulesDuDirect)) {
        const t = fs.readFileSync(path.join(SERVEUR, f), 'utf8');
        assert.equal(sha1(f === 'src/data/direct/bancDuDirect.js' ? R.texteAScellementVide(t) : fs.readFileSync(path.join(SERVEUR, f))), s, `module ${f} : sur le disque = l'inscription`);
      }
    }
  }
  assert.deepEqual(R.SEUILS_DE_RECONDUCTION, { nuits: 3, rencontres: 300, ecart: 1e-12, rencontresCotees: 100, nuitsCotees: 2, rencontresParNuit: 30, heuresEntreNuits: 20, partDesEchecs: 0.05, octetsDeLaBase: 1_000_000_000 });
  assert.deepEqual(R.BASES_D_ESSAI, [sha1Fichier(ECHANTILLON)], 'la base d’essai du code est celle que la preuve refuse');
  // m8 (O16) : le texte « à RECONDUCTIONS vide » redonne ce fichier tant que rien n'est inscrit ; les balises n'y sont qu'une fois.
  if (!R.RECONDUCTIONS.length) assert.equal(R.texteAReconductionsVides(texte), texte);
  assert.equal(R.CHAINE_ADMISE, false, 'décision A1 (a) : toujours depuis la version jugée');
  assert.deepEqual(R.DOSSIERS_DU_DIRECT, ['src/data/direct/', 'src/data/simulation/', 'src/core/model/', 'src/core/engine/', 'src/core/market/']);
  // La liste (c) : les 19 modules du sceau rangés sous ces dossiers ; ni le script, ni calibration, dayTable, guard, metrics.
  const liste = R.modulesDuDirectDuSceau(SCELLEMENT.modules);
  assert.equal(liste.length, 19);
  for (const hors of ['scripts/etape46.mjs', 'src/data/calibration.js', 'src/data/db/dayTable.js', 'src/bench/guard.js', 'src/bench/metrics.js']) assert.ok(!liste.includes(hors), hors);
  assert.ok(!R.CLES_DE_LA_PREUVE.some((k) => /score|resultat|issue|but/i.test(k)), 'aucune clé de la preuve pour une issue');
  // Le sceau relu comme TEXTE (ce que lit l'écran) = SCELLEMENT importé ; bancDuDirect.js « à scellement vide » = son sha1 scellé.
  const banc = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'direct', 'bancDuDirect.js'), 'utf8');
  assert.deepEqual(R.scellementDuTexte(banc), JSON.parse(JSON.stringify(SCELLEMENT)));
  assert.equal(sha1(R.texteAScellementVide(banc)), SCELLEMENT.modules['src/data/direct/bancDuDirect.js']);
});

// ------------------------------------------------------------ T-R2

test('T-R2 — controlerUneInscription : la bonne passe ; nuits, rencontres, lignes, écarts, versions, grille, identités, registre en service, modules du sceau ou vides, lectures, jour, clés, voie, preuve (forme, sha1, retouchée, écrite à la main, non inscriptible, non redite), historique et doublon refusés, chacun nommé', () => {
  assert.deepEqual(controle(bonne()), { ok: true, raisons: [] });
  const sans = bonne();
  delete sans.entreeEnService;
  assert.deepEqual(controle(sans), { ok: true, raisons: [] }, 'entreeEnService est facultative');
  const changeUnModule = () => {
    const m = modulesDuSceau();
    m['src/data/direct/calculDuDirect.js'] = 'd'.repeat(40);
    return m;
  };
  const autreRegistre = (identites) => {
    const ids = R.identitesDuRegistre(registreFabrique(identites));
    return { identiteDe: (n) => ids[n] ?? null };
  };
  const retouchee = () => {
    const i = bonne();
    return { ...i, preuve: { ...i.preuve, contenu: { ...i.preuve.contenu, rencontres: 400 } } };
  };
  const cas = [
    ['2 nuits', avecPreuve({ nuits: 2 }), /nuits : au moins 3/],
    ['299 rencontres', avecPreuve({ rencontres: 299 }), /rencontres : au moins 300 rencontres distinctes/],
    ['moins de lignes que de rencontres', bonne({ lignesComparees: 311 }), /lignesComparees : un entier, au moins le nombre de rencontres/],
    ['écart de 2e-12', bonne({ ecartMax: { lambda: 0, mu: 0, rho: 0, fair: 2e-12 } }), /ecartMax\.fair : au plus 1e-12/],
    ['écart sans rho', bonne({ ecartMax: { lambda: 0, mu: 0, fair: 0 } }), /ecartMax : lambda, mu, rho, fair/],
    ['autre départ', bonne({ de: 4 }), /n'est pas la version jugée \(5\)/],
    ['vers avant de', bonne({ vers: 5 }), /doit venir après/],
    ['autre grille', bonne({ grille: 'modele-buts-441' }), /ce n'est pas celle du sceau/],
    ['un module de moins', bonne({ modulesDuDirect: Object.fromEntries(Object.entries(modulesDuSceau()).slice(1)) }), /exactement les 19 modules/],
    ['modules vides', bonne({ modulesDuDirect: {} }), /modulesDuDirect : \{ chemin: sha1 \}, non vide/],
    ['un module changé tu', bonne({ modulesDuDirect: changeUnModule() }), /modulesDuDirectChanges : exactement src\/data\/direct\/calculDuDirect\.js/],
    ['un module changé sans lectures', bonne({ modulesDuDirect: changeUnModule(), modulesDuDirectChanges: ['src/data/direct/calculDuDirect.js'] }), /lectures aux états de l'étalonnage sont exigées/],
    ['lectures sous le seuil', bonne({ lectures: { etats: 4, creneaux: 4, lignes: 412, ecartMax: 1e-6 } }), /lectures\.ecartMax : au plus 1e-12/],
    ['lectures sans créneaux', bonne({ lectures: { etats: 4, creneaux: 0, lignes: 412, ecartMax: 0 } }), /les états et les créneaux de l'étalonnage/],
    ['inscrite demain', bonne({ le: '2026-11-21' }), /après aujourd'hui/],
    ['en service après l’inscription', bonne({ entreeEnService: '2026-11-20' }), /entreeEnService \(2026-11-20\) est après/],
    ['clé inconnue', bonne({ score: '2-1' }), /clés inconnues : score/],
    ['autre voie', bonne({ voie: 'a-la-main' }), /voie : cote-a-cote ou recalcul-bac/],
    ['preuve sans contenu', bonne({ preuve: { fichier: 'p.json', sha1: 'c'.repeat(40) } }), /preuve : \{ fichier, sha1, contenu \}/],
    ['preuve sans sha1', bonne({ preuve: { fichier: 'p.json', sha1: 'x', contenu: preuveFabriquee() } }), /preuve : \{ fichier, sha1, contenu \}/],
    ['preuve retouchée (sha1 gardé)', retouchee(), /ne redonne pas son sha1/],
    ['preuve écrite à la main (identique sans ses nombres)', avecPreuve({ seulementNPrime: 2 }), /« identique » ne se recalcule pas/],
    ['preuve sans versions lues', avecPreuve({ de: null, versionsLues: false, registre: { sha1: '8'.repeat(40), de: null, vers: { ...IDENTITE_6 } } }, { de: 5 }), /versions lues/],
    ['preuve non identique', avecPreuve({ identique: false, ecartMax: { lambda: 0.002, mu: 0, rho: 0, fair: 0 }, differences: [{ nuit: 'x', cle: 'k', champ: 'lambda', ecart: 0.002 }] }, { ecartMax: { lambda: 0, mu: 0, rho: 0, fair: 0 } }), /n'est jamais reconduite/],
    ['inscription qui ne redit pas sa preuve', bonne({ rencontres: 400, lignesComparees: 500 }), /rencontres : l'inscription ne redit pas la preuve/],
    ['empreintes absentes', bonne({ empreintes: null }), /empreintes : \{ de, vers \}/],
    ['même identité des deux côtés', avecPreuve({ nPrime: IDENTITE_5 }), /même identité/],
    ['empreintes qui ne redisent pas la preuve', bonne({ empreintes: { de: { ...IDENTITE_5 }, vers: { code: IDENTITE_6.code, reglages: 'c'.repeat(40) } } }), /empreintes : l'inscription ne redit pas les identités/],
    ['sans historique', bonne({ historique: ' ' }), /historique/]
  ];
  for (const [qui, i, motif] of cas) {
    const c = controle(i);
    assert.equal(c.ok, false, qui);
    assert.ok(c.raisons.some((r) => motif.test(r)), `${qui} : ${c.raisons.join(' ; ')}`);
  }
  // Le registre EN SERVICE : la version 6 y a un autre code (le « 6 » de Pierre n'est pas celui de la preuve), ou n'y est pas.
  for (const [qui, ids] of [['autre code au 6', { 5: IDENTITE_5, 6: { ...IDENTITE_6, code: 'a'.repeat(40) } }], ['autres réglages au 5', { 5: { ...IDENTITE_5, reglages: 'b'.repeat(40) }, 6: IDENTITE_6 }], ['sans le 6', { 5: IDENTITE_5 }]]) {
    const c = controle(bonne(), autreRegistre(ids));
    assert.ok(!c.ok && c.raisons.some((r) => /registre en service : la version (5|6) n'a pas les empreintes inscrites/.test(r)), `${qui} : ${c.raisons.join(' ; ')}`);
  }
  // Un module changé, MÊME avec ses lectures à 1e-12 (redites par la preuve) : refusé (O16, I5, la voie simple : nouveau banc
  // ou second sceau).
  const l = { etats: 4, creneaux: 4, lignes: 412, ecartMax: 0 };
  const cm = controle(avecPreuve({ modulesDuDirect: changeUnModule(), modulesDuDirectChanges: ['src/data/direct/calculDuDirect.js'], lectures: l }));
  assert.ok(!cm.ok && cm.raisons.some((r) => /un module scellé du direct a changé/.test(r)), cm.raisons.join(' ; '));
  // Les règles d'O16 portées par la preuve valent aussi pour une inscription (controlerUneInscription les appelle).
  for (const [qui, plus, motif] of [
    ['99 rencontres cotées', { cotes: { lignes: 99, rencontres: 99, payantes: 99, gratuites: 0, nuits: 3 } }, /au moins 100 rencontres cotées/],
    ['base d’essai', { base: { sha1: '85e82c04ee2215efd8c32fae3546d032337c40e8', octets: 3060670464 } }, /base d'essai/],
    ['échecs différents', { echecs: { n: [], nPrime: ['2026-10-02T01:00:00.000Z|id:1'] } }, /pas les mêmes des deux côtés/]
  ]) {
    const c2 = controle(avecPreuve(plus));
    assert.ok(!c2.ok && c2.raisons.some((r) => motif.test(r)), `${qui} : ${c2.raisons.join(' ; ')}`);
  }
  // Deux inscriptions de la même version : aucune ne vaut.
  const i = bonne();
  const c = R.controlerUneInscription(i, optionsCompletes({ toutes: [i, bonne({ le: '2026-11-18' })] }));
  assert.ok(!c.ok && c.raisons.some((r) => /plusieurs inscriptions pour la version 6/.test(r)), c.raisons.join(' ; '));
  assert.deepEqual(R.controlerUneInscription(null), { ok: false, raisons: ['inscription illisible'] });
});

test('T-R2b — controlerUnePreuve et raisonsDeNePasInscrire : la forme exacte, « identique » recalculé depuis les nombres, les versions lues redites par le registre, les nuits, la base, les réglages ; les seuils et l’identité pour inscrire', () => {
  assert.deepEqual(R.controlerUnePreuve(preuveFabriquee()), { ok: true, raisons: [] });
  assert.deepEqual(R.raisonsDeNePasInscrire(preuveFabriquee()), []);
  const cas = [
    ['clé hors liste', { ...preuveFabriquee(), score: '2-1' }, /liste fermée/],
    ['format 1', preuveFabriquee({ format: 1 }), /format 1/],
    ['identique dit sans ses nombres (ligne de N′ seule)', preuveFabriquee({ seulementNPrime: 1 }), /« identique » ne se recalcule pas/],
    ['identique dit sans ses nombres (écart de μ)', preuveFabriquee({ ecartMax: { lambda: 0, mu: 0.001, rho: 0, fair: 0 } }), /« identique » ne se recalcule pas/],
    ['identique dit avec une différence nommée', preuveFabriquee({ differences: [{ nuit: 'x', cle: 'k', champ: 'fair', ecart: 0.01 }] }), /« identique » ne se recalcule pas/],
    ['identique dit sans aucune rencontre', preuveFabriquee({ rencontres: 0 }), /« identique » ne se recalcule pas/],
    ['versions lues que le registre ne redit pas', preuveFabriquee({ registre: { sha1: '8'.repeat(40), de: { ...IDENTITE_5 }, vers: { ...IDENTITE_5 } } }), /versionsLues/],
    ['même instant deux fois', preuveFabriquee({ jours: ['2026-10-02T01:00:00.000Z', '2026-10-02T01:00:00.000Z', '2026-10-04T01:00:00.000Z'] }), /même instant/],
    ['deux nuits du même jour', preuveFabriquee({ jours: ['2026-10-02T01:00:00.000Z', '2026-10-02T20:00:00.000Z', '2026-10-04T01:00:00.000Z'] }), /même jour/],
    ['une nuit après la preuve', preuveFabriquee({ jours: ['2026-10-02T01:00:00.000Z', '2026-10-03T01:00:00.000Z', '2026-10-06T01:00:00.000Z'] }), /futur/],
    ['plus de nuits complètes que de nuits', preuveFabriquee({ nuits: 4 }), /plus de nuits complètes/],
    ['plus de rencontres que de lignes', preuveFabriquee({ lignesComparees: 300 }), /plus de rencontres que de lignes/],
    ['base vide', preuveFabriquee({ base: { sha1: '7'.repeat(40), octets: 0 } }), /base/],
    ['sans réglages (empreinte absente)', preuveFabriquee({ reglages: { n: { fichier: 'f'.repeat(40), empreinte: null }, nPrime: { fichier: '9'.repeat(40), empreinte: IDENTITE_6.reglages } } }), /reglages/],
    ['sans script', preuveFabriquee({ script: null }), /script/],
    // O16
    ['script sans le sha1 de reconductionDuDirect.js (m8)', preuveFabriquee({ script: { preuve: 'd'.repeat(40), calcul: 'e'.repeat(40) } }), /preuve, calcul, reconduction/],
    ['cotes à l’ancienne forme (B1)', preuveFabriquee({ cotes: { lignes: 380, rencontres: 300 } }), /preuve : cotes/],
    ['plus de cotées que de rencontres (B1)', preuveFabriquee({ rencontres: 312, cotes: { lignes: 400, rencontres: 313, payantes: 0, gratuites: 0, nuits: 3 } }), /preuve : cotes/],
    ['payantes + gratuites au-delà des cotées (B1)', preuveFabriquee({ cotes: { lignes: 380, rencontres: 300, payantes: 290, gratuites: 20, nuits: 3 } }), /preuve : cotes/],
    ['plus de nuits cotées que de nuits (B1)', preuveFabriquee({ cotes: { lignes: 380, rencontres: 300, payantes: 280, gratuites: 20, nuits: 4 } }), /preuve : cotes/],
    ['bilans sans la fenêtre', preuveFabriquee({ bilans: { n: { matchs: 1, analyses: 420, echecs: 0, sansIdentifiant: 10 }, nPrime: { matchs: 1, analyses: 420, echecs: 0, sansIdentifiant: 10 } } }), /preuve : bilans/],
    ['bilans de N bâclés : moins d’analyses que de lignes (I4)', preuveFabriquee({ bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 419, echecs: 0, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 0, sansIdentifiant: 10 } } }), /bilans de N —/],
    ['bilans de N′ bâclés (I4)', preuveFabriquee({ bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 0, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 300, echecs: 0, sansIdentifiant: 10 } } }), /bilans de N′ —/],
    ['échecs non triés (I1)', preuveFabriquee({ echecs: { n: ['b', 'a'], nPrime: ['b', 'a'] } }), /preuve : echecs/],
    ['échecs absents (I1)', preuveFabriquee({ echecs: null }), /preuve : echecs/],
    ['données sans fichier (I2)', preuveFabriquee({ donnees: { empreinte: '6'.repeat(40), fichiers: {} } }), /preuve : donnees/]
  ];
  for (const [qui, p, motif] of cas) {
    const c = R.controlerUnePreuve(p);
    assert.equal(c.ok, false, qui);
    assert.ok(c.raisons.some((r) => motif.test(r)), `${qui} : ${c.raisons.join(' ; ')}`);
  }
  const nonInscriptibles = [
    ['non identique', preuveFabriquee({ identique: false, differences: [{ nuit: 'x', cle: 'k', champ: 'mu', ecart: 0.001 }], ecartMax: { lambda: 0, mu: 0.001, rho: 0, fair: 0 } }), /jamais reconduite/],
    ['versions non lues', preuveFabriquee({ vers: null, versionsLues: false, registre: { sha1: '8'.repeat(40), de: { ...IDENTITE_5 }, vers: null } }), /versions lues/],
    ['vers avant de', preuveFabriquee({ de: 6, vers: 5, registre: { sha1: '8'.repeat(40), de: { ...IDENTITE_5 }, vers: { ...IDENTITE_6 } } }), /doit venir après/],
    ['même identité', preuveFabriquee({ nPrime: IDENTITE_5, registre: { sha1: '8'.repeat(40), de: { ...IDENTITE_5 }, vers: { ...IDENTITE_5 } } }), /même identité/],
    ['2 nuits', preuveFabriquee({ nuits: 2 }), /au moins 3 nuits/],
    ['299 rencontres', preuveFabriquee({ rencontres: 299 }), /au moins 300 rencontres distinctes/],
    // O16 (b), I1, I2, I5
    ['99 rencontres cotées (b)', preuveFabriquee({ cotes: { lignes: 99, rencontres: 99, payantes: 99, gratuites: 0, nuits: 3 } }), /au moins 100 rencontres cotées des deux côtés \(ici 99\)/],
    ['aucune rencontre cotée (B1 : 310 « sans cote »)', preuveFabriquee({ cotes: { lignes: 0, rencontres: 0, payantes: 0, gratuites: 0, nuits: 0 } }), /au moins 100 rencontres cotées des deux côtés \(ici 0\)/],
    ['cotées sur une seule nuit (b)', preuveFabriquee({ cotes: { lignes: 300, rencontres: 300, payantes: 300, gratuites: 0, nuits: 1 } }), /sur au moins 2 nuits \(ici 1\)/],
    ['matchs sans ligne d’un seul côté (I1)', preuveFabriquee({ echecs: { n: ['2026-10-02T01:00:00.000Z|id:4242'], nPrime: [] } }), /pas les mêmes des deux côtés/],
    ['échecs de N au-delà de 5 % (I1)', preuveFabriquee({ bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 22, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 2, sansIdentifiant: 10 } } }), /échecs de N : 22 sur 430/],
    ['échecs de N′ au-delà de 5 % (I1)', preuveFabriquee({ bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 2, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 22, sansIdentifiant: 10 } } }), /échecs de N′ : 22 sur 430/],
    ['un module scellé du direct changé (I5)', preuveFabriquee({ modulesDuDirectChanges: ['src/data/direct/calculDuDirect.js'], modulesDuDirect: { ...modulesDuSceau(), 'src/data/direct/calculDuDirect.js': 'd'.repeat(40) }, lectures: { etats: 4, creneaux: 4, lignes: 412, ecartMax: 0 } }), /un module scellé du direct a changé/],
    ['base d’essai (I2)', preuveFabriquee({ base: { sha1: R.BASES_D_ESSAI[0], octets: 3060670464 } }), /base d'essai/],
    ['base de moins de 1 Go (I2)', preuveFabriquee({ base: { sha1: '7'.repeat(40), octets: 4370432 } }), /base : 4370432 octets/]
  ];
  // 21 échecs sur 430 (4,9 %) : sous le plafond ; 22 : au-delà.
  assert.deepEqual(R.raisonsDeNePasInscrire(preuveFabriquee({ bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 21, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 21, sansIdentifiant: 10 } } })), []);
  for (const [qui, p, motif] of nonInscriptibles) {
    assert.ok(R.controlerUnePreuve(p).ok, `${qui} : bien formée — ${R.controlerUnePreuve(p).raisons.join(' ; ')}`);
    const r = R.raisonsDeNePasInscrire(p);
    assert.ok(r.some((x) => motif.test(x)), `${qui} : ${r.join(' ; ')}`);
  }
});

test('T-R2c — nuitsDeLaPreuve : des instants ISO, tous différents, de dates (Paris) différentes, dans le passé ; triés', () => {
  const maintenant = Date.parse('2026-11-18T08:00:00.000Z');
  assert.deepEqual(R.nuitsDeLaPreuve(['2026-11-15T02:00:00.000Z', '2026-11-13T02:00:00Z', '2026-11-14T02:00:00.000Z'], { maintenant }), { ok: true, nuits: ['2026-11-13T02:00:00.000Z', '2026-11-14T02:00:00.000Z', '2026-11-15T02:00:00.000Z'], raisons: [] });
  for (const [qui, liste, motif] of [
    ['le même instant trois fois', ['2026-11-13T02:00:00.000Z', '2026-11-13T02:00:00.000Z', '2026-11-13T02:00:00.000Z'], /même instant/],
    ['deux instants du même jour à Paris', ['2026-11-13T00:30:00.000Z', '2026-11-13T21:00:00.000Z', '2026-11-15T02:00:00.000Z'], /même jour/],
    ['une nuit à venir', ['2026-11-13T02:00:00.000Z', '2026-11-19T02:00:00.000Z'], /futur/],
    ['deux nuits à deux minutes, de part et d’autre de minuit à Paris (m5)', ['2026-11-14T22:59:00.000Z', '2026-11-14T23:01:00.000Z', '2026-11-15T23:01:00.000Z'], /moins de 20 h/],
    ['deux nuits de dates différentes à 19 h d’écart (m5)', ['2026-11-13T21:00:00.000Z', '2026-11-14T16:00:00.000Z'], /moins de 20 h/],
    ['un instant illisible', ['2026-11-13', '2026-11-14T02:00:00.000Z'], /illisibles/],
    ['aucune nuit', [], /aucune nuit/]
  ]) {
    const n = R.nuitsDeLaPreuve(liste, { maintenant });
    assert.equal(n.ok, false, qui);
    assert.ok(n.raisons.some((r) => motif.test(r)), `${qui} : ${n.raisons.join(' ; ')}`);
  }
  assert.equal(R.nuitsDeLaPreuve(['2026-11-13T02:00:00.000Z']).ok, false, "sans l'heure du lancement : refusé");
});

test('T-R2d — comparerLesNuits : les rencontres DISTINCTES (une rencontre vue deux nuits compte une fois, l’identifiant du match d’abord), les lignes à part, les nulles à part, les cotes ; un écart de λ, μ, ρ, fair, une autre grille, des lectures, une ligne d’un seul côté (chaque sens), une liste vide, un « reporté » : chacun vu', () => {
  const ligne = (cle, plus = {}) => ({ cle, matchId: null, grille: 'ancien-81', engineVersion: 5, lambda: 1.31, mu: 1.02, rho: -0.08, fair: '{"home":0.45,"draw":0.27,"away":0.28}', avecCotes: true, typeCotes: 'payant', ...plus });
  const sansCote = { avecCotes: false, typeCotes: null };
  const cote = (lignes, plus = {}) => ({ mode: 'complet', lignes, lectures: null, ...plus });
  const nuit = (instant, la, lb = la, pa = {}, pb = {}) => ({ instant, a: cote(la, pa), b: cote(lb.map((l) => ({ ...l, engineVersion: 6 })), pb) });
  const identiqueDe = (c) => R.identiqueSelonLesNombres({ ...c, modulesDuDirectChanges: [] });
  // Deux nuits : A et B la première, B et C la seconde (B vue deux fois, sous deux clés : son identifiant la compte une fois).
  const base = [nuit('2026-11-13T02:00:00.000Z', [ligne('a'), ligne('b', { matchId: 77 })]), nuit('2026-11-14T02:00:00.000Z', [ligne('b2', { matchId: 77 }), ligne('c', sansCote)])];
  const c = R.comparerLesNuits(base);
  // (m6, O16) : moins de 30 rencontres dans une nuit, elle n'est pas complète.
  assert.deepEqual([c.nuits, c.rencontres, c.lignesComparees, c.nulles, c.cotes, c.seulementN, c.seulementNPrime, c.grille, c.differences, c.lectures], [0, 3, 4, 0, { lignes: 3, rencontres: 2, payantes: 2, gratuites: 0, nuits: 2 }, 0, 0, 'ancien-81', [], null]);
  // m6 : 30 rencontres dans la nuit → complète ; 29 → non.
  const trente = (k, plus = {}) => Array.from({ length: k }, (_, x) => ligne(`p${x}`, plus));
  assert.equal(R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', trente(30))]).nuits, 1);
  assert.equal(R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', trente(29))]).nuits, 0);
  // B1 (O16) : des lignes « sans cote » des deux côtés (le texte vrai du moteur, rendu par le calcul) : 0 rencontre cotée ;
  // une ligne cotée d'un seul côté ne compte pas ; payantes et gratuites seulement si les deux côtés le disent.
  const b1 = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', trente(30, { ...sansCote, oddsSource: 'aucune cote (modèle de buts)' }))]);
  assert.deepEqual([b1.rencontres, b1.cotes], [30, { lignes: 0, rencontres: 0, payantes: 0, gratuites: 0, nuits: 0 }]);
  const unCote = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a'), ligne('g', { typeCotes: 'gratuit' })], [ligne('a', sansCote), ligne('g', { typeCotes: 'gratuit' })])]);
  assert.deepEqual(unCote.cotes, { lignes: 1, rencontres: 1, payantes: 0, gratuites: 1, nuits: 1 });
  // m7 (O16) : l'identifiant 0 ou vide n'est pas un identifiant (la clé compte) ; on garde le plus petit des deux comptes.
  const zero = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('x', { matchId: 0 }), ligne('y', { matchId: '0' }), ligne('z', { matchId: '' })])]);
  assert.equal(zero.rencontres, 3, 'trois clés, aucun identifiant valable : trois rencontres');
  const memeId = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('x', { matchId: 5 }), ligne('y', { matchId: 5 })])]);
  assert.equal(memeId.rencontres, 1, 'deux clés, un même identifiant : une rencontre (le plus petit compte)');
  assert.deepEqual([R.identifiantDuMatch(0), R.identifiantDuMatch('0'), R.identifiantDuMatch(' '), R.identifiantDuMatch(null), R.identifiantDuMatch(4242)], [null, null, null, null, '4242']);
  assert.deepEqual(c.ecartMax, { lambda: 0, mu: 0, rho: 0, fair: 0 });
  assert.deepEqual(c.versions, { n: [5], nPrime: [6] });
  assert.equal(identiqueDe(c), true);
  // La même nuit donnée deux fois : les mêmes rencontres (2), deux fois plus de lignes.
  const deux = R.comparerLesNuits([base[0], { ...base[0], instant: '2026-11-15T02:00:00.000Z' }]);
  assert.deepEqual([deux.rencontres, deux.lignesComparees], [2, 4]);
  // Les nulles : comptées à part, jamais des rencontres.
  const nulle = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a'), ligne('z', { lambda: null })])]);
  assert.deepEqual([nulle.rencontres, nulle.nulles, nulle.lignesComparees, nulle.ecartMax.lambda], [1, 1, 2, 0]);
  // Chaque écart, seul, est vu et fait tomber « identique ».
  const decale = (plus) => R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a'), ligne('b')], [ligne('a'), ligne('b', plus)])]);
  for (const [champ, plus] of [['lambda', { lambda: 1.311 }], ['mu', { mu: 1.021 }], ['rho', { rho: -0.079 }], ['fair', { fair: '{"home":0.46,"draw":0.26,"away":0.28}' }]]) {
    const d = decale(plus);
    assert.ok(d.ecartMax[champ] > 1e-12, `${champ} : ${JSON.stringify(d.ecartMax)}`);
    assert.ok(d.differences.some((x) => x.champ === champ && x.cle === 'b'), `${champ} nommé : ${JSON.stringify(d.differences)}`);
    assert.equal(identiqueDe(d), false, champ);
  }
  const g = decale({ grille: 'modele-buts-441' });
  assert.deepEqual([g.grille, g.differences.some((x) => x.champ === 'grille'), identiqueDe(g)], [null, true, false]);
  const f = decale({ fair: null });
  assert.deepEqual([f.ecartMax.fair, identiqueDe(f)], [null, false], 'un fair d’un seul côté');
  // Une ligne d'un seul côté : chaque sens, la nuit n'est plus complète.
  const seuleN = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a'), ligne('b')], [ligne('a')])]);
  assert.deepEqual([seuleN.seulementN, seuleN.seulementNPrime, seuleN.nuits, identiqueDe(seuleN)], [1, 0, 0, false]);
  const seuleNP = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a')], [ligne('a'), ligne('b')])]);
  assert.deepEqual([seuleNP.seulementN, seuleNP.seulementNPrime, seuleNP.nuits, identiqueDe(seuleNP)], [0, 1, 0, false]);
  assert.ok(seuleNP.differences.some((x) => x.champ === 'seulement-N′' && x.cle === 'b'));
  // Une liste vide : rien de comparé, rien d'identique ; un « reporté » : nuit incomplète.
  const vide = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [])]);
  assert.deepEqual([vide.rencontres, vide.nuits, identiqueDe(vide)], [0, 0, false]);
  assert.equal(R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a')], [ligne('a')], { mode: 'reporte' })]).nuits, 0);
  // Les lectures : les états et créneaux viennent du calcul ; un écart sur une ligne est vu.
  const lectures = (v) => ({ etats: 4, creneaux: 4, parLigne: { a: [1, 0.5, v] } });
  const l1 = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a')], [ligne('a')], { lectures: lectures(0.25) }, { lectures: lectures(0.25) })], { avecLectures: true });
  assert.deepEqual(l1.lectures, { etats: 4, creneaux: 4, lignes: 1, ecartMax: 0 });
  const l2 = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a')], [ligne('a')], { lectures: lectures(0.25) }, { lectures: lectures(0.2501) })], { avecLectures: true });
  assert.ok(l2.lectures.ecartMax > 1e-12 && l2.differences.some((x) => x.champ === 'lectures'), JSON.stringify(l2));
  const l3 = R.comparerLesNuits([nuit('2026-11-13T02:00:00.000Z', [ligne('a')], [ligne('a')], { lectures: { ...lectures(0.25), etats: 3 } }, { lectures: lectures(0.25) })], { avecLectures: true });
  assert.deepEqual([l3.lectures.etats, l3.lectures.creneaux], [null, null], 'deux formes d’étalonnage : aucune n’est dite');
});

// ------------------------------------------------------------ T-R3

test('T-R3 — reconductionPour (l’écran) : l’inscription unique de la version de la ligne, partie de la version de la note, de la même grille, contrôlée avec le sceau, le registre en service et le sha1 de sa preuve (chacun exigé) ; numéros de version stricts ; null sinon ; le résumé de l’écran', () => {
  const i = bonne();
  const liste = [i];
  const o = optionsCompletes();
  assert.equal(R.reconductionPour({ grille: 'ancien-81', de: 5, vers: 6 }, liste, o), i);
  assert.equal(R.reconductionPour({ grille: 'ancien-81', de: '5', vers: '6' }, liste, o), i, 'des chiffres seuls en texte : lus comme des nombres');
  for (const v of ['0x6', ' 6 ', '6.0', [6], '6e0', 6.5, '06', true]) assert.equal(R.reconductionPour({ grille: 'ancien-81', de: 5, vers: v }, liste, o), null, `version ${JSON.stringify(v)} : refusée`);
  for (const sans of ['scellement', 'identiteDe', 'sha1']) assert.equal(R.reconductionPour({ grille: 'ancien-81', de: 5, vers: 6 }, liste, { ...o, [sans]: null }), null, `sans ${sans} : l'écran reste strict`);
  for (const [qui, q, l] of [
    ['autre grille', { grille: 'modele-buts-441', de: 5, vers: 6 }, liste],
    ['autre départ', { grille: 'ancien-81', de: 4, vers: 6 }, liste],
    ['autre version', { grille: 'ancien-81', de: 5, vers: 7 }, liste],
    ['même version', { grille: 'ancien-81', de: 5, vers: 5 }, liste],
    ['version absente', { grille: 'ancien-81', de: 5, vers: null }, liste],
    ['doublon', { grille: 'ancien-81', de: 5, vers: 6 }, [i, bonne({ le: '2026-11-18' })]],
    ['inscription sous les seuils', { grille: 'ancien-81', de: 5, vers: 6 }, [avecPreuve({ nuits: 2 })]],
    ['liste vide', { grille: 'ancien-81', de: 5, vers: 6 }, []],
    ['liste nulle', { grille: 'ancien-81', de: 5, vers: 6 }, null]
  ]) assert.equal(R.reconductionPour(q, l, o), null, qui);
  const autre = R.identitesDuRegistre(registreFabrique({ 5: IDENTITE_5, 6: { ...IDENTITE_6, reglages: 'c'.repeat(40) } }));
  assert.equal(R.reconductionPour({ grille: 'ancien-81', de: 5, vers: 6 }, liste, { ...o, identiteDe: (n) => autre[n] ?? null }), null, 'le 6 en service a d’autres réglages : strict');
  assert.equal(R.reconductionPour({ grille: 'ancien-81', de: 5, vers: 6 }, liste, { ...o, aujourdhui: '2026-11-18' }), null, 'inscrite après aujourd’hui : stricte');
  const resume = R.resumeDeLaReconduction(i);
  assert.deepEqual(resume, { de: 5, vers: 6, le: '2026-11-19', nuits: 3, rencontres: 312 });
  assert.ok(Object.isFrozen(resume));
  assert.equal(R.resumeDeLaReconduction(null), null);
  assert.deepEqual([R.numeroStrict(6), R.numeroStrict('12'), R.numeroStrict('0x6'), R.numeroStrict(0), R.numeroStrict('-1')], [6, 12, null, null, null]);
});

// ------------------------------------------------------------ T-R4

test('T-R4 — l’écran : « Le moteur est passé de la version 5 à la version 6… » (rencontres distinctes, nuits, jour de l’inscription) quand les chiffres d’une version reconduite sont montrés ; rien sans reconduction, ni à blanc', async () => {
  const { reconduiteDite, notesDeLEtat } = await import(pathToFileURL(UI_DIRECT).href);
  const r = { de: 5, vers: 6, le: '2026-11-21', nuits: 3, rencontres: 1234 };
  const n = (1234).toLocaleString('fr-FR');
  assert.equal(reconduiteDite({ applique: true, reconduite: r }), `Le moteur est passé de la version 5 à la version 6. Le banc d'essai a jugé la version 5 ; son jugement est gardé, car les pronostics d'avant-match n'ont pas bougé sur les ${n} matchs comparés (3 nuits ; inscrit le 21/11/2026).`);
  for (const x of [null, {}, { applique: false, reconduite: r }, { applique: true, reconduite: null }, { applique: true, reconduite: { ...r, vers: 'six' } }]) assert.equal(reconduiteDite(x), null, JSON.stringify(x));
  const entree = (calcul) => ({ etat: { phase: 'jeu', score: { connu: true, home: 1, away: 0 } }, calcul });
  const cles = (e) => notesDeLEtat(e).map((x) => x.cle);
  const montree = notesDeLEtat(entree({ fait: true, aBlanc: false, note: { applique: true, reconduite: r } }));
  const note = montree.find((x) => x.cle === 'reconduite');
  assert.ok(note, JSON.stringify(montree));
  assert.equal(note.ton, 'muted');
  assert.equal(note.texte, reconduiteDite({ applique: true, reconduite: r }));
  assert.ok(!cles(entree({ fait: true, aBlanc: false, note: { applique: true, reconduite: null } })).includes('reconduite'), 'sans reconduction : rien');
  assert.ok(!cles(entree({ fait: true, aBlanc: true, note: { applique: true, verdict: 'faits-seuls', reconduite: r } })).includes('reconduite'), 'à blanc : rien');
  assert.ok(!cles(entree({ fait: false, aBlanc: false, enAttente: true, note: { applique: true, reconduite: r } })).includes('reconduite'), 'en attente : rien encore');
});

// ------------------------------------------------------------ T-R5

/** Une copie dans un faux bac, avec les deux scripts, une note du banc (version 5) et un registre des versions fabriqué. */
function copieAvecLeScript() {
  const copie = preparerCopieDeBac({ base: false });
  nettoyages.push(() => copie.nettoyer());
  // m11 (O16) : la cible est EXACTEMENT <bac>/code/server/… : le code de la copie est posé là, dans le faux bac.
  const racineBac = path.join(copie.maison, 'CoteMaster', 'bac-a-sable');
  const serveurBac = path.join(racineBac, 'code', 'server');
  fs.cpSync(copie.serveur, serveurBac, { recursive: true });
  const scripts = path.join(serveurBac, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  for (const f of ['reconduction46.mjs', 'reconduction46-calcul.mjs']) fs.copyFileSync(path.join(SERVEUR, 'scripts', f), path.join(scripts, f));
  const direct = path.join(serveurBac, 'src', 'data', 'direct');
  const fichierNote = path.join(direct, 'noteDuDirect.js');
  const t = fs.readFileSync(fichierNote, 'utf8');
  // MS1 de la 46 (21/11/2026) : la note du banc est NULLE avant la nuit du 19/11, RENDUE depuis (version 5, regard de sûreté) ;
  // sa ligne, une seule fois, est remplacée par la note d'essai (jugée « prouve »), quelle qu'elle soit.
  assert.equal((t.match(/^export const NOTE_DU_DIRECT = .*;$/gm) ?? []).length, 1, 'la ligne de la note du banc, une fois');
  fs.writeFileSync(fichierNote, t.replace(/^export const NOTE_DU_DIRECT = .*;$/m, "export const NOTE_DU_DIRECT = gele({ format: 1, modele: 'ancien-81', version: 5, role: 'service', candidateHash: null, variante: 'temps-restant-ancre', verdict: 'prouve' });"));
  // N′ = ce code (la piste) ; N = une autre identité. Le registre « en service » donne 5 et 6 à ces identités.
  const nPrime = { code: empreinteDuCode({ racine: path.join(SERVEUR, 'src'), rafraichir: true }).empreinte, reglages: IDENTITE_6.reglages };
  const n = { code: 'a1'.repeat(20), reglages: IDENTITE_5.reglages };
  const registre = path.join(racineBac, 'registre-en-service.json');
  fs.writeFileSync(registre, JSON.stringify(registreFabrique({ 5: n, 6: nPrime })));
  return { copie, serveurBac, script: path.join(scripts, 'reconduction46.mjs'), fichier: path.join(direct, 'reconductionDuDirect.js'), fichierNote, racineBac, registre, n, nPrime };
}
/** La preuve d'essai, comme l'écrirait le script : au format 3, faite par CE script (sha1 du script, du calcul, et de reconductionDuDirect.js à RECONDUCTIONS vide). */
function preuvePour(c, plus = {}) {
  return preuveFabriquee({ n: c.n, nPrime: c.nPrime, script: { preuve: sha1Fichier(SCRIPT), calcul: sha1Fichier(CALCUL), reconduction: sha1(R.texteAReconductionsVides(fs.readFileSync(FICHIER, 'utf8'))) }, ...plus });
}
/** La phrase d'historique qui cite le sha1 de la base et celui des données de la preuve fabriquée (O16, I2). */
const HISTORIQUE = `entrée 46 (essai) — base ${'7'.repeat(12)}, données ${'6'.repeat(12)}`;
function poserPreuve(c, nom, objet, texte = R.texteDeLaPreuve(objet)) {
  const f = path.join(c.racineBac, 'reconductions', nom);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, texte);
  return { f, sha1: sha1(texte) };
}
const lancer = (c, args) => {
  const r = executerDansLeBac(c.copie, c.script, { args, timeout: 120_000 });
  assert.equal(r.reseau, false, 'aucun appel réseau');
  return r;
};
const inscrire = (c, p, plus = [], { fichier = c.fichier, registre = c.registre, jugee = '5', base = '7'.repeat(40), historique = HISTORIQUE } = {}) => lancer(c, ['--inscrire', ...(fichier ? ['--fichier', fichier] : []), '--preuve', p.f, '--sha1', p.sha1, ...(base ? ['--base-attendue', base] : []), ...(registre ? ['--registre', registre] : []), '--version-jugee', jugee, '--historique', historique, ...plus]);

test('T-R5 — le script --inscrire / --verifier (faux bac) : cible explicite dans le bac ; la preuve relue à son sha1, au texte exact du script, faite par ce script ; N′ = le code où l’on inscrit ; registre et note exigés ; l’inscription AJOUTÉE entre les balises (ajout pur), relue ; chaque refus nommé, le fichier intact ; --verifier relit les modules sur le disque et la preuve gardée', async () => {
  const c = copieAvecLeScript();
  const avant = fs.readFileSync(c.fichier, 'utf8');
  const p = poserPreuve(c, 'preuve-5-6.json', preuvePour(c));
  // Refus d'abord (le fichier ne bouge pas).
  const refuse = (rr, motif, qui, attendu = avant) => {
    assert.equal(rr.code, 1, `${qui} : ${rr.sortie.slice(-400)} ${rr.erreurs.slice(-400)}`);
    assert.deepEqual([rr.json?.ok, rr.json?.refus], [false, true], `${qui} : ${rr.sortie.slice(-300)}`);
    assert.match(rr.json.raison, motif, qui);
    assert.equal(fs.readFileSync(c.fichier, 'utf8'), attendu, `${qui} : le fichier intact`);
  };
  refuse(inscrire(c, p, [], { fichier: null }), /--fichier : la cible explicite/, 'sans cible explicite');
  const horsBac = path.join(path.dirname(c.copie.maison), `hors-bac-${path.basename(c.copie.maison)}`, 'server', 'src', 'data', 'direct', 'reconductionDuDirect.js');
  fs.mkdirSync(path.dirname(horsBac), { recursive: true });
  fs.copyFileSync(c.fichier, horsBac);
  nettoyages.push(() => nettoyer(path.resolve(horsBac, '..', '..', '..', '..', '..')));
  refuse(inscrire(c, p, [], { fichier: horsBac }), /hors du bac à sable/, 'cible hors du bac');
  assert.equal(fs.readFileSync(horsBac, 'utf8'), avant, 'la cible hors du bac : intacte');
  refuse(inscrire(c, p, [], { registre: null }), /--registre/, 'sans registre en service');
  const registreAutre = path.join(c.racineBac, 'registre-autre.json');
  fs.writeFileSync(registreAutre, JSON.stringify(registreFabrique({ 5: c.n, 6: { ...c.nPrime, reglages: 'c'.repeat(40) } })));
  refuse(inscrire(c, p, [], { registre: registreAutre }), /registre en service : la version 6 n'a pas les empreintes inscrites/, 'le 6 en service a d’autres réglages');
  const t = R.texteDeLaPreuve(preuvePour(c));
  refuse(inscrire(c, poserPreuve(c, 'retouchee.json', null, t.replace('"rencontres": 312', '"rencontres":  312'))), /texte exact écrit par le script/, 'preuve retouchée à la main (même nombres, autre texte)');
  refuse(inscrire(c, poserPreuve(c, 'autre-script.json', preuvePour(c, { script: { preuve: 'd'.repeat(40), calcul: 'e'.repeat(40), reconduction: preuvePour(c).script.reconduction } }))), /pas été faite par ce script/, 'preuve d’un autre script (ou écrite à la main)');
  refuse(inscrire(c, poserPreuve(c, 'autre-np.json', preuveFabriquee({ n: c.n, nPrime: { ...c.nPrime, code: 'b2'.repeat(20) }, script: preuvePour(c).script }))), /n'est pas N′ de la preuve/, 'N′ n’est pas le code où l’on inscrit');
  refuse(inscrire(c, poserPreuve(c, 'non-identique.json', preuvePour(c, { identique: false, ecartMax: { lambda: 0.002, mu: 0, rho: 0, fair: 0 }, differences: [{ nuit: 'x', cle: 'k', champ: 'lambda', ecart: 0.002 }] }))), /n'est jamais reconduite/, 'non identique');
  refuse(inscrire(c, poserPreuve(c, 'sans-versions.json', preuvePour(c, { de: null, versionsLues: false, registre: { sha1: '8'.repeat(40), de: null, vers: { ...c.nPrime } } }))), /versions lues/, 'sans versions lues');
  refuse(inscrire(c, poserPreuve(c, '299.json', preuvePour(c, { rencontres: 299 }))), /au moins 300 rencontres distinctes/, '299 rencontres');
  refuse(inscrire(c, poserPreuve(c, 'cle.json', { ...preuvePour(c), score: '2-1' })), /liste fermée/, 'une clé hors liste');
  refuse(inscrire(c, { ...poserPreuve(c, 'sha1.json', preuvePour(c)), sha1: 'f'.repeat(40) }), /preuve : sha1 [0-9a-f]{40} ≠ f{40}/, 'un autre sha1 (relu à la lecture, avant tout contrôle)');
  refuse(inscrire(c, p, [], { jugee: '4' }), /la note du banc juge la version 5, pas 4/, 'une autre version jugée');
  // O16 : la cible exacte (m11), la base attendue et la phrase qui cite les sha1 (I2), reconductionDuDirect.js de la preuve (m8).
  const dansLesEssais = path.join(c.copie.serveur, 'src', 'data', 'direct', 'reconductionDuDirect.js');
  refuse(inscrire(c, p, [], { fichier: dansLesEssais }), /--fichier : exactement/, 'une cible dans le bac, mais pas <bac>/code/server (m11)');
  assert.equal(fs.readFileSync(dansLesEssais, 'utf8'), avant, 'la cible des essais : intacte');
  refuse(inscrire(c, p, [], { base: null }), /--base-attendue/, 'sans base attendue (I2)');
  refuse(inscrire(c, p, [], { base: 'a'.repeat(40) }), /pas sur la base attendue/, 'une autre base (I2)');
  refuse(inscrire(c, p, [], { historique: 'entrée 46 (essai) sans les sha1' }), /citer le sha1 de la base/, 'la phrase ne cite pas la base (I2)');
  refuse(inscrire(c, p, [], { historique: `entrée 46 — base ${'7'.repeat(12)}` }), /citer le sha1 des données/, 'la phrase ne cite pas les données (I2)');
  refuse(inscrire(c, poserPreuve(c, 'autre-r.json', preuvePour(c, { script: { ...preuvePour(c).script, reconduction: 'c'.repeat(40) } }))), /pas été faite avec ce reconductionDuDirect.js/, 'reconductionDuDirect.js d’une autre forme (m8)');
  refuse(inscrire(c, poserPreuve(c, 'essai.json', preuvePour(c, { base: { sha1: R.BASES_D_ESSAI[0], octets: 3060670464 } })), [], { base: R.BASES_D_ESSAI[0] }), /base d'essai/, 'une preuve faite sur la base d’essai (I2)');
  // Sans note posée : refusé.
  const texteNote = fs.readFileSync(c.fichierNote, 'utf8');
  fs.writeFileSync(c.fichierNote, texteNote.replace(/export const NOTE_DU_DIRECT = gele\(\{.*\}\);/, 'export const NOTE_DU_DIRECT = null;'));
  refuse(inscrire(c, p), /aucune note du banc posée/, 'sans note');
  fs.writeFileSync(c.fichierNote, texteNote);
  // Un module du direct changé sur le disque du code où l'on inscrit : refusé.
  const calculDuDirect = path.join(c.serveurBac, 'src', 'data', 'direct', 'calculDuDirect.js');
  const texteCalcul = fs.readFileSync(calculDuDirect);
  fs.appendFileSync(calculDuDirect, '\n');
  refuse(inscrire(c, p), /modules du direct différents de la preuve sur le disque/, 'un module changé sur le disque');
  fs.writeFileSync(calculDuDirect, texteCalcul);
  // La bonne.
  const r = inscrire(c, p, ['--entree-en-service', '2026-10-04']);
  assert.equal(r.code, 0, `${r.sortie.slice(-600)} ${r.erreurs.slice(-600)}`);
  assert.equal(r.json.ok, true, r.sortie.slice(-600));
  const apres = fs.readFileSync(c.fichier, 'utf8');
  const M = await import(`${pathToFileURL(c.fichier).href}?t=${Date.now()}`);
  assert.equal(M.RECONDUCTIONS.length, 1);
  const ligne = `  geler(${JSON.stringify(M.RECONDUCTIONS[0])}),\n`;
  assert.equal(apres.replace(ligne, ''), avant, 'ajout pur : une ligne, rien d’autre');
  assert.ok(apres.indexOf(ligne) > apres.indexOf('export const RECONDUCTIONS = Object.freeze([') && apres.indexOf(ligne) < apres.indexOf('// </RECONDUCTIONS>'), 'entre les balises');
  assert.deepEqual([r.json.sha1Avant, r.json.sha1Apres], [sha1(avant), sha1(apres)]);
  assert.ok(!fs.readdirSync(path.dirname(c.fichier)).some((f) => f.endsWith('.tmp')), 'aucun fichier temporaire laissé');
  const i = M.RECONDUCTIONS[0];
  assert.deepEqual([i.preuve.fichier, i.preuve.sha1, i.preuve.contenu], ['reconductions/preuve-5-6.json', p.sha1, JSON.parse(fs.readFileSync(p.f, 'utf8'))], 'la preuve entière, son chemin relatif au bac et son sha1');
  assert.deepEqual([i.de, i.vers, i.le, i.entreeEnService, i.nuits, i.rencontres, i.lignesComparees], [5, 6, '2026-10-05', '2026-10-04', 3, 312, 410]);
  assert.deepEqual(i.empreintes, { de: c.n, vers: c.nPrime });
  assert.equal(r.json.sha1Texte, sha1(JSON.stringify(i)), 'le sha1 du texte JSON de l’inscription (celui que fige le second sceau)');
  const ids = R.identitesDuRegistre(JSON.parse(fs.readFileSync(c.registre, 'utf8')));
  assert.equal(M.reconductionPour({ grille: 'ancien-81', de: 5, vers: 6 }, M.RECONDUCTIONS, { scellement: SCELLEMENT, identiteDe: (k) => ids[k] ?? null, sha1 }), i);
  const v = lancer(c, ['--verifier', '--registre', c.registre]);
  assert.deepEqual([v.code, v.json.ok, v.json.inscriptions.length, v.json.inscriptions[0].preuveSurLeDisque], [0, true, 1, 'la-meme'], v.sortie.slice(-600));
  refuse(inscrire(c, p), /plusieurs inscriptions pour la version 6/, 'la même version deux fois', apres);
  // --verifier : un registre qui ne redit pas les identités, un module changé sur le disque, la preuve gardée retouchée.
  assert.equal(lancer(c, ['--verifier', '--registre', registreAutre]).json.ok, false, 'registre autre');
  assert.match(lancer(c, ['--verifier']).json.raison, /--registre/, '--verifier exige le registre');
  fs.appendFileSync(calculDuDirect, '\n');
  const v2 = lancer(c, ['--verifier', '--registre', c.registre]);
  assert.ok(!v2.json.ok && v2.json.inscriptions[0].raisons.some((x) => /calculDuDirect\.js : sur le disque/.test(x)), JSON.stringify(v2.json));
  fs.writeFileSync(calculDuDirect, texteCalcul);
  fs.appendFileSync(p.f, ' ');
  const v3 = lancer(c, ['--verifier', '--registre', c.registre]);
  assert.ok(!v3.json.ok && v3.json.inscriptions[0].preuveSurLeDisque === 'differente', JSON.stringify(v3.json));
  // O16 (e) : --extraire-reglages tire les réglages d'une version du REGISTRE (champ reglages, tel quel), dans le bac.
  const brut = JSON.parse(fs.readFileSync(c.registre, 'utf8'));
  brut.versions.find((v) => v.numero === 6).reglages = { football: { valueBookmakers: ['a', 'b'], maxValueOdds: 4.5 } };
  fs.writeFileSync(c.registre, JSON.stringify(brut));
  const sortieReglages = path.join(c.racineBac, 'reglages', 'reglages-6.json');
  const e = lancer(c, ['--extraire-reglages', '--registre', c.registre, '--version', '6', '--sortie', sortieReglages]);
  assert.deepEqual([e.code, e.json.ok, e.json.version], [0, true, 6], e.sortie.slice(-400));
  assert.deepEqual(JSON.parse(fs.readFileSync(sortieReglages, 'utf8')), { football: { valueBookmakers: ['a', 'b'], maxValueOdds: 4.5 } });
  assert.deepEqual(e.json.attendu, c.nPrime, 'l’identité que le registre donne au 6 (à relire avant les nuits)');
  for (const [qui, plus, motif] of [
    ['jamais réécrit', ['--version', '6', '--sortie', sortieReglages], /jamais réécrit/],
    ['jamais nommé engine-config.json', ['--version', '6', '--sortie', path.join(c.racineBac, 'reglages', 'engine-config.json')], /engine-config\.json/],
    ['jamais dans une piste', ['--version', '6', '--sortie', path.join(c.racineBac, 'pistes', 'p', 'r.json')], /hors des pistes/],
    ['une version absente', ['--version', '7', '--sortie', path.join(c.racineBac, 'reglages', 'r7.json')], /0 entrée/]
  ]) {
    const x = lancer(c, ['--extraire-reglages', '--registre', c.registre, ...plus]);
    assert.deepEqual([x.code, x.json?.ok], [1, false], qui);
    assert.match(x.json.raison, motif, `${qui} : ${x.json.raison}`);
  }
});

// ------------------------------------------------------------ T-R6

/**
 * Le relevé de cotes fabriqué (format The Odds API) : quatre rencontres COTÉES entre clubs EPL de la base d'essai, le 5/10, et
 * (O16, B1) une cinquième, du CALENDRIER (Championship, le 6/10, sans cote) : sa ligne porte le vrai texte « aucune cote
 * (modèle de buts) » du moteur et ne doit pas compter parmi les rencontres cotées ; et (I1) une sixième entre deux clubs inconnus de
 * la base : elle reste SANS LIGNE des deux côtés, et la preuve la nomme.
 */
function donneesFabriquees(dossier) {
  const regard = path.join(dossier, 'regard.db');
  fs.copyFileSync(ECHANTILLON, regard);
  const db = new DatabaseSync(regard, { readOnly: true });
  const noms = db.prepare("SELECT DISTINCT home_name n FROM matches WHERE league = 'EPL' AND home_id IS NOT NULL ORDER BY home_name LIMIT 8").all().map((x) => x.n);
  const champ = db.prepare("SELECT DISTINCT home_name n FROM matches WHERE league = 'Championship' AND home_id IS NOT NULL ORDER BY home_name LIMIT 2").all().map((x) => x.n);
  db.close();
  const h2h = (h, a, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: h, price: o1 }, { name: a, price: o2 }, { name: 'Draw', price: ox }] });
  const data = [0, 1, 2, 3].map((k) => ({ id: `essai-${k}`, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: `2026-10-05T1${4 + k}:00:00Z`, home_team: noms[2 * k], away_team: noms[2 * k + 1], bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', last_update: '2026-10-04T20:00:00Z', markets: [h2h(noms[2 * k], noms[2 * k + 1], [2.0 + k / 5, 3.4, 3.6 - k / 5])] }] }));
  const f = path.join(dossier, 'donnees', 'fixtures', 'odds', 'odds-snapshot.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify([{ data }]));
  const cal = path.join(dossier, 'donnees', 'runtime', 'season-calendar.json');
  fs.mkdirSync(path.dirname(cal), { recursive: true });
  fs.writeFileSync(cal, JSON.stringify([{ matchId: 'cal-2026-10-06-essai', homeName: champ[0], awayName: champ[1], date: '2026-10-06', league: 'Championship', status: 'scheduled' }, { matchId: 'cal-2026-10-06-inconnu', homeName: 'Club Inconnu de l’Essai A', awayName: 'Club Inconnu de l’Essai B', date: '2026-10-06', league: 'Championship', status: 'scheduled' }]));
  return path.join(dossier, 'donnees');
}
/** Des réglages FABRIQUÉS (jamais ceux de Pierre) et le registre qui donne la version 5 à ce code avec ces réglages. */
function reglagesEtRegistre(dossier) {
  const fichier = path.join(dossier, 'reglages-essai.json');
  fs.writeFileSync(fichier, JSON.stringify({ football: { maxValueOdds: 4.5 } }));
  const d = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
  const effectifs = { ...d, maxValueOdds: 4.5, weights: { ...d.weights } };
  const identite = { code: empreinteDuCode({ racine: path.join(SERVEUR, 'src'), rafraichir: true }).empreinte, reglages: empreinteDesReglages(effectifs) };
  const registre = path.join(dossier, 'registre-essai.json');
  fs.writeFileSync(registre, JSON.stringify(registreFabrique({ 5: identite, 6: { ...identite, reglages: 'c'.repeat(40) } })));
  return { fichier, registre, identite };
}
const environnement = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !bac.SECRETS.includes(k) && !bac.MOTIF_SECRET.test(k) && !/^(CM_|MATCH_STATS_DB$|DOTENV_|NODE_TEST|NODE_OPTIONS)/.test(k)));
/** Le FAUX bac de l'essai (O16, M3 et m11) : le dossier personnel du script ; --travail et --sortie y vont, jamais dans la piste ni le vrai bac. */
function bacDeLEssai(dossier) {
  const maison = path.join(dossier, 'maison');
  const racine = path.join(maison, 'CoteMaster', 'bac-a-sable');
  fs.mkdirSync(path.join(racine, 'preuves'), { recursive: true });
  return { maison, racine };
}
function lancerPreuve(dossier, { codeN = SERVEUR, codeNP = SERVEUR, nom, nuits = '2026-10-05T01:00:00.000Z', base = path.join(dossier, 'base.db'), sans = [], plus = [], versions = ['5', '5'], reglages = path.join(dossier, 'reglages-essai.json'), travail = null, sortie = null } = {}) {
  const { maison, racine } = bacDeLEssai(dossier);
  const valeurs = { '--code-n': codeN, '--code-np': codeNP, '--base': base, '--nuits': nuits, '--sortie': sortie ?? path.join(racine, 'preuves', nom), '--donnees': path.join(dossier, 'donnees'), '--reglages-n': reglages, '--reglages-np': reglages, '--registre': path.join(dossier, 'registre-essai.json'), '--version-n': versions[0], '--version-np': versions[1], '--travail': travail ?? path.join(racine, 'travail') };
  const args = Object.entries(valeurs).filter(([k]) => !sans.includes(k)).flat();
  const r = spawnSync(process.execPath, [SCRIPT, '--preuve', ...args, ...plus], { env: { ...environnement(), USERPROFILE: maison, HOME: maison }, encoding: 'utf8', timeout: 300_000 });
  const json = JSON.parse(String(r.stdout).trim().split(/\r?\n/).at(-1));
  return { code: r.status, json, erreurs: r.stderr, racine };
}

test('T-R6 — le script --preuve : nuits (distinctes, de dates différentes, à 20 h au moins, passées), réglages, registre, versions attendues, données (liste blanche), --travail et --sortie dans le bac exigés ; identités contrôlées AVANT les nuits ; le même code des deux côtés → identique, identités lues, numéros du registre, rencontres cotées des deux côtés (B1 : une ligne « sans cote » n’en est pas), matchs sans ligne nommés, sha1 de la base PAR MORCEAUX (B2), dossier de travail vide ; un λ décalé de 0,001 dans entreesSimulation.js (module scellé) → pas identique, l’écart et le module nommés, les lectures comparées, jamais inscriptible (I5) ; N hors du sceau refusé ; la sortie jamais réécrite ; la vraie base et un lien physique refusés', () => {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-reconduction-'));
  nettoyages.push(() => nettoyer(dossier));
  fs.copyFileSync(ECHANTILLON, path.join(dossier, 'base.db'));
  donneesFabriquees(dossier);
  const { identite } = reglagesEtRegistre(dossier);
  const { racine } = bacDeLEssai(dossier);
  // Des fichiers pour les refus : un engine-config.json, des données hors liste blanche, une copie de travail restée.
  const nomme = path.join(dossier, 'nomme', 'engine-config.json');
  fs.mkdirSync(path.dirname(nomme), { recursive: true });
  fs.copyFileSync(path.join(dossier, 'reglages-essai.json'), nomme);
  const travailSale = path.join(racine, 'travail-sale');
  fs.mkdirSync(path.join(travailSale, 'cm-tests-reste'), { recursive: true });
  // Refus AVANT tout calcul.
  for (const [qui, options, motif] of [
    ['le même instant deux fois', { nuits: '2026-10-03T01:00:00.000Z,2026-10-03T01:00:00.000Z' }, /même instant/],
    ['deux nuits du même jour', { nuits: '2026-10-05T01:00:00.000Z,2026-10-05T19:00:00.000Z' }, /même jour/],
    ['deux nuits à deux minutes, de part et d’autre de minuit à Paris (m5)', { nuits: '2026-10-03T21:59:00.000Z,2026-10-03T22:01:00.000Z' }, /moins de 20 h/],
    ['une nuit à venir', { nuits: '2099-10-05T01:00:00.000Z' }, /futur/],
    ['sans réglages de N', { sans: ['--reglages-n'] }, /--reglages-n/],
    ['sans réglages de N′', { sans: ['--reglages-np'] }, /--reglages-np/],
    ['sans registre', { sans: ['--registre'] }, /--registre/],
    ['sans données', { sans: ['--donnees'] }, /--donnees/],
    ['sans --travail (M3)', { sans: ['--travail'] }, /--travail : .*obligatoire/],
    ['une copie de travail restée (M3)', { travail: travailSale }, /copies de travail d'avant sont restées/],
    ['--travail dans une piste (M3)', { travail: path.join(racine, 'pistes', 'p', 'travail') }, /hors des pistes/],
    ['réglages nommés engine-config.json (I3)', { reglages: nomme }, /jamais un fichier nommé engine-config\.json/],
    ['sans les versions attendues (I3)', { sans: ['--version-np'] }, /--version-n et --version-np/],
    ['une version absente du registre (I3)', { versions: ['5', '9'] }, /--version-np 9 : le registre donné n'a pas d'identité/],
    ['--sortie hors du bac (m11)', { sortie: path.join(dossier, 'hors-bac.json') }, /--sortie : un fichier du bac/]
  ]) {
    const r = lancerPreuve(dossier, { nom: `refus-${qui.replace(/\W+/g, '-')}.json`, ...options });
    assert.deepEqual([r.code, r.json.ok, r.json.refus], [1, false, true], `${qui} : ${JSON.stringify(r.json)}`);
    assert.match(r.json.raison, motif, `${qui} : ${r.json.raison}`);
  }
  // m10 : des données hors de la liste blanche (des paris) : refusées.
  const pari = path.join(dossier, 'donnees', 'runtime', 'bets.json');
  fs.mkdirSync(path.dirname(pari), { recursive: true });
  fs.writeFileSync(pari, '[]');
  const m10 = lancerPreuve(dossier, { nom: 'refus-m10.json' });
  assert.deepEqual([m10.code, m10.json.ok], [1, false]);
  assert.match(m10.json.raison, /runtime\/bets\.json n'est pas dans la liste blanche/);
  fs.rmSync(pari);
  // I3 : l'identité relue AVANT les nuits n'est pas celle que le registre donne à la version attendue (le 6 a d'autres réglages).
  const i3 = lancerPreuve(dossier, { nom: 'refus-i3.json', versions: ['5', '6'] });
  assert.deepEqual([i3.code, i3.json.ok], [1, false], JSON.stringify(i3.json));
  assert.match(i3.json.raison, /identité de N′ \(avant les nuits\)/);
  assert.ok(!fs.existsSync(path.join(racine, 'preuves', 'refus-i3.json')), 'rien écrit');
  // Le même code des deux côtés, le sha1 de la base lu par morceaux de 4 096 octets (B2).
  const a = lancerPreuve(dossier, { nom: 'identique.json', plus: ['--morceau', '4096'] });
  assert.equal(a.code, 0, `${JSON.stringify(a.json)} ${a.erreurs.slice(-600)}`);
  const taille = fs.statSync(path.join(dossier, 'base.db')).size;
  assert.deepEqual(a.json.base, { sha1: sha1Fichier(path.join(dossier, 'base.db')), octets: taille }, 'le sha1 par morceaux = celui d’une lecture d’un bloc');
  assert.ok(a.json.morceauxLus >= 3 * Math.ceil(taille / 4096), `la base et ses deux copies lues par morceaux : ${a.json.morceauxLus}`);
  assert.equal(a.json.travail, 'dossier vide', 'M3 : aucune copie de travail laissée');
  assert.deepEqual([a.json.identique, a.json.rencontres, a.json.lignesComparees, a.json.nulles, a.json.seulementN, a.json.seulementNPrime, a.json.modulesDuDirectChanges, a.json.lectures], [true, 5, 5, 0, 0, 0, [], null]);
  assert.equal(a.json.nuits, 0, 'm6 : 5 rencontres, moins de 30 : la nuit n’est pas complète');
  // B1 : les quatre rencontres cotées le sont des deux côtés (payantes) ; la cinquième, « aucune cote (modèle de buts) », non.
  assert.deepEqual(a.json.cotes, { lignes: 4, rencontres: 4, payantes: 4, gratuites: 0, nuits: 1 });
  assert.deepEqual(a.json.echecs, { n: 1, nPrime: 1, memes: true }, 'I1 : le match sans ligne, le même des deux côtés');
  assert.deepEqual(a.json.ecartMax, { lambda: 0, mu: 0, rho: 0, fair: 0 });
  assert.deepEqual(a.json.identites, { n: identite, nPrime: identite }, 'les identités lues par le code : code et réglages fabriqués');
  assert.deepEqual(a.json.identitesAvantLesNuits, { n: identite, nPrime: identite }, 'I3 : relues avant les nuits');
  assert.deepEqual([a.json.de, a.json.vers, a.json.versionsLues, a.json.inscriptible], [5, 5, true, false], 'les numéros du registre ; même identité : rien à inscrire');
  for (const motif of [/doit venir après/, /au moins 3 nuits/, /au moins 100 rencontres cotées/, /base d'essai/, /octets/]) assert.ok(a.json.pourquoiPas.some((x) => motif.test(x)), `${motif} : ${JSON.stringify(a.json.pourquoiPas)}`);
  const texte = fs.readFileSync(path.join(racine, 'preuves', 'identique.json'), 'utf8');
  assert.equal(sha1(texte), a.json.sha1);
  const p = JSON.parse(texte);
  assert.deepEqual(Object.keys(p), [...R.CLES_DE_LA_PREUVE], 'la liste fermée, dans son ordre');
  assert.equal(texte, R.texteDeLaPreuve(p), 'le texte exact du script');
  assert.deepEqual(R.controlerUnePreuve(p), { ok: true, raisons: [] });
  assert.deepEqual([p.script.preuve, p.script.calcul, p.script.reconduction, p.reglages.n.fichier], [sha1Fichier(SCRIPT), sha1Fichier(CALCUL), sha1(R.texteAReconductionsVides(fs.readFileSync(FICHIER, 'utf8'))), sha1Fichier(path.join(dossier, 'reglages-essai.json'))]);
  assert.deepEqual(p.donnees.fichiers, { 'fixtures/odds/odds-snapshot.json': sha1Fichier(path.join(dossier, 'donnees', 'fixtures', 'odds', 'odds-snapshot.json')), 'runtime/season-calendar.json': sha1Fichier(path.join(dossier, 'donnees', 'runtime', 'season-calendar.json')) }, 'I2 : chaque fichier des données à son sha1');
  assert.deepEqual(p.echecs, { n: ['2026-10-05T01:00:00.000Z|id:cal-2026-10-06-inconnu'], nPrime: ['2026-10-05T01:00:00.000Z|id:cal-2026-10-06-inconnu'] }, 'I1 : nommé par son identifiant');
  assert.ok(p.bilans.n.dansLaFenetre >= 6 && p.bilans.n.analyses >= 5 && p.bilans.n.sansIdentifiant + p.bilans.n.echecs >= 1, JSON.stringify(p.bilans));
  // La sortie n'est jamais réécrite.
  const b = lancerPreuve(dossier, { nom: 'identique.json' });
  assert.deepEqual([b.code, b.json.ok], [1, false]);
  assert.match(b.json.raison, /jamais réécrite/);
  // N′ : une copie du code où λ est décalé de 0,001 (ρ seul ne suffirait pas : le calcul du direct ne lit pas ρ).
  const np = path.join(dossier, 'np', 'code', 'server');
  fs.cpSync(path.join(SERVEUR, 'src'), path.join(np, 'src'), { recursive: true });
  fs.cpSync(path.join(SERVEUR, 'test', 'aides'), path.join(np, 'test', 'aides'), { recursive: true });
  fs.copyFileSync(path.join(SERVEUR, 'package.json'), path.join(np, 'package.json'));
  // Le seul paquet que le calcul de nuit importe (config/env.js : dotenv/config), RECOPIÉ (jamais une jonction dans une copie).
  fs.cpSync(path.join(SERVEUR, 'node_modules', 'dotenv'), path.join(np, 'node_modules', 'dotenv'), { recursive: true });
  const es = path.join(np, 'src', 'data', 'simulation', 'entreesSimulation.js');
  const ligne = 'return { grille: GRILLES.ancien, lambda: trois(lambda), mu: trois(mu), rho, fair, engineVersion };';
  const t = fs.readFileSync(es, 'utf8');
  assert.equal(t.split(ligne).length, 2, 'la ligne à décaler, une fois');
  fs.writeFileSync(es, t.replace(ligne, ligne.replace('lambda: trois(lambda),', 'lambda: trois(lambda) + 0.001,')));
  const c = lancerPreuve(dossier, { codeNP: np, nom: 'lambda.json' });
  assert.equal(c.code, 0, `${JSON.stringify(c.json)} ${c.erreurs.slice(-600)}`);
  assert.equal(c.json.identique, false);
  assert.ok(Math.abs(c.json.ecartMax.lambda - 0.001) < 1e-9, `écart de λ : ${c.json.ecartMax.lambda}`);
  assert.deepEqual([c.json.ecartMax.mu, c.json.ecartMax.rho], [0, 0]);
  assert.deepEqual(c.json.modulesDuDirectChanges, ['src/data/simulation/entreesSimulation.js']);
  assert.ok(c.json.lectures && c.json.lectures.lignes === 5 && c.json.lectures.etats === 4 && c.json.lectures.creneaux === 4 && c.json.lectures.ecartMax > 1e-12, JSON.stringify(c.json.lectures));
  assert.ok(c.json.differences.some((d) => d.champ === 'lambda') && c.json.differences.some((d) => d.champ === 'lectures'), JSON.stringify(c.json.differences));
  assert.ok(c.json.pourquoiPas.some((x) => /un module scellé du direct a changé \(src\/data\/simulation\/entreesSimulation\.js\)/.test(x)), `I5 : ${JSON.stringify(c.json.pourquoiPas)}`);
  // I5 : N lui-même hors du sceau (son module du direct changé) : refusé avant tout calcul.
  const n5 = lancerPreuve(dossier, { codeN: np, nom: 'refus-n-hors-sceau.json' });
  assert.deepEqual([n5.code, n5.json.ok], [1, false]);
  assert.match(n5.json.raison, /les modules du direct de N ne sont pas ceux du sceau \(src\/data\/simulation\/entreesSimulation\.js\)/);
  // La « vraie base » (et ses annexes) d'un FAUX dossier personnel (jamais la vraie) : refusée sur son chemin, avant tout accès.
  const maison = path.join(dossier, 'maison');
  for (const s of ['', '-wal']) {
    const fausse = path.join(maison, 'CoteMaster', 'match-stats.db') + s;
    const r = spawnSync(process.execPath, [SCRIPT, '--preuve', '--code-n', SERVEUR, '--code-np', SERVEUR, '--base', fausse, '--nuits', '2026-10-05T01:00:00.000Z', '--sortie', path.join(racine, 'preuves', `vraie${s}.json`)], { env: { ...environnement(), USERPROFILE: maison, HOME: maison }, encoding: 'utf8', timeout: 60_000 });
    const j = JSON.parse(String(r.stdout).trim().split(/\r?\n/).at(-1));
    assert.deepEqual([r.status, j.ok], [1, false]);
    assert.match(j.raison, /la vraie base ou la base du bac — jamais/);
  }
  // Un lien physique vers une base : refusé (ce pourrait être la vraie).
  const lien = path.join(dossier, 'base-lien.db');
  fs.linkSync(path.join(dossier, 'base.db'), lien);
  const l = lancerPreuve(dossier, { nom: 'lien.json', base: lien });
  assert.deepEqual([l.code, l.json.ok], [1, false]);
  assert.match(l.json.raison, /lien physique/);
});
