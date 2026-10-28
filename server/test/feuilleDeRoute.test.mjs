/**
 * La feuille de route (étape 5 du plan).
 *   node --test test/feuilleDeRoute.test.mjs        (depuis server/)
 *
 * Deux familles :
 *  - le PLAN et l'HISTORIQUE, écrits dans le code (data/roadmap/plan.js,
 *    historique.js) : pures données, comparées ici à une copie figée des
 *    titres du cahier des charges (49 entrées, 9 lots, réglages, semaines) —
 *    aucune base, aucun fichier ;
 *  - les NOTES de Pierre, seule donnée d'exécution de la page
 *    (data/runtime/roadmap.json) : tout ce qui lit ou écrit un fichier tourne
 *    dans une copie ISOLÉE (cf. test/aides/isolement.mjs) — data/runtime à
 *    elle, réseau coupé, heure figée au 05/10/2026 12 h UTC, AUCUNE base (la
 *    copie n'en a pas : la page n'en ouvre jamais), ni Claude, ni FotMob. Le
 *    « redémarrage » est un second processus sur la même copie.
 *
 *  1. Le plan : 9 lots, 49 entrées (0, 1 à 5, E, 6 à 47) dans l'ordre, avec leur
 *     nom exact, leur lot, leur réglage, leur semaine prévue.
 *  2. L'historique : le lot 1 (0 à 5 et E) dans l'ordre où il a été fait, puis
 *     une ligne par étape terminée ; chaque ligne est complète ; la ligne « Tests ».
 *  3. L'état : les étapes terminées (COMPTÉES dans l'historique du code : une
 *     étape suivante n'a qu'une ligne à ajouter à HISTORIQUE, aucun test à
 *     retoucher), l'ordre des états, la semaine du plan au jour de Paris, le
 *     bilan de fin de lot (sa place).
 *  4. Les notes : enregistrées, relues après un redémarrage, PUT idempotent,
 *     fusion champ par champ, étape inconnue refusée, fichier illisible
 *     jamais écrasé ni pris pour vide, empreinte des données inchangée.
 *  5. Les routes branchées dans l'application (appelées comme le ferait Express).
 *  6. Aucun accès à la base, au réseau ni à Claude.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { LOTS, ETAPES, REGLAGES, CODES_REGLAGE, IDS_ETAPES, DEBUT_PLAN, SEMAINES_PLAN, dateDebutSemaine, dateFinSemaine, semaineDuJour, normaliserIdEtape, etapeParId } from '../src/data/roadmap/plan.js';
import { HISTORIQUE, ETAPES_EN_COURS, BILANS_DE_LOT } from '../src/data/roadmap/historique.js';
import { etatFeuilleDeRoute, ETATS } from '../src/data/roadmap/feuilleDeRoute.js';
import roadmapRoutes from '../src/api/routes/roadmap.routes.js';
import { etatPourFeuilleDeRoute } from '../src/bench/trialsRegistry.js';

// Ce qui est terminé, CALCULÉ à partir de l'historique du code (étape 7 du plan) :
// une étape suivante ajoute sa ligne à HISTORIQUE, et aucun compte ci-dessous n'est à retoucher.
// Étape 27 (21/10/2026) : une ligne PARTIELLE ne finit pas l'étape — une étape qui n'a que des lignes partielles
// est « en cours » (la 27 : en essai à blanc, adoption à venir).
const TERMINEES = new Set(HISTORIQUE.filter((h) => !h.partielle).map((h) => h.etape));
const NB_TERMINEES = TERMINEES.size;
/** Les étapes que l'historique raconte sans les finir (seulement des lignes partielles) : « en cours ». */
const PARTIELLES = new Set(HISTORIQUE.filter((h) => h.partielle && !TERMINEES.has(h.etape)).map((h) => h.etape));
const NB_PARTIELLES = PARTIELLES.size;
/** Le jour de fin de chaque étape terminée : celui de sa DERNIÈRE ligne qui la finit (un complément la repousse). */
const FINS = Object.fromEntries([...TERMINEES].map((id) => [id, HISTORIQUE.filter((h) => h.etape === id && !h.partielle).at(-1).fin]));
/** Les étapes à faire (ni terminées ni racontées en partie), dans l'ordre du plan : de quoi fabriquer des cas sans toucher à l'histoire. */
const LIBRES = IDS_ETAPES.filter((id) => !TERMINEES.has(id) && !PARTIELLES.has(id));
const avancementAttendu = ({ enCours = 0, miseDeCote = 0, enPlus = 0 } = {}) => ({
  total: 49,
  terminees: NB_TERMINEES + enPlus,
  enCours: enCours + NB_PARTIELLES,
  miseDeCote,
  aFaire: 49 - NB_TERMINEES - enPlus - enCours - NB_PARTIELLES - miseDeCote,
  part: (NB_TERMINEES + enPlus) / 49
});

// ------------------------------------------- 1. le plan (copie figée du cahier)

/** [id, nom exact, lot, réglage, semaine prévue, durée prévue] — les titres du cahier des charges du 05/10/2026. */
const ATTENDU = [
  ['0', 'Mise en service de ce qui est déjà construit (avant le lot 1)', 1, 'S', 1, '1-2 h'],
  ['1', 'Sauvegarde, restauration testée, entretien de la base', 1, 'C', 1, '4-6 h'],
  ['2', 'Bac à sable officiel', 1, 'C', 1, '3-4 h'],
  ['3', 'Tests automatiques', 1, 'C', 1, '5-7 h'],
  ['4', 'Budget Claude', 1, 'C', 1, '4-6 h'],
  ['5', 'Feuille de route', 1, 'S', 1, '3-4 h'],
  ['E', 'Enregistreurs (relevés qui ne se rattrapent pas)', 1, 'C', 1, '8-12 h'],
  ['6', 'Langage visuel des paris + guide de lecture', 2, 'S', 2, '3-5 h'],
  ['7', 'Cotes de ses bookmakers : fraîches, archivées, saisies', 2, 'C', 2, '6-8 h'],
  ['8', 'Opportunités du jour + correction de « Meilleures chances »', 2, 'C', 2, '5-7 h'],
  ['9', 'Page du match pour décider', 2, 'S', 2, '4-6 h'],
  ['10', 'Comparateur de bookmakers + ticket', 2, 'C', 2, '4-6 h'],
  ['11', 'Suivi des paris + garde-fous + comptes bookmakers', 2, 'C', 2, '6-8 h'],
  ['12', 'Contrôles + carnet de santé des données', 3, 'C', 3, '6-9 h'],
  ['13', 'Historique étendu football-data.co.uk + données de référence', 3, 'C', 3, '8-12 h'],
  ['14', 'Contrôle quotidien + santé des sources + plan de secours FotMob', 3, 'C', 3, '6-9 h'],
  ['15', 'Repères de chaque championnat', 3, 'C', 3, '6-9 h'],
  ['16', 'Garde-fou de la mesure', 4, 'B', 3, '4-6 h'],
  ['17', 'Table du jour J', 4, 'A', 4, '10-14 h'],
  ['18', 'Valeur de chaque statistique', 4, 'O', 4, '6-9 h'],
  ['19', "Banc d'essai", 4, 'A', 5, '14-20 h'],
  ['20', 'Calibration et suivi mensuel', 4, 'C', 5, '5-7 h'],
  ['21', "Carnet de notes de l'IA", 4, 'C', 6, '4-6 h'],
  ['22', 'Connaître le marché + meilleur moment pour parier', 4, 'O', 5, '6-8 h'],
  ['23', 'Où parier : carte championnat × marché', 4, 'C', 6, '4-6 h'],
  ['24', 'Tableau de bord du moteur (Santé du moteur)', 4, 'S', 6, '4-6 h'],
  ['25', 'Mise à jour sans risque (versions du moteur)', 5, 'C', 4, '5-7 h'],
  ['26', 'Boucle de correction', 5, 'O', 7, '5-7 h'],
  ['27', 'Modèle de score ancré sur le marché', 5, 'A', 6, '8-10 h'],
  ['28', 'Simulation complète', 5, 'A', 6, '8-10 h'],
  ['29', 'Indice de force des équipes', 5, 'O', 7, '4-6 h'],
  ['30', 'Fiches joueurs par poste', 5, 'O', 7, '6-8 h'],
  ['31', "Fiches à l'écran", 5, 'S', 7, '5-7 h'],
  ['32', 'Contexte du match', 6, 'O', 8, '3-4 h'],
  ['33', 'Cartons et corners', 6, 'O', 8, '2-3 h'],
  ['34', 'Buteurs et paris sur les joueurs', 6, 'O', 8, '3-4 h'],
  ['35', "Débuts de saison et changements d'effectif", 6, 'C', 8, '2-3 h'],
  ['36', 'Coupes et matchs à part', 6, 'C', 8, '2-3 h'],
  ['37', 'Styles et entraîneurs', 6, 'C', 7, '2-3 h'],
  ['38', 'Combinaison + confiance + seuil de value', 6, 'A', 9, '8-12 h'],
  ['39', 'La mise juste', 6, 'B', 9, '2-3 h'],
  ['40', "Fiche du pronostic à l'écran", 6, 'S', 9, '2-3 h'],
  ['41', 'Analyse IA de chaque match, compacte', 7, 'C', 2, '3-4 h'],
  ['42', 'Bulletin du jour + bilan de la semaine', 7, 'S', 6, '2-3 h'],
  ['43', 'Commentaires des matchs', 7, 'S', 3, '1-2 h'],
  ['44', "Mémoire de l'IA", 7, 'C', 8, '3-4 h'],
  ['45', "L'IA à l'écran", 7, 'S', 8, '3-4 h'],
  ['46', 'Prédiction en direct', 8, 'B', 10, '6-9 h'],
  ['47', 'Recette générale + régime de croisière', 9, 'B', 10, '8-12 h']
];

const NOMS_LOTS = ['Sécurité', 'Design des paris', 'Données', 'Mesure', 'Cœur : les buts', 'Reste du match et décision', 'IA', 'Direct', 'Recette'];

/** Les réglages du plan : lettre → étapes (A 5, B 4, O 8, S 10, C 22). */
const REGLAGES_PLAN = {
  A: ['17', '19', '27', '28', '38'],
  B: ['16', '39', '46', '47'],
  O: ['18', '22', '26', '29', '30', '32', '33', '34'],
  S: ['0', '5', '6', '9', '24', '31', '40', '42', '43', '45'],
  C: ['1', '2', '3', '4', 'E', '7', '8', '10', '11', '12', '13', '14', '15', '20', '21', '23', '25', '35', '36', '37', '41', '44']
};

/** Le calendrier en 12 semaines du plan : semaine de départ → étapes. */
const CALENDRIER = {
  1: ['0', '1', '2', '3', 'E', '4', '5'],
  2: ['6', '7', '9', '10', '11', '41', '8'],
  3: ['12', '13', '15', '14', '16', '43'],
  4: ['17', '18', '25'],
  5: ['19', '20', '22'],
  6: ['27', '28', '21', '23', '24', '42'],
  7: ['29', '30', '26', '31', '37'],
  8: ['32', '33', '34', '35', '36', '44', '45'],
  9: ['38', '40', '39'],
  10: ['46', '47']
};

const trie = (liste) => [...liste].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

test('plan : 9 lots et 49 entrées (0, 1 à 5, E, 6 à 47) dans l’ordre du plan, avec leur nom exact, leur lot, leur réglage, leur semaine prévue et leur durée', () => {
  assert.equal(LOTS.length, 9);
  assert.deepEqual(LOTS.map((l) => l.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(LOTS.map((l) => l.nom), NOMS_LOTS);
  assert.equal(ETAPES.length, 49);
  assert.deepEqual(IDS_ETAPES, ['0', '1', '2', '3', '4', '5', 'E', ...Array.from({ length: 42 }, (_, i) => String(i + 6))]);
  assert.deepEqual(ETAPES.map((e) => [e.id, e.nom, e.lot, e.reglage, e.semaine, e.heures]), ATTENDU);
  assert.equal(new Set(IDS_ETAPES).size, 49, 'un identifiant en double');
  // Chaque lot a ses étapes, et seulement les siennes (0 et E avec le lot 1, la semaine 1).
  const parLot = Object.fromEntries(LOTS.map((l) => [l.numero, ETAPES.filter((e) => e.lot === l.numero).map((e) => e.id)]));
  assert.deepEqual(parLot, {
    1: ['0', '1', '2', '3', '4', '5', 'E'],
    2: ['6', '7', '8', '9', '10', '11'],
    3: ['12', '13', '14', '15'],
    4: ['16', '17', '18', '19', '20', '21', '22', '23', '24'],
    5: ['25', '26', '27', '28', '29', '30', '31'],
    6: ['32', '33', '34', '35', '36', '37', '38', '39', '40'],
    7: ['41', '42', '43', '44', '45'],
    8: ['46'],
    9: ['47']
  });
  assert.equal(etapeParId('E').nom, 'Enregistreurs (relevés qui ne se rattrapent pas)');
});

test('plan : chaque lot a son objectif chiffré en une phrase, avec les chiffres du plan', () => {
  for (const l of LOTS) {
    assert.ok(typeof l.objectif === 'string' && l.objectif.length > 60 && l.objectif.endsWith('.'), `lot ${l.numero} : objectif`);
    assert.ok(!/\n/.test(l.objectif), `lot ${l.numero} : une seule phrase`);
  }
  const o = (n) => LOTS[n - 1].objectif;
  assert.match(o(1), /7 jours, 4 semaines et 12 mois/);
  assert.match(o(1), /moins d’une minute/);
  assert.match(o(3), /~600 fichiers/);
  assert.match(o(3), /plus de 95 %/);
  assert.match(o(3), /~30 contrôles/);
  assert.match(o(4), /au moins 2 saisons/);
  assert.match(o(4), /~50 %/);
  assert.match(o(4), /~95 %/);
  assert.match(o(5), /moins d’un point/);
  assert.match(o(7), /17 000 tokens/);
  assert.match(o(7), /~7 000/);
  assert.match(o(7), /24 400 et 10 800/);
  assert.match(o(8), /1 requête par minute/);
  assert.match(o(8), /1 toutes les 5 minutes/);
  assert.match(o(9), /Deux semaines sans panne/);
});

test('plan : les réglages A, B, O, C, S — exactement aux étapes du plan (5, 4, 8, 22 et 10)', () => {
  assert.deepEqual(CODES_REGLAGE, ['A', 'B', 'O', 'C', 'S']);
  assert.deepEqual(REGLAGES.map((r) => r.code), ['A', 'B', 'O', 'C', 'S']);
  for (const r of REGLAGES) assert.ok(r.court && r.detail, `réglage ${r.code} : sa légende`);
  assert.match(REGLAGES[0].detail, /Fable 5\.1 effort max \+ ultracode/);
  assert.match(REGLAGES[3].detail, /Opus 5\.5 effort high/);
  assert.match(REGLAGES[4].detail, /Sonnet 5\.5/);
  for (const [code, ids] of Object.entries(REGLAGES_PLAN)) {
    assert.deepEqual(trie(ETAPES.filter((e) => e.reglage === code).map((e) => e.id)), trie(ids), `réglage ${code}`);
  }
  assert.deepEqual(Object.values(REGLAGES_PLAN).map((l) => l.length), [5, 4, 8, 10, 22]);
});

test('plan : le calendrier en 12 semaines — la semaine 1 commence le 05/10/2026, chaque étape à sa semaine prévue', () => {
  assert.equal(DEBUT_PLAN, '2026-10-05');
  assert.equal(SEMAINES_PLAN, 12);
  // Les lundis donnés par le plan : 05/10, 12/10, 19/10, 26/10, 02/11, 09/11, 16/11, 23/11, 30/11, 07/12, 14/12, 21/12.
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => dateDebutSemaine(i + 1)),
    ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']
  );
  assert.equal(dateFinSemaine(1), '2026-10-11');
  assert.equal(dateFinSemaine(12), '2026-12-27');
  for (const [semaine, ids] of Object.entries(CALENDRIER)) {
    assert.deepEqual(trie(ETAPES.filter((e) => e.semaine === Number(semaine)).map((e) => e.id)), trie(ids), `semaine ${semaine}`);
  }
  assert.ok(ETAPES.every((e) => e.semaine >= 1 && e.semaine <= SEMAINES_PLAN && (e.semaineFin === undefined || (e.semaineFin > e.semaine && e.semaineFin <= SEMAINES_PLAN))));
  // Deux étapes courent sur plusieurs semaines (le socle de 25 puis son adoption ; la recette 47), et le plan précise les conditions et les jours de lancement.
  assert.deepEqual(ETAPES.filter((e) => e.semaineFin).map((e) => [e.id, e.semaine, e.semaineFin]), [['25', 4, 5], ['47', 10, 12]]);
  assert.deepEqual(ETAPES.filter((e) => e.precisionSemaine).map((e) => e.id), ['8', '14', '17', '19', '25', '27', '28', '38', '39', '47']);
  assert.match(etapeParId('28').precisionSemaine, /moins de 35 %.*lundi de la semaine 7/);
  assert.match(etapeParId('39').precisionSemaine, /moins de 35 %.*semaine 10/);
  // La semaine d'un jour (jour de Paris) : 0 ou moins avant le plan, 13 ou plus après.
  assert.deepEqual(['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-12', '2026-12-27', '2026-12-28'].map(semaineDuJour), [0, 1, 1, 2, 12, 13]);
});

test('plan : les identifiants d’étape — « E » et les nombres du plan, jamais « 07 », « 48 » ni un texte', () => {
  for (const id of IDS_ETAPES) assert.equal(normaliserIdEtape(id), id);
  assert.equal(normaliserIdEtape('e'), 'E');
  assert.equal(normaliserIdEtape(' 12 '), '12');
  assert.equal(normaliserIdEtape(12), '12');
  assert.equal(normaliserIdEtape(0), '0');
  for (const mauvais of ['07', '48', '0.5', '1.0', '-1', '12abc', 'ee', 'E1', '', '  ', 'toutes', null, undefined, {}, [], true]) {
    assert.equal(normaliserIdEtape(mauvais), null, `« ${JSON.stringify(mauvais)} » n'est pas une étape`);
  }
});

// ------------------------------------------------------- 2. l'historique

test('historique : le lot 1 (0 à 5 et E) dans l’ordre où il a été fait — le complément de la 1 est une ligne à part — puis une ligne par étape terminée ; le passé ne change pas', () => {
  // Le lot 1, tel qu'il s'est fait : ces huit lignes ne bougent plus.
  assert.deepEqual(HISTORIQUE.slice(0, 8).map((h) => h.etape), ['0', '2', '1', '3', '1', 'E', '4', '5']);
  assert.deepEqual(
    HISTORIQUE.slice(0, 8).map((h) => h.fin),
    ['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-05', '2026-10-05', '2026-10-05', '2026-10-06', '2026-10-06']
  );
  const complement = HISTORIQUE[4];
  assert.equal(complement.etape, '1');
  assert.match(complement.titre, /OneDrive/);
  assert.match(complement.titre, /clé USB/);
  assert.ok(HISTORIQUE.slice(0, 8).filter((h) => h.titre).length === 1, 'dans le lot 1, seul le complément a un titre');
  // Ensuite : la 6 (06/10/2026), puis une ligne par étape terminée. Une étape qui revient (complément, correction) porte un titre.
  assert.deepEqual([HISTORIQUE[8].etape, HISTORIQUE[8].fin], ['6', '2026-10-06']);
  for (const [i, h] of HISTORIQUE.entries()) {
    if (HISTORIQUE.findIndex((x) => x.etape === h.etape) !== i) assert.ok(h.titre, `ligne ${i} (étape ${h.etape}) : un complément ou une correction a son titre`);
  }
  assert.equal(NB_TERMINEES + NB_PARTIELLES, new Set(HISTORIQUE.map((h) => h.etape)).size);
  assert.ok(NB_TERMINEES >= 8, 'le lot 1 et la 6, au moins');
  // Les chiffres du journal d'avancement.
  const ligne = (etape) => HISTORIQUE.find((h) => h.etape === etape && !h.titre);
  assert.match(ligne('0').mesure, /40 affiches cotées, dont 22/);
  assert.match(ligne('2').mesure, /1 684 Mo, 60 200 rencontres/);
  assert.match(ligne('1').mesure, /339 Mo compressés \(20 %\)/);
  assert.match(ligne('1').mesure, /42 s/);
  assert.match(ligne('3').mesure, /73 tests/);
  assert.match(complement.mesure, /80 tests/);
  assert.match(ligne('E').mesure, /99 tests/);
  assert.match(ligne('E').mesure, /22 bugs volontaires sur 22/);
  assert.match(ligne('4').mesure, /115 tests/);
  assert.match(ligne('4').mesure, /25 bugs volontaires sur 25/);
  assert.match(ligne('4').change, /plafond de 150/);
  assert.match(ligne('6').change, /7 composants communs/);
  assert.match(ligne('6').change, /« vert = value jouable »/);
  assert.match(ligne('6').mesure, /177 tests \(175 réussis \+ 2 constats\) en ~21 s/);
  assert.match(ligne('6').mesure, /42 bugs volontaires sur 42/);
  assert.deepEqual(ligne('6').tests, { total: 177, reussis: 175, todo: 2, echecs: 0, duree: '~21 s' });
});

test('historique : chaque ligne est complète (date réelle, ce qui a changé, ce qui a été mesuré) et les tests ne reculent jamais', () => {
  let precedent = '';
  let totalPrecedent = 0;
  for (const h of HISTORIQUE) {
    const nom = `étape ${h.etape} du ${h.fin}`;
    assert.ok(etapeParId(h.etape), `${nom} : étape inconnue du plan`);
    assert.match(h.fin, /^\d{4}-\d{2}-\d{2}$/, nom);
    assert.equal(new Date(`${h.fin}T12:00:00Z`).toISOString().slice(0, 10), h.fin, `${nom} : un jour qui existe`);
    assert.ok(h.fin >= precedent, `${nom} : dans l'ordre où elles ont été faites`);
    precedent = h.fin;
    assert.ok(typeof h.change === 'string' && h.change.length >= 60, `${nom} : ce qui a changé`);
    assert.ok(typeof h.mesure === 'string' && h.mesure.length >= 20, `${nom} : ce qui a été mesuré (la ligne de l'étape 5 se remplit avec le résultat du dernier npm test)`);
    assert.doesNotMatch(h.mesure, /à mesurer|à remplir|à compléter/i, `${nom} : une mesure en attente n'est pas une mesure`);
    if (h.tests) {
      const { total, reussis, todo, echecs, duree } = h.tests;
      assert.ok([total, reussis, todo, echecs].every(Number.isInteger), `${nom} : tests en nombres entiers`);
      assert.equal(reussis + todo + echecs, total, `${nom} : réussis + constats + échecs = total`);
      assert.ok(total >= totalPrecedent, `${nom} : le nombre de tests ne recule pas (${total} < ${totalPrecedent})`);
      assert.equal(echecs, 0, `${nom} : aucune étape n'est terminée avec un test rouge`);
      assert.match(duree, /s$/, nom);
      totalPrecedent = total;
    }
  }
  assert.ok(HISTORIQUE.at(-1).tests, 'la dernière ligne dit où en sont les tests');
  // Rien n'est à la fois terminé et en cours ; rien d'inconnu en cours.
  const faites = new Set(HISTORIQUE.map((h) => h.etape));
  for (const id of ETAPES_EN_COURS) assert.ok(etapeParId(id) && !faites.has(id), `étape ${id} : à la fois en cours et terminée, ou inconnue`);
  for (const lot of Object.keys(BILANS_DE_LOT)) assert.ok(LOTS.some((l) => l.numero === Number(lot)), `bilan du lot ${lot} : lot inconnu`);
});

// -------------------------------------------------------------- 3. l'état

const PIERRE_VIDE = { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} };
// Le registre de la mesure : jamais celui de data/runtime (celui de Pierre, dans le dépôt) — un chemin d'essai qui n'existe pas, lu seulement.
const MESURE_ABSENTE = etatPourFeuilleDeRoute({ fichier: path.join(RACINE_ESSAIS, `cm-registre-absent-${process.pid}.json`) });
assert.equal(MESURE_ABSENTE.source, 'absent');
const MIDI = Date.parse('2026-10-06T10:00:00Z');
const toutesLesEtapes = (etat) => etat.lots.flatMap((l) => l.etapes);

test('état : 9 lots, 49 étapes ; terminées = celles de l’historique du code, avec leur date ; les autres à faire', () => {
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  assert.equal(e.lots.length, 9);
  assert.deepEqual(toutesLesEtapes(e).map((x) => x.id), ['0', '1', '2', '3', '4', '5', 'E', ...Array.from({ length: 42 }, (_, i) => String(i + 6))]);
  assert.deepEqual(e.avancement, avancementAttendu());
  const fins = Object.fromEntries(toutesLesEtapes(e).filter((x) => x.etat === 'terminee').map((x) => [x.id, x.fin]));
  assert.deepEqual(fins, FINS);
  // Le lot 1, écrit à la main : ses dates ne bougent plus.
  assert.deepEqual(Object.fromEntries(['0', '1', '2', '3', '4', '5', 'E'].map((id) => [id, fins[id]])), { 0: '2026-10-05', 1: '2026-10-05', 2: '2026-10-05', 3: '2026-10-05', 4: '2026-10-06', 5: '2026-10-06', E: '2026-10-05' });
  // La 1 a sa ligne et son complément ; chaque terminée a ses lignes ; les étapes à faire n'ont ni date ni historique.
  const parId = Object.fromEntries(toutesLesEtapes(e).map((x) => [x.id, x]));
  assert.equal(parId['1'].historique.length, 2);
  assert.match(parId['1'].historique[1].titre, /Complément/);
  for (const id of TERMINEES) assert.equal(parId[id].historique.length, HISTORIQUE.filter((h) => h.etape === id).length, `étape ${id}`);
  assert.deepEqual(['0', '2', '3', '4', '5', 'E'].map((id) => parId[id].historique.length), [1, 1, 1, 1, 1, 1]);
  for (const x of toutesLesEtapes(e).filter((y) => y.etat === 'a-faire')) {
    assert.equal(x.fin, null, `étape ${x.id}`);
    assert.deepEqual(x.historique, []);
    assert.equal(x.note, null);
  }
  assert.deepEqual(toutesLesEtapes(e).filter((x) => x.etat === 'a-faire').map((x) => x.id), LIBRES);
  // Chaque lot : ses étapes terminées comptées dans l'historique ; terminé quand TOUTES le sont. Le lot 1 l'est.
  assert.deepEqual(
    e.lots.map((l) => [l.numero, l.total, l.terminees, l.termine]),
    LOTS.map((l) => {
      const ids = ETAPES.filter((x) => x.lot === l.numero).map((x) => x.id);
      const faites = ids.filter((id) => TERMINEES.has(id)).length;
      return [l.numero, ids.length, faites, faites === ids.length];
    })
  );
  assert.deepEqual([e.lots[0].total, e.lots[0].terminees, e.lots[0].termine], [7, 7, true]);
  assert.deepEqual(e.lots.map((l) => l.total), [7, 6, 4, 9, 7, 9, 5, 1, 1]);
  assert.deepEqual(e.lots.map((l) => [l.semaines.debut, l.semaines.fin]), [[1, 1], [2, 2], [3, 3], [3, 6], [4, 7], [7, 9], [2, 8], [10, 10], [10, 12]]);
  assert.deepEqual(ETATS, ['a-faire', 'en-cours', 'terminee', 'mise-de-cote']);
  // La page dit d'où viennent ses données : le code (plan, historique) et le fichier des notes.
  assert.match(e.provenance.plan, /roadmap[\\/]plan\.js$/);
  assert.match(e.provenance.historique, /roadmap[\\/]historique\.js$/);
  assert.equal(e.provenance.notes, PIERRE_VIDE.fichier, 'le fichier des notes réellement lu');
  assert.equal(e.notes.fichier, PIERRE_VIDE.fichier);
});

test('état : la ligne « Tests » vient de la dernière ligne de l’historique qui en a une', () => {
  const sans = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, historique: [], mesure: MESURE_ABSENTE });
  assert.equal(sans.tests, null);
  assert.deepEqual(sans.avancement, { total: 49, terminees: 0, enCours: 0, miseDeCote: 0, aFaire: 49, part: 0 });
  const derniere = HISTORIQUE.at(-1);
  const reel = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  assert.deepEqual(reel.tests, { ...derniere.tests, le: derniere.fin, etape: derniere.etape });
  assert.ok(reel.tests.total >= 115 && reel.tests.echecs === 0);
  // Une étape suivante ajoute sa ligne ; une ligne sans tests ne remplace pas la précédente.
  const [a, b] = LIBRES;
  const suivante = { etape: a, fin: '2026-12-30', heure: null, titre: null, change: 'Une étape de plus.', mesure: 'ok', tests: { total: derniere.tests.total + 20, reussis: derniere.tests.reussis + 20, todo: derniere.tests.todo, echecs: 0, duree: '~30 s' } };
  const sansTests = { etape: b, fin: '2026-12-31', heure: null, titre: null, change: 'Encore une.', mesure: 'ok', tests: null };
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, historique: [...HISTORIQUE, suivante, sansTests], mesure: MESURE_ABSENTE });
  assert.deepEqual(e.tests, { ...suivante.tests, le: '2026-12-30', etape: a });
  const parId = Object.fromEntries(toutesLesEtapes(e).map((x) => [x.id, x]));
  assert.equal(parId[a].etat, 'terminee');
  assert.equal(parId[b].fin, '2026-12-31');
  assert.deepEqual(e.avancement, avancementAttendu({ enPlus: 2 }));
  const lot = e.lots.find((l) => l.etapes.some((x) => x.id === a));
  const idsDuLot = ETAPES.filter((x) => x.lot === lot.numero).map((x) => x.id);
  assert.equal(lot.terminees, idsDuLot.filter((id) => TERMINEES.has(id) || id === a || id === b).length);
  assert.equal(lot.termine, idsDuLot.every((id) => TERMINEES.has(id) || id === a || id === b), 'un lot n’est terminé que quand TOUTES ses étapes le sont');
  assert.equal(e.lots[0].termine, true);
});

test('étape 27 — une ligne PARTIELLE ne finit pas l’étape : la 27 est « en cours » (« en essai à blanc, adoption à venir »), sans date de fin, son histoire racontée ; mise de côté prime ; une ligne qui la finit la rend « terminée »', () => {
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  const e27 = toutesLesEtapes(e).find((x) => x.id === '27');
  assert.deepEqual([e27.etat, e27.reste, e27.fin, e27.heureFin], ['en-cours', 'en essai à blanc, adoption à venir', null, null], 'pas de date de fin : l’étape n’est pas finie');
  assert.equal(e27.historique.length, 1);
  assert.equal(e27.historique[0].partielle, 'en essai à blanc, adoption à venir');
  assert.match(e27.historique[0].change, /l’étape n’est pas finie/);
  assert.ok(e27.historique[0].mesure.length > 100, 'ce qui a été mesuré reste dit');
  // La page compte la 27 « en cours », pas « terminée » (le 21/10/2026 : 29 terminées, 1 en cours ; depuis le 27/10/2026,
  // la 28 aussi, livrée à blanc : 2 en cours ; depuis le 28/10/2026, la 26 aussi, son lot 1 livré : 3 en cours).
  assert.deepEqual([...PARTIELLES], ['27', '28', '26']);
  assert.equal(e.avancement.terminees, NB_TERMINEES);
  assert.equal(e.avancement.enCours, 3);
  assert.ok(!TERMINEES.has('27'));
  assert.equal(toutesLesEtapes(e).filter((x) => x.etat === 'terminee').length, NB_TERMINEES);
  const lot5 = e.lots.find((l) => l.numero === 5);
  assert.equal(lot5.enCours, 3);
  assert.equal(lot5.termine, false);
  // Les autres étapes n'ont rien qui reste dit.
  assert.deepEqual(toutesLesEtapes(e).filter((x) => x.reste).map((x) => x.id), ['26', '27', '28']);
  // Chaque ligne partielle dit ce qui reste (une chaîne, au moins quelques mots) ; les autres valent null.
  for (const h of HISTORIQUE) {
    assert.ok(h.partielle === null || (typeof h.partielle === 'string' && h.partielle.trim().length >= 10), `étape ${h.etape} du ${h.fin} : « partielle » dit ce qui reste, ou vaut null`);
  }
  // Mise de côté par Pierre : son choix prime sur une étape en cours par l'historique.
  const pierre = { ...PIERRE_VIDE, source: 'enregistre', etapes: { 27: { note: null, noteLe: null, miseDeCote: { le: '2026-10-21T08:00:00.000Z', raison: 'plus tard' } } } };
  const cote = toutesLesEtapes(etatFeuilleDeRoute({ maintenant: MIDI, pierre, mesure: MESURE_ABSENTE })).find((x) => x.id === '27');
  assert.deepEqual([cote.etat, cote.reste], ['mise-de-cote', null]);
  // L'adoption, plus tard : une ligne qui FINIT l'étape (pas partielle) la rend « terminée », avec sa date ; plus rien ne reste.
  const adoption = { etape: '27', fin: '2026-11-15', heure: '~9 h', titre: 'Adoption', change: 'La candidate adoptée d’un clic : le modèle de buts unique en service.', mesure: 'ok', partielle: null, tests: null };
  const fini = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, historique: [...HISTORIQUE, adoption], mesure: MESURE_ABSENTE });
  const f27 = toutesLesEtapes(fini).find((x) => x.id === '27');
  assert.deepEqual([f27.etat, f27.fin, f27.heureFin, f27.reste, f27.historique.length], ['terminee', '2026-11-15', '~9 h', null, 2]);
  assert.deepEqual([fini.avancement.terminees, fini.avancement.enCours], [NB_TERMINEES + 1, 2], 'la 26 et la 28 restent en cours');
  // Une étape dans ETAPES_EN_COURS sans ligne reste « en cours », sans rien qui reste dit.
  const libre = LIBRES[0];
  const enCours = toutesLesEtapes(etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, enCours: [libre], mesure: MESURE_ABSENTE })).find((x) => x.id === libre);
  assert.deepEqual([enCours.etat, enCours.reste, enCours.historique], ['en-cours', null, []]);
});

test('étape 28 — livrée à blanc : « en cours » (« livrée à blanc, preuve sur vos matchs en cours »), sans date de fin ; son histoire dit en mots simples que tout est éteint, la porte 1 passée, les deux marchés écartés et le refus des deux fichiers du moteur demandés par le cahier ; le verdict de la preuve la finira', () => {
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  const e28 = toutesLesEtapes(e).find((x) => x.id === '28');
  assert.deepEqual([e28.etat, e28.reste, e28.fin, e28.heureFin], ['en-cours', 'livrée à blanc, preuve sur vos matchs en cours', null, null], 'pas de date de fin : l’étape n’est pas finie');
  assert.equal(e28.historique.length, 1);
  const [h] = e28.historique;
  assert.equal(h.fin, '2026-10-27');
  assert.match(h.change, /l’étape n’est pas finie/);
  // Tout éteint à la livraison, et ce qui se montrera quand Pierre l'allumera.
  assert.match(h.change, /TOUT EST ÉTEINT : les classements, les cartes de rencontre et la page du match sont exactement ceux d’avant/);
  assert.match(h.change, /« Fins de saison et enjeu » ; « Combinés et déroulé »/);
  // La porte 1 passée ; les deux marchés écartés, nommés, jamais montrés en v1.
  assert.match(h.change, /La porte 1 \(2019-2023, jamais vue\) est passée : les combinés sont mieux prévus par la grille que par le produit des simples\./);
  assert.match(h.change, /Deux marchés sont écartés et ne seront jamais montrés en v1 : « un but dans chaque mi-temps » et « au moins un rouge »/);
  // Le refus des deux fichiers demandés par le cahier, et pourquoi, en mots simples.
  assert.match(h.change, /core\/engine\/matchSimulation\.js et core\/engine\/seasonSimulation\.js\) : refusé, parce qu’un fichier de plus dans le moteur crée une nouvelle version du moteur et recommence l’essai de l’étape 27/);
  assert.doesNotMatch(h.change, /Monte|Carlo|Poisson|Dixon|copule|K = 27|F3a|F2c|P2\b/, 'pas de jargon dans ce qui a changé');
  // Les chiffres de la porte 1 : ceux de la note, recopiés par script (noteDeLaSimulation.js), arrondis comme à l'écran.
  assert.match(h.mesure, /30 149 matchs jamais vus \(football-data, juillet 2019 à juin 2023\)/);
  assert.match(h.mesure, /15,5 millièmes d’erreur de prévision en moins que le produit des simples \[14,5 ; 16,4\], 27 variantes comptées/);
  assert.match(h.mesure, /« un but dans chaque mi-temps » \(annoncé 53,7 %, arrivé 54,7 %/);
  assert.match(h.mesure, /« au moins un rouge » \(annoncé 21,7 %, arrivé 18,0 %\)/);
  assert.match(h.mesure, /Empreinte du moteur inchangée \(16f2459…\)/);
  // Le verdict de la preuve, plus tard : une ligne qui FINIT l'étape la rend « terminée ».
  const verdict = { etape: '28', fin: '2026-11-17', heure: '~6 h', titre: 'Verdict de la preuve', change: 'La preuve sur les matchs de Pierre a dit « retenu » : les combinés se montrent.', mesure: 'ok', partielle: null, tests: null };
  const fini = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, historique: [...HISTORIQUE, verdict], mesure: MESURE_ABSENTE });
  const f28 = toutesLesEtapes(fini).find((x) => x.id === '28');
  assert.deepEqual([f28.etat, f28.fin, f28.reste, f28.historique.length], ['terminee', '2026-11-17', null, 2]);
  assert.deepEqual([fini.avancement.terminees, fini.avancement.enCours], [NB_TERMINEES + 1, 2], 'la 26 et la 27 restent en cours');
});

test('étape 26 — lot 1 livré : « en cours » (« lot 1 livré : … ; lot 2 au verdict de l’étape 27 : … »), sans date de fin ; son histoire dit en mots simples le tri du mois, rien qui parte seul, rien pendant l’essai de la 27, le résumé du mois dans le plafond, les écrans et le moteur inchangé ; le lot 2 la finira', () => {
  const RESTE_26 = 'lot 1 livré : tri du mois, propositions, banc au clic, journal, résumé du mois, écrans ; lot 2 au verdict de l’étape 27 : la fiche complète du pronostic et le relais de la place d’essai';
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  const e26 = toutesLesEtapes(e).find((x) => x.id === '26');
  assert.deepEqual([e26.etat, e26.reste, e26.fin, e26.heureFin], ['en-cours', RESTE_26, null, null], 'pas de date de fin : le lot 2 reste à faire');
  assert.equal(e26.historique.length, 1);
  const [h] = e26.historique;
  assert.equal(h.fin, '2026-10-28');
  // Ce qui a changé, en mots simples : le tri et sa règle, rien qui parte seul, rien pendant l'essai de la 27, le résumé
  // du mois dans le plafond, les écrans, le lot 2, le moteur inchangé.
  for (const morceau of [
    'l’étape n’est pas finie',
    'en « malchance » ou « vrai défaut »',
    'au moins deux mois de suite d’au moins 200 matchs, un écart d’au moins 2 points, dans le même sens les deux derniers mois',
    'Rien ne part seul : « Mesurer au banc — environ 10 min » se lance au clic de Pierre',
    'n’est adoptée que d’un clic de Pierre',
    '« Revenir à la version précédente » tant qu’elle est la dernière version',
    'Pendant l’essai de l’étape 27, la boucle trie et montre, mais ne propose rien, et le formulaire est fermé avec sa raison écrite',
    'compté dans le plafond des 150 ; aucun appel quand il n’y a rien à dire',
    '« Corrections à accepter ou refuser »',
    '« Écarts du mois : malchance ou vrai défaut »',
    'Le lot 2 viendra après le verdict de l’étape 27 : la fiche complète de chaque pronostic et le relais de la place d’essai',
    'Aucun chiffre ni aucun fichier du moteur ne change.'
  ]) assert.ok(h.change.includes(morceau), `ce qui a changé dit : « ${morceau} »`);
  // Pas de jargon (les mots que le constat 14 retire de l'écran), ni dans ce qui a changé, ni dans ce qui a été mesuré,
  // ni dans ce qui reste : les mots sont coupés sur tout ce qui n'est pas une lettre ou un chiffre.
  for (const texte of [h.change, h.mesure, e26.reste]) {
    const mots = new Set(texte.split(/[^A-Za-zÀ-ÖØ-öø-ÿŒœ0-9]+/));
    assert.deepEqual(['K', 'z', 'lignée', 'lignées', 'variante', 'variantes', 'levier', 'leviers', 'regards'].filter((m) => mots.has(m)), [], 'pas de jargon');
  }
  // Ce qui a été mesuré : le tri dans le bac, les années simulées, octobre au 01/11, les empreintes.
  for (const morceau of [
    'le tri d’octobre lit 51 714 relevés de pronostics gelés un match à la fois (806 matchs réglés) en 1,35 s',
    'environ 3 % des années ont un faux « vrai défaut »',
    'Octobre, premier mois trié le 01/11, ne compte qu’à partir du 22/10',
    'Empreinte du moteur inchangée (16f2459…), celle de la candidate de l’étape 27 aussi (f01dd849…)'
  ]) assert.ok(h.mesure.includes(morceau), `ce qui a été mesuré dit : « ${morceau} »`);
  // Le lot 2, plus tard : une ligne qui FINIT l'étape la rend « terminée », avec sa date ; la 27 et la 28 restent en cours.
  const lot2 = { etape: '26', fin: '2026-11-17', heure: '~9 h', titre: 'Lot 2', change: 'La fiche complète du pronostic et le relais de la place d’essai.', mesure: 'ok', partielle: null, tests: null };
  const fini = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, historique: [...HISTORIQUE, lot2], mesure: MESURE_ABSENTE });
  const f26 = toutesLesEtapes(fini).find((x) => x.id === '26');
  assert.deepEqual([f26.etat, f26.fin, f26.reste, f26.historique.length], ['terminee', '2026-11-17', null, 2]);
  assert.deepEqual([fini.avancement.terminees, fini.avancement.enCours], [NB_TERMINEES + 1, 2], 'la 27 et la 28 restent en cours');
});

test('étape 26 — vérification finale, constat 9 : le résumé du mois dit ses trois essais au plus (un seul appel réussi par mois) ; le temps du tri chez Pierre est une attente (« quelques secondes »), plus une extrapolation chiffrée', () => {
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  const [h] = toutesLesEtapes(e).find((x) => x.id === '26').historique;
  assert.ok(h.change.includes('un résumé écrit par l’IA (un seul appel réussi par mois, trois essais au plus, compté dans le plafond des 150 ; aucun appel quand il n’y a rien à dire)'), 'ce qui a changé : les trois essais');
  assert.doesNotMatch(h.change, /un seul appel, compté/, 'jamais « un seul appel » sans ses essais');
  assert.ok(h.mesure.includes('chez Pierre, quelques secondes attendues (le temps réel sera rangé dans le bilan de l’étape)'), 'ce qui a été mesuré : une attente');
  assert.doesNotMatch(h.mesure, /2,5 s et 40 Mo/, 'plus l’extrapolation');
});

test('état : terminée prime sur mise de côté, qui prime sur en cours, qui prime sur à faire ; une note n’y change rien', () => {
  // Des étapes encore libres pour la mise de côté et les « en cours » ; la 5 et la 0, terminées pour toujours.
  const [x, y, z, w] = LIBRES;
  const pierre = {
    ...PIERRE_VIDE,
    source: 'enregistre',
    etapes: {
      [x]: { note: null, noteLe: null, miseDeCote: { le: '2026-10-06T08:00:00.000Z', raison: null } },
      [y]: { note: 'Je la regarde demain.', noteLe: '2026-10-06T08:00:00.000Z', miseDeCote: null },
      0: { note: null, noteLe: null, miseDeCote: { le: null, raison: 'test' } }
    }
  };
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre, enCours: [x, y, '5', z], mesure: MESURE_ABSENTE });
  const etat = Object.fromEntries(toutesLesEtapes(e).map((s) => [s.id, s.etat]));
  assert.equal(etat[x], 'mise-de-cote', 'mise de côté prime sur en cours');
  assert.equal(etat[y], 'en-cours', 'une note ne change pas l’état');
  assert.equal(etat[z], 'en-cours');
  assert.equal(etat['5'], 'terminee', 'terminée prime sur en cours');
  assert.equal(etat['0'], 'terminee', 'terminée prime sur mise de côté');
  assert.equal(etat[w], 'a-faire');
  assert.deepEqual(e.avancement, avancementAttendu({ enCours: 2, miseDeCote: 1 }));
  assert.equal(toutesLesEtapes(e).find((s) => s.id === y).note.texte, 'Je la regarde demain.');
  // Le lot de la mise de côté : ses comptes, état par état.
  const lot = e.lots.find((l) => l.etapes.some((s) => s.id === x));
  const ids = ETAPES.filter((s) => s.lot === lot.numero).map((s) => s.id);
  const faites = ids.filter((id) => TERMINEES.has(id)).length;
  const enCours = [y, z].filter((id) => ids.includes(id)).length + ids.filter((id) => PARTIELLES.has(id)).length;
  assert.deepEqual(lot, { ...lot, total: ids.length, terminees: faites, enCours, miseDeCote: 1, aFaire: ids.length - faites - enCours - 1, termine: false });
  // Une étape inconnue dans « en cours » est ignorée, une note sur une étape inconnue est signalée, jamais perdue.
  const orphelines = etatFeuilleDeRoute({ maintenant: MIDI, enCours: ['99'], pierre: { ...pierre, etapes: { ...pierre.etapes, 99: { note: 'Orpheline', noteLe: null, miseDeCote: null } } }, mesure: MESURE_ABSENTE });
  assert.equal(orphelines.avancement.enCours, NB_PARTIELLES, 'seules les étapes racontées en partie par l’historique');
  assert.deepEqual(orphelines.notesOrphelines, [{ id: '99', note: 'Orpheline', noteLe: null, miseDeCote: null }]);
  assert.equal(toutesLesEtapes(orphelines).length, 49);
});

test('état : la semaine du plan suit le jour de PARIS (minuit, changement d’heure) ; hors plan, la page le dit', () => {
  const semaine = (iso) => etatFeuilleDeRoute({ maintenant: Date.parse(iso), pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE }).plan.semaineCourante;
  // Octobre : Paris est en UTC+2. 22 h 30 UTC le dimanche 04/10 = 00 h 30 le lundi 05/10 à Paris : déjà la semaine 1.
  assert.deepEqual(semaine('2026-10-04T21:00:00Z'), { numero: 0, jour: '2026-10-04', du: null, au: null, horsPlan: true });
  assert.deepEqual(semaine('2026-10-04T22:30:00Z'), { numero: 1, jour: '2026-10-05', du: '2026-10-05', au: '2026-10-11', horsPlan: false });
  assert.equal(semaine('2026-10-11T21:30:00Z').numero, 1, 'dimanche 23 h 30 à Paris');
  assert.equal(semaine('2026-10-11T22:10:00Z').numero, 2, 'lundi 00 h 10 à Paris');
  assert.equal(semaine('2026-10-06T10:00:00Z').numero, 1);
  // Décembre : Paris est en UTC+1.
  assert.equal(semaine('2026-12-27T22:30:00Z').numero, 12, 'dimanche 23 h 30 à Paris');
  assert.deepEqual(semaine('2026-12-27T23:30:00Z'), { numero: 13, jour: '2026-12-28', du: null, au: null, horsPlan: true });
  assert.equal(etatFeuilleDeRoute({ maintenant: Date.parse('2026-10-06T10:00:00Z'), pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE }).plan.debut, '2026-10-05');
});

test('état : à la fin d’un lot, la place de son bilan (garder, sauter, réordonner) — vide tant qu’il n’est pas fait', () => {
  const e = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure: MESURE_ABSENTE });
  assert.ok(e.lots.every((l) => l.bilan === null));
  const bilan = { fait: '2026-10-12', garder: ['5'], sauter: [], reordonner: [], texte: 'On garde tout.' };
  const avec = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, bilans: { 1: bilan }, mesure: MESURE_ABSENTE });
  assert.deepEqual(avec.lots[0].bilan, bilan);
  assert.ok(avec.lots.slice(1).every((l) => l.bilan === null));
});

// ---------------------------------------- 4. les notes (copies isolées)

const script = path.join(SERVEUR, 'test', 'aides', 'script-feuille-de-route.mjs');

/** Une phase du script dans la copie ; l'échec est lisible. */
function lancer(copie, phase) {
  const r = executer(copie, script, { args: [phase], timeout: 180_000 });
  assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
  assert.ok(r.json, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
  assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
  return r.json;
}

/** Prépare une copie SANS base (la page n'en ouvre jamais), lance, nettoie. */
function dansUneCopie(runtime, travail) {
  const copie = preparerCopie({ runtime, base: false });
  try {
    return travail(copie);
  } finally {
    copie.nettoyer();
  }
}

const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};

const ecritureEtRedemarrage = uneFois(() =>
  dansUneCopie({}, (copie) => {
    const ecrire = lancer(copie, 'ecrire');
    const relire = lancer(copie, 'relire'); // un AUTRE processus sur la même copie : le redémarrage
    return { ecrire, relire, fichierFinal: JSON.parse(fs.readFileSync(path.join(copie.donnees, 'roadmap.json'), 'utf8')) };
  })
);

test('notes : une note de Pierre s’enregistre dans data/runtime/roadmap.json de la copie, et survit à un redémarrage simulé', () => {
  const { ecrire, relire, fichierFinal } = ecritureEtRedemarrage();
  assert.equal(ecrire.dansLaCopie, true, 'le fichier des notes est dans data/runtime de la copie, jamais ailleurs');
  assert.match(ecrire.fichier, /data[\\/]runtime[\\/]roadmap\.json$/);

  // Au départ : aucun fichier, 9 lots, 49 étapes, les terminées de l'historique, aucune note.
  assert.equal(ecrire.initial.fichierExiste, false);
  assert.deepEqual([ecrire.initial.code, ecrire.initial.lots, ecrire.initial.etapes, ecrire.initial.notes.source, ecrire.initial.notes.nombre], [200, 9, 49, 'absent', 0]);
  assert.deepEqual(ecrire.initial.avancement, avancementAttendu());

  // Écrite : le fichier, la réponse, l'accent et les sauts de ligne.
  const A = ecrire.textes.A;
  assert.match(A, /Deuxième ligne : é, ç, œ, € — et des « guillemets »\./);
  assert.equal(ecrire.p1.code, 200);
  assert.deepEqual(ecrire.p1.enregistrement, { id: '12', change: true, fichier: ecrire.fichier });
  assert.deepEqual(ecrire.p1.fichier, { version: 1, majLe: '2026-10-05T12:00:00.000Z', etapes: { 12: { note: A, noteLe: '2026-10-05T12:00:00.000Z' } } });
  assert.equal(ecrire.p1.notesParEtape['12'].texte, A);
  assert.equal(ecrire.p1.notes.source, 'enregistre');
  assert.equal(ecrire.p1.notes.nombre, 1);

  // Redémarrage : un autre processus relit la même note, mot pour mot.
  assert.equal(relire.relu.notes.source, 'enregistre');
  assert.equal(relire.relu.notes.nombre, 2);
  assert.equal(relire.note12.texte, ecrire.textes.finale);
  assert.equal(relire.note12.le, '2026-10-05T12:00:00.000Z');
  assert.equal(relire.noteE.texte, ecrire.textes.E);
  assert.deepEqual(fichierFinal.etapes['12'].note, ecrire.textes.finale);
  assert.equal(relire.relu.notesParEtape['12'].texte, ecrire.textes.finale);
});

test('notes : PUT idempotent — le même texte (même avec des espaces et des fins de ligne Windows) ne réécrit rien ; avant comme après un redémarrage', () => {
  const { ecrire, relire } = ecritureEtRedemarrage();
  assert.deepEqual(ecrire.rejoue, { p2: { code: 200, change: false }, p3: { code: 200, change: false }, inchange: true });
  assert.deepEqual(relire.rejoue, { code: 200, change: false, inchange: true });
  // Effacer deux fois : la seconde ne réécrit rien non plus.
  assert.equal(ecrire.efface.encore.change, false);
  assert.equal(ecrire.efface.inchange, true);
});

test('notes : écrire, modifier, effacer — champ par champ, sans toucher aux notes des autres étapes', () => {
  const { ecrire, relire } = ecritureEtRedemarrage();
  // Une note sur « e » (minuscule) est celle de l'étape E ; celle de la 12 est intacte, date comprise.
  assert.equal(ecrire.etapeE.enregistrement.id, 'E');
  assert.equal(ecrire.etapeE.enregistrement.change, true);
  assert.deepEqual(Object.keys(ecrire.etapeE.fichier.etapes).sort(), ['12', 'E']);
  assert.equal(ecrire.etapeE.noteDe12Gardee, true);
  assert.equal(ecrire.etapeE.dateDe12Gardee, true);
  assert.equal(ecrire.etapeE.notes.nombre, 2);
  // Modifier la note de la 12 : son texte et sa date changent (instant donné), celle de E non.
  assert.equal(ecrire.modifie.change, true);
  assert.equal(ecrire.modifie.noteLe, '2026-10-06T08:30:00.000Z');
  assert.equal(ecrire.modifie.fichier.etapes['12'].note, ecrire.textes.B);
  assert.equal(ecrire.modifie.fichier.etapes['12'].noteLe, '2026-10-06T08:30:00.000Z');
  assert.equal(ecrire.modifie.dateDeELaMeme, true);
  assert.equal(ecrire.modifie.majLe, '2026-10-06T08:30:00.000Z');
  // Effacer (texte vide) retire la note de la 12 et l'étape redevient sans note ; celle de E reste.
  assert.deepEqual(Object.keys(ecrire.efface.fichier.etapes), ['E']);
  assert.equal(ecrire.efface.fichier.etapes.E.note, ecrire.textes.E);
  assert.equal(ecrire.efface.notesParEtape['12'], undefined);
  assert.equal(ecrire.efface.notes.nombre, 1);
  // Après le redémarrage, écrire sur la 13 garde les deux autres.
  assert.deepEqual(Object.keys(relire.autre.fichier.etapes).sort(), ['12', '13', 'E']);
  assert.equal(relire.autre.fichier.etapes['12'].note, ecrire.textes.finale);
});

test('notes : une étape inconnue est refusée (404), une demande invalide aussi (400), et rien n’est écrit', () => {
  const s = dansUneCopie({}, (copie) => lancer(copie, 'refus'));
  for (const [id, r] of Object.entries(s.inconnus)) {
    assert.equal(r.code, 404, `« ${id} » doit être refusée`);
    assert.match(r.erreur, /Étape inconnue/, id);
  }
  assert.ok(Object.keys(s.inconnus).length >= 14);
  assert.equal(s.rienEcritInconnus, true, 'aucun fichier créé par un refus');
  for (const cle of ['sansCorps', 'corpsVide', 'nombre', 'nul', 'objet', 'liste', 'booleen']) {
    assert.equal(s.invalides[cle].code, 400, cle);
    assert.match(s.invalides[cle].erreur, /« note » doit être un texte/, cle);
  }
  assert.equal(s.invalides.trop.code, 400);
  assert.match(s.invalides.trop.erreur, /trop longue \(4001 caractères, 4000 au plus\)/);
  // Le texte exact au maximum passe (ses espaces de bord ne comptent pas) : le seul fichier écrit.
  assert.equal(s.longueurMax, 4000);
  assert.deepEqual([s.invalides.juste.code, s.invalides.juste.change], [200, true]);
  assert.deepEqual(s.fichierApresJuste, { cles: ['12'], longueur: 4000 });
});

test('notes : un fichier illisible ou de forme inattendue n’est jamais pris pour « pas de note » ni écrasé — la page le dit, garde le plan, et le relit sans cache une fois réparé', () => {
  const s = dansUneCopie({ 'roadmap.json': '{"version": 1, "etapes": {"12": {"note": "Une note qui ne s’est pas finie d’écrire' }, (copie) => lancer(copie, 'illisible'));
  // Fichier tronqué : la page garde ses 49 étapes et ses terminées, signale le fichier, refuse d'écrire (503) et ne touche à rien.
  assert.equal(s.tronque.get.code, 200);
  assert.equal(s.tronque.get.notes.source, 'illisible');
  assert.match(s.tronque.get.notes.probleme, /roadmap\.json illisible/);
  assert.equal(s.tronque.etapes49, 49);
  assert.equal(s.tronque.terminees, NB_TERMINEES);
  assert.equal(s.tronque.put.code, 503);
  assert.match(s.tronque.put.erreur, /Rien n’est écrit, pour ne pas perdre vos notes/);
  assert.match(s.tronque.put.erreur, /renommez-le/);
  assert.equal(s.tronque.inchange, true, 'octets et date du fichier identiques');
  assert.equal(s.tronque.contenu, true);
  // Formes inattendues : mêmes règles.
  assert.deepEqual(Object.keys(s.formes), ['tableau', 'etapesTableau', 'entreeTexte', 'noteNombre', 'miseDeCoteTexte']);
  for (const [nom, f] of Object.entries(s.formes)) {
    assert.equal(f.source, 'illisible', nom);
    assert.match(f.probleme, /forme inattendue/, nom);
    assert.equal(f.put, 503, nom);
    assert.equal(f.inchange, true, nom);
  }
  // Réparé : relu tout de suite (aucune lecture ratée gardée), et l'écriture reprend en gardant ce qui y était.
  assert.deepEqual(s.repare, { source: 'enregistre', note12: { texte: 'Une note réparée', le: '2026-10-06T08:00:00.000Z' }, nombre: 1 });
  assert.equal(s.apresReparation.code, 200);
  assert.deepEqual(Object.keys(s.apresReparation.fichier.etapes).sort(), ['12', '13']);
  assert.equal(s.apresReparation.fichier.etapes['12'].note, 'Une note réparée');
});

test('notes : un fichier plus riche (mise de côté, champs inconnus, note sur une étape que le plan ne connaît pas) est lu, jamais perdu en écrivant une note', () => {
  const seme = {
    version: 1,
    majLe: '2026-10-01T00:00:00.000Z',
    extra: { garde: true },
    etapes: {
      0: { miseDeCote: { le: '2026-10-02T08:00:00.000Z', raison: 'test' } },
      12: { miseDeCote: { le: '2026-10-03T08:00:00.000Z', raison: 'plus tard' }, autre: 42 },
      13: { note: 'Note de la 13', noteLe: '2026-10-04T08:00:00.000Z' },
      15: { miseDeCote: true },
      99: { note: 'Une note orpheline', noteLe: '2026-10-04T09:00:00.000Z' }
    }
  };
  const s = dansUneCopie({ 'roadmap.json': seme }, (copie) => lancer(copie, 'fusion'));
  // Lu : la 12 est mise de côté (avec sa date et sa raison), la 15 aussi (simple « true »), la 0 reste terminée (l'historique prime), la note orpheline est signalée, la 13 garde sa note.
  // (Une fois la 12 ou la 15 terminée, « terminée » primera : l'attendu le suit.)
  const misesDeCote = ['12', '15'].filter((id) => !TERMINEES.has(id));
  assert.equal(s.avant.etats['12'], TERMINEES.has('12') ? 'terminee' : 'mise-de-cote');
  assert.equal(s.avant.etats['15'], TERMINEES.has('15') ? 'terminee' : 'mise-de-cote', 'miseDeCote: true suffit');
  assert.equal(s.avant.etat0, 'terminee');
  assert.equal(s.avant.mise0.raison, 'test');
  assert.deepEqual(s.avant.avancement, avancementAttendu({ miseDeCote: misesDeCote.length }));
  assert.deepEqual(s.avant.orphelines.map((o) => [o.id, o.note]), [['99', 'Une note orpheline']]);
  assert.equal(s.avant.notesParEtape['13'].texte, 'Note de la 13');
  assert.equal(s.avant.notesParEtape['99'], undefined, 'une note orpheline n’est pas rattachée à une autre étape');
  // Écrire la note de la 12 : tout le reste du fichier est gardé tel quel.
  assert.deepEqual([s.put.code, s.put.change], [200, true]);
  assert.deepEqual(s.apres.fichier.extra, { garde: true });
  assert.deepEqual(s.apres.fichier.etapes['0'], seme.etapes['0']);
  assert.deepEqual(s.apres.fichier.etapes['13'], seme.etapes['13']);
  assert.deepEqual(s.apres.fichier.etapes['15'], { miseDeCote: true });
  assert.deepEqual(s.apres.fichier.etapes['99'], seme.etapes['99']);
  assert.deepEqual(s.apres.fichier.etapes['12'].miseDeCote, seme.etapes['12'].miseDeCote);
  assert.equal(s.apres.fichier.etapes['12'].autre, 42);
  assert.equal(s.apres.fichier.etapes['12'].note, 'Ma note sur la 12');
  assert.equal(s.apres.etat12, TERMINEES.has('12') ? 'terminee' : 'mise-de-cote');
  assert.equal(s.apres.note12.texte, 'Ma note sur la 12');
  assert.deepEqual(s.apres.orphelines.map((o) => o.id), ['99']);
  // Effacer la note de la 12 garde sa mise de côté ; effacer celle de la 13 (tout ce que l'entrée avait) retire l'entrée.
  assert.equal(s.efface.fichier.etapes['12'].note, undefined);
  assert.deepEqual(s.efface.fichier.etapes['12'].miseDeCote, seme.etapes['12'].miseDeCote);
  assert.equal(s.efface.mise12.raison, 'plus tard');
  assert.deepEqual(s.efface13.cles.sort(), ['0', '12', '15', '99']);
});

test('notes : écrire une note ne change pas l’empreinte des données (pas de « nouvelles données » annoncées partout)', () => {
  const { ecrire } = ecritureEtRedemarrage();
  assert.equal(ecrire.empreinte.avant, ecrire.empreinte.apres);
  // Et le fichier des notes est bien l'un des fichiers de réglages, exclus de l'empreinte.
  const source = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'repositories', 'dataVersionRepository.js'), 'utf8');
  assert.match(source, /SETTINGS_FILES = new Set\([^)]*'roadmap\.json'/);
});

// ------------------------------------------- 5. les routes dans l'application

test('routes : GET /api/roadmap et PUT /api/roadmap/etapes/:id/note sont branchées dans l’application (appelées comme le ferait Express, sans réseau)', () => {
  // Le routeur : une lecture, une écriture — aucune route n'écrit le plan ni l'historique.
  assert.deepEqual(
    roadmapRoutes.stack.map((couche) => [Object.keys(couche.route.methods).join(','), couche.route.path]),
    [['get', '/'], ['put', '/etapes/:id/note']]
  );
  const s = dansUneCopie({}, (copie) => {
    // L'application complète charge aussi les scripts du serveur (fusion des statistiques…) : la copie d'essai n'a que src.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    return lancer(copie, 'routes');
  });
  assert.deepEqual(s.get, { code: 200, lots: 9, etapes: 49, terminees: NB_TERMINEES, tests: s.get.tests });
  assert.ok(s.get.tests.total >= 115 && s.get.tests.echecs === 0);
  assert.equal(s.fichierApresGet, false, 'GET n’écrit rien');
  assert.deepEqual(s.put, { code: 200, change: true, note12: 'Note par Express' });
  assert.deepEqual(s.rejoue, { code: 200, change: false });
  assert.equal(s.inconnue.code, 404);
  assert.match(s.inconnue.erreur, /Étape inconnue/);
  assert.equal(s.invalide.code, 400);
  assert.match(s.invalide.erreur, /doit être un texte/);
  assert.equal(s.aucune.code, 404);
  assert.match(s.aucune.erreur, /Route introuvable/);
  assert.equal(s.fichier.etapes['12'].note, 'Note par Express');
});

// -------------------------------------- 6. ni la base, ni le réseau, ni Claude

test('la feuille de route ne lit ni la base, ni le réseau, ni Claude : seulement le code et le fichier des notes', () => {
  const fichiers = [
    'src/data/roadmap/plan.js',
    'src/data/roadmap/historique.js',
    'src/data/roadmap/feuilleDeRoute.js',
    'src/data/repositories/roadmapRepository.js',
    'src/api/controllers/roadmap.controller.js',
    'src/api/routes/roadmap.routes.js',
    'src/bench/trialsRegistry.js',
    'src/bench/lancements.js',
    // Étape 19 : les règles du banc d'essai, sa note de départ et son appariement — écrits dans le code, sans base.
    'src/bench/periodes.js',
    'src/bench/noteDeDepart.js',
    'src/bench/apparier.js'
  ];
  for (const f of fichiers) {
    const source = fs.readFileSync(path.join(SERVEUR, f), 'utf8');
    const importes = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of importes) {
      assert.doesNotMatch(spec, /matchStatsDb|[\\/]db[\\/]|claude|anthropic|fotmob|provider|\bjobs?\b|node:(http|https|net|tls|dns|child_process)/i, `${f} importe ${spec}`);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(|\bopenDb\s*\(|callClaude|callAnthropic/, `${f} : un appel interdit`);
  }
});
