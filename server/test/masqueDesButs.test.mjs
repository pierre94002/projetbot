/**
 * LOT 0 — le masque des buts (data/masqueDesButs.js) : les pourcentages des quatre familles de buts de la v5 cachés à
 * la SORTIE du serveur, rien d'autre. Écrit le 13/11/2026 (sert seulement si l'essai 27 n'est pas adopté).
 *   node --test test/masqueDesButs.test.mjs        (depuis server/)
 *
 * Les phrases sont IMPORTÉES du module, jamais retapées. Données FABRIQUÉES (et l'analyse archivée de
 * test/fixtures/analyses-etape-45.json) ; T1b rejoue la vraie route dans deux copies ISOLÉES (test/aides/isolement.mjs :
 * base d'essai, réseau coupé, heure figée), masque éteint puis demandé (CM_TEST_MASQUE_DES_BUTS=1).
 *   T1  une analyse filtrée, parcourue en entier : rien des quatre familles ; le reste à l'identique ; la phrase.
 *   T1b la vraie route de l'analyse : réponse masquée = analyseSansLesButs(réponse non masquée), parcourue en entier.
 *   T2  masque null : chaque porte rend son entrée à l'identique.
 *   T3  une saisie « Moins de 2,5 » : la phrase, ni pourcentage ni bornes, pas de value ; une saisie de corners intacte.
 *   T4  l'avant-match, fiche compacte puis ancienne : aucun libellé de buts, aucune expérience de buts ; la phrase de l'IA.
 *   T5  la revue : un match après `depuis` perd ses issues de buts ; un match d'avant reste à l'octet.
 *   T6  Repérage, Opportunités, bulletin du jour : sans buts ; le 1 / N / 2 intact.
 *   T7  le combiné : une jambe de buts → 409 et la phrase, AVANT le calcul ; les jambes 1 / N / 2 passent.
 *   T8  les entrées IA : après `depuis` filtrées, avant intactes ; l'expérience sans types de buts.
 *   T9  une analyse en version 6 est filtrée de même (aucun lien au numéro de version).
 *   T10 la mise et le staking de l'analyse sont les mêmes avant et après le filtre.
 *   T11 la copie d'essai : le masque n'y est en service que sur demande ; ailleurs, seul `actif` l'éteint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';
import * as M from '../src/data/masqueDesButs.js';
import * as P from '../src/core/ai/matchAiAnalysisPrompt.js';
import { rendreLaFicheDuJour } from '../src/core/ai/bulletinPrompt.js';
import { ficheAvantMatch } from '../src/core/ai/compactContext.js';
import { verdictValue } from '../src/core/engine/coteMinimale.js';
import { bilanVide, TYPES_DE_MARCHE } from '../src/data/repositories/matchAiAnalysisRepository.js';
import { MARCHES } from '../src/data/screener.js';
import { sansLesButs } from '../src/api/routes/analysis.routes.js';
import { postPrixCombine } from '../src/api/controllers/simulation.controller.js';

const MASQUE = M.MASQUE_DES_BUTS;
/**
 * Le masque attendu EN SERVICE (le chemin par défaut : la route, les invites, la fiche du jour). RETRAIT (adoption d'une
 * correction des buts) : passer ceci à false DANS LA MÊME mise en service que `actif: false` dans masqueDesButs.js — les
 * autres essais injectent leur masque et restent verts. Un `actif: false` seul fait tomber T1, T4, T6 et T11 (voulu).
 */
const EN_SERVICE_ATTENDU = true;
const ARCHIVE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'analyses-etape-45.json'), 'utf8'));
const COMPLETE = ARCHIVE.complete;
const copie = (x) => JSON.parse(JSON.stringify(x));
const APRES = new Date(Date.parse(MASQUE.depuis) + 3_600_000).toISOString();
// Un match d'avant `depuis` ET déjà joué (le fichier archivé) : un match pas encore commencé est toujours masqué.
const AVANT = '2026-10-04T19:00:00.000Z';

// ------------------------------------------------------------------ ce qui est interdit après le masque
const CLES_INTERDITES = new Set([...M.CLES_DE_BUTS_DES_COTES_JUSTES, ...M.FAMILLES_DE_BUTS]);
const LIBELLES_INTERDITS = ['Total buts', 'Les 2 équipes marquent', 'Résultat + Total buts', 'Buts — ', "Buts d'une équipe"];

/** Parcourt TOUT (clés et valeurs, tous niveaux) : chemins des clés interdites et des marchés de buts. */
function tracesDeButs(x, chemin = '$', out = []) {
  if (Array.isArray(x)) {
    x.forEach((v, i) => tracesDeButs(v, `${chemin}[${i}]`, out));
    return out;
  }
  if (x === null || typeof x !== 'object') return out;
  if (M.FAMILLES_DE_BUTS.includes(x.marketId)) out.push(`${chemin}.marketId=${x.marketId}`);
  if (M.FAMILLES_DE_BUTS.includes(x.marketType)) out.push(`${chemin}.marketType=${x.marketType}`);
  if (typeof x.market === 'string' && LIBELLES_INTERDITS.some((l) => x.market.startsWith(l))) out.push(`${chemin}.market=${x.market}`);
  if (typeof x.key === 'string' && M.MARCHES_DE_BUTS_DU_REPERAGE.includes(x.key) && x.engineProb != null) out.push(`${chemin}.engineProb(${x.key})`);
  for (const [k, v] of Object.entries(x)) {
    if (CLES_INTERDITES.has(k)) out.push(`${chemin}.${k}`);
    tracesDeButs(v, `${chemin}.${k}`, out);
  }
  return out;
}

// ------------------------------------------------------------------ une analyse fabriquée, à la forme d'analyzeMatch
const MP = copie(COMPLETE.engineSnapshot.marketPredictions);
const equipeButs = () => ({ over05: 1.3, under05: 4.33, over15: 2.6, under15: 1.62, over25: 6.1, under25: 1.2, over35: 15.2, under35: 1.07 });
const rat = () => ({ homeOver: 3.1, homeUnder: 5.2, drawOver: 9.5, drawUnder: 4.4, awayOver: 7.7, awayUnder: 12.1 });
const dist = (o, u) => ({ over: o, under: u });
function analyseFabriquee({ engineVersion = 5 } = {}) {
  return {
    matchId: 'fab-girona-mallorca',
    label: 'Girona vs Mallorca',
    league: 'La Liga 2 - Spain',
    commenceTime: APRES,
    expectedGoals: { home: 1.039, away: 0.5, source: 'fotmob' },
    teamStats: null,
    trueOdds: {
      home: 2.17, draw: 3.17, away: 4.46,
      over05: 1.12, over15: 1.6, over25: 3.2, over35: 7.4, under05: 9.3, under15: 2.67, under25: 1.45, under35: 1.16,
      homeTeamGoals: equipeButs(), awayTeamGoals: equipeButs(), bothTeamsScore: 3.6, bothTeamsScoreNo: 1.38,
      resultAndTotal: { 0.5: rat(), 1.5: rat(), 2.5: rat(), 3.5: rat() }
    },
    market: { available: true, odds1: 2.2, oddsDraw: 3.25, odds2: 4.5, overroundPercent: 4.1, anomaly: false, bookmakersCount: 3, byBookmaker: [{ key: 'pinnacle', title: 'Pinnacle', odds1: 2.2, oddsDraw: 3.25, odds2: 4.5 }] },
    prediction: { outcome: 'home', label: 'Girona gagne', probability: 0.46, source: 'cotes' },
    scorePrediction: { source: 'cotes', expectedGoals: { home: 1.04, away: 0.5 }, mostLikely: { home: 1, away: 0, probability: 0.21 }, top: [{ home: 1, away: 0, probability: 0.21 }], outcomes: { home: 0.46, draw: 0.32, away: 0.22 }, autreScore: 0.004 },
    edgePercent: 2.35,
    staking: { action: 'RECOMMENDED', outcome: 'home', stake: 12, ev: 0.0235, odds: 2.2, bookmaker: 'winamax', candidates: [{ outcome: 'home', ev: 0.0235, odds: 2.2 }] },
    verdicts: { home: { etat: 'value', vert: true, pourcent: 2.35 }, draw: { etat: 'sans-value', vert: false }, away: { etat: 'sans-value', vert: false } },
    corners: null,
    engineVersion,
    distributions: {
      result: { home: 0.46, draw: 0.32, away: 0.22 },
      totalGoals: { 0.5: dist(0.89, 0.11), 1.5: dist(0.62, 0.38), 2.5: dist(0.31, 0.69), 3.5: dist(0.13, 0.87) },
      bothTeamsScore: { yes: 0.27, no: 0.73 },
      teamGoals: { home: { 0.5: dist(0.77, 0.23) }, away: { 0.5: dist(0.4, 0.6) } },
      resultAndTotal: { 2.5: { homeOver: 0.15, homeUnder: 0.31, drawOver: 0.05, drawUnder: 0.27, awayOver: 0.07, awayUnder: 0.15 } },
      scoreExact: { cases: [0.11, 0.21, 0.05], horsGrille: 0.004 }
    },
    modeleDeButs: { provenance: { code: 'cotes', court: 'cotes', phrase: 'calé sur les cotes' }, lambda: 1.039, mu: 0.5 },
    fraicheurCotes: { reglage: { maxAgeMinutes: 180, avantCompos: true }, coupDEnvoi: APRES, heureSure: true, source: 'odds-api', parBookmaker: {} },
    statExpectations: { corners: { home: 4.79, away: 3.55, total: 8.34 }, shots: { home: 15.01, away: 11.3, total: 26.31 }, shotsOnTarget: { home: 4.57, away: 3.74, total: 8.3 } },
    statLines: { 'totalCorners|[["line",5.5],["side","over"]]': 1.31 },
    marketPredictions: copie(MP),
    comparateur: {
      version: 1,
      calculeLe: '2026-10-05T12:00:00.000Z',
      disponible: true,
      regle: { min: 3, max: 30, coteMax: 6 },
      issues: [{ issue: 'home', coteJuste: 2.17, probabilite: 0.46 }],
      livres: [{ cle: 'winamax', cotes: { home: 2.2, draw: 3.25, away: 4.5 } }],
      references: [],
      marches: MP.filter((p) => p.marketId !== 'result').map((p) => ({ cle: `${p.marketId}|${JSON.stringify(p.params)}`, marketId: p.marketId, params: p.params, market: p.market, libelle: p.predictedLabel, coteJuste: p.predictedOdds, probabilite: 1 / p.predictedOdds, origine: 'moteur', bornes: { coteMinimale: 1.3, coteMaximale: 2.4, code: 'ok' } })),
      vosBookmakers: [{ cle: 'winamax', titre: 'Winamax' }]
    },
    simulation: { affichage: { saisons: 'eteint', matchs: 'eteint' }, enjeu: null, deroule: null },
    mise: { part: 0.012, euros: 3.6, capital: { regle: true, montant: 300 }, phrase: '1,2 % du capital' }
  };
}
const NON_BUTS = (liste) => liste.filter((m) => !M.FAMILLES_DE_BUTS.includes(m.marketId));

// ================================================================ T1

test('T1 — une analyse filtrée, parcourue en entier : rien des quatre familles ; 1 / N / 2, score exact, corners, tirs, buts attendus, mise et comparateur 1 / N / 2 à l’identique ; la phrase', () => {
  const entree = analyseFabriquee();
  const avant = copie(entree);
  assert.ok(tracesDeButs(entree).length > 20, 'l’entrée porte bien les buts');
  const sortie = M.analyseSansLesButs(entree, MASQUE);
  assert.deepEqual(entree, avant, 'l’entrée n’est jamais modifiée');
  assert.deepEqual(tracesDeButs(sortie), []);
  assert.deepEqual(sortie.trueOdds, { home: 2.17, draw: 3.17, away: 4.46 });
  assert.deepEqual(sortie.marketPredictions, NON_BUTS(avant.marketPredictions));
  assert.deepEqual(sortie.marketPredictions.map((m) => m.marketId), ['result', 'totalCorners', 'teamCorners', 'teamCorners', 'totalShots', 'teamShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget', 'teamShotsOnTarget']);
  assert.deepEqual(Object.keys(sortie.distributions), ['result', 'scoreExact']);
  assert.deepEqual(sortie.distributions.result, avant.distributions.result);
  assert.deepEqual(sortie.distributions.scoreExact, avant.distributions.scoreExact);
  assert.deepEqual(sortie.comparateur.marches, NON_BUTS(avant.comparateur.marches));
  for (const k of ['version', 'calculeLe', 'disponible', 'regle', 'issues', 'livres', 'references', 'vosBookmakers']) assert.deepEqual(sortie.comparateur[k], avant.comparateur[k], `comparateur.${k}`);
  for (const k of ['matchId', 'label', 'league', 'commenceTime', 'expectedGoals', 'teamStats', 'market', 'prediction', 'scorePrediction', 'edgePercent', 'staking', 'verdicts', 'corners', 'engineVersion', 'modeleDeButs', 'fraicheurCotes', 'statExpectations', 'statLines', 'simulation', 'mise']) {
    assert.deepEqual(sortie[k], avant[k], k);
  }
  assert.deepEqual(Object.keys(sortie), [...Object.keys(avant), 'masqueDesButs']);
  assert.deepEqual(sortie.masqueDesButs, { phrase: MASQUE.phrase, depuis: MASQUE.depuis });
  // La route : la réponse réussie passe par le masque, une erreur reste telle quelle.
  for (const [statut, attendu] of [[200, true], [404, false]]) {
    let envoye = null;
    const res = { statusCode: statut, json(c) { envoye = c; return this; } };
    let suivant = false;
    sansLesButs({}, res, () => { suivant = true; });
    assert.ok(suivant);
    const corps = statut === 200 ? analyseFabriquee() : { error: 'Match introuvable : x' };
    res.json(corps);
    if (attendu && EN_SERVICE_ATTENDU) assert.deepEqual(tracesDeButs(envoye), []);
    else assert.equal(envoye, corps);
  }
});

// ================================================================ T1b

/** Les réponses de la vraie route de l'analyse, dans une copie isolée (masque demandé ou non). */
function reponsesDeLaRoute(masque) {
  const c = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(c.serveur, 'scripts'), { recursive: true });
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-page-match.mjs'), { args: ['payloads', MANIFESTE_ECHANTILLON], timeout: 300_000, env: masque ? { CM_TEST_MASQUE_DES_BUTS: '1' } : {} });
    assert.equal(r.code, 0, r.erreurs.slice(-2000));
    assert.equal(r.reseau, false);
    return r.json.analyses;
  } finally {
    c.nettoyer();
  }
}

test('T1b — la vraie route GET /api/analysis/match/:id : masquée = analyseSansLesButs(non masquée), rien des quatre familles à aucun niveau', () => {
  const sans = reponsesDeLaRoute(false);
  const avec = reponsesDeLaRoute(true);
  const ids = Object.keys(sans);
  assert.ok(ids.length >= 2, ids.join(','));
  // Retrait (`actif: false`) : demandé ou non, la route rend la même chose, sans masque.
  if (!EN_SERVICE_ATTENDU) {
    assert.deepEqual(avec, sans);
    return;
  }
  let avecButs = 0;
  for (const id of ids) {
    assert.equal(avec[id].code, sans[id].code, id);
    if (sans[id].code !== 200) continue;
    if (tracesDeButs(sans[id].corps).length) avecButs++;
    assert.equal(sans[id].corps.masqueDesButs, undefined, `${id} : la copie d’essai sans demande n’a pas de masque`);
    assert.deepEqual(tracesDeButs(avec[id].corps), [], id);
    assert.deepEqual(avec[id].corps, JSON.parse(JSON.stringify(M.analyseSansLesButs(sans[id].corps, MASQUE))), id);
  }
  assert.ok(avecButs >= 1, 'au moins une vraie réponse portait des buts avant le masque');
});

// ================================================================ T2

test('T2 — masque null : chaque porte rend son entrée à l’identique (analyse, saisies, Repérage, Opportunités, entrée IA, fiche du jour, invites)', () => {
  const memes = (f, x) => assert.equal(JSON.stringify(f(x, null)), JSON.stringify(x));
  memes(M.analyseSansLesButs, analyseFabriquee());
  memes(M.saisiesSansValeurDeButs, etatDesSaisiesFabrique());
  memes(M.saisiesSansValeurDeButs, { change: true, cle: 'x', etat: etatDesSaisiesFabrique() });
  memes(M.reperageSansLesButs, reperageFabrique());
  memes(M.opportunitesSansLesButs, opportunitesFabriquees());
  memes(M.entreeIaSansLesButs, { ...copie(COMPLETE), commenceTime: APRES });
  memes(M.ficheDuJourSansLesButs, ficheDuJourFabriquee());
  memes(M.experienceSansLesButs, experienceFabriquee());
  assert.deepEqual(M.jambesDeButs([{ marketId: 'totalGoals' }], null), []);
  assert.equal(M.apresLeMasque(APRES, null), false);
  // Les invites : sans masque, le message d'avant (la fiche compacte telle que compactContext.js la fait).
  const e = entreesAvantMatch();
  const compacte = P.buildPreMatchAnalysisRequestCompacte({ ...e, masque: null });
  assert.equal(compacte.messages[0].content, ficheAvantMatch({ home: e.home, away: e.away, league: e.league, commenceTime: e.commenceTime, timing: e.timing, engineSummary: e.engineSummary, marches: e.marches, context: e.context, lineups: null, experience: e.experience, retires: e.retires, dossiers: null }));
  const ancienne = P.buildPreMatchAnalysisRequest({ ...e, masque: null });
  assert.ok(ancienne.messages[0].content.includes(JSON.stringify(e.engineSummary)));
  assert.ok(ancienne.messages[0].content.includes(JSON.stringify(e.experience)));
  const r = entreesRevue(APRES);
  assert.equal(JSON.stringify(P.buildPostMatchReviewRequestCompacte({ ...r, masque: null })), JSON.stringify(P.buildPostMatchReviewRequestCompacte({ ...entreesRevue(AVANT), commenceTime: APRES, masque: null })));
  const f = ficheDuJourFabriquee();
  assert.match(rendreLaFicheDuJour(f, null), /Plus de 2,5 buts/);
});

// ================================================================ T3

function saisie(marketId, sens, ligne, cote, pourcent, verdict) {
  return {
    cle: `winamax|${marketId}|${sens}|${ligne}`,
    bookmaker: 'winamax', marketId, sens, ligne, equipe: null, joueur: null,
    bookmakerTitre: 'Winamax', marche: marketId === 'totalGoals' ? 'Total buts' : 'Total corners', libelle: `${sens} ${ligne}`,
    cote, releveAt: '2026-10-05T11:50:00.000Z', premiereSaisieA: '2026-10-05T11:50:00.000Z', versions: 1, corrigee: false, coteAvant: null, enAttente: false,
    provenance: 'Saisie à la main dans CôteMaster (page du match)',
    moteur: { probabilite: 0.8, coteJuste: 1.25, origine: marketId === 'totalGoals' ? 'modèle de buts du moteur' : 'corners attendus par le moteur (binomiale négative mesurée)', raison: null },
    fraicheur: { etat: 'fraiche', ageMinutes: 10 },
    jouable: true,
    regle: { min: 3, max: 30, coteMax: 6 },
    pourcent,
    verdict,
    bornes: { coteMinimale: 1.3, coteMaximale: 1.6, code: 'ok' },
    pari: { marketId, params: { line: ligne, side: sens } }
  };
}
function etatDesSaisiesFabrique() {
  return {
    genereLe: '2026-10-05T12:00:00.000Z',
    match: { matchId: 'fab', home: 'Girona', away: 'Mallorca' },
    saisies: [saisie('totalGoals', 'under', 2.5, 1.38, 10.4, 'value'), saisie('totalCorners', 'over', 8.5, 1.9, 4.2, 'value')],
    retirees: [],
    bookmakers: [{ cle: 'winamax', titre: 'Winamax' }],
    marches: [
      { id: 'totalGoals', libelle: 'Total buts', avecMoteur: true },
      { id: 'bothTeamsScore', libelle: 'Les 2 équipes marquent', avecMoteur: true },
      { id: 'teamGoals', libelle: 'Buts d’une équipe', avecMoteur: true },
      { id: 'totalCorners', libelle: 'Total corners', avecMoteur: true }
    ],
    regle: { min: 3, max: 30, coteMax: 6 },
    moteur: { disponible: true, raison: null }
  };
}

test('T3 — une saisie « Moins de 2,5 » : la phrase, ni pourcentage ni bornes, pas de value ; une saisie de corners intacte ; les trois réponses (état, saisie, retrait)', () => {
  const etat = etatDesSaisiesFabrique();
  const avant = copie(etat);
  const verifier = (sortie) => {
    const [buts, corners] = sortie.saisies;
    assert.equal(buts.moteur.raison, MASQUE.phraseSaisie);
    assert.deepEqual(buts.moteur, { probabilite: null, coteJuste: null, origine: null, raison: MASQUE.phraseSaisie });
    assert.equal(buts.pourcent, null);
    assert.equal(buts.bornes, null);
    assert.notEqual(buts.verdict, 'value');
    assert.equal(buts.verdict, verdictValue({ pourcent: null, cote: 1.38, regle: avant.saisies[0].regle, jouable: true, fraicheur: avant.saisies[0].fraicheur }));
    for (const k of ['cle', 'bookmaker', 'marketId', 'sens', 'ligne', 'cote', 'releveAt', 'pari', 'jouable', 'fraicheur', 'regle', 'provenance']) assert.deepEqual(buts[k], avant.saisies[0][k], k);
    assert.deepEqual(corners, avant.saisies[1]);
    assert.deepEqual(sortie.marches.map((m) => [m.id, m.avecMoteur]), [['totalGoals', false], ['bothTeamsScore', false], ['teamGoals', false], ['totalCorners', true]]);
    assert.ok(sortie.marches.slice(0, 3).every((m) => m.sansMoteur === MASQUE.phraseSaisie));
    assert.deepEqual(sortie.marches[3], avant.marches[3]);
    for (const k of ['genereLe', 'match', 'retirees', 'bookmakers', 'regle', 'moteur']) assert.deepEqual(sortie[k], avant[k], k);
    assert.deepEqual(sortie.masqueDesButs, { phrase: MASQUE.phrase, depuis: MASQUE.depuis }, 'la phrase de la carte des saisies');
  };
  verifier(M.saisiesSansValeurDeButs(etat, MASQUE));
  assert.deepEqual(etat, avant, 'l’entrée n’est jamais modifiée');
  const put = M.saisiesSansValeurDeButs({ change: true, ecrite: true, enAttente: false, raison: null, cle: 'x', etat }, MASQUE);
  verifier(put.etat);
  assert.deepEqual({ ...put, etat: null }, { change: true, ecrite: true, enAttente: false, raison: null, cle: 'x', etat: null });
  // Le contrôleur : ses trois réponses passent par le masque (lecture du texte).
  const ctrl = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'controllers', 'cotesVosBookmakers.controller.js'), 'utf8');
  for (const appel of ['saisiesSansValeurDeButs(await etatDesSaisies(', 'saisiesSansValeurDeButs(await enregistrerSaisie(', 'saisiesSansValeurDeButs(await retirerSaisie(']) assert.equal(ctrl.split(appel).length - 1, 1, appel);
});

// ================================================================ T4

function experienceFabriquee() {
  return Object.keys(TYPES_DE_MARCHE).map((type) => ({ ...bilanVide(type), matches: 12, engineRight: 7, recentLessons: [{ match: 'A - B', pick: `${TYPES_DE_MARCHE[type]} pari`, outcome: 'juste', aiVerdict: 'confirme', lesson: `Leçon sur ${TYPES_DE_MARCHE[type]}` }] }));
}
function entreesAvantMatch() {
  const engineSummary = { ...copie(COMPLETE.engineSnapshot) };
  delete engineSummary.engineVersion;
  return {
    home: 'Girona',
    away: 'Mallorca',
    league: 'La Liga 2 - Spain',
    commenceTime: APRES,
    timing: 'avance',
    engineSummary,
    marches: copie(engineSummary.marketPredictions),
    context: { standings: null, homeForm: null, awayForm: null },
    experience: experienceFabriquee(),
    retires: [{ type: 'totalGoals', label: 'Total buts' }, { type: 'totalShots', label: 'Total tirs' }]
  };
}
const sansLibelleDeButs = (texte, quoi) => {
  for (const l of LIBELLES_INTERDITS) assert.ok(!texte.includes(l), `${quoi} : « ${l} »`);
  for (const t of M.FAMILLES_DE_BUTS) assert.ok(!texte.includes(`"${t}"`) && !texte.includes(`"marketType":"${t}"`), `${quoi} : ${t}`);
};

test('T4 — l’avant-match, fiche compacte puis ancienne : aucun libellé ni type de buts (pronostics, marchés, expérience, retirés) ; la fiche compacte finit par la phrase de l’IA, l’ancienne non', () => {
  const e = entreesAvantMatch();
  const sansMasque = P.buildPreMatchAnalysisRequestCompacte({ ...e, masque: null }).messages[0].content;
  for (const l of LIBELLES_INTERDITS) assert.ok(sansMasque.includes(l), `sans masque, la fiche porte « ${l} »`);
  const compacte = P.buildPreMatchAnalysisRequestCompacte({ ...e, masque: MASQUE });
  sansLibelleDeButs(compacte.messages[0].content, 'fiche compacte');
  assert.ok(compacte.messages[0].content.endsWith(`\n\n${MASQUE.phraseIA}`));
  assert.match(compacte.messages[0].content, /Total corners/);
  assert.match(compacte.messages[0].content, /Retirés de ta liste : Total tirs/);
  assert.equal(compacte.system, P.CONSIGNES_AVANT_MATCH, 'les consignes fixes ne changent pas');
  const ancienne = P.buildPreMatchAnalysisRequest({ ...e, masque: MASQUE });
  sansLibelleDeButs(ancienne.messages[0].content, 'forme ancienne');
  assert.ok(!ancienne.messages[0].content.includes(MASQUE.phraseIA));
  assert.match(ancienne.messages[0].content, /Total corners/);
  // Le défaut est le masque en service.
  assert.equal(P.buildPreMatchAnalysisRequestCompacte(e).messages[0].content, EN_SERVICE_ATTENDU ? compacte.messages[0].content : sansMasque);
  assert.deepEqual(e, entreesAvantMatch(), 'les entrées ne sont jamais modifiées');
});

// ================================================================ T5

function entreesRevue(commenceTime) {
  const engineSummary = { ...copie(COMPLETE.engineSnapshot) };
  delete engineSummary.engineVersion;
  const marketOutcomes = COMPLETE.postMatchReview.marketReviews.map(({ explanation, lesson, ...o }) => o);
  return { home: 'Girona', away: 'Mallorca', league: 'La Liga 2 - Spain', commenceTime, timing: 'avance', analysedAt: '2026-10-04T10:00:00.000Z', priorAnalysis: copie(COMPLETE.analysis), engineSummary, result: { homeGoals: 0, awayGoals: 0 }, marketOutcomes, matchStats: null };
}

test('T5 — la revue : un match après `depuis` perd ses issues, ses avis et ses pronostics de buts ; un match d’avant reste à l’octet', () => {
  const apres = P.buildPostMatchReviewRequestCompacte({ ...entreesRevue(APRES), masque: MASQUE }).messages[0].content;
  sansLibelleDeButs(apres, 'revue après depuis');
  assert.match(apres, /## marketOutcomes — 10 marché\(s\) joué\(s\)/);
  assert.doesNotMatch(apres, /Autres avis d'avant-match/, 'aucun avis de buts laissé en orphelin');
  const avant = P.buildPostMatchReviewRequestCompacte({ ...entreesRevue(AVANT), masque: MASQUE });
  assert.equal(JSON.stringify(avant), JSON.stringify(P.buildPostMatchReviewRequestCompacte({ ...entreesRevue(AVANT), masque: null })));
  assert.match(avant.messages[0].content, /Total buts/);
  // L'ancienne forme : la date vient de l'appelant ; sans elle (le service ne la donne pas), rien n'est retiré.
  const ancienneApres = P.buildPostMatchReviewRequest({ ...entreesRevue(APRES), masque: MASQUE }).messages[0].content;
  sansLibelleDeButs(ancienneApres, 'revue ancienne après depuis');
  const { commenceTime, ...sansDate } = entreesRevue(APRES);
  assert.equal(JSON.stringify(P.buildPostMatchReviewRequest({ ...sansDate, masque: MASQUE })), JSON.stringify(P.buildPostMatchReviewRequest({ ...sansDate, masque: null })));
  // La date de repli : celle de l'analyse d'avant-match, puis celle du résultat.
  const parResultat = P.buildPostMatchReviewRequestCompacte({ ...entreesRevue(null), result: { homeGoals: 0, awayGoals: 0, date: APRES }, masque: MASQUE }).messages[0].content;
  sansLibelleDeButs(parResultat, 'revue datée par le résultat');
});

// ================================================================ T6

function reperageFabrique() {
  return {
    status: 'ready',
    progress: null,
    error: null,
    data: {
      generatedAt: '2026-10-05T11:00:00.000Z',
      days: 3,
      markets: MARCHES.map(({ key, group, label }) => ({ key, group, label })),
      matches: [{
        matchId: 'fab', league: 'La Liga 2 - Spain', home: 'Girona', away: 'Mallorca', commenceTime: APRES, expectedGoals: { home: 1.04, away: 0.5 },
        markets: MARCHES.map((m, i) => ({ key: m.key, engineProb: 0.3 + i / 100, marketProb: 0.31, marketBookmakers: 3, marketExchangeOnly: false, gapPoints: 1.2, bestOdds: m.group === 'Résultat' ? 2.2 : null, bestBookmaker: null, bestBookmakerKey: null, bestOddsAt: null, bestOddsOrigin: null, edgePct: m.group === 'Résultat' ? 2.1 : null, context: null, movement: { dropPct: 6, chute: true } }))
      }],
      capital: { regle: false }
    }
  };
}
function ligneOpp(marche, extra = {}) {
  return { cle: `fab|${marche}`, matchId: 'fab', league: 'La Liga 2 - Spain', home: 'Girona', away: 'Mallorca', commenceTime: APRES, marche, pari: marche, probabilite: 0.4, coteJuste: 2.5, verdict: null, avecOffre: false, chute: true, mouvement: { dropPct: 6 }, ...extra };
}
function opportunitesFabriquees() {
  const lignes = [
    ligneOpp('home', { verdict: { vert: true, etat: 'value', pourcent: 3 }, avecOffre: true, chute: false }),
    ligneOpp('over25'),
    ligneOpp('draw', { verdict: { vert: false, etat: 'a-rafraichir' }, avecOffre: true, chute: false }),
    ligneOpp('bttsYes', { carte: { couleur: 'vert' } }),
    ligneOpp('away', { carte: { couleur: 'rouge' } })
  ];
  return { status: 'ready', data: { generatedAt: '2026-10-05T11:00:00.000Z', lignes, resume: { matchs: 1, lignes: 5, vertes: 1, aRafraichir: 1, chutes: 3, chutesSansVosCotes: 3, coupeCircuit: false, enCaseVerte: 1, enCaseRouge: 1 }, carte: null } };
}
function ficheDuJourFabriquee() {
  const ligne = (pari, extra = {}) => ({ match: 'Girona - Mallorca', championnat: 'La Liga 2 - Spain', heure: '20 h', pari, cote: 2.2, bookmaker: 'Winamax', probabilitePct: 46, coteJuste: 2.17, valuePct: 1.4, coteRelevee: { fraiche: true, ageMinutes: 12 }, carte: null, compo: 'probable', chutePct: null, ...extra });
  return {
    jour: '2026-11-16',
    jourEnLettres: 'lundi 16 novembre',
    mode: 'normal',
    opportunites: {
      etat: 'pret', erreur: null, calculeLe: '2026-11-16T08:00:00.000Z', lignesLues: 9, valuesVertes: 1, chutes: 3, valuesVertesSur7Jours: 4, carteOuParier: null,
      retenues: [ligne('Girona gagne')],
      chutesRetenues: [ligne('Plus de 2,5 buts', { chutePct: 7.5 }), ligne('Match nul', { chutePct: 6.1 }), ligne('Les deux équipes marquent', { chutePct: 5.2 })]
    },
    favoris: { illisible: false, lu: true, equipes: 0, championnats: 0, matchsDuJour: 0, matchs: [] },
    compositions: { lu: true, matchsConcernes: 0, officielles: 0, probables: 0, dernieresAlignees: 0, nonPubliees: 0, matchs: [] },
    controle: { etat: 'jamais' },
    problemes: []
  };
}

test('T6 — Repérage (probabilité, écart et avantage à null sur les 6 marchés de buts, la cote reste, la phrase), Opportunités (sans ligne de buts, résumé recompté) et bulletin du jour (sans ligne de buts)', () => {
  assert.deepEqual(M.LIBELLES_DE_BUTS_DU_REPERAGE, MARCHES.filter((m) => M.MARCHES_DE_BUTS_DU_REPERAGE.includes(m.key)).map((m) => m.label), 'les libellés recopiés = ceux de screener.js');
  assert.deepEqual([...M.MARCHES_DE_BUTS_DU_REPERAGE].sort(), MARCHES.filter((m) => m.group !== 'Résultat').map((m) => m.key).sort());
  const lu = reperageFabrique();
  const avant = copie(lu);
  const sortie = M.reperageSansLesButs(lu, MASQUE);
  assert.deepEqual(lu, avant);
  for (const [i, k] of sortie.data.matches[0].markets.entries()) {
    const a = avant.data.matches[0].markets[i];
    if (M.MARCHES_DE_BUTS_DU_REPERAGE.includes(k.key)) {
      assert.deepEqual([k.engineProb, k.gapPoints, k.edgePct], [null, null, null], k.key);
      assert.deepEqual({ ...k, engineProb: a.engineProb, gapPoints: a.gapPoints, edgePct: a.edgePct }, a, `${k.key} : la cote et le marché restent`);
    } else assert.deepEqual(k, a, k.key);
  }
  assert.deepEqual(tracesDeButs(sortie), []);
  assert.deepEqual(sortie.data.masqueDesButs, { phrase: MASQUE.phrase, depuis: MASQUE.depuis, marches: [...M.MARCHES_DE_BUTS_DU_REPERAGE] });
  assert.deepEqual({ ...sortie.data, matches: null, masqueDesButs: null }, { ...avant.data, matches: null, masqueDesButs: null });
  // Opportunités.
  const op = opportunitesFabriquees();
  const o = M.opportunitesSansLesButs(op, MASQUE);
  assert.deepEqual(o.data.lignes.map((l) => l.marche), ['home', 'draw', 'away']);
  assert.deepEqual(o.data.lignes, op.data.lignes.filter((l) => !['over25', 'bttsYes'].includes(l.marche)));
  assert.deepEqual(o.data.resume, { matchs: 1, lignes: 3, vertes: 1, aRafraichir: 1, chutes: 1, chutesSansVosCotes: 1, coupeCircuit: false, enCaseVerte: 0, enCaseRouge: 1 });
  assert.equal(o.data.masqueDesButs, undefined);
  const vertes = { status: 'ready', vertes: [{ cle: 'fab|home', verdict: { vert: true } }] };
  assert.equal(M.opportunitesSansLesButs(vertes, MASQUE), vertes, '/vertes (1 / N / 2) : intact');
  // Les contrôleurs appellent le masque autour de la mise (lecture du texte).
  const ctrl = (f) => fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'controllers', f), 'utf8');
  assert.match(ctrl('screener.controller.js'), /res\.json\(reperageSansLesButs\(reperageAvecLaMise\(lu, contexteDeLaMise\(\)\)\)\);/);
  assert.match(ctrl('opportunities.controller.js'), /res\.json\(opportunitesSansLesButs\(opportunitesAvecLaMise\(op, contexteDeLaMise\(\)\)\)\);/);
  assert.match(ctrl('opportunities.controller.js'), /res\.json\(vertesSansEuros\(getOpportunitesVertes\(\)\)\);/);
  // Le bulletin du jour.
  const f = ficheDuJourFabriquee();
  const texte = rendreLaFicheDuJour(f, MASQUE);
  for (const l of M.LIBELLES_DE_BUTS_DU_REPERAGE) assert.ok(!texte.includes(l), l);
  assert.match(texte, /Girona gagne/);
  assert.match(texte, /Match nul/);
  assert.equal(rendreLaFicheDuJour(f), EN_SERVICE_ATTENDU ? texte : rendreLaFicheDuJour(f, null), 'le défaut est le masque en service');
  assert.deepEqual(f, ficheDuJourFabriquee());
});

// ================================================================ T7

test('T7 — le combiné : une jambe de buts → 409 et la phrase, AVANT le calcul ; les jambes 1 / N / 2 ne sont pas retenues', async () => {
  const buts = { matchId: 'fab', marketId: 'totalGoals', params: { line: 2.5, side: 'under' } };
  const un = { matchId: 'fab', marketId: 'result', params: { outcome: 'home' } };
  const corners = { matchId: 'fab', marketId: 'totalCorners', params: { line: 8.5, side: 'over' } };
  assert.deepEqual(M.jambesDeButs([un, buts, corners], MASQUE), [buts]);
  assert.deepEqual(M.jambesDeButs([un, corners, { marketId: 'scoreExact', params: { home: 1, away: 0 } }], MASQUE), []);
  for (const f of M.FAMILLES_DE_BUTS) assert.equal(M.jambesDeButs([{ marketId: f }], MASQUE).length, 1, f);
  // Le contrôleur : refus 409 avec la phrase, sans rien calculer (aucune base ouverte, aucune analyse). Au retrait
  // (`actif: false`), plus de refus : seul l'ordre dans la source est vérifié.
  if (EN_SERVICE_ATTENDU) {
    await assert.rejects(
      () => postPrixCombine({ body: { legs: [un, buts] } }, { json: () => assert.fail('aucune réponse attendue') }),
      (e) => e.statusCode === 409 && e.message === MASQUE.phraseCombine
    );
  } else assert.deepEqual(M.jambesDeButs([un, buts]), []);
  const source = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'controllers', 'simulation.controller.js'), 'utf8');
  const i = source.indexOf('if (jambesDeButs(legs, masque).length) throw new ApiError(409, masque.phraseCombine);');
  assert.ok(i > 0 && i < source.indexOf('res.json(await prixDuCombine('), 'le refus vient AVANT le calcul');
});

// ================================================================ T8

test('T8 — les entrées IA : après `depuis` sans buts (résumé du moteur, avis, revue, analyse d’avance), avant intactes ; l’expérience et les pronostics sans buts', () => {
  const apres = { ...copie(COMPLETE), commenceTime: APRES, earlierAnalysis: { engineSnapshot: copie(COMPLETE.engineSnapshot), analysis: copie(COMPLETE.analysis) } };
  const f = M.entreeIaSansLesButs(apres, MASQUE);
  assert.deepEqual(tracesDeButs(f), []);
  assert.equal(f.engineSnapshot.marketPredictions.length, 10);
  assert.equal(f.analysis.marketViews.length, 10);
  assert.equal(f.postMatchReview.marketReviews.length, 10);
  assert.equal(f.earlierAnalysis.analysis.marketViews.length, 10);
  for (const k of ['matchId', 'homeName', 'awayName', 'league', 'commenceTime', 'usage', 'costUsd', 'analysedAt', 'timing', 'lineupSnapshot', 'createdAt', 'updatedAt']) assert.deepEqual(f[k], apres[k], k);
  assert.deepEqual({ ...f.analysis, marketViews: null }, { ...apres.analysis, marketViews: null }, 'le texte libre de l’analyse reste');
  const avant = { ...copie(COMPLETE), commenceTime: AVANT };
  assert.equal(M.entreeIaSansLesButs(avant, MASQUE), avant);
  assert.equal(M.entreeIaSansLesButs({ ...copie(COMPLETE), commenceTime: null }, MASQUE).postMatchReview.marketReviews.length, 15, 'date inconnue : tel quel');
  assert.equal(M.entreeIaSansLesButs(null, MASQUE), null);
  const exp = M.experienceSansLesButs(experienceFabriquee(), MASQUE);
  assert.deepEqual(exp.map((t) => t.marketType), Object.keys(TYPES_DE_MARCHE).filter((t) => !M.FAMILLES_DE_BUTS.includes(t)));
  const pronostics = MP.map((p) => ({ ...p, matchId: 'fab' }));
  assert.equal(M.pronosticsSansLesButs(pronostics, APRES, MASQUE).length, 10);
  assert.equal(M.pronosticsSansLesButs(pronostics, AVANT, MASQUE), pronostics);
  // Le contrôleur : ses trois réponses passent par le masque (lecture du texte).
  const ctrl = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'controllers', 'matchAiAnalysis.controller.js'), 'utf8');
  assert.match(ctrl, /res\.json\(\{ entry: entreeIaSansLesButs\(getByMatchId\(req\.params\.matchId\) \?\? null\) \}\);/);
  assert.match(ctrl, /res\.json\(\{ entry: entreeIaSansLesButs\(entry\), predictions: pronosticsSansLesButs\(predictions, entry\?\.commenceTime \?\? date\), experience: experienceSansLesButs\(aiMarketExperience\(\)\) \}\);/);
  assert.match(ctrl, /res\.json\(\{ entries: listAll\(\)\.map\(\(e\) => entreeIaSansLesButs\(e\)\) \}\);/);
});

// ================================================================ T9 et T10

test('T9 — une analyse en version 6 est filtrée de même : le masque ne lit jamais le numéro de version', () => {
  const v5 = M.analyseSansLesButs(analyseFabriquee({ engineVersion: 5 }), MASQUE);
  const v6 = M.analyseSansLesButs(analyseFabriquee({ engineVersion: 6 }), MASQUE);
  assert.deepEqual(tracesDeButs(v6), []);
  assert.deepEqual({ ...v6, engineVersion: 5 }, v5);
  const source = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'masqueDesButs.js'), 'utf8');
  assert.doesNotMatch(source, /engineVersion|numeroDeVersion|engine-versions/, 'le module ne lit aucune version');
});

test('T10 — la mise de l’analyse (mise, staking, verdicts, edgePercent) est la même avant et après le filtre : aucune mise sur les buts', () => {
  const a = analyseFabriquee();
  const s = M.analyseSansLesButs(a, MASQUE);
  for (const k of ['mise', 'staking', 'verdicts', 'edgePercent']) assert.deepEqual(s[k], a[k], k);
  assert.ok(['home', 'draw', 'away'].includes(s.staking.outcome));
});

// ================================================================ T11

test('T11 — la copie d’essai : le masque n’y est en service que sur demande ; une variable pointée ailleurs ne l’éteint pas', () => {
  const module = path.join(SERVEUR, 'src', 'data', 'masqueDesButs.js');
  assert.equal(M.dansUneCopieDEssai({}, module), false);
  // Seule une copie `cm-tests-…/code/server` d'isolement.mjs compte ; C:\, le dépôt, server ou un parent n'éteignent rien.
  const X = path.join(os.tmpdir(), 'cm-tests-abc');
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: X }, path.join(X, 'code', 'server', 'src', 'data', 'masqueDesButs.js')), true);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: X }, path.join(X, 'autre', 'server', 'src', 'data', 'masqueDesButs.js')), false);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: SERVEUR }, module), false);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: path.resolve(SERVEUR, '..') }, module), false);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: path.parse(module).root }, module), false);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: path.join(SERVEUR, '..', 'ailleurs') }, module), false);
  assert.equal(M.dansUneCopieDEssai({ CM_TEST_DOSSIER: '  ' }, module), false);
  assert.equal(M.masqueEnService({}), EN_SERVICE_ATTENDU ? MASQUE : null);
  assert.equal(M.masqueEnService({ CM_TEST_DOSSIER: 'C:\\nulle-part' }), EN_SERVICE_ATTENDU ? MASQUE : null);
  for (const d of [SERVEUR, path.resolve(SERVEUR, '..'), path.parse(module).root]) assert.equal(M.masqueEnService({ CM_TEST_DOSSIER: d }), EN_SERVICE_ATTENDU ? MASQUE : null, `${d} n’éteint rien`);
  assert.equal(MASQUE.actif, EN_SERVICE_ATTENDU);
  assert.ok(Object.isFrozen(MASQUE));
  // Les phrases : la date suit `depuis`.
  assert.match(MASQUE.phrase, new RegExp(`depuis le ${MASQUE.depuis.slice(8, 10)}/${MASQUE.depuis.slice(5, 7)} `));
  assert.deepEqual(M.phrasesDuMasque('2026-11-22T10:00:00+01:00').phraseCombine, MASQUE.phraseCombine.replace(`${MASQUE.depuis.slice(8, 10)}/${MASQUE.depuis.slice(5, 7)}`, '22/11'));
});

// ================================================================ T12 et T13 (corrections de la vérification du 13/11)

test('T12 — le journal des pronostics : un pronostic de buts EN ATTENTE d’un match pas encore commencé est retiré ; commencé, réglé, ou d’un autre marché : rendu ; masque null : à l’identique ; la route le pose', () => {
  const MAINTENANT = Date.parse('2026-11-16T12:00:00.000Z');
  const p = (id, marketId, status, commenceTime) => ({ id, marketId, market: marketId === 'result' ? 'Résultat' : 'Total buts', status, commenceTime });
  const corps = {
    entries: [
      p('buts-a-venir', 'totalGoals', 'pending', '2026-11-16T19:00:00.000Z'),
      p('buts-commence', 'totalGoals', 'pending', '2026-11-16T11:00:00.000Z'),
      p('buts-regle', 'bothTeamsScore', 'won', '2026-11-17T19:00:00.000Z'),
      p('un-a-venir', 'result', 'pending', '2026-11-16T19:00:00.000Z'),
      { id: 'libelle-a-venir', market: 'Buts — Girona', status: 'pending', commenceTime: '2026-11-16T19:00:00.000Z' },
      p('buts-sans-date', 'teamGoals', 'pending', null)
    ]
  };
  const avant = copie(corps);
  const s = M.journalSansButsAVenir(corps, MASQUE, MAINTENANT);
  assert.deepEqual(s.entries.map((e) => e.id), ['buts-commence', 'buts-regle', 'un-a-venir']);
  assert.deepEqual(corps, avant, 'l’entrée n’est jamais modifiée');
  assert.equal(M.journalSansButsAVenir(corps, null, MAINTENANT), corps);
  assert.equal(M.journalSansButsAVenir({ error: 'x' }, MASQUE, MAINTENANT).error, 'x');
  const route = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'routes', 'predictions.routes.js'), 'utf8');
  assert.match(route, /res\.json = \(c\) => json\(res\.statusCode < 400 \? journalSansButsAVenir\(c\) : c\);/);
  assert.match(route, /router\.get\('\/', sansButsAVenir, asyncHandler\(getPredictions\)\);/);
  // Les deux POST de l'IA rendent l'entrée filtrée, comme les GET.
  const ctrl = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'controllers', 'matchAiAnalysis.controller.js'), 'utf8');
  assert.equal(ctrl.split('res.status(201).json(entreeIaSansLesButs(result));').length - 1, 2);
  assert.doesNotMatch(ctrl, /res\.status\(201\)\.json\(result\)/);
});

test('T13 — la borne des dates : exactement à `depuis` masqué, juste avant (et déjà joué) non ; un match pas encore commencé toujours masqué ; date absente ou jour seul passé : non', () => {
  const d = Date.parse(MASQUE.depuis);
  const loin = d + 30 * 86_400_000; // « maintenant » bien après : seule la borne `depuis` décide
  assert.equal(M.apresLeMasque(new Date(d).toISOString(), MASQUE, loin), true, 'exactement à depuis');
  assert.equal(M.apresLeMasque(new Date(d - 1).toISOString(), MASQUE, loin), false, 'une milliseconde avant');
  assert.equal(M.apresLeMasque(new Date(d - 86_400_000).toISOString(), MASQUE, d - 2 * 86_400_000), true, 'avant depuis mais pas encore commencé');
  assert.equal(M.apresLeMasque(new Date(d - 86_400_000).toISOString(), MASQUE, d - 86_400_000), false, 'commencé à l’instant');
  assert.equal(M.apresLeMasque(null, MASQUE, loin), false);
  assert.equal(M.apresLeMasque('2026-10-04', MASQUE, loin), false);
  assert.equal(M.apresLeMasque(new Date(d).toISOString(), null, loin), false);
});
