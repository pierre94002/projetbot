/**
 * LE CONTEXTE DU MATCH (étape 32, lot 1a, 29/10/2026) — la nuit et l'archive d'avant-match.
 *   node --test test/contexteNuit.test.mjs        (depuis server/)
 *
 * Sur un MAGASIN FABRIQUÉ (contexteFabrique.mjs, dans une copie isolée : base neuve, réseau coupé, heure figée) et un
 * calendrier de saison fabriqué, plusieurs nuits de suite (script-contexte.mjs, phase « nuit ») :
 * T-N1 des fiches pour les 14 prochains jours seulement ; les clubs par l'annuaire STRICT ; un nom inconnu, ou à une lettre
 *      près d'un vrai club, est compté et nommé — jamais rapproché, jamais de fiche ;
 * T-N2 le GEL : une fiche est réécrite chaque nuit tant que son coup d'envoi n'est pas passé (heure inconnue : tant que sa
 *      date est après le jour de la nuit), JAMAIS ensuite ; une fiche écrite pour la première fois le jour même, sans
 *      heure, est marquée « après le coup d'envoi » ; un report laisse une orpheline et reçoit une fiche neuve ;
 * T-N3 le rattrapage de l'avant-match : une lecture d'avant le coup d'envoi restée dans upcoming_lineups est archivée,
 *      une d'après jamais ; les matchs joués des deux derniers jours comptés gardés / perdus / jamais relevés ;
 * T-N3b l'archive écrite AU MOMENT DE L'ÉCRITURE (critique, constat 5) : une lecture faite après le coup d'envoi ne fait
 *      pas perdre l'avant-match ; la dernière lecture d'avant gagne, champ par champ ; une plus ancienne arrivée après, non ;
 * T-N4 le jeton du calcul lourd pris par un autre → « reportée », rien de rangé ; un délai dépassé → le processus à part
 *      arrêté, rien de rangé ; le calcul tourne bien dans un AUTRE processus ;
 * T-N5 le rangement par tranches (une transaction par tranche), « en cours » posé puis retiré, la reprise après une nuit
 *      interrompue ; le serveur jamais tenu plus de 300 ms d'affilée ;
 * T-N8 le contrôle anti-fuite : 20 couples recalculés par un second chemin, 0 écart ; une fuite plantée → des écarts
 *      nommés, chacun avec sa phrase ;
 * T-N9 la GARDE : une fiche gelée d'un match JOUÉ est rattachée et jamais élaguée ; seules les orphelines de plus de 30
 *      jours partent ; l'archive d'avant-match ne part jamais.
 * Et l'étape de la passe : une fois par jour civil de Paris, reprise si reportée, jamais au clic ; juste avant le
 * contrôle quotidien.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { __testing as JOB } from '../src/jobs/matchStatsAutoRefresh.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-contexte.mjs');
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const lancer = (phase) => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: [phase, '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `${phase} :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
};
const nuit = uneFois(() => lancer('nuit'));
const archive = uneFois(() => lancer('archive'));

test('T-N1 des fiches pour les 14 prochains jours seulement, par l’annuaire STRICT ; un nom inconnu ou à une lettre près d’un vrai club est compté et nommé, jamais rapproché, sans fiche', () => {
  const s = nuit();
  const A = s.nuitA;
  assert.equal(A.mode, 'complet', A.erreur ?? '');
  const dates = A.base.fiches.map((f) => f.date);
  assert.ok(dates.length >= 16, `${dates.length} fiches`);
  assert.ok(dates.every((d) => d >= '2026-09-30' && d <= '2026-10-14'), `toutes dans les 14 jours : ${[...new Set(dates)].join(', ')}`);
  const inconnus = A.liste.sansIdentifiant.flatMap((x) => x.inconnus);
  assert.deepEqual(inconnus.sort(), ['Club Inconnu FC', s.calendrier.typo].sort(), 'les deux noms non reconnus sont nommés');
  const ids = new Set(s.clubs.map((c) => c.id));
  for (const f of A.base.fiches) assert.ok(ids.has(f.home_id) && ids.has(f.away_id), 'des identifiants FotMob seulement');
  assert.ok(A.liste.items >= 20);
});

test('T-N2 le GEL : réécrite jusqu’au jour d’avant (heure inconnue), jamais le jour même ni après ; la première écriture le jour même sans heure marquée « après le coup d’envoi » ; un report : l’orpheline reste, une fiche neuve à la nouvelle date', () => {
  const s = nuit();
  const A = s.nuitA;
  const B = s.nuitB;
  assert.equal(B.mode, 'complet', B.erreur ?? '');
  // Nuit A (30/09) : les fiches du 30/09, écrites le jour même sans heure connue, sont marquées.
  const du30 = A.base.fiches.filter((f) => f.date === '2026-09-30');
  assert.ok(du30.length > 0);
  assert.ok(du30.every((f) => f.apres_coup_d_envoi === 1));
  assert.ok(A.base.fiches.filter((f) => f.date > '2026-09-30').every((f) => f.apres_coup_d_envoi === 0));
  assert.equal(A.fiches.apresCoupDEnvoi, du30.length);
  // Nuit B (03/10) : les fiches du 03/10 (le jour même) et d'avant sont FIGÉES, celles d'après réécrites.
  const parCle = (base) => new Map(base.fiches.map((f) => [`${f.date}|${f.home_id}|${f.away_id}`, f]));
  const a = parCle(A.base);
  const b = parCle(B.base);
  for (const [cle, f] of b) {
    const avant = a.get(cle);
    if (f.date <= '2026-10-03' && avant) assert.equal(f.calcule_le, avant.calcule_le, `${cle} figée`);
  }
  assert.ok(B.fiches.figees >= 4, `${B.fiches.figees} fiches figées`);
  assert.ok(B.base.fiches.some((f) => f.date > '2026-10-03' && f.calcule_le === '2026-10-02T23:30:00.000Z'), 'les fiches d’après réécrites');
  assert.ok(B.fiches.reecrites > 0 && B.fiches.nouvelles > 0);
  // Le report du 06/10 au 13/10 : l'ancienne fiche reste (orpheline, jamais réécrite), une neuve à la nouvelle date.
  assert.ok(s.report, 'un match déplacé');
  const vieille = B.base.fiches.find((f) => f.date === '2026-10-06' && f.calcule_le === '2026-09-29T23:30:00.000Z');
  assert.ok(vieille, 'l’ancienne fiche du 06/10 reste, telle qu’elle était');
  assert.ok(B.base.fiches.some((f) => f.date === '2026-10-13' && f.home_id === vieille.home_id && f.away_id === vieille.away_id), 'une fiche neuve au 13/10');
  // Une fiche porte la forme et la version.
  assert.equal(s.exempleDeFiche.version, 1);
  assert.ok(s.exempleDeFiche.repos && s.exempleDeFiche.enchainement && s.exempleDeFiche.deplacement && s.exempleDeFiche.entraineur);
  assert.equal(s.exempleDeFiche.arbitre, null, 'l’arbitre n’est jamais connu la nuit');
  assert.ok(s.fichesAvecPrecedentPrevu > 0, 'des précédents « prévus au calendrier »');
});

test('T-N3 le rattrapage de l’avant-match : la lecture d’avant le coup d’envoi archivée, celle d’après jamais ; les matchs joués des deux derniers jours : 1 gardé, 1 perdu, les autres jamais relevés', () => {
  const s = nuit();
  const am = s.nuitA.avantMatch;
  assert.deepEqual([am.lus, am.archives, am.apresCoupDEnvoi], [2, 1, 1]);
  assert.deepEqual(am.comptes, { matchs: s.joues.total, gardes: 1, perdus: 1, jamaisReleves: s.joues.total - 2, sansIdentifiant: 0 });
  assert.deepEqual(s.nuitA.base.avantMatch.map((x) => x.fotmob_id), [s.joues.rattrape]);
  const garde = JSON.parse(s.nuitA.base.avantMatch[0].avant_match);
  assert.deepEqual(garde, { temperature: 14, windSpeed: 7, weather: 'Rain', referee: { name: 'Arbitre Prévu', country: 'France' } }, 'la liste blanche : jamais les moyennes FotMob de l’arbitre');
});

test('T-N3b l’archive écrite AU MOMENT DE L’ÉCRITURE : une lecture faite après le coup d’envoi ne fait pas perdre l’avant-match ; la dernière lecture d’avant gagne, champ par champ ; une plus ancienne arrivée après ne change rien ; la nuit n’y change rien', () => {
  const s = archive();
  const [e1, e2, e3, e4, e5, e6] = s.etapes;
  const am = (e) => e.archive.find((x) => x.fotmob_id === '5550001');
  assert.equal(am(e1).releve_le, '2026-10-10T16:00:00.000Z');
  assert.deepEqual(am(e1).avant_match, { temperature: 10, windSpeed: 5, weather: 'Rain', surface: 'grass', stadium: 'Stade A', referee: { name: 'Arbitre A', country: 'France' } });
  assert.deepEqual([am(e1).home_id, am(e1).away_id], [8456, 9825]);
  // Lu 30 min APRÈS le coup d'envoi : la composition est réécrite (25 °C), l'archive non.
  assert.equal(e2.lu.t, 25);
  assert.deepEqual(am(e2), am(e1));
  // Lu 1 h avant : il gagne (champ par champ : l'arbitre et le vent, non redits, restent).
  assert.equal(am(e3).releve_le, '2026-10-10T18:00:00.000Z');
  assert.deepEqual(am(e3).avant_match, { temperature: 11, windSpeed: 5, weather: 'Light Rain', surface: 'grass', stadium: 'Stade A', referee: { name: 'Arbitre A', country: 'France' } });
  // Une lecture de 2 h avant, arrivée après celle d'1 h avant : rien ne change.
  assert.deepEqual(am(e4), am(e3));
  // Une page sans cadre : rien ; une lecture seulement après le coup d'envoi : rien.
  assert.deepEqual(e5.archive.map((x) => x.fotmob_id), ['5550001']);
  assert.deepEqual(e6.archive, e5.archive);
  assert.deepEqual(e6.rattrapage, { lus: 3, archives: 0, apresCoupDEnvoi: 1, sansCadre: 1, dejaArchives: 1 });
});

test('T-N4 le jeton du calcul lourd pris par un autre : « reportée », rien de rangé ; un délai dépassé : le processus à part arrêté, rien de rangé ; le calcul tourne bien dans un AUTRE processus', () => {
  const s = nuit();
  assert.equal(s.reporte.mode, 'reporte');
  assert.match(s.reporte.raison, /Un autre calcul lourd tourne \(un autre calcul lourd/);
  assert.deepEqual(s.reporte.base, s.nuitA.base, 'rien de rangé quand c’est reporté');
  assert.equal(s.delai.mode, 'echec');
  assert.match(s.delai.erreur, /aucune réponse en 1 ms/);
  assert.deepEqual(s.delai.base, s.nuitA.base, 'rien de rangé quand le délai est dépassé');
  assert.ok(Number.isInteger(s.nuitA.aPart.pid) && s.nuitA.aPart.pid !== s.pid, `le calcul dans un autre processus (${s.nuitA.aPart.pid} ≠ ${s.pid})`);
  assert.ok(s.nuitA.aPart.rssMaxOctets > 0);
});

test('T-N5 le rangement par tranches (une transaction par tranche), « en cours » posé puis retiré, la reprise après une nuit interrompue ; le serveur jamais tenu plus de 300 ms d’affilée', () => {
  const s = nuit();
  const B = s.nuitB;
  assert.ok(B.transactions >= Math.ceil(B.fiches.ecrites / 5) + 1, `${B.transactions} transactions pour ${B.fiches.ecrites} fiches par tranches de 5`);
  assert.ok(B.ordresMax >= 1 && B.ordresMax <= 5, `jamais plus de 5 ordres dans une transaction (${B.ordresMax})`);
  assert.ok(s.nuitA.ordresMax >= 1 && s.nuitA.ordresMax <= 250, `nuit A : tranches de 250 (${s.nuitA.ordresMax})`);
  assert.ok(!B.base.etat.includes('en_cours'), 'la nuit interrompue (« en cours » resté) est reprise et finie');
  assert.deepEqual(B.base.etat, ['controle', 'ligues', 'nuit']);
  for (const n of [s.nuitA, s.nuitB, s.nuitC]) assert.ok(n.blocMaxMs < 300, `tenu ${n.blocMaxMs} ms d’affilée`);
  assert.equal(s.nuitA.cache.mode, 'premier');
  assert.equal(s.nuitB.cache.mode, 'rien', 'la nuit suivante ne relit rien de ce qui n’a pas changé (lecture incrémentale)');
  assert.equal(s.nuitA.rencontres.ecrites, s.nuitA.passe.rencontres);
});

test('T-N8 le contrôle anti-fuite : 20 couples recalculés par un second chemin, 0 écart, chaque nuit ; une fuite plantée (l’instantané pris APRÈS la publication du jour J) → des écarts nommés, avec leur phrase', () => {
  const s = nuit();
  for (const n of [s.nuitA, s.nuitB, s.nuitC]) {
    assert.equal(n.controle.couples, 20);
    assert.equal(n.controle.lignes, 20);
    assert.deepEqual(n.controle.ecarts, []);
  }
  assert.ok(s.fuite.ecarts > 0);
  assert.deepEqual(s.fuite.colonnes, ['arbitre', 'entraineur', 'precedent']);
  for (const t of s.fuite.textes) assert.match(t, /avant le \d{2}\/\d{2}\/2026 : /);
  assert.match(s.fuite.textes[0], /par la passe, .* par le second chemin/);
});

test('T-N9 la GARDE : la fiche gelée d’un match JOUÉ est rattachée à sa rencontre et jamais élaguée ; les orphelines de plus de 30 jours partent ; l’archive d’avant-match ne part jamais', () => {
  const s = nuit();
  const C = s.nuitC;
  assert.equal(C.mode, 'complet', C.erreur ?? '');
  assert.ok(s.ficheJouee, 'une fiche du 03/10 jouée le 04/10 (à un jour près)');
  assert.equal(C.elague.rattachees, 1);
  assert.equal(C.elague.orphelines, s.nuitB.base.fiches.length - 1);
  assert.equal(C.base.fiches.length, 1);
  assert.deepEqual([C.base.fiches[0].date, C.base.fiches[0].home_id, C.base.fiches[0].away_id], [s.ficheJouee.date, s.ficheJouee.home_id, s.ficheJouee.away_id]);
  assert.match(C.base.fiches[0].match_key, /^fab-joue-/);
  assert.deepEqual(C.base.avantMatch, s.nuitA.base.avantMatch, 'l’archive d’avant-match n’est jamais élaguée');
});

test('l’étape « contexteDuMatch » : une fois par jour civil de Paris, reprise si la passe d’avant l’a reportée, jamais forcée par un clic ; juste avant le contrôle quotidien', () => {
  const etapes = JOB.ETAPES().map((e) => e.key);
  assert.deepEqual(etapes.slice(-2), ['contexteDuMatch', 'controleQuotidien']);
  assert.ok(etapes.indexOf('contexteDuMatch') > etapes.indexOf('sauvegarde'));
  assert.ok(etapes.indexOf('contexteDuMatch') > etapes.indexOf('stylesDeJeu') && etapes.indexOf('contexteDuMatch') > etapes.indexOf('tableJourJ'));
  const ctx = (derniere, details = null, manuel = false) => ({ manuel, derniere: () => derniere, derniersDetails: () => details });
  assert.equal(JOB.dueContexteDuMatch(ctx(null)), true);
  assert.equal(JOB.dueContexteDuMatch(ctx(new Date().toISOString())), false);
  assert.equal(JOB.dueContexteDuMatch(ctx(new Date().toISOString(), null, true)), false, 'jamais au clic');
  assert.equal(JOB.dueContexteDuMatch(ctx(new Date().toISOString(), { reporte: true })), true, 'reprise si reportée');
});

test('T-N3c la règle de l’archive (pure) : la liste blanche seulement (l’arbitre : nom et pays), lecture STRICTEMENT avant le coup d’envoi de FotMob, les identifiants convertis comme numeroDuClub ; sans cadre, sans heure ou après : rien', async () => {
  const { ligneDAvantMatch, CHAMPS_AVANT_MATCH } = await import('../src/data/db/matchStatsDb.js');
  const { numeroDuClub } = await import('../src/data/contexte/formulesDuContexte.js');
  const ko = '2026-10-10T19:00:00.000Z';
  const e = (fetchedAt, meta, extra = {}) => ({ fotmobId: 4242, date: '2026-10-10', kickoff: '2026-10-10T12:00:00Z', league: 'Ligue 1', homeId: 'fotmob-8456', awayId: '9825', payload: { meta: { kickoff: ko, ...meta } }, fetchedAt, ...extra });
  const meta = { temperature: 9, windSpeed: 11, precipitation: 0.25, weather: 'Rain/Wind', surface: 'grass', stadium: 'S', lat: 1, long: 2, attendance: 40000, city: 'X', referee: { name: ' Clément  Turpin ', country: 'France', yellowCardsPerMatch: 5.1, matches: 46 } };
  const r = ligneDAvantMatch(e('2026-10-10T18:59:59.000Z', meta));
  assert.equal(r.raison, null);
  assert.deepEqual(Object.keys(JSON.parse(r.ligne.avant_match)), [...CHAMPS_AVANT_MATCH, 'referee']);
  assert.deepEqual(JSON.parse(r.ligne.avant_match).referee, { name: 'Clément Turpin', country: 'France' });
  assert.deepEqual([r.ligne.fotmob_id, r.ligne.kickoff, r.ligne.home_id, r.ligne.away_id, r.ligne.releve_le], ['4242', ko, 8456, 9825, '2026-10-10T18:59:59.000Z'], 'le coup d’envoi de FotMob, pas le 12:00Z de l’appelant');
  assert.equal(ligneDAvantMatch(e(ko, meta)).raison, 'apres-le-coup-d-envoi', 'au coup d’envoi : déjà trop tard');
  assert.equal(ligneDAvantMatch(e('2026-10-10T20:00:00.000Z', meta)).raison, 'apres-le-coup-d-envoi');
  assert.equal(ligneDAvantMatch(e('2026-10-10T18:00:00.000Z', { attendance: 1 })).raison, 'sans-cadre');
  assert.equal(ligneDAvantMatch(e('2026-10-10T18:00:00.000Z', meta, { payload: { meta: { ...meta, kickoff: null } }, kickoff: null })).raison, 'coup-d-envoi-inconnu');
  assert.equal(ligneDAvantMatch(e('2026-10-10T18:00:00.000Z', meta, { fotmobId: null })).raison, 'sans-identifiant');
  for (const id of ['fotmob-8456', '8456', 8456, 'fotmob-0', 'Lille', null]) assert.equal(ligneDAvantMatch(e('2026-10-10T18:00:00.000Z', meta, { homeId: id })).ligne.home_id, numeroDuClub(id), String(id));
});
