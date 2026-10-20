/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs, bacSimule.mjs), jamais
 * directement :
 *   node --import garde.mjs script-bac-simule.mjs <serveur de la copie>
 *
 * Dit ce que le code de la copie voit de lui-même : où est son « dossier
 * personnel », s'il se reconnaît dans le bac à sable, où sont la vraie base et
 * son bac, et ce que le garde-fou a fait de l'environnement (clés vidées,
 * actualisation et cotes gratuites coupées). Sortie : une ligne JSON.
 */

import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
// L'environnement (config/env.js) applique le garde-fou du bac au chargement : on le charge pour voir ce qu'il en fait.
await imp('config/env.js');
const bac = await imp('config/bacASable.js');

console.log(
  JSON.stringify({
    maison: os.homedir(),
    mode: bac.modeBacASable(),
    racineBac: bac.RACINE_BAC,
    dossierDuBac: bac.dossierDuBac(),
    vraieBase: bac.VRAIE_BASE,
    baseParDefaut: bac.baseParDefautDuBac(),
    env: {
      CM_BAC_A_SABLE: process.env.CM_BAC_A_SABLE ?? null,
      MATCH_STATS_AUTO_REFRESH: process.env.MATCH_STATS_AUTO_REFRESH ?? null,
      FREE_ODDS: process.env.FREE_ODDS ?? null,
      AUTO_AI_ANALYSIS: process.env.AUTO_AI_ANALYSIS ?? null,
      ODDS_API_KEY: process.env.ODDS_API_KEY ?? null
    }
  })
);
