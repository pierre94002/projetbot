/**
 * Exécuté DANS une copie de travail rangée dans un BAC SIMULÉ (bacSimule.mjs), jamais directement :
 *   node --import garde.mjs script-simulation-bac.mjs <serveur de la copie>
 *
 * Étape 28 — LE PREMIER DÉMARRAGE AVEC CE CODE puis LA PREMIÈRE NUIT SIMULÉE, comme chez Pierre après la recopie :
 * ce que le registre de la mesure de la copie dit AVANT (rien de l'étape 28 n'est lancé), puis le démarrage
 * (enregistrerLancements, ce que fait le serveur), puis les deux étapes de nuit de la simulation, telles que la passe
 * les lance (__testing) ; et ce que le registre dit APRÈS : le lancement de 28 daté du jour, K = 27, et rien de changé
 * pour l'étape 27 (ses fenêtres vues, son nombre de variantes). Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
// L'actualisation charge scripts/merge-match-stats.mjs (fotMobRefresh.js) : recopié dans la copie, comme script-premiere-nuit.mjs.
recopierScripts(serveur);
const { resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('bench/trialsRegistry.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { modeBacASable } = await imp('config/bacASable.js');

const lire = () => ({
  fenetres27: T.fenetresVues('27').map((f) => [f.de, f.a, [...f.pour].sort().join(',')]),
  variantes27: T.compterVariantes('27'),
  variantes28: T.compterVariantes('28'),
  fenetres28: T.fenetresVues('28').map((f) => [f.de, f.a]),
  lancement28: T.lancementDe('28')
});
const avant = lire();
const demarrage = T.enregistrerLancements();
const saisons = await job.__testing.passeSimulationSaisons({}, { aPart: true, n: 500 });
const matchs = await job.__testing.passeSimulationMatchs({}, { matchs: [], aPart: true });
const apres = lire();
console.log(
  JSON.stringify({
    ok: true,
    bac: modeBacASable(),
    avant,
    demarrage: demarrage.nouveaux,
    saisons: { status: saisons.status, summary: saisons.summary },
    matchs: { status: matchs.status, summary: matchs.summary },
    apres,
    registre: fs.existsSync(T.FICHIER_REGISTRE) ? JSON.parse(fs.readFileSync(T.FICHIER_REGISTRE, 'utf8')).etapes?.['28'] ?? null : null
  })
);
