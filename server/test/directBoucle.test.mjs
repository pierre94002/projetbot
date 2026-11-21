/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie B — LA BOUCLE DU DIRECT (jobs/liveWatch.js) ET CE QUE LA 46 Y
 * AJOUTE (la mémoire de chaque match, getEtatMinute, les finis gardés trois heures), rejouée tour par tour sur un FotMob
 * SIMULÉ par aides/script-direct-boucle.mjs, dans une COPIE ISOLÉE (réseau coupé, heure figée, base d'essai) :
 *   node --test test/directBoucle.test.mjs        (depuis server/)
 *
 *   T-M1 minute par minute (scénario M : trois matchs, 119 tours, le VRAI lecteur partagé de la liste) : getEtatMinute()
 *        porte à chaque tour la liste, la mémoire attendue, puis le match dans `finis` — une liste fraîche un tour sur deux
 *        et la COPIE du partage l'autre (R4 : une copie n'est jamais une observation) ; « détail 1-0, copie 0-0, puis
 *        1-0 » → aucune baisse annoncée, `depuisA` inchangé (R4 point 5) ; rouge lu au détail ; pause ; but annulé ;
 *        minute figée ; 90+ et le score de la 90e ; prolongation (vue, jouée, score de la 90e sûr) ; fin, match arrêté ;
 *   T-M2 INERTE POUR E (R25) : avec `--toucher` (getEtatMinute() et les trois routes de la 46 — tableau, détail, en cours,
 *        accrochée le 13/11 soir — appelées entre les tours, ce
 *        qu'elles rendent ABÎMÉ en profondeur), ce que la boucle écrit (lignes passées à la file, lignes de live_snapshots
 *        après le vidage, bilans des tours, requêtes) est identique à la fixture « avant » (direct-boucle-avant-46.json,
 *        produite sur le liveWatch.js d'avant la 46) ; les entrées du faux FotMob aussi ; enregistreurs.test.mjs et ses
 *        aides inchangés ;
 *   T-M3 le module de la 46 ABSENT, qui LÈVE au chargement, dont `suivre` lève toujours ou à un seul tour : la boucle tourne
 *        et écrit à l'identique ; `memoire: null` ; la panne dite (`module46`, `erreurs46`), jamais une mémoire figée ;
 *   T-M4 getEtatMinute() rend des COPIES : les abîmer (--toucher) ne change rien à ce qu'elle rend ensuite ;
 *        __reglerDirect() oublie tout (matchs, finis, module, pannes) ;
 *   T-M5 aucune requête de plus : mêmes appels au faux FotMob (listes, détails, partage, requêtes de chaque tour) avec et
 *        sans les lectures de la 46 entre les tours.
 *   T-M6 (S1 de la vérification « sûreté », 13/11/2026) un détail NULL (page FotMob sans general ni teams : fetchLiveDetail
 *        rend null) : scénario N du script (--detail-nul), le premier détail lu aux tours 2 et 3 rend null → aucun tour en
 *        erreur, la ligne « liste seule » écrite pour ce match, et la boucle écrit à l'identique avec et sans le module de
 *        la 46 (la garde de observerDetail46, liveWatch.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, FIXTURES, MAINTENANT_FIGE } from './aides/isolement.mjs';
import { getEtatMinute, __reglerDirect } from '../src/jobs/liveWatch.js';
import { declareParUnLot2 } from './aides/enService.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-direct-boucle.mjs');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'direct-boucle-avant-46.json'), 'utf8'));
const T0 = Date.parse(MAINTENANT_FIGE);
const MIN = 60_000;
const ECRIT = ['tours', 'lignesEnFile', 'lignesEcrites', 'appels', 'partage'];
const M1 = '4930001';
const M2 = '4930002';
const M3 = '4930003';
const t = (w) => T0 + w * MIN;
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(SERVEUR, f))).digest('hex');

/** Le script dans une copie isolée ; `avant(copie)` retouche la COPIE (jamais le bac) avant de lancer. */
function lancer(args, avant = null) {
  const copie = preparerCopie();
  try {
    if (avant) avant(copie);
    const r = executer(copie, SCRIPT, { args, timeout: 300_000 });
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.ok(r.json?.ok, r.sortie.slice(-1000));
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const deja = new Map();
const uneFois = (cle, args) => {
  if (!deja.has(cle)) deja.set(cle, lancer(args));
  return deja.get(cle);
};
const avecTouches = () => uneFois('toucher', ['--toucher', '--etats']);
const sansTouches = () => uneFois('etats', ['--etats']);

/** Ce que la boucle a écrit, À L'OCTET (JSON) celui de la fixture « avant », scénario par scénario. */
function ecritCommeAvant(json, qui) {
  assert.equal(json.entreesSha1, FIXTURE.entreesSha1, `${qui} : les entrées du faux FotMob ont changé`);
  for (const k of ['A', 'B', 'C', 'M']) {
    for (const champ of ECRIT) {
      assert.ok(JSON.stringify(json.scenarios[k][champ]) === JSON.stringify(FIXTURE.scenarios[k][champ]), `${qui} : scénario ${k}, « ${champ} » différent de la fixture d'avant la 46`);
    }
  }
}
const le = (etat, id) => etat.matchs.find((x) => x.id === id) ?? null;
const scoreDe = (s) => ({ h: s.h, a: s.a, depuisA: s.depuisA, baisseA: s.baisseA, aConfirmer: s.aConfirmer });
const reglementaireDe = (r) => (r ? { h: r.h, a: r.a, apresLaFin: r.apresLaFin, sur: r.sur, phase: r.phase } : null);

// ------------------------------------------------------------ T-M1

test('T-M1 minute par minute : la liste et la mémoire de chaque tour (copie du partage un tour sur deux), but vu au détail, rouge, pause, but annulé, minute figée, 90+, prolongation, fin et match arrêté gardés dans `finis`', () => {
  const E = sansTouches().scenarios.M.etats;
  assert.equal(E.length, 119);
  for (const [w, e] of E.entries()) {
    assert.equal(e.w, w);
    assert.equal(e.at, t(w));
    // R4 : la liste n'est lue pour de vrai qu'un tour sur deux (le partage d'une minute sert la copie l'autre tour).
    assert.equal(e.listeFotmobA, t(w - (w % 2)), `tour ${w} : l'heure de la dernière VRAIE lecture de la liste`);
    assert.deepEqual(e.module46, { etat: 'charge', raison: null }, `tour ${w}`);
    assert.deepEqual(e.erreurs46, { n: 0, derniere: null }, `tour ${w}`);
    for (const x of e.matchs) assert.ok(x.memoire && x.memoire.v === 1, `tour ${w}, match ${x.id} : une mémoire`);
  }

  // Une copie n'est jamais une observation : les tours impairs comptent une copie, les pairs une lecture (M1, tours 1 à 116).
  for (let w = 1; w <= 116; w++) {
    const a = le(E[w - 1], M1).memoire;
    const b = le(E[w], M1).memoire;
    if (w % 2) {
      assert.equal(b.copies, a.copies + 1, `tour ${w} : une copie de plus`);
      assert.equal(b.lecturesListe, a.lecturesListe, `tour ${w} : aucune lecture de la liste`);
      assert.equal(b.derniereCopieA, t(w));
      assert.equal(b.listeLueA, a.listeLueA, `tour ${w} : la dernière lecture reste celle du tour d'avant`);
    } else {
      assert.equal(b.copies, a.copies, `tour ${w}`);
      assert.equal(b.lecturesListe, a.lecturesListe + 1, `tour ${w} : une lecture de plus`);
      assert.equal(b.listeLueA, t(w));
    }
  }

  // R4 point 5 : détail 1-0 (tour 20, la vraie liste dit encore 0-0), COPIE 0-0 (tour 21), vraie liste 1-0 (tour 22).
  assert.deepEqual([20, 21, 22].map((w) => le(E[w], M1).liste.h), [0, 0, 1], 'la ligne de la liste vue à chaque tour');
  for (const w of [20, 21, 22]) {
    assert.deepEqual(scoreDe(le(E[w], M1).memoire.score), { h: 1, a: 0, depuisA: t(20), baisseA: null, aConfirmer: false }, `tour ${w} : aucune baisse, depuisA inchangé`);
  }
  assert.equal(le(E[20], M1).memoire.score.source, 'detail');
  assert.deepEqual(scoreDe(le(E[19], M1).memoire.score), { h: 0, a: 0, depuisA: t(0), baisseA: null, aConfirmer: false });

  // Les rouges : jamais publiés par la liste (null, jamais 0), lus au détail de M1 (tour 35, le premier détail après le rouge).
  for (const e of E) {
    const x = le(e, M1);
    if (!x) continue;
    assert.equal(x.liste.rh, null);
    assert.equal(x.liste.ra, null);
    assert.equal(x.memoire.rougesListe, null);
  }
  const rouge = E.findIndex((e) => le(e, M1)?.memoire.rougesDetail?.away === 1);
  assert.equal(rouge, 35, 'le rouge lu au détail du tour 35');
  assert.deepEqual(le(E[35], M1).memoire.rougesDetail, { home: 0, away: 1, vuA: t(35), depuisA: t(35) });
  assert.deepEqual(le(E[34], M1).memoire.rougesDetail, { home: 0, away: 0, vuA: t(30), depuisA: t(0) });

  // La pause (HT au tour 48), puis plus jamais oubliée.
  assert.equal(le(E[47], M1).memoire.pauseVueA, null);
  for (const w of [48, 62, 80, 116]) assert.equal(le(E[w], M1).memoire.pauseVueA, t(48), `tour ${w}`);

  // Le but annulé : 2-0 au tour 78, 1-0 lu par la VRAIE liste au tour 80 → baisse annoncée ; le 1-1 du tour 108 l'efface.
  assert.deepEqual(scoreDe(le(E[78], M1).memoire.score), { h: 2, a: 0, depuisA: t(78), baisseA: null, aConfirmer: false });
  assert.deepEqual(scoreDe(le(E[79], M1).memoire.score), { h: 2, a: 0, depuisA: t(78), baisseA: null, aConfirmer: false }, 'tour 79 : la copie ne dit rien');
  const annule = le(E[80], M1).memoire.score;
  assert.deepEqual(scoreDe(annule), { h: 1, a: 0, depuisA: t(80), baisseA: t(80), aConfirmer: false });
  assert.deepEqual(annule.precedent, { h: 2, a: 0 });
  assert.equal(annule.source, 'liste');
  assert.deepEqual(scoreDe(le(E[108], M1).memoire.score), { h: 1, a: 1, depuisA: t(108), baisseA: null, aConfirmer: false });

  // La minute figée (67' de 84 à 89) : le libellé garde l'heure de son dernier changement.
  for (let w = 84; w <= 89; w++) assert.deepEqual(le(E[w], M1).memoire.libelle, { texte: "67'", depuisA: t(84) }, `tour ${w}`);
  assert.deepEqual(le(E[90], M1).memoire.libelle, { texte: "68'", depuisA: t(90) });

  // Les arrêts de jeu de la fin : 90+2' encore « en jeu » (score de la 90e provisoire), puis FT → sûr.
  assert.equal(le(E[114], M1).memoire.libelle.texte, "90+2'");
  assert.deepEqual(reglementaireDe(le(E[114], M1).memoire.reglementaire), { h: 1, a: 1, apresLaFin: false, sur: false, phase: 'jeu' });
  assert.equal(le(E[116], M1).memoire.libelle.texte, 'FT');
  assert.deepEqual(reglementaireDe(le(E[116], M1).memoire.reglementaire), { h: 1, a: 1, apresLaFin: true, sur: true, phase: 'fin-90' });

  // M2, pris en route à la pause : arrêts de jeu, « Break » (prolongation vue), durée max 105 (jouée), but en prolongation.
  const p = le(E[91], M2).memoire;
  assert.equal(p.premiereVueA, t(0));
  assert.equal(p.pauseVueA, t(0));
  assert.equal(p.prolongationVueA, t(52), 'Break, lu par la vraie liste du tour 52');
  assert.equal(p.prolongationJoueeA, t(56), 'la première minute à durée max 105');
  assert.equal(p.tirsAuButVusA, null);
  assert.deepEqual(scoreDe(p.score), { h: 2, a: 1, depuisA: t(80), baisseA: null, aConfirmer: false });
  assert.deepEqual(reglementaireDe(p.reglementaire), { h: 1, a: 1, apresLaFin: true, sur: true, phase: 'prolongation' }, 'le score de la 90e : 1-1, sûr');
  assert.equal(le(E[51], M2).memoire.prolongationVueA, null, 'tour 51 : la copie ne prouve rien');
  assert.equal(le(E[90], M2).liste.label, 'AET');
  assert.equal(le(E[74], M2).liste.maxTime, 120);

  // M3 : pas commencé (aucune entrée), commencé en retard, arrêté (annulé) au tour 60.
  assert.equal(le(E[22], M3), null);
  assert.ok(le(E[30], M3), 'M3 suivi au tour 30');
  assert.equal(le(E[60], M3), null, 'arrêté : plus dans les matchs');
  assert.deepEqual(
    E[60].finis.map((f) => [f.id, f.at, f.statut]),
    [[M3, t(60), 'annulé']]
  );

  // La fin : plus aucun match suivi, les trois gardés dans `finis` (3 h), chacun avec sa mémoire.
  const der = E.at(-1);
  assert.deepEqual(der.matchs, []);
  assert.deepEqual(
    der.finis.map((f) => [f.id, f.at, f.statut]),
    [
      [M3, t(60), 'annulé'],
      [M2, t(92), 'terminé'],
      [M1, t(118), 'terminé']
    ]
  );
  for (const f of der.finis) assert.ok(f.memoire && f.memoire.v === 1 && f.memoire.finiA === f.at, `${f.id} : sa mémoire, la fin relevée`);
  const f1 = der.finis.find((f) => f.id === M1).memoire;
  assert.deepEqual(reglementaireDe(f1.reglementaire), { h: 1, a: 1, apresLaFin: true, sur: true, phase: 'termine' });
  const s3 = der.finis.find((f) => f.id === M3).memoire.score;
  assert.deepEqual([s3.h, s3.a], [0, 0], 'M3 arrêté à 0-0');
  assert.ok(le(E[91], M2) !== null && le(E[92], M2) === null, 'M2 quitte les matchs au tour 92 (la vraie liste qui le dit fini)');
  assert.deepEqual(der.charge, { listesFotmob: 60, listesServies: 59, listesEnEchec: 0, tours: 119, listes: 119, details: 35, horsPlafond: 0 });
});

// ------------------------------------------------------------ T-M2

test('T-M2 inerte pour E (R25) : getEtatMinute() et les trois routes (tableau, détail, en cours) appelées entre les tours, ce qu’elles rendent abîmé en profondeur → ce que la boucle écrit est identique à la fixture « avant » ; enregistreurs.test.mjs et ses aides inchangés', () => {
  const j = avecTouches();
  ecritCommeAvant(j, '--toucher');
  // getEtatMinute() + le tableau + le détail de chaque match suivi + en cours (mineur du 13/11 soir), à chacun des 133 tours
  // (A 6, B 5, C 3, M 119).
  assert.equal(j.touches, 4 * 133);
  assert.equal(FIXTURE.touches, 0);
  // La garde de E elle-même n'a pas bougé (repères du manifeste de la partie 0) : rien n'y a été retouché pour la 46.
  assert.equal(sha1('test/enregistreurs.test.mjs'), '320f891bf150f367d7e429744922942cb42e7048');
  assert.equal(sha1('test/aides/script-enregistreurs-direct.mjs'), '796885190cd3b85af875af6f90e8505a1a775ca2');
  assert.equal(sha1('test/aides/fotmobSimule.mjs'), 'b415f89bef2bb09428a184959abc7a2fa0e8b727');
  if (!declareParUnLot2('src/data/enregistreurs/file.js')) assert.equal(sha1('src/data/enregistreurs/file.js'), 'f6e7c6d9bc63e1f1bd5e75a93e96de1d5e4449ba'); // Partie 0 des lots 2 (B)
  if (!declareParUnLot2('src/jobs/enregistreurs.js')) assert.equal(sha1('src/jobs/enregistreurs.js'), '846f62798f7479f716d003e4e33ea93a43a98727'); // Partie 0 des lots 2 (B)
});

// ------------------------------------------------------------ T-M3

const MEMOIRE = (copie) => path.join(copie.serveur, 'src', 'data', 'direct', 'memoireDuDirect.js');

test('T-M3 le module de la 46 absent, ou qui lève au chargement : la boucle tourne et écrit à l’identique, `memoire: null`, le module dit « indisponible »', () => {
  const cas = [
    ['absent', (copie) => fs.rmSync(MEMOIRE(copie)), null],
    ['lève au chargement', (copie) => fs.writeFileSync(MEMOIRE(copie), "throw new Error('module de la 46 cassé (essai T-M3)');\nexport function suivre() {}\n"), 'module de la 46 cassé (essai T-M3)']
  ];
  for (const [qui, saboter, raison] of cas) {
    const j = lancer(['--etats'], saboter);
    ecritCommeAvant(j, qui);
    const E = j.scenarios.M.etats;
    assert.equal(E.length, 119);
    for (const e of E) {
      assert.equal(e.module46.etat, 'indisponible', `${qui}, tour ${e.w}`);
      assert.ok(typeof e.module46.raison === 'string' && e.module46.raison.length > 0, qui);
      if (raison) assert.equal(e.module46.raison, raison);
      assert.deepEqual(e.erreurs46, { n: 0, derniere: null });
      for (const x of e.matchs) assert.equal(x.memoire, null, `${qui}, tour ${e.w}, ${x.id}`);
      for (const f of e.finis) assert.equal(f.memoire, null);
    }
    assert.equal(E.at(-1).finis.length, 3, `${qui} : les finis gardés quand même`);
  }
});

test('T-M3 `suivre` qui lève : à chaque tour (mémoire nulle, pannes comptées), ou à un seul tour (mémoire remise à null ce tour-là puis refaite, jamais figée) — la boucle écrit à l’identique', () => {
  const toujours = lancer(['--etats'], (copie) => fs.writeFileSync(MEMOIRE(copie), "export function suivre() {\n  throw new Error('suivre cassé (essai T-M3)');\n}\n"));
  ecritCommeAvant(toujours, 'suivre lève toujours');
  let n = 0;
  for (const e of toujours.scenarios.M.etats) {
    assert.equal(e.module46.etat, 'charge');
    for (const x of e.matchs) assert.equal(x.memoire, null);
    assert.ok(e.erreurs46.n > n, `tour ${e.w} : les pannes se comptent`);
    n = e.erreurs46.n;
    assert.deepEqual(e.erreurs46.derniere, { at: new Date(e.at).toISOString(), message: 'suivre cassé (essai T-M3)' });
  }

  const PANNE = t(30);
  const unTour = lancer(['--etats'], (copie) => {
    const dossier = path.dirname(MEMOIRE(copie));
    fs.renameSync(MEMOIRE(copie), path.join(dossier, 'memoireDuDirectVrai.js'));
    fs.writeFileSync(
      MEMOIRE(copie),
      `import { suivre as suivreVrai } from './memoireDuDirectVrai.js';\nexport function suivre(memoire, o) {\n  if (o && o.maintenant === ${PANNE}) throw new Error('panne d’un tour (essai T-M3)');\n  return suivreVrai(memoire, o);\n}\n`
    );
  });
  ecritCommeAvant(unTour, 'suivre lève au tour 30');
  const E = unTour.scenarios.M.etats;
  for (let w = 0; w < 30; w++) {
    assert.deepEqual(E[w].erreurs46, { n: 0, derniere: null });
    for (const x of E[w].matchs) assert.ok(x.memoire, `tour ${w}`);
  }
  assert.ok(E[30].matchs.length >= 2);
  for (const x of E[30].matchs) assert.equal(x.memoire, null, `tour 30, ${x.id} : la mémoire remise à null, jamais gardée d'avant`);
  for (const w of [30, 31, 60, 118]) assert.deepEqual(E[w].erreurs46, { n: E[30].matchs.length, derniere: { at: new Date(PANNE).toISOString(), message: 'panne d’un tour (essai T-M3)' } }, `tour ${w}`);
  for (const x of E[31].matchs) assert.equal(x.memoire.premiereVueA, t(31), `tour 31, ${x.id} : une mémoire neuve`);
  // Refaite par la vraie liste suivante (tour 32) : M1 à 1-0, vu de ce tour-là.
  assert.deepEqual(scoreDe(le(E[32], M1).memoire.score), { h: 1, a: 0, depuisA: t(32), baisseA: null, aConfirmer: false });
  assert.equal(le(E[32], M1).memoire.score.precedent, null);
});

// ------------------------------------------------------------ T-M4

test('T-M4 getEtatMinute() rend des copies : abîmer ce qu’elle rend (et ce que rendent les routes) ne change rien à ce qu’elle rend ensuite ; __reglerDirect() oublie tout', () => {
  const a = avecTouches().scenarios.M;
  const b = sansTouches().scenarios.M;
  assert.equal(a.etats.length, 119);
  assert.ok(JSON.stringify(a.etats) === JSON.stringify(b.etats), 'les 119 états de M identiques avec et sans --toucher');
  for (const s of [a, b]) {
    assert.deepEqual(s.apresReglage, { matchs: 0, finis: 0, module46: { etat: 'pas-charge', raison: null }, erreurs46: { n: 0, derniere: null }, listeFotmobA: null });
  }
  // Ici même (sans boucle) : une copie modifiée ne touche pas la suivante.
  __reglerDirect();
  const x = getEtatMinute(T0);
  x.matchs.push({ id: 'abime' });
  x.finis.push({ id: 'abime' });
  x.charge.tours = 999;
  x.module46.etat = 'abime';
  x.erreurs46.n = 7;
  const y = getEtatMinute(T0);
  assert.deepEqual(y.matchs, []);
  assert.deepEqual(y.finis, []);
  assert.equal(y.charge.tours, 0);
  assert.deepEqual(y.module46, { etat: 'pas-charge', raison: null });
  assert.deepEqual(y.erreurs46, { n: 0, derniere: null });
  assert.equal(y.listeFotmobA, null);
});

// ------------------------------------------------------------ T-M5

test('T-M5 aucune requête de plus : mêmes appels au faux FotMob (listes, détails, partage, requêtes de chaque tour) avec et sans les lectures de la 46 entre les tours', () => {
  for (const [qui, j] of [
    ['--toucher', avecTouches()],
    ['sans --toucher', sansTouches()]
  ]) {
    for (const k of ['A', 'B', 'C', 'M']) assert.deepEqual(j.scenarios[k].appels, FIXTURE.scenarios[k].appels, `${qui}, ${k}`);
    assert.deepEqual(
      j.scenarios.M.tours.map((x) => x.requetes),
      FIXTURE.scenarios.M.tours.map((x) => x.requetes),
      `${qui} : les requêtes de chaque tour de M`
    );
    assert.deepEqual(j.scenarios.M.partage, FIXTURE.scenarios.M.partage, qui);
  }
  assert.deepEqual(FIXTURE.scenarios.M.appels, { listes: 60, details: 35, total: 95 });
});

// ------------------------------------------------------------ T-M6

test('T-M6 un détail null : la boucle ne lève pas et écrit la liste seule, comme sans le module de la 46', () => {
  const avec = lancer(['--detail-nul']);
  const sans = lancer(['--detail-nul'], (copie) => fs.rmSync(MEMOIRE(copie)));
  const N = avec.scenarios.N;
  assert.deepEqual(Object.keys(avec.scenarios), ['N'], '--detail-nul ne lance que le scénario N');
  assert.deepEqual(Object.keys(sans.scenarios), ['N']);
  assert.equal(N.tours.length, 6);
  // C'est CE contrôle qui voit la garde retirée (pose S1) : un détail null qui lève fait partir le tour en erreur.
  for (const [w, b] of N.tours.entries()) assert.equal(b.erreur ?? null, null, `tour ${w} : aucune erreur`);
  for (const [w, b] of sans.scenarios.N.tours.entries()) assert.equal(b.erreur ?? null, null, `sans le module, tour ${w}`);
  for (const champ of ['tours', 'lignesEnFile', 'lignesEcrites', 'appels']) {
    assert.ok(JSON.stringify(N[champ]) === JSON.stringify(sans.scenarios.N[champ]), `« ${champ} » différent sans le module de la 46`);
  }
  // Le détail null a bien été servi : au tour 2 puis au tour 3, au premier match lu chaque fois (deux matchs différents).
  assert.deepEqual(Object.keys(N.detailsNuls).sort(), ['2', '3']);
  assert.deepEqual(N.detailsNuls, sans.scenarios.N.detailsNuls);
  assert.notEqual(N.detailsNuls[2], N.detailsNuls[3]);
  for (const [w, id] of Object.entries(N.detailsNuls)) {
    const quand = new Date(t(Number(w))).toISOString();
    const lignes = N.lignesEnFile.flat().filter((l) => String(l.fotmobId) === id && l.takenAt === quand);
    assert.equal(lignes.length, 1, `tour ${w}, match ${id} : une ligne passée à la file`);
    assert.equal(lignes[0].source, 'liste', `tour ${w}, match ${id} : la liste seule`);
    assert.equal(lignes[0].detailAt, null);
    assert.equal(lignes[0].xgHome, null);
    assert.ok(N.lignesEcrites.some((l) => String(l.fotmob_id) === id && l.taken_at === quand && l.source === 'liste'), `tour ${w}, match ${id} : la ligne écrite en base`);
  }
  // Les autres matchs lus ces tours-là gardent leur détail.
  const autres = N.lignesEnFile.flat().filter((l) => [t(2), t(3)].includes(Date.parse(l.takenAt)) && !Object.values(N.detailsNuls).includes(String(l.fotmobId)));
  assert.ok(autres.length > 0 && autres.every((l) => l.source === 'liste + détail'), 'les autres matchs de ces tours : liste + détail');
});
