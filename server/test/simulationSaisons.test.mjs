/**
 * Étape 28 du plan — LES FINS DE SAISON ET L'ENJEU (conception §2 et §6, test T7).
 *   node --test test/simulationSaisons.test.mjs        (depuis server/)
 *
 * Module PUR (data/simulation/saisons.js), appelé directement sur des tables fabriquées (aucune base) :
 *   Σ_clubs P(rang r) = 1 ; P(famille) = Σ de ses rangs ; P(f) = Σ_issue P(issue) · P(f | issue) à 1e-12 ; championnat
 *   réglé → P = 1 et enjeu 0 ; clubs égaux → 50 % ± bruit ; phase finie → « saison terminée » ; deduction −2 et +4 →
 *   points = `points` ; les 24 libellés se rangent ; les 5 cas de phase (Pérou, Argentine, MLS, Venezuela, Turquie) ;
 *   construction k = 2 (4 clubs, 3 jouées → 9 restantes ; doublon une fois ; paire absente « à dater » ; n qui
 *   change) ; k = 3 incomplet → « partiel », aucune probabilité ; k = 4 → deux rencontres par paire ordonnée.
 *   En plus : les noms du calendrier (table, nom court, annuaire, inconnu, ambigu) ; les deux lois (bornes, formule
 *   du modèle de buts, jour < D strict) ; la graine ; l'identifiant FotMob ; les catégories de l'enjeu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/data/simulation/saisons.js';
import { SEUILS_ENJEU, DEPARTAGE_SIMPLIFIE } from '../src/data/simulation/reglages.js';
import { forcesDe, moyennesAvant, attenuerLeTotal } from '../src/core/engine/goalModel.js';
import { CUPS_BY_LEAGUE } from '../src/data/providers/leagueCups.js';

/** Une ligne de table officielle, à la forme de standings_official.rows. */
function ligne(id, rank, { points = 0, played = 0, gf = 0, ga = 0, desc = null, deduction = null, won = null, drawn = null, nom = null, court = null } = {}) {
  return { rank, teamId: `fotmob-${id}`, teamName: nom ?? `Club ${id}`, shortName: court ?? null, played, won, drawn, lost: null, goalsFor: gf, goalsAgainst: ga, goalDiff: gf - ga, points, deduction, description: desc, home: { played: Math.ceil(played / 2), goalsFor: Math.ceil(gf / 2) }, away: { played: Math.floor(played / 2), goalsFor: Math.floor(gf / 2) } };
}
const table = (name, rows, extra = {}) => ({ name, rows, ...extra });
const tousLesCouples = (ids) => ids.flatMap((x) => ids.filter((y) => y !== x).map((y) => `${x}|${y}`));

/** Une petite ligue de 6 clubs à mi-saison : 1re place, Europe (rangs 1-2), barrage (5) et descente (6). */
function ligueDeSix() {
  const rows = [
    ligne(1, 1, { points: 13, played: 5, gf: 11, ga: 4, desc: 'Champions League' }),
    ligne(2, 2, { points: 11, played: 5, gf: 9, ga: 5, desc: 'Europa League' }),
    ligne(3, 3, { points: 8, played: 5, gf: 7, ga: 6 }),
    ligne(4, 4, { points: 6, played: 5, gf: 5, ga: 7 }),
    ligne(5, 5, { points: 4, played: 5, gf: 4, ga: 9, desc: 'Relegation qualification' }),
    ligne(6, 6, { points: 1, played: 5, gf: 3, ga: 8, desc: 'Relegation' })
  ];
  // 15 rencontres jouées (5 par club) parmi les 30 paires ordonnées : la 1re moitié des couples.
  const ids = ['1', '2', '3', '4', '5', '6'];
  const joues = [];
  const parClub = new Map(ids.map((i) => [i, 0]));
  for (const c of tousLesCouples(ids)) {
    const [h, a] = c.split('|');
    if (parClub.get(h) < 5 && parClub.get(a) < 5 && !joues.includes(`${a}|${h}`)) {
      joues.push(c);
      parClub.set(h, parClub.get(h) + 1);
      parClub.set(a, parClub.get(a) + 1);
    }
  }
  const r = S.restants({ table: { clubs: rows.map((x) => ({ id: S.idFotMob(x.teamId), played: 5 })), tables: 1, journees: 10 }, joues, calendrier: [], k: 2, jourD: '2026-10-27' });
  return { rows, r };
}

// ------------------------------------------------------------ identifiants, libellés, phases

test('identifiant FotMob : une seule fonction (« fotmob-8456 », 8456 et « 8456 » → « 8456 »), jamais un nom', () => {
  assert.equal(S.idFotMob('fotmob-8456'), '8456');
  assert.equal(S.idFotMob(8456), '8456');
  assert.equal(S.idFotMob('8456'), '8456');
  for (const x of ['Arsenal', 'fotmob-', '', null, undefined, 0, -3, 8.5, 'espn-12']) assert.equal(S.idFotMob(x), null, String(x));
});

test('T7 les 24 libellés de zone du magasin se rangent dans leurs familles (Relegation ≠ Relegation qualification, Conference League playoff → Europe, espaces en trop ignorés) ; une famille absente d’une table n’apparaît pas ; la 1re place = le rang 1', () => {
  const attendu = {
    'Championship playoff': ['playoff'], 'Relegation qualification': ['relegation_barrage'], Relegation: ['relegation'], 'Conference League qualification': ['europe'],
    'Qualification next stage': ['playoff'], 'Champions League': ['europe'], 'Promotion qualification': ['promotion_barrage'], 'Champions League qualification': ['europe'],
    'Conference League playoff': ['europe'], 'Europa League qualification': ['europe'], 'Copa Sudamericana': ['europe'], Promotion: ['promotion'], 'Copa Libertadores': ['europe'],
    'Europa League': ['europe'], 'Qualification to 1/8 Finals': ['playoff'], 'Copa Libertadores qualification': ['europe'], 'Europa Conference League Qualification': ['europe'],
    'Play-off': ['playoff'], 'AFC Champions League Elite ': ['europe'], 'AFC Champions League Elite qualification': ['europe'], 'AFC Champions League Two': ['europe'],
    'Possible qualification next stage': ['playoff'], Final: ['playoff'], 'CONMEBOL Libertadores Play-offs': ['europe']
  };
  assert.equal(Object.keys(attendu).length, 24);
  for (const [libelle, familles] of Object.entries(attendu)) assert.deepEqual(S.famillesDuLibelle(libelle), familles, libelle);
  assert.deepEqual(S.famillesDuLibelle(null), []);
  assert.deepEqual(S.famillesDuLibelle('Autre chose'), []);
  const f = S.famillesDeLaTable(table('Ligue 1', [ligne(1, 1, { desc: 'Champions League' }), ligne(2, 2, { desc: 'Champions League' }), ligne(3, 3, { desc: 'Europa League' }), ligne(4, 4), ligne(5, 5, { desc: 'Relegation qualification' }), ligne(6, 6, { desc: 'Relegation' })]));
  assert.deepEqual(f, { premiere: [1], europe: [1, 2, 3], relegation_barrage: [5], relegation: [6] }, 'ni promotion ni phase finale : absentes');
});

test('T7 les 5 cas de phase : Pérou (Clausura seule), Argentine (les deux zones de la Clausura), MLS (deux conférences, le Supporters Shield en doublon), Venezuela (Clausura seule), Turquie (la table orpheline du 14/10 ignorée)', () => {
  const lignes = (n) => Array.from({ length: n }, (_, i) => ligne(100 + i, i + 1));
  const ph = (toutes) => S.tablesDeLaPhase(toutes).tables.map((t) => t.name);
  const le = '2026-10-18T18:43:02.181Z';
  assert.deepEqual(ph([{ table_name: 'Clausura', ord: 0, fetched_at: le, rows: lignes(19) }, { table_name: 'Apertura', ord: 1, fetched_at: le, rows: lignes(19) }]), ['Clausura']);
  assert.deepEqual(ph([{ table_name: 'Clausura Group A', ord: 0, fetched_at: le, rows: lignes(15) }, { table_name: 'Clausura Group B', ord: 1, fetched_at: le, rows: lignes(15) }, { table_name: 'Apertura Group A', ord: 2, fetched_at: le, rows: lignes(15) }, { table_name: 'Apertura Group B', ord: 3, fetched_at: le, rows: lignes(15) }]), ['Clausura Group A', 'Clausura Group B']);
  assert.deepEqual(ph([{ table_name: 'Eastern', ord: 0, fetched_at: le, rows: lignes(15) }, { table_name: 'Western', ord: 1, fetched_at: le, rows: lignes(15) }, { table_name: 'Supporters Shield', ord: 2, fetched_at: le, rows: lignes(30) }]), ['Eastern', 'Western']);
  assert.deepEqual(ph([{ table_name: 'Clausura', ord: 0, fetched_at: le, rows: lignes(14) }, { table_name: 'Group A', ord: 1, fetched_at: le, rows: lignes(4) }, { table_name: 'Group B', ord: 2, fetched_at: le, rows: lignes(4) }, { table_name: 'Apertura', ord: 3, fetched_at: le, rows: lignes(14) }]), ['Clausura']);
  const turquie = S.tablesDeLaPhase([{ table_name: 'Super Lig', ord: 0, fetched_at: '2026-10-14T05:28:16.717Z', rows: lignes(18) }, { table_name: 'Süper Lig', ord: 0, fetched_at: '2026-10-18T18:42:57.589Z', rows: lignes(18) }]);
  assert.deepEqual(turquie.tables.map((t) => t.name), ['Süper Lig']);
  assert.ok(turquie.ecartees.some((e) => e.name === 'Super Lig' && /orpheline/.test(e.raison)));
  // Relevées dans la même heure : aucune n'est orpheline ; des petits groupes seuls restent.
  assert.deepEqual(ph([{ name: 'Group A', ord: 0, fetchedAt: le, rows: lignes(4) }, { name: 'Group B', ord: 1, fetchedAt: le, rows: lignes(4) }]), ['Group A', 'Group B']);
});

test('T7 points : `points` tel quel (net des pénalités), jamais recalculé (deduction −2 et +4 : le signe ne porte rien) ; la pénalité affichée est |deduction|', () => {
  // X : 3V + N = 33, deduction −2, points 31 ; Y : points 32 (3V + N = 28, deduction +4 écrite en positif).
  const rows = [ligne(1, 1, { points: 32, played: 12, won: 8, drawn: 4, deduction: 4, gf: 20, ga: 10 }), ligne(2, 2, { points: 31, played: 12, won: 10, drawn: 3, deduction: -2, gf: 25, ga: 10 })];
  const s = S.simulerSaison({ table: { tables: [table('T', rows)] }, restants: [], loi: S.loiTable(rows), n: 500, seed: 1 });
  const y = s.probas.find((p) => p.club === '1');
  assert.equal(y.familles.premiere, 1, 'Y (32 pts) devant X (31 pts, 3V + N = 33) : les points de la table, tels quels');
  assert.equal(S.penaliteDe(rows[0]), 4);
  assert.equal(S.penaliteDe(rows[1]), 2);
  assert.equal(S.penaliteDe(ligne(3, 3)), 0);
});

// ------------------------------------------------------------ les rencontres restantes

test('T7 construction k = 2 : 4 clubs, 3 rencontres jouées → 9 restantes ; entrée déjà jouée ou étrangère écartée ; doublon gardé une fois ; entrée périmée ou reportée « à dater » ; paire absente ajoutée « à dater » ; n de la table courante (un club de plus que l’an passé)', () => {
  const clubs = ['1', '2', '3', '4'].map((id) => ({ id, played: id === '4' ? 1 : id === '1' ? 2 : 1 }));
  // jouées : 1-2, 3-1, 4-2 → club 1 : 2, club 2 : 2, club 3 : 1, club 4 : 1 (played de la table = joués du magasin).
  clubs[1].played = 2;
  const joues = ['1|2', '3|1', '4|2'];
  const calendrier = [
    { homeId: 'fotmob-2', awayId: 'fotmob-1', date: '2026-11-02', status: 'scheduled' },
    { homeId: '2', awayId: '1', date: '2026-11-09', status: 'scheduled' }, // doublon
    { homeId: '1', awayId: '2', date: '2026-11-03', status: 'scheduled' }, // déjà jouée
    { homeId: '1', awayId: '99', date: '2026-11-03', status: 'scheduled' }, // étrangère (coupe)
    { homeId: '3', awayId: '4', date: '2026-10-20', status: 'scheduled' }, // périmée, non jouée
    { homeId: '4', awayId: '3', date: '2026-11-05', status: 'postponed' } // reportée
  ];
  const r = S.restants({ table: { clubs, tables: 1, journees: 4 }, joues, calendrier, k: 2, jourD: '2026-10-27' });
  assert.equal(r.mode, 'construction');
  assert.equal(r.complet, true, r.raison);
  assert.equal(r.liste.length, 9, '12 paires ordonnées − 3 jouées');
  assert.deepEqual(r.comptes.doublons, 1);
  assert.deepEqual(r.comptes.dejaJoues, 1);
  assert.deepEqual(r.comptes.etrangers, 1);
  assert.equal(r.liste.find((m) => m.h === '2' && m.a === '1').date, '2026-11-02', 'le calendrier date');
  assert.equal(r.liste.find((m) => m.h === '3' && m.a === '4').date, null, 'périmée : à dater');
  assert.equal(r.liste.find((m) => m.h === '4' && m.a === '3').date, null, 'reportée : à dater');
  assert.equal(r.comptes.construits, 6, 'paires absentes du calendrier ajoutées');
  assert.ok(r.liste.filter((m) => !['2|1', '3|4', '4|3'].includes(`${m.h}|${m.a}`)).every((m) => m.date === null));
  // L'an passé 3 clubs (J = 4), aujourd'hui 4 : la construction prend n de la table courante → 2(n − 1) = 6 par club.
  const parClub = new Map(clubs.map((c) => [c.id, c.played]));
  for (const m of r.liste) {
    parClub.set(m.h, parClub.get(m.h) + 1);
    parClub.set(m.a, parClub.get(m.a) + 1);
  }
  for (const v of parClub.values()) assert.equal(v, 6);
  // Une table en désaccord avec les rencontres jouées : non calculé, clubs nommés.
  const faux = S.restants({ table: { clubs: clubs.map((c) => (c.id === '3' ? { ...c, played: 2 } : c)), tables: 1, journees: 4 }, joues, calendrier, k: 2, jourD: '2026-10-27' });
  assert.equal(faux.complet, false);
  assert.match(faux.raison, /désaccord \(3\)/);
  assert.equal(faux.liste.length, 0);
});

test('T7 phase finie → « saison terminée » (aucune rencontre restante, complet) ; k = 3 avec un calendrier court → « partiel », aucune probabilité, la raison en mots ; k = 4 → deux rencontres admises par paire ordonnée ; phase sans précédent → non calculé', () => {
  const ids = ['1', '2', '3'];
  const finie = S.restants({ table: { clubs: ids.map((id) => ({ id, played: 4 })), tables: 1, journees: 4 }, joues: tousLesCouples(ids), calendrier: [], k: 2, jourD: '2026-10-27' });
  assert.deepEqual([finie.complet, finie.liste.length, finie.raison], [true, 0, 'saison terminée']);
  // k = 3, 4 clubs, J = 9 : chacun a joué 6, il en manque 3 par club (6 rencontres) ; le calendrier n'en connaît que 4.
  const quatre = ['1', '2', '3', '4'];
  const cal = [['1', '2'], ['3', '4'], ['1', '3'], ['2', '4']].map(([h, a], i) => ({ homeId: h, awayId: a, date: `2026-11-0${i + 1}`, status: 'scheduled' }));
  const partiel = S.restants({ table: { clubs: quatre.map((id) => ({ id, played: 6 })), tables: 1, journees: 9 }, joues: [], calendrier: cal, k: 3, jourD: '2026-10-27' });
  assert.equal(partiel.mode, 'calendrier');
  assert.equal(partiel.complet, false);
  assert.equal(partiel.liste.length, 0, 'aucune rencontre, donc aucune probabilité');
  assert.equal(partiel.raison, 'calendrier incomplet : 4 rencontres connues sur 6 attendues, non calculé');
  // Le même calendrier complété : complet.
  const complet = S.restants({ table: { clubs: quatre.map((id) => ({ id, played: 6 })), tables: 1, journees: 9 }, joues: [], calendrier: [...cal, { homeId: '1', awayId: '4', date: '2026-11-08', status: 'scheduled' }, { homeId: '2', awayId: '3', date: '2026-11-08', status: 'scheduled' }], k: 3, jourD: '2026-10-27' });
  assert.equal(complet.complet, true);
  assert.equal(complet.liste.length, 6);
  // k = 4 : trois entrées de la même paire ordonnée → deux gardées.
  const k4 = S.restants({ table: { clubs: ['1', '2'].map((id) => ({ id, played: 0 })), tables: 1, journees: 4 }, joues: [], calendrier: [['1', '2'], ['1', '2'], ['1', '2'], ['2', '1'], ['2', '1']].map(([h, a], i) => ({ homeId: h, awayId: a, date: `2026-11-1${i}`, status: 'scheduled' })), k: 4, jourD: '2026-10-27' });
  assert.equal(k4.comptes.doublons, 1);
  assert.equal(k4.liste.filter((m) => m.h === '1').length, 2);
  assert.equal(k4.complet, true);
  const inedite = S.restants({ table: { clubs: quatre.map((id) => ({ id, played: 1 })), tables: 2, journees: null }, joues: [], calendrier: cal, k: null, jourD: '2026-10-27' });
  assert.equal(inedite.complet, false);
  assert.match(inedite.raison, /sans précédent/);
  assert.throws(() => S.restants({ table: { clubs: [] }, joues: [], calendrier: [], k: 2 }), /jourD/);
});

test('T7 les refus en mots vrais (vus à la mesure de la nuit du 19/10) : des rencontres EN TROP au calendrier, le bon total mais pas pour les bons clubs, un calendrier INCOMPLET ; les POULES DE FIN DE SAISON (la table relevée est celle de la phase régulière) distinguées d’un désaccord entre la table et le magasin', () => {
  // k = 3, 4 clubs, J = 9 : chacun a joué 6, il en reste 3 par club (6 rencontres attendues).
  const quatre = ['1', '2', '3', '4'];
  const clubs = quatre.map((id) => ({ id, played: 6 }));
  const entrees = (paires) => paires.map(([h, a], i) => ({ homeId: h, awayId: a, date: `2026-11-${String(i + 1).padStart(2, '0')}`, status: 'scheduled' }));
  const six = [['1', '2'], ['3', '4'], ['1', '3'], ['2', '4'], ['1', '4'], ['2', '3']];
  // Huit rencontres pour six attendues (deux par paire ordonnée admises à k = 3) : « en trop », jamais « incomplet ».
  const trop = S.restants({ table: { clubs, tables: 1, journees: 9 }, joues: [], calendrier: entrees([...six, ['1', '2'], ['3', '4']]), k: 3, jourD: '2026-10-27' });
  assert.deepEqual([trop.complet, trop.liste.length], [false, 0]);
  assert.equal(trop.raison, 'rencontres en trop au calendrier : 8 connues pour 6 attendues, non calculé');
  // Six rencontres pour six attendues, mal réparties (le club 4 n'en a qu'une) : ni « en trop » ni « incomplet ».
  const mal = S.restants({ table: { clubs, tables: 1, journees: 9 }, joues: [], calendrier: entrees([['1', '2'], ['1', '2'], ['1', '3'], ['1', '3'], ['2', '3'], ['2', '4']]), k: 3, jourD: '2026-10-27' });
  assert.equal(mal.raison, 'clubs différents de la table : 6 rencontres connues pour 6 attendues, mais 3 clubs n’ont pas leur compte, non calculé');
  // Moins de rencontres que prévu : « incomplet », la phrase d'avant.
  const court = S.restants({ table: { clubs, tables: 1, journees: 9 }, joues: [], calendrier: entrees(six.slice(0, 5)), k: 3, jourD: '2026-10-27' });
  assert.equal(court.raison, 'calendrier incomplet : 5 rencontres connues sur 6 attendues, non calculé');
  for (const r of [trop, mal, court]) assert.doesNotMatch(r.raison, /incomplet : (\d+) rencontres connues sur \1 /, 'jamais « incomplet : 61 sur 61 »');
  // La garde anti-fuite : les poules de fin de saison (Finlande 22 / 28, Islande 22 / 26, Équateur 30 / 32 au 19/10).
  const poules = S.raisonDuDesaccord(
    ['KuPS', 'HJK', 'Ilves', 'SJK'].map((nom, i) => ({ nom, table: 6, magasin: 8 + (i % 2) })),
    { clubs: 4, journees: 6 }
  );
  assert.equal(poules, 'poules de fin de saison : la table relevée est celle de la phase régulière (6 matchs par club), le magasin compte déjà jusqu’à 9 matchs ; les poules de fin de saison ne sont pas simulées — non calculé');
  assert.doesNotMatch(poules, /désaccord/);
  // Un club en avance à la table (rencontre pas encore rangée au magasin) : le désaccord, clubs nommés (la phrase d'avant).
  const avance = [{ nom: 'Arezzo', table: 7, magasin: 6 }, { nom: 'Sampdoria', table: 7, magasin: 6 }];
  assert.equal(S.raisonDuDesaccord(avance, { clubs: 20, journees: 38 }), 'table et magasin en désaccord : Arezzo (table 7, magasin 6), Sampdoria (table 7, magasin 6) — non calculé');
  // Pas tous les clubs, phase régulière pas finie, ou pas de saison d'avant : jamais « poules ».
  const cinq = ['A', 'B', 'C', 'D', 'E'].map((nom) => ({ nom, table: 6, magasin: 8 }));
  assert.match(S.raisonDuDesaccord(cinq.slice(0, 3), { clubs: 4, journees: 6 }), /^table et magasin en désaccord : A \(table 6, magasin 8\), B/);
  assert.match(S.raisonDuDesaccord(cinq.slice(0, 4).map((d) => ({ ...d, table: 5 })), { clubs: 4, journees: 6 }), /^table et magasin en désaccord/);
  assert.match(S.raisonDuDesaccord(cinq.slice(0, 4), { clubs: 4, journees: null }), /^table et magasin en désaccord/);
  assert.equal(S.raisonDuDesaccord(cinq, { clubs: 5, journees: 9 }), 'table et magasin en désaccord : A (table 6, magasin 8), B (table 6, magasin 8), C (table 6, magasin 8) et 2 autre(s) — non calculé');
});

test('T7 restants, les REPORTS tels que FotMob les écrit (deux entrées : « postponed » à l’ancienne date PUIS « scheduled » à la nouvelle) : en aller-retour simple la paire garde sa NOUVELLE date ; en mode calendrier elle ne compte qu’une fois et le championnat reste complet ; une entrée passée restée « scheduled » d’une paire jouée est écartée ; un vrai doublon reste jeté', () => {
  const D = '2026-10-27';
  // k = 2 (construction), 4 clubs, rien de joué : Sheffield (1) – Stevenage (2) reportée le 26/09, re-datée au 13/04/2027.
  const clubs0 = ['1', '2', '3', '4'].map((id) => ({ id, played: 0 }));
  const sheffield = [
    { homeId: '1', awayId: '2', date: '2026-09-26', status: 'postponed' },
    { homeId: '1', awayId: '2', date: '2027-04-13', status: 'scheduled' },
    { homeId: '3', awayId: '4', date: '2026-11-01', status: 'scheduled' }
  ];
  const k2 = S.restants({ table: { clubs: clubs0, tables: 1, journees: 6 }, joues: [], calendrier: sheffield, k: 2, jourD: D });
  assert.equal(k2.complet, true, k2.raison);
  assert.equal(k2.liste.find((m) => m.h === '1' && m.a === '2').date, '2027-04-13', 'la nouvelle date, jamais perdue');
  assert.equal(k2.liste.filter((m) => m.h === '1' && m.a === '2').length, 1);
  assert.equal(k2.comptes.doublons, 1, 'l’entrée reportée devient le doublon');
  // Un VRAI doublon (deux rencontres futures de la même affiche, k = 2) : toujours jeté, la première gardée.
  const vrai = S.restants({ table: { clubs: clubs0, tables: 1, journees: 6 }, joues: [], calendrier: [{ homeId: '3', awayId: '4', date: '2026-11-01', status: 'scheduled' }, { homeId: '3', awayId: '4', date: '2026-11-08', status: 'scheduled' }], k: 2, jourD: D });
  assert.deepEqual([vrai.complet, vrai.comptes.doublons, vrai.liste.find((m) => m.h === '3' && m.a === '4').date], [true, 1, '2026-11-01']);
  // k = 3 (calendrier), 4 clubs, J = 9, 6 jouées chacun : 6 rencontres attendues ; le calendrier les nomme, plus la
  // rencontre 1-2 reportée le 10/10 (« postponed ») PUIS re-datée au 13/04/2027 — avant la correction : « 7 pour 6 ».
  const clubs6 = clubs0.map((c) => ({ ...c, played: 6 }));
  const six = [['1', '2'], ['3', '4'], ['1', '3'], ['2', '4'], ['1', '4'], ['2', '3']].map(([h, a], i) => ({ homeId: h, awayId: a, date: `2026-11-${String(i + 2).padStart(2, '0')}`, status: 'scheduled' }));
  const sansLaReportee = six.filter((e) => !(e.homeId === '1' && e.awayId === '2'));
  const reportee = [{ homeId: '1', awayId: '2', date: '2026-10-10', status: 'postponed' }, ...sansLaReportee, { homeId: '1', awayId: '2', date: '2027-04-13', status: 'scheduled' }];
  const k3 = S.restants({ table: { clubs: clubs6, tables: 1, journees: 9 }, joues: [], calendrier: reportee, k: 3, jourD: D });
  assert.equal(k3.complet, true, k3.raison);
  assert.equal(k3.liste.length, 6);
  assert.deepEqual(k3.liste.filter((m) => m.h === '1' && m.a === '2').map((m) => m.date), ['2027-04-13'], 'comptée une fois, à sa nouvelle date');
  assert.equal(k3.comptes.remplacees, 1);
  assert.equal(k3.comptes.calendrier, 7, 'toutes les entrées lues sont comptées');
  // Le second compte n'est gardé que s'il tombe juste : avec un vrai doublon de plus, la raison « en trop » reste.
  const enTrop = S.restants({ table: { clubs: clubs6, tables: 1, journees: 9 }, joues: [], calendrier: [...reportee, { homeId: '3', awayId: '4', date: '2026-11-20', status: 'scheduled' }], k: 3, jourD: D });
  assert.equal(enTrop.complet, false);
  assert.equal(enTrop.raison, 'rencontres en trop au calendrier : 8 connues pour 6 attendues, non calculé');
  // Une entrée PASSÉE restée « scheduled » dont la paire est déjà jouée au magasin : le fantôme d'une rencontre jouée.
  const fantome = S.restants({ table: { clubs: clubs6, tables: 1, journees: 9 }, joues: ['3|1'], calendrier: [{ homeId: '3', awayId: '1', date: '2026-10-10', status: 'scheduled' }, ...six], k: 3, jourD: D });
  assert.equal(fantome.complet, true, fantome.raison);
  assert.equal(fantome.comptes.perimesJoues, 1);
  assert.ok(!fantome.liste.some((m) => m.h === '3' && m.a === '1'));
  // La même entrée passée, sa paire PAS jouée : une rencontre à dater, gardée (k = 2).
  const aDater = S.restants({ table: { clubs: clubs0, tables: 1, journees: 6 }, joues: [], calendrier: [{ homeId: '3', awayId: '1', date: '2026-10-10', status: 'scheduled' }], k: 2, jourD: D });
  assert.deepEqual([aDater.comptes.perimesJoues, aDater.comptes.perimes, aDater.liste.find((m) => m.h === '3' && m.a === '1').date], [0, 1, null]);
});

test('format de la saison précédente : k = J / (n − 1) de la table régulière (même nom, sinon la plus grande)', () => {
  const rows = (n, j) => Array.from({ length: n }, (_, i) => ligne(200 + i, i + 1, { played: j }));
  assert.deepEqual(S.formatDeLaSaisonPrecedente([table('Premier League', rows(20, 38))], 'Premier League'), { table: 'Premier League', J: 38, n: 20, k: 2, kEntier: 2 });
  const ecosse = S.formatDeLaSaisonPrecedente([table('Championship Group', rows(6, 38)), table('Premiership', rows(12, 33))], 'Premiership');
  assert.deepEqual([ecosse.k, ecosse.kEntier], [3, 3]);
  const plusGrande = S.formatDeLaSaisonPrecedente([table('Group A', rows(4, 6)), table('Liga', rows(10, 36))], 'Autre nom');
  assert.deepEqual([plusGrande.table, plusGrande.kEntier], ['Liga', 4]);
  assert.equal(S.formatDeLaSaisonPrecedente([], 'x'), null);
});

test('noms du calendrier : par la table (nom et nom court), sinon par l’annuaire restreint aux clubs de la table ; un nom inconnu ou ambigu est nommé, jamais rapproché « à peu près »', () => {
  // (Partie C de l'étape 28 : « SV Elversberg » et « SC Paderborn » sont au registre ferme TEAM_ALIASES — B12 —, ils se
  // rattachent par la table ; l'exemple du nom inconnu et de la table locale de secours est un club d'essai.)
  const rows = [ligne(8232, 1, { nom: 'Elversberg' }), ligne(8460, 2, { nom: 'Paderborn', court: 'Paderborn 07' }), ligne(9789, 3, { nom: 'Borussia Dortmund', court: 'Dortmund' }), ligne(8178, 4, { nom: 'Bayer Leverkusen' }), ligne(990001, 5, { nom: 'Kickers Essai' })];
  const calendrier = [{ homeName: 'Borussia Dortmund', awayName: 'Paderborn 07' }, { homeName: 'SV Elversberg', awayName: 'Leverkusen' }, { homeName: 'Hertha', awayName: 'Dortmund' }, { homeName: 'SpVgg Kickers Essai', awayName: 'SC Paderborn' }];
  const sans = S.rattacherLesNoms({ rows, calendrier, annuaire: {} });
  assert.equal(sans.parNom.get('Borussia Dortmund'), 'fotmob-9789');
  assert.equal(sans.parNom.get('Paderborn 07'), 'fotmob-8460', 'nom court de la table');
  assert.equal(sans.parNom.get('SV Elversberg'), 'fotmob-8232', 'le registre ferme des noms (TEAM_ALIASES)');
  assert.equal(sans.parNom.get('SC Paderborn'), 'fotmob-8460', 'le registre ferme des noms (TEAM_ALIASES)');
  assert.deepEqual(sans.inconnus.sort(), ['Hertha', 'Leverkusen', 'SpVgg Kickers Essai']);
  const avec = S.rattacherLesNoms({ rows, calendrier, annuaire: new Map([['fotmob-8178', ['Leverkusen', 'Bayer 04']], ['fotmob-999', ['Hertha']]]), aliasEnPlus: { 'fotmob-990001': ['SpVgg Kickers Essai'] } });
  assert.equal(avec.parNom.get('Leverkusen'), 'fotmob-8178', 'annuaire');
  assert.equal(avec.parNom.get('SpVgg Kickers Essai'), 'fotmob-990001', 'table locale de secours');
  assert.deepEqual(avec.inconnus, ['Hertha'], 'un alias d’un club absent de la table ne rattache rien');
  const ambigu = S.rattacherLesNoms({ rows, calendrier: [{ homeName: 'Borussia', awayName: 'Dortmund' }], annuaire: { 'fotmob-9789': ['Borussia'], 'fotmob-8178': ['Borussia'] } });
  assert.deepEqual(ambigu.ambigus, ['Borussia']);
});

// ------------------------------------------------------------ les lois

test('les deux lois : V1 « table » bornée [0,2 ; 6] et favorable au meilleur club ; V2 « forces » = la formule du modèle de buts (forcesDe, moyennesAvant, attenuerLeTotal) ; un 9-0 planté le jour D ne change rien (jour < D strict)', () => {
  const rows = [ligne(1, 1, { points: 20, played: 8, gf: 22, ga: 4 }), ligne(2, 2, { points: 5, played: 8, gf: 4, ga: 20 })];
  const v1 = S.loiTable(rows);
  const a = v1('1', '2');
  const b = v1('2', '1');
  assert.ok(a.lambda > a.mu && b.mu > b.lambda);
  for (const x of [a.lambda, a.mu, b.lambda, b.mu]) assert.ok(x >= 0.2 && x <= 6);
  const reglages = { prior: 8, statistique: 'mix', poidsXg: 0.7 };
  const forces = { 1: { n: 20, nx: 20, sa: 28, wa: 20, sd: 15, wd: 20, sga: 27, wga: 20, sgd: 14, wgd: 20 }, 2: { n: 3, nx: 3, sa: 2, wa: 3, sd: 4, wd: 3, sga: 2, wga: 3, sgd: 4, wgd: 3 } };
  const jours = [{ jour: '2026-10-20', saison: 2026, n: 40, bd: 60, be: 46, nx: 40, xd: 58, xe: 47 }, { jour: '2026-10-26', saison: 2026, n: 4, bd: 6, be: 5, nx: 4, xd: 6, xe: 5 }];
  const v2 = S.loiForces({ forces, joursLigue: jours, jourD: '2026-10-27', saison: 2026, reglages });
  const ligue = moyennesAvant(jours, { jour: '2026-10-27', saison: 2026 });
  const fH = forcesDe(forces[1], reglages);
  const fA = forcesDe(forces[2], reglages);
  const x = attenuerLeTotal({ lambda: ligue.buts.home * fH.attaque * fA.defense, mu: ligue.buts.away * fA.attaque * fH.defense }, ligue, Math.min(fH.matchs, fA.matchs), 8);
  const y = v2('1', '2');
  assert.equal(y.lambda, Math.min(6, Math.max(0.2, x.lambda)));
  assert.equal(y.mu, Math.min(6, Math.max(0.2, x.mu)));
  // Un 9-0 planté le jour D lui-même : moyennesAvant ne lit que les jours < D.
  const avecFuite = S.loiForces({ forces, joursLigue: [...jours, { jour: '2026-10-27', saison: 2026, n: 1, bd: 9, be: 0, nx: 1, xd: 9, xe: 0 }], jourD: '2026-10-27', saison: 2026, reglages });
  assert.deepEqual(avecFuite('1', '2'), y);
  // Un club sans ligne de forces : forces 1 et 1 (démarrage à froid).
  assert.ok(Number.isFinite(v2('1', '77').lambda));
  assert.throws(() => S.loiForces({ forces, joursLigue: jours, jourD: '2026-10-27', saison: 2026 }), /réglages/);
});

// ------------------------------------------------------------ la simulation

test('T7 conservation : Σ_clubs P(rang r) = 1 pour chaque rang et Σ_r P(rang r) = 1 pour chaque club ; P(famille) = Σ de ses rangs ; même graine → mêmes chiffres à l’octet, autre graine → au plus 1,5 pt en moyenne', () => {
  const { rows, r } = ligueDeSix();
  assert.equal(r.complet, true, r.raison);
  assert.equal(r.liste.length, 15);
  const args = { table: { tables: [table('Ligue', rows)] }, restants: r.liste, loi: S.loiTable(rows), n: 10000, seed: 2828, rencontresAEnjeu: [0, 1, 2] };
  const s = S.simulerSaison(args);
  for (let rang = 0; rang < 6; rang++) assert.ok(Math.abs(s.probas.reduce((acc, p) => acc + p.rangs[rang], 0) - 1) < 1e-12, `rang ${rang + 1}`);
  for (const p of s.probas) {
    assert.ok(Math.abs(p.rangs.reduce((x, y) => x + y, 0) - 1) < 1e-12);
    assert.ok(Math.abs(p.familles.europe - p.rangs[0] - p.rangs[1]) < 1e-12, 'Europe = rangs 1 et 2');
    assert.ok(Math.abs(p.familles.premiere - p.rangs[0]) < 1e-12);
    assert.ok(Math.abs(p.familles.relegation - p.rangs[5]) < 1e-12);
  }
  assert.deepEqual(S.simulerSaison(args), s, 'même graine, mêmes chiffres');
  const autre = S.simulerSaison({ ...args, seed: 2829 });
  let somme = 0;
  let nb = 0;
  s.probas.forEach((p, i) => {
    for (const f of Object.keys(p.familles)) {
      somme += Math.abs(p.familles[f] - autre.probas[i].familles[f]) * 100;
      nb++;
    }
  });
  assert.ok(somme / nb <= 1.5, `écart moyen entre graines ${(somme / nb).toFixed(3)} pt`);
});

test('T7 enjeu : P(f) = Σ_issue P(issue) · P(f | issue) à 1e-12, pour chaque camp et chaque famille ; enjeu = max_f |P(f | gagne) − P(f | perd)| en points ; catégories « sans », « gros », « enjeu »', () => {
  const { rows, r } = ligueDeSix();
  const s = S.simulerSaison({ table: { tables: [table('Ligue', rows)] }, restants: r.liste, loi: S.loiTable(rows), n: 10000, seed: 77, rencontresAEnjeu: r.liste.map((_, q) => q) });
  assert.equal(s.enjeux.length, 15);
  for (const e of s.enjeux) {
    const issues = [e.issues.dom, e.issues.nul, e.issues.ext];
    assert.ok(Math.abs(issues.reduce((x, y) => x + y, 0) - 1) < 1e-12);
    for (const [camp, club] of [['dom', e.h], ['ext', e.a]]) {
      const p = s.probas.find((x) => x.club === club);
      for (const f of Object.keys(p.familles)) {
        const total = [0, 1, 2].reduce((acc, o) => acc + issues[o] * (e.parIssue[camp][o][`Ligue|${f}`] ?? 0), 0);
        assert.ok(Math.abs(total - p.familles[f]) < 1e-12, `${camp} ${club} ${f} : ${total} contre ${p.familles[f]}`);
      }
      const gagne = camp === 'dom' ? 0 : 2;
      const perd = camp === 'dom' ? 2 : 0;
      const max = Math.max(...Object.keys(p.familles).map((f) => Math.abs(e.parIssue[camp][gagne][`Ligue|${f}`] - e.parIssue[camp][perd][`Ligue|${f}`]) * 100));
      assert.ok(Math.abs(e[camp].enjeu - max) < 1e-9);
    }
    assert.equal(e.categorie, S.categorieDeLEnjeu(e.dom.enjeu, e.ext.enjeu));
    assert.equal(e.enjeu, Math.max(e.dom.enjeu, e.ext.enjeu), 'enjeu de la rencontre = le plus grand des deux camps');
  }
  // La catégorie se décide sur l'enjeu ARRONDI à 5 que l'écran montre (vérification du 27/10, constat 3) : « 20 pt »
  // affiché → toujours « Gros enjeu » ; « 0 pt » affiché des deux côtés → « Sans enjeu ».
  assert.equal(S.categorieDeLEnjeu(1.9, 1.5), 'sans-enjeu');
  assert.equal(S.categorieDeLEnjeu(2, 1.5), 'sans-enjeu', '2 pt bruts s’affichent « 0 pt »');
  assert.equal(S.categorieDeLEnjeu(2.5, 1), 'enjeu', '2,5 pt bruts s’affichent « 5 pt »');
  assert.equal(S.categorieDeLEnjeu(17.4, 5), 'enjeu', '17,4 pt bruts s’affichent « 15 pt »');
  assert.equal(S.categorieDeLEnjeu(19.9, 5), 'gros-enjeu', '19,9 pt bruts s’affichent « 20 pt »');
  assert.equal(S.categorieDeLEnjeu(17.5, 5), 'gros-enjeu', '17,5 pt bruts s’affichent « 20 pt »');
  assert.equal(S.categorieDeLEnjeu(3, SEUILS_ENJEU.gros), 'gros-enjeu');
  assert.equal(S.categorieDeLEnjeu(null, 3), 'non-calcule');
});

test('T7 championnat réglé : plus rien ne change le 1er → P(1er) = 1 (« acquis », unanime) et enjeu 0 sur ses rencontres ; clubs à égalité parfaite (points, différence, buts) → 50 % ± bruit chacun', () => {
  const ids = ['1', '2', '3', '4'];
  // Le leader a 30 points d'avance, il reste 2 rencontres par club : seule la 1re place est portée par la table.
  const rows = [ligne(1, 1, { points: 40, played: 4, gf: 20, ga: 2 }), ligne(2, 2, { points: 10, played: 4, gf: 8, ga: 8 }), ligne(3, 3, { points: 8, played: 4, gf: 7, ga: 9 }), ligne(4, 4, { points: 3, played: 4, gf: 3, ga: 19 })];
  const liste = [{ h: '1', a: '2', date: '2026-11-01' }, { h: '3', a: '4', date: '2026-11-01' }, { h: '4', a: '1', date: '2026-11-08' }, { h: '2', a: '3', date: '2026-11-08' }];
  const s = S.simulerSaison({ table: { tables: [table('Ligue', rows)] }, restants: liste, loi: S.loiTable(rows), n: 10000, seed: 5, rencontresAEnjeu: [0, 2] });
  const leader = s.probas.find((p) => p.club === '1');
  assert.equal(leader.familles.premiere, 1);
  assert.equal(leader.unanime.premiere, true);
  for (const e of s.enjeux) {
    assert.equal(e.dom.enjeu, 0);
    assert.equal(e.ext.enjeu, 0);
    assert.equal(e.categorie, 'sans-enjeu');
  }
  assert.ok(ids.every((id) => s.probas.find((p) => p.club === id)));
  // Deux clubs à égalité parfaite, plus rien à jouer : le tirage uniforme les départage.
  const egaux = [ligne(1, 1, { points: 30, played: 10, gf: 15, ga: 10 }), ligne(2, 2, { points: 30, played: 10, gf: 15, ga: 10 })];
  const e = S.simulerSaison({ table: { tables: [table('T', egaux)] }, restants: [], loi: S.loiTable(egaux), n: 10000, seed: 11 });
  for (const p of e.probas) assert.ok(Math.abs(p.familles.premiere - 0.5) < 0.02, `${p.club} : ${p.familles.premiere}`);
  // Des zones (Argentine) : rangs calculés dans chaque table, rencontres entre zones comprises.
  const zoneA = [ligne(11, 1, { points: 9, played: 3, gf: 6, ga: 1 }), ligne(12, 2, { points: 3, played: 3, gf: 2, ga: 4 })];
  const zoneB = [ligne(21, 1, { points: 6, played: 3, gf: 4, ga: 3 }), ligne(22, 2, { points: 0, played: 3, gf: 1, ga: 5 })];
  const z = S.simulerSaison({ table: { tables: [table('Clausura Group A', zoneA), table('Clausura Group B', zoneB)] }, restants: [{ h: '11', a: '21', date: null }, { h: '22', a: '12', date: null }], loi: S.loiTable([...zoneA, ...zoneB]), n: 4000, seed: 3 });
  assert.deepEqual(z.regles.map((x) => x.membres), [['11', '12'], ['21', '22']]);
  for (const t of ['Clausura Group A', 'Clausura Group B']) assert.ok(Math.abs(z.probas.filter((p) => p.table === t).reduce((acc, p) => acc + p.rangs[0], 0) - 1) < 1e-12);
  assert.throws(() => S.simulerSaison({ table: { tables: [table('T', egaux)] }, restants: [{ h: '1', a: '99', date: null }], loi: S.loiTable(egaux), n: 10, seed: 1 }), /club absent/);
  assert.throws(() => S.simulerSaison({ table: { tables: [table('T', egaux)] }, restants: [], loi: S.loiTable(egaux), n: 10 }), /graine/);
});

test('réglages des saisons : la liste du départage simplifié ne nomme que des championnats connus (jamais une coupe)', () => {
  for (const l of DEPARTAGE_SIMPLIFIE) assert.ok(Object.prototype.hasOwnProperty.call(CUPS_BY_LEAGUE, l), l);
  assert.equal(DEPARTAGE_SIMPLIFIE.length, 15);
});
