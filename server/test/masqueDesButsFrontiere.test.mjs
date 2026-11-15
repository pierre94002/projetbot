/**
 * LOT 0 — l'essai de FRONTIÈRE du masque des buts (13/11/2026) : le masque vit à la SORTIE du serveur, jamais dans le
 * moteur, le gel, le dépôt des pronostics, le règlement, l'essai de la candidate ni le code scellé de l'étape 46.
 *   node --test test/masqueDesButsFrontiere.test.mjs        (depuis server/)
 *   F1 l'empreinte du code du moteur n'a pas bougé (valeur écrite en dur, avec sa date) : aucune version ;
 *   F2 les 13 fichiers du lot ne croisent ni les 7 dossiers ni les 6 fichiers du moteur (liste IMPORTÉE) ;
 *   F3 aucun des 13 n'est parmi les 28 modules scellés de l'étape 46 ;
 *   F4 aucun fichier du moteur, du gel, du dépôt, du moteur à blanc, de l'essai, du règlement, de l'IA automatique
 *      ni des 28 scellés ne nomme le masque ;
 *   F5 le gel garde les buts : elementDuGel sur une analyse NON filtrée garde ses pronostics de buts ;
 *   F6 rien du serveur ne nomme la fiche de l'écran (ficheDuPronostic, PercentageWhyCard), commentaires compris.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { empreinteDuCode, fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import { elementDuGel } from '../src/data/enregistreurs/gelPronostics.js';
import { FAMILLES_DE_BUTS } from '../src/data/masqueDesButs.js';

const CODE = path.resolve(SERVEUR, '..');
const SRC = path.join(SERVEUR, 'src');
const sansFins = (p) => p.split(path.sep).join('/');

/** Mesurée dans la piste du lot 0 le 13/11/2026 à 12 h 44 (bac = piste = dépôt). */
const EMPREINTE_DE_DEPART = '16f2459db183a99576365047da98b7777687ef05';

/** Les 13 fichiers du lot 0 (chemins depuis le dossier du code). */
export const FICHIERS_DU_LOT = Object.freeze([
  'server/src/data/masqueDesButs.js',
  'server/src/api/routes/analysis.routes.js',
  'server/src/api/controllers/cotesVosBookmakers.controller.js',
  'server/src/api/controllers/screener.controller.js',
  'server/src/api/controllers/opportunities.controller.js',
  'server/src/api/controllers/simulation.controller.js',
  'server/src/api/controllers/matchAiAnalysis.controller.js',
  'server/src/core/ai/matchAiAnalysisPrompt.js',
  'server/src/core/ai/bulletinPrompt.js',
  'ui/src/components/analysis/MarketVerdictBoard.vue',
  'ui/src/utils/ficheDuPronostic.js',
  'ui/src/components/analysis/PercentageWhyCard.vue',
  'ui/src/views/ScreenerView.vue',
  'server/src/api/routes/predictions.routes.js',
  'ui/src/components/analysis/ManualOddsEntry.vue'
]);

/** Les 28 modules scellés de l'étape 46 (§ 13 du projet), chemins depuis server/. */
const SCELLES_46 = Object.freeze([
  ...['reglagesDirect', 'libelleDuDirect', 'etatDuDirect', 'memoireDuDirect', 'calculDuDirect', 'entreesDuDirect', 'rejeuDuDirect', 'bancDuDirect', 'declarationDuDirect'].map((n) => `src/data/direct/${n}.js`),
  'scripts/etape46.mjs',
  ...['reglages', 'simulationMatch', 'entreesSimulation', 'simulationNuit', 'simulationMatchsEnfant', 'simulationRead', 'etatSimulation'].map((n) => `src/data/simulation/${n}.js`),
  'src/data/calibration.js',
  'src/data/db/dayTable.js',
  'src/bench/guard.js',
  'src/bench/metrics.js',
  'src/core/model/poisson.js',
  'src/core/model/dixonColes.js',
  'src/core/engine/goalModel.js',
  'src/core/engine/scorePrediction.js',
  'src/core/engine/noteDuModeleDeButs.js',
  'src/core/engine/motsDuModeleDeButs.js',
  'src/core/market/marginRemoval.js'
]);

/** Ce qui gèle, dépose, joue à blanc, juge, règle ou lance l'IA : chemins depuis server/src. */
const GARDES = Object.freeze([
  'data/enregistreurs/gelPronostics.js',
  'data/enregistreurs/depot.js',
  'data/enregistreurs/moteurABlanc.js',
  'bench/essaiCandidate.js',
  'data/providers/settlementService.js',
  'core/settlement/settlementRules.js',
  'core/ai/autoMatchAiTrigger.js',
  'core/ai/matchAiAnalysisService.js'
]);

test('F1 — l’empreinte du code du moteur est celle du départ (13/11/2026 12 h 44) : aucune ligne du moteur n’a bougé, aucune version', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, EMPREINTE_DE_DEPART);
});

test('F2 — les 13 fichiers du lot ne croisent ni les dossiers ni les fichiers du moteur (liste importée)', () => {
  assert.equal(FICHIERS_DU_LOT.length, 15);
  assert.equal(new Set(FICHIERS_DU_LOT).size, 15);
  for (const f of FICHIERS_DU_LOT) assert.ok(fs.existsSync(path.join(CODE, f)), `${f} existe`);
  assert.equal(MODULES_DU_MOTEUR.dossiers.length, 7);
  assert.equal(MODULES_DU_MOTEUR.fichiers.length, 6);
  const duMoteur = new Set(fichiersDuMoteur());
  for (const f of FICHIERS_DU_LOT.filter((x) => x.startsWith('server/src/'))) {
    const rel = f.slice('server/src/'.length);
    for (const d of MODULES_DU_MOTEUR.dossiers) assert.ok(!rel.startsWith(`${d}/`), `${rel} est hors de ${d}`);
    assert.ok(!MODULES_DU_MOTEUR.fichiers.includes(rel), `${rel} n’est pas un fichier du moteur`);
    assert.ok(!duMoteur.has(rel), `${rel} n’entre pas dans l’empreinte`);
  }
  // 13/11/2026 (orchestrateur) : comparaison au sha1 de data/runtime/engine-config.json retirée, il change à chaque réglage de Pierre (bookmakers compris).
});

test('F3 — aucun des 13 fichiers du lot n’est parmi les 28 modules scellés de l’étape 46', () => {
  assert.equal(SCELLES_46.length, 28);
  assert.equal(new Set(SCELLES_46).size, 28);
  const scelles = new Set(SCELLES_46.map((f) => `server/${f}`));
  for (const f of FICHIERS_DU_LOT) assert.ok(!scelles.has(f), f);
});

test('F4 — ni le moteur, ni le gel, ni le dépôt, ni le moteur à blanc, ni l’essai, ni le règlement, ni l’IA automatique, ni les 28 scellés ne nomment le masque', () => {
  const fichiers = [
    ...fichiersDuMoteur().map((f) => path.join(SRC, f)),
    ...GARDES.map((f) => path.join(SRC, f)),
    ...SCELLES_46.map((f) => path.join(SERVEUR, f))
  ];
  let lus = 0;
  for (const f of fichiers) {
    if (!fs.existsSync(f)) continue; // un scellé de la 46 absent (dépôt sans l'étape 46) : rien à lire
    lus += 1;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /masqueDesButs|MASQUE_DES_BUTS/, sansFins(path.relative(SERVEUR, f)));
  }
  for (const f of GARDES) assert.ok(fs.existsSync(path.join(SRC, f)), f);
  assert.ok(lus > 60, `${lus} fichiers lus`);
});

test('F5 — le gel garde les buts : elementDuGel sur une analyse NON filtrée garde ses pronostics totalGoals et bothTeamsScore', () => {
  const complete = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'analyses-etape-45.json'), 'utf8')).complete;
  const analyse = { engineVersion: 5, marketPredictions: complete.engineSnapshot.marketPredictions, distributions: null };
  const match = { matchId: 'fab-girona-mallorca', league: 'La Liga 2 - Spain', home: 'Girona', away: 'Mallorca', commenceTime: '2026-11-16T19:00:00.000Z', hasOdds: true };
  const element = elementDuGel({ match, engineResult: analyse, origine: 'essai', maintenant: Date.parse('2026-11-16T10:00:00.000Z'), cotes: {}, compo: {}, engineHash: EMPREINTE_DE_DEPART });
  const ids = element.pronostics.map((p) => p.marketId);
  assert.ok(ids.includes('totalGoals') && ids.includes('bothTeamsScore'), ids.join(','));
  assert.equal(element.pronostics.filter((p) => FAMILLES_DE_BUTS.includes(p.marketId)).length, complete.engineSnapshot.marketPredictions.filter((p) => FAMILLES_DE_BUTS.includes(p.marketId)).length);
  assert.equal(element.pronostics.length, complete.engineSnapshot.marketPredictions.length);
});

/** Tous les fichiers .js / .mjs / .cjs sous un dossier. */
function tousLesFichiers(dossier) {
  return fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => /\.(m?js|cjs)$/.test(f));
}

test('F6 — rien du serveur (src, scripts) ne nomme ficheDuPronostic ni PercentageWhyCard, commentaires compris', () => {
  let vus = 0;
  for (const dossier of ['src', 'scripts']) {
    const racine = path.join(SERVEUR, dossier);
    if (!fs.existsSync(racine)) continue;
    for (const f of tousLesFichiers(racine)) {
      vus += 1;
      assert.doesNotMatch(fs.readFileSync(path.join(racine, f), 'utf8'), /ficheDuPronostic|PercentageWhyCard/, `server/${dossier}/${sansFins(f)}`);
    }
  }
  assert.ok(vus > 200, `${vus} fichiers lus`);
});
