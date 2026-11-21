/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie A — L'ÉTAPE 0 : les modes de scripts/etape46.mjs écrits en
 * partie A (--restaurer, --libelles, --mesurer-additionnel, --recopier-additionnel) et ses refus, dans une COPIE ISOLÉE
 * rangée dans un FAUX bac (aides/bacSimule.mjs : le même comportement depuis le bac et depuis le dépôt ; réseau coupé,
 * heure figée), sur des bases FABRIQUÉES ici (aucun vrai match, aucun nom dans les sorties). Le script est COPIÉ dans la
 * copie (code/server/scripts) : il n'écrit que le reglagesDirect.js de la copie, jamais celui du bac.
 *   node --test test/directEtape0.test.mjs        (depuis server/)
 *
 *   E0-1 les refus : aucun mode, deux modes, chacun des six modes du banc qui dépendent de la colonne (« colonne non
 *        fixée », rien écrit), une sortie sous
 *        OneDrive, une sortie hors du bac, la vraie base (celle du faux dossier personnel), une base hors du bac ;
 *   E0-2 --libelles sur un live_snapshots fabriqué : les FAITS attendus (patrons avec le LRM, types, inconnus, rouges lus,
 *        âge du détail, liste seule, règle de R16), aucun nom, base intacte, sortie jamais écrasée ;
 *   E0-3 --mesurer-additionnel sur un magasin fabriqué à loi connue : comptes, table de la conception § 2.5 recalculée ici
 *        (monotone, plancher, plafond X), la fenêtre déjà vue seulement (le 24/09/2026, premier jour du banc, jamais lu),
 *        les moyennes de R14 ;
 *   E0-4 --recopier-additionnel de cette mesure : entre les balises de la copie, relue par import ; deux fois → mêmes
 *        octets ; une mesure hors de la fenêtre refusée, module intact ;
 *   E0-5 la mesure RÉELLE du 11/11 (fixture direct-additionnel.json) recopiée dans une copie aux tables vides redonne
 *        reglagesDirect.js du code À L'OCTET ;
 *   E0-6 --restaurer : un .gz fabriqué, le sha256 du bilan, la passe null → copie contrôlée (quick_check, rencontres) ;
 *        sha256 faux → refus et copie retirée ; passe qui tourne → refus ; cible existante → refus.
 *   E0-7 (S3 de la vérification « sûreté », 13/11/2026) les deux refus de TÊTE du script (etape46.mjs, non retouché) : le
 *        script rangé sous OneDrive (avec ou sans CM_BAC_A_SABLE=1) ou hors du bac sans copie d'essai (sans variable, ou
 *        CM_TEST_DOSSIER pointé sur un dossier étranger), lancé tel quel (jamais par executer(), qui pose CM_TEST_DOSSIER)
 *        dans un dossier temporaire du système HORS du bac → code 2, le refus dit, rien écrit.
 * Les tests du banc (T-B1 à T-B10, R13 à R21, O9, O12, les refus « colonne non fixée », « grilles mêlées », « principal de
 * la 28 pas rendu ») sont dans directBanc.test.mjs (partie C) : ceux-ci ne portent que sur l'étape 0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
// Partie C (13/11/2026) : la copie de E0-1 remise « avant le scellement » (le code est scellé à la manœuvre de dimanche).
import { copieAvantLeSceau } from './aides/bancFabrique.mjs';
import { LOI_TABLE } from '../src/data/simulation/reglages.js';

const C = String.fromCharCode;
const LRM = C(0x200e);
const RSQ = C(0x2019);
const fm = (m) => `${m}${LRM}${RSQ}${LRM}`;
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const REGLAGES_DU_CODE = path.join(SERVEUR, 'src', 'data', 'direct', 'reglagesDirect.js');

/** Le script de l'étape 0 COPIÉ dans la copie : SERVEUR, REGLAGES et les imports du script sont alors ceux de la copie. */
function installerScript(copie) {
  const dossier = path.join(copie.serveur, 'scripts');
  fs.mkdirSync(dossier, { recursive: true });
  const cible = path.join(dossier, 'etape46.mjs');
  fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape46.mjs'), cible);
  return cible;
}
const lancer = (copie, script, args) => {
  const r = executerDansLeBac(copie, script, { args });
  assert.equal(r.reseau, false, 'aucun appel réseau');
  return r;
};
const refuse = (r, motif, qui) => {
  assert.equal(r.code, 2, `${qui} : code ${r.code} — ${r.erreurs.slice(-600)}`);
  assert.ok(r.json && typeof r.json.refus === 'string', `${qui} : une ligne JSON de refus (${r.sortie.slice(-300)})`);
  assert.match(r.json.refus, motif, `${qui} : ${r.json.refus}`);
};
/** Tous les fichiers sous un dossier (chemins relatifs), pour voir qu'un refus n'a rien écrit. */
const inventaire = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).sort() : []);

// ------------------------------------------------------------ E0-1 : les refus

test('E0-1 les refus : aucun mode, deux modes, les six modes du banc qui dépendent de la colonne (« colonne non fixée », rien écrit), une sortie sous OneDrive ou hors du bac, la vraie base, une base hors du bac', () => {
  const copie = copieAvantLeSceau(preparerCopieDeBac({ base: false }));
  try {
    const script = installerScript(copie);
    const avant = inventaire(copie.dossier);
    refuse(lancer(copie, script, []), /un seul mode/, 'aucun mode');
    refuse(lancer(copie, script, ['--libelles', '--mesurer-additionnel']), /un seul mode/, 'deux modes');
    // Partie C : tant que --fixer-colonne n'est pas passé (la colonne de O10 est fixée au scellement), les six modes du banc qui
    // en dépendent refusent, sans rien écrire (directBanc.test.mjs les essaie aussi, avec la colonne fixée).
    for (const mode of ['--sceller', '--exporter', '--comptes', '--banc', '--preuve', '--recopier']) {
      refuse(lancer(copie, script, [mode]), /^colonne non fixée/, mode);
    }
    assert.deepEqual(inventaire(copie.dossier), avant, 'aucun fichier écrit par un refus');
    refuse(lancer(copie, script, ['--libelles', '--dossier', path.join(copie.dossier, 'OneDrive', 'sortie')]), /sous OneDrive/, 'sortie sous OneDrive');
    const horsDuBac = path.join(copie.maison, '..', `hors-du-bac-46-${process.pid}`);
    refuse(lancer(copie, script, ['--libelles', '--dossier', horsDuBac]), /hors du bac/, 'sortie hors du bac');
    assert.equal(fs.existsSync(horsDuBac), false, 'rien créé hors du bac');
    const vraie = path.join(copie.maison, 'CoteMaster', 'match-stats.db');
    refuse(lancer(copie, script, ['--libelles', '--dossier', path.join(copie.dossier, 'sortie-1'), '--base', vraie]), /VRAIE base/, 'la vraie base');
    refuse(lancer(copie, script, ['--mesurer-additionnel', '--dossier', path.join(copie.dossier, 'sortie-2'), '--base', path.join(horsDuBac, 'x.db')]), /pas dans le bac/, 'base hors du bac');
    assert.equal(fs.existsSync(vraie), false, 'la vraie base (fausse) jamais créée');
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------------------ E0-2 : --libelles

const DDL_LIVE = `CREATE TABLE live_snapshots (
  fotmob_id TEXT NOT NULL, taken_at TEXT NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, kickoff TEXT, league TEXT,
  league_key TEXT, home_id TEXT, away_id TEXT, home_name TEXT, away_name TEXT, status TEXT NOT NULL, minute INTEGER,
  added_time INTEGER, minute_label TEXT, home_goals INTEGER, away_goals INTEGER, home_red INTEGER, away_red INTEGER,
  xg_home REAL, xg_away REAL, stats TEXT, coverage TEXT, detail_at TEXT, source TEXT NOT NULL,
  PRIMARY KEY (fotmob_id, taken_at)) WITHOUT ROWID`;

/** Huit instantanés de deux matchs fabriqués (coup d'envoi 19 h UTC), avec les FAITS que --libelles doit en tirer. */
function baseDesInstantanes(fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  db.exec(DDL_LIVE);
  const ins = db.prepare(
    'INSERT INTO live_snapshots (fotmob_id, taken_at, kind, date, kickoff, league, league_key, home_name, away_name, status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, coverage, detail_at, source) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const t = (hm) => `2026-11-14T${hm}:00.000Z`;
  const ligne = (id, hm, status, minute, label, source, detailAt, rh, ra) =>
    ins.run(id, t(hm), status === 'terminé' ? 'fin' : 'minute', '2026-11-14', t('19:00'), 'Ligue fabriquée', 'XXX|Ligue fabriquée', 'Club fabriqué Un', 'Club fabriqué Deux', status, minute, null, label, 0, 0, rh, ra, 'complete', detailAt, source);
  // Match A : détails lus, un rouge vu.
  ligne('4600101', '19:10', 'en cours', 10, fm(10), 'detail', t('19:10'), 0, 0);
  ligne('4600101', '19:13', 'en cours', 13, fm(13), 'liste', t('19:10'), null, null);
  ligne('4600101', '19:50', 'mi-temps', 45, 'HT', 'liste', null, null, null);
  ligne('4600101', '20:52', 'en cours', 93, fm(93), 'detail', t('20:52'), 1, 0);
  ligne('4600101', '21:00', 'terminé', null, 'FT', 'detail', t('21:00'), 1, 0);
  // Match B : jamais de détail, aucun rouge lu ; un libellé inconnu et un « PET » plus de 110 minutes après le coup d'envoi.
  ligne('4600102', '19:20', 'en cours', 20, fm(20), 'liste', null, null, null);
  ligne('4600102', '21:05', 'en cours', null, 'XYZ', 'liste', null, null, null);
  ligne('4600102', '21:10', 'en cours', null, 'PET', 'liste', null, null, null);
  db.close();
}

test('E0-2 --libelles sur un live_snapshots fabriqué : patrons (le LRM en hex), types, inconnus, rouges lus, âge du détail, liste seule, règle de R16 ; aucun nom ; base intacte ; sortie jamais écrasée', () => {
  const copie = preparerCopieDeBac({ base: false });
  try {
    const script = installerScript(copie);
    const base = path.join(copie.dossier, 'base', 'instantanes.db');
    baseDesInstantanes(base);
    const empreinteBase = sha1(base);
    const sortie = path.join(copie.dossier, 'banc46-essai');
    const r = lancer(copie, script, ['--libelles', '--base', base, '--dossier', sortie]);
    assert.equal(r.code, 0, r.erreurs.slice(-1500));
    assert.equal(r.json.ok, true);
    assert.equal(r.json.instantanes, 8);
    assert.equal(r.json.patrons, 5);
    assert.equal(r.json.inconnus, 1);
    assert.equal(r.json.regleR16, true);
    const j = JSON.parse(fs.readFileSync(path.join(sortie, 'libelles.json'), 'utf8'));
    const txt = fs.readFileSync(path.join(sortie, 'libelles.txt'), 'utf8');
    assert.deepEqual(j.listeSeule, { n: 5, part: 0.625 });
    const patron = (status, p) => j.patrons.find((x) => x.status === status && x.patron === p);
    const minute = patron('en cours', "99'");
    assert.equal(minute.type, 'minute');
    assert.equal(minute.n, 4);
    assert.deepEqual(minute.formesHex, [{ hex: '3939E2808EE28099E2808E', n: 4 }], 'chiffres, LRM, apostrophe typographique, LRM');
    assert.equal(minute.plusPetit.texte, "10'");
    assert.equal(minute.plusGrand.texte, "93'");
    assert.equal(patron('en cours', 'XYZ').type, 'inconnu');
    assert.equal(patron('en cours', 'PET').type, 'prolongation');
    assert.equal(patron('mi-temps', 'HT').type, 'mi-temps');
    assert.equal(patron('terminé', 'FT').type, 'fin');
    assert.deepEqual(j.inconnus.map((i) => [i.status, i.patron, i.n]), [['en cours', 'XYZ', 1]]);
    assert.deepEqual(j.rouges, { matchsSuivis: 2, avecUnRougeLu: 1, sansRougeLu: 1, avecUnRougeVu: 1, sansAucunDetail: 1, partSansRougeLu: 0.5 });
    // Âges (minutes) aux instantanés « en cours » : A 0, 3, 0 ; B jamais de détail (3 sans détail encore).
    assert.deepEqual(
      { n: j.agesDuDetail.instantanesEnCours, mesures: j.agesDuDetail.mesures, sans: j.agesDuDetail.sansDetailEncore, med: j.agesDuDetail.mediane, p75: j.agesDuDetail.p75, p90: Math.round(j.agesDuDetail.p90 * 1e9) / 1e9, max: j.agesDuDetail.max },
      { n: 6, mesures: 3, sans: 3, med: 0, p75: 1.5, p90: 2.4, max: 3 }
    );
    assert.equal(j.regleR16.declenchee, true, 'plus de 20 % des matchs sans rouge lu');
    assert.deepEqual(j.minutes45.tous, [{ minute: 45, added_time: null, n: 1 }, { minute: 93, added_time: null, n: 1 }]);
    assert.deepEqual(j.apres110.map((p) => `${p.status}|${p.patron}|${p.n}`).sort(), ["en cours|99'|1", 'en cours|PET|1', 'en cours|XYZ|1', 'terminé|FT|1']);
    assert.match(txt, /instantanés de la liste seule : 5 sur 8 \(62,5\s%\)/);
    assert.match(txt, /règle de R16 .* DÉCLENCHÉE/);
    assert.match(txt, /Libellés de type « inconnu » : en cours « XYZ » ×1/);
    for (const texte of [txt, JSON.stringify(j)]) assert.ok(!/Club fabriqué/.test(texte), 'aucun nom de club dans les sorties');
    assert.equal(sha1(base), empreinteBase, 'base lue en lecture seule, intacte');
    // Jamais écrasée : un second passage sur le même dossier est refusé, les sorties ne bougent pas.
    const avant = [sha1(path.join(sortie, 'libelles.txt')), sha1(path.join(sortie, 'libelles.json'))];
    refuse(lancer(copie, script, ['--libelles', '--base', base, '--dossier', sortie]), /existe déjà/, 'second passage');
    assert.deepEqual([sha1(path.join(sortie, 'libelles.txt')), sha1(path.join(sortie, 'libelles.json'))], avant);
    assert.equal(fs.existsSync(copie.base), false, 'la base de la copie jamais ouverte (aucun openDb)');
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------------------ E0-3 à E0-5 : --mesurer-additionnel, --recopier-additionnel

/** Les comptes q(x) FABRIQUÉS (un but par rencontre, 1-0) : 45 + x et 90 + x ; le 90 + 12 reçoit en plus le but d'un match prolongé. */
const Q45 = [0, 1000, 210, 205];
const Q91_TIRES = [0, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 20];

/**
 * Le magasin fabriqué : les rencontres de Q45 et Q91_TIRES dans la fenêtre déjà vue (« Ligue A » et « Ligue B » en
 * alternance), plus les cas de bord ; rend les rencontres insérées (pour recalculer ici les comptes et les moyennes).
 */
function magasinFabrique(fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  db.exec('CREATE TABLE matches (id INTEGER PRIMARY KEY, date TEXT, league TEXT, home_goals INTEGER, away_goals INTEGER, events TEXT, meta TEXT)');
  db.exec('BEGIN');
  const ins = db.prepare('INSERT INTO matches (date, league, home_goals, away_goals, events, meta) VALUES (?, ?, ?, ?, ?, ?)');
  const rencontres = [];
  const ajouter = (r) => {
    rencontres.push(r);
    ins.run(r.date, r.league, r.hg, r.ag, typeof r.events === 'string' ? r.events : JSON.stringify(r.events), JSON.stringify(r.meta ?? {}));
  };
  const jour = (i) => new Date(Date.UTC(2023, 6, 1) + (i % 1150) * 86_400_000).toISOString().slice(0, 10);
  let i = 0;
  const tirer = (minute, q) =>
    q.forEach((n, x) => {
      for (let k = 0; k < n; k++, i++) ajouter({ date: jour(i), league: i % 2 ? 'Ligue B' : 'Ligue A', hg: 1, ag: 0, events: [{ type: 'goal', minute, addedTime: x, side: 'home' }] });
    });
  tirer(45, Q45);
  tirer(90, Q91_TIRES);
  // Les cas de bord.
  ajouter({ date: '2024-03-02', league: 'Ligue A', hg: 1, ag: 0, events: [{ type: 'goal', minute: 90, addedTime: 1, side: 'home' }], meta: { awarded: true } });
  ajouter({ date: '2024-03-03', league: 'Ligue A', hg: null, ag: null, events: [] });
  ajouter({ date: '2024-03-04', league: 'Ligue A', hg: 1, ag: 0, events: '{pas du json' });
  ajouter({ date: '2024-03-05', league: 'Ligue B', hg: 2, ag: 0, events: [{ type: 'goal', minute: 90, addedTime: 1, side: 'home' }] });
  ajouter({ date: '2024-03-06', league: 'Ligue C', hg: 1, ag: 1, events: [{ type: 'goal', minute: 90, addedTime: 12, side: 'home' }, { type: 'goal', minute: 105, addedTime: null, side: 'away' }], meta: { reason: 'afterextra' } });
  ajouter({ date: '2024-03-07', league: 'Ligue B', hg: 2, ag: 0, events: [{ type: 'goal', minute: 60, addedTime: 3, side: 'home' }, { type: 'goal', minute: 95, addedTime: null, side: 'home' }] });
  // Hors de la fenêtre déjà vue : le premier jour du banc (P7) et la veille de la fenêtre — jamais lus.
  ajouter({ date: '2026-09-24', league: 'Ligue A', hg: 1, ag: 0, events: [{ type: 'goal', minute: 90, addedTime: 1, side: 'home' }], dehors: true });
  ajouter({ date: '2023-06-30', league: 'Ligue A', hg: 1, ag: 0, events: [{ type: 'goal', minute: 45, addedTime: 1, side: 'home' }], dehors: true });
  db.exec('COMMIT');
  db.close();
  return rencontres;
}

/** LA TABLE de la conception § 2.5, écrite ici depuis la règle (x*, S, reste, monotone, plafond X à 200 buts, plancher 0,05). */
function tableAttendue(q) {
  const total = q.slice(1).reduce((s, v) => s + v, 0);
  let X = 0;
  let xEtoile = 1;
  for (let x = 1; x < q.length; x++) {
    if (q[x] >= 200) X = x;
    if (q[x] > q[xEtoile]) xEtoile = x;
  }
  const S = [null];
  for (let x = 1; x < q.length; x++) S[x] = x <= xEtoile ? 1 : Math.min(S[x - 1], q[x] / q[xEtoile]);
  const brut = [null];
  for (let x = 1; x <= X; x++) brut[x] = (q[x] / 2 + q.slice(x + 1).reduce((s, v) => s + v, 0)) / S[x] / total;
  const reste = [null];
  for (let x = 1; x <= X; x++) reste[x] = x === 1 ? brut[x] : Math.min(brut[x], reste[x - 1]);
  for (let x = 1; x <= X; x++) reste[x] = Math.max(reste[x], 0.05);
  return { total, X, xEtoile, S, brut, reste };
}

const presDe = (a, b, tol, qui) => {
  assert.equal(a.length, b.length, `${qui} : longueur`);
  a.forEach((v, i) => (v === null ? assert.equal(b[i], null, `${qui}[${i}]`) : assert.ok(Math.abs(v - b[i]) <= tol, `${qui}[${i}] : ${v} contre ${b[i]}`)));
};

/** Le magasin fabriqué et sa mesure, dans une copie ; rend { copie, script, mesure (le fichier), rencontres }. */
function copieMesuree() {
  const copie = preparerCopieDeBac({ base: false });
  try {
    const script = installerScript(copie);
    const base = path.join(copie.dossier, 'base', 'magasin.db');
    const rencontres = magasinFabrique(base);
    const sortie = path.join(copie.dossier, 'banc46-essai');
    const r = lancer(copie, script, ['--mesurer-additionnel', '--base', base, '--dossier', sortie]);
    assert.equal(r.code, 0, r.erreurs.slice(-1500));
    return { copie, script, base, mesure: path.join(sortie, 'additionnel.json'), rencontres, r };
  } catch (error) {
    copie.nettoyer();
    throw error;
  }
}

test('E0-3 --mesurer-additionnel sur un magasin fabriqué à loi connue : comptes, table recalculée ici (monotone, plancher, plafond X), fenêtre déjà vue seulement, moyennes de R14', () => {
  const { copie, base, mesure, rencontres, r } = copieMesuree();
  try {
    const j = JSON.parse(fs.readFileSync(mesure, 'utf8'));
    assert.deepEqual(j.fenetre, { de: '2023-07-01', a: '2026-09-23' });
    const dedans = rencontres.filter((x) => !x.dehors);
    const tires = Q45.reduce((s, v) => s + v, 0) + Q91_TIRES.reduce((s, v) => s + v, 0);
    assert.deepEqual(j.comptes, {
      rencontres: dedans.length,
      attribuees: 1,
      sansScore: 1,
      evenementsIllisibles: 1,
      incompletes: 1,
      retenues: tires + 2,
      buts: tires + 4,
      buts45x: Q45.reduce((s, v) => s + v, 0),
      buts90x: Q91_TIRES.reduce((s, v) => s + v, 0) + 1,
      horsForme: { minutePlusDe90NonProlonge: 1, ajoutHors45Et90: 1 }
    });
    assert.equal(r.json.rencontres, dedans.length);
    // Les tables : q tel que fabriqué (le 90 + 12 du match prolongé compté, ni le 24/09/2026 ni le 30/06/2023).
    const q91 = Q91_TIRES.map((v, x) => (x === 12 ? v + 1 : v));
    const p = j.tempsAdditionnel.premiere;
    const s = j.tempsAdditionnel.seconde;
    assert.deepEqual(p.q, Q45);
    assert.deepEqual(s.q, q91);
    for (const [lue, q, qui] of [[p, Q45, '45'], [s, q91, '91']]) {
      const t = tableAttendue(q);
      assert.equal(lue.X, t.X, `X${qui}`);
      assert.equal(lue.xEtoile, t.xEtoile, `x*${qui}`);
      assert.equal(lue.total, t.total, `total${qui}`);
      presDe(lue.S, t.S, 1e-15, `S${qui}`);
      presDe(lue.resteBrut, t.brut, 1e-15, `resteBrut${qui}`);
      presDe(lue.reste, t.reste, 1e-15, `reste${qui}`);
      for (let x = 2; x <= lue.X; x++) assert.ok(lue.reste[x] <= lue.reste[x - 1], `reste${qui} monotone en ${x}`);
    }
    // Les trois règles exercées par la fabrication : monotone imposé (45 + 2), plafond (X = 3 et X = 12), plancher (90 + 12).
    assert.ok(p.resteBrut[2] > p.resteBrut[1] && p.reste[2] === p.reste[1], 'monotone imposé au 45 + 2');
    assert.equal(p.X, 3);
    assert.equal(s.X, 12, '90 + 13 (20 buts) au-delà du plafond');
    assert.equal(s.reste.length, 13);
    assert.ok(s.resteBrut[12] < 0.05 && s.reste[12] === 0.05, 'plancher 0,05 au 90 + 12');
    // R14 : les rencontres jouées, non attribuées, non prolongées, dans la fenêtre, rappelées vers LOI_TABLE sur 30.
    const ligues = {};
    for (const x of dedans) {
      if (x.meta?.awarded || x.hg === null || x.meta?.reason === 'afterextra') continue;
      ligues[x.league] ??= { matchs: 0, dom: 0, ext: 0 };
      ligues[x.league].matchs++;
      ligues[x.league].dom += x.hg;
      ligues[x.league].ext += x.ag;
    }
    assert.deepEqual(Object.keys(j.moyennes.championnats).sort(), Object.keys(ligues).sort());
    assert.equal(j.moyennes.championnats['Ligue C'], undefined, 'le seul match de la Ligue C est prolongé');
    for (const [cle, l] of Object.entries(ligues)) {
      const c = j.moyennes.championnats[cle];
      assert.equal(c.matchs, l.matchs);
      assert.ok(Math.abs(c.domicile - (l.dom + 30 * LOI_TABLE.domicile) / (l.matchs + 30)) <= 1e-12, `${cle} domicile`);
      assert.ok(Math.abs(c.exterieur - (l.ext + 30 * LOI_TABLE.exterieur) / (l.matchs + 30)) <= 1e-12, `${cle} extérieur`);
    }
    assert.equal(LOI_TABLE.priorMatchs, 30);
    assert.ok(!fs.readFileSync(mesure, 'utf8').includes('Club'), 'aucun nom de club');
    assert.equal(fs.existsSync(copie.base), false, 'la base de la copie jamais ouverte (aucun openDb)');
    assert.ok(fs.existsSync(base));
  } finally {
    copie.nettoyer();
  }
});

/** Remet les deux tables de reglagesDirect.js (d'une copie) à null entre leurs balises : l'état d'avant la première mesure. */
function viderLesTables(fichier) {
  const texte = fs.readFileSync(fichier, 'utf8');
  const vider = (t, debut, fin, ligne) => {
    const i = t.indexOf(debut);
    const j = t.indexOf(fin);
    assert.ok(i >= 0 && j > i, `balises de ${debut}`);
    return `${t.slice(0, i + debut.length)}\n${ligne}\n${t.slice(j)}`;
  };
  let t = vider(texte, '// <RESTE_ADDITIONNEL recopié par script — ne pas modifier à la main>', '// </RESTE_ADDITIONNEL>', 'export const RESTE_ADDITIONNEL = null;');
  t = vider(t, '// <MOYENNES_DES_CHAMPIONNATS recopiées par script — ne pas modifier à la main>', '// </MOYENNES_DES_CHAMPIONNATS>', 'export const MOYENNES_DES_CHAMPIONNATS = null;');
  fs.writeFileSync(fichier, t);
}

test('E0-4 --recopier-additionnel de la mesure fabriquée : entre les balises de la COPIE, relue par import ; deux passages → mêmes octets ; une mesure hors de la fenêtre refusée, module intact ; le reglagesDirect.js du code jamais touché', async () => {
  const empreinteDuCode = sha1(REGLAGES_DU_CODE);
  const { copie, script, mesure } = copieMesuree();
  try {
    const reglages = path.join(copie.serveur, 'src', 'data', 'direct', 'reglagesDirect.js');
    const r1 = lancer(copie, script, ['--recopier-additionnel', '--additionnel', mesure]);
    assert.equal(r1.code, 0, r1.erreurs.slice(-1500));
    assert.equal(path.resolve(r1.json.reglages), path.resolve(reglages), 'le module de la copie');
    const apres1 = sha1(reglages);
    assert.notEqual(apres1, empreinteDuCode);
    const j = JSON.parse(fs.readFileSync(mesure, 'utf8'));
    const relu = await import(`${pathToFileURL(reglages).href}?e0-4`);
    assert.deepEqual([...relu.RESTE_ADDITIONNEL.reste91], j.tempsAdditionnel.seconde.reste);
    assert.deepEqual([...relu.RESTE_ADDITIONNEL.reste45], j.tempsAdditionnel.premiere.reste);
    assert.equal(relu.RESTE_ADDITIONNEL.X91, 12);
    assert.equal(relu.RESTE_ADDITIONNEL.mesure.sha1, sha1(mesure));
    assert.ok(Object.isFrozen(relu.RESTE_ADDITIONNEL.reste91) && Object.isFrozen(relu.MOYENNES_DES_CHAMPIONNATS.championnats));
    assert.deepEqual(Object.keys(relu.MOYENNES_DES_CHAMPIONNATS.championnats).sort(), ['Ligue A', 'Ligue B']);
    const r2 = lancer(copie, script, ['--recopier-additionnel', '--additionnel', mesure]);
    assert.equal(r2.code, 0, r2.erreurs.slice(-1500));
    assert.equal(sha1(reglages), apres1, 'la même mesure redonne les mêmes octets');
    // Une mesure qui déborde sur la fenêtre du banc : refusée, le module ne bouge pas.
    const debord = path.join(path.dirname(mesure), 'debord', 'additionnel.json');
    fs.mkdirSync(path.dirname(debord), { recursive: true });
    fs.writeFileSync(debord, JSON.stringify({ ...j, fenetre: { de: '2023-07-01', a: '2026-11-10' } }));
    refuse(lancer(copie, script, ['--recopier-additionnel', '--additionnel', debord]), /fenêtre déjà vue/, 'mesure hors de la fenêtre');
    assert.equal(sha1(reglages), apres1, 'module intact après le refus');
  } finally {
    copie.nettoyer();
  }
  assert.equal(sha1(REGLAGES_DU_CODE), empreinteDuCode, 'le reglagesDirect.js du code jamais touché');
});

test('E0-5 la mesure RÉELLE du 11/11 (fixture direct-additionnel.json), recopiée dans une copie aux tables vides, redonne reglagesDirect.js du code À L’OCTET', () => {
  const copie = preparerCopieDeBac({ base: false });
  try {
    const script = installerScript(copie);
    const reglages = path.join(copie.serveur, 'src', 'data', 'direct', 'reglagesDirect.js');
    viderLesTables(reglages);
    assert.notEqual(sha1(reglages), sha1(REGLAGES_DU_CODE));
    // Le nom du fichier de mesure est recopié dans le module : la fixture reprend le sien (additionnel.json).
    const mesure = path.join(copie.dossier, 'mesure-reelle', 'additionnel.json');
    fs.mkdirSync(path.dirname(mesure), { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, 'direct-additionnel.json'), mesure);
    const r = lancer(copie, script, ['--recopier-additionnel', '--additionnel', mesure]);
    assert.equal(r.code, 0, r.erreurs.slice(-1500));
    assert.equal(sha1(reglages), sha1(REGLAGES_DU_CODE), 'reglagesDirect.js redonné à l’octet');
    assert.equal(r.json.sha1Mesure, sha1(path.join(FIXTURES, 'direct-additionnel.json')));
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------------------ E0-6 : --restaurer

test('E0-6 --restaurer : un .gz fabriqué, le sha256 du bilan, la passe null → copie décompressée et contrôlée ; cible existante, sha256 faux (copie retirée) et passe qui tourne → refus', () => {
  const copie = preparerCopieDeBac({ base: false });
  try {
    const script = installerScript(copie);
    const fab = path.join(copie.dossier, 'fabrique');
    fs.mkdirSync(fab, { recursive: true });
    const source = path.join(fab, 'source.db');
    const db = new DatabaseSync(source);
    db.exec('CREATE TABLE matches (id INTEGER PRIMARY KEY, date TEXT, league TEXT, home_goals INTEGER, away_goals INTEGER, events TEXT, meta TEXT)');
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-08']) db.prepare('INSERT INTO matches (date, league) VALUES (?, ?)').run(d, 'Ligue fabriquée');
    db.close();
    const octets = fs.readFileSync(source);
    const sha256 = crypto.createHash('sha256').update(octets).digest('hex');
    const gz = path.join(fab, 'cotemaster-essai.db.gz');
    fs.writeFileSync(gz, zlib.gzipSync(octets));
    const bilan = path.join(fab, 'bilan.json');
    fs.writeFileSync(bilan, JSON.stringify({ base: { sha256, rencontres: 3 } }));
    const passeNulle = path.join(fab, 'refresh-status.json');
    fs.writeFileSync(passeNulle, JSON.stringify({ running: null }));
    const cible = path.join(copie.dossier, 'restauree', 'match-stats.db');
    const r = lancer(copie, script, ['--restaurer', '--sauvegarde', gz, '--bilan', bilan, '--passe', passeNulle, '--cible', cible]);
    assert.equal(r.code, 0, r.erreurs.slice(-1500));
    assert.equal(r.json.ok, true);
    assert.equal(r.json.sha256, sha256);
    assert.equal(r.json.quickCheck, 'ok');
    assert.equal(r.json.rencontres, 3);
    assert.equal(r.json.rencontresDuBilan, 3);
    assert.equal(r.json.derniereDate, '2026-11-08');
    assert.equal(r.json.passe.verifiee, true);
    assert.ok(fs.readFileSync(cible).equals(octets), 'la copie décompressée = la base fabriquée, à l’octet');
    assert.ok(fs.existsSync(gz), 'le .gz est seulement lu');
    // Cible existante : jamais écrasée.
    refuse(lancer(copie, script, ['--restaurer', '--sauvegarde', gz, '--bilan', bilan, '--passe', passeNulle, '--cible', cible]), /existe déjà/, 'cible existante');
    // sha256 faux : refus, la copie retirée.
    const bilanFaux = path.join(fab, 'bilan-faux.json');
    fs.writeFileSync(bilanFaux, JSON.stringify({ base: { sha256: '0'.repeat(64), rencontres: 3 } }));
    const cible2 = path.join(copie.dossier, 'restauree-2', 'match-stats.db');
    refuse(lancer(copie, script, ['--restaurer', '--sauvegarde', gz, '--bilan', bilanFaux, '--passe', passeNulle, '--cible', cible2]), /sha256 .* copie retirée/, 'sha256 faux');
    assert.equal(fs.existsSync(cible2), false, 'copie retirée');
    // La passe de Pierre tourne (attente nulle) : refus, rien décompressé.
    const passeEnCours = path.join(fab, 'refresh-status-en-cours.json');
    fs.writeFileSync(passeEnCours, JSON.stringify({ running: { depuis: '2026-11-14T00:29:00.000Z' } }));
    const cible3 = path.join(copie.dossier, 'restauree-3', 'match-stats.db');
    refuse(lancer(copie, script, ['--restaurer', '--sauvegarde', gz, '--bilan', bilan, '--passe', passeEnCours, '--cible', cible3, '--attente-minutes', '0']), /passe de Pierre tourne toujours/, 'passe en cours');
    assert.equal(fs.existsSync(cible3), false, 'rien décompressé');
    // Le bilan sans sha256 : refus.
    const bilanVide = path.join(fab, 'bilan-vide.json');
    fs.writeFileSync(bilanVide, JSON.stringify({ base: {} }));
    refuse(lancer(copie, script, ['--restaurer', '--sauvegarde', gz, '--bilan', bilanVide, '--passe', passeNulle, '--cible', path.join(copie.dossier, 'restauree-4', 'match-stats.db')]), /sha256 de la base/, 'bilan sans sha256');
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------------------ E0-7 : les refus de tête (S3 de la vérification « sûreté »)

/** L'empreinte d'une arborescence : chaque entrée (chemin relatif, et sha1 pour un fichier), triées. */
function empreinteDe(dossier) {
  const h = crypto.createHash('sha1');
  for (const f of fs.readdirSync(dossier, { recursive: true }).map(String).sort()) {
    const p = path.join(dossier, f);
    const rel = f.split(path.sep).join('/');
    h.update(fs.statSync(p).isFile() ? `${rel} ${sha1(p)}\n` : `${rel}/\n`);
  }
  return h.digest('hex');
}

test('E0-7 les refus de tête : le script rangé sous OneDrive (avec ou sans CM_BAC_A_SABLE=1), ou hors du bac sans copie d’essai (sans variable, ou CM_TEST_DOSSIER pointé ailleurs), refuse avant tout et n’écrit rien', () => {
  // HORS du bac : dans le bac, modeBacASable() est vrai par l'emplacement du code.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-e0-7-'));
  try {
    const copier = (racine) => {
      const serveur = path.join(racine, 'server');
      fs.cpSync(path.join(SERVEUR, 'src'), path.join(serveur, 'src'), { recursive: true });
      fs.mkdirSync(path.join(serveur, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape46.mjs'), path.join(serveur, 'scripts', 'etape46.mjs'));
      fs.copyFileSync(path.join(SERVEUR, 'package.json'), path.join(serveur, 'package.json'));
      return path.join(serveur, 'scripts', 'etape46.mjs');
    };
    // « OneDrive » : un segment de chemin entier qui COMMENCE par « OneDrive » (le motif de sousOneDrive dans le script).
    const sousOneDrive = copier(path.join(tmp, 'OneDrive'));
    const horsDuBac = copier(path.join(tmp, 'hors-bac'));
    const etranger = path.join(tmp, 'etranger');
    fs.mkdirSync(etranger);
    // Aucune variable CM_*, ni MATCH_STATS_DB, ni clé, ni jeton ; ni l'espion des essais (NODE_OPTIONS) ni le contexte de node --test.
    const propre = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CM_|^MATCH_STATS_DB$|^NODE_OPTIONS$|^NODE_TEST_CONTEXT$|KEY|TOKEN|SECRET|ANTHROPIC|CLAUDE/i.test(k)));
    assert.ok(!Object.keys(propre).some((k) => /^CM_/i.test(k)), 'aucune variable CM_*');
    const cas = [
      ['sous OneDrive, sans variable', sousOneDrive, {}, /jamais sous OneDrive/],
      ['sous OneDrive, CM_BAC_A_SABLE=1', sousOneDrive, { CM_BAC_A_SABLE: '1' }, /jamais sous OneDrive/],
      ['hors du bac, sans variable', horsDuBac, {}, /ce script sert au bac à sable/],
      ['hors du bac, CM_TEST_DOSSIER étranger', horsDuBac, { CM_TEST_DOSSIER: etranger }, /ce script sert au bac à sable/]
    ];
    for (const [qui, script, ajout, motif] of cas) {
      const arbre = path.resolve(script, '..', '..', '..');
      const avant = empreinteDe(arbre);
      const r = spawnSync(process.execPath, [script, '--note-nulle'], { env: { ...propre, ...ajout }, encoding: 'utf8', timeout: 60_000 });
      assert.equal(r.status, 2, `${qui} : code ${r.status} — ${(r.stderr ?? '').slice(-600)}`);
      let json = null;
      try {
        json = JSON.parse((r.stdout ?? '').trim().split(/\r?\n/).at(-1));
      } catch {
        // dit ci-dessous
      }
      assert.ok(json && typeof json.refus === 'string', `${qui} : une ligne JSON de refus (${(r.stdout ?? '').slice(-300)})`);
      assert.match(json.refus, motif, `${qui} : ${json.refus}`);
      assert.match(r.stderr ?? '', motif, `${qui} : le refus dit sur stderr`);
      assert.equal(empreinteDe(arbre), avant, `${qui} : rien écrit`);
    }
    assert.deepEqual(fs.readdirSync(etranger), [], 'le dossier étranger reste vide');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(tmp), false, 'le dossier temporaire retiré');
});
