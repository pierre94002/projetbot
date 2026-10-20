/**
 * Sauvegardes (étape 1 du plan) — test SANS serveur, jamais sur la vraie base.
 *   node --test test/sauvegardes.test.mjs        (depuis server/, dans le bac ou le dépôt)
 *
 * Ce qui est vérifié :
 *   - le nom d'une sauvegarde suit le jour de PARIS (minuit, changements d'heure) ;
 *   - la rotation 7 quotidiennes / 4 hebdomadaires / 12 mensuelles sur des
 *     dates simulées, appliquée nuit après nuit ou d'un coup ; les copies
 *     faites à la main ne sont JAMAIS supprimées ;
 *   - aucun secret (ai-config.json, .env, clé en clair) n'entre dans l'archive
 *     des données ; verrous, temporaires et ancien miroir JSON restent dehors ;
 *   - dans le bac à sable, toute écriture hors du bac est refusée (sous-processus
 *     réels des deux scripts, avant toute ouverture de base) ;
 *   - de bout en bout, sur une PETITE base de test : sauvegarde, restauration
 *     d'essai saine, puis copie abîmée et bilan faussé détectés ; copie hors
 *     disque vers un faux dossier, 2 copies au plus là-bas ;
 *   - la DESTINATION hors disque (05/10/2026) : ordre de priorité (choix
 *     enregistré, variable, OneDrive par défaut), OneDrive détecté ou non,
 *     une seule copie gardée sur OneDrive et deux sur un dossier, dossiers
 *     interdits, clé débranchée, routes (PUT idempotent, vérification sans
 *     écriture) et un essai réel de copie vers un FAUX OneDrive
 *     (CM_TEST_ONEDRIVE), dans le bac quand les tests tournent dans le bac.
 * Les « clés » posées ici sont fausses. Le vrai dossier des sauvegardes de
 * l'appli et le vrai dossier OneDrive\CoteMaster-sauvegardes sont seulement
 * LISTÉS, avant et après, pour prouver qu'ils n'ont pas bougé ; les variables
 * OneDrive de Windows ne sont jamais transmises aux sous-processus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as plan from '../src/data/sauvegardes/planSauvegardes.js';
import * as f from '../src/data/sauvegardes/fichiersSauvegarde.js';
import * as dest from '../src/data/sauvegardes/destinationHorsDisque.js';
import * as bac from '../src/config/bacASable.js';
import { preparerCopie, executer, VARIABLES_ONEDRIVE } from './aides/isolement.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VRAIES_SAUVEGARDES = path.join(path.dirname(bac.VRAIE_BASE), 'sauvegardes');
/** Le vrai dossier de la copie hors disque dans OneDrive (s'il y a un OneDrive) : seulement LISTÉ. */
const VRAI_ONEDRIVE = dest.detecterOneDrive({ OneDriveConsumer: process.env.OneDriveConsumer, OneDrive: process.env.OneDrive });
const VRAIE_DESTINATION_ONEDRIVE = VRAI_ONEDRIVE.detecte ? path.join(VRAI_ONEDRIVE.racine, dest.SOUS_DOSSIER_ONEDRIVE) : null;
// Dans le bac, les essais écrivent DANS le bac (le garde-fou refuse le reste) ;
// depuis le dépôt, dans le dossier temporaire du système.
const RACINE_ESSAIS = f.bacActif() ? path.join(f.bacActif(), 'essais-sauvegarde', 'tests') : os.tmpdir();

function dossierTemporaire() {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  return fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-sauvegarde-'));
}
const nettoyer = (d) => fs.rmSync(d, { recursive: true, force: true });

/** Liste (nom, taille, date) d'un dossier : LECTURE seule ; null s'il n'existe pas. */
function empreinteDossier(dossier) {
  if (!dossier) return null;
  try {
    return fs
      .readdirSync(dossier)
      .sort()
      .map((n) => {
        const st = fs.statSync(path.join(dossier, n));
        return `${n}|${st.size}|${st.mtimeMs}`;
      });
  } catch {
    return null;
  }
}
const empreinteVraiesSauvegardes = () => empreinteDossier(VRAIES_SAUVEGARDES);
const AVANT = empreinteVraiesSauvegardes();
const AVANT_ONEDRIVE = empreinteDossier(VRAIE_DESTINATION_ONEDRIVE);

/** L'environnement de ce processus sans le vrai OneDrive (ni drapeau, base ou destination hérités). */
function environnementSansOneDrive(aRetirer = []) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (VARIABLES_ONEDRIVE.test(k) || aRetirer.includes(k) || k === dest.VARIABLE_ESSAI_ONEDRIVE) delete env[k];
  return env;
}

/** Sous-processus d'un script, environnement maîtrisé (sans drapeau ni base hérités, sans le vrai OneDrive). */
function script(nom, args, envEnPlus = {}) {
  const env = environnementSansOneDrive();
  for (const k of ['CM_BAC_A_SABLE', 'MATCH_STATS_DB', 'CM_SAUVEGARDE_HORS_DISQUE', 'CM_SAUVEGARDE_HORS_DISQUE_GARDER']) delete env[k];
  const r = spawnSync(process.execPath, [path.join(SERVEUR, 'scripts', nom), ...args], { cwd: SERVEUR, env: { ...env, ...envEnPlus }, encoding: 'utf8', timeout: 120_000 });
  const ligne = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  let json = null;
  try {
    json = JSON.parse(ligne);
  } catch {
    // laissé à null : l'assertion dira ce qui est sorti
  }
  return { code: r.status, json, sortie: r.stdout ?? '', erreurs: r.stderr ?? '' };
}

/** Jours consécutifs de `debut` (inclus) sur `n` jours. */
function jours(debut, n) {
  const t = Date.parse(`${debut}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t + i * 86_400_000).toISOString().slice(0, 10));
}

// ---------------------------------------------------------------- noms

test('le nom suit le jour de Paris : minuit et changements d\'heure', () => {
  // Heure d'été (UTC+2) : 22 h 30 UTC le 5 = 0 h 30 le 6 à Paris.
  assert.equal(plan.jourParis(new Date('2026-10-05T22:30:00Z')), '2026-10-06');
  assert.equal(plan.jourParis(new Date('2026-10-05T21:59:59Z')), '2026-10-05');
  // Passage à l'heure d'hiver la nuit du 24 au 25 octobre 2026.
  assert.equal(plan.jourParis(new Date('2026-10-24T22:30:00Z')), '2026-10-25'); // 0 h 30 CEST
  assert.equal(plan.jourParis(new Date('2026-10-25T22:30:00Z')), '2026-10-25'); // 23 h 30 CET
  assert.equal(plan.jourParis(new Date('2026-10-25T23:30:00Z')), '2026-10-26'); // 0 h 30 CET
  // Nouvel an en hiver (UTC+1).
  assert.equal(plan.jourParis(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  // Passage à l'heure d'été (29 mars 2026).
  assert.equal(plan.jourParis(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
  // L'ancien script nommait d'après la date UTC : la copie de 0 h 30 le 6 portait le 5.
  const instant = new Date('2026-10-05T22:30:00Z');
  assert.equal(instant.toISOString().slice(0, 10), '2026-10-05');
  assert.equal(plan.nomsDuJour(plan.jourParis(instant)).base, 'cotemaster-2026-10-06.db.gz');
});

test('classement des noms : les nôtres, l\'ancien format, et tout le reste jamais touché', () => {
  assert.deepEqual(plan.classerNom('cotemaster-2026-10-06.db.gz'), { type: 'jeu', jour: '2026-10-06', partie: 'base' });
  assert.deepEqual(plan.classerNom('cotemaster-2026-10-06.donnees.zip'), { type: 'jeu', jour: '2026-10-06', partie: 'donnees' });
  assert.deepEqual(plan.classerNom('cotemaster-2026-10-06.json'), { type: 'jeu', jour: '2026-10-06', partie: 'bilan' });
  assert.deepEqual(plan.classerNom('auto-2026-09-24.db'), { type: 'ancienne', jour: '2026-09-24', partie: 'ancienne' });
  assert.equal(plan.classerNom('cotemaster-2026-10-06.db.1234.en-cours').type, 'travail');
  assert.equal(plan.classerNom('cotemaster-2026-10-06.db.1234.en-cours-wal').pid, 1234);
  assert.equal(plan.classerNom('etat-sauvegarde.json').type, 'etat');
  for (const manuel of [
    'auto-2026-09-24 - Copie.db',
    'cotemaster-2026-10-06 - Copie.db.gz',
    'COTEMASTER-2026-10-06.DB.GZ',
    'cotemaster-2026-02-30.db.gz', // date impossible
    'avant-dates-2026-09-22.db',
    'apres-relecture5-2026-09-23.db',
    'match-stats-avant-fusion-europe.db',
    'json-orphelins-20.json',
    'auto-2026-10-01.db.gz',
    'cotemaster-2026-10-06.db'
  ]) {
    assert.equal(plan.classerNom(manuel), null, manuel);
  }
});

// ------------------------------------------------------------- rotation

test('rotation 7/4/12 sur 400 nuits simulées : appliquée nuit après nuit = appliquée d\'un coup', () => {
  const toutes = jours('2025-09-02', 400); // jusqu'au 2026-10-06 inclus
  assert.equal(toutes.at(-1), '2026-10-06');
  // Nuit après nuit : la sauvegarde du jour, puis la rotation.
  let presentes = [];
  for (const j of toutes) {
    presentes.push(j);
    const p = plan.planRotation(presentes);
    presentes = presentes.filter((x) => p.garder.has(x));
    assert.ok(presentes.includes(j), `la copie du ${j} doit survivre à sa propre rotation`);
  }
  const dUnCoup = [...plan.planRotation(toutes).garder.keys()].sort();
  assert.deepEqual([...presentes].sort(), dUnCoup);

  const p = plan.planRotation(presentes);
  const avec = (raison) => [...p.garder].filter(([, r]) => r.includes(raison)).map(([j]) => j).sort();
  assert.deepEqual(avec('quotidienne'), jours('2026-09-30', 7));
  // Semaines (lundi-dimanche) : la plus récente de chacune des 4 dernières.
  assert.deepEqual(avec('hebdomadaire'), ['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-06']);
  // Mois : la plus récente de chacun des 12 derniers.
  assert.deepEqual(avec('mensuelle'), [
    '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-06'
  ]);
  assert.equal(presentes.length, 19);
  assert.deepEqual(plan.compterParType(p.garder), { quotidiennes: 7, hebdomadaires: 4, mensuelles: 12, jeux: 19 });
  // Deuxième passage : rien de plus à supprimer.
  assert.deepEqual(plan.planRotation(presentes).supprimer, []);
});

test('rotation après une absence de 20 jours : toujours 7 copies quotidiennes', () => {
  const avant = jours('2026-08-01', 30); // jusqu'au 30/08
  const apres = jours('2026-09-20', 3); // retour le 20/09
  const p = plan.planRotation([...avant, ...apres]);
  const quotidiennes = [...p.garder].filter(([, r]) => r.includes('quotidienne')).map(([j]) => j).sort();
  assert.deepEqual(quotidiennes, ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-09-20', '2026-09-21', '2026-09-22']);
  // Une seule copie : gardée.
  assert.deepEqual([...plan.planRotation(['2026-10-06']).garder.keys()], ['2026-10-06']);
  assert.deepEqual(plan.planRotation([]).supprimer, []);
});

test('rotation sur le disque : copies à la main, ancien format, jeux incomplets et autres fichiers', () => {
  const tmp = dossierTemporaire();
  try {
    const ecrire = (nom, contenu = 'x') => fs.writeFileSync(path.join(tmp, nom), contenu);
    const nuits = jours('2026-07-01', 98); // jusqu'au 06/10
    for (const j of nuits) {
      const n = plan.nomsDuJour(j);
      ecrire(n.base);
      ecrire(n.donnees);
      ecrire(n.bilan, '{}');
    }
    // Ancien format (copies hebdomadaires d'avant le 06/10) et copies faites à la main.
    ecrire('auto-2026-06-10.db');
    ecrire('auto-2026-06-17.db');
    // (Pas de variante en MAJUSCULES ici : sous Windows, elle écraserait le fichier du même nom.)
    const aLaMain = ['auto-2026-06-10 - Copie.db', 'avant-dates-2026-09-22.db', 'cotemaster-2026-08-15 - Copie.db.gz', 'json-orphelins-20.json', 'notes.txt', 'auto-2026-09-24.db.gz'];
    for (const n of aLaMain) ecrire(n);
    fs.mkdirSync(path.join(tmp, 'un-dossier-a-moi'));
    ecrire(path.join('un-dossier-a-moi', 'cotemaster-2026-07-02.db.gz'));
    // Un jeu dont la base a été supprimée à la main : ni compté, ni effacé.
    fs.rmSync(path.join(tmp, plan.nomsDuJour('2026-07-03').base));

    const r = f.appliquerRotation(tmp);
    const restent = new Set(fs.readdirSync(tmp));
    for (const n of aLaMain) assert.ok(restent.has(n), `copie faite à la main supprimée : ${n}`);
    assert.ok(fs.existsSync(path.join(tmp, 'un-dossier-a-moi', 'cotemaster-2026-07-02.db.gz')), 'un sous-dossier ne doit jamais être parcouru');
    assert.ok(restent.has('cotemaster-2026-07-03.json') && restent.has('cotemaster-2026-07-03.donnees.zip'), 'jeu incomplet laissé tel quel');
    assert.deepEqual(r.incomplets.map((i) => i.jour), ['2026-07-03']);
    // Ancien format : dans la rotation (juin = la plus récente du mois → gardée en mensuelle).
    assert.ok(restent.has('auto-2026-06-17.db'));
    assert.ok(!restent.has('auto-2026-06-10.db'));
    // Les jeux gardés : 7 + 4 + mensuelles, chacun complet (base + données + bilan).
    const gardes = [...new Set([...restent].map((n) => plan.classerNom(n)).filter((c) => c?.type === 'jeu' && c.partie === 'base').map((c) => c.jour))].sort();
    assert.deepEqual(gardes, ['2026-07-31', '2026-08-31', '2026-09-20', '2026-09-27', ...jours('2026-09-30', 7)]);
    for (const j of gardes) for (const n of Object.values(plan.nomsDuJour(j))) assert.ok(restent.has(n), n);
    assert.equal(r.compte.jeux, gardes.length + 1); // + l'ancien format de juin
    // Idempotente.
    assert.deepEqual(f.appliquerRotation(tmp).supprimees, []);
    // Horloge qui recule : la copie « du jour » porte une date déjà sortie de
    // la rotation ; protégée, elle reste — sans protection, elle partirait.
    for (const nom of Object.values(plan.nomsDuJour('2026-09-01'))) ecrire(nom);
    f.appliquerRotation(tmp, undefined, { proteger: ['2026-09-01'] });
    assert.ok(fs.existsSync(path.join(tmp, plan.nomsDuJour('2026-09-01').base)));
    f.appliquerRotation(tmp);
    assert.ok(!fs.existsSync(path.join(tmp, plan.nomsDuJour('2026-09-01').base)));
  } finally {
    nettoyer(tmp);
  }
});

// ------------------------------------------------------- cadences, alertes

test('cadences : restauration chaque semaine, contrôle complet tous les 28 jours, en jours de Paris', () => {
  assert.equal(plan.estDue(null, 7), true);
  // Dernière réussite à 1 h 30 le 02/10 (Paris).
  const derniere = '2026-10-01T23:30:00Z';
  assert.equal(plan.estDue(derniere, 7, new Date('2026-10-08T20:00:00Z')), false); // 22 h le 08/10 : 6 jours
  assert.equal(plan.estDue(derniere, 7, new Date('2026-10-08T22:10:00Z')), true); // 0 h 10 le 09/10 : 7 jours
  assert.equal(plan.estDue(derniere, 28, new Date('2026-10-29T12:00:00Z')), false);
  assert.equal(plan.estDue(derniere, 28, new Date('2026-10-30T12:00:00Z')), true);
});

test('place disque et alertes : chaque manque est dit', () => {
  const GO = 1024 ** 3;
  assert.equal(plan.placeDisque(10 * GO, 2 * GO).niveau, 'surveiller'); // requis 6 Go, alerte sous 11 Go
  assert.equal(plan.placeDisque(5 * GO, 2 * GO).niveau, 'insuffisante');
  assert.equal(plan.placeDisque(70 * GO, 2 * GO).niveau, 'ok');
  const maintenant = new Date('2026-10-06T10:00:00Z');
  const codes = (x) => plan.alertesSauvegarde({ maintenant, ...x }).map((a) => a.code).sort();
  assert.deepEqual(codes({ horsDisque: { reglage: 'non-configuree' } }), ['hors-disque-non-configuree', 'restauration-aucune', 'sauvegarde-aucune']);
  const reussie = { ok: true, fin: '2026-10-05T23:00:00Z' };
  const saine = { saine: true, fin: '2026-10-05T23:10:00Z' };
  assert.deepEqual(codes({ sauvegarde: { derniere: reussie, derniereReussie: reussie }, restauration: { derniere: saine, derniereSaine: saine }, horsDisque: { reglage: 'refusee' } }), []);
  assert.deepEqual(codes({ sauvegarde: { derniere: { ok: false, erreur: 'x', fin: '2026-10-06T01:00:00Z' }, derniereReussie: { ok: true, fin: '2026-10-02T23:00:00Z' } }, restauration: { derniere: saine, derniereSaine: saine }, horsDisque: { reglage: 'refusee' } }), ['sauvegarde-echec', 'sauvegarde-retard']);
  assert.deepEqual(codes({ sauvegarde: { derniere: reussie, derniereReussie: reussie, horsDisque: { derniereTentative: { statut: 'absente', fin: reussie.fin, destination: 'E:\\x' } } }, restauration: { derniere: { saine: false, fin: saine.fin, problemes: ['quick_check'] }, derniereSaine: saine }, horsDisque: { reglage: 'configuree' }, disque: plan.placeDisque(5 * GO, 2 * GO) }), ['disque-plein', 'hors-disque-absente', 'restauration-malsaine']);
});

// ---------------------------------------------------- secrets et archive

test('archive des données : jamais de secret, ni verrou, ni temporaire, ni ancien miroir', () => {
  const tmp = dossierTemporaire();
  try {
    const runtime = path.join(tmp, 'runtime');
    const ecrire = (rel, contenu) => {
      fs.mkdirSync(path.dirname(path.join(runtime, rel)), { recursive: true });
      fs.writeFileSync(path.join(runtime, rel), contenu);
    };
    const CLE = 'sk-ant-api03-FAUSSE-CLE-DE-TEST-0123456789';
    const SECRET_ENV = 'valeur-secrete-de-test-9876543210';
    ecrire('predictions.json', JSON.stringify([{ id: 1 }]));
    ecrire('bets.json', JSON.stringify([]));
    ecrire('engine-config.json', JSON.stringify({ football: { edgeThresholdMin: 0.03 } }));
    ecrire('sous-dossier/notes.json', JSON.stringify({ a: 1 }));
    ecrire('ai-config.json', JSON.stringify({ apiKey: CLE }));
    ecrire('AI-CONFIG.JSON.bak', 'rien');
    ecrire('.env', `ODDS_API_KEY=${SECRET_ENV}`);
    ecrire('espn-refresh.lock', '{}');
    ecrire('espn-refresh.lock.1234.abandonne', '{}');
    ecrire('predictions.json.4321.tmp', '{');
    ecrire('refresh-status.illisible-2026-10-01.json', '{');
    ecrire('match-stats/2024-01.json', '{}');
    ecrire('_tmp-season-import/x.json', '{}');
    ecrire('fuite.json', JSON.stringify({ texte: `jeton ${CLE.replace('api03', 'oat01')}` }));
    ecrire('analyse.json', JSON.stringify({ note: `contient ${SECRET_ENV}` }));
    ecrire('casse.json', '{"pas fini":');

    const cible = path.join(tmp, 'donnees.zip');
    const secrets = f.secretsConnus({ ODDS_API_KEY: SECRET_ENV, AUTRE_SERVICE_API_TOKEN: 'court' });
    assert.equal(secrets.length, 1, 'une valeur trop courte ne sert pas de motif');
    const r = f.archiverDonnees({ dossierDonnees: runtime, cible, secrets });
    const entrees = f.lireZip(fs.readFileSync(cible), { garderDonnees: true });
    assert.deepEqual(
      entrees.map((e) => e.nom).sort(),
      ['data/runtime/bets.json', 'data/runtime/casse.json', 'data/runtime/engine-config.json', 'data/runtime/predictions.json', 'data/runtime/sous-dossier/notes.json']
    );
    assert.ok(entrees.every((e) => e.ok), 'chaque fichier se relit (CRC)');
    for (const e of entrees) {
      const texte = e.donnees.toString('utf8');
      assert.ok(!texte.includes('sk-ant-') && !texte.includes(SECRET_ENV), `secret dans ${e.nom}`);
    }
    // L'archive entière, octet par octet, ne contient aucun des deux secrets en clair.
    const brut = fs.readFileSync(cible);
    assert.ok(!brut.includes(Buffer.from(CLE)) && !brut.includes(Buffer.from(SECRET_ENV)));
    const exclus = Object.fromEntries(r.exclus.map((x) => [x.fichier, x.raison]));
    for (const n of ['ai-config.json', 'AI-CONFIG.JSON.bak', '.env', 'espn-refresh.lock', 'espn-refresh.lock.1234.abandonne', 'predictions.json.4321.tmp', 'refresh-status.illisible-2026-10-01.json', 'match-stats/', '_tmp-season-import/', 'fuite.json', 'analyse.json']) {
      assert.ok(exclus[n], `${n} aurait dû être écarté`);
    }
    // Un JSON abîmé sur le disque est archivé tel quel, mais signalé ; aucun message ne cite un contenu.
    assert.ok(r.avertissements.some((a) => a.includes('casse.json')));
    assert.ok(!JSON.stringify(r).includes(CLE) && !JSON.stringify(r).includes(SECRET_ENV));
    // L'Explorateur de Windows (et tar) savent lire l'archive.
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(tar)) {
      const liste = spawnSync(tar, ['-tf', cible], { encoding: 'utf8' });
      assert.equal(liste.status, 0, liste.stderr);
      assert.ok(liste.stdout.includes('data/runtime/predictions.json'));
    }
    // Les réglages du moteur : fichier par-dessus les défauts du code.
    const m = f.reglagesMoteur(runtime);
    assert.equal(m.effectifs.football.edgeThresholdMin, 0.03);
    assert.equal(m.effectifs.football.edgeThresholdMax, 0.25);
    assert.equal(m.fichier.present, true);
  } finally {
    nettoyer(tmp);
  }
});

test('zip : un octet abîmé est détecté à la relecture', () => {
  const zip = f.construireZip([{ nom: 'a.json', donnees: Buffer.from(JSON.stringify({ x: 'y'.repeat(500) })), mtime: new Date('2026-10-05T12:00:00Z') }]);
  assert.equal(f.lireZip(zip)[0].ok, true);
  const abime = Buffer.from(zip);
  abime[40] ^= 0xff; // en plein dans les données compressées (en-tête local : 30 + 6 octets)
  assert.equal(f.lireZip(abime)[0].ok, false);
  // Les données, décompressées à la main, redonnent le fichier.
  const donnees = zlib.inflateRawSync(zip.subarray(30 + 'a.json'.length, zip.length - 22 - 46 - 'a.json'.length));
  assert.equal(JSON.parse(donnees.toString('utf8')).x.length, 500);
});

// ------------------------------------------------------ garde-fou du bac

test('bac à sable : écriture hors du bac refusée par les deux scripts, avant toute ouverture de base', () => {
  const dehors = path.join(os.tmpdir(), `cm-hors-du-bac-${process.pid}`);
  fs.rmSync(dehors, { recursive: true, force: true });
  const env = { CM_BAC_A_SABLE: '1' };
  const s = script('backup-db.mjs', ['--dir', dehors], env);
  assert.equal(s.code, 1, s.sortie + s.erreurs);
  assert.match(s.json?.reason ?? '', /Bac à sable : écriture des sauvegardes refusée hors du bac/);
  const r = script('restore-test-db.mjs', ['--dir', dehors], env);
  assert.equal(r.code, 1, r.sortie + r.erreurs);
  assert.match(r.json?.reason ?? '', /Bac à sable : restauration d'essai refusée hors du bac/);
  const v = script('backup-db.mjs', ['--dir', VRAIES_SAUVEGARDES, '--copie-seule'], env);
  assert.equal(v.code, 1);
  assert.match(v.json?.reason ?? '', /refusée hors du bac/);
  assert.equal(fs.existsSync(dehors), false, 'rien ne doit avoir été créé hors du bac');
  // Directement : le garde-fou de chaque écriture.
  if (f.bacActif()) {
    assert.throws(() => f.gardeEcriture(path.join(VRAIES_SAUVEGARDES, 'x.db.gz')), /refusée hors du bac/);
    assert.throws(() => f.gardeEcriture(dehors), /refusée hors du bac/);
    assert.equal(f.gardeEcriture(path.join(f.bacActif(), 'sauvegardes', 'x')), path.join(f.bacActif(), 'sauvegardes', 'x'));
    assert.equal(f.dossierSauvegardesParDefaut(bac.VRAIE_BASE), path.join(f.bacActif(), 'sauvegardes'));
  }
});

// ----------------------------------------------------------- bout en bout

/** Une petite base de test (jamais la vraie) : 3 rencontres, en WAL comme la vraie. */
function petiteBase(fichier) {
  const db = new DatabaseSync(fichier);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec("CREATE TABLE matches (match_key TEXT PRIMARY KEY, date TEXT NOT NULL); CREATE INDEX idx_matches_date ON matches(date);");
  const ins = db.prepare('INSERT INTO matches VALUES (?, ?)');
  for (const [k, d] of [['a', '2026-10-03'], ['b', '2026-10-04'], ['c', '2026-10-05']]) ins.run(k, d);
  db.close();
}

test('de bout en bout sur une petite base : sauvegarde, restauration saine, copie abîmée détectée, hors disque', () => {
  const tmp = dossierTemporaire();
  try {
    const base = path.join(tmp, 'base', 'match-stats.db');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    petiteBase(base);
    const runtime = path.join(tmp, 'runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtime, 'predictions.json'), '[]');
    fs.writeFileSync(path.join(runtime, 'ai-config.json'), '{"apiKey":"sk-ant-api03-FAUSSE-CLE-DE-TEST-000000"}');
    const sauvegardes = path.join(tmp, 'sauvegardes');
    const cle = path.join(tmp, 'fausse-cle-usb');
    fs.mkdirSync(cle);
    fs.writeFileSync(path.join(cle, 'photos-de-vacances.jpg'), 'à ne pas toucher');
    const env = { MATCH_STATS_DB: base, CM_SAUVEGARDE_HORS_DISQUE: cle };

    // 1. Sauvegarde de nuit, copie hors disque due (jamais faite).
    const s = script('backup-db.mjs', ['--dir', sauvegardes, '--donnees', runtime], env);
    assert.equal(s.code, 0, s.sortie + s.erreurs);
    assert.equal(s.json.ok, true);
    assert.equal(s.json.matches, 3);
    assert.equal(s.json.lastDate, '2026-10-05');
    assert.equal(path.basename(s.json.file), `cotemaster-${plan.jourParis()}.db.gz`);
    assert.deepEqual(s.json.donnees.exclus, ['ai-config.json (clé API en clair : jamais sauvegardée)']);
    assert.equal(s.json.horsDisque.statut, 'faite');
    assert.equal(s.json.kept.length, 1);
    const n = plan.nomsDuJour(plan.jourParis());
    for (const x of Object.values(n)) assert.ok(fs.existsSync(path.join(sauvegardes, x)), x);
    assert.ok(fs.existsSync(path.join(cle, n.base)) && fs.existsSync(path.join(cle, 'photos-de-vacances.jpg')));
    assert.ok(!fs.readdirSync(sauvegardes).some((x) => x.includes('.en-cours')), 'aucun fichier de travail ne reste');
    assert.ok(!fs.existsSync(`${base}-wal`) || fs.statSync(`${base}-wal`).size === 0, 'la base sauvegardée n\'a pas été écrite');

    // 2. Restauration d'essai : saine, comparée au bilan, copie temporaire effacée.
    const r = script('restore-test-db.mjs', ['--dir', sauvegardes, '--si-du'], { MATCH_STATS_DB: base });
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.equal(r.json.saine, true, JSON.stringify(r.json.problemes));
    assert.equal(r.json.rencontres, 3);
    assert.equal(r.json.attendues, 3);
    assert.equal(r.json.empreinte, 'identique');
    assert.equal(r.json.controle, 'integrity_check', 'premier essai : contrôle complet');
    assert.equal(r.json.copieSupprimee, true);
    assert.deepEqual(r.json.donnees.interdits, []);
    assert.ok(!fs.readdirSync(sauvegardes).some((x) => x.startsWith('restauration-essai')));
    // Pas dû le même jour.
    const r2 = script('restore-test-db.mjs', ['--dir', sauvegardes, '--si-du'], { MATCH_STATS_DB: base });
    assert.equal(r2.json.fait, false);

    // 3. Même jour : la sauvegarde remplace celle d'avant ; hors disque pas due.
    const s2 = script('backup-db.mjs', ['--dir', sauvegardes, '--donnees', runtime], env);
    assert.equal(s2.json.ok, true);
    assert.equal(s2.json.horsDisque.statut, 'pas-due');
    assert.equal(s2.json.kept.length, 1);

    // 4. Un bilan faussé (rencontres) puis une copie abîmée : non saines.
    const fichierBilan = path.join(sauvegardes, n.bilan);
    const bilan = JSON.parse(fs.readFileSync(fichierBilan, 'utf8'));
    fs.writeFileSync(fichierBilan, JSON.stringify({ ...bilan, base: { ...bilan.base, rencontres: 4 } }));
    const r3 = script('restore-test-db.mjs', ['--dir', sauvegardes], { MATCH_STATS_DB: base });
    assert.equal(r3.code, 1);
    assert.equal(r3.json.saine, false);
    assert.ok(r3.json.problemes.some((p) => p.includes('3 rencontres au lieu des 4')));
    fs.writeFileSync(fichierBilan, JSON.stringify(bilan));
    const gz = path.join(sauvegardes, n.base);
    fs.truncateSync(gz, Math.floor(fs.statSync(gz).size / 2));
    const r4 = script('restore-test-db.mjs', ['--dir', sauvegardes], { MATCH_STATS_DB: base });
    assert.equal(r4.code, 1);
    assert.equal(r4.json.saine, false);
    assert.ok(!fs.readdirSync(sauvegardes).some((x) => x.startsWith('restauration-essai')), 'la copie temporaire est effacée même après un échec');
    const etat = JSON.parse(fs.readFileSync(path.join(sauvegardes, 'etat-restauration.json'), 'utf8'));
    assert.equal(etat.derniere.saine, false);
    assert.equal(etat.derniereSaine.saine, true, 'la dernière restauration saine est gardée');

    // 5. Hors disque : 2 copies au plus là-bas ; destination absente = rien d'écrit ;
    //    destination = dossier des sauvegardes = refus.
    for (const jour of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      const nj = plan.nomsDuJour(jour);
      fs.copyFileSync(path.join(sauvegardes, n.donnees), path.join(cle, nj.donnees));
      fs.writeFileSync(path.join(cle, nj.base), 'ancienne copie');
      fs.writeFileSync(path.join(cle, nj.bilan), '{}');
    }
    fs.writeFileSync(gz, 'remplacée');
    const s3 = script('backup-db.mjs', ['--dir', sauvegardes, '--donnees', runtime, '--hors-disque-maintenant'], env);
    assert.equal(s3.json.ok, true, s3.sortie);
    assert.equal(s3.json.horsDisque.statut, 'faite');
    const surLaCle = fs.readdirSync(cle).filter((x) => x.endsWith('.db.gz')).sort();
    assert.deepEqual(surLaCle, ['cotemaster-2026-10-03.db.gz', n.base].sort());
    assert.ok(fs.existsSync(path.join(cle, 'photos-de-vacances.jpg')));
    const absente = script('backup-db.mjs', ['--dir', sauvegardes, '--hors-disque-seule', '--hors-disque', path.join(tmp, 'cle-debranchee')], { MATCH_STATS_DB: base });
    assert.equal(absente.json.horsDisque.statut, 'absente');
    assert.equal(fs.existsSync(path.join(tmp, 'cle-debranchee')), false);
    const meme = script('backup-db.mjs', ['--dir', sauvegardes, '--hors-disque-seule', '--hors-disque', sauvegardes], { MATCH_STATS_DB: base });
    assert.equal(meme.json.horsDisque.statut, 'erreur');
    assert.match(meme.json.horsDisque.message, /ne peut pas être le dossier des sauvegardes/);
  } finally {
    nettoyer(tmp);
  }
});

test("restauration d'essai d'une copie à l'ancien format (auto-AAAA-MM-JJ.db, non compressée)", () => {
  const tmp = dossierTemporaire();
  try {
    const base = path.join(tmp, 'base', 'match-stats.db');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    petiteBase(base);
    const sauvegardes = path.join(tmp, 'sauvegardes');
    fs.mkdirSync(sauvegardes);
    fs.copyFileSync(base, path.join(sauvegardes, 'auto-2026-10-01.db'));
    fs.copyFileSync(base, path.join(sauvegardes, 'avant-une-operation.db')); // à la main : jamais choisie
    const r = script('restore-test-db.mjs', ['--dir', sauvegardes], { MATCH_STATS_DB: base });
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.equal(r.json.saine, true);
    assert.equal(r.json.sauvegarde.ancienFormat, true);
    assert.equal(path.basename(r.json.sauvegarde.fichier), 'auto-2026-10-01.db');
    assert.equal(r.json.rencontres, 3);
    assert.equal(r.json.empreinte, 'non vérifiable');
    assert.ok(r.json.avertissements.some((a) => a.includes("ancien format")));
    assert.deepEqual(fs.readdirSync(sauvegardes).sort(), ['auto-2026-10-01.db', 'avant-une-operation.db', 'etat-restauration.json']);
  } finally {
    nettoyer(tmp);
  }
});

test("l'étape « sauvegarde » de l'actualisation : bilan d'une ligne et alerte durable (petite base, processus à part)", () => {
  const tmp = dossierTemporaire();
  try {
    const base = path.join(tmp, 'base', 'match-stats.db');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    petiteBase(base);
    const runtime = path.join(tmp, 'runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtime, 'predictions.json'), '[]');
    const sauvegardes = path.join(tmp, 'sauvegardes');
    const module = pathToFileURL(path.join(SERVEUR, 'src', 'data', 'sauvegardes', 'etapeSauvegarde.js')).href;
    const code = `
      const { passeSauvegarde } = await import(${JSON.stringify(module)});
      const r = await passeSauvegarde({ dossier: ${JSON.stringify(sauvegardes)}, donnees: ${JSON.stringify(runtime)} });
      console.log('ETAPE ' + JSON.stringify(r));`;
    // Sans le vrai OneDrive : sinon il serait la destination par défaut.
    const env = environnementSansOneDrive(['CM_BAC_A_SABLE', 'MATCH_STATS_DB', 'CM_SAUVEGARDE_HORS_DISQUE']);
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: SERVEUR, env: { ...env, MATCH_STATS_DB: base }, encoding: 'utf8', timeout: 120_000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const etape = JSON.parse(r.stdout.split('ETAPE ')[1]);
    assert.equal(etape.status, 'warn', etape.summary); // seule la copie hors disque manque (non réglée)
    assert.match(etape.summary, /^Base de 0,00 Go copiée et compressée à 0,00 Go en \d+ s \(cotemaster-\d{4}-\d{2}-\d{2}\.db\.gz/);
    assert.match(etape.summary, /gardées : 1 quotidienne, 1 hebdomadaire, 1 mensuelle \(1 copie en tout\)/);
    assert.match(etape.summary, /restauration d'essai saine en \d+ s \(contrôle complet, 3 rencontres, dernière le 2026-10-05\)/);
    assert.match(etape.summary, /hors disque : destination non réglée/);
    assert.deepEqual(etape.alert.value.alertes.map((a) => a.code), ['hors-disque-non-configuree']);
  } finally {
    nettoyer(tmp);
  }
});

// --------------------------------------------- destination hors du disque

/** Un faux jeu de sauvegarde de nuit (contenu quelconque, bilan vide : pas d'empreinte à vérifier). */
function fauxJeu(dossier, jour, contenu = `copie du ${jour}`) {
  const n = plan.nomsDuJour(jour);
  fs.writeFileSync(path.join(dossier, n.base), contenu);
  fs.writeFileSync(path.join(dossier, n.donnees), 'données');
  fs.writeFileSync(path.join(dossier, n.bilan), '{}');
  return n;
}
const joursLaBas = (dossier) => [...new Set(fs.readdirSync(dossier).map((n) => plan.classerNom(n)).filter((c) => c?.type === 'jeu').map((c) => c.jour))].sort();

test('destination hors disque : ordre de priorité — argument, choix enregistré, variable, OneDrive par défaut, non réglée', () => {
  const tmp = dossierTemporaire();
  try {
    const od = path.join(tmp, 'faux-onedrive');
    const cle = path.join(tmp, 'cle');
    const autre = path.join(tmp, 'autre');
    for (const d of [od, cle, autre]) fs.mkdirSync(d);
    const avecOd = { OneDrive: od };
    const r = (x) => {
      const v = dest.resoudreDestination({ environnement: avecOd, ...x });
      return { reglage: v.reglage, type: v.type, destination: v.destination, garder: v.garder, source: v.source };
    };
    const versOd = path.join(od, dest.SOUS_DOSSIER_ONEDRIVE);
    // 1. L'argument d'un lancement à la main passe devant tout.
    assert.deepEqual(r({ argument: cle, choix: { type: 'aucune' }, valeurVariable: autre }), { reglage: 'configuree', type: 'dossier', destination: cle, garder: 2, source: 'argument' });
    // 2. Le choix enregistré passe devant la variable et OneDrive.
    assert.deepEqual(r({ choix: { type: 'aucune' }, valeurVariable: autre }), { reglage: 'refusee', type: 'aucune', destination: null, garder: null, source: 'reglage' });
    assert.deepEqual(r({ choix: { type: 'dossier', chemin: cle }, valeurVariable: autre }), { reglage: 'configuree', type: 'dossier', destination: cle, garder: 2, source: 'reglage' });
    assert.deepEqual(r({ choix: { type: 'onedrive' }, valeurVariable: autre }), { reglage: 'configuree', type: 'onedrive', destination: versOd, garder: 1, source: 'reglage' });
    // 3. Puis la variable de server\.env, si elle existe.
    assert.deepEqual(r({ valeurVariable: autre }), { reglage: 'configuree', type: 'dossier', destination: autre, garder: 2, source: 'variable' });
    assert.deepEqual(r({ valeurVariable: 'aucune' }), { reglage: 'refusee', type: 'aucune', destination: null, garder: null, source: 'variable' });
    // 4. Par défaut, OneDrive quand il est détecté : une seule copie gardée.
    assert.deepEqual(r({ valeurVariable: '' }), { reglage: 'configuree', type: 'onedrive', destination: versOd, garder: 1, source: 'defaut-onedrive' });
    // 5. Sinon, non réglée.
    assert.deepEqual(r({ environnement: {} }), { reglage: 'non-configuree', type: null, destination: null, garder: null, source: 'aucune' });
    // Un choix illisible n'est JAMAIS pris pour « pas de choix » : ni la variable ni OneDrive ne le remplacent.
    assert.deepEqual(r({ choix: { illisible: 'abîmé' }, valeurVariable: autre }), { reglage: 'illisible', type: null, destination: null, garder: null, source: 'reglage' });
    // OneDrive choisi mais disparu : réglé, sans destination, et la raison est dite.
    const perdu = dest.resoudreDestination({ choix: { type: 'onedrive' }, environnement: {} });
    assert.equal(perdu.reglage, 'configuree');
    assert.equal(perdu.destination, null);
    assert.match(perdu.probleme, /OneDrive n'est pas détecté/);
    // Copies gardées : 1 ou 2 sur un dossier (…_GARDER), toujours 1 sur OneDrive.
    assert.equal(r({ choix: { type: 'dossier', chemin: cle }, garderDossier: 1 }).garder, 1);
    assert.equal(r({ choix: { type: 'dossier', chemin: cle }, garderDossier: 9 }).garder, 2);
    assert.equal(r({ choix: { type: 'onedrive' }, garderDossier: 2 }).garder, 1);

    // Le fichier du choix : absent, valide, abîmé, de forme inattendue.
    const fichier = path.join(tmp, dest.NOM_FICHIER_REGLAGE);
    assert.equal(dest.lireChoix(fichier), null);
    fs.writeFileSync(fichier, JSON.stringify({ version: 1, type: 'dossier', chemin: `${cle}\\`, majLe: '2026-10-05T20:00:00.000Z' }));
    assert.deepEqual(dest.lireChoix(fichier), { type: 'dossier', chemin: cle, majLe: '2026-10-05T20:00:00.000Z' });
    for (const abime of ['{"type": "onedr', '[]', '{"type": "disquette"}', '{"type": "dossier", "chemin": "relatif"}', '{"type": "dossier"}']) {
      fs.writeFileSync(fichier, abime);
      assert.ok(dest.lireChoix(fichier)?.illisible, abime);
    }
    // Lu de nouveau à chaque fois : réparé, il est pris tout de suite (pas de mémoire d'une lecture ratée).
    fs.writeFileSync(fichier, JSON.stringify({ type: 'aucune' }));
    assert.equal(dest.lireChoix(fichier).type, 'aucune');
    assert.equal(dest.destinationEnVigueur({ dossierDonnees: tmp, environnement: avecOd, valeurVariable: autre }).reglage, 'refusee');
    // Avec l'argument, le fichier n'est même pas lu.
    fs.writeFileSync(fichier, '{"pas fini":');
    assert.equal(dest.destinationEnVigueur({ argument: cle, dossierDonnees: tmp, environnement: avecOd }).source, 'argument');
  } finally {
    nettoyer(tmp);
  }
});

test('OneDrive détecté ou non : OneDriveConsumer d\'abord, dossier absent, variable d\'essai qui remplace tout', () => {
  const tmp = dossierTemporaire();
  try {
    const od = path.join(tmp, 'OneDrive');
    const perso = path.join(tmp, 'OneDrive - perso');
    const faux = path.join(tmp, 'faux-onedrive');
    for (const d of [od, perso, faux]) fs.mkdirSync(d);
    const absent = path.join(tmp, 'pas-de-onedrive');
    const d = (env) => dest.detecterOneDrive(env);
    assert.deepEqual(d({}), { detecte: false, racine: null, variable: null, essai: false, raison: "OneDrive n'est pas détecté sur ce PC (variables OneDriveConsumer et OneDrive de Windows absentes)" });
    assert.deepEqual(d({ OneDrive: od }), { detecte: true, racine: od, variable: 'OneDrive', essai: false, raison: null });
    assert.equal(d({ OneDriveConsumer: perso, OneDrive: od }).racine, perso, 'le OneDrive personnel d\'abord');
    assert.equal(d({ OneDriveConsumer: absent, OneDrive: od }).variable, 'OneDrive', 'repli sur la variable dont le dossier existe');
    const manquant = d({ OneDrive: absent });
    assert.equal(manquant.detecte, false);
    assert.match(manquant.raison, /pas-de-onedrive \(variable OneDrive\) n'existe pas/);
    assert.equal(d({ OneDrive: 'OneDrive' }).detecte, false, 'un chemin relatif ne compte pas');
    // La variable d'essai remplace entièrement le vrai OneDrive, même quand son dossier manque.
    assert.deepEqual(d({ CM_TEST_ONEDRIVE: faux, OneDrive: od }), { detecte: true, racine: faux, variable: 'CM_TEST_ONEDRIVE', essai: true, raison: null });
    assert.equal(d({ CM_TEST_ONEDRIVE: absent, OneDrive: od }).detecte, false);
    // Vérification de OneDrive : dossier dédié à créer, rien n'est créé pour le savoir.
    const v = dest.verifierDestination({ type: 'onedrive', environnement: { OneDrive: od }, dossierSauvegardes: path.join(tmp, 'sauvegardes'), tailleCopie: 1000 });
    assert.equal(v.utilisable, true, JSON.stringify(v.problemes));
    assert.equal(v.destination, path.join(od, dest.SOUS_DOSSIER_ONEDRIVE));
    assert.equal(v.aCreer, true);
    assert.equal(v.garder, 1);
    assert.equal(v.sousOneDrive, true);
    assert.ok(v.libre > 0 && v.requis === 1000 + f.MARGE_HORS_DISQUE && v.placeSuffisante === true);
    assert.equal(fs.existsSync(v.destination), false, 'la vérification ne crée rien');
    const sans = dest.verifierDestination({ type: 'onedrive', environnement: {}, dossierSauvegardes: path.join(tmp, 'sauvegardes') });
    assert.deepEqual(sans.problemes.map((p) => p.code), ['onedrive-absent']);
    // Un dossier choisi DANS OneDrive : il le dit (le choix OneDrive fait la même chose avec une copie).
    const dansOd = path.join(od, 'Documents');
    fs.mkdirSync(dansOd);
    const v2 = dest.verifierDestination({ type: 'dossier', chemin: dansOd, environnement: { OneDrive: od }, dossierSauvegardes: path.join(tmp, 'sauvegardes') });
    assert.equal(v2.sousOneDrive, true);
    assert.ok(v2.avertissements.some((a) => a.includes('OneDrive')));
  } finally {
    nettoyer(tmp);
  }
});

test('copie hors disque : UNE seule copie gardée sur OneDrive, deux sur un dossier, rien d\'autre touché', async () => {
  const tmp = dossierTemporaire();
  try {
    const sauvegardes = path.join(tmp, 'sauvegardes');
    fs.mkdirSync(sauvegardes);
    for (const jour of ['2026-10-03', '2026-10-04', '2026-10-05']) fauxJeu(sauvegardes, jour);
    const od = path.join(tmp, 'faux-onedrive');
    fs.mkdirSync(od);
    const versOd = path.join(od, dest.SOUS_DOSSIER_ONEDRIVE);

    // OneDrive : le dossier dédié est créé à la première copie.
    const r1 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: versOd, garder: dest.GARDER_ONEDRIVE, type: 'onedrive' });
    assert.equal(r1.statut, 'faite', r1.message);
    assert.equal(r1.dossierCree, true);
    assert.equal(r1.onedrive, true);
    assert.equal(r1.memeDisque, false, 'OneDrive n\'est pas « le même disque » : la copie part en ligne');
    assert.deepEqual(joursLaBas(versOd), ['2026-10-05']);
    // De vieilles copies là-bas, un fichier à Pierre et une copie faite à la main : seule la plus récente des nôtres reste.
    fauxJeu(versOd, '2026-10-01');
    fauxJeu(versOd, '2026-10-02');
    fs.writeFileSync(path.join(versOd, 'notes.txt'), 'à Pierre');
    fs.writeFileSync(path.join(versOd, 'cotemaster-2026-10-02 - Copie.db.gz'), 'à la main');
    fs.writeFileSync(path.join(sauvegardes, plan.nomsDuJour('2026-10-06').base), 'nouvelle');
    fs.writeFileSync(path.join(sauvegardes, plan.nomsDuJour('2026-10-06').bilan), '{}');
    const r2 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: versOd, garder: dest.GARDER_ONEDRIVE, type: 'onedrive' });
    assert.equal(r2.statut, 'faite', r2.message);
    assert.equal(r2.dossierCree, false);
    assert.deepEqual(joursLaBas(versOd), ['2026-10-06'], 'une seule copie gardée sur OneDrive');
    assert.deepEqual(r2.copiesLaBas.map((c) => c.jour), ['2026-10-06']);
    assert.ok(fs.existsSync(path.join(versOd, 'notes.txt')) && fs.existsSync(path.join(versOd, 'cotemaster-2026-10-02 - Copie.db.gz')));

    // Clé USB (dossier) : deux copies au plus ; garder au-delà de 2 est ramené à 2.
    const cle = path.join(tmp, 'cle');
    fs.mkdirSync(cle);
    for (const jour of ['2026-10-01', '2026-10-02', '2026-10-03']) fauxJeu(cle, jour);
    fs.writeFileSync(path.join(cle, 'photos.jpg'), 'à ne pas toucher');
    const r3 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: cle, garder: 5, type: 'dossier' });
    assert.equal(r3.statut, 'faite', r3.message);
    assert.equal(r3.garder, 2);
    assert.equal(r3.dossierCree, false);
    assert.deepEqual(joursLaBas(cle), ['2026-10-03', '2026-10-06'], 'deux copies au plus sur un dossier');
    assert.ok(fs.existsSync(path.join(cle, 'photos.jpg')));
    assert.ok(!fs.readdirSync(cle).some((n) => n.includes('.en-cours')) && !fs.readdirSync(versOd).some((n) => n.includes('.en-cours')));
  } finally {
    nettoyer(tmp);
  }
});

test('dossiers interdits : jamais le dossier des sauvegardes, jamais un dossier du projet, jamais hors du bac (dans le bac)', async () => {
  const tmp = dossierTemporaire();
  try {
    const sauvegardes = path.join(tmp, 'sauvegardes');
    const runtime = path.join(tmp, 'runtime');
    const cle = path.join(tmp, 'cle');
    for (const d of [sauvegardes, runtime, cle, path.join(sauvegardes, 'sous-dossier')]) fs.mkdirSync(d, { recursive: true });
    const interdite = (d) => f.raisonInterdite(d, { dossierSauvegardes: sauvegardes });
    assert.match(interdite(sauvegardes), /ne peut pas être le dossier des sauvegardes/);
    assert.match(interdite(path.join(sauvegardes, 'sous-dossier')), /ne peut pas être le dossier des sauvegardes/);
    assert.match(interdite(tmp), /ni le contenir/);
    assert.match(interdite(f.DOSSIER_PROJET), /ne peut pas être un dossier du projet/);
    assert.match(interdite(path.join(f.DOSSIER_PROJET, 'server', 'data', 'runtime')), /ne peut pas être un dossier du projet/);
    assert.match(interdite(path.join(SERVEUR, 'src')), /ne peut pas être un dossier du projet/);
    assert.equal(interdite(cle), null);
    if (f.bacActif()) {
      assert.match(interdite(os.tmpdir()), /Bac à sable : copie hors disque refusée hors du bac/);
      assert.match(interdite(VRAIES_SAUVEGARDES), /refusée hors du bac/);
    }
    // Le choix : refusé avant toute écriture (aucun fichier de choix créé).
    const enregistrer = (choix) => dest.enregistrerChoix(choix, { dossierDonnees: runtime, dossierSauvegardes: sauvegardes, environnement: {} });
    const refus = [
      [{ type: 'dossier', chemin: sauvegardes }, /dossier des sauvegardes/],
      [{ type: 'dossier', chemin: path.join(sauvegardes, 'sous-dossier') }, /dossier des sauvegardes/],
      [{ type: 'dossier', chemin: path.join(f.DOSSIER_PROJET, 'server') }, /dossier du projet/],
      [{ type: 'dossier', chemin: 'relatif\\dossier' }, /n'est pas un chemin absolu/],
      [{ type: 'dossier', chemin: 'E:' }, /n'est pas un chemin absolu/],
      [{ type: 'dossier', chemin: '' }, /^Indiquez le dossier/],
      [{ type: 'dossier', chemin: path.join(cle, 'pas-la') }, /n'existe pas \(clé débranchée \?\)/],
      [{ type: 'onedrive' }, /OneDrive n'est pas détecté/],
      [{ type: 'disquette' }, /onedrive, dossier ou aucune/]
    ];
    if (f.bacActif()) refus.push([{ type: 'dossier', chemin: os.tmpdir() }, /refusée hors du bac/]);
    for (const [choix, motif] of refus) {
      assert.throws(() => enregistrer(choix), (e) => e instanceof dest.DestinationInvalide && motif.test(e.message), JSON.stringify(choix));
    }
    assert.deepEqual(fs.readdirSync(runtime), [], 'rien d\'enregistré');
    // À la copie aussi (le jeu à copier n'existe pas : même une garde défaillante n'écrirait rien).
    const r = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: path.join(f.DOSSIER_PROJET, 'server', 'data', 'runtime'), type: 'dossier' });
    assert.equal(r.statut, 'erreur');
    assert.match(r.message, /dossier du projet/);
  } finally {
    nettoyer(tmp);
  }
});

test('clé débranchée ou OneDrive disparu : rien n\'est écrit, l\'alerte le dit ; « Aucune » n\'alerte plus', async () => {
  const tmp = dossierTemporaire();
  try {
    const sauvegardes = path.join(tmp, 'sauvegardes');
    fs.mkdirSync(sauvegardes);
    fauxJeu(sauvegardes, '2026-10-05');
    const debranchee = path.join(tmp, 'cle-debranchee');
    const r1 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: debranchee, type: 'dossier' });
    assert.equal(r1.statut, 'absente');
    assert.match(r1.message, /clé débranchée/);
    assert.equal(fs.existsSync(debranchee), false, 'jamais créé');
    const sansOneDrive = path.join(tmp, 'onedrive-parti', dest.SOUS_DOSSIER_ONEDRIVE);
    const r2 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: sansOneDrive, type: 'onedrive', garder: 1 });
    assert.equal(r2.statut, 'absente');
    assert.match(r2.message, /OneDrive arrêté ou délié/);
    assert.equal(fs.existsSync(path.dirname(sansOneDrive)), false, 'OneDrive lui-même n\'est jamais créé');
    const r3 = await f.copierHorsDisque({ dossierSauvegardes: sauvegardes, destination: null, type: 'onedrive', absente: "OneDrive n'est pas détecté sur ce PC" });
    assert.equal(r3.statut, 'absente');
    assert.match(r3.message, /OneDrive n'est pas détecté sur ce PC : rien n'a été copié/);

    // Les alertes : tirées de l'essai fait vers la destination EN VIGUEUR.
    const maintenant = new Date('2026-10-06T10:00:00Z');
    const reussie = { ok: true, fin: '2026-10-05T23:00:00Z' };
    const saine = { saine: true, fin: '2026-10-05T23:10:00Z' };
    const codes = (horsDisque, tentative = r1) =>
      plan.alertesSauvegarde({ maintenant, sauvegarde: { derniere: reussie, derniereReussie: reussie, horsDisque: { derniereTentative: tentative } }, restauration: { derniere: saine, derniereSaine: saine }, horsDisque }).map((a) => a.code);
    assert.deepEqual(codes({ reglage: 'configuree', type: 'dossier', destination: debranchee }), ['hors-disque-absente']);
    const texte = plan.alertesSauvegarde({ maintenant, sauvegarde: { horsDisque: { derniereTentative: r1 } }, horsDisque: { reglage: 'configuree', type: 'dossier', destination: debranchee } }).find((a) => a.code === 'hors-disque-absente').texte;
    assert.match(texte, /clé débranchée \? Rien n'a été copié/);
    // Choix changé depuis : l'échec vers l'ancienne clé ne compte plus ; la nouvelle destination attend sa première copie.
    assert.deepEqual(codes({ reglage: 'configuree', type: 'onedrive', destination: path.join(tmp, 'od', dest.SOUS_DOSSIER_ONEDRIVE) }), ['hors-disque-jamais']);
    // « Aucune » : plus d'alerte, même après un échec.
    assert.deepEqual(codes({ reglage: 'refusee', type: 'aucune', destination: null }), []);
    // OneDrive choisi mais introuvable ; choix illisible ; rien de réglé.
    assert.deepEqual(codes({ reglage: 'configuree', type: 'onedrive', destination: null, probleme: "OneDrive n'est pas détecté sur ce PC" }, r3), ['hors-disque-onedrive-absent']);
    assert.deepEqual(codes({ reglage: 'illisible', type: null, destination: null, probleme: 'abîmé' }), ['hors-disque-reglage-illisible']);
    assert.deepEqual(codes({ reglage: 'non-configuree' }), ['hors-disque-non-configuree']);
  } finally {
    nettoyer(tmp);
  }
});

test('essai réel : sauvegarde de nuit et copie vers le FAUX OneDrive du bac, une seule gardée ; choix enregistré prioritaire ; clé débranchée', () => {
  const tmp = dossierTemporaire();
  try {
    const base = path.join(tmp, 'base', 'match-stats.db');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    petiteBase(base);
    const runtime = path.join(tmp, 'runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtime, 'predictions.json'), '[]');
    const sauvegardes = path.join(tmp, 'sauvegardes');
    const fauxOneDrive = path.join(tmp, 'faux-onedrive');
    const cle = path.join(tmp, 'fausse-cle');
    for (const d of [fauxOneDrive, cle]) fs.mkdirSync(d);
    if (f.bacActif()) assert.ok(bac.estDans(fauxOneDrive, f.bacActif()), 'le faux OneDrive est DANS le bac');
    const versOd = path.join(fauxOneDrive, dest.SOUS_DOSSIER_ONEDRIVE);
    const choisir = (choix) => fs.writeFileSync(path.join(runtime, dest.NOM_FICHIER_REGLAGE), JSON.stringify({ version: 1, ...choix }));
    const env = { MATCH_STATS_DB: base, [dest.VARIABLE_ESSAI_ONEDRIVE]: fauxOneDrive };
    const nuit = (args = [], enPlus = {}) => script('backup-db.mjs', ['--dir', sauvegardes, '--donnees', runtime, ...args], { ...env, ...enPlus });
    const etat = () => JSON.parse(fs.readFileSync(path.join(sauvegardes, 'etat-sauvegarde.json'), 'utf8')).horsDisque;
    const aujourdHui = plan.jourParis();

    // 1. Ni choix ni variable : OneDrive par défaut (le faux), dossier dédié créé, copie faite.
    const s1 = nuit();
    assert.equal(s1.code, 0, s1.sortie + s1.erreurs);
    assert.equal(s1.json.horsDisque.statut, 'faite', s1.json.horsDisque.message);
    assert.equal(s1.json.horsDisque.type, 'onedrive');
    assert.equal(s1.json.horsDisque.destination, versOd);
    assert.equal(s1.json.horsDisque.dossierCree, true);
    assert.deepEqual(joursLaBas(versOd), [aujourdHui]);
    assert.equal(etat().source, 'defaut-onedrive');
    assert.equal(etat().garder, 1);

    // 2. Une vieille copie là-bas : la suivante la remplace, une seule reste ; le reste n'est pas touché.
    fauxJeu(versOd, '2026-10-01');
    fs.writeFileSync(path.join(versOd, 'notes.txt'), 'à Pierre');
    const s2 = nuit(['--hors-disque-maintenant']);
    assert.equal(s2.json.horsDisque.statut, 'faite', s2.sortie);
    assert.deepEqual(joursLaBas(versOd), [aujourdHui], 'une seule copie gardée sur OneDrive');
    assert.ok(s2.json.horsDisque.supprimees.includes(plan.nomsDuJour('2026-10-01').base));
    assert.ok(fs.existsSync(path.join(versOd, 'notes.txt')));
    // Même destination, même semaine : pas due.
    assert.equal(nuit().json.horsDisque.statut, 'pas-due');

    // 3. Le choix enregistré passe devant la variable et le OneDrive par défaut ; destination neuve = copie dès cette nuit.
    choisir({ type: 'dossier', chemin: cle });
    const s3 = nuit([], { CM_SAUVEGARDE_HORS_DISQUE: path.join(tmp, 'autre') });
    assert.equal(s3.json.horsDisque.statut, 'faite', s3.sortie);
    assert.equal(s3.json.horsDisque.destination, cle);
    assert.equal(s3.json.horsDisque.type, 'dossier');
    assert.equal(etat().source, 'reglage');
    assert.deepEqual(joursLaBas(cle), [aujourdHui]);
    assert.equal(fs.existsSync(path.join(tmp, 'autre')), false);

    // 4. « Aucune » : rien ne part, pas d'alerte hors disque.
    choisir({ type: 'aucune' });
    const s4 = nuit(['--hors-disque-maintenant']);
    assert.equal(s4.json.horsDisque.statut, 'refusee');
    const e4 = etatSauvegardesIsole({ base, sauvegardes, runtime, onedrive: fauxOneDrive });
    assert.equal(e4.horsDisque.reglage, 'refusee');
    assert.ok(!e4.alertes.some((a) => a.code.startsWith('hors-disque')), JSON.stringify(e4.alertes));

    // 5. Clé débranchée la nuit venue : rien n'est écrit, l'état le garde, l'alerte le dit.
    const debranchee = path.join(tmp, 'cle-du-jeudi');
    fs.mkdirSync(debranchee);
    choisir({ type: 'dossier', chemin: debranchee });
    fs.rmdirSync(debranchee);
    const s5 = nuit();
    assert.equal(s5.json.ok, true, 'la sauvegarde de la nuit est faite quand même');
    assert.equal(s5.json.horsDisque.statut, 'absente');
    assert.equal(fs.existsSync(debranchee), false);
    assert.equal(etat().derniereTentative.statut, 'absente');
    const e5 = etatSauvegardesIsole({ base, sauvegardes, runtime, onedrive: fauxOneDrive });
    assert.deepEqual(e5.alertes.filter((a) => a.code.startsWith('hors-disque')).map((a) => a.code), ['hors-disque-absente']);
    assert.equal(e5.horsDisque.verification.utilisable, false);
    // La copie OneDrive d'avant est restée là-bas.
    assert.deepEqual(joursLaBas(versOd), [aujourdHui]);
  } finally {
    nettoyer(tmp);
  }
});

/** etatSauvegardes() dans un processus à part, sur la petite base, sans le vrai OneDrive (le faux à la place) : ce que lit la carte. */
function etatSauvegardesIsole({ base, sauvegardes, runtime, onedrive }) {
  const module = pathToFileURL(path.join(SERVEUR, 'src', 'data', 'sauvegardes', 'etatSauvegardes.js')).href;
  const code = `
    const { etatSauvegardes } = await import(${JSON.stringify(module)});
    console.log('ETAT ' + JSON.stringify(etatSauvegardes({ dossier: ${JSON.stringify(sauvegardes)}, donnees: ${JSON.stringify(runtime)} })));`;
  const env = environnementSansOneDrive(['CM_BAC_A_SABLE', 'MATCH_STATS_DB', 'CM_SAUVEGARDE_HORS_DISQUE']);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: SERVEUR, env: { ...env, MATCH_STATS_DB: base, [dest.VARIABLE_ESSAI_ONEDRIVE]: onedrive }, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return JSON.parse(r.stdout.split('ETAT ')[1]);
}

test('routes de la destination (copie isolée) : PUT idempotent, vérification sans écriture, choix refusés en 400, alerte durable à jour', () => {
  const copie = preparerCopie();
  try {
    const fauxOneDrive = path.join(copie.dossier, 'faux-onedrive');
    const cle = path.join(copie.dossier, 'fausse-cle');
    for (const d of [fauxOneDrive, cle]) fs.mkdirSync(d);
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-destination.mjs'), { args: [fauxOneDrive, cle], env: { [dest.VARIABLE_ESSAI_ONEDRIVE]: fauxOneDrive } });
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.equal(r.reseau, false);
    const s = r.json;
    const versOd = path.join(fauxOneDrive, dest.SOUS_DOSSIER_ONEDRIVE);

    // Par défaut : le faux OneDrive, sans choix enregistré.
    assert.equal(s.initial.reglage, 'configuree');
    assert.equal(s.initial.type, 'onedrive');
    assert.equal(s.initial.source, 'defaut-onedrive');
    assert.equal(s.initial.destination, versOd);
    assert.equal(s.initial.utilisable, true, JSON.stringify(s.initial.problemes));
    assert.equal(s.initial.fichierChoix, false);
    assert.ok(s.initial.alertes.includes('hors-disque-jamais'));

    // Vérifier n'écrit rien, ne crée pas le dossier de OneDrive.
    assert.deepEqual(s.verifications.onedrive, { code: 200, utilisable: true, aCreer: true, destination: versOd, variable: 'CM_TEST_ONEDRIVE', essai: true });
    assert.equal(s.verifications.cle.utilisable, true);
    assert.equal(s.verifications.cle.destination, cle, 'guillemets et barre finale retirés');
    assert.ok(s.verifications.cle.libre > 0);
    assert.deepEqual(s.verifications.relatif, { code: 200, utilisable: false, problemes: ['chemin'] });
    assert.equal(s.verifications.type.code, 400);
    assert.equal(s.verifications.rienEcrit, true);
    assert.equal(s.verifications.dossierOneDriveCree, false);

    // Choix refusés : 400 avec la raison, rien d'enregistré.
    const attendus = {
      relatif: /n'est pas un chemin absolu/,
      absent: /n'existe pas \(clé débranchée \?\)/,
      sauvegardes: /dossier des sauvegardes/,
      dansSauvegardes: /dossier des sauvegardes/,
      projet: /dossier du projet/,
      racineProjet: /dossier du projet/,
      type: /onedrive, dossier ou aucune/,
      sansType: /"type" est requis/,
      cheminPasTexte: /"chemin" est une chaîne/,
      ...(s.bacActif ? { horsDuBac: /refusée hors du bac/ } : {})
    };
    assert.deepEqual(Object.keys(s.refus).sort(), Object.keys(attendus).sort());
    for (const [cas, motif] of Object.entries(attendus)) {
      assert.equal(s.refus[cas].code, 400, `${cas} : ${s.refus[cas].erreur}`);
      assert.match(s.refus[cas].erreur, motif, cas);
    }
    assert.equal(s.refusRienEcrit, true);

    // Clé USB enregistrée ; rejouée (autre écriture du même chemin) : rien de réécrit.
    assert.equal(s.cle.code, 200);
    assert.equal(s.cle.change, true);
    assert.deepEqual({ type: s.cle.hd.type, source: s.cle.hd.source, destination: s.cle.hd.destination, garder: s.cle.hd.garder }, { type: 'dossier', source: 'reglage', destination: cle, garder: 2 });
    assert.deepEqual({ type: s.cle.fichier.type, chemin: s.cle.fichier.chemin, version: s.cle.fichier.version }, { type: 'dossier', chemin: cle, version: 1 });
    assert.ok(s.cle.alertes.includes('hors-disque-jamais'));
    assert.deepEqual(s.cle.alerteDurable, s.cle.alertes, 'l\'alerte du haut de l\'appli suit tout de suite');
    assert.deepEqual(s.cle.rejoue, { code: 200, change: false, inchange: true });

    // « Aucune » : plus d'alerte hors disque, ni dans la carte ni en haut de l'appli.
    assert.equal(s.aucune.change, true);
    assert.equal(s.aucune.hd.reglage, 'refusee');
    assert.ok(!s.aucune.alertes.some((c) => c.startsWith('hors-disque')), s.aucune.alertes.join());
    assert.ok(!s.aucune.alerteDurable.some((c) => c.startsWith('hors-disque')), s.aucune.alerteDurable.join());

    // OneDrive choisi explicitement : une seule copie.
    assert.deepEqual({ code: s.onedrive.code, change: s.onedrive.change, type: s.onedrive.hd.type, source: s.onedrive.hd.source, destination: s.onedrive.hd.destination, garder: s.onedrive.hd.garder }, { code: 200, change: true, type: 'onedrive', source: 'reglage', destination: versOd, garder: 1 });

    // Choix illisible : dit, jamais remplacé par OneDrive ; le suivant le met de côté.
    assert.equal(s.illisible.hd.reglage, 'illisible');
    assert.ok(s.illisible.alertes.includes('hors-disque-reglage-illisible'));
    assert.deepEqual(s.illisible.apres, { code: 200, change: true, type: 'aucune' });
    assert.equal(s.illisible.misDeCote, 1);

    // Ni choix, ni variable, ni OneDrive : non réglée.
    assert.equal(s.nonReglee.hd.reglage, 'non-configuree');
    assert.ok(s.nonReglee.alertes.includes('hors-disque-non-configuree'));
  } finally {
    copie.nettoyer();
  }
});

test('le vrai dossier des sauvegardes de l\'appli et le vrai OneDrive\\CoteMaster-sauvegardes n\'ont pas bougé (lecture de la liste seulement)', () => {
  assert.deepEqual(empreinteVraiesSauvegardes(), AVANT);
  assert.deepEqual(empreinteDossier(VRAIE_DESTINATION_ONEDRIVE), AVANT_ONEDRIVE);
});
