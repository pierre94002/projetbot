/**
 * LE CONTEXTE DU MATCH (étape 32, lot 1a, 29/10/2026) — la fiche, facteur par facteur (pur : ni base, ni réseau).
 *   node --test test/contexteRepos.test.mjs        (depuis server/)
 *
 * Des matchs FABRIQUÉS seulement (le banc des facteurs est unique et viendra plus tard) ; les stades de venues.json du
 * code. Le repos en HEURES entre deux coups d'envoi (le piège du coup d'envoi tardif en UTC), le 12:00Z fictif du
 * calendrier, la règle du jour J (un fait du jour J n'est jamais lu par la fiche de J), le match attribué, le premier
 * match, les bornes des classes, le match prévu au calendrier, la distance (la clé « fotmob-N » de venues.json),
 * l'enchaînement (le tour suivant d'une même coupe ignoré), l'altitude, la pelouse et l'entraîneur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContexteAuJourJ, passerLesRencontres, indexDesProchains } from '../src/data/contexte/contexteAuJourJ.js';
import * as F from '../src/data/contexte/formulesDuContexte.js';
import { SEUILS, VERSION_CONTEXTE } from '../src/data/contexte/reglagesContexte.js';
import { lireStades, distanceEntreClubs } from '../src/data/reference/donneesDeReference.js';
import { numeroDe } from '../src/data/db/teamStyle.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';

const VENUES = lireStades();
const entrees = Object.entries(VENUES.clubs).sort(([a], [b]) => (a < b ? -1 : 1));
const avecCoords = ([, v]) => Number.isFinite(v.lat) && Number.isFinite(v.long) && v.stade;
const [A, B, C, D] = entrees.filter((e) => avecCoords(e) && e[1].synthetique === false && e[1].altitude === null && e[1].pays !== 'Brazil').slice(0, 4).map(([k]) => Number(k.replace('fotmob-', '')));
const BRESIL = Number(entrees.find(([, v]) => v.pays === 'Brazil')[0].replace('fotmob-', ''));
const HAUT = entrees.find((e) => avecCoords(e) && Number(e[1].altitude) >= 2000);
const SYNTH = entrees.find((e) => avecCoords(e) && e[1].synthetique === true);

/** Un match joué fabriqué. */
const joue = (date, heure, home, away, extra = {}) => ({
  matchKey: `${date}-${home}-${away}`,
  date,
  kickoff: heure ? `${date}T${heure}:00.000Z` : null,
  kickoffConnu: Boolean(heure),
  league: 'Ligue 1',
  coupe: false,
  home,
  away,
  attribue: false,
  prolongation: false,
  stade: null,
  surface: null,
  arbitre: null,
  penalties: null,
  buts90: { dom: 1, ext: 0 },
  cartons: null,
  moyenneButsLigue: 2.6,
  entraineurs: { home: null, away: null },
  ...extra
});
/** Un contexte nourri de matchs joués (publiés journée par journée). */
function nourri(matchs) {
  const ctx = new ContexteAuJourJ({ venues: VENUES });
  executerSansPause(passerLesRencontres(ctx, [...matchs].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))));
  return ctx;
}
const fiche = (ctx, rencontre, extra = {}) => ctx.fiche({ rencontre: { league: 'Ligue 1', stade: null, surface: null, arbitre: null, ...rencontre }, calculeLe: '2026-10-29T01:00:00.000Z', ...extra });

test('T-R1 le repos se compte en HEURES entre deux coups d’envoi : samedi 15 h → mardi 19 h 45 UTC = 76,75 h, « court », 3 jours ; mercredi 21 h → samedi 15 h = 66 h', () => {
  const ctx = nourri([joue('2026-10-03', '15:00', A, B)]);
  const f = fiche(ctx, { date: '2026-10-06', kickoff: '2026-10-06T19:45:00.000Z', kickoffConnu: true, home: A, away: C });
  assert.equal(f.version, VERSION_CONTEXTE);
  assert.equal(f.repos.home.heures, 76.75);
  assert.equal(f.repos.home.classe, 'court');
  assert.equal(f.repos.home.jours, 3);
  assert.deepEqual(f.repos.home.mentions, ['court']);
  assert.equal(f.repos.home.precedent.kickoff, '2026-10-03T15:00:00.000Z');
  const ctx2 = nourri([joue('2026-10-07', '21:00', C, D)]);
  const g = fiche(ctx2, { date: '2026-10-10', kickoff: '2026-10-10T15:00:00.000Z', kickoffConnu: true, home: D, away: A });
  assert.equal(g.repos.home.heures, 66);
  assert.equal(g.repos.home.classe, 'court');
});

test('T-R2 le piège du coup d’envoi tardif en UTC : dimanche 18 h 30 au Brésil (21 h 30 UTC) → mercredi 21 h 30 au Brésil, rangé le JEUDI en UTC (00 h 30) : 75 h, « court » — les jours UTC donneraient 4 jours (96 h, « normal »)', () => {
  const ctx = nourri([joue('2026-03-15', '21:30', A, B)]);
  const f = fiche(ctx, { date: '2026-03-19', kickoff: '2026-03-19T00:30:00.000Z', kickoffConnu: true, home: A, away: C });
  assert.equal(f.repos.home.heures, 75);
  assert.equal(f.repos.home.jours, 3);
  assert.equal(f.repos.home.classe, 'court');
  assert.equal(F.joursEntre('2026-03-15', '2026-03-19') * 24, 96, 'en jours UTC : 4 jours, la classe « normal » — faux');
  assert.equal(F.classeDeRepos(96), 'normal');
});

test('T-R3 le 12:00Z du calendrier est FICTIF (heure inconnue) : le repos se compte au jour près (jours × 24), « heureInconnue », la mention le dit ; un vrai coup d’envoi à 12:00Z, lui, compte à l’heure', () => {
  const ctx = nourri([joue('2026-10-03', '19:00', A, B)]);
  const f = fiche(ctx, { date: '2026-10-06', kickoff: '2026-10-06T12:00:00Z', kickoffConnu: false, home: A, away: C });
  assert.equal(f.heureInconnue, true);
  assert.equal(f.repos.home.heureInconnue, true);
  assert.equal(f.repos.home.heures, 72);
  assert.ok(f.repos.home.mentions.includes('heure-inconnue'));
  const vrai = fiche(ctx, { date: '2026-10-06', kickoff: '2026-10-06T12:00:00Z', kickoffConnu: true, home: A, away: C });
  assert.equal(vrai.repos.home.heures, 65);
  assert.equal(vrai.repos.home.heureInconnue, false);
});

test('T-R4 le match précédent est d’un jour STRICTEMENT antérieur : un match du même jour UTC n’est jamais « le précédent » ; la fiche d’un jour déjà publié LÈVE (fuite refusée)', () => {
  const matchs = [joue('2026-10-03', '15:00', A, B), joue('2026-10-06', '12:00', A, C), joue('2026-10-06', '20:00', A, D)];
  const ctx = new ContexteAuJourJ({ venues: VENUES });
  const vues = [];
  executerSansPause(
    passerLesRencontres(ctx, matchs, {
      avantLaJournee: (jour, du) => {
        if (jour === '2026-10-06') for (const r of du) vues.push(ctx.fiche({ rencontre: r, calculeLe: 'x' }));
      }
    })
  );
  assert.equal(vues.length, 2);
  for (const f of vues) assert.equal(f.repos.home.precedent.date, '2026-10-03', 'jamais le match de 12 h du même jour');
  assert.throws(() => fiche(ctx, { date: '2026-10-06', kickoff: '2026-10-06T21:00:00.000Z', kickoffConnu: true, home: B, away: C }), /fuite refusée/);
  assert.throws(() => fiche(ctx, { date: '2026-10-05', home: B, away: C }), /fuite refusée/);
});

test('T-R5 un match ATTRIBUÉ ne compte pas comme joué (ni repos coupé, ni entraîneur) ; la prolongation du match précédent est portée', () => {
  const ctx = nourri([
    joue('2026-10-01', '19:00', A, B, { prolongation: true, league: 'Coupe de France', coupe: true }),
    joue('2026-10-05', '19:00', A, C, { attribue: true, entraineurs: { home: { nom: 'Fantôme', id: 1 }, away: null } })
  ]);
  const f = fiche(ctx, { date: '2026-10-08', kickoff: '2026-10-08T19:00:00.000Z', kickoffConnu: true, home: A, away: D });
  assert.equal(f.repos.home.precedent.date, '2026-10-01', 'le match attribué du 05/10 est sauté');
  assert.equal(f.repos.home.precedent.prolongation, true);
  assert.equal(f.repos.home.precedent.coupe, true);
  assert.ok(f.repos.home.mentions.includes('prolongation'));
  assert.equal(f.repos.home.heures, 168);
  assert.equal(f.entraineur.home.connu, false, 'aucun entraîneur pris dans un match attribué');
});

test('T-R6 le premier match connu d’un club : repos INCONNU (null, jamais 0), la mention « premier-match »', () => {
  const ctx = nourri([joue('2026-10-01', '19:00', B, C)]);
  const f = fiche(ctx, { date: '2026-10-08', kickoff: '2026-10-08T19:00:00.000Z', kickoffConnu: true, home: A, away: B });
  assert.equal(f.repos.home.heures, null);
  assert.equal(f.repos.home.jours, null);
  assert.equal(f.repos.home.classe, 'inconnu');
  assert.equal(f.repos.home.precedent, null);
  assert.deepEqual(f.repos.home.mentions, ['premier-match']);
  assert.equal(f.repos.away.heures, 168);
});

test('T-R7 240 h ou plus : « long », avec la mention des compétitions que l’appli ne suit pas ; un club brésilien de janvier à avril porte la mention des championnats d’État', () => {
  const ctx = nourri([joue('2026-10-01', '19:00', A, B)]);
  const mars = nourri([joue('2026-03-01', '19:00', BRESIL, C)]);
  const f = fiche(ctx, { date: '2026-10-11', kickoff: '2026-10-11T19:00:00.000Z', kickoffConnu: true, home: A, away: D });
  assert.equal(f.repos.home.heures, 240);
  assert.equal(f.repos.home.classe, 'long');
  assert.ok(f.repos.home.mentions.includes('long-competitions-non-suivies'));
  const g = fiche(mars, { date: '2026-03-08', kickoff: '2026-03-08T19:00:00.000Z', kickoffConnu: true, home: BRESIL, away: D });
  assert.ok(g.repos.home.mentions.includes('bresil-championnats-d-etat'));
  const h = fiche(mars, { date: '2026-05-08', kickoff: '2026-05-08T19:00:00.000Z', kickoffConnu: true, home: BRESIL, away: D });
  assert.ok(!h.repos.home.mentions.includes('bresil-championnats-d-etat'), 'pas en mai');
});

test('T-R8 la nuit : un match PRÉVU au calendrier avant J (pas encore joué) est le précédent — « si le match du … se joue comme prévu » ; un plus ancien que le dernier joué est ignoré', () => {
  const ctx = nourri([joue('2026-10-01', '19:00', A, B)]);
  const prevu = { date: '2026-10-04', kickoff: null, kickoffConnu: false, league: 'UEFA Europa League', prevu: true, source: 'calendrier' };
  const f = fiche(ctx, { date: '2026-10-07', kickoff: null, kickoffConnu: false, home: A, away: C }, { prevus: { [A]: prevu } });
  assert.equal(f.repos.home.precedent.date, '2026-10-04');
  assert.equal(f.repos.home.precedent.prevu, true);
  assert.equal(f.repos.home.precedent.source, 'calendrier');
  assert.equal(f.repos.home.precedent.continentale, true);
  assert.equal(f.repos.home.heures, 72);
  assert.deepEqual(f.repos.home.mentions, ['court', 'heure-inconnue', 'prevu']);
  const vieux = fiche(ctx, { date: '2026-10-07', kickoff: null, kickoffConnu: false, home: A, away: C }, { prevus: { [A]: { ...prevu, date: '2026-09-28' } } });
  assert.equal(vieux.repos.home.precedent.date, '2026-10-01');
});

test('T-R9 les bornes des classes : 95,99 h « court », 96 h « normal », 239,99 h « normal », 240 h « long » ; serré sous 96 h seulement', () => {
  assert.equal(F.classeDeRepos(95.99), 'court');
  assert.equal(F.classeDeRepos(96), 'normal');
  assert.equal(F.classeDeRepos(239.99), 'normal');
  assert.equal(F.classeDeRepos(240), 'long');
  assert.equal(F.classeDeRepos(null), 'inconnu');
  assert.equal(F.estSerre(95.99), true);
  assert.equal(F.estSerre(96), false);
  assert.equal(F.estSerre(null), null);
  assert.deepEqual([SEUILS.courtH, SEUILS.longH, SEUILS.serreH], [96, 240, 96]);
});

test('T-R10 la distance d’un couple connu n’est JAMAIS nulle : venues.json est lu par la clé « fotmob-N » (une seule conversion, la même que teamStyle.numeroDe), et le calcul est celui de donneesDeReference', () => {
  for (const x of ['fotmob-8456', '8456', 8456, ' 8456 ']) assert.equal(F.numeroDuClub(x), 8456);
  for (const x of [null, '', 'fotmob-0', 0, 'Lille', 'fotmob-12a']) assert.equal(F.numeroDuClub(x), null);
  for (const x of ['fotmob-8456', '8456', 8456, 'fotmob-0', 'abc', null]) assert.equal(F.numeroDuClub(x), numeroDe(x), String(x));
  assert.equal(F.cleDuStade(8456), 'fotmob-8456');
  const ctx = nourri([]);
  const f = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: B });
  const attendu = distanceEntreClubs(`fotmob-${A}`, `fotmob-${B}`);
  assert.ok(attendu > 0);
  assert.equal(f.deplacement.km, Math.round(attendu));
  assert.ok(f.deplacement.km > 0);
  assert.equal(f.deplacement.lnKm, Number(Math.log1p(attendu / 100).toFixed(6)));
  assert.equal(f.deplacement.source, 'stade-habituel');
  // Un match joué AILLEURS que le stade habituel : distance et altitude non comptées.
  const ailleurs = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: B, stade: 'Stade de France' });
  assert.equal(ailleurs.deplacement.stadeHabituel, false);
  assert.equal(ailleurs.deplacement.km, null);
  assert.equal(ailleurs.altitude.concerne, null);
  const habituel = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: B, stade: ` ${VENUES.clubs[`fotmob-${A}`].stade.toUpperCase()} ` });
  assert.equal(habituel.deplacement.stadeHabituel, true);
  assert.equal(habituel.deplacement.km, Math.round(attendu));
});

test('T-R11 l’enchaînement : le prochain match à moins de 96 h est « serré » ; quand J est une COUPE, le tour suivant de la MÊME compétition est ignoré (il n’est joué que si l’on passe celui-ci) — en championnat, le prochain match du championnat compte', () => {
  const ctx = nourri([]);
  const prochains = indexDesProchains([
    joue('2026-10-09', '19:00', A, C, { league: 'Copa Chile', coupe: true }),
    joue('2026-10-12', '19:00', A, D)
  ]);
  const coupe = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: B, league: 'Copa Chile' }, { prochains });
  assert.equal(coupe.enchainement.home.prochain.date, '2026-10-12', 'le tour suivant de la Copa Chile est ignoré');
  assert.equal(coupe.enchainement.home.serre, false);
  const ligue = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: B }, { prochains });
  assert.equal(ligue.enchainement.home.prochain.date, '2026-10-09');
  assert.equal(ligue.enchainement.home.prochain.league, 'Copa Chile');
  assert.equal(ligue.enchainement.home.prochain.coupe, true);
  assert.equal(ligue.enchainement.home.heures, 48);
  assert.equal(ligue.enchainement.home.serre, true);
  assert.equal(ligue.enchainement.away.prochain, null);
  assert.deepEqual(ligue.enchainement.away.mentions, ['aucun-prochain-connu']);
});

test('T-R12 l’altitude (stade à 2 000 m ou plus, visiteur d’en bas) et la pelouse (celle du match, sinon celle du stade habituel ; celle du visiteur chez lui)', () => {
  const haut = Number(HAUT[0].replace('fotmob-', ''));
  const synth = Number(SYNTH[0].replace('fotmob-', ''));
  const ctx = nourri([]);
  const f = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: haut, away: synth });
  assert.equal(f.altitude.stade, HAUT[1].altitude);
  assert.equal(f.altitude.visiteur, null);
  assert.equal(f.altitude.concerne, true);
  assert.equal(f.pelouse.visiteurHabitue, true, 'le visiteur joue sur synthétique chez lui');
  assert.deepEqual(F.altitudeDuMatch({ stade: 2850, visiteur: 2600 }), { stade: 2850, visiteur: 2600, concerne: false });
  assert.deepEqual(F.altitudeDuMatch({ stade: 1900, visiteur: null }), { stade: 1900, visiteur: null, concerne: false });
  const g = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: synth, away: A });
  assert.deepEqual([g.pelouse.surface, g.pelouse.source], ['synthetique', 'stade-habituel']);
  const h = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: synth, away: A, surface: 'grass' });
  assert.deepEqual([h.pelouse.surface, h.pelouse.source], ['naturelle', 'fotmob-match']);
  for (const [t, attendu] of [['artificial turf', 'synthetique'], ['Synthetic', 'synthetique'], ['hybrid', 'hybride'], ['Hybrid grass', 'hybride'], ['grass', 'naturelle'], ['', null], [null, null]]) assert.equal(F.pelouseDe(t), attendu, String(t));
});

test('T-R13 l’entraîneur au jour J : celui du DERNIER match d’avant J ; nouveau après un changement (5 matchs au plus) ; un intérim A → B → A ne fait pas d’A un « nouveau » ; l’identifiant FotMob prime sur le nom ; une ligne sans entraîneur ne coupe pas la suite', () => {
  const obs = (liste) => liste.map(([date, nom, id]) => ({ date, nom, id }));
  const change = F.entraineurAuJourJ(obs([['2026-08-01', 'A', 1], ['2026-08-08', 'A', 1], ['2026-08-15', 'B', 2], ['2026-08-22', 'B', 2]]));
  assert.deepEqual([change.nom, change.depuisMatchs, change.depuisLe, change.precedent.nom, change.nouveau], ['B', 2, '2026-08-15', 'A', true]);
  const interim = F.entraineurAuJourJ(obs([['2026-08-01', 'A', 1], ['2026-08-08', 'B', 2], ['2026-08-15', 'A', 1]]));
  assert.deepEqual([interim.nom, interim.depuisMatchs, interim.nouveau], ['A', 1, false]);
  const parId = F.entraineurAuJourJ(obs([['2026-08-01', 'Jean Durand', 7], ['2026-08-08', 'J. Durand', 7]]));
  assert.deepEqual([parId.depuisMatchs, parId.nouveau], [2, false], 'même identifiant, deux graphies : le même');
  const sixieme = F.entraineurAuJourJ(obs([['2026-01-01', 'A', 1], ...Array.from({ length: 6 }, (_, i) => [`2026-02-0${i + 1}`, 'B', 2])]));
  assert.deepEqual([sixieme.depuisMatchs, sixieme.nouveau], [6, false], 'au-delà de 5 matchs : plus « nouveau »');
  const trou = F.entraineurAuJourJ([{ date: '2026-08-01', nom: 'A', id: 1 }, { date: '2026-08-08', nom: null, id: null }, { date: '2026-08-15', nom: 'A', id: 1 }]);
  assert.equal(trou.depuisMatchs, 2, 'la ligne sans entraîneur est sautée');
  assert.deepEqual(F.entraineurAuJourJ([]), { connu: false, nom: null, id: null, depuisMatchs: null, depuisLe: null, precedent: null, nouveau: null });
  // Dans la passe : l'entraîneur est celui du dernier match d'avant J.
  const ctx = nourri([joue('2026-10-01', '19:00', A, B, { entraineurs: { home: { nom: 'Ancien', id: 11 }, away: null } }), joue('2026-10-04', '19:00', A, C, { entraineurs: { home: { nom: 'Nouveau', id: 12 }, away: null } })]);
  const f = fiche(ctx, { date: '2026-10-07', kickoff: '2026-10-07T19:00:00.000Z', kickoffConnu: true, home: A, away: D });
  assert.deepEqual([f.entraineur.home.nom, f.entraineur.home.id, f.entraineur.home.depuisMatchs, f.entraineur.home.precedent.nom, f.entraineur.home.nouveau], ['Nouveau', 12, 1, 'Ancien', true]);
});
