/**
 * Étape 14 du plan — le CONTRÔLE QUOTIDIEN des données, la SANTÉ DES SOURCES
 * et le badge « À VÉRIFIER ».
 *   node --test test/controleQuotidien.test.mjs        (depuis server/)
 *
 * Les règles pures (couleurs, explication d'un écart de score, familles de
 * marché, raisons d'un pronostic) tournent ici, sans base ni réseau. Tout ce
 * qui ouvre une base tourne dans une copie isolée de la base d'essai
 * (test/aides/isolement.mjs : réseau coupé, heure figée au 05/10/2026 12 h
 * UTC, jamais la vraie base) : test/aides/script-controle-quotidien.mjs y
 * PLANTE chaque cas (SQL direct, fichiers de data/runtime) puis lance le
 * contrôle. Retouche du 07/10 au soir : cette copie est rangée dans un BAC
 * SIMULÉ (test/aides/bacSimule.mjs), le même où que le test tourne : les
 * scénarios « sources coupées par le bac » ne dépendent plus de l'endroit où
 * il est lancé (le bac ou le dépôt). Un serveur « réel » (clés présentes) se
 * dit par une configuration explicite (CONFIG_REELLE du script), jamais par
 * un emplacement.
 *
 *  1. Les règles : les couleurs (rouge = impossible ou contradictoire, 24 h
 *     puis « connu » ; hors repères et zéros « non relevé » jamais rouges),
 *     l'explication d'un écart de score, les sources dans le feu, les raisons
 *     « à vérifier » d'un match, la famille d'un marché (écran = serveur).
 *  2. Les scores face à football-data : expliqués et non expliqués, rouge puis
 *     connu puis corrigé ; un FAUX SCORE qui fait passer le feu au rouge.
 *  3. Le cas argentin (jaunes à 0, le déroulé en compte) ; 4. hors repères.
 *  5. La santé des sources, lue dans les valeurs notées, avec un fetch simulé
 *     jamais appelé ; le suivi des réponses FotMob et son relevé après
 *     redémarrage ; le compteur d'API-Football, jamais la clé.
 *  6. Le badge « à vérifier » et sa raison : journal des pronostics,
 *     Opportunités, match par ses noms (jamais un rapprochement souple) ; le
 *     verdict ne change jamais. Retouche du 07/10 : un écart de BUTEURS ou de
 *     GARDIENS (famille « joueurs ») reste rouge dans la carte mais ne marque
 *     aucun marché d'aujourd'hui ni le bandeau d'un match — seulement un
 *     futur pari sur un joueur ; un score faux marque tous les marchés ; le
 *     compte « clubs aux données douteuses » reste celui des clubs qui ont
 *     un badge.
 *  7. La durée de la passe, l'étape de l'actualisation, les routes.
 *  8. La lecture du code : aucune écriture dans la base, aucun appel réseau,
 *     aucun rapprochement de noms, l'étape en dernier, rien de planifié.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import * as D from '../src/data/db/dailyChecks.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-controle-quotidien.mjs');
const UI = path.resolve(SERVEUR, '..', 'ui');
const MAINTENANT = Date.parse('2026-10-05T12:00:00.000Z');
const HEURE = 3_600_000;
/** Un fichier du serveur, fins de ligne Windows ramenées à « \n » (les lectures du code ne dépendent pas de la copie). */
const lireSrc = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8').replace(/\r\n/g, '\n');

/** Une ou plusieurs phases du script d'essai, dans UNE copie neuve rangée dans un bac simulé (scripts du serveur compris : l'application en importe). */
function lancer(...phases) {
  const copie = preparerCopieDeBac({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const sorties = {};
    for (const phase of phases) {
      const r = executerDansLeBac(copie, SCRIPT, { args: [phase], timeout: 300_000 });
      assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
      assert.equal(r.reseau, false, 'aucun appel réseau');
      assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
      sorties[phase] = r.json;
    }
    return phases.length === 1 ? sorties[phases[0]] : sorties;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const scores = uneFois(() => lancer('scores'));
const fauxScore = uneFois(() => lancer('faux-score'));
const argentine = uneFois(() => lancer('argentine'));
const reperes = uneFois(() => lancer('reperes'));
const sources = uneFois(() => lancer('sources'));
const fotmob = uneFois(() => lancer('fotmob', 'fotmob-relu'));
const apiFootball = uneFois(() => lancer('apifootball'));
const badge = uneFois(() => lancer('badge'));
const joueurs = uneFois(() => lancer('joueurs'));
const duree = uneFois(() => lancer('duree'));
const etape = uneFois(() => lancer('etape'));
const route = uneFois(() => lancer('route'));

/** Les contrôles d'un état résumé, à une couleur donnée : [clé:total]. */
const aLaCouleur = (etat, couleur) =>
  Object.entries(etat.controles)
    .filter(([, c]) => c.statut === couleur)
    .map(([k]) => k);

// ================================================================ 1. les règles

test('les contrôles : une trentaine, une clé chacun, rouge réservé aux données impossibles ou contradictoires, hors repères et zéros « non relevé » jamais rouges', () => {
  assert.ok(D.CONTROLES.length >= 28 && D.CONTROLES.length <= 40, `${D.CONTROLES.length} contrôles`);
  assert.equal(new Set(D.CONTROLES.map((c) => c.cle)).size, D.CONTROLES.length, 'une clé par contrôle');
  const familles = new Set(D.FAMILLES.map((f) => f.cle));
  for (const c of D.CONTROLES) {
    assert.ok(familles.has(c.famille), `${c.cle} : famille ${c.famille}`);
    assert.ok(['rouge', 'orange', 'info'].includes(c.classe), `${c.cle} : classe ${c.classe}`);
    assert.ok(c.libelle && c.quoi, `${c.cle} : un libellé et ce qu'il regarde`);
  }
  // Le jeu évolue : une saison ou un match hors repères est au plus ORANGE ; un zéro « non relevé » aussi.
  for (const c of D.CONTROLES.filter((x) => ['reperes', 'non-releves'].includes(x.famille))) assert.equal(c.classe, 'orange', c.cle);
  // Rouge : scores contradictoires, doublons, chiffres impossibles, match joué absent, source coupée (FotMob, jeton Claude expiré).
  assert.deepEqual(
    [...new Set(D.CONTROLES.filter((c) => c.classe === 'rouge').map((c) => c.famille))].sort(),
    ['completude', 'doublons', 'impossibles', 'scores', 'sources']
  );
  // Les six sources, une ligne chacune.
  assert.deepEqual(D.CONTROLES.filter((c) => c.famille === 'sources').map((c) => c.cle), ['source-fotmob', 'source-football-data', 'source-odds-api', 'source-api-football', 'source-claude', 'source-cotes-gratuites']);
});

test('les couleurs : un rouge reste rouge 24 h puis devient « connu » (orange) ; un contrôle en panne compte orange, un contrôle pas fait ne colore rien', () => {
  const t = MAINTENANT;
  const il = (heures) => new Date(t - heures * HEURE).toISOString();
  assert.equal(D.couleurDuConstat({ classe: 'rouge', trouveLe: il(23.9) }, t), 'rouge');
  assert.equal(D.couleurDuConstat({ classe: 'rouge', trouveLe: il(24) }, t), 'orange', '24 h pile : connu');
  assert.equal(D.couleurDuConstat({ classe: 'rouge' }, t), 'rouge', 'sans date de découverte : nouveau');
  assert.equal(D.couleurDuConstat({ classe: 'orange', trouveLe: il(1) }, t), 'orange');
  assert.equal(D.couleurDuConstat({ classe: 'info', trouveLe: il(1) }, t), 'vert', 'une information ne colore jamais');
  assert.equal(D.NOUVEAU_MS, 24 * HEURE);
  assert.equal(D.couleurDuFeu([{ statut: 'erreur' }], t), 'orange');
  assert.equal(D.couleurDuFeu([{ statut: 'non-fait' }], t), 'vert');
  assert.equal(D.couleurDuFeu([], t), 'vert');
  assert.equal(D.couleurDuFeu([{ statutDirect: 'orange' }, { constats: [{ classe: 'rouge', trouveLe: il(1) }] }], t), 'rouge');
  assert.equal(D.couleurDuFeu([{ statutDirect: 'orange' }, { constats: [{ classe: 'rouge', trouveLe: il(30) }] }], t), 'orange');
  // Les constats au-delà des 40 gardés (orange) comptent quand même.
  assert.equal(D.statutDuControle({ constats: [], parClasse: { orange: 3 } }, t), 'orange');
});

test('un écart de score EXPLIQUÉ : prolongation (dite ou lue dans le déroulé), tirs au but, résultat attribué ; un but du temps additionnel (90e + 4) n’est pas une prolongation', () => {
  const buts = (l) => l.map(([side, minute, addedTime]) => ({ type: 'goal', side, minute, ...(addedTime ? { addedTime } : {}) }));
  assert.equal(D.expliquerEcart({ fd: [2, 2], magasin: [3, 2], meta: { reason: 'afterextra' } }).cle, 'prolongation');
  assert.equal(D.expliquerEcart({ fd: [1, 1], magasin: [1, 1], meta: { reason: 'afterpenalties' } }).cle, 'tirs-au-but');
  assert.equal(D.expliquerEcart({ fd: [1, 1], magasin: [3, 0], meta: { awarded: 1 } }).cle, 'attribue');
  assert.equal(D.expliquerEcart({ fd: [1, 1], magasin: [3, 0], meta: { reason: 'awarded_win' } }).cle, 'attribue');
  // FotMob ne dit pas toujours « après prolongation » : un but à la 105e et le score à 90 minutes = celui de football-data.
  const deroule = D.expliquerEcart({ fd: [1, 1], magasin: [2, 1], buts: buts([['home', 30], ['away', 60], ['home', 105]]) });
  assert.deepEqual([deroule.explique, deroule.cle], [true, 'prolongation']);
  assert.match(deroule.texte, /score à 90 minutes est celui de football-data/);
  // Le temps additionnel : FotMob note 90 (+4), jamais 94 — pas une prolongation.
  assert.equal(D.expliquerEcart({ fd: [1, 1], magasin: [2, 1], buts: buts([['home', 30], ['away', 60], ['home', 90, 4]]) }).explique, false);
  // Un but après la 90e, mais le déroulé ne fait pas le score du magasin : rien n'explique l'écart.
  assert.equal(D.expliquerEcart({ fd: [1, 1], magasin: [3, 1], buts: buts([['home', 30], ['away', 60], ['home', 105]]) }).explique, false);
  // Le déroulé fait bien le score (2-1, un but à la 105e), mais à 90 minutes c'était 1-1, pas le 2-0 de football-data : rien ne l'explique.
  assert.equal(D.expliquerEcart({ fd: [2, 0], magasin: [2, 1], buts: buts([['home', 30], ['away', 60], ['home', 105]]) }).explique, false);
  const non = D.expliquerEcart({ fd: [3, 0], magasin: [4, 0], buts: buts([['home', 10], ['home', 20], ['home', 30], ['home', 40]]) });
  assert.deepEqual([non.explique, non.cle], [false, 'non-explique']);
  assert.equal(non.texte, 'aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique');
});

test('les sources dans le feu : une source coupée (gris) ne colore rien, une source jamais au-dessus de la classe de son contrôle, une source non lue « pas faite »', () => {
  const lignes = D.controlesDesSources({
    sources: [
      { cle: 'fotmob', couleur: 'rouge', etat: 'en-panne', libelleEtat: 'En panne', resume: 'FotMob ne répond plus.' },
      { cle: 'odds-api', couleur: 'rouge', etat: 'en-panne', libelleEtat: 'En panne', resume: 'Crédits épuisés.' },
      { cle: 'claude', couleur: 'gris', etat: 'coupe', libelleEtat: 'Coupée', resume: 'Jeton vidé.' }
    ]
  });
  const par = Object.fromEntries(lignes.map((c) => [c.cle, c]));
  assert.equal(par['source-fotmob'].statutDirect, 'rouge', 'FotMob en panne : rouge (le magasin ne se met plus à jour)');
  assert.equal(par['source-odds-api'].statutDirect, 'orange', 'The Odds API : au plus orange');
  assert.equal(par['source-claude'].statutDirect, 'vert', 'coupée : ne colore rien');
  assert.equal(par['source-fotmob'].constat, 'En panne — FotMob ne répond plus.');
  assert.deepEqual([par['source-api-football'].statut, par['source-api-football'].raisonNonFait], ['non-fait', 'santé des sources non lue']);
  assert.equal(D.couleurDuFeu(lignes, MAINTENANT), 'rouge');
});

test('« à vérifier » d’un match : clubs PAR IDENTIFIANT sur les 60 jours d’avant, relevés absents de son championnat, famille du marché, raisons générales, FotMob en panne', () => {
  const etat = {
    aVerifier: {
      clubs: {
        'fotmob-1': [
          { id: 'a', controle: 'score-football-data', texte: 'Score à vérifier : A – B du 05/09/2026', date: '2026-09-05', familles: ['tout'] },
          { id: 'b', controle: 'chiffres-equipe', texte: 'Statistiques impossibles : A – C du 01/07/2026', date: '2026-07-01', familles: ['corners', 'tirs'] },
          { id: 'c', controle: 'classement-officiel', texte: 'Bilan différent du classement officiel : A', date: null, familles: ['tout'] }
        ]
      },
      ligues: { EPL: [{ id: 'j', controle: 'jaunes-non-releves', texte: 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026', date: '2026-09-05', familles: ['cartons'] }] },
      global: []
    }
  };
  const ids = (r) => r?.raisons.map((x) => x.id) ?? [];
  // Le 08/10 : le score du 05/09 (33 jours avant) et le classement ; pas les statistiques du 01/07 (99 jours avant).
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'Championship', date: '2026-10-08', homeId: 'fotmob-1', awayId: 'fotmob-2', famille: 'buts' })), ['a', 'c']);
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'Championship', date: '2026-10-08', homeId: 'fotmob-1', famille: 'corners' })), ['a', 'c'], 'les statistiques du 01/07, 99 jours avant le match : hors des 60 jours');
  // Le 01/08 : les statistiques du 01/07 comptent pour les corners ; le score du 05/09, APRÈS le match, jamais.
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'Championship', date: '2026-08-01', awayId: 'fotmob-1', famille: 'corners' })), ['b', 'c']);
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'Championship', date: '2026-08-01', awayId: 'fotmob-1', famille: 'buts' })), ['c'], 'des corners faux ne touchent pas un marché de buts');
  // Sans identifiant de club : rien des clubs (jamais par le nom) ; le championnat, si.
  assert.equal(D.aVerifierDuMatch(etat, { league: 'Championship', date: '2026-10-08', famille: 'buts' }), null);
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'EPL', date: '2026-10-08', famille: 'cartons' })), ['j']);
  assert.equal(D.aVerifierDuMatch(etat, { league: 'EPL', date: '2026-10-08', famille: 'buts' }), null, 'des cartons non relevés ne touchent pas un marché de buts');
  assert.deepEqual(ids(D.aVerifierDuMatch(etat, { league: 'EPL', date: '2026-10-08', famille: null })), ['j'], 'sans famille : les raisons des marchés d’aujourd’hui, chacune dit les siennes (celles des joueurs, plus bas)');
  // Les raisons générales et FotMob en panne valent pour tout match.
  const panne = D.aVerifierDuMatch({ aVerifier: { clubs: {}, ligues: {}, global: [] } }, { league: 'X', date: '2026-10-08', fotmob: { enPanne: true, derniereReussite: '2026-10-04T08:00:00Z' } });
  assert.equal(panne.texte, 'FotMob ne répond plus depuis le 04/10/2026 : résultats et compositions récents peut-être manquants');
  const deux = D.aVerifierDuMatch(etat, { league: 'EPL', date: '2026-10-08', homeId: 'fotmob-1', famille: 'cartons' });
  assert.equal(deux.texte, 'Score à vérifier : A – B du 05/09/2026 (et 2 autres raisons)');
  assert.equal(D.aVerifierDuMatch(null, { league: 'EPL', date: '2026-10-08' }), null, 'jamais contrôlé : aucun badge');
});

test('la famille d’un marché : identifiants du moteur et anciens libellés ; la règle de l’écran est celle du serveur', async () => {
  const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'controleQuotidien.js')).href);
  const cas = {
    result: 'buts',
    totalGoals: 'buts',
    btts: 'buts',
    teamGoals: 'buts',
    bothTeamsScore: 'buts',
    resultAndTotal: 'buts',
    home: 'buts',
    over25: 'buts',
    totalCorners: 'corners',
    teamCorners: 'corners',
    totalShots: 'tirs',
    teamShotsOnTarget: 'tirs',
    totalCards: 'cartons',
    teamCards: 'cartons',
    'Corners — plus de 9,5': 'corners',
    'Tirs cadrés — Arsenal': 'tirs',
    'Cartons — total': 'cartons',
    'Total buts': 'buts',
    // Retouche du 07/10 : un pari sur un JOUEUR (étape 34 du plan : buteur, passeur, tireur, joueur averti) est de la famille « joueurs ».
    // « anytimeScorer » existe déjà (cote saisie à la main) ; les autres identifiants viendront avec l'étape.
    scorer: 'joueurs',
    anytimeScorer: 'joueurs',
    firstScorer: 'joueurs',
    playerShots: 'joueurs',
    playerShotsOnTarget: 'joueurs',
    playerCards: 'joueurs',
    assists: 'joueurs',
    'Buteur — Haaland': 'joueurs',
    'Buteur (à tout moment)': 'joueurs',
    'Passeur — Saka': 'joueurs',
    'Joueur — Salah, plus de 0,5 tir cadré': 'joueurs',
    // Un mot pris au milieu d'un nom de club n'est jamais une famille.
    'Résultat — Cardiff Corners FC': 'buts',
    'Résultat — Buteur FC': 'buts',
    'Résultat — Top Scorer': 'buts',
    'Total buts — Scorer United': 'buts',
    'Buts — Joueur Athletic': 'buts',
    'Corners — Passeur FC': 'corners',
    '': 'buts'
  };
  for (const [marche, famille] of Object.entries(cas)) {
    assert.equal(D.familleDuMarche(marche), famille, `serveur : ${marche}`);
    assert.equal(U.familleDuMarche(marche), famille, `écran : ${marche}`);
  }
  assert.deepEqual(U.FAMILLE_PAR_MARCHE, D.FAMILLE_PAR_MARCHE, 'la même table des deux côtés');
  // Les raisons qu'un badge garde pour un marché : celles de « tout » et de sa famille.
  const aVerifier = { raisons: [{ id: 'a', texte: 'Score à vérifier', familles: ['tout'] }, { id: 'j', texte: 'Cartons non relevés', familles: ['cartons'] }] };
  assert.deepEqual(U.raisonsPourMarche(aVerifier, 'totalCards').map((r) => r.id), ['a', 'j']);
  assert.deepEqual(U.raisonsPourMarche(aVerifier, 'result').map((r) => r.id), ['a']);
  assert.deepEqual(U.raisonsPourMarche(aVerifier, null).map((r) => r.id), ['a', 'j']);
  assert.equal(U.texteDesRaisons(U.raisonsPourMarche(aVerifier, 'totalCards')), 'Score à vérifier (et 1 autre raison)');
  // Une raison de la famille « joueurs » (un écart de buteurs) : sur un marché de joueur seulement, jamais sur un marché d'aujourd'hui.
  const avecJoueurs = { raisons: [{ id: 'a', texte: 'Score à vérifier', familles: ['tout'] }, { id: 'b', texte: 'Buteurs et score', familles: ['joueurs'] }] };
  assert.deepEqual(U.raisonsPourMarche(avecJoueurs, 'anytimeScorer').map((r) => r.id), ['a', 'b']);
  for (const marche of ['result', 'totalGoals', 'totalCorners', 'totalShots', 'totalCards']) assert.deepEqual(U.raisonsPourMarche(avecJoueurs, marche).map((r) => r.id), ['a'], marche);
  assert.match(U.phraseDuBadge(aVerifier.raisons), /^À vérifier : Score à vérifier ; Cartons non relevés\. Le pronostic et son verdict ne changent pas/);
  assert.equal(U.phraseDuBadge([]), '');
});

test('la famille « joueurs » (retouche du 07/10) : une raison de joueurs ne vient que sur un marché de joueur — jamais sur un marché d’aujourd’hui ni dans le résumé d’un match ; celles de « tout » viennent partout ; seuls buteurs et gardiens sont des joueurs', () => {
  const raison = (id, controle, familles, date = '2026-09-17') => ({ id, controle, texte: `texte ${id}`, date, familles });
  const etat = {
    aVerifier: {
      clubs: {
        // Un club dont seules les données des joueurs sont douteuses (façon Celtic – Ferencváros).
        'fotmob-1': [raison('but', 'buteurs-score', ['joueurs']), raison('gar', 'gardiens-score', ['joueurs'])],
        // Un score faux (tout) et un écart de buteurs (joueurs).
        'fotmob-2': [raison('score', 'score-football-data', ['tout']), raison('but2', 'buteurs-score', ['joueurs'])],
        // Une raison qui touche des corners ET des joueurs : un marché d'aujourd'hui, donc comptée.
        'fotmob-3': [raison('mixte', 'x', ['joueurs', 'corners'])]
      },
      ligues: {},
      global: []
    }
  };
  const ids = (club, famille) => D.aVerifierDuMatch(etat, { league: 'EPL', date: '2026-10-08', homeId: club, famille })?.raisons.map((r) => r.id) ?? null;
  // Le club aux seules données de joueurs douteuses : rien sur un marché d'aujourd'hui, rien dans le résumé ; deux raisons sur un marché de joueur.
  for (const famille of ['buts', 'corners', 'tirs', 'cartons', null]) assert.equal(ids('fotmob-1', famille), null, `famille ${famille}`);
  assert.deepEqual(ids('fotmob-1', 'joueurs'), ['but', 'gar']);
  // Le score faux marque tout, jusqu'au marché de joueur ; l'écart de buteurs qui l'accompagne, seulement ce dernier.
  for (const famille of ['buts', 'corners', 'tirs', 'cartons', null]) assert.deepEqual(ids('fotmob-2', famille), ['score'], `famille ${famille}`);
  assert.deepEqual(ids('fotmob-2', 'joueurs'), ['score', 'but2']);
  // Une raison de plusieurs familles : celles d'aujourd'hui la portent (résumé compris), pas les autres.
  assert.deepEqual([ids('fotmob-3', 'corners'), ids('fotmob-3', null), ids('fotmob-3', 'joueurs'), ids('fotmob-3', 'buts')], [['mixte'], ['mixte'], ['mixte'], null]);
  // Une raison générale (le magasin pas à jour) et FotMob en panne valent pour un marché de joueur comme pour les autres.
  const general = { aVerifier: { clubs: {}, ligues: {}, global: [raison('maj', 'magasin-a-jour', ['tout'], null)] } };
  assert.deepEqual(D.aVerifierDuMatch(general, { league: 'EPL', date: '2026-10-08', famille: 'joueurs' }).raisons.map((r) => r.id), ['maj']);
  assert.equal(D.aVerifierDuMatch(null, { league: 'EPL', date: '2026-10-08', famille: 'joueurs', fotmob: { enPanne: true } }).raisons[0].controle, 'source-fotmob');
  // La règle, en deux fonctions : seules des familles TOUTES sans marché ne touchent aucun marché d'aujourd'hui.
  assert.deepEqual([...D.FAMILLES_SANS_MARCHE], ['joueurs']);
  assert.ok(D.FAMILLES_DE_MARCHE.includes('joueurs') && D.FAMILLES_SANS_MARCHE.every((f) => D.FAMILLES_DE_MARCHE.includes(f)));
  assert.deepEqual(
    [['joueurs'], ['tout'], ['joueurs', 'corners'], ['corners'], [], undefined, null].map((f) => D.toucheUnMarcheDuMoteur(f)),
    [false, true, true, true, true, true, true]
  );
  // Seuls ces deux contrôles de l'étape 12 sont des données de joueurs ; les autres gardent leurs familles (chiffres d'équipe : corners et tirs).
  const T = D.__testing.DEPUIS_L_ETAPE_12;
  assert.deepEqual(Object.entries(T).filter(([, r]) => r.familles?.includes('joueurs')).map(([sorte, r]) => [sorte, r.controle, r.familles]), [['gardiens', 'gardiens-score', ['joueurs']], ['buteurs', 'buteurs-score', ['joueurs']]]);
  assert.deepEqual(T.equipe.familles, ['corners', 'tirs']);
  assert.equal(T.joueurs.aVerifier, false, 'les chiffres de joueurs impossibles ne marquaient aucun pronostic, et n’en marquent toujours aucun');
  // Un constat de buteurs, tel que le contrôle le construit : rouge, « à vérifier », famille « joueurs », ses deux clubs.
  const ctx = { rencontres: new Map([['k', { homeId: 'fotmob-1', awayId: 'fotmob-2' }]]) };
  const c = D.__testing.depuisAnomalie({ id: 'impossible:buteurs:k:home', sorte: 'buteurs', gravite: 'erreur', label: 'A – B', date: '2026-09-17', detail: 'd', matchKey: 'k' }, ctx);
  assert.deepEqual([c.controle, c.classe, c.aVerifier, c.familles, c.clubs], ['buteurs-score', 'rouge', true, ['joueurs'], ['fotmob-1', 'fotmob-2']]);
});

// ======================================================= 2. scores et faux score

test('scores face à football-data : un écart non expliqué ROUGE, quatre expliqués (une information), rouge une heure plus tard, « connu » à 26 h, disparu une fois corrigé — sans une écriture dans la base', () => {
  const s = scores();
  assert.equal(s.ecrituresPendantLeControle, 0, 'le contrôle ne fait que lire');
  const p = s.premier;
  assert.equal(p.feu, 'rouge');
  const nonExplique = p.controles['score-football-data'];
  assert.equal(nonExplique.statut, 'rouge');
  assert.equal(nonExplique.total, 1);
  const c = nonExplique.constats[0];
  assert.equal(c.texte, 'Millwall – Bolton du 05/09/2026 : FotMob 4-0, football-data 3-0 — aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique.');
  assert.equal(c.raison, 'Score à vérifier : Millwall – Bolton du 05/09/2026 (FotMob 4-0, football-data 3-0)');
  assert.deepEqual(c.familles, ['tout'], 'un score faux touche tous les marchés');
  assert.ok(c.clubs.length === 2 && c.clubs.every((id) => /^fotmob-\d+$/.test(id)), 'les clubs par identifiant FotMob');
  assert.equal(c.trouveLe, '2026-10-05T12:00:00.000Z');
  // Les quatre écarts expliqués : une information, jamais une couleur.
  const explique = p.controles['score-football-data-explique'];
  assert.equal(explique.statut, 'vert');
  assert.equal(explique.total, 4);
  const textes = explique.constats.map((x) => x.texte);
  assert.ok(textes.some((t) => /^Peterborough United – Barnsley du 15\/09\/2026 \(FotMob 3-3, football-data 4-3\) : décidé aux tirs au but/.test(t)), textes.join('\n'));
  assert.ok(textes.some((t) => /^Hallescher FC – Schalke 04 du 24\/08\/2026 \(FotMob 2-5, football-data 2-2\) : décidé en prolongation/.test(t)));
  assert.ok(textes.some((t) => /^Brentford – Sunderland du 05\/09\/2026 \(FotMob 3-0, football-data 1-1\) : résultat attribué sur tapis vert/.test(t)));
  assert.ok(textes.some((t) => new RegExp(`\\(FotMob 2-1, football-data 1-1\\) : prolongation : le déroulé FotMob a des buts après la 90e`).test(t)), 'la prolongation lue dans le déroulé');
  assert.ok(explique.constats.every((x) => x.aVerifier === false && x.classe === 'info'), 'un écart expliqué ne marque aucun pronostic');
  // Une heure plus tard, rien de corrigé : toujours rouge, même date de découverte.
  assert.equal(s.second.feu, 'rouge');
  assert.equal(s.second.controles['score-football-data'].constats[0].trouveLe, '2026-10-05T12:00:00.000Z');
  // 26 heures plus tard : « connu », orange, toujours listé.
  assert.equal(s.troisieme.controles['score-football-data'].statut, 'orange');
  assert.equal(s.troisieme.controles['score-football-data'].total, 1);
  assert.equal(s.troisieme.feu, 'orange');
  assert.equal(s.relu25h, 'orange', 'le même état relu 26 h plus tard : même règle');
  // Corrigé dans le magasin : l'écart disparaît du contrôle suivant.
  assert.equal(s.corrige.controles['score-football-data'].statut, 'vert');
  assert.equal(s.corrige.controles['score-football-data'].total, 0);
  assert.equal(s.corrige.controles['score-football-data-explique'].total, 4);
});

test('un FAUX SCORE fait passer le feu au rouge : football-data, les buteurs et les gardiens le contredisent, et les pronostics des deux clubs sont « à vérifier »', () => {
  const f = fauxScore();
  // La veille, les anomalies connues de la base d'essai sont trouvées ; le lendemain elles sont « connues » : feu orange.
  assert.equal(f.veille.feu, 'rouge');
  assert.equal(f.avant.feu, 'orange');
  assert.deepEqual(aLaCouleur(f.avant, 'rouge'), []);
  assert.equal(f.avant.controles['score-football-data'].statut, 'vert', 'toute la Premier League de la fenêtre au même score que football-data');
  assert.deepEqual(f.faux.avant, [4, 1]);
  // Le faux score 4-3 : rouge.
  assert.equal(f.apres.feu, 'rouge');
  for (const cle of ['score-football-data', 'buteurs-score', 'gardiens-score']) assert.ok(aLaCouleur(f.apres, 'rouge').includes(cle), `${cle} rouge`);
  const c = f.apres.controles['score-football-data'].constats[0];
  assert.equal(c.texte, 'Leeds – Newcastle du 14/09/2026 : FotMob 4-3, football-data 4-1 — aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique.');
  assert.deepEqual(c.clubs, f.faux.ids);
  assert.equal(c.trouveLe, '2026-10-05T13:00:00.000Z');
  // Le prochain match de Leeds (par son identifiant) : à vérifier, la raison en tête.
  assert.equal(f.badge.raisons[0].texte, 'Score à vérifier : Leeds – Newcastle du 14/09/2026 (FotMob 4-3, football-data 4-1)');
  // Retouche du 07/10 : buteurs et gardiens (des données de JOUEURS) restent rouges dans la carte (plus haut) mais ne marquent plus un
  // marché de buts, ni le résumé du match ; ils marquent un marché de joueur. Le score, lui, marque tout ce que le moteur calcule.
  assert.deepEqual(f.badge.raisons.map((r) => r.controle), ['score-football-data', 'classement-officiel', 'magasin-a-jour']);
  assert.match(f.badge.texte, /^Score à vérifier : Leeds – Newcastle du 14\/09\/2026 \(FotMob 4-3, football-data 4-1\) \(et 2 autres raisons\)$/);
  assert.deepEqual(f.badgeResume.raisons.map((r) => r.controle), ['score-football-data', 'classement-officiel', 'magasin-a-jour'], 'le résumé du match : pas de joueurs');
  assert.deepEqual(f.badgeJoueur.raisons.map((r) => r.controle), ['score-football-data', 'buteurs-score', 'gardiens-score', 'classement-officiel', 'magasin-a-jour'], 'un marché de joueur : le score ET les joueurs');
});

// ============================================================ 3-4. non relevés, repères

test('le cas argentin : des jaunes publiés à 0 des deux côtés alors que le déroulé en compte — ORANGE, famille cartons, sans toucher aux marchés de buts', () => {
  const a = argentine();
  const avant = a.avant.controles['jaunes-non-releves'];
  assert.ok(!avant.constats.some((c) => c.id === 'jaunes-non-releves:EPL'));
  // Les vrais cas de la base d'essai (Chili, Lettonie, Équateur, Paraguay) sont déjà vus.
  assert.ok(avant.total >= 4, `${avant.total}`);
  const j = a.apres.controles['jaunes-non-releves'];
  assert.equal(j.statut, 'orange', 'jamais rouge : une limite de la source, pas une donnée fausse');
  const epl = j.constats.find((c) => c.id === 'jaunes-non-releves:EPL');
  assert.ok(epl, 'la Premier League signalée');
  assert.equal(epl.texte, `EPL : cartons jaunes publiés à 0 des deux côtés dans ${a.plante.epl} matchs sur ${a.plante.epl} depuis le 05/09/2026 (rouges relevés dans 6) ; le déroulé de ces matchs en compte 2,0 par match — non relevés par FotMob.`);
  assert.match(epl.detail, /aucune donnée n’est corrigée/);
  assert.deepEqual(epl.familles, ['cartons']);
  assert.equal(epl.raison, 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026');
  // Deux matchs à 0 en Serie A : sous le seuil (5 matchs et la moitié du championnat), jamais signalé.
  assert.ok(!j.constats.some((c) => /Serie A - Italy/.test(c.texte)));
  // Le badge : les marchés de cartons de la Premier League, et eux seuls.
  assert.ok(a.badge.cartons.raisons.some((r) => r.id === 'jaunes-non-releves:EPL'));
  assert.ok(!a.badge.buts?.raisons.some((r) => r.id === 'jaunes-non-releves:EPL'));
  // La base d'essai s'arrête au 21/09 : vu du 05/10, le magasin n'a rien reçu depuis — la raison générale, pour tout marché.
  assert.deepEqual(a.badge.buts.raisons.map((r) => r.controle), ['magasin-a-jour']);
  assert.equal(a.badge.buts.texte, 'Le magasin n’a rien reçu depuis le 21/09/2026 : résultats récents peut-être manquants');
  assert.ok(!a.badge.autreLigue?.raisons.some((r) => r.id === 'jaunes-non-releves:EPL'));
  assert.ok(a.badge.toutes.raisons.some((r) => r.id === 'jaunes-non-releves:EPL' && r.familles.includes('cartons')));
});

test('hors repères (étape 15) : une saison à +6,7 écarts normaux et un match à 35 corners donnent de l’ORANGE, jamais du rouge ; 20 matchs ne suffisent pas', () => {
  const r = reperes();
  assert.ok(r.attendus.epl.ecarts > 6, `${r.attendus.epl.ecarts}`);
  const buts = r.etat.controles['hors-reperes-buts'];
  assert.equal(buts.statut, 'orange');
  assert.equal(buts.total, 1);
  assert.equal(buts.constats[0].classe, 'orange');
  assert.equal(buts.constats[0].texte, 'EPL 2026-27 : buts par match 4,20, attendu 2,78 (+6,7 écarts normaux, sur 80 matchs) — à regarder : le jeu évolue.');
  assert.equal(buts.constats[0].aVerifier, false, 'une saison hors repères ne marque aucun pronostic');
  // La Serie A : 4,5 buts par match, très loin de l'attendu, mais sur 20 matchs (moins de 30) — rien.
  assert.ok(r.attendus.italie.ecarts > 3 && r.attendus.italie.matchs < D.MINIMUM_MATCHS_REPERES);
  assert.ok(!buts.constats.some((c) => /Serie A/.test(c.texte)));
  // La Championship, normale (10,6 corners pour 10,5) : rien.
  assert.equal(r.etat.controles['hors-reperes-statistiques'].total, 0);
  const fou = r.etat.controles['match-aberrant'];
  assert.equal(fou.statut, 'orange');
  assert.equal(fou.constats[0].texte, 'Portsmouth – Cardiff du 05/09/2026 : 35 corners, pour 10,5 attendus par match en Championship (+7,2 écarts-types) — vrai match fou, ou chiffre faux ?');
  assert.deepEqual(fou.constats[0].familles, ['corners']);
  // Rien de rouge ne vient des repères (le seul rouge : les anomalies connues des classements de la base d'essai).
  assert.deepEqual(aLaCouleur(r.etat, 'rouge'), ['classement-officiel']);
});

// =============================================================== 5. les sources

test('la santé des sources se LIT dans les valeurs notées : un fetch simulé n’est jamais appelé, ni par la lecture, ni par les routes', () => {
  const s = sources();
  assert.equal(s.appelsFetch, 0, 'aucun appel, pas même pour lire un compteur');
  assert.equal(s.route.code, 200);
  assert.equal(s.checks, 200);
  const par = (liste) => Object.fromEntries(liste.map((x) => [x.cle, x]));
  // Un serveur en bonne santé (clés présentes).
  const bon = par(s.bon.sources);
  assert.deepEqual(s.bon.sources.map((x) => x.cle), ['fotmob', 'football-data', 'odds-api', 'api-football', 'claude', 'cotes-gratuites']);
  assert.ok(s.bon.sources.every((x) => x.etat === 'ok' && x.couleur === 'vert'), JSON.stringify(s.bon.sources.map((x) => [x.cle, x.etat])));
  assert.equal(bon['odds-api'].resume, '412 crédits restants (88 consommés) au relevé du 05/10/2026 à 10:00.');
  assert.deepEqual([bon['odds-api'].limite.valeur, bon['odds-api'].limite.max], [412, 500]);
  assert.equal(bon['api-football'].limite.texte, '3 appels aujourd’hui sur 100 (plan gratuit : 100 par jour)');
  assert.equal(bon['api-football'].limite.restant, 97);
  assert.equal(bon.claude.limite.expireLe, '2027-09-30');
  assert.equal(bon.claude.limite.aConfirmer, false);
  assert.ok(bon['odds-api'].payant && bon['api-football'].payant && !bon.fotmob.payant);
  // Le même serveur sans clé (le bac à sable) : coupées, jamais « en panne ».
  const bac = par(s.bac.sources);
  assert.equal(s.bac.bac, true);
  for (const cle of ['odds-api', 'api-football', 'claude', 'cotes-gratuites']) assert.equal(bac[cle].etat, 'coupe', cle);
  assert.match(bac['odds-api'].resume, /Clé vidée par le bac à sable : aucun relevé possible ici\.$/);
  // Un serveur en difficulté.
  const p = par(s.pannes.sources);
  assert.deepEqual([p.fotmob.etat, p.fotmob.couleur], ['en-panne', 'rouge']);
  assert.match(p.fotmob.resume, /^FotMob ne répond plus : 6 réponses en échec de suite \(accès refusé \(401\/403\) : FotMob refuse l’appli\)\. .*plan de secours : docs\/plan-secours-fotmob\.md \(rien ne bascule sans votre accord\)\.$/);
  assert.equal(p['football-data'].etat, 'a-surveiller');
  assert.equal(p['odds-api'].resume, '20 crédits restants (480 consommés) au relevé du 04/10/2026 à 10:00. 20 crédits restants : moins qu’un relevé complet (37).');
  assert.equal(p['api-football'].etat, 'a-surveiller');
  assert.equal(p['api-football'].limite.valeur, 95);
  assert.deepEqual([p.claude.etat, p.claude.couleur], ['en-panne', 'rouge']);
  assert.match(p.claude.resume, /^Jeton expiré le 01\/10\/2026 ; .*Les analyses IA échouent jusqu’au renouvellement du jeton \(claude setup-token\)\.$/);
  assert.equal(p['cotes-gratuites'].resume, 'À surveiller : Kalshi : HTTP 500.');
  // Un relevé payant d'un mois précédent : le compte a pu repartir — inconnu, jamais « épuisé » ; un réglage du jeton illisible : la date par défaut, à confirmer.
  const mois = par(s.moisPrecedent);
  assert.equal(mois['odds-api'].etat, 'inconnu');
  assert.match(mois['odds-api'].resume, /d’un mois précédent : le compte a pu repartir depuis\.$/);
  assert.deepEqual([mois.claude.limite.expireLe, mois.claude.limite.aConfirmer, mois.claude.limite.reglage], ['2027-09-30', true, 'illisible']);
  assert.equal(s.epuise.etat, 'a-surveiller');
  assert.match(s.epuise.resume, /Crédits épuisés\.$/);
  // L'étape 46 : l'état de FotMob, en une fonction.
  assert.deepEqual([s.etatFotmob.etat, s.etatFotmob.enPanne, s.etatFotmob.erreursDeSuite], ['en-panne', true, 6]);
  // Aucune clé dans ce qui est rendu.
  assert.doesNotMatch(JSON.stringify(s), /apiKey|x-apisports-key|sk-ant|ODDS_API_KEY=|CLAUDE_CODE_OAUTH_TOKEN=/);
});

test('FotMob surveillé dans les réponses que l’actualisation reçoit DÉJÀ : forme attendue, forme inattendue, réponse illisible, accès refusé → en panne ; aucune requête de plus ; relu après redémarrage', () => {
  const { fotmob: f, 'fotmob-relu': relu } = fotmob();
  assert.equal(f.liste.length, 1, 'la liste du jour, telle que le fournisseur la rend');
  assert.equal(f.apresBonne.etat.etat, 'ok');
  // Une forme inattendue (matchs sans identifiant de club ni heure) : à surveiller, les champs manquants dits.
  const inattendue = f.apresInattendue.etat;
  assert.equal(inattendue.etat, 'a-surveiller');
  const liste = inattendue.formes.find((x) => x.type === 'liste-du-jour');
  assert.ok(liste.aSurveiller);
  assert.deepEqual(liste.manques.map((m) => m.champ).sort(), ['leagues[].matches[].away.id', 'leagues[].matches[].home.id', 'leagues[].matches[].status.utcTime']);
  assert.equal(f.illisible, 'SyntaxError', 'une page HTML à la place du JSON : l’erreur du fournisseur, inchangée');
  // Cinq refus de suite (et la réponse illisible avant) : en panne.
  assert.deepEqual([f.apresRefus.etat.etat, f.apresRefus.etat.enPanne, f.apresRefus.etat.erreursDeSuite], ['en-panne', true, 6]);
  assert.equal(f.apresRefus.etat.derniereErreur.nature, 'acces-refuse');
  assert.equal(f.apresRefus.etat.raison, '6 réponses en échec de suite (accès refusé (401/403) : FotMob refuse l’appli)');
  // AUCUNE requête de plus : celles du fournisseur, et elles seules — une par liste réussie (2), deux tentatives par
  // feuille de match en échec (sa nouvelle tentative, inchangée : 1 illisible + 5 refus = 12). Une note par appel (8).
  assert.equal(f.appels, 2 + 6 * 2);
  assert.equal(f.apresRefus.suivi.requetes, 8);
  // FotMob répond de nouveau : la série s'arrête, plus « en panne » ; l'accès refusé récent reste « à surveiller ».
  assert.deepEqual([f.apresRetour.etat, f.apresRetour.enPanne, f.apresRetour.erreursDeSuite], ['a-surveiller', false, 0]);
  assert.match(f.apresRetour.raison, /^accès refusé le 05\/10\/2026 à \d\d:00 \(403\)$/);
  // Le suivi est enregistré (fichier de data/runtime), un autre processus le relit tel quel.
  assert.equal(f.fichier.requetes, 8);
  assert.equal(f.fichier.erreursDeSuite, 6);
  assert.equal(relu.etat.etat, 'en-panne');
  assert.equal(relu.etat.source, 'fichier');
  assert.equal(relu.etat.requetes, 8);
});

test('API-Football : chaque VRAI appel est noté (jour UTC, en-têtes de limite, chemin sans paramètres), jamais la clé ; un appel sans clé n’en est pas un ; 14 jours gardés', () => {
  const a = apiFootball();
  assert.deepEqual(a.compteur.jours['2026-10-05'], { appels: 4, echecs: 1, premier: '2026-10-05T12:00:00.000Z', dernier: '2026-10-05T12:05:00.000Z' });
  assert.equal(a.compteur.dernier.chemin, '/teams');
  // Les matchs d'un club : le chemin noté, jamais ses paramètres (ni club, ni saison).
  assert.equal(JSON.parse(a.brutApresTrois).dernier.chemin, '/fixtures');
  assert.doesNotMatch(a.brutApresTrois, /team=33|season=2024|\?/, 'le chemin, jamais les paramètres');
  assert.doesNotMatch(a.brut, /team=33|season=2024/, 'le chemin, jamais les paramètres');
  assert.doesNotMatch(a.brut, /abcdefghij/, 'un long jeton dans un message d’erreur est masqué');
  assert.equal(a.jours.length, 14);
  assert.equal(a.jours[0], '2026-09-22');
  // Sans clé : l'erreur du client, aucun fichier.
  assert.match(a.sansCle, /Clé API-Football manquante/);
  assert.equal(a.sansCleFichier, false);
  // Avec une clé (d'essai) et un faux fetch : l'appel est noté avec la limite lue dans les en-têtes, la clé n'est écrite nulle part.
  assert.deepEqual(a.vu, { url: 'https://v3.football.api-sports.io/teams?search=Arsenal', entete: true });
  const apres = JSON.parse(a.apresAppel);
  assert.deepEqual([apres.dernier.limiteJour, apres.dernier.restantJour, apres.jours['2026-10-05'].appels], [100, 97, 1]);
  assert.doesNotMatch(a.apresAppel, /cle-d-essai/);
});

// ================================================================= 6. le badge

test('le badge « à vérifier » : journal des pronostics (calculé à la lecture, jamais écrit), lignes des Opportunités (verdict intact), match par ses noms — jamais par un rapprochement souple', () => {
  const b = badge();
  assert.equal(b.predictionsCode, 200);
  const p = b.predictions;
  assert.equal(p.a.texte, 'Score à vérifier : Millwall – Bolton du 05/09/2026 (FotMob 4-0, football-data 3-0)', 'Millwall à domicile le 08/10 : son score du 05/09 est à vérifier');
  assert.equal(p.b, null, 'Stoke – Charlton : rien à dire, aucun champ');
  assert.equal(p.c1.texte, 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026');
  assert.equal(p.c2, null, 'le résultat du même match : les cartons ne le touchent pas');
  assert.equal(p.d, null, 'un pronostic réglé avant la fenêtre du contrôle : rien');
  assert.equal(p.e.texte, p.a.texte, 'le pronostic du match lui-même');
  assert.deepEqual(b.avecChamp, { a: true, b: false, c1: true, c2: false, d: false, e: true }, 'le champ n’existe que s’il y a une raison');
  assert.equal(b.predictionsIntactes, true, 'à part le champ « aVerifier », chaque pronostic est exactement celui du journal');
  // Opportunités : la ligne de Millwall marquée (une copie : la ligne d'origine reste intacte), le verdict identique ; l'autre ligne, le même objet.
  const [x, y] = b.opportunites;
  assert.equal(x.aVerifier.texte, p.a.texte);
  assert.deepEqual([x.verdictIdentique, x.memeObjet, y.verdictIdentique, y.memeObjet, y.aVerifier], [true, false, true, true, null]);
  // Par les noms : l'annuaire du magasin, puis l'identifiant ; un nom inconnu ne trouve rien.
  assert.equal(b.parNoms.millwall.texte, p.a.texte);
  assert.equal(b.parNoms.casse.texte, p.a.texte, 'la même écriture, à la casse près');
  assert.equal(b.parNoms.motsInclus, null, '« Millwall Athletic Reserves » n’est PAS Millwall : aucun rapprochement souple');
  assert.equal(b.parNoms.inconnus, null);
  assert.equal(b.parNoms.cartonsEpl.texte, 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026');
  // Un pronostic réglé : sans les raisons générales (magasin pas à jour, FotMob en panne).
  assert.equal(b.sansGeneral.texte, p.a.texte);
});

test('un écart de BUTEURS façon Celtic – Ferencváros ou de GARDIENS façon Antofagasta – Deportes Iquique : rouge dans la carte comme avant, mais aucun badge sur un marché d’aujourd’hui ni de bandeau — le badge ne vient que sur un marché de joueur ; un score faux marque tous les marchés ; le compte de la carte reste juste', () => {
  const j = joueurs();
  const { clubs } = j;
  const e = j.ecartsDeJoueurs;
  const rien = (r) => assert.equal(r, null);
  // La base d'essai telle quelle : aucun constat pour ces clubs de la Premier League.
  for (const cle of ['buteurs', 'gardiens']) assert.deepEqual([j.propre[cle].statut, j.propre[cle].total], ['vert', 0], cle);
  // 1. Dans la carte, RIEN n'a changé : même couleur (rouge), mêmes constats, mêmes clubs, toujours « à vérifier » — seule la famille est « joueurs ».
  assert.deepEqual([e.buteurs.statut, e.buteurs.total, e.gardiens.statut, e.gardiens.total], ['rouge', 1, 'rouge', 1]);
  const [but] = e.buteurs.constats;
  const [gar] = e.gardiens.constats;
  assert.equal(but.texte, 'Bournemouth – Brentford du 12/09/2026 (2-2) — 3 buts crédités aux joueurs (+ 0 csc adverses) pour un score de 2 : buteur en trop');
  assert.equal(gar.texte, 'Coventry – Brighton du 13/09/2026 (0-5) — les gardiens de Coventry encaissent 0 alors que l\'adversaire marque 5');
  assert.equal(but.raison, 'Score à vérifier : Bournemouth – Brentford du 12/09/2026 (buteurs et score ne collent pas)');
  assert.equal(gar.raison, 'Score à vérifier : Coventry – Brighton du 13/09/2026 (gardiens et score ne collent pas)');
  assert.deepEqual([but.classe, but.aVerifier, gar.classe, gar.aVerifier], ['rouge', true, 'rouge', true]);
  assert.deepEqual([but.familles, gar.familles], [['joueurs'], ['joueurs']]);
  assert.deepEqual(but.clubs, [clubs.buteurs.domId, clubs.buteurs.extId]);
  assert.deepEqual(gar.clubs, [clubs.gardiens.domId, clubs.gardiens.extId]);
  assert.equal(e.feu, 'rouge', 'le feu reste rouge');
  // 2. Le prochain match de chacun de leurs quatre clubs, à domicile ou à l'extérieur : aucun badge sur les 13 marchés d'aujourd'hui.
  assert.equal(j.marchesDuMoteur.length, 13);
  assert.ok(!j.marchesDuMoteur.includes('anytimeScorer'));
  for (const [quoi, controle] of [['buteurs', 'buteurs-score'], ['gardiens', 'gardiens-score']]) {
    const p = e.prochains[quoi];
    for (const camp of ['dom', 'ext']) {
      for (const marche of j.marchesDuMoteur) rien(p[camp].aDomicile[marche]);
      rien(p[camp].alExterieur.result);
      rien(p[camp].alExterieur.totalCorners);
      // 3. Un marché de buteur FABRIQUÉ (le moteur n'en calcule aucun) : le badge apparaît, avec la raison de ce contrôle.
      assert.deepEqual(p[camp].aDomicile.anytimeScorer, [controle], `${quoi} ${camp}`);
      assert.deepEqual(p[camp].alExterieur.anytimeScorer, [controle]);
    }
    // Pas de bandeau : le résumé du match, tel que l'analyse le joint, est vide.
    rien(p.bandeau);
    rien(p.analyse);
    assert.equal(p.badgeScorer.texte, quoi === 'buteurs' ? but.raison : gar.raison);
  }
  // Le journal des pronostics (route) : le résultat et les corners de Bournemouth sans le champ, le buteur — par son identifiant ET par un
  // ancien libellé « Buteur — … » — avec la raison. Les Opportunités : la ligne du 1N2 intacte, la ligne d'un buteur marquée.
  const jr = j.journal.parId;
  rien(jr['b-resultat']);
  rien(jr['b-corners']);
  assert.deepEqual([jr['b-buteur'].controles, jr['b-ancien'].controles], [['buteurs-score'], ['buteurs-score']]);
  assert.equal(jr['b-buteur'].texte, but.raison);
  assert.deepEqual(j.opportunites.filter((l) => l.cle.startsWith('b|')).map((l) => [l.cle, l.controles]), [['b|home', null], ['b|buteur', ['buteurs-score']]]);
  // 4. Le compte « clubs aux données douteuses » de la carte (route GET /api/health/checks) : les quatre clubs ne le font pas bouger.
  // Il reste celui des clubs dont le prochain pari peut porter le badge — recompté ici club par club sur les quatre familles d'aujourd'hui.
  assert.equal(j.propre.carte.code, 200);
  assert.equal(e.carte.aVerifier.clubs, j.propre.carte.aVerifier.clubs, 'les clubs de buteurs et de gardiens ne comptent pas : leur prochain pari n’a aucun badge');
  assert.equal(e.carte.aVerifier.clubs, e.index.parBadge);
  assert.equal(j.propre.carte.aVerifier.clubs, j.propre.index.parBadge);
  const quatre = [clubs.buteurs.domId, clubs.buteurs.extId, clubs.gardiens.domId, clubs.gardiens.extId].sort();
  assert.deepEqual(e.index.joueursSeuls, quatre, 'ils restent dans l’index « à vérifier », pour les futurs paris sur les joueurs');
  assert.equal(e.index.clubs, e.carte.aVerifier.clubs + 4, 'rien n’est perdu : l’index garde les quatre clubs');
  assert.equal(e.carte.aVerifier.global, 0);
  // 5. Un score différent de football-data (Leeds – Newcastle 4-1 → 4-3) : le badge apparaît TOUJOURS sur tous les marchés,
  // celui d'un buteur compris ; les contrôles de joueurs qui l'accompagnent ne comptent que pour ce dernier.
  const f = j.fauxScore;
  assert.equal(f.footballData.statut, 'rouge');
  assert.equal(f.footballData.constats[0].texte, 'Leeds – Newcastle du 14/09/2026 : FotMob 4-3, football-data 4-1 — aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique.');
  assert.deepEqual(f.footballData.constats[0].familles, ['tout']);
  const leeds = f.prochains.faux;
  for (const camp of ['dom', 'ext']) {
    for (const marche of j.marchesDuMoteur) assert.deepEqual(leeds[camp].aDomicile[marche], ['classement-officiel', 'score-football-data'], `${camp} ${marche}`);
    assert.deepEqual(leeds[camp].alExterieur.result, ['classement-officiel', 'score-football-data']);
    assert.deepEqual(leeds[camp].alExterieur.totalCorners, ['classement-officiel', 'score-football-data']);
    assert.deepEqual(leeds[camp].aDomicile.anytimeScorer, ['buteurs-score', 'classement-officiel', 'gardiens-score', 'score-football-data'], 'un marché de joueur : le score ET les joueurs');
  }
  // Le bandeau d'un match de Leeds : le score faux (et son classement), pas les joueurs.
  assert.deepEqual(leeds.analyse, ['classement-officiel', 'score-football-data']);
  assert.equal(leeds.bandeau.texte, 'Score à vérifier : Leeds – Newcastle du 14/09/2026 (FotMob 4-3, football-data 4-1) (et 1 autre raison)');
  assert.deepEqual([j.journal.parId['f-resultat'].controles, j.journal.parId['f-buteur'].controles], [['classement-officiel', 'score-football-data'], ['buteurs-score', 'classement-officiel', 'gardiens-score', 'score-football-data']]);
  assert.deepEqual(j.opportunites.find((l) => l.cle === 'f|home').controles, ['classement-officiel', 'score-football-data']);
  // Le compte monte de DEUX clubs (Leeds et Newcastle), pas des quatre clubs de joueurs, et reste égal au recomptage.
  assert.equal(f.carte.aVerifier.clubs, e.carte.aVerifier.clubs + 2);
  assert.equal(f.carte.aVerifier.clubs, f.index.parBadge);
  assert.deepEqual(f.index.joueursSeuls, quatre);
  // Les quatre clubs d'écarts de joueurs n'ont toujours aucun badge sur un marché d'aujourd'hui.
  for (const quoi of ['buteurs', 'gardiens']) for (const marche of j.marchesDuMoteur) rien(f.prochains[quoi].dom.aDomicile[marche]);
  // 6. Le seul marché de joueur du code (la cote saisie « Buteur à tout moment ») est de la famille « joueurs », aucun marché du moteur ne l'est.
  assert.deepEqual(j.registres.saisie.filter((m) => m.joueur).map((m) => [m.id, m.famille]), [['anytimeScorer', 'joueurs']]);
  assert.deepEqual(j.registres.saisie.filter((m) => !m.joueur && m.famille === 'joueurs'), []);
  assert.deepEqual(j.registres.moteur.filter((m) => m.famille === 'joueurs'), []);
});

// ================================================== 7. durée, étape, routes

test('la durée de la passe : rapide, la main rendue au serveur entre chaque contrôle, le temps de chacun noté', () => {
  const { mesure: m } = duree();
  assert.equal(m.controles, D.CONTROLES.length);
  assert.ok(m.rencontres > 300, `${m.rencontres} rencontres dans la fenêtre`);
  assert.ok(Number.isFinite(m.dureeMs) && m.dureeMs < 10_000, `${m.dureeMs} ms`);
  assert.ok(m.blocMaxMs < 2_000, `jamais tenu plus de ${m.blocMaxMs} ms d'affilée`);
  assert.equal(m.pausesEtat, m.pausesComptees, 'chaque pause rend vraiment la main');
  assert.ok(m.pausesComptees >= 14, `${m.pausesComptees} pauses`);
  assert.deepEqual(Object.keys(m.temps), [
    'fenêtre',
    'contrôles par rencontre',
    'doublons',
    'audit des scores',
    'scores face à football-data',
    'scores des fichiers',
    'scores dans le temps',
    'identifiants',
    'classements officiels',
    'zéros non relevés',
    'matchs manquants',
    'complétude',
    'hors repères',
    'matchs hors norme'
  ]);
});

test('l’étape « controleQuotidien » : la DERNIÈRE de la passe, sous le verrou, rouge = « à regarder », la base intacte, deux fichiers de data/runtime', () => {
  const e = etape();
  assert.equal(e.etapes.at(-1), 'controleQuotidien');
  // Étape 21 (14/10/2026) : le carnet de l'IA (un fichier de data/runtime refait chaque nuit, après les clôtures
  // de la veille) s'intercale entre la sauvegarde et le contrôle quotidien, qui reste le dernier.
  // Étape 42 (22/10/2026) : le bulletin du jour et le bilan de la semaine s'intercalent à leur tour entre le carnet et le contrôle.
  // Étape 44 (23/10/2026) : la mémoire de l'IA (dossiers des équipes) suit le carnet, avant le bulletin.
  // Étape 28 (27/10/2026) : la simulation complète (deux étapes) s'intercale entre la sauvegarde et le carnet de l'IA.
  // Étape 26 (partie D, 28/10/2026) : le résumé du mois de la boucle de correction suit le bilan de la semaine.
  // Étape 32 (lot 1a, 29/10/2026) : le contexte du match s'intercale entre le résumé du mois et le contrôle quotidien.
  assert.deepEqual(e.etapes.slice(-10), ['sauvegarde', 'simulationSaisons', 'simulationMatchs', 'carnetIA', 'dossiersIA', 'bulletin', 'bilanSemaine', 'resumeCorrection', 'contexteDuMatch', 'controleQuotidien']);
  assert.equal(e.etapes.filter((k) => k === 'controleQuotidien').length, 1);
  assert.equal(e.passe.status, 'warn');
  assert.match(e.passe.summary, /^Feu rouge : 35 contrôles en [\d,]+ s sur \d+ rencontres des 30 derniers jours \(le serveur jamais tenu plus de \d+ ms d'affilée\) — rouge : score différent de football-data, classement officiel, match joué absent du magasin — orange : .*\. Rien n'est corrigé automatiquement ; le détail est dans Réglages › Contrôle quotidien\.$/);
  assert.equal(e.passe.changed, false);
  assert.equal(e.baseIntacte, true);
  assert.deepEqual(e.nouveauxFichiers.sort(), ['controle-quotidien.json', 'sante-fotmob.json']);
  // Le rapport de l'étape « omissions » de la même passe : le match joué absent, rouge, ses deux clubs à vérifier.
  const manquant = e.fichierControle.controles.find((c) => c.cle === 'rencontres-manquantes');
  assert.equal(manquant.constat, '1 constat : Millwall – Stoke du 20/09/2026 (1-0) — jouée le 2026-09-20 (tour 7) selon la page de la compétition chez FotMob (saison 2026/2027, rencontre 990001), absente du magasin.');
  assert.ok(e.fichierControle.aVerifier.clubs[e.manquants.stoke].some((r) => r.texte === 'Match joué absent du magasin : Millwall – Stoke du 20/09/2026'));
  assert.equal(e.fichierControle.base.toLowerCase().endsWith(path.join('base', 'match-stats.db').toLowerCase()), true);
  assert.equal(e.fichierFotmob.version, 1);
});

test('les routes : GET /api/health/checks (jamais, prêt), /sources, la puce de GET /api/refresh, PUT /jeton-claude (seule écriture, idempotente, refus sans rien écrire) — base intacte', () => {
  const r = route();
  // Jamais contrôlé : l'état le dit, les six sources sont là (elles se lisent sans contrôle), rien n'est écrit.
  assert.equal(r.jamais.code, 200);
  assert.equal(r.jamais.corps.etat, 'jamais');
  assert.deepEqual(r.jamais.corps.controles.map((c) => c.cle), ['source-fotmob', 'source-football-data', 'source-odds-api', 'source-api-football', 'source-claude', 'source-cotes-gratuites']);
  assert.equal(r.jamais.corps.familles.length, 7);
  assert.equal(r.jamais.corps.regles.nouveauHeures, 24);
  assert.equal(r.sourcesJamais.code, 200);
  assert.equal(r.sourcesJamais.corps.sources.length, 6);
  assert.equal(r.refreshJamais.etat, 'jamais');
  assert.equal(r.sante.corps.status, 'ok', 'GET /api/health, la route d’avant, inchangée');
  assert.equal(r.baseIntacteJamais, true);
  assert.equal(r.runtimeIntactJamais, true, 'lire n’écrit rien');
  // Après une passe : 35 contrôles, le feu, les contrôles en échec ; l'index « à vérifier » réduit à des comptes.
  const p = r.pret.corps;
  assert.equal(p.etat, 'pret');
  assert.equal(p.controles.length, D.CONTROLES.length);
  assert.equal(p.feu, 'rouge');
  assert.equal(p.enEchec[0].cle, 'score-football-data');
  assert.ok(Number.isInteger(p.aVerifier.clubs) && Number.isInteger(p.aVerifier.ligues), 'des comptes, pas l’index');
  assert.equal(p.vus, undefined);
  assert.ok(p.historique.length >= 1);
  assert.deepEqual(Object.keys(r.refreshPret).sort(), ['compte', 'enEchec', 'enEchecTotal', 'etat', 'feu', 'le']);
  assert.equal(r.refreshPret.feu, 'rouge');
  assert.ok(r.refreshPret.enEchec.length <= 8);
  assert.equal(r.baseIntactePret, true);
  // Le jeton Claude : une date, rien d'autre ; refus sans rien écrire ; idempotent ; un fichier illisible n'est jamais écrasé.
  assert.equal(r.putMauvaiseDate.code, 400);
  assert.equal(r.putMauvaiseDate.corps.error, 'Date invalide : « 2027-02-30 » (AAAA-MM-JJ, entre 2026-01-01 et 2030-12-31).');
  assert.equal(r.putChampEnPlus.code, 400);
  assert.equal(r.fichierApresRefus, false);
  assert.deepEqual([r.putBon.code, r.putBon.corps.change], [200, true]);
  assert.deepEqual([r.putIdentique.code, r.putIdentique.corps.change, r.fichierInchange], [200, false, true]);
  assert.equal(r.putAutre.corps.change, true);
  assert.deepEqual(r.fichierJeton, { version: 1, expireLe: '2027-10-15', majLe: '2026-10-05T12:00:00.000Z' });
  assert.equal(r.putIllisible.code, 503);
  assert.equal(r.fichierIllisibleGarde, '{ illisible');
  assert.equal(r.inconnue, 404);
  assert.doesNotMatch(JSON.stringify(r.putChampEnPlus), /sk-ant-secret/, 'le champ refusé n’est jamais renvoyé');
});

// ======================================================== 8. la lecture du code

const sansCommentaires = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('le code : le contrôle n’écrit jamais dans la base ni ailleurs, n’appelle aucune source, ne rapproche aucun nom', () => {
  const controle = sansCommentaires(lireSrc('data', 'db', 'dailyChecks.js'));
  assert.doesNotMatch(controle, /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA)\b/, 'aucune instruction SQL qui écrit');
  assert.doesNotMatch(controle, /\.exec\(|\.run\(/, 'aucune exécution d’écriture');
  assert.doesNotMatch(controle, /\bfetch\(|writeFile|writeJsonAtomic|appendFile|rmSync|renameSync|unlink/);
  assert.doesNotMatch(controle, /teamNamesLikelyMatch|nameMatches|clubDuMagasin|resolveTeamIds|findTeams|teamNameMatch|similar/i);
  // La santé des sources : aucun client réseau importé, aucun fetch, jamais server/.env ni ai-config.json.
  const sante = sansCommentaires(lireSrc('data', 'sourceHealth.js'));
  assert.doesNotMatch(sante, /\bfetch\(/);
  assert.doesNotMatch(sante, /from '\.\/providers\/(oddsApiClient|apiFootballClient|fotMobProvider|espn[^']*)\.js'/);
  assert.doesNotMatch(sante, /ai-config|['"`]\.env['"`]|dotenv/);
  // Les notes des sources : des fichiers de data/runtime réécrits par atomicJson, jamais un fetch.
  const releves = sansCommentaires(lireSrc('data', 'relevesDesSources.js'));
  assert.doesNotMatch(releves, /\bfetch\(|writeFileSync|fs\.write/);
  assert.match(releves, /writeJsonAtomic\(/);
  for (const f of [['data', 'repositories', 'jetonClaudeRepository.js'], ['data', 'repositories', 'controleQuotidienRepository.js']]) {
    const code = sansCommentaires(lireSrc(...f));
    assert.match(code, /writeJsonAtomic\(/, f.join('/'));
    assert.doesNotMatch(code, /writeFileSync|fs\.write/, f.join('/'));
  }
  // Le badge par les noms : jamais le résolveur des logos (il a un secours « tous les mots de l'un dans l'autre »).
  const service = sansCommentaires(lireSrc('data', 'controleQuotidien.js'));
  assert.doesNotMatch(service, /resolveTeamIds|clubDuMagasin|teamNamesLikelyMatch|nameMatches/);
  // ESPN hors de la boucle : aucun module ESPN n'est importé par l'étape.
  for (const f of [['data', 'db', 'dailyChecks.js'], ['data', 'sourceHealth.js'], ['data', 'controleQuotidien.js'], ['data', 'relevesDesSources.js']]) {
    assert.doesNotMatch(lireSrc(...f), /from '[^']*espn[^']*'/i, f.join('/'));
    assert.doesNotMatch(lireSrc(...f), /schtasks|ScheduledTask/i, `${f.join('/')} : rien de planifié dans Windows`);
  }
});

test('le code : l’étape une seule fois, en dernier ; le verdict reste celui de verdictPari.js ; FotMob et API-Football notent leurs vrais appels', () => {
  const job = lireSrc('jobs', 'matchStatsAutoRefresh.js');
  assert.equal((job.match(/key: 'controleQuotidien'/g) ?? []).length, 1);
  assert.ok(job.lastIndexOf("key: 'controleQuotidien'") > job.lastIndexOf("key: 'sauvegarde'"));
  // À chaque passe (pas de `due`), avec le contexte de la passe tel quel : le rapport de l'étape « omissions » y est.
  assert.match(job, /key: 'controleQuotidien',\n {4}label: 'Contrôle quotidien des données et santé des sources',\n(?: {4}\/\/.*\n)*? {4}run: \(ctx\) => passeControleQuotidien\(ctx\)\n {2}\}\n\];/);
  assert.match(job, /ctx\.omissions = r;/);
  // Le verdict (le seul vert) ne connaît pas « à vérifier ».
  const verdict = lireSrc('core', 'engine', 'verdictPari.js');
  assert.doesNotMatch(verdict, /aVerifier|controleQuotidien|dailyChecks/);
  // L'analyse d'un match : « à vérifier » joint APRÈS le moteur, par les noms exacts puis les identifiants ; le moteur n'en sait rien.
  const analyse = lireSrc('api', 'controllers', 'analysis.controller.js');
  // Étape 28 (27/10) : le bloc `simulation` est joint APRÈS « à vérifier », de la même façon (conception de 28 : « bloc
  // simulation ajouté APRÈS l'analyse, comme aVerifier ») ; l'analyse du moteur reste étalée telle quelle, en premier.
  assert.match(analyse, /const analyse = await analyzeMatch\(avecFraicheur, getEngineConfig\(sportId\), getTiltState\(\), getSport\(sportId\)\);\n  const aVerifier = aVerifierDuMatchAnalyse\(avecFraicheur\);\n(?: {2}\/\/.*\n)* {2}const simulation = sportId === 'football' \? simulationDuMatchAnalyse\(avecFraicheur, analyse, getEngineConfig\(sportId\)\) : null;\n {2}res\.json\(\{ \.\.\.analyse, \.\.\.\(aVerifier \? \{ aVerifier \} : \{\}\), \.\.\.\(simulation \? \{ simulation \} : \{\}\) \}\);/);
  assert.match(analyse, /preparerAVerifierParNoms\(\)/);
  // Retouche du 07/10 : le bandeau d'un match est le RÉSUMÉ du match, demandé sans famille — jamais celle des joueurs, jamais celle d'un marché.
  assert.match(analyse, /homeName: match\.home, awayName: match\.away, famille: null \}\)/);
  assert.doesNotMatch(lireSrc('core', 'engine', 'oddsEngine.js'), /aVerifier|controleQuotidien/);
  // Les fournisseurs notent ce qu'ils reçoivent déjà, sans requête de plus.
  const fm = lireSrc('data', 'providers', 'fotMobProvider.js');
  assert.match(fm, /noterReponseFotmob\(\{ url, ok: true, payload \}\);/);
  assert.match(fm, /noterReponseFotmob\(\{ url, ok: false, statut: dernierStatut, erreur: echec \}\);/);
  const af = lireSrc('data', 'providers', 'apiFootballClient.js');
  assert.match(af, /noterAppelApiFootball\(/);
  // La route : sous /api/health, après la route de santé d'avant.
  const routes = lireSrc('api', 'routes', 'index.js');
  assert.ok(routes.indexOf("router.get('/health'") < routes.indexOf("router.use('/health', healthRoutes)"));
  const sante = lireSrc('api', 'routes', 'health.routes.js');
  assert.match(sante, /router\.get\('\/checks'/);
  assert.match(sante, /router\.get\('\/sources'/);
  assert.match(sante, /router\.put\('\/jeton-claude'/);
});
