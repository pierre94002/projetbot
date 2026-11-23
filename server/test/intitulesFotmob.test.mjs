/**
 * Lot « compo-ko », partie « intitulés renommés » (21/11/2026) — FotMob publie la première division turque sous
 * « TUR|Süper Lig » depuis le 08/11/2026 au soir, la table des compétitions (FOTMOB_LEAGUES, fotMobProvider.js, gelée
 * pendant l'essai n° 3) dit « TUR|Super Lig ».
 *
 * Constats du 21/11/2026 (listes FotMob lues avec les en-têtes de l'appli) : l'intitulé a changé même dans les listes
 * des journées passées ; le calendrier et les résultats s'arrêtaient au 08/11 à 18 h 52 (UTC) ; Beşiktaş –
 * Gençlerbirliği (3-0 ce soir-là) restait « à venir » et ses 12 pronostics en attente ; Gençlerbirliği – Gaziantep FK
 * (1-0, 21/11) n'aurait pas été réglé ; les cotes gratuites et les absents des matchs turcs n'étaient plus relevés ;
 * Amed SK – Çaykur Rizespor n'était pas rattrapé par la règle « un seul club connu » (compo-ko). Le même relevé, sur
 * 15 journées et toutes les compétitions suivies, trouve deux autres intitulés non reconnus, des phases finales écrites
 * « Compétition - Phase - Tour » : « ARG|Liga Profesional - Clausura - 8th Finals » (depuis le 20/11 : Vélez Sarsfield –
 * Belgrano, 2-2, pas enregistré) et « MEX|Liga MX - Apertura - Quarter-finals » (à partir du 25/11).
 *
 * Le correctif (data/providers/intitulesFotmob.js) : une traduction NOMMÉE de l'intitulé publié vers celui de la table,
 * compétition par compétition, lue par fotMobCalendar.js, jobs/oddsWatch.js, enregistreurs/absents.js et
 * autoMatchAiTrigger.js ; et un rattrapage des journées manquées au calendrier (du premier jour manqué à la veille de la
 * période relue), pour les seules compétitions renommées, une fois par processus.
 *
 * Relecture n° 2 du lot (21/11, v5) : un intitulé que la table écarte (féminines, jeunes, réserves) n'est jamais traduit
 * (T-I1) ; une journée rattrapée en échec ne fait plus reculer le repère de l'étape, et un rattrapage en échec, revenu
 * vide ou suivi d'une fusion en erreur n'est pas noté fait (T-I5, trois scénarios du script).
 *
 * aides/script-intitules-fotmob.mjs fait une VRAIE passe du calendrier dans une copie isolée (FotMob simulé, scripts de
 * fusion recopiés, heure figée au 21/11 à 14 h UTC). Sur l'ancien code, rien de turc n'y entre (T-I3 rouge) : c'est
 * ainsi que le correctif a été vu échouer d'abord.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { intituleDeLaTable, journeesARattraper, RENOMMAGES, RATTRAPAGE_MAX_JOURS } from '../src/data/providers/intitulesFotmob.js';
import { FOTMOB_LEAGUES, leagueKeyMatches } from '../src/data/providers/fotMobProvider.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-intitules-fotmob.mjs');
const SUPER_LIG = `TUR|S${String.fromCharCode(0xfc)}per Lig`;
const SUPER_LIG_DECOMPOSE = `TUR|Su${String.fromCharCode(0x308)}per Lig`;

// Une copie et une passe par scénario du script (« base », « echec », « vide », « fusion »), lues une seule fois.
const sorties = new Map();
function resultat(scenario = 'base') {
  if (sorties.has(scenario)) return sorties.get(scenario);
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, { maintenant: '2026-11-21T14:00:00.000Z', timeout: 120_000, env: { CM_ESSAI_INTITULES: scenario } });
    assert.equal(r.code, 0, [`script-intitules-fotmob.mjs (${scenario}) a échoué`, r.erreurs.slice(-3000), r.sortie.slice(-1500)].join(' | '));
    assert.equal(r.reseau, false, ['un appel réseau a été tenté', r.erreurs.slice(-1500)].join(' | '));
    assert.ok(r.json?.ok, `sortie illisible : ${r.sortie.slice(-500)}`);
    assert.equal(r.json.scenario, scenario);
    sorties.set(scenario, r.json);
  } finally {
    copie.nettoyer();
  }
  return sorties.get(scenario);
}

test('T-I1 : « TUR|Süper Lig » (FotMob depuis le 08/11) est traduit vers « TUR|Super Lig » (la table), sous ses deux formes Unicode ; les phases finales « Compétition - Phase - Tour » d’Argentine et de Liga MX vers « … Phase Playoff » ; tout autre intitulé est rendu tel quel', () => {
  assert.deepEqual(RENOMMAGES.map((r) => [r.league, r.depuis]), [['Turkey Super League', '2026-11-08'], ['Primera División - Argentina', '2026-11-20'], ['Liga MX', '2026-11-25']]);
  assert.equal(RENOMMAGES[0].fotmob, SUPER_LIG, 'écrit en forme NFC');
  for (const r of RENOMMAGES) assert.ok(r.league in FOTMOB_LEAGUES, `${r.league} : une compétition de la table`);
  assert.equal(intituleDeLaTable(SUPER_LIG), 'TUR|Super Lig');
  assert.equal(intituleDeLaTable(SUPER_LIG_DECOMPOSE), 'TUR|Super Lig', 'le « ü » décomposé (u + tréma) aussi');
  assert.ok(leagueKeyMatches(FOTMOB_LEAGUES['Turkey Super League'], intituleDeLaTable(SUPER_LIG)), 'la traduction est reconnue par la table');
  assert.equal(leagueKeyMatches(FOTMOB_LEAGUES['Turkey Super League'], SUPER_LIG), false, 'sans traduction, la table gelée ne reconnaît pas le nouvel intitulé (le constat du 21/11)');
  for (const autre of ['TUR|Super Lig', 'TUR|1. Lig', 'ENG|Premier League', 'CHI|Primera División', 'BRA|Série A', `${SUPER_LIG} Women`, '']) {
    assert.equal(intituleDeLaTable(autre), autre, `« ${autre} » inchangé`);
  }
  assert.equal(leagueKeyMatches(FOTMOB_LEAGUES['Turkey Super League'], intituleDeLaTable('TUR|1. Lig')), false, 'la deuxième division turque n’est pas la Süper Lig');
  for (const rien of [null, undefined, 71]) assert.equal(intituleDeLaTable(rien), rien);
  // Phases finales (relevé du 21/11 : huitièmes argentins depuis le 20/11, quarts de la Liga MX à partir du 25/11), et
  // les tours suivants sous la même forme.
  const ARGENTINE = FOTMOB_LEAGUES['Primera División - Argentina'];
  const LIGA_MX = FOTMOB_LEAGUES['Liga MX'];
  for (const tour of ['8th Finals', 'Quarter-finals', 'Semi-finals', 'Final']) {
    const cle = `ARG|Liga Profesional - Clausura - ${tour}`;
    assert.equal(leagueKeyMatches(ARGENTINE, cle), false, `${cle} : la table gelée ne le reconnaît pas (le constat du 21/11)`);
    assert.equal(intituleDeLaTable(cle), 'ARG|Liga Profesional Clausura Playoff');
    assert.ok(leagueKeyMatches(ARGENTINE, intituleDeLaTable(cle)));
    const mx = `MEX|Liga MX - Apertura - ${tour}`;
    assert.equal(leagueKeyMatches(LIGA_MX, mx), false);
    assert.equal(intituleDeLaTable(mx), 'MEX|Liga MX Apertura Playoff');
    assert.ok(leagueKeyMatches(LIGA_MX, intituleDeLaTable(mx)));
  }
  assert.equal(intituleDeLaTable('ARG|Liga Profesional - Apertura - Final'), 'ARG|Liga Profesional Apertura Playoff');
  assert.equal(intituleDeLaTable('MEX|Liga MX - Clausura - Final'), 'MEX|Liga MX Clausura Playoff');
  // Les compétitions voisines restent ce qu'elles sont : ni la deuxième division mexicaine, ni le championnat féminin,
  // ni la saison régulière (déjà reconnue), ni une autre compétition argentine.
  for (const voisine of ['MEX|Liga de Expansión MX - Apertura - Final', 'MEX|Liga MX Femenil - Apertura - Final', 'MEX|Liga MX Femenil Apertura Playoff', 'MEX|Liga MX', 'ARG|Liga Profesional', 'ARG|Primera Nacional - Clausura - Final', 'ARG|Copa Argentina', 'ARG|Liga Profesional - Clausura']) {
    assert.equal(intituleDeLaTable(voisine), voisine, `« ${voisine} » inchangé`);
  }
  for (const voisine of ['MEX|Liga de Expansión MX - Apertura - Final', 'MEX|Liga MX Femenil - Apertura - Final']) {
    assert.equal(leagueKeyMatches(LIGA_MX, intituleDeLaTable(voisine)), false, `« ${voisine} » n’est pas la Liga MX`);
  }
  // Écartées par la table (féminines, jeunes, réserves) : jamais traduites — traduites, elles perdraient le mot qui les
  // écarte et entreraient comme la compétition suivie (relecture n° 2 du lot, M4).
  for (const ecartee of ['MEX|Liga MX - Apertura - U23 Final', 'MEX|Liga MX - Clausura - Women Final', 'ARG|Liga Profesional - Clausura - Reserves', 'ARG|Liga Profesional - Apertura - U20 Semi-finals']) {
    assert.equal(intituleDeLaTable(ecartee), ecartee, `« ${ecartee} » inchangé`);
    for (const motif of [ARGENTINE, LIGA_MX]) assert.equal(leagueKeyMatches(motif, intituleDeLaTable(ecartee)), false, `« ${ecartee} » n’entre dans aucune compétition suivie`);
  }
});

test('T-I2 : les journées à rattraper — du premier jour manqué à la veille de la période relue, pour les seules compétitions renommées, pas au-delà de 60 jours, rien si la compétition n’est pas relevée', () => {
  const jours = journeesARattraper('2026-11-14', '2026-11-21');
  assert.deepEqual([...jours.keys()], ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  for (const ligues of jours.values()) assert.deepEqual(ligues, ['Turkey Super League'], 'les phases finales n’avaient pas commencé');
  const plusTard = journeesARattraper('2026-11-23', '2026-11-30');
  assert.equal(plusTard.size, 15, 'du 08/11 au 22/11');
  assert.deepEqual(plusTard.get('2026-11-19'), ['Turkey Super League']);
  for (const j of ['2026-11-20', '2026-11-21', '2026-11-22']) assert.deepEqual(plusTard.get(j), ['Turkey Super League', 'Primera División - Argentina']);
  assert.deepEqual(journeesARattraper('2026-12-03', '2026-12-05').get('2026-11-25'), ['Turkey Super League', 'Primera División - Argentina', 'Liga MX']);
  assert.equal(journeesARattraper('2026-11-08', '2026-11-21').size, 0, 'la période commence au jour du renommage : rien en plus');
  assert.equal(journeesARattraper('2026-11-01', '2026-11-21').size, 0, 'la période couvre déjà le renommage');
  assert.equal(journeesARattraper('2026-11-14', '2026-11-21', ['EPL', 'Ligue 1 - France']).size, 0, 'la compétition renommée n’est pas relevée');
  assert.equal(journeesARattraper('2026-11-14', '2026-11-21', ['Turkey Super League']).size, 6);
  assert.equal(RATTRAPAGE_MAX_JOURS, 60);
  const turquie = (m) => [...m.values()].flat().filter((l) => l === 'Turkey Super League').length;
  assert.equal(turquie(journeesARattraper('2027-01-01', '2027-01-07')), 54, 'à 60 jours du renommage turc, encore rattrapé (08/11 → 31/12)');
  assert.equal(turquie(journeesARattraper('2027-01-01', '2027-01-08')), 0, 'à 61 jours, plus rien pour lui');
  assert.equal(journeesARattraper('2027-01-01', '2027-01-08').get('2026-11-20')?.[0], 'Primera División - Argentina', 'les autres, plus récents, encore');
  assert.equal(journeesARattraper('2027-01-25', '2027-01-25').size, 0, 'à plus de 60 jours de tous : plus rien');
  for (const [debut, jour] of [[null, '2026-11-21'], ['2026-11-14', null], ['pas une date', '2026-11-21'], [20261114, '2026-11-21']]) {
    assert.equal(journeesARattraper(debut, jour).size, 0, `${debut} / ${jour} : rien, sans lever`);
  }
});

test('T-I3 : une vraie passe du calendrier (à blanc, puis pour de bon, puis la même aussitôt) — les rencontres turques du 21/11, Beşiktaş – Gençlerbirliği du 08/11 et les huitièmes argentins entrent au calendrier et aux résultats, sans doublon ; le rattrapage ne relit que la Süper Lig, une seule fois', () => {
  const { r0, r1, r2, calendrierApresR0, calendrierApresR1, resultatsApresR1, listesDemandees } = resultat();
  const rattrapage = { from: '2026-11-08', to: '2026-11-13', days: 6, leagues: ['Turkey Super League'], failures: 0, failedDates: [], empty: 0, matches: 2 };
  // À blanc : tout est relevé, rien n'est écrit.
  assert.deepEqual(r0.rattrapage, rattrapage, 'le rattrapage est fait aussi à blanc (rien n’est écrit)');
  assert.equal(r0.days, 15);
  assert.deepEqual(r0.byLeague['Turkey Super League'], { matches: 5, upcoming: 2 });
  assert.deepEqual(r0.byLeague.EPL, { matches: 2, upcoming: 1 }, 'Arsenal – Chelsea (08/11, EPL) n’est PAS relu : les journées rattrapées ne gardent que la Süper Lig');
  assert.deepEqual(r0.byLeague['Primera División - Argentina'], { matches: 2, upcoming: 1 }, 'les huitièmes du Clausura (« ARG|Liga Profesional - Clausura - 8th Finals »)');
  assert.deepEqual(Object.keys(r0.byLeague).sort(), ['EPL', 'Primera División - Argentina', 'Turkey Super League'], 'ni la deuxième division turque (« TUR|1. Lig »), ni la finale de la deuxième division mexicaine');
  assert.ok(calendrierApresR0.includes('2026-11-08 Turkey Super League Beşiktaş – Gençlerbirliği scheduled -'), 'à blanc : le calendrier n’a pas bougé');
  assert.equal(r0.results, null);
  // Pour de bon.
  assert.deepEqual(r1.rattrapage, rattrapage);
  assert.equal(r1.failures, 0);
  assert.deepEqual(r1.failedDates, []);
  assert.equal(r1.mergeError, null);
  assert.equal(r1.resultsError, null);
  assert.deepEqual(r1.results, { created: 4, updated: 0, conflicts: 0 }, 'Beşiktaş – Gençlerbirliği, Brentford – Fulham, Vélez Sarsfield – Belgrano, Gençlerbirliği – Gaziantep FK');
  assert.deepEqual(calendrierApresR1, [
    '2026-11-08 EPL Arsenal – Chelsea finished 1-1',
    '2026-11-08 Turkey Super League Beşiktaş – Gençlerbirliği finished 3-0',
    '2026-11-08 Turkey Super League Rizespor – Erzurumspor FK finished 2-1',
    '2026-11-15 EPL Brentford – Fulham finished 2-0',
    '2026-11-20 Primera División - Argentina Vélez Sarsfield – Belgrano finished 2-2',
    '2026-11-21 EPL Liverpool – Everton scheduled -',
    '2026-11-21 Primera División - Argentina Defensa y Justicia – Barracas Central scheduled -',
    '2026-11-21 Turkey Super League Gençlerbirliği – Gaziantep FK finished 1-0',
    '2026-11-21 Turkey Super League Kocaelispor – Fenerbahçe scheduled -',
    '2026-11-22 Turkey Super League Konyaspor – Beşiktaş scheduled -'
  ]);
  assert.deepEqual(resultatsApresR1, [
    'web-2026-11-08-arsenal-chelsea EPL 1-1',
    'web-2026-11-08-besiktas-genclerbirligi Turkey Super League 3-0',
    'web-2026-11-08-rizespor-erzurumspor-fk Turkey Super League 2-1',
    'web-2026-11-15-brentford-fulham EPL 2-0',
    'web-2026-11-20-velez-sarsfield-belgrano Primera División - Argentina 2-2',
    'web-2026-11-21-genclerbirligi-gaziantep-fk Turkey Super League 1-0'
  ], 'ce que lit le règlement : les résultats turcs et argentins manquants, aucun doublon');
  // Aussitôt après : le rattrapage est fait, la période seule est relue.
  assert.equal(r2.rattrapage, null);
  assert.equal(r2.days, 9);
  assert.deepEqual(r2.results, { created: 0, updated: 0, conflicts: 0 });
  assert.deepEqual(listesDemandees, ['20261108', '20261109', '20261110', '20261111', '20261112', '20261113', '20261114', '20261115', '20261116', '20261117', '20261118', '20261119', '20261120', '20261121', '20261122']);
});

test('T-I4 : les autres lecteurs libres de la liste du jour traduisent l’intitulé avant de le comparer (cotes gratuites, absents, match FotMob d’un match coté) ; le direct (liveWatch.js, que l’étape 46 modifie) et les fichiers gelés, pas encore', () => {
  const src = (rel) => fs.readFileSync(path.join(SERVEUR, 'src', rel), 'utf8');
  const cotes = src('jobs/oddsWatch.js');
  assert.match(cotes, /import \{ intituleDeLaTable \} from '\.\.\/data\/providers\/intitulesFotmob\.js';/);
  assert.match(cotes, /const intitule = intituleDeLaTable\(leagueKey\);\s+return LIBELLES\.find\(\(\[, matcher\]\) => leagueKeyMatches\(matcher, intitule\)\)/);
  const absents = src('data/enregistreurs/absents.js');
  assert.match(absents, /import \{ intituleDeLaTable \} from '\.\.\/providers\/intitulesFotmob\.js';/);
  assert.ok(absents.includes('const league = libelleSuivi(intituleDeLaTable(m.leagueKey));'));
  assert.ok(!absents.includes('libelleSuivi(m.leagueKey)'));
  const auto = src('core/ai/autoMatchAiTrigger.js');
  assert.ok(auto.includes('&& leagueKeyMatches(competition, intituleDeLaTable(f.leagueKey))'));
  const calendrier = src('data/providers/fotMobCalendar.js');
  assert.ok(calendrier.includes('const intitule = intituleDeLaTable(m.leagueKey);'));
  assert.ok(calendrier.includes('leagueKeyMatches(motif, intitule)'));
  assert.ok(!/leagueKeyMatches\(motif, m\.leagueKey\)/.test(calendrier));
  // Pas encore (dit dans intitulesFotmob.js) : à reprendre après la mise en service de la 46, puis après l'essai n° 3.
  assert.ok(src('jobs/liveWatch.js').includes('libelleSuivi(m.leagueKey)'));
  assert.ok(!src('data/providers/fotMobProvider.js').includes('intitulesFotmob'), 'la table gelée n’est pas touchée');
});

test('T-I5 : un rattrapage qui n’aboutit pas n’est pas noté fait (la passe suivante le refait) — journée rattrapée en échec, sans faire reculer le repère de l’étape ; liste revenue sans aucun match ; calendrier illisible (relecture n° 2 du lot, M1, M2, M6)', () => {
  const base = { from: '2026-11-08', to: '2026-11-13', days: 6, leagues: ['Turkey Super League'] };
  // (a) La liste du 08/11 (journée rattrapée) répond 404.
  const e = resultat('echec');
  assert.deepEqual(e.r1.rattrapage, { ...base, failures: 1, failedDates: ['2026-11-08'], empty: 0, matches: 0 });
  assert.equal(e.r1.failures, 1, 'comptée dans les échecs de la passe (Réglages la dit)');
  assert.deepEqual(e.r1.failedDates, [], 'mais pas dans failedDates : le repère de l’étape (resumeFrom) ne recule pas au 08/11');
  assert.deepEqual(e.r1.results, { created: 3, updated: 0, conflicts: 0 }, 'Brentford – Fulham, Vélez Sarsfield – Belgrano, Gençlerbirliği – Gaziantep FK ; pas Beşiktaş – Gençlerbirliği');
  assert.ok(e.calendrierApresR1.includes('2026-11-08 Turkey Super League Beşiktaş – Gençlerbirliği scheduled -'));
  assert.deepEqual(e.r2.rattrapage, e.r1.rattrapage, 'pas noté fait : la passe suivante le refait');
  assert.equal(e.r2.days, 15);
  assert.deepEqual(e.r2.failedDates, []);
  // (b) La liste du 10/11 revient sans aucun match (un incident chez FotMob : une vraie journée n’est jamais vide).
  const v = resultat('vide');
  assert.deepEqual(v.r1.rattrapage, { ...base, failures: 0, failedDates: [], empty: 1, matches: 2 });
  assert.deepEqual(v.r1.results, { created: 4, updated: 0, conflicts: 0 });
  assert.deepEqual(v.r2.rattrapage, v.r1.rattrapage, 'pas noté fait : refait');
  assert.deepEqual(v.r2.results, { created: 0, updated: 0, conflicts: 0 }, 'refait sans rien changer');
  // (c) Le calendrier de départ est illisible : sa fusion refuse d’écrire ; les résultats sont fusionnés quand même.
  const f = resultat('fusion');
  assert.ok(f.r1.mergeError, 'la fusion du calendrier refuse');
  assert.equal(f.r1.resultsError, null);
  assert.deepEqual(f.r1.results, { created: 4, updated: 0, conflicts: 0 });
  assert.equal(f.calendrierApresR1, 'illisible', 'rien n’est écrit au calendrier');
  assert.deepEqual(f.r2.rattrapage, { ...base, failures: 0, failedDates: [], empty: 0, matches: 2 }, 'pas noté fait après une fusion en erreur : refait');
  assert.ok(f.r2.mergeError);
  assert.deepEqual(f.r2.results, { created: 0, updated: 0, conflicts: 0 });
});
