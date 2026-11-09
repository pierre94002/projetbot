/**
 * LES CONFRONTATIONS (étape 36, lot 1, 09/11/2026) — paires, doublons, issues, séances, règle d'après 90 minutes, contrôles :
 *   node --test test/coupesAppariement.test.mjs        (depuis server/)
 *
 *   T-A1 les paires par identifiants seulement (« Port » et « Portsmouth » jamais rapprochés) ; un identifiant nul jamais apparié ;
 *   T-A2 les rejouages (premier match nul) : jamais un aller-retour, jamais une unité ;
 *   T-A3 les doublons (même paire ordonnée, à un jour près) : un seul gardé (identifiant FotMob, puis déroulé, puis le plus récent) ;
 *   T-A4 issueDeLUnite, chaque ligne de la table (90 minutes, prolongation, séance, cumul égal sans prolongation, fin
 *        incohérente, attribué) ; l'avance vue du club qui REÇOIT le retour ;
 *   T-A5 la durée de jeu et la carte des tirs : séance directe, après prolongation, carton à la 121e (la règle du correctif
 *        en service : un événement après la 90e), cartes invalides ;
 *   T-A6 le tour suivant : une, les deux, aucune, une finale ; le désaccord avec la carte → null, nommé ;
 *   T-A7 l'observation du format = la fonction IMPORTÉE du correctif du règlement en service (la même réponse sur les mêmes
 *        entrées, jamais une copie) ; « direct » seulement sur un déroulé complet ; la majorité d'au moins 80 % d'au moins 3
 *        observations (pas l'unanimité) ; la hiérarchie des quatre règles ; rien du jour J ni d'après ;
 *   T-A8 les buts à l'extérieur : un CONTRÔLE (l'alerte à 3 cas), jamais une exclusion ;
 *   T-A9 les contrôles de la coupe-saison : le qualifié qui ne rejoue pas, nommé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/data/coupes/confrontations.js';
import * as T from '../src/data/coupes/toursDeCoupe.js';
import { quoiDeLaProlongation } from '../src/data/providers/settlementService.js';

const r = (date, home, away, tour, extra = {}) => ({ matchKey: extra.matchKey ?? `${date}|${home}|${away}`, fotmobId: extra.fotmobId === undefined ? `${date}${home}${away}` : extra.fotmobId, date, league: extra.league ?? 'L', home, away, tour, phase: extra.phase ?? 'X|Cup', hg: extra.hg ?? 1, ag: extra.ag ?? 0, fin: extra.fin ?? null, events: extra.events ?? null, shotmap: extra.shotmap ?? null, aDeroule: extra.aDeroule ?? false, updatedAt: extra.updatedAt ?? null, bp90: extra.bp90 ?? null, bc90: extra.bc90 ?? null, awarded: extra.awarded ?? false });
const complet = (plus = []) => [{ type: 'substitution', side: 'home', minute: 60 }, { type: 'substitution', side: 'away', minute: 65 }, ...plus];
const seance = (de, gagnant, n = 5) => {
  const tirs = [];
  for (let i = 0; i < n; i++) {
    tirs.push({ side: 'home', minute: de + i, situation: 'penalty', result: gagnant === 'away' && i === n - 1 ? 'attemptsaved' : 'goal' });
    tirs.push({ side: 'away', minute: de + i, situation: 'penalty', result: gagnant === 'home' && i === n - 1 ? 'attemptsaved' : 'goal' });
  }
  return tirs;
};

test('T-A1 — paires par identifiants seulement ; « Port » et « Portsmouth » jamais rapprochés ; un identifiant nul jamais apparié', () => {
  // Port (31) reçoit X (5), puis X reçoit Portsmouth (32) : deux clubs différents, jamais une paire.
  const bloc = { rencontres: [r('2026-01-10', 31, 5, '1/8'), r('2026-01-17', 5, 32, '1/8'), r('2026-01-10', 7, 8, '1/8'), r('2026-01-17', 8, 7, '1/8')] };
  const { paires } = T.pairesDuBloc(bloc);
  assert.deepEqual(paires.map((p) => `${p.aller.home}-${p.aller.away}`), ['7-8']);
  const nul = { rencontres: [r('2026-01-10', null, 5, '1/8'), r('2026-01-17', 5, null, '1/8')] };
  assert.equal(T.pairesDuBloc(nul).paires.length, 0, 'identifiant nul : jamais apparié');
  // Le doublonnage ne rapproche jamais une rencontre à identifiant nul.
  const d = C.dedoublonner([r('2026-01-10', null, 5, '1/8'), r('2026-01-10', null, 5, '1/8', { matchKey: 'autre' })]);
  assert.equal(d.rencontres.length, 2);
  assert.equal(d.doublons.length, 0);
  // Une équipe dans une seule paire du bloc : la plus proche dans le temps gagne, l'autre est comptée.
  const triple = { rencontres: [r('2026-01-01', 1, 2, '1/8'), r('2026-01-08', 2, 1, '1/8'), r('2026-01-20', 2, 1, '1/8')] };
  const t = T.pairesDuBloc(triple);
  assert.equal(t.paires.length, 1);
  assert.equal(t.paires[0].retour.date, '2026-01-08');
  assert.equal(t.rejetees, 1);
});

test('T-A2 — les rejouages (premier match nul) : un-match-rejouages, jamais un aller-retour, jamais une unité ; comptés', () => {
  const rencontres = [
    r('2024-01-06', 1, 2, '3', { hg: 1, ag: 1 }), r('2024-01-16', 2, 1, '3', { hg: 2, ag: 0 }),
    r('2024-01-06', 3, 4, '3', { hg: 0, ag: 0 }), r('2024-01-16', 4, 3, '3', { hg: 1, ag: 0 }),
    r('2024-01-06', 5, 6, '3', { hg: 2, ag: 1 }), r('2024-01-06', 7, 8, '3', { hg: 3, ag: 1 }),
    r('2024-01-27', 2, 4, '4'), r('2024-01-27', 5, 7, '4'), r('2024-02-24', 2, 5, '5')
  ];
  const cs = C.coupeSaison(rencontres, { league: 'L', saison: 2023, saisonTerminee: true, dernierJourLu: '2026-01-01' });
  const b3 = cs.blocs.find((b) => b.code === 'tour-3');
  assert.equal(cs.natures.get(b3.id).nature, 'un-match-rejouages');
  assert.equal(cs.rejouages, 2);
  assert.equal(cs.unites.filter((u) => u.bloc === b3.id).length, 0, 'aucune unité dans un bloc de rejouages');
  assert.ok(cs.rencontres.filter((x) => x.bloc.id === b3.id && x.role === 'rejouage').length === 4);
});

test('T-A3 — les doublons : même paire ordonnée à un jour près → un seul (identifiant FotMob, puis déroulé, puis le plus récent), compté', () => {
  const a = r('2025-01-11', 5, 12, '1/8', { fotmobId: null, matchKey: 'sans-id', aDeroule: true, updatedAt: '2025-01-13' });
  const b = r('2025-01-12', 5, 12, '1/8', { fotmobId: '777', matchKey: 'avec-id', aDeroule: false, updatedAt: '2025-01-12' });
  const c = r('2025-01-12', 12, 5, '1/8', { matchKey: 'inverse' });
  const d = C.dedoublonner([a, b, c]);
  assert.deepEqual(d.rencontres.map((x) => x.matchKey).sort(), ['avec-id', 'inverse']);
  assert.deepEqual(d.doublons.map((x) => [x.garde, x.ecarte]), [['avec-id', 'sans-id']]);
  // Sans identifiant FotMob des deux côtés : le déroulé, puis la mise à jour la plus récente.
  const e = C.dedoublonner([r('2025-01-11', 1, 2, '1', { fotmobId: null, matchKey: 'x', aDeroule: false, updatedAt: '2025-01-20' }), r('2025-01-11', 1, 2, '1', { fotmobId: null, matchKey: 'y', aDeroule: true, updatedAt: '2025-01-12' })]);
  assert.equal(e.rencontres[0].matchKey, 'y');
});

test('T-A4 — issueDeLUnite : chaque ligne de la table ; l’avance vue du club qui reçoit le retour', () => {
  const unite = (decisif, avance = 0, aller = null) => C.issueDeLUnite({ decisif, avance, aller });
  assert.deepEqual(unite(r('2026-01-10', 1, 2, '1', { hg: 2, ag: 1 })), { qualifie: 'dom', comment: '90', raison: null, seance: null });
  // Retour : le club qui reçoit (2) a perdu 2-0 à l'aller : avance −2 ; il gagne 2-1 : cumul −1 → l'autre se qualifie.
  assert.equal(unite(r('2026-01-17', 2, 1, '1', { hg: 2, ag: 1 }), -2).qualifie, 'ext');
  assert.deepEqual(unite(r('2026-01-17', 2, 1, '1', { hg: 2, ag: 0 }), -2), { qualifie: null, comment: null, raison: 'cumul-egal-sans-prolongation', seance: null });
  assert.deepEqual(unite(r('2026-01-17', 2, 1, '1', { hg: 3, ag: 0, fin: 'afterextra' }), -2), { qualifie: 'dom', comment: 'prolongation', raison: null, seance: null });
  assert.equal(unite(r('2026-01-17', 2, 1, '1', { hg: 2, ag: 0, fin: 'afterextra' }), -2).raison, 'fin-incoherente');
  assert.equal(unite(r('2026-01-17', 2, 1, '1', { hg: 3, ag: 0, fin: 'afterpenalties' }), -2).raison, 'fin-incoherente');
  const tab = unite(r('2026-01-17', 2, 1, '1', { hg: 1, ag: 1, fin: 'afterpenalties', events: complet(), shotmap: seance(91, 'away') }), 0);
  assert.deepEqual([tab.qualifie, tab.comment], ['ext', 'tab']);
  assert.equal(unite(r('2026-01-17', 2, 1, '1', { hg: 1, ag: 1, fin: 'afterpenalties' }), 0).raison, 'seance-inconnue');
  assert.equal(unite(r('2026-01-17', 2, 1, '1', { hg: 3, ag: 0, fin: 'awarded_win', awarded: true }), 0).raison, 'attribue-ou-non-joue');
  assert.equal(C.issueDeLUnite({ decisif: r('2026-01-17', 2, 1, '1', { hg: 1, ag: 0 }), avance: 0, aller: r('2026-01-10', 1, 2, '1', { hg: 3, ag: 0, fin: 'awarded_win', awarded: true }) }).raison, 'attribue-ou-non-joue');
  // L'avance d'une paire : aller 1 reçoit 2 (2-0) ; au retour, 2 reçoit : avance = 0 − 2 = −2 (vue du club qui reçoit).
  const cs = C.coupeSaison([r('2026-01-10', 1, 2, '1/4', { hg: 2, ag: 0 }), r('2026-01-17', 2, 1, '1/4', { hg: 3, ag: 0 }), r('2026-02-01', 2, 9, '1/2')], { league: 'L', saison: 2025, saisonTerminee: false, dernierJourLu: '2026-03-01' });
  const u = cs.unites.find((x) => x.nature === 'retour');
  assert.equal(u.avance, -2);
  assert.deepEqual([u.issue.qualifie, u.issue.comment], ['dom', '90']);
});

test('T-A5 — la durée de jeu et la carte des tirs : séance directe, après prolongation, carton à la 121e, cartes invalides', () => {
  // Séance directe : déroulé complet, rien après la 90e, les tirs en 91, 92… → D = 90, la carte décide.
  const direct = r('2025-01-11', 1, 2, '1/8', { hg: 1, ag: 1, fin: 'afterpenalties', events: complet(), shotmap: seance(91, 'home') });
  assert.equal(C.dureeDeJeu(direct), 90);
  assert.equal(C.vainqueurParLaCarte(direct.shotmap, 90), 'dom');
  // Après prolongation : un remplacement à la 101e, les tirs après la 120e → D = 120.
  const apres = r('2025-04-17', 1, 2, '1/4', { hg: 1, ag: 0, fin: 'afterpenalties', events: complet([{ type: 'substitution', side: 'home', minute: 101 }]), shotmap: seance(121, 'away') });
  assert.equal(C.dureeDeJeu(apres), 120);
  assert.equal(C.vainqueurParLaCarte(apres.shotmap, 120), 'ext');
  // Un penalty de la prolongation (105e) lu comme un tir de séance fausserait la carte : D = 120 l’écarte.
  const avecPenaltyDeJeu = [{ side: 'home', minute: 105, situation: 'penalty', result: 'goal' }, ...apres.shotmap];
  assert.equal(C.vainqueurParLaCarte(avecPenaltyDeJeu, 120), 'ext');
  assert.equal(C.vainqueurParLaCarte(avecPenaltyDeJeu, 90), null, 'lue depuis la 90e : 11 tirs, 5 buts de chaque côté — plus une séance valide');
  // Un carton à la 121e d'une séance directe : la règle du correctif en service dit « un événement après la 90e » → 120 ;
  // la carte lue après la 120e est vide : pas de vainqueur par la carte (le tour suivant décide).
  const carton = r('2025-02-08', 1, 2, '1/4', { hg: 0, ag: 0, fin: 'afterpenalties', events: complet([{ type: 'card', side: 'away', minute: 121, card: 'yellow' }]), shotmap: seance(91, 'away') });
  assert.equal(C.dureeDeJeu(carton), 120);
  assert.equal(C.vainqueurParLaCarte(carton.shotmap, C.dureeDeJeu(carton)), null);
  // Indéterminée (déroulé de buts seuls) : la carte elle-même dit où commence la séance.
  assert.equal(C.dureeDeJeu(r('x', 1, 2, '1', { fin: 'afterpenalties', events: [{ type: 'goal', side: 'home', minute: 10 }], shotmap: seance(121, 'home') })), 120);
  assert.equal(C.dureeDeJeu(r('x', 1, 2, '1', { fin: 'afterpenalties', events: null, shotmap: seance(91, 'home') })), 90);
  // Cartes invalides : moins de 6 tirs, déséquilibre, buts égaux.
  assert.equal(C.vainqueurParLaCarte(seance(91, 'home', 2), 90), null, 'moins de 6 tirs');
  const desequilibre = [...seance(91, 'home'), { side: 'home', minute: 96, situation: 'penalty', result: 'goal' }, { side: 'home', minute: 97, situation: 'penalty', result: 'goal' }];
  assert.equal(C.vainqueurParLaCarte(desequilibre, 90), null, 'écart de plus d’un tir');
  const egal = seance(91, 'home').map((s) => ({ ...s, result: 'goal' }));
  assert.equal(C.vainqueurParLaCarte(egal, 90), null, 'buts égaux');
});

test('T-A6 — le tour suivant : une, les deux, aucune, une finale ; le désaccord avec la carte → null, nommé', () => {
  const d = r('2026-01-10', 1, 2, '1/8', { hg: 1, ag: 1, fin: 'afterpenalties', events: complet(), shotmap: seance(91, 'home') });
  const suivant = (rencontres) => [{ id: 'b', code: '1/4', from: '2026-02-01', rencontres }];
  assert.equal(C.vainqueurParLeTourSuivant(d, suivant([r('2026-02-01', 1, 9, '1/4')])), 'dom');
  assert.equal(C.vainqueurParLeTourSuivant(d, suivant([r('2026-02-01', 1, 9, '1/4'), r('2026-02-01', 2, 8, '1/4')])), null, 'les deux');
  assert.equal(C.vainqueurParLeTourSuivant(d, suivant([r('2026-02-01', 7, 9, '1/4')])), null, 'aucune');
  assert.equal(C.vainqueurParLeTourSuivant(d, []), null, 'une finale : rien après');
  assert.equal(C.vainqueurParLeTourSuivant(d, [{ id: 'c', code: '3e-place', from: '2026-02-01', rencontres: [r('2026-02-01', 1, 9, 'bronze')] }]), null, 'la 3e place ne compte pas');
  const i = C.issueDeLUnite({ decisif: d, avance: 0 }, suivant([r('2026-02-01', 2, 9, '1/4')]));
  assert.deepEqual([i.qualifie, i.raison, i.seance.carte, i.seance.suite], [null, 'desaccord-carte-tour-suivant', 'dom', 'ext']);
});

test('T-A7 — le format : la fonction IMPORTÉE du correctif en service, « direct » sur un déroulé complet, la majorité de 80 % (pas l’unanimité), la hiérarchie, rien du jour J', () => {
  // La même réponse que le correctif du règlement, sur les mêmes entrées (une seule définition).
  const cas = [
    { fin: 'afterextra', events: [] },
    { fin: 'afterpenalties', events: complet() },
    { fin: 'afterpenalties', events: complet([{ type: 'goal', side: 'home', minute: 105 }]) },
    { fin: 'afterpenalties', events: complet([{ type: 'card', side: 'away', minute: 95 }]) }
  ];
  for (const x of cas) {
    const q = quoiDeLaProlongation(x.fin, x.events);
    const o = C.observationDuFormat(x);
    assert.equal(o, q === 'tirs au but' ? 'direct' : 'prolongation', JSON.stringify(x));
  }
  // « direct » seulement sur un déroulé complet ; sans déroulé, une séance est indéterminée.
  assert.equal(C.observationDuFormat({ fin: 'afterpenalties', events: [{ type: 'goal', side: 'home', minute: 10 }] }), 'indetermine');
  assert.equal(C.observationDuFormat({ fin: 'afterpenalties', events: null }), 'indetermine');
  assert.equal(C.observationDuFormat({ fin: null, events: [] }), null);
  // La majorité : 4 directs et 1 prolongation (un carton de séance) → direct ; 3 et 2 → mixte ; moins de 3 → la saison d'avant.
  const o = (saison, date, observation, nature = 'match-unique') => ({ league: 'L', saison, nature, date, observation });
  const quatreUn = [o(2025, '2026-01-01', 'direct'), o(2025, '2026-01-02', 'direct'), o(2025, '2026-01-03', 'direct'), o(2025, '2026-01-04', 'direct'), o(2025, '2026-01-05', 'prolongation')];
  assert.equal(C.formatAuJourJ(quatreUn, { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' }).valeur, 'direct');
  assert.equal(C.formatAuJourJ([...quatreUn, o(2025, '2026-01-06', 'prolongation')], { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' }).valeur, 'mixte');
  const precedente = C.formatAuJourJ([o(2025, '2026-01-01', 'direct'), o(2024, '2025-01-01', 'prolongation'), o(2024, '2025-01-02', 'prolongation'), o(2024, '2025-01-03', 'prolongation')], { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' });
  assert.deepEqual([precedente.valeur, precedente.source, precedente.saison], ['prolongation', 'saison-precedente', 2024]);
  // La dernière saison ANTÉRIEURE (jamais une saison future).
  const anterieure = C.formatAuJourJ([o(2022, '2023-01-01', 'direct'), o(2022, '2023-01-02', 'direct'), o(2022, '2023-01-03', 'direct'), o(2026, '2027-01-01', 'prolongation'), o(2026, '2027-01-02', 'prolongation'), o(2026, '2027-01-03', 'prolongation')], { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' });
  assert.deepEqual([anterieure.valeur, anterieure.source, anterieure.saison], ['direct', 'saison-anterieure', 2022]);
  assert.equal(C.formatAuJourJ([], { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' }).valeur, 'inconnu');
  // Rien du jour J ni d'après : trois observations du jour J ne comptent pas.
  const duJour = [o(2025, '2026-02-01', 'prolongation'), o(2025, '2026-02-01', 'prolongation'), o(2025, '2026-02-01', 'prolongation')];
  assert.equal(C.formatAuJourJ(duJour, { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' }).valeur, 'inconnu');
});

test('T-A8 — les buts à l’extérieur : un CONTRÔLE (alerte à 3 cas), jamais une exclusion', () => {
  const paire = (k, egal) => [r(`2025-08-0${k}`, 10 + k, 20 + k, 'final', { hg: 1, ag: 0 }), r(`2025-08-1${k}`, 20 + k, 10 + k, 'final', { hg: egal ? 1 : 2, ag: 0 })];
  const un = C.coupeSaison([...paire(1, true), ...paire(2, false)], { league: 'L', saison: 2025, saisonTerminee: false, dernierJourLu: '2026-01-01' });
  const c1 = C.controlesDeLaCoupeSaison(un);
  assert.equal(c1.butsExterieur.cas, 1);
  assert.equal(c1.butsExterieur.alerte, false);
  const trois = C.coupeSaison([...paire(1, true), ...paire(2, true), ...paire(3, true)], { league: 'L', saison: 2025, saisonTerminee: false, dernierJourLu: '2026-01-01' });
  const c3 = C.controlesDeLaCoupeSaison(trois);
  assert.equal(c3.butsExterieur.cas, 3);
  assert.equal(c3.butsExterieur.alerte, true);
  // Jamais une exclusion de la compétition-saison : les autres retours restent des unités à l'issue connue.
  assert.equal(un.unites.filter((u) => u.issue.qualifie).length, 1);
});

test('T-A9 — les contrôles de la coupe-saison : un qualifié qui ne rejoue pas au tour suivant est nommé ; l’accord carte / tour suivant compté', () => {
  const rencontres = [
    r('2026-01-10', 1, 2, '1/8', { hg: 2, ag: 0 }), r('2026-01-10', 3, 4, '1/8', { hg: 3, ag: 1 }),
    r('2026-01-10', 5, 6, '1/8', { hg: 1, ag: 1, fin: 'afterpenalties', events: complet(), shotmap: seance(91, 'home') }),
    r('2026-01-10', 7, 8, '1/8', { hg: 0, ag: 1 }),
    // Le tour suivant : 1, 3 (et non 4 : planté pour l'écart), 5, 8 — mais 4 joue À LA PLACE de 3.
    r('2026-02-07', 1, 4, '1/4'), r('2026-02-07', 5, 8, '1/4')
  ];
  const cs = C.coupeSaison(rencontres, { league: 'L', saison: 2025, saisonTerminee: false, dernierJourLu: '2026-03-01' });
  const c = C.controlesDeLaCoupeSaison(cs);
  assert.equal(c.qualifieRejoue.n, 3);
  assert.equal(c.qualifieRejoue.ok, 2);
  assert.deepEqual(c.qualifieRejoue.ecarts.map((e) => e.matchKey), ['2026-01-10|3|4']);
  assert.deepEqual([c.accordCarte.n, c.accordCarte.ok], [1, 1]);
  assert.ok(c.verifications.some((v) => v.cle === '2026-01-10|3|4' && v.qualifieRejoue === false));
});
