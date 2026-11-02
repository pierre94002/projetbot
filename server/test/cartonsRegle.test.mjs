/**
 * LES CARTONS (étape 33, lot 1a, 02/11/2026) — la règle « cartons relevés ».
 *   node --test test/cartonsRegle.test.mjs        (depuis server/)
 *
 * T-R1    chaque statut (onze cas) sur un match fabriqué, avec « relevé », la valeur et « réglable automatiquement » ;
 * T-R2    la convention C de Pierre (Q1, 02/11/2026) : jaune 1, rouge direct 1, deux jaunes puis l'expulsion 2 ; cartons du
 *         temps additionnel et notés après la 90e comptés ;
 * T-R2bis compté JOUEUR PAR JOUEUR (critique, constat 8) : un « yellowred » sans le premier jaune listé vaut 2 ; les
 *         conventions 1 et 3 mesurées à côté ;
 * T-R3    la ligne de FotMob (jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes) donne « accord » ; un jaune de trop
 *         « ecart-1 » ; deux « desaccord » ; des écarts qui s'annulent entre les camps ne font PAS un accord (constat 9) ;
 * T-R4    prolongation et tirs au but → « prolonge », aucun chiffre même avec un déroulé complet ; attribué → « attribue » ;
 *         annulé, abandonné ou reporté avec un score → « non-joue » (constat 9) ;
 * T-R5    vrai zéro (déroulé complet sans carton ET ligne 0-0) ; jaunes « fabriqués » à 0 → « ligne-a-zero » (le déroulé
 *         gagne) ; déroulé incomplet → « non-releve » : jamais « 0 » sans déroulé complet ;
 * T-R6    la garde des vrais zéros AU JOUR J, glissante sur les 60 derniers matchs relevés de la compétition, saisons
 *         confondues (constat 9) : à plus de 10 % sur 30 matchs ou plus, le vrai zéro du jour J n'est pas confirmé ; à 29
 *         matchs, il l'est ; une nouvelle saison ne remet pas la garde à zéro ;
 * T-R7    cleDArbitre = cleDeLArbitre de refereeRead.js sur 1 000 noms (accents, formes décomposées, espaces, pays vide) ;
 * T-R8    « ecart-1 » réglable seulement si les deux comptes plausibles donnent la même issue à la ligne demandée ;
 * T-R9    les cartons du banc et du staff (« not_on_pitch ») COMPTENT partout, comme les autres (critique, constat 4), et
 *         sont comptés à part ; la mention de l'écran le dit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartonsDuDeroule, statutDesCartons, reglableALaLigne, cleDArbitre, gardeActive, STATUTS, STATUTS_RELEVES, CONSTANTES_DES_CARTONS } from '../src/data/cartons/formulesDesCartons.js';
import { CartonsAuJourJ } from '../src/data/cartons/cartonsAuJourJ.js';
import { ligneDuCache } from '../src/data/cartons/lectureDesCartons.js';
import { cleDeLArbitre } from '../src/data/db/refereeRead.js';
import { MOTS, CONVENTION, DECISION_DE_PIERRE } from '../src/data/cartons/reglagesCartons.js';

const remplacements = () => [{ type: 'substitution', side: 'home', minute: 60 }, { type: 'substitution', side: 'away', minute: 62 }];
const carte = (side, card, joueur, extra = {}) => ({ type: 'card', side, card, player: `Joueur ${joueur}`, playerId: `fotmob-${joueur}`, minute: 30, ...extra });
/** Un déroulé complet : des remplacements des deux camps et ces cartons. */
const complet = (...cartes) => [...remplacements(), ...cartes];
/** La ligne de FotMob d'un déroulé : jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes. */
function ligneDeFotmob(evenements) {
  const d = cartonsDuDeroule(evenements);
  return { jDom: d.home.jaunes, jExt: d.away.jaunes, rDom: d.home.rouges + d.home.deuxiemesJaunes, rExt: d.away.rouges + d.away.deuxiemesJaunes, ...{} };
}
const ligneFotmob = (ev) => {
  const d = cartonsDuDeroule(ev);
  return { jDom: d.home.jaunes - d.home.deuxiemesJaunes, jExt: d.away.jaunes - d.away.deuxiemesJaunes, rDom: d.home.rouges + d.home.deuxiemesJaunes, rExt: d.away.rouges + d.away.deuxiemesJaunes };
};

test('T-R1 chaque statut sur un match fabriqué : relevé, valeur, réglable automatiquement', () => {
  const base = complet(carte('home', 'yellow', 1), carte('away', 'yellow', 2), carte('away', 'red', 3));
  const cas = [
    ['prolonge', { evenements: base, ligne: ligneFotmob(base), prolongation: true }, false, null, false],
    ['attribue', { evenements: base, ligne: ligneFotmob(base), attribue: true }, false, null, false],
    ['non-joue', { evenements: base, ligne: ligneFotmob(base), nonJoue: true }, false, null, false],
    ['non-releve', { evenements: [carte('home', 'yellow', 1)], ligne: { jDom: 1, jExt: 0, rDom: 0, rExt: 0 } }, false, null, false],
    ['accord', { evenements: base, ligne: ligneFotmob(base) }, true, { home: 1, away: 2, total: 3 }, true],
    ['ecart-1', { evenements: base, ligne: { ...ligneFotmob(base), jDom: 2 } }, true, { home: 1, away: 2, total: 3 }, false],
    ['desaccord', { evenements: base, ligne: { ...ligneFotmob(base), jDom: 3 } }, false, null, false],
    ['ligne-a-zero', { evenements: base, ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 1 } }, true, { home: 1, away: 2, total: 3 }, false],
    ['sans-ligne', { evenements: base, ligne: null }, true, { home: 1, away: 2, total: 3 }, false],
    ['vrai-zero', { evenements: complet(), ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 0 } }, true, { home: 0, away: 0, total: 0 }, true],
    ['zero-non-confirme', { evenements: complet(), ligne: { jDom: 2, jExt: 1, rDom: 0, rExt: 0 } }, false, null, false]
  ];
  const vus = new Set();
  for (const [statut, entree, releve, valeur, reglable] of cas) {
    const s = statutDesCartons(entree);
    assert.equal(s.statut, statut, statut);
    assert.equal(s.releve, releve, `${statut} : relevé`);
    assert.deepEqual(s.valeur, valeur, `${statut} : valeur`);
    assert.equal(s.reglableAuto, reglable, `${statut} : réglable automatiquement`);
    vus.add(statut);
  }
  assert.deepEqual([...vus].sort(), [...STATUTS].sort(), 'les onze statuts sont essayés');
  assert.deepEqual([...STATUTS_RELEVES].sort(), ['accord', 'ecart-1', 'ligne-a-zero', 'sans-ligne', 'vrai-zero']);
  // Les vrais zéros sans la ligne : jamais confirmés.
  assert.equal(statutDesCartons({ evenements: complet(), ligne: null }).statut, 'zero-non-confirme');
});

test('T-R2 la convention C de Pierre : jaune 1, rouge direct 1, deux jaunes puis l’expulsion 2 ; temps additionnel et après la 90e comptés', () => {
  assert.equal(CONVENTION.cle, 'C');
  assert.equal(CONVENTION.expulsionApresDeuxJaunes, 2);
  assert.equal(DECISION_DE_PIERRE.convention.valeur, 'C');
  assert.equal(DECISION_DE_PIERRE.convention.date, '2026-11-02');
  assert.match(DECISION_DE_PIERRE.convention.mots, /Un carton jaune\. Pour le même joueur\. Plus un carton jaune\. Pour le même joueur\. Égale un carton rouge\./);
  const ev = complet(
    carte('home', 'yellow', 1),
    carte('home', 'red', 2),
    carte('home', 'yellow', 3, { minute: 20 }),
    carte('home', 'yellowred', 3, { minute: 70 }),
    carte('away', 'yellow', 4, { minute: 90, addedTime: 4 }),
    carte('away', 'yellow', 5, { minute: 94 })
  );
  const d = cartonsDuDeroule(ev);
  assert.equal(d.complet, true);
  assert.equal(d.home.cartons, 1 + 1 + 2, 'jaune 1 + rouge 1 + exclu après deux jaunes 2');
  assert.equal(d.away.cartons, 2, 'le temps additionnel et un carton noté après la 90e comptent');
  assert.equal(d.away.apres90, 1);
  assert.deepEqual([d.home.jaunes, d.home.deuxiemesJaunes, d.home.rouges], [2, 1, 1]);
  const s = statutDesCartons({ evenements: ev, ligne: ligneFotmob(ev) });
  assert.deepEqual(s.valeur, { home: 4, away: 2, total: 6 });
});

test('T-R2bis compté joueur par joueur : un « yellowred » sans le premier jaune listé vaut 2 ; conventions 1 et 3 mesurées à côté', () => {
  const ev = complet(carte('home', 'yellowred', 7), carte('away', 'yellow', 8), carte('away', 'yellowred', 8), carte('away', 'red', 9));
  const d = cartonsDuDeroule(ev);
  assert.equal(d.home.cartons, 2, 'le premier jaune manque au déroulé : l’expulsé compte quand même 2');
  assert.equal(d.away.cartons, 2 + 1);
  assert.deepEqual([d.home.un, d.home.trois], [1, 3], 'conventions 1 et 3');
  assert.deepEqual([d.away.un, d.away.trois], [1 + 1, 3 + 1]);
  // Un carton sans joueur nommé compte seul ; deux joueurs différents ne se mélangent pas.
  const sansNom = cartonsDuDeroule(complet({ type: 'card', side: 'home', card: 'yellow', minute: 10 }, { type: 'card', side: 'home', card: 'yellow', minute: 11 }));
  assert.equal(sansNom.home.cartons, 2);
  const s = statutDesCartons({ evenements: ev, ligne: ligneFotmob(ev) });
  assert.deepEqual(s.conventions, { un: { home: 1, away: 2, total: 3 }, trois: { home: 3, away: 4, total: 7 } });
});

test('T-R3 la ligne de FotMob donne « accord » ; un jaune de trop « ecart-1 » ; deux « desaccord » ; des écarts qui s’annulent entre les camps ne font pas un accord', () => {
  const ev = complet(carte('home', 'yellow', 1), carte('home', 'yellow', 2), carte('home', 'yellowred', 2), carte('away', 'red', 3));
  const L = ligneFotmob(ev);
  assert.deepEqual(L, { jDom: 1, jExt: 0, rDom: 1, rExt: 1 }, 'jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes');
  assert.equal(statutDesCartons({ evenements: ev, ligne: L }).statut, 'accord');
  assert.equal(statutDesCartons({ evenements: ev, ligne: { ...L, jDom: 2 } }).statut, 'ecart-1');
  assert.equal(statutDesCartons({ evenements: ev, ligne: { ...L, jExt: 2 } }).statut, 'desaccord');
  const annule = statutDesCartons({ evenements: ev, ligne: { ...L, jDom: 2, rExt: 0 } });
  assert.equal(annule.statut, 'desaccord', 'dom +1, ext −1 : l’écart total est 2, jamais 0');
  assert.equal(annule.ecart, 2);
  assert.equal(annule.releve, false, 'un match douteux n’est pas relevé');
  // L'autre lecture de la ligne (jaunes = yellow, sans retirer les deuxièmes jaunes) ne donne PAS l'accord.
  assert.notEqual(statutDesCartons({ evenements: ev, ligne: ligneDeFotmob(ev) }).statut, 'accord');
});

test('T-R4 prolongation et tirs au but → « prolonge » sans chiffre, même avec un déroulé complet ; attribué → « attribue » ; annulé avec un score → « non-joue »', () => {
  const ev = complet(carte('home', 'yellow', 1), carte('away', 'yellow', 2));
  const L = ligneFotmob(ev);
  for (const s of [statutDesCartons({ evenements: ev, ligne: L, prolongation: true }), statutDesCartons({ evenements: ev, ligne: L, prolongation: true, attribue: false })]) {
    assert.equal(s.statut, 'prolonge');
    assert.equal(s.valeur, null);
    assert.equal(s.releve, false);
  }
  assert.equal(statutDesCartons({ evenements: ev, ligne: L, attribue: true }).statut, 'attribue');
  assert.equal(statutDesCartons({ evenements: ev, ligne: L, attribue: true, prolongation: true }).statut, 'attribue');
  const nj = statutDesCartons({ evenements: ev, ligne: L, nonJoue: true });
  assert.deepEqual([nj.statut, nj.releve, nj.valeur], ['non-joue', false, null]);
  // La raison FotMob lue par le cache : prolongation, tirs au but (même sans prolongation), attribué, annulé.
  const ligne = (raison, awarded = null) => ligneDuCache({ match_key: 'k', events: JSON.stringify(ev), raison, awarded, jh: L.jDom, ja: L.jExt, rh: L.rDom, ra: L.rExt }, 's').statut;
  assert.equal(ligne('afterextra'), 'prolonge');
  assert.equal(ligne('afterpenalties'), 'prolonge', 'tirs au but');
  assert.equal(ligne(null, 1), 'attribue');
  assert.equal(ligne('awarded_win'), 'attribue');
  for (const r of ['cancelled', 'abandoned', 'postponed']) assert.equal(ligne(r), 'non-joue', r);
  assert.equal(ligne(null), 'accord');
});

test('T-R5 vrai zéro, jaunes « fabriqués » à 0, déroulé incomplet : jamais « 0 » sans déroulé complet', () => {
  const vz = statutDesCartons({ evenements: complet(), ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 0 } });
  assert.deepEqual([vz.statut, vz.releve, vz.valeur], ['vrai-zero', true, { home: 0, away: 0, total: 0 }]);
  const ev = complet(carte('home', 'yellow', 1), carte('home', 'yellow', 2), carte('away', 'yellow', 3), carte('away', 'red', 4));
  const az = statutDesCartons({ evenements: ev, ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 1 } });
  assert.deepEqual([az.statut, az.releve, az.valeur], ['ligne-a-zero', true, { home: 2, away: 2, total: 4 }], 'le déroulé gagne sur la ligne fabriquée à 0');
  assert.equal(az.reglableAuto, false, 'la ligne est fausse : jamais réglé seul');
  // Sans remplacement d'un camp, le déroulé n'est pas complet : « non-releve », même avec une ligne 0-0.
  for (const evenements of [[], null, [{ type: 'substitution', side: 'home', minute: 60 }], [{ type: 'goal', side: 'home', minute: 3 }]]) {
    const s = statutDesCartons({ evenements, ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 0 } });
    assert.equal(s.statut, 'non-releve', JSON.stringify(evenements));
    assert.equal(s.valeur, null);
  }
});

/** Une rencontre de la passe, telle que rencontreDuFlux la rend (le strict nécessaire à l'accumulateur). */
const rencontre = (date, i, league, statutBase, valeur, arbitre = null) => ({ matchKey: `${date}-${i}`, date, league, home: 100 + (i % 10), away: 200 + (i % 10), statutBase, valeur, arbitre });

test('T-R6 la garde des vrais zéros au jour J, glissante sur les 60 derniers matchs relevés de la compétition, saisons confondues', () => {
  assert.deepEqual({ ...CONSTANTES_DES_CARTONS.gardeZero }, { derniers: 60, min: 30, part: 0.1 });
  assert.equal(gardeActive({ n: 40, vraisZeros: 5 }), true, '12,5 % sur 40');
  assert.equal(gardeActive({ n: 29, vraisZeros: 10 }), false, '29 matchs : trop peu');
  assert.equal(gardeActive({ n: 40, vraisZeros: 4 }), false, '10 % pile : pas au-delà');
  const passe = (nAvant, zerosAvant, { saisonChange = false } = {}) => {
    const acc = new CartonsAuJourJ();
    let d = Date.parse('2024-01-01T00:00:00Z');
    for (let i = 0; i < nAvant; i++) {
      const date = new Date(d).toISOString().slice(0, 10);
      const zero = i < zerosAvant;
      acc.ajouter(rencontre(date, i, 'Ligue Z', zero ? 'vrai-zero' : 'accord', zero ? { home: 0, away: 0, total: 0 } : { home: 2, away: 2, total: 4 }));
      acc.finDeJournee();
      d += 86_400_000 * (saisonChange && i === nAvant - 5 ? 200 : 1);
    }
    const J = new Date(d).toISOString().slice(0, 10);
    acc.ajouter(rencontre(J, 999, 'Ligue Z', 'vrai-zero', { home: 0, away: 0, total: 0 }));
    return acc.finDeJournee().get(`${J}-999`);
  };
  const actif = passe(40, 5);
  assert.deepEqual([actif.statut, actif.releve, actif.garde.active], ['zero-non-confirme', false, true]);
  const trop = passe(29, 5);
  assert.deepEqual([trop.statut, trop.releve, trop.garde.active], ['vrai-zero', true, false], 'à 29 matchs (30 moins un), le vrai zéro reste');
  const saison = passe(40, 5, { saisonChange: true });
  assert.equal(saison.statut, 'zero-non-confirme', 'une nouvelle saison ne remet pas la garde à zéro (critique, constat 9)');
  // Glissante : 60 derniers. 100 matchs dont les 15 premiers à zéro (15 % de tout l'historique) : plus aucun dans les 60 derniers.
  assert.equal(passe(100, 15).statut, 'vrai-zero', '15 % de vrais zéros, tous hors des 60 derniers matchs : la garde ne les voit plus');
});

/** Générateur à graine (mulberry32). */
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('T-R7 cleDArbitre = cleDeLArbitre (refereeRead.js) sur 1 000 noms : accents, formes décomposées, espaces, pays vide', () => {
  const u = generateur(7);
  const morceaux = ['José', 'José', 'Clément', 'Ö', 'van der', '  ', '\t', 'Łukasz', 'Kovačević', 'Ñ', 'a', '', 'Jean-Luc', 'O’Neil', ' Dupont '];
  const pays = ['France', ' France ', '', null, undefined, 'Côte d’Ivoire', 'Cote d̂Ivoire', 'Brasil'];
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    const nom = Array.from({ length: 1 + Math.floor(u() * 4) }, () => morceaux[Math.floor(u() * morceaux.length)]).join(u() < 0.5 ? ' ' : '  ');
    const p = pays[Math.floor(u() * pays.length)];
    const forme = u() < 0.5 ? { name: nom, country: p } : { nom, pays: p };
    assert.equal(cleDArbitre(forme), cleDeLArbitre(forme), JSON.stringify(forme));
    if (cleDArbitre(forme)?.endsWith('|')) n++;
  }
  assert.ok(n > 50, `des pays vides essayés (${n})`);
  assert.equal(cleDArbitre(null), null);
  assert.equal(cleDArbitre({ name: '   ' }), null);
});

test('T-R8 « ecart-1 » réglable seulement si les deux comptes plausibles donnent la même issue à la ligne demandée', () => {
  const ev = complet(carte('home', 'yellow', 1), carte('home', 'yellow', 2), carte('away', 'yellow', 3), carte('away', 'yellow', 4));
  const L = { ...ligneFotmob(ev), jDom: 3 };
  const s = statutDesCartons({ evenements: ev, ligne: L });
  assert.equal(s.statut, 'ecart-1');
  assert.equal(s.reglableAuto, false);
  // Le déroulé dit 4, la ligne 5 : « plus de 3,5 » et « plus de 5,5 » ont la même issue ; « plus de 4,5 » non.
  assert.equal(reglableALaLigne(s, { portee: 'total', ligne: 3.5, ligneDeFotmob: L }), true);
  assert.equal(reglableALaLigne(s, { portee: 'total', ligne: 5.5, ligneDeFotmob: L }), true);
  assert.equal(reglableALaLigne(s, { portee: 'total', ligne: 4.5, ligneDeFotmob: L }), false);
  assert.equal(reglableALaLigne(s, { portee: 'home', ligne: 2.5, ligneDeFotmob: L }), false);
  assert.equal(reglableALaLigne(s, { portee: 'away', ligne: 1.5, ligneDeFotmob: L }), true);
  assert.equal(reglableALaLigne(statutDesCartons({ evenements: ev, ligne: ligneFotmob(ev) }), { ligne: 4.5 }), true, 'accord : toujours');
  assert.equal(reglableALaLigne(statutDesCartons({ evenements: ev, ligne: { jDom: 0, jExt: 0, rDom: 0, rExt: 0 } }), { ligne: 0.5 }), false, 'ligne-a-zero : jamais');
});

test('T-R9 les cartons du banc et du staff (« not_on_pitch ») comptent partout comme les autres, et sont comptés à part ; la mention de l’écran le dit', () => {
  const ev = complet(carte('home', 'yellow', 1), { type: 'card', side: 'home', card: 'yellow', player: 'Entraîneur', minute: 50, note: 'not_on_pitch' }, { type: 'card', side: 'away', card: 'red', player: 'Adjoint', minute: 70, notOnPitch: true });
  const d = cartonsDuDeroule(ev);
  assert.deepEqual([d.home.horsTerrain, d.away.horsTerrain], [1, 1]);
  assert.deepEqual([d.home.cartons, d.away.cartons], [2, 1], 'ils comptent dans les totaux');
  const s = statutDesCartons({ evenements: ev, ligne: ligneFotmob(ev) });
  assert.equal(s.statut, 'accord', 'la ligne de FotMob les compte : l’accord tient');
  assert.deepEqual(s.valeur, { home: 2, away: 1, total: 3 });
  // Dans la passe aussi : la fenêtre de l'équipe et la moyenne de la compétition les comptent.
  const acc = new CartonsAuJourJ();
  for (let i = 0; i < 31; i++) {
    const date = new Date(Date.parse('2024-02-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
    acc.ajouter({ matchKey: `m${i}`, date, league: 'L', home: 1, away: 2, statutBase: s.statut, valeur: s.valeur, arbitre: null });
    acc.finDeJournee();
  }
  const m = acc.ligue('L', '2024-03-15');
  assert.deepEqual([m.dom, m.ext], [2, 1]);
  assert.equal(acc.etatDeLEquipe(1).pris, 2);
  assert.match(MOTS.horsTerrain, /^Les cartons du banc et des entraîneurs comptent comme les autres : FotMob ne les distingue pas sur les matchs d’avant octobre 2026\.$/);
  assert.doesNotMatch(Object.values(MOTS).join(' '), /(banc|entraîneurs|staff)[^.]*ne comptent pas/, 'l’ancienne phrase de la conception (« ne comptent pas ») est fausse pour tout ce qui a été appris');
});
