/**
 * Retouche du 12/10/2026 — le contrôle « classement officiel » face aux matchs
 * EN COURS (correction 2).
 *   node --test test/classementEnCours.test.mjs        (depuis server/)
 *
 * Dans la nuit du 11 au 12/10/2026, le contrôle quotidien a mis le feu au ROUGE
 * (22 constats « Flamengo : 30 matchs joués au classement officiel, 29 au
 * magasin — 1 rencontre manquante au moins ») et le carnet de santé a noté 22
 * « matchs manquants » : la table officielle, relevée en direct chez FotMob,
 * comptait les matchs EN COURS (Flamengo – Fluminense…), que le calendrier
 * disait encore « scheduled » et que le magasin n'avait pas encore.
 *
 *  1. Les règles pures (standingsCheck.js) : quels matchs du calendrier sont
 *     « en cours » (pas terminés, d'aujourd'hui ou d'hier), et quand l'écart de
 *     « joués » d'un club s'explique par eux.
 *  2. Le cas, FABRIQUÉ dans une copie isolée de la base d'essai (le Chili 2026,
 *     Deportes Concepción – Unión La Calera, un vrai cas de cette nuit-là), sur
 *     le contrôle partagé : une information quand le match est en cours ; rouge,
 *     comme avant, sans match du jour (et dans chaque variante qui n'excuse rien).
 *  3. Le même cas par les trois chemins de l'appli : le carnet de santé
 *     (scripts/data-health.mjs, complet puis les passes de nuit des jours
 *     suivants), le contrôle quotidien (il lit le calendrier) et
 *     scripts/verify-standings.mjs — dont la sortie, sans match en cours, est
 *     celle du code d'avant, mot pour mot (fixture produite par ce code-là).
 * Réseau coupé, heure figée au 05/10/2026 12 h UTC, jamais la vraie base.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { matchsEnCoursDuCalendrier, ecartExpliqueParDesMatchsEnCours } from '../src/data/db/standingsCheck.js';
import { SORTES, TYPES } from '../src/data/db/dataHealth.js';
import * as D from '../src/data/db/dailyChecks.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-classement-en-cours.mjs');
const CONCEPCION = 'fotmob-4134';
const CALERA = 'fotmob-192435';

// ===================================================================== 1. les règles

const entree = (date, { status = 'scheduled', homeGoals = null, league = 'Brazil Série A', home = 'Flamengo', away = 'Fluminense' } = {}) => ({ date, league, homeName: home, awayName: away, status, homeGoals, awayGoals: homeGoals });

test('les matchs « en cours » du calendrier : pas terminés, sans score, d’aujourd’hui ou d’hier (jours UTC) — jamais finis, reportés, annulés, ni d’avant-hier ou de demain ; le même match écrit deux fois ne compte qu’une fois', () => {
  // Le contrôle quotidien de la nuit : le 11/10/2026 à 23 h 17 UTC (1 h 17 à Paris, le 12).
  const r = matchsEnCoursDuCalendrier(
    [
      entree('2026-10-11'),
      entree('2026-10-11'), // écrit deux fois
      entree('2026-10-10', { home: 'Bahia', away: 'Mirassol' }), // d'hier
      entree('2026-10-11', { home: 'Palmeiras', away: 'Corinthians', status: 'finished', homeGoals: 4 }),
      entree('2026-10-11', { home: 'Atlético-MG', away: 'Botafogo', status: 'finished' }), // fini, même sans score
      entree('2026-10-11', { home: 'Vitória', away: 'Bahia', status: 'abandoned' }),
      entree('2026-10-11', { home: 'Grêmio', away: 'Internacional', homeGoals: 1 }), // un score sans « finished » : pas en cours au sens du calendrier
      entree('2026-10-11', { home: 'Santos', away: 'Vasco', status: 'postponed' }),
      entree('2026-10-11', { home: 'Ceará', away: 'Sport', status: 'cancelled' }),
      entree('2026-10-09', { home: 'Vitória', away: 'Juventude' }), // avant-hier
      entree('2026-10-12', { home: 'Bragantino', away: 'Cruzeiro' }), // demain (UTC)
      entree('2026-10-11', { league: 'Primera División - Chile', home: 'Deportes Concepción', away: 'Unión La Calera' }),
      { date: '2026-10-11', league: 'Brazil Série A', homeName: '', awayName: 'X', status: 'scheduled' },
      null
    ],
    { maintenant: Date.parse('2026-10-11T23:17:21Z') }
  );
  assert.deepEqual(r.jours, ['2026-10-10', '2026-10-11']);
  assert.deepEqual(
    [...r.parLigue.entries()].map(([l, m]) => [l, m.map((x) => `${x.date} ${x.homeName}-${x.awayName}`)]),
    [
      ['Brazil Série A', ['2026-10-11 Flamengo-Fluminense', '2026-10-10 Bahia-Mirassol']],
      ['Primera División - Chile', ['2026-10-11 Deportes Concepción-Unión La Calera']]
    ]
  );
  // Une date ISO ou un instant : le même jour ; un calendrier illisible : rien.
  assert.deepEqual(matchsEnCoursDuCalendrier([], { maintenant: '2026-10-12T00:30:00.000Z' }).jours, ['2026-10-11', '2026-10-12']);
  assert.equal(matchsEnCoursDuCalendrier(null).parLigue.size, 0);
});

test('l’écart de « joués » s’explique quand une lecture de la table officielle dépasse le magasin d’au plus le nombre de matchs en cours — jamais sans match en cours, jamais pour plus', () => {
  assert.equal(ecartExpliqueParDesMatchsEnCours([30], 29, 1), true, 'Flamengo, la nuit du 11/10');
  assert.equal(ecartExpliqueParDesMatchsEnCours([28, 16], 27, 1), true, 'Racing Club : deux lectures de la table (plusieurs phases), l’une à +1');
  assert.equal(ecartExpliqueParDesMatchsEnCours([61, 31], 30, 1), true, 'Barcelona SC');
  assert.equal(ecartExpliqueParDesMatchsEnCours([31], 29, 1), false, 'deux matchs de moins, un seul en cours : une rencontre manque vraiment');
  assert.equal(ecartExpliqueParDesMatchsEnCours([31], 29, 2), true);
  assert.equal(ecartExpliqueParDesMatchsEnCours([30], 29, 0), false, 'aucun match en cours');
  assert.equal(ecartExpliqueParDesMatchsEnCours([29], 29, 1), false, 'aucun écart');
  assert.equal(ecartExpliqueParDesMatchsEnCours([28], 29, 1), false, 'plus de matchs au magasin qu’au classement : autre chose');
  assert.equal(ecartExpliqueParDesMatchsEnCours([1], 0, 1), true, 'premier match d’une saison, en cours');
});

test('le carnet et le contrôle quotidien : une sorte « Match en cours ou pas encore enregistré », de type « match manquant », rangée au classement officiel, jamais « à vérifier »', () => {
  assert.equal(SORTES['classement-en-cours'].type, 'manquant');
  assert.equal(SORTES['classement-en-cours'].libelle, 'Match en cours ou pas encore enregistré');
  assert.match(SORTES['classement-en-cours'].explication, /Ce n’est pas une anomalie/);
  assert.match(SORTES['classement-en-cours'].explication, /s’il reste après la fin du match et une passe, il redevient une anomalie/);
  assert.ok(TYPES.some((t) => t.cle === 'manquant'));
  assert.equal(TYPES.length, 6, 'aucun type de plus : les onglets du carnet restent les mêmes');
  const regle = D.__testing.DEPUIS_L_ETAPE_12['classement-en-cours'];
  assert.deepEqual([regle.controle, regle.aVerifier], ['classement-officiel', false]);
  // Une information de l'étape 12 devient une information de l'étape 14, jamais du rouge ni de l'orange.
  const ctx = { rencontres: new Map() };
  const c = D.__testing.depuisAnomalie({ id: 'manquant:classement-en-cours:Brazil Série A|2026|fotmob-9', sorte: 'classement-en-cours', gravite: 'info', label: 'Flamengo · classement officiel', detail: 'd', portee: { ligueSaison: 'Brazil Série A|2026', club: 'fotmob-9' } }, ctx);
  assert.deepEqual([c.controle, c.classe, c.aVerifier, c.clubs], ['classement-officiel', 'info', false, ['fotmob-9']]);
  assert.equal(D.couleurDuConstat(c), 'vert');
  assert.equal(D.statutDuControle({ constats: [c], parClasse: { rouge: 0, orange: 0, info: 1 } }), 'vert');
});

// ====================================================== 2. le cas fabriqué, contrôle partagé

/** Une phase du script d'essai, dans une copie neuve (scripts du serveur compris). */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 600_000 });
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
const regle = uneFois(() => lancer('regle'));
const chaine = uneFois(() => lancer('chaine'));
const sortieDuScript = uneFois(() => lancer('sortie'));
const parClub = (liste) => Object.fromEntries(liste.map((a) => [a.club, `${a.sorte}/${a.gravite}`]));

test('le cas de la nuit, fabriqué : la table officielle compte un match « scheduled » d’aujourd’hui (ou d’hier) que le magasin n’a pas → une INFORMATION pour les deux clubs, ni rouge ni orange', () => {
  const s = regle().scenarios;
  assert.deepEqual(s.exact, [], 'la table remise à l’exact : rien à dire');
  for (const nom of ['aujourdhui', 'hier', 'alias']) {
    assert.deepEqual(parClub(s[nom]), { [CONCEPCION]: 'classement-en-cours/info', [CALERA]: 'classement-en-cours/info' }, nom);
  }
  assert.equal(
    s.aujourdhui.find((a) => a.club === CALERA).detail,
    'Unión La Calera : 9 matchs joués au classement officiel, 8 au magasin — match en cours ou pas encore enregistré (Deportes Concepción – Unión La Calera du 05/10/2026) : une information, l’écart se referme quand le match est au magasin.'
  );
});

test('le même écart SANS match du jour pour l’expliquer → rouge, comme avant : pas de calendrier, calendrier vide, match d’avant-hier ou de demain, fini, reporté, déjà au score, d’un autre championnat, deux matchs manquants pour un seul en cours, déjà au magasin', () => {
  const s = regle().scenarios;
  const rouge = { [CONCEPCION]: 'classement-matchs/erreur', [CALERA]: 'classement-matchs/erreur' };
  for (const nom of ['sans-calendrier', 'calendrier-vide', 'avant-hier', 'demain', 'termine', 'reporte', 'avec-score', 'autre-championnat', 'deux-de-trop', 'ecrit-deux-fois', 'au-magasin']) {
    assert.deepEqual(parClub(s[nom]), rouge, nom);
  }
  assert.equal(s['sans-calendrier'].find((a) => a.club === CALERA).detail, 'Unión La Calera : 9 matchs joués au classement officiel, 8 au magasin — 1 rencontre manquante au moins.');
});

test('un nom du calendrier ne désigne un club que s’il est, à l’écriture près, un de SES noms (table officielle, classement calculé, annuaire du magasin) — jamais par ressemblance : « Calera FC » n’est pas Unión La Calera', () => {
  const s = regle().scenarios;
  // « Calera », planté dans l'annuaire du magasin pour ce club : reconnu (scénario « alias », plus haut).
  assert.deepEqual(parClub(s.inconnu), { [CONCEPCION]: 'classement-en-cours/info', [CALERA]: 'classement-matchs/erreur' });
});

test('le premier match d’un club (une saison qui commence) : au classement officiel, aucune rencontre au magasin — une information s’il est en cours, « club du classement sans rencontre » (rouge) sinon', () => {
  const s = regle().scenarios;
  assert.deepEqual(parClub(s['premier-match']), { 'fotmob-777': 'classement-en-cours/info', [CALERA]: 'classement-en-cours/info' });
  assert.equal(s['premier-match'].find((a) => a.club === 'fotmob-777').detail, 'Club Nouveau : 1 match joué au classement officiel, 0 au magasin — match en cours ou pas encore enregistré (Club Nouveau – Unión La Calera du 05/10/2026) : une information, l’écart se referme quand le match est au magasin.');
  assert.deepEqual(parClub(s['premier-match-sans']), { 'fotmob-777': 'classement-club/erreur', [CALERA]: 'classement-matchs/erreur' });
});

// ========================================= 3. les trois chemins : carnet, contrôle quotidien, script

test('le carnet de santé (scripts/data-health.mjs, comme la passe le lance) : pendant le match, deux informations et aucune erreur nouvelle ; sans le match au calendrier, deux erreurs comme avant', () => {
  const c = chaine();
  assert.equal(c.carnetPendant.cli.code, 0, c.carnetPendant.cli.stderr);
  assert.deepEqual(c.carnetPendant.anomalies.map((a) => `${a.sorte}/${a.gravite}/${a.type}`), ['classement-en-cours/info/manquant', 'classement-en-cours/info/manquant']);
  assert.equal(c.carnetPendant.parType.manquant.info, 2);
  assert.deepEqual(c.carnetSans.anomalies.map((a) => `${a.sorte}/${a.gravite}`), ['classement-matchs/erreur', 'classement-matchs/erreur']);
  assert.equal(c.carnetSans.parType.manquant.erreur, c.carnetPendant.parType.manquant.erreur + 2);
});

test('le carnet, les nuits suivantes, SANS rencontre nouvelle : le lendemain (match « scheduled » d’hier) toujours une information ; après la fin du match et une passe (« finished »), ou deux jours plus tard, l’écart redevient une erreur — la saison est revue quand même', () => {
  const c = chaine();
  for (const k of ['nuitLendemain', 'nuitApres', 'nuitSurlendemain']) {
    assert.equal(c[k].cli.code, 0, `${k} : ${c[k].cli.stderr}`);
    assert.equal(c[k].controle.mode, 'nuit', `${k} : la passe de nuit (aucune rencontre nouvelle)`);
    assert.equal(c[k].cli.json.rencontresControlees, 0, k);
  }
  assert.deepEqual(c.nuitLendemain.anomalies.map((a) => `${a.sorte}/${a.gravite}`), ['classement-en-cours/info', 'classement-en-cours/info']);
  assert.equal(c.nuitLendemain.controle.nouvellesErreurs, 0);
  for (const k of ['nuitApres', 'nuitSurlendemain']) {
    assert.deepEqual(c[k].anomalies.map((a) => `${a.sorte}/${a.gravite}`), ['classement-matchs/erreur', 'classement-matchs/erreur'], k);
    assert.equal(c[k].controle.nouvellesErreurs, 2, `${k} : deux erreurs NOUVELLES (l’étape le dit « à regarder »)`);
  }
});

test('le contrôle quotidien (il lit lui-même le calendrier) : pendant le match, les deux constats du Chili sont des INFORMATIONS, sans badge « à vérifier », et la phrase le dit à part ; sans le match, deux rouges et leurs badges, comme avant', () => {
  const c = chaine();
  const p = c.quotidienPendant;
  assert.deepEqual(p.duChili.map((x) => [x.classe, x.aVerifier]), [['info', false], ['info', false]]);
  assert.deepEqual(p.aVerifierDuChili, []);
  assert.equal(p.parClasse.info, 2);
  assert.match(p.constat, / ; 2 clubs comptent au classement officiel un match en cours ou pas encore enregistré \(une information, rien à corriger\) — par exemple : Deportes Concepción · classement officiel — /);
  // Les rouges de la base d'essai (ses classements incomplets) restent rouges : le contrôle aussi, pour eux seuls.
  assert.equal(p.parClasse.rouge, p.rougesHorsChili);
  const s = c.quotidienSans;
  assert.deepEqual(s.duChili.map((x) => [x.classe, x.aVerifier]), [['rouge', true], ['rouge', true]]);
  assert.equal(s.parClasse.rouge, s.rougesHorsChili + 2);
  assert.deepEqual(s.aVerifierDuChili.sort(), ['Matchs manquants face au classement officiel : Deportes Concepción', 'Matchs manquants face au classement officiel : Unión La Calera']);
  assert.doesNotMatch(s.constat, /match en cours/);
});

test('verify-standings.mjs : pendant le match, une liste « enCours » et un compte à part (aucun « played ») ; sans, les lignes « J » d’avant', () => {
  const c = chaine();
  const p = JSON.parse(c.verifierPendant.stdout.trim());
  assert.equal(p.playedMismatch, 0);
  assert.equal(p.enCours, 2);
  assert.deepEqual(p.details[0].played, []);
  assert.deepEqual(p.details[0].enCours, [
    'Deportes Concepción : officiel 9 J, magasin 8 J — match en cours ou pas encore enregistré : Deportes Concepción – Unión La Calera du 05/10/2026',
    'Unión La Calera : officiel 9 J, magasin 8 J — match en cours ou pas encore enregistré : Deportes Concepción – Unión La Calera du 05/10/2026'
  ]);
  assert.match(c.verifierPendant.stderr, /\n {2}en cours : Unión La Calera : officiel 9 J, magasin 8 J — /);
  const s = JSON.parse(c.verifierSans.stdout.trim());
  assert.equal(s.playedMismatch, 2);
  assert.equal(s.enCours, undefined);
  assert.equal(s.details[0].enCours, undefined);
  assert.deepEqual(s.details[0].played, ['Deportes Concepción : officiel 9 J, magasin 8 J', 'Unión La Calera : officiel 9 J, magasin 8 J']);
});

test('verify-standings.mjs SANS match en cours : sa sortie (stdout ET stderr) est celle du code d’avant, mot pour mot — sans calendrier, et avec un calendrier où rien n’est en cours', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'verifier-classements-avant-12-10.json'), 'utf8'));
  const s = sortieDuScript();
  for (const k of ['sansCalendrier', 'rienEnCours']) {
    assert.equal(s[k].code, 0, `${k} : ${s[k].stderr.slice(-500)}`);
    assert.equal(s[k].stdout, ref.stdout, `${k} : stdout`);
    assert.equal(s[k].stderr, ref.stderr, `${k} : stderr`);
  }
});
