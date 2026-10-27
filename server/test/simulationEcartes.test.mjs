/**
 * Étape 28 du plan — LES MARCHÉS ÉCARTÉS PAR LA PORTE 1 (football-data P2, 2019-2023 ; data/simulation/marchesEcartes.js).
 *   node --test test/simulationEcartes.test.mjs        (depuis server/)
 *
 * La porte 1 a éteint deux marchés de déroulé : « un but dans chaque mi-temps » (net exact −1,28 pt, au-delà de la règle
 * de 1 point) et « au moins un rouge » (annoncé 21,69 %, arrivé 18,04 %). Ils ne sont JAMAIS montrés : ni dans le déroulé
 * simulé de la page, ni comme jambe d'un combiné (refus en mots). Ils restent éteints en v1 ; la nuit les juge encore
 * (P5 les rapporte) ; les rallumer demandera une variante déclarée. Ici, dans ce processus, modules purs :
 *   - la liste est LUE dans la note (noteDeLaSimulation.js), jamais recopiée : une autre note → une autre liste ;
 *   - « non vérifié » (plus de 1 % de rencontres écartées) éteint les 17 marchés jugés ; une porte fermée, tout ;
 *   - le déroulé de la page (une vraie table jointe, tirée ici) n'a ni ligne ni chiffre pour eux, la phrase ne les cite
 *     pas ; le dictionnaire jambe → marché couvre toutes les sélections de déroulé ;
 *   - un combiné que la note dirait éteint est reconnu dans un ticket, dans n'importe quel ordre ; les 14 combinés de la
 *     porte = ceux de la nuit.
 * (Le refus par la route, POST /api/simulation/prix-combine, et la page du match : simulationLecteurs.test.mjs.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NOTE_DE_LA_SIMULATION as NOTE } from '../src/data/simulation/noteDeLaSimulation.js';
import * as E from '../src/data/simulation/marchesEcartes.js';
import * as R from '../src/data/simulation/simulationRead.js';
import { MARCHES_DE_DEROULE } from '../src/data/simulation/jambes.js';
import { ECARTS_MESURES_V, PARAMS } from '../src/data/simulation/reglages.js';
import { simulerMatch, tableJointe } from '../src/data/simulation/simulationMatch.js';
import { grilleDesButs } from '../src/core/engine/goalModel.js';
import { COMBINES_DE_LA_NUIT, MARCHES_DE_LA_NUIT } from '../src/data/simulation/simulationNuit.js';
import { SERVEUR } from './aides/isolement.mjs';

const copie = (x) => JSON.parse(JSON.stringify(x));
const ECARTES_DE_LA_NOTE = NOTE.f2c.marches.filter((m) => m.eteint === true).map((m) => m.cle);

test('la liste des marchés écartés est LUE dans la note de la porte 1 (« un but dans chaque mi-temps », « au moins un rouge »), jamais recopiée à la main ; aucun combiné écarté', () => {
  assert.deepEqual(ECARTES_DE_LA_NOTE, ['deuxMiTemps05', 'rougeAuMoinsUn'], 'le verdict de la porte 1 du 27/10/2026');
  const e = E.marchesEcartes();
  assert.deepEqual(e.deroule.map((m) => m.cle), ECARTES_DE_LA_NOTE);
  assert.deepEqual(e.deroule.map((m) => m.libelle), ['un but dans chaque mi-temps', 'au moins un rouge']);
  assert.deepEqual(e.deroule.map((m) => [m.annonce, m.realise, m.netExact]), [[53.68, 54.66, -1.28], [21.69, 18.04, 3.6]]);
  assert.deepEqual([e.porte, e.date, e.nonVerifie, e.combines], ['ouverte', '2026-10-27', false, []]);
  assert.equal(e.regle, 'Ils restent éteints en v1 : la preuve sur vos matchs les rapporte, sans jamais les montrer sur un match ; les rallumer demandera une variante déclarée de l’étape 28.');
  // Une autre note → une autre liste : rien n'est écrit en dur.
  const autre = copie(NOTE);
  for (const m of autre.f2c.marches) m.eteint = m.cle === 'htFt3' ? true : m.eteint === null ? null : false;
  assert.deepEqual(E.marchesEcartes(autre).deroule.map((m) => m.cle), ['htFt3']);
  // Le code ne recopie pas la liste : aucun module (serveur, interface) n'écrit les deux clés côte à côte.
  const fichiers = [path.join(SERVEUR, 'src', 'data', 'simulation'), path.join(SERVEUR, '..', 'ui', 'src')].flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, String(f))).filter((f) => /\.(js|vue)$/.test(f)) : []));
  for (const f of fichiers) {
    if (/noteDeLaSimulation\.js$/.test(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /['"]deuxMiTemps05['"]\s*,\s*['"]rougeAuMoinsUn['"]|['"]rougeAuMoinsUn['"]\s*,\s*['"]deuxMiTemps05['"]/, `${path.basename(f)} recopie la liste des écartés`);
  }
});

test('« non vérifié » (plus de 1 % de rencontres écartées) → les 17 marchés jugés éteints ; une porte fermée → tous les marchés de déroulé et les 14 combinés', () => {
  const nv = copie(NOTE);
  nv.f2c.parMarche.nonVerifie = true;
  for (const m of nv.f2c.marches) m.eteint = m.dansLaPorte ? true : null;
  const e = E.marchesEcartes(nv);
  assert.equal(e.nonVerifie, true);
  assert.deepEqual(e.deroule.map((m) => m.cle).sort(), [...NOTE.f2c.parMarche.marches].sort());
  assert.equal(e.deroule.length, 17);
  const fermee = { ...copie(NOTE), porte: 'fermee' };
  const f = E.marchesEcartes(fermee);
  assert.equal(f.deroule.length, NOTE.f2c.marches.length);
  assert.equal(f.combines.length, 14);
});

test('le dictionnaire jambe → marché : chaque sélection de déroulé du ticket (jambes.js) dit les marchés qu’elle mesure ; une jambe écartée est refusée en mots, une autre passe', () => {
  const j = (marketId, params, pick = null) => ({ marketId, params, pick });
  assert.deepEqual(E.clesDeLaJambe(j('halfTimeResult', { outcome: 'draw' })), ['htD']);
  assert.deepEqual(E.clesDeLaJambe(j('halfTimeGoals', { line: 1.5, side: 'under' })), ['htO15']);
  assert.deepEqual(E.clesDeLaJambe(j('halfTimeGoals', { line: 2.5, side: 'over' })), [], 'une ligne jamais jugée');
  assert.deepEqual(E.clesDeLaJambe(j('halfTimeFullTime', { ht: 'away', ft: 'home' })), ['htFt6'], '2/1');
  assert.deepEqual(E.clesDeLaJambe(j('halfTimeFullTime', { ht: 'home', ft: 'home' })), ['htFt0'], '1/1');
  assert.deepEqual(E.clesDeLaJambe(j('comeback', { outcome: 'yes' })), ['retourDom', 'retourExt']);
  assert.deepEqual(E.clesDeLaJambe(j('result', { outcome: 'home' })), [], 'une jambe du score n’est pas un marché de déroulé');
  // Chaque marché de déroulé du ticket a sa place dans le dictionnaire (sauf « marque dans les deux mi-temps », jamais jugé).
  const PARAMS_D_ESSAI = { halfTimeResult: { outcome: 'home' }, halfTimeGoals: { line: 0.5, side: 'over' }, halfTimeFullTime: { ht: 'home', ft: 'home' }, firstGoal: { team: 'home' }, teamScoresBothHalves: { team: 'home', outcome: 'yes' } };
  for (const id of MARCHES_DE_DEROULE) {
    const params = PARAMS_D_ESSAI[id] ?? { outcome: 'yes' };
    if (id === 'teamScoresBothHalves') assert.deepEqual(E.clesDeLaJambe(j(id, params)), []);
    else assert.ok(E.clesDeLaJambe(j(id, params)).every((k) => k in ECARTS_MESURES_V.marches) && E.clesDeLaJambe(j(id, params)).length > 0, id);
  }
  // Les deux écartés : refusés quel que soit le sens ; les autres passent.
  for (const outcome of ['yes', 'no']) {
    assert.equal(E.jambeEcartee(j('goalInBothHalves', { outcome }, 'Un but dans chaque mi-temps')).phrase, '« Un but dans chaque mi-temps » : ce marché a été écarté par la preuve sur 2019-2023');
    assert.equal(E.jambeEcartee(j('redCard', { outcome })).cle, 'rougeAuMoinsUn');
  }
  for (const x of [j('halfTimeResult', { outcome: 'home' }), j('firstGoal', { team: 'away' }), j('totalGoals', { line: 2.5, side: 'over' })]) assert.equal(E.jambeEcartee(x), null);
});

test('jamais montrés sur la page : le déroulé d’une vraie table jointe (tirée ici) n’a ni ligne ni chiffre pour un marché écarté, et sa phrase ne les cite pas ; les autres lignes sont toutes là', () => {
  const lambda = 1.45;
  const mu = 1.15;
  const grille = grilleDesButs(lambda, mu, -0.05);
  const chemins = simulerMatch({ lambda, mu, grille, params: PARAMS, n: 2000, seed: 28 });
  const ligne = { table_jointe: tableJointe(chemins), lambda, mu, calcule_le: '2026-10-26T23:41:00.000Z' };
  const d = R.derouleDeLaPage({ ligne, entrees: { grille: 'modele-buts-441', lambda, mu, rho: -0.05, fair: null } });
  assert.equal(d.calcule, true);
  const cles = d.lignes.map((l) => l.cle);
  for (const k of ECARTES_DE_LA_NOTE) assert.ok(!cles.includes(k), `${k} montré`);
  assert.deepEqual(cles, R.lignesMontrees());
  assert.equal(cles.length, 20);
  assert.deepEqual(d.ecartes, { nombre: 2, phrase: R.phraseDesEcartes() });
  assert.doesNotMatch(`${d.phrase} ${d.provenance} ${d.ecartes.phrase}`, /un but dans chaque mi-temps|rouge/i);
  assert.match(d.phrase, /ils se sont trompés jusqu’à 2 points selon le marché \(« 2e mi-temps plus de buts » : annoncé 43 %, arrivé 45 %/);
});

test('un combiné que la note dirait éteint est reconnu dans un ticket (jambes dans n’importe quel ordre, ligne écrite en texte) et refusé en mots ; un autre ticket passe ; les 14 combinés de la porte sont ceux de la nuit', () => {
  assert.deepEqual(copie(E.COMBINES_DE_LA_PORTE), copie(COMBINES_DE_LA_NUIT));
  const note = copie(NOTE);
  note.f3a.eteints = ['1 & plus de 2,5'];
  const e = E.marchesEcartes(note);
  const ticket = [{ marketId: 'totalGoals', params: { side: 'over', line: '2.5' } }, { marketId: 'result', params: { outcome: 'home' } }];
  assert.deepEqual(E.combineEcarte(ticket, e), { nom: '1 & plus de 2,5', phrase: '« 1 & plus de 2,5 » : ce combiné a été écarté par la preuve sur 2019-2023' });
  assert.equal(E.combineEcarte([...ticket, { marketId: 'bothTeamsScore', params: { outcome: 'yes' } }], e), null, 'un autre combiné');
  assert.equal(E.combineEcarte(ticket), null, 'la vraie note : aucun combiné écarté');
});

test('la nuit juge encore les marchés écartés (la preuve sur vos matchs les RAPPORTE) ; les rallumer passe par une variante déclarée, jamais un réglage', () => {
  for (const k of ECARTES_DE_LA_NOTE) assert.ok(MARCHES_DE_LA_NUIT.includes(k), `${k} jugé chaque nuit`);
  const p = R.porte1PourLEcran();
  assert.deepEqual(p.ecartes.map((m) => m.cle), ECARTES_DE_LA_NOTE);
  assert.equal(p.regle, E.REGLE_DES_ECARTES);
  // Aucun interrupteur, aucun réglage ne les rallume : la liste ne dépend que de la note (aucune lecture de la base ni d'un fichier).
  const code = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'simulation', 'marchesEcartes.js'), 'utf8');
  assert.doesNotMatch(code, /openDb|DatabaseSync|readFileSync|engine-config|simulation_state|affichage/);
});

test('la GARDE DE SÛRETÉ ajoute ses éteints aux écartés, chacun SEUL (vérification du 27/10, constats 7 et 12) : un marché de déroulé (son libellé, `parLaGarde`) et un combiné ; un éteint déjà écarté par la note n’est pas compté deux fois ; refus en mots propres ; le déroulé de la page perd cette ligne seulement ; la phrase des écartés dit les deux sources', () => {
  const garde = { ok: false, eteints: ['h2plusQueH1', '1 & les deux marquent', 'deuxMiTemps05'], seuilPt: 4 };
  const e = E.marchesEcartes(undefined, { garde });
  assert.deepEqual(e.deroule.map((m) => [m.cle, Boolean(m.parLaGarde)]), [['deuxMiTemps05', false], ['rougeAuMoinsUn', false], ['h2plusQueH1', true]]);
  assert.equal(e.deroule.find((m) => m.cle === 'h2plusQueH1').libelle, ECARTS_MESURES_V.marches.h2plusQueH1.libelle);
  assert.deepEqual(e.combines, [{ nom: '1 & les deux marquent', parLaGarde: true }]);
  assert.deepEqual(E.marchesEcartes(), E.marchesEcartes(undefined, { garde: null }), 'sans garde : la note seule');
  assert.deepEqual(E.marchesEcartes(undefined, { garde: { ok: true, eteints: [] } }), E.marchesEcartes());
  const j = E.jambeEcartee({ marketId: 'secondHalfMoreGoals', params: { outcome: 'yes' }, pick: '2e mi-temps plus de buts' }, e);
  assert.deepEqual(j, { cle: 'h2plusQueH1', libelle: '2e mi-temps plus de buts', phrase: `« 2e mi-temps plus de buts » : ${E.PHRASE_DU_MARCHE_ETEINT_PAR_LA_GARDE}`, parLaGarde: true });
  const c = E.combineEcarte([{ marketId: 'bothTeamsScore', params: { outcome: 'yes' } }, { marketId: 'result', params: { outcome: 'home' } }], e);
  assert.deepEqual(c, { nom: '1 & les deux marquent', phrase: `« 1 & les deux marquent » : ${E.PHRASE_DU_COMBINE_ETEINT_PAR_LA_GARDE}`, parLaGarde: true });
  assert.equal(E.combineEcarte([{ marketId: 'result', params: { outcome: 'home' } }, { marketId: 'totalGoals', params: { line: 2.5, side: 'over' } }], e), null, 'un autre combiné passe');
  assert.match(E.PHRASE_DU_MARCHE_ETEINT_PAR_LA_GARDE, /garde de sûreté : sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé/);
  // La page : la ligne éteinte retirée, les autres gardées (19) ; la phrase du déroulé ne la cite pas ; les écartés dits.
  const lignes = R.lignesMontrees(e);
  assert.equal(lignes.length, 19);
  assert.ok(!lignes.includes('h2plusQueH1') && lignes.includes('htFt6'));
  assert.equal(R.phraseDesEcartes(e), '3 marchés de déroulé ne sont pas montrés : la preuve sur 2019-2023 en a écarté 2, la garde de sûreté sur vos matchs en a éteint un (le détail est dans Réglages › Versions du moteur).');
  assert.equal(R.phraseDesEcartes(), '2 marchés de déroulé ne sont pas montrés : la preuve sur 2019-2023 les a écartés (le détail est dans Réglages › Versions du moteur).', 'sans garde : la phrase d’avant');
  assert.doesNotMatch(R.phraseDuDeroule('2026-10-05T01:00:00.000Z', e), /2e mi-temps plus de buts/);
});
