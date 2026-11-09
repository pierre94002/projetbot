/**
 * LES TOURS DES COUPES (étape 36, lot 1, 09/11/2026) — couches 1 et 2, familles de phase, natures :
 *   node --test test/coupesTours.test.mjs        (depuis server/)
 *
 *   T-T1 les blocs refaits (blocsCommeCupBracket) = ceux de cupBracket (matchStatsRead.js), sur test/fixtures/echantillon.db
 *        (chaque coupe, chaque saison présentes) et sur le magasin fabriqué (aides/coupesFabrique.mjs) ;
 *   T-T2 tourNormalise sur la liste RÉELLE des 35 intitulés de la base du bac (relevée le 09/11/2026) ; un inconnu reste
 *        `brut:` et n'est jamais fusionné avec un autre ;
 *   T-T3 « 1/4 » à l'aller, « Quarter-finals » au retour → un bloc, une paire ; le même code à plus de 40 jours → deux blocs ;
 *   T-T4 la qualification « 3 » de mars et la 3e journée de groupe d'avril, chaînées : COUPÉES par famille ;
 *   T-T5 les natures dans l'ordre corrigé (critique, constat 4) : la « final » d'août → aller-retour, « Dernier tour de
 *        qualification » ; la finale de mai → finale ; la 3e place jouée le jour de la finale → troisieme-place (la finale
 *        reste la finale) ; un tour préliminaire de fin juin jamais pris pour la finale ; les rejouages ; la phase de ligue ;
 *        la suite pas encore jouée → ambigu-fin-des-donnees ;
 *   T-T6 la table des tours de l'écran (fotmobLabels.TOURS_DE_COUPE) = celle du serveur (TOURS), sur la liste réelle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp } from './aides/rendu.mjs';
import * as T from '../src/data/coupes/toursDeCoupe.js';
import { TOURS } from '../src/data/coupes/reglagesCoupes.js';
import { rencontresFabriquees } from './aides/coupesFabrique.mjs';

/** Les 35 intitulés distincts des 24 coupes de la base du bac (partie 0 de l'écriture, 09/11/2026), et leur code attendu. */
export const INTITULES_REELS = Object.freeze({
  1: 'tour-1', 2: 'tour-2', 3: 'tour-3', 4: 'tour-4', 5: 'tour-5', 6: 'tour-6', 7: 'tour-7', 8: 'tour-8',
  '1/8': '1/8', '1/16': '1/16', final: 'final', '1/4': '1/4', '1/32': '1/32', '1/2': '1/2', '1/64': '1/64',
  '1st Round': 'tour-1', '2nd Round': 'tour-2', '3rd Round': 'tour-3', '4th Round': 'tour-4', '5th Round': 'tour-5',
  '8th Finals': '1/8', '16th Finals': '1/16', 'Quarter-finals': '1/4', 'Semi-finals': '1/2', Final: 'final',
  'Group Stage - Round 1': 'groupe-1', 'Group Stage - Round 2': 'groupe-2', 'Group Stage - Round 3': 'groupe-3',
  'Group Stage - Round 4': 'groupe-4', 'Group Stage - Round 5': 'groupe-5', 'Group Stage - Round 6': 'groupe-6',
  'Knockout Round Play-offs': 'barrage', 'Preliminary Round': 'preliminaire', bronze: '3e-place', Bronze: '3e-place'
});

const r = (date, home, away, tour, extra = {}) => ({ matchKey: `${date}|${home}|${away}`, fotmobId: null, date, league: 'L', home, away, tour, phase: extra.phase ?? 'X|Cup', hg: extra.hg ?? 1, ag: extra.ag ?? 0, fin: extra.fin ?? null, ...extra });

test('T-T1 — les blocs refaits = ceux de cupBracket : sur echantillon.db (chaque coupe, chaque saison) et sur le magasin fabriqué', () => {
  for (const [base, phase] of [[true, 'echantillon'], [false, 'nuit']]) {
    const c = preparerCopie({ base });
    try {
      const x = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: [phase, '{}'], timeout: 300_000 });
      assert.equal(x.code, 0, `script-coupes ${phase} :\n${x.erreurs.slice(-3000)}`);
      assert.equal(x.reseau, false);
      assert.ok(x.json.tT1.length >= (base ? 20 : 7), `${phase} : ${x.json.tT1.length} coupes-saisons comparées`);
      for (const y of x.json.tT1) assert.ok(y.egaux, `${phase} : ${y.league} ${y.saison} — ${y.miens} blocs refaits face à ${y.siens}`);
    } finally {
      c.nettoyer();
    }
  }
  // La règle de cupBracket elle-même, sur des rencontres faites à la main : l'écart se mesure depuis la DERNIÈRE rencontre
  // du bloc (une chaîne à 0, 30 et 60 jours = un bloc) ; 41 jours après la dernière, un autre bloc.
  const m = (date, i) => ({ matchKey: `m${i}`, fotmobId: `${i}`, date, tour: 'Round 1' });
  assert.deepEqual(T.blocsCommeCupBracket([m('2025-01-01', 1), m('2025-01-31', 2), m('2025-03-02', 3)]).map((b) => b.rencontres.length), [3]);
  assert.deepEqual(T.blocsCommeCupBracket([m('2025-01-01', 1), m('2025-02-11', 2)]).map((b) => b.from), ['2025-01-01', '2025-02-11']);
  assert.deepEqual(T.blocsCommeCupBracket([m('2025-01-01', 1), m('2025-02-10', 2)]).length, 1, '40 jours : le même bloc');
});

test('T-T2 — tourNormalise sur les 35 intitulés réels ; un inconnu reste « brut: » et n’est jamais fusionné avec un autre', () => {
  for (const [intitule, code] of Object.entries(INTITULES_REELS)) assert.equal(T.tourNormalise(intitule), code, intitule);
  assert.equal(T.tourNormalise(null), 'brut:Tour inconnu');
  assert.equal(T.tourNormalise('  Quarter-Finals '), '1/4');
  assert.equal(T.tourNormalise('Round 3'), 'tour-3');
  assert.equal(T.tourNormalise('Coupe des Clubs'), 'brut:Coupe des Clubs');
  // Deux inconnus différents dans le même mois : deux blocs, jamais un.
  const blocs = T.blocsDeLaCoupe([r('2025-03-01', 1, 2, 'Truc'), r('2025-03-02', 3, 4, 'Machin')]);
  assert.deepEqual(blocs.map((b) => b.code).sort(), ['brut:Machin', 'brut:Truc']);
  assert.equal(T.libelleDuTour('brut:Truc'), 'Truc');
  assert.equal(T.libelleDuTour('tour-1'), '1er tour');
  assert.equal(T.libelleDuTour('tour-4'), '4e tour');
  assert.equal(T.libelleDuTour('groupe-3'), 'Phase de groupes, journée 3');
});

test('T-T3 — « 1/4 » à l’aller et « Quarter-finals » au retour (22 jours) : un bloc, une paire ; le même code à plus de 40 jours : deux blocs', () => {
  const blocs = T.blocsDeLaCoupe([r('2026-04-01', 1, 2, '1/4'), r('2026-04-02', 3, 4, '1/4'), r('2026-04-23', 2, 1, 'Quarter-finals'), r('2026-04-23', 4, 3, 'Quarter-finals')]);
  assert.equal(blocs.length, 1);
  assert.equal(blocs[0].code, '1/4');
  assert.equal(T.pairesDuBloc(blocs[0]).paires.length, 2);
  // La couche 1 (cupBracket) en fait deux : l'intitulé brut diffère.
  assert.equal(T.blocsCommeCupBracket([r('2026-04-01', 1, 2, '1/4'), r('2026-04-23', 2, 1, 'Quarter-finals')]).length, 2);
  const deux = T.blocsDeLaCoupe([r('2026-01-10', 1, 2, '1/8'), r('2026-03-01', 3, 4, '1/8')]);
  assert.equal(deux.length, 2, 'à 50 jours : deux tours');
  // La chaîne se mesure depuis la DERNIÈRE rencontre du bloc (jamais la première).
  const chaine = T.blocsCommeCupBracket([r('2026-01-01', 1, 2, '3'), r('2026-02-05', 3, 4, '3'), r('2026-03-10', 5, 6, '3')]);
  assert.equal(chaine.length, 1, '35 puis 33 jours : un seul bloc en chaîne');
});

test('T-T4 — la qualification « 3 » (mars) et la 3e journée de groupe (avril) chaînées : coupées par famille ; les qualifications appariées, les groupes jamais', () => {
  const rencontres = [
    r('2026-03-03', 1, 2, '3', { phase: 'INT|Copa Libertadores Qualification' }),
    r('2026-03-10', 2, 1, '3', { phase: 'INT|Copa Libertadores Qualification' }),
    r('2026-04-08', 5, 6, '3', { phase: 'INT|Copa Libertadores Grp. A' }),
    r('2026-04-08', 7, 8, '3', { phase: 'INT|Copa Libertadores Grp. A' }),
    r('2026-04-15', 6, 5, '4', { phase: 'INT|Copa Libertadores Grp. A' })
  ];
  assert.equal(T.blocsCommeCupBracket(rencontres).filter((b) => b.intitule === '3').length, 1, 'couche 1 : un seul bloc « 3 »');
  const blocs = T.blocsDeLaCoupe(rencontres);
  const trois = blocs.filter((b) => b.code === 'tour-3');
  assert.deepEqual(trois.map((b) => b.famille).sort(), ['groupes', 'qualification']);
  const natures = T.naturesDesBlocs(blocs, { saisonTerminee: false, dernierJourLu: '2026-04-20' });
  const q = trois.find((b) => b.famille === 'qualification');
  const g = trois.find((b) => b.famille === 'groupes');
  assert.equal(natures.get(q.id).nature, 'aller-retour');
  assert.equal(natures.get(g.id).nature, 'groupe');
  assert.equal(T.familleDeLaPhase('GRE|Cup Preliminary Round'), 'qualification');
  assert.equal(T.familleDeLaPhase('INT|Leagues Cup East Grp. 1'), 'groupes');
  assert.equal(T.familleDeLaPhase('INT|Champions League'), 'autre');
});

test('T-T5 — les natures dans l’ordre corrigé : « final » d’août, finale, 3e place le même jour, préliminaire de fin juin, rejouages, phase de ligue, fin des données', () => {
  const { rencontres } = rencontresFabriquees();
  const saison = (league, de, a) => rencontres.filter((x) => x.league === league && x.date >= de && x.date < a).map((x) => ({ ...x, tour: x.round }));
  // La Ligue Europa 2025 : la « final » d'août (aller-retour) ; la phase de ligue (« 1 » à « 4 », clé nue) ; les quarts pas finis.
  const uel = T.blocsDeLaCoupe(saison('UEFA Europa League', '2025-07-01', '2026-07-01'));
  const nUel = T.naturesDesBlocs(uel, { saisonTerminee: false, dernierJourLu: '2026-04-11' });
  const aout = uel.find((b) => b.code === 'final');
  assert.equal(nUel.get(aout.id).nature, 'aller-retour');
  assert.equal(T.libelleDuTour('final', { rencontres: aout.rencontres.length }), 'Dernier tour de qualification');
  for (const j of ['tour-1', 'tour-2', 'tour-3', 'tour-4']) assert.equal(nUel.get(uel.find((b) => b.code === j).id).nature, 'groupe', j);
  assert.equal(nUel.get(uel.find((b) => b.code === '1/4').id).nature, 'ambigu-fin-des-donnees');
  // La Ligue Europa 2024 : la finale de mai, seule, neutre.
  const uel24 = T.blocsDeLaCoupe(saison('UEFA Europa League', '2024-07-01', '2025-07-01'));
  const n24 = T.naturesDesBlocs(uel24, { saisonTerminee: true, dernierJourLu: '2026-04-11' });
  assert.equal(n24.get(uel24.find((b) => b.code === 'final').id).nature, 'finale');
  assert.equal(T.libelleDuTour('final', { rencontres: 1 }), 'Finale');
  // Leagues Cup 2025 : la 3e place jouée le jour de la finale → troisieme-place ; la finale reste la finale.
  const lc = T.blocsDeLaCoupe(saison('Leagues Cup', '2025-01-01', '2026-01-01'));
  const nLc = T.naturesDesBlocs(lc, { saisonTerminee: true, dernierJourLu: '2026-04-11' });
  assert.equal(nLc.get(lc.find((b) => b.code === '3e-place').id).nature, 'troisieme-place');
  assert.equal(nLc.get(lc.find((b) => b.code === 'final').id).nature, 'finale');
  for (const j of ['tour-1', 'tour-2', 'tour-3']) assert.equal(nLc.get(lc.find((b) => b.code === j).id).nature, 'groupe', j);
  // FA Cup 2023 : deux paires à premier match nul → rejouages (jamais un aller-retour).
  const fa = T.blocsDeLaCoupe(saison('FA Cup - England', '2023-07-01', '2024-07-01'));
  const nFa = T.naturesDesBlocs(fa, { saisonTerminee: true, dernierJourLu: '2026-04-11' });
  assert.equal(nFa.get(fa.find((b) => b.code === 'tour-3').id).nature, 'un-match-rejouages');
  // Un tour préliminaire de fin juin, APRÈS la finale de mai, dans la même saison : jamais pris pour la finale.
  const finJuin = [
    r('2025-05-01', 1, 2, '1/2'), r('2025-05-01', 3, 4, '1/2'), r('2025-05-08', 2, 1, '1/2'), r('2025-05-08', 4, 3, '1/2'),
    r('2025-05-28', 1, 3, 'final', { hg: 2, ag: 1 }),
    r('2025-06-25', 8, 9, 'final', { phase: 'INT|Champions League Qualification' })
  ];
  const fj = T.blocsDeLaCoupe(finJuin);
  const nFj = T.naturesDesBlocs(fj, { saisonTerminee: true, dernierJourLu: '2026-04-11' });
  assert.equal(nFj.get(fj.find((b) => b.from === '2025-05-28').id).nature, 'finale');
  assert.notEqual(nFj.get(fj.find((b) => b.from === '2025-06-25').id).nature, 'finale');
});

test('T-T6 — la table des tours de l’écran (fotmobLabels.TOURS_DE_COUPE) = celle du serveur (TOURS), sur la liste réelle', async () => {
  const L = await imp(path.join(UI, 'src', 'utils', 'fotmobLabels.js'));
  assert.deepEqual(JSON.parse(JSON.stringify(L.TOURS_DE_COUPE)), JSON.parse(JSON.stringify(TOURS)));
  for (const intitule of Object.keys(INTITULES_REELS)) {
    const s = T.tourNormalise(intitule);
    const u = L.tourDeCoupe(intitule);
    if (TOURS.some((t) => t.code === s)) assert.equal(u?.code, s, intitule);
    else assert.equal(u, null, intitule);
    assert.equal(L.cleDuTour(intitule), T.cleDuTexte(intitule));
  }
});
