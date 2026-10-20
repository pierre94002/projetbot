/**
 * Le déroulé du match donné à l'IA de la revue d'après-match (étape 43 du plan).
 *   node --test test/deroulePourIA.test.mjs        (depuis server/)
 *
 * AUCUN Claude, aucun réseau : les fonctions pures (lecture FotMob des
 * événements, déroulé, texte minute par minute) tournent ici même sur de VRAIES
 * données — deux vraies pages FotMob réduites, onze vrais matchs de la base
 * d'essai (événements stockés, forme d'avant l'étape), deux vrais fichiers de
 * texte minute par minute réduits ; la chaîne complète tourne dans des copies
 * ISOLÉES (test/aides/isolement.mjs : base d'essai, réseau coupé, heure figée)
 * avec Claude simulé et un faux FotMob (test/aides/script-deroule.mjs).
 *
 *  1. La lecture FotMob des événements (mapEvents) : penalty marqué, penalty
 *     manqué, but contre son camp, jaune, deuxième jaune, rouge, remplacement,
 *     blessé ; les champs d'avant inchangés ; les types ignorés.
 *  2. Le déroulé (lireDeroule, lignesDuDeroule) : les anciens événements stockés
 *     donnent les penalties (par `detail`) et les penalties manqués (carte des
 *     tirs, jamais la séance de tirs au but) ; le but contre son camp écrit pour
 *     le bon camp ; cartons et « à dix » ; remplacements ; 10 à 20 lignes ;
 *     déroulé non publié, partiel, incomplet, attribué.
 *  3. Le rendu dans la fiche compacte : section des faits, statistiques sans
 *     les zéros « non relevé », ancien rendu intact sans déroulé.
 *  4. Le texte minute par minute de FotMob : langues, extraits retenus, lecture.
 *  5. La chaîne complète : consignes fixes, ancienne forme à l'octet près (empreintes
 *     figées par le code d'AVANT), texte demandé ou non, lecteurs d'événements
 *     d'avant, et les 201 matchs à déroulé de la base d'essai comptés un à un.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { mapEvents } from '../src/data/providers/fotMobProvider.js';
import * as D from '../src/core/ai/derouleDuMatch.js';
import * as C from '../src/core/ai/compactContext.js';
import * as P from '../src/core/ai/matchAiAnalysisPrompt.js';
import * as T from '../src/data/providers/fotMobCommentaire.js';

const lire = (nom) => JSON.parse(fs.readFileSync(path.join(FIXTURES, nom), 'utf8'));
const PAGES = lire('evenements-fotmob-etape-43.json');
const MATCHS = lire('deroules-etape-43.json');
const TEXTES = lire('commentaire-fotmob-etape-43.json');
const REFERENCE = lire('revue-ancienne-etape-43.json').refs;
const F41 = lire('fiche-ia-etape-41.json');

const noms = { home: 'Domicile', away: 'Extérieur' };
const deroulerMatch = (m, plus = {}) => D.lireDeroule({ events: m.events, shotmap: m.shotmap, meta: m.meta, score: m.score, ...plus });
const chrono = (m) => D.lignesDeLaChronologie(deroulerMatch(m), { home: m.home, away: m.away });
const toutes = (m) => D.lignesDuDeroule(deroulerMatch(m), { home: m.home, away: m.away });

// Des événements à la forme du magasin.
const but = (minute, side, player, extra = {}) => ({ type: 'goal', minute, side, player, ...extra });
const carton = (minute, side, player, card, extra = {}) => ({ type: 'card', minute, side, player, card, ...extra });
const remplacement = (minute, side, playerIn, playerOut, extra = {}) => ({ type: 'substitution', minute, side, addedTime: 0, playerIn, playerOut, ...extra });
const manque = (minute, side, player) => ({ type: 'missedpenalty', minute, side, player });
const lignes = (events, plus = {}, n = noms) => {
  const d = D.lireDeroule({ events, ...plus });
  return D.lignesDeLaChronologie(d, n);
};

// ============================================================ 1. la lecture FotMob
/** Une page FotMob réduite à ce que lit le lecteur, avec ses événements bruts. */
const page = (events, homeId = 10) => ({ general: { homeTeam: { id: homeId }, awayTeam: { id: 20 } }, content: { matchFacts: { events: { events } } } });
const brutBut = (extra = {}) => ({ type: 'Goal', time: 10, overloadTime: null, isHome: true, player: { id: 1, name: 'Joueur A' }, ownGoal: null, goalDescription: null, goalDescriptionKey: null, ...extra });
const parType = (events) => events.reduce((n, e) => ({ ...n, [e.type]: (n[e.type] ?? 0) + 1 }), {});

test('lecture FotMob, vraie page (Columbus – Inter Miami) : penalty marqué, deuxième jaune, jaune à un remplaçant hors du terrain, camps — et rien d’autre que les trois types d’avant', () => {
  const e = mapEvents(PAGES.columbus_inter_miami);
  assert.deepEqual(parType(e), { goal: 3, card: 11, substitution: 7 }, 'les « Half » et le reste ne sont pas du déroulé');
  assert.deepEqual(e.find((x) => x.type === 'goal' && x.penalty), { type: 'goal', minute: 28, side: 'home', player: 'Josef Martínez', playerId: 'fotmob-239287', detail: 'Penalty', penalty: true });
  // Messi : ni penalty, ni détail.
  assert.deepEqual(e.find((x) => x.player === 'Lionel Messi'), { type: 'goal', minute: 33, side: 'away', player: 'Lionel Messi', playerId: 'fotmob-30981' });
  // La deuxième jaune du remplaçant entré, 90+6 : un « yellowred », pas un « red ».
  assert.deepEqual(e.find((x) => x.card === 'yellowred'), { type: 'card', minute: 90, side: 'away', addedTime: 6, player: 'Santiago Morales', playerId: 'fotmob-1529403', card: 'yellowred' });
  // Le jaune montré au gardien resté sur le banc à la 90+10 : la note de FotMob est gardée.
  const horsTerrain = e.find((x) => x.player === 'Luis Barraza');
  assert.deepEqual([horsTerrain.card, horsTerrain.note, horsTerrain.side, horsTerrain.addedTime], ['yellow', 'not_on_pitch', 'away', 10]);
  // Un remplacement non blessé n'a pas de drapeau.
  assert.deepEqual(e.find((x) => x.type === 'substitution'), { type: 'substitution', minute: 40, side: 'away', addedTime: 0, playerIn: 'David Ayala', playerOut: 'Yannick Bright' });
  // Dans l'ordre du jeu : les minutes ne reculent jamais.
  assert.ok(e.every((x, i) => i === 0 || x.minute >= e[i - 1].minute));
});

test('lecture FotMob, vraie page (Mönchengladbach – Mayence) : penalty manqué, penalty marqué, blessé, raison de chaque carton', () => {
  const e = mapEvents(PAGES.gladbach_mainz);
  assert.deepEqual(parType(e), { goal: 7, card: 11, substitution: 9, missedpenalty: 1 }, 'AddedTime, Half et Comment restent ignorés');
  // Le penalty manqué (sur le poteau) : son propre type, jamais « goal », au camp de celui qui tirait.
  assert.deepEqual(e.find((x) => x.type === 'missedpenalty'), { type: 'missedpenalty', minute: 57, side: 'home', player: 'Kevin Diks', playerId: 'fotmob-566158' });
  assert.deepEqual(e.filter((x) => x.penalty).map((x) => [x.minute, x.addedTime, x.player, x.detail]), [[90, 5, 'Shuto Machino', 'Penalty']]);
  // Le blessé : un seul remplacement porte le drapeau.
  assert.deepEqual(e.filter((x) => x.injured).map((x) => [x.minute, x.playerIn, x.playerOut]), [[65, 'Danny da Costa', 'Anthony Caci']]);
  // Les raisons des cartons, sans le préfixe de FotMob.
  const raisons = e.filter((x) => x.reason).map((x) => x.reason).sort();
  assert.deepEqual(raisons, ['dissent', 'dissent', 'foul', 'foul', 'time_wasting', 'time_wasting', 'time_wasting']);
  // Le but de la 45e + 1 : minute 45, temps ajouté 1 (première période).
  assert.deepEqual(e.find((x) => x.player === 'Sheraldo Becker'), { type: 'goal', minute: 45, side: 'away', addedTime: 1, player: 'Sheraldo Becker', playerId: 'fotmob-495222', assist: 'Anthony Caci', detail: 'Header' });
});

/** La lecture d'AVANT l'étape 43, recopiée telle quelle : la référence des champs qui ne doivent pas bouger. */
function ancienMapEvents(payload) {
  const premierNombre = (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const m = String(raw).match(/-?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  };
  const identifiant = (id) => (Number(id) > 0 ? `fotmob-${Number(id)}` : null);
  const raw = payload?.content?.matchFacts?.events?.events;
  if (!Array.isArray(raw)) return [];
  const homeId = payload?.general?.homeTeam?.id;
  const out = [];
  for (const event of raw) {
    const type = String(event.type ?? '');
    if (!['Goal', 'Card', 'Substitution'].includes(type)) continue;
    const entry = { type: type.toLowerCase(), minute: premierNombre(event.time), side: event.isHome === undefined ? (String(event.teamId ?? '') === String(homeId) ? 'home' : 'away') : event.isHome ? 'home' : 'away' };
    if (event.overloadTime != null) entry.addedTime = premierNombre(event.overloadTime);
    if (type === 'Goal') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      const acteur = identifiant(event.player?.id ?? event.playerId);
      if (acteur) entry.playerId = acteur;
      if (event.assistStr) entry.assist = String(event.assistStr).replace(/^.*?by\s+/i, '');
      if (event.ownGoal) entry.ownGoal = true;
      if (event.goalDescription) entry.detail = event.goalDescription;
    } else if (type === 'Card') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      const acteur = identifiant(event.player?.id ?? event.playerId);
      if (acteur) entry.playerId = acteur;
      entry.card = event.card ? String(event.card).toLowerCase() : 'yellow';
    } else if (type === 'Substitution' && Array.isArray(event.swap)) {
      entry.playerIn = event.swap[0]?.name ?? null;
      entry.playerOut = event.swap[1]?.name ?? null;
    }
    out.push(entry);
  }
  return out.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

test('lecture FotMob : les champs d’AVANT l’étape sont inchangés, événement par événement et dans le même ordre (le magasin, ses lecteurs et l’écran les lisent tels quels)', () => {
  for (const [nom, p] of Object.entries(PAGES)) {
    const neufs = mapEvents(p);
    const memesChamps = neufs
      .filter((e) => e.type !== 'missedpenalty')
      .map(({ penalty, reason, note, injured, ...reste }) => reste);
    assert.deepEqual(memesChamps, ancienMapEvents(p), nom);
    // Seuls les champs nouveaux se sont ajoutés, et seulement sur les événements concernés.
    for (const e of neufs) {
      if (e.penalty) assert.equal(e.detail, 'Penalty', 'le détail lu par les repères de championnat est gardé');
      assert.ok(e.type === 'card' || (!e.reason && !e.note));
      assert.ok(e.type === 'substitution' || !e.injured);
    }
  }
});

test('lecture FotMob, cas fabriqués : penalty par la seule description, but contre son camp, tête, camp par l’équipe, types inconnus, séance de tirs au but', () => {
  const lu = (events, homeId) => mapEvents(page(events, homeId));
  // Un penalty que FotMob ne décrit que par le texte (sans clé) est reconnu ; son détail reste « Penalty ».
  assert.deepEqual(lu([brutBut({ goalDescription: 'Penalty' })]), [{ type: 'goal', minute: 10, side: 'home', player: 'Joueur A', playerId: 'fotmob-1', detail: 'Penalty', penalty: true }]);
  // Un but contre son camp : le drapeau d'avant, jamais « penalty » ; le camp est celui que donne FotMob (le camp crédité).
  const csc = lu([brutBut({ isHome: false, ownGoal: true, goalDescription: 'Own goal', goalDescriptionKey: 'own_goal' })])[0];
  assert.deepEqual(csc, { type: 'goal', minute: 10, side: 'away', player: 'Joueur A', playerId: 'fotmob-1', ownGoal: true, detail: 'Own goal' });
  // Une tête : un détail, pas un penalty.
  assert.deepEqual(lu([brutBut({ goalDescription: 'Header', goalDescriptionKey: 'header' })])[0].penalty, undefined);
  // Le camp par l'identifiant de l'équipe quand `isHome` manque.
  assert.equal(lu([{ type: 'Card', time: 5, teamId: 10, card: 'Yellow', player: { id: 3, name: 'B' } }], 10)[0].side, 'home');
  assert.equal(lu([{ type: 'Card', time: 5, teamId: 20, card: 'Yellow', player: { id: 3, name: 'B' } }], 10)[0].side, 'away');
  // Un carton sans couleur est jaune (comme avant) ; l'identifiant 0 n'est jamais une identité.
  const sansCouleur = lu([{ type: 'Card', time: 5, isHome: true, player: { id: 0, name: 'B' } }])[0];
  assert.deepEqual(sansCouleur, { type: 'card', minute: 5, side: 'home', player: 'B', card: 'yellow' });
  // Un penalty manqué du jeu est lu ; ceux de la séance de tirs au but ne le sont jamais.
  assert.deepEqual(parType(lu([{ type: 'MissedPenalty', time: 60, isHome: false, player: { id: 5, name: 'Z' } }, { type: 'MissedPenalty', time: 120, isHome: true, isPenaltyShootoutEvent: true, player: { id: 6, name: 'Y' } }])), { missedpenalty: 1 });
  // Types qui ne sont pas du déroulé : ignorés.
  assert.deepEqual(lu([{ type: 'Half', time: 45 }, { type: 'AddedTime', time: 90 }, { type: 'Comment', time: 56 }, { type: 'Var', time: 20 }]), []);
  assert.deepEqual(mapEvents({}), []);
});

// ============================================================ 2. le déroulé
test('penalty marqué : reconnu par le détail des anciens événements (« Penalty ») comme par le drapeau des neufs — et un but contre son camp n’est jamais un penalty', () => {
  const ancien = [but(28, 'home', 'A', { detail: 'Penalty' })];
  const neuf = [but(28, 'home', 'A', { detail: 'Penalty', penalty: true })];
  const seulDrapeau = [but(28, 'home', 'A', { penalty: true })];
  const attendu = ["28' Domicile : but de A (penalty) — 1-0"];
  for (const e of [ancien, neuf, seulDrapeau]) assert.deepEqual(lignes(e), attendu);
  // Le fait lui-même, pas seulement la phrase : un penalty, pas un geste « penalty ».
  for (const e of [ancien, neuf, seulDrapeau]) assert.deepEqual(D.lireDeroule({ events: e }).faits.map((f) => [f.penalty, f.geste]), [[true, null]]);
  assert.deepEqual(D.lireDeroule({ events: [but(28, 'home', 'A', { detail: 'Header' })] }).faits.map((f) => [f.penalty, f.geste]), [[false, 'tête']]);
  assert.deepEqual(lignes([but(28, 'home', 'A', { ownGoal: true, detail: 'Own goal', penalty: true })]), ["28' Domicile : but contre son camp de A (Extérieur) — 1-0"]);
  // Les gestes : tête, coup franc, geste inconnu (tel quel).
  assert.deepEqual(lignes([but(5, 'home', 'A', { detail: 'Header' }), but(9, 'away', 'B', { detail: 'Direct freekick' }), but(12, 'away', 'C', { detail: 'Volley' })]), ["5' Domicile : but de A (tête) — 1-0", "9' Extérieur : but de B (coup franc direct) — 1-1", "12' Extérieur : but de C (volley) — 1-2"]);
  // Sur un vrai match d'avant l'étape : le penalty de la 90e + 7 d'Arsenal (détail « Penalty », aucun drapeau).
  const m = MATCHS.sunderland_arsenal;
  assert.ok(m.events.every((e) => e.penalty === undefined), 'événements stockés d’avant : aucun drapeau penalty');
  assert.ok(chrono(m).includes("90+7' Arsenal : but de Bukayo Saka (penalty) — 0-2"));
  // L'ancienne lecture de l'IA disait « penalty: false » pour ce même but : c'était l'erreur.
  assert.equal(Boolean(m.events.find((e) => e.player === 'Bukayo Saka').penalty), false);
});

test('penalty manqué : l’événement des matchs neufs, la carte des tirs des anciens (une seule ligne quand les deux le disent) — jamais un tir de séance de tirs au but', () => {
  // Événement seul (match neuf sans carte des tirs) : pas d'issue inventée.
  assert.deepEqual(lignes([manque(52, 'home', 'X')]), ["52' Domicile : penalty manqué par X"]);
  // Événement + carte des tirs du même camp et de la même minute : une seule ligne, avec l'issue.
  const tirs = (result, side = 'home', minute = 52) => [{ side, minute, player: 'X', result, situation: 'penalty' }];
  assert.deepEqual(lignes([manque(52, 'home', 'X')], { shotmap: tirs('post') }), ["52' Domicile : penalty manqué par X (sur le poteau ou la barre)"]);
  assert.deepEqual(lignes([manque(52, 'home', 'X')], { shotmap: tirs('attemptsaved') }), ["52' Domicile : penalty manqué par X (arrêté par le gardien)"]);
  // Carte des tirs seule (match d'avant l'étape) : la ligne vient d'elle ; un penalty marqué (« goal ») n'est pas un manqué.
  assert.deepEqual(lignes([but(70, 'away', 'B')], { shotmap: [...tirs('miss', 'away', 56), { side: 'home', minute: 60, player: 'Q', result: 'goal', situation: 'penalty' }] }), ["56' Extérieur : penalty manqué par X (à côté ou au-dessus)", "70' Extérieur : but de B — 0-1"]);
  // Une autre situation de tir n'est jamais un penalty.
  assert.deepEqual(lignes([but(70, 'away', 'B')], { shotmap: [{ side: 'home', minute: 30, player: 'Q', result: 'miss', situation: 'regularplay' }] }), ["70' Extérieur : but de B — 0-1"]);
  // À minute égale, un penalty de la carte des tirs (minute 90, sans temps ajouté) précède ce qui est en 90+1 (le temps ajouté départage).
  assert.deepEqual(lignes([{ ...carton(90, 'home', 'A', 'yellow'), addedTime: 1 }], { shotmap: [{ side: 'away', minute: 90, player: 'Q', result: 'attemptsaved', situation: 'penalty' }] }), ["90' Extérieur : penalty manqué par Q (arrêté par le gardien)", "90+1' Domicile : jaune A"]);
  // Deux penalties manqués de la même équipe à des minutes différentes : deux lignes.
  assert.equal(lignes([manque(10, 'home', 'X'), manque(80, 'home', 'Y')], { shotmap: [{ side: 'home', minute: 10, player: 'X', result: 'post', situation: 'penalty' }] }).length, 2);
  // Le vrai match : Le Fée, 56e, arrêté (carte des tirs, aucun événement « missedpenalty » dans le magasin d'avant).
  const m = MATCHS.sunderland_arsenal;
  assert.ok(m.events.every((e) => e.type !== 'missedpenalty'));
  assert.ok(chrono(m).includes("56' Sunderland : penalty manqué par Enzo Le Fée (arrêté par le gardien)"));
  const hull = chrono(MATCHS.newcastle_hull);
  assert.ok(hull.some((l) => /^45' Newcastle : penalty manqué par Yoane Wissa \(arrêté par le gardien\)$/.test(l)), hull.join('\n'));
});

test('séance de tirs au but : ses tirs sont dans la carte des tirs (minutes 91, 92, 93… après 90 minutes, au-delà de la 120e après prolongation) et ne sont JAMAIS des penalties manqués', () => {
  // Le vrai match (Peterborough – Barnsley, tirs au but après 90 minutes) : la carte des tirs a des tirs ratés ou arrêtés en séance.
  const m = MATCHS.peterborough_barnsley;
  assert.ok(m.shotmap.some((t) => t.result !== 'goal' && t.minute > 90), 'la séance est bien dans la carte des tirs');
  assert.equal(chrono(m).filter((l) => /penalty manqué/.test(l)).length, 0);
  assert.match(toutes(m)[0], /^Score 3-3 \(mi-temps 2-2\) · tirs au but après 90 minutes : la séance n’est pas dans le score$/);
  // Après prolongation : un penalty manqué du jeu en prolongation (110e) est gardé, ceux de la séance (au-delà de la 120e) non.
  const evenements = [but(30, 'home', 'A'), but(105, 'away', 'B')];
  const tirs = [{ side: 'home', minute: 110, player: 'X', result: 'miss', situation: 'penalty' }, { side: 'home', minute: 125, player: 'S1', result: 'miss', situation: 'penalty' }, { side: 'away', minute: 126, player: 'S2', result: 'attemptsaved', situation: 'penalty' }];
  const d = D.lireDeroule({ events: evenements, shotmap: tirs, meta: { reason: 'afterpenalties' }, score: { home: 1, away: 1 } });
  assert.deepEqual(D.lignesDeLaChronologie(d, noms), ["30' Domicile : but de A — 1-0", "105' Extérieur : but de B — 1-1", "110' Domicile : penalty manqué par X (à côté ou au-dessus)"]);
  assert.match(D.ligneDuScore(d, noms), /après prolongation puis tirs au but : la séance n’est pas dans le score/);
  // Un match sans séance : un tir au-delà de la 120e n'existe pas et n'est pas lu non plus.
  assert.deepEqual(lignes([but(30, 'home', 'A')], { shotmap: [{ side: 'home', minute: 125, player: 'S1', result: 'miss', situation: 'penalty' }] }), ["30' Domicile : but de A — 1-0"]);
  // Sans « afterpenalties », un penalty manqué à la 95e (arrêts de jeu d'un match sans prolongation) est un vrai penalty manqué.
  assert.equal(lignes([but(30, 'home', 'A')], { shotmap: [{ side: 'home', minute: 91, player: 'X', result: 'miss', situation: 'penalty' }] }).length, 2);
});

test('but contre son camp : écrit pour le camp CRÉDITÉ, avec l’équipe de celui qui l’a marqué — jamais « Chelsea (Odoffin), contre son camp »', () => {
  // `side` d'un but contre son camp est le camp crédité (le joueur est dans l'autre) : mesuré sur 4 186 buts du magasin, aucun contraire.
  const m = MATCHS.chelsea_luton;
  const csc = m.events.find((e) => e.ownGoal);
  assert.deepEqual([csc.side, csc.player], ['home', 'Hakeem Odoffin']);
  const ligne = chrono(m).find((l) => /contre son camp/.test(l));
  assert.equal(ligne, "79' Chelsea : but contre son camp de Hakeem Odoffin (Luton Town) — 2-0");
  // Le score tient compte du but pour le camp crédité : 2-0 pour Chelsea, pas 1-1.
  assert.match(toutes(m)[0], /^Score 2-0/);
  assert.deepEqual(deroulerMatch(m).buts, { home: 2, away: 0 });
  assert.equal(deroulerMatch(m).coherent, true);
  // Pour l'équipe qui se déplace : le joueur est dans l'équipe qui reçoit.
  assert.deepEqual(lignes([but(10, 'away', 'Défenseur D', { ownGoal: true, detail: 'Own goal' })]), ["10' Extérieur : but contre son camp de Défenseur D (Domicile) — 0-1"]);
  // Sur un vrai match de 25 événements : Alarcon (Dynamo) marque contre son camp, le but compte pour Akhmat.
  assert.ok(chrono(MATCHS.akhmat_dynamo).includes("66' FC Akhmat Grozny : but contre son camp de Andrés Alarcon (FC Dynamo Makhachkala) — 2-2"));
});

test('cartons : jaune, rouge direct, rouge après deux jaunes — et l’équipe passe à dix, à neuf ; un carton à un remplaçant resté sur le banc ne compte pas', () => {
  const e = [carton(20, 'home', 'A', 'yellow'), carton(30, 'home', 'B', 'red'), carton(60, 'home', 'A', 'yellowred'), carton(70, 'away', 'C', 'yellow', { note: 'not_on_pitch' }), carton(80, 'away', 'D', 'red', { note: 'not_on_pitch' })];
  assert.deepEqual(lignes(e), [
    "20' Domicile : jaune A",
    "30' Domicile : rouge direct B → Domicile à dix",
    "60' Domicile : rouge (2e jaune) A → Domicile à neuf",
    "70' Extérieur : jaune C (remplaçant, hors du terrain)",
    "80' Extérieur : rouge direct D (remplaçant, hors du terrain)"
  ]);
  const d = D.lireDeroule({ events: e });
  // Le récapitulatif : les jaunes sur le terrain (la première jaune d'un expulsé compte), les rouges (2e jaune comprise) ; le hors terrain à part.
  assert.equal(D.ligneDesCartons(d, noms), 'Cartons du déroulé : jaunes Domicile 1, Extérieur 0 · rouges Domicile 2, Extérieur 0 (dont 1 sur deuxième jaune, la première étant comptée parmi les jaunes) · 2 jaune(s) à un remplaçant hors du terrain, non compté(s)');
  // La raison d'un carton, en français ; une raison inconnue passe telle quelle.
  assert.deepEqual(lignes([carton(5, 'home', 'A', 'yellow', { reason: 'time_wasting' }), carton(6, 'away', 'B', 'yellow', { reason: 'foul' }), carton(7, 'away', 'C', 'yellow', { reason: 'dissent' }), carton(8, 'home', 'D', 'yellow', { reason: 'bad_manners' })]), [
    "5' Domicile : jaune A (perte de temps)",
    "6' Extérieur : jaune B (faute)",
    "7' Extérieur : jaune C (contestation)",
    "8' Domicile : jaune D (bad manners)"
  ]);
  // Vrais matchs : Reinildo (Sunderland) est expulsé sur une deuxième jaune à la 90+6 ; Herrera (Houston) sur un rouge direct à la 45+3.
  assert.ok(chrono(MATCHS.sunderland_arsenal).includes("90+6' Sunderland : rouge (2e jaune) Reinildo → Sunderland à dix"));
  assert.ok(chrono(MATCHS.millwall_west_ham).includes("89' West Ham : rouge direct Mohamadou Kanté → West Ham à dix"));
});

test('remplacements : ceux d’une même minute et d’un même camp sur une ligne, le blessé dit ; le sortant et l’entrant ne sont jamais confondus', () => {
  const e = [remplacement(46, 'home', 'E1', 'S1'), remplacement(46, 'home', 'E2', 'S2'), remplacement(46, 'away', 'E3', 'S3'), remplacement(65, 'away', 'E4', 'S4', { injured: true }), remplacement(65, 'home', 'E5', 'S5')];
  assert.deepEqual(lignes(e), ["46' Domicile : remplacements E1 remplace S1, E2 remplace S2", "46' Extérieur : remplacement E3 remplace S3", "65' Extérieur : remplacement E4 remplace S4 (blessé)", "65' Domicile : remplacement E5 remplace S5"]);
  // Les minutes d'arrêts de jeu s'écrivent 90+4'.
  assert.deepEqual(lignes([{ ...remplacement(90, 'home', 'E', 'S'), addedTime: 4 }]), ["90+4' Domicile : remplacement E remplace S"]);
});

test('« 10 à 20 lignes courtes » : au-delà de 20, les remplacements puis les jaunes se regroupent par équipe ; buts, penalties manqués et expulsions restent un à un', () => {
  // 4 buts + 8 jaunes + 10 remplacements à des minutes différentes = 22 lignes : les remplacements passent à une ligne par équipe.
  const base = [but(10, 'home', 'A'), but(20, 'away', 'B'), but(30, 'home', 'C'), but(40, 'away', 'D')];
  const jaunes = Array.from({ length: 8 }, (_, i) => carton(11 + i * 3, i % 2 ? 'home' : 'away', `J${i}`, 'yellow'));
  const subs = Array.from({ length: 10 }, (_, i) => remplacement(46 + i * 4, i % 2 ? 'home' : 'away', `E${i}`, `S${i}`));
  const l1 = lignes([...base, ...jaunes, ...subs]);
  assert.equal(l1.length, 4 + 8 + 2);
  assert.ok(l1.some((l) => l.startsWith('Remplacements Domicile : 50\' E1 remplace S1 · ')));
  assert.ok(l1.every((l) => !/^\d+' (Domicile|Extérieur) : remplacement/.test(l)));
  // 4 buts + 16 jaunes : même les remplacements regroupés ne suffisent pas, les jaunes se regroupent aussi.
  const beaucoup = Array.from({ length: 16 }, (_, i) => carton(5 + i * 5, i % 2 ? 'home' : 'away', `J${i}`, 'yellow'));
  const l2 = lignes([...base, ...beaucoup, ...subs]);
  assert.ok(l2.length <= 20, l2.join('\n'));
  assert.equal(l2.filter((l) => /^\d+' .* : but /.test(l)).length, 4, 'les buts restent un à un');
  assert.equal(l2.filter((l) => l.startsWith('Jaunes ')).length, 2);
  assert.equal(l2.filter((l) => l.startsWith('Jaunes ')).reduce((n, l) => n + l.split(' · ').length, 0), 16, 'les 16 jaunes sont dits, une fois chacun');
  // Un match de 6 buts, 2 rouges et 2 penalties manqués ne perd rien : tout reste un à un.
  const rude = [but(5, 'home', 'A'), but(9, 'home', 'B'), but(13, 'away', 'C'), but(40, 'away', 'D'), but(55, 'home', 'E'), but(80, 'away', 'F'), carton(30, 'home', 'G', 'red'), carton(31, 'away', 'H', 'yellowred'), manque(44, 'home', 'I'), manque(60, 'away', 'J')];
  assert.equal(lignes(rude).length, 10);
});

test('sur les onze matchs réels du fixture : chaque ligne de fait est courte, et la chronologie compte 10 à 20 lignes dès que le déroulé a de quoi', () => {
  for (const m of Object.values(MATCHS)) {
    const l = chrono(m);
    const n = m.events?.length ?? 0;
    assert.ok(l.length <= 20, `${m.cle} : ${l.length} lignes`);
    if (n >= 14) assert.ok(l.length >= 10, `${m.cle} : ${n} événements mais ${l.length} lignes`);
    // Une ligne de fait (sauf les lignes regroupées par équipe) tient en moins de 130 caractères.
    for (const x of l.filter((x) => !/^(Remplacements|Jaunes) /.test(x))) assert.ok(x.length < 130, x);
  }
  // Les cas courants tombent bien entre 10 et 20 lignes.
  for (const cle of ['sunderland_arsenal', 'chelsea_luton', 'peterborough_barnsley', 'akhmat_dynamo', 'kansas_philadelphie', 'leeds_palace', 'millwall_west_ham']) {
    const n = chrono(MATCHS[cle]).length;
    assert.ok(n >= 10 && n <= 20, `${cle} : ${n}`);
  }
});

test('déroulé non publié, partiel, incomplet, attribué : dit tel quel — jamais « aucun but » ni « 0 carton » pour ce qu’on ne sait pas', () => {
  // Non publié : le magasin n'a aucun déroulé (events nul) — sur un vrai match de 5-0.
  const nonPublie = toutes(MATCHS.juventus_nec);
  assert.deepEqual(nonPublie, ['Score 5-0', 'Déroulé : non publié par FotMob pour ce match — les buts, cartons et remplacements ne sont pas connus (ce n’est pas « aucun »).']);
  assert.equal(deroulerMatch(MATCHS.juventus_nec).disponible, false);
  // Partiel : seul un but est publié (coupe de second rang) — pas de « 0 carton », « 0 remplacement ».
  const partiel = toutes(MATCHS.waldhof_kaiserslautern);
  assert.equal(partiel[0], 'Score 0-1 (mi-temps 0-0) · après prolongation : le score les compte');
  assert.ok(partiel.includes("120' Kaiserslautern : but de Ibrahim Kanaté — 0-1"));
  assert.equal(partiel.at(-1), 'Cartons et remplacements : non publiés par FotMob pour ce match (seuls les buts le sont) — ne conclus pas à « aucun ».');
  assert.ok(!partiel.some((l) => l.startsWith('Cartons du déroulé')));
  // Publié mais vide : même prudence.
  assert.deepEqual(D.lignesDuDeroule(D.lireDeroule({ events: [], score: { home: 0, away: 0 } }), noms), ['Score 0-0 (mi-temps 0-0)', 'Déroulé : aucun fait relevé par FotMob (ni but, ni carton, ni remplacement) — non relevé, pas « aucun ».']);
  // Incomplet : un seul but listé pour un score de 2-1.
  const incomplet = D.lignesDuDeroule(D.lireDeroule({ events: [but(10, 'home', 'A'), carton(30, 'away', 'B', 'yellow')], score: { home: 2, away: 1 } }), noms);
  assert.equal(incomplet[0], 'Score 2-1');
  assert.match(incomplet[1], /^Déroulé INCOMPLET : 1 but\(s\) listé\(s\) \(Domicile 1, Extérieur 0\) pour un score de 2-1 — n’en conclus rien/);
  // Attribué hors du terrain : le score est celui de la fédération, le déroulé celui du match joué — dit, pas « incomplet ».
  const attribue = D.lignesDuDeroule(D.lireDeroule({ events: [but(10, 'home', 'A'), remplacement(60, 'away', 'E', 'S')], meta: { awarded: 1, reason: 'awarded_win' }, score: { home: 0, away: 3 } }), noms);
  assert.match(attribue[0], /^Score 0-3 · résultat attribué hors du terrain : le score est celui de la fédération, le déroulé celui du match joué$/);
  assert.ok(!attribue.some((l) => /INCOMPLET/.test(l)));
  // Le bon nombre de buts mais pour les mauvais camps (un but du domicile pour un score de 0-1) : incomplet aussi.
  const echange = D.lireDeroule({ events: [but(10, 'home', 'A')], score: { home: 0, away: 1 } });
  assert.equal(echange.coherent, false);
  assert.match(D.lignesDuDeroule(echange, noms)[1], /^Déroulé INCOMPLET/);
  // La mi-temps n'est écrite que si le déroulé retrouve le score.
  assert.equal(deroulerMatch(MATCHS.sunderland_arsenal).mitemps !== null, true);
  assert.equal(D.lireDeroule({ events: [but(10, 'home', 'A')], score: { home: 3, away: 0 } }).mitemps, null);
});

test('mi-temps : les arrêts de jeu de la première période (45+x) y sont ; le premier but de la seconde (46e) non', () => {
  const d = D.lireDeroule({ events: [but(44, 'home', 'A'), but(45, 'away', 'B', { addedTime: 3 }), but(46, 'home', 'C'), but(90, 'away', 'D', { addedTime: 2 })], score: { home: 2, away: 2 } });
  assert.deepEqual(d.mitemps, { home: 1, away: 1 });
  assert.match(D.ligneDuScore(d, noms), /^Score 2-2 \(mi-temps 1-1\)$/);
  assert.deepEqual(D.lignesDeLaChronologie(d, noms).at(-1), "90+2' Extérieur : but de D — 2-2");
});

// ============================================================ 3. le rendu dans la fiche compacte
const matchStatsPour = (m, plus = {}) => ({ score: m.score, goals: [], redCards: [], stats: plus.stats ?? { home: {}, away: {} }, deroule: deroulerMatch(m, plus.deroule), ...plus.reste });
const fiche = (m, matchStats) =>
  C.ficheApresMatch({ home: m.home, away: m.away, league: m.league, commenceTime: `${m.date}T18:00:00.000Z`, timing: 'coup-d-envoi', analysedAt: `${m.date}T16:55:00.000Z`, priorAnalysis: {}, engineSummary: {}, result: { homeGoals: m.score.home, awayGoals: m.score.away }, marketOutcomes: [], matchStats });
const sectionFaits = (texte) => texte.slice(texte.indexOf('\n## matchStats') + 1);

test('fiche compacte : la section des faits porte le score, le déroulé, le récapitulatif des cartons et les statistiques — aucun JSON', () => {
  const m = MATCHS.sunderland_arsenal;
  const stats = { home: { expected_goals: 1.8, 'Total Shots': 12, 'Shots on Goal': 3, big_chances: 3, 'Ball Possession': '43%', 'Corner Kicks': 4, 'Yellow Cards': 4, 'Red Cards': 1 }, away: { expected_goals: 1.88, 'Total Shots': 11, 'Shots on Goal': 5, big_chances: 3, 'Ball Possession': '57%', 'Corner Kicks': 2, 'Yellow Cards': 2, 'Red Cards': 0 } };
  const s = sectionFaits(fiche(m, matchStatsPour(m, { stats })));
  const l = s.split('\n');
  assert.equal(l[0], '## matchStats — faits du match, FotMob (magasin)');
  assert.equal(l[1], 'Score 0-2 (mi-temps 0-0)');
  assert.match(l[2], /^Déroulé \(17 lignes\) — « minute' équipe : fait », le score suit chaque but :$/);
  assert.equal(l.indexOf('Cartons du déroulé : jaunes Sunderland 5, Arsenal 3 · rouges Sunderland 1, Arsenal 0 (dont 1 sur deuxième jaune, la première étant comptée parmi les jaunes)'), 3 + 17);
  // Les cartons des statistiques (4 / 2 jaunes, 1 / 0 rouge) sont dits par le déroulé : plus dans la ligne des statistiques.
  assert.equal(l.at(-1), 'Statistiques (Sunderland / Arsenal) : xG 1,8 / 1,88 · tirs 12 / 11 · tirs cadrés 3 / 5 · grosses occasions 3 / 3 · possession 43% / 57% · corners 4 / 2');
  assert.ok(!s.includes('{"') && !/"\w+":/.test(s));
  // La section est la dernière de la fiche (rien après).
  assert.equal(s.split('\n## ').length, 1);
});

test('statistiques : un 0 des deux côtés veut dire « non relevé » (dit, jamais zéro), sauf pour les rouges et les grosses occasions ; les jaunes de FotMob à 0 / 0 contredisent le déroulé', () => {
  const m = MATCHS.leeds_palace;
  // Cas réel de l'étape 15 (jaunes à 0 des deux côtés alors que le déroulé en compte 5) et un match sans xG, sans corners.
  const stats = { home: { expected_goals: 0, 'Total Shots': 0, 'Shots on Goal': 0, big_chances: 0, 'Ball Possession': '0%', 'Corner Kicks': 0, 'Yellow Cards': 0, 'Red Cards': 0 }, away: { expected_goals: 0, 'Total Shots': 0, 'Shots on Goal': 0, big_chances: 0, 'Ball Possession': '0%', 'Corner Kicks': 0, 'Yellow Cards': 0, 'Red Cards': 0 } };
  const s = sectionFaits(fiche(m, matchStatsPour(m, { stats })));
  assert.equal(s.split('\n').at(-1), 'Statistiques (Leeds / Crystal Palace) : grosses occasions 0 / 0 · non relevé (0 des deux côtés) : xG, tirs, tirs cadrés, possession, corners');
  // Les jaunes viennent du déroulé : 2 pour Leeds, 3 pour Crystal Palace, malgré le 0 / 0 de la statistique.
  assert.match(s, /Cartons du déroulé : jaunes Leeds 2, Crystal Palace 3 · rouges Leeds 0, Crystal Palace 0/);
  // Une statistique à zéro d'un seul côté est une vraie mesure.
  const unCote = { home: { 'Corner Kicks': 0, 'Total Shots': 3 }, away: { 'Corner Kicks': 5, 'Total Shots': 9 } };
  assert.match(fiche(m, matchStatsPour(m, { stats: unCote })), /corners 0 \/ 5/);
  // Déroulé partiel (seuls les buts) : les cartons restent ceux de la statistique, et son 0 / 0 de jaunes est « non relevé ».
  const k = MATCHS.waldhof_kaiserslautern;
  const partiel = sectionFaits(fiche(k, matchStatsPour(k, { stats: { home: { 'Yellow Cards': 0, 'Red Cards': 0, 'Corner Kicks': 6 }, away: { 'Yellow Cards': 0, 'Red Cards': 0, 'Corner Kicks': 3 } } })));
  assert.equal(partiel.split('\n').at(-1), 'Statistiques (Waldhof Mannheim / Kaiserslautern) : corners 6 / 3 · rouges 0 / 0 · non relevé (0 des deux côtés) : jaunes');
});

test('fiche compacte sans déroulé (anciens appelants, essais) : le bloc d’avant, mot pour mot — le rendu neuf ne s’y applique pas', () => {
  const x = F41.apres.entree;
  const s = sectionFaits(C.ficheApresMatch({ home: x.home, away: x.away, league: x.league, commenceTime: x.commenceTime, timing: x.timing, analysedAt: x.analysedAt, priorAnalysis: x.priorAnalysis, engineSummary: x.engineSummary, result: x.result, marketOutcomes: x.marketOutcomes, matchStats: x.matchStats }));
  assert.match(s, /^## matchStats — faits du match, FotMob \(magasin\)\nScore 2-1 · buts : 12' Girona \(Abel Ruiz\), penalty · 55' Mallorca \(Antonio Raíllo\), contre son camp · 88' Mallorca \(Adrián Fuentes\) · cartons rouges : 71' Mallorca \(Pablo Torre\)\nStatistiques \(Girona \/ Mallorca\) : xG 1,13 \/ 0,26 /);
  assert.ok(!s.includes('Déroulé'));
  // Avec le déroulé, le même objet bascule vers le bloc neuf.
  const avec = sectionFaits(C.ficheApresMatch({ home: x.home, away: x.away, priorAnalysis: x.priorAnalysis, engineSummary: x.engineSummary, result: x.result, marketOutcomes: [], matchStats: { ...x.matchStats, deroule: D.lireDeroule({ events: [but(12, 'home', 'Abel Ruiz', { penalty: true })], score: { home: 2, away: 1 } }) } }));
  assert.match(avec, /12' Girona : but de Abel Ruiz \(penalty\) — 1-0/);
  assert.ok(!/buts : /.test(avec));
  // Un déroulé absent : la section le dit, la ligne « buts : aucun » d'avant n'existe plus pour lui.
  const sans = sectionFaits(C.ficheApresMatch({ home: 'A', away: 'B', priorAnalysis: {}, engineSummary: {}, result: { homeGoals: 1, awayGoals: 0 }, marketOutcomes: [], matchStats: { score: { home: 1, away: 0 }, goals: [], redCards: [], stats: { home: {}, away: {} }, deroule: D.lireDeroule({ events: null, score: { home: 1, away: 0 } }) } }));
  assert.match(sans, /Déroulé : non publié par FotMob pour ce match/);
  assert.ok(!/buts : aucun/.test(sans));
});

// ============================================================ 4. le texte minute par minute
test('texte minute par minute — les langues : l’anglais d’abord, les traductions « _gen » ensuite ; une chaîne vide = pas de texte ; inconnu = « en » puis « en_gen »', () => {
  assert.deepEqual(T.languesDuCommentaire('ar_gen,de_gen,en,es_gen,fr_gen,it_gen,pt-BR_gen,pt_gen'), ['en', 'fr_gen', 'ar_gen']);
  assert.deepEqual(T.languesDuCommentaire('de,en_gen,es_gen,fr_gen,it_gen'), ['en_gen', 'fr_gen', 'de']);
  assert.deepEqual(T.languesDuCommentaire('de_gen,en_gen,es_gen,fr_gen,it_gen'), ['en_gen', 'fr_gen', 'de_gen']);
  assert.deepEqual(T.languesDuCommentaire(''), []);
  assert.deepEqual(T.languesDuCommentaire(null), ['en', 'en_gen']);
  assert.deepEqual(T.languesDuCommentaire(undefined), ['en', 'en_gen']);
  assert.equal(T.urlDuCommentaire(5071387, 'en_gen'), 'https://data.fotmob.com/webcl/ltc/gsm/5071387_en_gen.json.gz');
});

const ligneDe = (m) => `${m.minute}${m.plus ? `+${m.plus}` : ''}' ${m.texte}`;

test('texte minute par minute — fil de faits automatique (Liga MX) : seulement ce que les événements ne disent pas — VAR, penalty concédé, blessures — jamais buts, cartons, remplacements, fautes, corners', () => {
  const moments = T.momentsDuCommentaire({ evenements: TEXTES.fil_de_faits.Events });
  assert.deepEqual(moments.map(ligneDe), [
    "73' Delay in match because of an injury Irving Martinez (León).",
    "74' Delay in match because of an injury Madson (Juárez).",
    "77' VAR Decision: Goal León 1-0 Juárez (Sebastián Jurado).",
    "89' Penalty conceded by Jesús Lara (León) after a foul in the penalty area.",
    "90+1' VAR Decision: Penalty Juárez."
  ]);
  assert.deepEqual(moments.map((x) => x.code), ['start delay', 'start delay', 'contentious referee decisions', 'penalty lost', 'contentious referee decisions']);
  // Les buts, cartons, remplacements, penalties marqués, début et fin de match du fichier n'y sont pas.
  const codesDuFichier = new Set(TEXTES.fil_de_faits.Events.map((e) => e.IncidentCode));
  for (const c of ['OG', 'PSG', 'G', 'YC', 'SI', 'start', 'end 2']) assert.ok(codesDuFichier.has(c), `le fichier contient bien « ${c} »`);
  assert.ok(moments.every((x) => !['OG', 'PSG', 'G', 'YC', 'SI', 'start', 'end 2', 'end 14'].includes(x.code)));
});

test('texte minute par minute — commentaire de rédaction (MLS) : les décisions VAR et les grosses occasions, au plus 5 lignes de 130 caractères, dans l’ordre du jeu ; ni composition, ni résumé, ni but', () => {
  const moments = T.momentsDuCommentaire({ evenements: TEXTES.redaction.Events });
  assert.ok(moments.length >= 4 && moments.length <= T.MAX_MOMENTS, `${moments.length} moments`);
  assert.ok(moments.every((x) => ['var', 'highlight'].includes(x.code)), JSON.stringify(moments.map((x) => x.code)));
  assert.ok(moments.some((x) => x.code === 'var'), 'la revue VAR est retenue');
  assert.ok(moments.every((x) => x.texte.length <= T.LARGEUR_MAX));
  assert.ok(moments.every((x, i) => i === 0 || x.minute * 100 + (x.plus ?? 0) >= moments[i - 1].minute * 100 + (moments[i - 1].plus ?? 0)), 'dans l’ordre du jeu');
  // Une phrase longue est coupée à la fin d'un mot, avec « … ».
  assert.ok(moments.some((x) => x.texte.endsWith('…')));
  // Ni composition d'avant-match (Elapsed 0), ni résumé, ni but, ni carton.
  const textes = moments.map((x) => x.texte).join(' ');
  assert.ok(!/XI \(|SUBS:|summary/i.test(textes));
  assert.ok(!moments.some((x) => ['PSG', 'G', 'Y2C', 'half_time summary', 'post_match summary', 'SI'].includes(x.code)));
});

test('texte minute par minute — sélection : l’intérêt d’abord (VAR, penalty concédé, blessure, occasion, poteau), puis les plus anciens ; texte nettoyé ; doublons écartés ; format inconnu = rien', () => {
  const ev = (code, Elapsed, texte, ElapsedPlus = -1) => ({ IncidentCode: code, Elapsed, ElapsedPlus, Description: texte });
  const candidats = [
    ev('highlight', 5, 'Une occasion à la 5e.'),
    ev('post', 8, 'Un poteau.'),
    ev('start delay', 12, 'Delay in match because of an injury A (X).'),
    ev('start delay', 13, 'Delay in match (X).'), // sans blessure : pas retenu
    ev('penalty lost', 20, 'Penalty conceded by B (X) with a handball.'),
    ev('var', 21, 'VAR review\nfor a possible penalty.\u0007'),
    ev('contentious referee decisions', 22, 'VAR Decision: Penalty X.'),
    ev('highlight', 30, 'Une grosse occasion.'),
    ev('highlight', 40, 'Une autre occasion.'),
    ev('highlight', 50, 'Encore une.'),
    ev('G', 55, 'Goal! 1-0'),
    ev('comment', 56, 'Du bavardage.'),
    ev('comment', 0, 'Hello and welcome', -1),
    ev('var', 21, 'VAR review\nfor a possible penalty.') // doublon
  ];
  const moments = T.momentsDuCommentaire({ evenements: candidats }, { max: 6 });
  // 6 retenus : 2 VAR (21, 22), le penalty concédé (20), la blessure (12), puis les plus anciennes occasions (5, 30) — pas le poteau (le moins utile) ni les occasions de 40 et 50.
  assert.deepEqual(moments.map((x) => [x.minute, x.code]), [[5, 'highlight'], [12, 'start delay'], [20, 'penalty lost'], [21, 'var'], [22, 'contentious referee decisions'], [30, 'highlight']]);
  // Texte sur une seule ligne, sans caractère de contrôle.
  assert.equal(moments.find((x) => x.minute === 21).texte, 'VAR review for a possible penalty.');
  // Formats inconnus : rien, jamais une exception.
  for (const x of [null, undefined, {}, { evenements: 'texte' }, { Events: [null, 3, 'a', {}] }, { evenements: [{ IncidentCode: 'var', Elapsed: 'abc', Description: 'x' }] }]) assert.deepEqual(T.momentsDuCommentaire(x), []);
  // La largeur : ne coupe pas au milieu d'un mot.
  const long = T.momentsDuCommentaire({ evenements: [ev('highlight', 3, `${'mot '.repeat(60)}fin`)] }, { largeur: 30 })[0].texte;
  assert.ok(long.length <= 30 && long.endsWith('mot…'), long);
});

/** Un faux `fetch` qui répond à chaque adresse selon `reponses` ; rend aussi la liste des adresses demandées. */
function fauxFetch(reponses) {
  const demandes = [];
  const fetchImpl = async (url) => {
    demandes.push(String(url).replace(/^.*\/gsm\//, ''));
    const r = reponses[demandes.at(-1)];
    if (r instanceof Error) throw r;
    if (r === 'jamais') return new Promise(() => {});
    if (r === undefined) return { ok: false, status: 403, arrayBuffer: async () => Buffer.from('<Error/>') };
    return { ok: true, status: 200, ...r };
  };
  return { fetchImpl, demandes };
}
const gz = (objet) => ({ arrayBuffer: async () => { const b = zlib.gzipSync(Buffer.from(JSON.stringify(objet))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
const brut = (objet) => ({ arrayBuffer: async () => { const b = Buffer.from(JSON.stringify(objet)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });

test('texte minute par minute — la lecture : « en » absent (403) puis « en_gen » ; gzip ou JSON brut ; jamais plus de trois requêtes ; jamais d’exception', async () => {
  const fichier = { Events: TEXTES.fil_de_faits.Events };
  let f = fauxFetch({ '5071387_en_gen.json.gz': gz(fichier) });
  const lu = await T.lireCommentaire('5071387', { fetchImpl: f.fetchImpl });
  assert.deepEqual([lu.langue, lu.evenements.length, f.demandes], ['en_gen', fichier.Events.length, ['5071387_en.json.gz', '5071387_en_gen.json.gz']]);
  // Le premier fichier existe : une seule requête, JSON non compressé accepté.
  f = fauxFetch({ '5071387_en.json.gz': brut(fichier) });
  assert.equal((await T.lireCommentaire(5071387, { fetchImpl: f.fetchImpl })).langue, 'en');
  assert.deepEqual(f.demandes, ['5071387_en.json.gz']);
  // Rien nulle part : null, deux requêtes ; la langue annoncée par le match commande.
  f = fauxFetch({});
  assert.equal(await T.lireCommentaire('5071387', { fetchImpl: f.fetchImpl }), null);
  assert.equal(f.demandes.length, 2);
  f = fauxFetch({ '1_fr_gen.json.gz': gz(fichier) });
  assert.equal((await T.lireCommentaire('1', { fetchImpl: f.fetchImpl, langues: ['de', 'en_gen', 'fr_gen', 'es_gen'] }))?.langue, 'fr_gen');
  assert.deepEqual(f.demandes, ['1_de.json.gz', '1_en_gen.json.gz', '1_fr_gen.json.gz'], 'trois fichiers au plus : le quatrième n’est jamais demandé');
  // Réseau en panne, délai dépassé, fichier illisible, enveloppe sans « Events » : null, sans exception.
  assert.equal(await T.lireCommentaire('2', { fetchImpl: fauxFetch({ '2_en.json.gz': new Error('panne'), '2_en_gen.json.gz': new Error('panne') }).fetchImpl }), null);
  assert.equal(await T.lireCommentaire('3', { fetchImpl: fauxFetch({ '3_en.json.gz': 'jamais', '3_en_gen.json.gz': 'jamais' }).fetchImpl, delaiMs: 20 }), null);
  assert.equal(await T.lireCommentaire('4', { fetchImpl: fauxFetch({ '4_en.json.gz': { arrayBuffer: async () => Buffer.from('pas du json') } }).fetchImpl }), null);
  assert.equal(await T.lireCommentaire('5', { fetchImpl: fauxFetch({ '5_en.json.gz': brut({ rien: 1 }), '5_en_gen.json.gz': brut({ Events: 'x' }) }).fetchImpl }), null);
  // Un identifiant qui n'en est pas un : aucune requête.
  f = fauxFetch({});
  for (const id of [null, undefined, '', 'abc', '12 34', '../x']) assert.equal(await T.lireCommentaire(id, { fetchImpl: f.fetchImpl }), null);
  assert.equal(f.demandes.length, 0);
  // Le tout en un : lire puis filtrer ; aucune langue (chaîne vide) = aucune requête.
  f = fauxFetch({ '9_en_gen.json.gz': gz({ Events: TEXTES.fil_de_faits.Events }) });
  assert.equal((await T.commentaireDuMatch({ fotmobId: '9', langs: 'de,en_gen' }, { fetchImpl: f.fetchImpl })).length, 5);
  assert.deepEqual(f.demandes, ['9_en_gen.json.gz']);
  f = fauxFetch({});
  assert.deepEqual(await T.commentaireDuMatch({ fotmobId: '9', langs: '' }, { fetchImpl: f.fetchImpl }), []);
  assert.deepEqual(await T.commentaireDuMatch({ fotmobId: null, langs: null }, { fetchImpl: f.fetchImpl }), []);
  assert.equal(f.demandes.length, 0);
});

// ============================================================ 5. les consignes
test('consignes : la règle de lecture du déroulé y est, FIXES (rien d’un match), et les consignes d’avant-match et les schémas de sortie n’ont pas bougé', async () => {
  const { createHash } = await import('node:crypto');
  const sha1 = (t) => createHash('sha1').update(t).digest('hex');
  const c = P.CONSIGNES_APRES_MATCH;
  for (const regle of ['`matchStats` donne le déroulé minute par minute', 'Un but contre son camp compte pour l\'équipe écrite en tête de ligne', '« Non publié », « INCOMPLET », « non relevé »', 'penalty à la 78e']) assert.ok(c.includes(regle), regle);
  // Toutes les règles d'avant y sont encore.
  for (const regle of ['`priorAnalysis`', '`marketOutcomes`', '`aiWasRight`', 'confirmer un pronostic juste ou contredire un pronostic faux', '`marketReviews`', '`matchStats`', 'Ces leçons te seront redonnées', 'ne propose JAMAIS de nouvelle cote', "N'invente aucune donnée", '`caveats`', 'sortie structurée demandée']) assert.ok(c.includes(regle), regle);
  // Rien de propre à un match : aucun nom d'équipe ni de joueur des matchs d'essai, aucune date.
  for (const mot of [...Object.values(MATCHS).flatMap((m) => [m.home, m.away]), 'Saka', 'Reinildo', 'Leeds', 'Girona', 'Mallorca']) assert.ok(!c.includes(mot), `« ${mot} » dans les consignes`);
  assert.doesNotMatch(c, /20\d\d-\d\d-\d\d/);
  // Ce qui ne devait pas bouger : les consignes d'avant-match (empreinte d'avant l'étape), les schémas de sortie, l'ancienne forme.
  assert.equal(sha1(P.CONSIGNES_AVANT_MATCH), 'b2b567eb08f7e5c6c8a5425c62795bdf07119c09');
  assert.equal(JSON.stringify(P.SUBMIT_POST_MATCH_REVIEW_TOOL), JSON.stringify(F41.schemas.apres));
  assert.equal(JSON.stringify(P.SUBMIT_PRE_MATCH_ANALYSIS_TOOL), JSON.stringify(F41.schemas.avant));
  const ancienneAvant = P.buildPreMatchAnalysisRequest({ home: 'A', away: 'B', league: 'L', engineSummary: {}, context: {}, experience: [] });
  const ancienneApres = P.buildPostMatchReviewRequest({ home: 'A', away: 'B', league: 'L', priorAnalysis: {}, engineSummary: {}, result: { homeGoals: 1, awayGoals: 0 }, marketOutcomes: [], matchStats: null });
  assert.equal(sha1(JSON.stringify(ancienneAvant)), 'f7c99e58e01580dddc92b0c93f8355558e93464e');
  assert.equal(sha1(JSON.stringify(ancienneApres)), '27734448764d67d45053f7e920e94092d4a577e8');
});

// ============================================================ 6. la chaîne complète, dans des copies isolées
/** Exécute script-deroule.mjs dans une copie neuve, rend son JSON. `env` : réglages du serveur de l'essai. */
function lancer(env = {}) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-deroule.mjs'), {
      timeout: 300_000,
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false', ...env }
    });
    assert.equal(r.code, 0, `script-deroule a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const normal = uneFois(() => lancer());
const ancienne = uneFois(() => lancer({ AI_ANALYSIS_FICHE: 'ancienne' }));
const sansTexte = uneFois(() => lancer({ AI_COMMENTAIRE_MATCH: 'non' }));

test('chaîne complète : ANCIENNE forme à l’octet près — empreinte du message entier, faits envoyés (penalty toujours faux, rouges directs seuls), aucune section neuve — figées par le code d’AVANT, sur onze matchs réels', () => {
  const s = normal();
  assert.deepEqual(Object.keys(s.preparees).sort(), Object.keys(REFERENCE).sort());
  for (const [cle, ref] of Object.entries(REFERENCE)) {
    const a = s.preparees[cle].ancienne;
    assert.equal(a.faits, ref.ancienne.faits, `${cle} : les faits de l'ancienne forme`);
    assert.equal(a.sha1, ref.ancienne.sha1, `${cle} : l'ancienne forme a changé (empreinte du message entier)`);
    assert.equal(a.contientSectionNeuve, false, cle);
    assert.equal(a.systemSansLaRegleNeuve, true, cle);
  }
  // Ce que cette forme disait d'erroné, à l'octet : le penalty de Saka est « penalty:false », Reinildo n'est pas dans les rouges.
  const sunderland = JSON.parse(s.preparees['2026-09-12-sunderland-arsenal'].ancienne.faits);
  assert.deepEqual(sunderland.goals.map((g) => g.penalty), [false, false]);
  assert.deepEqual(sunderland.redCards, []);
  assert.deepEqual(Object.keys(sunderland), ['score', 'goals', 'redCards', 'stats']);
  // Avec AI_ANALYSIS_FICHE=ancienne dans l'environnement, SANS paramètre : les mêmes octets, et aucun texte demandé à FotMob.
  const a = ancienne();
  assert.equal(a.env.fiche, 'ancienne');
  for (const [cle, ref] of Object.entries(REFERENCE)) assert.equal(a.preparees[cle].ancienne.sha1, ref.ancienne.sha1, cle);
  for (const cle of ['avecTexte', 'sansFichier', 'reseauEnPanne', 'redaction', 'languesConnues', 'aucunTexte', 'ancienneAuParametre']) {
    const r = a.chaine[cle];
    assert.deepEqual([cle, r.revue?.fiche, r.requetes, r.section], [cle, 'ancienne', [], null], 'ancienne forme : ni déroulé, ni texte demandé');
    assert.equal(r.revue.deroule, null);
  }
  assert.deepEqual([a.chaine.matchInconnu.requetes, a.chaine.matchInconnu.section], [0, null]);
  assert.equal(a.requetesTexteEnTout, 0);
});

test('chaîne complète : fiche compacte — consignes FIXES (les mêmes pour onze matchs), déroulé dans le message, rien dans les consignes qui soit propre au match', () => {
  const s = normal();
  for (const [cle, p] of Object.entries(s.preparees)) {
    assert.equal(p.compacte.systemEgalAuxConsignes, true, cle);
    assert.ok(p.compacte.faits.startsWith('## matchStats — faits du match, FotMob (magasin)\nScore '), cle);
    assert.ok(/Déroulé \(\d+ lignes?\)|Déroulé : (non publié|aucun fait)/.test(p.compacte.faits), cle);
    // `deroule` et `pageFotMob` s'ajoutent aux quatre clés d'avant ; l'objet d'avant ne perd rien.
    assert.deepEqual(p.compacte.clesDesFaits, ['score', 'goals', 'redCards', 'stats', 'deroule', 'pageFotMob'], cle);
    // « Rien d'utile perdu » (règle de l'étape 41) : chaque valeur des faits de l'ancien message (minute, buteur, expulsé, statistiques…) est dans la fiche neuve.
    assert.deepEqual(p.compacte.valeursManquantes, [], cle);
  }
  // De bout en bout (lecture de la base d'essai → fiche) : ce que l'IA lit des vrais matchs.
  const faitsDe = (cle) => s.preparees[cle].compacte.faits.split('\n');
  const sunderland = faitsDe('2026-09-12-sunderland-arsenal');
  assert.equal(sunderland[1], 'Score 0-2 (mi-temps 0-0)');
  for (const l of ["56' Sunderland : penalty manqué par Enzo Le Fée (arrêté par le gardien)", "90+6' Sunderland : rouge (2e jaune) Reinildo → Sunderland à dix", "90+7' Arsenal : but de Bukayo Saka (penalty) — 0-2"]) assert.ok(sunderland.includes(l), l);
  assert.ok(faitsDe('2026-08-27-chelsea-luton-town').includes("79' Chelsea : but contre son camp de Hakeem Odoffin (Luton Town) — 2-0"));
  assert.match(faitsDe('2026-09-15-peterborough-united-barnsley')[1], /^Score 3-3 \(mi-temps 2-2\) · tirs au but après 90 minutes/);
  assert.ok(!faitsDe('2026-09-15-peterborough-united-barnsley').some((l) => /penalty manqué/.test(l)));
  assert.ok(faitsDe('2026-09-17-juventus-nec').some((l) => l.startsWith('Déroulé : non publié par FotMob pour ce match')));
  assert.ok(faitsDe('2026-09-19-millwall-west-ham').includes("89' West Ham : rouge direct Mohamadou Kanté → West Ham à dix"));
  // Le message du match grossit de quelques centaines de caractères : jamais d'un facteur.
  for (const [cle, ref] of Object.entries(REFERENCE)) {
    const avant = ref.compacteAvant.longueur;
    const apres = s.preparees[cle].compacte.longueurMessage + P.CONSIGNES_APRES_MATCH.length + 1;
    assert.ok(apres > avant && apres < avant + 3200, `${cle} : ${avant} -> ${apres}`);
  }
  // La revue enregistre ce qu'elle a reçu du déroulé ; la chaîne a rendu quinze bilans à chaque fois.
  for (const cle of ['avecTexte', 'sansFichier', 'reseauEnPanne', 'redaction', 'languesConnues', 'aucunTexte']) {
    const r = s.chaine[cle];
    assert.equal(r.statut, 'ABOUTI', cle);
    assert.equal(r.systemEgalAuxConsignes, true, cle);
    assert.equal(r.revue.fiche, 'compacte');
    assert.equal(r.revue.marches, 15);
    assert.equal(r.revue.deroule.disponible, true);
  }
});

test('chaîne complète : le texte minute par minute — demandé, absent, en panne, langues connues, désactivé — la revue part toujours', () => {
  const s = normal();
  const c = s.chaine;
  const id = s.identifiants;
  // « en » n'existe pas (403), « en_gen » oui : deux requêtes, et les extraits sont dans le message.
  assert.deepEqual(c.avecTexte.requetes, [`${id['2026-09-12-sunderland-arsenal']}_en.json.gz`, `${id['2026-09-12-sunderland-arsenal']}_en_gen.json.gz`]);
  assert.equal(c.avecTexte.revue.deroule.commentaire, 5);
  assert.match(c.avecTexte.section, /\nTexte minute par minute de FotMob, extraits \(VAR, penalties, blessures, occasions\) :\n73' Delay in match because of an injury Irving Martinez \(León\)\.\n/);
  assert.match(c.avecTexte.section, /\n90\+1' VAR Decision: Penalty Juárez\.\nStatistiques \(/, 'le texte est avant les statistiques');
  // Rien chez FotMob (403 partout) : deux requêtes, pas de section de texte, la revue part.
  assert.equal(c.sansFichier.requetes.length, 2);
  assert.ok(!c.sansFichier.section.includes('Texte minute par minute'));
  assert.equal(c.sansFichier.revue.deroule.commentaire, 0);
  // Le réseau tombe : pareil, sans exception.
  assert.equal(c.reseauEnPanne.statut, 'ABOUTI');
  assert.ok(!c.reseauEnPanne.section.includes('Texte minute par minute'));
  // Un commentaire de rédaction : une seule requête (« en » existe), cinq extraits au plus.
  assert.deepEqual(c.redaction.requetes, [`${id['2026-09-20-sporting-kansas-city-philadelphia-union']}_en.json.gz`]);
  assert.ok(c.redaction.revue.deroule.commentaire >= 4 && c.redaction.revue.deroule.commentaire <= 5);
  // Le match annonce ses langues (meta.tickerLangs) : « en_gen » directement, sans « en » ; une chaîne vide : aucune requête.
  assert.deepEqual(c.languesConnues.requetes, [`${id['2026-09-13-fc-akhmat-grozny-fc-dynamo-makhachkala']}_en_gen.json.gz`]);
  assert.deepEqual(c.aucunTexte.requetes, []);
  assert.ok(!c.aucunTexte.section.includes('Texte minute par minute'));
  // Un match que le magasin ne connaît pas : aucun fait, aucune requête.
  assert.deepEqual([c.matchInconnu.statut, c.matchInconnu.requetes, c.matchInconnu.revue], ['ABOUTI', 0, null]);
  assert.equal(c.matchInconnu.section, '## matchStats — faits du match : indisponibles dans le magasin');
  // L'ancienne forme au paramètre : jamais de texte demandé.
  assert.deepEqual(c.ancienneAuParametre.requetes, []);
  assert.equal(c.ancienneAuParametre.revue.fiche, 'ancienne');
  // Le total : 2 + 2 + 2 + 1 + 1 + 0 + 0 + 0 + 0 requêtes à data.fotmob.com.
  assert.equal(s.requetesTexteEnTout, 8);
  // Désactivé par AI_COMMENTAIRE_MATCH=non : aucune requête, aucun extrait, le déroulé reste.
  const d = sansTexte();
  assert.equal(d.env.commentaire, false);
  assert.equal(d.requetesTexteEnTout, 0);
  for (const cle of ['avecTexte', 'redaction', 'languesConnues']) {
    assert.ok(!d.chaine[cle].section.includes('Texte minute par minute'), cle);
    assert.ok(/Déroulé \(\d+ lignes\)/.test(d.chaine[cle].section), cle);
    assert.equal(d.chaine[cle].revue.deroule.commentaire, 0);
  }
});

test('lecteurs d’événements d’avant : les repères de championnat, le direct et le règlement lisent les événements neufs comme les anciens — rien d’autre n’a changé', () => {
  const { lecteurs } = normal();
  // Repères (penalties, mi-temps, buts) : mêmes valeurs avec un penalty manqué, un blessé, une raison de carton, une note.
  assert.deepEqual(lecteurs.reperesNeuf, lecteurs.reperesAncien);
  assert.equal(lecteurs.reperesNeuf.penalties, 1);
  assert.deepEqual([lecteurs.reperesNeuf.buts_1re_mt, lecteurs.reperesNeuf.buts_2e_mt], [2, 1]);
  // Le direct : mêmes rouges (la deuxième jaune compte), le penalty manqué et le blessé n'y changent rien.
  assert.deepEqual(lecteurs.direct.ancien, [1, 1]);
  assert.deepEqual(lecteurs.direct.neuf, [1, 1]);
  // L'import du magasin : les événements d'une vraie page sont lus avec leurs champs neufs, et les langues du texte sont gardées dans le cadre du match (vide = pas de texte ; absent = inconnu).
  assert.deepEqual(lecteurs.importMagasin.langues, ['de,en_gen,es_gen,fr_gen,it_gen', '', null]);
  assert.deepEqual(lecteurs.importMagasin.evenements, { goal: 7, card: 11, substitution: 9, missedpenalty: 1 });
  assert.equal(lecteurs.importMagasin.memesEvenementsQueLaLecture, true);
  assert.deepEqual(lecteurs.importMagasin.penaltyManque, [[57, 'home', 'Kevin Diks']]);
  assert.deepEqual(lecteurs.importMagasin.penaltyMarque, [[90, 'Penalty']]);
  assert.deepEqual(lecteurs.importMagasin.note, { rev: 6, noSheet: true, score: [3, 4] }, 'la révision de lecture ne bouge pas : aucun match déjà au magasin n’est redemandé à FotMob');
  // Le règlement : les statistiques sont celles d'avant (même forme, mêmes valeurs), la réponse des écrans sans l'option est inchangée.
  assert.equal(lecteurs.reglement.statsIdentiques, true);
  assert.deepEqual(lecteurs.reglement.pourReglement, { home: { corners: 3, shots: 10, shotsOnTarget: 6 }, away: { corners: 4, shots: 12, shotsOnTarget: 8 } });
  assert.equal(lecteurs.reglement.detailsInchange, true);
  assert.deepEqual(lecteurs.reglement.detailsAvecDeroule, ['events', 'shotmap', 'meta', 'fotmobId']);
  assert.deepEqual(lecteurs.reglement.clesDesFaits, ['score', 'goals', 'redCards', 'stats', 'deroule', 'pageFotMob']);
});

test('les 201 matchs à déroulé de la base d’essai, comptés un à un : chaque but, penalty, but contre son camp, expulsion, jaune et remplacement est une ligne — la liste transmise est juste', () => {
  const b = normal().deuxCentUn;
  assert.equal(b.matchs, 201);
  assert.deepEqual(b.ecarts, [], 'un fait stocké qui n’est pas une ligne du déroulé (ou l’inverse)');
  for (const k of ['buts', 'penaltys', 'csc', 'expulsions', 'jaunes', 'remplacements']) assert.equal(b[k].evenements, b[k].lignes, k);
  assert.deepEqual([b.buts.evenements, b.penaltys.evenements, b.csc.evenements, b.expulsions.evenements, b.jaunes.evenements, b.remplacements.evenements], [568, 44, 17, 48, 793, 1698]);
  assert.equal(b.jaunes.recapitulatif, b.jaunes.evenements, 'le récapitulatif des cartons retombe sur les jaunes du déroulé');
  // 10 à 20 lignes : jamais plus de 20, jamais moins de 10 quand le match a 14 événements ou plus.
  assert.ok(b.chronoMax <= 20, `maximum ${b.chronoMax}`);
  assert.deepEqual(b.moins10AvecAssezDEvenements, []);
  const entre10et20 = Object.entries(b.parLignes).filter(([n]) => n >= 10 && n <= 20).reduce((t, [, c]) => t + c, 0);
  assert.ok(entre10et20 >= 160, `${entre10et20} matchs sur 201 entre 10 et 20 lignes`);
  // Tous les déroulés retrouvent le score ; les 12 qui n'ont que des buts sont dits « non publiés » pour le reste.
  assert.equal(b.incoherents, 0);
  assert.equal(b.partiels, 12);
  // Les penalties manqués de la carte des tirs : chacun une ligne.
  assert.equal(b.manquesDeLaCarte, 2);
  assert.equal(b.manquesLus, b.manquesDeLaCarte);
});
