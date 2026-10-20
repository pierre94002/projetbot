/**
 * Étape 12 du plan — les CONTRÔLES DES DONNÉES et le CARNET DE SANTÉ.
 *   node --test test/carnetSante.test.mjs        (depuis server/)
 *
 * Tout ce qui ouvre une base tourne dans une copie isolée de la base d'essai
 * (test/aides/isolement.mjs : réseau coupé, heure figée au 05/10/2026 12 h UTC,
 * jamais la vraie base), où les anomalies sont PLANTÉES par
 * test/aides/script-carnet-sante.mjs ; le contrôle y est lancé comme la ligne de
 * commande et la passe d'actualisation le lancent (scripts/data-health.mjs).
 *
 *  1. Une sorte d'anomalie par test : doublons, mauvaise compétition, manquants,
 *     chiffres impossibles, zéros « non relevé », clubs et joueurs mal identifiés
 *     — chacune trouvée là où elle est plantée, et rien d'inventé ailleurs.
 *  2. Les règles d'une rencontre, sur des cas fabriqués (sans base).
 *  3. Le carnet : vraies bornes de saison, Σ et ⌀ (jamais une somme de
 *     pourcentages), et le RECOUPEMENT avec le tableau de couverture actuel
 *     (getCoverage) et les faits qui le fondent (coverageFacts).
 *  4. La passe de nuit ne relit que les rencontres nouvelles ou modifiées.
 *  5. Jamais d'écriture dans la base ; jamais pendant un import ni en parallèle ;
 *     l'étape de la passe, sous son verrou.
 *  6. La route en lecture seule (état préparé) ; la lecture du code (réutilisation
 *     des contrôles existants, aucune seconde voie, aucun réseau).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import {
  controlesDeRencontre,
  totauxDuCarnet,
  lignesDuCarnet,
  drapeaux,
  TYPES,
  SORTES,
  DONNEES,
  SEUILS,
  porteeDe,
  idsDuGroupe
} from '../src/data/db/dataHealth.js';
import { seasonBounds } from '../src/data/providers/seasonWindows.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-carnet-sante.mjs');

/** Une phase du script d'essai, dans une copie neuve (scripts du serveur compris). */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
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
const types = uneFois(() => lancer('types'));
const nuit = uneFois(() => lancer('nuit'));
const verrou = uneFois(() => lancer('verrou'));
const route = uneFois(() => lancer('route'));
const recoupement = uneFois(() => lancer('recoupement'));
const reprises = uneFois(() => lancer('reprises'));
const principal = uneFois(() => lancer('main'));

const de = (s, type, sorte = null) => s.anomalies.filter((a) => a.type === type && (!sorte || a.sorte === sorte));
const surMatch = (liste, cle) => liste.filter((a) => a.matchKey === cle || (a.matchs ?? []).includes(cle));

// ======================================================= 1. une sorte par test

test('doublons : même jour et mêmes clubs (identifiants) dans le même sens, dans l’autre sens, même rencontre FotMob deux fois — chacun trouvé, rien d’autre', () => {
  const s = types();
  assert.equal(s.cli.json.ecrit, true, JSON.stringify(s.cli));
  const memeSens = de(s, 'doublon', 'meme-sens');
  assert.equal(memeSens.length, 1);
  assert.deepEqual(memeSens[0].matchs.slice().sort(), ['2026-08-21-arsenal-coventry', 'essai-2026-08-21-arsenal-coventry-bis']);
  assert.equal(memeSens[0].gravite, 'erreur');
  assert.match(memeSens[0].detail, /2 fois le même jour avec les mêmes clubs \(fotmob-9825 et fotmob-8669\)/);
  assert.match(memeSens[0].detail, /merge-duplicate-matches\.mjs/);
  const inverse = de(s, 'doublon', 'sens-inverse');
  assert.equal(inverse.length, 1);
  assert.deepEqual(inverse[0].matchs, ['2026-09-12-liverpool-fulham', 'essai-2026-09-12-fulham-liverpool']);
  assert.match(inverse[0].detail, /Liverpool – Fulham 0-0 \(EPL\) et Fulham – Liverpool 0-0 \(EPL\)/);
  const memeId = de(s, 'doublon', 'meme-identifiant');
  assert.equal(memeId.length, 1);
  assert.match(memeId[0].detail, /la rencontre FotMob 5795372 est enregistrée 2 fois/);
  // Les doublons se voient aussi au classement officiel : un match de trop pour chacun des clubs concernés.
  const enTrop = de(s, 'doublon', 'classement-en-trop').map((a) => a.label.split(' · ')[0]).sort();
  assert.deepEqual(enTrop, ['Arsenal', 'Coventry City', 'Everton', 'Fulham', 'Liverpool']);
  assert.ok(de(s, 'doublon', 'classement-en-trop').every((a) => a.gravite === 'a-verifier' && a.matchKey === null && a.saison === '2026-27'));
  // Aucun autre doublon que les plantés.
  assert.equal(de(s, 'doublon').length, 3 + 5);
  // Deux rencontres des deux mêmes clubs ne font pas un « club deux fois le même jour ».
  assert.deepEqual(surMatch(de(s, 'identite', 'club-deux-fois'), '2026-09-12-liverpool-fulham'), []);
  assert.deepEqual(surMatch(de(s, 'identite', 'club-deux-fois'), '2026-08-21-arsenal-coventry'), []);
});

test('mauvaise compétition : une rencontre d’EPL que FotMob publie en Championship ; des clubs absents du classement officiel ; rien d’autre', () => {
  const s = types();
  const autre = de(s, 'competition', 'autre-competition');
  assert.equal(autre.length, 1);
  assert.equal(autre[0].matchKey, '2026-09-13-coventry-brighton');
  assert.equal(autre[0].gravite, 'erreur');
  assert.match(autre[0].detail, /rangée dans « EPL » alors que FotMob la publie sous « ENG\|Championship » \(compétition 48\), celle de « Championship »/);
  // Les rencontres plantées avec Wolves et Burnley (clubs qui ne sont pas en EPL cette saison) : hors du classement officiel.
  const hors = de(s, 'competition', 'hors-classement').map((a) => a.label.split(' · ')[0]).sort();
  assert.deepEqual(hors, ['Burnley', 'Wolverhampton Wanderers']);
  assert.equal(de(s, 'competition').length, 3, 'les 2 156 rencontres de la base d’essai ne déclenchent aucune fausse alerte');
});

test('manquants : jouée selon la page de la compétition (rapport des omissions) et absente du magasin ; importée depuis, présente sous un autre identifiant ou d’avant le magasin : écartées ; classement officiel', () => {
  const s = types();
  const fotmob = de(s, 'manquant', 'calendrier-fotmob');
  assert.equal(fotmob.length, 1);
  assert.equal(fotmob[0].id, 'manquant:calendrier-fotmob:88800001');
  assert.deepEqual([fotmob[0].date, fotmob[0].league, fotmob[0].saison, fotmob[0].label, fotmob[0].score, fotmob[0].gravite], ['2026-09-21', 'EPL', '2026-27', 'Arsenal – Chelsea', '1-1', 'erreur']);
  assert.match(fotmob[0].detail, /selon la page de la compétition chez FotMob \(saison 2026\/2027, rencontre 88800001\), absente du magasin/);
  assert.deepEqual(s.controle.omissions, { lues: 4, signalees: 1, ecartees: { avantLeMagasin: 1, horsPerimetre: 0, importeesDepuis: 1, autreIdentifiant: 1 } });
  // Avant la première saison du magasin (ici 2026 pour l'essai ; 2023 en vrai) : compté HORS DU PÉRIMÈTRE, saison par saison
  // (bornes réelles : la Lettonie en année civile), jamais une anomalie.
  assert.deepEqual(s.horsPerimetre, {
    ids: ['manquant:calendrier-fotmob:88800011'],
    ecartees: { avantLeMagasin: 0, horsPerimetre: 2, importeesDepuis: 0, autreIdentifiant: 0 },
    horsPerimetre: [
      { league: 'EPL', season: 2025, saison: '2025-26', matchs: 1 },
      { league: 'Virsliga - Latvia', season: 2025, saison: '2025', matchs: 1 }
    ]
  });
  // La base d'essai est un ÉCHANTILLON : le classement officiel (complet) y compte plus de matchs que le magasin.
  const classement = de(s, 'manquant', 'classement-matchs');
  assert.ok(classement.length > 50, `${classement.length}`);
  const libertad = classement.find((a) => a.label === 'Libertad · classement officiel');
  assert.match(libertad.detail, /Libertad : 35 ou 22 matchs joués au classement officiel, 14 au magasin — 8 rencontres manquantes au moins\./);
  assert.equal(libertad.saison, '2026');
});

test('chiffres impossibles : tirs cadrés > tirs, possession à 105 %, trois jaunes pour un joueur, un buteur de trop (audit des scores) — et aucun sur les rencontres non touchées', () => {
  const s = types();
  const imp = de(s, 'impossible');
  const parMatch = Object.fromEntries(imp.map((a) => [`${a.sorte}|${a.matchKey}`, a]));
  assert.match(parMatch['equipe|2026-09-14-leeds-newcastle'].detail, /^Leeds : 16 tirs cadrés pour 14 tirs$/);
  assert.match(parMatch['equipe|2026-09-18-brentford-chelsea'].detail, /possession 60 % \+ 45 % = 105 %, pas 100 %/);
  assert.match(parMatch['joueurs|2026-09-19-brighton-arsenal'].detail, /\(Arsenal\) : 3 cartons jaunes$/);
  assert.equal(parMatch['buteurs|2026-09-20-man-city-sunderland'].detail, '6 buts crédités aux joueurs (+ 0 csc adverses) pour un score de 5 : buteur en trop');
  assert.equal(parMatch['buteurs|2026-09-20-man-city-sunderland'].id, 'impossible:buteurs:2026-09-20-man-city-sunderland:home');
  assert.ok(imp.every((a) => a.gravite === 'erreur'));
  assert.equal(imp.length, 4, imp.map((a) => a.id).join(' ; '));
});

test('zéros « non relevé » : aucune passe (plantée) et la couverture « lower » de Lettonie (vraie) ; un zéro plausible seul n’est pas signalé', () => {
  const s = types();
  const zeros = de(s, 'zero');
  const ipswich = surMatch(zeros, '2026-09-19-everton-ipswich');
  assert.equal(ipswich.length, 1);
  assert.equal(ipswich[0].detail, 'Ipswich : passes, passes réussies à 0 (couverture « xG » chez FotMob).');
  assert.equal(ipswich[0].gravite, 'a-verifier');
  // Pas de « chiffre impossible » pour autant : 0 passe réussie sur 0 passe est cohérent.
  assert.deepEqual(surMatch(de(s, 'impossible'), '2026-09-19-everton-ipswich'), []);
  const lettonie = zeros.filter((a) => a.league === 'Virsliga - Latvia');
  assert.equal(lettonie.length, 64, 'les 64 rencontres lettones de la base d’essai');
  assert.ok(lettonie.every((a) => /dégagements, interceptions, centres, longs ballons à 0/.test(a.detail) && /couverture « lower » chez FotMob/.test(a.detail)));
  assert.ok(lettonie.some((a) => /tirs dans et hors de la surface à 0 pour \d+ tirs/.test(a.detail)));
  assert.deepEqual(surMatch(zeros, '2026-09-20-leeds-crystal-palace'), [], 'aucun centre : plausible, pas signalé');
  assert.equal(zeros.length, 65);
  assert.match(SORTES.zeros.explication, /À ne pas lire comme de vrais zéros ; le magasin ne contredit pas la source : rien n’est effacé/);
});

test('clubs et joueurs mal identifiés : homonymes (deux identifiants pour un nom chez Arsenal), deux clubs « Arsenal » en EPL, un club deux fois le même jour, l’identifiant 0', () => {
  const s = types();
  const homonymes = de(s, 'identite', 'homonymes-joueurs');
  assert.equal(homonymes.length, 1);
  const h = homonymes[0];
  assert.equal(h.label, `${s.plante.homonyme.name} · Arsenal`);
  assert.equal(h.gravite, 'a-verifier');
  assert.equal(h.saison, '2026-27');
  assert.ok(h.detail.includes(`${s.plante.homonyme.player_id} (2 matchs), fotmob-99999001 (1 match)`), h.detail);
  assert.match(h.id, new RegExp(`^identite:homonymes-joueurs:fotmob-9825\\|2026\\|(${s.plante.homonyme.player_id},fotmob-99999001|fotmob-99999001,${s.plante.homonyme.player_id})$`));
  const clubs = de(s, 'identite', 'homonymes-clubs');
  assert.equal(clubs.length, 1);
  assert.match(clubs[0].detail, /2 clubs distincts s'appellent « Arsenal » dans EPL 2026-27 \(fotmob-8669, fotmob-9825\)/);
  assert.equal(clubs[0].gravite, 'info');
  const deuxFois = de(s, 'identite', 'club-deux-fois');
  assert.equal(deuxFois.length, 1);
  assert.deepEqual(deuxFois[0].matchs, ['2026-09-19-everton-ipswich', 'essai-2026-09-19-everton-wolves']);
  assert.match(deuxFois[0].detail, /^Everton \(fotmob-8668\) joue deux fois le 2026-09-19 : Everton – Ipswich 1-0 \(EPL\) et Everton – Wolves 1-0 \(EPL\)/);
  const sansId = de(s, 'identite', 'sans-identifiant');
  assert.equal(sansId.length, 4, '3 dans la base d’essai, 1 planté');
  const chelsea = surMatch(sansId, '2026-09-12-chelsea-hull-city')[0];
  assert.match(chelsea.detail, /^1 joueur sans identifiant FotMob : /);
  assert.equal(chelsea.gravite, 'info');
  assert.match(SORTES['sans-identifiant'].explication, /FotMob donne l’identifiant 0 à tous les inconnus d’une feuille/);
});

// ================================================ 2. les règles, sans base

const R = (x = {}) => ({ matchKey: 'm1', date: '2026-09-12', league: 'EPL', season: 2026, homeName: 'A', awayName: 'B', homeId: 'fotmob-1', awayId: 'fotmob-2', homeGoals: 1, awayGoals: 0, leagueKey: 'ENG|Premier League', parentId: 47, coverage: 'xG', compo: true, noSheet: false, awarded: false, reason: null, ...x });
const stats = (h = {}, a = {}) => ({
  home: { total_shots: 10, shots_on_goal: 4, shots_off_goal: 4, blocked_shots: 2, shots_insidebox: 6, shots_outsidebox: 4, ball_possession: 55, total_passes: 400, passes_accurate: 330, tackles: 15, clearances: 20, interceptions: 8, crosses: 12, long_balls: 40, expected_goals: 1.2, corner_kicks: 5, yellow_cards: 1, red_cards: 0, ...h },
  away: { total_shots: 8, shots_on_goal: 3, shots_off_goal: 3, blocked_shots: 2, shots_insidebox: 5, shots_outsidebox: 3, ball_possession: 45, total_passes: 380, passes_accurate: 300, tackles: 12, clearances: 25, interceptions: 9, crosses: 10, long_balls: 45, expected_goals: 0.8, corner_kicks: 3, yellow_cards: 2, red_cards: 0, ...a }
});
const sortes = (r, s = null, j = null, i = null) => controlesDeRencontre(r, s, j, i).map((a) => `${a.type}/${a.sorte}`);

test('règles d’une rencontre (cas fabriqués) : rien sur une rencontre propre ; chaque règle à sa limite', () => {
  assert.deepEqual(sortes(R(), stats(), { home: { lignes: 20, sansId: 0 }, away: { lignes: 20, sansId: 0 } }), []);
  // Possession : 55 + 44 = 99 tolérés (arrondis de la source), 55 + 43 = 98 non.
  assert.deepEqual(sortes(R(), stats({}, { ball_possession: 44 })), []);
  assert.deepEqual(sortes(R(), stats({}, { ball_possession: 43 })), ['impossible/equipe']);
  // Tirs : cadrés = tirs passe, cadrés > tirs non ; la somme cadrés + non cadrés + contrés ; dans + hors de la surface.
  assert.deepEqual(sortes(R(), stats({ shots_on_goal: 10, shots_off_goal: 0, blocked_shots: 0 })), []);
  assert.deepEqual(sortes(R(), stats({ shots_on_goal: 11 })), ['impossible/equipe']);
  assert.deepEqual(sortes(R(), stats({ shots_off_goal: 5 })), ['impossible/equipe']);
  assert.deepEqual(sortes(R(), stats({ shots_insidebox: 7 })), ['impossible/equipe']);
  // Une statistique absente ne se contrôle pas (jamais lue comme 0).
  assert.deepEqual(sortes(R(), stats({ blocked_shots: null, shots_off_goal: null })), []);
  assert.deepEqual(sortes(R(), stats({ passes_accurate: 401 })), ['impossible/equipe']);
  // Zéros : un seul champ défensif à 0 est plausible ; deux ensemble ne le sont plus ; passes, tacles, possession à 0 seuls non plus.
  assert.deepEqual(sortes(R(), stats({ crosses: 0 })), []);
  assert.deepEqual(sortes(R(), stats({ crosses: 0, long_balls: 0 })), ['zero/zeros']);
  assert.deepEqual(sortes(R(), stats({ tackles: 0 })), ['zero/zeros']);
  assert.deepEqual(sortes(R(), stats({ total_passes: 0, passes_accurate: null })), ['zero/zeros'], 'aucune passe, seule : impossible dans un match joué');
  assert.deepEqual(sortes(R(), stats({ ball_possession: 0 }, { ball_possession: 100 })), ['zero/zeros']);
  assert.deepEqual(sortes(R(), stats({ shots_insidebox: 0, shots_outsidebox: 0 })), ['zero/zeros']);
  assert.deepEqual(sortes(R(), stats({ total_shots: 0, shots_on_goal: 0, shots_off_goal: 0, blocked_shots: 0, shots_insidebox: 0, shots_outsidebox: 0 })), [], 'aucun tir : la répartition à 0 est juste');
  // Compétition : son propre intitulé ; un intitulé inhabituel sous le BON identifiant (Paraguay « PRY », 199) n'est pas une erreur ;
  // l'intitulé d'une autre compétition suivie, ou l'identifiant d'une autre, l'est.
  assert.deepEqual(sortes(R({ league: 'División Profesional - Paraguay', leagueKey: 'PRY|Division Profesional', parentId: 199 })), []);
  assert.deepEqual(sortes(R({ leagueKey: 'ENG|Championship', parentId: 48 })), ['competition/autre-competition']);
  assert.deepEqual(sortes(R({ leagueKey: 'ENG|Premier League', parentId: 48 })), ['competition/autre-competition']);
  assert.deepEqual(sortes(R({ leagueKey: 'ENG|Premier League Cup', parentId: 9999 })), ['competition/intitule']);
  assert.deepEqual(sortes(R({ league: 'Ligue inconnue' })), ['competition/non-suivie']);
  // Joueurs : la liste des lignes impossibles devient UN constat par rencontre.
  const imp = controlesDeRencontre(R(), null, null, [
    { side: 'home', name: 'X', shots: 2, shots_on_target: 3, passes: null, passes_accurate: null, yellow_cards: 0, red_cards: 0, minutes: 90, rating: 7 },
    { side: 'away', name: 'Y', shots: null, shots_on_target: null, passes: 10, passes_accurate: 9, yellow_cards: 0, red_cards: 2, minutes: 160, rating: 11 }
  ]);
  assert.equal(imp.length, 1);
  assert.equal(imp[0].detail, 'X (A) : 3 tirs cadrés pour 2 tirs ; Y (B) : 2 cartons rouges, 160 minutes de jeu, note de 11');
  // Identité : les joueurs sans identifiant, avec trois noms au plus.
  const sans = controlesDeRencontre(R(), null, { home: { lignes: 20, sansId: 3, nomsSansId: ['N1', 'N2', 'N3'] }, away: { lignes: 20, sansId: 1, nomsSansId: ['N4'] } });
  assert.deepEqual(sans.map((a) => [a.sorte, a.gravite, a.detail]), [['sans-identifiant', 'info', '4 joueurs sans identifiant FotMob : N1, N2, N3…']]);
  // Forme : la portée d'un constat sur une seule rencontre n'est pas écrite (elle se déduit), celle d'un groupe l'est.
  assert.equal('portee' in imp[0], false);
  assert.deepEqual(porteeDe(imp[0]), { cles: ['m1'] });
  assert.deepEqual(idsDuGroupe('fotmob-9825|2026|fotmob-1,fotmob-2'), ['fotmob-1', 'fotmob-2']);
});

test('les sortes, gravités et données dites à l’écran : chaque sorte a son type, son libellé, son explication ; six données ; seuils 90 / 50', () => {
  assert.deepEqual(TYPES.map((t) => t.cle), ['doublon', 'competition', 'manquant', 'impossible', 'zero', 'identite']);
  assert.deepEqual(DONNEES.map((d) => d.cle), ['xg', 'tirs', 'corners', 'cartons', 'joueurs', 'compos']);
  assert.deepEqual({ ...SEUILS }, { bon: 90, partiel: 50 });
  for (const [cle, s] of Object.entries(SORTES)) {
    assert.ok(TYPES.some((t) => t.cle === s.type), `sorte ${cle} : type ${s.type}`);
    assert.ok(s.libelle.length > 5 && s.explication.length > 30, `sorte ${cle}`);
  }
  // Chaque sorte rencontrée dans les essais est décrite.
  const vues = new Set(types().anomalies.map((a) => a.sorte));
  for (const v of vues) assert.ok(SORTES[v], `sorte ${v} sans description`);
});

// =================================================================== 3. le carnet

test('le carnet : une ligne par championnat et saison réelle (juillet-juin, ou année civile) ; Σ des comptes et ⌀ de tous les matchs, jamais une somme de pourcentages', () => {
  const s = recoupement();
  const carnet = s.carnet;
  for (const l of carnet) {
    assert.deepEqual(l.bornes, seasonBounds(l.league, l.season), `${l.league} ${l.season}`);
    assert.ok(l.premier >= l.bornes[0] && l.dernier < l.bornes[1], `${l.league} ${l.saison} : ${l.premier} → ${l.dernier} dans ses bornes`);
    for (const d of DONNEES) {
      assert.ok(l.avec[d.cle] <= l.matchs);
      assert.equal(l.pourcent[d.cle], l.matchs ? Math.round((1000 * l.avec[d.cle]) / l.matchs) / 10 : null);
    }
    const remplies = DONNEES.reduce((n, d) => n + l.avec[d.cle], 0);
    assert.equal(l.moyenne, l.matchs ? Math.round((1000 * remplies) / (6 * l.matchs)) / 10 : null);
  }
  // La Lettonie suit l'année civile : ses 64 rencontres de juin à septembre 2026 sont UNE saison, « 2026 »
  // (le découpage juillet-juin du tableau d'avant la coupait en deux).
  const lettonie = carnet.filter((l) => l.league === 'Virsliga - Latvia');
  assert.deepEqual(lettonie.map((l) => [l.saison, l.rencontres, l.bornes]), [['2026', 64, ['2026-01-01', '2027-01-01']]]);
  assert.equal(carnet.find((l) => l.league === 'EPL' && l.season === 2026).saison, '2026-27');
  // Σ et ⌀ : les comptes s'additionnent ; la part = Σ avec / Σ matchs, pas la moyenne des parts des lignes.
  const t = totauxDuCarnet(carnet);
  assert.equal(t.matchs, carnet.reduce((n, l) => n + l.matchs, 0));
  for (const d of DONNEES) {
    assert.equal(t.avec[d.cle], carnet.reduce((n, l) => n + l.avec[d.cle], 0));
    assert.equal(t.pourcent[d.cle], Math.round((1000 * t.avec[d.cle]) / t.matchs) / 10);
  }
  const moyenneDesLignes = carnet.reduce((n, l) => n + l.pourcent.joueurs, 0) / carnet.length;
  assert.notEqual(t.pourcent.joueurs, Math.round(moyenneDesLignes * 10) / 10, 'la ⌀ n’est pas la moyenne des pourcentages des lignes');
  // Une ligne fabriquée : un match complet, un résultat ATTRIBUÉ sur tapis vert (pas de feuille à exiger :
  // compté à part, hors du calcul), un match sans score (pas joué), un match sans feuille, joueurs d'un seul camp.
  const base = { league: 'EPL', season: 2026, date: '2026-08-20', compo: false, noSheet: false, awarded: false, reason: null, coverage: 'xG', homeGoals: 1, awayGoals: 0 };
  const rs = new Map(
    [
      { ...base, matchKey: 'a', compo: true },
      { ...base, matchKey: 'b', awarded: true, reason: 'awarded_win', homeGoals: 0, awayGoals: 3 },
      { ...base, matchKey: 'c', homeGoals: null, awayGoals: null, date: '2026-09-30' },
      { ...base, matchKey: 'd', noSheet: true, coverage: 'lower', date: '2026-08-21' }
    ].map((x) => [x.matchKey, x])
  );
  const complet = { expected_goals: 1.1, total_shots: 9, corner_kicks: 4, yellow_cards: 1, red_cards: 0 };
  const [l] = lignesDuCarnet(rs, new Map([['a', { home: complet, away: complet }], ['b', { home: complet, away: complet }]]), new Map([['a', { home: { lignes: 20 }, away: { lignes: 20 } }], ['d', { home: { lignes: 11 }, away: { lignes: 0 } }]]), {
    maintenant: new Date('2026-10-05T12:00:00Z'),
    premiereDate: '2023-01-04'
  });
  assert.deepEqual(
    [l.saison, l.rencontres, l.matchs, l.attribues, l.horsJeu, l.sansFeuille, l.avec, l.pourcent.xg, l.moyenne, l.couverture, l.enCours, l.partielle, l.premier, l.dernier],
    ['2026-27', 4, 2, 1, 1, 1, { xg: 1, tirs: 1, corners: 1, cartons: 1, joueurs: 1, compos: 1 }, 50, 50, { xG: 1, lower: 1 }, true, null, '2026-08-20', '2026-09-30']
  );
  assert.equal(drapeaux(rs.get('b')).attribue, true);
  // Une saison commencée avant le magasin est dite partielle.
  const [vieille] = lignesDuCarnet(new Map([['v', { ...base, matchKey: 'v', season: 2022, date: '2023-03-01' }]]), new Map(), new Map(), { maintenant: new Date('2026-10-05T12:00:00Z'), premiereDate: '2023-01-04' });
  assert.deepEqual([vieille.saison, vieille.partielle, vieille.enCours], ['2022-23', 'le magasin commence le 2023-01-04', false]);
});

test('le carnet RECOUPE le tableau de couverture actuel : mêmes matchs terminés, mêmes « avec statistiques » et « avec les joueurs » compétition par compétition ; seuls diffèrent les noms que le tableau ne reconnaît pas', () => {
  const s = recoupement();
  assert.equal(s.cli.json.ecrit, true, JSON.stringify(s.cli));
  const parLigue = new Map(s.recoupement.parLigue.map((l) => [l.league, l]));
  assert.equal(s.couverture.leagues.length, parLigue.size);
  for (const c of s.couverture.leagues) {
    const r = parLigue.get(c.league);
    assert.ok(r, c.league);
    assert.deepEqual([r.finis, r.parNom, r.joueursDomicile], [c.finished, c.withStats, c.withPlayers], c.league);
  }
  assert.deepEqual(
    [s.recoupement.totaux.finis, s.recoupement.totaux.parNom, s.recoupement.totaux.joueursDomicile],
    [s.couverture.totals.finished, s.couverture.totals.withStats, s.couverture.totals.withPlayers]
  );
  // Les trois écritures d'un autre alias : le tableau actuel ne les trouve pas (clé fabriquée avec les noms), le carnet si (identifiants).
  assert.equal(s.variantes.length, 3);
  assert.equal(s.recoupement.totaux.parIdsSeulement, 3);
  assert.equal(s.recoupement.totaux.finis - s.recoupement.totaux.parNom, 3 + 2);
  // Les deux matchs terminés du calendrier que le magasin n'a pas.
  assert.equal(s.recoupement.totaux.introuvables, 2);
  assert.deepEqual(parLigue.get('EPL').exemplesIntrouvables, ['2026-09-21 Arsenal – Chelsea 1-1']);
  // Saison par saison, le carnet compte les mêmes rencontres que les faits qui fondent le tableau (coverageFacts),
  // et « joueurs » = des lignes joueur des deux camps.
  assert.equal(s.carnet.length, Object.keys(s.faits).length);
  for (const l of s.carnet) {
    const f = s.faits[`${l.league}|${l.season}`];
    assert.ok(f, `${l.league} ${l.season}`);
    assert.deepEqual([l.rencontres, l.avec.joueurs], [f.rencontres, f.joueursDeuxCamps], `${l.league} ${l.saison}`);
  }
});

// ============================================================= 4. la passe de nuit

test('passe de nuit : ne relit que les trois rencontres nouvelles ; une ancienne modifiée sans mise à jour n’est pas relue (le contrôle complet suivant la voit) ; une rencontre retirée lève son anomalie', () => {
  const s = nuit();
  assert.equal(s.complet1.json.mode, 'complet');
  assert.equal(s.nuit.json.mode, 'nuit', JSON.stringify(s.nuit));
  const b = s.b.controle;
  assert.equal(b.rencontresControlees, 3, 'seulement les rencontres nouvelles');
  assert.equal(b.repereAvant, s.a.controle.repere);
  assert.equal(b.repere, '2026-10-05T12:00:00.000Z', 'le repère avance à la dernière mise à jour lue');
  assert.equal(b.saisonsRecomptees, 3);
  const nouvelles = s.b.anomalies.filter((a) => !s.a.ids.includes(a.id));
  const cle = (a) => `${a.type}/${a.sorte}|${a.matchKey}`;
  const n = new Set(nouvelles.map(cle));
  assert.ok(n.has('impossible/equipe|2026-09-27-arsenal-leeds'), [...n].join(' ; '));
  assert.ok(n.has('doublon/sens-inverse|2026-09-12-fulham-liverpool'));
  assert.ok(n.has('zero/zeros|2026-09-27-auda-rfs'));
  const inverse = nouvelles.find((a) => a.sorte === 'sens-inverse');
  assert.deepEqual(inverse.matchs, ['2026-09-12-fulham-liverpool', '2026-09-12-liverpool-fulham'], 'la nouvelle rencontre et l’ANCIENNE qu’elle double');
  // L'ancienne rencontre modifiée en douce : pas relue cette nuit…
  const o1 = 'impossible:equipe:2026-09-14-leeds-newcastle';
  assert.equal(s.a.ids.includes(o1), false);
  assert.equal(s.b.ids.includes(o1), false, 'la passe de nuit n’a pas relu une rencontre ancienne');
  // … mais le contrôle complet suivant la voit : ce n'est pas le contrôle qui la manque.
  assert.equal(s.c.ids.includes(o1), true);
  // La rencontre retirée : son anomalie est levée, sa saison recomptée (une de moins).
  const d1 = 'impossible:equipe:2026-09-15-ipswich-town-arsenal';
  assert.equal(s.a.ids.includes(d1), true);
  assert.equal(s.b.ids.includes(d1), false);
  assert.equal(b.anomaliesLevees, 1);
  assert.equal(s.lignes.coupeB.rencontres, s.lignes.coupeA.rencontres - 1);
  assert.equal(s.lignes.eplB.rencontres, s.lignes.eplA.rencontres + 2);
  assert.equal(s.lignes.lettonieB.rencontres, s.lignes.lettonieA.rencontres + 1);
  // Le reste du carnet est repris TEL QUEL (rien recompté) : seules les trois saisons touchées changent.
  const avant = new Map(s.a.carnet.map((l) => [`${l.league}|${l.season}`, JSON.stringify(l)]));
  const changees = s.b.carnet.filter((l) => avant.get(`${l.league}|${l.season}`) !== JSON.stringify(l)).map((l) => `${l.league}|${l.season}`).sort();
  assert.deepEqual(changees, ['EFL Cup|2026', 'EPL|2026', 'Virsliga - Latvia|2026']);
  assert.equal(s.b.carnet.length, s.a.carnet.length);
  // Les dates : la passe de nuit tourne le lendemain à 3 h. Une anomalie NOUVELLE est trouvée et contrôlée à 3 h ;
  // une anomalie REPRISE (rencontre non relue) garde sa date de découverte ET celle du contrôle qui l'a vue ;
  // une anomalie REFAITE (saison recomptée) garde sa date de découverte, avec la date du contrôle de cette nuit.
  const NUIT = '2026-10-06T03:00:00.000Z';
  assert.equal(b.le, NUIT);
  assert.ok(nouvelles.every((a) => a.trouveeLe === NUIT && a.controleLe === NUIT));
  const reprise = s.b.anomalies.find((a) => a.matchKey === '2026-09-16-auda-ogre-united' && a.type === 'zero');
  const origine = s.a.anomalies.find((a) => a.id === reprise.id);
  assert.deepEqual([reprise.trouveeLe, reprise.controleLe], [origine.trouveeLe, origine.controleLe]);
  assert.equal(origine.controleLe, s.a.controle.le);
  const refaite = s.b.anomalies.find((a) => a.sorte === 'classement-matchs' && a.league === 'Virsliga - Latvia' && s.a.ids.includes(a.id));
  assert.ok(refaite, 'une anomalie du classement letton, saison recomptée cette nuit');
  assert.deepEqual([refaite.trouveeLe, refaite.controleLe], [s.a.controle.le, NUIT]);
  // L'audit des scores de la nuit ne porte que sur les rencontres nouvelles (aucune n'a de ligne joueur).
  assert.equal(b.audit.rencontres, 0);
  // Le dernier contrôle complet est gardé, la passe de nuit s'ajoute à l'historique.
  assert.equal(s.b.complet.le, s.a.controle.le);
  assert.deepEqual(s.b.historique.map((h) => h.mode), ['nuit', 'complet']);
  assert.ok(Number.isInteger(b.dureeMs) && b.dureeMs >= 0);
  assert.ok('rencontres nouvelles' in b.temps && 'saisons recomptées' in b.temps);
});

test('passe de nuit : un joueur refait sous un AUTRE nom garde son groupe d’homonymes — même résultat que le contrôle complet (cas « Tomás » / « Tiago Palacios » du bac)', () => {
  const s = reprises();
  assert.equal(s.complet1.json.ecrit, true, JSON.stringify(s.complet1));
  const groupe = s.a.groupes.find((g) => g.id.includes('fotmob-99999001'));
  assert.ok(groupe, 'le groupe d’homonymes planté est vu par le contrôle complet');
  assert.match(groupe.id, /^identite:homonymes-joueurs:fotmob-9825\|2026\|/);
  assert.ok(groupe.slug, 'la portée garde le nom partagé, que la nuit relit');
  // La nuit : trois rencontres refaites, où aucun des joueurs d'origine ne joue.
  const NUIT = '2026-10-06T03:00:00.000Z';
  assert.equal(s.nuit.json.mode, 'nuit');
  assert.equal(s.nuit.json.rencontresControlees, 3);
  assert.equal(s.baseInchangeeNuit, true);
  // H : le second identifiant joue ce soir sous un autre nom — son groupe n'est pas levé.
  const refait = s.b.groupes.find((g) => g.id === groupe.id);
  assert.ok(refait, 'le groupe n’est pas levé par la passe de nuit');
  assert.deepEqual([refait.trouveeLe, refait.controleLe], [s.a.le, NUIT], 'refait cette nuit, trouvé au premier contrôle');
  // G2 : un groupe NOUVEAU, vu par les autres noms du joueur à l'annuaire (« Ben White »), pas par celui de ce soir.
  const ids = (x) => x.groupes.map((g) => g.id);
  const benWhite = 'identite:homonymes-joueurs:fotmob-9825|2026|fotmob-776151,fotmob-99999002';
  assert.equal(ids(s.a).includes(benWhite), false, 'pas de groupe avant cette nuit');
  const g2 = s.b.groupes.find((g) => g.id === benWhite);
  assert.ok(g2, 'trouvé cette nuit');
  assert.deepEqual([g2.trouveeLe, g2.controleLe], [NUIT, NUIT]);
  // G3 : un des trois « Theo Julienne » renommé par FotMob — le groupe des deux autres refait par le nom de l'ancien groupe.
  const theoAvant = 'identite:homonymes-joueurs:fotmob-9825|2026|fotmob-1624056,fotmob-99999003,fotmob-99999004';
  const theoApres = 'identite:homonymes-joueurs:fotmob-9825|2026|fotmob-1624056,fotmob-99999004';
  assert.deepEqual([ids(s.a).includes(theoAvant), ids(s.a).includes(theoApres)], [true, false]);
  assert.deepEqual([ids(s.b).includes(theoAvant), ids(s.b).includes(theoApres)], [false, true]);
  assert.equal(s.b.groupes.find((g) => g.id === theoApres).slug, 'theo-julienne');
  assert.equal(s.b.controle.anomaliesLevees, 1, 'le groupe de trois');
  // Nouvelles cette nuit : les deux groupes, et l'audit des buteurs d'Arsenal – Chelsea, dont la feuille
  // d'Arsenal (vide dans la base d'essai) a reçu une ligne : la nuit la contrôle comme le contrôle complet.
  const avant = new Set(s.a.ids);
  assert.deepEqual(s.b.ids.filter((id) => !avant.has(id)).sort(), [benWhite, theoApres, 'impossible:buteurs:2026-09-06-arsenal-chelsea:home'].sort());
  assert.equal(s.b.controle.nouvellesAnomalies, 3);
  // Exactement ce que voit le contrôle complet de la même base.
  assert.deepEqual(s.b.ids.slice().sort(), s.b2.ids.slice().sort());
});

test('passe de nuit au-delà de SEUIL_NUIT rencontres modifiées (réécriture de masse) : contrôle complet à la place, raison dite, même résultat, base intacte', () => {
  const s = reprises();
  assert.equal(s.seuil.SEUIL_NUIT, 1000);
  assert.equal(s.seuil.sansCarnet, 'pas encore de carnet');
  assert.equal(s.seuil.autreVersion, "carnet d'une autre version");
  assert.equal(s.seuil.rienDeNeuf, null, 'rien de modifié depuis le repère : la nuit sert, même au seuil 0');
  assert.match(s.seuil.tout, /^2\s156 rencontres nouvelles ou modifiées depuis le contrôle précédent, au-delà de 10 : tout est relu$/);
  assert.equal(s.seuil.nuitRefusee, true, 'controleDeNuit rend null : l’appelant relit tout');
  // La ligne de commande, comme la passe la lance : toutes les rencontres réécrites → contrôle complet.
  assert.equal(s.masse.json.ecrit, true);
  assert.equal(s.masse.json.mode, 'complet');
  assert.match(s.masse.json.raison, /^2\s156 rencontres nouvelles ou modifiées depuis le contrôle précédent, au-delà de 1\s000 : tout est relu$/);
  assert.equal(s.masse.json.rencontresControlees, 2156);
  assert.deepEqual(s.c.ids.slice().sort(), s.b2.ids.slice().sort(), 'rien de neuf dans les données : les mêmes anomalies');
  assert.equal(s.masse.json.nouvellesAnomalies, 0);
  assert.equal(s.masse.json.nouvellesErreurs, 0);
  assert.deepEqual(s.c.historique, ['complet', 'complet', 'nuit', 'complet']);
  assert.equal(s.baseInchangeeMasse, true);
});

test('contrôle sans relire les pages de compétition : leurs rencontres absentes sont REPRISES, datées de leur lecture ; la saison en cours relue (omissions) remplace la liste, sauf compétition en échec', () => {
  const p = reprises().pagesFotmob;
  const T1 = '2026-10-01T03:00:00.000Z';
  const ids = (x) => x.absentes.map((a) => a.id).sort();
  // 1. Lecture des pages : la saison passée (88800020) et la saison en cours (88800021).
  assert.deepEqual(ids(p.e1), ['manquant:calendrier-fotmob:88800020', 'manquant:calendrier-fotmob:88800021']);
  assert.ok(p.e1.absentes.every((a) => a.trouveeLe === T1 && a.controleLe === T1));
  assert.deepEqual([p.e1.fotmob.lu, p.e1.fotmob.le, p.e1.fotmob.signalees], [true, T1, 2]);
  assert.equal(p.e1.nouvellesErreurs, null, 'premier contrôle : rien à comparer');
  // 2. Contrôle complet suivant, pages non relues : les deux reprises, avec la date de la lecture.
  assert.deepEqual(ids(p.e2), ids(p.e1));
  assert.ok(p.e2.absentes.every((a) => a.trouveeLe === T1 && a.controleLe === T1), 'contrôlées à la lecture des pages, pas après');
  assert.deepEqual(p.e2.fotmob, p.e1.fotmob, 'ce qu’a dit la dernière lecture, daté');
  assert.equal(p.e2.nouvellesErreurs, 0);
  // 3. L'étape « omissions » relit la saison en cours et n'y trouve plus rien : 88800021 levée, 88800020 (saison passée) reprise.
  assert.deepEqual(ids(p.e3), ['manquant:calendrier-fotmob:88800020']);
  assert.deepEqual(ids(p.n3), ['manquant:calendrier-fotmob:88800020'], 'la passe de nuit, même règle');
  // ... sauf si la compétition était en échec ce soir-là : rien de relu, tout repris.
  assert.deepEqual(ids(p.e3echec), ids(p.e1));
});

// ======================================== 5. jamais d'écriture, jamais pendant un import

test('la base n’est JAMAIS écrite : même empreinte avant et après chaque contrôle (complet, de nuit, de la passe)', () => {
  assert.equal(types().baseInchangee, true);
  assert.equal(nuit().baseApresComplet, true);
  assert.equal(nuit().baseApresNuit, true);
  assert.equal(verrou().baseInchangee, true);
  assert.equal(verrou().baseInchangeeFin, true);
  assert.equal(route().baseInchangee, true);
});

test('jamais pendant un import ni en parallèle : verrou tenu par un autre processus → rien fait ; « dans la passe » exige le verrou de son PARENT', () => {
  const s = verrou();
  assert.deepEqual(s.pendantImport.json, { reporte: "verrou d'actualisation tenu par un autre processus (import ou passe en cours) : rien fait.", ecrit: false });
  assert.equal(s.carnetPendantImport, false, 'aucun carnet écrit pendant l’import');
  assert.equal(s.dansLaPasseAutre.json.ecrit, false);
  assert.match(s.dansLaPasseAutre.json.refus, /n'est pas tenu par le processus parent \(tenu par \d+\) — rien fait/);
  assert.equal(s.carnetApresRefus, false);
  assert.match(s.dansLaPasseSansVerrou.json.refus, /\(libre\) — rien fait/);
  assert.equal(s.carnetSansVerrou, false);
  assert.equal(s.dansLaPasseParent.json.ecrit, true);
  assert.equal(s.carnetParent, true);
  // Seul, le contrôle prend le verrou et le rend ; le carnet existant : passe de nuit.
  assert.equal(s.seul.json.ecrit, true);
  assert.equal(s.seul.json.mode, 'nuit');
  assert.equal(s.seul.json.rencontresControlees, 0);
  assert.equal(s.verrouRendu, true);
});

test('l’étape « carnetSante » de la passe : sous le verrou de la passe, le rapport des omissions par l’entrée standard ; pendant un import, rien fait et rien écrit', () => {
  const s = verrou();
  assert.equal(s.etape.verrouTenu, true);
  assert.equal(s.etape.status, 'ok');
  // Retouche du 07/10 au soir : le résumé dit, comme les autres étapes, le plus long moment passé sans rendre la main (« le serveur jamais tenu plus de X ms d'affilée »).
  assert.match(s.etape.summary, /^Contrôle complet de 2\s156 rencontres \(pas encore de carnet\) en 0 s \(le serveur jamais tenu plus de \d+ ms d'affilée\) : 189 anomalies au carnet \(match manquant : 122, zéro « non relevé » : 64, club ou joueur mal identifié : 3\)/);
  assert.match(s.etape.summary, /Rien n'est corrigé automatiquement\.$/);
  assert.ok(Number.isFinite(s.etape.details.blocMaxMs) && s.etape.details.blocMaxMs >= 0 && s.etape.details.pauses > 0, JSON.stringify(s.etape.details));
  assert.deepEqual(s.etapeOmissions, { lues: 4, signalees: 1, ecartees: { avantLeMagasin: 1, horsPerimetre: 0, importeesDepuis: 1, autreIdentifiant: 1 } });
  assert.deepEqual(s.etapeAnomalies.map((a) => a.id), ['manquant:calendrier-fotmob:88800001']);
  assert.equal(s.etapePendantImport.status, 'error');
  assert.match(s.etapePendantImport.summary, /^Rien fait : --dans-la-passe : le verrou d'actualisation n'est pas tenu par le processus parent/);
  assert.equal(s.etapePendantImport.carnetIntact, true);
});

// ================================================================ 6. la route

test('GET /api/match-stats/health : lit l’état préparé — jamais contrôlé, prêt, filtres, limite, refus clairs, illisible — sans rien écrire', () => {
  const s = route();
  const j = s.jamais;
  assert.equal(j.code, 200);
  assert.equal(j.corps.etat, 'jamais');
  assert.deepEqual([j.corps.carnet, j.corps.anomalies, j.corps.anomaliesTotal], [[], [], 0]);
  assert.deepEqual([j.corps.types.length, j.corps.donnees.length, j.corps.seuils], [6, 6, { bon: 90, partiel: 50 }]);
  const p = s.pret.corps;
  const f = s.etatFichier;
  assert.equal(p.etat, 'pret');
  assert.deepEqual(p.carnet, f.carnet);
  assert.deepEqual(p.totaux, f.totaux);
  assert.equal(p.anomaliesTotal, f.anomalies.length);
  assert.equal(p.anomalies.length, Math.min(300, f.anomalies.length));
  assert.ok(p.anomalies.every((a) => !('portee' in a)), 'la portée ne sert qu’au contrôle suivant');
  assert.deepEqual(p.anomalies.map((a) => a.id), f.anomalies.slice(0, 300).map((a) => a.id), 'erreurs d’abord, dans l’ordre du carnet');
  assert.equal(p.controle.mode, 'complet');
  const z = s.zero.corps;
  assert.ok(z.anomalies.length > 0 && z.anomalies.every((a) => a.type === 'zero'));
  assert.equal(z.anomaliesFiltrees, f.anomalies.filter((a) => a.type === 'zero').length);
  assert.ok(s.info.corps.anomalies.every((a) => a.gravite === 'info'));
  assert.ok(s.lettonie.corps.anomalies.length > 0 && s.lettonie.corps.anomalies.every((a) => a.league === 'Virsliga - Latvia' && a.season === 2026));
  assert.deepEqual([s.limite.corps.anomalies.length, s.limite.corps.anomaliesFiltrees], [2, f.anomalies.length]);
  assert.equal(s.typeInconnu.code, 400);
  assert.match(s.typeInconnu.corps.error, /Type d'anomalie inconnu : « bidon » \(attendu : doublon, competition, manquant, impossible, zero, identite\)/);
  assert.equal(s.graviteInconnue.code, 400);
  assert.equal(s.limiteZero.code, 400);
  assert.equal(s.runtimeInchange, true, 'la route n’écrit rien dans data/runtime');
  assert.equal(s.illisible.code, 200);
  assert.equal(s.illisible.corps.etat, 'illisible');
  assert.match(s.illisible.corps.erreur, /carnet-sante\.json illisible/);
  assert.deepEqual(s.illisible.corps.carnet, [], 'la même forme, vide : l’écran garde son tableau');
  assert.equal(s.formeInattendue.corps.etat, 'illisible');
});

// ========================================================== 7. lecture du code

const lire = (...p) => fs.readFileSync(path.join(SERVEUR, ...p), 'utf8');

test('lecture du code : les contrôles existants réutilisés (aucune seconde voie), la base ouverte en lecture seule, aucun réseau hors de la demande explicite', () => {
  const sante = lire('src', 'data', 'db', 'dataHealth.js');
  // Réutilisés : l'audit des scores, la confrontation aux classements officiels, la recherche des doublons, les manquants de FotMob.
  // (Retouche du 07/10 au soir : ils sont lus par leur version « par morceaux », le même code que l'ancienne fonction synchrone, qui en est l'enveloppe.)
  assert.match(sante, /import \{ auditScoresParMorceaux \} from '\.\/scoreAudit\.js'/);
  assert.match(sante, /import \{ confronterClassementsParMorceaux \} from '\.\/standingsCheck\.js'/);
  assert.match(sante, /from '\.\/doublons\.js'/);
  assert.match(lire('src', 'data', 'db', 'scoreAudit.js'), /export function auditScores\(options\) \{\s*return executerSansPause\(auditScoresParMorceaux\(options\)\);/);
  assert.match(lire('src', 'data', 'db', 'standingsCheck.js'), /export function confronterClassements\(options = \{\}\) \{[\s\S]*?executerSansPause\(confronterClassementsParMorceaux\(/);
  assert.match(sante, /ZERO_MEANS_ABSENT \} from '\.\/columns\.js'/);
  // Les scripts d'avant passent par les mêmes modules.
  assert.match(lire('scripts', 'verify-standings.mjs'), /import \{ confronterClassements \} from '\.\.\/src\/data\/db\/standingsCheck\.js'/);
  assert.match(lire('scripts', 'merge-duplicate-matches.mjs'), /import \{ rencontresEnDouble \} from '\.\.\/src\/data\/db\/doublons\.js'/);
  assert.match(lire('src', 'data', 'providers', 'espnMatchStatsProvider.js'), /import \{ ZERO_MEANS_ABSENT \} from '\.\.\/db\/columns\.js'/);
  assert.doesNotMatch(lire('src', 'data', 'providers', 'espnMatchStatsProvider.js'), /const ZERO_MEANS_ABSENT/);
  // Lecture seule : aucune requête d'écriture dans les modules du contrôle.
  for (const f of [['src', 'data', 'db', 'dataHealth.js'], ['src', 'data', 'db', 'doublons.js'], ['src', 'data', 'db', 'standingsCheck.js']]) {
    const code = lire(...f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM)\b|\.exec\(|BEGIN/, f.join('/'));
    assert.doesNotMatch(code, /fetch\(|node:https?|openDb\(/, f.join('/'));
  }
  const cliCode = lire('scripts', 'data-health.mjs');
  assert.match(cliCode, /new DatabaseSync\(fichierBase, \{ readOnly: true \}\)/);
  assert.match(cliCode, /withRefreshLock\(\(\) => controler\(args\), \{ stamp: false \}\)/);
  assert.match(cliCode, /detenteur\.pid !== process\.ppid/);
  // Le réseau (pages de compétition FotMob) : seulement avec --calendrier-fotmob, par un import à la demande.
  assert.match(cliCode, /if \(args\.fotmob\) \{[\s\S]*await import\('\.\.\/src\/data\/providers\/fotMobFixtureGaps\.js'\)/);
  assert.doesNotMatch(cliCode, /^import .*fotMob/m);
  // L'étape de l'actualisation : après le contrôle des scores, une fois par jour, dans un processus à part, sous le verrou de la passe.
  const job = lire('src', 'jobs', 'matchStatsAutoRefresh.js');
  assert.ok(job.indexOf("key: 'controle'") < job.indexOf("key: 'carnetSante'") && job.indexOf("key: 'carnetSante'") < job.indexOf("key: 'cotesPassees'"));
  assert.match(job, /due: \(ctx\) => ctx\.manuel \|\| !faitAujourdhui\(ctx\.derniere\('carnetSante'\)\)/);
  assert.match(job, /'--dans-la-passe', \.\.\.\(ctx\.omissions \? \['--omissions', '-'\] : \[\]\)/);
  assert.match(job, /ctx\.omissions = r;/);
  // La route : une seule lecture, déclarée avant « /:matchId » qui l'attraperait.
  const routes = lire('src', 'api', 'routes', 'matchStats.routes.js');
  assert.ok(routes.indexOf("router.get('/health'") > 0 && routes.indexOf("router.get('/health'") < routes.indexOf("router.get('/:matchId'"));
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\('\/health/);
});

// ============================================== 8. rendre la main (retouche du 07/10 au soir)
//
// Le contrôle complet durait 77 s d'une traite sur la base du bac (dont 53 s l'audit des scores) : aucun module du
// contrôle ne rendait jamais la main à la boucle d'événements. Il la rend maintenant, au plus toutes les 25 ms de travail
// et à chaque fin d'étape — sans rien changer à ce qu'il rend. La phase « main » du script d'essai joue le contrôle
// complet puis la passe de nuit sur les anomalies plantées, chacun de trois façons : comme d'habitude, sans jamais rendre
// la main, et en la rendant à CHAQUE point d'arrêt (pour de vrai, avec un concurrent qui compte ses tours de boucle).

const FIXTURE_AVANT = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'carnet-sante-avant-pauses.json'), 'utf8'));
/** Le chemin de la première différence entre deux valeurs JSON, ou null : de quoi lire un échec sans ouvrir 300 Ko. */
function premiereDifference(a, b, chemin = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b)) return `${chemin} : ${JSON.stringify(a)?.slice(0, 150)} ≠ ${JSON.stringify(b)?.slice(0, 150)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = premiereDifference(a[k], b[k], `${chemin}.${k}`);
    if (d) return d;
  }
  return null;
}

test('le contrôle complet et la passe de nuit RENDENT LA MAIN : à chaque fin d’étape, aux points d’arrêt de chaque boucle longue (autant de pauses que la base l’exige), et la boucle d’événements respire pendant qu’ils tournent', () => {
  const s = principal();
  // Le nombre MINIMAL de pauses, par endroit, que cette base d'essai exige (celui d'aujourd'hui, avec de la marge) : retirer le point d'arrêt d'une boucle fait tomber son compte.
  const minimum = {
    complet: {
      // Une pause à la fin de chaque étape (même sur une toute petite base)…
      ...Object.fromEntries(['doublons', 'audit des scores', 'classements officiels', 'homonymes (joueurs)', 'lignes joueur'].map((e) => [e, 1])),
      // … et dans les boucles où le temps passe : une pause tous les 8 matchs lus (2 160 matchs), tous les 256 tours des lignes d'équipe et des contrôles par match,
      // à chaque rencontre dont le jour est relu (club deux fois le même jour), tous les 8 groupes de feuilles joueur et 4 rencontres rapprochées de l'audit,
      // à chaque groupe d'homonymes de l'annuaire, tous les 1 024 tours du carnet et des clubs homonymes, et pour chaque classement : sa lecture d'avance, puis son calcul.
      rencontres: 250,
      'statistiques d’équipe': 15,
      'contrôles par rencontre': 8,
      'club deux fois le même jour': 7,
      'joueurs aux chiffres impossibles': 4,
      'audit : feuilles joueur': 10,
      'audit : rapprochement des scores': 10,
      'audit : calendrier de saison lu': 1,
      'audit : résultats lus': 1,
      'homonymes (joueurs) : annuaire': 3,
      'homonymes (joueurs) : apparitions': 1,
      'homonymes (clubs)': 3,
      carnet: 3,
      'classements : EPL 2026 (lecture)': 20,
      'classements : EPL 2026 (calculé)': 1
    },
    nuit: {
      ...Object.fromEntries(['rencontres nouvelles', 'rencontres', 'statistiques d’équipe', 'lignes joueur', 'joueurs aux chiffres impossibles', 'doublons', 'audit des scores', 'homonymes (joueurs)', 'saisons recomptées', 'classements officiels'].map((e) => [e, 1])),
      'rencontres modifiées depuis le dernier contrôle': 3,
      'rencontres par saison': 2,
      'doublons : lecture des rencontres': 3,
      'doublons : rencontres du même jour': 3,
      'doublons : sens inverse': 3,
      'doublons : même identifiant FotMob': 3,
      'rencontres du même jour': 2,
      'club deux fois le même jour': 3,
      'homonymes (joueurs) : joueurs des rencontres': 1,
      'rencontres d’une saison': 20,
      'classements : EPL 2026 (lecture)': 20
    }
  };
  for (const mode of ['complet', 'nuit']) {
    const p = s.chaquePoint[mode];
    const trop_peu = Object.entries(minimum[mode])
      .filter(([etiquette, n]) => (p.etiquettes[etiquette] ?? 0) < n)
      .map(([etiquette, n]) => `« ${etiquette} » : ${p.etiquettes[etiquette] ?? 0} pause(s), ${n} au moins attendue(s)`);
    assert.deepEqual(trop_peu, [], `${mode} : les points d'arrêt qui manquent`);
    // Beaucoup de pauses (1 422 pour le contrôle complet, 181 pour la nuit sur cette base) : un contrôle qui ne rendrait la main qu'entre ses étapes n'en aurait qu'une dizaine.
    assert.ok(p.appels >= (mode === 'complet' ? 1000 : 100), `${mode} : ${p.appels} pauses`);
    // La boucle d'événements a VRAIMENT respiré : un concurrent qui se replanifie à chaque tour a tourné aux points d'arrêt.
    assert.ok(p.ticks >= p.appels / 2, `${mode} : ${p.ticks} tours de boucle pour ${p.appels} pauses`);
  }
});

test('la lecture des lignes joueur aux chiffres impossibles se découpe en plages de rencontres sans changer ce qu’elle rend : mêmes lignes, même ordre, plages d’une seule rencontre comprises, et que les rencontres soient lues par plages ou par lots de clés', () => {
  const s = principal();
  // Douze feuilles aux minutes impossibles plantées dans douze rencontres, sur toute la base, plus celle de la phase « types » : 13 rencontres, 13 lignes.
  assert.equal(s.plages.rencontres, 13);
  assert.equal(s.plages.lignes, 13);
  for (const plage of [1, 7, 1000]) assert.equal(s.plages.parPlages[plage], s.plages.parCles, `plages de ${plage} rencontre(s)`);
});

test('le plus long moment passé sans rendre la main est mesuré et noté (blocMaxMs, blocMaxOu, pauses) — comme aux autres étapes ; il tient en quelques dizaines de millisecondes sur cette base', () => {
  const s = principal();
  for (const mode of ['complet', 'nuit']) {
    for (const maniere of ['ordinaire', 'sansPause', 'chaquePoint']) {
      const m = s.mesures[mode][maniere];
      assert.ok(Number.isInteger(m.blocMaxMs) && m.blocMaxMs >= 0, `${mode}/${maniere} : ${JSON.stringify(m)}`);
      assert.equal(typeof m.blocMaxOu, 'string');
      assert.ok(m.pauses >= (mode === 'complet' ? 11 : 6), `${mode}/${maniere} : ${m.pauses} pauses (au moins une à la fin de chaque étape)`);
    }
    // Pause à chaque point d'arrêt : aucun pas ne dépasse quelques dizaines de ms ; large marge pour une machine chargée.
    assert.ok(s.mesures[mode].chaquePoint.blocMaxMs < 500, `${mode} : ${s.mesures[mode].chaquePoint.blocMaxMs} ms`);
  }
  // Sans point d'arrêt, tout le contrôle ne ferait qu'un seul tronçon : les pauses de fin d'étape seules.
  assert.equal(s.mesures.complet.sansPause.pauses, 11);
  assert.equal(s.mesures.nuit.sansPause.pauses, 6);
});

test('rendre la main ne change AUCUN résultat : avec ou sans pause, mêmes anomalies, même carnet, même tout ; et identique à ce que rendait le code d’AVANT (fixture produite avant la retouche)', () => {
  const s = principal();
  for (const mode of ['complet', 'nuit']) {
    const e = s.empreintes[mode];
    assert.equal(e.sansPause, e.ordinaire, `${mode} : sans pause`);
    assert.equal(e.chaquePoint, e.ordinaire, `${mode} : une pause à chaque point d'arrêt`);
    assert.equal(premiereDifference(s.reference[mode], FIXTURE_AVANT[mode]), null, `${mode} : le résultat d'aujourd'hui, face à celui du code d'avant`);
  }
  // La référence n'est pas vide : 222 anomalies au contrôle complet, 54 lignes au carnet ; la nuit en refait trois rencontres.
  assert.equal(FIXTURE_AVANT.complet.anomalies.length, 222);
  assert.equal(FIXTURE_AVANT.complet.carnet.length, 54);
  assert.equal(FIXTURE_AVANT.nuit.controle.mode, 'nuit');
  assert.equal(s.rencontres.nuit, 3);
});

test('la lecture du carnet précédent, la décision « nuit ou complet » et le calendrier du script rendent la main eux aussi ; le script en dit le résultat (blocMaxMs, blocMaxOu, pauses)', () => {
  const script = lire('scripts', 'data-health.mjs');
  assert.match(script, /pourquoiPasDeNuitParMorceaux\(database, precedent\)/);
  assert.match(script, /lireJsonEnDeuxTemps\(CALENDRIER, null/);
  assert.match(script, /blocMaxMs: c\.blocMaxMs \?\? null,\s*blocMaxOu: c\.blocMaxOu \?\? null,\s*pauses: c\.pauses \?\? null/);
  // Les fichiers lourds ne se lisent plus d'une traite : aucun readJsonFile dans le script ni dans l'audit.
  assert.doesNotMatch(script, /readJsonFile/);
  assert.doesNotMatch(lire('src', 'data', 'db', 'scoreAudit.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /readJsonFile/);
});
