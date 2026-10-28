/**
 * Étape 25 du plan, SECONDE MOITIÉ (14/10/2026) : l'essai jugé, l'adoption « si meilleure », le banc avant l'essai,
 * l'alerte de dérive et le point d'entrée d'une candidate proposée par un module.
 *   node --test test/adoptionMoteur.test.mjs        (depuis server/)
 *
 * Deux sortes d'essais :
 *   - les règles PURES dans le processus du test (horizon, lignes de l'essai et leur règlement, déclaration d'une
 *     candidate, règle de dérive, banc avant l'essai avec un FAUX rejeu, feuille de route) : ni base, ni réseau, ni
 *     registre écrit — le seul fichier écrit est un registre de la mesure d'essai sous le dossier des essais ;
 *   - le parcours de bout en bout dans une COPIE ISOLÉE (isolement.mjs ; script test/aides/script-adoption-moteur.mjs) :
 *     trois candidates FABRIQUÉES (moins bonne, pas prouvée, meilleure) sur 270 matchs joués fabriqués au magasin
 *     de la copie, heure figée au 20/11/2026 ; tout le reste est le VRAI code (l'étape de nuit, le juge de l'étape 16
 *     et ses registres — ceux de la copie —, les routes de Réglages).
 *
 *  1. L'horizon.  2. Les lignes de l'essai.  3. La déclaration d'une candidate.  4. La règle de dérive.
 *  5. Le banc avant l'essai.  6. Le parcours : refus (moins bon, pas prouvé, trop tôt, pendant une passe, double clic),
 *  les deux verdicts distincts, l'adoption (une écriture, une version, le lancement), la candidate jamais visible.
 *  7. La dérive par la route et la feuille de route.  8. Le code (branchements, interdits, garde des essais).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, sansCandidateDuCode, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { HORIZON_PAR_DEFAUT, HORIZON_MINIMUM, problemeDHorizon, horizonDe, horizonAtteint, lancementDeLEssai } from '../src/bench/horizonEssai.js';
import { lignesDeLEssai, issueDeLaLigne, complementsDeLEssai } from '../src/bench/essaiCandidate.js';
import { jugerLaCandidateAuBanc, FAMILLE_DU_BANC, variantesDuBanc, porteDuBanc, libelleDeLaCase } from '../src/bench/bancCandidate.js';
import { NOTE_DU_MODELE_DE_BUTS } from '../src/core/engine/noteDuModeleDeButs.js';
import { reglagesDuModele } from './aides/modeleDeButsCommun.mjs';
import { evaluerDerive, ecartsDeDepart, valeurDeLAlerte, familleDeLaNote, REGLE_DE_DERIVE } from '../src/data/deriveMoteur.js';
import { validerCandidate, empreinteDeLaCandidate, A_VENIR, ORIGINES, __testing as V } from '../src/core/engine/engineVersions.js';
import { JUGE } from '../src/data/calibration.js';
import { MIN_BLOCS } from '../src/bench/resume.js';
import { comparer } from '../src/bench/guard.js';
import { perteLog } from '../src/bench/metrics.js';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';

const SRC = path.join(SERVEUR, 'src');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-adoption-moteur.mjs');
const JOUR = 86_400_000;

/** Le parcours, une fois pour tous les tests qui le lisent. */
let parcours;
function lePacours() {
  if (parcours) return parcours;
  // Étape 27 : sans la candidate du code (elle passerait d’abord) — le parcours fabrique ses trois candidates.
  const copie = sansCandidateDuCode(preparerCopie({}));
  try {
    const r = executer(copie, SCRIPT, {
      args: ['parcours'],
      maintenant: '2026-11-20T12:00:00.000Z',
      timeout: 300_000,
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' }
    });
    assert.equal(r.code, 0, `le parcours a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
    assert.ok(r.json?.ok, `sortie illisible\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    parcours = r.json;
    return parcours;
  } finally {
    copie.nettoyer();
  }
}

// ================================================================ 1. l'horizon

test('l’horizon : 600 matchs et 14 jours par défaut, jamais moins que le minimum du juge (200, le même partout) ni qu’une semaine ; atteint seulement quand les DEUX le sont', () => {
  assert.deepEqual(HORIZON_PAR_DEFAUT, { matchs: 600, jours: 14 });
  assert.equal(HORIZON_MINIMUM.matchs, JUGE.minBlocs, 'le minimum de la calibration');
  assert.equal(HORIZON_MINIMUM.matchs, MIN_BLOCS, 'celui du banc');
  const lignes = (n) => Array.from({ length: n }, (_, i) => ({ bloc: `m${i}`, a: 1, b: 0.9 + (i % 7) / 100 }));
  assert.equal(comparer(lignes(199), { sens: 'min' }).verdict, 'pas-assez-de-matchs', 'et celui du juge (guard.js)');
  assert.notEqual(comparer(lignes(200), { sens: 'min' }).verdict, 'pas-assez-de-matchs');
  assert.equal(HORIZON_MINIMUM.jours, 7);
  assert.equal(problemeDHorizon(undefined), null);
  assert.equal(problemeDHorizon({ matchs: 250, jours: 14 }), null);
  assert.match(problemeDHorizon({ matchs: 199 }), /au moins 200 matchs, le minimum du juge/);
  assert.match(problemeDHorizon({ jours: 6 }), /au moins 7 jours/);
  assert.match(problemeDHorizon({ matchs: 250.5 }), /au moins 200/);
  assert.match(problemeDHorizon({ semaines: 2 }), /clé inconnue/);
  assert.match(problemeDHorizon([600, 14]), /objet/);
  assert.deepEqual(horizonDe({}), { matchs: 600, jours: 14 });
  assert.deepEqual(horizonDe({ horizon: { matchs: 300 } }), { matchs: 300, jours: 14 });
  const depuis = '2026-10-01T03:00:00.000Z';
  const t = Date.parse(depuis);
  const h = { matchs: 250, jours: 14 };
  assert.deepEqual(horizonAtteint({ matchs: 300, depuis, maintenant: t + 13.9 * JOUR, horizon: h }), { atteint: false, matchs: 300, jours: 13, auPlusTotLe: '2026-10-15T03:00:00.000Z' }, 'les matchs sans les jours');
  assert.equal(horizonAtteint({ matchs: 249, depuis, maintenant: t + 40 * JOUR, horizon: h }).atteint, false, 'les jours sans les matchs');
  assert.equal(horizonAtteint({ matchs: 250, depuis, maintenant: t + 14 * JOUR, horizon: h }).atteint, true, 'les deux, bornes comprises');
  assert.equal(horizonAtteint({ matchs: 900, depuis: null, maintenant: t, horizon: h }).atteint, false, 'sans début : jamais');
  // Le lancement de l'essai : le jour de PARIS du début (un début à 23 h 30 UTC est le lendemain à Paris).
  const l = lancementDeLEssai({ id: 'c1', etape: '27', quoi: 'Q' }, { depuis: '2026-10-31T23:30:00.000Z', variante: 'c1~2' });
  assert.deepEqual(JSON.parse(JSON.stringify(l)), { etape: '27', version: 'c1', quoi: 'Q (essai à blanc)', le: '2026-11-01', variantes: [{ id: 'c1~2', quoi: 'Q' }], vues: [] });
});

// ================================================================ 2. les lignes de l'essai

const reglementDe = ({ buts = { home: 1, away: 1 }, attribue = false, stats = null } = {}) => ({ attribue, buts, nonReglableButs: null, stats: stats ?? {}, nonReglableStats: null });
const rev = (o) => ({
  candidateHash: 'h1',
  serviceVersion: 1,
  revision: 1,
  recordedAt: '2026-10-09T03:00:00.000Z',
  date: '2026-10-10',
  kickoff: '2026-10-10T18:00:00.000Z',
  homeId: 'fotmob-1',
  awayId: 'fotmob-2',
  fixtureKey: 'fotmob:fotmob-1|fotmob-2|2026-10-10',
  marketKey: 'bothTeamsScore',
  marketId: 'bothTeamsScore',
  distribution: JSON.stringify({ issues: { yes: 0.7, no: 0.3 } }),
  serviceDistribution: JSON.stringify({ issues: { yes: 0.5, no: 0.5 } }),
  ...o
});

test('l’issue d’une ligne à blanc : la règle de la calibration, par marché (1N2, les deux marquent, total et buts d’une équipe à la ligne de la distribution, résultat + total, corners) ; un match attribué ou des corners non relevés ne se règlent pas', () => {
  const r = reglementDe({ buts: { home: 2, away: 1 }, stats: { corners: { home: 6, away: 3 } } });
  assert.deepEqual(issueDeLaLigne({ marketId: 'result', distribution: { issues: { home: 0.5, draw: 0.3, away: 0.2 } } }, r), { issue: 'home' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'bothTeamsScore', distribution: { issues: {} } }, r), { issue: 'yes' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'totalGoals', distribution: { ligne: 2.5, issues: {} } }, r), { issue: 'over' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'totalGoals', distribution: { ligne: 3.5, issues: {} } }, r), { issue: 'under' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'teamGoals', distribution: { equipe: 'away', ligne: 0.5, issues: {} } }, r), { issue: 'over' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'teamGoals', distribution: { equipe: 'away', ligne: 1.5, issues: {} } }, r), { issue: 'under' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'resultAndTotal', distribution: { ligne: 2.5, issues: {} } }, r), { issue: 'homeOver' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'totalCorners', distribution: { ligne: 9.5, issues: {} } }, r), { issue: 'under' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'teamCorners', distribution: { equipe: 'home', ligne: 5.5, issues: {} } }, r), { issue: 'over' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'result', distribution: { issues: {} } }, reglementDe({ attribue: true })), { raison: 'attribue' });
  assert.deepEqual(issueDeLaLigne({ marketId: 'totalCorners', distribution: { ligne: 9.5, issues: {} } }, reglementDe()), { raison: 'statNonRelevee' });
});

test('les lignes de l’essai : la DERNIÈRE révision gelée avant le coup d’envoi, de CETTE candidate face à CETTE version en service ; le reste compté (autre empreinte, autre version, après le coup d’envoi, sans identifiant, à venir) ; la perte log de metrics.js des deux côtés', () => {
  const lire = (f) => (f.homeId === 'fotmob-x' ? { raison: 'sansIdentifiant' } : { coupDEnvoi: '2026-10-10T18:00:00.000Z', reglement: reglementDe({ buts: { home: 1, away: 1 } }) });
  const revisions = [
    // Un pronostic révisé deux fois avant le coup d'envoi, puis une fois APRÈS : la révision 2 est retenue.
    rev({ revision: 1 }),
    rev({ revision: 2, recordedAt: '2026-10-10T12:00:00.000Z', distribution: JSON.stringify({ issues: { yes: 0.6, no: 0.4 } }) }),
    rev({ revision: 3, recordedAt: '2026-10-10T19:00:00.000Z', distribution: JSON.stringify({ issues: { yes: 0.99, no: 0.01 } }) }),
    // Une autre empreinte (candidate modifiée), une autre version en service : comptées, jamais mêlées.
    rev({ marketKey: 'm2', candidateHash: 'h0' }),
    rev({ marketKey: 'm3', serviceVersion: 2 }),
    // Calculée seulement après le coup d'envoi.
    rev({ marketKey: 'm4', recordedAt: '2026-10-10T18:30:00.000Z' }),
    // Sans identifiant FotMob ; puis un match à venir (après aujourd'hui).
    rev({ fixtureKey: 'nom:x|y|2026-10-10', homeId: 'fotmob-x', marketKey: 'm5' }),
    rev({ fixtureKey: 'fotmob:fotmob-1|fotmob-2|2026-10-30', date: '2026-10-30', marketKey: 'm6' })
  ];
  const r = lignesDeLEssai(revisions, { empreinte: 'h1', versionEnService: 1, lire, aujourdhui: '2026-10-20' });
  assert.equal(r.lignes.length, 1);
  const [l] = r.lignes;
  assert.equal(l.issue, 'yes');
  assert.equal(l.a, perteLog({ yes: 0.5, no: 0.5 }, 'yes').valeur);
  assert.equal(l.b, perteLog({ yes: 0.6, no: 0.4 }, 'yes').valeur, 'la révision 2, jamais la 3 (après le coup d’envoi)');
  assert.deepEqual([l.bloc, l.match, l.date], ['fotmob:fotmob-1|fotmob-2|2026-10-10', 'fotmob:fotmob-1|fotmob-2|2026-10-10', '2026-10-10']);
  assert.deepEqual(r.ecartees, { autreEmpreinte: 1, autreVersionEnService: 1, apresCoupDEnvoi: 1, sansIdentifiant: 1 });
  assert.deepEqual(r.aVenir, { pronostics: 1, matchs: 1 });
  assert.deepEqual(r.parMarche.map((p) => [p.marketId, p.lignes, p.matchs]), [['bothTeamsScore', 1, 1]]);
  // Une distribution manquante ou une issue absente : comptées.
  const sans = lignesDeLEssai([rev({ distribution: null }), rev({ marketKey: 'm7', serviceDistribution: JSON.stringify({ issues: { over: 0.5, under: 0.5 } }) })], { empreinte: 'h1', versionEnService: 1, lire, aujourdhui: '2026-10-20' });
  assert.deepEqual(sans.ecartees, { sansDistribution: 1, issueAbsente: 1 });
  // Le jour même, sans résultat encore : à venir, jamais écarté.
  const aujourdhui = lignesDeLEssai([rev({})], { empreinte: 'h1', versionEnService: 1, lire: () => ({ raison: 'sansResultat' }), aujourdhui: '2026-10-10' });
  assert.deepEqual([aujourdhui.lignes.length, aujourdhui.aVenir.pronostics, aujourdhui.ecartees], [0, 1, {}]);
});

// ================================================================ 3. la déclaration d'une candidate

test('une candidate peut déclarer son horizon, son origine, ses variantes regardées et ses fenêtres vues — rendus seulement s’ils sont déclarés (l’empreinte d’avant ne bouge pas) ; un horizon changé fait une autre empreinte', () => {
  const ok = { id: 'score-marche-v1', etape: '27', quoi: 'Modèle de score', modifications: { football: { defaultCorrelation: -0.1 } }, marches: ['totalGoals'] };
  assert.deepEqual(validerCandidate(ok), ok, 'rien de plus sans champ facultatif');
  const complet = { ...ok, horizon: { matchs: 300 }, origine: 'correction-mensuelle', variantes: [{ id: 'score-marche-v0', quoi: 'sans ancrage' }], vues: [{ de: '2019-07-01', a: '2020-06-30', quoi: 'réglage' }] };
  assert.deepEqual(validerCandidate(complet), complet);
  for (const [faute, motif] of [
    [{ ...ok, horizon: { matchs: 100 } }, /au moins 200 matchs/],
    [{ ...ok, horizon: { jours: 3 } }, /au moins 7 jours/],
    [{ ...ok, origine: 'Correction Mensuelle' }, /origine illisible/],
    [{ ...ok, variantes: [{ quoi: 'sans id' }] }, /sans identifiant court/],
    [{ ...ok, variantes: [{ id: 'score-marche-v1' }] }, /deux fois \(ou porte le nom de la candidate\)/],
    [{ ...ok, variantes: [{ id: 'a1' }, { id: 'a1' }] }, /écrite deux fois/],
    [{ ...ok, vues: [{ de: '2020-01-02', a: '2020-01-01' }] }, /de ≤ a/]
  ]) {
    assert.throws(() => validerCandidate(faute), motif);
  }
  const e0 = empreinteDeLaCandidate(ok);
  assert.equal(empreinteDeLaCandidate({ ...ok, origine: 'correction-mensuelle', variantes: [{ id: 'z9' }] }), e0, 'ni l’origine ni les variantes ne changent les chiffres');
  assert.notEqual(empreinteDeLaCandidate({ ...ok, horizon: { matchs: 300 } }), e0, 'changer l’horizon recommence l’essai');
  assert.ok(ORIGINES.adoption.includes('juge de l’étape 16'));
  assert.deepEqual(Object.keys(A_VENIR), ['correctionMensuelle'], 'il reste la place de l’étape 26');
});

test('la décision d’adopter (pure) : dans l’ordre — pas encore jugée (avec où en est l’essai), jugée face à une autre version, moins bonne, pas prouvée, passe en cours, réglages pas notés ; « retenu » seulement', () => {
  const brut = { enService: 3 };
  const juge = (verdict, o = {}) => ({ empreinte: 'e', horizon: { matchs: 600, jours: 14 }, premiersChiffres: { matchs: 120, joursEcoules: 5 }, jugement: verdict ? { verdict, versionEnService: 3, matchs: 640, variantes: 2, raison: 'r' } : null, ...o });
  const d = (n, o = {}) => V.etatDeLAdoption(brut, n, { enCours: false, enSynchro: true, empreinte: 'e', ...o });
  assert.deepEqual(d(null), { possible: false, raison: 'aucune-candidate', texte: 'Aucune candidate en essai : rien à adopter.' });
  assert.equal(d(juge(null)).raison, 'pas-encore-jugee');
  assert.match(d(juge(null)).texte, /une seule fois, quand l’essai à blanc a 600 matchs joués et au moins 14 jours \(aujourd’hui : 120 matchs, 5 jours\)/);
  assert.equal(d(juge('retenu'), { empreinte: 'autre' }).raison, 'pas-encore-jugee', 'le jugement d’une autre empreinte ne compte pas');
  assert.equal(d({ ...juge('retenu'), jugement: { verdict: 'retenu', versionEnService: 2 } }).raison, 'version-changee');
  assert.equal(d(juge('moins-bon')).raison, 'moins-bon');
  assert.match(d(juge('moins-bon')).texte, /^Refusée : la candidate fait moins bien que la version en service, au-delà du hasard \(640 matchs joués, 2 variantes essayées\)\./);
  assert.equal(d(juge('pas-prouve')).raison, 'pas-prouve');
  assert.match(d(juge('pas-prouve')).texte, /Pour réessayer, il faut une nouvelle candidate \(elle comptera comme une variante de plus\)\.$/);
  // Un verdict qui n'est pas « retenu » (pas assez de matchs, inconnu) ne s'adopte jamais.
  for (const v of ['pas-assez-de-matchs', 'inconnu']) assert.deepEqual([d(juge(v)).possible, d(juge(v)).raison], [false, 'pas-encore-jugee'], v);
  assert.equal(d(juge('retenu'), { enCours: true }).raison, 'passe-en-cours');
  assert.equal(d(juge('retenu'), { enSynchro: false }).raison, 'pas-en-synchro');
  assert.deepEqual(d(juge('retenu')), { possible: true, raison: null, verdict: 'retenu', texte: null });
});

// ================================================================ 4. la règle de dérive

const caseDe = (marche, matchs, annonce, realise, fourchette, verdict = 'dans-le-hasard') => ({ marche, libelle: marche, pronostics: matchs, matchs, annonce, realise, ecart: realise - annonce, juge: { verdict, matchs, minimum: 200, ecart: realise - annonce, fourchette, variantes: 12 } });
const bilanDe = (parMarche, cloture = null) => ({ mois: '2026-10', figeLe: '2026-11-01T05:00:00.000Z', vues: { premiere: { parMarche, cloture } } });

test('la dérive : les écarts de départ viennent de la note de départ (P2, jamais vue) par famille de marché — le total de buts déjà trop confiant au départ, le 1N2 juste', () => {
  const e = ecartsDeDepart();
  assert.deepEqual(Object.keys(e).sort(), ['bothTeamsScore', 'result', 'resultAndTotal', 'teamCorners', 'teamGoals', 'teamShots', 'teamShotsOnTarget', 'totalCorners', 'totalGoals', 'totalShots', 'totalShotsOnTarget']);
  assert.ok(Math.abs(e.result.ecart) < 0.005, `1N2 : ${e.result.ecart}`);
  assert.ok(e.totalGoals.ecart < -0.05, `total buts : ${e.totalGoals.ecart}`);
  assert.equal(e.totalGoals.lignes.length, 4, 'les quatre lignes de buts réunies');
  assert.equal(e.teamGoals.lignes.length, 8, 'domicile et extérieur, quatre lignes chacun');
  assert.equal(e.result.n, 30158);
  assert.equal(familleDeLaNote('teamCorners:home'), 'teamCorners');
  assert.equal(familleDeLaNote('totalGoals|2.5'), 'totalGoals');
  // Recalculé à la main pour le 1N2 : Σ n × (réalisé − annoncé) / Σ n.
  const m = { depart: { P2: { marches: { result: { calibration: [{ n: 100, annonce: 0.5, realise: 0.6 }, { n: 300, annonce: 0.7, realise: 0.66 }, { n: 0, annonce: null, realise: null }] }, scoreExact: { calibration: [{ n: 5, annonce: 0.1, realise: 0.9 }] } } } } };
  const fait = ecartsDeDepart(m);
  assert.deepEqual(Object.keys(fait), ['result'], 'le score exact n’est pas un marché de l’appli');
  assert.ok(Math.abs(fait.result.ecart - (100 * 0.1 + 300 * -0.04) / 400) < 1e-12);
});

test('la dérive SE DÉCLENCHE sur un cas fabriqué : l’écart de départ hors de la fourchette du mois ET un écart qui a grandi ; la valeur de clôture négative au-delà du hasard ; l’alerte durable dit le mois et les signaux', () => {
  const depart = { totalGoals: { ecart: -0.067, n: 30158 }, result: { ecart: 0.001, n: 30158 }, bothTeamsScore: { ecart: -0.095, n: 29816 } };
  const b = bilanDe(
    [
      caseDe('totalGoals', 480, 0.62, 0.48, [-0.2, -0.08], 'trop-haut'), // −14 points, départ −6,7 hors de la fourchette : DÉRIVE
      caseDe('result', 400, 0.55, 0.62, [0.02, 0.12], 'trop-bas'), // +7 points, départ +0,1 hors de la fourchette : DÉRIVE (trop bas)
      caseDe('bothTeamsScore', 460, 0.6, 0.55, [-0.12, 0.02]) // départ −9,5 dans la fourchette : stable
    ],
    { mesures: 300, moyenne: -2.1, juge: { verdict: 'negative', matchs: 260, minimum: 200, fourchette: [-3.4, -0.8] } }
  );
  const e = evaluerDerive(b, { depart });
  assert.equal(e.derive, true);
  assert.deepEqual(e.signaux.map((s) => [s.type, s.marche ?? null, s.sens ?? null]), [['calibration', 'totalGoals', 'trop-haut'], ['calibration', 'result', 'trop-bas'], ['cloture', null, null]]);
  assert.deepEqual(e.examines.map((x) => [x.marche, x.statut]), [['totalGoals', 'derive'], ['result', 'derive'], ['bothTeamsScore', 'stable']]);
  const v = valeurDeLAlerte(e, Date.parse('2026-11-01T06:00:00.000Z'));
  assert.deepEqual([v.mois, v.figeLe, v.regle, v.updatedAt, v.signaux.length, v.minimum], ['2026-10', '2026-11-01T05:00:00.000Z', 1, '2026-11-01T06:00:00.000Z', 3, 200]);
  // Avec la vraie note de départ, le même mois fait la même dérive.
  assert.deepEqual(evaluerDerive(b).signaux.map((s) => s.marche ?? s.type), ['totalGoals', 'result', 'cloture']);
});

test('la dérive NE SE DÉCLENCHE JAMAIS sur un mois maigre (moins de 200 matchs, le minimum du juge), ni sur un écart qui se resserre, ni sans référence ; sans dérive, l’alerte est levée (null)', () => {
  const depart = { totalGoals: { ecart: -0.067, n: 30158 }, result: { ecart: 0.001, n: 30158 } };
  // Un mois maigre : des écarts énormes, mais 199 matchs (et un juge qui ne s'est pas prononcé), une clôture sur 150 matchs.
  const maigre = bilanDe([caseDe('result', 199, 0.6, 0.2, [-0.5, -0.3], 'dans-le-hasard'), caseDe('totalGoals', 150, 0.6, 0.1, null, 'trop-peu')], { mesures: 160, moyenne: -9, juge: { verdict: 'negative', matchs: 150, minimum: 200, fourchette: [-12, -6] } });
  const m = evaluerDerive(maigre, { depart });
  assert.equal(m.derive, false);
  assert.deepEqual(m.examines.map((x) => x.statut), ['trop-peu', 'trop-peu']);
  assert.equal(m.cloture.statut, 'trop-peu');
  assert.equal(valeurDeLAlerte(m), null, 'l’alerte est levée');
  // Un écart qui se RESSERRE au-delà du hasard (départ −6,7 points, maintenant −1 point) : « mieux », jamais une dérive.
  const mieux = evaluerDerive(bilanDe([caseDe('totalGoals', 500, 0.6, 0.59, [-0.04, 0.02])]), { depart });
  assert.deepEqual([mieux.derive, mieux.examines[0].statut], [false, 'mieux']);
  // Un marché sans référence au départ, une case sans fourchette : dits, jamais une dérive.
  const autres = evaluerDerive(bilanDe([caseDe('teamShots', 500, 0.6, 0.2, [-0.5, -0.3]), caseDe('result', 500, 0.6, 0.2, null)]), { depart });
  assert.deepEqual(autres.examines.map((x) => x.statut), ['sans-reference', 'pas-juge']);
  assert.equal(autres.derive, false);
  // Une clôture positive ou dans le hasard : stable.
  assert.equal(evaluerDerive(bilanDe([], { mesures: 400, moyenne: 1.2, juge: { verdict: 'positive', matchs: 300, fourchette: [0.3, 2] } }), { depart }).cloture.statut, 'stable');
  assert.deepEqual(evaluerDerive(null), { regle: 1, mois: null, figeLe: null, vue: 'premiere', derive: false, signaux: [], examines: [], cloture: null, minimum: 200 });
  assert.equal(REGLE_DE_DERIVE.minimum, 200);
  assert.match(REGLE_DE_DERIVE.maigre, /moins de 200 matchs/);
});

test('la feuille de route : l’alerte de dérive passe telle quelle quand la route la donne ; sans elle, null — l’état ne lit jamais rien de lui-même', () => {
  const mesure = { source: 'absent', fichier: 'x', probleme: null, majLe: null, nombre: 0, etapes: {} };
  const pierre = { source: 'absent', fichier: 'y', majLe: null, probleme: null, etapes: {} };
  const alerte = { regle: 1, mois: '2026-10', signaux: [{ type: 'cloture' }] };
  assert.deepEqual(etatFeuilleDeRoute({ maintenant: Date.parse('2026-11-02T10:00:00Z'), pierre, mesure, derive: alerte }).alerteDerive, alerte);
  assert.equal(etatFeuilleDeRoute({ maintenant: Date.parse('2026-11-02T10:00:00Z'), pierre, mesure }).alerteDerive, null);
});

// ================================================================ 5. le banc avant l'essai (faux rejeu)

test('le banc avant l’essai : deux rejeux du banc (la version en service, puis la candidate par l’option `config`), seulement ses familles, P2 et l’avant-match football-data ; appariés par la clé complète ; jugé par le juge de l’étape 16 avec les variantes de l’étape ; TOUJOURS indicatif', async () => {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-banc-candidate-'));
  try {
    const registre = path.join(dossier, 'registre-mesure.json');
    fs.writeFileSync(registre, JSON.stringify({ version: 1, etapes: { 27: { variantes: [{ id: 'v1', ou: 'a-blanc', le: '2026-10-01T00:00:00.000Z' }, { id: 'v2', ou: 'banc', le: '2026-10-02T00:00:00.000Z' }] } } }));
    const appels = [];
    const ligne = (i, prix, v, o = {}) => ({ type: 'ligne', cle: `f${i}|bothTeamsScore|-|${prix}`, fixtureKey: `f${i}`, date: i < 50 ? '2023-08-10' : '2020-03-01', marketKey: 'bothTeamsScore', prix, mesures: { moteur: { perteLog: v } }, ...o });
    const faux = async (o) => {
      appels.push({ config: o.config, periodes: o.periodes, prix: o.prix, marches: o.marches, reproduction: o.reproduction, database: o.database, declaration: o.declaration ?? null });
      const candidate = o.config.defaultCorrelation === -0.2;
      for (let i = 0; i < 260; i++) o.surLigne(ligne(i, 'fd-avant-match', candidate ? 0.6 + (i % 5) / 100 : 0.7 + (i % 5) / 100));
      // Présente d'un seul côté, une autre ligne retenue, une mesure manquante, un pari (ignoré).
      if (!candidate) o.surLigne(ligne(900, 'fd-avant-match', 0.7));
      o.surLigne(candidate ? ligne(901, 'fd-avant-match', 0.6, { cle: 'f901|bothTeamsScore|2.5|fd-avant-match' }) : ligne(901, 'fd-avant-match', 0.7));
      o.surLigne(ligne(902, 'fd-avant-match', candidate ? null : 0.7));
      o.surLigne({ type: 'pari' });
      return { bilan: { erreur: null }, resume: {}, moteur: { empreinte: candidate ? 'eB' : 'eA' } };
    };
    const candidate = { id: 'essai-banc', etape: '27', marches: ['bothTeamsScore', 'teamCorners'], empreinte: 'abc' };
    const r = await jugerLaCandidateAuBanc({ candidate, reglagesEnService: { defaultCorrelation: -0.075 }, reglagesCandidate: { defaultCorrelation: -0.2 }, database: 'base-de-l-appelant', rejouer: faux, registre: { fichier: registre }, maintenant: Date.parse('2026-10-14T10:00:00Z') });
    assert.deepEqual(appels.map((a) => a.config.defaultCorrelation), [-0.075, -0.2], 'la version en service, puis la candidate (option config du banc)');
    assert.deepEqual(appels[0].marches, ['bothTeamsScore', 'corners'], 'les familles du banc de ses marchés');
    assert.deepEqual([appels[0].periodes, appels[0].prix, appels[0].reproduction, appels[0].database], [['P2'], ['fd-avant-match'], false, 'base-de-l-appelant']);
    // La candidate rejouée avec SA déclaration (ses vues, sinon []) ; la version en service, sans (ses vues sont au code ; correction du 19/10).
    assert.deepEqual(appels.map((a) => a.declaration), [null, { etape: '27', version: 'essai-banc', vues: [] }]);
    assert.equal(r.indicatif, true);
    assert.deepEqual([r.paires, r.matchs, r.variantes, r.verdict], [260, 260, 2, 'retenu']);
    assert.deepEqual(r.ecartees, { sansPaire: 1, lignesDifferentes: 2, nonReglable: 1 });
    assert.ok(r.gainPct > 10 && r.fourchettePct[0] > 0, JSON.stringify([r.gainPct, r.fourchettePct]));
    assert.deepEqual(r.dejaVues, { lignes: 50, part: Number((50 / 260).toFixed(4)), vuesDeclarees: false }, 'la part des lignes dans des données déjà vues (2023-24)');
    assert.deepEqual(r.moteurs, { a: 'eA', b: 'eB' });
    assert.deepEqual([r.candidate, r.empreinte, r.le], ['essai-banc', 'abc', '2026-10-14T10:00:00.000Z']);
    // Un rejeu en échec : pas de verdict, l'erreur dite.
    const panne = await jugerLaCandidateAuBanc({ candidate, reglagesEnService: {}, reglagesCandidate: {}, database: null, rejouer: async () => ({ bilan: { erreur: 'Aucun jour à rejouer' } }), registre: { fichier: registre } });
    assert.deepEqual([panne.verdict, panne.erreur], [null, 'rejeu de la version en service : Aucun jour à rejouer']);
    // Une candidate sans marché que le banc rejoue : rien de rejoué.
    assert.match((await jugerLaCandidateAuBanc({ candidate: { ...candidate, marches: [] }, rejouer: faux })).erreur, /aucun marché/);
    assert.deepEqual(Object.values(FAMILLE_DU_BANC).filter((f, i, t) => t.indexOf(f) === i).sort(), ['bothTeamsScore', 'corners', 'result', 'resultAndTotal', 'shots', 'shotsOnTarget', 'teamGoals', 'totalGoals']);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// ================================================================ 6. le parcours de bout en bout

test('parcours — une candidate MOINS BONNE : jugée une seule fois à l’horizon (270 matchs), adoption REFUSÉE (409, rien écrit) ; la nuit suivante ne recalcule rien, l’étape de la passe le dit', () => {
  const p = lePacours().moinsBon;
  assert.deepEqual(p.misEnEssai.essai, { depuis: '2026-10-01T03:00:00.000Z', versionEnService: 1, numero: 1, variante: 'essai-moins-bon' });
  assert.equal(p.plantees, 270);
  assert.deepEqual(p.nuit.essai, { calcule: true, principal: true, verdict: 'moins-bon', matchs: 270, horizon: { matchs: 250, jours: 14 }, ecrit: true });
  assert.equal(p.registre.jugement.verdict, 'moins-bon');
  assert.ok(p.registre.jugement.gainPct < 0 && p.registre.jugement.fourchettePct[1] < 0);
  assert.deepEqual([p.registre.jugement.lancement, p.registre.jugement.fenetre], ['2026-10-01', { de: '2026-10-02', a: '2026-11-15' }], 'seulement des matchs joués après le début de l’essai');
  assert.deepEqual([p.route.adoption.possible, p.route.adoption.raison, p.route.candidate.statut], [false, 'moins-bon', 'jugee']);
  assert.equal(p.adopter.code, 409);
  assert.equal(p.adopter.corps.raison, 'moins-bon');
  assert.match(p.adopter.corps.error, /^Refusée : la candidate fait moins bien que la version en service, au-delà du hasard \(270 matchs joués, 1 variante essayée\)\./);
  assert.equal(p.rienEcrit, true, 'ni les réglages, ni les versions, ni le registre de la mesure');
  assert.deepEqual(p.secondeNuit.essai, { jugee: true, verdict: 'moins-bon', le: '2026-11-20T12:00:00.000Z', matchs: 270 });
  assert.equal(p.secondeNuit.lignes, 0);
  assert.equal(p.etapeDeLaPasse.summary, 'Candidate « essai-moins-bon » (étape 27) jugée sur 270 matchs joués : « moins bon » — sa décision attend dans Réglages › Versions du moteur ; plus rien calculé à blanc.');
  assert.deepEqual(p.jugementsAuRegistre, [{ principal: true, verdict: 'moins-bon', matchs: 270, variantes: 1, lancement: '2026-10-01', fenetre: { de: '2026-10-02', a: '2026-11-15' } }], 'UN jugement principal, jamais un second');
});

test('parcours — une candidate PAS PROUVÉE : adoption refusée avec la raison du juge (409, rien écrit) ; elle compte pour une variante de plus', () => {
  const p = lePacours().pasProuve;
  assert.equal(p.nuit.essai.verdict, 'pas-prouve');
  assert.deepEqual([p.route.adoption.possible, p.route.adoption.raison], [false, 'pas-prouve']);
  assert.deepEqual([p.adopter.code, p.adopter.corps.raison], [409, 'pas-prouve']);
  assert.match(p.adopter.corps.error, /^Pas prouvé : l’écart avec la version en service peut venir du hasard \(270 matchs joués, 2 variantes essayées\)\. Pour réessayer, il faut une nouvelle candidate/);
  assert.equal(p.rienEcrit, true);
});

test('parcours — les DEUX verdicts ne se confondent pas : sous l’horizon, des premiers chiffres sans verdict, et un banc « retenu » (indicatif) ne rend PAS l’adoption possible ; à l’horizon, le jugement de l’essai décide', () => {
  const p = lePacours().retenu;
  assert.deepEqual(p.nuitDu12.essai, { calcule: true, principal: false, matchs: 66, horizon: { matchs: 250, jours: 14 }, joursEcoules: 11, auPlusTotLe: '2026-10-15T03:00:00.000Z', ecrit: true });
  const pc = p.premiers.premiersChiffres;
  assert.deepEqual([pc.matchs, pc.lignes, pc.aVenir.matchs, pc.calculeLe], [66, 66, 204, '2026-10-12T03:00:00.000Z']);
  assert.ok(pc.b < pc.a && pc.gainPct > 0, 'la candidate devant, en premiers chiffres');
  assert.equal('verdict' in pc || 'fourchettePct' in pc, false, 'aucun verdict ni fourchette avant l’horizon');
  assert.equal(p.premiers.jugement, null);
  const avant = p.routeAvant;
  assert.equal(avant.candidate.banc.verdict, 'retenu');
  assert.equal(avant.candidate.banc.indicatif, true);
  assert.equal(avant.candidate.jugement, null);
  assert.deepEqual([avant.adoption.possible, avant.adoption.raison], [false, 'pas-encore-jugee']);
  assert.deepEqual([p.adopterTropTot.code, p.adopterTropTot.corps.raison], [409, 'pas-encore-jugee']);
  assert.match(p.adopterTropTot.corps.error, /aujourd’hui : 66 matchs, 11 jours/);
  assert.equal(p.rienEcritTropTot, true);
  // À l'horizon : le jugement de l'essai, distinct du banc (qui reste rangé, indicatif).
  assert.deepEqual(p.nuit.essai, { calcule: true, principal: true, verdict: 'retenu', matchs: 270, horizon: { matchs: 250, jours: 14 }, ecrit: true });
  assert.deepEqual([p.jugement.verdict, p.jugement.variantes, p.jugement.versionEnService, p.jugement.essai], ['retenu', 3, 1, 1], 'la fourchette élargie pour les trois variantes de l’étape 27');
  assert.ok(p.jugement.fourchettePct[0] > 0);
  assert.equal(p.route.candidate.banc.verdict, 'retenu');
  assert.deepEqual([p.route.adoption.possible, p.route.adoption.verdict], [true, 'retenu']);
  assert.deepEqual(p.route.adoption.changements.map((c) => [c.cle, c.avant, c.apres]), [['defaultCorrelation', -0.075, -0.13]], 'ce que l’adoption changerait');
});

test('parcours — refus avant l’adoption, rien ne bouge : pendant une passe (409), sans « depuis » ou sans candidate (400), une version vue périmée, une autre candidate (409) ; la carte dit la passe', () => {
  const s = lePacours();
  const r = s.refus;
  assert.deepEqual([r.pendantUnePasse.code, r.pendantUnePasse.corps.raison], [409, 'passe-en-cours']);
  assert.deepEqual([s.routes.passeEnCours.adoption.possible, s.routes.passeEnCours.adoption.raison], [false, 'passe-en-cours']);
  assert.deepEqual([r.sansDepuis.code, r.sansCandidate.code], [400, 400]);
  assert.deepEqual([r.depuisPerime.code, r.depuisPerime.corps.raison], [409, 'deja-change']);
  assert.deepEqual([r.autreCandidate.code, r.autreCandidate.corps.raison], [409, 'candidate-changee']);
  assert.equal(r.rienEcrit, true);
  // Le registre de la mesure illisible : le lancement ne pourrait pas être déclaré — 503, rien n'est adopté, le fichier pas réécrit.
  assert.deepEqual([r.mesureIllisible.code, r.mesureIllisible.corps.raison], [503, 'registre-mesure-illisible']);
  assert.equal(r.mesureIllisibleRienEcrit, true);
  // Le banc de la candidate non plus, pendant une passe.
  assert.equal(s.banc.pendantUnePasse.code, 409);
  assert.equal(s.banc.sansCandidateLancee, null);
});

test('parcours — L’ADOPTION sur « retenu » : engine-config.json écrit UNE fois, une version de plus (origine « adoption »), la candidate rangée « adoptée », le lancement déclaré au registre de la mesure ; le moteur calcule avec elle ; un double clic est refusé ; elle n’est plus jamais calculée à blanc ; un retour arrière la défait', () => {
  const a = lePacours().adoption;
  assert.equal(a.reponse.code, 200);
  const c = a.reponse.corps;
  assert.deepEqual([c.de, c.vers, c.nouvelle, c.candidate, c.etape, c.lancementADeclarer], [1, 2, true, 'essai-retenu', '27', null]);
  assert.deepEqual(c.changements.map((x) => [x.cle, x.avant, x.apres]), [['defaultCorrelation', -0.075, -0.13]]);
  assert.equal(c.config.defaultCorrelation, -0.13, 'le formulaire reçoit les réglages adoptés');
  assert.equal(a.ecrituresConfig, 1, 'une seule écriture de engine-config.json');
  assert.ok(a.ecrituresVersions >= 1 && a.ecrituresVersions <= 2, `${a.ecrituresVersions} écritures du registre des versions`);
  assert.equal(a.configAvant, null, 'avant : les valeurs par défaut, pas de fichier');
  assert.equal(a.configApres.football.defaultCorrelation, -0.13);
  const g = a.registre;
  assert.deepEqual([g.enService, g.pile, g.versions], [2, [1, 2], [[1, 'premier-demarrage'], [2, 'adoption']]]);
  assert.equal(g.candidate, null);
  assert.deepEqual(g.passees.at(-1).fin, 'adoptee');
  assert.deepEqual(g.passees.at(-1).version, 2);
  assert.deepEqual(g.passees.map((x) => [x.id, x.fin]), [['essai-moins-bon', 'remplacee'], ['essai-pas-prouve', 'remplacee'], ['essai-retenu', 'adoptee']]);
  assert.deepEqual(g.journal.at(-1), { le: '2026-11-20T12:00:00.000Z', action: 'adoption', version: 2, depuis: 1, candidate: 'essai-retenu', etape: '27' });
  assert.equal(g.lancementADeclarer, null);
  assert.deepEqual([a.lancement.version, a.lancement.le, a.lancement.source], ['essai-retenu', '2026-11-20', 'a-chaud'], 'le lancement à chaud, daté du jour de l’adoption');
  assert.deepEqual(a.variantes, [['essai-moins-bon', 'a-blanc'], ['essai-pas-prouve', 'a-blanc'], ['essai-retenu', 'a-blanc']]);
  assert.equal(a.mesure.jugements.filter((j) => j.principal).length, 3, 'trois jugements principaux, un par candidate');
  assert.deepEqual(a.enService, { reglage: -0.13, numero: 2 });
  assert.deepEqual(a.moteur, [2, 2, 2], 'les pronostics portent la version 2');
  assert.deepEqual([a.doubleClic.code, a.doubleClic.corps.raison], [409, 'deja-change']);
  assert.deepEqual([a.nuitApres.candidate, a.lignesApres], [null, 0], 'adoptée : jamais remise à blanc');
  assert.equal(a.retour.code, 200);
  assert.deepEqual(a.apresRetour, { reglage: -0.075, enService: 1, moteur: true }, 'le retour arrière redonne exactement les chiffres d’avant');
  const apres = lePacours().routes.apresAdoption;
  assert.deepEqual([apres.candidate, apres.candidateAdoptee.id, apres.candidateAdoptee.version, apres.adoption.raison], [null, 'essai-retenu', 2, 'aucune-candidate']);
});

test('parcours — la candidate reste INVISIBLE jusqu’à son adoption : trois essais et trois jugements plus tard, le moteur rend les mêmes chiffres (même version) et les journaux des paris, des pronostics et des analyses n’ont pas bougé', () => {
  assert.deepEqual(lePacours().invisible, { moteur: true, journaux: true });
});

test('parcours — un lancement d’adoption resté « à déclarer » (registre de la mesure illisible au clic) est déclaré au démarrage suivant ; la carte le dit en attendant', () => {
  const e = lePacours().enAttente;
  assert.deepEqual(e.route, { etape: '28', version: 'essai-en-attente', quoi: 'Lancement fabriqué resté à déclarer' });
  assert.equal(e.demarrage.lancementEnAttente.declare, true);
  assert.equal(e.apres, null);
  assert.deepEqual([e.lancement.version, e.lancement.source], ['essai-en-attente', 'a-chaud']);
});

test('parcours — le point d’entrée de l’étape 26 : une candidate PROPOSÉE par un module (origine obligatoire, jamais « code ») suit le même chemin — vue par la carte, gardée au démarrage, une seule à la fois ; le banc avant l’essai se lance par la route et dit son échec sans rien ranger', () => {
  const s = lePacours();
  assert.match(s.proposeeSansOrigine, /dit d’où elle vient/);
  assert.equal(s.proposee.candidate.id, 'essai-proposee');
  assert.deepEqual([s.proposeeRoute.id, s.proposeeRoute.origine, s.proposeeRoute.origineDite, s.proposeeRoute.statut], ['essai-proposee', 'correction-mensuelle', 'proposée par la correction du mois (étape 26)', 'en-essai']);
  assert.deepEqual([s.proposeeAuDemarrage, s.proposeeEnEssai], ['essai-proposee', 'essai-proposee']);
  assert.match(s.proposeeDejaUne, /est déjà en essai : une seule à la fois/);
  assert.match(s.proposeeOrigineCode, /« code » est réservé à la candidate déclarée dans le code/);
  assert.deepEqual(s.proposeeVariantes.slice(-2), [['essai-proposee', 'a-blanc'], ['essai-proposee-v0', 'construction']], 'la variante regardée pendant la construction est comptée dès la mise à blanc');
  assert.equal(s.banc.lance.code, 202);
  assert.equal(s.banc.lance.corps.candidate, 'essai-proposee');
  assert.equal(s.banc.fini, true);
  assert.match(s.banc.refus.raison, /^rejeu de la version en service : Aucun jour à rejouer/);
  assert.equal(s.banc.range, null, 'un banc en échec n’est jamais rangé comme un verdict');
});

test('parcours — la version en service change pendant l’essai (un réglage enregistré) : l’essai RECOMMENCE face à elle (essai n° 2, une variante de plus comptée), ses premiers chiffres d’avant ne comptent plus', () => {
  const r = lePacours().recommence;
  assert.deepEqual([r.avant.numero, r.avant.versionEnService, r.avant.variante], [1, 1, 'essai-proposee']);
  assert.deepEqual([r.reglage.numero, r.reglage.nouvelle], [3, true]);
  assert.deepEqual([r.apres.essai.numero, r.apres.essai.versionEnService, r.apres.essai.variante, r.apres.essai.depuis], [2, 3, 'essai-proposee~2', '2026-11-20T12:00:00.000Z']);
  assert.equal(r.apres.banc, false, 'son banc avait échoué : rien de rangé, rien d’inventé');
  assert.ok(r.variantes.includes('essai-proposee~2'), 'le nouvel essai compte pour une variante de plus');
  assert.equal(r.route, 'en-essai');
  assert.deepEqual([r.nuit.calcule, r.nuit.principal, r.nuit.matchs], [true, false, 0], 'rien de joué depuis le nouveau début');
});

// ================================================================ 7. la dérive par la route

test('parcours — la dérive : un mois figé fabriqué (octobre) fait l’alerte ; la route la donne à la carte (le dernier mois jugé ET l’alerte durable) et à la feuille de route ; l’étape mensuelle sans mois à figer n’y touche pas', () => {
  const d = lePacours().derive;
  assert.equal(d.fige, true);
  assert.equal(d.route.dernierMois.derive, true);
  assert.deepEqual(d.route.dernierMois.signaux.map((x) => [x.type, x.marche ?? null, x.statut]), [['calibration', 'totalGoals', 'derive'], ['cloture', null, 'derive']]);
  assert.deepEqual(d.route.dernierMois.examines.map((x) => [x.marche, x.statut]), [['totalGoals', 'derive'], ['bothTeamsScore', 'stable'], ['result', 'trop-peu']], 'le 1N2 de 150 matchs ne dit rien');
  assert.equal(d.route.alerte.mois, '2026-10');
  assert.equal(d.route.regle.minimum, 200);
  assert.equal(d.feuille.mois, '2026-10');
  assert.equal('alert' in d.etapeRien, false, 'sans mois figé, l’alerte n’est ni posée ni levée');
  assert.equal(d.alerteGardee, '2026-10');
});

// ================================================================ 8. le code

test('le code : routes et branchements ; l’essai jugé dans l’étape de nuit ; l’alerte posée par l’étape mensuelle ; rien de ce qui se montre, se parie ou part à l’IA n’importe l’adoption, le banc de la candidate ni l’essai ; un garde pour les essais', () => {
  const lire = (...c) => fs.readFileSync(path.join(SRC, ...c), 'utf8');
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const routes = lire('api', 'routes', 'config.routes.js');
  assert.match(routes, /router\.post\('\/versions\/adopter', asyncHandler\(postAdopterVersion\)\);/);
  assert.match(routes, /router\.post\('\/versions\/candidate\/banc', asyncHandler\(postBancCandidate\)\);/);
  const ctrl = lire('api', 'controllers', 'config.controller.js');
  assert.match(ctrl, /\{ stamp: false, nom: 'banc-candidate' \}/, 'le banc de la candidate sous le verrou de l’actualisation');
  assert.match(ctrl, /if \(!r\.erreur\) noterLeBancDeLaCandidate\(r, \{ id: candidate\.id, empreinte: candidate\.empreinte \}\);/);
  const blanc = lire('data', 'enregistreurs', 'moteurABlanc.js');
  // Depuis le 24/10/2026 : l'essai jugé dans la même série de pauses que toute l'étape (reactiviteEssai.test.mjs).
  assert.match(blanc, /bilan\.essai = await jugerLEssai\(\{ candidate: essaiEnCours, database: base, maintenant, versions, mesure, pauses \}\);/);
  assert.match(blanc, /registre = \{ \.\.\.mesure, lancements: \[\.\.\.LANCEMENTS, lancementDeLEssai\(candidate, essai\)\] \}/, 'le lancement de l’essai, jamais écrit au registre');
  const job = lire('jobs', 'matchStatsAutoRefresh.js');
  assert.match(job, /if \(r\.figes\.some\(\(f\) => f\.ecrit\)\) \{\n {4}const d = deriveDuMoteur\(\{ database: options\.database, alerte: null \}\);/);
  assert.match(job, /\.\.\.\(alerte \? \{ alert: alerte \} : \{\}\)/);
  // Seul engineVersions.js écrit les réglages et adopte ; seule la route de Réglages appelle l'adoption.
  const fichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
  const avec = (motif) => fichiers.filter((f) => motif.test(sansCommentaires(lire(f)))).sort();
  assert.deepEqual(avec(/\badopterLaCandidate\s*\(/), ['api/controllers/config.controller.js', 'core/engine/engineVersions.js']);
  assert.deepEqual(avec(/\bnoterLEssai\s*\(/), ['core/engine/engineVersions.js', 'data/enregistreurs/moteurABlanc.js']);
  // Étape 26 (partie B, 28/10/2026) : la boucle de correction propose — par un seul module, miseALEssai.js, qui importe
  // le point d'entrée de engineVersions.js (pas de recopie) et ne l'appelle que quand la place est libre.
  assert.deepEqual(avec(/\bproposerUneCandidate\s*\(/), ['core/engine/engineVersions.js', 'data/correction/miseALEssai.js'], 'le point d’entrée existe ; seule la boucle de correction (étape 26) propose');
  // Ce qui se montre, se parie ou part à l'IA ne connaît ni l'essai, ni l'adoption, ni le banc de la candidate.
  for (const f of ['core/engine/verdictPari.js', 'core/engine/oddsEngine.js', 'data/opportunities.js', 'data/screener.js', 'core/ai/matchAiAnalysisService.js', 'core/ai/compactContext.js', 'core/ai/matchAiAnalysisPrompt.js', 'core/ai/autoMatchAiTrigger.js', 'api/controllers/analysis.controller.js', 'api/controllers/bets.controller.js', 'api/controllers/predictions.controller.js', 'data/enregistreurs/gelPronostics.js']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /essaiCandidate|bancCandidate|horizonEssai|adopterLaCandidate|noterLEssai|jugerLEssai|deriveMoteur|proposerUneCandidate/, f);
  }
  // Aucun fichier de l'essai n'entre dans l'empreinte du moteur : rien de cette étape ne fait une version au démarrage.
  for (const f of ['bench/essaiCandidate.js', 'bench/horizonEssai.js', 'bench/bancCandidate.js', 'data/deriveMoteur.js', 'data/alerteDerive.js']) assert.ok(fs.existsSync(path.join(SRC, f)), f);
  // Le garde des essais : aucun fichier de test n'appelle dans son processus une fonction qui écrit les versions ou les registres.
  const ecrivains = ['adopterLaCandidate', 'noterLEssai', 'noterLeBancDeLaCandidate', 'proposerUneCandidate', 'jugerLEssai'];
  const dossier = path.join(SERVEUR, 'test');
  for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.test.mjs'))) {
    const source = fs.readFileSync(path.join(dossier, nom), 'utf8').replace(/const ecrivains = \[[^\]]*\];/, '');
    for (const f of ecrivains) assert.doesNotMatch(source, new RegExp(`\\b${f}\\s*\\(`), `${nom} appelle ${f} dans le processus des tests`);
  }
  assert.match(fs.readFileSync(SCRIPT, 'utf8'), /if \(path\.resolve\(T\.FICHIER_REGISTRE\)\.toLowerCase\(\) !== path\.resolve\(FICHIER_MESURE\)\.toLowerCase\(\)\) throw/);
});

// ================================================================ 9. étape 27 : témoins, familles, porte de sûreté, K

test('étape 27 — les TÉMOINS : `temoins: ["scoreExact"]` reste HORS de l’empreinte de la candidate (même empreinte avec ou sans) ; un témoin inconnu, ou aussi parmi les marchés, est refusé ; une candidate au modèle de buts unique est validée, des réglages du modèle fautifs la refusent ; un réglage du modèle change l’empreinte', () => {
  const base = { id: 'buts-unique-essai', etape: '27', quoi: 'Modèle de buts unique', modifications: { football: { modeleDeButs: reglagesDuModele() } }, marches: ['totalGoals', 'teamGoals', 'bothTeamsScore', 'resultAndTotal'] };
  const avec = { ...base, temoins: ['scoreExact'] };
  assert.deepEqual(validerCandidate(avec).temoins, ['scoreExact']);
  assert.equal(empreinteDeLaCandidate(avec), empreinteDeLaCandidate(base), 'le témoin ne change pas l’empreinte');
  assert.throws(() => validerCandidate({ ...base, temoins: ['buteurs'] }), /témoin inconnu « buteurs »/);
  assert.throws(() => validerCandidate({ ...base, temoins: 'scoreExact' }), /« temoins » est une liste/);
  assert.throws(() => validerCandidate({ ...base, modifications: { football: { modeleDeButs: { ...reglagesDuModele(), rho: 0.9 } } } }), /modeleDeButs : réglages fautifs — rho/);
  assert.throws(() => validerCandidate({ ...base, modifications: { football: { modeleDeButs: { ...reglagesDuModele(), poidsDuMarche: 1 } } } }), /clés inconnues \(poidsDuMarche\)/);
  assert.notEqual(empreinteDeLaCandidate({ ...base, modifications: { football: { modeleDeButs: reglagesDuModele({ rho: -0.06 }) } } }), empreinteDeLaCandidate(base));
});

test('étape 27 — la phrase EN MOTS de la candidate (`enMots`) : facultative, rendue telle quelle, HORS de l’empreinte (comme variantes, vues et témoins) ; vide ou sur plusieurs lignes, refusée ; la candidate du code garde son empreinte f01dd8496f56a415', async () => {
  const { CANDIDATE_EN_ESSAI } = await import('../src/core/engine/engineVersions.js');
  const base = { id: 'buts-unique-essai', etape: '27', quoi: 'Modèle de buts unique (Poisson et Dixon-Coles, rho −0,05)', modifications: { football: { modeleDeButs: reglagesDuModele() } }, marches: ['totalGoals'] };
  const avec = { ...base, enMots: 'Les pourcentages de buts partent des cotes.' };
  assert.equal(validerCandidate(avec).enMots, 'Les pourcentages de buts partent des cotes.');
  assert.equal('enMots' in validerCandidate(base), false, 'absente, elle ne s’ajoute pas');
  assert.equal(empreinteDeLaCandidate(avec), empreinteDeLaCandidate(base), 'la phrase en mots ne change pas l’empreinte');
  assert.equal(empreinteDeLaCandidate({ ...avec, enMots: 'Une autre phrase.' }), empreinteDeLaCandidate(base));
  for (const mauvaise of ['', '   ', 'deux\nlignes', 42]) assert.throws(() => validerCandidate({ ...base, enMots: mauvaise }), /la phrase « enMots » est vide ou sur plusieurs lignes/, JSON.stringify(mauvaise));
  // La candidate du code : sa phrase, sans jargon ; son empreinte d'avant la phrase.
  assert.match(CANDIDATE_EN_ESSAI.enMots, /^Un seul modèle pour tous les marchés de buts et le score : les pourcentages partent des cotes/);
  assert.doesNotMatch(CANDIDATE_EN_ESSAI.enMots, /Poisson|Dixon|rho|demi-vie|m7|ancr/i);
  assert.equal(validerCandidate(CANDIDATE_EN_ESSAI).enMots, CANDIDATE_EN_ESSAI.enMots);
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  const { enMots, ...sansLaPhrase } = CANDIDATE_EN_ESSAI;
  assert.ok(enMots);
  assert.equal(empreinteDeLaCandidate(sansLaPhrase), 'f01dd8496f56a415');
});

/** Un essai réglé fabriqué : 300 matchs, deux familles, la perte log de chaque version et le pronostic retenu de la candidate. */
function reglementFabrique({ butsB, bttsB, pTotal, realiseTotal }) {
  const lignes = [];
  for (let i = 0; i < 300; i++) {
    const bloc = `m${i}`;
    const provenance = i % 3 ? 'cotes-plusmoins-xg' : 'cotes-1n2-xg';
    lignes.push({ marketId: 'totalGoals', ligne: 2.5, bloc, match: bloc, cle: `${bloc}|totalGoals|2.5`, a: 0.68, b: butsB + (i % 7) / 1000, calibB: { p: pTotal, realise: i < realiseTotal * 300 }, provenance });
    // Les deux marquent : des pertes bruitées (±0,05), la candidate décalée de bttsB − 0,69 en moyenne.
    lignes.push({ marketId: 'bothTeamsScore', ligne: null, bloc, match: bloc, cle: `${bloc}|bothTeamsScore`, a: 0.69 + 0.05 * Math.sin(i), b: bttsB + 0.05 * Math.cos(1.7 * i), calibB: { p: 0.5, realise: i % 2 === 0 }, provenance });
  }
  return { lignes };
}

test('étape 27 — la PORTE DE L’ESSAI, un seul modèle : une famille « moins bon » (même K) refuse toute l’adoption, nommée ; un plus/moins 2,5 qui annonce « trop haut » à K = 1 (porte de sûreté) aussi ; « pas prouvé » par famille est toléré ; les régimes comptés par match', () => {
  const brut = { enService: 3 };
  const notee = (complements) => ({ empreinte: 'e', horizon: { matchs: 600, jours: 14 }, jugement: { verdict: 'retenu', versionEnService: 3, matchs: 900, variantes: 320, ...complements } });
  const d = (n) => V.etatDeLAdoption(brut, n, { enCours: false, enSynchro: true, empreinte: 'e' });
  // Une famille clairement moins bonne (les deux marquent) : refusée, nommée.
  const moinsBon = complementsDeLEssai(reglementFabrique({ butsB: 0.66, bttsB: 0.75, pTotal: 0.55, realiseTotal: 0.55 }), { variantes: 320 });
  assert.equal(moinsBon.parFamille.bothTeamsScore.verdict, 'moins-bon');
  assert.equal(moinsBon.parFamille.totalGoals.verdict, 'retenu');
  const r1 = d(notee({ parFamille: moinsBon.parFamille, surete: moinsBon.surete }));
  assert.deepEqual([r1.possible, r1.raison, r1.famille], [false, 'famille-moins-bonne', 'bothTeamsScore']);
  assert.match(r1.texte, /^Refusée : la famille « .+ » fait moins bien que la version en service, au-delà du hasard \(900 matchs joués, 320 variantes essayées\)\. Un seul modèle de buts/);
  // Le plus/moins 2,5 annoncé à 80 % pour 50 % réalisés : « trop haut » à K = 1 → refusée par la porte de sûreté.
  const tropHaut = complementsDeLEssai(reglementFabrique({ butsB: 0.66, bttsB: 0.69, pTotal: 0.8, realiseTotal: 0.5 }), { variantes: 320 });
  assert.equal(tropHaut.surete['totalGoals|2.5'].verdict, 'trop-haut');
  assert.equal(tropHaut.surete['totalGoals|2.5'].variantes, 1, 'la porte de sûreté juge à K = 1');
  assert.notEqual(tropHaut.parFamille.bothTeamsScore.verdict, 'moins-bon');
  const r2 = d(notee({ parFamille: tropHaut.parFamille, surete: tropHaut.surete }));
  assert.deepEqual([r2.possible, r2.raison, r2.famille], [false, 'calibration', 'totalGoals|2.5']);
  assert.match(r2.texte, /annonce trop haut au-delà d’une borne large/);
  // Tout dans le hasard ou meilleur, une famille « pas prouvé » : l'adoption est possible.
  const bon = complementsDeLEssai(reglementFabrique({ butsB: 0.66, bttsB: 0.69, pTotal: 0.55, realiseTotal: 0.55 }), { variantes: 320 });
  assert.equal(bon.surete['totalGoals|2.5'].verdict, 'dans-le-hasard');
  assert.equal(bon.parFamille.bothTeamsScore.verdict, 'pas-prouve');
  assert.deepEqual(d(notee({ parFamille: bon.parFamille, surete: bon.surete })), { possible: true, raison: null, verdict: 'retenu', texte: null });
  assert.deepEqual(bon.regimes, { 'cotes-1n2-xg': 100, 'cotes-plusmoins-xg': 200 });
  assert.equal(bon.matchsAvecRegime, 300);
});

test('étape 27 — le K du banc de la candidate : AU MOINS la candidate et ses variantes déclarées (320), même avant sa mise en essai (au redémarrage de l’appli) quand le registre de la mesure n’en compte aucune ; plus si le registre en compte plus', async () => {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-k-etape-27-'));
  try {
    const vide = path.join(dossier, 'registre-vide.json');
    fs.writeFileSync(vide, JSON.stringify({ version: 1, etapes: {} }));
    const plein = path.join(dossier, 'registre-plein.json');
    fs.writeFileSync(plein, JSON.stringify({ version: 1, etapes: { 27: { variantes: Array.from({ length: 400 }, (_, i) => ({ id: `r${i}`, ou: 'banc', le: '2026-10-01T00:00:00.000Z' })) } } }));
    const variantes = Array.from({ length: 319 }, (_, i) => ({ id: `m-${i}`, quoi: 'mesurée' }));
    const candidate = { id: 'buts-unique-essai', etape: '27', marches: ['bothTeamsScore'], empreinte: 'abc', variantes };
    assert.equal(variantesDuBanc(candidate, { fichier: vide }), 320);
    assert.equal(variantesDuBanc(candidate, { fichier: plein }), 400);
    assert.equal(variantesDuBanc({ ...candidate, variantes: undefined }, { fichier: vide }), 1);
    const ligne = (i, v) => ({ type: 'ligne', cle: `f${i}|bothTeamsScore|-|fd-avant-match`, fixtureKey: `f${i}`, date: '2020-03-01', marketKey: 'bothTeamsScore', prix: 'fd-avant-match', mesures: { moteur: { perteLog: v } } });
    const faux = async (o) => {
      const b = o.config.marque === 'b';
      for (let i = 0; i < 260; i++) o.surLigne(ligne(i, b ? 0.6 + (i % 5) / 100 : 0.7 + (i % 5) / 100));
      return { bilan: { erreur: null }, resume: {}, moteur: { empreinte: b ? 'eB' : 'eA' } };
    };
    const r = await jugerLaCandidateAuBanc({ candidate, reglagesEnService: { marque: 'a' }, reglagesCandidate: { marque: 'b' }, database: null, rejouer: faux, registre: { fichier: vide } });
    assert.equal(r.variantes, 320, 'avant la mise en essai : K = 1 + 319 variantes déclarées');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// ================================================================ 10. étape 27 : la porte 1 au banc (porteDuBanc)

/** Un jugement du banc de la candidate fabriqué (forme de jugerLaCandidateAuBanc) : tout « retenu », deux lignes de calibration. */
function jugementDuBanc({ verdict = 'retenu', famille = 'retenu', deuxCinq = 'dans-le-hasard', rt25 = { a: [90, 0.0193], b: [164, 0.0407] }, autre = { a: [3000, -0.12], b: [3100, -0.01] } } = {}) {
  const cal = (n, biais, v = 'dans-le-hasard') => ({ pronostics: n, matchs: n, biais, ece: Math.abs(biais), verdict: n < 200 ? 'trop-peu' : v });
  return {
    verdict,
    parFamille: { totalGoals: { verdict: famille }, bothTeamsScore: { verdict: 'retenu' }, teamGoals: { verdict: 'retenu' }, resultAndTotal: { verdict: 'retenu' } },
    parCase: { 'totalGoals|2.5': { verdict: 'retenu' }, 'resultAndTotal|2.5': { verdict: 'retenu' } },
    faceAuRepere: { 'totalGoals|2.5': { verdict: 'retenu' } },
    calibration: {
      a: { parCase: { 'totalGoals|2.5': cal(10323, -0.144, 'trop-haut'), 'resultAndTotal|2.5': cal(...rt25.a), 'teamGoals:home|1.5': cal(...autre.a, 'trop-haut') } },
      b: { parCase: { 'totalGoals|2.5': cal(3218, -0.0047, deuxCinq), 'resultAndTotal|2.5': cal(...rt25.b), 'teamGoals:home|1.5': cal(...autre.b) } }
    }
  };
}

test('étape 27 — la PORTE 1 au banc (porteDuBanc) : le critère « |biais| de la candidate ≤ celui de la version en service » ne vaut que sur les lignes que le juge peut trancher (200 pronostics retenus ou plus, des DEUX côtés) ; ailleurs la ligne est « non jugée » et, si l’écart est plus grand, une réserve dit son sens ; tout le reste de la porte compte', () => {
  // Le cas mesuré au banc P2 : résultat + total 2,5 à 164 contre 90 pronostics, +4,07 contre +1,93 pt → non jugée, réserve « prudent ».
  const p = porteDuBanc(jugementDuBanc());
  assert.equal(p.franchie, true, JSON.stringify(p.criteres.filter((c) => !c.ok)));
  assert.deepEqual(p.nonJugees.map((x) => x.cle), ['resultAndTotal|2.5']);
  assert.deepEqual(p.reserves, [{ cle: 'resultAndTotal|2.5', sens: 'prudent', texte: 'trop peu de pronostics pour juger la calibration de résultat + total 2,5 ; l’écart va du côté prudent' }]);
  assert.equal(JUGE.minBlocs, 200, 'le seuil est celui du juge de la calibration');
  // La même ligne avec assez de pronostics : le critère s'applique, et la porte se ferme en nommant la ligne.
  const fermee = porteDuBanc(jugementDuBanc({ rt25: { a: [250, 0.0193], b: [300, 0.0407] } }));
  assert.equal(fermee.franchie, false);
  const c = fermee.criteres.find((x) => x.cle === 'calibration-lignes');
  assert.equal(c.ok, false);
  assert.match(c.texte, /Résultat \+ total 2,5/);
  assert.deepEqual(fermee.reserves, []);
  // Juste au seuil (200 et 200) : jugée.
  assert.equal(porteDuBanc(jugementDuBanc({ rt25: { a: [200, 0.0193], b: [200, 0.0407] } })).franchie, false);
  // Un écart plus grand du côté optimiste (la candidate annonce plus que ce qui arrive) : réserve « optimiste ».
  assert.equal(porteDuBanc(jugementDuBanc({ rt25: { a: [90, -0.01], b: [164, -0.03] } })).reserves[0].sens, 'optimiste');
  // Un écart plus petit sur une ligne non jugée : ni critère, ni réserve.
  assert.deepEqual(porteDuBanc(jugementDuBanc({ rt25: { a: [90, 0.05], b: [164, 0.01] } })).reserves, []);
  // Le reste de la porte : en bloc, une famille, le +/−2,5 de la candidate.
  assert.equal(porteDuBanc(jugementDuBanc({ verdict: 'pas-prouve' })).franchie, false);
  assert.equal(porteDuBanc(jugementDuBanc({ famille: 'moins-bon' })).criteres.find((x) => x.cle === 'famille:totalGoals').ok, false);
  assert.equal(porteDuBanc(jugementDuBanc({ deuxCinq: 'trop-haut' })).criteres.find((x) => x.cle === 'calibration-2,5').ok, false);
  assert.equal(libelleDeLaCase('teamGoals:away|1.5'), 'Buts de l’équipe qui se déplace 1,5');
});

test('étape 27 — la porte 1 MESURÉE (noteDuModeleDeButs.js, banc P2 n° 9, K = 320) : franchie ; la réserve ACCEPTÉE est écrite telle quelle ; recalculée sur les chiffres de la note, la règle des 200 pronostics redonne la même réserve et aucune ligne jugée où la candidate se trompe davantage', () => {
  const p1 = NOTE_DU_MODELE_DE_BUTS.porte1;
  assert.equal(p1.K, 320);
  assert.equal(p1.candidate.id, 'modele-buts-v1');
  assert.equal(p1.verdict.franchie, true);
  assert.deepEqual(p1.reservesAcceptees.map((r) => [r.cle, r.sens, r.texte]), [['resultAndTotal|2.5', 'prudent', 'Réserve acceptée : trop peu de pronostics pour juger la calibration de résultat + total 2,5 ; l’écart va du côté prudent']]);
  // La règle refaite sur les chiffres recopiés de la note (calibration du pronostic retenu, lecture « avec cotes »).
  const A = p1.avecCotes.calibration.enService.parLigne;
  const B = p1.avecCotes.calibration.candidate.parLigne;
  const jugees = Object.keys(B).filter((k) => A[k] && A[k].matchs >= 200 && B[k].matchs >= 200);
  assert.ok(jugees.length >= 13, `${jugees.length} lignes jugées`);
  for (const k of jugees) assert.ok(Math.abs(B[k].biais) <= Math.abs(A[k].biais), `${k} : ${B[k].biais} contre ${A[k].biais}`);
  const rt = ['resultAndTotal|2.5'].map((k) => [A[k].matchs, B[k].matchs, Math.abs(B[k].biais) > Math.abs(A[k].biais), B[k].biais > 0]);
  assert.deepEqual(rt, [[90, 164, true, true]], '164 contre 90 pronostics, écart plus grand, du côté prudent');
  assert.equal(B['totalGoals|2.5'].verdict, 'dans-le-hasard');
});
