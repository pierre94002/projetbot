/**
 * Le relevé ciblé (lot d'argent n° 3, 18/11/2026 ; décisions RC1 à RC15 de l'orchestrateur).
 *   node --test test/releveCible.test.mjs        (depuis server/)
 *
 * Le bouton de l'encart du conseil (Réglages › Cotes de vos bookmakers) relève SEULEMENT les championnats de la vague,
 * sur un clic de Pierre confirmé en deux temps. Les essais tournent dans des copies ISOLÉES (test/aides/isolement.mjs) :
 * base d'essai, data/runtime à part, réseau coupé. Le client payant (oddsApiClient.js) y est REMPLACÉ par un espion qui
 * note chaque appel : AUCUN appel à The Odds API, aucun crédit de Pierre. Claude et FotMob sont SIMULÉS
 * (test/aides/claudeSimule.mjs, test/aides/fotmobSimule.mjs).
 *
 *  E1  une demande invalide (clé inconnue, doublon, liste vide, plus de 12 clés, pas de liste) : 400, aucun appel, rien
 *      d'écrit (octets et heure) ;
 *  E2  seulement les clés demandées, la même requête que le relevé complet ; le compte rendu en clair ;
 *  E3  le bilan des crédits écrit par le dépôt de l'étape 7, tel quel ;
 *  E4  (horloge réelle) après un relevé ciblé, AUCUNE vieille cote ne paraît fraîche ;
 *  E5  toutes les clés en échec : erreur, rien d'écrit ;
 *  E6  deux relevés à la fois : le second reçoit 409, sans appel ;
 *  E7  les championnats retirés, calculés AVANT l'écriture ;
 *  E8  (fonctions pures) le bloc « releveCible » du conseil et les championnats de l'instantané ;
 *  E9  un championnat absent de l'instantané garde l'heure de son coup d'envoi, tirée de l'archive ; un match du
 *      calendrier que l'archive ne répare pas garde la règle d'avant (E9 bis) ;
 *  E10 le relevé complet, inchangé ;
 *  A4  (RC6) la décision de mise donnée à l'IA est celle de la page du match ; le gel ne change pas d'un octet ;
 *  1b  (RC5) une analyse IA déjà faite pour le même match sous un autre identifiant n'est pas refaite.
 * E11 et E12 sont dans les gardes mises à jour : cotesVosBookmakers.test.mjs et cotesVosBookmakersEcran.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
// Lu en entier (et non par noms) : sur le code d'avant le lot (les poses), seuls les essais qui s'en servent échouent.
import * as CR from '../src/data/conseilReleve.js';
import { REGLAGE_FRAICHEUR_DEFAUT } from '../src/core/engine/fraicheurCotes.js';
import { TRACKED_SPORT_KEYS, NOMS_DES_CLES } from '../src/data/providers/oddsApiCompetitions.js';

const t = (iso) => Date.parse(iso);
const R = REGLAGE_FRAICHEUR_DEFAUT;
const EPL = 'soccer_epl';
const LIGA = 'soccer_spain_la_liga';
const SERIEA = 'soccer_italy_serie_a';
const BUNDES = 'soccer_germany_bundesliga';
const L1 = 'soccer_france_ligue_one';

/**
 * Une phase d'un script d'essai, dans une copie neuve (une seule fois par phase : les essais d'une même phase lisent la
 * même sortie). `reel` : l'horloge réelle (E4) ; `ia` : un exécutable Claude qui n'existe pas, l'actualisation coupée.
 */
const sorties = new Map();
function lancer(nom, phase, { reel = false, ia = false } = {}) {
  const cle = `${nom} ${phase}`;
  if (sorties.has(cle)) return sorties.get(cle);
  const copie = preparerCopie({});
  try {
    // Le serveur Express de la copie (app.js) charge des scripts : recopiés avec elle.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', nom), {
      args: [phase],
      timeout: 300_000,
      ...(reel ? { maintenant: null } : {}),
      env: ia ? { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } : {}
    });
    assert.equal(r.code, 0, `${nom} ${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${nom} ${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${nom} ${phase} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    sorties.set(cle, r.json);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const cible = () => lancer('script-releve-cible.mjs', 'cible');

// ------------------------------------------------- le relevé ciblé, dans une copie (espion à la place du client payant)

test('E1 — une demande invalide : 400 avec le motif en clair, aucun appel payant, ni l’instantané ni le bilan ne bougent (octets et heure)', () => {
  const s = cible();
  assert.deepEqual(
    s.e1.map((x) => [x.nom, x.code]),
    [['cle inconnue', 400], ['doublon', 400], ['liste vide', 400], ['13 cles', 400], ['pas de liste', 400], ['une chaine', 400], ['sans corps', 400]]
  );
  for (const x of s.e1) assert.match(x.erreur, /^Relevé ciblé refusé : .+\. Rien n'est parti\.$/, x.nom);
  assert.match(s.e1[0].erreur, /« soccer_inconnue » n'est pas un championnat suivi/);
  assert.match(s.e1[1].erreur, /« soccer_epl » est demandé deux fois/);
  assert.match(s.e1[2].erreur, /aucun championnat demandé/);
  assert.match(s.e1[3].erreur, /13 championnats demandés, 12 au plus : faites plutôt le relevé complet \(Réglages › Données\)/);
  for (const x of s.e1.slice(4)) assert.match(x.erreur, /la liste des championnats manque/, x.nom);
  assert.equal(s.e1Appels, 0, 'aucun appel au client payant');
  assert.equal(s.e1Inchanges, true, 'instantané et bilan identiques, octets et heure');
});

test('P2 — liveDataSync, chargé dans la copie (client payant remplacé par l’espion), exporte le relevé ciblé, son contrôle des clés, son compte rendu et le verrou commun ; le relevé complet reste exporté', () => {
  assert.deepEqual(cible().exports, ['refreshLiveOdds', 'refreshLiveOddsCible', 'controlerLesCles', 'compteRenduDuReleveCible', 'releveEnCoursDe', 'CODE_RELEVE_EN_COURS', 'CLES_PAR_RELEVE_CIBLE_MAX', 'TRACKED_SPORT_KEYS']);
});

test('E5 — toutes les clés demandées en échec : erreur qui nomme chaque clé, instantané et bilan inchangés (octets et heure), verrou rendu', () => {
  const s = cible();
  assert.equal(s.e5.code, 500);
  assert.match(s.e5.erreur, /^Aucune compétition n'a pu être rafraîchie : soccer_epl \(.*panne\) ; soccer_spain_la_liga \(.*panne\)$/);
  assert.deepEqual(s.e5.appels, [EPL, LIGA]);
  assert.equal(s.e5.inchanges, true, 'pas d’instantané vide ni de bilan faux');
  assert.equal(s.e5.verrou, null, 'le verrou est rendu même en échec');
});

test('E2 — la vague (EPL et Liga) : exactement deux requêtes, ces deux clés, la même requête que le relevé complet ; le compte rendu en clair', () => {
  const s = cible();
  assert.equal(s.e2.code, 200);
  assert.deepEqual(s.e2.appels, [{ cle: EPL, options: {} }, { cle: LIGA, options: {} }], 'le coût annoncé est le coût réel');
  const r = s.e2.reponse;
  assert.deepEqual([r.cible, r.cles, r.matchesFetched, r.sportsRefreshed, r.failures, r.cout], [true, [EPL, LIGA], 2, [EPL, LIGA], [], 1]);
  assert.equal(r.quota.remaining, 466);
  assert.equal(
    r.compteRendu,
    '2 championnats relevés : 2 matchs, 1 crédit. Il en reste 466. Les cotes de 1 autre championnat ont été retirées (leurs matchs restent, sans cotes).'
  );
});

test('E3 — le bilan des crédits : écrit par le dépôt de l’étape 7 tel quel (clés demandées, coût, coût par clé, restants du dernier en-tête) ; le conseil relu le lit', () => {
  const s = cible();
  assert.deepEqual(s.e3.bilan, {
    version: 1,
    at: '2026-10-05T12:00:00.000Z',
    clesDemandees: 2,
    clesRelevees: [EPL, LIGA],
    echecs: [],
    matchs: 2,
    quota: { restants: 466, utilises: 34 },
    cout: 1,
    coutParCle: { [EPL]: 1, [LIGA]: 0 },
    matchsParCle: { [EPL]: 2, [LIGA]: 0 }
  });
  // Le dépôt du bilan de la copie est celui du code, sans retouche (le gel de l'essai n° 3 le prouve à part : controle-gel-essai3).
  const sha1 = crypto.createHash('sha1').update(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'repositories', 'relevePayantRepository.js'))).digest('hex');
  assert.equal(s.e3.sha1Depot, sha1);
  assert.deepEqual(s.conseilApres, { code: 200, restants: 466, releveCible: true });
});

test('E7 — les championnats retirés : ceux de l’instantané d’avant qui avaient un match à venir et n’étaient pas demandés (la Ligue 1 ; pas la Bundesliga, son match est joué), calculés AVANT l’écriture ; l’instantané n’a plus que la vague', () => {
  const s = cible();
  assert.deepEqual(s.e7.retires, [{ cle: L1, nom: 'Ligue 1 - France', matchsAVenir: 1, releveAt: '2026-10-05T10:00:00.000Z' }]);
  assert.deepEqual(s.e7.instantaneApres, [['epl-1', EPL], ['epl-2', EPL]]);
  assert.deepEqual(s.e7.cles, [EPL, LIGA]);
});

test('E6 — un relevé à la fois : pendant un relevé, un second (ciblé ou complet) reçoit 409 sans aucun appel ; le verrou est rendu après', () => {
  const s = cible();
  assert.deepEqual(s.e6.enCours, { depuis: '2026-10-05T12:00:00.000Z', cible: true });
  for (const r of [s.e6.second, s.e6.complet]) {
    assert.equal(r.code, 409);
    assert.equal(r.erreur, 'Un relevé est déjà en cours : attendez qu’il finisse avant d’en relancer un (rien n’est parti).');
  }
  assert.deepEqual(s.e6.appelsPendant, [EPL], 'seule la requête du premier relevé est partie');
  assert.equal(s.e6.premier, 200);
  assert.deepEqual(s.e6.apres, { code: 200, verrou: null }, 'le relevé suivant passe, le verrou est libre');
  assert.deepEqual(s.e6.appels, [EPL, EPL]);
});

test('E10 — le relevé complet, inchangé : les 37 clés, la même requête, les mêmes champs de réponse, le même bilan ; le routeur des sources a une route de plus', () => {
  const s = cible();
  assert.equal(s.e10.code, 200);
  assert.deepEqual(s.e10.champs, ['cout', 'failures', 'matchesFetched', 'quota', 'sportsRefreshed']);
  assert.equal(s.e10.appels, 37);
  assert.deepEqual(s.e10.cles, TRACKED_SPORT_KEYS);
  assert.deepEqual(s.e10.options, ['{}']);
  assert.deepEqual(s.e10.bilan, { clesDemandees: 37, cout: 1, quota: { restants: 430, utilises: 70 } });
  assert.deepEqual(s.routeur, [['get', '/'], ['post', '/odds/refresh'], ['post', '/odds/refresh-cible'], ['post', '/competitions/refresh']]);
});

test('E4 — (horloge réelle) après un relevé ciblé, AUCUNE vieille cote ne paraît fraîche : ni dans l’instantané, ni par la fraîcheur, ni dans l’archive, ni dans le conseil', () => {
  const s = lancer('script-releve-cible.mjs', 'vieilles', { reel: true });
  assert.deepEqual(s.anciensAutres, ['vieux-l1', 'vieux-liga'], 'avant : deux matchs d’autres championnats, cotés');
  assert.deepEqual([s.releve.code, s.releve.retires], [200, [L1, LIGA]]);
  assert.deepEqual(s.i, [], '(i) plus aucun autre championnat dans l’instantané');
  assert.deepEqual(s.ii, [], '(ii) aucune cote du fichier n’a plus de 30 min de plus que lui');
  assert.deepEqual(s.iii, [], '(iii) jamais « fraîche », jamais l’heure du nouveau fichier');
  assert.deepEqual(s.iv, [], '(iv) l’archive n’a aucune cote d’un autre championnat à l’heure du nouveau fichier');
  // (v) le match de Ligue 1 (compositions annoncées il y a 10 min) : « cotes absentes », heure sûre tirée de l'archive.
  assert.equal(s.v.conseil, 'maintenant');
  assert.deepEqual(s.v.matchs, [{ league: 'Ligue 1 - France', home: 'Essai Lyon', cotes: 'absentes', heureSure: true, heureDe: 'archive' }]);
  // RC3 bis (correction S2) : l'EPL a des cotes fraîches, mais l'annonce des compositions de son match (dans 5 h) n'est
  // pas passée : elle n'est pas « encore jouable », elle aura sa propre vague.
  assert.deepEqual(s.v.cles, [L1], 'la Ligue 1 seule à relever');
});

test('E9 — un championnat absent de l’instantané (Ligue 1, retirée par un relevé ciblé) garde l’heure de son coup d’envoi, tirée de l’archive, jamais un prix ; aucun doublon du calendrier', () => {
  const s = lancer('script-releve-cible.mjs', 'archive');
  assert.deepEqual(
    s.page.map((m) => [m.matchId, m.hasOdds]),
    [['epl-1', true], ['cal-2026-10-05-Essai Lyon-Essai Nantes', false]],
    'la page Matchs : le match de Ligue 1 reste, par le calendrier, sans cotes'
  );
  const c = s.conseil;
  assert.deepEqual([c.conseil, c.moment, c.proches], ['plus-tard', '2026-10-05T13:00:00.000Z', 2]);
  assert.deepEqual(c.matchs, [
    {
      matchId: 'cal-2026-10-05-Essai Lyon-Essai Nantes',
      league: 'Ligue 1 - France',
      coupDEnvoi: '2026-10-05T14:00:00.000Z',
      heureSure: true,
      cotes: 'absentes',
      releveAt: null,
      heureDe: 'archive',
      heureDonneeLe: '2026-10-04T20:00:00.000Z'
    }
  ]);
  assert.doesNotMatch(c.raison ?? '', /sans heure/);
  // RC3 bis (correction S2) : l'EPL (coup d'envoi à 15 h, annonce à 14 h) n'est pas « encore jouable » à midi : elle
  // n'est pas redemandée, ses cotes (prises avant son annonce) seront retirées, et son match aura sa propre vague.
  assert.deepEqual(c.releveCible, {
    actif: false,
    cles: [L1],
    encoreJouables: [],
    retires: [EPL],
    plusTard: "Le bouton s'allumera vers 15 h 00, à l'annonce des compositions : rechargez cette page à ce moment-là (elle ne se met pas à jour toute seule). Un relevé fait avant ne permettrait aucune mise."
  });
});

test('E9 bis — un match du calendrier que l’archive ne répare pas (championnat absent, jamais archivé) garde la règle d’avant le lot : compté « sans heure » jusqu’à 3 h après midi UTC, plus après (jamais toute la soirée)', () => {
  const s = lancer('script-releve-cible.mjs', 'tard').tard;
  assert.deepEqual(s.midi, { conseil: 'inutile', proches: 2, sansHeure: true });
  assert.deepEqual(s.quinzeHeures, { conseil: 'inutile', proches: 2, sansHeure: true });
  assert.deepEqual(s.quinzeHeuresUne, { conseil: 'inutile', proches: 0, sansHeure: false });
  assert.deepEqual(s.dixHuitHeures, { conseil: 'inutile', proches: 0, sansHeure: false });
});

// ------------------------------------------------- E8 : les fonctions pures

/** Un match du conseil (même forme que dans cotesVosBookmakers.test.mjs). */
const proche = (extra) => ({ matchId: 'm', home: 'Man City', away: 'Liverpool', league: 'EPL', coupDEnvoi: '2026-10-05T19:00:00Z', heureSure: true, vosCotes: true, releveAt: '2026-10-05T11:00:00Z', compos: null, ...extra });
const BILAN = { source: 'enregistre', fichier: 'C:\\essai\\releve-payant.json', bilan: { at: '2026-10-05T09:00:00.000Z', quota: { restants: 300, utilises: 200 }, cout: 18, matchsParCle: { soccer_epl: 10, soccer_spl: 0 } } };
/** Un championnat de l'instantané (forme de championnatsDeLInstantane). */
const auReleve = (cle, extra) => ({ cle, nom: NOMS_DES_CLES[cle], matchsAVenir: 1, releveAt: '2026-10-05T11:00:00.000Z', encoreJouable: false, ...extra });
/** La vague de 18 h 15 : trois championnats, compositions annoncées à 18 h, cotes de 11 h. */
const vague = (extra = {}) =>
  CR.conseilDeReleve({
    maintenant: t('2026-10-05T18:15:00Z'),
    matchs: [proche(), proche({ matchId: 'm2', league: NOMS_DES_CLES[LIGA], home: 'Betis', away: 'Sevilla' }), proche({ matchId: 'm3', league: NOMS_DES_CLES[SERIEA], home: 'Roma', away: 'Lazio' })],
    reglage: R,
    dernierReleve: BILAN,
    instantane: [auReleve(EPL), auReleve(LIGA), auReleve(SERIEA), auReleve(BUNDES, { matchsAVenir: 3 }), auReleve(L1, { matchsAVenir: 0 })],
    ...extra
  });

test('E8 — le bloc « releveCible » : les championnats de la vague, 1 crédit chacun, les crédits après, ce que deviennent les autres — tout dit AVANT le clic ; le bouton allumé seulement « maintenant »', () => {
  const c = vague();
  assert.equal(c.conseil, 'maintenant');
  const b = c.releveCible;
  assert.deepEqual([b.actif, b.cles, b.groupe, b.credits, b.restants, b.apres, b.tropDeCles, b.max], [true, [EPL, LIGA, SERIEA], [EPL, LIGA, SERIEA], 3, 300, 297, false, 12]);
  assert.deepEqual(b.noms, ['EPL', 'La Liga - Spain', 'Serie A - Italy']);
  assert.deepEqual(b.retires, [{ cle: BUNDES, nom: 'Bundesliga - Germany', matchsAVenir: 3, releveAt: '2026-10-05T11:00:00.000Z' }], 'un championnat sans match à venir n’est pas « retiré »');
  assert.deepEqual(b.encoreJouables, []);
  assert.equal(b.textes.bouton, 'Relever 3 championnats (3 crédits)');
  assert.equal(b.textes.confirmer, 'Confirmer : 3 crédits');
  assert.equal(b.textes.cout, 'Relever seulement ces 3 championnats (EPL, La Liga - Spain et Serie A - Italy) : 3 crédits au plus (1 par championnat ; un championnat sans match ne coûte rien).');
  assert.equal(b.textes.credits, 'Il vous reste 300 crédits (compte le 05/10 à 11 h 00). Après ce relevé : au moins 297.');
  assert.equal(
    b.textes.autres,
    "Les cotes de 1 autre championnat, relevées le 05/10 à 13 h 00, seront retirées. Leurs matchs restent sur la page Matchs, avec les cotes gratuites quand il y en a. Aucune mise ne sera conseillée sur eux tant qu'ils ne seront pas relevés à leur tour."
  );
  assert.equal(b.textes.pied, "Rien ne part tout seul : le relevé ne se fait que si vous cliquez, puis confirmez. Le relevé complet (37 compétitions, jusqu'à 37 crédits) reste dans Réglages › Données.");
  assert.deepEqual([b.textes.encoreJouables, b.textes.plusTard, b.textes.tropDeCles], [null, null, null]);
  // Le relevé complet garde son conseil d'avant (résumé, crédits, bouton « Actualiser ») : rien n'y change.
  assert.equal(c.credits.parReleve, 37);
  assert.equal(c.bouton.automatique, false);
  // Sans instantané lu : rien à retirer, dit.
  assert.equal(vague({ instantane: null }).releveCible.textes.autres, "Aucun autre championnat n'a de cotes à venir dans le relevé actuel : rien ne sera retiré.");
});

test('E8 — crédits restants inconnus (aucun bilan) : null, jamais un chiffre deviné, et dit ; « plus-tard » : le coût déjà dit, le bouton éteint avec son heure ; « inutile » : rien à relever', () => {
  const sans = vague({ dernierReleve: { source: 'absent', fichier: 'C:\\essai\\releve-payant.json', bilan: null } }).releveCible;
  assert.deepEqual([sans.restants, sans.apres, sans.credits, sans.actif], [null, null, 3, true]);
  assert.equal(sans.textes.credits, 'Crédits restants inconnus : ils seront connus après ce relevé.');
  // Plus tard : compositions annoncées à 16 h (18 h à Paris) — le coût est dit, le bouton attend.
  const plusTard = CR.conseilDeReleve({
    maintenant: t('2026-10-05T12:00:00Z'),
    matchs: [proche({ coupDEnvoi: '2026-10-05T17:00:00Z' })],
    reglage: R,
    dernierReleve: BILAN,
    instantane: [auReleve(EPL, { releveAt: '2026-10-05T11:00:00.000Z' })]
  });
  assert.equal(plusTard.conseil, 'plus-tard');
  assert.deepEqual([plusTard.releveCible.actif, plusTard.releveCible.cles, plusTard.releveCible.credits], [false, [EPL], 1]);
  // Correction S9 : la page ne se relit pas toute seule, elle le dit.
  assert.equal(
    plusTard.releveCible.textes.plusTard,
    "Le bouton s'allumera vers 18 h 00, à l'annonce des compositions : rechargez cette page à ce moment-là (elle ne se met pas à jour toute seule). Un relevé fait avant ne permettrait aucune mise."
  );
  assert.match(plusTard.releveCible.textes.cout, /^Relever seulement ce championnat \(EPL\) : 1 crédit au plus/);
  // Inutile : cotes relevées après l'annonce — rien à relever, même un championnat « encore jouable » ne l'est pas.
  const inutile = CR.conseilDeReleve({
    maintenant: t('2026-10-05T18:30:00Z'),
    matchs: [proche({ releveAt: '2026-10-05T18:10:00Z' })],
    reglage: R,
    dernierReleve: BILAN,
    instantane: [auReleve(EPL, { encoreJouable: true }), auReleve(BUNDES, { encoreJouable: true })]
  });
  assert.equal(inutile.conseil, 'inutile');
  assert.deepEqual([inutile.releveCible.actif, inutile.releveCible.cles, inutile.releveCible.credits, inutile.releveCible.encoreJouables], [false, [], 0, []]);
  assert.deepEqual([inutile.releveCible.textes.bouton, inutile.releveCible.textes.confirmer, inutile.releveCible.textes.cout], [null, null, null]);
});

test('E8 — un championnat encore jouable (cotes fraîches, match pas commencé) est redemandé avec la vague, +1 crédit, et n’est pas « retiré » (RC3) ; plus de 12 championnats : bouton éteint, relevé complet proposé', () => {
  const avec = vague({ instantane: [auReleve(EPL), auReleve(BUNDES, { matchsAVenir: 3, encoreJouable: true }), auReleve(L1, { matchsAVenir: 2 })] }).releveCible;
  assert.deepEqual([avec.cles, avec.groupe, avec.credits, avec.apres], [[EPL, LIGA, SERIEA, BUNDES], [EPL, LIGA, SERIEA], 4, 296]);
  assert.deepEqual(avec.encoreJouables, [{ cle: BUNDES, nom: 'Bundesliga - Germany', matchsAVenir: 3, releveAt: '2026-10-05T11:00:00.000Z' }]);
  assert.deepEqual(avec.retires.map((c) => c.cle), [L1]);
  assert.equal(avec.textes.encoreJouables, "Bundesliga - Germany a encore des cotes fraîches pour un match qui n'a pas commencé : redemandé pour garder ses cotes (+1 crédit chacun).");
  assert.equal(avec.textes.bouton, 'Relever 4 championnats (4 crédits)');
  // Treize championnats dans la vague : au-delà du plafond.
  const treize = TRACKED_SPORT_KEYS.filter((k) => k !== 'soccer_spl').slice(0, CR.CLES_PAR_RELEVE_CIBLE_MAX + 1);
  const trop = CR.conseilDeReleve({
    maintenant: t('2026-10-05T18:15:00Z'),
    matchs: treize.map((k, i) => proche({ matchId: `m${i}`, league: NOMS_DES_CLES[k], home: `Dom ${i}`, away: `Ext ${i}` })),
    reglage: R,
    dernierReleve: BILAN,
    instantane: []
  });
  assert.equal(trop.conseil, 'maintenant');
  assert.deepEqual([trop.releveCible.actif, trop.releveCible.tropDeCles, trop.releveCible.cles.length], [false, true, 13]);
  // RC3 bis : le coût du relevé complet est dit, sans y pousser (plus de « Faites plutôt »).
  assert.equal(trop.releveCible.textes.tropDeCles, "13 championnats à relever : 12 au plus par relevé ciblé. Le relevé complet (Réglages › Données) les relève tous, pour jusqu'à 37 crédits.");
  assert.doesNotMatch(JSON.stringify(trop.releveCible.textes), /Faites plutôt/);
  // Correction S1 : sans relevé ciblé possible (plus de 12), le résumé et le bouton restent ceux du relevé complet.
  assert.match(trop.resume, /37 crédits au plus/);
  assert.equal(trop.bouton.ou, 'Réglages › Données › Cotes marché (The Odds API) › « Actualiser »');
});

test('E8 — les championnats de l’instantané : matchs à venir par clé ; « encore jouable » seulement avec une cote fraîche de vos bookmakers pour un match pas commencé dont l’annonce des compositions est passée (RC3 bis)', () => {
  const livre = (key) => ({ key, title: key, markets: [] });
  const brut = (sport_key, commence_time, livres = [livre('williamhill')]) => ({ sport_key, sport_title: NOMS_DES_CLES[sport_key], commence_time, bookmakers: livres });
  const maintenant = t('2026-10-05T12:00:00Z');
  const lus = CR.championnatsDeLInstantane(
    [
      brut(EPL, '2026-10-05T19:00:00Z'), // fraîche (relevée à 11 h), mais compositions à 18 h : pas encore jouable (RC3 bis)
      brut(EPL, '2026-10-05T11:00:00Z'), // déjà commencé
      brut(LIGA, '2026-10-05T10:00:00Z'), // seulement un match joué
      brut(SERIEA, '2026-10-05T12:30:00Z'), // compositions annoncées à 11 h 30, après la cote de 11 h
      brut(BUNDES, '2026-10-05T19:00:00Z', [livre('pinnacle')]), // aucun de vos bookmakers
      { sport_key: null },
      null
    ],
    { maintenant, releveAt: '2026-10-05T11:00:00.000Z', garderLivre: (b) => b.key !== 'pinnacle' }
  );
  assert.deepEqual(
    lus.map((c) => [c.cle, c.nom, c.matchsAVenir, c.encoreJouable]),
    [
      [EPL, 'EPL', 1, false],
      [LIGA, 'La Liga - Spain', 0, false],
      [SERIEA, 'Serie A - Italy', 1, false],
      [BUNDES, 'Bundesliga - Germany', 1, false]
    ]
  );
  assert.ok(lus.every((c) => c.releveAt === '2026-10-05T11:00:00.000Z'));
  // Annonce passée (match à 12 h 30, compositions à 11 h 30), cote relevée APRÈS elle (11 h 45) : encore jouable.
  assert.equal(CR.championnatsDeLInstantane([brut(EPL, '2026-10-05T12:30:00Z')], { maintenant, releveAt: '2026-10-05T11:45:00.000Z' })[0].encoreJouable, true);
  // Même cote, match à 13 h 30 (annonce à 12 h 30, pas encore passée) : pas encore jouable.
  assert.equal(CR.championnatsDeLInstantane([brut(EPL, '2026-10-05T13:30:00Z')], { maintenant, releveAt: '2026-10-05T11:45:00.000Z' })[0].encoreJouable, false);
  // Trop vieille (relevée à 7 h, délai de 3 h) : plus jouable ; heure du fichier inconnue : jamais jouable.
  assert.equal(CR.championnatsDeLInstantane([brut(EPL, '2026-10-05T12:30:00Z')], { maintenant, releveAt: '2026-10-05T07:00:00.000Z' })[0].encoreJouable, false);
  assert.equal(CR.championnatsDeLInstantane([brut(EPL, '2026-10-05T12:30:00Z')], { maintenant, releveAt: null })[0].encoreJouable, false);
  assert.deepEqual(CR.championnatsDeLInstantane('pas une liste', { maintenant }), []);
});

// ------------------------------------------------- la passe de corrections (relecture Fable, synthèse S1 à S9)

test('S2 (RC3 bis) — la cascade : juste après un relevé complet, la vague suivante n’est plus bloquée ni renvoyée au relevé complet ; elle relève sa vague et garde la précédente, 2 crédits, bouton allumé', () => {
  // Le scénario de revue-fable/essais/synthese-cascade.test.mjs, avec la VRAIE fonction corrigée (réglage de Pierre : 60 min).
  const MIN = 60_000;
  const reglage = { maxAgeMinutes: 60, avantCompos: true };
  const vosLivres = (b) => b.key === 'winamax_fr';
  const dernier = (at) => ({ source: 'enregistre', bilan: { at: new Date(at).toISOString(), quota: { restants: 400, utilises: 100 }, cout: 33, matchsParCle: {} } });
  const brutDe = (k, coup) => ({ sport_key: k, sport_title: NOMS_DES_CLES[k], commence_time: new Date(coup).toISOString(), bookmakers: [{ key: 'winamax_fr' }] });
  const T0 = t('2026-11-21T13:00:00Z'); // relevé COMPLET à 13 h 00
  const [W, X] = TRACKED_SPORT_KEYS;
  const AUTRES = TRACKED_SPORT_KEYS.slice(2, 32); // 30 championnats avec un match dans 3 jours
  const coupW = T0 + 80 * MIN; // vague n° 1 : compositions vers 13 h 20
  const coupX = T0 + 110 * MIN; // vague n° 2 : compositions vers 13 h 50
  const brut = [brutDe(W, coupW), brutDe(X, coupX), ...AUTRES.map((k) => brutDe(k, T0 + 72 * 60 * MIN))];
  const conseilA = (maintenant, releveAt, matchs) =>
    CR.conseilDeReleve({ maintenant, reglage, dernierReleve: dernier(releveAt), matchs, instantane: CR.championnatsDeLInstantane(brut, { maintenant, releveAt: new Date(releveAt).toISOString(), reglage, garderLivre: vosLivres }) });
  const matchW = { matchId: 'evt-w', home: 'A', away: 'B', league: NOMS_DES_CLES[W], coupDEnvoi: new Date(coupW).toISOString(), heureSure: true, vosCotes: true, releveAt: new Date(T0).toISOString(), compos: null };
  // 13 h 25 : vague W (cote de 13 h 00, d'avant son annonce) — W seul, 1 crédit, bouton allumé.
  const c1 = conseilA(T0 + 25 * MIN, T0, [matchW]);
  assert.deepEqual([c1.conseil, c1.releveCible.actif, c1.releveCible.cles, c1.releveCible.credits, c1.releveCible.tropDeCles], ['maintenant', true, [W], 1, false]);
  // Relevé ciblé de W à 13 h 26. 13 h 55 : vague X ; W (annonce passée, cote d'après elle) est gardé.
  const T1 = T0 + 26 * MIN;
  const matchX = { matchId: 'evt-x', home: 'C', away: 'D', league: NOMS_DES_CLES[X], coupDEnvoi: new Date(coupX).toISOString(), heureSure: true, vosCotes: true, releveAt: new Date(T1).toISOString(), compos: null };
  const c2 = conseilA(T0 + 55 * MIN, T1, [{ ...matchW, releveAt: new Date(T1).toISOString() }, matchX]);
  assert.deepEqual([c2.conseil, c2.releveCible.actif, c2.releveCible.cles, c2.releveCible.credits, c2.releveCible.tropDeCles], ['maintenant', true, [X, W], 2, false]);
  assert.deepEqual(c2.releveCible.encoreJouables.map((c) => c.cle), [W], 'l’ancienne vague gardée');
  assert.equal(c2.releveCible.textes.bouton, 'Relever 2 championnats (2 crédits)');
  assert.doesNotMatch(JSON.stringify(c2), /Faites plutôt/);
});

test('S5 — crédits insuffisants (2 restants, 5 à dépenser : 3 de la vague + 2 encore frais) : bouton éteint, « il en faut 5 », jamais un nombre négatif (encadré ni chiffre clé)', () => {
  const c = vague({
    dernierReleve: { ...BILAN, bilan: { ...BILAN.bilan, quota: { restants: 2, utilises: 498 } } },
    instantane: [auReleve(EPL), auReleve(BUNDES, { matchsAVenir: 3, encoreJouable: true }), auReleve(L1, { matchsAVenir: 2, encoreJouable: true })]
  });
  assert.equal(c.conseil, 'maintenant');
  const b = c.releveCible;
  assert.deepEqual([b.actif, b.credits, b.restants, b.suffisants, b.apres], [false, 5, 2, false, 0]);
  assert.equal(b.textes.credits, 'Il vous reste 2 crédits, il en faut 5 : pas assez pour ce relevé.');
  assert.doesNotMatch(JSON.stringify(b.textes), /-\s*\d/, 'aucun nombre négatif dans les textes');
  assert.deepEqual([c.credits.apres, c.credits.suffisants], [0, false], 'le chiffre clé « après un relevé complet » : 0, jamais -35');
  // Assez de crédits (5 tout juste) : allumé.
  const juste = vague({ dernierReleve: { ...BILAN, bilan: { ...BILAN.bilan, quota: { restants: 5, utilises: 495 } } }, instantane: [auReleve(EPL), auReleve(BUNDES, { matchsAVenir: 3, encoreJouable: true }), auReleve(L1, { matchsAVenir: 2, encoreJouable: true })] }).releveCible;
  assert.deepEqual([juste.actif, juste.apres], [true, 0]);
  // Inconnus : allumé (le relevé les dira).
  assert.equal(vague({ dernierReleve: { source: 'absent', fichier: 'x', bilan: null } }).releveCible.actif, true);
});

test('S1 — un relevé ciblé proposé : le résumé (page du match, Opportunités) et le bouton nommé sont les siens (« 3 crédits au plus », « Relever 3 championnats ») ; les chiffres du relevé complet sont dits « relevé complet » ; sans relevé ciblé, les textes du relevé complet restent', () => {
  const c = vague();
  assert.equal(c.resume, 'Relevé conseillé maintenant : 3 championnats, 3 crédits au plus, maintenant (compositions annoncées).');
  assert.deepEqual(c.bouton, { ou: 'Réglages › Cotes de vos bookmakers › « Relever 3 championnats »', automatique: false, texte: 'Rien ne part tout seul : le relevé ne se fait que si vous cliquez « Relever 3 championnats » puis confirmez.' });
  assert.ok(!/37 crédits au plus|« Actualiser »/.test(`${c.resume} ${c.bouton.ou} ${c.bouton.texte}`));
  assert.match(c.credits.detail, /^Le relevé complet \(Réglages › Données\) relève les 37 compétitions suivies/);
  // « plus-tard » : le coût ciblé déjà dit.
  const plusTard = CR.conseilDeReleve({ maintenant: t('2026-10-05T12:00:00Z'), matchs: [proche({ coupDEnvoi: '2026-10-05T17:00:00Z' })], reglage: R, dernierReleve: BILAN, instantane: [auReleve(EPL)] });
  assert.equal(plusTard.resume, 'Relevé conseillé vers 18 h 00 : 1 championnat, 1 crédit au plus, vers 18 h 00 (annonce des compositions).');
  // « inutile » : le titre seul, et le bouton du relevé complet (rien de ciblé).
  const inutile = CR.conseilDeReleve({ maintenant: t('2026-10-05T18:30:00Z'), matchs: [proche({ releveAt: '2026-10-05T18:10:00Z' })], reglage: R, dernierReleve: BILAN, instantane: [auReleve(EPL)] });
  assert.deepEqual([inutile.resume, inutile.bouton.ou], ["Pas de relevé conseillé pour l'instant", 'Réglages › Données › Cotes marché (The Odds API) › « Actualiser »']);
});

test('S3 — un match de l’instantané payant que vos bookmakers ne cotent pas, relevé APRÈS l’annonce de ses compositions : « non cotées », plus « maintenant », la phrase dite ; relevé AVANT l’annonce : toujours « utile » (un seul nouvel essai)', () => {
  // Un match à 19 h (compositions à 18 h) ; il est 18 h 15 ; aucun de vos bookmakers ne le cote (le cas des championnats
  // sans prix français, comme la Russie ou la Chine le 09/11).
  const l1 = (instantaneA) => proche({ home: 'Essai Bolton', away: 'Essai Wigan', vosCotes: false, releveAt: null, ...(instantaneA ? { instantaneA } : {}) });
  const apres = CR.conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [l1('2026-10-05T18:05:00.000Z')], reglage: R, dernierReleve: BILAN, instantane: [] });
  assert.equal(apres.conseil, 'inutile');
  assert.equal(apres.releveCible.actif, false);
  assert.match(apres.raison, /Relevé fait à 20 h 05 : vos bookmakers ne cotent pas ce match \(Essai Bolton – Essai Wigan\) ; un nouveau relevé n'y changerait rien\./);
  assert.doesNotMatch(apres.raison, /pas encore relevées/);
  // Instantané d'AVANT l'annonce (17 h 30) : toujours « maintenant », bouton allumé.
  const avant = CR.conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [l1('2026-10-05T17:30:00.000Z')], reglage: R, dernierReleve: BILAN, instantane: [] });
  assert.deepEqual([avant.conseil, avant.releveCible.actif, avant.matchs.map((m) => m.cotes)], ['maintenant', true, ['absentes']]);
  // Sans heure d'instantané (match hors instantané) : comme avant le lot.
  assert.equal(CR.conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [l1(null)], reglage: R, dernierReleve: BILAN, instantane: [] }).conseil, 'maintenant');
});

test('S4 — le serveur relit le conseil avant tout appel payant : clés ≠ conseil, bouton éteint, vrai conseil qui ne les propose pas, ou autant de clés mais pas les mêmes → 409, aucun appel, ni l’instantané ni le bilan ne bougent (octets et heure), verrou rendu ; les mêmes clés (autre ordre) → le relevé part', () => {
  const s = lancer('script-releve-cible.mjs', 'liste');
  const message = 'La liste à relever a changé depuis votre clic : relisez l’encart. Rien n’est parti.';
  assert.deepEqual(s.liste.map((x) => x.nom), ['a cles differentes', 'b bouton eteint', 'd vrai conseil', 'e meme nombre autres cles', 'c memes cles']);
  for (const x of s.liste.slice(0, 4)) assert.deepEqual([x.nom, x.code, x.erreur, x.appels, x.inchanges, x.verrou], [x.nom, 409, message, 0, true, null], x.nom);
  const c = s.liste[4];
  assert.deepEqual([c.nom, c.code, c.appels, c.inchanges, c.verrou], ['c memes cles', 200, 2, false, null]);
  assert.deepEqual(s.listeAppels, [LIGA, EPL]);
  assert.equal(s.vraiConseil.actif === true && s.vraiConseil.cles?.includes(BUNDES), false, 'le vrai conseil ne propose pas la Bundesliga');
});

test('S7 — (horloge réelle) l’instantané est daté du DÉBUT du relevé : clé 1 à t1, clé 2 après 1,2 s, heure du fichier ≤ t1 ; le match annoncé entre t1 et l’écriture reste « avant les compositions » (jamais frais)', () => {
  const s = lancer('script-releve-cible.mjs', 'debut', { reel: true }).debut;
  assert.equal(s.code, 200, s.erreur ?? '');
  assert.ok(s.dureeMs >= 1200, `le relevé a duré ${s.dureeMs} ms`);
  assert.equal(s.annonceEntreT1EtFin, true, 'l’annonce tombe bien entre la réponse de la clé 1 et l’écriture');
  assert.equal(s.fichierEntreDebutEtT1, true, 'l’heure du fichier est celle du début du relevé');
  // La règle gelée (fraicheurCotes.js) : « à rafraîchir », motif « avant-compos ».
  assert.deepEqual(s.fraicheur, { etat: 'a-rafraichir', code: 'avant-compos' });
  // Le conseil : le match reste à relever (sa cote n'est pas fraîche), avec l'heure du début du relevé.
  assert.deepEqual(s.conseil, [{ cotes: 'a-rafraichir', releveAt: true }], 'le conseil ne la voit jamais fraîche');
});

// ------------------------------------------------- l'analyse IA (Claude et FotMob simulés)

test('A4 (RC6) — pour un même match et un même instant, la décision de mise donnée à l’IA est celle de la page du match : « à rafraîchir » des deux côtés pour une cote trop vieille, « RECOMMENDED » des deux côtés pour une cote fraîche ; ce que le gel écrit ne change pas d’un octet', () => {
  const s = lancer('script-releve-cible-ia.mjs', 'a4', { ia: true });
  const sansCode = ({ code, ...reste }) => reste;
  // Trop vieille (relevée à 7 h, il est 12 h).
  assert.deepEqual(s.vieille.page, { code: 200, action: 'PASS', reason: 'a_rafraichir', bookmaker: 'williamhill', fraicheur: 'trop-vieille' });
  assert.deepEqual(s.vieille.ia, sansCode(s.vieille.page), 'l’IA reçoit « à rafraîchir », comme la page');
  assert.match(s.vieille.ligneIA, /^Mise \(staking\) : PASS \(a_rafraichir\)/);
  assert.match(s.vieille.ligneIASansFraicheur, /^Mise \(staking\) : RECOMMENDED/, 'sans la fraîcheur jointe, l’IA recevait une mise que la page refuse');
  // Fraîche (relevée à 11 h).
  assert.deepEqual(s.fraiche.page, { code: 200, action: 'RECOMMENDED', reason: null, bookmaker: 'williamhill', fraicheur: 'fraiche' });
  assert.deepEqual(s.fraiche.ia, sansCode(s.fraiche.page));
  assert.match(s.fraiche.ligneIA, /^Mise \(staking\) : RECOMMENDED : 1,19 % du capital sur Man City gagne à 2,3 chez William Hill/);
  // Le gel : la même entrée (même match, même « à vérifier ») et la même ligne écrite, à l'octet, avec ou sans la jointure.
  for (const cas of [s.vieille, s.fraiche]) {
    assert.deepEqual([cas.gel.appels, cas.gel.memeMatch, cas.gel.memeAVerifier, cas.gel.identique], [[1, 1], true, true, true]);
    assert.ok(cas.gel.lignes > 0, 'le gel écrit bien des pronostics');
  }
});

test('1b (RC5) — une analyse IA déjà faite pour le même match sous un AUTRE identifiant (calendrier ↔ The Odds API) n’est pas refaite : ni d’avance, ni avant le coup d’envoi, ni dans la réserve du jour ; un autre jour, un autre championnat, une entrée sans heure ne bloquent rien', () => {
  const s = lancer('script-releve-cible-ia.mjs', '1b', { ia: true });
  assert.deepEqual(s.fonction, {
    everton: 'essai-oddsapi-everton',
    evertonAutreChampionnat: null,
    evertonDansUneSemaine: null,
    brighton: null,
    fulham: null,
    leeds: 'essai-oddsapi-leeds',
    parIdentifiant: 'essai-oddsapi-everton'
  });
  assert.equal(s.reserve, 1, 'la réserve du jour : Birmingham seul (Leeds est fait, sous l’autre identifiant)');
  assert.deepEqual(s.avance.appels, ['avance:Arsenal', 'avance:Brighton', 'avance:Fulham'], 'Everton est déjà analysé');
  assert.deepEqual([s.avance.ok, s.avance.failed], [3, 0]);
  assert.deepEqual(s.coupDEnvoi.appels, ['coup-d-envoi:Birmingham'], 'Leeds est déjà analysé avant son coup d’envoi');
  assert.deepEqual([s.coupDEnvoi.ok, s.coupDEnvoi.failed], [1, 0]);
  // Les analyses neuves sont rangées sous l'identifiant du moment ; les anciennes restent. (Leeds : le cas inverse de S6 —
  // analyse sous l'identifiant The Odds API, match revenu au calendrier — reste « faite ».)
  assert.deepEqual(s.rangees, [
    ['cal-2026-10-05-Birmingham-Sheffield United', 'coup-d-envoi'],
    ['cal-2026-10-05-Leeds-Newcastle', 'avance'],
    ['cal-2026-10-06-Arsenal-Chelsea', 'avance'],
    ['cal-2026-10-06-Brighton-Wolves', 'avance'],
    ['cal-2026-10-06-Fulham-Brentford', 'avance'],
    ['essai-oddsapi-brighton', 'coup-d-envoi'],
    ['essai-oddsapi-everton', 'avance'],
    ['essai-oddsapi-leeds', 'coup-d-envoi'],
    ['essai-sans-heure-fulham', 'avance']
  ]);
});

test('S6 (RC5 bis) — une analyse au coup d’envoi faite sous l’identifiant du calendrier, SANS cote payante, puis le match relevé (identifiant The Odds API, cotes payées) : la réserve la compte, elle est refaite UNE fois sous l’identifiant du moment, puis plus rien', () => {
  const s = lancer('script-releve-cible-ia.mjs', 's6s8', { ia: true });
  assert.equal(s.reserveAvant, 1, 'la réserve du jour la compte');
  assert.deepEqual([s.passe1.ok, s.passe1.failed, s.passe1.appels], [1, 0, ['coup-d-envoi:Aston Villa']], JSON.stringify(s.passe1.samples));
  assert.deepEqual([s.passe2.ok, s.passe2.appels], [0, []], 'la passe suivante la trouve par l’identifiant : plus rien');
  assert.equal(s.reserveApres, 0);
  assert.deepEqual(s.rangeesS6, [
    ['cal-2026-10-05-Aston Villa-Burnley', 'coup-d-envoi'],
    ['essai-oddsapi-villa', 'coup-d-envoi']
  ]);
});

test('S8 — deux analyses du même match (d’avance sous le calendrier, au coup d’envoi sous The Odds API) : UNE seule revue d’après-match, sur celle du coup d’envoi ; la passe suivante, aucune', () => {
  const s = lancer('script-releve-cible-ia.mjs', 's6s8', { ia: true });
  assert.deepEqual([s.revue1.ok, s.revue1.failed, s.revue1.appels.length], [1, 0, 1], JSON.stringify(s.revue1));
  assert.deepEqual(s.revue1.revues, ['essai-oddsapi-wolves'], 'la revue porte sur l’analyse du coup d’envoi');
  assert.deepEqual([s.revue2.ok, s.revue2.appels], [0, []], 'une entrée sœur a déjà sa revue : rien');
  assert.deepEqual(s.revue2.revues, ['essai-oddsapi-wolves']);
});
