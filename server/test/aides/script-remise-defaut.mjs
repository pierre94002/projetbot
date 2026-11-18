/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-remise-defaut.mjs <serveur de la copie> <bookmakers en JSON>
 *
 * Lots d'argent, correction 1.1 (17/11/2026) — le bouton « valeurs par défaut » de Réglages (resetEngineConfig) garde
 * les bookmakers retenus (D3 : les 4 français) et ne change pas l'état du moteur. Écrit engine-config.json DE LA COPIE
 * (« défaut + bookmakers »), remet aux valeurs par défaut, puis change un seuil et remet encore. Appelé par
 * miseLot2.test.mjs (T-L2-5). Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, livres] = process.argv.slice(2);
// Jamais le serveur où vit ce script (celui du dépôt ou de la piste) : seulement une copie.
if (path.resolve(serveur).toLowerCase() === path.resolve(import.meta.dirname, '..', '..').toLowerCase()) throw new Error('script-remise-defaut : seulement dans une copie');
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const { DEFAULT_ENGINE_CONFIG_BY_SPORT, getEngineConfig, resetEngineConfig, updateEngineConfig } = await imp('core/engine/engineConfig.js');
const { etatDuMoteur } = await imp('core/engine/engineVersions.js');
const fichier = path.join(serveur, 'data', 'runtime', 'engine-config.json');
const FR = JSON.parse(livres);
fs.writeFileSync(fichier, JSON.stringify({ football: { ...DEFAULT_ENGINE_CONFIG_BY_SPORT.football, valueBookmakers: FR } }, null, 2));
const avant = etatDuMoteur().empreinte;
const rendu = resetEngineConfig('football');
const apres = etatDuMoteur().empreinte;
const relu = JSON.parse(fs.readFileSync(fichier, 'utf8')).football.valueBookmakers;
updateEngineConfig('football', { edgeThresholdMin: 0.03 });
const rendu2 = resetEngineConfig('football');
console.log(JSON.stringify({ rendus: rendu.valueBookmakers, lus: getEngineConfig('football').valueBookmakers, relu, memeEtat: avant === apres, seuil2: rendu2.edgeThresholdMin, livres2: rendu2.valueBookmakers, memeEtat2: etatDuMoteur().empreinte === avant, defaut: rendu.edgeThresholdMin === DEFAULT_ENGINE_CONFIG_BY_SPORT.football.edgeThresholdMin }));
