/**
 * Étape 28 du plan — CE QUE L'APPLI LIT DE LA SIMULATION (data/simulation/simulationRead.js, etatSimulation.js, les
 * routes /api/simulation, le bloc de la page du match, « J'ai parié ») :
 *   node --test test/simulationLecteurs.test.mjs        (depuis server/)
 *
 * Le VRAI serveur dans une COPIE ISOLÉE (test/aides/script-simulation-lecteurs.mjs : routes Express sans réseau, heure
 * figée, réglages avec la clé du modèle de buts, un ESPION sur simulerMatch), et, dans ce processus, le rapport de suivi
 * d'un carnet ancien face à celui de l'ancien code (fixture).
 *   T15/B9  les interrupteurs : simulation_state seulement ; empreinte des réglages, versions du moteur et
 *           engine-config.json identiques après un clic ; « combines » / « tout » refusés (409, une phrase) sans la
 *           preuve ; permis avec la clé ET le principal « retenu » ;
 *   T15 bis les interrupteurs RELUS avec leurs conditions à chaque lecture (partie C) : un « tout » resté ouvert sans
 *           elles se comporte comme éteint — page, ticket, GET /etat — et dit pourquoi ; jamais modifié par une lecture ;
 *   routes  GET /saison (ordre officiel, loi, textes, provenance ; jamais une coupe), GET /enjeux (identifiants) ;
 *   page    le bloc `simulation` APRÈS l'analyse (déroulé repondéré en « tout »), jamais dans le message de l'IA ;
 *   B6      le prix juste : score seul = somme des cases de la grille ALIGNÉE (1e-12, refaite ici indépendamment) ;
 *           contradictoires, redondantes, corners ; déroulé refusé hors « tout », sans ligne, au-delà de 10 % ;
 *           éteint ; AUCUNE simulation dans une requête (l'espion) ;
 *   B7      « J'ai parié » avec le prix juste d'un combiné (validé, rangé, gain attendu), ses refus (mi-temps, simple,
 *           hors bornes) ; l'écart-type du suivi fini pour un combiné ; un carnet ancien → le même rapport à l'octet
 *           que l'ancien code ; le coupe-circuit inchangé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { REGLAGES_MODELE_DE_BUTS, grille as grilleOracle } from './aides/modeleDeButsCommun.mjs';
import { rapportDeSuivi } from '../src/data/suiviParis.js';
import { gainAttenduDuPari } from '../src/data/repositories/betsRepository.js';
import { PRIX_ETEINT, PHRASE_LOI_FORCES_SERVICE, selectionReglable } from '../src/data/simulation/simulationRead.js';
import * as ES from '../src/data/simulation/etatSimulation.js';
import { DatabaseSync } from 'node:sqlite';
import { __testing as BASE } from '../src/data/db/matchStatsDb.js';

const DDL_DE_LA_BASE = BASE.DDL;

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-simulation-lecteurs.mjs');
let enCache = null;
function lecteurs() {
  if (enCache) return enCache;
  const copie = preparerCopie({ runtime: { 'engine-config.json': { football: { modeleDeButs: REGLAGES_MODELE_DE_BUTS } } } });
  try {
    // L'application complète charge scripts/ (cf. opportunites.test.mjs).
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { timeout: 600_000, maintenant: '2026-10-05T01:00:00.000Z' });
    assert.equal(r.code, 0, `script des lecteurs :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    assert.ok(r.json?.ok);
    enCache = r.json;
    return enCache;
  } finally {
    copie.nettoyer();
  }
}

// ------------------------------------------------------------ T15 / B9 : les interrupteurs

test('T15/B9 interrupteurs : éteints par défaut ; « combines » et « tout » refusés en 409 avec une phrase tant que la preuve n’est pas jugée ; les fins de saison s’allument d’un clic ; avec la clé ET le principal « retenu », « combines » permis ; valeurs inconnues → 400', () => {
  const i = lecteurs().interrupteurs;
  assert.equal(i.etat.code, 200);
  assert.deepEqual(i.etat.corps.affichage, { saisons: 'eteint', matchs: 'eteint' });
  assert.deepEqual([i.etat.corps.conditions.possible, i.etat.corps.conditions.cle, i.etat.corps.conditions.retenu], [false, true, false]);
  assert.deepEqual(i.etat.corps.valeurs, { saisons: ['eteint', 'allume'], matchs: ['eteint', 'combines', 'tout'] });
  assert.equal(i.combinesSansPreuve.code, 409);
  assert.equal(i.combinesSansPreuve.corps.error, 'Les prix de combinés ne peuvent pas encore être montrés : la preuve de l’étape 28 n’est pas encore jugée (800 matchs et 21 jours après la première nuit).');
  assert.equal(i.toutSansPreuve.code, 409);
  assert.match(i.toutSansPreuve.corps.error, /^Le déroulé simulé et les prix de combinés ne peuvent pas encore être montrés/);
  assert.equal(i.saisons.code, 200);
  assert.deepEqual(i.saisons.corps.affichage, { saisons: 'allume', matchs: 'eteint' });
  assert.equal(i.combines.code, 200, JSON.stringify(i.combines.corps));
  assert.deepEqual(i.combines.corps.affichage, { saisons: 'allume', matchs: 'combines' });
  assert.equal(i.inconnu.code, 400);
  assert.equal(i.valeur.code, 400);
  assert.equal(i.etatApres.corps.conditions.possible, true);
  assert.deepEqual([i.etatApres.corps.conditions.lancement, i.etatApres.corps.conditions.principalDuLancement], ['2026-09-01', '2026-09-01']);
});

test('T15/B9 un principal « retenu » d’un ANCIEN lancement de l’étape 28 n’ouvre pas les combinés : 409, « pas encore jugé pour cette version » ; seul celui du lancement en cours (registre de la mesure) les ouvre', () => {
  const i = lecteurs().interrupteurs;
  assert.equal(i.combinesAncien.code, 409);
  assert.match(i.combinesAncien.corps.error, /^Les prix de combinés ne peuvent pas encore être montrés : pas encore jugé pour cette version de l’étape 28 : le jugement rangé est celui d’un autre lancement \(01\/08\/2026, lancement en cours : 01\/09\/2026\)\.$/, 'les dates en jours de Paris, jamais en ISO brut (constat 26)');
  const c = i.etatAncien.corps.conditions;
  assert.deepEqual([c.possible, c.cle, c.retenu, c.garde, c.lancement, c.principalDuLancement], [false, true, false, false, '2026-09-01', '2026-08-01']);
  assert.equal(i.etatAncien.corps.affichage.matchs, 'eteint', 'le refus n’a rien écrit');
  assert.equal(i.combines.code, 200, 'le principal du lancement en cours les ouvre');
});

test('T15/B9 un clic ne touche QUE simulation_state : engine-config.json identique à l’octet, l’empreinte des réglages et l’état des versions du moteur identiques avant et après les clics', () => {
  const i = lecteurs().interrupteurs;
  assert.deepEqual(i.apres, i.avant);
  assert.notEqual(i.avant.fichier, 'absent');
  assert.deepEqual(Object.keys(i.etatRange).sort(), ['affichage_matchs', 'affichage_saisons', 'principal']);
});

test('T15 bis les interrupteurs RELUS avec leurs conditions à CHAQUE lecture : « tout » rangé, puis ses conditions retirées une à une (un autre lancement de l’étape 28, plus de jugement principal, « pas prouvé », le modèle de buts plus en service) → la page, le ticket et GET /etat se comportent comme éteint et disent pourquoi ; la valeur rangée reste « tout », jamais modifiée ; les conditions revenues, tout revient sans aucun clic', () => {
  const r = lecteurs().relus;
  // Les conditions tenues : ouvert.
  assert.deepEqual(r.tenues.page.affichage, { saisons: 'allume', matchs: 'tout' });
  assert.ok(r.tenues.page.deroule, 'le bloc du déroulé existe en « tout »');
  assert.equal(r.tenues.page.pourquoi, undefined);
  assert.ok(r.tenues.prix.probabilite > 0 && !r.tenues.prix.eteint, JSON.stringify(r.tenues.prix).slice(0, 300));
  assert.deepEqual([r.tenues.effectif.matchs, r.tenues.effectif.pourquoi.matchs], ['tout', null]);
  for (const [cas, manque] of [
    ['autreLancement', /pas encore jugé pour cette version de l’étape 28 : le jugement rangé est celui d’un autre lancement \(01\/08\/2026, lancement en cours : 01\/09\/2026\)/],
    ['sansPrincipal', /la preuve de l’étape 28 n’est pas encore jugée/],
    ['pasProuve', /la preuve de l’étape 28 a été jugée « pas prouvé »/]
  ]) {
    const x = r[cas];
    assert.equal(x.range, 'tout', `${cas} : la valeur rangée n’a pas bougé`);
    assert.deepEqual(x.affichage, { saisons: 'allume', matchs: 'tout' }, `${cas} : GET /etat dit aussi la valeur rangée`);
    assert.equal(x.effectif.matchs, 'eteint', cas);
    assert.match(x.effectif.pourquoi.matchs, /^Déroulé simulé et prix de combinés éteints : l’interrupteur est resté sur « tout », mais /, cas);
    assert.match(x.effectif.pourquoi.matchs, manque, cas);
    // Une preuve de CE lancement jugée sans « retenu » ne se rattrape pas : « pour cette version de l'étape 28 » (constat 7).
    if (cas === 'pasProuve') assert.match(x.effectif.pourquoi.matchs, /Ils restent éteints pour cette version de l’étape 28\.$/, cas);
    else assert.match(x.effectif.pourquoi.matchs, /Il se rallumera de lui-même quand ce sera réglé\.$/, cas);
    // La page : comme éteint (pas de déroulé) et pourquoi ; l'enjeu (les fins de saison) ne dépend pas de cet interrupteur.
    assert.deepEqual(x.page.affichage, { saisons: 'allume', matchs: 'eteint' }, cas);
    assert.equal(x.page.deroule, null, cas);
    assert.equal(x.page.pourquoi, x.effectif.pourquoi.matchs, cas);
    assert.deepEqual(x.page.enjeu, r.tenues.page.enjeu, cas);
    // Le ticket : la phrase « éteint », et pourquoi.
    assert.deepEqual([x.prix.eteint, x.prix.probabilite, x.prix.phrase, x.prix.pourquoi], [true, null, PRIX_ETEINT, x.effectif.pourquoi.matchs], cas);
    assert.deepEqual(x.prix.raisons, [PRIX_ETEINT, x.effectif.pourquoi.matchs], cas);
  }
  // Le principal remis : ouvert de nouveau, sans aucun clic, les mêmes chiffres.
  assert.deepEqual([r.remis.effectif.matchs, r.remis.page.affichage.matchs, r.remis.range], ['tout', 'tout', 'tout']);
  assert.deepEqual(r.remis.prix, r.tenues.prix);
  // Le modèle de buts plus en service (réglages sans la clé).
  assert.equal(r.sansCle.matchs, 'eteint');
  assert.match(r.sansCle.pourquoi.matchs, /le modèle de buts \(étape 27\) n’est pas en service/);
  assert.deepEqual(r.sansCle.range, { saisons: 'allume', matchs: 'tout' });
  assert.equal(r.avecCle.matchs, 'tout');
  assert.equal(r.rangeALaFin, 'tout', 'une lecture ne modifie jamais l’interrupteur');
});

test('T15 bis affichageEffectif, dans ce processus : tout éteint → le registre de la mesure n’est même pas lu (la page du match ne le lit pas quand tout est éteint) ; un registre illisible → comme éteint, dit ; les fins de saison n’ont pas de condition ; la valeur rangée jamais modifiée', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(DDL_DE_LA_BASE.find((s) => /CREATE TABLE IF NOT EXISTS simulation_state\b/.test(s)));
  let lu = 0;
  const lancement = () => {
    lu++;
    return { le: '2026-09-01', version: 'simulation-v1' };
  };
  const avecCle = { modeleDeButs: REGLAGES_MODELE_DE_BUTS };
  let e = ES.affichageEffectif({ database: db, reglagesEnService: avecCle, lancement });
  assert.deepEqual([e.saisons, e.matchs, e.pourquoi, e.conditions, lu], ['eteint', 'eteint', { saisons: null, matchs: null }, null, 0]);
  ES.ecrireLaValeur(db, 'affichage_saisons', 'allume');
  e = ES.affichageEffectif({ database: db, reglagesEnService: null, lancement });
  assert.deepEqual([e.saisons, e.matchs, lu], ['allume', 'eteint', 0], 'les fins de saison : aucune condition, même sans la clé');
  ES.ecrireLaValeur(db, 'affichage_matchs', 'combines');
  e = ES.affichageEffectif({ database: db, reglagesEnService: avecCle, lancement });
  assert.deepEqual([e.matchs, lu], ['eteint', 1], 'sans jugement principal : comme éteint ; le registre lu cette fois');
  assert.match(e.pourquoi.matchs, /^Prix de combinés éteints : l’interrupteur est resté sur « combinés », mais la preuve de l’étape 28 n’est pas encore jugée/);
  ES.ecrireLaValeur(db, 'principal', { verdict: 'retenu', garde: { ok: true, eteints: [] }, lancement: '2026-09-01', version: 'simulation-v1' });
  e = ES.affichageEffectif({ database: db, reglagesEnService: avecCle, lancement });
  assert.deepEqual([e.matchs, e.pourquoi.matchs], ['combines', null]);
  // La garde de sûreté a éteint un marché : une INFORMATION, jamais une condition (constats 7 et 12).
  ES.ecrireLaValeur(db, 'principal', { verdict: 'retenu', garde: { ok: false, eteints: ['h2plusQueH1', '1 & les deux marquent'], seuilPt: 4 }, lancement: '2026-09-01', version: 'simulation-v1' });
  e = ES.affichageEffectif({ database: db, reglagesEnService: avecCle, lancement });
  assert.deepEqual([e.matchs, e.pourquoi.matchs, e.conditions.possible, e.conditions.garde], ['combines', null, true, false]);
  assert.deepEqual(e.conditions.eteintsParLaGarde, [{ cle: 'h2plusQueH1', libelle: '2e mi-temps plus de buts' }, { cle: '1 & les deux marquent', libelle: '1 & les deux marquent' }]);
  assert.equal(e.conditions.information, 'La garde de sûreté a éteint, pour cette version de l’étape 28, 2 marchés ou combinés : « 2e mi-temps plus de buts », « 1 & les deux marquent » — sur vos matchs, ils se sont écartés de plus de 4 points de ce qui est arrivé ; ils ne sont jamais montrés, le reste l’est');
  assert.doesNotMatch(e.conditions.information, /h2plusQueH1|deuxMiTemps05/, 'des libellés, jamais des clés');
  ES.ecrireLaValeur(db, 'principal', { verdict: 'retenu', garde: { ok: true, eteints: [] }, lancement: '2026-09-01', version: 'simulation-v1' });
  e = ES.affichageEffectif({ database: db, reglagesEnService: avecCle, lancement: () => { throw new Error('registre illisible'); } });
  assert.equal(e.matchs, 'eteint');
  assert.match(e.pourquoi.matchs, /aucun lancement en cours au registre/);
  assert.deepEqual(ES.lireLesValeurs(db), { affichage_saisons: 'allume', affichage_matchs: 'combines', principal: JSON.stringify({ verdict: 'retenu', garde: { ok: true, eteints: [] }, lancement: '2026-09-01', version: 'simulation-v1' }) });
  db.close();
});

// ------------------------------------------------------------ les routes de lecture

test('GET /api/simulation/saison : la dernière nuit, la loi affichée (forces du modèle EN SERVICE ici) et sa phrase, une colonne par famille présente, l’ordre officiel jamais réordonné, les textes (point près, ≥ 90 % / ≤ 10 %), la provenance avec l’heure ; une coupe → non calculé ; sans championnat → 400', () => {
  const s = lecteurs();
  assert.equal(s.nuits.saisons, 'complet');
  const c = s.saison.corps;
  assert.equal(s.saison.code, 200);
  assert.equal(c.calcule, true);
  assert.deepEqual([c.loi.loi, c.loi.phrase], ['forces', PHRASE_LOI_FORCES_SERVICE]);
  assert.deepEqual(c.tables[0].familles.map((f) => f.cle), ['premiere', 'promotion', 'promotion_barrage', 'relegation']);
  assert.deepEqual(c.tables[0].clubs.map((x) => x.rang), Array.from({ length: 20 }, (_, k) => k + 1));
  const ids = new Set(s.planté.clubs.map(([n]) => n));
  for (const club of c.tables[0].clubs) {
    assert.ok(ids.has(club.teamId), 'identifiant FotMob du club');
    for (const f of Object.values(club.familles)) {
      if (f.p >= 0.9) assert.equal(f.texte, f.unanime ? 'acquis sauf surprise' : '≥ 90 %');
      else if (f.p <= 0.1) assert.equal(f.texte, '≤ 10 %');
      else assert.equal(f.texte, `${Math.round(f.p * 100)} %`);
      assert.doesNotMatch(f.texte, /100 %|9[5-9] %/);
    }
  }
  assert.equal(c.mesure, 'Mesuré sur les saisons 2023-2026 (149 phases) avec le calendrier connu après coup, pas encore sur la saison en cours.');
  assert.equal(c.provenance.source, 'Simulation CôteMaster, classement FotMob');
  assert.match(c.provenance.detail, /^2.000 fins de saison simulées la nuit du 05\/10 à 3 h 00 · classement relevé le 04\/10 à 22 h 00 · 350 rencontres restantes, dont \d+ pas encore datées · loi : forces de buts du modèle de buts en service$/);
  assert.deepEqual(s.coupe, { code: 200, corps: { calcule: false, raison: 'Pas de fin de saison pour une coupe.' } });
  assert.equal(s.sansLigue.code, 400);
});

test('GET /api/simulation/enjeux : allumé, l’enjeu des rencontres par identifiants FotMob (jamais un nom), la loi affichée, la phrase arrondie à 5, quand il a été calculé ; des jours mal écrits → 400', () => {
  const s = lecteurs();
  assert.equal(s.enjeux.code, 200);
  assert.equal(s.enjeux.corps.affichage, 'allume');
  const e = s.enjeux.corps.enjeux;
  assert.equal(e.length, 20, 'deux journées (D + 1 et D + 8) de 10 rencontres, une loi chacune');
  for (const x of e) {
    assert.match(x.homeId, /^99010\d|99011\d|990120$/);
    assert.equal(x.loi, 'forces');
    assert.ok(x.enjeuDom === null || x.enjeuDom % 5 === 0);
    assert.match(x.quand, /^calculé la nuit du 05\/10, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel$/, 'rencontres du 06/10 et du 13/10 : refaites chaque nuit jusqu’à leur veille (constat 19)');
    assert.match(x.matchId, /^cal-2026-10-(06|13)-/);
  }
  assert.equal(s.enjeuxFaux.code, 400);
});

// ------------------------------------------------------------ la page du match et l'IA

test('la page du match : le bloc `simulation` APRÈS l’analyse — affichage, enjeu (« non calculé » pour un championnat non simulé), déroulé (affichage « tout ») repondéré sur la grille de CETTE analyse, 20 lignes avec l’écart mesuré (les 2 marchés écartés par la porte 1 absents), la phrase « Information, pas un pronostic » ; le message de l’IA identique avec ou sans le bloc', () => {
  const s = lecteurs();
  assert.equal(s.page.code, 200);
  const b = s.page.simulation;
  assert.deepEqual(b.affichage, { saisons: 'allume', matchs: 'tout' });
  assert.deepEqual([b.enjeu.calcule, b.enjeu.libelle], [false, 'Enjeu non calculé']);
  assert.equal(b.deroule.calcule, true);
  // Partie C (porte 1) : « un but dans chaque mi-temps » et « au moins un rouge » écartés, jamais montrés : 22 − 2 lignes.
  assert.equal(b.deroule.lignes.length, 20);
  assert.ok(!b.deroule.lignes.some((l) => ['deuxMiTemps05', 'rougeAuMoinsUn'].includes(l.cle)));
  assert.deepEqual(b.deroule.ecartes, { nombre: 2, phrase: '2 marchés de déroulé ne sont pas montrés : la preuve sur 2019-2023 les a écartés (le détail est dans Réglages › Versions du moteur).' });
  const p = Object.fromEntries(b.deroule.lignes.map((l) => [l.cle, l.p]));
  assert.ok(Math.abs(p.htH + p.htD + p.htA - 1) < 2e-6);
  assert.ok(b.deroule.lignes.every((l) => l.ecartMesure && typeof l.ecartMesure.ecart === 'number'));
  assert.equal(b.deroule.lignes.find((l) => l.cle === 'premierAvant30').ecartMesure.ecart, -0.71, 'la convention figée (créneaux 0..29)');
  assert.match(b.deroule.phrase, /^Information, pas un pronostic\. Ces pourcentages viennent de 10.000 matchs simulés la nuit du 05\/10\. Sur 17.818 matchs de juillet 2025 à septembre 2026 jamais appris, mesurés avec les cotes de clôture, ils se sont trompés jusqu’à 2 points selon le marché/, 'la période de la mesure, celle du survol (constat 24)');
  assert.match(b.deroule.phrase, /« 2e mi-temps plus de buts » : annoncé 43 %, arrivé 45 % ; « mené à la mi-temps et gagne » : annoncé 1,8 %, arrivé 2,3 %/);
  assert.doesNotMatch(b.deroule.phrase, /un but dans chaque mi-temps|rouge/, 'la phrase ne cite pas un marché écarté');
  assert.equal(b.deroule.mention, 'Ni pronostic ni règlement automatique.');
  assert.deepEqual(s.ia, { identique: true, mentionne: false });
});

// ------------------------------------------------------------ B6 : le prix juste

/** La grille ALIGNÉE refaite ici, indépendamment du code (modeleDeButsCommun.mjs), depuis λ, μ (3 décimales), ρ et le 1N2 affiché. */
function grilleAlignee(page) {
  const l = Number(page.modeleDeButs.expectedGoals.home.toFixed(3));
  const m = Number(page.modeleDeButs.expectedGoals.away.toFixed(3));
  const g = grilleOracle(l, m, page.modeleDeButs.rho).cases;
  const camp = [0, 0, 0];
  g.forEach((ligne, i) => ligne.forEach((v, j) => (camp[i > j ? 0 : i === j ? 1 : 2] += v)));
  const fair = [page.result.home, page.result.draw, page.result.away];
  return g.map((ligne, i) => ligne.map((v, j) => (v * fair[i > j ? 0 : i === j ? 1 : 2]) / camp[i > j ? 0 : i === j ? 1 : 2]));
}

test('B6 prix juste, score seul : « 1 & plus de 2,5 & les deux marquent » = la somme des cases de la grille ALIGNÉE sur le 1N2 affiché, à 1e-12 ; le simple = le 1N2 affiché ; si indépendants = le produit ; l’écart à la cote tapée, neutre ; pariable', () => {
  const s = lecteurs();
  const g = grilleAlignee(s.page);
  let attendu = 0;
  g.forEach((ligne, i) => ligne.forEach((v, j) => {
    if (i > j && i + j > 2.5 && i > 0 && j > 0) attendu += v;
  }));
  const r = s.prix.score.corps;
  assert.equal(s.prix.score.code, 200);
  assert.ok(Math.abs(r.probabilite - attendu) < 1e-12, `${r.probabilite} ≠ ${attendu}`);
  assert.ok(Math.abs(r.prixJuste - 1 / attendu) < 1e-9);
  assert.equal(r.coteMinimale, r.prixJuste);
  assert.ok(Math.abs(r.ecartALaCote - (4.2 * attendu - 1)) < 1e-12);
  assert.equal(r.pariable, true);
  assert.ok(r.siIndependants < r.probabilite, 'les sélections liées valent plus que le produit');
  assert.ok(Math.abs(s.prix.simple.corps.probabilite - s.page.result.home) < 1e-12);
  assert.match(r.provenance[0], /^grille du moteur \(modèle de buts unique\) de 3 h 00, alignée sur le 1N2 affiché$/);
});

test('B6 contradictoires → impossible, probabilité 0, pas de prix ; redondantes → le prix de la plus forte, dit ; corners → le produit avec la mention « supposés indépendants des buts : non mesuré »', () => {
  const p = lecteurs().prix;
  assert.deepEqual([p.contradictoires.corps.impossible, p.contradictoires.corps.probabilite, p.contradictoires.corps.prixJuste], [true, 0, null]);
  assert.ok(p.contradictoires.corps.mentions.some((x) => /impossible/.test(x)));
  assert.ok(Math.abs(p.redondantes.corps.probabilite - p.simple.corps.probabilite) < 1e-12);
  assert.ok(p.redondantes.corps.mentions.some((x) => /« Plus de 0,5 but » est déjà comprise dans « Man City »/.test(x)), JSON.stringify(p.redondantes.corps.mentions));
  const corners = lecteurs().distributionCorners.issues.over;
  assert.ok(Math.abs(p.corners.corps.probabilite - p.simple.corps.probabilite * corners) < 1e-12);
  assert.ok(p.corners.corps.mentions.includes('corners et tirs supposés indépendants des buts : non mesuré'));
});

test('B6 le déroulé : chiffré en « tout » (table de la nuit repondérée, la sélection de mi-temps NON pariable, dit) ; refusé en mots hors « tout », au-delà de 10 % de buts attendus bougés, sans ligne de nuit ; une jambe du score se chiffre toujours ; éteint → la phrase ; aucune simulation dans une requête (espion)', () => {
  const s = lecteurs();
  const p = s.prix;
  assert.ok(p.mtEnTout.corps.probabilite > 0 && p.mtEnTout.corps.probabilite < 1);
  assert.equal(p.mtEnTout.corps.pariable, false);
  assert.ok(p.mtEnTout.corps.mentions.some((x) => /ne se règle pas automatiquement/.test(x)));
  assert.ok(p.mtEnTout.corps.provenance.some((x) => /^déroulé simulé la nuit du 05\/10$/.test(x)));
  assert.deepEqual(p.mtEnCombines.corps.raisons, ['une sélection de déroulé (mi-temps, premier but…) ne se chiffre qu’avec l’affichage « tout » du déroulé simulé']);
  assert.match(p.mtAuDelaDe10.corps.raisons[0], /^Les buts attendus ont changé depuis la nuit \(\d,\d\d → \d,\d\d\) : déroulé refait la nuit prochaine\.$/);
  assert.match(p.mtSansLigne.corps.raisons[0], /^Pas de déroulé simulé pour ce match/);
  assert.ok(p.scoreSansLigne.corps.probabilite > 0, 'le score se chiffre sans déroulé');
  assert.deepEqual([p.vide.code, p.sansMarche.code], [400, 400]);
  assert.deepEqual([p.eteint.corps.eteint, p.eteint.corps.probabilite, p.eteint.corps.phrase], [true, null, PRIX_ETEINT]);
  assert.deepEqual(s.espion, { avant: 0, apres: 1 }, 'aucun appel de simulerMatch dans ce processus (l’espion compte bien : 1 après l’appel direct)');
});

test('les marchés écartés par la porte 1 (« un but dans chaque mi-temps », « au moins un rouge ») : refusés en mots par le ticket, même en « tout » — jamais un prix', () => {
  const p = lecteurs().prix;
  for (const [cas, pick] of [['butsDeuxMiTemps', 'Un but dans chaque mi-temps'], ['rouge', 'Au moins un rouge']]) {
    const c = p[cas].corps;
    assert.equal(p[cas].code, 200, cas);
    assert.deepEqual([c.probabilite, c.prixJuste], [null, null], cas);
    assert.deepEqual(c.raisons, [`« ${pick} » : ce marché a été écarté par la preuve sur 2019-2023`], cas);
    assert.deepEqual(c.parMatch, [], `${cas} : rien n’est chiffré pour ce match`);
  }
});

// ------------------------------------------------------------ B7 : les paris

test('B7 « J’ai parié » avec le prix juste d’un combiné : validé et rangé (probabiliteCombine, sa source, l’heure) ; le gain attendu = mise × (p × cote prise − 1) ; refusé : une sélection que le règlement ne sait pas régler (mi-temps), un pari simple, une probabilité hors bornes, une source trop longue ; sans prix juste, comme avant', () => {
  const p = lecteurs().paris;
  assert.equal(p.combine.code, 201);
  const b = p.combine.corps;
  assert.deepEqual([b.probabiliteCombine, b.probabiliteCombineSource, b.probabiliteCombineLueA, b.odds, b.cotePrise], [0.27, 'Prix juste : grille du moteur de 3 h 00, alignée sur le 1N2 affiché', '2026-10-05T01:00:00.000Z', 3.2, 3.2]);
  assert.deepEqual(b.gainAttendu, { montant: Math.round(10 * (0.27 * 3.2 - 1) * 100) / 100, pourcent: Math.round((0.27 * 3.2 - 1) * 100 * 100) / 100, raison: null });
  assert.equal(p.miTemps.code, 400);
  assert.equal(p.miTemps.corps.error, '« J’ai parié » refusé : « Mi-temps : Man City » se lit et se chiffre, mais ne se règle pas automatiquement — ce pari resterait en attente pour toujours (étape 28, v1).');
  assert.equal(p.simple.code, 400);
  assert.equal(p.horsBornes.code, 400);
  assert.equal(p.sourceLongue.code, 400);
  assert.equal(p.sansPrix.code, 201);
  assert.equal('probabiliteCombine' in p.sansPrix.corps, false);
  assert.deepEqual(p.sansPrix.corps.gainAttendu, { montant: null, pourcent: null, raison: 'combine' });
  assert.equal(p.carnet.length, 2, 'les refus n’ont rien écrit');
});

test('B7 le suivi : un combiné noté et réglé compte dans le gain attendu, son écart-type est FINI et égal à mise × cote × √(p(1 − p)) (la probabilité du PARI, jamais celle de sa première sélection) ; le coupe-circuit identique avec ou sans les champs nouveaux', () => {
  const s = lecteurs();
  assert.equal(s.paris.regle, 'won');
  const a = s.paris.attendu;
  assert.equal(a.regles, 1);
  assert.ok(Number.isFinite(a.ecartType));
  assert.ok(Math.abs(a.ecartType - 10 * 3.2 * Math.sqrt(0.27 * 0.73)) < 1e-9);
  assert.equal(a.gainReel, 22);
  assert.deepEqual(s.tilt, { identique: true });
});

test('B7 un carnet ANCIEN (simples notés, combinés sans prix juste, en attente, annulé) → le rapport de suivi du nouveau code est celui de l’ancien code, à l’octet (fixture calculée avec betsRepository.js et suiviParis.js d’avant l’étape 28) ; le gain attendu d’un combiné ancien reste « combine »', () => {
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'suivi-carnet-ancien-etape-28.json'), 'utf8'));
  const r = rapportDeSuivi({ paris: f.carnet, ...f.options });
  assert.equal(JSON.stringify(r), JSON.stringify(f.rapport));
  for (const bet of f.carnet.filter((b) => b.legs.length > 1)) assert.deepEqual(gainAttenduDuPari(bet), { montant: null, pourcent: null, raison: 'combine' });
});

test('« pariable » se décide par le RÈGLEMENT (deriveBetLegOutcome, lu jamais modifié) : résultat, total, les deux marquent, buts d’une équipe, corners → réglables ; mi-temps, score exact → non', () => {
  const leg = (market, pick, extra = {}) => ({ homeName: 'Man City', awayName: 'Liverpool', market, pick, ...extra });
  assert.equal(selectionReglable(leg('Résultat', 'Man City')), true);
  assert.equal(selectionReglable(leg('Total buts', 'Plus de 2,5 buts')), true);
  assert.equal(selectionReglable(leg('Les 2 équipes marquent', 'Oui')), true);
  assert.equal(selectionReglable(leg('Buts par équipe', 'Man City : plus de 1,5 buts')), true);
  assert.equal(selectionReglable(leg('Total corners', 'Plus de 9,5')), true);
  assert.equal(selectionReglable(leg('Mi-temps', 'Mi-temps : Man City')), false);
  assert.equal(selectionReglable(leg('Score exact', '2-1')), false);
});

// ------------------------------------------------------------ vérification du 27/10

test('la page du match quand la LECTURE de la simulation échoue (table de l’état illisible) : l’analyse rendue quand même (200), le bloc `simulation` absent, le reste identique — une lecture ratée n’empêche jamais l’analyse (vérification du 27/10, constat 13 a)', () => {
  const s = lecteurs();
  const r = s.pageLectureRatee;
  assert.equal(r.code, 200, r.erreur ?? undefined);
  assert.deepEqual([r.aLaCle, r.simulation], [false, null], 'le bloc absent');
  assert.deepEqual(r.result, s.page.result, 'le 1N2 de l’analyse identique');
  assert.deepEqual(r.verdicts, s.page.verdicts);
});

test('la GARDE DE SÛRETÉ éteint SEULS ses marchés (vérification du 27/10, constats 7 et 12) : principal « retenu », « 2e mi-temps plus de buts » et « 1 & les deux marquent » au-delà de 4 points → « tout » permis (200) ; la page sans ce marché (19 lignes), les écartés dits ; le prix des autres combinés donné ; les deux éteints refusés en mots ; Réglages le dit en libellés', () => {
  const g = lecteurs().garde;
  assert.equal(g.put.code, 200, JSON.stringify(g.put.corps));
  assert.deepEqual([g.etat.conditions.possible, g.etat.conditions.garde, g.etat.effectif.matchs], [true, false, 'tout']);
  assert.deepEqual(g.etat.conditions.manques, [], 'la garde n’est pas un manque');
  assert.match(g.etat.conditions.information, /^La garde de sûreté a éteint, pour cette version de l’étape 28, 2 marchés ou combinés : « 2e mi-temps plus de buts », « 1 & les deux marquent »/);
  assert.equal(g.page.affichage.matchs, 'tout');
  const cles = g.page.deroule.lignes.map((l) => l.cle);
  assert.equal(cles.length, 19, 'les 20 lignes montrées moins le marché éteint par la garde');
  assert.ok(!cles.includes('h2plusQueH1'));
  assert.equal(g.page.deroule.ecartes.nombre, 3);
  assert.equal(g.page.deroule.ecartes.phrase, '3 marchés de déroulé ne sont pas montrés : la preuve sur 2019-2023 en a écarté 2, la garde de sûreté sur vos matchs en a éteint un (le détail est dans Réglages › Versions du moteur).');
  assert.doesNotMatch(g.page.deroule.phrase, /2e mi-temps plus de buts/, 'la phrase cite un marché montré');
  assert.ok(g.prixScore.probabilite > 0 && !g.prixScore.eteint, 'les autres combinés : leur prix');
  assert.ok(g.prixMtEnTout.probabilite > 0, 'le reste du déroulé se chiffre');
  assert.deepEqual([g.prixBtts.probabilite, g.prixBtts.raisons], [null, ['« 1 & les deux marquent » : ce combiné a été éteint par la garde de sûreté : sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé']]);
  assert.deepEqual([g.prixH2.probabilite, g.prixH2.raisons], [null, ['« 2e mi-temps plus de buts » : ce marché a été éteint par la garde de sûreté : sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé']]);
});

test('B7 « J’ai parié » SANS prix juste avec une jambe d’un marché de DÉROULÉ (mi-temps) → 400, en combiné comme en simple : elle ne se règle pas automatiquement (vérification du 27/10, constat 17) ; rien écrit', () => {
  const p = lecteurs().paris;
  for (const r of [p.derouleSansPrix, p.derouleSimple]) {
    assert.equal(r.code, 400);
    assert.equal(r.corps.error, '« J’ai parié » refusé : « Mi-temps : Man City mène » se lit et se chiffre, mais ne se règle pas automatiquement — ce pari resterait en attente pour toujours (étape 28, v1).');
  }
  assert.equal(p.carnet.length, 2, 'les refus n’ont rien écrit');
});
