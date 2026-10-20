/**
 * Retouche du 12/10/2026 — le VERROU D'ÉCRITURE de la base (correction 1).
 *   node --test test/verrouEcriture.test.mjs        (depuis server/)
 *
 * Dans la nuit du 11 au 12/10/2026 (passe de rattrapage), l'étape « annuaires »
 * a échoué une fois : son processus à part a lu le magasin, puis `BEGIN
 * IMMEDIATE` a attendu les 15 s du busy_timeout et levé « database is locked »,
 * sans nouvel essai. Le verrou était tenu par la boucle des cotes gratuites du
 * serveur, qui rattachait d'un seul UPDATE 1 536 cotes aux 299 rencontres que la
 * passe venait d'importer (27 s de verrou mesurées sur une copie de la sauvegarde
 * de la nuit, hors de la suite).
 *
 *  1. La prise du verrou en patientant (src/data/db/verrouEcriture.js), sur une
 *     FAUSSE base et une fausse horloge : essais, pauses, temps permis, erreurs.
 *  2. Pour de vrai, dans une copie isolée de la base d'essai (réseau coupé, heure
 *     figée) : un AUTRE écrivain, dans un autre processus, tient le verrou ;
 *     l'étape « annuaires » (scripts/rebuild-registries.mjs) patiente puis réussit
 *     quand il le rend, ou s'arrête proprement s'il ne le rend jamais — sans rien
 *     écrire de partiel.
 *  3. Le rattachement des cotes (oddsQuotesRepository.js) : la recherche hors de
 *     la transaction, les mêmes rattachements que l'ancienne requête (l'oracle),
 *     et rien à rattacher = aucune écriture, donc aucun verrou.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { prendreLeVerrouEcriture, VerrouIndisponible, estVerrouille, dureeEnMots, attenteParEssaiMs, DUREE_MAX_MS, PAUSES_MS } from '../src/data/db/verrouEcriture.js';

// ================================================ 1. la prise du verrou, sans base

/**
 * Une FAUSSE base : `BEGIN IMMEDIATE` refusé les `refus` premières fois (comme
 * SQLite : « database is locked », code 5), chaque refus « coûtant » l'attente de
 * la connexion sur la fausse horloge. Tout ce qu'elle reçoit est noté.
 */
function fausseBase({ refus = 0, erreur = null, attenteMs = 15_000, horloge }) {
  const recu = [];
  let essais = 0;
  return {
    recu,
    prepare: (sql) => ({ get: () => (/busy_timeout/i.test(sql) ? { timeout: attenteMs } : undefined) }),
    exec: (sql) => {
      recu.push(sql);
      if (sql !== 'BEGIN IMMEDIATE') return;
      essais++;
      if (erreur) throw erreur;
      if (essais <= refus) {
        horloge.avancer(attenteMs);
        const e = new Error('database is locked');
        e.code = 'ERR_SQLITE_ERROR';
        e.errcode = 5;
        e.errstr = 'database is locked';
        throw e;
      }
    }
  };
}
function fausseHorloge() {
  let t = 1_000;
  const pauses = [];
  return {
    pauses,
    avancer: (ms) => (t += ms),
    horloge: () => t,
    attendre: async (ms) => {
      pauses.push(ms);
      t += ms;
    }
  };
}

test('verrou libre : un seul essai, aucune pause', async () => {
  const h = fausseHorloge();
  const db = fausseBase({ horloge: h });
  const r = await prendreLeVerrouEcriture(db, { horloge: h.horloge, attendre: h.attendre });
  assert.deepEqual(r, { essais: 1, attenteMs: 0 });
  assert.deepEqual(h.pauses, []);
  assert.deepEqual(db.recu, ['BEGIN IMMEDIATE']);
});

test('verrou tenu un moment : de nouveaux essais ESPACÉS (5 s, puis 10 s…), chacun attendant le busy_timeout ; le troisième réussit, et dit combien il en a fallu', async () => {
  const h = fausseHorloge();
  const db = fausseBase({ refus: 2, horloge: h });
  const vus = [];
  const r = await prendreLeVerrouEcriture(db, { horloge: h.horloge, attendre: h.attendre, surEssai: (e) => vus.push(e) });
  assert.deepEqual(r, { essais: 3, attenteMs: 15_000 + 5_000 + 15_000 + 10_000 });
  assert.deepEqual(h.pauses, [5_000, 10_000]);
  assert.deepEqual(vus.map((e) => [e.essai, e.pauseMs]), [[1, 5_000], [2, 10_000]]);
  // Rien d'autre que des demandes de verrou : pas une écriture avant de l'avoir.
  assert.deepEqual(db.recu, ['BEGIN IMMEDIATE', 'BEGIN IMMEDIATE', 'BEGIN IMMEDIATE']);
  assert.deepEqual([...PAUSES_MS], [5_000, 10_000, 15_000, 20_000, 30_000]);
});

test('verrou jamais rendu : arrêt propre au bout d’environ 3 minutes (six essais), un message clair, rien d’écrit, jamais au-delà du temps permis', async () => {
  const h = fausseHorloge();
  const db = fausseBase({ refus: Infinity, horloge: h });
  const debut = h.horloge();
  await assert.rejects(
    prendreLeVerrouEcriture(db, { horloge: h.horloge, attendre: h.attendre }),
    (e) => {
      assert.ok(e instanceof VerrouIndisponible);
      assert.equal(e.essais, 6);
      assert.equal(e.attenteMs, 170_000);
      assert.equal(e.message, "base tenue par un autre écrivain pendant 2 min 50 s (6 essais) : rien n'a été écrit.");
      assert.match(e.cause?.message ?? '', /database is locked/);
      return true;
    }
  );
  assert.equal(DUREE_MAX_MS, 180_000);
  assert.ok(h.horloge() - debut <= DUREE_MAX_MS, `${h.horloge() - debut} ms`);
  assert.deepEqual(h.pauses, [5_000, 10_000, 15_000, 20_000, 30_000]);
  assert.ok(db.recu.every((sql) => sql === 'BEGIN IMMEDIATE'));
});

test('un temps permis court, une dernière pause répétée : les essais s’arrêtent avant de déborder', async () => {
  const h = fausseHorloge();
  const db = fausseBase({ refus: Infinity, attenteMs: 300, horloge: h });
  await assert.rejects(prendreLeVerrouEcriture(db, { horloge: h.horloge, attendre: h.attendre, dureeMaxMs: 2_000, pausesMs: [200, 400] }), (e) => e instanceof VerrouIndisponible && e.essais === 3 && e.attenteMs === 1_500);
  assert.deepEqual(h.pauses, [200, 400]);
});

test('une autre erreur que « verrou tenu » (disque, base abîmée) remonte AUSSITÔT, sans nouvel essai', async () => {
  const h = fausseHorloge();
  const panne = Object.assign(new Error('disk I/O error'), { errcode: 10 });
  const db = fausseBase({ erreur: panne, horloge: h });
  await assert.rejects(prendreLeVerrouEcriture(db, { horloge: h.horloge, attendre: h.attendre }), (e) => e === panne);
  assert.deepEqual(h.pauses, []);
  assert.deepEqual(db.recu, ['BEGIN IMMEDIATE']);
});

test('« verrou tenu » se reconnaît au code SQLite (5, 6) ou au message ; la durée se dit en mots ; l’attente d’un essai se lit sur la connexion', () => {
  assert.equal(estVerrouille({ errcode: 5, message: 'x' }), true);
  assert.equal(estVerrouille({ errcode: 6, message: 'x' }), true);
  assert.equal(estVerrouille(new Error('database table is locked')), true);
  assert.equal(estVerrouille(new Error('database is locked')), true);
  assert.equal(estVerrouille({ errcode: 10, message: 'disk I/O error' }), false);
  assert.equal(estVerrouille(null), false);
  assert.deepEqual([800, 9_400, 40_000, 170_400, 61_000].map(dureeEnMots), ['0,8 s', '9,4 s', '40 s', '2 min 50 s', '1 min 01 s']);
  assert.equal(attenteParEssaiMs({ prepare: () => ({ get: () => ({ timeout: 15_000 }) }) }), 15_000);
  assert.equal(attenteParEssaiMs({ prepare: () => { throw new Error('fermée'); } }), 0);
});

test('l’échec tient dans le résumé de l’étape : « En échec : » + les 300 premiers caractères de « Command failed: <commande> » et de stderr, avec les chemins de l’appli de Pierre', () => {
  // matchStatsAutoRefresh.js garde `String(error.message).slice(0, 300)` ; execFile écrit « Command failed: <node> <script>\n<stderr> ».
  const commande = 'C:\\Program Files\\nodejs\\node.exe C:\\Users\\PC\\OneDrive\\Bureau\\developement\\ProjetBot\\server\\scripts\\rebuild-registries.mjs';
  for (const [essais, ms] of [[6, 170_400], [12, 179_999], [99, 179_999]]) {
    const stderr = `Annuaires non reconstruits : ${new VerrouIndisponible({ essais, attenteMs: ms }).message} Refaits en fin de passe ou à la suivante.\n`;
    const resume = `Command failed: ${commande}\n${stderr}`.slice(0, 300);
    assert.ok(resume.includes("rien n'a été écrit. Refaits en fin de passe ou à la suivante."), resume);
  }
  // Le script écrit bien ce message-là, en tête de stderr, sans pile.
  const script = fs.readFileSync(path.join(SERVEUR, 'scripts', 'rebuild-registries.mjs'), 'utf8');
  assert.match(script, /process\.stderr\.write\(`Annuaires non reconstruits : \$\{error\.message\} Refaits en fin de passe ou à la suivante\.\\n`\);/);
  assert.match(script, /rebuildRegistriesPatiemment\(/);
  assert.match(script, /PRAGMA busy_timeout = \$\{options\.attenteParEssaiMs\}/);
});

// ================================== 2. pour de vrai : un autre écrivain, un autre processus

/** Une phase du script d'essai, dans une copie neuve (scripts du serveur compris). */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-verrou.mjs'), { args: [phase], timeout: 180_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const rattachement = uneFois(() => lancer('rattachement'));

test('un autre écrivain tient le verrou, puis le rend : l’étape « annuaires » patiente, réussit à un essai suivant, refait les annuaires EN ENTIER et dit combien d’essais il a fallu', () => {
  const s = lancer('patience');
  assert.equal(s.enfant.code, 0, s.enfant.erreurs);
  assert.equal(s.renduApresEssai, 1, 'le verrou n’est rendu qu’après un premier essai refusé');
  const b = s.enfant.bilan;
  assert.ok(b.essais >= 2, `essais : ${b.essais}`);
  assert.equal(b.essais, s.enfant.essaisRefuses.length + 1, 'une ligne par essai refusé, puis le bilan');
  assert.ok(b.attenteVerrouMs >= 300, `attente : ${b.attenteVerrouMs} ms`);
  assert.ok(Number.isInteger(b.ms) && b.ms >= b.attenteVerrouMs);
  // Les annuaires refaits : le club fantôme de « l'annuaire d'avant » a disparu, les comptes sont ceux d'une reconstruction tranquille.
  assert.equal(s.avant.fantome, 1);
  assert.equal(s.apres.fantome, 0);
  for (const k of ['teams', 'teamAliases', 'people', 'peopleAliases']) {
    assert.equal(b[k], s.temoinDeReconstruction[k], k);
    assert.equal(s.apres[k], s.temoinDeReconstruction[k], k);
  }
  // L'autre écrivain a pu finir son écriture : rien ne l'a écrasée.
  assert.equal(s.autreEcrivain.code, 0);
  assert.equal(s.autreEcrivain.rendu?.raison, 'demandé');
  assert.equal(s.apres.temoin, 1);
});

test('un autre écrivain ne rend JAMAIS le verrou : l’étape s’arrête proprement au bout du temps permis — code 1, message clair en tête de stderr, aucun annuaire touché', () => {
  const s = lancer('jamais');
  assert.equal(s.enfant.code, 1);
  // Le message, en tête, sans pile ni « at … » : ce que le résumé de l'étape montrera.
  assert.match(s.enfant.erreurs, /^Annuaires non reconstruits : base tenue par un autre écrivain pendant [\d,]+ s \((\d+) essais\) : rien n'a été écrit\. Refaits en fin de passe ou à la suivante\.\r?\n$/);
  const essais = Number(s.enfant.erreurs.match(/\((\d+) essais\)/)[1]);
  assert.ok(essais >= 2, `essais : ${essais}`);
  assert.equal(s.enfant.essaisRefuses.length, essais - 1, 'une ligne par essai refusé suivi d’une pause');
  assert.ok(s.enfant.ms < 10_000, `${s.enfant.ms} ms pour un temps permis de 2 s`);
  // Rien d'écrit, ni pendant que l'autre écrivain tenait le verrou, ni après : l'annuaire d'avant est intact.
  for (const etat of [s.pendant, s.apres]) {
    assert.equal(etat.fantome, 1);
    for (const k of ['teams', 'teamAliases', 'people', 'peopleAliases']) assert.equal(etat[k], s.avant[k], k);
  }
  assert.equal(s.apres.temoin, 1, 'l’écriture de l’autre écrivain est passée');
  assert.equal(s.autreEcrivain.code, 0);
});

// ====================================================== 3. le rattachement des cotes

test('rattachement des cotes : la recherche se fait HORS de toute transaction, puis une seule transaction courte n’écrit que les lignes trouvées ; mêmes rattachements que l’ancienne requête', () => {
  const s = rattachement();
  assert.equal(s.cotes, 42);
  // L'oracle (la requête d'avant, écrite dans le script d'essai) et le nouveau : les mêmes clés, cote par cote.
  assert.deepEqual(s.nouveau.cles, s.oracle.cles);
  assert.equal(s.nouveau.rattachees, s.oracle.rattachees);
  assert.equal(s.oracle.rattachees, 12, 'même jour et un jour d’écart, pour six rencontres');
  assert.equal(Object.values(s.nouveau.cles).filter((k) => k === 'deja-rattachee').length, 6, 'une ligne déjà rattachée n’est jamais réécrite');
  // L'ordre des requêtes : la recherche (lecture) hors transaction, puis BEGIN IMMEDIATE, les seules mises à jour par identifiant, COMMIT.
  const j = s.nouveau.journal;
  const recherche = j.findIndex((x) => /SELECT e\.id/.test(x.sql));
  const debut = j.findIndex((x) => x.sql === 'BEGIN IMMEDIATE');
  const fin = j.findIndex((x) => x.sql === 'COMMIT');
  assert.ok(recherche >= 0 && recherche < debut && debut < fin, JSON.stringify(j.map((x) => x.sql.slice(0, 40))));
  assert.equal(j[recherche].ouverte, false, 'la recherche ne tient aucun verrou d’écriture');
  const dedans = j.slice(debut + 1, fin);
  assert.ok(dedans.length === 12 && dedans.every((x) => x.quoi === 'run' && x.sql === 'UPDATE odds_events SET match_key = ? WHERE id = ? AND match_key IS NULL'), JSON.stringify(dedans));
  // Rien à rattacher : la recherche seule, aucune transaction.
  assert.equal(s.rienARattacher.rattachees, 0);
  assert.deepEqual(s.rienARattacher.journal.map((x) => x.quoi), ['all']);
});

test('rattachement des cotes pendant qu’un autre écrivain tient le verrou : rien à rattacher, il passe sans attendre ni échouer — l’ancienne requête, elle, attendait le verrou pour ne rien changer', () => {
  const s = rattachement();
  assert.deepEqual(s.sousVerrou.rattachees, 0, JSON.stringify(s.sousVerrou));
  assert.match(s.ancienneSousVerrou.erreur ?? '', /database is locked/, 'l’ancienne requête voulait le verrou d’écriture');
});
