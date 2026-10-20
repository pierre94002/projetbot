/**
 * La page d'un match pour DÉCIDER (étape 9 du plan) — les règles d'affichage, fonctions pures, SANS navigateur.
 *   node --test test/pageMatchDecision.test.mjs        (depuis server/)
 *
 * ui/src/utils/verdictParMarche.js assemble le verdict de chaque marché à partir de ce que le serveur a déjà
 * calculé ; ui/src/utils/courbeDesCotes.js prépare le graphique des cotes de l'ouverture à maintenant à partir
 * des mouvements que le serveur mesure déjà. Aucune règle de pari n'y est refaite : ici on prouve que la page DIT
 * ce que dit le serveur, sans rien inventer ni rien perdre.
 *
 * Les entrées sont celles du VRAI serveur (aides/script-page-match.mjs : moteur, base d'essai, relevé The Odds API
 * et cotes gratuites fabriqués, dans une copie isolée, heure figée au 05/10/2026 12 h UTC) ; les valeurs attendues
 * sont écrites à la main ou lues sur la réponse du serveur, jamais recopiées de la sortie du code testé.
 *
 *  1. Le verdict : l'ordre des groupes, une ligne par issue du résultat et par pronostic du moteur, le verdict du
 *     serveur gardé tel quel, la meilleure cote et son heure, les cotes saisies rangées sous leur pronostic ou à part,
 *     « pas encore mesurée » partout, rien d'inventé quand il n'y a pas de cote.
 *  2. L'heure qui tourne : l'état d'une ligne est celui que dirait sa pastille à l'heure qu'il est.
 *  3. La phrase d'un « aucun pari » : une par raison que le serveur peut donner.
 *  4. La courbe : les marchés, les issues, les chiffres du serveur, les cas sans relevé, la géométrie.
 *  5. Lecture du code : rien d'impur dans ces deux fichiers.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import * as D from './aides/donneesPageMatch.mjs';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const fichiers = { verdict: path.join(UI_SRC, 'utils', 'verdictParMarche.js'), courbe: path.join(UI_SRC, 'utils', 'courbeDesCotes.js') };
const pret = Object.values(fichiers).every((f) => fs.existsSync(f));
const options = { skip: pret ? false : 'ui/src/utils/verdictParMarche.js ou courbeDesCotes.js manque' };
const V = pret ? await import(pathToFileURL(fichiers.verdict).href) : {};
const C = pret ? await import(pathToFileURL(fichiers.courbe).href) : {};
const LP = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'langageParis.js')).href) : {};

const { MIN, H } = D;
const T0 = D.MAINTENANT;
let P;
before(() => {
  if (pret) P = D.payloadsDuServeur();
});
const analyseA = () => P.analyses['essai-a'].corps;
const matchA = { home: 'Man City', away: 'Liverpool', league: 'EPL' };
const lire = (extra = {}) => V.verdictsParMarche({ result: analyseA(), match: matchA, saisies: P.saisiesA, maintenant: T0, ...extra });
const ligneDe = (v, libelle) => v.lignes.find((l) => l.libelle === libelle);

// -------------------------------------------------------------- 1. le verdict

test('le verdict : le résultat d’abord (une ligne par issue), puis chaque famille de marchés du moteur, puis les cotes saisies à part', options, () => {
  const v = lire();
  assert.deepEqual(v.groupes.map((g) => g.cle), ['resultat', 'match', 'buts', 'corners', 'tirs', 'cadres', 'saisies']);
  assert.deepEqual(v.groupes.map((g) => g.titre), ['Résultat', 'Le match', 'Buts', 'Corners', 'Tirs', 'Tirs cadrés', 'Autres cotes saisies à la main']);
  assert.deepEqual(v.groupes[0].lignes.map((l) => l.libelle), ['Man City gagne', 'Match nul', 'Liverpool gagne']);
  // Une ligne pour chaque pronostic du moteur (hors résultat, dit par les trois issues), dans l'ordre des familles.
  const pronostics = analyseA().marketPredictions.filter((p) => p.marketId !== 'result').map((p) => p.predictedLabel);
  assert.equal(pronostics.length, 14);
  const dits = v.groupes.filter((g) => g.cle !== 'resultat' && g.cle !== 'saisies').flatMap((g) => g.lignes.map((l) => l.libelle));
  assert.deepEqual([...dits].sort(), [...pronostics].sort(), 'aucun pronostic perdu, aucun inventé');
  assert.deepEqual(v.groupes[1].lignes.map((l) => l.marketId), ['resultAndTotal', 'bothTeamsScore']);
  assert.deepEqual(v.groupes[2].lignes.map((l) => l.marketId), ['totalGoals', 'teamGoals', 'teamGoals']);
  // Les cotes saisies que le moteur ne pronostique pas (une autre ligne de corners, les cartons) : à part.
  assert.deepEqual(v.groupes[6].lignes.map((l) => l.libelle).sort(), ['Plus de 4,5 cartons', 'Plus de 9,5 corners']);
  assert.equal(v.lignes.length, 3 + 14 + 2);
  assert.equal(v.sansCotes, false);
  // Rien n'est inventé : la probabilité d'un pronostic est 1 / sa cote juste ; confiance « pas encore mesurée » partout.
  for (const l of v.lignes) {
    assert.deepEqual(l.confiance, { valeur: null, etiquette: null }, l.libelle);
    if (l.probabilite !== null && l.coteJuste !== null) assert.ok(Math.abs(l.probabilite * l.coteJuste - 1) < 0.02, `${l.libelle} : probabilité × cote juste ≈ 1`);
  }
});

test('le résultat : le verdict du serveur est gardé TEL QUEL, avec sa probabilité, sa cote juste, sa meilleure cote et l’heure de son relevé', options, () => {
  const a = analyseA();
  const v = lire();
  const [domicile, nul, exterieur] = v.groupes[0].lignes;
  for (const [ligne, issue] of [[domicile, 'home'], [nul, 'draw'], [exterieur, 'away']]) {
    assert.deepEqual(ligne.verdict, a.verdicts[issue], `le verdict ${issue} n'est pas refait`);
    assert.equal(ligne.probabilite, a.prediction.probabilities[issue]);
    assert.equal(ligne.coteJuste, a.trueOdds[issue]);
    assert.equal(ligne.meilleureCote.cote, a.verdicts[issue].cote);
    assert.equal(ligne.meilleureCote.livre, a.verdicts[issue].bookmakerTitle);
    assert.equal(ligne.meilleureCote.releveAt, a.verdicts[issue].releveAt);
    assert.equal(ligne.meilleureCote.releve, 'relevée il y a 10 min');
    assert.equal(ligne.meilleureCote.source, 'The Odds API');
    assert.equal(ligne.manque, null);
  }
  // Le pronostic du moteur : l'issue la plus probable, une seule.
  assert.deepEqual([domicile, nul, exterieur].map((l) => l.choisi), [true, false, false]);
  assert.equal(a.prediction.outcome, 'home');
  // La meilleure cote de la value recommandée est celle que le moteur conseille (même bookmaker, même cote, même heure).
  assert.equal(a.staking.action, 'RECOMMENDED');
  assert.equal(domicile.meilleureCote.cote, a.staking.displayedOdds ?? a.staking.odds);
  assert.equal(domicile.meilleureCote.livre, a.staking.bookmakerTitle);
  assert.equal(domicile.meilleureCote.releveAt, a.staking.releveAt);
  // Jamais de cote gratuite de référence : la meilleure cote vient du relevé payant de vos bookmakers.
  for (const l of v.groupes[0].lignes) assert.ok(!/DraftKings|Bet365|Kalshi|Smarkets|ESPN/.test(l.meilleureCote?.livre ?? ''), `${l.libelle} : une cote de référence`);
});

test('les autres marchés : le pronostic du moteur (probabilité = 1 / cote juste), et la cote saisie à la main quand elle vise la même issue', options, () => {
  const a = analyseA();
  const v = lire();
  for (const p of a.marketPredictions.filter((x) => x.marketId !== 'result')) {
    const l = ligneDe(v, p.predictedLabel);
    assert.ok(l, p.predictedLabel);
    assert.equal(l.coteJuste, p.predictedOdds);
    assert.ok(Math.abs(l.probabilite - 1 / p.predictedOdds) < 1e-12);
    assert.equal(l.marketId, p.marketId);
  }
  // « Les 2 équipes marquent : Oui » (Betsson 1,80) et « Plus de 2,5 buts » (Unibet 1,95) visent le pronostic du moteur : même ligne.
  const oui = ligneDe(v, 'Oui');
  assert.equal(oui.saisie.cle, 'betsson|btts|yes|0');
  assert.equal(oui.meilleureCote.cote, 1.8);
  assert.equal(oui.meilleureCote.livre, 'Betsson');
  assert.equal(oui.meilleureCote.source, 'Saisie à la main');
  assert.equal(oui.meilleureCote.releve, 'saisie à l’instant'.replace('’', "'"));
  assert.equal(ligneDe(v, 'Plus de 2.5 buts').saisie.cle, 'unibet_nl|ou|over|2.5');
  // « Plus de 7,5 corners » (le pronostic) n'a pas la saisie « Plus de 9,5 corners » : une autre ligne ; il n'a aucune cote, et le dit.
  const sept = ligneDe(v, 'Plus de 7.5 corners');
  assert.equal(sept.saisie, null);
  assert.equal(sept.meilleureCote, null);
  assert.equal(sept.manque, 'Pas de cote chez vos bookmakers · à saisir');
  assert.match(sept.manqueDetail, /The Odds API ne relève que le 1 \/ N \/ 2/);
  // Les cotes saisies à part ont LEUR probabilité (celle du serveur pour cette ligne), ou la raison de son absence.
  const neuf = ligneDe(v, 'Plus de 9,5 corners');
  assert.equal(neuf.groupe, 'saisies');
  assert.equal(neuf.probabilite, P.saisiesA.saisies.find((s) => s.cle === 'williamhill|corners|over|9.5').moteur.probabilite);
  assert.equal(neuf.coteJuste, 1.85);
  const cartons = ligneDe(v, 'Plus de 4,5 cartons');
  assert.equal(cartons.probabilite, null);
  assert.match(cartons.manqueDetail, /Le moteur ne calcule pas encore les cartons \(étape 33 du plan\)/);
  // Le résultat + total buts ne se saisit pas : le dit, sans proposer de le saisir.
  const combine = v.lignes.find((l) => l.marketId === 'resultAndTotal');
  assert.equal(combine.manque, 'Pas de cote chez vos bookmakers');
  assert.match(combine.manqueDetail, /ne se relève pas chez vos bookmakers et ne se saisit pas encore/);
});

test('un match sans aucune cote : trois issues sans cote, aucun pronostic coté, rien d’inventé', options, () => {
  const a = P.sansCotes.analyse;
  const m = P.sansCotes.match;
  const v = V.verdictsParMarche({ result: a, match: m, saisies: { saisies: [], regle: null }, maintenant: T0 });
  assert.equal(v.sansCotes, true);
  for (const l of v.groupes[0].lignes) {
    assert.equal(l.verdict.etat, 'pas-de-cote');
    assert.equal(l.meilleureCote, null);
    assert.equal(l.manque, 'Pas de cote de marché pour ce match');
    assert.equal(l.source, 'statistiques', 'la probabilité vient des statistiques, faute de cote');
    assert.equal(LP.etatVerdict(l.verdict, T0).vert, false);
  }
  for (const l of v.lignes) {
    assert.equal(l.meilleureCote, null, l.libelle);
    assert.ok(l.manque, `${l.libelle} : l'absence est dite`);
    assert.equal(V.etatDeLaLigne(l, null, T0)?.vert ?? false, false);
  }
  assert.equal(v.resume.vertes, 0);
  assert.equal(v.groupes.at(-1).cle !== 'saisies', true, 'aucune cote saisie : pas de groupe à part');
  // Les saisies illisibles (null) ou absentes : les mêmes lignes, sans aucune cote.
  const sans = V.verdictsParMarche({ result: analyseA(), match: matchA, saisies: null, maintenant: T0 });
  assert.equal(sans.lignes.length, 3 + 14);
  assert.equal(sans.lignes.filter((l) => l.meilleureCote).length, 3, 'seules les trois issues du résultat ont une cote (le relevé payant)');
});

test('un serveur d’avant l’étape 8 (aucun verdict) : le dit, jamais une pastille d’un état inventé', options, () => {
  const a = { ...analyseA(), verdicts: undefined };
  const v = V.verdictsParMarche({ result: a, match: matchA, saisies: null, maintenant: T0 });
  for (const l of v.groupes[0].lignes) {
    assert.equal(l.verdict, null);
    assert.equal(l.verdictAbsent, true);
    assert.equal(l.meilleureCote, null);
    assert.equal(l.manque, 'Verdict du moteur indisponible : relancez demarrer-cotemaster.bat');
    assert.ok(l.probabilite > 0 && l.coteJuste > 1, 'la probabilité du moteur reste dite');
  }
});

test('« à saisir » : les marchés saisissables sont ceux de la saisie express du serveur — « Résultat + Total buts » n’en est pas un', options, async () => {
  const { MARCHES_SAISIE } = await import('../src/data/saisiesCotes.js');
  assert.deepEqual([...V.MARCHES_SAISISSABLES].sort(), MARCHES_SAISIE.map((m) => m.id).sort(), 'la liste de l’écran = celle du serveur');
  assert.equal(V.estSaisissable('resultAndTotal'), false);
  assert.equal(V.estSaisissable('result'), false);
  assert.equal(V.estSaisissable('totalCorners'), true);
});

test('une cote saisie vise la même issue que le pronostic : même marché, même côté, même ligne, même équipe', options, () => {
  const p = (marketId, params) => ({ marketId, params });
  const s = (marketId, sens, ligne = null, equipe = null) => ({ marketId, sens, ligne, equipe });
  // Total buts : le côté et la ligne comptent.
  assert.equal(V.memeSelection(s('totalGoals', 'over', 2.5), p('totalGoals', { line: 2.5, side: 'over' })), true);
  assert.equal(V.memeSelection(s('totalGoals', 'under', 2.5), p('totalGoals', { line: 2.5, side: 'over' })), false);
  assert.equal(V.memeSelection(s('totalGoals', 'over', 3.5), p('totalGoals', { line: 2.5, side: 'over' })), false);
  // Une équipe : domicile et extérieur ne se confondent pas.
  assert.equal(V.memeSelection(s('teamCorners', 'over', 4.5, 'home'), p('teamCorners', { team: 'home', line: 4.5, side: 'over' })), true);
  assert.equal(V.memeSelection(s('teamCorners', 'over', 4.5, 'away'), p('teamCorners', { team: 'home', line: 4.5, side: 'over' })), false);
  // Les deux équipes marquent : « oui » / « non », sans ligne.
  assert.equal(V.memeSelection(s('bothTeamsScore', 'yes'), p('bothTeamsScore', { outcome: 'yes' })), true);
  assert.equal(V.memeSelection(s('bothTeamsScore', 'no'), p('bothTeamsScore', { outcome: 'yes' })), false);
  // Un autre marché : jamais.
  assert.equal(V.memeSelection(s('totalShots', 'over', 24.5), p('totalCorners', { line: 24.5, side: 'over' })), false);
  assert.equal(V.memeSelection(null, p('totalGoals', { line: 2.5, side: 'over' })), false);
});

test('la saisie mise en avant : une cote encore FRAÎCHE d’abord, puis la plus haute, puis la plus récente', options, () => {
  const fraiche = (releveAt) => LP.etatFraicheur({ releveAt, maintenant: T0, coupDEnvoi: '2026-10-05T18:30:00Z', heureSure: true });
  const s = (cle, cote, releveAt) => ({ cle, cote, releveAt, fraicheur: fraiche(releveAt) });
  const recente = s('a', 2.0, iso(-10 * MIN));
  const haute = s('b', 2.4, iso(-30 * MIN));
  const vieille = s('c', 3.0, iso(-5 * H));
  assert.equal(vieille.fraicheur.etat, 'a-rafraichir');
  assert.equal(V.meilleureSaisie([recente, haute, vieille], T0).cle, 'b', 'la plus haute des fraîches : la vieille n’est pas jouable');
  assert.equal(V.meilleureSaisie([vieille], T0).cle, 'c', 'seule à rafraîchir : montrée, et dite à rafraîchir par sa pastille');
  assert.equal(V.meilleureSaisie([s('d', 2.4, iso(-50 * MIN)), s('e', 2.4, iso(-20 * MIN))], T0).cle, 'e', 'à cote égale, la plus récente');
  assert.equal(V.meilleureSaisie([], T0), null);
  function iso(d) {
    return new Date(T0 + d).toISOString();
  }
});

// ------------------------------------------------------ 2. l'heure qui tourne

test('l’heure qui tourne : l’état d’une ligne est celui que dirait sa pastille à l’heure qu’il est — vert à midi, « à rafraîchir » quatre heures plus tard', options, () => {
  const regle = P.saisiesA.regle;
  const midi = lire();
  const tard = V.verdictsParMarche({ result: analyseA(), match: matchA, saisies: P.saisiesA, maintenant: T0 + 4 * H });
  const etats = (v) => Object.fromEntries(v.lignes.map((l) => [l.libelle, V.etatDeLaLigne(l, regle, v === midi ? T0 : T0 + 4 * H)?.etat ?? null]));
  const e0 = etats(midi);
  const e4 = etats(tard);
  assert.equal(e0['Man City gagne'], 'value');
  assert.equal(e0['Plus de 9,5 corners'], 'value');
  assert.equal(e0['Les 2 équipes marquent'] ?? e0.Oui, 'trop-beau');
  assert.equal(e0['Plus de 4,5 cartons'], 'inconnue');
  assert.equal(e0['Plus de 7.5 corners'], null, 'sans cote, pas de pastille de value');
  assert.equal(midi.resume.vertes, 2);
  // Les values jouables sont DITES, une par une : l'issue, l'avantage que la pastille affiche, chez qui.
  const a = analyseA();
  const corners = P.saisiesA.saisies.find((s) => s.cle === 'williamhill|corners|over|9.5');
  assert.deepEqual(
    midi.resume.valeurs.map((v) => v.texte),
    [`Man City gagne ${LP.pourcentSigne(a.verdicts.home.pourcent)} chez William Hill`, `Plus de 9,5 corners ${LP.pourcentSigne(corners.pourcent)} chez William Hill`]
  );
  assert.deepEqual(midi.resume.valeurs.map((v) => v.pourcent), [a.verdicts.home.pourcent, corners.pourcent]);
  // Quatre heures plus tard : plus rien de vert — la value d'une cote vieille est « à rafraîchir ».
  assert.equal(e4['Man City gagne'], 'a-rafraichir');
  assert.equal(e4['Plus de 9,5 corners'], 'a-rafraichir');
  assert.equal(tard.resume.vertes, 0);
  assert.deepEqual(tard.resume.valeurs, []);
  assert.equal(tard.groupes[0].lignes[0].meilleureCote.releve, 'relevée il y a 4 h');
  // Le verdict à quatre heures calculé par le serveur lui-même dit la même chose que la page l'a déduit.
  assert.equal(P.analyseATard.verdicts.home.etat, 'a-rafraichir');
  assert.equal(P.analyseATard.staking.reason, 'a_rafraichir');
});

// --------------------------------------------------- 3. la phrase d'un « aucun pari »

test('« aucun pari conseillé » : une phrase par raison que le serveur peut donner — jamais un simple « aucun pari »', options, () => {
  // Les raisons possibles, lues dans le code du serveur : une nouvelle raison sans phrase fait échouer ce test.
  const lire = (f) => fs.readFileSync(path.join(SERVEUR, 'src', 'core', 'engine', f), 'utf8');
  const raisons = new Set([
    ...[...lire('valueFinder.js').matchAll(/passe\('([a-z_]+)'/g)].map((m) => m[1]),
    ...[...lire('verdictPari.js').matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...lire('fraicheurCotes.js').matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1])
  ]);
  for (const attendue of ['no_market_odds', 'aucun_bookmaker_autorise', 'bookmakers_juges', 'cotes_incoherentes', 'trop_peu_de_bookmakers', 'a_rafraichir']) assert.ok(raisons.has(attendue), `le serveur donne « ${attendue} »`);
  const defaut = V.phraseSansPari({ reason: 'une-raison-inconnue' });
  assert.equal(defaut, 'Aucun pari conseillé par le moteur pour ce match.');
  for (const raison of [...raisons, 'pas_de_value', 'value_hors_limites']) {
    const phrase = V.phraseSansPari({ action: 'PASS', reason: raison });
    assert.notEqual(phrase, defaut, `la raison « ${raison} » a sa phrase`);
    assert.ok(phrase.length > 60 && /[.]$/.test(phrase), raison);
  }
  assert.match(V.phraseSansPari({ action: 'CIRCUIT_BREAKER_ACTIVE' }), /coupe-circuit de Réglages est enclenché/);
  assert.equal(V.phraseSansPari(null), defaut);
  // Les vrais « aucun pari » du serveur : Arsenal – Chelsea (juge et partie), Fulham – Brentford (cote trop haute), un match sans cote.
  assert.match(V.phraseSansPari(P.analyses['essai-b'].corps.staking), /ont eux-mêmes fixé la cote juste/);
  assert.match(V.phraseSansPari(P.analyses['essai-e'].corps.staking), /hors des limites du moteur/);
  assert.match(V.phraseSansPari(P.sansCotes.analyse.staking), /Pas de cote de marché pour ce match/);
});

// ------------------------------------------------------------- 4. la courbe

test('la courbe : les marchés mesurés, les issues dans l’ordre, les cotes justes de l’ouverture et du dernier relevé — ceux du serveur', options, () => {
  const c = C.courbeDesCotes(P.fixtureA);
  assert.equal(c.etat, 'ok');
  assert.deepEqual(c.marches.map((m) => m.cle), ['1x2|0', 'ou|2.5']);
  assert.deepEqual(c.marches.map((m) => m.libelle), ['Résultat', 'Plus/moins de 2,5 buts']);
  assert.equal(c.marche.cle, '1x2|0');
  assert.deepEqual(c.issues.map((i) => i.issue), ['home', 'draw', 'away']);
  for (const i of c.issues) {
    const m = P.fixtureA.movement.find((x) => x.market === '1x2' && x.issue === i.issue);
    assert.equal(i.de, 1 / m.fromProb, `${i.issue} : cote juste d'ouverture = 1 / probabilité d'ouverture`);
    assert.equal(i.vers, 1 / m.toProb);
    assert.equal(i.dropPct, m.dropPct);
    assert.equal(i.pourcent, -m.dropPct, 'la variation de la cote est le contraire de la chute');
    assert.equal(i.accord, m.agreeing);
    assert.equal(i.nbLivres, m.bookmakersCount);
    assert.equal(i.deAt, m.fromAt);
    assert.equal(i.versAt, m.toAt);
    assert.equal(i.livres.length, m.bookmakers.length);
  }
  // Man City gagne : la cote juste baisse (le marché joue davantage cette issue) ; Liverpool : elle monte.
  const [domicile, , exterieur] = c.issues;
  assert.ok(domicile.vers < domicile.de && domicile.pourcent < 0);
  assert.ok(exterieur.vers > exterieur.de && exterieur.pourcent > 0);
  assert.equal(c.debut, c.issues.map((i) => i.deAt).sort()[0]);
  assert.equal(c.fin, c.issues.map((i) => i.versAt).sort().at(-1));
  // Les sources lues, avec l'heure de leur dernier relevé.
  assert.deepEqual(c.sources.map((s) => s.nom).sort(), ['365Scores', 'ESPN']);
  // L'autre marché : plus/moins de 2,5 buts, « plus » puis « moins ».
  const ou = C.courbeDesCotes(P.fixtureA, { marche: 'ou|2.5' });
  assert.equal(ou.marche.libelle, 'Plus/moins de 2,5 buts');
  assert.deepEqual(ou.issues.map((i) => i.issue), ['over', 'under']);
  // Un marché inconnu : le premier.
  assert.equal(C.courbeDesCotes(P.fixtureA, { marche: 'btts|0' }).marche.cle, '1x2|0');
});

test('la courbe sans relevé le DIT : aucune cote, un seul relevé, un serveur d’avant les mouvements, une réponse qui n’est pas arrivée', options, () => {
  const sans = C.courbeDesCotes(P.fixtureE);
  assert.equal(sans.etat, 'sans-cotes');
  assert.match(sans.raison, /Aucune cote n'a été relevée gratuitement pour ce match/);
  assert.deepEqual(sans.issues, []);
  assert.ok(sans.manques.length >= 4, 'ce qui manque, source par source, vient du serveur');
  assert.deepEqual(sans.manques, P.fixtureE.missing);
  const un = C.courbeDesCotes({ ...P.fixtureA, movement: [] });
  assert.equal(un.etat, 'un-seul-releve');
  assert.match(un.raison, /Un seul relevé pour l'instant : un mouvement se mesure entre deux relevés/);
  const ancien = C.courbeDesCotes({ ...P.fixtureA, movement: undefined });
  assert.equal(ancien.etat, 'serveur-ancien');
  assert.match(ancien.raison, /relancez demarrer-cotemaster\.bat/);
  for (const rien of [null, undefined, 'x', 12]) {
    const c = C.courbeDesCotes(rien);
    assert.equal(c.etat, 'indisponible');
    assert.deepEqual(c.issues, []);
    assert.equal(C.descriptionDeLaCourbe(c), 'Les cotes de ce match ne sont pas arrivées.');
  }
});

test('la géométrie : une issue dont la cote baisse descend de l’ouverture au dernier relevé ; tout reste dans le cadre ; les repères sont ronds', options, () => {
  const issues = C.courbeDesCotes(P.fixtureA).issues;
  const g = C.geometrieDeLaCourbe(issues);
  assert.equal(g.series.length, 3);
  for (const s of g.series) {
    assert.ok(s.yDe >= g.haut && s.yDe <= g.bas && s.yVers >= g.haut && s.yVers <= g.bas, `${s.issue} dans le cadre`);
    assert.equal(s.vers < s.de, s.yVers > s.yDe, `${s.issue} : une cote qui baisse descend (y plus grand)`);
  }
  // Une cote plus haute est plus haut dans le dessin : Liverpool (≈ 4,04) au-dessus de Man City (≈ 2,06).
  const parIssue = Object.fromEntries(g.series.map((s) => [s.issue, s]));
  assert.ok(parIssue.away.yVers < parIssue.home.yVers);
  assert.ok(g.xDe < g.xVers);
  // Les repères : des multiples d'un pas rond, rangés de bas en haut de l'écran (cote croissante = y décroissant), dans le cadre.
  assert.ok(g.ticks.length >= 2 && g.ticks.length <= 5);
  for (const t of g.ticks) {
    assert.ok(t.y >= g.haut - 0.01 && t.y <= g.bas + 0.01);
    assert.equal(Math.abs(t.valeur * 20 - Math.round(t.valeur * 20)) < 1e-9, true, `repère rond : ${t.valeur}`);
  }
  assert.deepEqual([...g.ticks].map((t) => t.y), [...g.ticks].map((t) => t.y).sort((a, b) => b - a));
  // Cas limites : une seule cote, des cotes identiques, aucune cote.
  const plat = C.geometrieDeLaCourbe([{ issue: 'home', libelle: 'A', de: 2.5, vers: 2.5 }]);
  assert.equal(plat.series[0].yDe, plat.series[0].yVers);
  assert.ok(plat.series[0].yDe > plat.haut && plat.series[0].yDe < plat.bas);
  assert.equal(C.geometrieDeLaCourbe([]), null);
  assert.equal(C.geometrieDeLaCourbe([{ issue: 'home', de: null, vers: null }]), null);
  assert.equal(C.pasRond(1.2), 0.5);
  assert.equal(C.pasRond(0.3), 0.1);
  assert.equal(C.pasRond(7), 2);
});

test('les mots de la courbe : l’accord des bookmakers (une bourse quand seules elles cotent) et la phrase lue par un lecteur d’écran', options, () => {
  assert.equal(C.accordDit({ accord: 2, nbLivres: 3, bourses: false }), '2 bookmakers sur 3 vont dans ce sens');
  assert.equal(C.accordDit({ accord: 1, nbLivres: 3, bourses: false }), '1 bookmaker sur 3 va dans ce sens');
  assert.equal(C.accordDit({ accord: 2, nbLivres: 2, bourses: true }), '2 bourses sur 2 vont dans ce sens');
  const c = C.courbeDesCotes(P.fixtureA);
  const d = C.descriptionDeLaCourbe(c);
  assert.match(d, /^Résultat, cote juste de l'ouverture au dernier relevé : Man City gagne \d\.\d\d puis \d\.\d\d ; Match nul \d\.\d\d puis \d\.\d\d ; Liverpool gagne \d\.\d\d puis \d\.\d\d\.$/);
  assert.equal(C.coteJusteDe(0.5), 2);
  assert.equal(C.coteJusteDe(0), null);
  assert.equal(C.coteJusteDe(null), null);
});

// ------------------------------------------------------- 5. lecture du code

test('lecture du code : deux fichiers purs — ni réseau, ni service de l’appli, ni Vue, ni horloge cachée, aucune règle de pari refaite', options, () => {
  for (const [nom, f] of Object.entries(fichiers)) {
    const source = fs.readFileSync(f, 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    assert.ok(imports.every((i) => i.startsWith('./')), `${nom} : ${imports}`);
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|localStorage|document\.|window\.|setInterval|setTimeout|require\(|Math\.random/, nom);
    // Aucune lecture de l'heure qui ne soit pas un argument ou sa valeur par défaut.
    for (const m of source.matchAll(/Date\.now\(\)/g)) {
      const debut = source.lastIndexOf('\n', m.index);
      assert.match(source.slice(debut, m.index + 12), /=\s*Date\.now\(\)|maintenant = Date\.now\(\)/, `${nom} : Date.now() hors valeur par défaut`);
    }
  }
  // Le code seul, sans ses commentaires (qui disent d'où viennent les règles).
  const verdict = fs
    .readFileSync(fichiers.verdict, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(verdict, /from '\.\/langageParis\.js'/);
  assert.match(verdict, /from '\.\/pronosticEquipe\.js'/);
  // Aucun calcul de pari refait : ni findValueBet, ni marge retirée, ni seuil du moteur.
  assert.doesNotMatch(verdict, /findValueBet|removeMargin|edgeThreshold|fairFromBookmakers|estJouable/);
});
