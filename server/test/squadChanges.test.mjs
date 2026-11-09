/**
 * LES ARRIVÉES, LES DÉPARTS, LA CONTINUITÉ ET LA FORCE DE L'EFFECTIF (étape 35, lot 1a, 09/11/2026 ; data/db/squadChanges.js,
 * pur) — par IDENTIFIANT de joueur, jamais un nom :
 *   T-S1  resté, parti (vu ailleurs), pas revu, arrivé ; le seuil (29,9 % non, 30 % oui) ; un arrivé « qui compte » après 2
 *         matchs du club seulement ;
 *   T-S2  jamais « parti » sans des minutes pour un AUTRE club depuis le premier jour de la saison du club ; vu ailleurs AVANT
 *         ce jour : pas « parti » ;
 *   T-S3  l'identifiant 0 et les lignes sans identifiant : jamais comptés ; leur part des minutes rendue ;
 *   T-S4  même date de naissance et même poste → un double POSSIBLE, jamais une fusion (la continuité les compte tels quels) ;
 *   T-S5  la continuité : minutes de la saison par des joueurs de la saison d'avant ÷ toutes ; nulle avant le 1er match ;
 *   T-S6  la force de l'effectif : somme pondérée par les minutes, mêmes fiches, sans fiche = 0 et compté ; rien avant 2 matchs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesParJoueur, referenceDeLaSaison, mouvementsDeLEffectif, continuiteDe, forceDeLEffectif, joueurValide } from '../src/data/db/squadChanges.js';
import { DebutsAuJourJ, passerLesRencontres } from '../src/data/debutsDeSaison/debutsAuJourJ.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { magasinFabrique } from './aides/debutsFabrique.mjs';

const M = (o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

test('T-S1 resté, parti vu ailleurs, pas revu, arrivé ; le seuil de 30 % ; un arrivé « qui compte » après 2 matchs', () => {
  // saison d'avant : 10 matchs (900 minutes possibles) ; 270 = 30 % exactement ; 269 = 29,9 %
  const ref = referenceDeLaSaison(M({ 1: 900, 2: 270, 3: 269, 4: 600, 5: 450 }), 10, 0.3);
  assert.deepEqual([...ref.keys()].sort((a, b) => a - b), [1, 2, 4, 5], '29,9 % non, 30 % oui');
  const mv = mouvementsDeLEffectif({ reference: ref, saison: M({ 1: 180, 9: 120, 10: 30 }), avantClub: M({ 1: 900, 2: 270, 3: 269, 4: 600, 5: 450 }), ailleurs: M({ 4: { club: 77, date: '2024-08-20' } }), matchsSaison: 2, avantAilleurs: M({ 9: 66 }) });
  assert.deepEqual(mv.restes.map((x) => x.joueur), [1]);
  assert.deepEqual(mv.partisVusAilleurs.map((x) => [x.joueur, x.club, x.date]), [[4, 77, '2024-08-20']]);
  assert.deepEqual(mv.pasRevus.map((x) => x.joueur), [2, 5]);
  assert.deepEqual(mv.arrives.map((x) => [x.joueur, x.quiCompte, x.dOu?.club ?? null]), [[9, true, 66], [10, false, null]], '120/180 = 67 % après 2 matchs : qui compte ; vu la saison passée au club 66');
  const un = mouvementsDeLEffectif({ reference: ref, saison: M({ 9: 90 }), matchsSaison: 1 });
  assert.equal(un.arrives[0].quiCompte, false, 'un seul match du club : jamais « qui compte »');
  // 3 a joué pour le club la saison d'avant (sous le seuil) : jamais un « arrivé »
  const tr = mouvementsDeLEffectif({ reference: ref, saison: M({ 3: 90 }), avantClub: M({ 3: 269 }), matchsSaison: 2 });
  assert.equal(tr.arrives.length, 0);
});

test('T-S2 jamais « parti » sans des minutes pour un autre club depuis le premier jour de la saison du club', () => {
  const d = new DebutsAuJourJ({ avecForces: false });
  const passe = (rencontres) => executerSansPause(passerLesRencontres(d, rencontres, {}));
  const r = (date, league, home, away, joueurs) => ({ cle: `${date}|${home}|${away}`, date, league, saison: 0, home, away, attribue: false, prolongation: false, compte: true, coupe: false, aScore90: true, buts90: null, faitDom: null, joueurs });
  passe([r('2024-05-10', 'EPL', 1, 2, [{ joueur: 500, club: 2, minutes: 90 }]), r('2024-08-20', 'EPL', 1, 3, [{ joueur: 600, club: 3, minutes: 90 }])]);
  // 500 a joué pour 2 AVANT le premier jour de la saison 2024-25 du club 1 : pas « vu ailleurs » depuis ce jour
  assert.equal(d.vuAilleurs(500, 1, '2024-08-01'), null);
  assert.deepEqual(d.vuAilleurs(600, 1, '2024-08-01'), { club: 3, date: '2024-08-20' });
  assert.equal(d.vuAilleurs(600, 3, '2024-08-01'), null, 'son propre club ne compte pas');
  const mv = mouvementsDeLEffectif({ reference: M({ 500: 900 }), saison: new Map(), ailleurs: new Map(), matchsSaison: 2 });
  assert.equal(mv.partisVusAilleurs.length, 0);
  assert.equal(mv.pasRevus[0].joueur, 500, 'sans preuve : « pas revu », jamais « parti »');
});

test('T-S3 l’identifiant 0 et les lignes sans identifiant : jamais comptés, leur part rendue', () => {
  const m = minutesParJoueur([{ joueur: 0, minutes: 90 }, { joueur: null, minutes: 45 }, { joueur: 'fotmob-12', minutes: 30 }, { joueur: 12, minutes: 90 }, { joueur: 13, minutes: 0 }]);
  assert.deepEqual([...m.parJoueur.entries()], [[12, 90]]);
  assert.equal(m.ecartees, 165);
  assert.equal(m.total, 255);
  assert.equal(joueurValide(0), false);
  assert.equal(continuiteDe(M({ 0: 900, 12: 90 }), new Set([0, 12])), 1, 'l’identifiant 0 n’entre jamais dans la continuité');
  // ni au numérateur ni au dénominateur : ses 900 minutes, si elles comptaient, feraient 90 / 990
  assert.equal(continuiteDe(M({ 0: 900, 12: 90 }), new Set([12])), 1, 'l’identifiant 0 n’entre jamais dans la continuité (dénominateur)');
  // la passe ne range jamais l'identifiant 0
  const d = new DebutsAuJourJ({ avecForces: false });
  executerSansPause(passerLesRencontres(d, [{ cle: 'x', date: '2024-08-17', league: 'EPL', saison: 2024, home: 1, away: 2, attribue: false, prolongation: false, compte: true, coupe: false, aScore90: true, buts90: null, faitDom: null, joueurs: [{ joueur: 0, club: 1, minutes: 90 }, { joueur: 7, club: 1, minutes: 90 }] }], {}));
  assert.deepEqual([...d.minutesDuClub(1, 2024).joueurs.keys()], [7]);
});

test('T-S4 même date de naissance et même poste : un double POSSIBLE, jamais une fusion', () => {
  const mv = mouvementsDeLEffectif({ reference: M({ 3015: 900 }), saison: M({ 3099: 180 }), matchsSaison: 2, naissances: M({ 3015: '2001-04-02', 3099: '2001-04-02' }), postes: M({ 3015: 3, 3099: 3 }) });
  assert.deepEqual(mv.doublesPossibles.map((x) => [x.pasRevu, x.arrive]), [[3015, 3099]]);
  assert.equal(mv.pasRevus[0].joueur, 3015, 'le « pas revu » reste absent');
  assert.equal(mv.arrives[0].joueur, 3099, 'l’« arrivé » reste nouveau');
  assert.equal(continuiteDe(M({ 3099: 180, 1: 180 }), new Set([3015, 1])), 0.5, 'la continuité les compte tels quels, par identifiant');
  const autrePoste = mouvementsDeLEffectif({ reference: M({ 3015: 900 }), saison: M({ 3099: 180 }), matchsSaison: 2, naissances: M({ 3015: '2001-04-02', 3099: '2001-04-02' }), postes: M({ 3015: 3, 3099: 4 }) });
  assert.equal(autrePoste.doublesPossibles.length, 0);
});

test('T-S5 la continuité : minutes de la saison par des joueurs de la saison d’avant ÷ toutes ; nulle avant le 1er match et sans saison d’avant', () => {
  assert.equal(continuiteDe(M({ 1: 90, 2: 90, 3: 90, 4: 90 }), new Set([1, 2, 3])), 0.75);
  assert.equal(continuiteDe(new Map(), new Set([1])), null);
  assert.equal(continuiteDe(M({ 1: 90 }), new Set()), null);
  // par la passe, sur le magasin fabriqué : toutes compétitions, les feuilles d'avant J seulement
  const d = new DebutsAuJourJ({ avecForces: false });
  const vus = [];
  executerSansPause(
    passerLesRencontres(d, magasinFabrique(), {
      avant: (jour, duJour) => {
        for (const r of duJour) {
          if (r.home !== 1 || r.league !== 'EPL' || jour < '2024-07-01' || jour > '2025-06-30') continue;
          const s = d.minutesDuClub(1, 2024);
          const av = d.minutesDuClub(1, 2023);
          vus.push({ jour, c: s && av ? continuiteDe(s.joueurs, new Set(av.joueurs.keys())) : null, matchs: s?.matchs ?? 0 });
        }
      }
    })
  );
  assert.ok(vus.length >= 3);
  assert.equal(vus[0].matchs, 1, 'le 1er match d’EPL : la coupe de juillet a déjà une feuille');
  assert.ok(vus.every((v) => v.c === null || (v.c > 0.8 && v.c <= 1)), JSON.stringify(vus));
});

test('T-S6 la force de l’effectif : pondérée par les minutes, mêmes fiches, sans fiche = 0 (compté) ; rien avant 2 matchs', () => {
  const fiches = M({ 1: { apportOff: 0.2, apportDef: 0.1 }, 2: { apportOff: -0.1, apportDef: 0.05 } });
  const r = forceDeLEffectif({ minutesSaison: M({ 1: 180, 3: 180 }), matchsSaison: 2, minutesAvant: M({ 1: 900, 2: 900 }), matchsAvant: 10, fiches });
  assert.ok(Math.abs(r.eOff - (180 / 180) * 0.2) < 1e-15);
  assert.ok(Math.abs(r.eOffAvant - ((900 / 900) * 0.2 + (900 / 900) * -0.1)) < 1e-15);
  assert.ok(Math.abs(r.dOff - (0.2 - 0.1)) < 1e-15);
  assert.ok(Math.abs(r.couverture - 1980 / 2160) < 1e-15, 'le joueur 3 sans fiche : compté, vaut 0');
  assert.equal(forceDeLEffectif({ minutesSaison: M({ 1: 90 }), matchsSaison: 1, minutesAvant: M({ 1: 900 }), matchsAvant: 10, fiches }), null, 'avant 2 matchs : rien');
  assert.equal(forceDeLEffectif({ minutesSaison: M({ 1: 180 }), matchsSaison: 2, minutesAvant: new Map(), matchsAvant: 0, fiches }), null, 'sans saison d’avant : rien');
});
